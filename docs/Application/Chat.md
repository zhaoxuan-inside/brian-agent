# Application / Chat

- 层：**Application**　模块：**Chat**
- 方法数：**50**（逻辑控制 15 · 数据处理 32 · 通用算法 3）

## 文件 `brian-backend/Application/Chat/access/ChatAccess.ts`

### ChatAccess

#### `createSession`

- **类型**：逻辑控制
- **说明**：写入/新增：会话（返回成功与否，接入层转发至 Service）
- **签名**：`createSession(i: CreateSessionInput, o: CreateSessionOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:45
- **引用次数**：34

#### `deleteSession`

- **类型**：逻辑控制
- **说明**：删除/清理：会话（返回成功与否，接入层转发至 Service）
- **签名**：`deleteSession(i: DeleteSessionInput, o: DeleteSessionOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:52
- **引用次数**：27

#### `purgeOrphanSessions`

- **类型**：逻辑控制
- **说明**：删除/清理：orphan / sessions（返回成功与否，接入层转发至 Service）
- **签名**：`purgeOrphanSessions(i: PurgeOrphanSessionsInput, o: PurgeOrphanSessionsOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:59
- **引用次数**：8

#### `soSession`

- **类型**：逻辑控制
- **说明**：查询：会话（返回成功与否，接入层转发至 Service）
- **签名**：`soSession(i: SearchSessionInput, o: SearchSessionOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:66
- **引用次数**：20

#### `soSessionDetail`

- **类型**：逻辑控制
- **说明**：查询：会话 / detail（返回成功与否，接入层转发至 Service）
- **签名**：`soSessionDetail(i: GetSessionDetailInput, o: GetSessionDetailOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:73
- **引用次数**：11

#### `updateSessionTitle`

- **类型**：逻辑控制
- **说明**：更新：会话 / title（返回成功与否，接入层转发至 Service）
- **签名**：`updateSessionTitle(i: UpdateSessionTitleInput, o: UpdateSessionTitleOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:80
- **引用次数**：9

#### `checkSessionOverflow`

- **类型**：逻辑控制
- **说明**：判断校验：会话 / overflow（返回成功与否，接入层转发至 Service）
- **签名**：`checkSessionOverflow(i: CheckSessionOverflowInput, o: CheckSessionOverflowOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:87
- **引用次数**：13

#### `soChatHistory`

- **类型**：逻辑控制
- **说明**：查询：chat / 历史（返回成功与否，接入层转发至 Service）
- **签名**：`soChatHistory(i: GetChatHistoryInput, o: GetChatHistoryOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:94
- **引用次数**：22

#### `soMessage`

- **类型**：逻辑控制
- **说明**：查询：消息（返回成功与否，接入层转发至 Service）
- **签名**：`soMessage(i: SearchMessageInput, o: SearchMessageOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:101
- **引用次数**：17

#### `pinMessage`

- **类型**：逻辑控制
- **说明**：处理 钉住 / 消息（返回成功与否，接入层转发至 Service）
- **签名**：`pinMessage(i: PinMessageInput, o: PinMessageOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:108
- **引用次数**：13

#### `soMessageGraph`

- **类型**：逻辑控制
- **说明**：查询：消息 / 图（返回成功与否，接入层转发至 Service）
- **签名**：`soMessageGraph(i: GetMessageGraphInput, o: GetMessageGraphOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:115
- **引用次数**：10

#### `openChatStream`

- **类型**：逻辑控制
- **说明**：启动：chat / 流（返回成功与否，接入层转发至 Service）
- **签名**：`openChatStream(i: OpenChatStreamInput, o: OpenChatStreamOutput, c: ChatContext, metrics?: Metrics, report?: Report, onEvent?: (event: SSEEvent) => void): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:122
- **引用次数**：16

#### `configChat`

- **类型**：逻辑控制
- **说明**：处理 配置 / chat（返回成功与否，接入层转发至 Service）
- **签名**：`configChat(i: ConfigChatInput, o: ConfigChatOutput, c: ChatContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/access/ChatAccess.ts:132
- **引用次数**：18

## 文件 `brian-backend/Application/Chat/application/ChatService.ts`

### ChatService

#### `openChatStream`

- **类型**：通用算法
- **说明**：启动：chat / 流（纯计算，无外部 IO）
- **签名**：`openChatStream(input: OpenChatStreamInput, output: OpenChatStreamOutput, context: ChatContext, metrics?: Metrics, report?: Report, onEvent?: (event: SSEEvent) => void): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:80
- **引用次数**：16

#### `openChatStreamV2`

- **类型**：数据处理
- **说明**：启动：chat / 流 / v2
- **签名**：`openChatStreamV2(input: OpenChatStreamInput, output: OpenChatStreamOutput, context: ChatContext, metrics?: Metrics, report?: Report, onEvent?: (event: SSEEvent) => void): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:107
- **引用次数**：3

### ChatService（私有）

#### `syncRuntimeMessagesToInfoRaw`

- **类型**：数据处理
- **说明**：处理 runtime / messages / 信息 / raw（操作关系数据库）
- **签名**：`syncRuntimeMessagesToInfoRaw(runtimeSessionId: string, chatSessionId: string, runId: string, traceId: string, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:202
- **引用次数**：3

### ChatService

#### `createSession`

- **类型**：数据处理
- **说明**：写入/新增：会话（操作关系数据库）
- **签名**：`createSession(input: CreateSessionInput, output: CreateSessionOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:298
- **引用次数**：34

#### `deleteSession`

- **类型**：数据处理
- **说明**：删除/清理：会话
- **签名**：`deleteSession(input: DeleteSessionInput, output: DeleteSessionOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:324
- **引用次数**：27

### ChatService（私有）

#### `deleteSingleSession`

- **类型**：数据处理
- **说明**：删除/清理：single / 会话（操作关系数据库）
- **签名**：`deleteSingleSession(sessionId: string, metrics?: Metrics): Promise<number>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:337
- **引用次数**：2

#### `deleteFeedbackForSession`

- **类型**：数据处理
- **说明**：删除/清理：反馈 / 会话（操作关系数据库）
- **签名**：`deleteFeedbackForSession(sessionId: string): Promise<void>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:360
- **引用次数**：2

#### `deleteWriterProfileForSession`

- **类型**：数据处理
- **说明**：删除/清理：写作 / 画像 / 会话（操作关系数据库）
- **签名**：`deleteWriterProfileForSession(sessionId: string): Promise<void>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:387
- **引用次数**：2

#### `deleteRuntimeDataForSession`

- **类型**：数据处理
- **说明**：删除/清理：runtime / 会话（操作关系数据库）
- **签名**：`deleteRuntimeDataForSession(sessionId: string): Promise<void>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:400
- **引用次数**：2

#### `deleteRuntimeMessages`

- **类型**：数据处理
- **说明**：删除/清理：runtime / messages（操作关系数据库）
- **签名**：`deleteRuntimeMessages(runtimeSessionIds: string[]): Promise<void>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:428
- **引用次数**：2

### ChatService

#### `purgeOrphanSessions`

- **类型**：数据处理
- **说明**：删除/清理：orphan / sessions（操作关系数据库）
- **签名**：`purgeOrphanSessions(input: PurgeOrphanSessionsInput, output: PurgeOrphanSessionsOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:444
- **引用次数**：8

#### `soSession`

- **类型**：通用算法
- **说明**：查询：会话（纯计算，无外部 IO）
- **签名**：`soSession(input: SearchSessionInput, output: SearchSessionOutput, _context: ChatContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:471
- **引用次数**：20

### ChatService（私有）

#### `writeEmptySessionPage`

- **类型**：逻辑控制
- **说明**：写入/新增：empty / 会话 / 页面
- **签名**：`writeEmptySessionPage(output: SearchSessionOutput): boolean`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:494
- **引用次数**：3

#### `soSessionIdsByKeyword`

- **类型**：数据处理
- **说明**：查询：会话 / ids / keyword（操作关系数据库）
- **签名**：`soSessionIdsByKeyword(keyword: string): string[]`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:500
- **引用次数**：2

#### `soSessionIdsByTimeRange`

- **类型**：数据处理
- **说明**：查询：会话 / ids / 时间 / range（操作关系数据库）
- **签名**：`soSessionIdsByTimeRange(startTime?: number, endTime?: number): string[]`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:509
- **引用次数**：2

#### `soSessionPage`

- **类型**：数据处理
- **说明**：查询：会话 / 页面（操作关系数据库）
- **签名**：`soSessionPage(input: SearchSessionInput, conditions: Condition[]): Promise<SelectDBOutput>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:527
- **引用次数**：2

#### `soSessionAggregateMaps`

- **类型**：通用算法
- **说明**：查询：会话 / aggregate / maps（纯计算，无外部 IO）
- **签名**：`soSessionAggregateMaps(sessionIds: string[], metrics?: Metrics): SessionAggregateMaps`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:545
- **引用次数**：2

#### `soSessionQaStats`

- **类型**：数据处理
- **说明**：查询：会话 / qa / stats（操作关系数据库）
- **签名**：`soSessionQaStats(sessionIds: string[], metrics?: Metrics): Map<string, { qa_count: number; question_chars: number; answer_chars: number }>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:558
- **引用次数**：2

#### `soSessionTags`

- **类型**：数据处理
- **说明**：查询：会话 / tags（操作关系数据库）
- **签名**：`soSessionTags(sessionIds: string[], metrics?: Metrics): Map<string, string[]>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:587
- **引用次数**：2

#### `soSessionTokenStats`

- **类型**：数据处理
- **说明**：查询：会话 / Token / stats（操作关系数据库）
- **签名**：`soSessionTokenStats(sessionIds: string[], metrics?: Metrics): Map<string, { input_tokens: number; output_tokens: number }>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:617
- **引用次数**：2

#### `aggregateTraceTokenRows`

- **类型**：数据处理
- **说明**：计算统计：执行轨迹 / Token / rows
- **签名**：`aggregateTraceTokenRows(traceRows: Array<{ session_id: string; trace_id: string; iterations_json: string; total_token_usage: number }>, tokenMap: Map<string, { input_tokens: number; output_tokens: number }>, metrics?: Metrics): void`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:641
- **引用次数**：2

#### `soSessionMessageCount`

- **类型**：数据处理
- **说明**：查询：会话 / 消息 / 数量（操作关系数据库）
- **签名**：`soSessionMessageCount(sessionIds: string[]): Map<string, number>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:670
- **引用次数**：2

#### `soSessionLastMessage`

- **类型**：数据处理
- **说明**：查询：会话 / 消息（操作关系数据库）
- **签名**：`soSessionLastMessage(sessionIds: string[], metrics?: Metrics): Map<string, { time: number; msg: string }>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:683
- **引用次数**：2

#### `countSessionTotal`

- **类型**：数据处理
- **说明**：计算统计：会话 / total（操作关系数据库）
- **签名**：`countSessionTotal(conditions: Condition[], metrics?: Metrics): Promise<number>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:709
- **引用次数**：2

### ChatService

#### `soSessionDetail`

- **类型**：数据处理
- **说明**：查询：会话 / detail（操作关系数据库）
- **签名**：`soSessionDetail(input: GetSessionDetailInput, output: GetSessionDetailOutput, _context: ChatContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:727
- **引用次数**：11

#### `updateSessionTitle`

- **类型**：数据处理
- **说明**：更新：会话 / title（操作关系数据库）
- **签名**：`updateSessionTitle(input: UpdateSessionTitleInput, _output: UpdateSessionTitleOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:770
- **引用次数**：9

#### `checkSessionOverflow`

- **类型**：数据处理
- **说明**：判断校验：会话 / overflow（操作关系数据库）
- **签名**：`checkSessionOverflow(input: CheckSessionOverflowInput, output: CheckSessionOverflowOutput, _context: ChatContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:801
- **引用次数**：13

#### `soChatHistory`

- **类型**：数据处理
- **说明**：查询：chat / 历史（操作关系数据库）
- **签名**：`soChatHistory(input: GetChatHistoryInput, output: GetChatHistoryOutput, _context: ChatContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:846
- **引用次数**：22

#### `soMessage`

- **类型**：数据处理
- **说明**：查询：消息（操作关系数据库）
- **签名**：`soMessage(input: SearchMessageInput, output: SearchMessageOutput, _context: ChatContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:941
- **引用次数**：17

#### `pinMessage`

- **类型**：数据处理
- **说明**：处理 钉住 / 消息（操作关系数据库）
- **签名**：`pinMessage(input: PinMessageInput, output: PinMessageOutput, _context: ChatContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:1009
- **引用次数**：13

#### `soMessageGraph`

- **类型**：逻辑控制
- **说明**：查询：消息 / 图（返回成功与否，异步编排）
- **签名**：`soMessageGraph(input: GetMessageGraphInput, output: GetMessageGraphOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:1060
- **引用次数**：10

#### `configChat`

- **类型**：数据处理
- **说明**：处理 配置 / chat（操作关系数据库）
- **签名**：`configChat(input: ConfigChatInput, output: ConfigChatOutput, _context: ChatContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:1084
- **引用次数**：18

### ChatService（私有）

#### `autoGenerateSessionTitleIfEmpty`

- **类型**：数据处理
- **说明**：处理 auto / generate / 会话 / title（操作关系数据库）
- **签名**：`autoGenerateSessionTitleIfEmpty(sessionId: string, msgContent: string, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:1149
- **引用次数**：3

#### `checkSessionExists`

- **类型**：数据处理
- **说明**：判断校验：会话 / exists（操作关系数据库）
- **签名**：`checkSessionExists(sessionId: string): Promise<boolean>`
- **位置**：brian-backend/Application/Chat/application/ChatService.ts:1184
- **引用次数**：2

## 文件 `brian-backend/Application/Chat/domain/services/SessionSearchDomainService.ts`

### 模块级函数

#### `toTraceTokenUsage`

- **类型**：数据处理
- **说明**：格式化/序列化：执行轨迹 / Token / 用量（反序列化）
- **签名**：`toTraceTokenUsage(iterationsJson: string, fallbackTotalTokens: number): { input_tokens: number; output_tokens: number }`
- **位置**：brian-backend/Application/Chat/domain/services/SessionSearchDomainService.ts:16
- **引用次数**：3

#### `toSessionSummaries`

- **类型**：数据处理
- **说明**：格式化/序列化：会话 / summaries
- **签名**：`toSessionSummaries(rows: Array<Record<string, unknown>>, maps: SessionAggregateMaps): SearchSessionOutput['sessions']`
- **位置**：brian-backend/Application/Chat/domain/services/SessionSearchDomainService.ts:40
- **引用次数**：3

## 文件 `brian-backend/Application/Chat/infrastructure/ChatSchemaInitializer.ts`

### ChatSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Application/Chat/infrastructure/ChatSchemaInitializer.ts:6
- **引用次数**：99

