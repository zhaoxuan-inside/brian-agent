import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { PromptsAccess } from '../../PromptsProvider/access/PromptsAccess';
import { LLMSchemaInitializer } from '../infrastructure/LLMSchemaInitializer';
import { LLMService } from '../application/LLMService';
import {
  LLMContext,
  AddLLMProviderInput,
  AddLLMProviderOutput,
  UpdateLLMProviderInput,
  UpdateLLMProviderOutput,
  DelLLMProviderInput,
  DelLLMProviderOutput,
  SoLLMProviderInput,
  SoLLMProviderOutput,
  TestLLMProviderInput,
  TestLLMProviderOutput,
  ListLLMInput,
  ListLLMOutput,
  AddLLMInput,
  AddLLMOutput,
  DelLLMInput,
  DelLLMOutput,
  UpdateLLMInput,
  UpdateLLMOutput,
  SoLLMInput,
  SoLLMOutput,
  GetLLMInput,
  GetLLMOutput,
  ExecLLMInput,
  ExecLLMOutput,
  ExecLLMEventsInput,
  ExecLLMEventsOutput,
  EmbedLLMInput,
  EmbedLLMOutput,
  GenLLMAttrInput,
  GenLLMAttrOutput,
  VisualizedLLMInput,
  VisualizedLLMOutput,
  EnableLLMInput,
  EnableLLMOutput,
  SoTokenUsageInput,
  SoTokenUsageOutput,
  SoModelTokenStatsInput,
  SoModelTokenStatsOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

export class LLMAccess {
  private readonly service: LLMService;

  

  constructor(relationDb: RelationDBAccess, logger?: Logger, promptsAccess?: PromptsAccess) {
    
    new LLMSchemaInitializer(relationDb).init();
    
    const rawService = new LLMService(relationDb, logger, promptsAccess);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  

  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  
  
  

  
  async addLLMProvider(input: AddLLMProviderInput, output: AddLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addLLMProvider(input, output, context, metrics, report);
  }

  
  async updateLLMProvider(input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateLLMProvider(input, output, context, metrics, report);
  }

  
  async delLLMProvider(input: DelLLMProviderInput, output: DelLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delLLMProvider(input, output, context, metrics, report);
  }

  
  async soLLMProvider(input: SoLLMProviderInput, output: SoLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soLLMProvider(input, output, context, metrics, report);
  }

  
  async testLLMProvider(input: TestLLMProviderInput, output: TestLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.testLLMProvider(input, output, context, metrics, report);
  }

  
  async listLLM(input: ListLLMInput, output: ListLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.listLLM(input, output, context, metrics, report);
  }

  
  
  

  
  async addLLM(input: AddLLMInput, output: AddLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addLLM(input, output, context, metrics, report);
  }

  
  async delLLM(input: DelLLMInput, output: DelLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delLLM(input, output, context, metrics, report);
  }

  
  async updateLLM(input: UpdateLLMInput, output: UpdateLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateLLM(input, output, context, metrics, report);
  }

  
  async soLLM(input: SoLLMInput, output: SoLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soLLM(input, output, context, metrics, report);
  }

  
  async soLLMById(input: GetLLMInput, output: GetLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const soInput = Object.assign(new SoLLMInput(), {
      conditions: input.id
        ? [{ field: 'id', operator: 'EQ' as never, value: input.id }]
        : input.conditions,
    });
    const soOutput = new SoLLMOutput();
    await this.soLLM(soInput, soOutput, context, metrics, report);
    output.llm = (soOutput.list[0] as unknown as GetLLMOutput['llm']) || null;
    return true;
  }

  
  
  

  
  async execLLM(input: ExecLLMInput, output: ExecLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execLLM(input, output, context, metrics, report);
  }

  
  async execLLMEvents(input: ExecLLMEventsInput, output: ExecLLMEventsOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execLLMEvents(input, output, context, metrics, report);
  }

  
  async embedLLM(input: EmbedLLMInput, output: EmbedLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.embedLLM(input, output, context, metrics, report);
  }

  
  async genLLMAttr(input: GenLLMAttrInput, output: GenLLMAttrOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.genLLMAttr(input, output, context, metrics, report);
  }

  
  async visualizedLLM(input: VisualizedLLMInput, output: VisualizedLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.visualizedLLM(input, output, context, metrics, report);
  }

  
  async enableLLM(input: EnableLLMInput, output: EnableLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableLLM(input, output, context, metrics, report);
  }

  
  async soTokenUsage(input: SoTokenUsageInput, output: SoTokenUsageOutput, context: LLMContext,
  ): Promise<boolean> {
    return this.service.soTokenUsage(input, output, context);
  }

  async soModelTokenStats(input: SoModelTokenStatsInput, output: SoModelTokenStatsOutput, context: LLMContext,
  ): Promise<boolean> {
    return this.service.soModelTokenStats(input, output, context);
  }
}
