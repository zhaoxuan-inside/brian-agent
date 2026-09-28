# Core / MCPCoreProvider

- 层：**Core**　模块：**MCPCoreProvider**
- 方法数：**25**（逻辑控制 9 · 数据处理 12 · 通用算法 4）

## 文件 `brian-backend/Core/MCPCoreProvider/access/MCPCoreAccess.ts`

### MCPCoreAccess

#### `matchMCP`

- **类型**：逻辑控制
- **说明**：判断校验：MCP 通道（返回成功与否，接入层转发至 Service）
- **签名**：`matchMCP(input: MatchMcpInput, output: MatchMcpOutput, context: McpCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MCPCoreProvider/access/MCPCoreAccess.ts:41
- **引用次数**：22

#### `optMCP`

- **类型**：逻辑控制
- **说明**：处理 opt / MCP 通道（返回成功与否，接入层转发至 Service）
- **签名**：`optMCP(input: OptMcpInput, output: OptMcpOutput, context: McpCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MCPCoreProvider/access/MCPCoreAccess.ts:46
- **引用次数**：11

#### `configMCPCore`

- **类型**：逻辑控制
- **说明**：处理 配置 / MCP 通道 / core（返回成功与否，接入层转发至 Service）
- **签名**：`configMCPCore(input: ConfigMcpCoreInput, output: ConfigMcpCoreOutput, context: McpCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MCPCoreProvider/access/MCPCoreAccess.ts:51
- **引用次数**：16

## 文件 `brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts`

### MCPCoreService

#### `matchMCP`

- **类型**：数据处理
- **说明**：判断校验：MCP 通道（向量库）
- **签名**：`matchMCP(input: MatchMcpInput, output: MatchMcpOutput, context: McpCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:88
- **引用次数**：22

### MCPCoreService（私有）

#### `installMcpFromMarket`

- **类型**：逻辑控制
- **说明**：构建/初始化：MCP 通道 / market（含异常兜底，异步编排）
- **签名**：`installMcpFromMarket(taskContent: string, matchCtx?: Context): Promise<string \| null>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:176
- **引用次数**：2

#### `soEnabledProviders`

- **类型**：逻辑控制
- **说明**：查询：enabled / providers（异步编排）
- **签名**：`soEnabledProviders(): Promise<Array<Record<string, unknown>>>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:204
- **引用次数**：2

#### `soMarketCandidates`

- **类型**：逻辑控制
- **说明**：查询：market / candidates（含异常兜底，遍历调度，异步编排）
- **签名**：`soMarketCandidates(providers: Array<Record<string, unknown>>): Promise<Array<{ provider_id: string; cache_id: string; title: string; brief: string }>>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:215
- **引用次数**：2

#### `rankMarketCandidates`

- **类型**：数据处理
- **说明**：计算统计：market / candidates（序列化输出）
- **签名**：`rankMarketCandidates(candidates: Array<{ provider_id: string; cache_id: string; title: string; brief: string }>, taskContent: string, matchCtx?: Context): Promise<{ provider_id: string; cache_id: string } \| null>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:237
- **引用次数**：2

#### `soMarketPromptTemplateId`

- **类型**：数据处理
- **说明**：查询：market / 提示词 / template / 标识（操作关系数据库）
- **签名**：`soMarketPromptTemplateId(): Promise<string>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:255
- **引用次数**：2

### MCPCoreService

#### `optMCP`

- **类型**：数据处理
- **说明**：处理 opt / MCP 通道（操作关系数据库）
- **签名**：`optMCP(input: OptMcpInput, output: OptMcpOutput, _context: McpCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:272
- **引用次数**：11

#### `configMCPCore`

- **类型**：数据处理
- **说明**：处理 配置 / MCP 通道 / core
- **签名**：`configMCPCore(input: ConfigMcpCoreInput, output: ConfigMcpCoreOutput, _context: McpCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:295
- **引用次数**：16

### MCPCoreService（私有）

#### `applyMatchCacheConfig`

- **类型**：逻辑控制
- **说明**：更新：match / 缓存 / 配置（异步编排）
- **签名**：`applyMatchCacheConfig(): Promise<void>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:353
- **引用次数**：5

#### `getConfig`

- **类型**：数据处理
- **说明**：获取：配置
- **签名**：`getConfig(): Promise<McpCoreConfigRecord>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:363
- **引用次数**：69

### MCPCoreService（静态）（私有）

#### `toConfigBoolean`

- **类型**：通用算法
- **说明**：格式化/序列化：配置 / boolean（纯计算，无外部 IO）
- **签名**：`toConfigBoolean(value: unknown, defaultValue: boolean): boolean`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:379
- **引用次数**：5

### MCPCoreService（私有）

#### `getAvailableMcps`

- **类型**：通用算法
- **说明**：获取：available / mcps（纯计算，无外部 IO）
- **签名**：`getAvailableMcps(): Promise<McpInstallRecord[]>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:384
- **引用次数**：2

#### `getMcpDetails`

- **类型**：通用算法
- **说明**：获取：MCP 通道 / details（纯计算，无外部 IO）
- **签名**：`getMcpDetails(ids: string[]): Promise<McpInstallRecord[]>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:395
- **引用次数**：3

#### `rankMcpsWithLLM`

- **类型**：数据处理
- **说明**：计算统计：mcps / 大模型（序列化输出）
- **签名**：`rankMcpsWithLLM(mcps: McpInstallRecord[], input: MatchMcpInput, promptTemplateId: string, matchCtx?: Context): Promise<NeedRankingResult \| null>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:407
- **引用次数**：2

#### `soMatchPromptTemplateId`

- **类型**：数据处理
- **说明**：查询：match / 提示词 / template / 标识（操作关系数据库）
- **签名**：`soMatchPromptTemplateId(): Promise<string>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:434
- **引用次数**：12

#### `renderMatchPrompt`

- **类型**：逻辑控制
- **说明**：格式化/序列化：match / 提示词（含异常兜底，异步编排）
- **签名**：`renderMatchPrompt(templateId: string, variables: Record<string, unknown>): Promise<string>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:451
- **引用次数**：10

#### `soRankLLM`

- **类型**：逻辑控制
- **说明**：查询：rank / 大模型（含异常兜底，异步编排）
- **签名**：`soRankLLM(input: ExecLLMInput, matchCtx?: Context): Promise<string>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:463
- **引用次数**：8

#### `toMcpDetails`

- **类型**：通用算法
- **说明**：格式化/序列化：MCP 通道 / details（纯计算，无外部 IO）
- **签名**：`toMcpDetails(ids: string[], mcps: McpInstallRecord[]): McpInstallRecord[]`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:480
- **引用次数**：3

#### `commitMatchCache`

- **类型**：数据处理
- **说明**：处理 commit / match / 缓存（向量库）
- **签名**：`commitMatchCache(taskContent: string, embedding: number[] \| null, rankedIds: string[], matchCtx?: Context): Promise<void>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:486
- **引用次数**：8

#### `embedTask`

- **类型**：数据处理
- **说明**：处理 embed / 任务（向量库）
- **签名**：`embedTask(task: string, context?: Context): Promise<number[]>`
- **位置**：brian-backend/Core/MCPCoreProvider/application/MCPCoreService.ts:495
- **引用次数**：12

## 文件 `brian-backend/Core/MCPCoreProvider/infrastructure/MCPCoreSchemaInitializer.ts`

### MCPCoreSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Core/MCPCoreProvider/infrastructure/MCPCoreSchemaInitializer.ts:11
- **引用次数**：99

### MCPCoreSchemaInitializer（私有）

#### `migrateLegacyUsageTable`

- **类型**：数据处理
- **说明**：处理 migrate / legacy / 用量 / 数据表（操作关系数据库）
- **签名**：`migrateLegacyUsageTable(): void`
- **位置**：brian-backend/Core/MCPCoreProvider/infrastructure/MCPCoreSchemaInitializer.ts:60
- **引用次数**：4

