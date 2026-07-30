import type { RelationDBAccess } from '@brian-agent/base';

export class JSONNodeSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_jsonnode_trace (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        orchestration_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        node_type TEXT NOT NULL,
        status TEXT NOT NULL,
        elapsed_ms INTEGER NOT NULL,
        error_info TEXT
      )
    `);

    this.relationDb.executeRaw(
      'CREATE INDEX IF NOT EXISTS idx_jsonnode_trace_orchestration_id ON orchestration_jsonnode_trace(orchestration_id)',
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS orchestration_node_type (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        node_type TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        handler_module TEXT NOT NULL,
        is_builtin INTEGER NOT NULL DEFAULT 0
      )
    `);

    this.relationDb.executeRaw(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_node_type_unique ON orchestration_node_type(node_type)',
    );
  }
}
