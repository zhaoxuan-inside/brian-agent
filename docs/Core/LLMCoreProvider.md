# Core / LLMCoreProvider

- 层：**Core**　模块：**LLMCoreProvider**
- 方法数：**26**（逻辑控制 8 · 数据处理 12 · 通用算法 6）

## 文件 `brian-backend/Core/LLMCoreProvider/access/LLMCoreAccess.ts`

### LLMCoreAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Core/LLMCoreProvider/access/LLMCoreAccess.ts:40
- **引用次数**：272

#### `matchLLM`

- **类型**：逻辑控制
- **说明**：判断校验：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`matchLLM(input: MatchLLMInput, output: MatchLLMOutput, context: LLMCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/LLMCoreProvider/access/LLMCoreAccess.ts:46
- **引用次数**：24

#### `limitLLM`

- **类型**：逻辑控制
- **说明**：处理 限额 / 大模型（返回成功与否，接入层转发至 Service）
- **签名**：`limitLLM(input: LimitLLMInput, output: LimitLLMOutput, context: LLMCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/LLMCoreProvider/access/LLMCoreAccess.ts:53
- **引用次数**：13

#### `checkLLMQuota`

- **类型**：逻辑控制
- **说明**：判断校验：大模型 / quota（返回成功与否，接入层转发至 Service）
- **签名**：`checkLLMQuota(input: CheckLLMQuotaInput, output: CheckLLMQuotaOutput, context: LLMCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/LLMCoreProvider/access/LLMCoreAccess.ts:60
- **引用次数**：12

#### `configLLMCore`

- **类型**：逻辑控制
- **说明**：处理 配置 / 大模型 / core（返回成功与否，接入层转发至 Service）
- **签名**：`configLLMCore(input: ConfigLLMCoreInput, output: ConfigLLMCoreOutput, context: LLMCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/LLMCoreProvider/access/LLMCoreAccess.ts:67
- **引用次数**：22

#### `recordLLMUsage`

- **类型**：逻辑控制
- **说明**：写入/新增：大模型 / 用量（返回成功与否，接入层转发至 Service）
- **签名**：`recordLLMUsage(input: RecordLLMUsageInput, output: RecordLLMUsageOutput, context: LLMCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/LLMCoreProvider/access/LLMCoreAccess.ts:74
- **引用次数**：15

## 文件 `brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts`

### LLMCoreService

#### `initialize`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:61
- **引用次数**：272

#### `matchLLM`

- **类型**：数据处理
- **说明**：判断校验：大模型（操作关系数据库）
- **签名**：`matchLLM(input: MatchLLMInput, output: MatchLLMOutput, context: LLMCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:75
- **引用次数**：24

#### `limitLLM`

- **类型**：数据处理
- **说明**：处理 限额 / 大模型（操作关系数据库）
- **签名**：`limitLLM(input: LimitLLMInput, output: LimitLLMOutput, _context: LLMCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:177
- **引用次数**：13

#### `checkLLMQuota`

- **类型**：逻辑控制
- **说明**：判断校验：大模型 / quota（返回成功与否，异步编排）
- **签名**：`checkLLMQuota(input: CheckLLMQuotaInput, output: CheckLLMQuotaOutput, _context: LLMCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:234
- **引用次数**：12

#### `configLLMCore`

- **类型**：数据处理
- **说明**：处理 配置 / 大模型 / core
- **签名**：`configLLMCore(input: ConfigLLMCoreInput, output: ConfigLLMCoreOutput, _context: LLMCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:278
- **引用次数**：22

#### `recordLLMUsage`

- **类型**：数据处理
- **说明**：写入/新增：大模型 / 用量（操作关系数据库）
- **签名**：`recordLLMUsage(input: RecordLLMUsageInput, output: RecordLLMUsageOutput, _context: LLMCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:326
- **引用次数**：15

### LLMCoreService（私有）

#### `getCoreConfig`

- **类型**：数据处理
- **说明**：获取：core / 配置
- **签名**：`getCoreConfig(): Promise<LLMCoreConfigRecord \| null>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:354
- **引用次数**：9

#### `toCoreConfigRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：core / 配置 / record
- **签名**：`toCoreConfigRecord(raw: Record<string, unknown>): LLMCoreConfigRecord`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:359
- **引用次数**：2

#### `getLLMById`

- **类型**：通用算法
- **说明**：获取：大模型 / 标识（纯计算，无外部 IO）
- **签名**：`getLLMById(llmId: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:376
- **引用次数**：4

#### `getProviderQuota`

- **类型**：数据处理
- **说明**：获取：Provider / quota（操作关系数据库）
- **签名**：`getProviderQuota(llmProviderId: string): Promise<LLMProviderQuotaRecord \| null>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:399
- **引用次数**：3

#### `toQuotaRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：quota / record
- **签名**：`toQuotaRecord(raw: Record<string, unknown>): LLMProviderQuotaRecord`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:411
- **引用次数**：2

#### `getUsageInRange`

- **类型**：数据处理
- **说明**：获取：用量 / range（操作关系数据库）
- **签名**：`getUsageInRange(llmProviderId: string, rangeStart: number, rangeEnd: number): Promise<{ tokens_used: number; call_count: number }>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:432
- **引用次数**：4

#### `buildQuotaStatus`

- **类型**：通用算法
- **说明**：构建/初始化：quota / 状态（纯计算，无外部 IO）
- **签名**：`buildQuotaStatus(quota: LLMProviderQuotaRecord \| null, tokenField: keyof LLMProviderQuotaRecord, callField: keyof LLMProviderQuotaRecord, usage: { tokens_used: number; call_count: number }): { limit: number; used: number; available: number }`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:455
- **引用次数**：4

#### `getDayStart`

- **类型**：通用算法
- **说明**：获取：day / start（纯计算，无外部 IO）
- **签名**：`getDayStart(timestamp: number): number`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:489
- **引用次数**：2

#### `getWeekStart`

- **类型**：通用算法
- **说明**：获取：week / start（纯计算，无外部 IO）
- **签名**：`getWeekStart(timestamp: number): number`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:496
- **引用次数**：2

#### `getMonthStart`

- **类型**：通用算法
- **说明**：获取：month / start（纯计算，无外部 IO）
- **签名**：`getMonthStart(timestamp: number): number`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:506
- **引用次数**：2

#### `buildLlmList`

- **类型**：通用算法
- **说明**：构建/初始化：大模型 / 列表（纯计算，无外部 IO）
- **签名**：`buildLlmList(availableLLMs: Array<{ id: string; llm_title?: string; llm_brief?: string \| null; model_usage?: string }>): string`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:518
- **引用次数**：2

#### `renderMatchPrompt`

- **类型**：逻辑控制
- **说明**：格式化/序列化：match / 提示词（异步编排）
- **签名**：`renderMatchPrompt(templateId: string, variables: Record<string, unknown>): Promise<string>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:531
- **引用次数**：10

#### `soMatchPromptTemplateId`

- **类型**：数据处理
- **说明**：查询：match / 提示词 / template / 标识（操作关系数据库）
- **签名**：`soMatchPromptTemplateId(): Promise<string>`
- **位置**：brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts:544
- **引用次数**：12

## 文件 `brian-backend/Core/LLMCoreProvider/infrastructure/LLMCoreSchemaInitializer.ts`

### LLMCoreSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Core/LLMCoreProvider/infrastructure/LLMCoreSchemaInitializer.ts:13
- **引用次数**：99

