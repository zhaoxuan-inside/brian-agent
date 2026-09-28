# Agent / WriterAgent

- 层：**Agent**　模块：**WriterAgent**
- 方法数：**31**（逻辑控制 15 · 数据处理 13 · 通用算法 3）

## 文件 `brian-backend/Agent/WriterAgent/access/WriterAgentAccess.ts`

### WriterAgentAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Agent/WriterAgent/access/WriterAgentAccess.ts:40
- **引用次数**：272

#### `execWrite`

- **类型**：逻辑控制
- **说明**：处理执行：write（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`execWrite(i: WriteInput, o: WriteOutput, c: WriterAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/WriterAgent/access/WriterAgentAccess.ts:42
- **引用次数**：15

#### `saveUserProfile`

- **类型**：逻辑控制
- **说明**：写入/新增：用户 / 画像（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`saveUserProfile(i: SaveUserProfileInput, o: SaveUserProfileOutput, c: WriterAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/WriterAgent/access/WriterAgentAccess.ts:47
- **引用次数**：23

#### `soUserProfile`

- **类型**：逻辑控制
- **说明**：查询：用户 / 画像（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soUserProfile(i: GetUserProfileInput, o: GetUserProfileOutput, c: WriterAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/WriterAgent/access/WriterAgentAccess.ts:53
- **引用次数**：30

#### `configWriterAgent`

- **类型**：逻辑控制
- **说明**：处理 配置 / 写作 / Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`configWriterAgent(i: ConfigWriterAgentInput, o: ConfigWriterAgentOutput, c: WriterAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/WriterAgent/access/WriterAgentAccess.ts:59
- **引用次数**：15

## 文件 `brian-backend/Agent/WriterAgent/application/WriterAgentService.ts`

### WriterAgentService

#### `execWrite`

- **类型**：数据处理
- **说明**：处理执行：write
- **签名**：`execWrite(input: WriteInput, output: WriteOutput, ctx: WriterAgentContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:70
- **引用次数**：15

### WriterAgentService（私有）

#### `prepareWriterAgent`

- **类型**：逻辑控制
- **说明**：构建/初始化：写作 / Agent（异步编排）
- **签名**：`prepareWriterAgent(input: WriteInput, ctx: WriterAgentContext): Promise<PreparedWriterAgent>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:102
- **引用次数**：2

#### `resolveWritePreferences`

- **类型**：逻辑控制
- **说明**：获取：write / preferences（异步编排）
- **签名**：`resolveWritePreferences(input: WriteInput, ctx: WriterAgentContext): Promise<{ preferences: WriterPreferences; config: WriterAgentConfigRecord \| null; }>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:126
- **引用次数**：2

#### `buildSessionContext`

- **类型**：数据处理
- **说明**：构建/初始化：会话 / 上下文
- **签名**：`buildSessionContext(input: WriteInput, ctx: WriterAgentContext, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:156
- **引用次数**：2

#### `emitErrorFallback`

- **类型**：数据处理
- **说明**：发送通知：错误 / fallback
- **签名**：`emitErrorFallback(input: WriteInput, output: WriteOutput, prepared: PreparedWriterAgent, preferences: WriterPreferences, config: WriterAgentConfigRecord \| null, resultsCtx: WriterResultsContext, startedAt: number, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:185
- **引用次数**：2

#### `buildWriterTraceParams`

- **类型**：逻辑控制
- **说明**：构建/初始化：写作 / 执行轨迹
- **签名**：`buildWriterTraceParams(prepared: PreparedWriterAgent, taskContent: string, response: string, inputTokens: number, outputTokens: number, rawResponse: string, startedAt: number, config: WriterAgentConfigRecord \| null)`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:206
- **引用次数**：3

#### `loadSoulContent`

- **类型**：逻辑控制
- **说明**：获取：人设 / content（含异常兜底，异步编排）
- **签名**：`loadSoulContent(agent: AgentRecord \| undefined, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:226
- **引用次数**：2

#### `renderWritePrompt`

- **类型**：数据处理
- **说明**：格式化/序列化：write / 提示词（序列化输出）
- **签名**：`renderWritePrompt(input: WriteInput, preferences: WriterPreferences, contextExtra: string, resultsCtx: WriterResultsContext, system: string, config: WriterAgentConfigRecord \| null, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:248
- **引用次数**：2

#### `buildWriteEventsInput`

- **类型**：通用算法
- **说明**：构建/初始化：write / events / 输入（纯计算，无外部 IO）
- **签名**：`buildWriteEventsInput(input: WriteInput, ctx: WriterAgentContext, llmId: string, system: string, prompt: string): ExecLLMEventsInput`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:265
- **引用次数**：2

#### `execWriterLlm`

- **类型**：逻辑控制
- **说明**：处理执行：写作 / 大模型（异步编排）
- **签名**：`execWriterLlm(input: WriteInput, ctx: WriterAgentContext, llmId: string, system: string, prompt: string, metrics?: Metrics, report?: Report): Promise<{ ok: boolean; eventsOutput: ExecLLMEventsOutput }>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:291
- **引用次数**：2

#### `applyWriteResult`

- **类型**：数据处理
- **说明**：更新：write / result
- **签名**：`applyWriteResult(output: WriteOutput, llm: { ok: boolean; eventsOutput: ExecLLMEventsOutput }, fallbackResults: string, userQuery: string): { response: string; tokens: number }`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:320
- **引用次数**：2

#### `recordWriterUsage`

- **类型**：数据处理
- **说明**：写入/新增：写作 / 用量（序列化输出）
- **签名**：`recordWriterUsage(libCtx: AgentLibraryContext, agentId: string, input: WriteInput, ctx: WriterAgentContext, taskContent: string, agentOutput: string, traceId?: string): Promise<void>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:349
- **引用次数**：2

#### `recordTrace`

- **类型**：数据处理
- **说明**：写入/新增：执行轨迹
- **签名**：`recordTrace(output: WriteOutput, params: { agentId: string; agentName: string; soulId: string; taskContent: string; response: string; inputTokens: number; outputTokens: number; rawResponse: string; elapsedMs: number; templateId: string \| undefined; }, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:370
- **引用次数**：7

### WriterAgentService

#### `saveUserProfile`

- **类型**：数据处理
- **说明**：写入/新增：用户 / 画像（操作关系数据库）
- **签名**：`saveUserProfile(input: SaveUserProfileInput, _output: SaveUserProfileOutput, _ctx: WriterAgentContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:423
- **引用次数**：23

#### `soUserProfile`

- **类型**：逻辑控制
- **说明**：查询：用户 / 画像（返回成功与否，异步编排）
- **签名**：`soUserProfile(input: GetUserProfileInput, output: GetUserProfileOutput, _ctx: WriterAgentContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:472
- **引用次数**：30

#### `configWriterAgent`

- **类型**：数据处理
- **说明**：处理 配置 / 写作 / Agent（操作关系数据库）
- **签名**：`configWriterAgent(input: ConfigWriterAgentInput, output: ConfigWriterAgentOutput, _ctx: WriterAgentContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:487
- **引用次数**：15

### WriterAgentService（私有）

#### `loadProfile`

- **类型**：数据处理
- **说明**：获取：画像（操作关系数据库）
- **签名**：`loadProfile(sessionId: string): Promise<WriterAgentUserProfileRecord \| null>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:562
- **引用次数**：12

#### `renderPrompt`

- **类型**：逻辑控制
- **说明**：格式化/序列化：提示词
- **签名**：`renderPrompt(templateId: string \| undefined, builtinId: string, variables: Record<string, unknown>, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:582
- **引用次数**：11

#### `resolveLlm`

- **类型**：逻辑控制
- **说明**：获取：大模型
- **签名**：`resolveLlm(agentId: string, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:593
- **引用次数**：8

#### `getConfig`

- **类型**：数据处理
- **说明**：获取：配置（操作关系数据库）
- **签名**：`getConfig(): Promise<WriterAgentConfigRecord \| null>`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:597
- **引用次数**：69

#### `parseBlocks`

- **类型**：数据处理
- **说明**：解析：blocks（反序列化）
- **签名**：`parseBlocks(raw: string): Block[]`
- **位置**：brian-backend/Agent/WriterAgent/application/WriterAgentService.ts:613
- **引用次数**：2

## 文件 `brian-backend/Agent/WriterAgent/domain/services/WriterDomainService.ts`

### 模块级函数

#### `isErrorAgentResult`

- **类型**：逻辑控制
- **说明**：判断校验：错误 / Agent / result
- **签名**：`isErrorAgentResult(r: WriterAgentResult): boolean`
- **位置**：brian-backend/Agent/WriterAgent/domain/services/WriterDomainService.ts:24
- **引用次数**：3

#### `formatAgentResult`

- **类型**：逻辑控制
- **说明**：格式化/序列化：Agent / result
- **签名**：`formatAgentResult(r: WriterAgentResult): string`
- **位置**：brian-backend/Agent/WriterAgent/domain/services/WriterDomainService.ts:29
- **引用次数**：5

#### `buildWriterResultsContext`

- **类型**：通用算法
- **说明**：构建/初始化：写作 / results / 上下文（纯计算，无外部 IO）
- **签名**：`buildWriterResultsContext(agentResults: WriterAgentResult[]): WriterResultsContext`
- **位置**：brian-backend/Agent/WriterAgent/domain/services/WriterDomainService.ts:35
- **引用次数**：3

#### `cleanFallbackResults`

- **类型**：通用算法
- **说明**：删除/清理：fallback / results（纯计算，无外部 IO）
- **签名**：`cleanFallbackResults(results: string): string`
- **位置**：brian-backend/Agent/WriterAgent/domain/services/WriterDomainService.ts:44
- **引用次数**：3

## 文件 `brian-backend/Agent/WriterAgent/infrastructure/WriterAgentSchemaInitializer.ts`

### WriterAgentSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): Promise<void>`
- **位置**：brian-backend/Agent/WriterAgent/infrastructure/WriterAgentSchemaInitializer.ts:8
- **引用次数**：99

