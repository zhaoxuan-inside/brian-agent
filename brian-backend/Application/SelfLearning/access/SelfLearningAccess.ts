import type { RelationDBAccess, GraphDBAccess, Logger, MQAccess } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { InfoCoreAccess, MQCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import type { EvolutorAgentAccess, WriterAgentAccess } from '@brian-agent/agent';
import type { OrchestrationEntryAccess } from '@brian-agent/orchestration';
import { SelfLearningSchemaInitializer } from '../infrastructure/SelfLearningSchemaInitializer';
import { SelfLearningService } from '../application/SelfLearningService';
import {
  SelfLearningContext,
  AddLibraryInput, AddLibraryOutput,
  DeleteLibraryInput, DeleteLibraryOutput,
  SearchLibraryInput, SearchLibraryOutput,
  GetLibraryFilesInput, GetLibraryFilesOutput,
  GetFileContentInput, GetFileContentOutput,
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
    orchestrationEntry: OrchestrationEntryAccess,
    graphDBAccess: GraphDBAccess,
    mqAccess: MQAccess,
    logger?: Logger,
  ) {
    this.initPromise = new SelfLearningSchemaInitializer(relationDb).init();
    const raw = new SelfLearningService(
      relationDb, infoCore, mqCore, llmCore,
      evolutorAgent, writerAgent, orchestrationEntry,
      graphDBAccess, mqAccess, logger,
    );
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async addLibrary(
    i: AddLibraryInput, c: SelfLearningContext, o: AddLibraryOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.addLibrary(i, c, o);
  }

  async deleteLibrary(
    i: DeleteLibraryInput, c: SelfLearningContext, o: DeleteLibraryOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.deleteLibrary(i, c, o);
  }

  async searchLibrary(
    i: SearchLibraryInput, c: SelfLearningContext, o: SearchLibraryOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.searchLibrary(i, c, o);
  }

  async getLibraryFiles(
    i: GetLibraryFilesInput, c: SelfLearningContext, o: GetLibraryFilesOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getLibraryFiles(i, c, o);
  }

  async getFileContent(
    i: GetFileContentInput, c: SelfLearningContext, o: GetFileContentOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getFileContent(i, c, o);
  }

  async startLearning(
    i: StartLearningInput, c: SelfLearningContext, o: StartLearningOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.startLearning(i, c, o);
  }

  async stopLearning(
    i: StopLearningInput, c: SelfLearningContext, o: StopLearningOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.stopLearning(i, c, o);
  }

  async getTagGraph(
    i: GetTagGraphInput, c: SelfLearningContext, o: GetTagGraphOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getTagGraph(i, c, o);
  }

  async getTagRelatedInfo(
    i: GetTagRelatedInfoInput, c: SelfLearningContext, o: GetTagRelatedInfoOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getTagRelatedInfo(i, c, o);
  }

  async getLearningProgress(
    i: GetLearningProgressInput, c: SelfLearningContext, o: GetLearningProgressOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getLearningProgress(i, c, o);
  }

  async getLearningResults(
    i: GetLearningResultsInput, c: SelfLearningContext, o: GetLearningResultsOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getLearningResults(i, c, o);
  }

  async getLearningStats(
    i: GetLearningStatsInput, c: SelfLearningContext, o: GetLearningStatsOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getLearningStats(i, c, o);
  }

  async configSelfLearning(
    i: ConfigSelfLearningInput, c: SelfLearningContext, o: ConfigSelfLearningOutput,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.configSelfLearning(i, c, o);
  }
}
