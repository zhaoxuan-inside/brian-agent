import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { AGENT_EXECUTION_CONFIG_TABLE } from '../domain/types';

export class AgentExecutionSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
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
    const ex = this.relationDb.queryRaw<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${AGENT_EXECUTION_CONFIG_TABLE}`,
    );
    if (ex[0]?.count > 0) return;
    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${AGENT_EXECUTION_CONFIG_TABLE} (id, created, updated, think_prompt_template_id, reflect_prompt_template_id, answer_prompt_template_id, default_max_iterations, async_worker_interval) VALUES (?, ?, ?, ?, ?, ?, 10, 1000)`,
      [IdGenerator.uuid(), now, now, '', '', ''],
    );
  }
}
