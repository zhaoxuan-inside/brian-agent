import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { AGENT_BUILDER_CONFIG_TABLE } from '../domain/types';

export class AgentBuilderSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_BUILDER_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        task_analysis_prompt_template_id TEXT NOT NULL,
        default_strategy_id TEXT NOT NULL,
        auto_optimize INTEGER NOT NULL DEFAULT 1
      )`,
    );
    this.insertDefaultConfig();
  }

  private insertDefaultConfig(): void {
    const ex = this.relationDb.queryRaw<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${AGENT_BUILDER_CONFIG_TABLE}`,
    );
    if (ex[0]?.count > 0) return;
    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${AGENT_BUILDER_CONFIG_TABLE} (id, created, updated, task_analysis_prompt_template_id, default_strategy_id, auto_optimize) VALUES (?, ?, ?, ?, ?, 1)`,
      [IdGenerator.uuid(), now, now, '', ''],
    );
  }
}
