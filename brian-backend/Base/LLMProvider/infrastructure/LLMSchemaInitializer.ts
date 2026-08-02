/**
 * @fileoverview LLMProvider 表结构初始化。
 *
 * 创建 llm_provider、llm_model、llm_enable、llm_usage、llm_config 五张表。
 * DDL 通过 RelationDBAccess.executeRaw 执行，依赖 RelationDBProvider 的底层数据库。
 *
 * 表结构依据 `LLMProvider-PRD.md` 第 4 节。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  LLM_PROVIDER_TABLE,
  LLM_MODEL_TABLE,
  LLM_ENABLE_TABLE,
  LLM_USAGE_TABLE,
  LLM_CONFIG_TABLE,
} from '../domain/types';

/**
 * LLMProvider 表结构初始化器。
 *
 * 在 LLMAccess 初始化时调用，确保所有表存在。
 */
export class LLMSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层实例
   */
  constructor(private readonly relationDb: RelationDBAccess) {}

  /**
   * 创建所有 LLMProvider 表（IF NOT EXISTS 语义，可安全重复调用）。
   */
  init(): void {
    // llm_provider 表（LLM 提供商）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_PROVIDER_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "llm_provider_url"    TEXT    NOT NULL,
        "llm_provider_title"  TEXT    NOT NULL,
        "llm_provider_brief"  TEXT,
        "enable"              INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_PROVIDER_TABLE}_created" ON "${LLM_PROVIDER_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_PROVIDER_TABLE}_updated" ON "${LLM_PROVIDER_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_PROVIDER_TABLE}_llm_provider_title" ON "${LLM_PROVIDER_TABLE}" ("llm_provider_title")`,
    );
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "api_key" TEXT`,
      );
    } catch {
      /* column already exists */
    }

    // llm_model 表（从提供商 API 获取的模型列表）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_MODEL_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "llm_provider_id" TEXT    NOT NULL,
        "llm_title"       TEXT    NOT NULL,
        "llm_brief"       TEXT
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_MODEL_TABLE}_created" ON "${LLM_MODEL_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_MODEL_TABLE}_updated" ON "${LLM_MODEL_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_MODEL_TABLE}_llm_provider_id" ON "${LLM_MODEL_TABLE}" ("llm_provider_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_MODEL_TABLE}_llm_title" ON "${LLM_MODEL_TABLE}" ("llm_title")`,
    );

    // llm_enable 表（启用列表）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_ENABLE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "llm_provider_id" TEXT    NOT NULL,
        "llm_title"       TEXT    NOT NULL,
        "llm_brief"       TEXT,
        "llm_usage"       TEXT    NOT NULL,
        "enable"          INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_ENABLE_TABLE}_created" ON "${LLM_ENABLE_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_ENABLE_TABLE}_updated" ON "${LLM_ENABLE_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_ENABLE_TABLE}_llm_provider_id" ON "${LLM_ENABLE_TABLE}" ("llm_provider_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_ENABLE_TABLE}_llm_title" ON "${LLM_ENABLE_TABLE}" ("llm_title")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_ENABLE_TABLE}_llm_usage" ON "${LLM_ENABLE_TABLE}" ("llm_usage")`,
    );

    // llm_usage 表（按天使用次数统计）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_USAGE_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "updated"       INTEGER NOT NULL,
        "llm_enable_id" TEXT    NOT NULL,
        "usage_date"    TEXT    NOT NULL,
        "usage_count"   INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_created" ON "${LLM_USAGE_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_updated" ON "${LLM_USAGE_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_llm_enable_id" ON "${LLM_USAGE_TABLE}" ("llm_enable_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_usage_date" ON "${LLM_USAGE_TABLE}" ("usage_date")`,
    );

    // llm_config 配置表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
