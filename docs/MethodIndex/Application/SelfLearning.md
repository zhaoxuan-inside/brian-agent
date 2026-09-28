# Application / SelfLearning 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## SelfLearningAccess

源码：`brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `addLibrary` | `i: AddLibraryInput, o: AddLibraryOutput, c: SelfLearningContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `deleteLibrary` | `i: DeleteLibraryInput, o: DeleteLibraryOutput, c: SelfLearningContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `soLibrary` | `i: SearchLibraryInput, o: SearchLibraryOutput, c: SelfLearningContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `setLibraryEnabled` | `i: SetLibraryEnabledInput, o: SetLibraryEnabledOutput, c: SelfLearningContext, metrics?...` | `Promise<boolean>` | — |
| `soLibraryFiles` | `i: GetLibraryFilesInput, o: GetLibraryFilesOutput, c: SelfLearningContext, metrics?: Me...` | `Promise<boolean>` | — |
| `soLibraryTree` | `i: GetLibraryTreeInput, o: GetLibraryTreeOutput, c: SelfLearningContext, metrics?: Metr...` | `Promise<boolean>` | — |
| `soFileContent` | `i: GetFileContentInput, o: GetFileContentOutput, c: SelfLearningContext, metrics?: Metr...` | `Promise<boolean>` | — |
| `queryDocument` | `i: QueryDocumentInput, o: QueryDocumentOutput, c: SelfLearningContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `saveAnnotation` | `i: SaveAnnotationInput, o: SaveAnnotationOutput, c: SelfLearningContext, metrics?: Metr...` | `Promise<boolean>` | — |
| `soFileAnnotations` | `i: GetFileAnnotationsInput, o: GetFileAnnotationsOutput, c: SelfLearningContext, metric...` | `Promise<boolean>` | — |
| `updateFileContent` | `i: UpdateFileContentInput, o: UpdateFileContentOutput, c: SelfLearningContext, metrics?...` | `Promise<boolean>` | — |
| `deleteFile` | `i: DeleteFileInput, o: DeleteFileOutput, c: SelfLearningContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `ensureBuiltinDocumentAgent` | `` | `Promise<string>` | — |
| `startLearning` | `i: StartLearningInput, o: StartLearningOutput, c: SelfLearningContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `stopLearning` | `i: StopLearningInput, o: StopLearningOutput, c: SelfLearningContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `soTagGraph` | `i: GetTagGraphInput, o: GetTagGraphOutput, c: SelfLearningContext, metrics?: Metrics, r...` | `Promise<boolean>` | — |
| `soTagRelatedInfo` | `i: GetTagRelatedInfoInput, o: GetTagRelatedInfoOutput, c: SelfLearningContext, metrics?...` | `Promise<boolean>` | — |
| `soLearningProgress` | `i: GetLearningProgressInput, o: GetLearningProgressOutput, c: SelfLearningContext, metr...` | `Promise<boolean>` | — |
| `soLearningResults` | `i: GetLearningResultsInput, o: GetLearningResultsOutput, c: SelfLearningContext, metric...` | `Promise<boolean>` | — |
| `soLearningStats` | `i: GetLearningStatsInput, o: GetLearningStatsOutput, c: SelfLearningContext, metrics?: ...` | `Promise<boolean>` | — |
| `soLearningTasks` | `i: ListLearningTasksInput, o: ListLearningTasksOutput, c: SelfLearningContext, metrics?...` | `Promise<boolean>` | — |
| `configSelfLearning` | `i: ConfigSelfLearningInput, o: ConfigSelfLearningOutput, c: SelfLearningContext, metric...` | `Promise<boolean>` | — |
| `startTagAging` | `` | `Promise<void>` | — |
| `startOrphanTagCheck` | `` | `Promise<void>` | — |
