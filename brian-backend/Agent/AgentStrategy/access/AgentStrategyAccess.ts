import type { RelationDBAccess, LLMAccess, PromptsAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { AgentStrategySchemaInitializer } from '../infrastructure/AgentStrategySchemaInitializer';
import { AgentStrategyService } from '../application/AgentStrategyService';
import {
  AgentStrategyContext,
  MatchStrategyInput, MatchStrategyOutput,
  GetStrategyInput, GetStrategyOutput,
  SoStrategyInput, SoStrategyOutput,
  AddStrategyInput, AddStrategyOutput,
  UpdateStrategyInput, UpdateStrategyOutput,
  ConfigAgentStrategyInput, ConfigAgentStrategyOutput,
} from '../domain/types';

export class AgentStrategyAccess {
  private readonly service: AgentStrategyService;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    new AgentStrategySchemaInitializer(relationDb).init();
    const rawService = new AgentStrategyService(relationDb, llmAccess, promptsAccess);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  async matchStrategy(i: MatchStrategyInput, c: AgentStrategyContext, o: MatchStrategyOutput) {
    return this.service.matchStrategy(i, c, o);
  }
  async getStrategy(i: GetStrategyInput, c: AgentStrategyContext, o: GetStrategyOutput) {
    return this.service.getStrategy(i, c, o);
  }
  async soStrategy(i: SoStrategyInput, c: AgentStrategyContext, o: SoStrategyOutput) {
    return this.service.soStrategy(i, c, o);
  }
  async addStrategy(i: AddStrategyInput, c: AgentStrategyContext, o: AddStrategyOutput) {
    return this.service.addStrategy(i, c, o);
  }
  async updateStrategy(i: UpdateStrategyInput, c: AgentStrategyContext, o: UpdateStrategyOutput) {
    return this.service.updateStrategy(i, c, o);
  }
  async configAgentStrategy(i: ConfigAgentStrategyInput, c: AgentStrategyContext, o: ConfigAgentStrategyOutput) {
    return this.service.configAgentStrategy(i, c, o);
  }
}
