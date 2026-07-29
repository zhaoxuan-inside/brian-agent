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
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    this.initPromise = new AgentStrategySchemaInitializer(relationDb).init();
    const raw = new AgentStrategyService(relationDb, llmAccess, promptsAccess);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  async matchStrategy(
    i: MatchStrategyInput, c: AgentStrategyContext, o: MatchStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.matchStrategy(i, c, o);
  }

  async getStrategy(
    i: GetStrategyInput, c: AgentStrategyContext, o: GetStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getStrategy(i, c, o);
  }

  async soStrategy(
    i: SoStrategyInput, c: AgentStrategyContext, o: SoStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soStrategy(i, c, o);
  }

  async addStrategy(
    i: AddStrategyInput, c: AgentStrategyContext, o: AddStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.addStrategy(i, c, o);
  }

  async updateStrategy(
    i: UpdateStrategyInput, c: AgentStrategyContext, o: UpdateStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.updateStrategy(i, c, o);
  }

  async configAgentStrategy(
    i: ConfigAgentStrategyInput, c: AgentStrategyContext, o: ConfigAgentStrategyOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configAgentStrategy(i, c, o);
  }
}