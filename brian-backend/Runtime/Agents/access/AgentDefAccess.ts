import type { RelationDBAccess, Metrics, Report, Logger, LLMAccess } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { AgentsSchemaInitializer } from '../infrastructure/AgentsSchemaInitializer';
import { AgentDefService, type AgentDefComponents } from '../application/AgentDefService';
import {
  AgentDefContext,
  MatchAgentDefInput,
  MatchAgentDefOutput,
  SoAgentSnapshotInput,
  SoAgentSnapshotOutput,
  DeclareAgentInput,
  DeclareAgentOutput,
  SoAgentDefsInput,
  SoAgentDefsOutput,
  ConfigAgentDefInput,
  ConfigAgentDefOutput,
  KillErroredAgentInput,
  KillErroredAgentOutput,
  SweepDefHealthInput,
  SweepDefHealthOutput,
  type AgentDefRecord,
  type DefHealthReport,
} from '../domain/types';

export class AgentDefAccess {
  private readonly service: AgentDefService;

  constructor(relationDb: RelationDBAccess, llm: LLMAccess, components: AgentDefComponents, logger?: Logger) {
    new AgentsSchemaInitializer(relationDb).init();
    const rawService = new AgentDefService(relationDb, llm, components, logger);
    this.service = AopProxy.wrap(rawService, { logger }) as AgentDefService;
  }

  
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  
  async matchAgentDef(input: MatchAgentDefInput, output: MatchAgentDefOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.matchAgentDef(input, output, context, metrics, report);
  }

  
  async soAgentSnapshot(input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soAgentSnapshot(input, output, context, metrics, report);
  }

  
  async declareAgent(input: DeclareAgentInput, output: DeclareAgentOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.declareAgent(input, output, context, metrics, report);
  }

  
  async soAgentDefs(input: SoAgentDefsInput, output: SoAgentDefsOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soAgentDefs(input, output, context, metrics, report);
  }

  
  async configAgentDef(input: ConfigAgentDefInput, output: ConfigAgentDefOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configAgentDef(input, output, context, metrics, report);
  }

  
  async killErroredAgent(input: KillErroredAgentInput, output: KillErroredAgentOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.killErroredAgent(input, output, context, metrics, report);
  }

  async validateDefHealth(def: AgentDefRecord, metrics?: Metrics): Promise<DefHealthReport> {
    return this.service.validateDefHealth(def, metrics);
  }

  async sweepDefHealth(input: SweepDefHealthInput, output: SweepDefHealthOutput, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.sweepDefHealth(input, output, context, metrics, report);
  }

  async invalidateDefById(defId: string, reason: string, context: AgentDefContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.invalidateDefById(defId, reason, context, metrics, report);
  }

  invalidateAgentBindingCache(): void {
    this.service.invalidateAgentBindingCache();
  }

}
