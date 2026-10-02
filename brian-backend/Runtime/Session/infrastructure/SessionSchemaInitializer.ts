import type { RelationDBAccess } from '@brian-agent/base';
import {
  RUNTIME_SESSION_TABLE,
  RUNTIME_MESSAGE_TABLE,
  RUNTIME_MESSAGE_PART_TABLE,
  RUNTIME_SESSION_CONFIG_TABLE,
} from '../domain/types';

export class SessionSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    // ADR-012 迁移:旧表改名(幂等,旧表不存在或已改名时忽略)
    try { this.relationDb.executeRaw(`ALTER TABLE "runtime_session" RENAME TO "${RUNTIME_SESSION_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "runtime_message" RENAME TO "${RUNTIME_MESSAGE_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "runtime_message_part" RENAME TO "${RUNTIME_MESSAGE_PART_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }
    this.initSessionTable();
    this.initMessageTable();
    this.initPartTable();
    this.initConfigTable();
    this.migrateTokenCountColumn();
  }

  private migrateTokenCountColumn(): void {
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${RUNTIME_MESSAGE_TABLE}" RENAME COLUMN "token_usage" TO "token_count"`,
      );
    } catch {

    }
  }

  private initSessionTable(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_SESSION_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "session_key"  TEXT    NOT NULL UNIQUE,
        "title"        TEXT    NOT NULL DEFAULT '',
        "agent_def_id" TEXT    NOT NULL DEFAULT '',
        "status"       TEXT    NOT NULL DEFAULT 'active',
        "last_seq"     INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_SESSION_TABLE}_status" ON "${RUNTIME_SESSION_TABLE}" ("status")`,
    );
  }

  private initMessageTable(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_MESSAGE_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "session_id"  TEXT    NOT NULL,
        "run_id"      TEXT    NOT NULL DEFAULT '',
        "role"        TEXT    NOT NULL,
        "content"     TEXT    NOT NULL DEFAULT '',
        "seq"         INTEGER NOT NULL,
        "token_count" INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_MESSAGE_TABLE}_session" ON "${RUNTIME_MESSAGE_TABLE}" ("session_id", "seq")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_MESSAGE_TABLE}_run" ON "${RUNTIME_MESSAGE_TABLE}" ("run_id")`,
    );
  }

  private initPartTable(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_MESSAGE_PART_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "msg_id"      TEXT    NOT NULL,
        "run_id"      TEXT    NOT NULL DEFAULT '',
        "part_type"   TEXT    NOT NULL,
        "part_order"  INTEGER NOT NULL,
        "content"     TEXT    NOT NULL DEFAULT '',
        "tool_id"     TEXT    NOT NULL DEFAULT '',
        "execute_id"  TEXT    NOT NULL DEFAULT '',
        "status"      TEXT    NOT NULL DEFAULT 'pending',
        "block_type"  TEXT    NOT NULL DEFAULT '',
        "block_meta"  TEXT    NOT NULL DEFAULT '',
        "token_count" INTEGER NOT NULL DEFAULT 0,
        "elapsed_ms"  INTEGER NOT NULL DEFAULT 0
      )
    `);

    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${RUNTIME_MESSAGE_PART_TABLE}" RENAME COLUMN message_id TO msg_id`,
      );
    } catch {  }
    // ADR-012:tool part 去 input_json/output_json(I/O 唯一源为 execute_record,经 execute_id 关联)
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${RUNTIME_MESSAGE_PART_TABLE}" ADD COLUMN "execute_id" TEXT NOT NULL DEFAULT ''`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${RUNTIME_MESSAGE_PART_TABLE}" DROP COLUMN "input_json"`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${RUNTIME_MESSAGE_PART_TABLE}" DROP COLUMN "output_json"`);
    } catch {  }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_MESSAGE_PART_TABLE}_message" ON "${RUNTIME_MESSAGE_PART_TABLE}" ("msg_id", "part_order")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_MESSAGE_PART_TABLE}_status" ON "${RUNTIME_MESSAGE_PART_TABLE}" ("status")`,
    );
  }

  private initConfigTable(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_SESSION_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
