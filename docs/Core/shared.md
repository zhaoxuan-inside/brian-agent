# Core / shared

- 层：**Core**　模块：**shared**
- 方法数：**34**（逻辑控制 3 · 数据处理 20 · 通用算法 11）

## 文件 `brian-backend/Core/shared/ConfigHelper.ts`

### 模块级函数

#### `ensureDefaultConfig`

- **类型**：数据处理
- **说明**：确保就绪：default / 配置（操作关系数据库）
- **签名**：`ensureDefaultConfig(relationDb: RelationDBAccess, tableName: string, defaults: DataObject[]): Promise<void>`
- **位置**：brian-backend/Core/shared/ConfigHelper.ts:5
- **引用次数**：11

## 文件 `brian-backend/Core/shared/FifoCache.ts`

### FifoCache

#### `get`

- **类型**：数据处理
- **说明**：获取相关数据
- **签名**：`get(key: string): V \| undefined`
- **位置**：brian-backend/Core/shared/FifoCache.ts:7
- **引用次数**：439

#### `set`

- **类型**：数据处理
- **说明**：更新相关数据
- **签名**：`set(key: string, value: V): void`
- **位置**：brian-backend/Core/shared/FifoCache.ts:12
- **引用次数**：224

#### `delete`

- **类型**：数据处理
- **说明**：删除/清理相关数据
- **签名**：`delete(key: string): boolean`
- **位置**：brian-backend/Core/shared/FifoCache.ts:26
- **引用次数**：186

#### `clear`

- **类型**：逻辑控制
- **说明**：删除/清理相关数据
- **签名**：`clear(): void`
- **位置**：brian-backend/Core/shared/FifoCache.ts:31
- **引用次数**：41

#### `entries`

- **类型**：通用算法
- **说明**：处理 entries（纯计算，无外部 IO）
- **签名**：`entries(): Array<[string, V]>`
- **位置**：brian-backend/Core/shared/FifoCache.ts:41
- **引用次数**：134

## 文件 `brian-backend/Core/shared/MatchCacheHelper.ts`

### 模块级函数

#### `checkMatchCache`

- **类型**：数据处理
- **说明**：判断校验：match / 缓存（操作关系数据库）
- **签名**：`checkMatchCache(relationDb: RelationDBAccess, cacheTable: string, agentId: string, regenRate: number, mode: RegenMode, entityIdColumn: string): Promise<MatchCacheCheckResult>`
- **位置**：brian-backend/Core/shared/MatchCacheHelper.ts:17
- **引用次数**：15

#### `clearMatchCache`

- **类型**：数据处理
- **说明**：删除/清理：match / 缓存（操作关系数据库）
- **签名**：`clearMatchCache(relationDb: RelationDBAccess, cacheTable: string, agentId: string): Promise<void>`
- **位置**：brian-backend/Core/shared/MatchCacheHelper.ts:62
- **引用次数**：9

#### `persistMatchBinding`

- **类型**：数据处理
- **说明**：写入/新增：match / binding（操作关系数据库）
- **签名**：`persistMatchBinding(relationDb: RelationDBAccess, cacheTable: string, agentId: string, entityId: string, entityIdColumn: string, extraFields: Array<{ field: string; value: unknown }>): Promise<string>`
- **位置**：brian-backend/Core/shared/MatchCacheHelper.ts:72
- **引用次数**：18

## 文件 `brian-backend/Core/shared/RankingParser.ts`

### 模块级函数

#### `parseNeedRankingResult`

- **类型**：通用算法
- **说明**：解析：need / ranking / result（纯计算，无外部 IO）
- **签名**：`parseNeedRankingResult(text: string): NeedRankingResult`
- **位置**：brian-backend/Core/shared/RankingParser.ts:18
- **引用次数**：23

#### `parseObjectContract`

- **类型**：数据处理
- **说明**：解析：object / contract（反序列化）
- **签名**：`parseObjectContract(text: string): NeedRankingResult \| null`
- **位置**：brian-backend/Core/shared/RankingParser.ts:28
- **引用次数**：2

#### `stripCodeFence`

- **类型**：通用算法
- **说明**：处理 strip / code / fence（纯计算，无外部 IO）
- **签名**：`stripCodeFence(text: string): string`
- **位置**：brian-backend/Core/shared/RankingParser.ts:58
- **引用次数**：8

#### `parseRankingCandidates`

- **类型**：通用算法
- **说明**：解析：ranking / candidates（纯计算，无外部 IO）
- **签名**：`parseRankingCandidates(text: string): RankedCandidate[]`
- **位置**：brian-backend/Core/shared/RankingParser.ts:62
- **引用次数**：13

#### `filterByThreshold`

- **类型**：通用算法
- **说明**：处理 过滤器 / threshold（纯计算，无外部 IO）
- **签名**：`filterByThreshold(items: RankedCandidate[], threshold: number): RankedCandidate[]`
- **位置**：brian-backend/Core/shared/RankingParser.ts:77
- **引用次数**：13

#### `toCandidate`

- **类型**：通用算法
- **说明**：格式化/序列化：candidate（纯计算，无外部 IO）
- **签名**：`toCandidate(raw: unknown): RankedCandidate \| null`
- **位置**：brian-backend/Core/shared/RankingParser.ts:84
- **引用次数**：3

#### `clampScore`

- **类型**：通用算法
- **说明**：处理 clamp / score（纯计算，无外部 IO）
- **签名**：`clampScore(score: number): number`
- **位置**：brian-backend/Core/shared/RankingParser.ts:97
- **引用次数**：3

#### `extractJsonArray`

- **类型**：数据处理
- **说明**：解析：JSON / array（反序列化）
- **签名**：`extractJsonArray(text: string): unknown`
- **位置**：brian-backend/Core/shared/RankingParser.ts:101
- **引用次数**：2

## 文件 `brian-backend/Core/shared/SimilarityHelper.ts`

### 模块级函数

#### `vectorCosineSimilarity`

- **类型**：通用算法
- **说明**：处理 向量 / cosine / similarity（纯计算，无外部 IO）
- **签名**：`vectorCosineSimilarity(a: number[], b: number[]): number`
- **位置**：brian-backend/Core/shared/SimilarityHelper.ts:1
- **引用次数**：2

#### `shouldReuseByRegenRate`

- **类型**：通用算法
- **说明**：判断校验：reuse / regen / rate（纯计算，无外部 IO）
- **签名**：`shouldReuseByRegenRate(regenRate: number): boolean`
- **位置**：brian-backend/Core/shared/SimilarityHelper.ts:18
- **引用次数**：4

## 文件 `brian-backend/Core/shared/SingleRowConfigStore.ts`

### SingleRowConfigStore

#### `load`

- **类型**：逻辑控制
- **说明**：获取相关数据（异步编排）
- **签名**：`load(): Promise<T \| null>`
- **位置**：brian-backend/Core/shared/SingleRowConfigStore.ts:26
- **引用次数**：16

#### `upsert`

- **类型**：数据处理
- **说明**：处理 upsert
- **签名**：`upsert(patch: DataObject[]): Promise<void>`
- **位置**：brian-backend/Core/shared/SingleRowConfigStore.ts:39
- **引用次数**：12

### SingleRowConfigStore（私有）

#### `ensureDefault`

- **类型**：数据处理
- **说明**：确保就绪：default
- **签名**：`ensureDefault(): Promise<void>`
- **位置**：brian-backend/Core/shared/SingleRowConfigStore.ts:65
- **引用次数**：2

## 文件 `brian-backend/Core/shared/VectorMatchCache.ts`

### VectorMatchCache

#### `configure`

- **类型**：数据处理
- **说明**：处理 configure
- **签名**：`configure(options?: { capacity?: number; similarityThreshold?: number; ttlMs?: number }): void`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:31
- **引用次数**：4

#### `lookup`

- **类型**：数据处理
- **说明**：处理 lookup（向量库）
- **签名**：`lookup(task: string, embed: (text: string) => Promise<number[]>): Promise<{ record: MatchCacheRecord \| null; query: number[] \| null }>`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:50
- **引用次数**：4

#### `embedOf`

- **类型**：数据处理
- **说明**：处理 embed（向量库）
- **签名**：`embedOf(task: string, embed: (text: string) => Promise<number[]>): Promise<number[]>`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:67
- **引用次数**：7

#### `commit`

- **类型**：数据处理
- **说明**：处理 commit（向量库）
- **签名**：`commit(key: string, embedding: number[], result: Array<{ id: string; score: number }>): void`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:72
- **引用次数**：12

#### `countNegativeMiss`

- **类型**：数据处理
- **说明**：计算统计：negative / miss
- **签名**：`countNegativeMiss(task: string, forceRefetchAfter: unknown): boolean`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:78
- **引用次数**：2

#### `clear`

- **类型**：数据处理
- **说明**：删除/清理相关数据
- **签名**：`clear(): void`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:95
- **引用次数**：41

### VectorMatchCache（私有）

#### `bestBySimilarity`

- **类型**：数据处理
- **说明**：处理 similarity（向量库）
- **签名**：`bestBySimilarity(query: number[]): MatchCacheRecord \| null`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:104
- **引用次数**：2

#### `fresh`

- **类型**：逻辑控制
- **说明**：处理 fresh
- **签名**：`fresh(ts: number): boolean`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:128
- **引用次数**：19

### 模块级函数

#### `buildCacheKey`

- **类型**：数据处理
- **说明**：构建/初始化：缓存 / 键（向量库）
- **签名**：`buildCacheKey(task: string): string`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:133
- **引用次数**：10

#### `safeEmbed`

- **类型**：数据处理
- **说明**：处理 safe / embed（向量库）
- **签名**：`safeEmbed(task: string, embed: (text: string) => Promise<number[]>): Promise<number[] \| null>`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:137
- **引用次数**：3

#### `cosineSimilarity`

- **类型**：通用算法
- **说明**：处理 cosine / similarity（纯计算，无外部 IO）
- **签名**：`cosineSimilarity(a: number[], b: number[]): number`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:146
- **引用次数**：7

#### `dotProduct`

- **类型**：通用算法
- **说明**：处理执行：product（纯计算，无外部 IO）
- **签名**：`dotProduct(a: number[], b: number[]): number`
- **位置**：brian-backend/Core/shared/VectorMatchCache.ts:157
- **引用次数**：4

