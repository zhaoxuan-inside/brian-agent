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

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    new AgentLibrarySchemaInitializer(relationDb).init();
    const raw = new AgentLibraryService(relationDb, llmAccess, promptsAccess);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async addAgent(i: AddAgentInput, c: AgentLibraryContext, o: AddAgentOutput) { return this.service.addAgent(i, c, o); }
  async matchAgent(i: MatchAgentInput, c: AgentLibraryContext, o: MatchAgentOutput) { return this.service.matchAgent(i, c, o); }
  async updateAgent(i: UpdateAgentInput, c: AgentLibraryContext, o: UpdateAgentOutput) { return this.service.updateAgent(i, c, o); }
  async recordAgentUsage(i: RecordAgentUsageInput, c: AgentLibraryContext, o: RecordAgentUsageOutput) { return this.service.recordAgentUsage(i, c, o); }
  async getAgent(i: GetAgentInput, c: AgentLibraryContext, o: GetAgentOutput) { return this.service.getAgent(i, c, o); }
  async ageAgent(i: AgeAgentInput, c: AgentLibraryContext, o: AgeAgentOutput) { return this.service.ageAgent(i, c, o); }
  async getAgentRule(i: GetAgentRuleInput, c: AgentLibraryContext, o: GetAgentRuleOutput) { return this.service.getAgentRule(i, c, o); }
  async updateAgentRule(i: UpdateAgentRuleInput, c: AgentLibraryContext, o: UpdateAgentRuleOutput) { return this.service.updateAgentRule(i, c, o); }
  async configAgentLibrary(i: ConfigAgentLibraryInput, c: AgentLibraryContext, o: ConfigAgentLibraryOutput) { return this.service.configAgentLibrary(i, c, o); }
}
