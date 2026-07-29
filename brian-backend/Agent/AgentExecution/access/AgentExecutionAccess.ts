import type {
  RelationDBAccess, LLMAccess, PromptsAccess, SkillAccess, SoulAccess, MCPAccess, MQAccess, Logger,
} from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, MCPCoreAccess, MQCoreAccess, SkillCoreAccess } from '@brian-agent/core';
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
    logger?: Logger,
  ) {
    this.initPromise = new AgentExecutionSchemaInitializer(relationDb).init();
    const raw = new AgentExecutionService(
      relationDb, llmAccess, promptsAccess, skillAccess, soulAccess, mcpAccess,
      mqAccess, agentLibrary, agentStrategy, infoCore, mqCore, skillCore, mcpCore,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async execAgent(
    i: ExecAgentInput, c: AgentExecutionContext, o: ExecAgentOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execAgent(i, c, o);
  }

  async execAgentAsync(
    i: ExecAgentAsyncInput, c: AgentExecutionContext, o: ExecAgentAsyncOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execAgentAsync(i, c, o);
  }

  async think(i: ThinkInput, c: AgentExecutionContext, o: ThinkOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.think(i, c, o);
  }

  async act(i: ActInput, c: AgentExecutionContext, o: ActOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.act(i, c, o);
  }

  async reflect(i: ReflectInput, c: AgentExecutionContext, o: ReflectOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.reflect(i, c, o);
  }

  async answer(i: AnswerInput, c: AgentExecutionContext, o: AnswerOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.answer(i, c, o);
  }

  async getTrace(
    i: GetTraceInput, c: AgentExecutionContext, o: GetTraceOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getTrace(i, c, o);
  }

  async getExecQueueStatus(
    i: GetExecQueueStatusInput, c: AgentExecutionContext, o: GetExecQueueStatusOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getExecQueueStatus(i, c, o);
  }

  async configAgentExecution(
    i: ConfigAgentExecutionInput, c: AgentExecutionContext, o: ConfigAgentExecutionOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configAgentExecution(i, c, o);
  }
}