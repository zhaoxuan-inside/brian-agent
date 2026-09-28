# Runtime / Agents

- 层：**Runtime**　模块：**Agents**
- 方法数：**61**（逻辑控制 22 · 数据处理 34 · 通用算法 5）

## 文件 `brian-backend/Runtime/Agents/access/AgentDefAccess.ts`

### AgentDefAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Runtime/Agents/access/AgentDefAccess.ts:31
- **引用次数**：272

#### `matchAgentDef`

- **类型**：逻辑控制
- **说明**：判断校验：Agent / def（返回成功与否，接入层转发至 Service）
- **签名**：`matchAgentDef(input: MatchAgentDefInput, output: MatchAgentDefOutput, context: AgentDefContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/access/AgentDefAccess.ts:36
- **引用次数**：13

#### `soAgentSnapshot`

- **类型**：逻辑控制
- **说明**：查询：Agent / 快照（返回成功与否，接入层转发至 Service）
- **签名**：`soAgentSnapshot(input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, context: AgentDefContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/access/AgentDefAccess.ts:42
- **引用次数**：6

#### `declareAgent`

- **类型**：逻辑控制
- **说明**：处理 declare / Agent（返回成功与否，接入层转发至 Service）
- **签名**：`declareAgent(input: DeclareAgentInput, output: DeclareAgentOutput, context: AgentDefContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/access/AgentDefAccess.ts:48
- **引用次数**：4

#### `soAgentDefs`

- **类型**：逻辑控制
- **说明**：查询：Agent / defs（返回成功与否，接入层转发至 Service）
- **签名**：`soAgentDefs(input: SoAgentDefsInput, output: SoAgentDefsOutput, context: AgentDefContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/access/AgentDefAccess.ts:54
- **引用次数**：4

#### `configAgentDef`

- **类型**：逻辑控制
- **说明**：处理 配置 / Agent / def（返回成功与否，接入层转发至 Service）
- **签名**：`configAgentDef(input: ConfigAgentDefInput, output: ConfigAgentDefOutput, context: AgentDefContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/access/AgentDefAccess.ts:60
- **引用次数**：3

#### `killErroredAgent`

- **类型**：逻辑控制
- **说明**：处理 kill / errored / Agent（返回成功与否，接入层转发至 Service）
- **签名**：`killErroredAgent(input: KillErroredAgentInput, output: KillErroredAgentOutput, context: AgentDefContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/access/AgentDefAccess.ts:66
- **引用次数**：7

#### `invalidateAgentBindingCache`

- **类型**：逻辑控制
- **说明**：处理 invalidate / Agent / binding / 缓存（接入层转发至 Service）
- **签名**：`invalidateAgentBindingCache(): void`
- **位置**：brian-backend/Runtime/Agents/access/AgentDefAccess.ts:71
- **引用次数**：4

## 文件 `brian-backend/Runtime/Agents/application/AgentDefService.ts`

### AgentDefService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:139
- **引用次数**：272

### AgentDefService（私有）

#### `warmAssetCaches`

- **类型**：数据处理
- **说明**：处理 warm / asset / caches（操作关系数据库）
- **签名**：`warmAssetCaches(): Promise<void>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:156
- **引用次数**：4

### AgentDefService

#### `invalidateAgentBindingCache`

- **类型**：数据处理
- **说明**：处理 invalidate / Agent / binding / 缓存
- **签名**：`invalidateAgentBindingCache(): void`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:191
- **引用次数**：4

### AgentDefService（私有）

#### `soAgentBinding`

- **类型**：数据处理
- **说明**：查询：Agent / binding（操作关系数据库）
- **签名**：`soAgentBinding(agentRef: string): Promise<AgentBindingRow \| null>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:196
- **引用次数**：6

#### `loadActiveDefs`

- **类型**：数据处理
- **说明**：获取：active / defs（操作关系数据库）
- **签名**：`loadActiveDefs(): Promise<AgentDefRecord[]>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:226
- **引用次数**：3

#### `soActiveDefsCached`

- **类型**：数据处理
- **说明**：查询：active / defs / cached（向量库）
- **签名**：`soActiveDefsCached(): Promise<AgentDefRecord[]>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:233
- **引用次数**：2

### AgentDefService

#### `matchAgentDef`

- **类型**：逻辑控制
- **说明**：判断校验：Agent / def（返回成功与否，异步编排）
- **签名**：`matchAgentDef(input: MatchAgentDefInput, output: MatchAgentDefOutput, _context: AgentDefContext, _metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:247
- **引用次数**：13

### AgentDefService（私有）

#### `soActiveDefs`

- **类型**：逻辑控制
- **说明**：查询：active / defs
- **签名**：`soActiveDefs(): Promise<AgentDefRecord[]>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:296
- **引用次数**：2

#### `toDefRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：def / record
- **签名**：`toDefRecord(row: Record<string, unknown>): AgentDefRecord`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:300
- **引用次数**：6

#### `soDefByAgentRef`

- **类型**：逻辑控制
- **说明**：查询：def / Agent / ref
- **签名**：`soDefByAgentRef(defs: AgentDefRecord[], agentRef: string): AgentDefRecord \| null`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:320
- **引用次数**：2

#### `soCandidateProfiles`

- **类型**：逻辑控制
- **说明**：查询：candidate / profiles（遍历调度，异步编排）
- **签名**：`soCandidateProfiles(defs: AgentDefRecord[]): Promise<Array<Record<string, unknown>>>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:324
- **引用次数**：2

#### `parseDefTools`

- **类型**：通用算法
- **说明**：解析：def / tools（纯计算，无外部 IO）
- **签名**：`parseDefTools(def: AgentDefRecord): { skills: string[]; mcps: string[] }`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:349
- **引用次数**：2

#### `uniqueJoin`

- **类型**：通用算法
- **说明**：处理 unique / join（纯计算，无外部 IO）
- **签名**：`uniqueJoin(ids: string[], extra: string[]): string[]`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:359
- **引用次数**：5

#### `soNamesByIds`

- **类型**：数据处理
- **说明**：查询：names / ids（操作关系数据库）
- **签名**：`soNamesByIds(ids: string[], table: string, nameCol: string, fallbackCol: string): string[]`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:370
- **引用次数**：3

#### `soExactMatch`

- **类型**：逻辑控制
- **说明**：查询：exact / match
- **签名**：`soExactMatch(defs: AgentDefRecord[], taskContent: string, domain?: string): AgentDefRecord \| null`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:392
- **引用次数**：2

#### `soVectorRankedDef`

- **类型**：数据处理
- **说明**：查询：向量 / ranked / def（向量库，文件系统）
- **签名**：`soVectorRankedDef(input: MatchAgentDefInput, defs: AgentDefRecord[], metrics?: Metrics, report?: Report): Promise<{ def: AgentDefRecord; score: number } \| null>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:397
- **引用次数**：2

#### `soTaskEmbedding`

- **类型**：数据处理
- **说明**：查询：任务 / 向量（向量库）
- **签名**：`soTaskEmbedding(input: MatchAgentDefInput, metrics?: Metrics): Promise<number[]>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:444
- **引用次数**：2

#### `soDefEmbedding`

- **类型**：数据处理
- **说明**：查询：def / 向量（向量库）
- **签名**：`soDefEmbedding(def: AgentDefRecord, input: MatchAgentDefInput, metrics?: Metrics): Promise<number[]>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:461
- **引用次数**：2

#### `defEmbedText`

- **类型**：通用算法
- **说明**：处理 def / embed / 文本（纯计算，无外部 IO）
- **签名**：`defEmbedText(def: AgentDefRecord): string`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:487
- **引用次数**：2

### AgentDefService（静态）（私有）

#### `cosineSimilarity`

- **类型**：通用算法
- **说明**：处理 cosine / similarity（纯计算，无外部 IO）
- **签名**：`cosineSimilarity(a: number[], b: number[]): number`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:491
- **引用次数**：7

### AgentDefService（私有）

#### `buildSignature`

- **类型**：通用算法
- **说明**：构建/初始化：signature（纯计算，无外部 IO）
- **签名**：`buildSignature(taskContent: string, domain?: string): string`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:505
- **引用次数**：4

#### `soLLMRankedDef`

- **类型**：数据处理
- **说明**：查询：大模型 / ranked / def（文件系统，序列化输出）
- **签名**：`soLLMRankedDef(input: MatchAgentDefInput, defs: AgentDefRecord[], metrics?: Metrics, report?: Report): Promise<AgentDefRecord \| null>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:510
- **引用次数**：2

#### `soMatchPromptTemplateId`

- **类型**：数据处理
- **说明**：查询：match / 提示词 / template / 标识（操作关系数据库）
- **签名**：`soMatchPromptTemplateId(): Promise<string>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:558
- **引用次数**：12

#### `buildNewDef`

- **类型**：数据处理
- **说明**：构建/初始化：def
- **签名**：`buildNewDef(input: MatchAgentDefInput, metrics?: Metrics, report?: Report): Promise<AgentDefRecord>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:574
- **引用次数**：2

#### `prepareBuilderContext`

- **类型**：逻辑控制
- **说明**：构建/初始化：builder / 上下文
- **签名**：`prepareBuilderContext(input: MatchAgentDefInput): AgentBuilderContext`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:597
- **引用次数**：2

#### `insertDefFromAgent`

- **类型**：数据处理
- **说明**：写入/新增：def / Agent（操作关系数据库，序列化输出）
- **签名**：`insertDefFromAgent(agentId: string, input: MatchAgentDefInput): Promise<AgentDefRecord>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:605
- **引用次数**：2

#### `soAgentAsset`

- **类型**：逻辑控制
- **说明**：查询：Agent / asset（异步编排）
- **签名**：`soAgentAsset(agentId: string): Promise<AgentRecordLike \| null>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:662
- **引用次数**：3

#### `soDefRowById`

- **类型**：数据处理
- **说明**：查询：def / row / 标识（操作关系数据库）
- **签名**：`soDefRowById(defId: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:677
- **引用次数**：3

### AgentDefService

#### `soAgentSnapshot`

- **类型**：数据处理
- **说明**：查询：Agent / 快照
- **签名**：`soAgentSnapshot(input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, _context: AgentDefContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:683
- **引用次数**：6

### AgentDefService（私有）

#### `soDefRow`

- **类型**：数据处理
- **说明**：查询：def / row（操作关系数据库）
- **签名**：`soDefRow(defId: string): Promise<AgentDefRecord>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:717
- **引用次数**：2

#### `soComponentName`

- **类型**：数据处理
- **说明**：查询：组件 / name（操作关系数据库）
- **签名**：`soComponentName(id: string, table: string, nameCol: string): string`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:727
- **引用次数**：15

#### `soSkillName`

- **类型**：逻辑控制
- **说明**：查询：技能 / name
- **签名**：`soSkillName(id: string): string`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:741
- **引用次数**：4

#### `soSoulContent`

- **类型**：逻辑控制
- **说明**：查询：人设 / content
- **签名**：`soSoulContent(def: AgentDefRecord): Promise<string>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:745
- **引用次数**：8

#### `soSoulContentById`

- **类型**：逻辑控制
- **说明**：查询：人设 / content / 标识（异步编排）
- **签名**：`soSoulContentById(soulId: string): Promise<string>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:752
- **引用次数**：3

#### `soSnapshotTools`

- **类型**：数据处理
- **说明**：查询：快照 / tools（序列化输出）
- **签名**：`soSnapshotTools(def: AgentDefRecord, _report?: Report): Promise<SnapshotToolEntry[]>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:763
- **引用次数**：2

#### `soJsonIdArray`

- **类型**：数据处理
- **说明**：查询：JSON / 标识 / array（反序列化）
- **签名**：`soJsonIdArray(raw?: string): string[]`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:792
- **引用次数**：7

#### `entriesFromExplicit`

- **类型**：数据处理
- **说明**：处理 entries / explicit
- **签名**：`entriesFromExplicit(explicit: Record<string, unknown> \| null): SnapshotToolEntry[]`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:802
- **引用次数**：2

#### `prepareSystemPrompt`

- **类型**：数据处理
- **说明**：构建/初始化：system / 提示词
- **签名**：`prepareSystemPrompt(def: AgentDefRecord, soulContent: string, tools: SnapshotToolEntry[], userMessage: string): Promise<string>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:816
- **引用次数**：2

#### `soDefaultIdentityTemplateId`

- **类型**：数据处理
- **说明**：查询：default / identity / template / 标识（操作关系数据库）
- **签名**：`soDefaultIdentityTemplateId(): Promise<string>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:836
- **引用次数**：3

#### `soMatchScoreThreshold`

- **类型**：数据处理
- **说明**：查询：match / score / threshold（操作关系数据库）
- **签名**：`soMatchScoreThreshold(): Promise<number>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:849
- **引用次数**：2

#### `renderMatchPrompt`

- **类型**：数据处理
- **说明**：格式化/序列化：match / 提示词（操作关系数据库）
- **签名**：`renderMatchPrompt(templateId: string, variables: Record<string, unknown>): Promise<string>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:862
- **引用次数**：10

### AgentDefService

#### `declareAgent`

- **类型**：数据处理
- **说明**：处理 declare / Agent（操作关系数据库）
- **签名**：`declareAgent(input: DeclareAgentInput, output: DeclareAgentOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:873
- **引用次数**：4

### AgentDefService（私有）

#### `prepareDefPatch`

- **类型**：逻辑控制
- **说明**：构建/初始化：def / patch
- **签名**：`prepareDefPatch(input: DeclareAgentInput): Record<string, unknown>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:894
- **引用次数**：3

### AgentDefService

#### `soAgentDefs`

- **类型**：数据处理
- **说明**：查询：Agent / defs（操作关系数据库）
- **签名**：`soAgentDefs(_input: SoAgentDefsInput, output: SoAgentDefsOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:911
- **引用次数**：4

#### `configAgentDef`

- **类型**：逻辑控制
- **说明**：处理 配置 / Agent / def（返回成功与否，异步编排）
- **签名**：`configAgentDef(input: ConfigAgentDefInput, _output: ConfigAgentDefOutput, _context: AgentDefContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:920
- **引用次数**：3

#### `killErroredAgent`

- **类型**：数据处理
- **说明**：处理 kill / errored / Agent
- **签名**：`killErroredAgent(input: KillErroredAgentInput, _output: KillErroredAgentOutput, _context: AgentDefContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:929
- **引用次数**：7

### AgentDefService（私有）

#### `recordErroredUsage`

- **类型**：数据处理
- **说明**：写入/新增：errored / 用量（序列化输出）
- **签名**：`recordErroredUsage(agentRef: string, input: KillErroredAgentInput, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:961
- **引用次数**：3

#### `disableDefsByRef`

- **类型**：数据处理
- **说明**：界面控制：defs / ref（操作关系数据库）
- **签名**：`disableDefsByRef(agentBizId: string, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:992
- **引用次数**：3

#### `soAgentOwner`

- **类型**：数据处理
- **说明**：查询：Agent / owner（操作关系数据库）
- **签名**：`soAgentOwner(agentBizId: string): Promise<{ id: string; created_by: string }>`
- **位置**：brian-backend/Runtime/Agents/application/AgentDefService.ts:1007
- **引用次数**：2

## 文件 `brian-backend/Runtime/Agents/infrastructure/AgentsSchemaInitializer.ts`

### AgentsSchemaInitializer

#### `init`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据
- **签名**：`init(): void`
- **位置**：brian-backend/Runtime/Agents/infrastructure/AgentsSchemaInitializer.ts:7
- **引用次数**：99

### AgentsSchemaInitializer（私有）

#### `ensurePurposeColumn`

- **类型**：数据处理
- **说明**：确保就绪：purpose / 字段（操作关系数据库）
- **签名**：`ensurePurposeColumn(): void`
- **位置**：brian-backend/Runtime/Agents/infrastructure/AgentsSchemaInitializer.ts:13
- **引用次数**：2

#### `initDefTable`

- **类型**：数据处理
- **说明**：构建/初始化：def / 数据表（操作关系数据库）
- **签名**：`initDefTable(): void`
- **位置**：brian-backend/Runtime/Agents/infrastructure/AgentsSchemaInitializer.ts:23
- **引用次数**：2

#### `initConfigTable`

- **类型**：数据处理
- **说明**：构建/初始化：配置 / 数据表（操作关系数据库）
- **签名**：`initConfigTable(): void`
- **位置**：brian-backend/Runtime/Agents/infrastructure/AgentsSchemaInitializer.ts:50
- **引用次数**：4

