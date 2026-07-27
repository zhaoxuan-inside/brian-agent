/**
 * @fileoverview SoulProvider 表结构初始化。
 *
 * 创建 soul、soul_usage、soul_config 三张表。
 * DDL 通过 RelationDBAccess.executeRaw 执行，依赖 RelationDBProvider 的底层数据库。
 *
 * 表结构依据 `SoulProvider-PRD.md` 第 4 节。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  SOUL_TABLE,
  SOUL_USAGE_TABLE,
  SOUL_CONFIG_TABLE,
} from '../domain/types';

/**
 * SoulProvider 表结构初始化器。
 *
 * 在 SoulAccess 初始化时调用，确保所有表存在。
 */
export class SoulSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层实例
   */
  constructor(private readonly relationDb: RelationDBAccess) {}

  /**
   * 创建所有 SoulProvider 表（IF NOT EXISTS 语义，可安全重复调用）。
   */
  init(): void {
    // soul 表
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

    // soul_usage 表（按天使用次数统计）
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

    // soul_config 配置表
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
