import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  LLM_PROVIDER_TABLE,
  LLM_CACHE_TABLE,
  LLM_AVAILABLE_TABLE,
  LLM_USAGE_TABLE,
  LLM_CALL_LOG_TABLE,
  LLM_CONFIG_TABLE,
} from '../domain/types';

type TolerantDdl = { sql: string; ignoreReason: string };

type DdlEntry = string | TolerantDdl;

export class LLMSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  private readonly ddlStatements: readonly DdlEntry[] = [

    `
      CREATE TABLE IF NOT EXISTS "${LLM_PROVIDER_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "llm_provider_url"    TEXT    NOT NULL,
        "llm_provider_title"  TEXT    NOT NULL,
        "llm_provider_brief"  TEXT,
        "enable"              INTEGER NOT NULL DEFAULT 0
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_PROVIDER_TABLE}_created" ON "${LLM_PROVIDER_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_PROVIDER_TABLE}_updated" ON "${LLM_PROVIDER_TABLE}" ("updated")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_PROVIDER_TABLE}_llm_provider_title" ON "${LLM_PROVIDER_TABLE}" ("llm_provider_title")`,
    { sql: `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "api_key" TEXT`, ignoreReason: 'column already exists' },

    { sql: `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "quota_tokens_per_day" INTEGER DEFAULT 0`, ignoreReason: 'column already exists' },
    { sql: `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "quota_tokens_per_week" INTEGER DEFAULT 0`, ignoreReason: 'column already exists' },
    { sql: `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "quota_tokens_per_month" INTEGER DEFAULT 0`, ignoreReason: 'column already exists' },
    { sql: `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "quota_calls_per_day" INTEGER DEFAULT 0`, ignoreReason: 'column already exists' },
    { sql: `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "quota_calls_per_week" INTEGER DEFAULT 0`, ignoreReason: 'column already exists' },
    { sql: `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "quota_calls_per_month" INTEGER DEFAULT 0`, ignoreReason: 'column already exists' },
    { sql: `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "models_fetched_at" INTEGER`, ignoreReason: 'column already exists' },
    { sql: `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "models_path" TEXT`, ignoreReason: 'column already exists' },
    { sql: `ALTER TABLE "${LLM_PROVIDER_TABLE}" ADD COLUMN "chat_path" TEXT`, ignoreReason: 'column already exists' },

    `
      CREATE TABLE IF NOT EXISTS "${LLM_CACHE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "llm_provider_id" TEXT    NOT NULL,
        "llm_title"       TEXT    NOT NULL,
        "llm_brief"       TEXT,
        "llm_param"       TEXT
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_CACHE_TABLE}_created" ON "${LLM_CACHE_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_CACHE_TABLE}_updated" ON "${LLM_CACHE_TABLE}" ("updated")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_CACHE_TABLE}_llm_provider_id" ON "${LLM_CACHE_TABLE}" ("llm_provider_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_CACHE_TABLE}_llm_title" ON "${LLM_CACHE_TABLE}" ("llm_title")`,
    { sql: `ALTER TABLE "${LLM_CACHE_TABLE}" ADD COLUMN "features" TEXT`, ignoreReason: 'column already exists' },
    { sql: `ALTER TABLE "${LLM_CACHE_TABLE}" ADD COLUMN "max_tokens" INTEGER DEFAULT 0`, ignoreReason: 'column already exists' },
    { sql: `ALTER TABLE "${LLM_CACHE_TABLE}" ADD COLUMN "llm_param" TEXT`, ignoreReason: 'column already exists' },

    `
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
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_created" ON "${LLM_AVAILABLE_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_updated" ON "${LLM_AVAILABLE_TABLE}" ("updated")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_llm_provider_id" ON "${LLM_AVAILABLE_TABLE}" ("llm_provider_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_llm_title" ON "${LLM_AVAILABLE_TABLE}" ("llm_title")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_llm_type" ON "${LLM_AVAILABLE_TABLE}" ("llm_type")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_${LLM_AVAILABLE_TABLE}_provider_title" ON "${LLM_AVAILABLE_TABLE}" ("llm_provider_id", "llm_title")`,
    { sql: `ALTER TABLE "${LLM_AVAILABLE_TABLE}" ADD COLUMN "is_default" INTEGER DEFAULT 0`, ignoreReason: 'column already exists' },
    { sql: `ALTER TABLE "${LLM_AVAILABLE_TABLE}" RENAME COLUMN "llm_usage" TO "llm_type"`, ignoreReason: 'already renamed' },
    { sql: `ALTER TABLE "${LLM_AVAILABLE_TABLE}" ADD COLUMN "model_usage" TEXT DEFAULT ''`, ignoreReason: 'column already exists' },

    `
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
    `,
    { sql: `ALTER TABLE "${LLM_USAGE_TABLE}" RENAME COLUMN "llm_enable_id" TO "llm_available_id"`, ignoreReason: 'already renamed' },
    { sql: `ALTER TABLE "${LLM_USAGE_TABLE}" ADD COLUMN "input_tokens" INTEGER NOT NULL DEFAULT 0`, ignoreReason: '已存在 input_tokens 列时忽略' },
    { sql: `ALTER TABLE "${LLM_USAGE_TABLE}" ADD COLUMN "output_tokens" INTEGER NOT NULL DEFAULT 0`, ignoreReason: '已存在 output_tokens 列时忽略' },
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_created" ON "${LLM_USAGE_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_updated" ON "${LLM_USAGE_TABLE}" ("updated")`,
    { sql: `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_llm_available_id" ON "${LLM_USAGE_TABLE}" ("llm_available_id")`, ignoreReason: 'column may not exist yet' },
    { sql: `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_llm_enable_id" ON "${LLM_USAGE_TABLE}" ("llm_enable_id")`, ignoreReason: 'old column, may not exist' },
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_USAGE_TABLE}_usage_date" ON "${LLM_USAGE_TABLE}" ("usage_date")`,

    `
      CREATE TABLE IF NOT EXISTS "${LLM_CALL_LOG_TABLE}" (
        "id"               TEXT    NOT NULL PRIMARY KEY,
        "created"          INTEGER NOT NULL,
        "updated"          INTEGER NOT NULL,
        "llm_available_id" TEXT    NOT NULL,
        "session_id"       TEXT    NOT NULL DEFAULT '',
        "run_id"      TEXT    NOT NULL DEFAULT '',
        "work_id"          TEXT    NOT NULL DEFAULT '',
        "input_tokens"     INTEGER NOT NULL DEFAULT 0,
        "output_tokens"    INTEGER NOT NULL DEFAULT 0,
        "duration_ms"      INTEGER NOT NULL DEFAULT 0
      )
    `,
    { sql: `ALTER TABLE "${LLM_CALL_LOG_TABLE}" ADD COLUMN "updated" INTEGER NOT NULL DEFAULT 0`, ignoreReason: '已存在 updated 列时忽略（存量库迁移：CREATE TABLE IF NOT EXISTS 不会补列）' },

    { sql: `ALTER TABLE "${LLM_CALL_LOG_TABLE}" ADD COLUMN "caller" TEXT NOT NULL DEFAULT ''`, ignoreReason: '列已存在' },
    { sql: `ALTER TABLE "${LLM_CALL_LOG_TABLE}" ADD COLUMN "llm_title" TEXT NOT NULL DEFAULT ''`, ignoreReason: '列已存在' },
    { sql: `ALTER TABLE "${LLM_CALL_LOG_TABLE}" ADD COLUMN "llm_type" TEXT NOT NULL DEFAULT ''`, ignoreReason: '列已存在' },
    { sql: `ALTER TABLE "${LLM_CALL_LOG_TABLE}" ADD COLUMN "status" TEXT NOT NULL DEFAULT ''`, ignoreReason: '列已存在' },
    { sql: `ALTER TABLE "${LLM_CALL_LOG_TABLE}" ADD COLUMN "error_code" TEXT NOT NULL DEFAULT ''`, ignoreReason: '列已存在' },
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_CALL_LOG_TABLE}_session" ON "${LLM_CALL_LOG_TABLE}" ("session_id")`,

    { sql: `ALTER TABLE "${LLM_CALL_LOG_TABLE}" RENAME COLUMN "interact_id" TO "run_id"`, ignoreReason: '列已重命名或不存在' },
    { sql: `DROP INDEX IF EXISTS "idx_${LLM_CALL_LOG_TABLE}_interact"`, ignoreReason: '旧索引可能不存在' },
    { sql: `DROP INDEX IF EXISTS "idx_${LLM_CALL_LOG_TABLE}_interact_id"`, ignoreReason: '旧索引可能不存在' },
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_CALL_LOG_TABLE}_run" ON "${LLM_CALL_LOG_TABLE}" ("run_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_CALL_LOG_TABLE}_work" ON "${LLM_CALL_LOG_TABLE}" ("work_id")`,

    `
      CREATE TABLE IF NOT EXISTS "${LLM_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `,
  ];

  init(): void {
    for (const ddl of this.ddlStatements) {
      if (typeof ddl === 'string') {
        this.relationDb.executeRaw(ddl);
        continue;
      }
      try {
        this.relationDb.executeRaw(ddl.sql);
      } catch {  }
    }
  }
}
