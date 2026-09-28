# Application / test

- 层：**Application**　模块：**test**
- 方法数：**53**（逻辑控制 23 · 数据处理 29 · 通用算法 1）

## 文件 `brian-backend/Application/test/chat.test.ts`

### 模块级函数

#### `insertInfoRawRow`

- **类型**：数据处理
- **说明**：写入/新增：信息 / raw / row
- **签名**：`insertInfoRawRow(db: RelationDBAccess, sessionId: string, infoId: string, pinVal: number)`
- **位置**：brian-backend/Application/test/chat.test.ts:42
- **引用次数**：14

#### `insertChatConfig`

- **类型**：数据处理
- **说明**：写入/新增：chat / 配置
- **签名**：`insertChatConfig(db: RelationDBAccess, config: Record<string, unknown>)`
- **位置**：brian-backend/Application/test/chat.test.ts:67
- **引用次数**：4

#### `ensureSession`

- **类型**：数据处理
- **说明**：确保就绪：会话
- **签名**：`ensureSession(sessionId: string, title: string)`
- **位置**：brian-backend/Application/test/chat.test.ts:123
- **引用次数**：8

#### `makeRuntime`

- **类型**：逻辑控制
- **说明**：构建/初始化：runtime
- **签名**：`makeRuntime(): ChatRuntimeV2Deps`
- **位置**：brian-backend/Application/test/chat.test.ts:178
- **引用次数**：2

#### `makeV2Service`

- **类型**：逻辑控制
- **说明**：构建/初始化：v2 / Service
- **签名**：`makeV2Service(): ChatService`
- **位置**：brian-backend/Application/test/chat.test.ts:198
- **引用次数**：7

#### `makeV2Svc`

- **类型**：逻辑控制
- **说明**：构建/初始化：v2 / svc
- **签名**：`makeV2Svc(): ChatService`
- **位置**：brian-backend/Application/test/chat.test.ts:507
- **引用次数**：4

#### `makeV2Service`

- **类型**：逻辑控制
- **说明**：构建/初始化：v2 / Service
- **签名**：`makeV2Service(): ChatService`
- **位置**：brian-backend/Application/test/chat.test.ts:899
- **引用次数**：7

## 文件 `brian-backend/Application/test/config.test.ts`

### 模块级函数

#### `ctx`

- **类型**：逻辑控制
- **说明**：执行 ctx 逻辑
- **签名**：`ctx(): ConfigContext`
- **位置**：brian-backend/Application/test/config.test.ts:23
- **引用次数**：1764

## 文件 `brian-backend/Application/test/real-test-helpers.ts`

### 模块级函数

#### `resetSeq`

- **类型**：逻辑控制
- **说明**：删除/清理：seq
- **签名**：`resetSeq()`
- **位置**：brian-backend/Application/test/real-test-helpers.ts:20
- **引用次数**：3

#### `makeTempDir`

- **类型**：数据处理
- **说明**：构建/初始化：目录（文件系统）
- **签名**：`makeTempDir(): string`
- **位置**：brian-backend/Application/test/real-test-helpers.ts:24
- **引用次数**：23

#### `cleanupTempDirs`

- **类型**：数据处理
- **说明**：删除/清理：dirs（文件系统）
- **签名**：`cleanupTempDirs()`
- **位置**：brian-backend/Application/test/real-test-helpers.ts:30
- **引用次数**：11

#### `createMockLogger`

- **类型**：逻辑控制
- **说明**：写入/新增：mock / logger
- **签名**：`createMockLogger(): Logger`
- **位置**：brian-backend/Application/test/real-test-helpers.ts:37
- **引用次数**：3

#### `addColumnIfNotExists`

- **类型**：数据处理
- **说明**：写入/新增：字段 / exists（操作关系数据库）
- **签名**：`addColumnIfNotExists(relationDb: RelationDBAccess, table: string, column: string, type: string): void`
- **位置**：brian-backend/Application/test/real-test-helpers.ts:44
- **引用次数**：2

#### `seedAgentStrategies`

- **类型**：数据处理
- **说明**：处理 seed / Agent / strategies（操作关系数据库，序列化输出）
- **签名**：`seedAgentStrategies(relationDb: RelationDBAccess): void`
- **位置**：brian-backend/Application/test/real-test-helpers.ts:52
- **引用次数**：2

#### `mockExternalLLMMethods`

- **类型**：逻辑控制
- **说明**：处理 mock / external / 大模型 / methods
- **签名**：`mockExternalLLMMethods(llmAccess: LLMAccess)`
- **位置**：brian-backend/Application/test/real-test-helpers.ts:63
- **引用次数**：2

#### `mockExternalMCPMethods`

- **类型**：逻辑控制
- **说明**：处理 mock / external / MCP 通道 / methods
- **签名**：`mockExternalMCPMethods(mcpAccess: MCPAccess)`
- **位置**：brian-backend/Application/test/real-test-helpers.ts:77
- **引用次数**：2

#### `createInMemoryVectorDBAccess`

- **类型**：数据处理
- **说明**：写入/新增：记忆 / 向量 / db / access（向量库，序列化输出）
- **签名**：`createInMemoryVectorDBAccess()`
- **位置**：brian-backend/Application/test/real-test-helpers.ts:93
- **引用次数**：3

#### `setupRealTestEnvironment`

- **类型**：数据处理
- **说明**：更新：real / test / environment（操作关系数据库，向量库，图数据库）
- **签名**：`setupRealTestEnvironment(): Promise<RealTestContext>`
- **位置**：brian-backend/Application/test/real-test-helpers.ts:180
- **引用次数**：11

## 文件 `brian-backend/Application/test/self-learning.test.ts`

### 模块级函数

#### `makeTempDir`

- **类型**：数据处理
- **说明**：构建/初始化：目录（文件系统）
- **签名**：`makeTempDir(): string`
- **位置**：brian-backend/Application/test/self-learning.test.ts:103
- **引用次数**：23

#### `writeMdFile`

- **类型**：数据处理
- **说明**：写入/新增：md / 文件（文件系统）
- **签名**：`writeMdFile(dir: string, name: string, content: string): void`
- **位置**：brian-backend/Application/test/self-learning.test.ts:109
- **引用次数**：18

#### `makeCtx`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据
- **签名**：`makeCtx(): SelfLearningContext`
- **位置**：brian-backend/Application/test/self-learning.test.ts:113
- **引用次数**：114

#### `ensureInfoTables`

- **类型**：数据处理
- **说明**：确保就绪：信息 / tables（操作关系数据库）
- **签名**：`ensureInfoTables(): void`
- **位置**：brian-backend/Application/test/self-learning.test.ts:117
- **引用次数**：5

#### `seedFile`

- **类型**：数据处理
- **说明**：处理 seed / 文件
- **签名**：`seedFile(dir: string, fileId: string, name: string, content: string): Promise<string>`
- **位置**：brian-backend/Application/test/self-learning.test.ts:822
- **引用次数**：4

#### `makeFileRecord`

- **类型**：通用算法
- **说明**：构建/初始化：文件 / record（纯计算，无外部 IO）
- **签名**：`makeFileRecord(overrides?: Record<string, unknown>): Record<string, unknown>`
- **位置**：brian-backend/Application/test/self-learning.test.ts:1215
- **引用次数**：2

#### `sleep`

- **类型**：逻辑控制
- **说明**：处理 sleep
- **签名**：`sleep(ms: number)`
- **位置**：brian-backend/Application/test/self-learning.test.ts:2201
- **引用次数**：15

#### `startLearningMode`

- **类型**：逻辑控制
- **说明**：启动：learning / mode（返回成功与否）
- **签名**：`startLearningMode(mode: string): Promise<boolean>`
- **位置**：brian-backend/Application/test/self-learning.test.ts:2203
- **引用次数**：9

#### `fetchTaskRecords`

- **类型**：逻辑控制
- **说明**：获取：任务 / records（异步编排）
- **签名**：`fetchTaskRecords(): Promise<LearningTaskRecord[]>`
- **位置**：brian-backend/Application/test/self-learning.test.ts:2208
- **引用次数**：9

#### `insertRecentTag`

- **类型**：数据处理
- **说明**：写入/新增：recent / 标签
- **签名**：`insertRecentTag(id: string, tag: string): Promise<void>`
- **位置**：brian-backend/Application/test/self-learning.test.ts:2214
- **引用次数**：4

#### `mockGraphTagNode`

- **类型**：数据处理
- **说明**：处理 mock / 图 / 标签 / 节点（图数据库）
- **签名**：`mockGraphTagNode(tag: string): void`
- **位置**：brian-backend/Application/test/self-learning.test.ts:2225
- **引用次数**：3

#### `getLibraryById`

- **类型**：数据处理
- **说明**：获取：library / 标识
- **签名**：`getLibraryById(db: RelationDBAccess, libraryId: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Application/test/self-learning.test.ts:2352
- **引用次数**：8

## 文件 `brian-backend/Application/test/test-helpers.ts`

### 模块级函数

#### `resetSeq`

- **类型**：逻辑控制
- **说明**：删除/清理：seq
- **签名**：`resetSeq()`
- **位置**：brian-backend/Application/test/test-helpers.ts:11
- **引用次数**：3

#### `createTestDb`

- **类型**：数据处理
- **说明**：写入/新增：test / db（操作关系数据库）
- **签名**：`createTestDb(): Promise<RelationDBAccess>`
- **位置**：brian-backend/Application/test/test-helpers.ts:13
- **引用次数**：17

#### `initChatSchema`

- **类型**：逻辑控制
- **说明**：构建/初始化：chat / 表结构
- **签名**：`initChatSchema(db: RelationDBAccess): void`
- **位置**：brian-backend/Application/test/test-helpers.ts:19
- **引用次数**：2

#### `initSelfLearningSchema`

- **类型**：逻辑控制
- **说明**：构建/初始化：learning / 表结构
- **签名**：`initSelfLearningSchema(db: RelationDBAccess): void`
- **位置**：brian-backend/Application/test/test-helpers.ts:23
- **引用次数**：3

#### `initVisualizationSchema`

- **类型**：逻辑控制
- **说明**：构建/初始化：visualization / 表结构
- **签名**：`initVisualizationSchema(db: RelationDBAccess): void`
- **位置**：brian-backend/Application/test/test-helpers.ts:27
- **引用次数**：3

#### `makeAccess`

- **类型**：数据处理
- **说明**：构建/初始化：access
- **签名**：`makeAccess(obj: any)`
- **位置**：brian-backend/Application/test/test-helpers.ts:31
- **引用次数**：21

#### `createMockInfoCore`

- **类型**：数据处理
- **说明**：写入/新增：mock / 信息 / core（向量库）
- **签名**：`createMockInfoCore(overrides: Record<string, any>)`
- **位置**：brian-backend/Application/test/test-helpers.ts:39
- **引用次数**：6

#### `createMockLogger`

- **类型**：逻辑控制
- **说明**：写入/新增：mock / logger
- **签名**：`createMockLogger()`
- **位置**：brian-backend/Application/test/test-helpers.ts:79
- **引用次数**：3

## 文件 `brian-backend/Application/test/user-profile.test.ts`

### 模块级函数

#### `ctx`

- **类型**：逻辑控制
- **说明**：执行 ctx 逻辑
- **签名**：`ctx(): UserProfileContext`
- **位置**：brian-backend/Application/test/user-profile.test.ts:17
- **引用次数**：1764

#### `setupProfileLLM`

- **类型**：数据处理
- **说明**：更新：画像 / 大模型（序列化输出）
- **签名**：`setupProfileLLM(value: unknown, confidence: unknown)`
- **位置**：brian-backend/Application/test/user-profile.test.ts:476
- **引用次数**：14

#### `setupProfileLLMForGen`

- **类型**：数据处理
- **说明**：更新：画像 / 大模型 / gen（序列化输出）
- **签名**：`setupProfileLLMForGen()`
- **位置**：brian-backend/Application/test/user-profile.test.ts:851
- **引用次数**：7

#### `generateProfile`

- **类型**：逻辑控制
- **说明**：构建/初始化：画像（异步编排）
- **签名**：`generateProfile(sessionId?: string, directions?: string[])`
- **位置**：brian-backend/Application/test/user-profile.test.ts:863
- **引用次数**：40

#### `setupProfileLLMForVersion`

- **类型**：数据处理
- **说明**：更新：画像 / 大模型 / version（序列化输出）
- **签名**：`setupProfileLLMForVersion()`
- **位置**：brian-backend/Application/test/user-profile.test.ts:969
- **引用次数**：3

#### `setupProfileLLMForReset`

- **类型**：数据处理
- **说明**：更新：画像 / 大模型 / reset（序列化输出）
- **签名**：`setupProfileLLMForReset()`
- **位置**：brian-backend/Application/test/user-profile.test.ts:1040
- **引用次数**：3

## 文件 `brian-backend/Application/test/visualization.test.ts`

### 模块级函数

#### `ctx`

- **类型**：逻辑控制
- **说明**：执行 ctx 逻辑
- **签名**：`ctx()`
- **位置**：brian-backend/Application/test/visualization.test.ts:36
- **引用次数**：1764

#### `genId`

- **类型**：逻辑控制
- **说明**：处理 gen / 标识
- **签名**：`genId()`
- **位置**：brian-backend/Application/test/visualization.test.ts:38
- **引用次数**：6

#### `now`

- **类型**：逻辑控制
- **说明**：处理 now
- **签名**：`now()`
- **位置**：brian-backend/Application/test/visualization.test.ts:40
- **引用次数**：1116

#### `insInfoRaw`

- **类型**：数据处理
- **说明**：处理 ins / 信息 / raw
- **签名**：`insInfoRaw(db: RelationDBAccess, o: Record<string, unknown>)`
- **位置**：brian-backend/Application/test/visualization.test.ts:44
- **引用次数**：59

#### `ensureInfoGraphNode`

- **类型**：数据处理
- **说明**：确保就绪：信息 / 图 / 节点（图数据库）
- **签名**：`ensureInfoGraphNode(graphDb: GraphDBAccess, infoId: string, sessionId: string): Promise<string>`
- **位置**：brian-backend/Application/test/visualization.test.ts:58
- **引用次数**：8

#### `insInfoGraph`

- **类型**：数据处理
- **说明**：处理 ins / 信息 / 图（图数据库）
- **签名**：`insInfoGraph(graphDb: GraphDBAccess, citingInfoId: string, citedInfoId: string, sessionId: unknown)`
- **位置**：brian-backend/Application/test/visualization.test.ts:73
- **引用次数**：13

#### `insInfoSummary`

- **类型**：数据处理
- **说明**：处理 ins / 信息 / 摘要
- **签名**：`insInfoSummary(db: RelationDBAccess, infoId: string, summary: string)`
- **位置**：brian-backend/Application/test/visualization.test.ts:91
- **引用次数**：3

#### `insInfoContextConfig`

- **类型**：数据处理
- **说明**：处理 ins / 信息 / 上下文 / 配置
- **签名**：`insInfoContextConfig(db: RelationDBAccess, overrides: Record<string, unknown>)`
- **位置**：brian-backend/Application/test/visualization.test.ts:101
- **引用次数**：2

#### `insTrace`

- **类型**：数据处理
- **说明**：处理 ins / 执行轨迹
- **签名**：`insTrace(db: RelationDBAccess, overrides: Record<string, unknown>)`
- **位置**：brian-backend/Application/test/visualization.test.ts:115
- **引用次数**：16

