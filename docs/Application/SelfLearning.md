# Application / SelfLearning

- 层：**Application**　模块：**SelfLearning**
- 方法数：**95**（逻辑控制 36 · 数据处理 46 · 通用算法 13）

## 文件 `brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts`

### SelfLearningAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:65
- **引用次数**：272

#### `addLibrary`

- **类型**：逻辑控制
- **说明**：写入/新增：library（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`addLibrary(i: AddLibraryInput, o: AddLibraryOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:69
- **引用次数**：20

#### `deleteLibrary`

- **类型**：逻辑控制
- **说明**：删除/清理：library（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`deleteLibrary(i: DeleteLibraryInput, o: DeleteLibraryOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:75
- **引用次数**：9

#### `soLibrary`

- **类型**：逻辑控制
- **说明**：查询：library（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soLibrary(i: SearchLibraryInput, o: SearchLibraryOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:81
- **引用次数**：11

#### `setLibraryEnabled`

- **类型**：逻辑控制
- **说明**：更新：library / enabled（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`setLibraryEnabled(i: SetLibraryEnabledInput, o: SetLibraryEnabledOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:87
- **引用次数**：4

#### `soLibraryFiles`

- **类型**：逻辑控制
- **说明**：查询：library / files（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soLibraryFiles(i: GetLibraryFilesInput, o: GetLibraryFilesOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:93
- **引用次数**：13

#### `soLibraryTree`

- **类型**：逻辑控制
- **说明**：查询：library / 树形结构（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soLibraryTree(i: GetLibraryTreeInput, o: GetLibraryTreeOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:99
- **引用次数**：4

#### `soFileContent`

- **类型**：逻辑控制
- **说明**：查询：文件 / content（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soFileContent(i: GetFileContentInput, o: GetFileContentOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:105
- **引用次数**：11

#### `queryDocument`

- **类型**：逻辑控制
- **说明**：查询：document（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`queryDocument(i: QueryDocumentInput, o: QueryDocumentOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:111
- **引用次数**：6

#### `saveAnnotation`

- **类型**：逻辑控制
- **说明**：写入/新增：annotation（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`saveAnnotation(i: SaveAnnotationInput, o: SaveAnnotationOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:117
- **引用次数**：6

#### `soFileAnnotations`

- **类型**：逻辑控制
- **说明**：查询：文件 / annotations（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soFileAnnotations(i: GetFileAnnotationsInput, o: GetFileAnnotationsOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:123
- **引用次数**：4

#### `updateFileContent`

- **类型**：逻辑控制
- **说明**：更新：文件 / content（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`updateFileContent(i: UpdateFileContentInput, o: UpdateFileContentOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:129
- **引用次数**：14

#### `deleteFile`

- **类型**：逻辑控制
- **说明**：删除/清理：文件（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`deleteFile(i: DeleteFileInput, o: DeleteFileOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:135
- **引用次数**：14

#### `ensureBuiltinDocumentAgent`

- **类型**：逻辑控制
- **说明**：确保就绪：builtin / document / Agent（异步编排，接入层转发至 Service）
- **签名**：`ensureBuiltinDocumentAgent(): Promise<string>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:141
- **引用次数**：6

#### `startLearning`

- **类型**：逻辑控制
- **说明**：启动：learning（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`startLearning(i: StartLearningInput, o: StartLearningOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:146
- **引用次数**：28

#### `stopLearning`

- **类型**：逻辑控制
- **说明**：删除/清理：learning（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`stopLearning(i: StopLearningInput, o: StopLearningOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:152
- **引用次数**：15

#### `soTagGraph`

- **类型**：逻辑控制
- **说明**：查询：标签 / 图（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soTagGraph(i: GetTagGraphInput, o: GetTagGraphOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:158
- **引用次数**：15

#### `soTagRelatedInfo`

- **类型**：逻辑控制
- **说明**：查询：标签 / related / 信息（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soTagRelatedInfo(i: GetTagRelatedInfoInput, o: GetTagRelatedInfoOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:164
- **引用次数**：8

#### `soLearningProgress`

- **类型**：逻辑控制
- **说明**：查询：learning / 进度（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soLearningProgress(i: GetLearningProgressInput, o: GetLearningProgressOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:170
- **引用次数**：12

#### `soLearningResults`

- **类型**：逻辑控制
- **说明**：查询：learning / results（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soLearningResults(i: GetLearningResultsInput, o: GetLearningResultsOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:176
- **引用次数**：16

#### `soLearningStats`

- **类型**：逻辑控制
- **说明**：查询：learning / stats（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soLearningStats(i: GetLearningStatsInput, o: GetLearningStatsOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:182
- **引用次数**：10

#### `soLearningTasks`

- **类型**：逻辑控制
- **说明**：查询：learning / tasks（返回成功与否，接入层转发至 Service）
- **签名**：`soLearningTasks(i: ListLearningTasksInput, o: ListLearningTasksOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:188
- **引用次数**：7

#### `configSelfLearning`

- **类型**：逻辑控制
- **说明**：处理 配置 / learning（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`configSelfLearning(i: ConfigSelfLearningInput, o: ConfigSelfLearningOutput, c: SelfLearningContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:193
- **引用次数**：22

#### `startTagAging`

- **类型**：逻辑控制
- **说明**：启动：标签 / aging（异步编排，接入层转发至 Service）
- **签名**：`startTagAging(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:199
- **引用次数**：11

#### `startOrphanTagCheck`

- **类型**：逻辑控制
- **说明**：启动：orphan / 标签 / check（异步编排，接入层转发至 Service）
- **签名**：`startOrphanTagCheck(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/access/SelfLearningAccess.ts:204
- **引用次数**：11

## 文件 `brian-backend/Application/SelfLearning/application/SelfLearningService.ts`

### SelfLearningService（私有）

#### `runModePass`

- **类型**：数据处理
- **说明**：处理执行：mode / pass
- **签名**：`runModePass(mode: LearningTaskRecord['mode'], logLabel: string, core: () => Promise<LearningPassResult>): Promise<LearningPassResult>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:96
- **引用次数**：6

### SelfLearningService

#### `addLibrary`

- **类型**：数据处理
- **说明**：写入/新增：library（操作关系数据库，文件系统）
- **签名**：`addLibrary(input: AddLibraryInput, output: AddLibraryOutput, _context: SelfLearningContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:140
- **引用次数**：20

### SelfLearningService（私有）

#### `scanLibraryDirectory`

- **类型**：数据处理
- **说明**：查询：library / directory（操作关系数据库，文件系统）
- **签名**：`scanLibraryDirectory(libraryId: string, rootPath: string, now: number, skipExisting?: Set<string>, metrics?: Metrics): Promise<{ fileCount: number; dirCount: number }>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:173
- **引用次数**：5

#### `syncLibraryFiles`

- **类型**：数据处理
- **说明**：处理 library / files（操作关系数据库）
- **签名**：`syncLibraryFiles(libraryId: string, rootPath: string, now: number): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:258
- **引用次数**：2

### SelfLearningService

#### `deleteLibrary`

- **类型**：数据处理
- **说明**：删除/清理：library（操作关系数据库）
- **签名**：`deleteLibrary(input: DeleteLibraryInput, _output: DeleteLibraryOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:276
- **引用次数**：9

#### `setLibraryEnabled`

- **类型**：数据处理
- **说明**：更新：library / enabled（操作关系数据库）
- **签名**：`setLibraryEnabled(input: SetLibraryEnabledInput, output: SetLibraryEnabledOutput, _context: SelfLearningContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:301
- **引用次数**：4

#### `soLibrary`

- **类型**：数据处理
- **说明**：查询：library（操作关系数据库）
- **签名**：`soLibrary(input: SearchLibraryInput, output: SearchLibraryOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:339
- **引用次数**：11

#### `soLibraryFiles`

- **类型**：数据处理
- **说明**：查询：library / files（操作关系数据库）
- **签名**：`soLibraryFiles(input: GetLibraryFilesInput, output: GetLibraryFilesOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:397
- **引用次数**：13

#### `soLibraryTree`

- **类型**：数据处理
- **说明**：查询：library / 树形结构（操作关系数据库）
- **签名**：`soLibraryTree(input: GetLibraryTreeInput, output: GetLibraryTreeOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:461
- **引用次数**：4

#### `soFileContent`

- **类型**：数据处理
- **说明**：查询：文件 / content（操作关系数据库，文件系统）
- **签名**：`soFileContent(input: GetFileContentInput, output: GetFileContentOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:508
- **引用次数**：11

#### `queryDocument`

- **类型**：数据处理
- **说明**：查询：document
- **签名**：`queryDocument(input: QueryDocumentInput, output: QueryDocumentOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:536
- **引用次数**：6

#### `ensureBuiltinDocumentAgent`

- **类型**：逻辑控制
- **说明**：确保就绪：builtin / document / Agent（异步编排）
- **签名**：`ensureBuiltinDocumentAgent(): Promise<string>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:577
- **引用次数**：6

### SelfLearningService（私有）

#### `ensureDocumentReadingSoul`

- **类型**：逻辑控制
- **说明**：确保就绪：document / reading / 人设（异步编排）
- **签名**：`ensureDocumentReadingSoul(): Promise<string>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:601
- **引用次数**：3

#### `soDocumentReadingAgent`

- **类型**：逻辑控制
- **说明**：查询：document / reading / Agent（含异常兜底，异步编排）
- **签名**：`soDocumentReadingAgent(_question: string): Promise<{ system: string; llm_id: string; temperature?: number }>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:625
- **引用次数**：2

#### `buildDocumentReadingSystem`

- **类型**：通用算法
- **说明**：构建/初始化：document / reading / system（纯计算，无外部 IO）
- **签名**：`buildDocumentReadingSystem(): Promise<string>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:640
- **引用次数**：2

#### `soDocumentReadingSoulContent`

- **类型**：逻辑控制
- **说明**：查询：document / reading / 人设 / content（含异常兜底，异步编排）
- **签名**：`soDocumentReadingSoulContent(): Promise<string>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:650
- **引用次数**：2

#### `matchDocumentQueryLlm`

- **类型**：数据处理
- **说明**：判断校验：document / 大模型
- **签名**：`matchDocumentQueryLlm(): Promise<string>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:668
- **引用次数**：2

#### `execDocumentQueryLlm`

- **类型**：逻辑控制
- **说明**：处理执行：document / 大模型（含异常兜底，异步编排）
- **签名**：`execDocumentQueryLlm(llmId: string, prompt: string, system: string, temperature: number \| undefined, output: QueryDocumentOutput): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:686
- **引用次数**：2

#### `renderPrompt`

- **类型**：通用算法
- **说明**：格式化/序列化：提示词（纯计算，无外部 IO）
- **签名**：`renderPrompt(templateId: string \| undefined, fallbackTitle: string, variables: Record<string, unknown>, builtinTemplateId?: string): Promise<string>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:713
- **引用次数**：11

### SelfLearningService

#### `saveAnnotation`

- **类型**：数据处理
- **说明**：写入/新增：annotation（操作关系数据库）
- **签名**：`saveAnnotation(input: SaveAnnotationInput, output: SaveAnnotationOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:747
- **引用次数**：6

#### `soFileAnnotations`

- **类型**：数据处理
- **说明**：查询：文件 / annotations（操作关系数据库）
- **签名**：`soFileAnnotations(input: GetFileAnnotationsInput, output: GetFileAnnotationsOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:768
- **引用次数**：4

#### `updateFileContent`

- **类型**：数据处理
- **说明**：更新：文件 / content（操作关系数据库，文件系统）
- **签名**：`updateFileContent(input: UpdateFileContentInput, output: UpdateFileContentOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:778
- **引用次数**：14

#### `deleteFile`

- **类型**：数据处理
- **说明**：删除/清理：文件（操作关系数据库，文件系统）
- **签名**：`deleteFile(input: DeleteFileInput, output: DeleteFileOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:811
- **引用次数**：14

### SelfLearningService（私有）

#### `soFileRecord`

- **类型**：数据处理
- **说明**：查询：文件 / record（操作关系数据库）
- **签名**：`soFileRecord(fileId: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:855
- **引用次数**：3

### SelfLearningService

#### `startLearning`

- **类型**：通用算法
- **说明**：启动：learning（纯计算，无外部 IO）
- **签名**：`startLearning(input: StartLearningInput, _output: StartLearningOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:869
- **引用次数**：28

### SelfLearningService（私有）

#### `startRandomTriggerLearning`

- **类型**：通用算法
- **说明**：启动：random / trigger / learning（纯计算，无外部 IO）
- **签名**：`startRandomTriggerLearning(config: Record<string, unknown>): void`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:901
- **引用次数**：2

#### `checkUserRecentActivity`

- **类型**：数据处理
- **说明**：判断校验：用户 / recent / activity（操作关系数据库）
- **签名**：`checkUserRecentActivity(thresholdMs: number): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:949
- **引用次数**：2

#### `runDocumentLearningPass`

- **类型**：数据处理
- **说明**：处理执行：document / learning / pass（操作关系数据库）
- **签名**：`runDocumentLearningPass(libraryId: string \| undefined, learningRate: number): Promise<LearningPassResult>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:967
- **引用次数**：3

#### `runConversationLearningPass`

- **类型**：数据处理
- **说明**：处理执行：conversation / learning / pass
- **签名**：`runConversationLearningPass(): Promise<LearningPassResult>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1023
- **引用次数**：3

#### `startTagMaintenance`

- **类型**：逻辑控制
- **说明**：启动：标签 / maintenance（异步编排）
- **签名**：`startTagMaintenance(config: Record<string, unknown>): Promise<LearningPassResult>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1046
- **引用次数**：3

### SelfLearningService

#### `stopLearning`

- **类型**：通用算法
- **说明**：删除/清理：learning（纯计算，无外部 IO）
- **签名**：`stopLearning(input: StopLearningInput, _output: StopLearningOutput, _context: SelfLearningContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1061
- **引用次数**：15

### SelfLearningService（私有）

#### `handleDocumentLearning`

- **类型**：数据处理
- **说明**：处理执行：ndle / document / learning（文件系统）
- **签名**：`handleDocumentLearning(file: Record<string, unknown>): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1098
- **引用次数**：6

#### `ensureSelfLearningSession`

- **类型**：数据处理
- **说明**：确保就绪：learning / 会话（操作关系数据库）
- **签名**：`ensureSelfLearningSession(): Promise<string>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1158
- **引用次数**：2

#### `updateFileStatus`

- **类型**：数据处理
- **说明**：更新：文件 / 状态（操作关系数据库）
- **签名**：`updateFileStatus(fileId: string, status: string, errorMessage: string \| null): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1186
- **引用次数**：4

#### `extractKnowledgeFromChunk`

- **类型**：数据处理
- **说明**：解析：知识 / 文本块（反序列化）
- **签名**：`extractKnowledgeFromChunk(chunk: string, fileName: string): Promise<Array<{ content: string; tags?: string[] \| null }>>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1208
- **引用次数**：2

#### `insertLearningResult`

- **类型**：数据处理
- **说明**：写入/新增：learning / result（操作关系数据库）
- **签名**：`insertLearningResult(type: string, source: string, content: string, tags: string[] \| null): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1241
- **引用次数**：9

#### `yieldToEventLoop`

- **类型**：逻辑控制
- **说明**：处理 yield / 事件 / loop（异步编排）
- **签名**：`yieldToEventLoop(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1279
- **引用次数**：4

### SelfLearningService

#### `startTagConnectionEstablishment`

- **类型**：逻辑控制
- **说明**：启动：标签 / connection / establishment（异步编排）
- **签名**：`startTagConnectionEstablishment(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1283
- **引用次数**：7

### SelfLearningService（私有）

#### `runTagConnectionEstablishment`

- **类型**：数据处理
- **说明**：处理执行：标签 / connection / establishment（操作关系数据库）
- **签名**：`runTagConnectionEstablishment(): Promise<TagStageResult>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1290
- **引用次数**：3

### SelfLearningService

#### `startTagActivation`

- **类型**：逻辑控制
- **说明**：启动：标签 / activation（异步编排）
- **签名**：`startTagActivation(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1338
- **引用次数**：9

### SelfLearningService（私有）

#### `runTagActivation`

- **类型**：数据处理
- **说明**：处理执行：标签 / activation（操作关系数据库，图数据库）
- **签名**：`runTagActivation(): Promise<TagStageResult>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1345
- **引用次数**：3

### SelfLearningService

#### `startTagAging`

- **类型**：数据处理
- **说明**：启动：标签 / aging（图数据库）
- **签名**：`startTagAging(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1431
- **引用次数**：11

#### `startOrphanTagCheck`

- **类型**：数据处理
- **说明**：启动：orphan / 标签 / check（图数据库）
- **签名**：`startOrphanTagCheck(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1445
- **引用次数**：11

#### `soTagGraph`

- **类型**：通用算法
- **说明**：查询：标签 / 图（纯计算，无外部 IO）
- **签名**：`soTagGraph(input: GetTagGraphInput, output: GetTagGraphOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1491
- **引用次数**：15

### SelfLearningService（私有）

#### `soTagGraphNodes`

- **类型**：数据处理
- **说明**：查询：标签 / 图 / nodes（图数据库）
- **签名**：`soTagGraphNodes(): Promise<SelectGraphOutput>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1519
- **引用次数**：2

#### `collectTagGraph`

- **类型**：通用算法
- **说明**：处理 collect / 标签 / 图（纯计算，无外部 IO）
- **签名**：`collectTagGraph(nodeList: Array<Record<string, unknown>>, onlyActive: boolean): Promise<TagGraphCollections>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1532
- **引用次数**：2

#### `soTagNodeInfo`

- **类型**：数据处理
- **说明**：查询：标签 / 节点 / 信息（操作关系数据库）
- **签名**：`soTagNodeInfo(node: Record<string, unknown>): Promise<{ tag_id: string; tag_name: string; info_count: number; created: number }>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1548
- **引用次数**：2

#### `collectTagEdges`

- **类型**：数据处理
- **说明**：处理 collect / 标签 / edges（图数据库）
- **签名**：`collectTagEdges(nid: string, node: Record<string, unknown>, collections: TagGraphCollections, onlyActive: boolean): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1561
- **引用次数**：2

#### `toTagEdgeRecord`

- **类型**：逻辑控制
- **说明**：格式化/序列化：标签 / 连线 / record
- **签名**：`toTagEdgeRecord(nEdge: Record<string, unknown>): TagGraphEdge`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1584
- **引用次数**：2

#### `buildTagNodes`

- **类型**：数据处理
- **说明**：构建/初始化：标签 / nodes
- **签名**：`buildTagNodes(collections: TagGraphCollections): Array<Record<string, unknown>>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1598
- **引用次数**：2

#### `filterNodesByEdges`

- **类型**：通用算法
- **说明**：处理 过滤器 / nodes / edges（纯计算，无外部 IO）
- **签名**：`filterNodesByEdges(nodes: Array<Record<string, unknown>>, edges: TagGraphEdge[]): Array<Record<string, unknown>>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1616
- **引用次数**：3

#### `filterEdgesByNodes`

- **类型**：通用算法
- **说明**：处理 过滤器 / edges / nodes（纯计算，无外部 IO）
- **签名**：`filterEdgesByNodes(edges: TagGraphEdge[], nodes: Array<Record<string, unknown>>): TagGraphEdge[]`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1625
- **引用次数**：2

#### `countOrphanNodes`

- **类型**：通用算法
- **说明**：计算统计：orphan / nodes（纯计算，无外部 IO）
- **签名**：`countOrphanNodes(nodes: Array<Record<string, unknown>>, edges: TagGraphEdge[]): number`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1630
- **引用次数**：2

#### `applyTagLimit`

- **类型**：通用算法
- **说明**：更新：标签 / 限额（纯计算，无外部 IO）
- **签名**：`applyTagLimit(nodes: Array<Record<string, unknown>>, limit: number): Array<Record<string, unknown>>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1639
- **引用次数**：2

#### `buildTagGraphMetadata`

- **类型**：通用算法
- **说明**：构建/初始化：标签 / 图 / metadata（纯计算，无外部 IO）
- **签名**：`buildTagGraphMetadata(collections: TagGraphCollections, orphanCount: number): Record<string, unknown>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1644
- **引用次数**：2

### SelfLearningService

#### `soTagRelatedInfo`

- **类型**：数据处理
- **说明**：查询：标签 / related / 信息（操作关系数据库）
- **签名**：`soTagRelatedInfo(input: GetTagRelatedInfoInput, output: GetTagRelatedInfoOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1653
- **引用次数**：8

#### `soLearningProgress`

- **类型**：数据处理
- **说明**：查询：learning / 进度（操作关系数据库）
- **签名**：`soLearningProgress(input: GetLearningProgressInput, output: GetLearningProgressOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1734
- **引用次数**：12

### SelfLearningService（私有）

#### `isLearningRunning`

- **类型**：通用算法
- **说明**：判断校验：learning / running（纯计算，无外部 IO）
- **签名**：`isLearningRunning(): boolean`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1789
- **引用次数**：2

### SelfLearningService

#### `soLearningResults`

- **类型**：数据处理
- **说明**：查询：learning / results（操作关系数据库）
- **签名**：`soLearningResults(input: GetLearningResultsInput, output: GetLearningResultsOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1798
- **引用次数**：16

### SelfLearningService（私有）

#### `registerLearningTask`

- **类型**：数据处理
- **说明**：写入/新增：learning / 任务
- **签名**：`registerLearningTask(mode: LearningTaskRecord['mode'], label: string): string`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1858
- **引用次数**：4

#### `finishLearningTask`

- **类型**：数据处理
- **说明**：结束释放：learning / 任务
- **签名**：`finishLearningTask(taskId: string, result?: LearningPassResult): void`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1870
- **引用次数**：7

### SelfLearningService

#### `soLearningTasks`

- **类型**：数据处理
- **说明**：查询：learning / tasks
- **签名**：`soLearningTasks(input: ListLearningTasksInput, output: ListLearningTasksOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1885
- **引用次数**：7

#### `soLearningStats`

- **类型**：数据处理
- **说明**：查询：learning / stats（操作关系数据库，序列化输出，反序列化）
- **签名**：`soLearningStats(input: GetLearningStatsInput, output: GetLearningStatsOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1897
- **引用次数**：10

### SelfLearningService（私有）

#### `computeGraphStatsInBackground`

- **类型**：数据处理
- **说明**：计算统计：图 / stats / background（图数据库）
- **签名**：`computeGraphStatsInBackground(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:1999
- **引用次数**：4

### SelfLearningService

#### `configSelfLearning`

- **类型**：数据处理
- **说明**：处理 配置 / learning（操作关系数据库）
- **签名**：`configSelfLearning(input: ConfigSelfLearningInput, output: ConfigSelfLearningOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:2076
- **引用次数**：22

### SelfLearningService（私有）

#### `getConfig`

- **类型**：数据处理
- **说明**：获取：配置（操作关系数据库）
- **签名**：`getConfig(): Promise<Record<string, unknown>>`
- **位置**：brian-backend/Application/SelfLearning/application/SelfLearningService.ts:2133
- **引用次数**：69

## 文件 `brian-backend/Application/SelfLearning/infrastructure/SelfLearningSchemaInitializer.ts`

### SelfLearningSchemaInitializer

#### `init`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`init(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/infrastructure/SelfLearningSchemaInitializer.ts:183
- **引用次数**：99

### SelfLearningSchemaInitializer（私有）

#### `initDDL`

- **类型**：数据处理
- **说明**：构建/初始化：ddl（操作关系数据库）
- **签名**：`initDDL(): void`
- **位置**：brian-backend/Application/SelfLearning/infrastructure/SelfLearningSchemaInitializer.ts:189
- **引用次数**：2

#### `seedDefaultConfig`

- **类型**：数据处理
- **说明**：处理 seed / default / 配置（操作关系数据库）
- **签名**：`seedDefaultConfig(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/infrastructure/SelfLearningSchemaInitializer.ts:201
- **引用次数**：2

#### `seedBuiltinTasks`

- **类型**：数据处理
- **说明**：处理 seed / builtin / tasks（操作关系数据库）
- **签名**：`seedBuiltinTasks(): Promise<void>`
- **位置**：brian-backend/Application/SelfLearning/infrastructure/SelfLearningSchemaInitializer.ts:231
- **引用次数**：2

