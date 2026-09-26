import type { RelationDBAccess, Metrics, Report, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { RunsSchemaInitializer } from '../infrastructure/RunsSchemaInitializer';
import { RunGatewayService, OutputEvaluator, OutputWriter } from '../application/RunGatewayService';
import type { SessionAccess } from '../../Session';
import type { LoopAccess } from '../../Loop';
import type { AgentDefAccess } from '../../Agents';

import type { InfoCoreAccess } from '@brian-agent/core';
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
  WaitUserAnswerInput,
  WaitUserAnswerOutput,
  AnswerUserAskInput,
  AnswerUserAskOutput,
} from '../domain/types';

export class RunGatewayAccess {
  private readonly service: RunGatewayService;

  constructor(
    relationDb: RelationDBAccess,
    session: SessionAccess,
    agents: AgentDefAccess,
    loop: LoopAccess,
    logger?: Logger,
    evaluator?: OutputEvaluator,
    writer?: OutputWriter,
    
    infoCore?: InfoCoreAccess,
  ) {
    new RunsSchemaInitializer(relationDb).init();
    const rawService = new RunGatewayService(relationDb, session, agents, loop, logger, evaluator, writer, infoCore);
    this.service = AopProxy.wrap(rawService, { logger }) as RunGatewayService;
  }

  
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  
  async submitRun(input: SubmitRunInput, output: SubmitRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.submitRun(input, output, context, metrics, report);
  }

  
  async waitRun(input: WaitRunInput, output: WaitRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.waitRun(input, output, context, metrics, report);
  }

  
  async steerRun(input: SteerRunInput, output: SteerRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.steerRun(input, output, context, metrics, report);
  }

  
  async abortRun(input: AbortRunInput, output: AbortRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.abortRun(input, output, context, metrics, report);
  }

  
  async soRunStatus(input: SoRunStatusInput, output: SoRunStatusOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soRunStatus(input, output, context, metrics, report);
  }

  
  async waitPermission(i: WaitPermissionInput, o: WaitPermissionOutput, c: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.waitPermission(i, o, c, metrics, report);
  }

  
  async answerPermission(i: AnswerPermissionInput, o: AnswerPermissionOutput, c: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.answerPermission(i, o, c, metrics, report);
  }

  
  async waitUserAnswer(i: WaitUserAnswerInput, o: WaitUserAnswerOutput, c: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.waitUserAnswer(i, o, c, metrics, report);
  }

  
  async answerUserAsk(i: AnswerUserAskInput, o: AnswerUserAskOutput, c: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.answerUserAsk(i, o, c, metrics, report);
  }

  
  async configRuns(input: ConfigRunsInput, output: ConfigRunsOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configRuns(input, output, context, metrics, report);
  }

  
  drainSteeringFor(sessionKey: string): string[] {
    return this.service.drainSteeringFor(sessionKey);
  }

  
  takeFollowupFor(sessionKey: string): string[] {
    return this.service.takeFollowupFor(sessionKey);
  }
}
