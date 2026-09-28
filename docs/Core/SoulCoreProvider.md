# Core / SoulCoreProvider

- 层：**Core**　模块：**SoulCoreProvider**
- 方法数：**35**（逻辑控制 15 · 数据处理 16 · 通用算法 4）

## 文件 `brian-backend/Core/SoulCoreProvider/access/SoulCoreAccess.ts`

### SoulCoreAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Core/SoulCoreProvider/access/SoulCoreAccess.ts:53
- **引用次数**：272

#### `matchSoul`

- **类型**：逻辑控制
- **说明**：判断校验：人设（返回成功与否，接入层转发至 Service）
- **签名**：`matchSoul(input: MatchSoulInput, output: MatchSoulOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/access/SoulCoreAccess.ts:59
- **引用次数**：19

#### `optSoul`

- **类型**：逻辑控制
- **说明**：处理 opt / 人设（返回成功与否，接入层转发至 Service）
- **签名**：`optSoul(input: OptSoulInput, output: OptSoulOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/access/SoulCoreAccess.ts:66
- **引用次数**：14

#### `ageSoul`

- **类型**：逻辑控制
- **说明**：处理 age / 人设（返回成功与否，接入层转发至 Service）
- **签名**：`ageSoul(input: AgeSoulInput, output: AgeSoulOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/access/SoulCoreAccess.ts:73
- **引用次数**：9

#### `soSoulRule`

- **类型**：逻辑控制
- **说明**：查询：人设 / rule（返回成功与否，接入层转发至 Service）
- **签名**：`soSoulRule(input: SoSoulRuleInput, output: SoSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/access/SoulCoreAccess.ts:80
- **引用次数**：16

#### `updateSoulRule`

- **类型**：逻辑控制
- **说明**：更新：人设 / rule（返回成功与否，接入层转发至 Service）
- **签名**：`updateSoulRule(input: UpdateSoulRuleInput, output: UpdateSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/access/SoulCoreAccess.ts:87
- **引用次数**：15

#### `soSoulContent`

- **类型**：逻辑控制
- **说明**：查询：人设 / content（返回成功与否，接入层转发至 Service）
- **签名**：`soSoulContent(input: SoSoulContentInput, output: SoSoulContentOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/access/SoulCoreAccess.ts:94
- **引用次数**：8

#### `configSoulCore`

- **类型**：逻辑控制
- **说明**：处理 配置 / 人设 / core（返回成功与否，接入层转发至 Service）
- **签名**：`configSoulCore(input: ConfigSoulCoreInput, output: ConfigSoulCoreOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/access/SoulCoreAccess.ts:101
- **引用次数**：17

## 文件 `brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts`

### SoulCoreService

#### `initialize`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:63
- **引用次数**：272

#### `matchSoul`

- **类型**：数据处理
- **说明**：判断校验：人设（向量库）
- **签名**：`matchSoul(input: MatchSoulInput, output: MatchSoulOutput, context: SoulCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:80
- **引用次数**：19

#### `optSoul`

- **类型**：逻辑控制
- **说明**：处理 opt / 人设（返回成功与否，异步编排）
- **签名**：`optSoul(input: OptSoulInput, output: OptSoulOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:150
- **引用次数**：14

#### `ageSoul`

- **类型**：逻辑控制
- **说明**：处理 age / 人设（返回成功与否，异步编排）
- **签名**：`ageSoul(_input: AgeSoulInput, output: AgeSoulOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:192
- **引用次数**：9

### SoulCoreService（私有）

#### `soStaleSoulUsages`

- **类型**：数据处理
- **说明**：查询：stale / 人设 / usages（操作关系数据库）
- **签名**：`soStaleSoulUsages(): Promise<Array<{ agent_id: string; soul_id: string; usage_count: number }>>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:200
- **引用次数**：2

### SoulCoreService

#### `soSoulRule`

- **类型**：数据处理
- **说明**：查询：人设 / rule（操作关系数据库）
- **签名**：`soSoulRule(input: SoSoulRuleInput, output: SoSoulRuleOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:227
- **引用次数**：16

#### `updateSoulRule`

- **类型**：数据处理
- **说明**：更新：人设 / rule（操作关系数据库）
- **签名**：`updateSoulRule(input: UpdateSoulRuleInput, _output: UpdateSoulRuleOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:249
- **引用次数**：15

#### `soSoulContent`

- **类型**：逻辑控制
- **说明**：查询：人设 / content（返回成功与否，异步编排）
- **签名**：`soSoulContent(input: SoSoulContentInput, output: SoSoulContentOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:298
- **引用次数**：8

#### `configSoulCore`

- **类型**：数据处理
- **说明**：处理 配置 / 人设 / core
- **签名**：`configSoulCore(input: ConfigSoulCoreInput, output: ConfigSoulCoreOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:314
- **引用次数**：17

### SoulCoreService（私有）

#### `getCoreConfig`

- **类型**：数据处理
- **说明**：获取：core / 配置
- **签名**：`getCoreConfig(): Promise<SoulCoreConfigRecord \| null>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:385
- **引用次数**：9

#### `applyMatchCacheConfig`

- **类型**：逻辑控制
- **说明**：更新：match / 缓存 / 配置（异步编排）
- **签名**：`applyMatchCacheConfig(): Promise<void>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:390
- **引用次数**：5

#### `getSoulById`

- **类型**：通用算法
- **说明**：获取：人设 / 标识（纯计算，无外部 IO）
- **签名**：`getSoulById(soulId: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:409
- **引用次数**：7

#### `generateAndAddSoul`

- **类型**：通用算法
- **说明**：构建/初始化：人设（纯计算，无外部 IO）
- **签名**：`generateAndAddSoul(agentId: string, contextId: string, runId: string, taskContent?: string, taskDomain?: string, matchCtx?: Context): Promise<string>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:431
- **引用次数**：4

#### `asTrimmedString`

- **类型**：通用算法
- **说明**：处理 trimmed / string（纯计算，无外部 IO）
- **签名**：`asTrimmedString(value: unknown): string`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:501
- **引用次数**：5

#### `rankSoulsByLLM`

- **类型**：数据处理
- **说明**：计算统计：souls / 大模型（序列化输出）
- **签名**：`rankSoulsByLLM(agentId: string, contextId: string, runId: string, taskContent: string \| undefined, taskDomain: string \| undefined, availableSouls: Array<{ id: string; soul_brief: string; soul_usage?: string }>, config: SoulCoreConfigRecord \| null, matchCtx?: Context): Promise<string>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:511
- **引用次数**：2

#### `soMatchPromptTemplateId`

- **类型**：数据处理
- **说明**：查询：match / 提示词 / template / 标识（操作关系数据库）
- **签名**：`soMatchPromptTemplateId(): Promise<string>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:552
- **引用次数**：12

#### `renderMatchPrompt`

- **类型**：逻辑控制
- **说明**：格式化/序列化：match / 提示词（异步编排）
- **签名**：`renderMatchPrompt(templateId: string, variables: Record<string, unknown>): Promise<string>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:566
- **引用次数**：10

#### `soRankLLM`

- **类型**：逻辑控制
- **说明**：查询：rank / 大模型（含异常兜底，异步编排）
- **签名**：`soRankLLM(input: ExecLLMInput, matchCtx?: Context): Promise<string>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:580
- **引用次数**：8

#### `commitMatchCache`

- **类型**：数据处理
- **说明**：处理 commit / match / 缓存（向量库）
- **签名**：`commitMatchCache(taskContent: string, embedding: number[] \| null, soulId: string, matchCtx?: Context): Promise<void>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:598
- **引用次数**：8

#### `embedTask`

- **类型**：数据处理
- **说明**：处理 embed / 任务（向量库）
- **签名**：`embedTask(task: string, context?: Context): Promise<number[]>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:611
- **引用次数**：12

#### `hydrateSoulOrClear`

- **类型**：逻辑控制
- **说明**：处理 hydrate / 人设 / clear
- **签名**：`hydrateSoulOrClear(soulId: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:622
- **引用次数**：2

#### `compareSoulsByLLM`

- **类型**：通用算法
- **说明**：计算统计：souls / 大模型（纯计算，无外部 IO）
- **签名**：`compareSoulsByLLM(currentSoul: Record<string, unknown>, candidateSoul: Record<string, unknown>): Promise<SoulVerdict>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:632
- **引用次数**：2

#### `recordSoulCoreUsage`

- **类型**：数据处理
- **说明**：写入/新增：人设 / core / 用量（操作关系数据库）
- **签名**：`recordSoulCoreUsage(agentId: string, soulId: string): Promise<void>`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:685
- **引用次数**：2

#### `toSoulCoreConfigRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：人设 / core / 配置 / record
- **签名**：`toSoulCoreConfigRecord(raw: Record<string, unknown>): SoulCoreConfigRecord`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:702
- **引用次数**：2

#### `toSoulOptRuleRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：人设 / opt / rule / record
- **签名**：`toSoulOptRuleRecord(raw: Record<string, unknown>): SoulOptRuleRecord`
- **位置**：brian-backend/Core/SoulCoreProvider/application/SoulCoreService.ts:718
- **引用次数**：2

## 文件 `brian-backend/Core/SoulCoreProvider/infrastructure/SoulCoreSchemaInitializer.ts`

### SoulCoreSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Core/SoulCoreProvider/infrastructure/SoulCoreSchemaInitializer.ts:12
- **引用次数**：99

### SoulCoreSchemaInitializer（私有）

#### `migrateLegacyUsageTable`

- **类型**：数据处理
- **说明**：处理 migrate / legacy / 用量 / 数据表（操作关系数据库）
- **签名**：`migrateLegacyUsageTable(): void`
- **位置**：brian-backend/Core/SoulCoreProvider/infrastructure/SoulCoreSchemaInitializer.ts:76
- **引用次数**：4

