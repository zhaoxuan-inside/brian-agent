/**
 * @fileoverview SkillCoreProvider 表结构初始化。
 *
 * 创建 skill_core_config、agent_skill、skill_opt_rule、skill_usage 四张表。
 * DDL 通过 RelationDBAccess.executeRaw 执行，依赖 RelationDBProvider 的底层数据库。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import {
  SKILL_CORE_CONFIG_TABLE,
  AGENT_SKILL_TABLE,
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
        "prompt_template_id"  TEXT    NOT NULL
      )
    `);

    // agent_skill 表（唯一约束：agent_id + skill_id）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${AGENT_SKILL_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "agent_id"    TEXT    NOT NULL,
        "skill_id"    TEXT    NOT NULL,
        UNIQUE("agent_id", "skill_id")
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${AGENT_SKILL_TABLE}_agent_id" ON "${AGENT_SKILL_TABLE}" ("agent_id")`,
    );

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

    // skill_usage 表（记录每次 agent_skill 的使用）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_USAGE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "agent_skill_id"  TEXT    NOT NULL,
        "timestamp"       INTEGER NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_USAGE_TABLE}_agent_skill_id" ON "${SKILL_USAGE_TABLE}" ("agent_skill_id")`,
    );
  }
}
