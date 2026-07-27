/**
 * @fileoverview LLMCoreProvider 表结构初始化。
 *
 * 创建 llm_core_config、agent_llm、llm_provider_quota、llm_core_usage 四张表。
 * DDL 通过 RelationDBAccess.executeRaw 执行，依赖 RelationDBProvider 的底层数据库。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import {
  LLM_CORE_CONFIG_TABLE,
  AGENT_LLM_TABLE,
  LLM_PROVIDER_QUOTA_TABLE,
  LLM_CORE_USAGE_TABLE,
} from '../domain/types';

/**
 * LLMCoreProvider 表结构初始化器。
 *
 * 在 LLMCoreAccess 初始化时调用，确保所有表存在。
 */
export class LLMCoreSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层实例
   */
  constructor(private readonly relationDb: RelationDBAccess) {}

  /**
   * 创建所有 LLMCoreProvider 表（IF NOT EXISTS 语义，可安全重复调用）。
   */
  init(): void {
    // llm_core_config 配置表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_CORE_CONFIG_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "regen_rate"          INTEGER NOT NULL DEFAULT 75,
        "prompt_template_id"  TEXT
      )
    `);

    // agent_llm 表（Agent 与 LLM 的绑定关系）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${AGENT_LLM_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "agent_id"  TEXT    NOT NULL UNIQUE,
        "llm_id"    TEXT    NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${AGENT_LLM_TABLE}_agent_id" ON "${AGENT_LLM_TABLE}" ("agent_id")`,
    );

    // llm_provider_quota 表（LLM 提供商配额限制）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_PROVIDER_QUOTA_TABLE}" (
        "id"                        TEXT    NOT NULL PRIMARY KEY,
        "created"                   INTEGER NOT NULL,
        "updated"                   INTEGER NOT NULL,
        "llm_provider_id"           TEXT    NOT NULL UNIQUE,
        "quota_tokens_per_day"      INTEGER NOT NULL DEFAULT 0,
        "quota_tokens_per_week"     INTEGER NOT NULL DEFAULT 0,
        "quota_tokens_per_month"    INTEGER NOT NULL DEFAULT 0,
        "quota_calls_per_day"       INTEGER NOT NULL DEFAULT 0,
        "quota_calls_per_week"      INTEGER NOT NULL DEFAULT 0,
        "quota_calls_per_month"     INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_${LLM_PROVIDER_QUOTA_TABLE}_llm_provider_id" ON "${LLM_PROVIDER_QUOTA_TABLE}" ("llm_provider_id")`,
    );

    // llm_core_usage 表（LLM 用量记录，用于配额统计）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_CORE_USAGE_TABLE}" (
        "id"                TEXT    NOT NULL PRIMARY KEY,
        "created"           INTEGER NOT NULL,
        "llm_provider_id"   TEXT    NOT NULL,
        "timestamp"         INTEGER NOT NULL,
        "tokens_used"       INTEGER NOT NULL,
        "call_count"        INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_CORE_USAGE_TABLE}_llm_provider_id" ON "${LLM_CORE_USAGE_TABLE}" ("llm_provider_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${LLM_CORE_USAGE_TABLE}_timestamp" ON "${LLM_CORE_USAGE_TABLE}" ("timestamp")`,
    );
  }
}
