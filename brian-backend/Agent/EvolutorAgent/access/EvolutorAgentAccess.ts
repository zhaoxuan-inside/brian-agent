import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, MQAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, MQCoreAccess, LLMCoreAccess } from '@brian-agent/core';
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
  RunEvalOnceInput, RunEvalOnceOutput,
  GetEvaluationInput, GetEvaluationOutput,
  GetEvolutionReportInput, GetEvolutionReportOutput,
  ConfigEvolutorAgentInput, ConfigEvolutorAgentOutput,
} from '../domain/types';

export class EvolutorAgentAccess {
  private readonly service: EvolutorAgentService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    infoCore: InfoCoreAccess,
    mqAccess: MQAccess,
    mqCore: MQCoreAccess,
    agentBuilder: AgentBuilderAccess,
    agentLibrary: AgentLibraryAccess,
    agentExecution: AgentExecutionAccess,
    llmCore?: LLMCoreAccess,
    logger?: Logger,
  ) {
    this.initPromise = new EvolutorAgentSchemaInitializer(relationDb).init();
    const raw = new EvolutorAgentService(
      relationDb, llmAccess, promptsAccess, infoCore, mqAccess, mqCore,
      agentBuilder, agentLibrary, agentExecution, llmCore,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  async evalWorkAgent(i: EvalWorkAgentInput, o: EvalWorkAgentOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.evalWorkAgent(i, o, c, metrics, report);
  }

  async evalWriterAgent(i: EvalWriterAgentInput, o: EvalWriterAgentOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.evalWriterAgent(i, o, c, metrics, report);
  }

  async startEvalSchedule(i: StartEvalScheduleInput, o: StartEvalScheduleOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.startEvalSchedule(i, o, c, metrics, report);
  }

  async stopEvalSchedule(i: StopEvalScheduleInput, o: StopEvalScheduleOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.stopEvalSchedule(i, o, c, metrics, report);
  }

  async runEvalOnce(i: RunEvalOnceInput, o: RunEvalOnceOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.runEvalOnce(i, o, c, metrics, report);
  }

  async soEvaluation(i: GetEvaluationInput, o: GetEvaluationOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soEvaluation(i, o, c, metrics, report);
  }

  async soEvolutionReport(i: GetEvolutionReportInput, o: GetEvolutionReportOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soEvolutionReport(i, o, c, metrics, report);
  }

  async configEvolutorAgent(i: ConfigEvolutorAgentInput, o: ConfigEvolutorAgentOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configEvolutorAgent(i, o, c, metrics, report);
  }
}