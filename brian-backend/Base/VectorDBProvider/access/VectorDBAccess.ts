/**
 * @fileoverview VectorDBProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 创建 VectorDB 组件并初始化表结构（通过 VectorDBSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用（方法签名保持 input/output 序列化友好）。
 *
 * 上层（其他 Provider、application 层）通过本类访问向量数据，不直接接触 Service。
 *
 * 依赖关系：
 * - 向量数据（vector_record 表）存储于 VectorDB 组件（LanceDB 向量数据库）；
 * - 配置项（vectordb_config）存储于关系数据库（由 RelationDBProvider 管理）。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { VectorDBComponent } from '../../components/VectorDB/VectorDBComponent';
import { VectorDBSchemaInitializer } from '../infrastructure/VectorDBSchemaInitializer';
import { VectorDBService } from '../application/VectorDBService';
import { VECTORDB_CONFIG_TABLE } from '../domain/types';
import {
  VectorContext,
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
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

/** 默认向量维度（OpenAI text-embedding 系列常用 1536） */
const DEFAULT_DIMENSION = 1536;

/** 默认距离度量方式 */
const DEFAULT_METRIC = 'cosine';

/**
 * VectorDBProvider 接入层选项。
 */
export interface VectorDBAccessOptions {
  /** LanceDB 数据目录路径 */
  lancePath: string;
  /** 向量维度（由上层 Embedding 模型决定，默认 1536） */
  dimension?: number;
  /** 距离度量方式：cosine（默认）/ euclidean / dot */
  metric?: string;
  /** 可选日志记录器 */
  logger?: Logger;
}

/**
 * VectorDBProvider 接入层。
 *
 * 作为向量数据的唯一操作入口，上层通过本类访问向量数据。
 *
 * 用法示例：
 * ```typescript
 * const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
 * await relationDb.initialize();
 *
 * const vectorDb = new VectorDBAccess(relationDb, {
 *   lancePath: './data/vectordb',
 *   dimension: 1536,
 * });
 * await vectorDb.initialize();
 *
 * const output = new AddVectorOutput();
 * await vectorDb.addVector(
 *   { vectors: [{ content: '示例', embedding: [0.1, 0.2, 0.3] }] },
 *   new VectorContext(),
 *   output,
 * );
 * console.log(output.ids);
 * ```
 */
export class VectorDBAccess {
  private readonly service: VectorDBService;

  private readonly vectorDb: VectorDBComponent;

  private readonly schemaInitializer: VectorDBSchemaInitializer;

  private readonly relationDb: RelationDBAccess;

  private readonly dimension: number;

  private metric: string;

  /**
   * @param relationDb RelationDBProvider 接入层实例（用于配置表）
   * @param options VectorDB 选项（LanceDB 数据目录、维度、度量方式、日志记录器）
   */
  constructor(
    relationDb: RelationDBAccess,
    options: VectorDBAccessOptions,
  ) {
    this.relationDb = relationDb;
    this.dimension = options.dimension ?? DEFAULT_DIMENSION;
    this.metric = options.metric ?? DEFAULT_METRIC;

    this.vectorDb = new VectorDBComponent(options.lancePath);

    this.schemaInitializer = new VectorDBSchemaInitializer(relationDb, this.vectorDb);

    const rawService = new VectorDBService(this.vectorDb, relationDb);
    this.service = AopProxy.wrap(rawService, { logger: options.logger });
  }

  /**
   * 初始化组件：先创建配置表、写默认值、恢复存储的 metric，再初始化 LanceDB。
   *
   * 必须在首次使用前调用。
   */
  async initialize(): Promise<void> {
    // 1. 创建关系数据库配置表（仅创建表结构，不初始化 LanceDB）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${VECTORDB_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);

    // 2. 初始化配置服务（写入默认配置项，包括 default_distance_metric = COSINE）
    await this.service.initializeConfig();

    // 3. 从配置表读取存储的距离度量方式，优先于构造器参数
    const storedMetric = this.service.getStoredMetric();
    if (storedMetric) {
      this.metric = storedMetric;
    }

    // 4. 用最终确定的 metric 初始化 LanceDB 表
    await this.vectorDb.init(this.dimension, this.metric);
  }

  /** 获取当前向量总数（用于判断是否存在数据） */
  async getVectorCount(): Promise<number> {
    return this.vectorDb.count();
  }

  /** 获取当前度量方式 */
  getMetric(): string {
    return this.vectorDb.getMetric();
  }

  /** 新增/更新向量（upsert） */
  async addVector(
    input: AddVectorInput,
    context: VectorContext,
    output: AddVectorOutput,
  ): Promise<boolean> {
    return this.service.addVector(input, context, output);
  }

  /** 删除向量（按 ID 批量） */
  async delVector(
    input: DelVectorInput,
    context: VectorContext,
    output: DelVectorOutput,
  ): Promise<boolean> {
    return this.service.delVector(input, context, output);
  }

  /** 按条件删除向量 */
  async delVectorByFilter(
    input: DelVectorByFilterInput,
    context: VectorContext,
    output: DelVectorByFilterOutput,
  ): Promise<boolean> {
    return this.service.delVectorByFilter(input, context, output);
  }

  /** 搜索向量（相似度搜索） */
  async soVector(
    input: SoVectorInput,
    context: VectorContext,
    output: SoVectorOutput,
  ): Promise<boolean> {
    return this.service.soVector(input, context, output);
  }

  /** 获取向量（按 ID） */
  async getVector(
    input: GetVectorInput,
    context: VectorContext,
    output: GetVectorOutput,
  ): Promise<boolean> {
    return this.service.getVector(input, context, output);
  }

  /** 统计向量数量 */
  async countVector(
    input: CountVectorInput,
    context: VectorContext,
    output: CountVectorOutput,
  ): Promise<boolean> {
    return this.service.countVector(input, context, output);
  }

  /** 可视化数据 */
  async visualizedVector(
    input: VisualizedVectorInput,
    context: VectorContext,
    output: VisualizedVectorOutput,
  ): Promise<boolean> {
    return this.service.visualizedVector(input, context, output);
  }

  /** 启用/禁用向量数据库 */
  async enableVectorDB(
    input: EnableVectorDBInput,
    context: VectorContext,
    output: EnableVectorDBOutput,
  ): Promise<boolean> {
    return this.service.enableVectorDB(input, context, output);
  }

  /** 关闭向量数据库连接（终态操作） */
  async closeVectorDB(
    input: CloseVectorDBInput,
    context: VectorContext,
    output: CloseVectorDBOutput,
  ): Promise<boolean> {
    return this.service.closeVectorDB(input, context, output);
  }
}