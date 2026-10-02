import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  SOUL_TABLE,
  SOUL_EMBEDDING_TABLE,
  SOUL_EXAMPLE_EMBEDDING_TABLE,
  SOUL_CONFIG_TABLE,
} from '../domain/types';

export class SoulSchemaInitializer {
  

  constructor(private readonly relationDb: RelationDBAccess) {}

  

  init(): void {
    // ADR-012: 旧列 soul_content/soul_brief → content/brief(幂等),必须先于建表与索引
    try { this.relationDb.executeRaw(`ALTER TABLE "soul" RENAME TO "${SOUL_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "${SOUL_TABLE}" RENAME COLUMN "soul_content" TO "content"`); } catch { /* 已重命名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "${SOUL_TABLE}" RENAME COLUMN "soul_brief" TO "brief"`); } catch { /* 已重命名 */ }

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "title"        TEXT    NOT NULL DEFAULT '',
        "brief"        TEXT    NOT NULL,
        "content"      TEXT    NOT NULL,
        "soul_usage"   TEXT    NOT NULL DEFAULT '',
        "enable"       INTEGER NOT NULL DEFAULT 1
      )
    `);
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${SOUL_TABLE}" ADD COLUMN "title" TEXT NOT NULL DEFAULT ''`,
      );
    } catch { /* column exists */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_TABLE}_created" ON "${SOUL_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_TABLE}_updated" ON "${SOUL_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_TABLE}_title" ON "${SOUL_TABLE}" ("title")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_TABLE}_content" ON "${SOUL_TABLE}" ("content")`,
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_EMBEDDING_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "soul_id"      TEXT    NOT NULL UNIQUE,
        "model"        TEXT    NOT NULL,
        "dimension"    INTEGER NOT NULL,
        "content_hash" TEXT    NOT NULL,
        "content"      TEXT    NOT NULL,
        "embedding"    TEXT    NOT NULL,
        "trace_id"     TEXT    NOT NULL DEFAULT ''
      )
    `);
    this.relationDb.executeRaw(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_${SOUL_EMBEDDING_TABLE}_soul_id" ON "${SOUL_EMBEDDING_TABLE}" ("soul_id")
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_EXAMPLE_EMBEDDING_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "soul_id"      TEXT    NOT NULL,
        "example_text" TEXT    NOT NULL,
        "example_type" TEXT    NOT NULL DEFAULT 'positive',
        "model"        TEXT    NOT NULL,
        "dimension"    INTEGER NOT NULL,
        "content_hash" TEXT    NOT NULL,
        "embedding"    TEXT    NOT NULL,
        "trace_id"     TEXT    NOT NULL DEFAULT ''
      )
    `);
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${SOUL_EXAMPLE_EMBEDDING_TABLE}" ADD COLUMN "example_type" TEXT NOT NULL DEFAULT 'positive'`,
      );
    } catch { /* column exists */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_EXAMPLE_EMBEDDING_TABLE}_soul_id" ON "${SOUL_EXAMPLE_EMBEDDING_TABLE}" ("soul_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_EXAMPLE_EMBEDDING_TABLE}_soul_type" ON "${SOUL_EXAMPLE_EMBEDDING_TABLE}" ("soul_id", "example_type")`,
    );

    // ADR-012: soul_usage 表已由 TraceBase 的 usage_event_record / soul_usage_org 取代，不再建表

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
