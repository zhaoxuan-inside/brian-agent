# Base / test

- 层：**Base**　模块：**test**
- 方法数：**39**（逻辑控制 20 · 数据处理 12 · 通用算法 7）

## 文件 `brian-backend/Base/test/GraphDBProvider.test.ts`

### 模块级函数

#### `makeNode`

- **类型**：逻辑控制
- **说明**：构建/初始化：节点
- **签名**：`makeNode(node_type: string, content: Record<string, unknown>): GraphNodeData`
- **位置**：brian-backend/Base/test/GraphDBProvider.test.ts:55
- **引用次数**：66

#### `makeEdge`

- **类型**：逻辑控制
- **说明**：构建/初始化：连线
- **签名**：`makeEdge(from_node_id: string, to_node_id: string, edge_type: string, opts?: { weight?: number; properties?: Record<string, unknown> }): GraphEdgeData`
- **位置**：brian-backend/Base/test/GraphDBProvider.test.ts:59
- **引用次数**：34

#### `createGraph`

- **类型**：数据处理
- **说明**：写入/新增：图（图数据库）
- **签名**：`createGraph(): Promise<{ center: string; ring1: string[]; ring2: string[]; }>`
- **位置**：brian-backend/Base/test/GraphDBProvider.test.ts:903
- **引用次数**：7

## 文件 `brian-backend/Base/test/HttpService.test.ts`

### 模块级函数

#### `clearProxyEnv`

- **类型**：数据处理
- **说明**：删除/清理：代理 / env
- **签名**：`clearProxyEnv(): Record<string, string \| undefined>`
- **位置**：brian-backend/Base/test/HttpService.test.ts:10
- **引用次数**：2

#### `restoreProxyEnv`

- **类型**：数据处理
- **说明**：处理 restore / 代理 / env
- **签名**：`restoreProxyEnv(saved: Record<string, string \| undefined>): void`
- **位置**：brian-backend/Base/test/HttpService.test.ts:19
- **引用次数**：2

#### `startHangingServer`

- **类型**：逻辑控制
- **说明**：启动：hanging / server（异步编排）
- **签名**：`startHangingServer(): Promise<{ port: number; close: () => Promise<void> }>`
- **位置**：brian-backend/Base/test/HttpService.test.ts:26
- **引用次数**：4

## 文件 `brian-backend/Base/test/LLMEventsFailover.test.ts`

### 模块级函数

#### `makeRelationDbStub`

- **类型**：数据处理
- **说明**：构建/初始化：关系 / db / stub（操作关系数据库，网络请求）
- **签名**：`makeRelationDbStub(): RelationDBAccess`
- **位置**：brian-backend/Base/test/LLMEventsFailover.test.ts:14
- **引用次数**：4

#### `sseResponse`

- **类型**：逻辑控制
- **说明**：处理 sse / response（遍历调度）
- **签名**：`sseResponse(frames: string[], mode: 'ok' \| 'error'): Response`
- **位置**：brian-backend/Base/test/LLMEventsFailover.test.ts:35
- **引用次数**：5

#### `makeInput`

- **类型**：逻辑控制
- **说明**：构建/初始化：输入
- **签名**：`makeInput(onEvent?: ExecLLMEventsInput['on_event']): ExecLLMEventsInput`
- **位置**：brian-backend/Base/test/LLMEventsFailover.test.ts:53
- **引用次数**：4

## 文件 `brian-backend/Base/test/LLMEventsRunner.test.ts`

### 模块级函数

#### `sseStream`

- **类型**：逻辑控制
- **说明**：处理 sse / 流（遍历调度）
- **签名**：`sseStream(frames: string[]): ReadableStream<Uint8Array>`
- **位置**：brian-backend/Base/test/LLMEventsRunner.test.ts:13
- **引用次数**：3

#### `dataFrame`

- **类型**：逻辑控制
- **说明**：处理 框架
- **签名**：`dataFrame(json: string): string`
- **位置**：brian-backend/Base/test/LLMEventsRunner.test.ts:25
- **引用次数**：10

## 文件 `brian-backend/Base/test/LLMProvider.test.ts`

### 模块级函数

#### `makeProviderData`

- **类型**：通用算法
- **说明**：构建/初始化：Provider（纯计算，无外部 IO）
- **签名**：`makeProviderData(overrides?: Record<string, unknown>)`
- **位置**：brian-backend/Base/test/LLMProvider.test.ts:53
- **引用次数**：38

#### `makeLLMData`

- **类型**：通用算法
- **说明**：构建/初始化：大模型（纯计算，无外部 IO）
- **签名**：`makeLLMData(providerId: string, overrides?: Record<string, unknown>)`
- **位置**：brian-backend/Base/test/LLMProvider.test.ts:63
- **引用次数**：18

#### `startTestServer`

- **类型**：数据处理
- **说明**：启动：test / server（网络请求，序列化输出，反序列化）
- **签名**：`startTestServer(): Promise<{ server: http.Server; baseUrl: string }>`
- **位置**：brian-backend/Base/test/LLMProvider.test.ts:74
- **引用次数**：2

## 文件 `brian-backend/Base/test/LLMStrategies.test.ts`

### 模块级函数

#### `createMockProvider`

- **类型**：数据处理
- **说明**：写入/新增：mock / Provider（网络请求）
- **签名**：`createMockProvider(overrides?: Partial<LLMProviderRecord>): LLMProviderRecord`
- **位置**：brian-backend/Base/test/LLMStrategies.test.ts:13
- **引用次数**：13

#### `createMockModel`

- **类型**：数据处理
- **说明**：写入/新增：mock / 模型
- **签名**：`createMockModel(overrides?: Partial<LLMAvailableRecord>): LLMAvailableRecord`
- **位置**：brian-backend/Base/test/LLMStrategies.test.ts:27
- **引用次数**：3

## 文件 `brian-backend/Base/test/LogProvider.test.ts`

### 模块级函数

#### `makeLogData`

- **类型**：逻辑控制
- **说明**：构建/初始化：日志
- **签名**：`makeLogData(overrides?: Partial<LogData>): LogData`
- **位置**：brian-backend/Base/test/LogProvider.test.ts:42
- **引用次数**：52

#### `wait`

- **类型**：逻辑控制
- **说明**：处理 wait
- **签名**：`wait(ms: number): Promise<void>`
- **位置**：brian-backend/Base/test/LogProvider.test.ts:51
- **引用次数**：51

#### `insertRawLog`

- **类型**：数据处理
- **说明**：写入/新增：raw / 日志（操作关系数据库）
- **签名**：`insertRawLog(relationDb: RelationDBAccess, opts: { id: string; created: number; source: string; message: string; level?: string }): Promise<void>`
- **位置**：brian-backend/Base/test/LogProvider.test.ts:55
- **引用次数**：6

#### `reinitializeLogAccess`

- **类型**：逻辑控制
- **说明**：处理 reinitialize / 日志 / access（异步编排）
- **签名**：`reinitializeLogAccess(logAccess: LogAccess): Promise<void>`
- **位置**：brian-backend/Base/test/LogProvider.test.ts:69
- **引用次数**：8

#### `findLogFiles`

- **类型**：数据处理
- **说明**：查询：日志 / files（文件系统）
- **签名**：`findLogFiles(dir: string): string[]`
- **位置**：brian-backend/Base/test/LogProvider.test.ts:1507
- **引用次数**：3

## 文件 `brian-backend/Base/test/MetricsInvocation.test.ts`

### 模块级函数

#### `makeLogger`

- **类型**：逻辑控制
- **说明**：构建/初始化：logger
- **签名**：`makeLogger(): { logger: Logger; calls: LogCall[] }`
- **位置**：brian-backend/Base/test/MetricsInvocation.test.ts:13
- **引用次数**：6

### DemoService

#### `ok`

- **类型**：逻辑控制
- **说明**：处理 ok（返回成功与否）
- **签名**：`ok(input: Input, output: Output, _context: Context, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/test/MetricsInvocation.test.ts:89
- **引用次数**：421

#### `boom`

- **类型**：逻辑控制
- **说明**：处理 boom（返回成功与否）
- **签名**：`boom(_input: Input, _output: Output, _context: Context, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/test/MetricsInvocation.test.ts:94
- **引用次数**：17

#### `run`

- **类型**：逻辑控制
- **说明**：处理执行相关数据（返回成功与否）
- **签名**：`run(_input: Input, _output: Output, _context: Context, metrics?: Metrics): Promise<boolean>`
- **位置**：brian-backend/Base/test/MetricsInvocation.test.ts:124
- **引用次数**：197

### LLMService

#### `soLLM`

- **类型**：逻辑控制
- **说明**：查询：大模型（返回成功与否，异步编排）
- **签名**：`soLLM(input: Input, output: Output, _context: Context, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/test/MetricsInvocation.test.ts:145
- **引用次数**：28

### ChildService

#### `buildAgent`

- **类型**：通用算法
- **说明**：构建/初始化：Agent（纯计算，无外部 IO）
- **签名**：`buildAgent(_args: unknown[]): Promise<boolean>`
- **位置**：brian-backend/Base/test/MetricsInvocation.test.ts:170
- **引用次数**：11

### ParentService

#### `matchAgentDef`

- **类型**：逻辑控制
- **说明**：判断校验：Agent / def（返回成功与否，异步编排）
- **签名**：`matchAgentDef(args: unknown[]): Promise<boolean>`
- **位置**：brian-backend/Base/test/MetricsInvocation.test.ts:177
- **引用次数**：13

## 文件 `brian-backend/Base/test/MQProvider.test.ts`

### 模块级函数

#### `msg`

- **类型**：逻辑控制
- **说明**：处理 msg
- **签名**：`msg(queue: string, payload: unknown, priority?: number): MessageData`
- **位置**：brian-backend/Base/test/MQProvider.test.ts:36
- **引用次数**：254

#### `cleanupTempDir`

- **类型**：数据处理
- **说明**：删除/清理：目录（文件系统）
- **签名**：`cleanupTempDir(dir: string): Promise<void>`
- **位置**：brian-backend/Base/test/MQProvider.test.ts:44
- **引用次数**：2

## 文件 `brian-backend/Base/test/PromptsProvider.test.ts`

### 模块级函数

#### `makePromptData`

- **类型**：通用算法
- **说明**：构建/初始化：提示词（纯计算，无外部 IO）
- **签名**：`makePromptData(overrides?: Record<string, unknown>)`
- **位置**：brian-backend/Base/test/PromptsProvider.test.ts:38
- **引用次数**：26

## 文件 `brian-backend/Base/test/RelationDBProvider.test.ts`

### 模块级函数

#### `makeRow`

- **类型**：数据处理
- **说明**：构建/初始化：row
- **签名**：`makeRow(overrides: Record<string, unknown>): DataObject[]`
- **位置**：brian-backend/Base/test/RelationDBProvider.test.ts:56
- **引用次数**：11

#### `eq`

- **类型**：逻辑控制
- **说明**：处理 eq
- **签名**：`eq(field: string, value: unknown): Condition`
- **位置**：brian-backend/Base/test/RelationDBProvider.test.ts:73
- **引用次数**：30

#### `makeRowData`

- **类型**：数据处理
- **说明**：构建/初始化：row
- **签名**：`makeRowData(id: string, name: string): DataObject[]`
- **位置**：brian-backend/Base/test/RelationDBProvider.test.ts:1035
- **引用次数**：7

## 文件 `brian-backend/Base/test/SkillProvider.test.ts`

### 模块级函数

#### `makeSkillData`

- **类型**：通用算法
- **说明**：构建/初始化：技能（纯计算，无外部 IO）
- **签名**：`makeSkillData(overrides?: Partial<SkillData>): SkillData`
- **位置**：brian-backend/Base/test/SkillProvider.test.ts:39
- **引用次数**：34

## 文件 `brian-backend/Base/test/SoulProvider.test.ts`

### 模块级函数

#### `makeSoulData`

- **类型**：通用算法
- **说明**：构建/初始化：人设（纯计算，无外部 IO）
- **签名**：`makeSoulData(overrides?: Record<string, unknown>)`
- **位置**：brian-backend/Base/test/SoulProvider.test.ts:37
- **引用次数**：59

## 文件 `brian-backend/Base/test/StreamEvent.test.ts`

### 模块级函数

#### `makeEndpoint`

- **类型**：通用算法
- **说明**：构建/初始化：端点（纯计算，无外部 IO）
- **签名**：`makeEndpoint(sessionKey: string): Promise<string>`
- **位置**：brian-backend/Base/test/StreamEvent.test.ts:48
- **引用次数**：3

## 文件 `brian-backend/Base/test/SystemMonitor.test.ts`

### 模块级函数

#### `call`

- **类型**：逻辑控制
- **说明**：处理 call（异步编排）
- **签名**：`call(method: string, IC: new () => I, OC: new () => O, fields: Partial<I>): Promise<O>`
- **位置**：brian-backend/Base/test/SystemMonitor.test.ts:16
- **引用次数**：92

## 文件 `brian-backend/Base/test/ToolProvider.test.ts`

### 模块级函数

#### `call`

- **类型**：逻辑控制
- **说明**：处理 call（异步编排）
- **签名**：`call(method: string, IC: new () => I, OC: new () => O, fields: Partial<I>): Promise<O>`
- **位置**：brian-backend/Base/test/ToolProvider.test.ts:29
- **引用次数**：92

