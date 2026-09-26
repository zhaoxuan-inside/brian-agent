import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  SOUL_TABLE,
  SOUL_USAGE_TABLE,
  SOUL_CONFIG_TABLE,
} from '../domain/types';

export class SoulSchemaInitializer {
  

  constructor(private readonly relationDb: RelationDBAccess) {}

  

  init(): void {
    
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "soul_content" TEXT    NOT NULL,
        "soul_brief"   TEXT    NOT NULL,
        "soul_usage"   TEXT    NOT NULL,
        "enable"       INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_TABLE}_created" ON "${SOUL_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_TABLE}_updated" ON "${SOUL_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_TABLE}_soul_content" ON "${SOUL_TABLE}" ("soul_content")`,
    );

    
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_USAGE_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "soul_id"     TEXT    NOT NULL,
        "usage_date"  TEXT    NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_USAGE_TABLE}_soul_id" ON "${SOUL_USAGE_TABLE}" ("soul_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_USAGE_TABLE}_usage_date" ON "${SOUL_USAGE_TABLE}" ("usage_date")`,
    );

    
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
