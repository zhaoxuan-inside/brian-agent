/**
 * @fileoverview Runs 模块表结构初始化（Runtime v2 · 阶段3/4 前置）。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import { RUNTIME_RUN_TABLE, RUNTIME_METRICS_TABLE, RUNTIME_RUNS_CONFIG_TABLE } from '../domain/types';

/**
 * RunsSchemaInitializer。
 */
export class RunsSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  // ===== 原始方法（保留作为参考）=====
  // init(): void {
  //   this.relationDb.executeRaw(`
  //     CREATE TABLE IF NOT EXISTS "${RUNTIME_RUN_TABLE}" (
  //       "id"            TEXT    NOT NULL PRIMARY KEY,
  //       "created"       INTEGER NOT NULL,
  //       "updated"       INTEGER NOT NULL,
  //       "session_key"   TEXT    NOT NULL,
  //       "session_id"    TEXT    NOT NULL DEFAULT '',
  //       "agent_def_id"  TEXT    NOT NULL DEFAULT '',
  //       "lane"          TEXT    NOT NULL DEFAULT 'session',
  //       "status"        TEXT    NOT NULL DEFAULT 'accepted',
  //       "stop_reason"   TEXT    NOT NULL DEFAULT '',
  //       "queue_mode"    TEXT    NOT NULL DEFAULT '',
  //       "budget_total"  INTEGER NOT NULL DEFAULT 60,
  //       "budget_used"   INTEGER NOT NULL DEFAULT 0,
  //       "accepted_at"   INTEGER NOT NULL DEFAULT 0,
  //       "started_at"    INTEGER,
  //       "settled_at"    INTEGER
  //     )
  //   `);
  //   this.relationDb.executeRaw(
  //     `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_RUN_TABLE}_session" ON "${RUNTIME_RUN_TABLE}" ("session_key", "created")`,
  //   );
  //   this.relationDb.executeRaw(
  //     `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_RUN_TABLE}_status" ON "${RUNTIME_RUN_TABLE}" ("status")`,
  //   );
  //   this.relationDb.executeRaw(`
  //     CREATE TABLE IF NOT EXISTS "${RUNTIME_RUNS_CONFIG_TABLE}" (
  //       "config_key"   TEXT    NOT NULL PRIMARY KEY,
  //       "config_value" TEXT    NOT NULL,
  //       "value_type"   TEXT    NOT NULL,
  //       "description"  TEXT,
  //       "updated"      INTEGER NOT NULL
  //     )
  //   `);
  // }

  // ===== 修改后的方法 =====
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
        "settled_at"    INTEGER,
        "metrics_json"  TEXT    NOT NULL DEFAULT '{}'
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_RUN_TABLE}_session" ON "${RUNTIME_RUN_TABLE}" ("session_key", "created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_RUN_TABLE}_status" ON "${RUNTIME_RUN_TABLE}" ("status")`,
    );

    // 存量表增加 metrics_json 列
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${RUNTIME_RUN_TABLE}" ADD COLUMN "metrics_json" TEXT NOT NULL DEFAULT '{}'`,
      );
    } catch { /* 列已存在 */ }

    // runtime_metrics 表：落地问答全流程计时 metrics（以 <层名>.<模块名>.<类名>.<方法名>.start/end 为 key）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_METRICS_TABLE}" (
        "id"                 TEXT    NOT NULL PRIMARY KEY,
        "created"            INTEGER NOT NULL,
        "updated"            INTEGER NOT NULL,
        "run_id"             TEXT    NOT NULL,
        "session_key"        TEXT    NOT NULL,
        "trace_id"           TEXT    NOT NULL DEFAULT '',
        "timings_json"       TEXT    NOT NULL DEFAULT '{}',
        "total_duration_ms"  INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_METRICS_TABLE}_run" ON "${RUNTIME_METRICS_TABLE}" ("run_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_METRICS_TABLE}_session" ON "${RUNTIME_METRICS_TABLE}" ("session_key")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_METRICS_TABLE}_trace" ON "${RUNTIME_METRICS_TABLE}" ("trace_id")`,
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
