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

    const promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    relationDb.executeRaw(`CREATE TABLE IF NOT EXISTS agent_record (
      id TEXT PRIMARY KEY, created INTEGER, updated INTEGER,
      title TEXT, type TEXT, strategy_id TEXT,
      soul_id TEXT, skill_ids_json TEXT, mcp_ids_json TEXT, prompt_template_id TEXT, llm_id TEXT DEFAULT '',
      task_signature TEXT,
      eval_score INTEGER DEFAULT 0, enable INTEGER DEFAULT 1, brief TEXT DEFAULT ''
    )`);
    relationDb.executeRaw(`INSERT INTO agent_record (id, created, updated, title, brief, enable) VALUES
      ('agent-travel', 1, 1, '心绪漫游向导', '城市出行散步休闲路线推荐', 1),
      ('agent-finance', 1, 1, '行情瞭望', '股市行情走势分析', 1)`);
    relationDb.executeRaw(`INSERT INTO runtime_agent_def_record (id, created, updated, title, mode, agent_ref, task_signature, prompt_template_id, model_id, soul_id, tools_json, temperature, budget_total, status, agent_purpose) VALUES
      ('def-travel', 1, 1, '心绪漫游向导', 'primary', 'agent-travel', '[general] stub-travel', '', '', '', '', NULL, 60, 'active', '城市出行散步休闲路线推荐'),
      ('def-finance', 1, 1, '行情瞭望', 'primary', 'agent-finance', '[general] stub-finance', '', '', '', '', NULL, 60, 'active', '股市行情走势分析')`);

    relationDb.executeRaw(`INSERT OR REPLACE INTO prompt_template_record (id, created, updated, title, brief, content, enable, is_system) VALUES (
      '22222222-3333-4444-5555-666666666666', 1, 1, 'Agent 匹配评估', 'Agent 匹配评估提示词',
      '评估候选 Agent 与任务的匹配度。输出 JSON: {"score": 90, "reason": "匹配", "agent_id": "选中者"}。\n\n任务：{{task_content}}\n\n候选：{{candidates}}', 1, 1
    )`);

    relationDb.executeRaw(`CREATE TABLE IF NOT EXISTS agent_library_config_record (
      id TEXT PRIMARY KEY, created INTEGER, updated INTEGER,
      prompt_template_id TEXT NOT NULL, similarity_threshold REAL NOT NULL DEFAULT 0.7,
      max_agent_count INTEGER NOT NULL DEFAULT 100, regen_rate INTEGER NOT NULL DEFAULT 75,
      match_score_threshold INTEGER NOT NULL DEFAULT 70
    )`);
    relationDb.executeRaw(`INSERT INTO agent_library_config_record (id, created, updated, prompt_template_id) VALUES ('cfg', 1, 1, '22222222-3333-4444-5555-666666666666')`);

    execLLMMock = vi.fn(async (_input: ExecLLMInput, output: ExecLLMOutput) => {
      output.result = '{"score": 90, "reason": "LLM 语义裁判命中", "agent_id": "agent-travel"}';
      return true;
    });

    embedLLMMock = vi.fn(async (input: EmbedLLMInput, output: EmbedLLMOutput) => {
      void input;
      const text = String(input.input ?? '');
      output.embedding = text.includes('中置信出行') ? [0.707, 0.707, 0]
        : text.includes('出行') ? [1, 0, 0]
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
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {  }
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
    const result = await match('周末帮我推荐几个适合出行的城市散步路线');
    expect(result.matched_by).toBe('vector');
    expect(result.def_id).toBe('def-travel');
    expect(execLLMMock).not.toHaveBeenCalled();
  });

  it('BM25 粗筛无候选达标：直接短路跳过向量与 LLM，走新建 Agent 流程', async () => {
    const result = await match('量子计算机的纠错编码基本原理是什么');
    expect(result.matched_by).toBe('built');
    expect(execLLMMock).not.toHaveBeenCalled();
  });

  it('中置信任务：T1 阶梯择优命中既有 def，跳过 LLM 裁判（R8 统一选举）', async () => {
    const result = await match('中置信出行散步休闲路线规划');
    expect(result.matched_by).toBe('vector');
    expect(result.def_id).toBe('def-travel');
    expect(execLLMMock).not.toHaveBeenCalled();
  });

  it('embedding 不可用：阶梯全空 → 创建新 Agent（R8 规格终端动作）', async () => {
    embedLLMMock.mockImplementation(async (_input: EmbedLLMInput, output: EmbedLLMOutput) => {
      output.embedding = [];
      return false;
    });
    const result = await match('周末帮我推荐几个适合出行的城市散步路线');
    expect(result.matched_by).toBe('built');
    expect(execLLMMock).not.toHaveBeenCalled();
  });

  it('R8 统一选举：信号提取阶段不再走 LLM 裁判（选举零 execLLM 调用）', async () => {
    embedLLMMock.mockImplementation(async (_input: EmbedLLMInput, output: EmbedLLMOutput) => {
      output.embedding = [];
      return false;
    });

    await match('城市散步休闲出行路线推荐');
    expect(execLLMMock).not.toHaveBeenCalled();
  });
});
