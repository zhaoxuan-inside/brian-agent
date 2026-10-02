import type { RelationDBAccess } from '@brian-agent/base';
import {
  LLM_CORE_CONFIG_TABLE,
  LLM_PROVIDER_QUOTA_TABLE,
} from '../domain/types';

export class LLMCoreSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    // ADR-012:配额表改名(幂等)
    try { this.relationDb.executeRaw(`ALTER TABLE "llm_provider_quota" RENAME TO "${LLM_PROVIDER_QUOTA_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_CORE_CONFIG_TABLE}" (
        "id"                   TEXT    NOT NULL PRIMARY KEY,
        "created"              INTEGER NOT NULL,
        "updated"              INTEGER NOT NULL,
        "regen_rate"           INTEGER NOT NULL DEFAULT 75,
        "similarity_threshold" REAL    NOT NULL DEFAULT 0.7,
        "prompt_template_id"   TEXT,
        "score_threshold"      INTEGER NOT NULL DEFAULT 90
      )
    `);

    try {
      this.relationDb.executeRaw(`ALTER TABLE "${LLM_CORE_CONFIG_TABLE}" ADD COLUMN "score_threshold" INTEGER NOT NULL DEFAULT 90`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${LLM_CORE_CONFIG_TABLE}" ADD COLUMN "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.8`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${LLM_CORE_CONFIG_TABLE}" ADD COLUMN "similarity_threshold" REAL NOT NULL DEFAULT 0.7`);
    } catch { /* 列已存在 */ }

    // ADR-012:agent_llm 退役(不再建表;存量数据由 AgentLibrary 迁移器搬入 agent_record.llm_id 后删表)

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

  }
}
