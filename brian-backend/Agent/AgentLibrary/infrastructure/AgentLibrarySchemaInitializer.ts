import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  AGENT_TABLE, AGENT_USAGE_TABLE, AGENT_OPT_RULE_TABLE, AGENT_LIBRARY_CONFIG_TABLE,
} from '../domain/types';

export class AgentLibrarySchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
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
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_updated ON ${AGENT_TABLE}(updated)`);
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
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_opt_rule_days ON ${AGENT_OPT_RULE_TABLE}(days)`);

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_LIBRARY_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        prompt_template_id TEXT NOT NULL, similarity_threshold REAL NOT NULL DEFAULT 0.7,
        max_agent_count INTEGER NOT NULL DEFAULT 100
      )`,
    );

    await this.insertDefaultConfig();
  }

  private async insertDefaultConfig(): Promise<void> {
    const count = await this.relationDb.count(AGENT_LIBRARY_CONFIG_TABLE);
    if (count > 0) return;
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_LIBRARY_CONFIG_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'prompt_template_id', value: '' },
      { field: 'similarity_threshold', value: 0.7 },
      { field: 'max_agent_count', value: 100 },
    ]);
  }
}
