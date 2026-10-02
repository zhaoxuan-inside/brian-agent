import type { RelationDBAccess } from '@brian-agent/base';
import {
  DIALOG_TABLE,
  DIALOG_EMBEDDING_TABLE,
  EXECUTE_TABLE,
  CONTEXT_TABLE,
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
    // ── ADR-012 迁移:旧表改名(幂等,旧表不存在或已改名时忽略) ──
    { sql: `ALTER TABLE "dialog" RENAME TO "${DIALOG_TABLE}"`, ignoreReason: '旧表不存在(全新库)或已改名' },
    { sql: `ALTER TABLE "execute" RENAME TO "${EXECUTE_TABLE}"`, ignoreReason: '旧表不存在(全新库)或已改名' },
    { sql: `ALTER TABLE "context" RENAME TO "${CONTEXT_TABLE}"`, ignoreReason: '旧表不存在(全新库)或已改名' },
    { sql: `ALTER TABLE "info_vector" RENAME TO "${INFO_VECTOR_TABLE}"`, ignoreReason: '旧表不存在(全新库)或已改名' },
    { sql: `ALTER TABLE "info_tag" RENAME TO "${INFO_TAG_TABLE}"`, ignoreReason: '旧表不存在(全新库)或已改名' },
    { sql: `ALTER TABLE "info_tag_vector" RENAME TO "${INFO_TAG_VECTOR_TABLE}"`, ignoreReason: '旧表不存在(全新库)或已改名' },
    { sql: `ALTER TABLE "info_summary" RENAME TO "${INFO_SUMMARY_TABLE}"`, ignoreReason: '旧表不存在(全新库)或已改名' },
    { sql: `ALTER TABLE "info_keyword" RENAME TO "${INFO_KEYWORD_TABLE}"`, ignoreReason: '旧表不存在(全新库)或已改名(FTS5)' },

    `
      CREATE TABLE IF NOT EXISTS "${DIALOG_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "updated"       INTEGER NOT NULL,
        "session_id"    TEXT    NOT NULL,
        "work_id"       TEXT    NOT NULL,
        "type"          TEXT    NOT NULL,
        "dialog"        TEXT    NOT NULL,
        "trace_id"      TEXT    NOT NULL DEFAULT ''
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${DIALOG_TABLE}_session_id" ON "${DIALOG_TABLE}" ("session_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${DIALOG_TABLE}_work_id"    ON "${DIALOG_TABLE}" ("work_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${DIALOG_TABLE}_created"    ON "${DIALOG_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${DIALOG_TABLE}_sess_time"  ON "${DIALOG_TABLE}" ("session_id", "created")`,

    // chg-059:轮次话题向量(请求+回复拼接 embedding,按 work_id 幂等,供选举话题连续性匹配)
    `
      CREATE TABLE IF NOT EXISTS "${DIALOG_EMBEDDING_TABLE}" (
        "id"         TEXT    NOT NULL PRIMARY KEY,
        "created"    INTEGER NOT NULL,
        "updated"    INTEGER NOT NULL,
        "session_id" TEXT    NOT NULL,
        "work_id"    TEXT    NOT NULL UNIQUE,
        "embedding"  TEXT    NOT NULL,
        "dimension"  INTEGER NOT NULL DEFAULT 0
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${DIALOG_EMBEDDING_TABLE}_session_id" ON "${DIALOG_EMBEDDING_TABLE}" ("session_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${DIALOG_EMBEDDING_TABLE}_work_id"    ON "${DIALOG_EMBEDDING_TABLE}" ("work_id")`,

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
        "gap"            INTEGER NOT NULL DEFAULT 0,
        "status"         TEXT    NOT NULL DEFAULT 'ok'
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${EXECUTE_TABLE}_work_id"      ON "${EXECUTE_TABLE}" ("work_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${EXECUTE_TABLE}_session_id"   ON "${EXECUTE_TABLE}" ("session_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${EXECUTE_TABLE}_work_exec_no" ON "${EXECUTE_TABLE}" ("work_id", "exec_no")`,
    `CREATE INDEX IF NOT EXISTS "idx_${EXECUTE_TABLE}_created"      ON "${EXECUTE_TABLE}" ("created")`,
    { sql: `ALTER TABLE "${EXECUTE_TABLE}" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ok'`, ignoreReason: '字段已存在' },

    `
      CREATE TABLE IF NOT EXISTS "${CONTEXT_TABLE}" (
        "id"         TEXT    NOT NULL PRIMARY KEY,
        "created"    INTEGER NOT NULL,
        "updated"    INTEGER NOT NULL,
        "session_id" TEXT    NOT NULL DEFAULT '',
        "work_id"    TEXT    NOT NULL,
        "round"      INTEGER NOT NULL DEFAULT 0,
        "dialog_id"  TEXT    NOT NULL,
        "type"       TEXT    NOT NULL
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${CONTEXT_TABLE}_work_id"      ON "${CONTEXT_TABLE}" ("work_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${CONTEXT_TABLE}_session_id"   ON "${CONTEXT_TABLE}" ("session_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${CONTEXT_TABLE}_dialog_id"    ON "${CONTEXT_TABLE}" ("dialog_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${CONTEXT_TABLE}_sess_type"    ON "${CONTEXT_TABLE}" ("session_id", "type")`,
    `CREATE INDEX IF NOT EXISTS "idx_${CONTEXT_TABLE}_work_type"    ON "${CONTEXT_TABLE}" ("work_id", "type")`,
    // 存量库补列(catch 忽略已存在):round=0 表示会话级装配——必须先于 work_round 索引执行
    { sql: `ALTER TABLE "${CONTEXT_TABLE}" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 0`, ignoreReason: '列已存在' },
    `CREATE INDEX IF NOT EXISTS "idx_${CONTEXT_TABLE}_work_round"   ON "${CONTEXT_TABLE}" ("work_id", "round")`,

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
    // ADR-012:dialog 去摘要冗余列(摘要唯一归 info_summary_record);存量库 catch 忽略列不存在
    { sql: `ALTER TABLE "${DIALOG_TABLE}" DROP COLUMN "dialog_length"`, ignoreReason: '列不存在' },
    { sql: `ALTER TABLE "${DIALOG_TABLE}" DROP COLUMN "dialog_brief"`, ignoreReason: '列不存在' },
    // ADR-012:summary 补长度统计列
    { sql: `ALTER TABLE "${INFO_SUMMARY_TABLE}" ADD COLUMN "summary_length" INTEGER NOT NULL DEFAULT 0`, ignoreReason: '列已存在' },
  ];

  init(): void {
    for (const ddl of this.ddlStatements) {
      if (typeof ddl === 'string') {
        this.relationDb.executeRaw(ddl);
        continue;
      }
      try {
        this.relationDb.executeRaw(ddl.sql);
      } catch { }
    }
    this.verifyFtsRename();
    this.dropLegacyTablesIfPresent();
  }

  /**
   * ADR-012:FTS5 虚拟表 rename 后校验;异常(旧 SQLite 不支持虚拟表改名等)则
   * drop 新名 + 以新名重建 + 从旧名回填存量数据(旧名保留至校验通过)。
   */
  private verifyFtsRename(): void {
    try {
      const rows = this.relationDb.queryRaw<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [INFO_KEYWORD_TABLE],
      );
      if (!rows || rows.length === 0) return;
      // 校验可查询且含 word 列
      this.relationDb.queryRaw(`SELECT info_id, word FROM "${INFO_KEYWORD_TABLE}" LIMIT 1`);
    } catch {
      try { this.relationDb.executeRaw(`DROP TABLE IF EXISTS "${INFO_KEYWORD_TABLE}"`); } catch { }
      this.relationDb.executeRaw(`
        CREATE VIRTUAL TABLE IF NOT EXISTS "${INFO_KEYWORD_TABLE}" USING fts5(
          "info_id",
          "word",
          tokenize='unicode61'
        )
      `);
      try {
        this.relationDb.executeRaw(`
          INSERT INTO "${INFO_KEYWORD_TABLE}" ("info_id", "word")
          SELECT "info_id", "word" FROM "info_keyword"
        `);
      } catch { }
    }
  }

  private dropLegacyTablesIfPresent(): void {
    try {
      this.relationDb.executeRaw(`DROP TABLE IF EXISTS "info_context_source"`);
      this.relationDb.executeRaw(`DROP TABLE IF EXISTS "info_raw"`);
    } catch { }
  }
}

