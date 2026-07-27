import type { RelationDBAccess, LLMAccess, PromptsAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, MQCoreAccess } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentExecutionAccess } from '../../AgentExecution/access/AgentExecutionAccess';
import { EvolutorAgentSchemaInitializer } from '../infrastructure/EvolutorAgentSchemaInitializer';
import { EvolutorAgentService } from '../application/EvolutorAgentService';
import {
  EvolutorAgentContext,
  EvalWorkAgentInput, EvalWorkAgentOutput,
  EvalWriterAgentInput, EvalWriterAgentOutput,
  StartEvalScheduleInput, StartEvalScheduleOutput,
  StopEvalScheduleInput, StopEvalScheduleOutput,
  GetEvaluationInput, GetEvaluationOutput,
  GetEvolutionReportInput, GetEvolutionReportOutput,
  ConfigEvolutorAgentInput, ConfigEvolutorAgentOutput,
} from '../domain/types';

export class EvolutorAgentAccess {
  private readonly service: EvolutorAgentService;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    infoCore: InfoCoreAccess,
    mqCore: MQCoreAccess,
    agentBuilder: AgentBuilderAccess,
    agentLibrary: AgentLibraryAccess,
    agentExecution: AgentExecutionAccess,
    logger?: Logger,
  ) {
    new EvolutorAgentSchemaInitializer(relationDb).init();
    const raw = new EvolutorAgentService(relationDb, llmAccess, promptsAccess, infoCore, mqCore, agentBuilder, agentLibrary, agentExecution);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async evalWorkAgent(i: EvalWorkAgentInput, c: EvolutorAgentContext, o: EvalWorkAgentOutput) { return this.service.evalWorkAgent(i, c, o); }
  async evalWriterAgent(i: EvalWriterAgentInput, c: EvolutorAgentContext, o: EvalWriterAgentOutput) { return this.service.evalWriterAgent(i, c, o); }
  async startEvalSchedule(i: StartEvalScheduleInput, c: EvolutorAgentContext, o: StartEvalScheduleOutput) { return this.service.startEvalSchedule(i, c, o); }
  async stopEvalSchedule(i: StopEvalScheduleInput, c: EvolutorAgentContext, o: StopEvalScheduleOutput) { return this.service.stopEvalSchedule(i, c, o); }
  async getEvaluation(i: GetEvaluationInput, c: EvolutorAgentContext, o: GetEvaluationOutput) { return this.service.getEvaluation(i, c, o); }
  async getEvolutionReport(i: GetEvolutionReportInput, c: EvolutorAgentContext, o: GetEvolutionReportOutput) { return this.service.getEvolutionReport(i, c, o); }
  async configEvolutorAgent(i: ConfigEvolutorAgentInput, c: EvolutorAgentContext, o: ConfigEvolutorAgentOutput) { return this.service.configEvolutorAgent(i, c, o); }
}
