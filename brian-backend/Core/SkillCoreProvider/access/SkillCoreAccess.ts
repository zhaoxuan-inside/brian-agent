import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess } from '@brian-agent/base';
import type { SkillAccess } from '@brian-agent/base';
import type { LLMAccess } from '@brian-agent/base';
import type { PromptsAccess } from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { SkillCoreSchemaInitializer } from '../infrastructure/SkillCoreSchemaInitializer';
import { GitHubSkillClient } from '../infrastructure/GitHubSkillClient';
import { SkillCoreService } from '../application/SkillCoreService';
import {
  SkillCoreContext,
  MatchSkillInput,
  MatchSkillOutput,
  OptSkillInput,
  OptSkillOutput,
  AgeSkillInput,
  AgeSkillOutput,
  SoSkillRuleInput,
  SoSkillRuleOutput,
  UpdateSkillRuleInput,
  UpdateSkillRuleOutput,
  ConfigSkillCoreInput,
  ConfigSkillCoreOutput,
} from '../domain/types';

export class SkillCoreAccess {
  private readonly service: SkillCoreService;

  

  constructor(
    relationDb: RelationDBAccess,
    skillAccess: SkillAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    
    new SkillCoreSchemaInitializer(relationDb).init();
    
    const rawService = new SkillCoreService(
      relationDb,
      skillAccess,
      llmAccess,
      promptsAccess,
      new GitHubSkillClient(),
    );
    this.service = AopProxy.wrap(rawService, { logger });
  }

  
  async matchSkill(input: MatchSkillInput, output: MatchSkillOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.matchSkill(input, output, context, metrics, report);
  }

  
  async optSkill(input: OptSkillInput, output: OptSkillOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.optSkill(input, output, context, metrics, report);
  }

  
  async ageSkill(input: AgeSkillInput, output: AgeSkillOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.ageSkill(input, output, context, metrics, report);
  }

  
  async soSkillRule(input: SoSkillRuleInput, output: SoSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSkillRule(input, output, context, metrics, report);
  }

  
  async updateSkillRule(input: UpdateSkillRuleInput, output: UpdateSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateSkillRule(input, output, context, metrics, report);
  }

  
  async configSkillCore(input: ConfigSkillCoreInput, output: ConfigSkillCoreOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configSkillCore(input, output, context, metrics, report);
  }
}
