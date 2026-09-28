# Core / InfoCoreProvider

- 层：**Core**　模块：**InfoCoreProvider**
- 方法数：**176**（逻辑控制 68 · 数据处理 91 · 通用算法 17）

## 文件 `brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts`

### InfoCoreAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:111
- **引用次数**：272

#### `saveInfo`

- **类型**：逻辑控制
- **说明**：写入/新增：信息（返回成功与否，接入层转发至 Service）
- **签名**：`saveInfo(input: SaveInfoInput, output: SaveInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:120
- **引用次数**：81

#### `pinInfo`

- **类型**：逻辑控制
- **说明**：处理 钉住 / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`pinInfo(input: PinInfoInput, output: PinInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:126
- **引用次数**：15

#### `vectorInfo`

- **类型**：逻辑控制
- **说明**：处理 向量 / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`vectorInfo(input: ProcessInfoInput, output: VectorInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:136
- **引用次数**：13

#### `tagInfo`

- **类型**：逻辑控制
- **说明**：处理 标签 / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`tagInfo(input: ProcessInfoInput, output: TagInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:142
- **引用次数**：12

#### `summaryInfo`

- **类型**：逻辑控制
- **说明**：计算统计：信息（返回成功与否，接入层转发至 Service）
- **签名**：`summaryInfo(input: ProcessInfoInput, output: SummaryInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:148
- **引用次数**：12

#### `keywordInfo`

- **类型**：逻辑控制
- **说明**：处理 keyword / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`keywordInfo(input: ProcessInfoInput, output: KeywordInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:154
- **引用次数**：10

#### `graphTag`

- **类型**：逻辑控制
- **说明**：处理 图 / 标签（返回成功与否，接入层转发至 Service）
- **签名**：`graphTag(input: GraphTagInput, output: GraphTagOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:160
- **引用次数**：33

#### `rebuildCooccurGraph`

- **类型**：逻辑控制
- **说明**：处理 rebuild / cooccur / 图（返回成功与否，接入层转发至 Service）
- **签名**：`rebuildCooccurGraph(input: RebuildCooccurGraphInput, output: RebuildCooccurGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:166
- **引用次数**：6

#### `lastNInfo`

- **类型**：逻辑控制
- **说明**：处理 n / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`lastNInfo(input: LastNInfoInput, output: LastNInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:176
- **引用次数**：31

#### `graphNInfo`

- **类型**：逻辑控制
- **说明**：处理 图 / n / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`graphNInfo(input: GraphNInfoInput, output: GraphNInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:182
- **引用次数**：9

#### `similarKInfo`

- **类型**：逻辑控制
- **说明**：处理 similar / k / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`similarKInfo(input: SimilarKInfoInput, output: SimilarKInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:188
- **引用次数**：11

#### `keywordKInfo`

- **类型**：逻辑控制
- **说明**：处理 keyword / k / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`keywordKInfo(input: KeywordKInfoInput, output: KeywordKInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:194
- **引用次数**：16

#### `relationKInfo`

- **类型**：逻辑控制
- **说明**：处理 关系 / k / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`relationKInfo(input: RelationKInfoInput, output: RelationKInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:200
- **引用次数**：10

#### `graphInfo`

- **类型**：逻辑控制
- **说明**：处理 图 / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`graphInfo(input: GraphInfoInput, output: GraphInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:206
- **引用次数**：15

#### `soCitationEdges`

- **类型**：逻辑控制
- **说明**：查询：citation / edges（返回成功与否，接入层转发至 Service）
- **签名**：`soCitationEdges(input: SoCitationEdgesInput, output: SoCitationEdgesOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:212
- **引用次数**：9

#### `delInfoGraph`

- **类型**：逻辑控制
- **说明**：删除/清理：信息 / 图（返回成功与否，接入层转发至 Service）
- **签名**：`delInfoGraph(input: DelInfoGraphInput, output: DelInfoGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:218
- **引用次数**：6

#### `clearGraph`

- **类型**：逻辑控制
- **说明**：删除/清理：图（返回成功与否，接入层转发至 Service）
- **签名**：`clearGraph(input: ClearGraphInput, output: ClearGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:224
- **引用次数**：6

#### `rebuildCitationGraph`

- **类型**：逻辑控制
- **说明**：处理 rebuild / citation / 图（返回成功与否，接入层转发至 Service）
- **签名**：`rebuildCitationGraph(input: RebuildCitationGraphInput, output: RebuildCitationGraphOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:230
- **引用次数**：4

#### `context`

- **类型**：逻辑控制
- **说明**：处理 上下文（返回成功与否，接入层转发至 Service）
- **签名**：`context(input: ContextInfoInput, output: ContextInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:236
- **引用次数**：798

#### `soContextByWork`

- **类型**：逻辑控制
- **说明**：查询：上下文 / work（返回成功与否，接入层转发至 Service）
- **签名**：`soContextByWork(input: SoContextByWorkInput, output: SoContextByWorkOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:242
- **引用次数**：16

#### `soInfoTagConfig`

- **类型**：逻辑控制
- **说明**：查询：信息 / 标签 / 配置（返回成功与否，接入层转发至 Service）
- **签名**：`soInfoTagConfig(input: SoInfoTagConfigInput, output: SoInfoTagConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:252
- **引用次数**：8

#### `updateInfoTagConfig`

- **类型**：逻辑控制
- **说明**：更新：信息 / 标签 / 配置（返回成功与否，接入层转发至 Service）
- **签名**：`updateInfoTagConfig(input: UpdateInfoTagConfigInput, output: UpdateInfoTagConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:258
- **引用次数**：10

#### `soInfoSummaryConfig`

- **类型**：逻辑控制
- **说明**：查询：信息 / 摘要 / 配置（返回成功与否，接入层转发至 Service）
- **签名**：`soInfoSummaryConfig(input: SoInfoSummaryConfigInput, output: SoInfoSummaryConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:264
- **引用次数**：11

#### `updateInfoSummaryConfig`

- **类型**：逻辑控制
- **说明**：更新：信息 / 摘要 / 配置（返回成功与否，接入层转发至 Service）
- **签名**：`updateInfoSummaryConfig(input: UpdateInfoSummaryConfigInput, output: UpdateInfoSummaryConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:270
- **引用次数**：7

#### `soInfoConfig`

- **类型**：逻辑控制
- **说明**：查询：信息 / 配置（返回成功与否，接入层转发至 Service）
- **签名**：`soInfoConfig(input: SoInfoConfigInput, output: SoInfoConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:276
- **引用次数**：9

#### `updateInfoConfig`

- **类型**：逻辑控制
- **说明**：更新：信息 / 配置（返回成功与否，接入层转发至 Service）
- **签名**：`updateInfoConfig(input: UpdateInfoConfigInput, output: UpdateInfoConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:282
- **引用次数**：9

#### `soInfoVectorConfig`

- **类型**：逻辑控制
- **说明**：查询：信息 / 向量 / 配置（返回成功与否，接入层转发至 Service）
- **签名**：`soInfoVectorConfig(input: SoInfoVectorConfigInput, output: SoInfoVectorConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:288
- **引用次数**：8

#### `updateInfoVectorConfig`

- **类型**：逻辑控制
- **说明**：更新：信息 / 向量 / 配置（返回成功与否，接入层转发至 Service）
- **签名**：`updateInfoVectorConfig(input: UpdateInfoVectorConfigInput, output: UpdateInfoVectorConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:294
- **引用次数**：9

#### `soInfoContextConfig`

- **类型**：逻辑控制
- **说明**：查询：信息 / 上下文 / 配置（返回成功与否，接入层转发至 Service）
- **签名**：`soInfoContextConfig(input: SoInfoContextConfigInput, output: SoInfoContextConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:300
- **引用次数**：8

#### `updateInfoContextConfig`

- **类型**：逻辑控制
- **说明**：更新：信息 / 上下文 / 配置（返回成功与否，接入层转发至 Service）
- **签名**：`updateInfoContextConfig(input: UpdateInfoContextConfigInput, output: UpdateInfoContextConfigOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:306
- **引用次数**：17

#### `delInfo`

- **类型**：逻辑控制
- **说明**：删除/清理：信息（返回成功与否，接入层转发至 Service）
- **签名**：`delInfo(input: DelInfoInput, output: DelInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:316
- **引用次数**：9

#### `backfillMissingSummaries`

- **类型**：逻辑控制
- **说明**：处理 backfill / missing / summaries（返回成功与否，接入层转发至 Service）
- **签名**：`backfillMissingSummaries(input: BackfillMissingSummariesInput, output: BackfillMissingSummariesOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:322
- **引用次数**：9

#### `updateInfo`

- **类型**：逻辑控制
- **说明**：更新：信息（返回成功与否，接入层转发至 Service）
- **签名**：`updateInfo(input: UpdateInfoInput, output: UpdateInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:328
- **引用次数**：4

#### `delInfoByWork`

- **类型**：逻辑控制
- **说明**：删除/清理：信息 / work（返回成功与否，接入层转发至 Service）
- **签名**：`delInfoByWork(input: DelInfoByWorkInput, output: DelInfoByWorkOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:334
- **引用次数**：4

#### `delInfoBySession`

- **类型**：逻辑控制
- **说明**：删除/清理：信息 / 会话（返回成功与否，接入层转发至 Service）
- **签名**：`delInfoBySession(input: DelInfoBySessionInput, output: DelInfoBySessionOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:340
- **引用次数**：5

#### `existVectorInfo`

- **类型**：逻辑控制
- **说明**：处理 exist / 向量 / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`existVectorInfo(input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:350
- **引用次数**：8

#### `existTagInfo`

- **类型**：逻辑控制
- **说明**：处理 exist / 标签 / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`existTagInfo(input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:356
- **引用次数**：8

#### `existSummaryInfo`

- **类型**：逻辑控制
- **说明**：判断校验：exist / 摘要 / 信息（返回成功与否，接入层转发至 Service）
- **签名**：`existSummaryInfo(input: ExistInfoInput, output: ExistInfoOutput, context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/access/InfoCoreAccess.ts:362
- **引用次数**：8

## 文件 `brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts`

### InfoCoreService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:135
- **引用次数**：272

#### `saveInfo`

- **类型**：数据处理
- **说明**：写入/新增：信息（操作关系数据库）
- **签名**：`saveInfo(input: SaveInfoInput, output: SaveInfoOutput, _context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:139
- **引用次数**：81

#### `pinInfo`

- **类型**：数据处理
- **说明**：处理 钉住 / 信息（操作关系数据库）
- **签名**：`pinInfo(input: PinInfoInput, _output: PinInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:218
- **引用次数**：15

#### `vectorInfo`

- **类型**：数据处理
- **说明**：处理 向量 / 信息（向量库）
- **签名**：`vectorInfo(input: ProcessInfoInput, output: VectorInfoOutput, context: InfoCoreContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:242
- **引用次数**：13

#### `tagInfo`

- **类型**：数据处理
- **说明**：处理 标签 / 信息
- **签名**：`tagInfo(input: ProcessInfoInput, output: TagInfoOutput, _context: InfoCoreContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:272
- **引用次数**：12

### InfoCoreService（私有）

#### `insertTag`

- **类型**：数据处理
- **说明**：写入/新增：标签（操作关系数据库）
- **签名**：`insertTag(tagId: string, infoId: string, tag: string, now: number): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:317
- **引用次数**：2

### InfoCoreService

#### `summaryInfo`

- **类型**：数据处理
- **说明**：计算统计：信息（操作关系数据库）
- **签名**：`summaryInfo(input: ProcessInfoInput, output: SummaryInfoOutput, _context: InfoCoreContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:327
- **引用次数**：12

### InfoCoreService（私有）

#### `isSummaryEligibleType`

- **类型**：通用算法
- **说明**：判断校验：摘要 / eligible / type（纯计算，无外部 IO）
- **签名**：`isSummaryEligibleType(infoType: string, summaryConfig: InfoSummaryConfigRecord): boolean`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:378
- **引用次数**：2

#### `generateSummaryText`

- **类型**：逻辑控制
- **说明**：构建/初始化：摘要 / 文本（遍历调度，异步编排）
- **签名**：`generateSummaryText(info: string, summaryConfig: InfoSummaryConfigRecord, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:385
- **引用次数**：2

#### `execSummaryLLM`

- **类型**：通用算法
- **说明**：处理执行：摘要 / 大模型（纯计算，无外部 IO）
- **签名**：`execSummaryLLM(info: string, llmId: string, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:405
- **引用次数**：2

### InfoCoreService

#### `keywordInfo`

- **类型**：数据处理
- **说明**：处理 keyword / 信息（操作关系数据库）
- **签名**：`keywordInfo(input: ProcessInfoInput, output: KeywordInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:421
- **引用次数**：10

#### `graphTag`

- **类型**：数据处理
- **说明**：处理 图 / 标签（向量库）
- **签名**：`graphTag(input: GraphTagInput, output: GraphTagOutput, _context: InfoCoreContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:455
- **引用次数**：33

#### `rebuildCooccurGraph`

- **类型**：数据处理
- **说明**：处理 rebuild / cooccur / 图
- **签名**：`rebuildCooccurGraph(_input: RebuildCooccurGraphInput, output: RebuildCooccurGraphOutput, _context: InfoCoreContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:487
- **引用次数**：6

### InfoCoreService（私有）

#### `purgeNonCorrectTagRows`

- **类型**：数据处理
- **说明**：删除/清理：non / correct / 标签 / rows（操作关系数据库）
- **签名**：`purgeNonCorrectTagRows(metrics?: Metrics): number`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:500
- **引用次数**：3

#### `rebuildCooccurForSource`

- **类型**：数据处理
- **说明**：处理 rebuild / cooccur / source（操作关系数据库，图数据库）
- **签名**：`rebuildCooccurForSource(table: string, field: string, nodeType: string, textField: string, edgeType: string, metrics?: Metrics): Promise<{ deleted: number; rebuilt: number }>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:516
- **引用次数**：3

### InfoCoreService

#### `lastNInfo`

- **类型**：数据处理
- **说明**：处理 n / 信息（操作关系数据库）
- **签名**：`lastNInfo(input: LastNInfoInput, output: LastNInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:595
- **引用次数**：31

#### `graphNInfo`

- **类型**：数据处理
- **说明**：处理 图 / n / 信息（操作关系数据库，图数据库）
- **签名**：`graphNInfo(input: GraphNInfoInput, output: GraphNInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:651
- **引用次数**：9

#### `similarKInfo`

- **类型**：数据处理
- **说明**：处理 similar / k / 信息（向量库）
- **签名**：`similarKInfo(input: SimilarKInfoInput, output: SimilarKInfoOutput, context: InfoCoreContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:699
- **引用次数**：11

#### `keywordKInfo`

- **类型**：数据处理
- **说明**：处理 keyword / k / 信息（操作关系数据库）
- **签名**：`keywordKInfo(input: KeywordKInfoInput, output: KeywordKInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:724
- **引用次数**：16

#### `relationKInfo`

- **类型**：数据处理
- **说明**：处理 关系 / k / 信息
- **签名**：`relationKInfo(input: RelationKInfoInput, output: RelationKInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:797
- **引用次数**：10

### InfoCoreService（私有）

#### `ensureSelfTagNames`

- **类型**：数据处理
- **说明**：确保就绪：标签 / names（操作关系数据库）
- **签名**：`ensureSelfTagNames(infoId: string): Promise<string[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:812
- **引用次数**：2

#### `collectRelatedTags`

- **类型**：数据处理
- **说明**：处理 collect / related / tags
- **签名**：`collectRelatedTags(selfTagNames: string[]): Promise<Array<{ tag: string; weight: number }>>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:825
- **引用次数**：2

#### `findSimilarTagEdges`

- **类型**：数据处理
- **说明**：查询：similar / 标签 / edges（图数据库）
- **签名**：`findSimilarTagEdges(tagName: string): Promise<Array<{ tag: string; weight: number }>>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:840
- **引用次数**：2

#### `findInfoWeightsByTags`

- **类型**：数据处理
- **说明**：查询：信息 / weights / tags（操作关系数据库）
- **签名**：`findInfoWeightsByTags(relatedTags: Array<{ tag: string; weight: number }>): Promise<Map<string, number>>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:871
- **引用次数**：2

#### `loadRelatedInfo`

- **类型**：数据处理
- **说明**：获取：related / 信息
- **签名**：`loadRelatedInfo(weightedIds: Map<string, number>, topN: number): Promise<Array<InfoRawRecord & { relevance_score?: number }>>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:889
- **引用次数**：2

### InfoCoreService

#### `graphInfo`

- **类型**：数据处理
- **说明**：处理 图 / 信息（操作关系数据库）
- **签名**：`graphInfo(input: GraphInfoInput, output: GraphInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:908
- **引用次数**：15

#### `soCitationEdges`

- **类型**：数据处理
- **说明**：查询：citation / edges（图数据库）
- **签名**：`soCitationEdges(input: SoCitationEdgesInput, output: SoCitationEdgesOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:976
- **引用次数**：9

#### `delInfoGraph`

- **类型**：数据处理
- **说明**：删除/清理：信息 / 图（图数据库）
- **签名**：`delInfoGraph(input: DelInfoGraphInput, output: DelInfoGraphOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:997
- **引用次数**：6

#### `clearGraph`

- **类型**：数据处理
- **说明**：删除/清理：图（图数据库）
- **签名**：`clearGraph(input: ClearGraphInput, output: ClearGraphOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1019
- **引用次数**：6

#### `rebuildCitationGraph`

- **类型**：数据处理
- **说明**：处理 rebuild / citation / 图（操作关系数据库）
- **签名**：`rebuildCitationGraph(_input: RebuildCitationGraphInput, output: RebuildCitationGraphOutput, _context: InfoCoreContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1041
- **引用次数**：4

#### `context`

- **类型**：数据处理
- **说明**：处理 上下文
- **签名**：`context(input: ContextInfoInput, output: ContextInfoOutput, _context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1081
- **引用次数**：798

#### `soContextByWork`

- **类型**：数据处理
- **说明**：查询：上下文 / work（操作关系数据库）
- **签名**：`soContextByWork(input: SoContextByWorkInput, output: SoContextByWorkOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1112
- **引用次数**：16

#### `soInfoTagConfig`

- **类型**：逻辑控制
- **说明**：查询：信息 / 标签 / 配置（返回成功与否，异步编排）
- **签名**：`soInfoTagConfig(_input: SoInfoTagConfigInput, output: SoInfoTagConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1169
- **引用次数**：8

#### `updateInfoTagConfig`

- **类型**：数据处理
- **说明**：更新：信息 / 标签 / 配置
- **签名**：`updateInfoTagConfig(input: UpdateInfoTagConfigInput, _output: UpdateInfoTagConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1175
- **引用次数**：10

#### `soInfoSummaryConfig`

- **类型**：逻辑控制
- **说明**：查询：信息 / 摘要 / 配置（返回成功与否，异步编排）
- **签名**：`soInfoSummaryConfig(_input: SoInfoSummaryConfigInput, output: SoInfoSummaryConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1210
- **引用次数**：11

#### `updateInfoSummaryConfig`

- **类型**：数据处理
- **说明**：更新：信息 / 摘要 / 配置
- **签名**：`updateInfoSummaryConfig(input: UpdateInfoSummaryConfigInput, _output: UpdateInfoSummaryConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1216
- **引用次数**：7

#### `soInfoConfig`

- **类型**：逻辑控制
- **说明**：查询：信息 / 配置（返回成功与否，异步编排）
- **签名**：`soInfoConfig(_input: SoInfoConfigInput, output: SoInfoConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1247
- **引用次数**：9

#### `updateInfoConfig`

- **类型**：数据处理
- **说明**：更新：信息 / 配置
- **签名**：`updateInfoConfig(input: UpdateInfoConfigInput, _output: UpdateInfoConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1253
- **引用次数**：9

#### `soInfoVectorConfig`

- **类型**：逻辑控制
- **说明**：查询：信息 / 向量 / 配置（返回成功与否，异步编排）
- **签名**：`soInfoVectorConfig(_input: SoInfoVectorConfigInput, output: SoInfoVectorConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1268
- **引用次数**：8

#### `updateInfoVectorConfig`

- **类型**：数据处理
- **说明**：更新：信息 / 向量 / 配置（向量库）
- **签名**：`updateInfoVectorConfig(input: UpdateInfoVectorConfigInput, _output: UpdateInfoVectorConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1274
- **引用次数**：9

#### `soInfoContextConfig`

- **类型**：逻辑控制
- **说明**：查询：信息 / 上下文 / 配置（返回成功与否，异步编排）
- **签名**：`soInfoContextConfig(_input: SoInfoContextConfigInput, output: SoInfoContextConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1314
- **引用次数**：8

#### `updateInfoContextConfig`

- **类型**：数据处理
- **说明**：更新：信息 / 上下文 / 配置
- **签名**：`updateInfoContextConfig(input: UpdateInfoContextConfigInput, _output: UpdateInfoContextConfigOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1320
- **引用次数**：17

#### `delInfo`

- **类型**：数据处理
- **说明**：删除/清理：信息（操作关系数据库）
- **签名**：`delInfo(_input: DelInfoInput, output: DelInfoOutput, _context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1367
- **引用次数**：9

#### `backfillMissingSummaries`

- **类型**：数据处理
- **说明**：处理 backfill / missing / summaries（操作关系数据库）
- **签名**：`backfillMissingSummaries(_input: BackfillMissingSummariesInput, output: BackfillMissingSummariesOutput, _context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1433
- **引用次数**：9

#### `updateInfo`

- **类型**：数据处理
- **说明**：更新：信息（操作关系数据库）
- **签名**：`updateInfo(input: UpdateInfoInput, output: UpdateInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1470
- **引用次数**：4

#### `delInfoByWork`

- **类型**：数据处理
- **说明**：删除/清理：信息 / work（操作关系数据库）
- **签名**：`delInfoByWork(input: DelInfoByWorkInput, output: DelInfoByWorkOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1491
- **引用次数**：4

#### `delInfoBySession`

- **类型**：数据处理
- **说明**：删除/清理：信息 / 会话（操作关系数据库）
- **签名**：`delInfoBySession(input: DelInfoBySessionInput, output: DelInfoBySessionOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1518
- **引用次数**：5

#### `existVectorInfo`

- **类型**：逻辑控制
- **说明**：处理 exist / 向量 / 信息（返回成功与否，异步编排）
- **签名**：`existVectorInfo(input: ExistInfoInput, output: ExistInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1551
- **引用次数**：8

#### `existTagInfo`

- **类型**：逻辑控制
- **说明**：处理 exist / 标签 / 信息（返回成功与否，异步编排）
- **签名**：`existTagInfo(input: ExistInfoInput, output: ExistInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1561
- **引用次数**：8

#### `existSummaryInfo`

- **类型**：逻辑控制
- **说明**：判断校验：exist / 摘要 / 信息（返回成功与否，异步编排）
- **签名**：`existSummaryInfo(input: ExistInfoInput, output: ExistInfoOutput, _context: InfoCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1571
- **引用次数**：8

### InfoCoreService（私有）

#### `hasVectorForInfo`

- **类型**：通用算法
- **说明**：判断校验：向量 / 信息（纯计算，无外部 IO）
- **签名**：`hasVectorForInfo(infoId: string): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1581
- **引用次数**：4

#### `hasTagForInfo`

- **类型**：数据处理
- **说明**：判断校验：标签 / 信息（操作关系数据库）
- **签名**：`hasTagForInfo(infoId: string): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1589
- **引用次数**：3

#### `hasSummaryForInfo`

- **类型**：数据处理
- **说明**：判断校验：摘要 / 信息（操作关系数据库）
- **签名**：`hasSummaryForInfo(infoId: string): Promise<boolean>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1596
- **引用次数**：3

#### `getInfoByInfoId`

- **类型**：数据处理
- **说明**：获取：信息 / 信息 / 标识（操作关系数据库）
- **签名**：`getInfoByInfoId(infoId: string): Promise<InfoRawRecord \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1603
- **引用次数**：14

#### `getInfoBatchByInfoIds`

- **类型**：数据处理
- **说明**：获取：信息 / batch / 信息 / ids（操作关系数据库）
- **签名**：`getInfoBatchByInfoIds(infoIds: string[]): Promise<Map<string, InfoRawRecord>>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1611
- **引用次数**：3

#### `getInfoSummaryRow`

- **类型**：数据处理
- **说明**：获取：信息 / 摘要 / row（操作关系数据库）
- **签名**：`getInfoSummaryRow(infoId: string): Promise<InfoSummaryRecord \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1624
- **引用次数**：4

#### `getInfoSummaryBatchByInfoIds`

- **类型**：数据处理
- **说明**：获取：信息 / 摘要 / batch / 信息（操作关系数据库）
- **签名**：`getInfoSummaryBatchByInfoIds(infoIds: string[]): Promise<Map<string, InfoSummaryRecord>>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1633
- **引用次数**：2

#### `getInfoTagConfig`

- **类型**：数据处理
- **说明**：获取：信息 / 标签 / 配置（操作关系数据库）
- **签名**：`getInfoTagConfig(): Promise<InfoTagConfigRecord \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1646
- **引用次数**：6

#### `getInfoSummaryConfig`

- **类型**：数据处理
- **说明**：获取：信息 / 摘要 / 配置（操作关系数据库）
- **签名**：`getInfoSummaryConfig(): Promise<InfoSummaryConfigRecord \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1653
- **引用次数**：5

#### `getInfoConfig`

- **类型**：数据处理
- **说明**：获取：信息 / 配置（操作关系数据库）
- **签名**：`getInfoConfig(): Promise<InfoConfigRecord \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1660
- **引用次数**：3

#### `getInfoVectorConfig`

- **类型**：数据处理
- **说明**：获取：信息 / 向量 / 配置（操作关系数据库）
- **签名**：`getInfoVectorConfig(): Promise<InfoVectorConfigRecord \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1667
- **引用次数**：6

#### `getInfoContextConfig`

- **类型**：数据处理
- **说明**：获取：信息 / 上下文 / 配置（操作关系数据库）
- **签名**：`getInfoContextConfig(): Promise<InfoContextConfigRecord \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1674
- **引用次数**：3

#### `generateEmbedding`

- **类型**：数据处理
- **说明**：构建/初始化：向量（向量库）
- **签名**：`generateEmbedding(text: string, vectorConfig: InfoVectorConfigRecord, bizCtx?: Context, metrics?: Metrics): Promise<number[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1681
- **引用次数**：6

#### `tagVectorId`

- **类型**：逻辑控制
- **说明**：处理 标签 / 向量 / 标识
- **签名**：`tagVectorId(tag: string): string`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1711
- **引用次数**：4

#### `getVectorRecord`

- **类型**：数据处理
- **说明**：获取：向量 / record（向量库）
- **签名**：`getVectorRecord(id: string): Promise<VectorRecord \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1715
- **引用次数**：4

#### `splitInfoChunks`

- **类型**：逻辑控制
- **说明**：转换归并：信息 / chunks
- **签名**：`splitInfoChunks(info: string, vectorConfig: InfoVectorConfigRecord): string[]`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1721
- **引用次数**：2

#### `upsertInfoChunks`

- **类型**：数据处理
- **说明**：处理 upsert / 信息 / chunks（向量库）
- **签名**：`upsertInfoChunks(infoId: string, chunks: string[], embeddings: number[][]): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1734
- **引用次数**：2

#### `normalizeChunkSize`

- **类型**：逻辑控制
- **说明**：转换归并：文本块 / 大小
- **签名**：`normalizeChunkSize(raw: unknown): number`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1756
- **引用次数**：2

#### `normalizeChunkOverlap`

- **类型**：通用算法
- **说明**：转换归并：文本块 / overlap（纯计算，无外部 IO）
- **签名**：`normalizeChunkOverlap(raw: unknown, chunkSize: number): number`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1761
- **引用次数**：2

#### `upsertTagVector`

- **类型**：数据处理
- **说明**：处理 upsert / 标签 / 向量（向量库）
- **签名**：`upsertTagVector(tag: string, embedding: number[]): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1767
- **引用次数**：2

#### `upsertVector`

- **类型**：数据处理
- **说明**：处理 upsert / 向量（向量库）
- **签名**：`upsertVector(id: string, content: string, embedding: number[], metadata: Record<string, unknown>): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1771
- **引用次数**：2

#### `getTagEmbedding`

- **类型**：数据处理
- **说明**：获取：标签 / 向量（向量库）
- **签名**：`getTagEmbedding(tag: string, _tagConfig: InfoTagConfigRecord, metrics?: Metrics): Promise<number[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1784
- **引用次数**：3

#### `searchInfoVectors`

- **类型**：数据处理
- **说明**：查询：信息 / vectors（向量库）
- **签名**：`searchInfoVectors(embedding: number[], topK: number, threshold: number): Promise<VectorSearchResult[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1792
- **引用次数**：2

#### `infoVectorQuery`

- **类型**：数据处理
- **说明**：处理 信息 / 向量 / query（向量库）
- **签名**：`infoVectorQuery(embedding: number[], topK: number, threshold: number): VectorQueryParam`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1805
- **引用次数**：2

#### `toScoredInfoList`

- **类型**：数据处理
- **说明**：格式化/序列化：scored / 信息 / 列表
- **签名**：`toScoredInfoList(hits: VectorSearchResult[]): Promise<Array<InfoRawRecord & { score?: number; matched_chunks?: string[] }>>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1814
- **引用次数**：2

#### `searchSimilarTags`

- **类型**：数据处理
- **说明**：查询：similar / tags（向量库）
- **签名**：`searchSimilarTags(embedding: number[], excludeTag: string, topK: number): Promise<Array<{ tag: string; score: number }>>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1842
- **引用次数**：2

#### `tagVectorQuery`

- **类型**：数据处理
- **说明**：处理 标签 / 向量 / query（向量库）
- **签名**：`tagVectorQuery(embedding: number[], topK: number): VectorQueryParam`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1861
- **引用次数**：2

#### `resolveTagText`

- **类型**：数据处理
- **说明**：获取：标签 / 文本（操作关系数据库，图数据库）
- **签名**：`resolveTagText(tagId: string): Promise<string>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1870
- **引用次数**：2

#### `ensureTextNode`

- **类型**：数据处理
- **说明**：确保就绪：文本 / 节点（图数据库）
- **签名**：`ensureTextNode(nodeType: string, textField: string, text: string, incrementFreq: unknown): Promise<string>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1881
- **引用次数**：7

#### `ensureTagNode`

- **类型**：逻辑控制
- **说明**：确保就绪：标签 / 节点
- **签名**：`ensureTagNode(tag: string): Promise<string>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1911
- **引用次数**：3

#### `connectSimilarTags`

- **类型**：数据处理
- **说明**：处理 connect / similar / tags（图数据库）
- **签名**：`connectSimilarTags(fromId: string, toId: string, score: number, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1915
- **引用次数**：3

#### `buildCooccurEdges`

- **类型**：通用算法
- **说明**：构建/初始化：cooccur / edges（纯计算，无外部 IO）
- **签名**：`buildCooccurEdges(tags: string[]): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1939
- **引用次数**：2

#### `buildKeywordCooccurEdges`

- **类型**：通用算法
- **说明**：构建/初始化：keyword / cooccur / edges（纯计算，无外部 IO）
- **签名**：`buildKeywordCooccurEdges(keywords: string[]): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1943
- **引用次数**：2

#### `buildCooccurEdgesForType`

- **类型**：数据处理
- **说明**：构建/初始化：cooccur / edges / type
- **签名**：`buildCooccurEdgesForType(items: string[], nodeType: string, textField: string, edgeType: string): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1947
- **引用次数**：3

#### `upsertCooccurEdgeForType`

- **类型**：数据处理
- **说明**：处理 upsert / cooccur / 连线 / type（图数据库）
- **签名**：`upsertCooccurEdgeForType(textA: string, textB: string, nodeType: string, textField: string, edgeType: string): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:1969
- **引用次数**：2

#### `addCooccurEdge`

- **类型**：数据处理
- **说明**：写入/新增：cooccur / 连线（图数据库）
- **签名**：`addCooccurEdge(fromId: string, toId: string, edgeType: string, weight: unknown, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2009
- **引用次数**：4

#### `extractTags`

- **类型**：逻辑控制
- **说明**：解析：tags（含异常兜底，异步编排）
- **签名**：`extractTags(text: string, tagConfig: InfoTagConfigRecord): Promise<string[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2034
- **引用次数**：4

#### `extractKeywords`

- **类型**：数据处理
- **说明**：解析：keywords
- **签名**：`extractKeywords(text: string): string[]`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2070
- **引用次数**：3

#### `connectCitationEdges`

- **类型**：逻辑控制
- **说明**：处理 connect / citation / edges（遍历调度，异步编排）
- **签名**：`connectCitationEdges(infoId: string, sessionId: string, infoText: string, parentInfoIds: string[], metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2087
- **引用次数**：2

#### `connectCitationEdge`

- **类型**：数据处理
- **说明**：处理 connect / citation / 连线（图数据库）
- **签名**：`connectCitationEdge(fromNodeId: string, toNodeId: string, citingInfoId: string, citedInfoId: string, sessionId: string, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2104
- **引用次数**：4

#### `ensureInfoGraphNode`

- **类型**：数据处理
- **说明**：确保就绪：信息 / 图 / 节点（图数据库）
- **签名**：`ensureInfoGraphNode(infoId: string, infoRow: Record<string, unknown>): Promise<string>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2136
- **引用次数**：8

#### `findInfoGraphNodeId`

- **类型**：逻辑控制
- **说明**：查询：信息 / 图 / 节点 / 标识
- **签名**：`findInfoGraphNodeId(infoId: string): Promise<string \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2161
- **引用次数**：4

#### `findGraphNode`

- **类型**：数据处理
- **说明**：查询：图 / 节点（图数据库）
- **签名**：`findGraphNode(nodeType: string, field: string, value: unknown): Promise<GraphNodeRecord \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2165
- **引用次数**：3

#### `findGraphNodeId`

- **类型**：逻辑控制
- **说明**：查询：图 / 节点 / 标识（异步编排）
- **签名**：`findGraphNodeId(nodeType: string, field: string, value: unknown): Promise<string \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2182
- **引用次数**：3

#### `validateContextInput`

- **类型**：逻辑控制
- **说明**：判断校验：上下文 / 输入
- **签名**：`validateContextInput(input: ContextInfoInput): void`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2191
- **引用次数**：2

#### `prepareContextBuildPlan`

- **类型**：通用算法
- **说明**：构建/初始化：上下文 / 规划（纯计算，无外部 IO）
- **签名**：`prepareContextBuildPlan(input: ContextInfoInput, contextConfig: InfoContextConfigRecord \| null): ContextBuildPlan`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2200
- **引用次数**：2

#### `collectPinnedCandidates`

- **类型**：数据处理
- **说明**：处理 collect / pinned / candidates（操作关系数据库）
- **签名**：`collectPinnedCandidates(sessionId: string): Promise<InfoRawRecord[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2209
- **引用次数**：2

#### `collectSelectedOrTimelineCandidates`

- **类型**：逻辑控制
- **说明**：处理 collect / selected / timeline / candidates（遍历调度，异步编排）
- **签名**：`collectSelectedOrTimelineCandidates(input: ContextInfoInput, selectedIds: string[], timelineLimit: number): Promise<{ citingCandidates: InfoRawRecord[]; timelineCandidates: InfoRawRecord[] }>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2220
- **引用次数**：2

#### `extractCurrentCandidate`

- **类型**：逻辑控制
- **说明**：解析：current / candidate（异步编排）
- **签名**：`extractCurrentCandidate(sessionId: string, selectedIds: string[], timelineCandidates: InfoRawRecord[]): Promise<InfoRawRecord \| null>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2243
- **引用次数**：2

#### `resolveWeakDimensionLimits`

- **类型**：通用算法
- **说明**：获取：weak / dimension / limits（纯计算，无外部 IO）
- **签名**：`resolveWeakDimensionLimits(contextConfig: InfoContextConfigRecord \| null, baseContextCount: number): ContextWeakDimensionLimits`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2258
- **引用次数**：2

#### `resolveReferenceText`

- **类型**：逻辑控制
- **说明**：获取：reference / 文本（异步编排）
- **签名**：`resolveReferenceText(input: ContextInfoInput, citingCandidates: InfoRawRecord[], timelineCandidates: InfoRawRecord[]): Promise<{ refText: string; refInfoRow: InfoRawRecord \| null }>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2275
- **引用次数**：2

#### `collectWeakDimensionCandidates`

- **类型**：逻辑控制
- **说明**：处理 collect / weak / dimension / candidates（异步编排）
- **签名**：`collectWeakDimensionCandidates(sessionId: string, refText: string, refInfoRow: InfoRawRecord \| null, limits: ContextWeakDimensionLimits, enableCrossSession: boolean, _context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<ContextWeakDimensionCandidates>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2298
- **引用次数**：2

#### `collectTagRelativeCandidates`

- **类型**：逻辑控制
- **说明**：处理 collect / 标签 / relative / candidates（含异常兜底，异步编排）
- **签名**：`collectTagRelativeCandidates(sessionId: string, refInfoRow: InfoRawRecord \| null, tagLimit: number, enableCrossSession: boolean, _context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<InfoRawRecord[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2316
- **引用次数**：2

#### `collectSimilarityCandidates`

- **类型**：通用算法
- **说明**：处理 collect / similarity / candidates（纯计算，无外部 IO）
- **签名**：`collectSimilarityCandidates(sessionId: string, refText: string, simLimit: number, enableCrossSession: boolean, _context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<InfoRawRecord[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2343
- **引用次数**：2

#### `collectKeywordCandidates`

- **类型**：逻辑控制
- **说明**：处理 collect / keyword / candidates（含异常兜底，异步编排）
- **签名**：`collectKeywordCandidates(sessionId: string, refText: string, kwLimit: number, kwScoreThreshold: number, enableCrossSession: boolean, _context: InfoCoreContext, metrics?: Metrics, report?: Report): Promise<InfoRawRecord[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2369
- **引用次数**：2

#### `pickKeywordCandidates`

- **类型**：通用算法
- **说明**：获取：keyword / candidates（纯计算，无外部 IO）
- **签名**：`pickKeywordCandidates(list: Array<InfoRawRecord & { keyword_score?: number }>, kwScoreThreshold: number, kwLimit: number): InfoRawRecord[]`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2395
- **引用次数**：2

#### `collectRandomCandidates`

- **类型**：逻辑控制
- **说明**：处理 collect / random / candidates（含异常兜底，异步编排）
- **签名**：`collectRandomCandidates(sessionId: string, randLimit: number, enableCrossSession: boolean, pinnedCandidates: InfoRawRecord[], citingCandidates: InfoRawRecord[], currentCandidate: InfoRawRecord \| null, metrics?: Metrics): Promise<InfoRawRecord[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2410
- **引用次数**：2

#### `sampleRandomCandidates`

- **类型**：通用算法
- **说明**：处理 sample / random / candidates（纯计算，无外部 IO）
- **签名**：`sampleRandomCandidates(sessionId: string, randLimit: number, enableCrossSession: boolean, pinnedCandidates: InfoRawRecord[], citingCandidates: InfoRawRecord[], currentCandidate: InfoRawRecord \| null): Promise<InfoRawRecord[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2433
- **引用次数**：2

#### `sampleSessionRandomCandidates`

- **类型**：数据处理
- **说明**：处理 sample / 会话 / random / candidates（操作关系数据库）
- **签名**：`sampleSessionRandomCandidates(sessionId: string, randLimit: number, existingIds: Set<string>, curExcludeId: string): Promise<InfoRawRecord[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2460
- **引用次数**：2

#### `sampleGlobalRandomCandidates`

- **类型**：数据处理
- **说明**：处理 sample / global / random / candidates（操作关系数据库）
- **签名**：`sampleGlobalRandomCandidates(remaining: number, filledIds: Set<string>): InfoRawRecord[]`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2481
- **引用次数**：2

#### `excludeCurrentFromWeakDimensions`

- **类型**：通用算法
- **说明**：处理 exclude / current / weak / dimensions（纯计算，无外部 IO）
- **签名**：`excludeCurrentFromWeakDimensions(currentCandidate: InfoRawRecord \| null, weakLists: InfoRawRecord[][]): void`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2492
- **引用次数**：2

#### `buildContextCandidatesMap`

- **类型**：通用算法
- **说明**：构建/初始化：上下文 / candidates / map（纯计算，无外部 IO）
- **签名**：`buildContextCandidatesMap(buckets: ContextCandidateBuckets): Map<ContextCollectionSource, InfoRawRecord[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2502
- **引用次数**：2

#### `parseContextPriorityList`

- **类型**：通用算法
- **说明**：解析：上下文 / priority / 列表（纯计算，无外部 IO）
- **签名**：`parseContextPriorityList(priorityOrderStr?: string): ContextCollectionSource[]`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2516
- **引用次数**：2

#### `prefetchContextSummaries`

- **类型**：数据处理
- **说明**：处理 prefetch / 上下文 / summaries
- **签名**：`prefetchContextSummaries(priorityList: ContextCollectionSource[], candidatesMap: Map<ContextCollectionSource, InfoRawRecord[]>, currentCandidate: InfoRawRecord \| null): Promise<Map<string, InfoSummaryRecord>>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2529
- **引用次数**：2

#### `collectDedupedContextItems`

- **类型**：数据处理
- **说明**：处理 collect / deduped / 上下文 / items
- **签名**：`collectDedupedContextItems(priorityList: ContextCollectionSource[], candidatesMap: Map<ContextCollectionSource, InfoRawRecord[]>, summaryMap: Map<string, InfoSummaryRecord>, currentCandidate: InfoRawRecord \| null): ContextInfoItem[]`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2545
- **引用次数**：2

#### `toContextItem`

- **类型**：数据处理
- **说明**：格式化/序列化：上下文 / 条目
- **签名**：`toContextItem(raw: InfoRawRecord, collectionSource: ContextCollectionSource, summaryText?: string): ContextInfoItem`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2571
- **引用次数**：3

#### `buildContextCategories`

- **类型**：通用算法
- **说明**：构建/初始化：上下文 / categories（纯计算，无外部 IO）
- **签名**：`buildContextCategories(resultList: ContextInfoItem[]): NonNullable<ContextInfoOutput['categories']>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2600
- **引用次数**：2

#### `buildContextCategoryIds`

- **类型**：通用算法
- **说明**：构建/初始化：上下文 / category / ids（纯计算，无外部 IO）
- **签名**：`buildContextCategoryIds(categories: NonNullable<ContextInfoOutput['categories']>): NonNullable<ContextInfoOutput['category_ids']>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2614
- **引用次数**：2

#### `buildContextSourcesSummary`

- **类型**：逻辑控制
- **说明**：构建/初始化：上下文 / sources / 摘要
- **签名**：`buildContextSourcesSummary(categories: NonNullable<ContextInfoOutput['categories']>): Record<string, number>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2630
- **引用次数**：2

#### `fillContextTriplesAndPersist`

- **类型**：数据处理
- **说明**：处理 fill / 上下文 / triples / persist
- **签名**：`fillContextTriplesAndPersist(output: ContextInfoOutput, resultList: ContextInfoItem[], workId: string, persist: boolean, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2644
- **引用次数**：2

#### `persistContextSourceMap`

- **类型**：数据处理
- **说明**：写入/新增：上下文 / source / map（操作关系数据库）
- **签名**：`persistContextSourceMap(workId: string, sourceIdsMap: ContextSourceIdMap, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2693
- **引用次数**：3

#### `lastNInfoTimeline`

- **类型**：数据处理
- **说明**：处理 n / 信息 / timeline（操作关系数据库）
- **签名**：`lastNInfoTimeline(sessionId: string, count: number): Promise<InfoRawRecord[]>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2732
- **引用次数**：3

#### `maintainTagVector`

- **类型**：数据处理
- **说明**：处理 maintain / 标签 / 向量（向量库）
- **签名**：`maintainTagVector(tag: string, tagConfig: InfoTagConfigRecord, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2744
- **引用次数**：3

#### `ensureDefaultConfigs`

- **类型**：逻辑控制
- **说明**：确保就绪：default / configs（异步编排）
- **签名**：`ensureDefaultConfigs(): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2763
- **引用次数**：2

#### `ensureDefaultConfigRow`

- **类型**：数据处理
- **说明**：确保就绪：default / 配置 / row（操作关系数据库）
- **签名**：`ensureDefaultConfigRow(table: string, defaults: Record<string, unknown>): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2793
- **引用次数**：6

#### `upsertConfigRow`

- **类型**：数据处理
- **说明**：处理 upsert / 配置 / row（操作关系数据库）
- **签名**：`upsertConfigRow(table: string, input: object, options: { defaultRecord: Record<string, unknown> }): Promise<void>`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2815
- **引用次数**：6

#### `parseStringArray`

- **类型**：数据处理
- **说明**：解析：string / array（反序列化）
- **签名**：`parseStringArray(raw: string): string[]`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2855
- **引用次数**：2

#### `isCorrectInfo`

- **类型**：逻辑控制
- **说明**：判断校验：correct / 信息
- **签名**：`isCorrectInfo(record: { handle_result_type?: string }): boolean`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2869
- **引用次数**：5

#### `isTraceInfo`

- **类型**：通用算法
- **说明**：判断校验：执行轨迹 / 信息（纯计算，无外部 IO）
- **签名**：`isTraceInfo(record: { info_type?: string; info?: string }): boolean`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2873
- **引用次数**：2

#### `toInfoRawRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：信息 / raw / record
- **签名**：`toInfoRawRecord(raw: Record<string, unknown>): InfoRawRecord`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2879
- **引用次数**：9

#### `toInfoSummaryRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：信息 / 摘要 / record
- **签名**：`toInfoSummaryRecord(raw: Record<string, unknown>): InfoSummaryRecord`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2899
- **引用次数**：3

#### `toInfoTagConfigRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：信息 / 标签 / 配置 / record
- **签名**：`toInfoTagConfigRecord(raw: Record<string, unknown>): InfoTagConfigRecord`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2909
- **引用次数**：2

#### `toInfoSummaryConfigRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：信息 / 摘要 / 配置 / record
- **签名**：`toInfoSummaryConfigRecord(raw: Record<string, unknown>): InfoSummaryConfigRecord`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2921
- **引用次数**：2

#### `toInfoConfigRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：信息 / 配置 / record
- **签名**：`toInfoConfigRecord(raw: Record<string, unknown>): InfoConfigRecord`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2934
- **引用次数**：2

#### `toInfoVectorConfigRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：信息 / 向量 / 配置 / record
- **签名**：`toInfoVectorConfigRecord(raw: Record<string, unknown>): InfoVectorConfigRecord`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2943
- **引用次数**：2

#### `toInfoContextConfigRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：信息 / 上下文 / 配置 / record
- **签名**：`toInfoContextConfigRecord(raw: Record<string, unknown>): InfoContextConfigRecord`
- **位置**：brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts:2956
- **引用次数**：2

## 文件 `brian-backend/Core/InfoCoreProvider/infrastructure/InfoCoreSchemaInitializer.ts`

### InfoCoreSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Core/InfoCoreProvider/infrastructure/InfoCoreSchemaInitializer.ts:203
- **引用次数**：99

