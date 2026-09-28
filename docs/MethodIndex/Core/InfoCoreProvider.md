# Core / InfoCoreProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## InfoCoreAccess

源码：`brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `saveInfo` | `input: SaveInfoInput, output: SaveInfoOutput, context: InfoCoreContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `pinInfo` | `input: PinInfoInput, output: PinInfoOutput, context: InfoCoreContext, metrics?: Metrics...` | `Promise<boolean>` | — |
| `vectorInfo` | `input: ProcessInfoInput, output: VectorInfoOutput, context: InfoCoreContext, metrics?: ...` | `Promise<boolean>` | — |
| `tagInfo` | `input: ProcessInfoInput, output: TagInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | — |
| `summaryInfo` | `input: ProcessInfoInput, output: SummaryInfoOutput, context: InfoCoreContext, metrics?:...` | `Promise<boolean>` | — |
| `keywordInfo` | `input: ProcessInfoInput, output: KeywordInfoOutput, context: InfoCoreContext, metrics?:...` | `Promise<boolean>` | — |
| `graphTag` | `input: GraphTagInput, output: GraphTagOutput, context: InfoCoreContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `rebuildCooccurGraph` | `input: RebuildCooccurGraphInput, output: RebuildCooccurGraphOutput, context: InfoCoreCo...` | `Promise<boolean>` | — |
| `lastNInfo` | `input: LastNInfoInput, output: LastNInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | — |
| `graphNInfo` | `input: GraphNInfoInput, output: GraphNInfoOutput, context: InfoCoreContext, metrics?: M...` | `Promise<boolean>` | — |
| `similarKInfo` | `input: SimilarKInfoInput, output: SimilarKInfoOutput, context: InfoCoreContext, metrics...` | `Promise<boolean>` | — |
| `keywordKInfo` | `input: KeywordKInfoInput, output: KeywordKInfoOutput, context: InfoCoreContext, metrics...` | `Promise<boolean>` | — |
| `relationKInfo` | `input: RelationKInfoInput, output: RelationKInfoOutput, context: InfoCoreContext, metri...` | `Promise<boolean>` | — |
| `graphInfo` | `input: GraphInfoInput, output: GraphInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | — |
| `soCitationEdges` | `input: SoCitationEdgesInput, output: SoCitationEdgesOutput, context: InfoCoreContext, m...` | `Promise<boolean>` | — |
| `delInfoGraph` | `input: DelInfoGraphInput, output: DelInfoGraphOutput, context: InfoCoreContext, metrics...` | `Promise<boolean>` | — |
| `clearGraph` | `input: ClearGraphInput, output: ClearGraphOutput, context: InfoCoreContext, metrics?: M...` | `Promise<boolean>` | — |
| `rebuildCitationGraph` | `input: RebuildCitationGraphInput, output: RebuildCitationGraphOutput, context: InfoCore...` | `Promise<boolean>` | — |
| `context` | `input: ContextInfoInput, output: ContextInfoOutput, context: InfoCoreContext, metrics?:...` | `Promise<boolean>` | — |
| `soContextByWork` | `input: SoContextByWorkInput, output: SoContextByWorkOutput, context: InfoCoreContext, m...` | `Promise<boolean>` | — |
| `soInfoTagConfig` | `input: SoInfoTagConfigInput, output: SoInfoTagConfigOutput, context: InfoCoreContext, m...` | `Promise<boolean>` | — |
| `updateInfoTagConfig` | `input: UpdateInfoTagConfigInput, output: UpdateInfoTagConfigOutput, context: InfoCoreCo...` | `Promise<boolean>` | — |
| `soInfoSummaryConfig` | `input: SoInfoSummaryConfigInput, output: SoInfoSummaryConfigOutput, context: InfoCoreCo...` | `Promise<boolean>` | — |
| `updateInfoSummaryConfig` | `input: UpdateInfoSummaryConfigInput, output: UpdateInfoSummaryConfigOutput, context: In...` | `Promise<boolean>` | — |
| `soInfoConfig` | `input: SoInfoConfigInput, output: SoInfoConfigOutput, context: InfoCoreContext, metrics...` | `Promise<boolean>` | — |
| `updateInfoConfig` | `input: UpdateInfoConfigInput, output: UpdateInfoConfigOutput, context: InfoCoreContext,...` | `Promise<boolean>` | — |
| `soInfoVectorConfig` | `input: SoInfoVectorConfigInput, output: SoInfoVectorConfigOutput, context: InfoCoreCont...` | `Promise<boolean>` | — |
| `updateInfoVectorConfig` | `input: UpdateInfoVectorConfigInput, output: UpdateInfoVectorConfigOutput, context: Info...` | `Promise<boolean>` | — |
| `soInfoContextConfig` | `input: SoInfoContextConfigInput, output: SoInfoContextConfigOutput, context: InfoCoreCo...` | `Promise<boolean>` | — |
| `updateInfoContextConfig` | `input: UpdateInfoContextConfigInput, output: UpdateInfoContextConfigOutput, context: In...` | `Promise<boolean>` | — |
| `delInfo` | `input: DelInfoInput, output: DelInfoOutput, context: InfoCoreContext, metrics?: Metrics...` | `Promise<boolean>` | — |
| `backfillMissingSummaries` | `input: BackfillMissingSummariesInput, output: BackfillMissingSummariesOutput, context: ...` | `Promise<boolean>` | — |
| `updateInfo` | `input: UpdateInfoInput, output: UpdateInfoOutput, context: InfoCoreContext, metrics?: M...` | `Promise<boolean>` | — |
| `delInfoByWork` | `input: DelInfoByWorkInput, output: DelInfoByWorkOutput, context: InfoCoreContext, metri...` | `Promise<boolean>` | — |
| `delInfoBySession` | `input: DelInfoBySessionInput, output: DelInfoBySessionOutput, context: InfoCoreContext,...` | `Promise<boolean>` | — |
| `existVectorInfo` | `input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | — |
| `existTagInfo` | `input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | — |
| `existSummaryInfo` | `input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Met...` | `Promise<boolean>` | — |
| `cleanOrphanGraphNodes` | `input: CleanOrphanGraphNodesInput, output: CleanOrphanGraphNodesOutput, context: InfoCo...` | `Promise<boolean>` | — |
