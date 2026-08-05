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

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
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
 *   new LLMContext(),
 *   output,
 * );
 * ```
 */
export class LLMAccess {
  private readonly service: LLMService;

  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param logger 可选日志记录器
   */
  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    // 初始化表结构
    new LLMSchemaInitializer(relationDb).init();
    // 创建 Service 并通过代理模式增加切面注入能力
    const rawService = new LLMService(relationDb);
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
  async addLLMProvider(
    input: AddLLMProviderInput,
    context: LLMContext,
    output: AddLLMProviderOutput,
  ): Promise<boolean> {
    return this.service.addLLMProvider(input, context, output);
  }

  /** 更新 LLM 提供商 */
  async updateLLMProvider(
    input: UpdateLLMProviderInput,
    context: LLMContext,
    output: UpdateLLMProviderOutput,
  ): Promise<boolean> {
    return this.service.updateLLMProvider(input, context, output);
  }

  /** 删除 LLM 提供商（级联删除 llm_cache + llm_available + llm_usage） */
  async delLLMProvider(
    input: DelLLMProviderInput,
    context: LLMContext,
    output: DelLLMProviderOutput,
  ): Promise<boolean> {
    return this.service.delLLMProvider(input, context, output);
  }

  /** 搜索 LLM 提供商 */
  async soLLMProvider(
    input: SoLLMProviderInput,
    context: LLMContext,
    output: SoLLMProviderOutput,
  ): Promise<boolean> {
    return this.service.soLLMProvider(input, context, output);
  }

  /** 测试 LLM 提供商连接 */
  async testLLMProvider(
    input: TestLLMProviderInput,
    context: LLMContext,
    output: TestLLMProviderOutput,
  ): Promise<boolean> {
    return this.service.testLLMProvider(input, context, output);
  }

  /** 获取 LLM 模型列表（从提供商 API 拉取并保存到 llm_model） */
  async listLLM(
    input: ListLLMInput,
    context: LLMContext,
    output: ListLLMOutput,
  ): Promise<boolean> {
    return this.service.listLLM(input, context, output);
  }

  // -------------------------------------------------------------------------
  // LLM 模型管理
  // -------------------------------------------------------------------------

  /** 新增 LLM（添加到启用列表 llm_enable） */
  async addLLM(
    input: AddLLMInput,
    context: LLMContext,
    output: AddLLMOutput,
  ): Promise<boolean> {
    return this.service.addLLM(input, context, output);
  }

  /** 删除 LLM */
  async delLLM(
    input: DelLLMInput,
    context: LLMContext,
    output: DelLLMOutput,
  ): Promise<boolean> {
    return this.service.delLLM(input, context, output);
  }

  /** 更新 LLM */
  async updateLLM(
    input: UpdateLLMInput,
    context: LLMContext,
    output: UpdateLLMOutput,
  ): Promise<boolean> {
    return this.service.updateLLM(input, context, output);
  }

  /** 搜索可用模型（支持关键词搜索名称） */
  async soLLM(
    input: SoLLMInput,
    context: LLMContext,
    output: SoLLMOutput,
  ): Promise<boolean> {
    return this.service.soLLM(input, context, output);
  }

  /** @deprecated 已合并到 soLLM */
  async getLLM(
    input: GetLLMInput,
    context: LLMContext,
    output: GetLLMOutput,
  ): Promise<boolean> {
    const soInput = Object.assign(new SoLLMInput(), {
      conditions: input.id
        ? [{ field: 'id', operator: 'EQ' as never, value: input.id }]
        : input.conditions,
    });
    const soOutput = new SoLLMOutput();
    await this.soLLM(soInput, context, soOutput);
    output.llm = (soOutput.list[0] as unknown as GetLLMOutput['llm']) || null;
    return true;
  }

  // -------------------------------------------------------------------------
  // LLM 调用与运维
  // -------------------------------------------------------------------------

  /** 调用 LLM 执行推理 */
  async execLLM(
    input: ExecLLMInput,
    context: LLMContext,
    output: ExecLLMOutput,
  ): Promise<boolean> {
    return this.service.execLLM(input, context, output);
  }

  /** 可视化数据 */
  async visualizedLLM(
    input: VisualizedLLMInput,
    context: LLMContext,
    output: VisualizedLLMOutput,
  ): Promise<boolean> {
    return this.service.visualizedLLM(input, context, output);
  }

  /** 启用/禁用 LLM 组件 */
  async enableLLM(
    input: EnableLLMInput,
    context: LLMContext,
    output: EnableLLMOutput,
  ): Promise<boolean> {
    return this.service.enableLLM(input, context, output);
  }
}
