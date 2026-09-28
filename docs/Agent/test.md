# Agent / test

- 层：**Agent**　模块：**test**
- 方法数：**21**（逻辑控制 5 · 数据处理 10 · 通用算法 6）

## 文件 `brian-backend/Agent/test/agent-context.test.ts`

### 模块级函数

#### `makeDefaultConfig`

- **类型**：数据处理
- **说明**：构建/初始化：default / 配置
- **签名**：`makeDefaultConfig(overrides: Partial<MockConfigRow>): MockConfigRow`
- **位置**：brian-backend/Agent/test/agent-context.test.ts:28
- **引用次数**：4

#### `createMockRelationDb`

- **类型**：数据处理
- **说明**：写入/新增：mock / 关系 / db（操作关系数据库）
- **签名**：`createMockRelationDb()`
- **位置**：brian-backend/Agent/test/agent-context.test.ts:37
- **引用次数**：8

#### `createMockInfoCore`

- **类型**：逻辑控制
- **说明**：写入/新增：mock / 信息 / core
- **签名**：`createMockInfoCore(triples: { source_ids_map?: Record<string, string[]>; content_map?: Record<string, string>; attribute_map?: Record<string, Record<string, unknown>>; })`
- **位置**：brian-backend/Agent/test/agent-context.test.ts:80
- **引用次数**：6

#### `createAccess`

- **类型**：数据处理
- **说明**：写入/新增：access（操作关系数据库）
- **签名**：`createAccess(relationDb: unknown, infoCore: unknown)`
- **位置**：brian-backend/Agent/test/agent-context.test.ts:97
- **引用次数**：9

## 文件 `brian-backend/Agent/test/agent-library-binding.test.ts`

### 模块级函数

#### `makeAgent`

- **类型**：通用算法
- **说明**：构建/初始化：Agent（纯计算，无外部 IO）
- **签名**：`makeAgent(): Promise<string>`
- **位置**：brian-backend/Agent/test/agent-library-binding.test.ts:24
- **引用次数**：3

#### `getRecord`

- **类型**：通用算法
- **说明**：获取：record（纯计算，无外部 IO）
- **签名**：`getRecord(agentId: string)`
- **位置**：brian-backend/Agent/test/agent-library-binding.test.ts:33
- **引用次数**：4

## 文件 `brian-backend/Agent/test/agent-library.test.ts`

### 模块级函数

#### `aid`

- **类型**：通用算法
- **说明**：处理 aid（纯计算，无外部 IO）
- **签名**：`aid()`
- **位置**：brian-backend/Agent/test/agent-library.test.ts:28
- **引用次数**：27

#### `seed`

- **类型**：逻辑控制
- **说明**：处理 seed（异步编排）
- **签名**：`seed(agentId: string, purpose: string, signature: string)`
- **位置**：brian-backend/Agent/test/agent-library.test.ts:312
- **引用次数**：33

## 文件 `brian-backend/Agent/test/agent-strategy.test.ts`

### 模块级函数

#### `ruleJson`

- **类型**：数据处理
- **说明**：处理 rule / JSON（序列化输出）
- **签名**：`ruleJson()`
- **位置**：brian-backend/Agent/test/agent-strategy.test.ts:12
- **引用次数**：11

#### `uid`

- **类型**：通用算法
- **说明**：处理 uid（纯计算，无外部 IO）
- **签名**：`uid()`
- **位置**：brian-backend/Agent/test/agent-strategy.test.ts:13
- **引用次数**：7

## 文件 `brian-backend/Agent/test/evolutor-agent.test.ts`

### 模块级函数

#### `aid`

- **类型**：通用算法
- **说明**：处理 aid（纯计算，无外部 IO）
- **签名**：`aid()`
- **位置**：brian-backend/Agent/test/evolutor-agent.test.ts:48
- **引用次数**：27

#### `addTestAgent`

- **类型**：逻辑控制
- **说明**：写入/新增：test / Agent（异步编排）
- **签名**：`addTestAgent(id: string)`
- **位置**：brian-backend/Agent/test/evolutor-agent.test.ts:50
- **引用次数**：7

## 文件 `brian-backend/Agent/test/intent-agent.test.ts`

### 模块级函数

#### `makeMocks`

- **类型**：数据处理
- **说明**：构建/初始化：mocks（操作关系数据库，序列化输出）
- **签名**：`makeMocks()`
- **位置**：brian-backend/Agent/test/intent-agent.test.ts:8
- **引用次数**：9

#### `makeService`

- **类型**：数据处理
- **说明**：构建/初始化：Service（操作关系数据库）
- **签名**：`makeService(mocks: ReturnType<typeof makeMocks>)`
- **位置**：brian-backend/Agent/test/intent-agent.test.ts:57
- **引用次数**：6

## 文件 `brian-backend/Agent/test/summary-agent.test.ts`

### 模块级函数

#### `makeMocks`

- **类型**：数据处理
- **说明**：构建/初始化：mocks
- **签名**：`makeMocks()`
- **位置**：brian-backend/Agent/test/summary-agent.test.ts:8
- **引用次数**：9

#### `makeService`

- **类型**：逻辑控制
- **说明**：构建/初始化：Service
- **签名**：`makeService(mocks: ReturnType<typeof makeMocks>)`
- **位置**：brian-backend/Agent/test/summary-agent.test.ts:45
- **引用次数**：6

## 文件 `brian-backend/Agent/test/test-helpers.ts`

### 模块级函数

#### `createTestDb`

- **类型**：数据处理
- **说明**：写入/新增：test / db（操作关系数据库）
- **签名**：`createTestDb(): Promise<RelationDBAccess>`
- **位置**：brian-backend/Agent/test/test-helpers.ts:6
- **引用次数**：17

#### `setupAgentTestMocks`

- **类型**：逻辑控制
- **说明**：更新：Agent / test / mocks（异步编排）
- **签名**：`setupAgentTestMocks()`
- **位置**：brian-backend/Agent/test/test-helpers.ts:13
- **引用次数**：16

#### `initAgentSchema`

- **类型**：数据处理
- **说明**：构建/初始化：Agent / 表结构（操作关系数据库，序列化输出）
- **签名**：`initAgentSchema(db: RelationDBAccess): void`
- **位置**：brian-backend/Agent/test/test-helpers.ts:19
- **引用次数**：2

#### `makeAccess`

- **类型**：数据处理
- **说明**：构建/初始化：access
- **签名**：`makeAccess(obj: any)`
- **位置**：brian-backend/Agent/test/test-helpers.ts:137
- **引用次数**：21

## 文件 `brian-backend/Agent/test/writer-agent.test.ts`

### 模块级函数

#### `sid`

- **类型**：通用算法
- **说明**：处理 sid（纯计算，无外部 IO）
- **签名**：`sid()`
- **位置**：brian-backend/Agent/test/writer-agent.test.ts:36
- **引用次数**：75

