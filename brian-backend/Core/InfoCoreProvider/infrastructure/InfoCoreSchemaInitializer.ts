import type { RelationDBAccess } from '@brian-agent/base';
import {
  DIALOG_TABLE,
  EXECUTE_TABLE,
  CONTEXT_TABLE,
  INFO_RAW_TABLE,
  INFO_CONTEXT_SOURCE_TABLE,
  INFO_VECTOR_TABLE,
  INFO_TAG_TABLE,
  INFO_TAG_VECTOR_TABLE,
  INFO_SUMMARY_TABLE,
  INFO_KEYWORD_TABLE,
  INFO_TAG_CONFIG_TABLE,
  INFO_SUMMARY_CONFIG_TABLE,
  INFO_CONFIG_TABLE,
  INFO_VECTOR_CONFIG_TABLE,
  INFO_CONTEXT_CONFIG_TABLE,
} from '../domain/types';

type TolerantDdl = { sql: string; ignoreReason: string };

type DdlEntry = string | TolerantDdl;

export class InfoCoreSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  private readonly ddlStatements: readonly DdlEntry[] = [
    `
      CREATE TABLE IF NOT EXISTS "${DIALOG_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "updated"       INTEGER NOT NULL,
        "session_id"    TEXT    NOT NULL,
        "work_id"       TEXT    NOT NULL,
        "type"          TEXT    NOT NULL,
        "dialog"        TEXT    NOT NULL,
        "dialog_length" INTEGER NOT NULL DEFAULT 0,
        "dialog_brief"  TEXT    NOT NULL DEFAULT '',
        "trace_id"      TEXT    NOT NULL DEFAULT ''
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${DIALOG_TABLE}_session_id" ON "${DIALOG_TABLE}" ("session_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${DIALOG_TABLE}_work_id"    ON "${DIALOG_TABLE}" ("work_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${DIALOG_TABLE}_created"    ON "${DIALOG_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${DIALOG_TABLE}_sess_time"  ON "${DIALOG_TABLE}" ("session_id", "created")`,

    `
      CREATE TABLE IF NOT EXISTS "${EXECUTE_TABLE}" (
        "id"             TEXT    NOT NULL PRIMARY KEY,
        "created"        INTEGER NOT NULL,
        "updated"        INTEGER NOT NULL,
        "session_id"     TEXT    NOT NULL,
        "work_id"        TEXT    NOT NULL,
        "run_id"         TEXT    NOT NULL DEFAULT '',
        "trace_id"       TEXT    NOT NULL DEFAULT '',
        "agent_id"       TEXT    NOT NULL DEFAULT '',
        "exec_no"        INTEGER NOT NULL DEFAULT 0,
        "component_id"   TEXT    NOT NULL DEFAULT '',
        "component_type" TEXT    NOT NULL DEFAULT '',
        "input"          TEXT    NOT NULL DEFAULT '',
        "input_length"   INTEGER NOT NULL DEFAULT 0,
        "output"         TEXT    NOT NULL DEFAULT '',
        "output_length"  INTEGER NOT NULL DEFAULT 0,
        "gap"            INTEGER NOT NULL DEFAULT 0
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${EXECUTE_TABLE}_work_id"      ON "${EXECUTE_TABLE}" ("work_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${EXECUTE_TABLE}_session_id"   ON "${EXECUTE_TABLE}" ("session_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${EXECUTE_TABLE}_work_exec_no" ON "${EXECUTE_TABLE}" ("work_id", "exec_no")`,
    `CREATE INDEX IF NOT EXISTS "idx_${EXECUTE_TABLE}_created"      ON "${EXECUTE_TABLE}" ("created")`,

    `
      CREATE TABLE IF NOT EXISTS "${CONTEXT_TABLE}" (
        "id"         TEXT    NOT NULL PRIMARY KEY,
        "created"    INTEGER NOT NULL,
        "updated"    INTEGER NOT NULL,
        "session_id" TEXT    NOT NULL DEFAULT '',
        "work_id"    TEXT    NOT NULL,
        "dialog_id"  TEXT    NOT NULL,
        "type"       TEXT    NOT NULL
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${CONTEXT_TABLE}_work_id"      ON "${CONTEXT_TABLE}" ("work_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${CONTEXT_TABLE}_session_id"   ON "${CONTEXT_TABLE}" ("session_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${CONTEXT_TABLE}_dialog_id"    ON "${CONTEXT_TABLE}" ("dialog_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${CONTEXT_TABLE}_sess_type"    ON "${CONTEXT_TABLE}" ("session_id", "type")`,
    `CREATE INDEX IF NOT EXISTS "idx_${CONTEXT_TABLE}_work_type"    ON "${CONTEXT_TABLE}" ("work_id", "type")`,
    { sql: `ALTER TABLE "${CONTEXT_TABLE}" ADD COLUMN "source" TEXT NOT NULL DEFAULT ''`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${CONTEXT_TABLE}" ADD COLUMN "info_id" TEXT NOT NULL DEFAULT ''`, ignoreReason: '字段已存在' },

    `
      CREATE TABLE IF NOT EXISTS "${INFO_RAW_TABLE}" (
        "id"                TEXT    NOT NULL PRIMARY KEY,
        "created"           INTEGER NOT NULL,
        "updated"           INTEGER NOT NULL,
        "session_id"        TEXT    NOT NULL,
        "work_id"           TEXT    NOT NULL,
        "run_id"       TEXT    NOT NULL,
        "info_id"           TEXT    NOT NULL,
        "info_type"         TEXT    NOT NULL,
        "info_creator_role" TEXT    NOT NULL DEFAULT '',
        "info_creator_id"   TEXT    NOT NULL DEFAULT '',
        "info"              TEXT    NOT NULL,
        "info_length"       INTEGER NOT NULL DEFAULT 0,
        "pin"               INTEGER NOT NULL DEFAULT 0,
        "trace_id"          TEXT    NOT NULL DEFAULT '',
        "handle_result_type" TEXT   NOT NULL DEFAULT 'correct'
      )
    `,
    { sql: `ALTER TABLE "${INFO_RAW_TABLE}" ADD COLUMN "trace_id" TEXT NOT NULL DEFAULT ''`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${INFO_RAW_TABLE}" ADD COLUMN "handle_result_type" TEXT NOT NULL DEFAULT 'correct'`, ignoreReason: '字段已存在' },
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_trace_id" ON "${INFO_RAW_TABLE}" ("trace_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_session_id" ON "${INFO_RAW_TABLE}" ("session_id")`,

    { sql: `ALTER TABLE "${INFO_RAW_TABLE}" RENAME COLUMN "interact_id" TO "run_id"`, ignoreReason: '已重命名或原列不存在' },
    { sql: `DROP INDEX IF EXISTS "idx_${INFO_RAW_TABLE}_interact_id"`, ignoreReason: '旧索引可能不存在' },
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_run_id" ON "${INFO_RAW_TABLE}" ("run_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_info_type" ON "${INFO_RAW_TABLE}" ("info_type")`,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_info_creator_id" ON "${INFO_RAW_TABLE}" ("info_creator_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_created" ON "${INFO_RAW_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_handle_result_type" ON "${INFO_RAW_TABLE}" ("handle_result_type")`,

    `
      CREATE TABLE IF NOT EXISTS "${INFO_CONTEXT_SOURCE_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "work_id"   TEXT    NOT NULL,
        "source"    TEXT    NOT NULL,
        "info_id"   TEXT    NOT NULL
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_CONTEXT_SOURCE_TABLE}_work_id" ON "${INFO_CONTEXT_SOURCE_TABLE}" ("work_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_CONTEXT_SOURCE_TABLE}_work_source" ON "${INFO_CONTEXT_SOURCE_TABLE}" ("work_id", "source")`,

    `
      CREATE TABLE IF NOT EXISTS "${INFO_VECTOR_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "info_id"   TEXT    NOT NULL UNIQUE,
        "embedding" TEXT    NOT NULL
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS "${INFO_TAG_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "info_id"   TEXT    NOT NULL,
        "tag"       TEXT    NOT NULL,
        UNIQUE("info_id", "tag")
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_TAG_TABLE}_info_id" ON "${INFO_TAG_TABLE}" ("info_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_TAG_TABLE}_tag" ON "${INFO_TAG_TABLE}" ("tag")`,

    `
      CREATE TABLE IF NOT EXISTS "${INFO_TAG_VECTOR_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "tag_id"    TEXT    NOT NULL UNIQUE,
        "embedding" TEXT    NOT NULL
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS "${INFO_SUMMARY_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "info_id"   TEXT    NOT NULL UNIQUE,
        "summary"   TEXT    NOT NULL
      )
    `,

    `
      CREATE VIRTUAL TABLE IF NOT EXISTS "${INFO_KEYWORD_TABLE}" USING fts5(
        "info_id",
        "word",
        tokenize='unicode61'
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS "${INFO_TAG_CONFIG_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "llm_id"              TEXT    NOT NULL,
        "prompt_template_id"  TEXT    NOT NULL,
        "tag_top_k"           INTEGER NOT NULL DEFAULT 5,
        "enable"              INTEGER NOT NULL DEFAULT 1
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS "${INFO_SUMMARY_CONFIG_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "llm_id"              TEXT    NOT NULL,
        "prompt_template_id"  TEXT    NOT NULL,
        "enable"              INTEGER NOT NULL DEFAULT 1,
        "threshold"           INTEGER NOT NULL DEFAULT 100,
        "info_types"          TEXT    NOT NULL DEFAULT 'RESPONSE'
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS "${INFO_CONFIG_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "alive_max_days"  INTEGER NOT NULL DEFAULT 30
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS "${INFO_VECTOR_CONFIG_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "updated"       INTEGER NOT NULL,
        "llm_id"        TEXT    NOT NULL,
        "dimension"     INTEGER NOT NULL DEFAULT 1536,
        "enable"        INTEGER NOT NULL DEFAULT 1,
        "chunk_size"    INTEGER NOT NULL DEFAULT 512,
        "chunk_overlap" INTEGER NOT NULL DEFAULT 64
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS "${INFO_CONTEXT_CONFIG_TABLE}" (
        "id"                      TEXT    NOT NULL PRIMARY KEY,
        "created"                 INTEGER NOT NULL,
        "updated"                 INTEGER NOT NULL,
        "base_timeline_count"     INTEGER NOT NULL DEFAULT 500,
        "base_tag_relative_count" INTEGER NOT NULL DEFAULT 200,
        "base_similarity_count"   INTEGER NOT NULL DEFAULT 150,
        "base_keyword_count"      INTEGER NOT NULL DEFAULT 100,
        "base_random_count"       INTEGER NOT NULL DEFAULT 50,
        "random_max_percent"      INTEGER NOT NULL DEFAULT 5,
        "tag_relative_max_percent" INTEGER NOT NULL DEFAULT 20,
        "similarity_max_percent"   INTEGER NOT NULL DEFAULT 15,
        "keyword_max_percent"      INTEGER NOT NULL DEFAULT 10,
        "keyword_score_threshold"  INTEGER NOT NULL DEFAULT 95,
        "total"                   INTEGER NOT NULL DEFAULT 1000,
        "enable_snapshot_persistence" INTEGER NOT NULL DEFAULT 1,
        "priority_order"          TEXT    NOT NULL DEFAULT 'PINNED,CITING,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM'
      )
    `,
    { sql: `ALTER TABLE "${INFO_CONTEXT_CONFIG_TABLE}" ADD COLUMN "random_max_percent" INTEGER NOT NULL DEFAULT 5`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${INFO_CONTEXT_CONFIG_TABLE}" ADD COLUMN "tag_relative_max_percent" INTEGER NOT NULL DEFAULT 20`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${INFO_CONTEXT_CONFIG_TABLE}" ADD COLUMN "similarity_max_percent" INTEGER NOT NULL DEFAULT 15`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${INFO_CONTEXT_CONFIG_TABLE}" ADD COLUMN "keyword_max_percent" INTEGER NOT NULL DEFAULT 10`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${INFO_CONTEXT_CONFIG_TABLE}" ADD COLUMN "keyword_score_threshold" INTEGER NOT NULL DEFAULT 95`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${INFO_CONTEXT_CONFIG_TABLE}" ADD COLUMN "enable_snapshot_persistence" INTEGER NOT NULL DEFAULT 1`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${INFO_CONTEXT_CONFIG_TABLE}" ADD COLUMN "priority_order" TEXT NOT NULL DEFAULT 'PINNED,CITING,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM'`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${INFO_SUMMARY_CONFIG_TABLE}" ADD COLUMN "threshold" INTEGER NOT NULL DEFAULT 100`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${INFO_SUMMARY_CONFIG_TABLE}" ADD COLUMN "info_types" TEXT NOT NULL DEFAULT 'RESPONSE'`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${INFO_VECTOR_CONFIG_TABLE}" ADD COLUMN "chunk_size" INTEGER NOT NULL DEFAULT 512`, ignoreReason: '字段已存在' },
    { sql: `ALTER TABLE "${INFO_VECTOR_CONFIG_TABLE}" ADD COLUMN "chunk_overlap" INTEGER NOT NULL DEFAULT 64`, ignoreReason: '字段已存在' },
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

    try {
      this.relationDb.executeRaw(`
        INSERT OR IGNORE INTO "${DIALOG_TABLE}" ("id", "created", "updated", "session_id", "work_id", "type", "dialog", "dialog_length", "dialog_brief", "trace_id")
        SELECT "info_id", "created", "updated", "session_id", "work_id", "info_type", "info", "info_length", '', "trace_id"
        FROM "${INFO_RAW_TABLE}"
        WHERE "info_type" IN ('REQUEST', 'RESPONSE')
      `);
    } catch { }

    try {
      this.relationDb.executeRaw(`
        INSERT OR IGNORE INTO "${EXECUTE_TABLE}" ("id", "created", "updated", "session_id", "work_id", "run_id", "trace_id", "agent_id", "exec_no", "component_id", "component_type", "input", "input_length", "output", "output_length", "gap")
        SELECT "info_id", "created", "updated", "session_id", "work_id", "run_id", "trace_id", "info_creator_id", 0, "info_type", "info_type", '', 0, "info", "info_length", 0
        FROM "${INFO_RAW_TABLE}"
        WHERE "info_type" NOT IN ('REQUEST', 'RESPONSE')
      `);
    } catch { }

    try {
      this.relationDb.executeRaw(`
        INSERT OR IGNORE INTO "${CONTEXT_TABLE}" ("id", "created", "updated", "session_id", "work_id", "dialog_id", "type", "source", "info_id")
        SELECT s."id", s."created", s."updated", COALESCE(d."session_id", r."session_id", ''), s."work_id", s."info_id", lower(s."source"), s."source", s."info_id"
        FROM "info_context_source" s
        LEFT JOIN "${DIALOG_TABLE}" d ON d."work_id" = s."work_id"
        LEFT JOIN "${INFO_RAW_TABLE}" r ON r."work_id" = s."work_id"
      `);
    } catch { }
  }
}

