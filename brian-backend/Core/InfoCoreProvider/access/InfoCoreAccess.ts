/**
 * @fileoverview InfoCoreProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化表结构（通过 InfoCoreSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用（方法签名保持 input/output 序列化友好）。
 */

import type {
  RelationDBAccess,
  LLMAccess,
  PromptsAccess,
  VectorDBAccess,
  GraphDBAccess,
} from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { InfoCoreSchemaInitializer } from '../infrastructure/InfoCoreSchemaInitializer';
import { InfoCoreService } from '../application/InfoCoreService';
import {
  InfoCoreContext,
  SaveInfoInput,
  SaveInfoOutput,
  PinInfoInput,
  PinInfoOutput,
  ProcessInfoInput,
  VectorInfoOutput,
  TagInfoOutput,
  SummaryInfoOutput,
  KeywordInfoOutput,
  GraphTagInput,
  GraphTagOutput,
  LastNInfoInput,
  LastNInfoOutput,
  GraphNInfoInput,
  GraphNInfoOutput,
  SimilarKInfoInput,
  SimilarKInfoOutput,
  KeywordKInfoInput,
  KeywordKInfoOutput,
  RelationKInfoInput,
  RelationKInfoOutput,
  GraphInfoInput,
  GraphInfoOutput,
  ContextInfoInput,
  ContextInfoOutput,
  SoInfoTagConfigInput,
  SoInfoTagConfigOutput,
  UpdateInfoTagConfigInput,
  UpdateInfoTagConfigOutput,
  SoInfoSummaryConfigInput,
  SoInfoSummaryConfigOutput,
  UpdateInfoSummaryConfigInput,
  UpdateInfoSummaryConfigOutput,
  SoInfoConfigInput,
  SoInfoConfigOutput,
  UpdateInfoConfigInput,
  UpdateInfoConfigOutput,
  SoInfoVectorConfigInput,
  SoInfoVectorConfigOutput,
  UpdateInfoVectorConfigInput,
  UpdateInfoVectorConfigOutput,
  SoInfoContextConfigInput,
  SoInfoContextConfigOutput,
  UpdateInfoContextConfigInput,
  UpdateInfoContextConfigOutput,
  DelInfoInput,
  DelInfoOutput,
  ExistInfoInput,
  ExistInfoOutput,
} from '../domain/types';

/**
 * InfoCoreProvider 接入层。
 *
 * 作为信息全生命周期管理的唯一操作入口，上层通过本类访问信息存储、处理、搜索、
 * 配置与清理能力。
 *
 * 用法示例：
 * ```typescript
 * const infoCore = new InfoCoreAccess(relationDb, llmAccess, promptsAccess, vectorDb, graphDb);
 * await infoCore.initialize();
 *
 * const output = new SaveInfoOutput();
 * await infoCore.saveInfo(
 *   { session_id: 's1', work_id: '', interact_id: '', info_creator_id: 'u1', info_creator_role: 'user', info: '...' },
 *   new InfoCoreContext(),
 *   output,
 * );
 * console.log(output.info_id);
 * ```
 */
export class InfoCoreAccess {
  private readonly service: InfoCoreService;

  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param llmAccess LLMProvider 接入层实例
   * @param promptsAccess PromptsProvider 接入层实例
   * @param vectorDb VectorDBProvider 接入层实例
   * @param graphDb GraphDBProvider 接入层实例
   * @param logger 可选日志记录器
   */
  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    vectorDb: VectorDBAccess,
    graphDb: GraphDBAccess,
    logger?: Logger,
  ) {
    new InfoCoreSchemaInitializer(relationDb).init();
    const rawService = new InfoCoreService(
      relationDb,
      llmAccess,
      promptsAccess,
      vectorDb,
      graphDb,
    );
    this.service = AopProxy.wrap(rawService, { logger });
  }

  /**
   * 初始化组件：写入默认配置。
   */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  /** 保存原始信息，异步触发向量化、标签、摘要、关键词处理 */
  async saveInfo(
    input: SaveInfoInput,
    context: InfoCoreContext,
    output: SaveInfoOutput,
  ): Promise<boolean> {
    return this.service.saveInfo(input, context, output);
  }

  /** 切换信息 pin 状态 */
  async pinInfo(
    input: PinInfoInput,
    context: InfoCoreContext,
    output: PinInfoOutput,
  ): Promise<boolean> {
    return this.service.pinInfo(input, context, output);
  }

  // -------------------------------------------------------------------------
  // Process
  // -------------------------------------------------------------------------

  /** 向量化信息 */
  async vectorInfo(
    input: ProcessInfoInput,
    context: InfoCoreContext,
    output: VectorInfoOutput,
  ): Promise<boolean> {
    return this.service.vectorInfo(input, context, output);
  }

  /** 使用 LLM 提取标签 */
  async tagInfo(
    input: ProcessInfoInput,
    context: InfoCoreContext,
    output: TagInfoOutput,
  ): Promise<boolean> {
    return this.service.tagInfo(input, context, output);
  }

  /** 生成信息摘要 */
  async summaryInfo(
    input: ProcessInfoInput,
    context: InfoCoreContext,
    output: SummaryInfoOutput,
  ): Promise<boolean> {
    return this.service.summaryInfo(input, context, output);
  }

  /** 提取关键词 */
  async keywordInfo(
    input: ProcessInfoInput,
    context: InfoCoreContext,
    output: KeywordInfoOutput,
  ): Promise<boolean> {
    return this.service.keywordInfo(input, context, output);
  }

  /** 为标签创建图节点并联接相关 info */
  async graphTag(
    input: GraphTagInput,
    context: InfoCoreContext,
    output: GraphTagOutput,
  ): Promise<boolean> {
    return this.service.graphTag(input, context, output);
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /** 时间线搜索：最近 N 条 */
  async lastNInfo(
    input: LastNInfoInput,
    context: InfoCoreContext,
    output: LastNInfoOutput,
  ): Promise<boolean> {
    return this.service.lastNInfo(input, context, output);
  }

  /** 图邻居搜索 */
  async graphNInfo(
    input: GraphNInfoInput,
    context: InfoCoreContext,
    output: GraphNInfoOutput,
  ): Promise<boolean> {
    return this.service.graphNInfo(input, context, output);
  }

  /** 语义相似度搜索 */
  async similarKInfo(
    input: SimilarKInfoInput,
    context: InfoCoreContext,
    output: SimilarKInfoOutput,
  ): Promise<boolean> {
    return this.service.similarKInfo(input, context, output);
  }

  /** 关键词搜索 */
  async keywordKInfo(
    input: KeywordKInfoInput,
    context: InfoCoreContext,
    output: KeywordKInfoOutput,
  ): Promise<boolean> {
    return this.service.keywordKInfo(input, context, output);
  }

  /** 标签关联搜索 */
  async relationKInfo(
    input: RelationKInfoInput,
    context: InfoCoreContext,
    output: RelationKInfoOutput,
  ): Promise<boolean> {
    return this.service.relationKInfo(input, context, output);
  }

  /** 会话图可视化 */
  async graphInfo(
    input: GraphInfoInput,
    context: InfoCoreContext,
    output: GraphInfoOutput,
  ): Promise<boolean> {
    return this.service.graphInfo(input, context, output);
  }

  /** 构建 Agent 上下文（五源融合） */
  async context(
    input: ContextInfoInput,
    context: InfoCoreContext,
    output: ContextInfoOutput,
  ): Promise<boolean> {
    return this.service.context(input, context, output);
  }

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------

  /** 获取标签配置 */
  async soInfoTagConfig(
    input: SoInfoTagConfigInput,
    context: InfoCoreContext,
    output: SoInfoTagConfigOutput,
  ): Promise<boolean> {
    return this.service.soInfoTagConfig(input, context, output);
  }

  /** 更新标签配置 */
  async updateInfoTagConfig(
    input: UpdateInfoTagConfigInput,
    context: InfoCoreContext,
    output: UpdateInfoTagConfigOutput,
  ): Promise<boolean> {
    return this.service.updateInfoTagConfig(input, context, output);
  }

  /** 获取摘要配置 */
  async soInfoSummaryConfig(
    input: SoInfoSummaryConfigInput,
    context: InfoCoreContext,
    output: SoInfoSummaryConfigOutput,
  ): Promise<boolean> {
    return this.service.soInfoSummaryConfig(input, context, output);
  }

  /** 更新摘要配置 */
  async updateInfoSummaryConfig(
    input: UpdateInfoSummaryConfigInput,
    context: InfoCoreContext,
    output: UpdateInfoSummaryConfigOutput,
  ): Promise<boolean> {
    return this.service.updateInfoSummaryConfig(input, context, output);
  }

  /** 获取全局配置 */
  async soInfoConfig(
    input: SoInfoConfigInput,
    context: InfoCoreContext,
    output: SoInfoConfigOutput,
  ): Promise<boolean> {
    return this.service.soInfoConfig(input, context, output);
  }

  /** 更新全局配置 */
  async updateInfoConfig(
    input: UpdateInfoConfigInput,
    context: InfoCoreContext,
    output: UpdateInfoConfigOutput,
  ): Promise<boolean> {
    return this.service.updateInfoConfig(input, context, output);
  }

  /** 获取向量配置 */
  async soInfoVectorConfig(
    input: SoInfoVectorConfigInput,
    context: InfoCoreContext,
    output: SoInfoVectorConfigOutput,
  ): Promise<boolean> {
    return this.service.soInfoVectorConfig(input, context, output);
  }

  /** 更新向量配置 */
  async updateInfoVectorConfig(
    input: UpdateInfoVectorConfigInput,
    context: InfoCoreContext,
    output: UpdateInfoVectorConfigOutput,
  ): Promise<boolean> {
    return this.service.updateInfoVectorConfig(input, context, output);
  }

  /** 获取上下文构建配置 */
  async soInfoContextConfig(
    input: SoInfoContextConfigInput,
    context: InfoCoreContext,
    output: SoInfoContextConfigOutput,
  ): Promise<boolean> {
    return this.service.soInfoContextConfig(input, context, output);
  }

  /** 更新上下文构建配置 */
  async updateInfoContextConfig(
    input: UpdateInfoContextConfigInput,
    context: InfoCoreContext,
    output: UpdateInfoContextConfigOutput,
  ): Promise<boolean> {
    return this.service.updateInfoContextConfig(input, context, output);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** 清理过期信息（级联） */
  async delInfo(
    input: DelInfoInput,
    context: InfoCoreContext,
    output: DelInfoOutput,
  ): Promise<boolean> {
    return this.service.delInfo(input, context, output);
  }

  // -------------------------------------------------------------------------
  // Assist
  // -------------------------------------------------------------------------

  /** 检查 info_vector 是否存在 */
  async existVectorInfo(
    input: ExistInfoInput,
    context: InfoCoreContext,
    output: ExistInfoOutput,
  ): Promise<boolean> {
    return this.service.existVectorInfo(input, context, output);
  }

  /** 检查 info_tag 是否存在 */
  async existTagInfo(
    input: ExistInfoInput,
    context: InfoCoreContext,
    output: ExistInfoOutput,
  ): Promise<boolean> {
    return this.service.existTagInfo(input, context, output);
  }

  /** 检查 info_summary 是否存在 */
  async existSummaryInfo(
    input: ExistInfoInput,
    context: InfoCoreContext,
    output: ExistInfoOutput,
  ): Promise<boolean> {
    return this.service.existSummaryInfo(input, context, output);
  }
}
