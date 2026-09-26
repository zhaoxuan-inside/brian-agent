import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { LLMCoreSchemaInitializer } from '../infrastructure/LLMCoreSchemaInitializer';
import { LLMCoreService } from '../application/LLMCoreService';
import {
  LLMCoreContext,
  MatchLLMInput,
  MatchLLMOutput,
  LimitLLMInput,
  LimitLLMOutput,
  CheckLLMQuotaInput,
  CheckLLMQuotaOutput,
  ConfigLLMCoreInput,
  ConfigLLMCoreOutput,
  RecordLLMUsageInput,
  RecordLLMUsageOutput,
} from '../domain/types';

export class LLMCoreAccess {
  private readonly service: LLMCoreService;

  

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    
    new LLMCoreSchemaInitializer(relationDb).init();
    
    const rawService = new LLMCoreService(relationDb, llmAccess, promptsAccess);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  

  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  

  async matchLLM(input: MatchLLMInput, output: MatchLLMOutput, context: LLMCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.matchLLM(input, output, context, metrics, report);
  }

  

  async limitLLM(input: LimitLLMInput, output: LimitLLMOutput, context: LLMCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.limitLLM(input, output, context, metrics, report);
  }

  

  async checkLLMQuota(input: CheckLLMQuotaInput, output: CheckLLMQuotaOutput, context: LLMCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.checkLLMQuota(input, output, context, metrics, report);
  }

  

  async configLLMCore(input: ConfigLLMCoreInput, output: ConfigLLMCoreOutput, context: LLMCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configLLMCore(input, output, context, metrics, report);
  }

  

  async recordLLMUsage(input: RecordLLMUsageInput, output: RecordLLMUsageOutput, context: LLMCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.recordLLMUsage(input, output, context, metrics, report);
  }
}
