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

  async getVisualizedMessages(
    i: GetVisualizedMessagesInput,
    c: VisualizationContext,
    o: GetVisualizedMessagesOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getVisualizedMessages(i, c, o);
  }

  async getVisualizedMessageGraph(
    i: GetVisualizedMessageGraphInput,
    c: VisualizationContext,
    o: GetVisualizedMessageGraphOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getVisualizedMessageGraph(i, c, o);
  }

  async getVisualizedAgentDAG(
    i: GetVisualizedAgentDAGInput,
    c: VisualizationContext,
    o: GetVisualizedAgentDAGOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getVisualizedAgentDAG(i, c, o);
  }

  async getVisualizedWorkFlow(
    i: GetVisualizedWorkFlowInput,
    c: VisualizationContext,
    o: GetVisualizedWorkFlowOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getVisualizedWorkFlow(i, c, o);
  }

  async getAgentTrace(
    i: GetAgentTraceInput,
    c: VisualizationContext,
    o: GetAgentTraceOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getAgentTrace(i, c, o);
  }

  async getVisualizedMessageDAG(
    i: GetVisualizedMessageDAGInput,
    c: VisualizationContext,
    o: GetVisualizedMessageDAGOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getVisualizedMessageDAG(i, c, o);
  }

  async getResource(
    i: GetResourceInput,
    c: VisualizationContext,
    o: GetResourceOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getResource(i, c, o);
  }

  async configVisualization(
    i: ConfigVisualizationInput,
    c: VisualizationContext,
    o: ConfigVisualizationOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configVisualization(i, c, o);
  }
}
