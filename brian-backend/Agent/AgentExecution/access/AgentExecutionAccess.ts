import type { RelationDBAccess, LLMAccess, PromptsAccess, SkillAccess, SoulAccess, MCPAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess, MQCoreAccess } from '@brian-agent/core';
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

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    skillAccess: SkillAccess,
    soulAccess: SoulAccess,
    mcpAccess: MCPAccess,
    agentLibrary: AgentLibraryAccess,
    agentStrategy: AgentStrategyAccess,
    infoCore: InfoCoreAccess,
    llmCore: LLMCoreAccess,
    mqCore: MQCoreAccess,
    logger?: Logger,
  ) {
    new AgentExecutionSchemaInitializer(relationDb).init();
    const raw = new AgentExecutionService(relationDb, llmAccess, promptsAccess, skillAccess, soulAccess, mcpAccess, agentLibrary, agentStrategy, infoCore, llmCore, mqCore);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async execAgent(i: ExecAgentInput, c: AgentExecutionContext, o: ExecAgentOutput) { return this.service.execAgent(i, c, o); }
  async execAgentAsync(i: ExecAgentAsyncInput, c: AgentExecutionContext, o: ExecAgentAsyncOutput) { return this.service.execAgentAsync(i, c, o); }
  async think(i: ThinkInput, c: AgentExecutionContext, o: ThinkOutput) { return this.service.think(i, c, o); }
  async act(i: ActInput, c: AgentExecutionContext, o: ActOutput) { return this.service.act(i, c, o); }
  async reflect(i: ReflectInput, c: AgentExecutionContext, o: ReflectOutput) { return this.service.reflect(i, c, o); }
  async answer(i: AnswerInput, c: AgentExecutionContext, o: AnswerOutput) { return this.service.answer(i, c, o); }
  async getTrace(i: GetTraceInput, c: AgentExecutionContext, o: GetTraceOutput) { return this.service.getTrace(i, c, o); }
  async getExecQueueStatus(i: GetExecQueueStatusInput, c: AgentExecutionContext, o: GetExecQueueStatusOutput) { return this.service.getExecQueueStatus(i, c, o); }
  async configAgentExecution(i: ConfigAgentExecutionInput, c: AgentExecutionContext, o: ConfigAgentExecutionOutput) { return this.service.configAgentExecution(i, c, o); }
}
