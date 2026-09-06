/**
 * @fileoverview Runs 模块接入层（Runtime v2 · 阶段3/4 前置）。
 */

import type { RelationDBAccess, Metrics, Report, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { RunsSchemaInitializer } from '../infrastructure/RunsSchemaInitializer';
import { RunGatewayService } from '../application/RunGatewayService';
import type { SessionAccess } from '../../Session';
import type { LoopAccess } from '../../Loop';
import type { AgentDefAccess } from '../../Agents';
import {
  RunGatewayContext,
  SubmitRunInput,
  SubmitRunOutput,
  WaitRunInput,
  WaitRunOutput,
  SteerRunInput,
  SteerRunOutput,
  AbortRunInput,
  AbortRunOutput,
  SoRunStatusInput,
  SoRunStatusOutput,
  ConfigRunsInput,
  ConfigRunsOutput,
  WaitPermissionInput,
  WaitPermissionOutput,
  AnswerPermissionInput,
  AnswerPermissionOutput,
} from '../domain/types';

/**
 * RunGatewayAccess。
 */
export class RunGatewayAccess {
  private readonly service: RunGatewayService;

  constructor(relationDb: RelationDBAccess, session: SessionAccess, agents: AgentDefAccess, loop: LoopAccess, logger?: Logger) {
    new RunsSchemaInitializer(relationDb).init();
    const rawService = new RunGatewayService(relationDb, session, agents, loop, logger);
    this.service = AopProxy.wrap(rawService, { logger }) as RunGatewayService;
  }

  /** 初始化组件 */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 提交运行（两段式 ack） */
  async submitRun(input: SubmitRunInput, output: SubmitRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.submitRun(input, output, context, metrics, report);
  }

  /** 等待运行结算 */
  async waitRun(input: WaitRunInput, output: WaitRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.waitRun(input, output, context, metrics, report);
  }

  /** 注入排队消息（活动 run 边界生效） */
  async steerRun(input: SteerRunInput, output: SteerRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.steerRun(input, output, context, metrics, report);
  }

  /** 类型化取消 */
  async abortRun(input: AbortRunInput, output: AbortRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.abortRun(input, output, context, metrics, report);
  }

  /** 查询运行状态 */
  async soRunStatus(input: SoRunStatusInput, output: SoRunStatusOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soRunStatus(input, output, context, metrics, report);
  }

  /** 权限等待挂起（Loop 权限门经组合根注入调用） */
  async waitPermission(i: WaitPermissionInput, o: WaitPermissionOutput, c: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.waitPermission(i, o, c, metrics, report);
  }

  /** 权限应答（HTTP 端点调用） */
  async answerPermission(i: AnswerPermissionInput, o: AnswerPermissionOutput, c: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.answerPermission(i, o, c, metrics, report);
  }

  /** 模块配置 */
  async configRuns(input: ConfigRunsInput, output: ConfigRunsOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configRuns(input, output, context, metrics, report);
  }

  /** Loop 队列接线：边界抽干 steering（组合根绑定，非业务方法） */
  drainSteeringFor(sessionKey: string): string[] {
    return this.service.drainSteeringFor(sessionKey);
  }

  /** Loop 队列接线：外层 followup 取队列（组合根绑定，非业务方法） */
  takeFollowupFor(sessionKey: string): string[] {
    return this.service.takeFollowupFor(sessionKey);
  }
}
