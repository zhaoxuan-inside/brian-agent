import { Metrics, Report } from '@brian-agent/base';
import type {
  RelationDBAccess,
  LLMAccess,
  SoulAccess,
  SkillAccess,
  MCPAccess,
  PromptsAccess,
  GraphDBAccess,
  Logger,
} from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import type {
  AgentExecutionAccess,
  AgentLibraryAccess,
  AgentContextAccess,
  EvolutorAgentAccess,
  PlannerAgentAccess,
} from '@brian-agent/agent';
import type { OrchestrationVisualizationAccess } from '@brian-agent/orchestration';
import { VisualizationSchemaInitializer } from '../infrastructure/VisualizationSchemaInitializer';
import { VisualizationService } from '../application/VisualizationService';
import {
  VisualizationContext,
  GetVisualizedMessagesInput,
  GetVisualizedMessagesOutput,
  GetVisualizedMessageGraphInput,
  GetVisualizedMessageGraphOutput,
  GetVisualizedAgentDAGInput,
  GetVisualizedAgentDAGOutput,
  GetVisualizedWorkFlowInput,
  GetVisualizedWorkFlowOutput,
  GetAgentTraceInput,
  GetAgentTraceOutput,
  GetVisualizedMessageDAGInput,
  GetVisualizedMessageDAGOutput,
  GetResourceInput,
  GetResourceOutput,
  ConfigVisualizationInput,
  ConfigVisualizationOutput,
  GraphVisualizationConfigInput,
  GraphVisualizationConfigOutput,
  GetAgentChainInput,
  GetAgentChainOutput,
} from '../domain/types';

export class VisualizationAccess {
  private readonly service: VisualizationService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    orchestrationVisualization: OrchestrationVisualizationAccess,
    agentExecution: AgentExecutionAccess,
    agentLibrary: AgentLibraryAccess,
    agentContext: AgentContextAccess,
    evolutorAgent: EvolutorAgentAccess,
    plannerAgent: PlannerAgentAccess,
    infoCore: InfoCoreAccess,
    llmAccess: LLMAccess,
    soulAccess: SoulAccess,
    skillAccess: SkillAccess,
    mcpAccess: MCPAccess,
    promptsAccess: PromptsAccess,
    graphDBAccess: GraphDBAccess,
    logger?: Logger,
  ) {
    this.initPromise = new VisualizationSchemaInitializer(relationDb).init();
    const raw = new VisualizationService(
      relationDb,
      orchestrationVisualization,
      agentExecution,
      agentLibrary,
      agentContext,
      evolutorAgent,
      plannerAgent,
      infoCore,
      llmAccess,
      soulAccess,
      skillAccess,
      mcpAccess,
      promptsAccess,
      graphDBAccess,
      logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async soVisualizedMessages(i: GetVisualizedMessagesInput, o: GetVisualizedMessagesOutput, c: VisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soVisualizedMessages(i, o, c, metrics, report);
  }

  async soVisualizedMessageGraph(i: GetVisualizedMessageGraphInput, o: GetVisualizedMessageGraphOutput, c: VisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soVisualizedMessageGraph(i, o, c, metrics, report);
  }

  async soVisualizedAgentDAG(i: GetVisualizedAgentDAGInput, o: GetVisualizedAgentDAGOutput, c: VisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soVisualizedAgentDAG(i, o, c, metrics, report);
  }

  async soVisualizedWorkFlow(i: GetVisualizedWorkFlowInput, o: GetVisualizedWorkFlowOutput, c: VisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soVisualizedWorkFlow(i, o, c, metrics, report);
  }

  async soAgentTrace(i: GetAgentTraceInput, o: GetAgentTraceOutput, c: VisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soAgentTrace(i, o, c, metrics, report);
  }

  async soVisualizedMessageDAG(i: GetVisualizedMessageDAGInput, o: GetVisualizedMessageDAGOutput, c: VisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soVisualizedMessageDAG(i, o, c, metrics, report);
  }

  async soResource(i: GetResourceInput, o: GetResourceOutput, c: VisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soResource(i, o, c, metrics, report);
  }

  async configVisualization(i: ConfigVisualizationInput, o: ConfigVisualizationOutput, c: VisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configVisualization(i, o, c, metrics, report);
  }

  async soGraphVisualizationConfig(i: GraphVisualizationConfigInput, o: GraphVisualizationConfigOutput, c: VisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soGraphVisualizationConfig(i, o, c, metrics, report);
  }

  async soAgentChain(i: GetAgentChainInput, o: GetAgentChainOutput, c: VisualizationContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soAgentChain(i, o, c, metrics, report);
  }
}
