# Agent / IntentAgent

- 层：**Agent**　模块：**IntentAgent**
- 方法数：**10**（逻辑控制 3 · 数据处理 4 · 通用算法 3）

## 文件 `brian-backend/Agent/IntentAgent/access/IntentAgentAccess.ts`

### IntentAgentAccess

#### `ensureBuiltin`

- **类型**：逻辑控制
- **说明**：确保就绪：builtin（返回成功与否，接入层转发至 Service）
- **签名**：`ensureBuiltin(ctx: IntentAgentContext): Promise<boolean>`
- **位置**：brian-backend/Agent/IntentAgent/access/IntentAgentAccess.ts:33
- **引用次数**：14

#### `understandRequirement`

- **类型**：逻辑控制
- **说明**：处理 understand / requirement（返回成功与否，接入层转发至 Service）
- **签名**：`understandRequirement(i: UnderstandRequirementInput, o: UnderstandRequirementOutput, c: IntentAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/IntentAgent/access/IntentAgentAccess.ts:37
- **引用次数**：8

## 文件 `brian-backend/Agent/IntentAgent/application/IntentAgentService.ts`

### IntentAgentService

#### `ensureBuiltin`

- **类型**：数据处理
- **说明**：确保就绪：builtin
- **签名**：`ensureBuiltin(_ctx: IntentAgentContext): Promise<boolean>`
- **位置**：brian-backend/Agent/IntentAgent/application/IntentAgentService.ts:45
- **引用次数**：14

#### `understandRequirement`

- **类型**：数据处理
- **说明**：处理 understand / requirement
- **签名**：`understandRequirement(input: UnderstandRequirementInput, output: UnderstandRequirementOutput, _ctx: IntentAgentContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/IntentAgent/application/IntentAgentService.ts:73
- **引用次数**：8

### IntentAgentService（私有）

#### `ensureBuiltinSoul`

- **类型**：逻辑控制
- **说明**：确保就绪：builtin / 人设（异步编排）
- **签名**：`ensureBuiltinSoul(): Promise<string>`
- **位置**：brian-backend/Agent/IntentAgent/application/IntentAgentService.ts:145
- **引用次数**：4

#### `getMatchThresholdConfig`

- **类型**：数据处理
- **说明**：获取：match / threshold / 配置（操作关系数据库）
- **签名**：`getMatchThresholdConfig(metrics?: Metrics): Promise<number>`
- **位置**：brian-backend/Agent/IntentAgent/application/IntentAgentService.ts:169
- **引用次数**：3

#### `fetchRecentHistory`

- **类型**：通用算法
- **说明**：获取：recent / 历史（纯计算，无外部 IO）
- **签名**：`fetchRecentHistory(sessionId: string): Promise<string>`
- **位置**：brian-backend/Agent/IntentAgent/application/IntentAgentService.ts:188
- **引用次数**：2

#### `fetchPinnedInfo`

- **类型**：数据处理
- **说明**：获取：pinned / 信息
- **签名**：`fetchPinnedInfo(sessionId: string, workId?: string): Promise<string>`
- **位置**：brian-backend/Agent/IntentAgent/application/IntentAgentService.ts:206
- **引用次数**：2

#### `fetchCitingMessages`

- **类型**：通用算法
- **说明**：获取：citing / messages（纯计算，无外部 IO）
- **签名**：`fetchCitingMessages(sessionId: string, citingIds: string[], selectedIds: string[]): Promise<string>`
- **位置**：brian-backend/Agent/IntentAgent/application/IntentAgentService.ts:225
- **引用次数**：2

#### `soIntentPromptTemplateId`

- **类型**：通用算法
- **说明**：查询：意图 / 提示词 / template / 标识（纯计算，无外部 IO）
- **签名**：`soIntentPromptTemplateId(metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/IntentAgent/application/IntentAgentService.ts:251
- **引用次数**：3

