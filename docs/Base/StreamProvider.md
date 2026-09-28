# Base / StreamProvider

- 层：**Base**　模块：**StreamProvider**
- 方法数：**24**（逻辑控制 11 · 数据处理 11 · 通用算法 2）

## 文件 `brian-backend/Base/StreamProvider/access/StreamAccess.ts`

### StreamAccess

#### `registerStream`

- **类型**：逻辑控制
- **说明**：写入/新增：流（返回成功与否，接入层转发至 Service）
- **签名**：`registerStream(input: RegisterStreamInput, output: RegisterStreamOutput, _context: StreamContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/access/StreamAccess.ts:31
- **引用次数**：16

#### `publishEvent`

- **类型**：逻辑控制
- **说明**：发送通知：事件（返回成功与否，接入层转发至 Service）
- **签名**：`publishEvent(i: PushEventToEndpointInput, o: PushEventToEndpointOutput, _c: StreamContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/access/StreamAccess.ts:37
- **引用次数**：11

#### `replayEvents`

- **类型**：逻辑控制
- **说明**：处理 replay / events（返回成功与否，接入层转发至 Service）
- **签名**：`replayEvents(i: ReplayEndpointEventsInput, o: ReplayEndpointEventsOutput, _c: StreamContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/access/StreamAccess.ts:43
- **引用次数**：11

#### `pushStream`

- **类型**：逻辑控制
- **说明**：写入/新增：流（返回成功与否，接入层转发至 Service）
- **签名**：`pushStream(input: PushStreamInput<T>, _context: StreamContext, output: PushStreamOutput): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/access/StreamAccess.ts:48
- **引用次数**：5

#### `closeStream`

- **类型**：逻辑控制
- **说明**：删除/清理：流（返回成功与否，接入层转发至 Service）
- **签名**：`closeStream(input: CloseStreamInput, output: CloseStreamOutput, _context: StreamContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/access/StreamAccess.ts:56
- **引用次数**：6

#### `soStreamStats`

- **类型**：逻辑控制
- **说明**：查询：流 / stats（返回成功与否，接入层转发至 Service）
- **签名**：`soStreamStats(_context: StreamContext, output: GetStreamStatsOutput): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/access/StreamAccess.ts:61
- **引用次数**：3

#### `configStream`

- **类型**：逻辑控制
- **说明**：处理 配置 / 流（返回成功与否，接入层转发至 Service）
- **签名**：`configStream(input: ConfigStreamInput, output: ConfigStreamOutput, _context: StreamContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/access/StreamAccess.ts:68
- **引用次数**：4

#### `pushText`

- **类型**：逻辑控制
- **说明**：写入/新增：文本（返回成功与否）
- **签名**：`pushText(sessionId: string, event: string, text: string, meta?: { run_id?: string; work_id?: string; agent_id?: string; agent_name?: string; agent_type?: string; node_id?: string; task_id?: string; chunk_delay_ms?: number; }): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/access/StreamAccess.ts:79
- **引用次数**：9

#### `pushEvent`

- **类型**：逻辑控制
- **说明**：写入/新增：事件（返回成功与否）
- **签名**：`pushEvent(sessionId: string, event: string, msgType: SSEMessageType, data: T, meta?: { run_id?: string; work_id?: string; agent_id?: string; agent_name?: string; agent_type?: string; node_id?: string; task_id?: string; }): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/access/StreamAccess.ts:115
- **引用次数**：19

## 文件 `brian-backend/Base/StreamProvider/application/StreamService.ts`

### StreamService

#### `getConfig`

- **类型**：数据处理
- **说明**：获取：配置（操作关系数据库）
- **签名**：`getConfig(): Promise<StreamConfigRecord>`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:54
- **引用次数**：69

#### `publishEvent`

- **类型**：数据处理
- **说明**：发送通知：事件
- **签名**：`publishEvent(input: { endpoint_id: string; session_key: string; run_id?: string; type: string; payload: unknown }, output: PushEventToEndpointOutput): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:82
- **引用次数**：11

### StreamService（私有）

#### `publishEventInternal`

- **类型**：数据处理
- **说明**：发送通知：事件 / internal（操作关系数据库，序列化输出）
- **签名**：`publishEventInternal(input: { endpoint_id: string; session_key: string; run_id?: string; type: string; payload: unknown }, output: PushEventToEndpointOutput): Promise<void>`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:98
- **引用次数**：2

#### `nextEventSeq`

- **类型**：数据处理
- **说明**：处理 事件 / seq（操作关系数据库）
- **签名**：`nextEventSeq(sessionKey: string): Promise<number>`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:136
- **引用次数**：2

#### `writeEventToEndpoint`

- **类型**：数据处理
- **说明**：写入/新增：事件 / 端点
- **签名**：`writeEventToEndpoint(endpointId: string, type: string, payload: unknown): boolean`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:152
- **引用次数**：3

#### `formatEventFrame`

- **类型**：逻辑控制
- **说明**：格式化/序列化：事件 / 框架
- **签名**：`formatEventFrame(type: string, payload: unknown): BrianSSEMessage`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:166
- **引用次数**：2

### StreamService

#### `replayEvents`

- **类型**：数据处理
- **说明**：处理 replay / events（操作关系数据库，反序列化）
- **签名**：`replayEvents(input: { endpoint_id: string; session_key: string; after_seq?: number }, output: ReplayEndpointEventsOutput): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:184
- **引用次数**：11

#### `registerStream`

- **类型**：通用算法
- **说明**：写入/新增：流（纯计算，无外部 IO）
- **签名**：`registerStream(input: RegisterStreamInput, output: RegisterStreamOutput): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:216
- **引用次数**：16

#### `pushStream`

- **类型**：数据处理
- **说明**：写入/新增：流
- **签名**：`pushStream(input: PushStreamInput<T>, output: PushStreamOutput): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:274
- **引用次数**：5

#### `closeStream`

- **类型**：逻辑控制
- **说明**：删除/清理：流（返回成功与否）
- **签名**：`closeStream(input: CloseStreamInput, output: CloseStreamOutput): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:385
- **引用次数**：6

#### `soStreamStats`

- **类型**：通用算法
- **说明**：查询：流 / stats（纯计算，无外部 IO）
- **签名**：`soStreamStats(output: GetStreamStatsOutput): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:396
- **引用次数**：3

#### `configStream`

- **类型**：数据处理
- **说明**：处理 配置 / 流（操作关系数据库）
- **签名**：`configStream(input: ConfigStreamInput, output: ConfigStreamOutput): Promise<boolean>`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:408
- **引用次数**：4

### StreamService（私有）

#### `writeFrame`

- **类型**：数据处理
- **说明**：写入/新增：框架（序列化输出）
- **签名**：`writeFrame(session: ActiveSessionStream, msg: BrianSSEMessage): void`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:437
- **引用次数**：4

#### `closeSessionInternal`

- **类型**：数据处理
- **说明**：删除/清理：会话 / internal
- **签名**：`closeSessionInternal(sessionId: string, reason?: string): boolean`
- **位置**：brian-backend/Base/StreamProvider/application/StreamService.ts:452
- **引用次数**：8

## 文件 `brian-backend/Base/StreamProvider/infrastructure/StreamSchemaInitializer.ts`

### StreamSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/StreamProvider/infrastructure/StreamSchemaInitializer.ts:8
- **引用次数**：99

