import { AopProxy, Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, GraphDBAccess, Logger } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import { MemoryService } from '../application/MemoryService';
import {
  MemoryContext,
  ListMemoryInput, ListMemoryOutput,
  SearchMemoryInput, SearchMemoryOutput,
  GetMemoryByTagInput, GetMemoryByTagOutput,
  DeleteMemoryInput, DeleteMemoryOutput,
  ListMemoryTagsInput, ListMemoryTagsOutput,
  GetCooccurGraphInput, GetCooccurGraphOutput,
  ClearTagGraphInput, ClearTagGraphOutput,
  ClearKeywordGraphInput, ClearKeywordGraphOutput,
  GraphSearchMemoryInput, GraphSearchMemoryOutput,
  GetMemoryStatsInput, GetMemoryStatsOutput,
  GetMemoryHeatmapInput, GetMemoryHeatmapOutput,
  GetMemoryDateCountsInput, GetMemoryDateCountsOutput,
} from '../domain/types';

export class MemoryAccess {
  private readonly service: MemoryService;

  constructor(
    relationDb: RelationDBAccess,
    infoCore: InfoCoreAccess,
    graphDBAccess: GraphDBAccess,
    logger?: Logger,
  ) {
    const raw = new MemoryService(relationDb, infoCore, graphDBAccess, logger);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async soMemoryList(i: ListMemoryInput, o: ListMemoryOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMemoryList(i, o, c, metrics, report);
  }

  async soMemoryByTag(i: GetMemoryByTagInput, o: GetMemoryByTagOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMemoryByTag(i, o, c, metrics, report);
  }

  async searchMemory(i: SearchMemoryInput, o: SearchMemoryOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.searchMemory(i, o, c, metrics, report);
  }

  async delMemory(i: DeleteMemoryInput, o: DeleteMemoryOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delMemory(i, o, c, metrics, report);
  }

  async soMemoryTags(i: ListMemoryTagsInput, o: ListMemoryTagsOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMemoryTags(i, o, c, metrics, report);
  }

  async soTagGraph(i: GetCooccurGraphInput, o: GetCooccurGraphOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soTagGraph(i, o, c, metrics, report);
  }

  async soKeywordGraph(i: GetCooccurGraphInput, o: GetCooccurGraphOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soKeywordGraph(i, o, c, metrics, report);
  }

  async delTagGraph(i: ClearTagGraphInput, o: ClearTagGraphOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delTagGraph(i, o, c, metrics, report);
  }

  async delKeywordGraph(i: ClearKeywordGraphInput, o: ClearKeywordGraphOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delKeywordGraph(i, o, c, metrics, report);
  }

  async graphSearchMemory(i: GraphSearchMemoryInput, o: GraphSearchMemoryOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.graphSearchMemory(i, o, c, metrics, report);
  }

  async soMemoryStats(i: GetMemoryStatsInput, o: GetMemoryStatsOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMemoryStats(i, o, c, metrics, report);
  }

  async soMemoryHeatmap(i: GetMemoryHeatmapInput, o: GetMemoryHeatmapOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMemoryHeatmap(i, o, c, metrics, report);
  }

  async soMemoryDateCounts(i: GetMemoryDateCountsInput, o: GetMemoryDateCountsOutput, c: MemoryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMemoryDateCounts(i, o, c, metrics, report);
  }
}
