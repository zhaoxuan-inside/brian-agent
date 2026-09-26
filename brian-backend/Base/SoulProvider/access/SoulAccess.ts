import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
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

export class SoulAccess {
  private readonly service: SoulService;

  

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    
    new SoulSchemaInitializer(relationDb).init();
    
    const rawService = new SoulService(relationDb);
    this.service = AopProxy.wrap(rawService, { logger });
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
