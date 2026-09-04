/**
 * @fileoverview LLMProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化表结构（通过 LLMSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用（方法签名保持 input/output 序列化友好）。
 *
 * 上层（其他 Provider、application 层）通过本类访问 LLM 数据与调用能力，
 * 不直接接触 Service 或 LLM 提供商 API。
 */

import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { PromptsAccess } from '../../PromptsProvider/access/PromptsAccess';
import { LLMSchemaInitializer } from '../infrastructure/LLMSchemaInitializer';
import { LLMService } from '../application/LLMService';
import {
  LLMContext,
  AddLLMProviderInput,
  AddLLMProviderOutput,
  UpdateLLMProviderInput,
  UpdateLLMProviderOutput,
  DelLLMProviderInput,
  DelLLMProviderOutput,
  SoLLMProviderInput,
  SoLLMProviderOutput,
  TestLLMProviderInput,
  TestLLMProviderOutput,
  ListLLMInput,
  ListLLMOutput,
  AddLLMInput,
  AddLLMOutput,
  DelLLMInput,
  DelLLMOutput,
  UpdateLLMInput,
  UpdateLLMOutput,
  SoLLMInput,
  SoLLMOutput,
  GetLLMInput,
  GetLLMOutput,
  ExecLLMInput,
  ExecLLMOutput,
  ExecLLMEventsInput,
  ExecLLMEventsOutput,
  EmbedLLMInput,
  EmbedLLMOutput,
  GenLLMAttrInput,
  GenLLMAttrOutput,
  VisualizedLLMInput,
  VisualizedLLMOutput,
  EnableLLMInput,
  EnableLLMOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

/**
 * LLMProvider 接入层。
 *
 * 作为 LLM 的唯一操作入口，上层通过本类访问 LLM 数据与调用能力。
 *
 * 用法示例：
 * ```typescript
 * const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
 * await relationDb.initialize();
 *
 * const llm = new LLMAccess(relationDb);
 * await llm.initialize();
 *
 * const output = new AddLLMProviderOutput();
 * await llm.addLLMProvider(
 *   { data: { llm_provider_url: 'https://api.openai.com', llm_provider_title: 'OpenAI' } },
 *   output, new LLMContext(),
 * );
 * ```
 */
export class LLMAccess {
  private readonly service: LLMService;

  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param logger 可选日志记录器
   * @param promptsAccess 可选 PromptsProvider 接入层实例（genLLMAttr 依赖）
   */
  constructor(relationDb: RelationDBAccess, logger?: Logger, promptsAccess?: PromptsAccess) {
    // 初始化表结构
    new LLMSchemaInitializer(relationDb).init();
    // 创建 Service 并通过代理模式增加切面注入能力
    const rawService = new LLMService(relationDb, logger, promptsAccess);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  /**
   * 初始化组件：写入默认配置并恢复 enabled 状态。
   *
   * 必须在首次使用前调用。
   */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  // -------------------------------------------------------------------------
  // LLM 提供商管理
  // -------------------------------------------------------------------------

  /** 新增 LLM 提供商 */
  async addLLMProvider(input: AddLLMProviderInput, output: AddLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addLLMProvider(input, output, context, metrics, report);
  }

  /** 更新 LLM 提供商 */
  async updateLLMProvider(input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateLLMProvider(input, output, context, metrics, report);
  }

  /** 删除 LLM 提供商（级联删除 llm_cache + llm_available + llm_usage） */
  async delLLMProvider(input: DelLLMProviderInput, output: DelLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delLLMProvider(input, output, context, metrics, report);
  }

  /** 搜索 LLM 提供商 */
  async soLLMProvider(input: SoLLMProviderInput, output: SoLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soLLMProvider(input, output, context, metrics, report);
  }

  /** 测试 LLM 提供商连接 */
  async testLLMProvider(input: TestLLMProviderInput, output: TestLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.testLLMProvider(input, output, context, metrics, report);
  }

  /** 获取 LLM 模型列表（从提供商 API 拉取并保存到 llm_model） */
  async listLLM(input: ListLLMInput, output: ListLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.listLLM(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // LLM 模型管理
  // -------------------------------------------------------------------------

  /** 新增 LLM（添加到启用列表 llm_enable） */
  async addLLM(input: AddLLMInput, output: AddLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addLLM(input, output, context, metrics, report);
  }

  /** 删除 LLM */
  async delLLM(input: DelLLMInput, output: DelLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delLLM(input, output, context, metrics, report);
  }

  /** 更新 LLM */
  async updateLLM(input: UpdateLLMInput, output: UpdateLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateLLM(input, output, context, metrics, report);
  }

  /** 搜索可用模型（支持关键词搜索名称） */
  async soLLM(input: SoLLMInput, output: SoLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soLLM(input, output, context, metrics, report);
  }

  /** @deprecated 已合并到 soLLM */
  async soLLMById(input: GetLLMInput, output: GetLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const soInput = Object.assign(new SoLLMInput(), {
      conditions: input.id
        ? [{ field: 'id', operator: 'EQ' as never, value: input.id }]
        : input.conditions,
    });
    const soOutput = new SoLLMOutput();
    await this.soLLM(soInput, soOutput, context, metrics, report);
    output.llm = (soOutput.list[0] as unknown as GetLLMOutput['llm']) || null;
    return true;
  }

  // -------------------------------------------------------------------------
  // LLM 调用与运维
  // -------------------------------------------------------------------------

  /** 调用 LLM 执行推理 */
  async execLLM(input: ExecLLMInput, output: ExecLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execLLM(input, output, context, metrics, report);
  }

  /** 调用 LLM 原生消息 + 原生工具调用流（Runtime v2 · Loop-PRD §4） */
  async execLLMEvents(input: ExecLLMEventsInput, output: ExecLLMEventsOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execLLMEvents(input, output, context, metrics, report);
  }

  /** 调用 LLM 生成向量 */
  async embedLLM(input: EmbedLLMInput, output: EmbedLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.embedLLM(input, output, context, metrics, report);
  }

  /** 一键补全模型属性（生成简介与模型用途） */
  async genLLMAttr(input: GenLLMAttrInput, output: GenLLMAttrOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.genLLMAttr(input, output, context, metrics, report);
  }

  /** 可视化数据 */
  async visualizedLLM(input: VisualizedLLMInput, output: VisualizedLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.visualizedLLM(input, output, context, metrics, report);
  }

  /** 启用/禁用 LLM 组件 */
  async enableLLM(input: EnableLLMInput, output: EnableLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableLLM(input, output, context, metrics, report);
  }
}
