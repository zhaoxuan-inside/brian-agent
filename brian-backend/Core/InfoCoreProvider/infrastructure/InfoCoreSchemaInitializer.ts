/**
 * @fileoverview InfoCoreProvider 表结构初始化。
 *
 * 创建 11 张表：info_raw、info_graph、info_vector、info_tag、
 * info_tag_vector、info_summary、info_keyword、info_tag_config、
 * info_summary_config、info_config、info_vector_config、info_context_config。
 * DDL 通过 RelationDBAccess.executeRaw 执行。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import {
  INFO_RAW_TABLE,
  INFO_GRAPH_TABLE,
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

  /**
   * 创建所有 InfoCoreProvider 表（IF NOT EXISTS 语义，可安全重复调用）。
   */
  init(): void {
    // info_raw — 原始信息主表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${INFO_RAW_TABLE}" (
        "id"                TEXT    NOT NULL PRIMARY KEY,
        "created"           INTEGER NOT NULL,
        "updated"           INTEGER NOT NULL,
        "session_id"        TEXT    NOT NULL,
        "work_id"           TEXT    NOT NULL,
        "interact_id"       TEXT    NOT NULL,
        "info_id"           TEXT    NOT NULL,
        "info_creator_id"   TEXT    NOT NULL,
        "info_creator_role" TEXT    NOT NULL,
        "info"              TEXT    NOT NULL,
        "info_length"       INTEGER NOT NULL DEFAULT 0,
        "pin"               INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_session_id" ON "${INFO_RAW_TABLE}" ("session_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_interact_id" ON "${INFO_RAW_TABLE}" ("interact_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_info_creator_id" ON "${INFO_RAW_TABLE}" ("info_creator_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${INFO_RAW_TABLE}_created" ON "${INFO_RAW_TABLE}" ("created")`,
    );

    // info_graph — 信息引用关系图
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${INFO_GRAPH_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "session_id"      TEXT    NOT NULL,
        "info_id"         TEXT    NOT NULL,
        "citing_info_id"  TEXT    NOT NULL,
        "cited_info_id"   TEXT    NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${INFO_GRAPH_TABLE}_info_id" ON "${INFO_GRAPH_TABLE}" ("info_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${INFO_GRAPH_TABLE}_citing_info_id" ON "${INFO_GRAPH_TABLE}" ("citing_info_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${INFO_GRAPH_TABLE}_cited_info_id" ON "${INFO_GRAPH_TABLE}" ("cited_info_id")`,
    );

    // info_vector — 向量化存储
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${INFO_VECTOR_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "info_id"   TEXT    NOT NULL UNIQUE,
        "embedding" TEXT    NOT NULL
      )
    `);

    // info_tag — 信息标签关联
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${INFO_TAG_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "info_id"   TEXT    NOT NULL,
        "tag"       TEXT    NOT NULL,
        UNIQUE("info_id", "tag")
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${INFO_TAG_TABLE}_info_id" ON "${INFO_TAG_TABLE}" ("info_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${INFO_TAG_TABLE}_tag" ON "${INFO_TAG_TABLE}" ("tag")`,
    );

    // info_tag_vector — 标签向量化
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${INFO_TAG_VECTOR_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "tag_id"    TEXT    NOT NULL UNIQUE,
        "embedding" TEXT    NOT NULL
      )
    `);

    // info_summary — 摘要存储
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${INFO_SUMMARY_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "info_id"   TEXT    NOT NULL UNIQUE,
        "summary"   TEXT    NOT NULL
      )
    `);

    // info_keyword — 关键词全文索引（FTS5 虚拟表）
    this.relationDb.executeRaw(`
      CREATE VIRTUAL TABLE IF NOT EXISTS "${INFO_KEYWORD_TABLE}" USING fts5(
        "info_id",
        "word",
        tokenize='unicode61'
      )
    `);

    // info_tag_config — 标签提取配置
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${INFO_TAG_CONFIG_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "llm_id"              TEXT    NOT NULL,
        "prompt_template_id"  TEXT    NOT NULL,
        "tag_top_k"           INTEGER NOT NULL DEFAULT 5,
        "enable"              INTEGER NOT NULL DEFAULT 1
      )
    `);

    // info_summary_config — 摘要生成配置
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${INFO_SUMMARY_CONFIG_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "llm_id"              TEXT    NOT NULL,
        "prompt_template_id"  TEXT    NOT NULL,
        "enable"              INTEGER NOT NULL DEFAULT 1
      )
    `);

    // info_config — 全局配置（老化天数等）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${INFO_CONFIG_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "alive_max_days"  INTEGER NOT NULL DEFAULT 30
      )
    `);

    // info_vector_config — 向量化配置
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${INFO_VECTOR_CONFIG_TABLE}" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "created"   INTEGER NOT NULL,
        "updated"   INTEGER NOT NULL,
        "llm_id"    TEXT    NOT NULL,
        "dimension" INTEGER NOT NULL DEFAULT 1024,
        "enable"    INTEGER NOT NULL DEFAULT 1
      )
    `);

    // info_context_config — 上下文构建配置
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${INFO_CONTEXT_CONFIG_TABLE}" (
        "id"                      TEXT    NOT NULL PRIMARY KEY,
        "created"                 INTEGER NOT NULL,
        "updated"                 INTEGER NOT NULL,
        "base_timeline_count"     INTEGER NOT NULL DEFAULT 500,
        "base_tag_relative_count" INTEGER NOT NULL DEFAULT 200,
        "base_similarity_count"   INTEGER NOT NULL DEFAULT 150,
        "base_keyword_count"      INTEGER NOT NULL DEFAULT 100,
        "base_random_count"       INTEGER NOT NULL DEFAULT 50,
        "total"                   INTEGER NOT NULL DEFAULT 1000
      )
    `);
  }
}
