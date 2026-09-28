# Agent / AgentContext

- 层：**Agent**　模块：**AgentContext**
- 方法数：**7**（逻辑控制 4 · 数据处理 3 · 通用算法 0）

## 文件 `brian-backend/Agent/AgentContext/access/AgentContextAccess.ts`

### AgentContextAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Agent/AgentContext/access/AgentContextAccess.ts:27
- **引用次数**：272

#### `soContextDetail`

- **类型**：逻辑控制
- **说明**：查询：上下文 / detail（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soContextDetail(i: GetContextDetailInput, o: GetContextDetailOutput, c: AgentContextContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentContext/access/AgentContextAccess.ts:29
- **引用次数**：9

#### `configAgentContext`

- **类型**：逻辑控制
- **说明**：处理 配置 / Agent / 上下文（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`configAgentContext(i: ConfigAgentContextInput, o: ConfigAgentContextOutput, c: AgentContextContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentContext/access/AgentContextAccess.ts:35
- **引用次数**：10

## 文件 `brian-backend/Agent/AgentContext/application/AgentContextService.ts`

### AgentContextService

#### `soContextDetail`

- **类型**：逻辑控制
- **说明**：查询：上下文 / detail（返回成功与否，异步编排）
- **签名**：`soContextDetail(input: GetContextDetailInput, output: GetContextDetailOutput, _ctx: AgentContextContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentContext/application/AgentContextService.ts:27
- **引用次数**：9

#### `configAgentContext`

- **类型**：数据处理
- **说明**：处理 配置 / Agent / 上下文（操作关系数据库）
- **签名**：`configAgentContext(input: ConfigAgentContextInput, output: ConfigAgentContextOutput, _ctx: AgentContextContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentContext/application/AgentContextService.ts:44
- **引用次数**：10

### AgentContextService（私有）

#### `getConfigInternal`

- **类型**：数据处理
- **说明**：获取：配置 / internal（操作关系数据库）
- **签名**：`getConfigInternal(): Promise<AgentContextConfigRecord \| null>`
- **位置**：brian-backend/Agent/AgentContext/application/AgentContextService.ts:98
- **引用次数**：4

## 文件 `brian-backend/Agent/AgentContext/infrastructure/AgentContextSchemaInitializer.ts`

### AgentContextSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): Promise<void>`
- **位置**：brian-backend/Agent/AgentContext/infrastructure/AgentContextSchemaInitializer.ts:12
- **引用次数**：99

