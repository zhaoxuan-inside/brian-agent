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
  LLM_CACHE_TABLE,
  LLM_AVAILABLE_TABLE,
  LLM_USAGE_TABLE,
  LLM_CALL_LOG_TABLE,
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
    // quota columns
    const quotaCols = ['quota_tokens_per_day', 'quota_tokens_per_week', 'quota_tokens_per_month',
      'quota_calls_per_day', 'quota_calls_per_week', 'quota_calls_per_month'];
    for (const col of quotaCols) {
      try {
        this.relationDb.executeRaw(
          `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "${col}" INTEGER DEFAULT 0`,
        );
      } catch {
        /* column already exists */
      }
    }
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "models_fetched_at" INTEGER`,
      );
    } catch {
      /* column already exists */
    }
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "models_path" TEXT`,
      );
    } catch {
      /* column already exists */
    }
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "chat_path" TEXT`,
      );
    } catch {
      /* column already exists */
    }

    // llm_cache 表（从提供商 API 获取的模型缓存）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_CACHE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "llm_provider_id" TEXT    NOT NULL,
        "llm_title"       TEXT    NOT NULL,
        "llm_brief"       TEXT,
        "llm_param"       TEXT
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_CACHE_TABLE}_created" ON "${LLM_CACHE_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_CACHE_TABLE}_updated" ON "${LLM_CACHE_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_CACHE_TABLE}_llm_provider_id" ON "${LLM_CACHE_TABLE}" ("llm_provider_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_CACHE_TABLE}_llm_title" ON "${LLM_CACHE_TABLE}" ("llm_title")`,
    );
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_CACHE_TABLE}" ADD COLUMN "features" TEXT`,
      );
    } catch { /* column already exists */ }
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_CACHE_TABLE}" ADD COLUMN "max_tokens" INTEGER DEFAULT 0`,
      );
    } catch { /* column already exists */ }
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_CACHE_TABLE}" ADD COLUMN "llm_param" TEXT`,
      );
    } catch { /* column already exists */ }

    // llm_available 表（系统可用模型）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_AVAILABLE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "llm_provider_id" TEXT    NOT NULL,
        "llm_title"       TEXT    NOT NULL,
        "llm_brief"       TEXT,
        "llm_type"        TEXT    NOT NULL DEFAULT 'text',
        "enable"          INTEGER NOT NULL DEFAULT 1,
        "is_default"      INTEGER NOT NULL DEFAULT 0,
        "max_tokens"      INTEGER DEFAULT 0,
        "model_usage"     TEXT    DEFAULT ''
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_created" ON "${LLM_AVAILABLE_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_updated" ON "${LLM_AVAILABLE_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_llm_provider_id" ON "${LLM_AVAILABLE_TABLE}" ("llm_provider_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_llm_title" ON "${LLM_AVAILABLE_TABLE}" ("llm_title")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_llm_type" ON "${LLM_AVAILABLE_TABLE}" ("llm_type")`,
    );
    this.relationDb.executeRaw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_provider_title" ON "${LLM_AVAILABLE_TABLE}" ("llm_provider_id", "llm_title")`,
    );
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_AVAILABLE_TABLE}" ADD COLUMN "is_default" INTEGER DEFAULT 0`,
      );
    } catch { /* column already exists */ }
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_AVAILABLE_TABLE}" RENAME COLUMN "llm_usage" TO "llm_type"`,
      );
    } catch { /* already renamed */ }
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_AVAILABLE_TABLE}" ADD COLUMN "model_usage" TEXT DEFAULT ''`,
      );
    } catch { /* column already exists */ }

    // llm_usage 表（按天使用次数统计）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_USAGE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "llm_available_id" TEXT   NOT NULL,
        "usage_date"      TEXT    NOT NULL,
        "usage_count"     INTEGER NOT NULL DEFAULT 0,
        "input_tokens"    INTEGER NOT NULL DEFAULT 0,
        "output_tokens"   INTEGER NOT NULL DEFAULT 0
      )
    `);
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_USAGE_TABLE}" RENAME COLUMN "llm_enable_id" TO "llm_available_id"`,
      );
    } catch { /* already renamed */ }
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_USAGE_TABLE}" ADD COLUMN "input_tokens" INTEGER NOT NULL DEFAULT 0`,
      );
    } catch { /* 已存在 input_tokens 列时忽略 */ }
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_USAGE_TABLE}" ADD COLUMN "output_tokens" INTEGER NOT NULL DEFAULT 0`,
      );
    } catch { /* 已存在 output_tokens 列时忽略 */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_created" ON "${LLM_USAGE_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_updated" ON "${LLM_USAGE_TABLE}" ("updated")`,
    );
    try {
      this.relationDb.executeRaw(
        `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_llm_available_id" ON "${LLM_USAGE_TABLE}" ("llm_available_id")`,
      );
    } catch { /* column may not exist yet */ }
    try {
      this.relationDb.executeRaw(
        `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_llm_enable_id" ON "${LLM_USAGE_TABLE}" ("llm_enable_id")`,
      );
    } catch { /* old column, may not exist */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_usage_date" ON "${LLM_USAGE_TABLE}" ("usage_date")`,
    );

    // llm_call_log 表（Token 明细账：每次 LLM 调用一条，只记提供商返回真实值）
    // 注意：newRecord() 恒补 id/created/updated 三列，DDL 必须包含 updated 列，否则每次 insert 静默失败、明细账恒空
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_CALL_LOG_TABLE}" (
        "id"               TEXT    NOT NULL PRIMARY KEY,
        "created"          INTEGER NOT NULL,
        "updated"          INTEGER NOT NULL,
        "llm_available_id" TEXT    NOT NULL,
        "session_id"       TEXT    NOT NULL DEFAULT '',
        "interact_id"      TEXT    NOT NULL DEFAULT '',
        "work_id"          TEXT    NOT NULL DEFAULT '',
        "input_tokens"     INTEGER NOT NULL DEFAULT 0,
        "output_tokens"    INTEGER NOT NULL DEFAULT 0,
        "duration_ms"      INTEGER NOT NULL DEFAULT 0
      )
    `);
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${LLM_CALL_LOG_TABLE}" ADD COLUMN "updated" INTEGER NOT NULL DEFAULT 0`,
      );
    } catch { /* 已存在 updated 列时忽略（存量库迁移：CREATE TABLE IF NOT EXISTS 不会补列） */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_CALL_LOG_TABLE}_session" ON "${LLM_CALL_LOG_TABLE}" ("session_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_CALL_LOG_TABLE}_interact" ON "${LLM_CALL_LOG_TABLE}" ("interact_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_CALL_LOG_TABLE}_work" ON "${LLM_CALL_LOG_TABLE}" ("work_id")`,
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
