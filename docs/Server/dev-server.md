# Server / dev-server

- 层：**Server**　模块：**dev-server**
- 方法数：**28**（逻辑控制 6 · 数据处理 17 · 通用算法 5）

## 文件 `brian-backend/dev-server.ts`

### 模块级函数

#### `httpReq`

- **类型**：逻辑控制
- **说明**：处理 http（异步编排）
- **签名**：`httpReq(req: { url: string; method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number })`
- **位置**：brian-backend/dev-server.ts:215
- **引用次数**：9

#### `formatLogDate`

- **类型**：通用算法
- **说明**：格式化/序列化：日志 / 日期（纯计算，无外部 IO）
- **签名**：`formatLogDate(d: Date): string`
- **位置**：brian-backend/dev-server.ts:233
- **引用次数**：2

#### `writeFileLog`

- **类型**：数据处理
- **说明**：写入/新增：文件 / 日志（文件系统，序列化输出）
- **签名**：`writeFileLog(level: string, message: string, meta?: unknown): void`
- **位置**：brian-backend/dev-server.ts:240
- **引用次数**：5

#### `createLogger`

- **类型**：通用算法
- **说明**：写入/新增：logger（纯计算，无外部 IO）
- **签名**：`createLogger(logAccess?: LogAccess): any`
- **位置**：brian-backend/dev-server.ts:259
- **引用次数**：4

#### `addColIfMissing`

- **类型**：数据处理
- **说明**：写入/新增：col / missing（操作关系数据库）
- **签名**：`addColIfMissing(relationDb: import('./Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess, table: string, column: string, type: string): void`
- **位置**：brian-backend/dev-server.ts:305
- **引用次数**：4

#### `mapLearningMode`

- **类型**：通用算法
- **说明**：转换归并：learning / mode（纯计算，无外部 IO）
- **签名**：`mapLearningMode(mode: string): string`
- **位置**：brian-backend/dev-server.ts:310
- **引用次数**：11

#### `mapAutoField`

- **类型**：逻辑控制
- **说明**：转换归并：auto / 字段
- **签名**：`mapAutoField(mode: string): string`
- **位置**：brian-backend/dev-server.ts:318
- **引用次数**：2

#### `mapRandomFactorField`

- **类型**：逻辑控制
- **说明**：转换归并：random / factor / 字段
- **签名**：`mapRandomFactorField(mode: string): string`
- **位置**：brian-backend/dev-server.ts:325
- **引用次数**：2

#### `mapInfoToMemory`

- **类型**：数据处理
- **说明**：转换归并：信息 / 记忆
- **签名**：`mapInfoToMemory(row: any, tags: string[]): any`
- **位置**：brian-backend/dev-server.ts:332
- **引用次数**：4

#### `computeMemoryConfidence`

- **类型**：通用算法
- **说明**：计算统计：记忆 / confidence（纯计算，无外部 IO）
- **签名**：`computeMemoryConfidence(infoType: string, tags: string[], infoLength: number, pin: number): number`
- **位置**：brian-backend/dev-server.ts:358
- **引用次数**：2

#### `queryInfoTagsByInfoIds`

- **类型**：数据处理
- **说明**：查询：信息 / tags / 信息 / ids（操作关系数据库）
- **签名**：`queryInfoTagsByInfoIds(relationDb: import('./Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess, infoIds: string[]): Map<string, string[]>`
- **位置**：brian-backend/dev-server.ts:379
- **引用次数**：4

#### `readVectorDimension`

- **类型**：数据处理
- **说明**：获取：向量 / dimension（操作关系数据库）
- **签名**：`readVectorDimension(relationDb: import('./Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess): number`
- **位置**：brian-backend/dev-server.ts:393
- **引用次数**：2

#### `buildCooccurGraphFromGraphDB`

- **类型**：数据处理
- **说明**：构建/初始化：cooccur / 图 / 图 / db（图数据库）
- **签名**：`buildCooccurGraphFromGraphDB(ctx: any, nodeType: string, textField: string, edgeType: string, limit: unknown): Promise<{ nodes: Array<{ id: string; name: string; weight: number; degree: number }>; edges: Array<{ source: string; target: string; weight: number }> }>`
- **位置**：brian-backend/dev-server.ts:405
- **引用次数**：2

#### `buildCooccurGraphFromGraphDBCached`

- **类型**：数据处理
- **说明**：构建/初始化：cooccur / 图 / 图 / db（图数据库）
- **签名**：`buildCooccurGraphFromGraphDBCached(ctx: any, nodeType: string, textField: string, edgeType: string, limit: unknown): Promise<{ nodes: Array<{ id: string; name: string; weight: number; degree: number }>; edges: Array<{ source: string; target: string; weight: number }> }>`
- **位置**：brian-backend/dev-server.ts:463
- **引用次数**：3

#### `buildContext`

- **类型**：数据处理
- **说明**：构建/初始化：上下文（操作关系数据库，向量库，图数据库）
- **签名**：`buildContext()`
- **位置**：brian-backend/dev-server.ts:482
- **引用次数**：3

#### `soReqTraceId`

- **类型**：通用算法
- **说明**：查询：执行轨迹 / 标识（纯计算，无外部 IO）
- **签名**：`soReqTraceId(req: http.IncomingMessage): string`
- **位置**：brian-backend/dev-server.ts:1114
- **引用次数**：2

#### `jsonBody`

- **类型**：数据处理
- **说明**：处理 JSON / body（反序列化）
- **签名**：`jsonBody(req: http.IncomingMessage): Promise<any>`
- **位置**：brian-backend/dev-server.ts:1120
- **引用次数**：2

#### `sendJson`

- **类型**：数据处理
- **说明**：发送通知：JSON（序列化输出）
- **签名**：`sendJson(res: http.ServerResponse, status: number, data: any)`
- **位置**：brian-backend/dev-server.ts:1138
- **引用次数**：284

#### `getFrontendFiles`

- **类型**：逻辑控制
- **说明**：获取：frontend / files
- **签名**：`getFrontendFiles(): Record<string, string> \| null`
- **位置**：brian-backend/dev-server.ts:1166
- **引用次数**：2

#### `serveFrontend`

- **类型**：数据处理
- **说明**：处理 serve / frontend
- **签名**：`serveFrontend(res: http.ServerResponse, pathname: string): boolean`
- **位置**：brian-backend/dev-server.ts:1170
- **引用次数**：2

#### `buildThinkingBlocksAndDag`

- **类型**：数据处理
- **说明**：构建/初始化：thinking / blocks / DAG 流程（操作关系数据库）
- **签名**：`buildThinkingBlocksAndDag(relationDb: import('./Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess, infoCore: any, workIds: string[], promptsAccess?: any, soulAccess?: any): Promise<{ workBlocksMap: Map<string, any[]>; workDagMap: Map<string, any>; workTraceMap: Map<string, any> }>`
- **位置**：brian-backend/dev-server.ts:1191
- **引用次数**：4

#### `soContextByWorkShared`

- **类型**：逻辑控制
- **说明**：查询：上下文 / work / shared（含异常兜底，异步编排）
- **签名**：`soContextByWorkShared(infoCore: InfoCoreLike, workId: string): Promise<ContextTriples>`
- **位置**：brian-backend/dev-server.ts:1223
- **引用次数**：2

#### `buildRuntimeWorkContext`

- **类型**：数据处理
- **说明**：构建/初始化：runtime / work / 上下文（操作关系数据库）
- **签名**：`buildRuntimeWorkContext(infoCore: InfoCoreLike, relationDb: AllRelationDb, runId: string, lastBuilt: any): Promise<Record<string, unknown>>`
- **位置**：brian-backend/dev-server.ts:1233
- **引用次数**：3

#### `buildThinkingBlocksFromRuntime`

- **类型**：数据处理
- **说明**：构建/初始化：thinking / blocks / runtime（操作关系数据库，序列化输出，反序列化）
- **签名**：`buildThinkingBlocksFromRuntime(relationDb: import('./Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess, infoCore: InfoCoreLike, runId: string): Promise<{ blocks: any[]; dag: any; trace?: any } \| null>`
- **位置**：brian-backend/dev-server.ts:1315
- **引用次数**：3

#### `rebuildPromptFromRef`

- **类型**：逻辑控制
- **说明**：处理 rebuild / 提示词 / ref（含异常兜底，异步编排）
- **签名**：`rebuildPromptFromRef(rebuilder: PromptRebuilder, ref: any, refIndex: number, iters: any[], triples: any): Promise<string>`
- **位置**：brian-backend/dev-server.ts:2013
- **引用次数**：2

#### `buildThinkingBlocksFromOrchestration`

- **类型**：数据处理
- **说明**：构建/初始化：thinking / blocks / orchestration（操作关系数据库，反序列化）
- **签名**：`buildThinkingBlocksFromOrchestration(relationDb: import('./Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess, infoCore: any, workIds: string[], promptsAccess?: any, soulAccess?: any): Promise<{ workBlocksMap: Map<string, any[]>; workDagMap: Map<string, any> }>`
- **位置**：brian-backend/dev-server.ts:2031
- **引用次数**：4

#### `createServer`

- **类型**：数据处理
- **说明**：写入/新增：server（操作关系数据库，向量库，图数据库）
- **签名**：`createServer(ctx: Awaited<ReturnType<typeof buildContext>>): http.Server`
- **位置**：brian-backend/dev-server.ts:2450
- **引用次数**：5

#### `main`

- **类型**：数据处理
- **说明**：处理 main（操作关系数据库，网络请求）
- **签名**：`main()`
- **位置**：brian-backend/dev-server.ts:5677
- **引用次数**：21

