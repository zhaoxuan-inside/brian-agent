import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  AGENT_TABLE, AGENT_USAGE_TABLE, AGENT_OPT_RULE_TABLE, AGENT_LIBRARY_CONFIG_TABLE,
} from '../domain/types';

export class AgentLibrarySchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        agent_id TEXT NOT NULL UNIQUE, agent_name TEXT NOT NULL, agent_type TEXT NOT NULL,
        strategy_id TEXT NOT NULL, llm_id TEXT NOT NULL, soul_id TEXT NOT NULL,
        task_signature TEXT NOT NULL, usage_count INTEGER NOT NULL DEFAULT 0,
        eval_score INTEGER NOT NULL DEFAULT 50, enable INTEGER NOT NULL DEFAULT 1
      )`,
    );
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_created ON ${AGENT_TABLE}(created)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_type ON ${AGENT_TABLE}(agent_type)`);

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_USAGE_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        agent_id TEXT NOT NULL, work_id TEXT NOT NULL, interact_id TEXT NOT NULL,
        usage_context TEXT
      )`,
    );
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_usage_created ON ${AGENT_USAGE_TABLE}(created)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_usage_agent ON ${AGENT_USAGE_TABLE}(agent_id)`);

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_OPT_RULE_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        days INTEGER NOT NULL DEFAULT 30, min_usage_count INTEGER NOT NULL,
        min_eval_score INTEGER NOT NULL
      )`,
    );
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_opt_rule_created ON ${AGENT_OPT_RULE_TABLE}(created)`);

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_LIBRARY_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        prompt_template_id TEXT NOT NULL, similarity_threshold REAL NOT NULL DEFAULT 0.7,
        max_agent_count INTEGER NOT NULL DEFAULT 100
      )`,
    );

    this.insertDefaultConfig();
  }

  private insertDefaultConfig(): void {
    const ex = this.relationDb.queryRaw<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${AGENT_LIBRARY_CONFIG_TABLE}`,
    );
    if (ex[0]?.count > 0) return;
    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${AGENT_LIBRARY_CONFIG_TABLE} (id, created, updated, prompt_template_id, similarity_threshold, max_agent_count) VALUES (?, ?, ?, ?, 0.7, 100)`,
      [IdGenerator.uuid(), now, now, ''],
    );
  }
}
