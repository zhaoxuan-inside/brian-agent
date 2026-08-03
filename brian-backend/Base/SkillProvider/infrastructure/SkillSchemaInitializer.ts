/**
 * @fileoverview SkillProvider 表结构初始化。
 *
 * 创建 skill、skill_usage、skill_config 三张表。
 * DDL 通过 RelationDBAccess.executeRaw 执行，依赖 RelationDBProvider 的底层数据库。
 *
 * 表结构依据 `SkillProvider-PRD.md` 第 4 节。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  SKILL_TABLE,
  SKILL_USAGE_TABLE,
  SKILL_CONFIG_TABLE,
} from '../domain/types';

/**
 * SkillProvider 表结构初始化器。
 *
 * 在 SkillAccess 初始化时调用，确保所有表存在。
 */
export class SkillSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层实例
   */
  constructor(private readonly relationDb: RelationDBAccess) {}

  /**
   * 创建所有 SkillProvider 表（IF NOT EXISTS 语义，可安全重复调用）。
   */
  init(): void {
    // skill 表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "updated"       INTEGER NOT NULL,
        "name"          TEXT    NOT NULL,
        "skill_brief"   TEXT    NOT NULL,
        "skill_md"      TEXT    NOT NULL,
        "scripts"       TEXT,
        "references"    TEXT,
        "assets"        TEXT,
        "enable"        INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_TABLE}_created" ON "${SKILL_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_TABLE}_updated" ON "${SKILL_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_TABLE}_skill_brief" ON "${SKILL_TABLE}" ("skill_brief")`,
    );

    // skill_usage 表（按天使用次数统计）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_USAGE_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "skill_id"    TEXT    NOT NULL,
        "usage_date"  TEXT    NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_USAGE_TABLE}_skill_id" ON "${SKILL_USAGE_TABLE}" ("skill_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_USAGE_TABLE}_usage_date" ON "${SKILL_USAGE_TABLE}" ("usage_date")`,
    );

    // skill_config 配置表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
