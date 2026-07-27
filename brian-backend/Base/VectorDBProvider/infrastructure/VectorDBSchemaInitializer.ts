/**
 * @fileoverview VectorDBProvider 表结构初始化。
 *
 * 职责拆分（PRD 第 4 节）：
 * 1. 在关系数据库中创建 vectordb_config 配置表（DDL 通过 RelationDBAccess.executeRaw 执行，
 *    依赖 RelationDBProvider 的底层数据库）；
 * 2. 初始化 VectorDB 组件（congraphdb）：创建 vector_record 节点表与 embedding 列的 HNSW 索引。
 *
 * 向量数据（vector_record 集合）存储于 VectorDB 组件（congraphdb），不再使用 SQLite 表；
 * 配置项（含启用 / 禁用状态、搜索默认参数）仍存储于关系数据库配置表 vectordb_config。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { VectorDBComponent } from '../../components/VectorDB/VectorDBComponent';
import { VECTORDB_CONFIG_TABLE } from '../domain/types';

/**
 * VectorDBProvider 表结构初始化器。
 *
 * 在 VectorDBAccess 初始化时调用，确保配置表与向量数据库组件就绪。
 */
export class VectorDBSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层实例（用于创建配置表）
   * @param vectorDb VectorDB 组件实例（用于初始化节点表与 HNSW 索引）
   */
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly vectorDb: VectorDBComponent,
  ) {}

  /**
   * 初始化所有 VectorDBProvider 表与向量数据库组件（幂等，可安全重复调用）。
   *
   * @param dimension 向量维度（由上层 Embedding 模型决定）
   * @param metric 距离度量方式：cosine（默认）/ euclidean / dot
   */
  init(dimension: number, metric: string = 'cosine'): void {
    // 1. 关系数据库配置表 vectordb_config（IF NOT EXISTS 语义）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${VECTORDB_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);

    // 2. VectorDB 组件：创建 vector_record 节点表 + HNSW 索引（幂等）
    this.vectorDb.init(dimension, metric);
  }
}
