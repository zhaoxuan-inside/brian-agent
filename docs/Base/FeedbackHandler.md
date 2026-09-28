# Base / FeedbackHandler

- 层：**Base**　模块：**FeedbackHandler**
- 方法数：**28**（逻辑控制 13 · 数据处理 15 · 通用算法 0）

## 文件 `brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts`

### FeedbackAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:36
- **引用次数**：272

#### `submitFeedback`

- **类型**：逻辑控制
- **说明**：处理 submit / 反馈（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`submitFeedback(i: SubmitFeedbackInput, o: SubmitFeedbackOutput, c: FeedbackContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:38
- **引用次数**：4

#### `submitAgentFeedback`

- **类型**：逻辑控制
- **说明**：处理 submit / Agent / 反馈（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`submitAgentFeedback(i: SubmitAgentFeedbackInput, o: SubmitAgentFeedbackOutput, c: FeedbackContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:46
- **引用次数**：4

#### `soFeedback`

- **类型**：逻辑控制
- **说明**：查询：反馈（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soFeedback(i: QueryFeedbackInput, o: QueryFeedbackOutput, c: FeedbackContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:54
- **引用次数**：4

#### `analyzeFeedback`

- **类型**：逻辑控制
- **说明**：处理 analyze / 反馈（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`analyzeFeedback(i: AnalyzeFeedbackInput, o: AnalyzeFeedbackOutput, c: FeedbackContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:62
- **引用次数**：4

#### `recordProcessLog`

- **类型**：逻辑控制
- **说明**：写入/新增：日志（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`recordProcessLog(i: RecordProcessLogInput, o: RecordProcessLogOutput, c: FeedbackContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:70
- **引用次数**：4

#### `getProcessLogs`

- **类型**：逻辑控制
- **说明**：获取：logs（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`getProcessLogs(i: QueryProcessLogsInput, o: QueryProcessLogsOutput, c: FeedbackContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:78
- **引用次数**：4

#### `getProcessLogDetail`

- **类型**：逻辑控制
- **说明**：获取：日志 / detail（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`getProcessLogDetail(i: GetProcessLogDetailInput, o: GetProcessLogDetailOutput, c: FeedbackContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:86
- **引用次数**：4

#### `deleteFeedbackByRefs`

- **类型**：逻辑控制
- **说明**：删除/清理：反馈 / refs（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`deleteFeedbackByRefs(i: DeleteFeedbackByRefsInput, o: DeleteFeedbackByRefsOutput, c: FeedbackContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:94
- **引用次数**：3

#### `purgeOrphanFeedback`

- **类型**：逻辑控制
- **说明**：删除/清理：orphan / 反馈（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`purgeOrphanFeedback(i: PurgeOrphanFeedbackInput, o: PurgeOrphanFeedbackOutput, c: FeedbackContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:102
- **引用次数**：4

#### `getFeedbackConfig`

- **类型**：逻辑控制
- **说明**：获取：反馈 / 配置（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`getFeedbackConfig(i: GetFeedbackConfigInput, o: GetFeedbackConfigOutput, c: FeedbackContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:110
- **引用次数**：5

#### `updateFeedbackConfig`

- **类型**：逻辑控制
- **说明**：更新：反馈 / 配置（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`updateFeedbackConfig(i: UpdateFeedbackConfigInput, o: UpdateFeedbackConfigOutput, c: FeedbackContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts:118
- **引用次数**：4

## 文件 `brian-backend/Base/FeedbackHandler/application/FeedbackService.ts`

### 模块级函数

#### `mapRecord`

- **类型**：数据处理
- **说明**：转换归并：record
- **签名**：`mapRecord(row: Record<string, unknown>): FeedbackRecord`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:27
- **引用次数**：5

#### `mapProcessLog`

- **类型**：数据处理
- **说明**：转换归并：日志
- **签名**：`mapProcessLog(row: Record<string, unknown>): FeedbackProcessLogRecord`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:45
- **引用次数**：3

### FeedbackService

#### `submitFeedback`

- **类型**：数据处理
- **说明**：处理 submit / 反馈（操作关系数据库，序列化输出）
- **签名**：`submitFeedback(input: SubmitFeedbackInput, output: SubmitFeedbackOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:69
- **引用次数**：4

#### `submitAgentFeedback`

- **类型**：数据处理
- **说明**：处理 submit / Agent / 反馈（操作关系数据库，序列化输出）
- **签名**：`submitAgentFeedback(input: SubmitAgentFeedbackInput, output: SubmitAgentFeedbackOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:103
- **引用次数**：4

#### `recordProcessLog`

- **类型**：逻辑控制
- **说明**：写入/新增：日志（返回成功与否，异步编排）
- **签名**：`recordProcessLog(input: RecordProcessLogInput, output: RecordProcessLogOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:136
- **引用次数**：4

#### `getProcessLogs`

- **类型**：数据处理
- **说明**：获取：logs（操作关系数据库）
- **签名**：`getProcessLogs(input: QueryProcessLogsInput, output: QueryProcessLogsOutput, _ctx: FeedbackContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:153
- **引用次数**：4

### FeedbackService（私有）

#### `enrichProcessLogs`

- **类型**：数据处理
- **说明**：处理 enrich / logs（操作关系数据库）
- **签名**：`enrichProcessLogs(logs: FeedbackProcessLogListItem[], metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:170
- **引用次数**：3

### FeedbackService

#### `getProcessLogDetail`

- **类型**：数据处理
- **说明**：获取：日志 / detail（操作关系数据库）
- **签名**：`getProcessLogDetail(input: GetProcessLogDetailInput, output: GetProcessLogDetailOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:219
- **引用次数**：4

#### `deleteFeedbackByRefs`

- **类型**：数据处理
- **说明**：删除/清理：反馈 / refs（操作关系数据库）
- **签名**：`deleteFeedbackByRefs(input: DeleteFeedbackByRefsInput, output: DeleteFeedbackByRefsOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:270
- **引用次数**：3

#### `purgeOrphanFeedback`

- **类型**：数据处理
- **说明**：删除/清理：orphan / 反馈（操作关系数据库）
- **签名**：`purgeOrphanFeedback(input: PurgeOrphanFeedbackInput, output: PurgeOrphanFeedbackOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:290
- **引用次数**：4

#### `soFeedback`

- **类型**：数据处理
- **说明**：查询：反馈（操作关系数据库）
- **签名**：`soFeedback(input: QueryFeedbackInput, output: QueryFeedbackOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:315
- **引用次数**：4

#### `analyzeFeedback`

- **类型**：数据处理
- **说明**：处理 analyze / 反馈（操作关系数据库，反序列化）
- **签名**：`analyzeFeedback(input: AnalyzeFeedbackInput, output: AnalyzeFeedbackOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:330
- **引用次数**：4

#### `getFeedbackConfig`

- **类型**：数据处理
- **说明**：获取：反馈 / 配置（操作关系数据库）
- **签名**：`getFeedbackConfig(_input: GetFeedbackConfigInput, output: GetFeedbackConfigOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:400
- **引用次数**：5

#### `updateFeedbackConfig`

- **类型**：数据处理
- **说明**：更新：反馈 / 配置（操作关系数据库）
- **签名**：`updateFeedbackConfig(input: UpdateFeedbackConfigInput, output: UpdateFeedbackConfigOutput, _ctx: FeedbackContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:421
- **引用次数**：4

### FeedbackService（私有）

#### `recordProcessLogInternal`

- **类型**：数据处理
- **说明**：写入/新增：日志 / internal（操作关系数据库，序列化输出）
- **签名**：`recordProcessLogInternal(feedbackId: string, action: ProcessAction, meta: { agent_id?: string; run_id?: string; work_id?: string; rating?: number; details?: Record<string, unknown> }): Promise<string>`
- **位置**：brian-backend/Base/FeedbackHandler/application/FeedbackService.ts:465
- **引用次数**：3

## 文件 `brian-backend/Base/FeedbackHandler/infrastructure/FeedbackSchemaInitializer.ts`

### FeedbackSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/FeedbackHandler/infrastructure/FeedbackSchemaInitializer.ts:11
- **引用次数**：99

