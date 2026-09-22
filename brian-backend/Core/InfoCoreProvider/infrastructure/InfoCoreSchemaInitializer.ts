/**
 * @fileoverview InfoCoreProvider 表结构初始化。
 *
 * 创建 10 张表：info_raw、info_vector、info_tag、
 * info_tag_vector、info_summary、info_keyword、info_tag_config、
 * info_summary_config、info_config、info_vector_config、info_context_config。
 * DDL 通过 RelationDBAccess.executeRaw 执行。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import {
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

/** 幂等容忍 DDL 条目：执行失败进入 catch 忽略，ignoreReason 说明预期冲突场景 */
type TolerantDdl = { sql: string; ignoreReason: string };

/** DDL 数据表条目：字符串 = 直接执行（失败即抛出）；TolerantDdl = try/catch 幂等容忍 */
type DdlEntry = string | TolerantDdl;

/**
 * InfoCoreProvider 表结构初始化器。
 *
 * 在 InfoCoreAccess 初始化时调用，确保所有表存在。
 */
export class InfoCoreSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层实例
   */
  constructor(private readonly relationDb: RelationDBAccess) {}

  // ===== DDL 数据表（纯声明，数组顺序即执行顺序；IF NOT EXISTS 保证幂等）=====
  private readonly ddlStatements: readonly DdlEntry[] = [
    // info_raw — 原始信息主表
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
    // ===== 2026-09-14 三级维度最终定名：原 interact_id 列废弃，存量库 RENAME 为 run_id（一次问答，= runtime_run.id） =====
    { sql: `ALTER TABLE "${INFO_RAW_TABLE}" RENAME COLUMN "interact_id" TO "run_id"`, ignoreReason: '已重命名或原列不存在' },
    { sql: `DROP INDEX IF EXISTS "idx_${INFO_RAW_TABLE}_interact_id"`, ignoreReason: '旧索引可能不存在' },
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_run_id" ON "${INFO_RAW_TABLE}" ("run_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_info_type" ON "${INFO_RAW_TABLE}" ("info_type")`,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_info_creator_id" ON "${INFO_RAW_TABLE}" ("info_creator_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_created" ON "${INFO_RAW_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_handle_result_type" ON "${INFO_RAW_TABLE}" ("handle_result_type")`,

    // info_context_source — 每次问答（work_id）的上下文采集来源 → info_id 关系
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

    // info_vector — 向量化存储
    `
      CREATE TABLE IF NOT EXISTS "${INFO_VECTOR_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "info_id"   TEXT    NOT NULL UNIQUE,
        "embedding" TEXT    NOT NULL
      )
    `,

    // info_tag — 信息标签关联
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

    // info_tag_vector — 标签向量化
    `
      CREATE TABLE IF NOT EXISTS "${INFO_TAG_VECTOR_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "tag_id"    TEXT    NOT NULL UNIQUE,
        "embedding" TEXT    NOT NULL
      )
    `,

    // info_summary — 摘要存储
    `
      CREATE TABLE IF NOT EXISTS "${INFO_SUMMARY_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "info_id"   TEXT    NOT NULL UNIQUE,
        "summary"   TEXT    NOT NULL
      )
    `,

    // info_keyword — 关键词全文索引（FTS5 虚拟表）
    `
      CREATE VIRTUAL TABLE IF NOT EXISTS "${INFO_KEYWORD_TABLE}" USING fts5(
        "info_id",
        "word",
        tokenize='unicode61'
      )
    `,

    // info_tag_config — 标签提取配置
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

    // info_summary_config — 摘要生成配置
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

    // info_config — 全局配置（老化天数等）
    `
      CREATE TABLE IF NOT EXISTS "${INFO_CONFIG_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "alive_max_days"  INTEGER NOT NULL DEFAULT 30
      )
    `,

    // info_vector_config — 向量化配置
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

    // info_context_config — 上下文构建配置
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

  /**
   * 创建所有 InfoCoreProvider 表（IF NOT EXISTS 语义，可安全重复调用）。
   */
  init(): void {
    for (const ddl of this.ddlStatements) {
      if (typeof ddl === 'string') {
        this.relationDb.executeRaw(ddl);
        continue;
      }
      try {
        this.relationDb.executeRaw(ddl.sql);
      } catch { /* 幂等容忍：忽略原因见该条目 ignoreReason */ }
    }
  }
}
