import { Metrics, Report } from '@brian-agent/base';
import type {
  RelationDBAccess,
  LLMAccess,
  PromptsAccess,
  VectorDBAccess,
  GraphDBAccess,
} from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { InfoCoreSchemaInitializer } from '../infrastructure/InfoCoreSchemaInitializer';
import { InfoCoreService } from '../application/InfoCoreService';
import {
  InfoCoreContext,
  SaveInfoInput,
  SaveInfoOutput,
  PinInfoInput,
  PinInfoOutput,
  ProcessInfoInput,
  VectorInfoOutput,
  TagInfoOutput,
  SummaryInfoOutput,
  KeywordInfoOutput,
  GraphTagInput,
  GraphTagOutput,
  RebuildCooccurGraphInput,
  RebuildCooccurGraphOutput,
  LastNInfoInput,
  LastNInfoOutput,
  GraphNInfoInput,
  GraphNInfoOutput,
  SimilarKInfoInput,
  SimilarKInfoOutput,
  KeywordKInfoInput,
  KeywordKInfoOutput,
  RelationKInfoInput,
  RelationKInfoOutput,
  GraphInfoInput,
  GraphInfoOutput,
  SoCitationEdgesInput,
  SoCitationEdgesOutput,
  DelInfoGraphInput,
  DelInfoGraphOutput,
  ClearGraphInput,
  ClearGraphOutput,
  RebuildCitationGraphInput,
  RebuildCitationGraphOutput,
  ContextInfoInput,
  ContextInfoOutput,
  SoContextByWorkInput,
  SoContextByWorkOutput,
  SoInfoTagConfigInput,
  SoInfoTagConfigOutput,
  UpdateInfoTagConfigInput,
  UpdateInfoTagConfigOutput,
  SoInfoSummaryConfigInput,
  SoInfoSummaryConfigOutput,
  UpdateInfoSummaryConfigInput,
  UpdateInfoSummaryConfigOutput,
  SoInfoConfigInput,
  SoInfoConfigOutput,
  UpdateInfoConfigInput,
  UpdateInfoConfigOutput,
  SoInfoVectorConfigInput,
  SoInfoVectorConfigOutput,
  UpdateInfoVectorConfigInput,
  UpdateInfoVectorConfigOutput,
  SoInfoContextConfigInput,
  SoInfoContextConfigOutput,
  UpdateInfoContextConfigInput,
  UpdateInfoContextConfigOutput,
  DelInfoInput,
  DelInfoOutput,
  UpdateInfoInput,
  UpdateInfoOutput,
  DelInfoByWorkInput,
  DelInfoByWorkOutput,
  DelInfoBySessionInput,
  DelInfoBySessionOutput,
  ExistInfoInput,
  ExistInfoOutput,
  CleanOrphanGraphNodesInput,
  CleanOrphanGraphNodesOutput,
  BackfillMissingSummariesInput,
  BackfillMissingSummariesOutput,
} from '../domain/types';

export class InfoCoreAccess {
  private readonly service: InfoCoreService;

  

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    vectorDb: VectorDBAccess,
    graphDb: GraphDBAccess,
    logger?: Logger,
  ) {
    new InfoCoreSchemaInitializer(relationDb).init();
    const rawService = new InfoCoreService(
      relationDb,
      llmAccess,
      promptsAccess,
      vectorDb,
      graphDb,
    );
    this.service = AopProxy.wrap(rawService, { logger });
  }

  

  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  
  
  

  
  async saveInfo(input: SaveInfoInput, output: SaveInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.saveInfo(input, output, context, metrics, report);
  }

  
  async pinInfo(input: PinInfoInput, output: PinInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.pinInfo(input, output, context, metrics, report);
  }

  
  
  

  
  async vectorInfo(input: ProcessInfoInput, output: VectorInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.vectorInfo(input, output, context, metrics, report);
  }

  
  async tagInfo(input: ProcessInfoInput, output: TagInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.tagInfo(input, output, context, metrics, report);
  }

  
  async summaryInfo(input: ProcessInfoInput, output: SummaryInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.summaryInfo(input, output, context, metrics, report);
  }

  
  async keywordInfo(input: ProcessInfoInput, output: KeywordInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.keywordInfo(input, output, context, metrics, report);
  }

  
  async graphTag(input: GraphTagInput, output: GraphTagOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.graphTag(input, output, context, metrics, report);
  }

  
  async rebuildCooccurGraph(input: RebuildCooccurGraphInput, output: RebuildCooccurGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.rebuildCooccurGraph(input, output, context, metrics, report);
  }

  
  
  

  
  async lastNInfo(input: LastNInfoInput, output: LastNInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.lastNInfo(input, output, context, metrics, report);
  }

  
  async graphNInfo(input: GraphNInfoInput, output: GraphNInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.graphNInfo(input, output, context, metrics, report);
  }

  
  async similarKInfo(input: SimilarKInfoInput, output: SimilarKInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.similarKInfo(input, output, context, metrics, report);
  }

  
  async keywordKInfo(input: KeywordKInfoInput, output: KeywordKInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.keywordKInfo(input, output, context, metrics, report);
  }

  
  async relationKInfo(input: RelationKInfoInput, output: RelationKInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.relationKInfo(input, output, context, metrics, report);
  }

  
  async graphInfo(input: GraphInfoInput, output: GraphInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.graphInfo(input, output, context, metrics, report);
  }

  
  async soCitationEdges(input: SoCitationEdgesInput, output: SoCitationEdgesOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soCitationEdges(input, output, context, metrics, report);
  }

  
  async delInfoGraph(input: DelInfoGraphInput, output: DelInfoGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delInfoGraph(input, output, context, metrics, report);
  }

  
  async clearGraph(input: ClearGraphInput, output: ClearGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.clearGraph(input, output, context, metrics, report);
  }

  
  async rebuildCitationGraph(input: RebuildCitationGraphInput, output: RebuildCitationGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.rebuildCitationGraph(input, output, context, metrics, report);
  }

  
  async context(input: ContextInfoInput, output: ContextInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.context(input, output, context, metrics, report);
  }

  
  async soContextByWork(input: SoContextByWorkInput, output: SoContextByWorkOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soContextByWork(input, output, context, metrics, report);
  }

  
  
  

  
  async soInfoTagConfig(input: SoInfoTagConfigInput, output: SoInfoTagConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soInfoTagConfig(input, output, context, metrics, report);
  }

  
  async updateInfoTagConfig(input: UpdateInfoTagConfigInput, output: UpdateInfoTagConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfoTagConfig(input, output, context, metrics, report);
  }

  
  async soInfoSummaryConfig(input: SoInfoSummaryConfigInput, output: SoInfoSummaryConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soInfoSummaryConfig(input, output, context, metrics, report);
  }

  
  async updateInfoSummaryConfig(input: UpdateInfoSummaryConfigInput, output: UpdateInfoSummaryConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfoSummaryConfig(input, output, context, metrics, report);
  }

  
  async soInfoConfig(input: SoInfoConfigInput, output: SoInfoConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soInfoConfig(input, output, context, metrics, report);
  }

  
  async updateInfoConfig(input: UpdateInfoConfigInput, output: UpdateInfoConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfoConfig(input, output, context, metrics, report);
  }

  
  async soInfoVectorConfig(input: SoInfoVectorConfigInput, output: SoInfoVectorConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soInfoVectorConfig(input, output, context, metrics, report);
  }

  
  async updateInfoVectorConfig(input: UpdateInfoVectorConfigInput, output: UpdateInfoVectorConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfoVectorConfig(input, output, context, metrics, report);
  }

  
  async soInfoContextConfig(input: SoInfoContextConfigInput, output: SoInfoContextConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soInfoContextConfig(input, output, context, metrics, report);
  }

  
  async updateInfoContextConfig(input: UpdateInfoContextConfigInput, output: UpdateInfoContextConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfoContextConfig(input, output, context, metrics, report);
  }

  
  
  

  
  async delInfo(input: DelInfoInput, output: DelInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delInfo(input, output, context, metrics, report);
  }

  
  async backfillMissingSummaries(input: BackfillMissingSummariesInput, output: BackfillMissingSummariesOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.backfillMissingSummaries(input, output, context, metrics, report);
  }

  
  async updateInfo(input: UpdateInfoInput, output: UpdateInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateInfo(input, output, context, metrics, report);
  }

  
  async delInfoByWork(input: DelInfoByWorkInput, output: DelInfoByWorkOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delInfoByWork(input, output, context, metrics, report);
  }

  
  async delInfoBySession(input: DelInfoBySessionInput, output: DelInfoBySessionOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delInfoBySession(input, output, context, metrics, report);
  }

  
  
  

  
  async existVectorInfo(input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.existVectorInfo(input, output, context, metrics, report);
  }

  
  async existTagInfo(input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.existTagInfo(input, output, context, metrics, report);
  }

  
  async existSummaryInfo(input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.existSummaryInfo(input, output, context, metrics, report);
  }

  async cleanOrphanGraphNodes(input: CleanOrphanGraphNodesInput, output: CleanOrphanGraphNodesOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.cleanOrphanGraphNodes(input, output, context, metrics, report);
  }
}
