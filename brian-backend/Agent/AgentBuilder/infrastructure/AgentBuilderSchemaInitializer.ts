import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { AGENT_BUILDER_CONFIG_TABLE } from '../domain/types';

export class AgentBuilderSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_BUILDER_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        task_analysis_prompt_template_id TEXT NOT NULL,
        default_strategy_id TEXT NOT NULL,
        auto_optimize INTEGER NOT NULL DEFAULT 1
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_builder_config_created ON ${AGENT_BUILDER_CONFIG_TABLE}(created)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_agent_builder_config_updated ON ${AGENT_BUILDER_CONFIG_TABLE}(updated)`,
    );
    const count = await this.relationDb.count(AGENT_BUILDER_CONFIG_TABLE);
    if (count > 0) return;
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_BUILDER_CONFIG_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'task_analysis_prompt_template_id', value: '' },
      { field: 'default_strategy_id', value: '' },
      { field: 'auto_optimize', value: 1 },
    ]);
  }
}
