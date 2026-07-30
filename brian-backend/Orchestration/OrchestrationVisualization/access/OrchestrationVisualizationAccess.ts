import type { RelationDBAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { AgentLibraryAccess, AgentExecutionAccess } from '@brian-agent/agent';
import { OrchestrationVisualizationSchemaInitializer } from '../infrastructure/OrchestrationVisualizationSchemaInitializer';
import { OrchestrationVisualizationService } from '../application/OrchestrationVisualizationService';
import {
  OrchestrationVisualizationContext,
  VisualizeAgentDAGInput, VisualizeAgentDAGOutput,
  VisualizeWorkFlowInput, VisualizeWorkFlowOutput,
  GetAgentNodeDetailInput, GetAgentNodeDetailOutput,
  ConfigOrchestrationVisualizationInput, ConfigOrchestrationVisualizationOutput,
} from '../domain/types';

export class OrchestrationVisualizationAccess {
  private readonly service: OrchestrationVisualizationService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    agentLibrary: AgentLibraryAccess,
    agentExecution: AgentExecutionAccess,
    logger?: Logger,
  ) {
    this.initPromise = new OrchestrationVisualizationSchemaInitializer().init();
    const raw = new OrchestrationVisualizationService(relationDb, agentLibrary, agentExecution, logger);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async visualizeAgentDAG(
    i: VisualizeAgentDAGInput, c: OrchestrationVisualizationContext, o: VisualizeAgentDAGOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.visualizeAgentDAG(i, c, o);
  }

  async visualizeWorkFlow(
    i: VisualizeWorkFlowInput, c: OrchestrationVisualizationContext, o: VisualizeWorkFlowOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.visualizeWorkFlow(i, c, o);
  }

  async getAgentNodeDetail(
    i: GetAgentNodeDetailInput, c: OrchestrationVisualizationContext, o: GetAgentNodeDetailOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getAgentNodeDetail(i, c, o);
  }

  async configOrchestrationVisualization(
    i: ConfigOrchestrationVisualizationInput, c: OrchestrationVisualizationContext, o: ConfigOrchestrationVisualizationOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configOrchestrationVisualization(i, c, o);
  }
}
