/**
 * @fileoverview Tools 模块接入层（Runtime v2 · 阶段2）。
 *
 * 职责（Tools-PRD §4）：
 * 1. 经 AopProxy.wrap 封装 SkillRuntimeService，注入日志与耗时切面；
 * 2. 提供 5 参签名（Input, Output, Context, Metrics?, Report?）调用入口；
 * 3. 内置工具经构造参数注入的 Provider（skill/mcp/cdt）执行。
 */

import type { RelationDBAccess, Metrics, Report, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { SkillRuntimeService } from '../application/SkillRuntimeService';
import type { SkillRuntimeDeps } from '../application/mcpGate';
import {
  SkillRuntimeContext,
  RegisterSkillInput,
  RegisterSkillOutput,
  ExecSkillInput,
  ExecSkillOutput,
  SoSkillsInput,
  SoSkillsOutput,
  RegisterBuiltinSkillsInput,
  RegisterBuiltinSkillsOutput,
  RegisterRunSkillsInput,
  RegisterSkillsOutput,
  ClearRunSkillsInput,
  ConfigToolInput,
  ConfigToolOutput,
} from '../domain/types';

/**
 * SkillRuntimeAccess。
 *
 * @param relationDb 保留统一 DI 签名（阶段2 注册表内存态，暂不持久化）
 * @param builtinDeps 内置工具 Provider 依赖（skill/mcp/cdt）
 * @param logger 可选日志
 */
export class SkillRuntimeAccess {
  private readonly service: SkillRuntimeService;

  constructor(_relationDb: RelationDBAccess, builtinDeps?: SkillRuntimeDeps, logger?: Logger) {
    const rawService = new SkillRuntimeService(builtinDeps ?? {}, logger);
    this.service = AopProxy.wrap(rawService, { logger }) as SkillRuntimeService;
  }

  /** 初始化组件 */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 注册工具 */
  async registerSkill(input: RegisterSkillInput, output: RegisterSkillOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.registerSkill(input, output, context, metrics, report);
  }

  /** 注册内置工具（幂等） */
  async registerBuiltinSkills(input: RegisterBuiltinSkillsInput, output: RegisterBuiltinSkillsOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.registerBuiltinSkills(input, output, context, metrics, report);
  }

  /** 执行单工具调用（配对结果语义） */
  async execSkill(input: ExecSkillInput, output: ExecSkillOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execSkill(input, output, context, metrics, report);
  }

  /** 查询工具规格（zod → JSON Schema） */
  async soSkills(input: SoSkillsInput, output: SoSkillsOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSkills(input, output, context, metrics, report);
  }

  /** 注册 run 级 Skill 一等工具（2026-09-24 Tool ⊕ Skill 合并；透传） */
  async registerRunSkills(input: RegisterRunSkillsInput, output: RegisterSkillsOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.registerRunSkills(input, output, context, metrics, report);
  }

  /** 清理 run 级工具（透传；Loop settle 调用） */
  async clearRunSkills(input: ClearRunSkillsInput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.clearRunSkills(input, context, metrics, report);
  }

  /** 模块配置 */
  async configTool(input: ConfigToolInput, output: ConfigToolOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configTool(input, output, context, metrics, report);
  }
}
