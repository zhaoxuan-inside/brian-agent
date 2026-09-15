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

import { Metrics, Report } from '@brian-agent/base';
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
  RebuildCooccurGraphInput,
  RebuildCooccurGraphOutput,
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
  SoCitationEdgesInput,
  SoCitationEdgesOutput,
  DelInfoGraphInput,
  DelInfoGraphOutput,
  ClearGraphInput,
  ClearGraphOutput,
  RebuildCitationGraphInput,
  RebuildCitationGraphOutput,
  ContextInfoInput,
  ContextInfoOutput,
  SoContextByWorkInput,
  SoContextByWorkOutput,
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
  UpdateInfoInput,
  UpdateInfoOutput,
  DelInfoByWorkInput,
  DelInfoByWorkOutput,
  DelInfoBySessionInput,
  DelInfoBySessionOutput,
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
 *   { session_id: 's1', work_id: '', run_id: '', info_type: 'REQUEST', info_creator_role: 'USER', info_creator_id: '', info: '...' },
 *   output, new InfoCoreContext(),
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
  async saveInfo(input: SaveInfoInput, output: SaveInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.saveInfo(input, output, context, metrics, report);
  }

  /** 切换信息 pin 状态 */
  async pinInfo(input: PinInfoInput, output: PinInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.pinInfo(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // Process
  // -------------------------------------------------------------------------

  /** 向量化信息 */
  async vectorInfo(input: ProcessInfoInput, output: VectorInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.vectorInfo(input, output, context, metrics, report);
  }

  /** 使用 LLM 提取标签 */
  async tagInfo(input: ProcessInfoInput, output: TagInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.tagInfo(input, output, context, metrics, report);
  }

  /** 生成信息摘要 */
  async summaryInfo(input: ProcessInfoInput, output: SummaryInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.summaryInfo(input, output, context, metrics, report);
  }

  /** 提取关键词 */
  async keywordInfo(input: ProcessInfoInput, output: KeywordInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.keywordInfo(input, output, context, metrics, report);
  }

  /** 为标签创建图节点并联接相关 info */
  async graphTag(input: GraphTagInput, output: GraphTagOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.graphTag(input, output, context, metrics, report);
  }

  /** 从 info_tag 表全量重建共现边（cooccur），用于存量数据回填 */
  async rebuildCooccurGraph(input: RebuildCooccurGraphInput, output: RebuildCooccurGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.rebuildCooccurGraph(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /** 时间线搜索：最近 N 条 */
  async lastNInfo(input: LastNInfoInput, output: LastNInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.lastNInfo(input, output, context, metrics, report);
  }

  /** 图邻居搜索 */
  async graphNInfo(input: GraphNInfoInput, output: GraphNInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.graphNInfo(input, output, context, metrics, report);
  }

  /** 语义相似度搜索 */
  async similarKInfo(input: SimilarKInfoInput, output: SimilarKInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.similarKInfo(input, output, context, metrics, report);
  }

  /** 关键词搜索 */
  async keywordKInfo(input: KeywordKInfoInput, output: KeywordKInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.keywordKInfo(input, output, context, metrics, report);
  }

  /** 标签关联搜索 */
  async relationKInfo(input: RelationKInfoInput, output: RelationKInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.relationKInfo(input, output, context, metrics, report);
  }

  /** 会话图可视化 */
  async graphInfo(input: GraphInfoInput, output: GraphInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.graphInfo(input, output, context, metrics, report);
  }

  /** 查询 GraphDB 引用边（CITATION），替代旧 info_graph 表 */
  async soCitationEdges(input: SoCitationEdgesInput, output: SoCitationEdgesOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soCitationEdges(input, output, context, metrics, report);
  }

  /** 级联删除 GraphDB info 节点与引用边 */
  async delInfoGraph(input: DelInfoGraphInput, output: DelInfoGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delInfoGraph(input, output, context, metrics, report);
  }

  /** 一键清理某类文本图（node_type 节点及其边） */
  async clearGraph(input: ClearGraphInput, output: ClearGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.clearGraph(input, output, context, metrics, report);
  }

  /** 迁移旧 info_graph 表数据到 GraphDB，并删除旧表 */
  async rebuildCitationGraph(input: RebuildCitationGraphInput, output: RebuildCitationGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.rebuildCitationGraph(input, output, context, metrics, report);
  }

  /** 构建 Agent 上下文（五源融合） */
  async context(input: ContextInfoInput, output: ContextInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.context(input, output, context, metrics, report);
  }

  /** 按 work_id 查询该次问答使用到的上下文（三对象结构） */
  async soContextByWork(input: SoContextByWorkInput, output: SoContextByWorkOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soContextByWork(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------

  /** 获取标签配置 */
  async soInfoTagConfig(input: SoInfoTagConfigInput, output: SoInfoTagConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soInfoTagConfig(input, output, context, metrics, report);
  }

  /** 更新标签配置 */
  async updateInfoTagConfig(input: UpdateInfoTagConfigInput, output: UpdateInfoTagConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfoTagConfig(input, output, context, metrics, report);
  }

  /** 获取摘要配置 */
  async soInfoSummaryConfig(input: SoInfoSummaryConfigInput, output: SoInfoSummaryConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soInfoSummaryConfig(input, output, context, metrics, report);
  }

  /** 更新摘要配置 */
  async updateInfoSummaryConfig(input: UpdateInfoSummaryConfigInput, output: UpdateInfoSummaryConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfoSummaryConfig(input, output, context, metrics, report);
  }

  /** 获取全局配置 */
  async soInfoConfig(input: SoInfoConfigInput, output: SoInfoConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soInfoConfig(input, output, context, metrics, report);
  }

  /** 更新全局配置 */
  async updateInfoConfig(input: UpdateInfoConfigInput, output: UpdateInfoConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfoConfig(input, output, context, metrics, report);
  }

  /** 获取向量配置 */
  async soInfoVectorConfig(input: SoInfoVectorConfigInput, output: SoInfoVectorConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soInfoVectorConfig(input, output, context, metrics, report);
  }

  /** 更新向量配置 */
  async updateInfoVectorConfig(input: UpdateInfoVectorConfigInput, output: UpdateInfoVectorConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfoVectorConfig(input, output, context, metrics, report);
  }

  /** 获取上下文构建配置 */
  async soInfoContextConfig(input: SoInfoContextConfigInput, output: SoInfoContextConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soInfoContextConfig(input, output, context, metrics, report);
  }

  /** 更新上下文构建配置 */
  async updateInfoContextConfig(input: UpdateInfoContextConfigInput, output: UpdateInfoContextConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfoContextConfig(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** 清理过期信息（级联） */
  async delInfo(input: DelInfoInput, output: DelInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delInfo(input, output, context, metrics, report);
  }

  /** 改写指定 work 下某 info_type 的 info 内容（如需求确认 APPROVE 替换 REQUEST）。 */
  async updateInfo(input: UpdateInfoInput, output: UpdateInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfo(input, output, context, metrics, report);
  }

  /** 删除指定 work 落库的全部信息及派生数据（如需求确认 CANCEL 丢弃本次提问）。 */
  async delInfoByWork(input: DelInfoByWorkInput, output: DelInfoByWorkOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delInfoByWork(input, output, context, metrics, report);
  }

  /** ===== 新增（2026-09-15 记忆集中）：删除指定 session 的全部记忆信息与派生数据（快照/摘要/标签/关键词/向量），级联 GraphDB ===== */
  async delInfoBySession(input: DelInfoBySessionInput, output: DelInfoBySessionOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delInfoBySession(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // Assist
  // -------------------------------------------------------------------------

  /** 检查 info_vector 是否存在 */
  async existVectorInfo(input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.existVectorInfo(input, output, context, metrics, report);
  }

  /** 检查 info_tag 是否存在 */
  async existTagInfo(input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.existTagInfo(input, output, context, metrics, report);
  }

  /** 检查 info_summary 是否存在 */
  async existSummaryInfo(input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.existSummaryInfo(input, output, context, metrics, report);
  }
}
