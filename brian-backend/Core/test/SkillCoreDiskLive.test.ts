import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  RelationDBAccess,
  SkillAccess,
  PromptsAccess,
  PromptCatalogAccess,
  LLMAccess,
  ExecSkillInput,
  ExecSkillOutput,
  SkillContext,
  SoSkillInput,
  SoSkillOutput,
} from '@brian-agent/base';
import {
  SkillCoreAccess,
  SkillCoreContext,
  MatchSkillInput,
  MatchSkillOutput,
} from '../SkillCoreProvider';

/**
 * SkillCore 全真链路联测（opt-in：BRIAN_LIVE_SKILLCORE=1）：
 * 拷贝真实业务库（不动用户数据）→ 真实 SkillCoreAccess + 真实 LLM（Volcano Ark / deepseek-v4-pro）→
 * matchSkill("分析本机的磁盘使用情况") 四层瀑布（本地 → GitHub → 完整自建）→
 * execSkill 真机执行自建脚本 → 本机磁盘使用分析 JSON。
 *
 * 前置事实：真实库 9 个 Skill 均与磁盘无关（本地层不命中）；匿名 GitHub Repository Search
 * 对磁盘类关键词大概率 0 命中（只探测根目录 SKILL.md）→ 预期由第 4 层自建产出 main.py。
 */

const LIVE = process.env.BRIAN_LIVE_SKILLCORE === '1';
const REAL_DB = path.resolve(__dirname, '../../data/brian.db');

describe.skipIf(!LIVE)('SkillCore 全真瀑布：磁盘使用分析（BRIAN_LIVE_SKILLCORE=1）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let skillAccess: SkillAccess;
  let promptsAccess: PromptsAccess;
  let skillCore: SkillCoreAccess;
  const taskId = `demo-${Date.now()}`;

  beforeAll(async () => {
    if (!fs.existsSync(REAL_DB)) throw new Error(`真实库不存在: ${REAL_DB}`);
    tempDir = fs.mkdtempSync('/tmp/opencode/skillcore-disk-');
    for (const suffix of ['', '-wal', '-shm']) {
      const src = REAL_DB + suffix;
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tempDir, 'brian.db') + suffix);
    }
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'brian.db') });
    await relationDb.initialize();
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    await new PromptCatalogAccess(relationDb).seed();
    skillAccess = new SkillAccess(relationDb);
    await skillAccess.initialize();
    const llmAccess = new LLMAccess(relationDb, undefined, promptsAccess);
    await llmAccess.initialize();
    // LLM 调用追踪代理（联测诊断：打印每次 execLLM 的 caller 与原始输出）
    let llmSeq = 0;
    const tracedLlm = new Proxy(llmAccess, {
      get(target, prop, receiver) {
        if (prop !== 'execLLM' && prop !== 'embedLLM') return Reflect.get(target, prop, receiver);
        const method = prop as string;
        return async (input: unknown, output: { result?: string; embedding?: number[] }, ctx?: unknown) => {
          const fn = target as unknown as Record<string, (i: unknown, o: unknown, c: unknown) => Promise<boolean>>;
          const ok = await fn[method](input, output, ctx);
          if (method === 'execLLM') {
            const seq = ++llmSeq;
            console.log(`[LLM#${seq}] caller=${(input as { caller?: string }).caller ?? '?'} max_tokens=${(input as { max_tokens?: number }).max_tokens ?? '?'} ok=${ok}`);
            console.log(`[LLM#${seq} result]`, String(output.result ?? '').slice(0, 800));
          } else {
            console.log(`[LLM embed] 向量维度=${output.embedding?.length ?? 0}`);
          }
          return ok;
        };
      },
    });
    skillCore = new SkillCoreAccess(relationDb, skillAccess, tracedLlm as unknown as LLMAccess, promptsAccess);
    // 诊断：副本库中标题含"Skill 匹配"的模板行（确认 seed 刷新与 is_system 值）
    const tplRows = await relationDb.select('prompt_template', [
      { field: 'prompt_template_title', operator: 'LIKE', value: '%Skill 匹配%' },
    ]);
    console.log('[模板诊断]', JSON.stringify(tplRows.map((r) => ({
      id: String(r['id']).slice(0, 8),
      title: r['prompt_template_title'],
      sys: r['is_system'],
      len: String(r['prompt_template'] ?? '').length,
      seed: String(r['seed_hash'] ?? '').slice(0, 8),
    }))));
    // 副本内清空显式模板配置：真实库 config.prompt_template_id 指向用户自建旧契约模板
    // （<skill_selection_protocol>，relevance 格式，与 2026-09-22 need/keywords 契约不兼容，
  // 真机取证 [2026-09-22r]）；副本清空后走 builtin 回退验证瀑布全链路。真实库不改动。
    await relationDb.update('skill_core_config', [
      { field: 'prompt_template_id', value: '' },
      { field: 'updated', value: Date.now() },
    ], []);
  }, 60000);

  afterAll(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('matchSkill 四层瀑布（真实 LLM）→ execSkill 真机执行 → 磁盘分析 JSON', async () => {
    const localOut = new SoSkillOutput();
    await skillAccess.soSkill({ conditions: [] } as never, localOut, new SkillContext());
    console.log(`[本地库] 现有 Skill ${localOut.list.length} 个:`, localOut.list.map((s) => s.name).join(', '));

    // ===== 调用 SkillCore：四层瀑布匹配 =====
    const input = new MatchSkillInput();
    input.agent_id = 'demo-agent';
    input.context_id = taskId;
    input.run_id = taskId;
    input.task_content = '分析本机的磁盘使用情况，输出磁盘总量、已用、剩余与使用率';
    const output = new MatchSkillOutput();
    const t0 = Date.now();
    const ok = await skillCore.matchSkill(input, output, new SkillCoreContext());
    console.log(`[matchSkill] ok=${ok} 耗时 ${Date.now() - t0}ms, 返回 ${output.skills.length} 个 Skill`);
    expect(ok).toBe(true);
    expect(output.skills.length).toBeGreaterThanOrEqual(1);

    const matched = output.skills[0];
    console.log(`[匹配结果] skill_id=${matched.skill_id} relevance=${matched.relevance} brief=${matched.skill_brief.slice(0, 100)}`);

    // 落库行检查：scripts 文件名揭示产出层（main.py/main.sh=自建系统路径；main.js=纯计算）
    const soInput = new SoSkillInput();
    soInput.conditions = [{ field: 'id', operator: '=', value: matched.skill_id }];
    const soOut = new SoSkillOutput();
    await skillAccess.soSkill(soInput as never, soOut, new SkillContext());
    const row = soOut.list[0];
    expect(row).toBeDefined();
    console.log(`[自建产物] name=${row.name} enable=${row.enable} scripts=(${(row.scripts ?? []).map((f) => f.name).join(', ') || '无'}) skill_md ${String(row.skill_md).length} 字`);
    for (const f of row.scripts ?? []) {
      console.log(`[脚本 ${f.name}] 前 5 行:\n${f.content.split('\n').slice(0, 5).join('\n')}`);
    }

    // ===== execSkill：真机执行（main.py → LocalSandbox python3） =====
    const execInput = new ExecSkillInput();
    execInput.id = matched.skill_id;
    execInput.params = {};
    const execOutput = new ExecSkillOutput();
    const t1 = Date.now();
    const execOk = await skillAccess.execSkill(execInput, execOutput, new SkillContext());
    console.log(`[execSkill] ok=${execOk} 耗时 ${Date.now() - t1}ms`);
    expect(execOk).toBe(true);

    console.log('[本机磁盘使用分析]', String(execOutput.result));
    const analysis = JSON.parse(String(execOutput.result)) as unknown;
    // 自建脚本输出结构由 LLM 决定（实测出现扁平/嵌套/filesystems+summary 等形态），
    // 递归查找任意层级的目标数值字段，只断言形态与量纲
    const findNumber = (node: unknown, keys: string[]): number | null => {
      if (Array.isArray(node)) {
        for (const v of node) { const r = findNumber(v, keys); if (r !== null) return r; }
        return null;
      }
      if (node && typeof node === 'object') {
        const rec = node as Record<string, unknown>;
        for (const k of keys) {
          const v = Number(rec[k]);
          if (Number.isFinite(v)) return v;
        }
        for (const v of Object.values(rec)) { const r = findNumber(v, keys); if (r !== null) return r; }
      }
      return null;
    };
    const total = findNumber(analysis, ['total', 'total_gb', 'disk_total_gb']);
    const usedPct = findNumber(analysis, ['usage_percent', 'percent', 'used_percent', 'disk_used_percent']);
    expect(total).not.toBeNull();
    expect(total as number).toBeGreaterThan(0);
    expect(usedPct).not.toBeNull();
    expect(usedPct as number).toBeGreaterThan(0);
    expect(usedPct as number).toBeLessThanOrEqual(100);
  }, 240000);
});
