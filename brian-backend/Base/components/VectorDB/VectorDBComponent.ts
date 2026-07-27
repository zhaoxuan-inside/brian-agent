/**
 * @fileoverview VectorDB 数据库组件。
 *
 * 封装 congraphdb 的向量检索能力，提供底层的向量数据存储、HNSW 索引与相似度搜索能力。
 * VectorDBProvider 的 VectorDBRepository 依赖此组件，复用连接管理、Cypher 执行、
 * 向量索引等基础能力。
 *
 * 设计目标：
 * - 将 congraphdb 驱动的连接管理、节点表 / HNSW 索引初始化、向量读写等通用逻辑抽取为独立组件；
 * - Provider 通过依赖此组件获得原生向量数据库操作能力，关注业务逻辑而非驱动调用；
 * - 组件可独立使用，也可被多个 Provider 共享。
 *
 * 与 RelationDBProvider 的关系：
 * - 向量数据（vector_record 节点表 + HNSW 索引）存储于 congraphdb 向量数据库；
 * - 配置项（vectordb_config）仍存储于关系数据库，由 RelationDBProvider 管理。
 */

import {
  Database,
  type Connection,
  type QueryParam,
  type VectorSearchResult,
} from 'congraphdb';
import { existsSync, mkdirSync, statSync } from 'fs';
import { dirname } from 'path';
import { DatabaseError } from '../../shared/errors';

/** 向量数据表（节点表）名 */
const VECTOR_RECORD_TABLE = 'vector_record';

/** 向量属性名（HNSW 索引目标列） */
const VECTOR_PROPERTY = 'embedding';

/** HNSW 索引参数：每个节点的最大连接数 */
const HNSW_M = 16;

/** HNSW 索引参数：建索引时的搜索深度 */
const HNSW_EF_CONSTRUCTION = 200;

/** HNSW 搜索参数：查询时的搜索深度（越大越精确、越慢） */
const HNSW_EF_SEARCH = 50;

/**
 * 向量记录（VectorRecord）。
 *
 * 从向量数据库读取 / 写入的完整记录（含系统字段）。
 * 字段结构与 VectorDBProvider 领域层的 VectorRecord 保持一致。
 */
export interface VectorRecord {
  /** 向量 ID */
  id: string;
  /** 原始文本内容 */
  content: string;
  /** 向量数据（浮点数组） */
  embedding: number[];
  /** 用户 ID */
  user_id: string | null;
  /** 元数据 */
  metadata: Record<string, unknown> | null;
  /** 创建时间（毫秒时间戳） */
  created: number;
  /** 最后更新时间（毫秒时间戳） */
  updated: number;
}

/**
 * 向量搜索命中（VectorSearchHit）。
 *
 * search 返回的单条命中结果，包含向量 id、内容、相似度分数、元数据。
 */
export interface VectorSearchHit {
  /** 向量 ID */
  id: string;
  /** 原始文本内容 */
  content: string;
  /** 相似度分数（余弦相似度，取值范围 [-1, 1]，越大越相似） */
  similarity: number;
  /** 用户 ID */
  user_id: string | null;
  /** 元数据 */
  metadata: Record<string, unknown> | null;
}

/**
 * 向量过滤对象（VectorFilter）。
 *
 * 用于搜索、统计、删除操作的元数据条件过滤，多个条件之间通过 logic 字段组合。
 * 字段结构与 VectorDBProvider 领域层的 VectorFilter 保持一致，可直传。
 *
 * operator 取值与 shared/query 的 Operator 枚举一致：
 * EQ / NE / GT / LT / GE / LE / IN / NOT_IN / IS_NULL / IS_NOT_NULL。
 */
export interface VectorFilter {
  /** 元数据字段名（或 'user_id' 表示按用户 ID 过滤） */
  field: string;
  /** 操作符，取值见 shared/query Operator 枚举 */
  operator: string;
  /** 比较值；IS_NULL / IS_NOT_NULL 时可为空 */
  value?: unknown;
  /** 与前一条件的逻辑关系，AND（默认）/ OR */
  logic?: string;
}

/**
 * VectorDB 数据库组件。
 *
 * 封装 congraphdb 的连接管理、节点表 / HNSW 索引初始化、向量 CRUD 与相似度搜索能力。
 * 作为 VectorDBProvider 的底层依赖，也可独立使用。
 *
 * 用法示例（独立使用）：
 * ```typescript
 * const vectorDb = new VectorDBComponent('./data/vector.db');
 * vectorDb.init(1536, 'cosine');
 * vectorDb.upsert({
 *   id: 'vec-1', content: '示例', embedding: [0.1, 0.2, ...],
 *   user_id: 'u1', metadata: { tag: 'demo' }, created: Date.now(), updated: Date.now(),
 * });
 * const hits = vectorDb.search([0.1, 0.2, ...], 10, 0.5);
 * vectorDb.close();
 * ```
 */
export class VectorDBComponent {
  /** congraphdb 数据库实例 */
  private readonly db: Database;

  /**
   * congraphdb 连接。
   *
   * 注：使用原生连接（native connection）以获得 searchVectorsSync、
   * querySyncWithNamedParams、createNodeTable、createHnswIndex 等完整 API。
   * JS 包装层（wrapper）未暴露部分同步方法，故通过 _connection 取原生连接。
   */
  private readonly conn: Connection;

  /** 数据库文件路径 */
  private readonly dbPath: string;

  /** 是否已执行 init（创建节点表 + HNSW 索引） */
  private initialized = false;

  /** 向量维度（init 时指定） */
  private dimension = 0;

  /** 距离度量方式：cosine / euclidean / dot */
  private metric = 'cosine';

  /**
   * @param dbPath 数据库文件路径
   */
  constructor(dbPath: string) {
    this.dbPath = dbPath;

    // 确保目录存在
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      this.db = new Database(this.dbPath);
      // createConnection 返回 JS 包装层 Connection；取其内部原生连接以获得完整同步 API
      const wrapperConn = this.db.createConnection();
      this.conn = (
        wrapperConn as unknown as { _connection: Connection }
      )._connection;
    } catch (err) {
      throw new DatabaseError(
        `初始化 VectorDB 数据库失败: ${this.dbPath} - ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // 初始化
  // -------------------------------------------------------------------------

  /**
   * 初始化组件：创建 vector_record 节点表与 embedding 列的 HNSW 索引。
   *
   * 幂等：若节点表 / 索引已存在则忽略错误，可安全重复调用。
   *
   * @param dimension 向量维度（由上层 Embedding 模型决定）
   * @param metric 距离度量方式：cosine（默认）/ euclidean / dot
   */
  init(dimension: number, metric: string = 'cosine'): void {
    this.dimension = dimension;
    this.metric = metric;

    // 创建节点表 vector_record
    try {
      this.conn.createNodeTable(
        VECTOR_RECORD_TABLE,
        [
          { name: 'id', type: 'STRING', nullable: false },
          { name: 'content', type: 'STRING', nullable: false },
          { name: 'embedding', type: 'VECTOR', nullable: false },
          { name: 'user_id', type: 'STRING', nullable: true },
          { name: 'metadata', type: 'STRING', nullable: true },
          { name: 'created', type: 'INT64', nullable: false },
          { name: 'updated', type: 'INT64', nullable: false },
        ],
        'id',
      );
    } catch (err) {
      // 节点表已存在时忽略（幂等初始化）
      if (!this.isAlreadyExistsError(err)) {
        throw new DatabaseError(
          `创建 vector_record 节点表失败: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // 创建 HNSW 向量索引
    try {
      this.conn.createHnswIndex(
        VECTOR_RECORD_TABLE,
        VECTOR_PROPERTY,
        dimension,
        HNSW_M,
        HNSW_EF_CONSTRUCTION,
        metric,
      );
    } catch (err) {
      // 索引已存在时忽略（幂等初始化）
      if (!this.isAlreadyExistsError(err)) {
        throw new DatabaseError(
          `创建 HNSW 索引失败: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.initialized = true;
  }

  /**
   * 校验组件是否已初始化，未初始化时抛出 DatabaseError。
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new DatabaseError(
        'VectorDB 组件未初始化，请先调用 init(dimension, metric)',
      );
    }
  }

  /**
   * 判断错误是否为“已存在”类型（节点表 / 索引重复创建）。
   *
   * congraphdb 对重复创建抛出的错误信息包含 "already exists" / "exists" 等关键字。
   */
  private isAlreadyExistsError(err: unknown): boolean {
    if (!(err instanceof Error)) {
      const msg = String(err).toLowerCase();
      return msg.includes('already exists') || msg.includes('exists');
    }
    const msg = err.message.toLowerCase();
    return msg.includes('already exists') || msg.includes('exists');
  }

  // -------------------------------------------------------------------------
  // 工具方法
  // -------------------------------------------------------------------------

  /**
   * 构建命名参数对象（congraphdb QueryParam 结构：{ value: JsonValue }）。
   */
  private buildParams(
    params: Record<string, unknown>,
  ): Record<string, QueryParam> {
    const result: Record<string, QueryParam> = {};
    for (const [key, value] of Object.entries(params)) {
      result[key] = { value: value as QueryParam['value'] };
    }
    return result;
  }

  /**
   * 执行写入类 Cypher（MERGE / DELETE / SET），不读取返回行。
   *
   * 使用命名参数避免字符串注入与转义问题。
   *
   * @param cypher Cypher 语句
   * @param params 命名参数
   */
  private executeWrite(
    cypher: string,
    params: Record<string, unknown> = {},
  ): void {
    this.ensureInitialized();
    try {
      const result = this.conn.querySyncWithNamedParams(
        cypher,
        this.buildParams(params),
      );
      // 写入语句无返回行，关闭结果集释放资源
      try {
        result.close();
      } catch {
        // 忽略关闭错误
      }
    } catch (err) {
      throw new DatabaseError(
        `执行 Cypher 失败: ${cypher} - ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * 执行读取类 Cypher，返回全部行。
   *
   * 使用命名参数，通过 getAll() 获取结果（兼容同步 / 异步 getAll）。
   *
   * @param cypher Cypher 语句
   * @param params 命名参数
   * @returns 结果行数组
   */
  private async executeQuery(
    cypher: string,
    params: Record<string, unknown> = {},
  ): Promise<Array<Record<string, unknown>>> {
    this.ensureInitialized();
    try {
      const result = this.conn.querySyncWithNamedParams(
        cypher,
        this.buildParams(params),
      );
      // getAll 在 QueryResult 上返回 Promise，await 兼容同步 / 异实现
      const rows = (await result.getAll()) as Array<Record<string, unknown>>;
      try {
        result.close();
      } catch {
        // 忽略关闭错误
      }
      return rows;
    } catch (err) {
      throw new DatabaseError(
        `执行 Cypher 查询失败: ${cypher} - ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * 将查询行转换为 VectorRecord。
   *
   * embedding 从 VECTOR 列读取（可能为 Float32Array / 普通数组 / 字符串）；
   * metadata 从 STRING 列读取（JSON 字符串反序列化）；
   * created / updated 从 INT64 列读取（可能为 BigInt，统一转 Number）。
   *
   * @param row 查询行
   * @returns 向量记录
   */
  private toVectorRecord(row: Record<string, unknown>): VectorRecord {
    return {
      id: String(row.id),
      content: String(row.content),
      embedding: this.parseEmbedding(row.embedding),
      user_id: this.parseNullableString(row.user_id),
      metadata: this.parseMetadata(row.metadata),
      created: this.toNumber(row.created),
      updated: this.toNumber(row.updated),
    };
  }

  /**
   * 解析 embedding 字段为 number[]。
   *
   * 兼容 Float32Array / TypedArray / 普通数组 / JSON 字符串。
   */
  private parseEmbedding(value: unknown): number[] {
    if (value === null || value === undefined) {
      return [];
    }
    // TypedArray（Float32Array 等）
    if (typeof value === 'object' && ArrayBuffer.isView(value)) {
      return Array.from(value as unknown as ArrayLike<number>);
    }
    if (Array.isArray(value)) {
      return value.map((v) => Number(v));
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map((v: unknown) => Number(v));
        }
      } catch {
        // 忽略解析错误
      }
    }
    return [];
  }

  /**
   * 解析可为空的字符串字段。
   */
  private parseNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return String(value);
  }

  /**
   * 解析 metadata 字段（JSON 字符串 -> 对象）。
   */
  private parseMetadata(
    value: unknown,
  ): Record<string, unknown> | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed !== null && typeof parsed === 'object') {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // 忽略解析错误
      }
    }
    return null;
  }

  /**
   * 将值转换为 number（兼容 BigInt）。
   */
  private toNumber(value: unknown): number {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (typeof value === 'number') {
      return value;
    }
    return Number(value);
  }

  /**
   * 从记录 / 命中对象中提取过滤字段值。
   *
   * field 为 'user_id' 时取 user_id，否则取 metadata[field]。
   */
  private getFieldValue(
    record: { user_id: string | null; metadata: Record<string, unknown> | null },
    field: string,
  ): unknown {
    if (field === 'user_id') {
      return record.user_id;
    }
    return record.metadata ? record.metadata[field] : undefined;
  }

  /**
   * 评估单个过滤条件是否匹配。
   */
  private matchFilter(
    record: { user_id: string | null; metadata: Record<string, unknown> | null },
    filter: VectorFilter,
  ): boolean {
    const value = this.getFieldValue(record, filter.field);
    const op = filter.operator;
    const target = filter.value;

    switch (op) {
      case 'EQ':
        return value === target;
      case 'NE':
        return value !== target;
      case 'GT':
        return (
          typeof value === 'number' &&
          typeof target === 'number' &&
          value > target
        );
      case 'LT':
        return (
          typeof value === 'number' &&
          typeof target === 'number' &&
          value < target
        );
      case 'GE':
        return (
          typeof value === 'number' &&
          typeof target === 'number' &&
          value >= target
        );
      case 'LE':
        return (
          typeof value === 'number' &&
          typeof target === 'number' &&
          value <= target
        );
      case 'IN':
        return Array.isArray(target) && target.includes(value);
      case 'NOT_IN':
        return Array.isArray(target) && !target.includes(value);
      case 'IS_NULL':
        return value === null || value === undefined;
      case 'IS_NOT_NULL':
        return value !== null && value !== undefined;
      default:
        return false;
    }
  }

  /**
   * 评估过滤条件列表是否匹配（左到右组合 AND / OR）。
   *
   * 多个条件按 logic 字段与前一结果组合，未指定 logic 时默认 AND。
   */
  private matchFilters(
    record: { user_id: string | null; metadata: Record<string, unknown> | null },
    filters: VectorFilter[],
  ): boolean {
    if (filters.length === 0) {
      return true;
    }
    let result = this.matchFilter(record, filters[0]);
    for (let i = 1; i < filters.length; i++) {
      const logic = filters[i].logic || 'AND';
      if (logic === 'OR') {
        result = result || this.matchFilter(record, filters[i]);
      } else {
        result = result && this.matchFilter(record, filters[i]);
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // 向量 CRUD
  // -------------------------------------------------------------------------

  /**
   * 新增 / 更新向量（upsert 语义）。
   *
   * 使用 Cypher MERGE 子句：id 已存在则更新，否则新增。
   * embedding 以 number[] 通过命名参数传入；metadata 序列化为 JSON 字符串存储。
   *
   * @param record 向量记录
   */
  upsert(record: VectorRecord): void {
    this.ensureInitialized();
    const metadataStr = record.metadata
      ? JSON.stringify(record.metadata)
      : null;
    this.executeWrite(
      `MERGE (n:${VECTOR_RECORD_TABLE} {id: $id}) ` +
        'SET n.content = $content, ' +
        'n.embedding = $embedding, ' +
        'n.user_id = $user_id, ' +
        'n.metadata = $metadata, ' +
        'n.created = $created, ' +
        'n.updated = $updated',
      {
        id: record.id,
        content: record.content,
        embedding: record.embedding,
        user_id: record.user_id,
        metadata: metadataStr,
        created: record.created,
        updated: record.updated,
      },
    );
  }

  /**
   * 按 ID 获取向量完整信息。
   *
   * @param id 向量 ID
   * @returns 向量记录，不存在返回 null
   */
  async get(id: string): Promise<VectorRecord | null> {
    const rows = await this.executeQuery(
      `MATCH (n:${VECTOR_RECORD_TABLE} {id: $id}) ` +
        'RETURN n.id AS id, n.content AS content, n.embedding AS embedding, ' +
        'n.user_id AS user_id, n.metadata AS metadata, ' +
        'n.created AS created, n.updated AS updated',
      { id },
    );
    if (rows.length === 0) {
      return null;
    }
    return this.toVectorRecord(rows[0]);
  }

  /**
   * 按 ID 删除向量。
   *
   * @param id 向量 ID
   */
  delete(id: string): void {
    this.executeWrite(
      `MATCH (n:${VECTOR_RECORD_TABLE} {id: $id}) DELETE n`,
      { id },
    );
  }

  /**
   * 按 ID 列表批量删除向量。
   *
   * @param ids 向量 ID 列表
   * @returns 删除的向量数量
   */
  deleteMany(ids: string[]): number {
    let deleted = 0;
    for (const id of ids) {
      try {
        this.delete(id);
        deleted++;
      } catch {
        // 单条删除失败不影响整体，继续处理剩余
      }
    }
    return deleted;
  }

  /**
   * 加载全部向量记录（可选按元数据条件过滤）。
   *
   * 由于 metadata 以 JSON 字符串存储，过滤在内存中执行。
   *
   * @param filters 可选过滤条件列表
   * @returns 向量记录数组
   */
  async getAll(
    filters?: VectorFilter[],
  ): Promise<VectorRecord[]> {
    const rows = await this.executeQuery(
      `MATCH (n:${VECTOR_RECORD_TABLE}) ` +
        'RETURN n.id AS id, n.content AS content, n.embedding AS embedding, ' +
        'n.user_id AS user_id, n.metadata AS metadata, ' +
        'n.created AS created, n.updated AS updated',
    );
    let records = rows.map((r) => this.toVectorRecord(r));
    if (filters && filters.length > 0) {
      records = records.filter((r) => this.matchFilters(r, filters));
    }
    return records;
  }

  /**
   * 统计向量数量（可选按元数据条件过滤）。
   *
   * 无过滤条件时使用 Cypher count 聚合；有过滤条件时在内存中过滤统计。
   *
   * @param filters 可选过滤条件列表
   * @returns 向量数量
   */
  async count(filters?: VectorFilter[]): Promise<number> {
    if (!filters || filters.length === 0) {
      const rows = await this.executeQuery(
        `MATCH (n:${VECTOR_RECORD_TABLE}) RETURN count(n) AS count`,
      );
      if (rows.length === 0) {
        return 0;
      }
      return this.toNumber(rows[0].count);
    }
    const records = await this.getAll(filters);
    return records.length;
  }

  /**
   * 按元数据条件批量删除向量。
   *
   * 先加载全部匹配记录，再按 ID 逐条删除。
   *
   * @param filters 过滤条件列表
   * @returns 删除的向量数量
   */
  async deleteByFilter(filters: VectorFilter[]): Promise<number> {
    const matched = await this.getAll(filters);
    const ids = matched.map((r) => r.id);
    if (ids.length === 0) {
      return 0;
    }
    return this.deleteMany(ids);
  }

  // -------------------------------------------------------------------------
  // 向量相似度搜索
  // -------------------------------------------------------------------------

  /**
   * 基于向量相似度搜索最相似的向量。
   *
   * 使用 congraphdb 原生 HNSW 索引（searchVectorsSync）执行近似最近邻搜索，
   * 再在内存中应用元数据过滤（后过滤）、相似度阈值过滤，取前 topK 条。
   *
   * 距离 -> 相似度转换：对于 cosine 度量，similarity = 1 - distance
   * （cosine distance = 1 - cosine similarity，distance 越小越相似）。
   *
   * @param queryVector 查询向量
   * @param topK 返回结果数量
   * @param threshold 相似度阈值，低于此值的结果不返回
   * @param filters 可选元数据过滤条件（后过滤）
   * @returns 命中结果列表（按相似度降序）
   */
  search(
    queryVector: number[],
    topK: number,
    threshold: number,
    filters?: VectorFilter[],
  ): VectorSearchHit[] {
    this.ensureInitialized();

    const hasFilters = !!filters && filters.length > 0;
    // 后过滤会缩减结果，故取更大的候选池以保证召回
    const candidateK = hasFilters
      ? Math.max(topK * 10, 100)
      : Math.max(topK, 1);

    let results: VectorSearchResult[];
    try {
      results = this.conn.searchVectorsSync(
        VECTOR_RECORD_TABLE,
        queryVector,
        candidateK,
        HNSW_EF_SEARCH,
        VECTOR_PROPERTY,
      );
    } catch (err) {
      throw new DatabaseError(
        `HNSW 向量搜索失败: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // 转换为命中对象
    const hits: VectorSearchHit[] = [];
    for (const r of results) {
      const node = (r.node ?? {}) as Record<string, unknown>;
      const similarity = this.distanceToSimilarity(r.distance);
      if (similarity < threshold) {
        continue;
      }
      const hit: VectorSearchHit = {
        id: String(node.id),
        content: node.content !== undefined ? String(node.content) : '',
        similarity,
        user_id: this.parseNullableString(node.user_id),
        metadata: this.parseMetadata(node.metadata),
      };
      // 后过滤：应用元数据条件
      if (hasFilters && !this.matchFilters(hit, filters!)) {
        continue;
      }
      hits.push(hit);
    }

    // 按相似度降序排序，取前 topK 条
    hits.sort((a, b) => b.similarity - a.similarity);
    return hits.slice(0, topK);
  }

  /**
   * 将 HNSW 距离转换为相似度分数。
   *
   * - cosine：similarity = 1 - distance（取值范围 [-1, 1]）
   * - euclidean（L2）：距离越小越相似，转换为 similarity = 1 / (1 + distance)
   * - dot（内积）：距离即为负相似度，similarity = -distance
   *
   * @param distance HNSW 返回的距离（lower is better）
   * @returns 相似度分数（越大越相似）
   */
  private distanceToSimilarity(distance: number): number {
    if (this.metric === 'cosine') {
      return 1 - distance;
    }
    if (this.metric === 'euclidean') {
      return 1 / (1 + distance);
    }
    if (this.metric === 'dot') {
      return -distance;
    }
    // 默认按 cosine 处理
    return 1 - distance;
  }

  // -------------------------------------------------------------------------
  // 运维
  // -------------------------------------------------------------------------

  /**
   * 获取向量维度。
   *
   * @returns 向量维度
   */
  getDimension(): number {
    return this.dimension;
  }

  /**
   * 获取距离度量方式。
   *
   * @returns 度量方式（cosine / euclidean / dot）
   */
  getMetric(): string {
    return this.metric;
  }

  /**
   * 获取向量数据表名。
   *
   * @returns 节点表名
   */
  getTableName(): string {
    return VECTOR_RECORD_TABLE;
  }

  /**
   * 获取数据库文件磁盘占用大小（字节）。
   *
   * @returns 文件大小（字节）
   */
  getDiskUsage(): number {
    try {
      return statSync(this.dbPath).size;
    } catch {
      return 0;
    }
  }

  /**
   * 关闭数据库连接，释放资源。
   *
   * 注：此为终态操作，执行后不可恢复，需重新创建组件实例。
   */
  close(): void {
    try {
      this.db.close();
    } catch {
      // 忽略重复关闭
    }
    this.initialized = false;
  }
}
