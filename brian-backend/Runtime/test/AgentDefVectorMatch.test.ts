/**
 * AgentDefService 向量+LLM 两级匹配（2026-09-14）。
 *
 * 覆盖：
 * 1. 向量置信度达标 → 直接采纳（matched_by=vector，不再调用 LLM 打分，省 5-20s 意图 LLM）；
 * 2. 向量置信度不足 → 回退 LLM 语义裁判（matched_by=llm）；
 * 3. embedding 不可用 → 回退 LLM 裁判（行为与旧链路一致）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RelationDBAccess, ExecLLMInput, ExecLLMOutput, EmbedLLMInput, EmbedLLMOutput } from '@brian-agent/base';
import { AgentsSchemaInitializer } from '../Agents/infrastructure/AgentsSchemaInitializer';
import { AgentDefAccess } from '../Agents/access/AgentDefAccess';
import { PromptsAccess } from '@brian-agent/base';
import { AgentDefContext, MatchAgentDefInput, MatchAgentDefOutput } from '../Agents/domain/types';
import type { LLMAccess } from '@brian-agent/base';

describe('AgentDefService 向量+LLM 两级匹配', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let agentDefAccess: AgentDefAccess;
  let execLLMMock: ReturnType<typeof vi.fn>;
  let embedLLMMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-vector-match-test-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    new AgentsSchemaInitializer(relationDb).init();
    // prompt_template 表（Agent 匹配模板渲染用）
    const promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    relationDb.executeRaw(`CREATE TABLE IF NOT EXISTS agent (
      id TEXT PRIMARY KEY, created INTEGER, updated INTEGER,
      agent_id TEXT, agent_name TEXT, agent_type TEXT, strategy_id TEXT,
      soul_id TEXT, skill_ids_json TEXT, mcp_ids_json TEXT, prompt_template_id TEXT,
      task_signature TEXT, usage_count INTEGER DEFAULT 0,
      eval_score INTEGER DEFAULT 0, enable INTEGER DEFAULT 1, agent_purpose TEXT DEFAULT ''
    )`);
    relationDb.executeRaw(`INSERT INTO agent (id, created, updated, agent_id, agent_name, agent_purpose, enable) VALUES
      ('a1', 1, 1, 'agent-travel', '心绪漫游向导', '城市出行散步休闲路线推荐', 1),
      ('a2', 1, 1, 'agent-finance', '行情瞭望', '股市行情走势分析', 1)`);
    relationDb.executeRaw(`INSERT INTO runtime_agent_def (id, created, updated, name, mode, agent_ref, task_signature, prompt_template_id, model_id, soul_id, tools_json, temperature, budget_total, status, agent_purpose) VALUES
      ('def-travel', 1, 1, '心绪漫游向导', 'primary', 'agent-travel', '[general] stub-travel', '', '', '', '', NULL, 60, 'active', '城市出行散步休闲路线推荐'),
      ('def-finance', 1, 1, '行情瞭望', 'primary', 'agent-finance', '[general] stub-finance', '', '', '', '', NULL, 60, 'active', '股市行情走势分析')`);

    // Agent 匹配提示词模板（回退 LLM 裁判路径渲染用）
    relationDb.executeRaw(`INSERT OR REPLACE INTO prompt_template (id, created, updated, prompt_template_title, prompt_template_brief, prompt_template, enable, is_system) VALUES (
      '22222222-3333-4444-5555-666666666666', 1, 1, 'Agent 匹配评估', 'Agent 匹配评估提示词',
      '评估候选 Agent 与任务的匹配度（能力感知：任务所需能力 vs candidates[].capabilities）。输出 JSON: {"score": 90, "reason": "匹配", "agent_id": "选中者"}。\n\n任务：{{task_content}}\n\n候选：{{candidates}}', 1, 1
    )`);
    // agent_library_config：schema 对齐生产（prompt_template_id 指向匹配模板）——
    // 2026-09-24 修复：列名曾与生产不一致，config-first 读取悬空回退 catalog 同名模板（契约漂移复现）
    relationDb.executeRaw(`CREATE TABLE IF NOT EXISTS agent_library_config (
      id TEXT PRIMARY KEY, created INTEGER, updated INTEGER,
      prompt_template_id TEXT NOT NULL, similarity_threshold REAL NOT NULL DEFAULT 0.7,
      max_agent_count INTEGER NOT NULL DEFAULT 100, regen_rate INTEGER NOT NULL DEFAULT 75,
      match_score_threshold INTEGER NOT NULL DEFAULT 70
    )`);
    relationDb.executeRaw(`INSERT INTO agent_library_config (id, created, updated, prompt_template_id) VALUES ('cfg', 1, 1, '22222222-3333-4444-5555-666666666666')`);

    // LLM 裁判 mock：一律给 90 分命中第一个候选
    execLLMMock = vi.fn(async (_input: ExecLLMInput, output: ExecLLMOutput) => {
      output.result = '{"score": 90, "reason": "LLM 语义裁判命中", "agent_id": "agent-travel"}';
      return true;
    });
    // embedding mock：按文本特征返回 3 维正交基向量（出行=[1,0,0] / 行情=[0,1,0] / 其他=[0,0,1]）
    embedLLMMock = vi.fn(async (input: EmbedLLMInput, output: EmbedLLMOutput) => {
      void input;
      const text = String(input.input ?? '');
      output.embedding = text.includes('出行') ? [1, 0, 0]
        : text.includes('行情') ? [0, 1, 0]
        : [0, 0, 1];
      return true;
    });
    const mockLlm = {
      execLLM: execLLMMock,
      execLLMEvents: vi.fn(async (_i: unknown, o: { finish_reason?: string; result?: string; tool_calls?: unknown[] }) => {
        o.finish_reason = 'stop';
        o.result = 'ok';
        o.tool_calls = [];
        return true;
      }),
      embedLLM: embedLLMMock,
    } as unknown as LLMAccess;

    agentDefAccess = new AgentDefAccess(relationDb, mockLlm, {
      agentBuilder: { buildAgent: vi.fn(async (_i: unknown, o: { agent_id?: string }) => { o.agent_id = 'agent-new'; return true; }) } as never,
    });
    await agentDefAccess.initialize();
  });

  afterEach(async () => {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 清理失败忽略 */ }
  });

  async function match(task: string): Promise<{ matched_by: string; def_id: string }> {
    const input = new MatchAgentDefInput();
    input.task_content = task;
    input.run_id = 'run-vt';
    input.work_id = 'work-vt';
    const output = new MatchAgentDefOutput();
    await agentDefAccess.matchAgentDef(input, output, new AgentDefContext());
    return { matched_by: output.matched_by, def_id: output.def_id };
  }

  it('向量置信度达标：直接采纳向量层，跳过 LLM 语义裁判', async () => {
    // query『推荐周末出行散步的好去处』向量 = [1,0,0]，与旅行 def 用途向量同向 → 余弦 1.0 ≥ 0.85
    const result = await match('周末帮我推荐几个适合出行的城市散步路线');
    expect(result.matched_by).toBe('vector');
    expect(result.def_id).toBe('def-travel');
    // LLM 裁判不应被调用（省一次 5-20s 意图打分）
    expect(execLLMMock).not.toHaveBeenCalled();
  });

  it('向量置信度不足：回退 LLM 语义裁判', async () => {
    // query『量子计算纠错』向量 = [0,0,1]，与两个 def 均正交 → 余弦 0 < 0.85 → 回退 LLM
    const result = await match('量子计算机的纠错编码基本原理是什么');
    expect(result.matched_by).toBe('llm');
    // LLM 裁判返回 agent_id=agent-travel（score 90 达标）
    expect(result.def_id).toBe('def-travel');
    expect(execLLMMock).toHaveBeenCalledTimes(1);
  });

  it('embedding 不可用：回退 LLM 裁判（行为与旧链路一致）', async () => {
    embedLLMMock.mockImplementation(async (_input: EmbedLLMInput, output: EmbedLLMOutput) => {
      output.embedding = [];
      return false;
    });
    const result = await match('周末帮我推荐几个适合出行的城市散步路线');
    expect(result.matched_by).toBe('llm');
    expect(execLLMMock).toHaveBeenCalledTimes(1);
  });

  it('LLM 裁判候选注入能力面（capabilities.bound_count/skills，判据从字面相似升级为能力核对）', async () => {
    // 绑定 skill 后候选应带能力面（2026-09-24 事故 e77f0bb4 根因修复回归）
    relationDb.executeRaw(`UPDATE agent SET skill_ids_json = '["11111111-2222-3333-4444-555555555555"]' WHERE agent_id='agent-travel'`);
    // 绑定落库后主动失效预热缓存（生产语义：AgentLibrary.bindAgentComponent 同点失效）
    agentDefAccess.invalidateAgentBindingCache();
    relationDb.executeRaw(`CREATE TABLE IF NOT EXISTS skill (id TEXT PRIMARY KEY, created INTEGER, updated INTEGER, name TEXT, skill_brief TEXT, skill_md TEXT, scripts TEXT, enable INTEGER)`);
    relationDb.executeRaw(`INSERT INTO skill (id, created, updated, name, skill_brief, skill_md, scripts, enable) VALUES
      ('11111111-2222-3333-4444-555555555555', 1, 1, '磁盘巡检', '查询磁盘可用空间', '# disk', '', 1)`);
    // 任务文本避开向量命中（'出行'/'行情'关键字），强制进入 LLM 裁判层
    await match('统计宿主机CPU使用率');
    const prompt = (execLLMMock.mock.calls[0][0] as ExecLLMInput).prompt;
    expect(prompt).toContain('capabilities');
    expect(prompt).toContain('bound_count');
    expect(prompt).toContain('磁盘巡检');
  });
});
