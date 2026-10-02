import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { TraceSchemaInitializer } from '../../TraceBase';
import { SkillSchemaInitializer } from '../infrastructure/SkillSchemaInitializer';
import { SkillService } from '../application/SkillService';
import { IsolatedVMSandbox } from '../infrastructure/sandbox/IsolatedVMSandbox';
import type { ISandbox } from '../infrastructure/sandbox/ISandbox';
import {
  SkillContext,
  AddSkillInput,
  AddSkillOutput,
  GetSkillInput,
  GetSkillOutput,
  UpdateSkillInput,
  UpdateSkillOutput,
  DelSkillInput,
  DelSkillOutput,
  SoSkillInput,
  SoSkillOutput,
  ExecSkillInput,
  ExecSkillOutput,
  EnableSkillInput,
  EnableSkillOutput,
  SeedSystemSkillsInput,
  SeedSystemSkillsOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';
import type { SemanticsTaskFn } from '../../shared/semantics';

export class SkillAccess {
  private readonly service: SkillService;
  

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    
    // ADR-012: 初始化 TraceBase 统计表（含旧 usage 表改名/退役迁移）
    new TraceSchemaInitializer(relationDb).init();
    new SkillSchemaInitializer(relationDb).init();
    
    
    
    
    const sandbox: ISandbox = new IsolatedVMSandbox();
    
    const rawService = new SkillService(relationDb, sandbox);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  

  setEmbedFn(fn: (text: string, context?: any) => Promise<number[]>): void {
    this.service.setEmbedFn(fn);
  }

  setSemanticsFn(fn: SemanticsTaskFn): void {
    this.service.setSemanticsFn(fn);
  }

  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  
  async addSkill(input: AddSkillInput, output: AddSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addSkill(input, output, context, metrics, report);
  }

  
  async seedSystemSkills(input: SeedSystemSkillsInput, output: SeedSystemSkillsOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.seedSystemSkills(input, output, context, metrics, report);
  }

  
  async soSkillById(input: GetSkillInput, output: GetSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSkillById(input, output, context, metrics, report);
  }

  
  async updateSkill(input: UpdateSkillInput, output: UpdateSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateSkill(input, output, context, metrics, report);
  }

  
  async delSkill(input: DelSkillInput, output: DelSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delSkill(input, output, context, metrics, report);
  }

  
  async soSkill(input: SoSkillInput, output: SoSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSkill(input, output, context, metrics, report);
  }

  
  async execSkill(input: ExecSkillInput, output: ExecSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execSkill(input, output, context, metrics, report);
  }

  
  async enableSkill(input: EnableSkillInput, output: EnableSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableSkill(input, output, context, metrics, report);
  }
}
