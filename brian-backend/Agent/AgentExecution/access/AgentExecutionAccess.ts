import { Metrics, Report } from '@brian-agent/base';
import type {
  RelationDBAccess, LLMAccess, PromptsAccess, SkillAccess, SoulAccess, MCPAccess, MQAccess, StreamAccess, Logger,
} from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, MCPCoreAccess, MQCoreAccess, SkillCoreAccess, LLMCoreAccess, CDTCoreAccess } from '@brian-agent/core';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentStrategyAccess } from '../../AgentStrategy/access/AgentStrategyAccess';
import { AgentExecutionSchemaInitializer } from '../infrastructure/AgentExecutionSchemaInitializer';
import { AgentExecutionService } from '../application/AgentExecutionService';
import {
  AgentExecutionContext,
  ExecAgentInput, ExecAgentOutput,
  ExecAgentAsyncInput, ExecAgentAsyncOutput,
  ThinkInput, ThinkOutput,
  ActInput, ActOutput,
  ReflectInput, ReflectOutput,
  AnswerInput, AnswerOutput,
  GetTraceInput, GetTraceOutput,
  GetExecQueueStatusInput, GetExecQueueStatusOutput,
  ConfigAgentExecutionInput, ConfigAgentExecutionOutput,
} from '../domain/types';

export class AgentExecutionAccess {
  private readonly service: AgentExecutionService;
  private readonly initPromise: Promise<void>;

  

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    skillAccess: SkillAccess,
    soulAccess: SoulAccess,
    mcpAccess: MCPAccess,
    mqAccess: MQAccess,
    agentLibrary: AgentLibraryAccess,
    agentStrategy: AgentStrategyAccess,
    infoCore: InfoCoreAccess,
    mqCore: MQCoreAccess,
    skillCore: SkillCoreAccess,
    mcpCore: MCPCoreAccess,
    llmCore: LLMCoreAccess,
    cdtCore?: CDTCoreAccess,
    logger?: Logger,
    streamAccess?: StreamAccess,
  ) {
    this.initPromise = new AgentExecutionSchemaInitializer(relationDb).init();
    const raw = new AgentExecutionService(
      relationDb, llmAccess, promptsAccess, skillAccess, soulAccess, mcpAccess,
      mqAccess, agentLibrary, agentStrategy, infoCore, mqCore, skillCore, mcpCore, llmCore,
      cdtCore, logger, streamAccess,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  

  async execAgent(i: ExecAgentInput, o: ExecAgentOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execAgent(i, o, c, metrics, report);
  }

  

  async execAgentAsync(i: ExecAgentAsyncInput, o: ExecAgentAsyncOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execAgentAsync(i, o, c, metrics, report);
  }

  

  async execThink(i: ThinkInput, o: ThinkOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.execThink(i, o, c, metrics, report);
  }

  

  async execAct(i: ActInput, o: ActOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.execAct(i, o, c, metrics, report);
  }

  

  async execReflect(i: ReflectInput, o: ReflectOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.execReflect(i, o, c, metrics, report);
  }

  

  async execAnswer(i: AnswerInput, o: AnswerOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.execAnswer(i, o, c, metrics, report);
  }

  

  async soTrace(i: GetTraceInput, o: GetTraceOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soTrace(i, o, c, metrics, report);
  }

  

  async soExecQueueStatus(i: GetExecQueueStatusInput, o: GetExecQueueStatusOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soExecQueueStatus(i, o, c, metrics, report);
  }

  

  async configAgentExecution(i: ConfigAgentExecutionInput, o: ConfigAgentExecutionOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configAgentExecution(i, o, c, metrics, report);
  }
}
