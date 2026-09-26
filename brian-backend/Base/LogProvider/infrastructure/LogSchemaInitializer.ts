import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { LOG_RULE_TABLE, LOG_CONFIG_TABLE, LOG_RECORD_TABLE } from '../domain/types';

export class LogSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LOG_RULE_TABLE}" (
        "id"       TEXT    NOT NULL PRIMARY KEY,
        "created"  INTEGER NOT NULL,
        "updated"  INTEGER NOT NULL,
        "source"   TEXT    NOT NULL,
        "method"   TEXT    NOT NULL,
        "enable"   INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.relationDb.executeRaw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_${LOG_RULE_TABLE}_source_method" ON "${LOG_RULE_TABLE}" ("source", "method")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LOG_RULE_TABLE}_source" ON "${LOG_RULE_TABLE}" ("source")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LOG_RULE_TABLE}_method" ON "${LOG_RULE_TABLE}" ("method")`,
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LOG_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LOG_RECORD_TABLE}" (
        "id"         TEXT    NOT NULL PRIMARY KEY,
        "created"    INTEGER NOT NULL,
        "updated"    INTEGER NOT NULL,
        "level"      TEXT    NOT NULL,
        "source"     TEXT    NOT NULL,
        "message"    TEXT    NOT NULL,
        "trace_id"   TEXT,
        "caller"     TEXT,
        "metadata"   TEXT,
        "elapsed_ms" INTEGER
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LOG_RECORD_TABLE}_created" ON "${LOG_RECORD_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LOG_RECORD_TABLE}_level" ON "${LOG_RECORD_TABLE}" ("level")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LOG_RECORD_TABLE}_source" ON "${LOG_RECORD_TABLE}" ("source")`,
    );

    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LOG_RECORD_TABLE}" ADD COLUMN "work_id" TEXT`,
      );
    } catch {  }

    try {
      this.relationDb.executeRaw(`ALTER TABLE "${LOG_RECORD_TABLE}" RENAME COLUMN "interact_id" TO "run_id"`);
    } catch {  }
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LOG_RECORD_TABLE}" ADD COLUMN "run_id" TEXT`,
      );
    } catch {  }
    try {
      this.relationDb.executeRaw(
        `CREATE INDEX IF NOT EXISTS "idx_${LOG_RECORD_TABLE}_work_id" ON "${LOG_RECORD_TABLE}" ("work_id")`,
      );
    } catch {  }
    try {
      this.relationDb.executeRaw(
        `DROP INDEX IF EXISTS "idx_${LOG_RECORD_TABLE}_interact_id"`,
      );
    } catch {  }
    try {
      this.relationDb.executeRaw(
        `CREATE INDEX IF NOT EXISTS "idx_${LOG_RECORD_TABLE}_run_id" ON "${LOG_RECORD_TABLE}" ("run_id")`,
      );
    } catch {  }
  }
}
