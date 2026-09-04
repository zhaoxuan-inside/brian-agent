/**
 * @fileoverview Tools 模块接入层（Runtime v2 · 阶段2）。
 *
 * 职责（Tools-PRD §4）：
 * 1. 经 AopProxy.wrap 封装 ToolService，注入日志与耗时切面；
 * 2. 提供 5 参签名（Input, Output, Context, Metrics?, Report?）调用入口；
 * 3. 内置工具经构造参数注入的 Provider（skill/mcp/cdt）执行。
 */

import type { RelationDBAccess, Metrics, Report, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { ToolService } from '../application/ToolService';
import type { BuiltinToolDeps } from '../application/builtinTools';
import {
  ToolContext,
  RegisterToolInput,
  RegisterToolOutput,
  ExecToolInput,
  ExecToolOutput,
  SoToolsInput,
  SoToolsOutput,
  RegisterBuiltinToolsInput,
  RegisterBuiltinToolsOutput,
  ConfigToolInput,
  ConfigToolOutput,
} from '../domain/types';

/**
 * ToolAccess。
 *
 * @param relationDb 保留统一 DI 签名（阶段2 注册表内存态，暂不持久化）
 * @param builtinDeps 内置工具 Provider 依赖（skill/mcp/cdt）
 * @param logger 可选日志
 */
export class ToolAccess {
  private readonly service: ToolService;

  constructor(_relationDb: RelationDBAccess, builtinDeps?: BuiltinToolDeps, logger?: Logger) {
    const rawService = new ToolService(builtinDeps ?? {}, logger);
    this.service = AopProxy.wrap(rawService, { logger }) as ToolService;
  }

  /** 初始化组件 */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 注册工具 */
  async registerTool(input: RegisterToolInput, output: RegisterToolOutput, context: ToolContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.registerTool(input, output, context, metrics, report);
  }

  /** 注册内置工具（幂等） */
  async registerBuiltinTools(input: RegisterBuiltinToolsInput, output: RegisterBuiltinToolsOutput, context: ToolContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.registerBuiltinTools(input, output, context, metrics, report);
  }

  /** 执行单工具调用（配对结果语义） */
  async execTool(input: ExecToolInput, output: ExecToolOutput, context: ToolContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execTool(input, output, context, metrics, report);
  }

  /** 查询工具规格（zod → JSON Schema） */
  async soTools(input: SoToolsInput, output: SoToolsOutput, context: ToolContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soTools(input, output, context, metrics, report);
  }

  /** 模块配置 */
  async configTool(input: ConfigToolInput, output: ConfigToolOutput, context: ToolContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configTool(input, output, context, metrics, report);
  }
}
