import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { AGENT_STRATEGY_TABLE, AGENT_STRATEGY_CONFIG_TABLE, DEFAULT_STRATEGIES } from '../domain/types';

export class AgentStrategySchemaInitializer {
  private readonly relationDb: RelationDBAccess;

  constructor(relationDb: RelationDBAccess) {
    this.relationDb = relationDb;
  }

  init(): void {
    this.createAgentStrategyTable();
    this.createAgentStrategyConfigTable();
    this.insertDefaultStrategies();
    this.insertDefaultConfig();
  }

  private createAgentStrategyTable(): void {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_STRATEGY_TABLE} (
        id TEXT PRIMARY KEY,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        strategy_id TEXT NOT NULL UNIQUE,
        strategy_label TEXT NOT NULL,
        suitable_complexity_min INTEGER NOT NULL,
        suitable_complexity_max INTEGER NOT NULL,
        suitable_domains TEXT NOT NULL,
        execution_rule TEXT NOT NULL,
        enable INTEGER NOT NULL DEFAULT 1
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_strategy_created ON ${AGENT_STRATEGY_TABLE}(created)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_strategy_enable ON ${AGENT_STRATEGY_TABLE}(enable)`,
    );
  }

  private createAgentStrategyConfigTable(): void {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_STRATEGY_CONFIG_TABLE} (
        id TEXT PRIMARY KEY,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        default_strategy_id TEXT NOT NULL,
        match_prompt_template_id TEXT NOT NULL
      )`,
    );
  }

  private insertDefaultStrategies(): void {
    const existing = this.relationDb.queryRaw<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${AGENT_STRATEGY_TABLE}`,
    );
    if (existing[0]?.count > 0) return;

    const now = Math.floor(Date.now() / 1000);
    for (const s of DEFAULT_STRATEGIES) {
      const strategyId = IdGenerator.uuid();
      this.relationDb.executeRaw(
        `INSERT INTO ${AGENT_STRATEGY_TABLE} (id, created, updated, strategy_id, strategy_label, suitable_complexity_min, suitable_complexity_max, suitable_domains, execution_rule, enable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          IdGenerator.uuid(),
          now,
          now,
          strategyId,
          s.strategy_label,
          s.suitable_complexity_min,
          s.suitable_complexity_max,
          s.suitable_domains,
          s.execution_rule,
        ],
      );
    }
  }

  private insertDefaultConfig(): void {
    const existing = this.relationDb.queryRaw<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${AGENT_STRATEGY_CONFIG_TABLE}`,
    );
    if (existing[0]?.count > 0) return;

    const now = Math.floor(Date.now() / 1000);
    const firstStrategy = this.relationDb.queryRaw<{ strategy_id: string }>(
      `SELECT strategy_id FROM ${AGENT_STRATEGY_TABLE} LIMIT 1`,
    );
    const defaultId = firstStrategy[0]?.strategy_id ?? '';

    this.relationDb.executeRaw(
      `INSERT INTO ${AGENT_STRATEGY_CONFIG_TABLE} (id, created, updated, default_strategy_id, match_prompt_template_id) VALUES (?, ?, ?, ?, ?)`,
      [IdGenerator.uuid(), now, now, defaultId, ''],
    );
  }
}
