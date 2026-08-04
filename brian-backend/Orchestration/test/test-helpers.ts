import { vi } from 'vitest';
import { RelationDBAccess, IdGenerator } from '@brian-agent/base';

let _seq = 0;

export async function createTestDb(): Promise<RelationDBAccess> {
  const db = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
  await db.initialize();
  initOrchestrationSchema(db);
  return db;
}

export async function setupTestMocks() {
  vi.spyOn(IdGenerator, 'generate').mockImplementation(() => `gen-id-${++_seq}`);
  vi.spyOn(IdGenerator, 'now').mockImplementation(() => 1700000000000 + _seq);
}

export function resetTestMocks() {
  vi.clearAllMocks();
}

/**
 * 等待所有微任务和宏任务（setImmediate）完成，用于测试异步回调。
 * 在需要等待 setImmediate 回调执行的断言前调用。
 */
export function flushAllCallbacks(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => {
      setImmediate(() => {
        setImmediate(() => {
          resolve();
        });
      });
    });
  });
}

export function initOrchestrationSchema(db: RelationDBAccess): void {
  const tables = [
    `CREATE TABLE IF NOT EXISTS orchestration_work (
      id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      work_id TEXT NOT NULL UNIQUE, interact_id TEXT NOT NULL, session_id TEXT NOT NULL,
      user_query TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'CREATED',
      orchestration_strategy TEXT NOT NULL DEFAULT '', task_count INTEGER NOT NULL DEFAULT 0,
      completed_task_count INTEGER NOT NULL DEFAULT 0, elapsed_ms INTEGER NOT NULL DEFAULT 0,
      cancel_reason TEXT, error_message TEXT, final_response TEXT, metadata TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_orchestration_work_work_id ON orchestration_work(work_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orchestration_work_session_id ON orchestration_work(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orchestration_work_status ON orchestration_work(status)`,
    `CREATE TABLE IF NOT EXISTS orchestration_config (
      id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      complexity_decompose_threshold INTEGER NOT NULL DEFAULT 50,
      strategy_prompt_template_id TEXT NOT NULL DEFAULT '',
      default_strategy TEXT NOT NULL DEFAULT 'SIMPLE',
      max_recent_works INTEGER NOT NULL DEFAULT 5,
      async_worker_interval INTEGER NOT NULL DEFAULT 1000,
      default_strategy_id TEXT, max_plan_retries INTEGER NOT NULL DEFAULT 2,
      plan_prompt_template_id TEXT NOT NULL DEFAULT '',
      max_concurrent INTEGER NOT NULL DEFAULT 1,
      default_max_iterations INTEGER NOT NULL DEFAULT 10,
      dag_timeout_ms INTEGER NOT NULL DEFAULT 300000,
      max_execution_depth INTEGER NOT NULL DEFAULT 50,
      node_timeout_ms INTEGER NOT NULL DEFAULT 300000,
      trace_enabled INTEGER NOT NULL DEFAULT 1,
      max_nodes_in_graph INTEGER NOT NULL DEFAULT 50
    )`,
    `CREATE TABLE IF NOT EXISTS orchestration_strategy (
      id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      strategy_id TEXT NOT NULL UNIQUE, strategy_label TEXT NOT NULL UNIQUE,
      strategy_description TEXT NOT NULL, jsonnode_definition TEXT NOT NULL,
      enable INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE INDEX IF NOT EXISTS idx_orchestration_strategy_strategy_id ON orchestration_strategy(strategy_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orchestration_strategy_label ON orchestration_strategy(strategy_label)`,
    `CREATE TABLE IF NOT EXISTS orchestration_strategy_execution (
      id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      execution_id TEXT NOT NULL UNIQUE, work_id TEXT NOT NULL, strategy_id TEXT NOT NULL,
      plan_id TEXT, plan_retry_count INTEGER NOT NULL DEFAULT 0,
      execution_status TEXT NOT NULL, error_info TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_orch_strat_exec_execution_id ON orchestration_strategy_execution(execution_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orch_strat_exec_work_id ON orchestration_strategy_execution(work_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orch_strat_exec_strategy_id ON orchestration_strategy_execution(strategy_id)`,
    `CREATE TABLE IF NOT EXISTS orchestration_task_agent (
      id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      plan_id TEXT NOT NULL, task_id TEXT NOT NULL, agent_id TEXT NOT NULL,
      task_complexity INTEGER, task_domain TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_task_agent_plan_id ON orchestration_task_agent(plan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_task_agent_task_id ON orchestration_task_agent(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_task_agent_agent_id ON orchestration_task_agent(agent_id)`,
    `CREATE TABLE IF NOT EXISTS orchestration_agent_dag (
      id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      plan_id TEXT NOT NULL, from_agent_id TEXT NOT NULL, to_agent_id TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_dag_plan_id ON orchestration_agent_dag(plan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_dag_from ON orchestration_agent_dag(from_agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_dag_to ON orchestration_agent_dag(to_agent_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_dag_edge ON orchestration_agent_dag(from_agent_id, to_agent_id)`,
    `CREATE TABLE IF NOT EXISTS orchestration_agent_dag_record (
      id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      plan_id TEXT NOT NULL UNIQUE, total_agent_count INTEGER NOT NULL,
      agent_dag_json TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_dag_record_plan_id ON orchestration_agent_dag_record(plan_id)`,
    `CREATE TABLE IF NOT EXISTS orchestration_agent_execution (
      id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      work_id TEXT NOT NULL, agent_id TEXT NOT NULL, plan_id TEXT, task_id TEXT,
      execution_type TEXT NOT NULL, task_content TEXT NOT NULL, status TEXT NOT NULL,
      answer TEXT, trace_id TEXT, iterations INTEGER, elapsed_ms INTEGER, error_info TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_exec_work_id ON orchestration_agent_execution(work_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_exec_agent_id ON orchestration_agent_execution(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_exec_plan_id ON orchestration_agent_execution(plan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_exec_status ON orchestration_agent_execution(status)`,
    `CREATE TABLE IF NOT EXISTS orchestration_jsonnode_trace (
      id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      orchestration_id TEXT NOT NULL, node_id TEXT NOT NULL, node_type TEXT NOT NULL,
      status TEXT NOT NULL, elapsed_ms INTEGER NOT NULL, error_info TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_jsonnode_trace_orchestration_id ON orchestration_jsonnode_trace(orchestration_id)`,
    `CREATE TABLE IF NOT EXISTS orchestration_node_type (
      id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      node_type TEXT NOT NULL UNIQUE, description TEXT NOT NULL,
      handler_module TEXT NOT NULL, is_builtin INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_node_type_unique ON orchestration_node_type(node_type)`,

    // ===== Agent layer tables =====
    `CREATE TABLE IF NOT EXISTS "agent" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "agent_id" TEXT NOT NULL, "agent_name" TEXT NOT NULL DEFAULT '',
      "agent_type" TEXT NOT NULL DEFAULT 'WORKER', "strategy_id" TEXT NOT NULL DEFAULT '',
      "llm_id" TEXT NOT NULL DEFAULT '', "soul_id" TEXT NOT NULL DEFAULT '',
      "task_signature" TEXT NOT NULL DEFAULT '', "usage_count" INTEGER NOT NULL DEFAULT 0,
      "eval_score" INTEGER NOT NULL DEFAULT 50, "enable" INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_usage" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "agent_id" TEXT NOT NULL, "work_id" TEXT NOT NULL DEFAULT '',
      "interact_id" TEXT NOT NULL DEFAULT '', "usage_context" TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_strategy" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "strategy_id" TEXT NOT NULL, "strategy_label" TEXT NOT NULL,
      "suitable_complexity_min" INTEGER NOT NULL DEFAULT 0,
      "suitable_complexity_max" INTEGER NOT NULL DEFAULT 100,
      "suitable_domains" TEXT NOT NULL DEFAULT '["*"]',
      "execution_rule" TEXT NOT NULL DEFAULT '{}', "enable" INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_execution_config" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "think_prompt_template_id" TEXT NOT NULL DEFAULT '', "reflect_prompt_template_id" TEXT NOT NULL DEFAULT '',
      "answer_prompt_template_id" TEXT NOT NULL DEFAULT '', "default_max_iterations" INTEGER NOT NULL DEFAULT 10,
      "async_worker_interval" INTEGER NOT NULL DEFAULT 1000
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_evaluation" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "eval_id" TEXT NOT NULL, "agent_id" TEXT NOT NULL DEFAULT '', "eval_type" TEXT NOT NULL DEFAULT '',
      "work_id" TEXT NOT NULL DEFAULT '', "interact_id" TEXT NOT NULL DEFAULT '',
      "scores" TEXT NOT NULL DEFAULT '{}', "suggestions" TEXT NOT NULL DEFAULT '[]',
      "need_optimize" INTEGER NOT NULL DEFAULT 0
    )`,

    // ===== Core layer tables =====
    `CREATE TABLE IF NOT EXISTS "skill_core_config" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "regen_rate" INTEGER NOT NULL DEFAULT 75, "prompt_template_id" TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_skill" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "agent_id" TEXT NOT NULL, "skill_id" TEXT NOT NULL,
      UNIQUE("agent_id", "skill_id")
    )`,
    `CREATE TABLE IF NOT EXISTS "skill_usage" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL,
      "agent_skill_id" TEXT NOT NULL, "timestamp" INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "mcp_core_config" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "regen_rate" INTEGER NOT NULL DEFAULT 75, "prompt_template_id" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_mcp" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "agent_id" TEXT NOT NULL, "mcp_id" TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "agent_mcp_usage" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL,
      "agent_mcp_id" TEXT NOT NULL, "timestamp" INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "info_raw" (
      "id" TEXT NOT NULL PRIMARY KEY, "created" INTEGER NOT NULL, "updated" INTEGER NOT NULL,
      "session_id" TEXT NOT NULL, "work_id" TEXT NOT NULL, "interact_id" TEXT NOT NULL,
      "info_id" TEXT NOT NULL, "info_creator_id" TEXT NOT NULL, "info_creator_role" TEXT NOT NULL,
      "info" TEXT NOT NULL, "info_length" INTEGER NOT NULL DEFAULT 0, "pin" INTEGER NOT NULL DEFAULT 0
    )`,
  ];
  for (const sql of tables) db.executeRaw(sql);

  const now = Date.now();
  db.executeRaw(`
    INSERT OR IGNORE INTO orchestration_config
      (id, created, updated, complexity_decompose_threshold, strategy_prompt_template_id,
       default_strategy, max_recent_works, async_worker_interval, default_strategy_id,
       max_plan_retries, plan_prompt_template_id, max_concurrent, default_max_iterations,
       dag_timeout_ms, max_execution_depth, node_timeout_ms, trace_enabled, max_nodes_in_graph)
    VALUES
      ('orchestration_config_default', ${now}, ${now}, 50, '', 'SIMPLE', 5, 1000, NULL,
       2, '', 1, 10, 300000, 50, 300000, 1, 50)
  `);

  const simpleJsonNodeDef = JSON.stringify({
    version: '1.0', orchestration_id: 'builtin_simple', start_node: 'node_1',
    nodes: [
      { node_id: 'node_1', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'PROCESSING' }, next: 'node_2', on_error: 'node_8' },
      { node_id: 'node_2', node_type: 'BUILD_WORK_CONTEXT', params: { max_recent_works: 5, include_user_profile: true }, next: 'node_3', on_error: 'node_8' },
      { node_id: 'node_3', node_type: 'BUILD_WORK_AGENT', params: { force_new: false }, next: 'node_4', on_error: 'node_8' },
      { node_id: 'node_4', node_type: 'EXEC_AGENT', params: { agent_id_key: 'current_agent_id', save_result_key: 'agent_answer' }, next: 'node_5', on_error: 'node_8' },
      { node_id: 'node_5', node_type: 'WRITE_RESULT', params: { agent_results_key: 'agent_results', save_response_key: 'final_response' }, next: 'node_6', on_error: 'node_8' },
      { node_id: 'node_6', node_type: 'EVAL_RESULT', params: { agent_results_key: 'agent_results', final_response_key: 'final_response', async: true }, next: 'node_7', on_error: 'node_8' },
      { node_id: 'node_7', node_type: 'SAVE_RESPONSE', params: { response_key: 'final_response', update_work_status: 'COMPLETED' }, next: null, on_error: 'node_8' },
      { node_id: 'node_8', node_type: 'HANDLE_ERROR', params: { default_response: '抱歉，处理您的问题时出现了错误。', update_work_status: 'FAILED' }, next: null },
    ],
  }).replace(/'/g, "''");

  const planningJsonNodeDef = JSON.stringify({
    version: '1.0', orchestration_id: 'builtin_planning', start_node: 'node_1',
    nodes: [
      { node_id: 'node_1', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'PROCESSING' }, next: 'node_2', on_error: 'node_12' },
      { node_id: 'node_2', node_type: 'BUILD_WORK_CONTEXT', params: { max_recent_works: 5, include_user_profile: true }, next: 'node_3', on_error: 'node_12' },
      { node_id: 'node_3', node_type: 'PLAN_WORK', params: { save_plan_key: 'plan_result' }, next: 'node_4', on_error: 'node_12' },
      { node_id: 'node_4', node_type: 'CONDITION', params: { field: 'task_count', operator: 'EQ', value: '1', true_next: 'node_6', false_next: 'node_5' }, next: null, on_error: 'node_12' },
      { node_id: 'node_5', node_type: 'BUILD_AGENT_DAG', params: { plan_key: 'plan_result', save_agent_dag_key: 'agent_dag' }, next: 'node_8', on_error: 'node_12' },
      { node_id: 'node_6', node_type: 'BUILD_WORK_AGENT', params: { force_new: false }, next: 'node_7', on_error: 'node_12' },
      { node_id: 'node_7', node_type: 'EXEC_AGENT', params: { agent_id_key: 'current_agent_id', save_result_key: 'agent_answer' }, next: 'node_9', on_error: 'node_12' },
      { node_id: 'node_8', node_type: 'EXEC_DAG', params: { agent_dag_key: 'agent_dag', max_concurrent: 1, save_results_key: 'agent_results' }, next: 'node_9', on_error: 'node_12' },
      { node_id: 'node_9', node_type: 'WRITE_RESULT', params: { agent_results_key: 'agent_results', save_response_key: 'final_response' }, next: 'node_10', on_error: 'node_12' },
      { node_id: 'node_10', node_type: 'EVAL_RESULT', params: { agent_results_key: 'agent_results', final_response_key: 'final_response', async: true }, next: 'node_11', on_error: 'node_12' },
      { node_id: 'node_11', node_type: 'SAVE_RESPONSE', params: { response_key: 'final_response', update_work_status: 'COMPLETED' }, next: null, on_error: 'node_12' },
      { node_id: 'node_12', node_type: 'HANDLE_ERROR', params: { default_response: '抱歉，处理您的问题时出现了错误。', update_work_status: 'FAILED' }, next: null },
    ],
  }).replace(/'/g, "''");

  const simpleId = IdGenerator.generate();
  const planningId = IdGenerator.generate();
  const simpleStrategyId = IdGenerator.generate();
  const planningStrategyId = IdGenerator.generate();

  db.executeRaw(`
    INSERT OR IGNORE INTO orchestration_strategy
      (id, created, updated, strategy_id, strategy_label, strategy_description, jsonnode_definition, enable)
    VALUES
      ('${simpleId}', ${now}, ${now}, '${simpleStrategyId}', 'SIMPLE', 'Simple strategy description', '${simpleJsonNodeDef}', 1),
      ('${planningId}', ${now}, ${now}, '${planningStrategyId}', 'PLANNING', 'Planning strategy description', '${planningJsonNodeDef}', 1)
  `);
}

export function makeAccess(obj: any) {
  return new Proxy(obj, { get(t, p) { return typeof t[p] === 'function' ? t[p].bind(t) : t[p]; } });
}

export function createMockAgentBuilder(opts?: { failBuild?: boolean; agentId?: string }) {
  let agentSeq = 0;
  const baseAgentId = opts?.agentId ?? 'mock-agent-id';
  return {
    buildAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      if (opts?.failBuild) { o.error = 'build failed'; return false; }
      agentSeq++;
      o.agent_id = `${baseAgentId}-${agentSeq}`;
      return true;
    }),
    buildPlannerAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.agent_id = 'mock-planner-id'; return true; }),
    buildWriterAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.agent_id = 'mock-writer-id'; return true; }),
    buildEvolutorAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.agent_id = 'mock-evolutor-id'; return true; }),
    optimizeAgent: vi.fn().mockResolvedValue(true),
    configAgentBuilder: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockAgentExecution(opts?: { failExec?: boolean; answer?: string }) {
  const answer = opts?.answer ?? 'This is a mock agent answer.';
  return {
    execAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      if (opts?.failExec) { o.error = 'exec failed'; return false; }
      o.answer = answer;
      o.trace_id = 'mock-trace-id';
      o.iterations = 3;
      o.elapsed_ms = 150;
      return true;
    }),
    execAgentAsync: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.job_id = 'mock-job-id'; return true; }),
    getTrace: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.trace = { trace_id: 'mock-trace-id', agent_id: 'mock-agent-id', start_time: 1700000000000, end_time: 1700000000150, total_elapsed_ms: 150, iterations: [], total_token_usage: 100 };
      return true;
    }),
    getExecContext: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.pinned = { count: 0, info_ids: [] };
      o.timeline = { count: 0, info_ids: [] };
      o.tag_relative = { count: 0, info_ids: [] };
      o.similarity = { count: 0, info_ids: [] };
      o.keyword = { count: 0, info_ids: [] };
      o.random = { count: 0, info_ids: [] };
      return true;
    }),
    getExecContextByAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.pinned = { count: 0, info_ids: [] };
      o.timeline = { count: 0, info_ids: [] };
      o.tag_relative = { count: 0, info_ids: [] };
      o.similarity = { count: 0, info_ids: [] };
      o.keyword = { count: 0, info_ids: [] };
      o.random = { count: 0, info_ids: [] };
      return true;
    }),
    think: vi.fn().mockResolvedValue(true),
    act: vi.fn().mockResolvedValue(true),
    reflect: vi.fn().mockResolvedValue(true),
    answer: vi.fn().mockResolvedValue(true),
    getExecQueueStatus: vi.fn().mockResolvedValue(true),
    configAgentExecution: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockAgentLibrary(opts?: { hasAgent?: boolean }) {
  return {
    getAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      if (opts?.hasAgent) {
        o.agents = [{ agent_id: 'mock-agent-id', agent_type: 'WORKER', agent_name: 'Test Agent', strategy_id: 'mock-strategy-id', llm_id: 'mock-llm-id', soul_id: 'mock-soul-id', task_signature: 'test-task', skill_ids: '[]', mcp_ids: '[]', prompt_template_ids: '[]' }];
      } else {
        o.agents = [];
      }
      return true;
    }),
    soAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.agents = []; return true; }),
    recordAgentUsage: vi.fn().mockResolvedValue(true),
    addAgent: vi.fn().mockResolvedValue(true),
    matchAgent: vi.fn().mockResolvedValue(true),
    updateAgent: vi.fn().mockResolvedValue(true),
    ageAgent: vi.fn().mockResolvedValue(true),
    getAgentRule: vi.fn().mockResolvedValue(true),
    updateAgentRule: vi.fn().mockResolvedValue(true),
    configAgentLibrary: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockPlannerAgent(opts?: { failPlan?: boolean; taskCount?: number; planId?: string }) {
  const taskCount = opts?.taskCount ?? 3;
  const planId = opts?.planId ?? 'mock-plan-id';
  return {
    plan: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      if (opts?.failPlan) { o.error = 'plan failed'; return false; }
      o.plan_id = planId;
      const nodes: Array<{ task_id: string; task_content: string; task_complexity: number; task_domain: string; priority: number; dependencies: string[] }> = [];
      for (let i = 0; i < taskCount; i++) {
        nodes.push({ task_id: `task-${i + 1}`, task_content: `Task ${i + 1} content`, task_complexity: 30, task_domain: 'general', priority: 1, dependencies: [] });
      }
      const edges: Array<{ from_task_id: string; to_task_id: string }> = [];
      if (taskCount > 1) {
        for (let i = 0; i < taskCount - 1; i++) {
          edges.push({ from_task_id: `task-${i + 1}`, to_task_id: `task-${i + 2}` });
        }
      }
      o.task_dag = { nodes, edges };
      return true;
    }),
    replan: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.new_plan_id = 'mock-replan-id';
      o.task_dag = { nodes: [{ task_id: 'task-retry-1', task_content: 'Retry task content', task_complexity: 30, task_domain: 'general', priority: 1, dependencies: [] }], edges: [] };
      return true;
    }),
    getPlan: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.plan = { plan_id: planId, work_id: 'mock-work-id', interact_id: 'mock-interact-id', task_dag: JSON.stringify({ nodes: [], edges: [] }), parent_plan_id: '' };
      return true;
    }),
    configPlannerAgent: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockWriterAgent(opts?: { failWrite?: boolean; response?: string }) {
  return {
    write: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      if (opts?.failWrite) { o.error = 'write failed'; return false; }
      o.response = opts?.response ?? 'This is a mock writer response.';
      o.response_format = 'MARKDOWN';
      o.token_usage = 50;
      return true;
    }),
    getUserProfile: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.user_profile = { language: 'zh-CN', style: 'clear', depth: 'medium', format: 'MARKDOWN' };
      return true;
    }),
    saveUserProfile: vi.fn().mockResolvedValue(true),
    configWriterAgent: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockEvolutorAgent(opts?: { failEval?: boolean }) {
  return {
    evalWorkAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      if (opts?.failEval) { o.error = 'eval failed'; return false; }
      o.eval_id = 'mock-eval-id';
      o.scores = { correctness: 80, completeness: 75, efficiency: 85, relevance: 90, overall: 82 };
      o.suggestions = ['Improve accuracy'];
      o.need_optimize = false;
      return true;
    }),
    evalWriterAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      if (opts?.failEval) { o.error = 'eval failed'; return false; }
      o.eval_id = 'mock-writer-eval-id';
      o.scores = { correctness: 85, completeness: 80, efficiency: 90, relevance: 95, overall: 87 };
      o.suggestions = [];
      o.need_optimize = false;
      return true;
    }),
    startEvalSchedule: vi.fn().mockResolvedValue(true),
    stopEvalSchedule: vi.fn().mockResolvedValue(true),
    getEvaluation: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.evaluations = [];
      return true;
    }),
    getEvolutionReport: vi.fn().mockResolvedValue(true),
    configEvolutorAgent: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockInfoCore() {
  return {
    saveInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.info_id = 'mock-info-id'; return true; }),
    context: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.list = []; return true; }),
    lastNInfo: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.list = []; return true; }),
    pinInfo: vi.fn().mockResolvedValue(true),
    vectorInfo: vi.fn().mockResolvedValue(true),
    tagInfo: vi.fn().mockResolvedValue(true),
    summaryInfo: vi.fn().mockResolvedValue(true),
    keywordInfo: vi.fn().mockResolvedValue(true),
    graphTag: vi.fn().mockResolvedValue(true),
    graphNInfo: vi.fn().mockResolvedValue(true),
    similarKInfo: vi.fn().mockResolvedValue(true),
    keywordKInfo: vi.fn().mockResolvedValue(true),
    relationKInfo: vi.fn().mockResolvedValue(true),
    graphInfo: vi.fn().mockResolvedValue(true),
    delInfo: vi.fn().mockResolvedValue(true),
    soInfoTagConfig: vi.fn().mockResolvedValue(true),
    updateInfoTagConfig: vi.fn().mockResolvedValue(true),
    soInfoSummaryConfig: vi.fn().mockResolvedValue(true),
    updateInfoSummaryConfig: vi.fn().mockResolvedValue(true),
    soInfoConfig: vi.fn().mockResolvedValue(true),
    updateInfoConfig: vi.fn().mockResolvedValue(true),
    soInfoVectorConfig: vi.fn().mockResolvedValue(true),
    updateInfoVectorConfig: vi.fn().mockResolvedValue(true),
    soInfoContextConfig: vi.fn().mockResolvedValue(true),
    updateInfoContextConfig: vi.fn().mockResolvedValue(true),
    existVectorInfo: vi.fn().mockResolvedValue(true),
    existTagInfo: vi.fn().mockResolvedValue(true),
    existSummaryInfo: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockMQCore() {
  return {
    startWorker: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.worker_id = 'test-worker'; return true; }),
    stopWorker: vi.fn().mockResolvedValue(true),
    soWorker: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.workers = []; return true; }),
    getWorker: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.worker = null; return true; }),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockMQAccess() {
  return {
    sendMQ: vi.fn().mockResolvedValue(true),
    getQueueStats: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.stats = { pending: 0, processing: 0, completed: 0, failed: 0 }; return true; }),
    consume: vi.fn().mockResolvedValue(true),
    ack: vi.fn().mockResolvedValue(true),
    nack: vi.fn().mockResolvedValue(true),
    enableMQ: vi.fn().mockResolvedValue(true),
    closeMQ: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockStrategyAccess(opts?: { failStart?: boolean; finalResponse?: string }) {
  return {
    startOrchestration: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      if (opts?.failStart) { o.error = 'start failed'; return false; }
      o.final_response = opts?.finalResponse ?? 'This is a mock final response.';
      return true;
    }),
    executeSimpleStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agent_results = [{ agent_id: 'mock-agent-id', task_content: 'test', result: 'mock result', trace_id: 'mock-trace-id' }];
      o.plan_id = '';
      return true;
    }),
    executePlanningStrategy: vi.fn().mockResolvedValue(true),
    executePostProcessing: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.final_response = 'Mock post-processed response.';
      o.eval_id = 'mock-eval-id';
      return true;
    }),
    addStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.strategy_id = 'mock-strategy-id'; return true; }),
    handleDAGFailure: vi.fn().mockResolvedValue(true),
    getStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.strategies = []; return true; }),
    soStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.strategies = []; return true; }),
    updateStrategy: vi.fn().mockResolvedValue(true),
    configOrchestrationStrategy: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.config = {}; return true; }),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockExecutionAccess(opts?: { failExec?: boolean; failBuild?: boolean }) {
  return {
    buildAgentDAG: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      if (opts?.failBuild) { o.error = 'build failed'; return false; }
      o.agent_dag = { plan_id: 'mock-plan-id', total_agent_count: 1, agent_nodes: [], agent_edges: [] };
      o.task_agent_map = {};
      return true;
    }),
    execSingleAgent: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      if (opts?.failExec) { o.error = 'exec failed'; return false; }
      o.answer = 'Mock agent answer.';
      o.trace_id = 'mock-trace-id';
      o.iterations = 3;
      o.elapsed_ms = 150;
      return true;
    }),
    execDAG: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agent_results = [];
      o.total_elapsed_ms = 300;
      o.failed_count = 0;
      return true;
    }),
    execDAGAsync: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.job_id = 'mock-job-id'; return true; }),
    getDAGProgress: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
      o.progress = { work_id: 'mock-work-id', plan_id: '', total_tasks: 0, completed_tasks: 0, running_tasks: 0, failed_tasks: 0, pending_tasks: 0, node_details: [], total_elapsed_ms: 0 };
      return true;
    }),
    cancelExecution: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.cancelled_count = 0; return true; }),
    getExecQueueStatus: vi.fn().mockResolvedValue(true),
    configOrchestrationExecution: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.config = {}; return true; }),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockLLMAccess() {
  return {
    execLLM: vi.fn().mockImplementation(async (i: any, _c: any, o: any) => {
      const prompt = String((i?.prompt ?? ''));

      const complexIndicators = ['分析', '生成', '报告', '对比', '多步', '分解', '步骤', '数据', '处理'];
      const isComplex = complexIndicators.some((kw) => prompt.includes(kw));
      const complexity = isComplex ? 72 : 25;
      const strategy = complexity >= 50 ? 'PLANNING' : 'SIMPLE';

      o.result = JSON.stringify({
        complexity,
        strategy,
        reason: isComplex ? 'multi_step_task' : 'simple_query',
        plan: isComplex ? [{ step: 1, description: 'Analyze data' }, { step: 2, description: 'Generate report' }] : undefined,
      });
      o.usage = { total_tokens: isComplex ? 15 : 8 };
      return true;
    }),
    execLLMStream: vi.fn().mockResolvedValue(true),
    model: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.models = []; return true; }),
    insertModel: vi.fn().mockResolvedValue(true),
    updateModel: vi.fn().mockResolvedValue(true),
    deleteModel: vi.fn().mockResolvedValue(true),
    enableLLM: vi.fn().mockResolvedValue(true),
    closeLLM: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockPromptsAccess() {
  return {
    execPrompt: vi.fn().mockImplementation(async (i: any, _c: any, o: any) => {
      const vars = (i?.variables ?? {}) as Record<string, unknown>;
      o.prompt = `You are a strategy selector. Analyze the complexity of the user query.\nUser query: ${String(vars.user_query ?? '')}\nThreshold: ${String(vars.threshold ?? 50)}`;
      return true;
    }),
    soPrompt: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => { o.prompts = []; return true; }),
    insertPrompt: vi.fn().mockResolvedValue(true),
    updatePrompt: vi.fn().mockResolvedValue(true),
    deletePrompt: vi.fn().mockResolvedValue(true),
    configPrompts: vi.fn().mockResolvedValue(true),
    enablePrompts: vi.fn().mockResolvedValue(true),
    closePrompts: vi.fn().mockResolvedValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as any;
}

export function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}