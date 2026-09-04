/**
 * @fileoverview Runs 模块表结构初始化（Runtime v2 · 阶段3/4 前置）。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import { RUNTIME_RUN_TABLE, RUNTIME_RUNS_CONFIG_TABLE } from '../domain/types';

/**
 * RunsSchemaInitializer。
 */
export class RunsSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  /** 创建所有 Runs 表（IF NOT EXISTS 语义，可安全重复调用） */
  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_RUN_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "updated"       INTEGER NOT NULL,
        "session_key"   TEXT    NOT NULL,
        "session_id"    TEXT    NOT NULL DEFAULT '',
        "agent_def_id"  TEXT    NOT NULL DEFAULT '',
        "lane"          TEXT    NOT NULL DEFAULT 'session',
        "status"        TEXT    NOT NULL DEFAULT 'accepted',
        "stop_reason"   TEXT    NOT NULL DEFAULT '',
        "queue_mode"    TEXT    NOT NULL DEFAULT '',
        "budget_total"  INTEGER NOT NULL DEFAULT 60,
        "budget_used"   INTEGER NOT NULL DEFAULT 0,
        "accepted_at"   INTEGER NOT NULL DEFAULT 0,
        "started_at"    INTEGER,
        "settled_at"    INTEGER
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_RUN_TABLE}_session" ON "${RUNTIME_RUN_TABLE}" ("session_key", "created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_RUN_TABLE}_status" ON "${RUNTIME_RUN_TABLE}" ("status")`,
    );
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_RUNS_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
