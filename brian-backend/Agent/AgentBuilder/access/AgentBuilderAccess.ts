import type { RelationDBAccess, LLMAccess, PromptsAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { LLMCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess } from '@brian-agent/core';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentStrategyAccess } from '../../AgentStrategy/access/AgentStrategyAccess';
import { AgentBuilderSchemaInitializer } from '../infrastructure/AgentBuilderSchemaInitializer';
import { AgentBuilderService } from '../application/AgentBuilderService';
import {
  AgentBuilderContext,
  BuildAgentInput, BuildAgentOutput,
  OptimizeAgentInput, OptimizeAgentOutput,
  BuildPlannerAgentInput, BuildPlannerAgentOutput,
  BuildWriterAgentInput, BuildWriterAgentOutput,
  BuildEvolutorAgentInput, BuildEvolutorAgentOutput,
  ConfigAgentBuilderInput, ConfigAgentBuilderOutput,
} from '../domain/types';

export class AgentBuilderAccess {
  private readonly service: AgentBuilderService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    agentLibrary: AgentLibraryAccess,
    agentStrategy: AgentStrategyAccess,
    llmCore: LLMCoreAccess,
    mcpCore: MCPCoreAccess,
    skillCore: SkillCoreAccess,
    soulCore: SoulCoreAccess,
    logger?: Logger,
  ) {
    this.initPromise = new AgentBuilderSchemaInitializer(relationDb).init();
    const raw = new AgentBuilderService(
      relationDb, llmAccess, promptsAccess, agentLibrary, agentStrategy,
      llmCore, mcpCore, skillCore, soulCore,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  async buildAgent(
    i: BuildAgentInput, c: AgentBuilderContext, o: BuildAgentOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.buildAgent(i, c, o);
  }

  async optimizeAgent(
    i: OptimizeAgentInput, c: AgentBuilderContext, o: OptimizeAgentOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.optimizeAgent(i, c, o);
  }

  async buildPlannerAgent(
    i: BuildPlannerAgentInput, c: AgentBuilderContext, o: BuildPlannerAgentOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.buildPlannerAgent(i, c, o);
  }

  async buildWriterAgent(
    i: BuildWriterAgentInput, c: AgentBuilderContext, o: BuildWriterAgentOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.buildWriterAgent(i, c, o);
  }

  async buildEvolutorAgent(
    i: BuildEvolutorAgentInput, c: AgentBuilderContext, o: BuildEvolutorAgentOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.buildEvolutorAgent(i, c, o);
  }

  async configAgentBuilder(
    i: ConfigAgentBuilderInput, c: AgentBuilderContext, o: ConfigAgentBuilderOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configAgentBuilder(i, c, o);
  }
}