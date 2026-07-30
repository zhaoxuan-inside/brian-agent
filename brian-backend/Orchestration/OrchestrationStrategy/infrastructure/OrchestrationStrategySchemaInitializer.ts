import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';

const SIMPLE_JSONNODE_DEFINITION = JSON.stringify({
  version: '1.0',
  orchestration_id: 'builtin_simple',
  start_node: 'node_1',
  nodes: [
    {
      node_id: 'node_1',
      node_type: 'SAVE_USER_INPUT',
      params: { info_creator_role: 'REQUEST', update_work_status: 'PROCESSING' },
      next: 'node_2',
      on_error: 'node_8',
    },
    {
      node_id: 'node_2',
      node_type: 'BUILD_WORK_CONTEXT',
      params: { max_recent_works: 5, include_user_profile: true },
      next: 'node_3',
      on_error: 'node_8',
    },
    {
      node_id: 'node_3',
      node_type: 'BUILD_WORK_AGENT',
      params: { force_new: false },
      next: 'node_4',
      on_error: 'node_8',
    },
    {
      node_id: 'node_4',
      node_type: 'EXEC_AGENT',
      params: { agent_id_key: 'current_agent_id', save_result_key: 'agent_answer' },
      next: 'node_5',
      on_error: 'node_8',
    },
    {
      node_id: 'node_5',
      node_type: 'WRITE_RESULT',
      params: { agent_results_key: 'agent_results', save_response_key: 'final_response' },
      next: 'node_6',
      on_error: 'node_8',
    },
    {
      node_id: 'node_6',
      node_type: 'EVAL_RESULT',
      params: { agent_results_key: 'agent_results', final_response_key: 'final_response', async: true },
      next: 'node_7',
      on_error: 'node_8',
    },
    {
      node_id: 'node_7',
      node_type: 'SAVE_RESPONSE',
      params: { response_key: 'final_response', update_work_status: 'COMPLETED' },
      next: null,
      on_error: 'node_8',
    },
    {
      node_id: 'node_8',
      node_type: 'HANDLE_ERROR',
      params: { default_response: '抱歉，处理您的问题时出现了错误。', update_work_status: 'FAILED' },
      next: null,
    },
  ],
});

const PLANNING_JSONNODE_DEFINITION = JSON.stringify({
  version: '1.0',
  orchestration_id: 'builtin_planning',
  start_node: 'node_1',
  nodes: [
    {
      node_id: 'node_1',
      node_type: 'SAVE_USER_INPUT',
      params: { info_creator_role: 'REQUEST', update_work_status: 'PROCESSING' },
      next: 'node_2',
      on_error: 'node_12',
    },
    {
      node_id: 'node_2',
      node_type: 'BUILD_WORK_CONTEXT',
      params: { max_recent_works: 5, include_user_profile: true },
      next: 'node_3',
      on_error: 'node_12',
    },
    {
      node_id: 'node_3',
      node_type: 'PLAN_WORK',
      params: { save_plan_key: 'plan_result' },
      next: 'node_4',
      on_error: 'node_12',
    },
    {
      node_id: 'node_4',
      node_type: 'CONDITION',
      params: {
        field: 'task_count',
        operator: 'EQ',
        value: '1',
        true_next: 'node_6',
        false_next: 'node_5',
      },
      next: null,
      on_error: 'node_12',
    },
    {
      node_id: 'node_5',
      node_type: 'BUILD_AGENT_DAG',
      params: { plan_key: 'plan_result', save_agent_dag_key: 'agent_dag' },
      next: 'node_8',
      on_error: 'node_12',
    },
    {
      node_id: 'node_6',
      node_type: 'BUILD_WORK_AGENT',
      params: { force_new: false },
      next: 'node_7',
      on_error: 'node_12',
    },
    {
      node_id: 'node_7',
      node_type: 'EXEC_AGENT',
      params: { agent_id_key: 'current_agent_id', save_result_key: 'agent_answer' },
      next: 'node_9',
      on_error: 'node_12',
    },
    {
      node_id: 'node_8',
      node_type: 'EXEC_DAG',
      params: { agent_dag_key: 'agent_dag', max_concurrent: 1, save_results_key: 'agent_results' },
      next: 'node_9',
      on_error: 'node_12',
    },
    {
      node_id: 'node_9',
      node_type: 'WRITE_RESULT',
      params: { agent_results_key: 'agent_results', save_response_key: 'final_response' },
      next: 'node_10',
      on_error: 'node_12',
    },
    {
      node_id: 'node_10',
      node_type: 'EVAL_RESULT',
      params: { agent_results_key: 'agent_results', final_response_key: 'final_response', async: true },
      next: 'node_11',
      on_error: 'node_12',
    },
    {
      node_id: 'node_11',
      node_type: 'SAVE_RESPONSE',
      params: { response_key: 'final_response', update_work_status: 'COMPLETED' },
      next: null,
      on_error: 'node_12',
    },
    {
      node_id: 'node_12',
      node_type: 'HANDLE_ERROR',
      params: { default_response: '抱歉，处理您的问题时出现了错误。', update_work_status: 'FAILED' },
      next: null,
    },
  ],
});

export class OrchestrationStrategySchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_strategy (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        strategy_id TEXT NOT NULL UNIQUE,
        strategy_label TEXT NOT NULL UNIQUE,
        strategy_description TEXT NOT NULL,
        jsonnode_definition TEXT NOT NULL,
        enable INTEGER NOT NULL DEFAULT 1
      )
    `);

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orchestration_strategy_strategy_id ON orchestration_strategy(strategy_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orchestration_strategy_label ON orchestration_strategy(strategy_label)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_strategy_execution (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        execution_id TEXT NOT NULL UNIQUE,
        work_id TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        plan_id TEXT,
        plan_retry_count INTEGER NOT NULL DEFAULT 0,
        execution_status TEXT NOT NULL,
        error_info TEXT
      )
    `);

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orch_strat_exec_execution_id ON orchestration_strategy_execution(execution_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orch_strat_exec_work_id ON orchestration_strategy_execution(work_id)',
    );

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_orch_strat_exec_strategy_id ON orchestration_strategy_execution(strategy_id)',
    );

    const now = Date.now();
    const simpleId = IdGenerator.generate();
    const planningId = IdGenerator.generate();
    const simpleStrategyId = IdGenerator.generate();
    const planningStrategyId = IdGenerator.generate();

    this.relationDb.executeRaw(`
      INSERT OR IGNORE INTO orchestration_strategy
        (id, created, updated, strategy_id, strategy_label, strategy_description, jsonnode_definition, enable)
      VALUES
        ('${simpleId}', ${now}, ${now}, '${simpleStrategyId}', 'SIMPLE', 'Simple strategy: build a single WorkAgent and execute it via JSONNode orchestration', '${SIMPLE_JSONNODE_DEFINITION.replace(/'/g, "''")}', 1),
        ('${planningId}', ${now}, ${now}, '${planningStrategyId}', 'PLANNING', 'Planning strategy: decompose task via PlannerAgent, build Agent DAG and execute via JSONNode orchestration', '${PLANNING_JSONNODE_DEFINITION.replace(/'/g, "''")}', 1)
    `);
  }
}
