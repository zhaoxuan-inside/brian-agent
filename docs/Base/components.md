# Base / components

- 层：**Base**　模块：**components**
- 方法数：**49**（逻辑控制 15 · 数据处理 21 · 通用算法 13）

## 文件 `brian-backend/Base/components/GraphDB/GraphDBComponent.ts`

### GraphDBComponent（私有）

#### `ensureClient`

- **类型**：数据处理
- **说明**：确保就绪：client（图数据库）
- **签名**：`ensureClient(): Promise<LeanGraphClient>`
- **位置**：brian-backend/Base/components/GraphDB/GraphDBComponent.ts:40
- **引用次数**：4

### GraphDBComponent

#### `open`

- **类型**：逻辑控制
- **说明**：启动相关数据
- **签名**：`open(): void`
- **位置**：brian-backend/Base/components/GraphDB/GraphDBComponent.ts:68
- **引用次数**：14

#### `disconnect`

- **类型**：逻辑控制
- **说明**：处理 disconnect（含异常兜底）
- **签名**：`disconnect(): void`
- **位置**：brian-backend/Base/components/GraphDB/GraphDBComponent.ts:74
- **引用次数**：20

#### `close`

- **类型**：逻辑控制
- **说明**：删除/清理相关数据
- **签名**：`close(): void`
- **位置**：brian-backend/Base/components/GraphDB/GraphDBComponent.ts:86
- **引用次数**：71

#### `queryAll`

- **类型**：数据处理
- **说明**：查询相关数据
- **签名**：`queryAll(cypher: string): Promise<Array<Record<string, unknown>>>`
- **位置**：brian-backend/Base/components/GraphDB/GraphDBComponent.ts:95
- **引用次数**：9

#### `queryOne`

- **类型**：数据处理
- **说明**：查询：one
- **签名**：`queryOne(cypher: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Base/components/GraphDB/GraphDBComponent.ts:100
- **引用次数**：24

#### `execute`

- **类型**：逻辑控制
- **说明**：处理执行相关数据（异步编排）
- **签名**：`execute(cypher: string): Promise<Array<Record<string, unknown>>>`
- **位置**：brian-backend/Base/components/GraphDB/GraphDBComponent.ts:105
- **引用次数**：60

#### `queryNeighborsByCTE`

- **类型**：数据处理
- **说明**：查询：neighbors / cte
- **签名**：`queryNeighborsByCTE(params: { startNodeId: string; maxDepth: number; direction: 'OUT' \| 'IN' \| 'BOTH'; edgeType?: string; onlyActive: boolean; fanOutThreshold: number; }): Promise<string[]>`
- **位置**：brian-backend/Base/components/GraphDB/GraphDBComponent.ts:111
- **引用次数**：2

#### `getDiskUsage`

- **类型**：通用算法
- **说明**：获取：disk / 用量（纯计算，无外部 IO）
- **签名**：`getDiskUsage(): number`
- **位置**：brian-backend/Base/components/GraphDB/GraphDBComponent.ts:162
- **引用次数**：9

## 文件 `brian-backend/Base/components/SQLite/SQLiteComponent.ts`

### SQLiteComponent

#### `exec`

- **类型**：数据处理
- **说明**：处理执行相关数据
- **签名**：`exec(sql: string): void`
- **位置**：brian-backend/Base/components/SQLite/SQLiteComponent.ts:53
- **引用次数**：81

#### `prepare`

- **类型**：数据处理
- **说明**：构建/初始化相关数据
- **签名**：`prepare(sql: string): Statement`
- **位置**：brian-backend/Base/components/SQLite/SQLiteComponent.ts:57
- **引用次数**：20

#### `pragma`

- **类型**：逻辑控制
- **说明**：处理 pragma
- **签名**：`pragma(pragma: string): unknown`
- **位置**：brian-backend/Base/components/SQLite/SQLiteComponent.ts:61
- **引用次数**：16

#### `getDiskUsage`

- **类型**：通用算法
- **说明**：获取：disk / 用量（纯计算，无外部 IO）
- **签名**：`getDiskUsage(): number`
- **位置**：brian-backend/Base/components/SQLite/SQLiteComponent.ts:65
- **引用次数**：9

#### `getDatabase`

- **类型**：逻辑控制
- **说明**：获取：database
- **签名**：`getDatabase(): Database`
- **位置**：brian-backend/Base/components/SQLite/SQLiteComponent.ts:73
- **引用次数**：2

#### `close`

- **类型**：逻辑控制
- **说明**：删除/清理相关数据（含异常兜底）
- **签名**：`close(): void`
- **位置**：brian-backend/Base/components/SQLite/SQLiteComponent.ts:77
- **引用次数**：71

#### `walCheckpoint`

- **类型**：逻辑控制
- **说明**：处理 wal / checkpoint（含异常兜底）
- **签名**：`walCheckpoint(mode: 'PASSIVE' \| 'FULL' \| 'RESTART' \| 'TRUNCATE'): { busy: boolean; log: number; checkpointed: number }`
- **位置**：brian-backend/Base/components/SQLite/SQLiteComponent.ts:85
- **引用次数**：6

## 文件 `brian-backend/Base/components/VectorDB/VectorDBComponent.ts`

### VectorDBComponent

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（向量库）
- **签名**：`init(dimension: number, metric: string): Promise<void>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:51
- **引用次数**：99

### VectorDBComponent（私有）

#### `createTableWithVectorColumn`

- **类型**：数据处理
- **说明**：写入/新增：数据表 / 向量 / 字段（向量库）
- **签名**：`createTableWithVectorColumn(): Promise<Table>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:69
- **引用次数**：4

#### `ensureVectorColumn`

- **类型**：数据处理
- **说明**：确保就绪：向量 / 字段（向量库）
- **签名**：`ensureVectorColumn(): Promise<void>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:87
- **引用次数**：2

### VectorDBComponent

#### `recreate`

- **类型**：数据处理
- **说明**：处理 recreate（向量库）
- **签名**：`recreate(dimension: number, metric: string): Promise<void>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:105
- **引用次数**：3

### VectorDBComponent（私有）

#### `ensureInit`

- **类型**：数据处理
- **说明**：确保就绪：init（向量库）
- **签名**：`ensureInit(): void`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:120
- **引用次数**：2

#### `getTable`

- **类型**：逻辑控制
- **说明**：获取：数据表
- **签名**：`getTable(): Table`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:126
- **引用次数**：8

#### `rowToRecord`

- **类型**：数据处理
- **说明**：处理 row / record（向量库）
- **签名**：`rowToRecord(row: Record<string, unknown>): VectorRecord`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:131
- **引用次数**：8

#### `parseEmbedding`

- **类型**：数据处理
- **说明**：解析：向量（反序列化）
- **签名**：`parseEmbedding(value: unknown): number[]`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:143
- **引用次数**：2

#### `parseMetadata`

- **类型**：数据处理
- **说明**：解析：metadata（反序列化）
- **签名**：`parseMetadata(value: unknown): Record<string, unknown> \| null`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:166
- **引用次数**：3

#### `getFieldValue`

- **类型**：通用算法
- **说明**：获取：字段 / 值（纯计算，无外部 IO）
- **签名**：`getFieldValue(record: { user_id: string \| null; metadata: Record<string, unknown> \| null }, field: string): unknown`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:184
- **引用次数**：2

#### `matchFilter`

- **类型**：通用算法
- **说明**：判断校验：过滤器（纯计算，无外部 IO）
- **签名**：`matchFilter(record: { user_id: string \| null; metadata: Record<string, unknown> \| null }, filter: VectorFilter): boolean`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:192
- **引用次数**：4

#### `matchFilters`

- **类型**：逻辑控制
- **说明**：判断校验：filters（遍历调度）
- **签名**：`matchFilters(record: { user_id: string \| null; metadata: Record<string, unknown> \| null }, filters: VectorFilter[]): boolean`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:214
- **引用次数**：3

#### `cosineSimilarity`

- **类型**：通用算法
- **说明**：处理 cosine / similarity（纯计算，无外部 IO）
- **签名**：`cosineSimilarity(a: number[], b: number[]): number`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:228
- **引用次数**：7

#### `euclideanSimilarity`

- **类型**：通用算法
- **说明**：处理 euclidean / similarity（纯计算，无外部 IO）
- **签名**：`euclideanSimilarity(a: number[], b: number[]): number`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:240
- **引用次数**：2

#### `dotSimilarity`

- **类型**：通用算法
- **说明**：处理执行：similarity（纯计算，无外部 IO）
- **签名**：`dotSimilarity(a: number[], b: number[]): number`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:251
- **引用次数**：2

#### `computeRawSimilarity`

- **类型**：通用算法
- **说明**：计算统计：raw / similarity（纯计算，无外部 IO）
- **签名**：`computeRawSimilarity(a: number[], b: number[]): number`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:258
- **引用次数**：2

### VectorDBComponent（静态）

#### `normalizeMetricScore`

- **类型**：通用算法
- **说明**：转换归并：metric / score（纯计算，无外部 IO）
- **签名**：`normalizeMetricScore(raw: number, metric: string, dimension: number): number`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:265
- **引用次数**：12

#### `normalizedThresholdToRaw`

- **类型**：通用算法
- **说明**：转换归并：threshold / raw（纯计算，无外部 IO）
- **签名**：`normalizedThresholdToRaw(threshold: number, metric: string, dimension: number): number`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:285
- **引用次数**：17

### VectorDBComponent（私有）

#### `buildUserWhere`

- **类型**：通用算法
- **说明**：构建/初始化：用户 / where（纯计算，无外部 IO）
- **签名**：`buildUserWhere(userIds: string[]): string \| null`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:304
- **引用次数**：2

### VectorDBComponent

#### `upsert`

- **类型**：数据处理
- **说明**：处理 upsert（向量库，序列化输出）
- **签名**：`upsert(record: VectorRecord): Promise<void>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:311
- **引用次数**：12

#### `get`

- **类型**：数据处理
- **说明**：获取相关数据
- **签名**：`get(id: string): Promise<VectorRecord \| null>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:331
- **引用次数**：439

#### `delete`

- **类型**：数据处理
- **说明**：删除/清理相关数据
- **签名**：`delete(id: string): Promise<void>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:343
- **引用次数**：186

#### `deleteMany`

- **类型**：数据处理
- **说明**：删除/清理：many
- **签名**：`deleteMany(ids: string[]): Promise<number>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:348
- **引用次数**：3

#### `getAll`

- **类型**：数据处理
- **说明**：获取相关数据
- **签名**：`getAll(filters?: VectorFilter[]): Promise<VectorRecord[]>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:364
- **引用次数**：3

#### `count`

- **类型**：通用算法
- **说明**：计算统计相关数据（纯计算，无外部 IO）
- **签名**：`count(filters?: VectorFilter[]): Promise<number>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:375
- **引用次数**：366

#### `deleteByFilter`

- **类型**：数据处理
- **说明**：删除/清理：过滤器
- **签名**：`deleteByFilter(filters: VectorFilter[]): Promise<number>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:384
- **引用次数**：2

#### `search`

- **类型**：数据处理
- **说明**：查询相关数据（向量库）
- **签名**：`search(queryVector: number[], topK: number, threshold: number, filters?: VectorFilter[]): Promise<VectorSearchHit[]>`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:391
- **引用次数**：49

#### `getDimension`

- **类型**：逻辑控制
- **说明**：获取：dimension
- **签名**：`getDimension(): number`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:475
- **引用次数**：7

#### `getMetric`

- **类型**：逻辑控制
- **说明**：获取：metric
- **签名**：`getMetric(): string`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:479
- **引用次数**：8

#### `setMetric`

- **类型**：逻辑控制
- **说明**：更新：metric
- **签名**：`setMetric(metric: string): void`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:483
- **引用次数**：2

#### `getTableName`

- **类型**：逻辑控制
- **说明**：获取：数据表 / name
- **签名**：`getTableName(): string`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:487
- **引用次数**：2

#### `getDiskUsage`

- **类型**：通用算法
- **说明**：获取：disk / 用量（纯计算，无外部 IO）
- **签名**：`getDiskUsage(): number`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:491
- **引用次数**：9

#### `close`

- **类型**：逻辑控制
- **说明**：删除/清理相关数据（含异常兜底）
- **签名**：`close(): void`
- **位置**：brian-backend/Base/components/VectorDB/VectorDBComponent.ts:512
- **引用次数**：71

