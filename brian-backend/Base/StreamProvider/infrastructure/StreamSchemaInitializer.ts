import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { STREAM_CONFIG_TABLE } from '../domain/types';

/** 流配置表初始化（事件表归 ObservabilityProvider/TaskEventSchemaInitializer，ADR-013） */
export class StreamSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${STREAM_CONFIG_TABLE}" (
        "id"                        TEXT    NOT NULL PRIMARY KEY,
        "sse_heartbeat_interval_ms" INTEGER NOT NULL DEFAULT 15000,
        "created"                   INTEGER NOT NULL,
        "updated"                   INTEGER NOT NULL
      )
    `);

    const rows = this.relationDb.queryRaw(`SELECT "id" FROM "${STREAM_CONFIG_TABLE}" LIMIT 1`);
    if (rows.length === 0) {
      const now = IdGenerator.now();
      this.relationDb.executeRaw(`
        INSERT INTO "${STREAM_CONFIG_TABLE}" (
          "id", "sse_heartbeat_interval_ms", "created", "updated"
        ) VALUES (
          'default_stream_config', 15000, ${now}, ${now}
        )
      `);
    }
  }
}
