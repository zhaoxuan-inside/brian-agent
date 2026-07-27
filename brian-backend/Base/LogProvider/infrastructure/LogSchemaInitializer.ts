/**
 * @fileoverview LogProvider 表结构初始化。
 *
 * 日志记录不存储于数据库，只写入本地文件。
 * 数据库仅存储日志规则（log_rule）和配置项（log_config）。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { LOG_RULE_TABLE, LOG_CONFIG_TABLE } from '../domain/types';

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
  }
}
