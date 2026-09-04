/**
 * @fileoverview Bus 模块表结构初始化（Runtime v2 · 阶段1）。
 *
 * 创建 runtime_event 持久化事件表（重放源）与 runtime_bus_config 配置表
 * （Bus-PRD §2 表设计 / Runtime-PRD §11）。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import { RUNTIME_EVENT_TABLE, RUNTIME_BUS_CONFIG_TABLE } from '../domain/types';

/**
 * BusSchemaInitializer。
 */
export class BusSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  /** 创建所有 Bus 表（IF NOT EXISTS 语义，可安全重复调用） */
  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_EVENT_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "session_key"  TEXT    NOT NULL,
        "run_id"       TEXT    NOT NULL DEFAULT '',
        "seq"          INTEGER NOT NULL,
        "event_type"   TEXT    NOT NULL,
        "payload_json" TEXT    NOT NULL DEFAULT '{}',
        "ts"           INTEGER NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_EVENT_TABLE}_session" ON "${RUNTIME_EVENT_TABLE}" ("session_key", "seq")`,
    );
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_BUS_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
