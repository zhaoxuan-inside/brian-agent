# Base / MQProvider

- 层：**Base**　模块：**MQProvider**
- 方法数：**28**（逻辑控制 18 · 数据处理 10 · 通用算法 0）

## 文件 `brian-backend/Base/MQProvider/access/MQAccess.ts`

### MQAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/MQProvider/access/MQAccess.ts:40
- **引用次数**：272

#### `sendMQ`

- **类型**：逻辑控制
- **说明**：发送通知：mq（返回成功与否，接入层转发至 Service）
- **签名**：`sendMQ(input: SendMQInput, output: SendMQOutput, context: MQContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/access/MQAccess.ts:45
- **引用次数**：78

#### `consumeMQ`

- **类型**：逻辑控制
- **说明**：处理 consume / mq（返回成功与否，接入层转发至 Service）
- **签名**：`consumeMQ(input: ConsumeMQInput, output: ConsumeMQOutput, context: MQContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/access/MQAccess.ts:51
- **引用次数**：56

#### `ackMQ`

- **类型**：逻辑控制
- **说明**：处理 ack / mq（返回成功与否，接入层转发至 Service）
- **签名**：`ackMQ(input: AckMQInput, output: AckMQOutput, context: MQContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/access/MQAccess.ts:57
- **引用次数**：23

#### `nackMQ`

- **类型**：逻辑控制
- **说明**：处理 nack / mq（返回成功与否，接入层转发至 Service）
- **签名**：`nackMQ(input: NackMQInput, output: NackMQOutput, context: MQContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/access/MQAccess.ts:63
- **引用次数**：20

#### `soQueueStats`

- **类型**：逻辑控制
- **说明**：查询：队列 / stats（返回成功与否，接入层转发至 Service）
- **签名**：`soQueueStats(input: GetQueueStatsInput, output: GetQueueStatsOutput, context: MQContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/access/MQAccess.ts:69
- **引用次数**：24

#### `enableMQ`

- **类型**：逻辑控制
- **说明**：界面控制：mq（返回成功与否，接入层转发至 Service）
- **签名**：`enableMQ(input: EnableMQInput, output: EnableMQOutput, context: MQContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/access/MQAccess.ts:75
- **引用次数**：27

#### `closeMQ`

- **类型**：逻辑控制
- **说明**：删除/清理：mq（返回成功与否，接入层转发至 Service）
- **签名**：`closeMQ(input: CloseMQInput, output: CloseMQOutput, context: MQContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/access/MQAccess.ts:81
- **引用次数**：16

#### `cleanupExpiredMessages`

- **类型**：逻辑控制
- **说明**：删除/清理：expired / messages（接入层转发至 Service）
- **签名**：`cleanupExpiredMessages(): Promise<number>`
- **位置**：brian-backend/Base/MQProvider/access/MQAccess.ts:87
- **引用次数**：5

#### `recoverStuckMessages`

- **类型**：逻辑控制
- **说明**：处理 recover / stuck / messages（接入层转发至 Service）
- **签名**：`recoverStuckMessages(queue?: string): Promise<number>`
- **位置**：brian-backend/Base/MQProvider/access/MQAccess.ts:92
- **引用次数**：4

#### `replayMQ`

- **类型**：逻辑控制
- **说明**：处理 replay / mq（返回成功与否，接入层转发至 Service）
- **签名**：`replayMQ(messageId: string): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/access/MQAccess.ts:97
- **引用次数**：3

## 文件 `brian-backend/Base/MQProvider/application/MQService.ts`

### MQService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:54
- **引用次数**：272

#### `enableMQ`

- **类型**：逻辑控制
- **说明**：界面控制：mq（返回成功与否，异步编排）
- **签名**：`enableMQ(input: EnableMQInput, _output: EnableMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:68
- **引用次数**：27

#### `closeMQ`

- **类型**：逻辑控制
- **说明**：删除/清理：mq（返回成功与否，异步编排）
- **签名**：`closeMQ(_input: CloseMQInput, _output: CloseMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:80
- **引用次数**：16

### MQService（私有）

#### `ensureEnabled`

- **类型**：逻辑控制
- **说明**：确保就绪：enabled
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:90
- **引用次数**：118

#### `toMessageRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：消息 / record（反序列化）
- **签名**：`toMessageRecord(row: Record<string, unknown>): MessageRecord`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:101
- **引用次数**：2

### MQService

#### `sendMQ`

- **类型**：数据处理
- **说明**：发送通知：mq（操作关系数据库，序列化输出）
- **签名**：`sendMQ(input: SendMQInput, output: SendMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:136
- **引用次数**：78

### MQService（私有）

#### `resolvePriority`

- **类型**：逻辑控制
- **说明**：获取：priority（异步编排）
- **签名**：`resolvePriority(priority: number \| null \| undefined): Promise<number>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:164
- **引用次数**：2

### MQService

#### `consumeMQ`

- **类型**：数据处理
- **说明**：处理 consume / mq（操作关系数据库）
- **签名**：`consumeMQ(input: ConsumeMQInput, output: ConsumeMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:172
- **引用次数**：56

#### `ackMQ`

- **类型**：数据处理
- **说明**：处理 ack / mq（操作关系数据库）
- **签名**：`ackMQ(input: AckMQInput, output: AckMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:226
- **引用次数**：23

#### `nackMQ`

- **类型**：数据处理
- **说明**：处理 nack / mq（操作关系数据库）
- **签名**：`nackMQ(input: NackMQInput, output: NackMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:255
- **引用次数**：20

#### `soQueueStats`

- **类型**：数据处理
- **说明**：查询：队列 / stats（操作关系数据库）
- **签名**：`soQueueStats(input: GetQueueStatsInput, output: GetQueueStatsOutput, _context: MQContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:332
- **引用次数**：24

#### `cleanupExpiredMessages`

- **类型**：数据处理
- **说明**：删除/清理：expired / messages（操作关系数据库）
- **签名**：`cleanupExpiredMessages(): Promise<number>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:389
- **引用次数**：5

#### `recoverStuckMessages`

- **类型**：数据处理
- **说明**：处理 recover / stuck / messages（操作关系数据库）
- **签名**：`recoverStuckMessages(queue?: string): Promise<number>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:413
- **引用次数**：4

#### `replayMQ`

- **类型**：数据处理
- **说明**：处理 replay / mq（操作关系数据库）
- **签名**：`replayMQ(messageId: string): Promise<boolean>`
- **位置**：brian-backend/Base/MQProvider/application/MQService.ts:440
- **引用次数**：3

## 文件 `brian-backend/Base/MQProvider/domain/services/MQDomainService.ts`

### 模块级函数

#### `validateSendMessage`

- **类型**：逻辑控制
- **说明**：判断校验：消息
- **签名**：`validateSendMessage(data: MessageData \| undefined): void`
- **位置**：brian-backend/Base/MQProvider/domain/services/MQDomainService.ts:4
- **引用次数**：3

#### `validatePriority`

- **类型**：逻辑控制
- **说明**：判断校验：priority
- **签名**：`validatePriority(priority: number): void`
- **位置**：brian-backend/Base/MQProvider/domain/services/MQDomainService.ts:16
- **引用次数**：3

## 文件 `brian-backend/Base/MQProvider/infrastructure/MQSchemaInitializer.ts`

### MQSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/MQProvider/infrastructure/MQSchemaInitializer.ts:8
- **引用次数**：99

