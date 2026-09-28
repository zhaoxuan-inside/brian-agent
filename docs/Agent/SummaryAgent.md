# Agent / SummaryAgent

- 层：**Agent**　模块：**SummaryAgent**
- 方法数：**10**（逻辑控制 6 · 数据处理 1 · 通用算法 3）

## 文件 `brian-backend/Agent/SummaryAgent/access/SummaryAgentAccess.ts`

### SummaryAgentAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Agent/SummaryAgent/access/SummaryAgentAccess.ts:38
- **引用次数**：272

#### `ensureBuiltin`

- **类型**：逻辑控制
- **说明**：确保就绪：builtin（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`ensureBuiltin(ctx: SummaryAgentContext): Promise<boolean>`
- **位置**：brian-backend/Agent/SummaryAgent/access/SummaryAgentAccess.ts:42
- **引用次数**：14

#### `generateSummary`

- **类型**：逻辑控制
- **说明**：构建/初始化：摘要（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`generateSummary(i: GenerateSummaryInput, o: GenerateSummaryOutput, c: SummaryAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/SummaryAgent/access/SummaryAgentAccess.ts:47
- **引用次数**：8

## 文件 `brian-backend/Agent/SummaryAgent/application/SummaryAgentService.ts`

### SummaryAgentService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（含异常兜底，异步编排）
- **签名**：`initialize(_ctx: SummaryAgentContext): Promise<void>`
- **位置**：brian-backend/Agent/SummaryAgent/application/SummaryAgentService.ts:36
- **引用次数**：272

#### `ensureBuiltin`

- **类型**：数据处理
- **说明**：确保就绪：builtin
- **签名**：`ensureBuiltin(_ctx: SummaryAgentContext): Promise<boolean>`
- **位置**：brian-backend/Agent/SummaryAgent/application/SummaryAgentService.ts:44
- **引用次数**：14

#### `generateSummary`

- **类型**：通用算法
- **说明**：构建/初始化：摘要（纯计算，无外部 IO）
- **签名**：`generateSummary(input: GenerateSummaryInput, output: GenerateSummaryOutput, _ctx: SummaryAgentContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/SummaryAgent/application/SummaryAgentService.ts:72
- **引用次数**：8

### SummaryAgentService（私有）

#### `ensureBuiltinSoul`

- **类型**：逻辑控制
- **说明**：确保就绪：builtin / 人设（异步编排）
- **签名**：`ensureBuiltinSoul(): Promise<string>`
- **位置**：brian-backend/Agent/SummaryAgent/application/SummaryAgentService.ts:101
- **引用次数**：4

#### `generateByLLM`

- **类型**：通用算法
- **说明**：构建/初始化：大模型（纯计算，无外部 IO）
- **签名**：`generateByLLM(info: string, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/SummaryAgent/application/SummaryAgentService.ts:125
- **引用次数**：3

#### `soSummaryPromptTemplateId`

- **类型**：通用算法
- **说明**：查询：摘要 / 提示词 / template / 标识（纯计算，无外部 IO）
- **签名**：`soSummaryPromptTemplateId(metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/SummaryAgent/application/SummaryAgentService.ts:191
- **引用次数**：3

#### `resolveLlm`

- **类型**：逻辑控制
- **说明**：获取：大模型
- **签名**：`resolveLlm(agentId: string): Promise<string>`
- **位置**：brian-backend/Agent/SummaryAgent/application/SummaryAgentService.ts:215
- **引用次数**：8

