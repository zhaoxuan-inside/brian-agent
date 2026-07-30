import type { RelationDBAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type {
  AgentBuilderAccess, PlannerAgentAccess, WriterAgentAccess, EvolutorAgentAccess,
} from '@brian-agent/agent';
import type { OrchestrationExecutionAccess } from '../../OrchestrationExecution/access/OrchestrationExecutionAccess';
import type { JSONNodeAccess } from '../../JSONNode/access/JSONNodeAccess';
import { OrchestrationStrategySchemaInitializer } from '../infrastructure/OrchestrationStrategySchemaInitializer';
import { OrchestrationStrategyService } from '../application/OrchestrationStrategyService';
import {
  OrchestrationStrategyContext,
  StartOrchestrationInput, StartOrchestrationOutput,
  ExecuteSimpleStrategyInput, ExecuteSimpleStrategyOutput,
  ExecutePlanningStrategyInput, ExecutePlanningStrategyOutput,
  ExecutePostProcessingInput, ExecutePostProcessingOutput,
  AddOrchestrationStrategyInput, AddOrchestrationStrategyOutput,
  HandleDAGFailureInput, HandleDAGFailureOutput,
  GetOrchestrationStrategyInput, GetOrchestrationStrategyOutput,
  UpdateOrchestrationStrategyInput, UpdateOrchestrationStrategyOutput,
  ConfigOrchestrationStrategyInput, ConfigOrchestrationStrategyOutput,
} from '../domain/types';

export class OrchestrationStrategyAccess {
  private readonly service: OrchestrationStrategyService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    agentBuilder: AgentBuilderAccess,
    plannerAgent: PlannerAgentAccess,
    writerAgent: WriterAgentAccess,
    evolutorAgent: EvolutorAgentAccess,
    orchestrationExecution: OrchestrationExecutionAccess,
    jsonNode: JSONNodeAccess,
    mqCore?: any,
    logger?: Logger,
  ) {
    this.initPromise = new OrchestrationStrategySchemaInitializer(relationDb).init();
    const raw = new OrchestrationStrategyService(
      relationDb, agentBuilder, plannerAgent, writerAgent, evolutorAgent,
      orchestrationExecution, jsonNode, mqCore, logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async startOrchestration(
    i: StartOrchestrationInput, c: OrchestrationStrategyContext, o: StartOrchestrationOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.startOrchestration(i, c, o);
  }

  async executeSimpleStrategy(
    i: ExecuteSimpleStrategyInput, c: OrchestrationStrategyContext, o: ExecuteSimpleStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.executeSimpleStrategy(i, c, o);
  }

  async executePlanningStrategy(
    i: ExecutePlanningStrategyInput, c: OrchestrationStrategyContext, o: ExecutePlanningStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.executePlanningStrategy(i, c, o);
  }

  async executePostProcessing(
    i: ExecutePostProcessingInput, c: OrchestrationStrategyContext, o: ExecutePostProcessingOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.executePostProcessing(i, c, o);
  }

  async addStrategy(
    i: AddOrchestrationStrategyInput, c: OrchestrationStrategyContext, o: AddOrchestrationStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.addStrategy(i, c, o);
  }

  async handleDAGFailure(
    i: HandleDAGFailureInput, c: OrchestrationStrategyContext, o: HandleDAGFailureOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.handleDAGFailure(i, c, o);
  }

  async getStrategy(
    i: GetOrchestrationStrategyInput, c: OrchestrationStrategyContext, o: GetOrchestrationStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getStrategy(i, c, o);
  }

  async updateStrategy(
    i: UpdateOrchestrationStrategyInput, c: OrchestrationStrategyContext, o: UpdateOrchestrationStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.updateStrategy(i, c, o);
  }

  async configOrchestrationStrategy(
    i: ConfigOrchestrationStrategyInput, c: OrchestrationStrategyContext, o: ConfigOrchestrationStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configOrchestrationStrategy(i, c, o);
  }
}
