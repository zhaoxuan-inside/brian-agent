import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { TraceSchemaInitializer } from '../../TraceBase';
import { SoulSchemaInitializer } from '../infrastructure/SoulSchemaInitializer';
import { SoulService } from '../application/SoulService';
import {
  SoulContext,
  AddSoulInput,
  AddSoulOutput,
  DelSoulInput,
  DelSoulOutput,
  UpdateSoulInput,
  UpdateSoulOutput,
  GetSoulInput,
  GetSoulOutput,
  SoSoulInput,
  SoSoulOutput,
  EnableSoulInput,
  EnableSoulOutput,
  CloseSoulInput,
  CloseSoulOutput,
  RecordSoulUsageInput,
  RecordSoulUsageOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';
import type { SemanticsTaskFn } from '../../shared/semantics';

export class SoulAccess {
  private readonly service: SoulService;

  

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    
    // ADR-012: 初始化 TraceBase 统计表（含旧 usage 表改名/退役迁移）
    new TraceSchemaInitializer(relationDb).init();
    new SoulSchemaInitializer(relationDb).init();
    
    const rawService = new SoulService(relationDb);
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

  
  async addSoul(input: AddSoulInput, output: AddSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addSoul(input, output, context, metrics, report);
  }

  
  async delSoul(input: DelSoulInput, output: DelSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delSoul(input, output, context, metrics, report);
  }

  
  async updateSoul(input: UpdateSoulInput, output: UpdateSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateSoul(input, output, context, metrics, report);
  }

  
  async soSoulById(input: GetSoulInput, output: GetSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSoulById(input, output, context, metrics, report);
  }

  
  async soSoul(input: SoSoulInput, output: SoSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSoul(input, output, context, metrics, report);
  }

  
  async enableSoul(input: EnableSoulInput, output: EnableSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableSoul(input, output, context, metrics, report);
  }

  
  async closeSoul(input: CloseSoulInput, output: CloseSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.closeSoul(input, output, context, metrics, report);
  }

  
  async recordSoulUsage(input: RecordSoulUsageInput, output: RecordSoulUsageOutput, context: SoulContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.recordSoulUsage(input, output, context, metrics, report);
  }
}
