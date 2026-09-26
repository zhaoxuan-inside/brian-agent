import type { RelationDBAccess, Metrics, Report, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { SkillRuntimeService } from '../application/SkillRuntimeService';
import type { SkillRuntimeDeps } from '../application/mcpGate';
import {
  SkillRuntimeContext,
  RegisterSkillInput,
  RegisterSkillOutput,
  ExecSkillInput,
  ExecSkillOutput,
  SoSkillsInput,
  SoSkillsOutput,
  RegisterBuiltinSkillsInput,
  RegisterBuiltinSkillsOutput,
  RegisterRunSkillsInput,
  RegisterSkillsOutput,
  ClearRunSkillsInput,
  ConfigToolInput,
  ConfigToolOutput,
} from '../domain/types';

export class SkillRuntimeAccess {
  private readonly service: SkillRuntimeService;

  constructor(_relationDb: RelationDBAccess, builtinDeps?: SkillRuntimeDeps, logger?: Logger) {
    const rawService = new SkillRuntimeService(builtinDeps ?? {}, logger);
    this.service = AopProxy.wrap(rawService, { logger }) as SkillRuntimeService;
  }

  
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  
  async registerSkill(input: RegisterSkillInput, output: RegisterSkillOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.registerSkill(input, output, context, metrics, report);
  }

  
  async registerBuiltinSkills(input: RegisterBuiltinSkillsInput, output: RegisterBuiltinSkillsOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.registerBuiltinSkills(input, output, context, metrics, report);
  }

  
  async execSkill(input: ExecSkillInput, output: ExecSkillOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execSkill(input, output, context, metrics, report);
  }

  
  async soSkills(input: SoSkillsInput, output: SoSkillsOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSkills(input, output, context, metrics, report);
  }

  
  async registerRunSkills(input: RegisterRunSkillsInput, output: RegisterSkillsOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.registerRunSkills(input, output, context, metrics, report);
  }

  
  async clearRunSkills(input: ClearRunSkillsInput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.clearRunSkills(input, context, metrics, report);
  }

  
  async configTool(input: ConfigToolInput, output: ConfigToolOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configTool(input, output, context, metrics, report);
  }
}
