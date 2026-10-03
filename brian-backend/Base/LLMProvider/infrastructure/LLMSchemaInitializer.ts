import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import {
  LLM_PROVIDER_TABLE,
  LLM_PROVIDER_KEY_TABLE,
  LLM_CACHE_TABLE,
  LLM_AVAILABLE_TABLE,
  LLM_CALL_RECORD_TABLE,
  LLM_CALL_DETAIL_TABLE,
  LLM_CONFIG_TABLE,
} from '../domain/types';
import { PROVIDER_CATALOG, PROVIDER_CATALOG_VERSION, toProviderRecord } from '../domain/providerCatalog';

/** 内置提供商目录的版本标记键（llm_config_record） */
const PROVIDER_CATALOG_VERSION_KEY = 'provider_catalog_version';

type TolerantDdl = { sql: string; ignoreReason: string };

type DdlEntry = string | TolerantDdl;

export class LLMSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  private readonly ddlStatements: readonly DdlEntry[] = [
    // ADR-012: 旧 llm_call_log 改名(全新库或已改名时忽略)
    // ADR-012:组件定义表改名(幂等)
    { sql: `ALTER TABLE "llm_provider" RENAME TO "${LLM_PROVIDER_TABLE}"`, ignoreReason: '旧表不存在或已改名' },
    { sql: `ALTER TABLE "llm_available" RENAME TO "${LLM_AVAILABLE_TABLE}"`, ignoreReason: '旧表不存在或已改名' },

    { sql: `ALTER TABLE "llm_call_log" RENAME TO "${LLM_CALL_RECORD_TABLE}"`, ignoreReason: '旧表不存在(全新库)或已改名' },
    { sql: `ALTER TABLE "${LLM_CALL_RECORD_TABLE}" ADD COLUMN "trace_id" TEXT NOT NULL DEFAULT ''`, ignoreReason: '列已存在' },

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

    `
      CREATE TABLE IF NOT EXISTS "${LLM_PROVIDER_KEY_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "llm_provider_id" TEXT    NOT NULL,
        "api_key"         TEXT    NOT NULL DEFAULT ''
      )
    `,
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_${LLM_PROVIDER_KEY_TABLE}_provider" ON "${LLM_PROVIDER_KEY_TABLE}" ("llm_provider_id")`,

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
    { sql: `UPDATE "${LLM_AVAILABLE_TABLE}" SET "llm_type" = 'multimodal' WHERE "llm_type" = 'vision'`, ignoreReason: '历史 vision 值迁移为 multimodal（R7 值域收敛）' },

    `
      CREATE TABLE IF NOT EXISTS "${LLM_CALL_RECORD_TABLE}" (
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
    { sql: `ALTER TABLE "${LLM_CALL_RECORD_TABLE}" ADD COLUMN "updated" INTEGER NOT NULL DEFAULT 0`, ignoreReason: '已存在 updated 列时忽略（存量库迁移：CREATE TABLE IF NOT EXISTS 不会补列）' },

    { sql: `ALTER TABLE "${LLM_CALL_RECORD_TABLE}" ADD COLUMN "caller" TEXT NOT NULL DEFAULT ''`, ignoreReason: '列已存在' },
    { sql: `ALTER TABLE "${LLM_CALL_RECORD_TABLE}" ADD COLUMN "llm_title" TEXT NOT NULL DEFAULT ''`, ignoreReason: '列已存在' },
    { sql: `ALTER TABLE "${LLM_CALL_RECORD_TABLE}" ADD COLUMN "llm_type" TEXT NOT NULL DEFAULT ''`, ignoreReason: '列已存在' },
    { sql: `ALTER TABLE "${LLM_CALL_RECORD_TABLE}" ADD COLUMN "status" TEXT NOT NULL DEFAULT ''`, ignoreReason: '列已存在' },
    { sql: `ALTER TABLE "${LLM_CALL_RECORD_TABLE}" ADD COLUMN "error_code" TEXT NOT NULL DEFAULT ''`, ignoreReason: '列已存在' },
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_CALL_RECORD_TABLE}_session" ON "${LLM_CALL_RECORD_TABLE}" ("session_id")`,

    { sql: `ALTER TABLE "${LLM_CALL_RECORD_TABLE}" RENAME COLUMN "interact_id" TO "run_id"`, ignoreReason: '列已重命名或不存在' },
    { sql: `DROP INDEX IF EXISTS "idx_${LLM_CALL_RECORD_TABLE}_interact"`, ignoreReason: '旧索引可能不存在' },
    { sql: `DROP INDEX IF EXISTS "idx_${LLM_CALL_RECORD_TABLE}_interact_id"`, ignoreReason: '旧索引可能不存在' },
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_CALL_RECORD_TABLE}_run" ON "${LLM_CALL_RECORD_TABLE}" ("run_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_CALL_RECORD_TABLE}_work" ON "${LLM_CALL_RECORD_TABLE}" ("work_id")`,

    `
      CREATE TABLE IF NOT EXISTS "${LLM_CALL_DETAIL_TABLE}" (
        "id"               TEXT    NOT NULL PRIMARY KEY,
        "created"          INTEGER NOT NULL,
        "updated"          INTEGER NOT NULL,
        "trace_id"         TEXT    NOT NULL DEFAULT '',
        "llm_call_id"      TEXT    NOT NULL,
        "llm_available_id" TEXT    NOT NULL DEFAULT '',
        "session_id"       TEXT    NOT NULL DEFAULT '',
        "run_id"           TEXT    NOT NULL DEFAULT '',
        "work_id"          TEXT    NOT NULL DEFAULT '',
        "input"            TEXT    NOT NULL DEFAULT '',
        "input_length"     INTEGER NOT NULL DEFAULT 0,
        "output"           TEXT    NOT NULL DEFAULT '',
        "output_length"    INTEGER NOT NULL DEFAULT 0
      )
    `,
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_${LLM_CALL_DETAIL_TABLE}_call" ON "${LLM_CALL_DETAIL_TABLE}" ("llm_call_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${LLM_CALL_DETAIL_TABLE}_run" ON "${LLM_CALL_DETAIL_TABLE}" ("run_id")`,

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
    this.migrateProviderApiKeyColumn();
    this.importProviderCatalog();
  }

  /**
   * API Key 与提供商配置拆分：存量库 llm_provider_record.api_key → llm_provider_key_record，
   * 迁移后删除原列（幂等：列不存在即跳过）。
   */
  private migrateProviderApiKeyColumn(): void {
    try {
      const cols = this.relationDb.queryRaw<{ name: string }>(`PRAGMA table_info("${LLM_PROVIDER_TABLE}")`, []);
      if (!(cols ?? []).some((c) => c.name === 'api_key')) return;
      const rows = this.relationDb.queryRaw<{ id: string; api_key: string | null }>(
        `SELECT "id", "api_key" FROM "${LLM_PROVIDER_TABLE}" WHERE COALESCE("api_key", '') != ''`, [],
      );
      const now = IdGenerator.now();
      for (const row of rows ?? []) {
        try {
          this.relationDb.insert(LLM_PROVIDER_KEY_TABLE, [
            { field: 'id', value: IdGenerator.generate() },
            { field: 'created', value: now },
            { field: 'updated', value: now },
            { field: 'llm_provider_id', value: row.id },
            { field: 'api_key', value: String(row.api_key ?? '') },
          ]);
        } catch { /* 唯一冲突或写入失败：key 表已有该提供商记录，跳过 */ }
      }
      try {
        this.relationDb.executeRaw(`ALTER TABLE "${LLM_PROVIDER_TABLE}" DROP COLUMN "api_key"`);
      } catch { /* DROP 失败（旧 SQLite 等）：保留列但 key 以独立表为准 */ }
    } catch { /* 表未就绪等异常：跳过迁移，下次启动重试 */ }
  }

  /** 内置提供商目录预置：版本变化时导入标题不存在的目录行（enable=0），用户删除的行同版本内不复活 */
  private importProviderCatalog(): void {
    try {
      const flagRows = this.relationDb.queryRaw<{ config_value: string }>(
        `SELECT "config_value" FROM "${LLM_CONFIG_TABLE}" WHERE "config_key" = ?`, [PROVIDER_CATALOG_VERSION_KEY],
      );
      if ((flagRows ?? []).length > 0 && String(flagRows![0].config_value) === PROVIDER_CATALOG_VERSION) return;

      const now = IdGenerator.now();
      for (const entry of PROVIDER_CATALOG) {
        const existing = this.relationDb.queryRaw<{ id: string }>(
          `SELECT "id" FROM "${LLM_PROVIDER_TABLE}" WHERE "llm_provider_title" = ? LIMIT 1`, [entry.llm_provider_title],
        );
        if ((existing ?? []).length > 0) continue;
        this.relationDb.insert(LLM_PROVIDER_TABLE, Object.entries(toProviderRecord(entry, IdGenerator.generate(), now))
          .map(([field, value]) => ({ field, value })));
      }
      this.relationDb.executeRaw(
        `INSERT OR REPLACE INTO "${LLM_CONFIG_TABLE}" ("config_key", "config_value", "value_type", "description", "updated")
         VALUES ('${PROVIDER_CATALOG_VERSION_KEY}', '${PROVIDER_CATALOG_VERSION}', 'string', '内置提供商目录导入版本', ${now})`,
      );
    } catch { /* 目录导入失败不阻塞启动 */ }
  }
}
