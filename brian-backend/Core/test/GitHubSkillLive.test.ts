import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  SkillAccess,
  PromptsAccess,
  PromptCatalogAccess,
  type LLMAccess,
} from '@brian-agent/base';
import {
  SkillCoreContext,
  MatchSkillInput,
  MatchSkillOutput,
  SKILL_CORE_CONFIG_TABLE,
  SKILL_OPT_RULE_TABLE,
  SKILL_USAGE_TABLE,
} from '../SkillCoreProvider';
import { SkillCoreService } from '../SkillCoreProvider/application/SkillCoreService';
import { GitHubSkillClient } from '../SkillCoreProvider/infrastructure/GitHubSkillClient';

/**
 * GitHub 第 3 层真机联测（opt-in：BRIAN_LIVE_GITHUB=1 时才运行）。
 * 真实 GitHubSkillClient（真实网络）+ 真实 PromptCatalog 种子/模板回退，
 * 仅 stub LLM 的 need/keywords 输出（need=true 无本地候选 → 触发 GitHub 检索导入）。
 *
 * 已知环境事实（2026-09-23 实测）：
 * - 直连 api.github.com 通（匿名 search/repositories 200）；
 * - 代理环境变量（https_proxy=192.168.1.100:7890）对 GitHub TLS 掐断，
 *   且 HttpService 代理失败不降级直连 → 带代理运行时本用例检索为空。
 */

const LIVE = process.env.BRIAN_LIVE_GITHUB === '1';

/** LLM stub：固定输出 need=true + 检索关键词（触发第 3 层） */
function stubLlmNeedTrue(keywords: string[]): LLMAccess {
  const response = JSON.stringify({ need: true, keywords, candidates: [] });
  let call = 0;
  return {
    execLLM: async (_i: unknown, o: { result?: string }) => {
      o.result = call++ === 0 ? response : '';
      return true;
    },
    embedLLM: async (_i: unknown, o: { embedding?: number[] }) => { o.embedding = [0.1]; return true; },
  } as unknown as LLMAccess;
}

describe.skipIf(!LIVE)('GitHub Skill 检索真机联测（BRIAN_LIVE_GITHUB=1）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let skillAccess: SkillAccess;
  let promptsAccess: PromptsAccess;
  let ctx: SkillCoreContext;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-github-live-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db') });
    await relationDb.initialize();
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_CORE_CONFIG_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "created" INTEGER NOT NULL,
        "updated" INTEGER NOT NULL,
        "regen_rate" INTEGER NOT NULL DEFAULT 75,
        "prompt_template_id" TEXT NOT NULL DEFAULT '',
        "github_token" TEXT NOT NULL DEFAULT '',
        "github_search_enabled" INTEGER NOT NULL DEFAULT 1,
        "auto_generate_enabled" INTEGER NOT NULL DEFAULT 1
      )
    `);
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_OPT_RULE_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
        "days" INTEGER NOT NULL, "min_usage_count" INTEGER NOT NULL
      )
    `);
    relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_USAGE_TABLE}" (
        "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
        "agent_id" TEXT NOT NULL, "skill_id" TEXT NOT NULL, "usage_date" TEXT NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 1
      )
    `);
    skillAccess = new SkillAccess(relationDb);
    await skillAccess.initialize();
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    await new PromptCatalogAccess(relationDb).seed();
    ctx = new SkillCoreContext();
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('matchSkill 瀑布第 3 层：真实 GitHub 检索 → SKILL.md 导入本地库', async () => {
    const github = new GitHubSkillClient();

    // 阶段 A：直测检索客户端（与瀑布解耦，定位网络挂点）
    const t0 = Date.now();
    const hits = await github.searchSkills(['document', 'skills'], '');
    console.log(`[阶段A searchSkills] ${Date.now() - t0}ms, 命中 ${hits.length}:`, hits.map((h) => h.repo).join(', ') || '(空)');

    if (hits.length > 0) {
      const t1 = Date.now();
      const parsed = await github.fetchSkillMd(hits[0], '');
      console.log(`[阶段B fetchSkillMd] ${Date.now() - t1}ms, name=${parsed?.name ?? '(null)'} brief=${String(parsed?.skill_brief ?? '').slice(0, 60)}`);
      expect(parsed).not.toBeNull();
    }
    expect(hits.length).toBeGreaterThanOrEqual(1);

    // 阶段 C：完整瀑布（stub LLM need=true + 同关键词 → GitHub 层导入）
    const service = new SkillCoreService(relationDb, skillAccess, stubLlmNeedTrue(['document', 'skills']), promptsAccess, github);
    const input = new MatchSkillInput();
    input.agent_id = 'a1';
    input.context_id = 'c1';
    input.run_id = 'r1';
    input.task_content = 'find a skill for document handling';
    const t2 = Date.now();
    const out = new MatchSkillOutput();
    await service.matchSkill(input, out, ctx);
    console.log(`[阶段C matchSkill] ${Date.now() - t2}ms, 返回 ${out.skills.length} 个 Skill`);

    const soOut = new (await import('@brian-agent/base')).SoSkillOutput();
    await skillAccess.soSkill({ conditions: [] } as never, soOut, new (await import('@brian-agent/base')).SkillContext());
    console.log('[GitHub 联测] 本地库 Skill 数:', soOut.list.length);
    for (const s of soOut.list) {
      console.log(`[GitHub 联测] 导入: name=${s.name} brief=${String(s.skill_brief).slice(0, 80)}`);
    }

    expect(soOut.list.length).toBeGreaterThanOrEqual(1);
    expect(out.skills.length).toBeGreaterThanOrEqual(1);
    const imported = out.skills[0];
    expect(imported.skill_brief.trim().length).toBeGreaterThan(0);
    // 落库行含真实 GitHub SKILL.md 全文（frontmatter 已剥离进 skill_md）
    const dbRow = soOut.list.find((s) => s.id === imported.skill_id) ?? soOut.list[0];
    expect(String(dbRow.skill_md ?? '').trim().length).toBeGreaterThan(0);
  }, 90000);
});
