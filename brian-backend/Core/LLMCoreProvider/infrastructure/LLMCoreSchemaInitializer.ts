import type { RelationDBAccess } from '@brian-agent/base';
import {
  LLM_CORE_CONFIG_TABLE,
  AGENT_LLM_TABLE,
  LLM_PROVIDER_QUOTA_TABLE,
  LLM_CORE_USAGE_TABLE,
} from '../domain/types';

export class LLMCoreSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {

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
