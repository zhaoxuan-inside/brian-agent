import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { AGENT_EVALUATION_TABLE, EVOLUTOR_AGENT_CONFIG_TABLE } from '../domain/types';

export class EvolutorAgentSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_EVALUATION_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        eval_id TEXT NOT NULL UNIQUE, agent_id TEXT NOT NULL, eval_type TEXT NOT NULL,
        work_id TEXT NOT NULL, interact_id TEXT NOT NULL,
        scores TEXT NOT NULL, suggestions TEXT, need_optimize INTEGER NOT NULL DEFAULT 0
      )`,
    );
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_eval_agent ON ${AGENT_EVALUATION_TABLE}(agent_id)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_eval_type ON ${AGENT_EVALUATION_TABLE}(eval_type)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_eval_created ON ${AGENT_EVALUATION_TABLE}(created)`);

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${EVOLUTOR_AGENT_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        eval_work_prompt_template_id TEXT NOT NULL,
        eval_write_prompt_template_id TEXT NOT NULL,
        optimize_threshold INTEGER NOT NULL DEFAULT 60,
        eval_frequency_threshold INTEGER NOT NULL DEFAULT 5,
        eval_schedule_interval_ms INTEGER NOT NULL DEFAULT 3600000,
        eval_batch_size INTEGER NOT NULL DEFAULT 20
      )`,
    );

    const ex = this.relationDb.queryRaw<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${EVOLUTOR_AGENT_CONFIG_TABLE}`,
    );
    if (ex[0]?.count > 0) return;
    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${EVOLUTOR_AGENT_CONFIG_TABLE} (id, created, updated, eval_work_prompt_template_id, eval_write_prompt_template_id, optimize_threshold, eval_frequency_threshold, eval_schedule_interval_ms, eval_batch_size) VALUES (?, ?, ?, ?, ?, 60, 5, 3600000, 20)`,
      [IdGenerator.uuid(), now, now, '', ''],
    );
  }
}
