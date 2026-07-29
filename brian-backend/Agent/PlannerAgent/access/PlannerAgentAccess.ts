import type { RelationDBAccess, LLMAccess, PromptsAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import { PlannerAgentSchemaInitializer } from '../infrastructure/PlannerAgentSchemaInitializer';
import { PlannerAgentService } from '../application/PlannerAgentService';
import {
  PlannerAgentContext,
  PlanInput, PlanOutput,
  ReplanInput, ReplanOutput,
  GetPlanInput, GetPlanOutput,
  ConfigPlannerAgentInput, ConfigPlannerAgentOutput,
} from '../domain/types';

export class PlannerAgentAccess {
  private readonly service: PlannerAgentService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    infoCore: InfoCoreAccess,
    agentBuilder: AgentBuilderAccess,
    agentLibrary: AgentLibraryAccess,
    logger?: Logger,
  ) {
    this.initPromise = new PlannerAgentSchemaInitializer(relationDb).init();
    const raw = new PlannerAgentService(relationDb, llmAccess, promptsAccess, infoCore, agentBuilder, agentLibrary);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  async plan(i: PlanInput, c: PlannerAgentContext, o: PlanOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.plan(i, c, o);
  }

  async replan(i: ReplanInput, c: PlannerAgentContext, o: ReplanOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.replan(i, c, o);
  }

  async getPlan(i: GetPlanInput, c: PlannerAgentContext, o: GetPlanOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.getPlan(i, c, o);
  }

  async configPlannerAgent(
    i: ConfigPlannerAgentInput, c: PlannerAgentContext, o: ConfigPlannerAgentOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configPlannerAgent(i, c, o);
  }
}