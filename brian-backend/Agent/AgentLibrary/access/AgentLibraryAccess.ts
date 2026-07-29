import type { RelationDBAccess, LLMAccess, PromptsAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { AgentLibrarySchemaInitializer } from '../infrastructure/AgentLibrarySchemaInitializer';
import { AgentLibraryService } from '../application/AgentLibraryService';
import {
  AgentLibraryContext,
  AddAgentInput, AddAgentOutput,
  MatchAgentInput, MatchAgentOutput,
  UpdateAgentInput, UpdateAgentOutput,
  RecordAgentUsageInput, RecordAgentUsageOutput,
  GetAgentInput, GetAgentOutput,
  AgeAgentInput, AgeAgentOutput,
  GetAgentRuleInput, GetAgentRuleOutput,
  UpdateAgentRuleInput, UpdateAgentRuleOutput,
  ConfigAgentLibraryInput, ConfigAgentLibraryOutput,
} from '../domain/types';

export class AgentLibraryAccess {
  private readonly service: AgentLibraryService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    this.initPromise = new AgentLibrarySchemaInitializer(relationDb).init();
    const raw = new AgentLibraryService(relationDb, llmAccess, promptsAccess);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async addAgent(i: AddAgentInput, c: AgentLibraryContext, o: AddAgentOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.addAgent(i, c, o);
  }

  async matchAgent(i: MatchAgentInput, c: AgentLibraryContext, o: MatchAgentOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.matchAgent(i, c, o);
  }

  async updateAgent(i: UpdateAgentInput, c: AgentLibraryContext, o: UpdateAgentOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.updateAgent(i, c, o);
  }

  async recordAgentUsage(i: RecordAgentUsageInput, c: AgentLibraryContext, o: RecordAgentUsageOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.recordAgentUsage(i, c, o);
  }

  async getAgent(i: GetAgentInput, c: AgentLibraryContext, o: GetAgentOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.getAgent(i, c, o);
  }

  /** soAgent 别名，语义同 getAgent */
  async soAgent(i: GetAgentInput, c: AgentLibraryContext, o: GetAgentOutput): Promise<boolean> {
    return this.getAgent(i, c, o);
  }

  async ageAgent(i: AgeAgentInput, c: AgentLibraryContext, o: AgeAgentOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.ageAgent(i, c, o);
  }

  async getAgentRule(i: GetAgentRuleInput, c: AgentLibraryContext, o: GetAgentRuleOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.getAgentRule(i, c, o);
  }

  async updateAgentRule(i: UpdateAgentRuleInput, c: AgentLibraryContext, o: UpdateAgentRuleOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.updateAgentRule(i, c, o);
  }

  async configAgentLibrary(i: ConfigAgentLibraryInput, c: AgentLibraryContext, o: ConfigAgentLibraryOutput): Promise<boolean> {
    await this.initPromise;
    return this.service.configAgentLibrary(i, c, o);
  }
}
