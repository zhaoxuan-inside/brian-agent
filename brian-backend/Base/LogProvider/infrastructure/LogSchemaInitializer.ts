/**
 * @fileoverview LogProvider 表结构初始化。
 *
 * 日志记录持久化于 SQLite（log_record 表），不写本地文件。
 * 数据库同时存储日志规则（log_rule）和配置项（log_config）。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { LOG_RULE_TABLE, LOG_CONFIG_TABLE, LOG_RECORD_TABLE } from '../domain/types';

export class LogSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    // log_rule 表（日志规则表，控制哪些模块/方法的日志被记录）
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

    // log_config 配置表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LOG_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);

    // log_record 表（日志持久化存储，支持 SQLite 查询）
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
    } catch { /* 列已存在 */ }
    // ===== 2026-09-14 三级维度最终定名：原 interact_id 列废弃，存量库 RENAME 为 run_id；新库直接补 run_id 列 =====
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${LOG_RECORD_TABLE}" RENAME COLUMN "interact_id" TO "run_id"`);
    } catch { /* 已重命名或原列不存在 */ }
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LOG_RECORD_TABLE}" ADD COLUMN "run_id" TEXT`,
      );
    } catch { /* 列已存在 */ }
    try {
      this.relationDb.executeRaw(
        `CREATE INDEX IF NOT EXISTS "idx_${LOG_RECORD_TABLE}_work_id" ON "${LOG_RECORD_TABLE}" ("work_id")`,
      );
    } catch { /* ignore */ }
    try {
      this.relationDb.executeRaw(
        `DROP INDEX IF EXISTS "idx_${LOG_RECORD_TABLE}_interact_id"`,
      );
    } catch { /* ignore */ }
    try {
      this.relationDb.executeRaw(
        `CREATE INDEX IF NOT EXISTS "idx_${LOG_RECORD_TABLE}_run_id" ON "${LOG_RECORD_TABLE}" ("run_id")`,
      );
    } catch { /* ignore */ }
  }
}
