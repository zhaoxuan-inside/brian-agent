import type { RelationDBAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { AgentBuilderAccess, AgentExecutionAccess, AgentLibraryAccess } from '@brian-agent/agent';
import type { InfoCoreAccess } from '@brian-agent/core';
import { OrchestrationExecutionSchemaInitializer } from '../infrastructure/OrchestrationExecutionSchemaInitializer';
import { OrchestrationExecutionService } from '../application/OrchestrationExecutionService';
import {
  OrchestrationExecutionContext,
  BuildAgentDAGInput, BuildAgentDAGOutput,
  ExecSingleAgentInput, ExecSingleAgentOutput,
  ExecDAGInput, ExecDAGOutput,
  ExecDAGAsyncInput, ExecDAGAsyncOutput,
  GetDAGProgressInput, GetDAGProgressOutput,
  CancelExecutionInput, CancelExecutionOutput,
  GetOrchestrationExecQueueStatusInput, GetOrchestrationExecQueueStatusOutput,
  ConfigOrchestrationExecutionInput, ConfigOrchestrationExecutionOutput,
} from '../domain/types';

export class OrchestrationExecutionAccess {
  private readonly service: OrchestrationExecutionService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    agentBuilder: AgentBuilderAccess,
    agentExecution: AgentExecutionAccess,
    agentLibrary: AgentLibraryAccess,
    infoCore: InfoCoreAccess,
    mqAccess?: any,
    mqCore?: any,
    logger?: Logger,
  ) {
    this.initPromise = new OrchestrationExecutionSchemaInitializer(relationDb).init();
    const raw = new OrchestrationExecutionService(
      relationDb, agentBuilder, agentExecution, agentLibrary, infoCore,
      mqAccess, mqCore, logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async buildAgentDAG(
    i: BuildAgentDAGInput, c: OrchestrationExecutionContext, o: BuildAgentDAGOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.buildAgentDAG(i, c, o);
  }

  async execSingleAgent(
    i: ExecSingleAgentInput, c: OrchestrationExecutionContext, o: ExecSingleAgentOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execSingleAgent(i, c, o);
  }

  async execDAG(
    i: ExecDAGInput, c: OrchestrationExecutionContext, o: ExecDAGOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execDAG(i, c, o);
  }

  async execDAGAsync(
    i: ExecDAGAsyncInput, c: OrchestrationExecutionContext, o: ExecDAGAsyncOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.execDAGAsync(i, c, o);
  }

  async getDAGProgress(
    i: GetDAGProgressInput, c: OrchestrationExecutionContext, o: GetDAGProgressOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getDAGProgress(i, c, o);
  }

  async cancelExecution(
    i: CancelExecutionInput, c: OrchestrationExecutionContext, o: CancelExecutionOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.cancelExecution(i, c, o);
  }

  async getExecQueueStatus(
    i: GetOrchestrationExecQueueStatusInput, c: OrchestrationExecutionContext, o: GetOrchestrationExecQueueStatusOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getExecQueueStatus(i, c, o);
  }

  async configOrchestrationExecution(
    i: ConfigOrchestrationExecutionInput, c: OrchestrationExecutionContext, o: ConfigOrchestrationExecutionOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configOrchestrationExecution(i, c, o);
  }
}
