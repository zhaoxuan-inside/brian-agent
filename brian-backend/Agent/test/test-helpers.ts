import { vi } from 'vitest';
import { RelationDBAccess } from '@brian-agent/base';

let _seq = 0;

export async function createTestDb(): Promise<RelationDBAccess> {
  const db = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
  await db.initialize();
  initAgentSchema(db);
  return db;
}

export async function setupAgentTestMocks() {
  const { IdGenerator } = await import('@brian-agent/base');
  vi.spyOn(IdGenerator, 'generate').mockImplementation(() => `gen-id-${++_seq}`);
  vi.spyOn(IdGenerator, 'now').mockImplementation(() => 1700000000000 + _seq);
}

export function initAgentSchema(db: RelationDBAccess): void {
  const tables = [
    `CREATE TABLE IF NOT EXISTS "agent" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "agent_id" TEXT NOT NULL, "agent_name" TEXT NOT NULL DEFAULT '', "agent_purpose" TEXT NOT NULL DEFAULT '',
      "agent_type" TEXT NOT NULL DEFAULT 'WORKER', "strategy_id" TEXT NOT NULL DEFAULT '',
      "soul_id" TEXT NOT NULL DEFAULT '',
      "skill_ids_json" TEXT NOT NULL DEFAULT '[]', "mcp_ids_json" TEXT NOT NULL DEFAULT '[]',
      "prompt_template_id" TEXT NOT NULL DEFAULT '',
      "task_signature" TEXT NOT NULL DEFAULT '', "usage_count" INTEGER NOT NULL DEFAULT 0,
      "eval_score" INTEGER NOT NULL DEFAULT 50, "enable" INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_usage" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "agent_id" TEXT NOT NULL, "work_id" TEXT NOT NULL DEFAULT '',
      "interact_id" TEXT NOT NULL DEFAULT '', "usage_context" TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_usage_daily" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "agent_id" TEXT NOT NULL, "usage_date" TEXT NOT NULL,
      "usage_count" INTEGER NOT NULL DEFAULT 0,
      UNIQUE("agent_id", "usage_date")
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_opt_rule" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "days" INTEGER NOT NULL DEFAULT 0, "min_usage_count" INTEGER NOT NULL DEFAULT 0,
      "min_eval_score" INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_library_config" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "prompt_template_id" TEXT NOT NULL DEFAULT '', "similarity_threshold" REAL NOT NULL DEFAULT 0.7,
      "max_agent_count" INTEGER NOT NULL DEFAULT 100
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_strategy" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "strategy_id" TEXT NOT NULL, "strategy_label" TEXT NOT NULL,
      "suitable_complexity_min" INTEGER NOT NULL DEFAULT 0,
      "suitable_complexity_max" INTEGER NOT NULL DEFAULT 100,
      "suitable_domains" TEXT NOT NULL DEFAULT '["*"]',
      "execution_rule" TEXT NOT NULL DEFAULT '{}', "enable" INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_strategy_config" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "default_strategy_id" TEXT NOT NULL DEFAULT '', "match_prompt_template_id" TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_builder_config" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "task_analysis_prompt_template_id" TEXT NOT NULL DEFAULT '',
      "default_strategy_id" TEXT NOT NULL DEFAULT '', "auto_optimize" INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_execution_config" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "think_prompt_template_id" TEXT NOT NULL DEFAULT '', "reflect_prompt_template_id" TEXT NOT NULL DEFAULT '',
      "answer_prompt_template_id" TEXT NOT NULL DEFAULT '', "default_max_iterations" INTEGER NOT NULL DEFAULT 10,
      "async_worker_interval" INTEGER NOT NULL DEFAULT 1000
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_execution_trace" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "trace_id" TEXT NOT NULL, "agent_id" TEXT NOT NULL DEFAULT '',
      "start_time" INTEGER NOT NULL DEFAULT 0, "end_time" INTEGER NOT NULL DEFAULT 0,
      "iterations_json" TEXT NOT NULL DEFAULT '[]', "total_token_usage" INTEGER NOT NULL DEFAULT 0,
      "answer" TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_plan" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "plan_id" TEXT NOT NULL, "work_id" TEXT NOT NULL DEFAULT '',
      "interact_id" TEXT NOT NULL DEFAULT '', "task_dag" TEXT NOT NULL DEFAULT '{}',
      "parent_plan_id" TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS "planner_agent_config" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "complexity_decompose_threshold" INTEGER NOT NULL DEFAULT 50,
      "plan_prompt_template_id" TEXT NOT NULL DEFAULT '', "max_subtask_count" INTEGER NOT NULL DEFAULT 10,
      "llm_id" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "writer_agent_config" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "write_prompt_template_id" TEXT NOT NULL DEFAULT '', "default_language" TEXT NOT NULL DEFAULT 'zh-CN',
      "default_style" TEXT NOT NULL DEFAULT 'clear', "default_depth" TEXT NOT NULL DEFAULT 'medium',
      "default_format" TEXT NOT NULL DEFAULT 'MARKDOWN', "llm_id" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "writer_agent_user_profile" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "session_id" TEXT NOT NULL, "language" TEXT NOT NULL DEFAULT 'zh-CN',
      "style" TEXT NOT NULL DEFAULT 'clear', "depth" TEXT NOT NULL DEFAULT 'medium',
      "format" TEXT NOT NULL DEFAULT 'MARKDOWN', "additional_preferences" TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_evaluation" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "eval_id" TEXT NOT NULL, "agent_id" TEXT NOT NULL DEFAULT '', "eval_type" TEXT NOT NULL DEFAULT '',
      "work_id" TEXT NOT NULL DEFAULT '', "interact_id" TEXT NOT NULL DEFAULT '',
      "scores" TEXT NOT NULL DEFAULT '{}', "suggestions" TEXT NOT NULL DEFAULT '[]',
      "need_optimize" INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS "evolutor_agent_config" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "eval_work_prompt_template_id" TEXT NOT NULL DEFAULT '',
      "eval_write_prompt_template_id" TEXT NOT NULL DEFAULT '',
      "optimize_threshold" INTEGER NOT NULL DEFAULT 60,
      "eval_frequency_threshold" INTEGER NOT NULL DEFAULT 5,
      "eval_schedule_interval_ms" INTEGER NOT NULL DEFAULT 3600000,
      "eval_batch_size" INTEGER NOT NULL DEFAULT 20,
      "llm_id" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_context" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "context_id" TEXT NOT NULL, "session_id" TEXT NOT NULL DEFAULT '',
      "agent_id" TEXT NOT NULL DEFAULT '', "work_id" TEXT NOT NULL DEFAULT '',
      "trace_id" TEXT NOT NULL DEFAULT '', "context_total_count" INTEGER NOT NULL DEFAULT 0,
      "context_sources_summary" TEXT NOT NULL DEFAULT '{}'
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_context_item" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "context_id" TEXT NOT NULL DEFAULT '', "info_id" TEXT NOT NULL DEFAULT '', "source" TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_context_config" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "max_context_items" INTEGER NOT NULL DEFAULT 200, "enable_snapshot_persistence" INTEGER NOT NULL DEFAULT 1
    )`,
  ];
  for (const sql of tables) db.executeRaw(sql);
  // Seed default strategies
  const now = Date.now();
  const ruleJson = JSON.stringify({ version: '1.0', steps: [{ step: 'Think', next: 'Answer' }, { step: 'Answer', next: null }] }).replace(/'/g, "''");
  for (const label of ['Plan-and-Solve', 'CoT', 'ReAct']) {
    const sid = `strategy-${label.toLowerCase()}`;
    db.executeRaw(`INSERT OR IGNORE INTO "agent_strategy" ("id","created","updated","strategy_id","strategy_label","suitable_complexity_min","suitable_complexity_max","suitable_domains","execution_rule","enable") VALUES ('${sid}',${now},${now},'${sid}','${label}',0,100,'["*"]','${ruleJson}',1)`);
  }
}

export function makeAccess(obj: any) {
  return new Proxy(obj, { get(t, p) { return typeof t[p] === 'function' ? t[p].bind(t) : t[p]; } });
}

export const NOOP_LLM_ACCESS = { execLLM: vi.fn().mockResolvedValue(true), execLLMStream: vi.fn(), model: vi.fn(), insertModel: vi.fn(), updateModel: vi.fn(), deleteModel: vi.fn(), enableLLM: vi.fn(), closeLLM: vi.fn(), initialize: vi.fn().mockResolvedValue(undefined) } as any;
export const NOOP_PROMPTS_ACCESS = { execPrompt: vi.fn().mockResolvedValue(true), soPrompt: vi.fn().mockResolvedValue(true), insertPrompt: vi.fn(), updatePrompt: vi.fn(), deletePrompt: vi.fn(), configPrompts: vi.fn(), enablePrompts: vi.fn(), closePrompts: vi.fn(), initialize: vi.fn().mockResolvedValue(undefined) } as any;
export const NOOP_MCP_ACCESS = { execMCP: vi.fn().mockResolvedValue(true), soMCP: vi.fn(), insertMCP: vi.fn(), updateMCP: vi.fn(), deleteMCP: vi.fn(), configMCP: vi.fn(), enableMCP: vi.fn(), closeMCP: vi.fn(), initialize: vi.fn().mockResolvedValue(undefined) } as any;
export const NOOP_MQ_ACCESS = { sendMQ: vi.fn().mockResolvedValue(true), soQueueStats: vi.fn().mockResolvedValue(true), consume: vi.fn(), ack: vi.fn(), nack: vi.fn(), enableMQ: vi.fn(), closeMQ: vi.fn(), initialize: vi.fn().mockResolvedValue(undefined) } as any;
export const NOOP_SKILL_ACCESS = { execSkill: vi.fn().mockResolvedValue(true), soSkill: vi.fn(), insertSkill: vi.fn(), updateSkill: vi.fn(), deleteSkill: vi.fn(), enableSkill: vi.fn(), closeSkill: vi.fn(), initialize: vi.fn().mockResolvedValue(undefined) } as any;
export const NOOP_SOUL_ACCESS = { soSoulById: vi.fn().mockResolvedValue(true), soSoul: vi.fn(), insertSoul: vi.fn(), updateSoul: vi.fn(), deleteSoul: vi.fn(), enableSoul: vi.fn(), closeSoul: vi.fn(), initialize: vi.fn().mockResolvedValue(undefined) } as any;
export const NOOP_LLM_CORE = { matchLLM: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.llm_id = ''; return true; }) } as any;
export const NOOP_MCP_CORE = { matchMCP: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.mcp_ids = []; return true; }), optMCP: vi.fn().mockResolvedValue(true) } as any;
export const NOOP_SKILL_CORE = { matchSkill: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.skills = []; return true; }), optSkill: vi.fn().mockResolvedValue(true) } as any;
export const NOOP_SOUL_CORE = { matchSoul: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.soul_id = ''; return true; }), optSoul: vi.fn().mockResolvedValue(true) } as any;
export const NOOP_INFO_CORE = { saveInfo: vi.fn().mockResolvedValue(true), context: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.list = []; return true; }), lastNInfo: vi.fn().mockResolvedValue(true) } as any;
export const NOOP_MQ_CORE = { startWorker: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.worker_id = 'test-worker'; return true; }), stopWorker: vi.fn().mockResolvedValue(true), soWorker: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.workers = []; return true; }) } as any;
