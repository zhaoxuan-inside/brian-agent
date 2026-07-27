/**
 * @fileoverview PromptsProvider 表结构初始化。
 *
 * 创建 prompt_template、prompt_template_usage、prompts_config 三张表。
 * DDL 通过 RelationDBAccess.executeRaw 执行，依赖 RelationDBProvider 的底层数据库。
 *
 * 表结构依据 `PromptsProvider-PRD.md` 第 4 节。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  PROMPT_TEMPLATE_TABLE,
  PROMPT_TEMPLATE_USAGE_TABLE,
  PROMPTS_CONFIG_TABLE,
} from '../domain/types';

/**
 * PromptsProvider 表结构初始化器。
 *
 * 在 PromptsAccess 初始化时调用，确保所有表存在。
 */
export class PromptsSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层实例
   */
  constructor(private readonly relationDb: RelationDBAccess) {}

  /**
   * 创建所有 PromptsProvider 表（IF NOT EXISTS 语义，可安全重复调用）。
   */
  init(): void {
    // prompt_template 表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${PROMPT_TEMPLATE_TABLE}" (
        "id"                    TEXT    NOT NULL PRIMARY KEY,
        "created"               INTEGER NOT NULL,
        "updated"               INTEGER NOT NULL,
        "prompt_template_title" TEXT    NOT NULL,
        "prompt_template_brief" TEXT,
        "prompt_template"       TEXT    NOT NULL,
        "enable"                INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_TABLE}_created" ON "${PROMPT_TEMPLATE_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_TABLE}_updated" ON "${PROMPT_TEMPLATE_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_TABLE}_prompt_template_title" ON "${PROMPT_TEMPLATE_TABLE}" ("prompt_template_title")`,
    );

    // prompt_template_usage 表（按天使用次数统计）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${PROMPT_TEMPLATE_USAGE_TABLE}" (
        "id"                 TEXT    NOT NULL PRIMARY KEY,
        "created"            INTEGER NOT NULL,
        "updated"            INTEGER NOT NULL,
        "prompt_template_id" TEXT    NOT NULL,
        "usage_date"         TEXT    NOT NULL,
        "usage_count"        INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_USAGE_TABLE}_prompt_template_id" ON "${PROMPT_TEMPLATE_USAGE_TABLE}" ("prompt_template_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_USAGE_TABLE}_usage_date" ON "${PROMPT_TEMPLATE_USAGE_TABLE}" ("usage_date")`,
    );

    // prompts_config 配置表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${PROMPTS_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
