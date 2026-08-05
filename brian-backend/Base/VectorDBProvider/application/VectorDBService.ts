/**
 * @fileoverview VectorDBProvider 应用服务层。
 *
 * 依赖 VectorDBComponent（LanceDB 向量检索）操作向量数据，
 * 依赖 RelationDBAccess（通过 IConfigStorage）操作关系数据库的 vectordb_config 配置表，
 * 依赖 ConfigService 管理配置项。
 *
 * 向量数据（vector_record 表）存储于 VectorDB 组件（LanceDB），相似度搜索使用 LanceDB 原生 ANN 搜索；
 * 配置项（启用 / 禁用状态、搜索默认参数）存储于关系数据库配置表 vectordb_config。
 *
 * 实现所有用例：addVector / delVector / delVectorByFilter / soVector / getVector /
 * countVector / visualizedVector / enableVectorDB / closeVectorDB。
 *
 * 所有方法返回 Promise<boolean>，true 表示执行完成；
 * 实际数据通过 output 参数（引用传递）回传。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { VectorDBComponent } from '../../components/VectorDB/VectorDBComponent';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  DatabaseError,
} from '../../shared/errors';
import { IdGenerator } from '../../shared/id/IdGenerator';
import { Operator } from '../../shared/query';
import {
  VECTORDB_CONFIG_TABLE,
  VECTORDB_DEFAULT_CONFIGS,
} from '../domain/types';
import type {
  VectorContext,
  VectorObject,
  VectorRecord,
  VectorFilter,
  VectorSearchResult,
  AddVectorInput,
  AddVectorOutput,
  DelVectorInput,
  DelVectorOutput,
  DelVectorByFilterInput,
  DelVectorByFilterOutput,
  SoVectorInput,
  SoVectorOutput,
  GetVectorInput,
  GetVectorOutput,
  CountVectorInput,
  CountVectorOutput,
  VisualizedVectorInput,
  VisualizedVectorOutput,
  EnableVectorDBInput,
  EnableVectorDBOutput,
  CloseVectorDBInput,
  CloseVectorDBOutput,
} from '../domain/types';

/**
 * VectorDBProvider 应用服务。
 *
 * VectorDBProvider 是向量数据的唯一操作入口，上层不可直接操作数据库。
 * 向量数据存储于 VectorDB 组件（LanceDB），配置项存储于关系数据库。
 */
export class VectorDBService {
  /** 运行时内存中的启用状态，供各操作快速校验 */
  private enabled = true;

  /** 是否已执行 closeVectorDB（终态标记） */
  private closed = false;

  private readonly config: ConfigService;

  /**
   * @param vectorDb VectorDB 组件实例（向量数据操作）
   * @param relationDb RelationDBProvider 接入层（配置表操作）
   */
  constructor(
    private readonly vectorDb: VectorDBComponent,
    private readonly relationDb: RelationDBAccess,
  ) {
    this.config = new ConfigService(relationDb, VECTORDB_CONFIG_TABLE);
  }

  // -------------------------------------------------------------------------
  // 初始化
  // -------------------------------------------------------------------------

  /**
   * 初始化配置表：写入默认配置项（idempotent）并恢复 enabled 状态。
   *
   * 与 initialize() 分离，允许在 LanceDB 组件初始化之前完成配置初始化。
   */
  async initializeConfig(): Promise<void> {
    await this.config.initDefaults([...VECTORDB_DEFAULT_CONFIGS]);
  }

  /**
   * 初始化：恢复 enabled 状态（在初始化配置表之后调用）。
   */
  async initialize(): Promise<void> {
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  /**
   * 从配置表读取存储的距离度量方式。
   *
   * 将枚举值（COSINE / L2 / IP）转换为内部使用的值（cosine / euclidean / dot）。
   */
  getStoredMetric(): string | null {
    try {
      const val = this.relationDb.queryRaw<{ config_value: string }>(
        `SELECT "config_value" FROM "${VECTORDB_CONFIG_TABLE}" WHERE "config_key" = 'default_distance_metric'`,
        [],
      );
      if (val.length > 0 && val[0].config_value) {
        const raw = val[0].config_value.toUpperCase();
        const map: Record<string, string> = { COSINE: 'cosine', L2: 'euclidean', IP: 'dot' };
        return map[raw] || raw.toLowerCase();
      }
    } catch { /* table may not exist yet */ }
    return null;
  }

  /**
   * 校验组件是否启用，未启用时抛出 ComponentDisabledError。
   */
  private ensureEnabled(): void {
    if (this.closed) {
      throw new DatabaseError(
        '向量数据库已关闭（closeVectorDB 为终态操作），需重新初始化组件',
      );
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('VectorDB');
    }
  }

  // -------------------------------------------------------------------------
  // 工具方法
  // -------------------------------------------------------------------------

  /**
   * 校验向量数据对象合法性。
   */
  private validateVector(vec: VectorObject): void {
    if (!vec.content) {
      throw new ValidationError('content 不能为空');
    }
    if (
      !vec.embedding ||
      !Array.isArray(vec.embedding) ||
      vec.embedding.length === 0
    ) {
      throw new ValidationError('embedding 不能为空');
    }
  }

  // -------------------------------------------------------------------------
  // 用例实现
  // -------------------------------------------------------------------------

  /**
   * 新增/更新向量（addVector）。
   *
   * PRD 3.1 条：upsert 语义，id 已存在则更新，否则新增。
   * 返回向量 id 列表（顺序与入参一致）。
   *
   * @param input 入参（vectors 列表）
   * @param context 执行上下文
   * @param output 出参（ids 列表）
   */
  async addVector(
    input: AddVectorInput,
    _context: VectorContext,
    output: AddVectorOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.vectors || input.vectors.length === 0) {
      throw new ValidationError('vectors 不能为空');
    }

    const ids: string[] = [];
    const now = IdGenerator.now();

    for (const vec of input.vectors) {
      this.validateVector(vec);

      const id = vec.id || IdGenerator.generate();
      ids.push(id);

      // 通过 VectorDB 组件执行 upsert（MERGE 语义）
      await this.vectorDb.upsert({
        id,
        content: vec.content,
        embedding: vec.embedding,
        user_id: vec.user_id ?? null,
        metadata: vec.metadata ?? null,
        created: now,
        updated: now,
      });
    }

    output.ids = ids;
    return true;
  }

  /**
   * 删除向量（delVector）。
   *
   * PRD 3.2 条：按 ID 批量删除。
   *
   * @param input 入参（ids 列表）
   * @param context 执行上下文
   * @param output 出参（影响行数）
   */
  async delVector(
    input: DelVectorInput,
    _context: VectorContext,
    output: DelVectorOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids || input.ids.length === 0) {
      throw new ValidationError('ids 不能为空');
    }

    const affected = await this.vectorDb.deleteMany(input.ids);
    output.affected_rows = affected;
    return true;
  }

  /**
   * 按条件删除向量（delVectorByFilter）。
   *
   * PRD 3.3 条：按元数据条件批量删除。
   * 由 VectorDB 组件加载全部匹配记录后按 ID 批量删除。
   *
   * @param input 入参（filters 列表）
   * @param context 执行上下文
   * @param output 出参（删除的向量数量）
   */
  async delVectorByFilter(
    input: DelVectorByFilterInput,
    _context: VectorContext,
    output: DelVectorByFilterOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.filters || input.filters.length === 0) {
      throw new ValidationError('filters 不能为空');
    }

    const affected = await this.vectorDb.deleteByFilter(input.filters);
    output.affected_rows = affected;
    return true;
  }

  /**
   * 搜索向量（soVector）。
   *
   * PRD 3.4 条：基于余弦相似度搜索最相似的向量，支持元数据条件过滤。
   *
* 处理流程：
 * 1. 若 top_k / similarity_threshold 未指定，从 vectordb_config 读取默认值；
 * 2. 构建过滤条件（user_id + filters）；
 * 3. 由 VectorDB 组件执行 LanceDB 相似度搜索（含后过滤 + 阈值过滤）；
 * 4. 按相似度降序返回前 top_k 条结果。
   *
   * @param input 入参（query_param 查询参数）
   * @param context 执行上下文
   * @param output 出参（list 搜索结果）
   */
  async soVector(
    input: SoVectorInput,
    _context: VectorContext,
    output: SoVectorOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const param = input.query_param;
    if (
      !param.embedding ||
      !Array.isArray(param.embedding) ||
      param.embedding.length === 0
    ) {
      throw new ValidationError('query_param.embedding 不能为空');
    }

    // 读取默认参数（未指定时从配置表读取）
    const topK =
      param.top_k ?? (await this.config.getInt('default_top_k', 10));
    const normalizedThreshold =
      param.similarity_threshold ??
      (await this.config.getDouble('default_similarity_threshold', 0));

    // 将 0-100 归一化阈值转换为当前度量方式的原始阈值
    const rawThreshold = VectorDBComponent.normalizedThresholdToRaw(
      normalizedThreshold,
      this.vectorDb.getMetric(),
      this.vectorDb.getDimension(),
    );

    // 构建过滤条件列表
    const filters: VectorFilter[] = [];
    if (param.filters) {
      filters.push(...param.filters);
    }
    if (param.user_id) {
      filters.push({
        field: 'user_id',
        operator: Operator.EQ,
        value: param.user_id,
      });
    }

    // 由 VectorDB 组件执行 LanceDB 相似度搜索（阈值阈值 rawThreshold 已由归一化值转换，分数已归一化到 0-100）
    const hits = await this.vectorDb.search(
      param.embedding,
      topK,
      rawThreshold,
      filters.length > 0 ? filters : undefined,
    );

    // 映射为领域搜索结果（分数已在组件层归一化到 0-100）
    const results: VectorSearchResult[] = hits.map((h) => ({
      id: h.id,
      content: h.content,
      score: h.similarity,
      user_id: h.user_id,
      metadata: h.metadata,
    }));

    output.list = results;
    return true;
  }

  /**
   * 获取向量（getVector）。
   *
   * PRD 3.5 条：按 ID 获取向量完整信息，不存在返回 null。
   *
   * @param input 入参（id）
   * @param context 执行上下文
   * @param output 出参（vector 向量信息）
   */
  async getVector(
    input: GetVectorInput,
    _context: VectorContext,
    output: GetVectorOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    const record = await this.vectorDb.get(input.id);
    output.vector = record as VectorRecord | null;
    return true;
  }

  /**
   * 统计向量数量（countVector）。
   *
   * PRD 3.6 条：按元数据条件统计，不指定 filters 则统计全部。
   *
   * @param input 入参（filters 可选）
   * @param context 执行上下文
   * @param output 出参（count 数量）
   */
  async countVector(
    input: CountVectorInput,
    _context: VectorContext,
    output: CountVectorOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    const count = await this.vectorDb.count(
      input.filters && input.filters.length > 0 ? input.filters : undefined,
    );
    output.count = count;
    return true;
  }

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  /**
   * 可视化数据（visualizedVector）。
   *
   * PRD 3.7.1 条：根据 scope 获取向量数据库的可视化信息。
   * - health：向量数据库连接状态、响应时间、启用状态（通过 VectorDB 组件探测）；
   * - volume：向量总数、集合名、维度（通过 VectorDB 组件获取）；
   * - diskUsage：占用磁盘空间（通过 RelationDBProvider 的 SQLite PRAGMA + VectorDB 组件目录大小获取）。
   *
   * @param input 入参（scope）
   * @param context 执行上下文
   * @param output 出参（data 可视化数据）
   */
  async visualizedVector(
    input: VisualizedVectorInput,
    _context: VectorContext,
    output: VisualizedVectorOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const scope = String(input.scope);

    if (scope === 'health') {
      const start = Date.now();
      // 通过一次 count 探测向量数据库连接可用性与响应时间
      await this.vectorDb.count();
      output.data = {
        connected: true,
        response_time_ms: Date.now() - start,
        enabled: this.enabled,
      };
    } else if (scope === 'volume') {
      const total = await this.vectorDb.count();
      output.data = {
        total_vectors: total,
        collection: this.vectorDb.getTableName(),
        dimension: this.vectorDb.getDimension(),
      };
    } else if (scope === 'diskUsage') {
      // 磁盘占用基于关系数据库 SQLite 文件统计（配置表所在数据库）
      const pageSizes = this.relationDb.queryRaw<{ page_size: number }>(
        'PRAGMA page_size',
      );
      const pageCounts = this.relationDb.queryRaw<{ page_count: number }>(
        'PRAGMA page_count',
      );
      const pageSize =
        pageSizes.length > 0 ? Number(pageSizes[0].page_size) : 0;
      const pageCount =
        pageCounts.length > 0 ? Number(pageCounts[0].page_count) : 0;
      output.data = {
        disk_usage_bytes: pageSize * pageCount,
        page_size: pageSize,
        page_count: pageCount,
        vector_db_usage_bytes: this.vectorDb.getDiskUsage(),
      };
    } else {
      output.error = `未知的可视化范围: ${scope}`;
      output.error_code = 'INVALID_SCOPE';
      return false;
    }
    return true;
  }

  /**
   * 启用/禁用向量数据库（enableVectorDB）。
   *
   * PRD 3.7.2 条：运行时控制向量数据库的可用状态。
   * 状态同步持久化到 vectordb_config，组件初始化时恢复。
   * 禁用期间所有向量数据操作将返回失败。
   *
   * 注：closeVectorDB 为终态操作，执行后不可通过本方法恢复，需重新初始化组件。
   *
   * @param input 入参（enable）
   * @param context 执行上下文
   * @param output 出参
   */
  async enableVectorDB(
    input: EnableVectorDBInput,
    _context: VectorContext,
    _output: EnableVectorDBOutput,
  ): Promise<boolean> {
    if (this.closed) {
      throw new DatabaseError(
        '向量数据库已关闭（closeVectorDB 为终态操作），需重新初始化组件',
      );
    }
    this.enabled = input.enable;
    await this.config.set(
      'enabled',
      String(input.enable),
      'BOOLEAN',
      '向量数据库是否启用（enableVectorDB 读写）',
    );
    return true;
  }

  /**
   * 关闭向量数据库连接（closeVectorDB）。
   *
   * PRD 3.7.3 条：系统关闭时的终态释放，执行后不可通过 enableVectorDB 恢复，
   * 需重新初始化组件。
   *
   * 关闭 VectorDB 组件，释放底层数据库连接资源。
   *
   * @param input 入参
   * @param context 执行上下文
   * @param output 出参
   */
  async closeVectorDB(
    _input: CloseVectorDBInput,
    _context: VectorContext,
    _output: CloseVectorDBOutput,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;
    this.vectorDb.close();
    return true;
  }
}
