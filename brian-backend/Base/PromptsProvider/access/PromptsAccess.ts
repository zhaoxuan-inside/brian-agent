import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { PromptsSchemaInitializer } from '../infrastructure/PromptsSchemaInitializer';
import { PromptsService } from '../application/PromptsService';
import { PromptCatalogAccess } from '../../PromptCatalog/access/PromptCatalogAccess';
import {
  PromptContext,
  AddPromptInput,
  AddPromptOutput,
  DelPromptInput,
  DelPromptOutput,
  UpdatePromptInput,
  UpdatePromptOutput,
  GetPromptInput,
  GetPromptOutput,
  SoPromptInput,
  SoPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  EnablePromptsInput,
  EnablePromptsOutput,
  ClosePromptInput,
  ClosePromptOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';
import type { SemanticsTaskFn } from '../../shared/semantics';

export class PromptsAccess {
  private readonly service: PromptsService;
  private readonly catalog: PromptCatalogAccess;

  

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    
    new PromptsSchemaInitializer(relationDb).init();
    
    const rawService = new PromptsService(relationDb);
    this.service = AopProxy.wrap(rawService, { logger });
    this.catalog = new PromptCatalogAccess(relationDb);
  }

  
  
  
  
  
  
  

  
  
  
  
  

  setEmbedFn(fn: (text: string, context?: any) => Promise<number[]>): void {
    this.service.setEmbedFn(fn);
  }

  setSemanticsFn(fn: SemanticsTaskFn): void {
    this.service.setSemanticsFn(fn);
  }

  async initialize(): Promise<void> {
    await this.service.initialize();
    await this.catalog.seed();
  }

  
  async addPrompt(input: AddPromptInput, output: AddPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addPrompt(input, output, context, metrics, report);
  }

  
  async delPrompt(input: DelPromptInput, output: DelPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delPrompt(input, output, context, metrics, report);
  }

  
  async updatePrompt(input: UpdatePromptInput, output: UpdatePromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updatePrompt(input, output, context, metrics, report);
  }

  
  async soPromptById(input: GetPromptInput, output: GetPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soPromptById(input, output, context, metrics, report);
  }

  
  async soPrompt(input: SoPromptInput, output: SoPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soPrompt(input, output, context, metrics, report);
  }

  
  async execPrompt(input: ExecPromptInput, output: ExecPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execPrompt(input, output, context, metrics, report);
  }

  
  async enablePrompts(input: EnablePromptsInput, output: EnablePromptsOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enablePrompts(input, output, context, metrics, report);
  }

  
  async closePrompts(input: ClosePromptInput, output: ClosePromptOutput, context: PromptContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.closePrompts(input, output, context, metrics, report);
  }
}
