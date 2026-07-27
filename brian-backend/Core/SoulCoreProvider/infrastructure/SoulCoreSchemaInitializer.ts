/**
 * @fileoverview SoulCoreProvider 表结构初始化。
 *
 * 创建 soul_core_config、agent_soul、soul_opt_rule、soul_core_usage 四张表。
 * DDL 通过 RelationDBAccess.executeRaw 执行，依赖 RelationDBProvider 的底层数据库。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import {
  SOUL_CORE_CONFIG_TABLE,
  AGENT_SOUL_TABLE,
  SOUL_OPT_RULE_TABLE,
  SOUL_CORE_USAGE_TABLE,
} from '../domain/types';

/**
 * SoulCoreProvider 表结构初始化器。
 *
 * 在 SoulCoreAccess 初始化时调用，确保所有表存在。
 */
export class SoulCoreSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层实例
   */
  constructor(private readonly relationDb: RelationDBAccess) {}

  /**
   * 创建所有 SoulCoreProvider 表（IF NOT EXISTS 语义，可安全重复调用）。
   */
  init(): void {
    // soul_core_config 配置表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_CORE_CONFIG_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "regen_rate"          INTEGER NOT NULL DEFAULT 75,
        "prompt_template_id"  TEXT
      )
    `);

    // agent_soul 表（UNIQUE agent_id，每个 Agent 有且仅有一条 Soul 绑定）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${AGENT_SOUL_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "agent_id"  TEXT    NOT NULL UNIQUE,
        "soul_id"    TEXT    NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${AGENT_SOUL_TABLE}_agent_id" ON "${AGENT_SOUL_TABLE}" ("agent_id")`,
    );

    // soul_opt_rule 表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_OPT_RULE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "days"            INTEGER NOT NULL,
        "min_usage_count" INTEGER NOT NULL DEFAULT 0
      )
    `);

    // soul_core_usage 表（SoulCore 用量记录，独立于 Base 层 soul_usage）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_CORE_USAGE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "agent_soul_id"   TEXT    NOT NULL,
        "timestamp"       INTEGER NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_CORE_USAGE_TABLE}_agent_soul_id" ON "${SOUL_CORE_USAGE_TABLE}" ("agent_soul_id")`,
    );
  }
}
