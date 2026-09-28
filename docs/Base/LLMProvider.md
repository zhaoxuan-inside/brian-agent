# Base / LLMProvider

- 层：**Base**　模块：**LLMProvider**
- 方法数：**122**（逻辑控制 54 · 数据处理 43 · 通用算法 25）

## 文件 `brian-backend/Base/LLMProvider/access/LLMAccess.ts`

### LLMAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:63
- **引用次数**：272

#### `addLLMProvider`

- **类型**：逻辑控制
- **说明**：写入/新增：大模型 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`addLLMProvider(input: AddLLMProviderInput, output: AddLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:72
- **引用次数**：46

#### `updateLLMProvider`

- **类型**：逻辑控制
- **说明**：更新：大模型 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`updateLLMProvider(input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:78
- **引用次数**：18

#### `delLLMProvider`

- **类型**：逻辑控制
- **说明**：删除/清理：大模型 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`delLLMProvider(input: DelLLMProviderInput, output: DelLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:84
- **引用次数**：17

#### `soLLMProvider`

- **类型**：逻辑控制
- **说明**：查询：大模型 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`soLLMProvider(input: SoLLMProviderInput, output: SoLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:90
- **引用次数**：35

#### `testLLMProvider`

- **类型**：逻辑控制
- **说明**：判断校验：大模型 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`testLLMProvider(input: TestLLMProviderInput, output: TestLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:96
- **引用次数**：16

#### `listLLM`

- **类型**：逻辑控制
- **说明**：查询：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`listLLM(input: ListLLMInput, output: ListLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:102
- **引用次数**：21

#### `addLLM`

- **类型**：逻辑控制
- **说明**：写入/新增：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`addLLM(input: AddLLMInput, output: AddLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:112
- **引用次数**：25

#### `delLLM`

- **类型**：逻辑控制
- **说明**：删除/清理：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`delLLM(input: DelLLMInput, output: DelLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:118
- **引用次数**：14

#### `updateLLM`

- **类型**：逻辑控制
- **说明**：更新：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`updateLLM(input: UpdateLLMInput, output: UpdateLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:124
- **引用次数**：20

#### `soLLM`

- **类型**：逻辑控制
- **说明**：查询：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`soLLM(input: SoLLMInput, output: SoLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:130
- **引用次数**：28

#### `soLLMById`

- **类型**：逻辑控制
- **说明**：查询：大模型 / 标识（返回成功与否，异步编排）
- **签名**：`soLLMById(input: GetLLMInput, output: GetLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:136
- **引用次数**：15

#### `execLLM`

- **类型**：逻辑控制
- **说明**：处理执行：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`execLLM(input: ExecLLMInput, output: ExecLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:154
- **引用次数**：78

#### `execLLMEvents`

- **类型**：逻辑控制
- **说明**：处理执行：大模型 / events（返回成功与否，接入层转发至 Service）
- **签名**：`execLLMEvents(input: ExecLLMEventsInput, output: ExecLLMEventsOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:160
- **引用次数**：22

#### `embedLLM`

- **类型**：逻辑控制
- **说明**：处理 embed / 大模型（返回成功与否，接入层转发至 Service）
- **签名**：`embedLLM(input: EmbedLLMInput, output: EmbedLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:166
- **引用次数**：26

#### `genLLMAttr`

- **类型**：逻辑控制
- **说明**：处理 gen / 大模型 / attr（返回成功与否，接入层转发至 Service）
- **签名**：`genLLMAttr(input: GenLLMAttrInput, output: GenLLMAttrOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:172
- **引用次数**：6

#### `visualizedLLM`

- **类型**：逻辑控制
- **说明**：处理 visualized / 大模型（返回成功与否，接入层转发至 Service）
- **签名**：`visualizedLLM(input: VisualizedLLMInput, output: VisualizedLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:178
- **引用次数**：12

#### `enableLLM`

- **类型**：逻辑控制
- **说明**：界面控制：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`enableLLM(input: EnableLLMInput, output: EnableLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:184
- **引用次数**：15

#### `soTokenUsage`

- **类型**：逻辑控制
- **说明**：查询：Token / 用量（返回成功与否，接入层转发至 Service）
- **签名**：`soTokenUsage(input: SoTokenUsageInput, output: SoTokenUsageOutput, context: LLMContext): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/access/LLMAccess.ts:190
- **引用次数**：3

## 文件 `brian-backend/Base/LLMProvider/application/llmevents/LLMEventsParser.ts`

### LLMEventsParser

#### `parseChunk`

- **类型**：通用算法
- **说明**：解析：文本块（纯计算，无外部 IO）
- **签名**：`parseChunk(chunk: unknown): LLMEvent[]`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsParser.ts:63
- **引用次数**：13

#### `buildFinishEvent`

- **类型**：逻辑控制
- **说明**：构建/初始化：finish / 事件
- **签名**：`buildFinishEvent(chunk: unknown, finishReason?: 'tool-calls' \| 'stop' \| 'aborted' \| 'error'): LLMEvent`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsParser.ts:81
- **引用次数**：8

### LLMEventsParser（私有）

#### `handleDelta`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / delta
- **签名**：`handleDelta(delta: NonNullable<NonNullable<ChatChunkShape['choices']>[number]['delta']>, events: LLMEvent[]): void`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsParser.ts:98
- **引用次数**：2

#### `handleToolCallDeltas`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / 工具 / call / deltas（遍历调度）
- **签名**：`handleToolCallDeltas(deltas: Array<{ index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string }; }>, events: LLMEvent[]): void`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsParser.ts:117
- **引用次数**：2

#### `ensureAccumulator`

- **类型**：数据处理
- **说明**：确保就绪：accumulator
- **签名**：`ensureAccumulator(index: number, id?: string, toolId?: string): ToolCallAccumulator`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsParser.ts:144
- **引用次数**：2

#### `mapFinishReason`

- **类型**：逻辑控制
- **说明**：转换归并：finish / reason
- **签名**：`mapFinishReason(reason?: string \| null): 'tool-calls' \| 'stop'`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsParser.ts:167
- **引用次数**：2

#### `buildUsage`

- **类型**：通用算法
- **说明**：构建/初始化：用量（纯计算，无外部 IO）
- **签名**：`buildUsage(usage: { prompt_tokens?: number; completion_tokens?: number } \| null \| undefined): TokenUsage`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsParser.ts:176
- **引用次数**：2

## 文件 `brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts`

### LLMEventsRunner（私有）

#### `resolveLocalAbortReason`

- **类型**：逻辑控制
- **说明**：获取：local / abort / reason
- **签名**：`resolveLocalAbortReason(): AbortReasonKind`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts:66
- **引用次数**：2

### LLMEventsRunner

#### `run`

- **类型**：逻辑控制
- **说明**：处理执行相关数据（异步编排）
- **签名**：`run(): Promise<LLMEventsRunResult>`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts:73
- **引用次数**：197

### LLMEventsRunner（私有）

#### `setupAbortWiring`

- **类型**：逻辑控制
- **说明**：更新：abort / wiring
- **签名**：`setupAbortWiring(): () => void`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts:87
- **引用次数**：2

#### `abortLocal`

- **类型**：逻辑控制
- **说明**：删除/清理：local
- **签名**：`abortLocal(reason: AbortReasonKind): void`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts:110
- **引用次数**：3

#### `resolveExternalReason`

- **类型**：逻辑控制
- **说明**：获取：external / reason
- **签名**：`resolveExternalReason(signal?: AbortSignal): AbortReasonKind`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts:116
- **引用次数**：4

#### `launchRequest`

- **类型**：数据处理
- **说明**：启动：request（网络请求）
- **签名**：`launchRequest(): Promise<Response>`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts:124
- **引用次数**：2

#### `readLoop`

- **类型**：通用算法
- **说明**：获取：loop（纯计算，无外部 IO）
- **签名**：`readLoop(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<LLMEventsRunResult>`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts:146
- **引用次数**：2

#### `dispatchLines`

- **类型**：数据处理
- **说明**：处理执行：lines（反序列化）
- **签名**：`dispatchLines(lines: string[], lastFrame: unknown): unknown`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts:172
- **引用次数**：3

#### `emitToSubscriber`

- **类型**：逻辑控制
- **说明**：发送通知：订阅者
- **签名**：`emitToSubscriber(event: LLMEvent): void`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts:197
- **引用次数**：3

#### `buildResult`

- **类型**：逻辑控制
- **说明**：构建/初始化：result
- **签名**：`buildResult(lastFrame: unknown, finishReason: 'tool-calls' \| 'stop' \| 'aborted' \| 'error' \| undefined): LLMEventsRunResult`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts:202
- **引用次数**：2

#### `toAbortOrConnectError`

- **类型**：通用算法
- **说明**：格式化/序列化：abort / connect / 错误（纯计算，无外部 IO）
- **签名**：`toAbortOrConnectError(err: unknown): ProviderError`
- **位置**：brian-backend/Base/LLMProvider/application/llmevents/LLMEventsRunner.ts:224
- **引用次数**：3

## 文件 `brian-backend/Base/LLMProvider/application/LLMService.ts`

### LLMService

#### `initialize`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（向量库）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:82
- **引用次数**：272

### LLMService（私有）

#### `ensureEnabled`

- **类型**：逻辑控制
- **说明**：确保就绪：enabled
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:91
- **引用次数**：118

#### `buildEndpoint`

- **类型**：通用算法
- **说明**：构建/初始化：端点（纯计算，无外部 IO）
- **签名**：`buildEndpoint(baseUrl: string, apiPath: string): string`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:102
- **引用次数**：10

#### `upsertUsage`

- **类型**：数据处理
- **说明**：处理 upsert / 用量（操作关系数据库）
- **签名**：`upsertUsage(llmEnableId: string, inputTokens: unknown, outputTokens: unknown): Promise<void>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:106
- **引用次数**：8

#### `logCall`

- **类型**：数据处理
- **说明**：写入/新增：call（操作关系数据库）
- **签名**：`logCall(args: { llmId: string; session_id?: string; run_id?: string; work_id?: string; caller?: string; input_tokens?: number; output_tokens?: number; duration_ms?: number; status?: string; error_code?: string; }): Promise<void>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:144
- **引用次数**：10

#### `applyDims`

- **类型**：逻辑控制
- **说明**：更新：dims
- **签名**：`applyDims(input: { session_id?: string; run_id?: string; work_id?: string; caller?: string }, context?: Context): void`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:180
- **引用次数**：4

### LLMService

#### `soTokenUsage`

- **类型**：数据处理
- **说明**：查询：Token / 用量（操作关系数据库）
- **签名**：`soTokenUsage(input: SoTokenUsageInput, output: SoTokenUsageOutput, _context: LLMContext): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:190
- **引用次数**：3

#### `addLLMProvider`

- **类型**：数据处理
- **说明**：写入/新增：大模型 / Provider（操作关系数据库）
- **签名**：`addLLMProvider(input: AddLLMProviderInput, output: AddLLMProviderOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:220
- **引用次数**：46

#### `updateLLMProvider`

- **类型**：数据处理
- **说明**：更新：大模型 / Provider（操作关系数据库）
- **签名**：`updateLLMProvider(input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:266
- **引用次数**：18

#### `delLLMProvider`

- **类型**：数据处理
- **说明**：删除/清理：大模型 / Provider（操作关系数据库）
- **签名**：`delLLMProvider(input: DelLLMProviderInput, output: DelLLMProviderOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:324
- **引用次数**：17

#### `soLLMProvider`

- **类型**：数据处理
- **说明**：查询：大模型 / Provider（操作关系数据库）
- **签名**：`soLLMProvider(input: SoLLMProviderInput, output: SoLLMProviderOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:376
- **引用次数**：35

#### `testLLMProvider`

- **类型**：数据处理
- **说明**：判断校验：大模型 / Provider（操作关系数据库，网络请求）
- **签名**：`testLLMProvider(input: TestLLMProviderInput, output: TestLLMProviderOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:407
- **引用次数**：16

#### `listLLM`

- **类型**：数据处理
- **说明**：查询：大模型
- **签名**：`listLLM(input: ListLLMInput, output: ListLLMOutput, _context: LLMContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:450
- **引用次数**：21

### LLMService（私有）

#### `soProviderRow`

- **类型**：数据处理
- **说明**：查询：Provider / row（操作关系数据库）
- **签名**：`soProviderRow(providerId: string): Promise<LLMProviderRecord>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:474
- **引用次数**：2

#### `soCachedModels`

- **类型**：数据处理
- **说明**：查询：cached / models（操作关系数据库）
- **签名**：`soCachedModels(providerId: string, output: ListLLMOutput): Promise<void>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:484
- **引用次数**：3

#### `fetchRemoteModels`

- **类型**：数据处理
- **说明**：获取：remote / models（网络请求，反序列化）
- **签名**：`fetchRemoteModels(provider: LLMProviderRecord, output: ListLLMOutput): Promise<Array<{ modelId: string; displayName?: string; description?: string; maxTokens?: number; raw: Record<string, unknown> }> \| null>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:494
- **引用次数**：2

#### `syncModelCache`

- **类型**：数据处理
- **说明**：处理 模型 / 缓存（操作关系数据库）
- **签名**：`syncModelCache(providerId: string, parsedModels: Array<{ modelId: string; displayName?: string; description?: string; maxTokens?: number; raw: Record<string, unknown> }>, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:531
- **引用次数**：2

#### `upsertModelCacheRow`

- **类型**：数据处理
- **说明**：处理 upsert / 模型 / 缓存 / row（操作关系数据库）
- **签名**：`upsertModelCacheRow(providerId: string, m: { modelId: string; displayName?: string; description?: string; maxTokens?: number; raw: Record<string, unknown> }, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:550
- **引用次数**：2

#### `updateModelsCacheTimestamp`

- **类型**：数据处理
- **说明**：更新：models / 缓存 / timestamp（操作关系数据库）
- **签名**：`updateModelsCacheTimestamp(providerId: string): Promise<void>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:582
- **引用次数**：2

### LLMService

#### `addLLM`

- **类型**：数据处理
- **说明**：写入/新增：大模型（操作关系数据库）
- **签名**：`addLLM(input: AddLLMInput, output: AddLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:590
- **引用次数**：25

#### `delLLM`

- **类型**：数据处理
- **说明**：删除/清理：大模型（操作关系数据库）
- **签名**：`delLLM(input: DelLLMInput, output: DelLLMOutput, _context: LLMContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:621
- **引用次数**：14

#### `updateLLM`

- **类型**：数据处理
- **说明**：更新：大模型（操作关系数据库）
- **签名**：`updateLLM(input: UpdateLLMInput, output: UpdateLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:709
- **引用次数**：20

#### `soLLM`

- **类型**：数据处理
- **说明**：查询：大模型（操作关系数据库）
- **签名**：`soLLM(input: SoLLMInput, output: SoLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:746
- **引用次数**：28

### LLMService（私有）

#### `recordLLMCallMetrics`

- **类型**：逻辑控制
- **说明**：写入/新增：大模型 / call / 指标（含异常兜底）
- **签名**：`recordLLMCallMetrics(metrics?: Metrics, usage?: { llm_id?: string; attempt?: number; input_tokens: number; output_tokens: number; duration_ms: number; }): void`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:777
- **引用次数**：3

### LLMService

#### `execLLM`

- **类型**：逻辑控制
- **说明**：处理执行：大模型（返回成功与否，遍历调度，异步编排）
- **签名**：`execLLM(input: ExecLLMInput, output: ExecLLMOutput, context: LLMContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:808
- **引用次数**：78

#### `execLLMEvents`

- **类型**：逻辑控制
- **说明**：处理执行：大模型 / events（返回成功与否，遍历调度，异步编排）
- **签名**：`execLLMEvents(input: ExecLLMEventsInput, output: ExecLLMEventsOutput, context: LLMContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:889
- **引用次数**：22

### LLMService（私有）

#### `validateEventsInput`

- **类型**：逻辑控制
- **说明**：判断校验：events / 输入
- **签名**：`validateEventsInput(input: ExecLLMEventsInput): void`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:934
- **引用次数**：2

#### `executeEventsSingle`

- **类型**：数据处理
- **说明**：处理执行：events / single
- **签名**：`executeEventsSingle(llmId: string, input: ExecLLMEventsInput, signal?: AbortSignal): Promise<EventsSingleResult>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:945
- **引用次数**：3

#### `buildEventsRequest`

- **类型**：数据处理
- **说明**：构建/初始化：events / request（操作关系数据库，向量库）
- **签名**：`buildEventsRequest(llmId: string, input: ExecLLMEventsInput): Promise<{ url: string; method: string; headers: Record<string, string>; body?: string }>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1013
- **引用次数**：2

#### `fillEventsOutput`

- **类型**：逻辑控制
- **说明**：处理 fill / events / 输出
- **签名**：`fillEventsOutput(output: ExecLLMEventsOutput, single: EventsSingleResult, startTime: number, input?: ExecLLMEventsInput): void`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1041
- **引用次数**：2

#### `prepareWireMessages`

- **类型**：逻辑控制
- **说明**：构建/初始化：wire / messages
- **签名**：`prepareWireMessages(input: ExecLLMEventsInput): LLMMessage[]`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1057
- **引用次数**：2

#### `resolveCandidateModels`

- **类型**：数据处理
- **说明**：获取：candidate / models（操作关系数据库，向量库）
- **签名**：`resolveCandidateModels(specifiedId?: string, metrics?: Metrics): Promise<string[]>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1072
- **引用次数**：5

#### `executeSingleLLM`

- **类型**：逻辑控制
- **说明**：处理执行：single / 大模型（返回成功与否，异步编排）
- **签名**：`executeSingleLLM(llmId: string, input: ExecLLMInput, startTime: number, output: ExecLLMOutput): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1125
- **引用次数**：2

#### `soValidatedLLM`

- **类型**：数据处理
- **说明**：查询：validated / 大模型（操作关系数据库，向量库）
- **签名**：`soValidatedLLM(llmId: string, output: ExecLLMOutput): Promise<LLMAvailableRecord \| null>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1145
- **引用次数**：2

#### `soValidatedLLMProvider`

- **类型**：数据处理
- **说明**：查询：validated / 大模型 / Provider（操作关系数据库）
- **签名**：`soValidatedLLMProvider(llm: LLMAvailableRecord, output: ExecLLMOutput): Promise<LLMProviderRecord \| null>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1168
- **引用次数**：2

#### `executeSingleLLMStreaming`

- **类型**：逻辑控制
- **说明**：处理执行：single / 大模型 / streaming（返回成功与否，异步编排）
- **签名**：`executeSingleLLMStreaming(llmId: string, input: ExecLLMInput, startTime: number, output: ExecLLMOutput): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1186
- **引用次数**：2

#### `soSingleEventsInput`

- **类型**：逻辑控制
- **说明**：查询：single / events / 输入
- **签名**：`soSingleEventsInput(llmId: string, input: ExecLLMInput): ExecLLMEventsInput`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1208
- **引用次数**：2

#### `executeSingleLLMRequest`

- **类型**：逻辑控制
- **说明**：处理执行：single / 大模型 / request（返回成功与否，含异常兜底，异步编排）
- **签名**：`executeSingleLLMRequest(llmId: string, strategy: ILLMProviderStrategy, req: HttpRequestOptions, input: ExecLLMInput, startTime: number, output: ExecLLMOutput): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1228
- **引用次数**：2

#### `execChatHttpRequest`

- **类型**：逻辑控制
- **说明**：处理执行：chat / http / request（异步编排）
- **签名**：`execChatHttpRequest(req: HttpRequestOptions)`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1256
- **引用次数**：2

#### `fillChatResponse`

- **类型**：数据处理
- **说明**：处理 fill / chat / response（反序列化）
- **签名**：`fillChatResponse(rawText: string, strategy: ILLMProviderStrategy, prompt: string, startTime: number, output: ExecLLMOutput): void`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1269
- **引用次数**：2

#### `logChatError`

- **类型**：逻辑控制
- **说明**：写入/新增：chat / 错误（异步编排）
- **签名**：`logChatError(llmId: string, input: ExecLLMInput, output: ExecLLMOutput): Promise<void>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1291
- **引用次数**：3

#### `recordChatSuccess`

- **类型**：数据处理
- **说明**：写入/新增：chat / 成功
- **签名**：`recordChatSuccess(llmId: string, input: ExecLLMInput, output: ExecLLMOutput): Promise<void>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1298
- **引用次数**：2

### LLMService

#### `embedLLM`

- **类型**：数据处理
- **说明**：处理 embed / 大模型（操作关系数据库，向量库，网络请求）
- **签名**：`embedLLM(input: EmbedLLMInput, output: EmbedLLMOutput, context: LLMContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1314
- **引用次数**：26

#### `genLLMAttr`

- **类型**：数据处理
- **说明**：处理 gen / 大模型 / attr（操作关系数据库，反序列化）
- **签名**：`genLLMAttr(input: GenLLMAttrInput, output: GenLLMAttrOutput, _context: LLMContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1422
- **引用次数**：6

#### `visualizedLLM`

- **类型**：数据处理
- **说明**：处理 visualized / 大模型（操作关系数据库）
- **签名**：`visualizedLLM(input: VisualizedLLMInput, output: VisualizedLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1535
- **引用次数**：12

#### `enableLLM`

- **类型**：逻辑控制
- **说明**：界面控制：大模型（返回成功与否，异步编排）
- **签名**：`enableLLM(input: EnableLLMInput, _output: EnableLLMOutput, _context: LLMContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LLMProvider/application/LLMService.ts:1583
- **引用次数**：15

## 文件 `brian-backend/Base/LLMProvider/application/strategies/AnthropicStrategy.ts`

### AnthropicStrategy

#### `supports`

- **类型**：通用算法
- **说明**：处理 supports（纯计算，无外部 IO）
- **签名**：`supports(provider: LLMProviderRecord): boolean`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/AnthropicStrategy.ts:12
- **引用次数**：7

#### `buildHeaders`

- **类型**：通用算法
- **说明**：构建/初始化：headers（纯计算，无外部 IO）
- **签名**：`buildHeaders(provider: LLMProviderRecord, contentType: unknown): Record<string, string>`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/AnthropicStrategy.ts:18
- **引用次数**：12

#### `buildTestRequest`

- **类型**：逻辑控制
- **说明**：构建/初始化：test / request
- **签名**：`buildTestRequest(provider: LLMProviderRecord): HttpRequestOptions`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/AnthropicStrategy.ts:34
- **引用次数**：5

#### `buildListModelsRequest`

- **类型**：逻辑控制
- **说明**：构建/初始化：models / request
- **签名**：`buildListModelsRequest(provider: LLMProviderRecord): HttpRequestOptions`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/AnthropicStrategy.ts:42
- **引用次数**：5

#### `buildChatRequest`

- **类型**：数据处理
- **说明**：构建/初始化：chat / request（序列化输出）
- **签名**：`buildChatRequest(provider: LLMProviderRecord, model: LLMAvailableRecord, input: ExecLLMInput): HttpRequestOptions`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/AnthropicStrategy.ts:52
- **引用次数**：9

#### `parseChatResponse`

- **类型**：通用算法
- **说明**：解析：chat / response（纯计算，无外部 IO）
- **签名**：`parseChatResponse(json: unknown, rawText: string): ParsedChatResult`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/AnthropicStrategy.ts:93
- **引用次数**：13

## 文件 `brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts`

### BaseLLMStrategy

#### `supports`

- **类型**：逻辑控制
- **说明**：处理 supports
- **签名**：`supports(_provider: LLMProviderRecord): boolean`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:31
- **引用次数**：7

#### `buildEndpoint`

- **类型**：通用算法
- **说明**：构建/初始化：端点（纯计算，无外部 IO）
- **签名**：`buildEndpoint(baseUrl: string, apiPath: string): string`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:37
- **引用次数**：10

#### `buildHeaders`

- **类型**：通用算法
- **说明**：构建/初始化：headers（纯计算，无外部 IO）
- **签名**：`buildHeaders(provider: LLMProviderRecord, contentType: unknown): Record<string, string>`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:43
- **引用次数**：12

#### `buildTestRequest`

- **类型**：通用算法
- **说明**：构建/初始化：test / request（纯计算，无外部 IO）
- **签名**：`buildTestRequest(provider: LLMProviderRecord): HttpRequestOptions`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:59
- **引用次数**：5

#### `buildListModelsRequest`

- **类型**：通用算法
- **说明**：构建/初始化：models / request（纯计算，无外部 IO）
- **签名**：`buildListModelsRequest(provider: LLMProviderRecord): HttpRequestOptions`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:74
- **引用次数**：5

#### `parseListModelsResponse`

- **类型**：通用算法
- **说明**：解析：models / response（纯计算，无外部 IO）
- **签名**：`parseListModelsResponse(json: unknown, _rawText: string): ParsedModelItem[]`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:91
- **引用次数**：14

#### `buildChatRequest`

- **类型**：数据处理
- **说明**：构建/初始化：chat / request（序列化输出）
- **签名**：`buildChatRequest(provider: LLMProviderRecord, model: LLMAvailableRecord, input: ExecLLMInput): HttpRequestOptions`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:140
- **引用次数**：9

#### `parseChatResponse`

- **类型**：通用算法
- **说明**：解析：chat / response（纯计算，无外部 IO）
- **签名**：`parseChatResponse(json: unknown, _rawText: string): ParsedChatResult`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:186
- **引用次数**：13

#### `buildChatEventsRequest`

- **类型**：数据处理
- **说明**：构建/初始化：chat / events / request（序列化输出）
- **签名**：`buildChatEventsRequest(provider: LLMProviderRecord, model: LLMAvailableRecord, input: ExecLLMEventsInput): HttpRequestOptions`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:210
- **引用次数**：3

#### `prepareEventsBody`

- **类型**：通用算法
- **说明**：构建/初始化：events / body（纯计算，无外部 IO）
- **签名**：`prepareEventsBody(model: LLMAvailableRecord, input: ExecLLMEventsInput): Record<string, unknown>`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:228
- **引用次数**：2

#### `prepareEventsMessages`

- **类型**：逻辑控制
- **说明**：构建/初始化：events / messages
- **签名**：`prepareEventsMessages(input: ExecLLMEventsInput): LLMMessage[]`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:257
- **引用次数**：2

#### `prepareEventsMaxTokens`

- **类型**：逻辑控制
- **说明**：构建/初始化：events / max / tokens
- **签名**：`prepareEventsMaxTokens(model: LLMAvailableRecord, maxTokens?: number): number \| undefined`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:274
- **引用次数**：2

#### `prepareToolSpec`

- **类型**：逻辑控制
- **说明**：构建/初始化：工具 / spec
- **签名**：`prepareToolSpec(spec: LLMToolSpec): Record<string, unknown>`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:289
- **引用次数**：2

#### `buildEmbedRequest`

- **类型**：数据处理
- **说明**：构建/初始化：embed / request（向量库，序列化输出）
- **签名**：`buildEmbedRequest(provider: LLMProviderRecord, model: LLMAvailableRecord, input: EmbedLLMInput): HttpRequestOptions`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:302
- **引用次数**：3

#### `parseEmbedResponse`

- **类型**：数据处理
- **说明**：解析：embed / response（向量库）
- **签名**：`parseEmbedResponse(json: unknown, _rawText: string): ParsedEmbedResult`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/BaseLLMStrategy.ts:322
- **引用次数**：3

## 文件 `brian-backend/Base/LLMProvider/application/strategies/GoogleStrategy.ts`

### GoogleStrategy

#### `supports`

- **类型**：通用算法
- **说明**：处理 supports（纯计算，无外部 IO）
- **签名**：`supports(provider: LLMProviderRecord): boolean`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/GoogleStrategy.ts:12
- **引用次数**：7

#### `buildHeaders`

- **类型**：通用算法
- **说明**：构建/初始化：headers（纯计算，无外部 IO）
- **签名**：`buildHeaders(provider: LLMProviderRecord, contentType: unknown): Record<string, string>`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/GoogleStrategy.ts:20
- **引用次数**：12

### GoogleStrategy（私有）

#### `appendGoogleKey`

- **类型**：通用算法
- **说明**：写入/新增：google / 键（纯计算，无外部 IO）
- **签名**：`appendGoogleKey(url: string, apiKey?: string \| null): string`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/GoogleStrategy.ts:37
- **引用次数**：4

### GoogleStrategy

#### `buildTestRequest`

- **类型**：逻辑控制
- **说明**：构建/初始化：test / request
- **签名**：`buildTestRequest(provider: LLMProviderRecord): HttpRequestOptions`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/GoogleStrategy.ts:44
- **引用次数**：5

#### `buildListModelsRequest`

- **类型**：逻辑控制
- **说明**：构建/初始化：models / request
- **签名**：`buildListModelsRequest(provider: LLMProviderRecord): HttpRequestOptions`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/GoogleStrategy.ts:53
- **引用次数**：5

#### `buildChatRequest`

- **类型**：数据处理
- **说明**：构建/初始化：chat / request（序列化输出）
- **签名**：`buildChatRequest(provider: LLMProviderRecord, model: LLMAvailableRecord, input: ExecLLMInput): HttpRequestOptions`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/GoogleStrategy.ts:64
- **引用次数**：9

#### `parseChatResponse`

- **类型**：通用算法
- **说明**：解析：chat / response（纯计算，无外部 IO）
- **签名**：`parseChatResponse(json: unknown, rawText: string): ParsedChatResult`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/GoogleStrategy.ts:113
- **引用次数**：13

## 文件 `brian-backend/Base/LLMProvider/application/strategies/LLMStrategyFactory.ts`

### LLMStrategyFactory（静态）

#### `registerStrategy`

- **类型**：通用算法
- **说明**：写入/新增：strategy（纯计算，无外部 IO）
- **签名**：`registerStrategy(strategy: ILLMProviderStrategy): void`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/LLMStrategyFactory.ts:25
- **引用次数**：6

#### `soStrategyById`

- **类型**：逻辑控制
- **说明**：查询：strategy / 标识（遍历调度）
- **签名**：`soStrategyById(provider: LLMProviderRecord): ILLMProviderStrategy`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/LLMStrategyFactory.ts:36
- **引用次数**：21

## 文件 `brian-backend/Base/LLMProvider/application/strategies/OllamaStrategy.ts`

### OllamaStrategy

#### `supports`

- **类型**：通用算法
- **说明**：处理 supports（纯计算，无外部 IO）
- **签名**：`supports(provider: LLMProviderRecord): boolean`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/OllamaStrategy.ts:8
- **引用次数**：7

#### `parseListModelsResponse`

- **类型**：通用算法
- **说明**：解析：models / response（纯计算，无外部 IO）
- **签名**：`parseListModelsResponse(json: unknown, rawText: string): ParsedModelItem[]`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/OllamaStrategy.ts:14
- **引用次数**：14

## 文件 `brian-backend/Base/LLMProvider/application/strategies/VolcanoEngineStrategy.ts`

### VolcanoEngineStrategy

#### `supports`

- **类型**：通用算法
- **说明**：处理 supports（纯计算，无外部 IO）
- **签名**：`supports(provider: LLMProviderRecord): boolean`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/VolcanoEngineStrategy.ts:8
- **引用次数**：7

#### `parseListModelsResponse`

- **类型**：通用算法
- **说明**：解析：models / response（纯计算，无外部 IO）
- **签名**：`parseListModelsResponse(json: unknown, _rawText: string): ParsedModelItem[]`
- **位置**：brian-backend/Base/LLMProvider/application/strategies/VolcanoEngineStrategy.ts:21
- **引用次数**：14

## 文件 `brian-backend/Base/LLMProvider/domain/services/LLMCacheDomainService.ts`

### 模块级函数

#### `isModelsCacheFresh`

- **类型**：通用算法
- **说明**：判断校验：models / 缓存 / fresh（纯计算，无外部 IO）
- **签名**：`isModelsCacheFresh(modelsFetchedAt: number \| null \| undefined, force: boolean \| undefined, now: number, ttlMs: number): boolean`
- **位置**：brian-backend/Base/LLMProvider/domain/services/LLMCacheDomainService.ts:14
- **引用次数**：3

#### `extractRemoteErrorDetail`

- **类型**：数据处理
- **说明**：解析：remote / 错误 / detail（网络请求，反序列化）
- **签名**：`extractRemoteErrorDetail(status: number, bodyText: string): string`
- **位置**：brian-backend/Base/LLMProvider/domain/services/LLMCacheDomainService.ts:25
- **引用次数**：3

#### `toCacheInsertRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：缓存 / insert / record（序列化输出）
- **签名**：`toCacheInsertRecord(providerId: string, model: ParsedModel): DataObject[]`
- **位置**：brian-backend/Base/LLMProvider/domain/services/LLMCacheDomainService.ts:36
- **引用次数**：3

#### `toCacheUpdatePatch`

- **类型**：数据处理
- **说明**：格式化/序列化：缓存 / patch（序列化输出）
- **签名**：`toCacheUpdatePatch(model: ParsedModel): DataObject[]`
- **位置**：brian-backend/Base/LLMProvider/domain/services/LLMCacheDomainService.ts:49
- **引用次数**：3

## 文件 `brian-backend/Base/LLMProvider/infrastructure/LLMSchemaInitializer.ts`

### LLMSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/LLMProvider/infrastructure/LLMSchemaInitializer.ts:152
- **引用次数**：99

