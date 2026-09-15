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
        "trace_id"      TEXT    NOT NULL DEFAULT ''
      )
    `);
    // ===== 修改后（2026-09-14 trace 源头治理）：runtime_run 增加 trace_id 列 ——
    // run 受理时持久化请求源头 traceId，供迟到补齐/恢复等任何延后路径按 run 反查
    // 原始 trace，杜绝"历史行盖上当轮 traceId"的污染（旧库自动迁移） =====
    try { this.relationDb.executeRaw(`ALTER TABLE "${RUNTIME_RUN_TABLE}" ADD COLUMN "trace_id" TEXT NOT NULL DEFAULT ''`); } catch { /* 列已存在 */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_RUN_TABLE}_session" ON "${RUNTIME_RUN_TABLE}" ("session_key", "created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_RUN_TABLE}_status" ON "${RUNTIME_RUN_TABLE}" ("status")`,
    );

    // ===== 修改后（2026-09-14 Span 框架）：旧统一计落库方案删除（runtime_run.metrics_json 列与
    // runtime_metrics 重复表）；时间线耗时唯一数据源 = 业务事件 payload 自带（span self 时间） =====

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
