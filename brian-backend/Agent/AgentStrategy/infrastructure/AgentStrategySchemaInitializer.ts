import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { AGENT_STRATEGY_TABLE, AGENT_STRATEGY_CONFIG_TABLE, DEFAULT_STRATEGIES } from '../domain/types';

export class AgentStrategySchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_STRATEGY_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        strategy_id TEXT NOT NULL UNIQUE, strategy_label TEXT NOT NULL,
        suitable_complexity_min INTEGER NOT NULL, suitable_complexity_max INTEGER NOT NULL,
        suitable_domains TEXT NOT NULL, execution_rule TEXT NOT NULL,
        enable INTEGER NOT NULL DEFAULT 1
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_strategy_created ON ${AGENT_STRATEGY_TABLE}(created)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_strategy_enable ON ${AGENT_STRATEGY_TABLE}(enable)`,
    );
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_STRATEGY_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        default_strategy_id TEXT NOT NULL, match_prompt_template_id TEXT NOT NULL
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_strategy_config_created ON ${AGENT_STRATEGY_CONFIG_TABLE}(created)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_strategy_config_updated ON ${AGENT_STRATEGY_CONFIG_TABLE}(updated)`,
    );

    await this.insertDefaultStrategies();
    await this.insertDefaultConfig();
  }

  private async insertDefaultStrategies(): Promise<void> {
    const count = await this.relationDb.count(AGENT_STRATEGY_TABLE);
    if (count > 0) return;
    const now = IdGenerator.now();
    for (const s of DEFAULT_STRATEGIES) {
      const strategyId = IdGenerator.generate();
      await this.relationDb.insert(AGENT_STRATEGY_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'strategy_id', value: strategyId },
        { field: 'strategy_label', value: s.strategy_label },
        { field: 'suitable_complexity_min', value: s.suitable_complexity_min },
        { field: 'suitable_complexity_max', value: s.suitable_complexity_max },
        { field: 'suitable_domains', value: s.suitable_domains },
        { field: 'execution_rule', value: s.execution_rule },
        { field: 'enable', value: 1 },
      ]);
    }
  }

  private async insertDefaultConfig(): Promise<void> {
    const count = await this.relationDb.count(AGENT_STRATEGY_CONFIG_TABLE);
    if (count > 0) return;
    const rows = await this.relationDb.select(AGENT_STRATEGY_TABLE, { page: { current: 1, size: 1 } });
    const defaultId = rows[0] ? String(rows[0].strategy_id) : '';
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_STRATEGY_CONFIG_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'default_strategy_id', value: defaultId },
      { field: 'match_prompt_template_id', value: '' },
    ]);
  }
}
