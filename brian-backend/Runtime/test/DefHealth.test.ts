import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RelationDBAccess } from '../../Base/RelationDBProvider/access/RelationDBAccess';
import { AgentDefAccess } from '../Agents/access/AgentDefAccess';
import { AgentDefContext, SweepDefHealthInput, SweepDefHealthOutput } from '../Agents/domain/types';

/**
 * def 组件健康巡检（chg-067）：
 * 源 Agent 失效 → 系统发起重建并原地更新 def 组件关联（def id 不变）；
 * 绑定悬挂（soul/prompt/llm 指向不存在行）→ 清空失效绑定走运行时回退；健康 def 不动。
 */
describe('AgentDef sweepDefHealth（组件失效检测与重建）', () => {
  let relationDb: RelationDBAccess;
  let tempDir = '';
  let buildAgentMock: ReturnType<typeof vi.fn>;
  let access: AgentDefAccess;

  const AGENT_DDL = `CREATE TABLE IF NOT EXISTS agent_record (
    id TEXT PRIMARY KEY, created INTEGER, updated INTEGER,
    title TEXT, type TEXT, strategy_id TEXT,
    soul_id TEXT, skill_ids_json TEXT, mcp_ids_json TEXT, prompt_template_id TEXT, llm_id TEXT DEFAULT '',
    task_signature TEXT, eval_score INTEGER DEFAULT 0, enable INTEGER DEFAULT 1, brief TEXT DEFAULT ''
  )`;

  function insertAgent(id: string, title: string): void {
    relationDb.executeRaw(`INSERT OR REPLACE INTO agent_record (id, created, updated, title, type, strategy_id, soul_id, skill_ids_json, mcp_ids_json, prompt_template_id, llm_id, task_signature, eval_score, enable, brief) VALUES (
      '${id}', 1, 1, '${title}', 'WORKER', 'strat-1', '', '[]', '[]', '', '', '', 0, 1, '${title}'
    )`);
  }

  function insertDef(id: string, agentRef: string, soulId = '', promptId = ''): void {
    relationDb.executeRaw(`INSERT OR REPLACE INTO runtime_agent_def_record (id, created, updated, title, mode, agent_ref, task_signature, agent_purpose, prompt_template_id, model_id, soul_id, tools_json, temperature, budget_total, status) VALUES (
      '${id}', 1, 1, 'def-${id}', 'primary', '${agentRef}', '[general] 巡检用例', '巡检用例', '${promptId}', '', '${soulId}', '', NULL, 60, 'active'
    )`);
  }

  function defRow(id: string): Record<string, unknown> {
    const rows = relationDb.queryRaw<Record<string, unknown>>(
      'SELECT * FROM "runtime_agent_def_record" WHERE "id" = ?', [id],
    ) ?? [];
    return (rows[0] ?? {}) as Record<string, unknown>;
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-defhealth-test-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    relationDb.executeRaw(AGENT_DDL);
    relationDb.executeRaw(`CREATE TABLE IF NOT EXISTS soul_record (
      id TEXT PRIMARY KEY, created INTEGER, updated INTEGER,
      content TEXT, brief TEXT, soul_usage TEXT, enable INTEGER DEFAULT 1, trace_id TEXT DEFAULT '', title TEXT DEFAULT ''
    )`);
    insertAgent('agent-live', '在职专家');
    buildAgentMock = vi.fn(async (_i: unknown, output: { agent_id: string }) => {
      output.agent_id = 'agent-rebuilt';
      insertAgent('agent-rebuilt', '重建专家');
      return true;
    });
    access = new AgentDefAccess(relationDb, {} as never, {
      agentBuilder: { buildAgent: buildAgentMock } as never,
      agentLibrary: {
        soAgent: async (_i: unknown, o: { agents: Array<Record<string, unknown>> }) => {
          const rows = relationDb.queryRaw<Record<string, unknown>>('SELECT * FROM agent_record') ?? [];
          o.agents = rows.map((r) => ({
            agent_id: String(r.id), agent_name: String(r.title ?? ''), agent_purpose: String(r.brief ?? ''),
            soul_id: String(r.soul_id ?? ''), skill_ids: [], mcp_ids: [],
            prompt_template_id: String(r.prompt_template_id ?? ''), model_id: String(r.llm_id ?? ''),
          }));
          return true;
        },
      } as never,
    } as never);
    await access.initialize();
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function sweep(): Promise<{ scanned: number; repaired: number; disabled: number }> {
    const out = new SweepDefHealthOutput();
    await access.sweepDefHealth(new SweepDefHealthInput(), out, new AgentDefContext());
    return { scanned: out.scanned, repaired: out.repaired, disabled: out.disabled };
  }

  it('源 Agent 失效：系统发起重建并原地更新 def 组件关联（def id 不变）', async () => {
    insertDef('def-orphan', 'agent-gone');
    const result = await sweep();
    expect(result).toMatchObject({ scanned: 1, repaired: 1, disabled: 0 });
    expect(buildAgentMock).toHaveBeenCalledTimes(1);
    const row = defRow('def-orphan');
    expect(String(row.agent_ref)).toBe('agent-rebuilt');
    expect(String(row.title)).toBe('重建专家');
    expect(String(row.status)).toBe('active');
  });

  it('绑定悬挂：清空失效 soul 绑定走运行时回退，健康字段保持', async () => {
    insertDef('def-stale', 'agent-live', 'soul-gone');
    const result = await sweep();
    expect(result).toMatchObject({ scanned: 1, repaired: 1, disabled: 0 });
    const row = defRow('def-stale');
    expect(String(row.soul_id)).toBe('');
    expect(String(row.agent_ref)).toBe('agent-live');
  });

  it('健康 def：巡检不动作', async () => {
    insertDef('def-ok', 'agent-live');
    const result = await sweep();
    expect(result).toMatchObject({ scanned: 1, repaired: 0, disabled: 0 });
    expect(buildAgentMock).not.toHaveBeenCalled();
    expect(String(defRow('def-ok').agent_ref)).toBe('agent-live');
  });
});
