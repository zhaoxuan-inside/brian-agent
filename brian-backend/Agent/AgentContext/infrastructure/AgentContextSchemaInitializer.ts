import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  AGENT_CONTEXT_CONFIG_TABLE,
  DEFAULT_MAX_CONTEXT_ITEMS,
  DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE,
} from '../domain/types';

export class AgentContextSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_CONTEXT_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        max_context_items INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_CONTEXT_ITEMS},
        enable_snapshot_persistence INTEGER NOT NULL DEFAULT ${DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE}
      )`,
    );
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_CONTEXT_CONFIG_TABLE} ADD COLUMN max_context_items INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_CONTEXT_ITEMS}`);
    } catch { /* 列已存在 */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_${AGENT_CONTEXT_CONFIG_TABLE}_created ON ${AGENT_CONTEXT_CONFIG_TABLE}(created)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_${AGENT_CONTEXT_CONFIG_TABLE}_updated ON ${AGENT_CONTEXT_CONFIG_TABLE}(updated)`,
    );

    const count = await this.relationDb.count(AGENT_CONTEXT_CONFIG_TABLE);
    if (count > 0) return;
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_CONTEXT_CONFIG_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'max_context_items', value: DEFAULT_MAX_CONTEXT_ITEMS },
      { field: 'enable_snapshot_persistence', value: DEFAULT_ENABLE_SNAPSHOT_PERSISTENCE },
    ]);
  }
}
