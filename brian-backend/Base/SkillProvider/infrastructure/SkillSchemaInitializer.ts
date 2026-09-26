import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  SKILL_TABLE,
  SKILL_USAGE_TABLE,
  SKILL_CONFIG_TABLE,
} from '../domain/types';

export class SkillSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "updated"       INTEGER NOT NULL,
        "name"          TEXT    NOT NULL,
        "skill_brief"   TEXT    NOT NULL,
        "skill_md"      TEXT    NOT NULL,
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
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_TABLE}_skill_brief" ON "${SKILL_TABLE}" ("skill_brief")`,
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_USAGE_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "skill_id"    TEXT    NOT NULL,
        "usage_date"  TEXT    NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_USAGE_TABLE}_skill_id" ON "${SKILL_USAGE_TABLE}" ("skill_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_USAGE_TABLE}_usage_date" ON "${SKILL_USAGE_TABLE}" ("usage_date")`,
    );

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
