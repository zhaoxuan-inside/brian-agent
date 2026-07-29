import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { AGENT_EXECUTION_CONFIG_TABLE, AGENT_EXECUTION_TRACE_TABLE } from '../domain/types';

export class AgentExecutionSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_EXECUTION_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        think_prompt_template_id TEXT NOT NULL,
        reflect_prompt_template_id TEXT NOT NULL,
        answer_prompt_template_id TEXT NOT NULL,
        default_max_iterations INTEGER NOT NULL DEFAULT 10,
        async_worker_interval INTEGER NOT NULL DEFAULT 1000
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_execution_config_created ON ${AGENT_EXECUTION_CONFIG_TABLE}(created)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_execution_config_updated ON ${AGENT_EXECUTION_CONFIG_TABLE}(updated)`,
    );

    // agent_execution_trace 表：每次 execAgent 的完整轨迹持久化
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_EXECUTION_TRACE_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        trace_id TEXT NOT NULL UNIQUE, agent_id TEXT NOT NULL,
        start_time INTEGER NOT NULL, end_time INTEGER NOT NULL,
        iterations_json TEXT NOT NULL, total_token_usage INTEGER NOT NULL,
        answer TEXT
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_execution_trace_created ON ${AGENT_EXECUTION_TRACE_TABLE}(created)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_execution_trace_agent ON ${AGENT_EXECUTION_TRACE_TABLE}(agent_id)`,
    );

    const count = await this.relationDb.count(AGENT_EXECUTION_CONFIG_TABLE);
    if (count > 0) return;
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_EXECUTION_CONFIG_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'think_prompt_template_id', value: '' },
      { field: 'reflect_prompt_template_id', value: '' },
      { field: 'answer_prompt_template_id', value: '' },
      { field: 'default_max_iterations', value: 10 },
      { field: 'async_worker_interval', value: 1000 },
    ]);
  }
}