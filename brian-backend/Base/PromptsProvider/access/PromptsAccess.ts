/**
 * @fileoverview PromptsProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化表结构（通过 PromptsSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用。
 */

import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { PromptsSchemaInitializer } from '../infrastructure/PromptsSchemaInitializer';
import { PromptsService } from '../application/PromptsService';
import { PromptCatalogAccess } from '../../PromptCatalog/access/PromptCatalogAccess';
import {
  PromptContext,
  AddPromptInput,
  AddPromptOutput,
  DelPromptInput,
  DelPromptOutput,
  UpdatePromptInput,
  UpdatePromptOutput,
  GetPromptInput,
  GetPromptOutput,
  SoPromptInput,
  SoPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  EnablePromptsInput,
  EnablePromptsOutput,
  ClosePromptInput,
  ClosePromptOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

/**
 * PromptsProvider 接入层。
 *
 * 作为 Prompt 模板的唯一操作入口，上层通过本类访问 Prompt 数据。
 *
 * 用法示例：
 * ```typescript
 * const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
 * await relationDb.initialize();
 *
 * const promptsAccess = new PromptsAccess(relationDb);
 * await promptsAccess.initialize();
 *
 * const output = new AddPromptOutput();
 * await promptsAccess.addPrompt(
 *   { data: { prompt_template_title: '...', prompt_template: '...' } },
 *   output, new PromptContext(),
 * );
 * ```
 */
export class PromptsAccess {
  private readonly service: PromptsService;
  private readonly catalog: PromptCatalogAccess;

  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param logger 可选日志记录器
   */
  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    // 初始化表结构
    new PromptsSchemaInitializer(relationDb).init();
    // 创建 Service 并通过代理模式增加切面注入能力
    const rawService = new PromptsService(relationDb);
    this.service = AopProxy.wrap(rawService, { logger });
    this.catalog = new PromptCatalogAccess(relationDb);
  }

  // ===== 原始方法（保留作为参考）=====
  // async initialize(): Promise<void> {
  //   await this.service.initialize();
  //   await this.catalog.seed();
  // }

  // ===== 修改后的方法（移除代码内置 Prompt 播种，统一由 PromptProvider / DB 模板管理） =====
  /**
   * 初始化组件：写入默认配置并恢复 enabled 状态。
   */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 新增 Prompt */
  async addPrompt(input: AddPromptInput, output: AddPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addPrompt(input, output, context, metrics, report);
  }

  /** 删除 Prompt */
  async delPrompt(input: DelPromptInput, output: DelPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delPrompt(input, output, context, metrics, report);
  }

  /** 更新 Prompt */
  async updatePrompt(input: UpdatePromptInput, output: UpdatePromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updatePrompt(input, output, context, metrics, report);
  }

  /** 获取 Prompt */
  async soPromptById(input: GetPromptInput, output: GetPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soPromptById(input, output, context, metrics, report);
  }

  /** 搜索 Prompt */
  async soPrompt(input: SoPromptInput, output: SoPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soPrompt(input, output, context, metrics, report);
  }

  /** 执行/渲染 Prompt */
  async execPrompt(input: ExecPromptInput, output: ExecPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execPrompt(input, output, context, metrics, report);
  }

  /** 启用/禁用 Prompts 组件 */
  async enablePrompts(input: EnablePromptsInput, output: EnablePromptsOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enablePrompts(input, output, context, metrics, report);
  }

  /** 关闭 Prompts 组件（终态操作） */
  async closePrompts(input: ClosePromptInput, output: ClosePromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.closePrompts(input, output, context, metrics, report);
  }
}
