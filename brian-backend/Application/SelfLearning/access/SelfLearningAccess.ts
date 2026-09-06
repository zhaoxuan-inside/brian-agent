import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, GraphDBAccess, Logger, MQAccess, ChunkAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, MQCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import type { EvolutorAgentAccess, WriterAgentAccess } from '@brian-agent/agent';
import { SelfLearningSchemaInitializer } from '../infrastructure/SelfLearningSchemaInitializer';
import { SelfLearningService } from '../application/SelfLearningService';
import {
  SelfLearningContext,
  AddLibraryInput, AddLibraryOutput,
  DeleteLibraryInput, DeleteLibraryOutput,
  SearchLibraryInput, SearchLibraryOutput,
  SetLibraryEnabledInput, SetLibraryEnabledOutput,
  GetLibraryFilesInput, GetLibraryFilesOutput,
  GetLibraryTreeInput, GetLibraryTreeOutput,
  GetFileContentInput, GetFileContentOutput,
  QueryDocumentInput, QueryDocumentOutput,
  SaveAnnotationInput, SaveAnnotationOutput,
  GetFileAnnotationsInput, GetFileAnnotationsOutput,
  StartLearningInput, StartLearningOutput,
  StopLearningInput, StopLearningOutput,
  GetTagGraphInput, GetTagGraphOutput,
  GetTagRelatedInfoInput, GetTagRelatedInfoOutput,
  GetLearningProgressInput, GetLearningProgressOutput,
  GetLearningResultsInput, GetLearningResultsOutput,
  GetLearningStatsInput, GetLearningStatsOutput,
  ConfigSelfLearningInput, ConfigSelfLearningOutput,
} from '../domain/types';

export class SelfLearningAccess {
  private readonly service: SelfLearningService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    infoCore: InfoCoreAccess,
    mqCore: MQCoreAccess,
    llmCore: LLMCoreAccess,
    evolutorAgent: EvolutorAgentAccess,
    writerAgent: WriterAgentAccess,
    graphDBAccess: GraphDBAccess,
    mqAccess: MQAccess,
    chunkAccess: ChunkAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    this.initPromise = new SelfLearningSchemaInitializer(relationDb).init();
    const raw = new SelfLearningService(
      relationDb, infoCore, mqCore, llmCore,
      evolutorAgent, writerAgent,
      graphDBAccess, chunkAccess, mqAccess, llmAccess, promptsAccess, logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async addLibrary(i: AddLibraryInput, o: AddLibraryOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.addLibrary(i, o, c, metrics, report);
  }

  async deleteLibrary(i: DeleteLibraryInput, o: DeleteLibraryOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.deleteLibrary(i, o, c, metrics, report);
  }

  async soLibrary(i: SearchLibraryInput, o: SearchLibraryOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soLibrary(i, o, c, metrics, report);
  }

  async setLibraryEnabled(i: SetLibraryEnabledInput, o: SetLibraryEnabledOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.setLibraryEnabled(i, o, c, metrics, report);
  }

  async soLibraryFiles(i: GetLibraryFilesInput, o: GetLibraryFilesOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soLibraryFiles(i, o, c, metrics, report);
  }

  async soLibraryTree(i: GetLibraryTreeInput, o: GetLibraryTreeOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soLibraryTree(i, o, c, metrics, report);
  }

  async soFileContent(i: GetFileContentInput, o: GetFileContentOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soFileContent(i, o, c, metrics, report);
  }

  async queryDocument(i: QueryDocumentInput, o: QueryDocumentOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.queryDocument(i, o, c, metrics, report);
  }

  async saveAnnotation(i: SaveAnnotationInput, o: SaveAnnotationOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.saveAnnotation(i, o, c, metrics, report);
  }

  async soFileAnnotations(i: GetFileAnnotationsInput, o: GetFileAnnotationsOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soFileAnnotations(i, o, c, metrics, report);
  }

  async startLearning(i: StartLearningInput, o: StartLearningOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.startLearning(i, o, c, metrics, report);
  }

  async stopLearning(i: StopLearningInput, o: StopLearningOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.stopLearning(i, o, c, metrics, report);
  }

  async soTagGraph(i: GetTagGraphInput, o: GetTagGraphOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soTagGraph(i, o, c, metrics, report);
  }

  async soTagRelatedInfo(i: GetTagRelatedInfoInput, o: GetTagRelatedInfoOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soTagRelatedInfo(i, o, c, metrics, report);
  }

  async soLearningProgress(i: GetLearningProgressInput, o: GetLearningProgressOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soLearningProgress(i, o, c, metrics, report);
  }

  async soLearningResults(i: GetLearningResultsInput, o: GetLearningResultsOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soLearningResults(i, o, c, metrics, report);
  }

  async soLearningStats(i: GetLearningStatsInput, o: GetLearningStatsOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soLearningStats(i, o, c, metrics, report);
  }

  async configSelfLearning(i: ConfigSelfLearningInput, o: ConfigSelfLearningOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configSelfLearning(i, o, c, metrics, report);
  }

  /** 标签老化（供 CronProvider 定时触发） */
  async startTagAging(): Promise<void> {
    await this.initPromise;
    await (this.service as unknown as { startTagAging(): Promise<void> }).startTagAging();
  }

  /** 孤立标签检查（供 CronProvider 定时触发） */
  async startOrphanTagCheck(): Promise<void> {
    await this.initPromise;
    await (this.service as unknown as { startOrphanTagCheck(): Promise<void> }).startOrphanTagCheck();
  }
}
