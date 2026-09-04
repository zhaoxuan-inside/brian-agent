/**
 * @fileoverview Loop 模块接入层（Runtime v2 · 阶段2）。
 *
 * 职责（Loop-PRD §3）：
 * 1. 经 AopProxy.wrap 封装 AgentLoopService，注入日志与耗时切面；
 * 2. 提供 5 参签名（Input, Output, Context, Metrics?, Report?）调用入口；
 * 3. 依赖注入：LLMAccess（Base）/ SessionAccess / EventBusAccess / ToolAccess（Runtime）。
 */

import type { RelationDBAccess, Metrics, Report, Logger, LLMAccess } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { AgentLoopService } from '../application/AgentLoopService';
import type { SessionAccess } from '../../Session';
import type { EventBusAccess } from '../../Bus';
import type { ToolAccess } from '../../Tools';
import {
  ExecAgentLoopInput,
  ExecAgentLoopOutput,
  AbortLoopTurnInput,
  AbortLoopTurnOutput,
  ConfigLoopInput,
  ConfigLoopOutput,
  LoopContext,
} from '../domain/types';

/**
 * LoopAccess。
 *
 * @param relationDb 保留统一 DI 签名（Loop 无直接表）
 * @param llm LLM 接入层（execLLMEvents 事件流）
 * @param session 会话接入层（消息/Part 持久化）
 * @param bus 事件总线（副作用唯一出口）
 * @param tool 工具接入层（编排原语）
 * @param logger 可选日志
 */
export class LoopAccess {
  private readonly service: AgentLoopService;

  constructor(_relationDb: RelationDBAccess, llm: LLMAccess, session: SessionAccess, bus: EventBusAccess, tool: ToolAccess, logger?: Logger,
  ) {
    const rawService = new AgentLoopService(llm, session, bus, tool, logger);
    this.service = AopProxy.wrap(rawService, { logger }) as AgentLoopService;
  }

  /** 初始化组件 */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 执行两级 agent 循环 */
  async execAgentLoop(input: ExecAgentLoopInput, output: ExecAgentLoopOutput, context: LoopContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execAgentLoop(input, output, context, metrics, report);
  }

  /** 类型化取消活动 run */
  async abortLoopTurn(input: AbortLoopTurnInput, output: AbortLoopTurnOutput, context: LoopContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.abortLoopTurn(input, output, context, metrics, report);
  }

  /** 模块配置 */
  async configLoop(input: ConfigLoopInput, output: ConfigLoopOutput, context: LoopContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configLoop(input, output, context, metrics, report);
  }
}

/** 导出 LoopContext 供上层组合根使用 */
export { LoopContext };
