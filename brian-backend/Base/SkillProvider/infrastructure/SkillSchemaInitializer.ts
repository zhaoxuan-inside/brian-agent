import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  SKILL_TABLE,
  SKILL_EMBEDDING_TABLE,
  SKILL_EXAMPLE_EMBEDDING_TABLE,
  SKILL_CONFIG_TABLE,
} from '../domain/types';

export class SkillSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {

    // ADR-012:组件定义表改名 + 列规范化(幂等)
    try { this.relationDb.executeRaw(`ALTER TABLE "skill" RENAME TO "${SKILL_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "${SKILL_TABLE}" RENAME COLUMN "name" TO "title"`); } catch { /* 列已重命名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "${SKILL_TABLE}" RENAME COLUMN "skill_brief" TO "brief"`); } catch { /* 列已重命名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "${SKILL_TABLE}" RENAME COLUMN "skill_md" TO "content"`); } catch { /* 列已重命名 */ }

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "updated"       INTEGER NOT NULL,
        "title"         TEXT    NOT NULL,
        "brief"         TEXT    NOT NULL,
        "content"       TEXT    NOT NULL,
        "scripts"       TEXT,
        "references"    TEXT,
        "assets"        TEXT,
        "enable"        INTEGER NOT NULL DEFAULT 1,
        "system"        INTEGER NOT NULL DEFAULT 0
      )
    `);

    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${SKILL_TABLE}" ADD COLUMN "system" INTEGER NOT NULL DEFAULT 0`,
      );
    } catch {  }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_TABLE}_created" ON "${SKILL_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_TABLE}_updated" ON "${SKILL_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_TABLE}_brief" ON "${SKILL_TABLE}" ("brief")`,
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_EMBEDDING_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "skill_id"     TEXT    NOT NULL UNIQUE,
        "model"        TEXT    NOT NULL,
        "dimension"    INTEGER NOT NULL,
        "content_hash" TEXT    NOT NULL,
        "content"      TEXT    NOT NULL,
        "embedding"    TEXT    NOT NULL,
        "trace_id"     TEXT    NOT NULL DEFAULT ''
      )
    `);
    this.relationDb.executeRaw(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_${SKILL_EMBEDDING_TABLE}_skill_id" ON "${SKILL_EMBEDDING_TABLE}" ("skill_id")
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_EXAMPLE_EMBEDDING_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "skill_id"     TEXT    NOT NULL,
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
        `ALTER TABLE "${SKILL_EXAMPLE_EMBEDDING_TABLE}" ADD COLUMN "example_type" TEXT NOT NULL DEFAULT 'positive'`,
      );
    } catch { /* column exists */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_EXAMPLE_EMBEDDING_TABLE}_skill_id" ON "${SKILL_EXAMPLE_EMBEDDING_TABLE}" ("skill_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_EXAMPLE_EMBEDDING_TABLE}_skill_type" ON "${SKILL_EXAMPLE_EMBEDDING_TABLE}" ("skill_id", "example_type")`,
    );

    // ADR-012: skill_usage 表已由 TraceBase 的 usage_event_record / skill_usage_org 取代，不再建表

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
