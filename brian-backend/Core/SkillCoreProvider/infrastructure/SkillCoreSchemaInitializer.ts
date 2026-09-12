/**
 * @fileoverview SkillCoreProvider 表结构初始化。
 *
 * 创建 skill_core_config、agent_skill、skill_opt_rule、skill_usage 四张表。
 * DDL 通过 RelationDBAccess.executeRaw 执行，依赖 RelationDBProvider 的底层数据库。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import {
  SKILL_CORE_CONFIG_TABLE,
    SKILL_OPT_RULE_TABLE,
  SKILL_USAGE_TABLE,
} from '../domain/types';

/**
 * SkillCoreProvider 表结构初始化器。
 *
 * 在 SkillCoreAccess 初始化时调用，确保所有表存在。
 */
export class SkillCoreSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层实例
   */
  constructor(private readonly relationDb: RelationDBAccess) {}

  /**
   * 创建所有 SkillCoreProvider 表（IF NOT EXISTS 语义，可安全重复调用）。
   */
  init(): void {
    // skill_core_config 表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_CORE_CONFIG_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "regen_rate"          INTEGER NOT NULL DEFAULT 75,
        "similarity_threshold" REAL   NOT NULL DEFAULT 0.7,
        "prompt_template_id"  TEXT,
        "score_threshold"     INTEGER NOT NULL DEFAULT 90,
        "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.8
      )
    `);
    // ===== 2026-09-11 迁移：匹配缓存 TTL / 容量（老库补列） =====
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SKILL_CORE_CONFIG_TABLE}" ADD COLUMN "match_cache_ttl_ms" INTEGER NOT NULL DEFAULT 600000`);
    } catch { /* column already exists */ }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SKILL_CORE_CONFIG_TABLE}" ADD COLUMN "match_cache_capacity" INTEGER NOT NULL DEFAULT 500`);
    } catch { /* column already exists */ }
    // ===== 2026-09-11 迁移：排序采纳阈值与任务向量命中阈值（老库补列） =====
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SKILL_CORE_CONFIG_TABLE}" ADD COLUMN "score_threshold" INTEGER NOT NULL DEFAULT 90`);
    } catch { /* column already exists */ }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SKILL_CORE_CONFIG_TABLE}" ADD COLUMN "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.8`);
    } catch { /* column already exists */ }

    // agent_skill 绑定表停止创建（绑定唯一事实源为 Agent 模块 agent 表 skill_ids_json；
    // 旧库残留表不再读写）

    // skill_opt_rule 表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_OPT_RULE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "days"            INTEGER NOT NULL,
        "min_usage_count" INTEGER NOT NULL
      )
    `);

    // skill_core_usage 表（评估依据；键为 (agent_id, skill_id)，与绑定解耦。
    // 2026-09-05 由 'skill_usage' 更名，该表名归还 Base SkillProvider，消除双 schema 共表冲突）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_USAGE_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "agent_id"    TEXT    NOT NULL,
        "skill_id"    TEXT    NOT NULL,
        "usage_date"  TEXT    NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_USAGE_TABLE}_agent_skill" ON "${SKILL_USAGE_TABLE}" ("agent_id", "skill_id")`,
    );
  }
}
