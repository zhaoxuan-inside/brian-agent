/**
 * @fileoverview StreamProvider 表结构与默认配置初始化。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { STREAM_CONFIG_TABLE, STREAM_EVENT_TABLE } from '../domain/types';

export class StreamSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${STREAM_CONFIG_TABLE}" (
        "id"                        TEXT    NOT NULL PRIMARY KEY,
        "sse_heartbeat_interval_ms" INTEGER NOT NULL DEFAULT 15000,
        "chunk_min_chars"           INTEGER NOT NULL DEFAULT 2,
        "chunk_max_chars"           INTEGER NOT NULL DEFAULT 5,
        "created"                   INTEGER NOT NULL,
        "updated"                   INTEGER NOT NULL
      )
    `);

    // stream_event 表（事件事实源：持久化/审计/断线恢复重放；2026-09-05 起由 StreamProvider 承载，
    // 取代 Runtime/Bus 的 runtime_event）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${STREAM_EVENT_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "session_key"  TEXT    NOT NULL,
        "run_id"       TEXT    NOT NULL DEFAULT '',
        "seq"          INTEGER NOT NULL,
        "event_type"   TEXT    NOT NULL,
        "payload_json" TEXT    NOT NULL DEFAULT '{}',
        "ts"           INTEGER NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${STREAM_EVENT_TABLE}_session" ON "${STREAM_EVENT_TABLE}" ("session_key", "seq")`,
    );

    // 初始化默认单行配置
    const rows = this.relationDb.queryRaw(`SELECT "id" FROM "${STREAM_CONFIG_TABLE}" LIMIT 1`);
    if (rows.length === 0) {
      const now = IdGenerator.now();
      this.relationDb.executeRaw(`
        INSERT INTO "${STREAM_CONFIG_TABLE}" (
          "id", "sse_heartbeat_interval_ms", "chunk_min_chars", "chunk_max_chars", "created", "updated"
        ) VALUES (
          'default_stream_config', 15000, 2, 5, ${now}, ${now}
        )
      `);
    }
  }
}
