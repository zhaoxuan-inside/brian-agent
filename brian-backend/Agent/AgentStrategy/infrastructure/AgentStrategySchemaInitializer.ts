import type { RelationDBAccess } from '@brian-agent/base';
import { AGENT_STRATEGY_TABLE, AGENT_STRATEGY_CONFIG_TABLE } from '../domain/types';

export class AgentStrategySchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    // ADR-012:组件定义表改名 + 去 strategy_id 冗余业务键(幂等)
    try { this.relationDb.executeRaw(`ALTER TABLE "agent_strategy" RENAME TO "${AGENT_STRATEGY_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }
    try {
      // UNIQUE NOT NULL 列无法 DROP——先把业务键同步进 id 再整表重建(引用方 default_strategy_id/agent.strategy_id 即新 id)
      this.relationDb.executeRaw(`UPDATE "${AGENT_STRATEGY_TABLE}" SET "id" = "strategy_id" WHERE "id" != "strategy_id"`);
      this.relationDb.rebuildTableWithoutColumn(AGENT_STRATEGY_TABLE, 'strategy_id');
    } catch { /* 列不存在或重建失败 */ }
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_STRATEGY_TABLE} (
        id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        strategy_label TEXT NOT NULL,
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
  }
}
