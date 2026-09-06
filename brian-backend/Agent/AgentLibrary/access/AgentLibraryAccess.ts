import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { AgentLibrarySchemaInitializer } from '../infrastructure/AgentLibrarySchemaInitializer';
import { AgentLibraryService } from '../application/AgentLibraryService';
import {
  AgentLibraryContext,
  AddAgentInput, AddAgentOutput,
  MatchAgentInput, MatchAgentOutput,
  UpdateAgentInput, UpdateAgentOutput,
  DelAgentInput, DelAgentOutput,
  ToggleAgentInput, ToggleAgentOutput,
  RecordAgentUsageInput, RecordAgentUsageOutput,
  GetAgentInput, GetAgentOutput,
  AgeAgentInput, AgeAgentOutput,
  GetAgentRuleInput, GetAgentRuleOutput,
  UpdateAgentRuleInput, UpdateAgentRuleOutput,
  ConfigAgentLibraryInput, ConfigAgentLibraryOutput,
  BindAgentComponentInput,
  BindAgentComponentOutput,
  UnbindAgentComponentInput,
  UnbindAgentComponentOutput,
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

  async addAgent(i: AddAgentInput, o: AddAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.addAgent(i, o, c, metrics, report);
  }

  async matchAgent(i: MatchAgentInput, o: MatchAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.matchAgent(i, o, c, metrics, report);
  }

  async updateAgent(i: UpdateAgentInput, o: UpdateAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.updateAgent(i, o, c, metrics, report);
  }

  async delAgent(i: DelAgentInput, o: DelAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.delAgent(i, o, c, metrics, report);
  }

  async toggleAgent(i: ToggleAgentInput, o: ToggleAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.toggleAgent(i, o, c, metrics, report);
  }

  async recordAgentUsage(i: RecordAgentUsageInput, o: RecordAgentUsageOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.recordAgentUsage(i, o, c, metrics, report);
  }

  async soAgent(i: GetAgentInput, o: GetAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.soAgent(i, o, c, metrics, report);
  }

  /** 绑定组件到 Agent（绑定唯一事实源：agent 表；评估链路调用） */
  async bindAgentComponent(i: BindAgentComponentInput, o: BindAgentComponentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.bindAgentComponent(i, o, c, metrics, report);
  }

  /** 解绑 Agent 组件（幂等；评估链路调用） */
  async unbindAgentComponent(i: UnbindAgentComponentInput, o: UnbindAgentComponentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.unbindAgentComponent(i, o, c, metrics, report);
  }

  async ageAgent(i: AgeAgentInput, o: AgeAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.ageAgent(i, o, c, metrics, report);
  }

  async soAgentRule(i: GetAgentRuleInput, o: GetAgentRuleOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.soAgentRule(i, o, c, metrics, report);
  }

  async updateAgentRule(i: UpdateAgentRuleInput, o: UpdateAgentRuleOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.updateAgentRule(i, o, c, metrics, report);
  }

  async configAgentLibrary(i: ConfigAgentLibraryInput, o: ConfigAgentLibraryOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.initPromise;
    return this.service.configAgentLibrary(i, o, c, metrics, report);
  }
}
