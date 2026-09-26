import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess } from '@brian-agent/base';
import type { SoulAccess } from '@brian-agent/base';
import type { LLMAccess } from '@brian-agent/base';
import type { PromptsAccess } from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { SoulCoreSchemaInitializer } from '../infrastructure/SoulCoreSchemaInitializer';
import { SoulCoreService } from '../application/SoulCoreService';
import {
  SoulCoreContext,
  MatchSoulInput,
  MatchSoulOutput,
  OptSoulInput,
  OptSoulOutput,
  AgeSoulInput,
  AgeSoulOutput,
  SoSoulContentInput,
  SoSoulContentOutput,
  SoSoulRuleInput,
  SoSoulRuleOutput,
  UpdateSoulRuleInput,
  UpdateSoulRuleOutput,
  ConfigSoulCoreInput,
  ConfigSoulCoreOutput,
} from '../domain/types';

export class SoulCoreAccess {
  private readonly service: SoulCoreService;

  

  constructor(
    relationDb: RelationDBAccess,
    soulAccess: SoulAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    
    new SoulCoreSchemaInitializer(relationDb).init();
    
    const rawService = new SoulCoreService(
      relationDb,
      soulAccess,
      llmAccess,
      promptsAccess,
    );
    this.service = AopProxy.wrap(rawService, { logger });
  }

  

  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  

  async matchSoul(input: MatchSoulInput, output: MatchSoulOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.matchSoul(input, output, context, metrics, report);
  }

  

  async optSoul(input: OptSoulInput, output: OptSoulOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.optSoul(input, output, context, metrics, report);
  }

  

  async ageSoul(input: AgeSoulInput, output: AgeSoulOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.ageSoul(input, output, context, metrics, report);
  }

  

  async soSoulRule(input: SoSoulRuleInput, output: SoSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSoulRule(input, output, context, metrics, report);
  }

  

  async updateSoulRule(input: UpdateSoulRuleInput, output: UpdateSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateSoulRule(input, output, context, metrics, report);
  }

  

  async soSoulContent(input: SoSoulContentInput, output: SoSoulContentOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSoulContent(input, output, context, metrics, report);
  }

  

  async configSoulCore(input: ConfigSoulCoreInput, output: ConfigSoulCoreOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configSoulCore(input, output, context, metrics, report);
  }
}
