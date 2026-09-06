/**
 * @fileoverview Session 模块表结构初始化（Runtime v2 · 阶段1）。
 *
 * 创建 runtime_session / runtime_message / runtime_message_part 三张表
 * （Session-PRD §2）。DDL 通过 RelationDBAccess.executeRaw 执行。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import {
  RUNTIME_SESSION_TABLE,
  RUNTIME_MESSAGE_TABLE,
  RUNTIME_MESSAGE_PART_TABLE,
  RUNTIME_SESSION_CONFIG_TABLE,
} from '../domain/types';

/**
 * SessionSchemaInitializer。
 */
export class SessionSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  /** 创建所有 Session 表（IF NOT EXISTS 语义，可安全重复调用） */
  init(): void {
    this.initSessionTable();
    this.initMessageTable();
    this.initPartTable();
    this.initConfigTable();
    this.migrateTokenCountColumn();
  }

  /**
   * 兼容迁移：runtime_message.token_usage → token_count（2026-09-05 统一命名，
   * 与 Part 表 token_count 同义同名；旧列不存在或已迁移时静默跳过）。
   */
  private migrateTokenCountColumn(): void {
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${RUNTIME_MESSAGE_TABLE}" RENAME COLUMN "token_usage" TO "token_count"`,
      );
    } catch {
      /* 全新库或已迁移 */
    }
  }

  /** runtime_session 表 */
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

  /** runtime_message 表 */
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

  /** runtime_message_part 表 */
  private initPartTable(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_MESSAGE_PART_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "message_id"  TEXT    NOT NULL,
        "run_id"      TEXT    NOT NULL DEFAULT '',
        "part_type"   TEXT    NOT NULL,
        "part_order"  INTEGER NOT NULL,
        "content"     TEXT    NOT NULL DEFAULT '',
        "tool_id"     TEXT    NOT NULL DEFAULT '',
        "input_json"  TEXT    NOT NULL DEFAULT '',
        "output_json" TEXT    NOT NULL DEFAULT '',
        "status"      TEXT    NOT NULL DEFAULT 'pending',
        "block_type"  TEXT    NOT NULL DEFAULT '',
        "block_meta"  TEXT    NOT NULL DEFAULT '',
        "token_count" INTEGER NOT NULL DEFAULT 0,
        "elapsed_ms"  INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_MESSAGE_PART_TABLE}_message" ON "${RUNTIME_MESSAGE_PART_TABLE}" ("message_id", "part_order")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_MESSAGE_PART_TABLE}_status" ON "${RUNTIME_MESSAGE_PART_TABLE}" ("status")`,
    );
  }

  /** runtime_session_config 配置表（config_key 主键，与各 Provider config 表形状一致） */
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
