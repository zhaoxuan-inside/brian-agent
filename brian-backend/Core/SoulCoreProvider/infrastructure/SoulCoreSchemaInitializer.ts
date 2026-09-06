/**
 * @fileoverview SoulCoreProvider 表结构初始化。
 *
 * 创建 soul_core_config、agent_soul、soul_opt_rule、soul_core_usage 四张表。
 * DDL 通过 RelationDBAccess.executeRaw 执行，依赖 RelationDBProvider 的底层数据库。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import {
  SOUL_CORE_CONFIG_TABLE,
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
        "similarity_threshold" REAL   NOT NULL DEFAULT 0.7,
        "prompt_template_id"  TEXT,
        "llm_id"              TEXT
      )
    `);
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SOUL_CORE_CONFIG_TABLE}" ADD COLUMN "llm_id" TEXT`);
    } catch {
      // 字段已存在则忽略
    }

    // agent_soul 绑定表停止创建（绑定唯一事实源为 Agent 模块 agent 表 soul_id 列；旧库残留表不再读写）

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

    // soul_core_usage 表（评估依据；键为 (agent_id, soul_id)，与绑定解耦。
    // 旧键 agent_soul_id 引用已废弃的绑定表，检测到旧结构时重建，usage 历史重置）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_CORE_USAGE_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "agent_id"    TEXT    NOT NULL,
        "soul_id"     TEXT    NOT NULL,
        "usage_date"  TEXT    NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.migrateLegacyUsageTable();
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_CORE_USAGE_TABLE}_agent_soul" ON "${SOUL_CORE_USAGE_TABLE}" ("agent_id", "soul_id")`,
    );
  }

  /** 旧结构（agent_soul_id 键）检测 → 重建为新结构 */
  private migrateLegacyUsageTable(): void {
    const cols = this.relationDb.queryRaw<{ name: string }>(
      `PRAGMA table_info("${SOUL_CORE_USAGE_TABLE}")`, [],
    );
    if ((cols ?? []).some((c) => c.name === 'agent_soul_id')) {
      this.relationDb.executeRaw(`DROP TABLE "${SOUL_CORE_USAGE_TABLE}"`);
      this.relationDb.executeRaw(`
        CREATE TABLE "${SOUL_CORE_USAGE_TABLE}" (
          "id"          TEXT    NOT NULL PRIMARY KEY,
          "created"     INTEGER NOT NULL,
          "updated"     INTEGER NOT NULL,
          "agent_id"    TEXT    NOT NULL,
          "soul_id"     TEXT    NOT NULL,
          "usage_date"  TEXT    NOT NULL,
          "usage_count" INTEGER NOT NULL DEFAULT 1
        )
      `);
    }
  }
}
