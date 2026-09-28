# Runtime / Session

- 层：**Runtime**　模块：**Session**
- 方法数：**33**（逻辑控制 13 · 数据处理 19 · 通用算法 1）

## 文件 `brian-backend/Runtime/Session/access/SessionAccess.ts`

### SessionAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Runtime/Session/access/SessionAccess.ts:31
- **引用次数**：272

#### `addSession`

- **类型**：逻辑控制
- **说明**：写入/新增：会话（返回成功与否，接入层转发至 Service）
- **签名**：`addSession(input: AddSessionInput, output: AddSessionOutput, context: SessionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/access/SessionAccess.ts:36
- **引用次数**：11

#### `addMessage`

- **类型**：逻辑控制
- **说明**：写入/新增：消息（返回成功与否，接入层转发至 Service）
- **签名**：`addMessage(input: AddMessageInput, output: AddMessageOutput, context: SessionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/access/SessionAccess.ts:42
- **引用次数**：15

#### `addPart`

- **类型**：逻辑控制
- **说明**：写入/新增：part（返回成功与否，接入层转发至 Service）
- **签名**：`addPart(input: AddPartInput, output: AddPartOutput, context: SessionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/access/SessionAccess.ts:48
- **引用次数**：7

#### `updatePart`

- **类型**：逻辑控制
- **说明**：更新：part（返回成功与否，接入层转发至 Service）
- **签名**：`updatePart(input: UpdatePartInput, output: UpdatePartOutput, context: SessionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/access/SessionAccess.ts:54
- **引用次数**：10

#### `soMessages`

- **类型**：逻辑控制
- **说明**：查询：messages（返回成功与否，接入层转发至 Service）
- **签名**：`soMessages(input: SoMessagesInput, output: SoMessagesOutput, context: SessionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/access/SessionAccess.ts:60
- **引用次数**：13

#### `configSession`

- **类型**：逻辑控制
- **说明**：处理 配置 / 会话（返回成功与否，接入层转发至 Service）
- **签名**：`configSession(input: ConfigSessionInput, output: ConfigSessionOutput, context: SessionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/access/SessionAccess.ts:66
- **引用次数**：4

## 文件 `brian-backend/Runtime/Session/application/SessionService.ts`

### SessionService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:54
- **引用次数**：272

### SessionService（私有）

#### `ensureEnabled`

- **类型**：逻辑控制
- **说明**：确保就绪：enabled
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:65
- **引用次数**：118

### SessionService

#### `addSession`

- **类型**：数据处理
- **说明**：写入/新增：会话（操作关系数据库）
- **签名**：`addSession(input: AddSessionInput, output: AddSessionOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:76
- **引用次数**：11

### SessionService（私有）

#### `soSessionRowByKey`

- **类型**：数据处理
- **说明**：查询：会话 / row / 键（操作关系数据库）
- **签名**：`soSessionRowByKey(sessionKey: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:102
- **引用次数**：2

### SessionService

#### `addMessage`

- **类型**：数据处理
- **说明**：写入/新增：消息（操作关系数据库）
- **签名**：`addMessage(input: AddMessageInput, output: AddMessageOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:113
- **引用次数**：15

### SessionService（私有）

#### `soSessionRowById`

- **类型**：数据处理
- **说明**：查询：会话 / row / 标识（操作关系数据库）
- **签名**：`soSessionRowById(sessionId: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:136
- **引用次数**：3

#### `nextMessageSeq`

- **类型**：数据处理
- **说明**：处理 消息 / seq
- **签名**：`nextMessageSeq(sessionId: string): Promise<number>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:143
- **引用次数**：2

#### `soNextSeqFromDb`

- **类型**：逻辑控制
- **说明**：查询：seq / db（异步编排）
- **签名**：`soNextSeqFromDb(sessionId: string): Promise<number>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:152
- **引用次数**：2

#### `bumpSessionLastSeq`

- **类型**：数据处理
- **说明**：处理 bump / 会话 / seq（操作关系数据库）
- **签名**：`bumpSessionLastSeq(sessionId: string, seq: number): Promise<void>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:158
- **引用次数**：2

### SessionService

#### `addPart`

- **类型**：数据处理
- **说明**：写入/新增：part（操作关系数据库）
- **签名**：`addPart(input: AddPartInput, output: AddPartOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:169
- **引用次数**：7

### SessionService（私有）

#### `soNextPartOrder`

- **类型**：数据处理
- **说明**：查询：part / order（操作关系数据库）
- **签名**：`soNextPartOrder(messageId: string): Promise<number>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:195
- **引用次数**：2

### SessionService

#### `updatePart`

- **类型**：数据处理
- **说明**：更新：part（操作关系数据库）
- **签名**：`updatePart(input: UpdatePartInput, _output: UpdatePartOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:205
- **引用次数**：10

### SessionService（私有）

#### `preparePartPatch`

- **类型**：逻辑控制
- **说明**：构建/初始化：part / patch
- **签名**：`preparePartPatch(input: UpdatePartInput): Record<string, unknown>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:223
- **引用次数**：2

#### `soPartRow`

- **类型**：数据处理
- **说明**：查询：part / row（操作关系数据库）
- **签名**：`soPartRow(partId: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:241
- **引用次数**：2

### SessionService

#### `soMessages`

- **类型**：通用算法
- **说明**：查询：messages（纯计算，无外部 IO）
- **签名**：`soMessages(input: SoMessagesInput, output: SoMessagesOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:252
- **引用次数**：13

### SessionService（私有）

#### `soMessageRows`

- **类型**：数据处理
- **说明**：查询：消息 / rows（操作关系数据库）
- **签名**：`soMessageRows(sessionId: string, limit: number, beforeSeq?: number): Promise<Array<Record<string, unknown>>>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:263
- **引用次数**：2

#### `soPartsByMessageIds`

- **类型**：数据处理
- **说明**：查询：parts / 消息 / ids（操作关系数据库）
- **签名**：`soPartsByMessageIds(messageIds: string[]): Promise<Map<string, PartRecord[]>>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:277
- **引用次数**：2

#### `assembleMessagesWithParts`

- **类型**：数据处理
- **说明**：构建/初始化：messages / parts
- **签名**：`assembleMessagesWithParts(rows: Array<Record<string, unknown>>, partsByMessage: Map<string, PartRecord[]>): MessageWithParts[]`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:299
- **引用次数**：2

#### `toPartRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：part / record
- **签名**：`toPartRecord(p: Record<string, unknown>): PartRecord`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:320
- **引用次数**：2

### SessionService

#### `configSession`

- **类型**：逻辑控制
- **说明**：处理 配置 / 会话（返回成功与否，异步编排）
- **签名**：`configSession(input: ConfigSessionInput, _output: ConfigSessionOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Session/application/SessionService.ts:346
- **引用次数**：4

## 文件 `brian-backend/Runtime/Session/infrastructure/SessionSchemaInitializer.ts`

### SessionSchemaInitializer

#### `init`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据
- **签名**：`init(): void`
- **位置**：brian-backend/Runtime/Session/infrastructure/SessionSchemaInitializer.ts:12
- **引用次数**：99

### SessionSchemaInitializer（私有）

#### `migrateTokenCountColumn`

- **类型**：数据处理
- **说明**：处理 migrate / Token / 数量 / 字段（操作关系数据库）
- **签名**：`migrateTokenCountColumn(): void`
- **位置**：brian-backend/Runtime/Session/infrastructure/SessionSchemaInitializer.ts:20
- **引用次数**：2

#### `initSessionTable`

- **类型**：数据处理
- **说明**：构建/初始化：会话 / 数据表（操作关系数据库）
- **签名**：`initSessionTable(): void`
- **位置**：brian-backend/Runtime/Session/infrastructure/SessionSchemaInitializer.ts:30
- **引用次数**：2

#### `initMessageTable`

- **类型**：数据处理
- **说明**：构建/初始化：消息 / 数据表（操作关系数据库）
- **签名**：`initMessageTable(): void`
- **位置**：brian-backend/Runtime/Session/infrastructure/SessionSchemaInitializer.ts:48
- **引用次数**：2

#### `initPartTable`

- **类型**：数据处理
- **说明**：构建/初始化：part / 数据表（操作关系数据库）
- **签名**：`initPartTable(): void`
- **位置**：brian-backend/Runtime/Session/infrastructure/SessionSchemaInitializer.ts:70
- **引用次数**：2

#### `initConfigTable`

- **类型**：数据处理
- **说明**：构建/初始化：配置 / 数据表（操作关系数据库）
- **签名**：`initConfigTable(): void`
- **位置**：brian-backend/Runtime/Session/infrastructure/SessionSchemaInitializer.ts:105
- **引用次数**：4

