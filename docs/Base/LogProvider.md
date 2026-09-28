# Base / LogProvider

- 层：**Base**　模块：**LogProvider**
- 方法数：**37**（逻辑控制 18 · 数据处理 16 · 通用算法 3）

## 文件 `brian-backend/Base/LogProvider/access/LogAccess.ts`

### LogAccess

#### `getRelationDb`

- **类型**：数据处理
- **说明**：获取：关系 / db（操作关系数据库，接入层转发至 Service）
- **签名**：`getRelationDb(): RelationDBAccess`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:58
- **引用次数**：2

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:63
- **引用次数**：272

#### `getRawService`

- **类型**：逻辑控制
- **说明**：获取：raw / Service（接入层转发至 Service）
- **签名**：`getRawService(): LogService`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:69
- **引用次数**：12

#### `addLog`

- **类型**：逻辑控制
- **说明**：写入/新增：日志（接入层转发至 Service）
- **签名**：`addLog(i: AddLogInput, o: AddLogOutput, c: LogContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:73
- **引用次数**：58

#### `soLogById`

- **类型**：逻辑控制
- **说明**：查询：日志 / 标识（接入层转发至 Service）
- **签名**：`soLogById(i: GetLogInput, o: GetLogOutput, c: LogContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:76
- **引用次数**：7

#### `soLog`

- **类型**：逻辑控制
- **说明**：查询：日志（接入层转发至 Service）
- **签名**：`soLog(i: SoLogInput, o: SoLogOutput, c: LogContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:79
- **引用次数**：22

#### `delLog`

- **类型**：逻辑控制
- **说明**：删除/清理：日志（接入层转发至 Service）
- **签名**：`delLog(i: DelLogInput, o: DelLogOutput, c: LogContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:82
- **引用次数**：12

#### `countLog`

- **类型**：逻辑控制
- **说明**：计算统计：日志（接入层转发至 Service）
- **签名**：`countLog(i: CountLogInput, o: CountLogOutput, c: LogContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:85
- **引用次数**：11

#### `visualizedLog`

- **类型**：逻辑控制
- **说明**：处理 visualized / 日志（接入层转发至 Service）
- **签名**：`visualizedLog(i: VisualizedLogInput, o: VisualizedLogOutput, c: LogContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:88
- **引用次数**：12

#### `enableLog`

- **类型**：逻辑控制
- **说明**：界面控制：日志（接入层转发至 Service）
- **签名**：`enableLog(i: EnableLogInput, o: EnableLogOutput, c: LogContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:91
- **引用次数**：21

#### `configLog`

- **类型**：逻辑控制
- **说明**：处理 配置 / 日志（接入层转发至 Service）
- **签名**：`configLog(i: ConfigLogInput, o: ConfigLogOutput, c: LogContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:94
- **引用次数**：16

#### `queryLogs`

- **类型**：逻辑控制
- **说明**：查询：logs（接入层转发至 Service）
- **签名**：`queryLogs(options: { level?: string; source?: string; keyword?: string; trace_id?: string; work_id?: string; run_id?: string; log_source?: string; start_time?: number; end_time?: number; page?: number; pageSize?: number; })`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:97
- **引用次数**：43

#### `soLogStats`

- **类型**：逻辑控制
- **说明**：查询：日志 / stats（接入层转发至 Service）
- **签名**：`soLogStats(options?: { start_time?: number; end_time?: number })`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:106
- **引用次数**：3

#### `listSources`

- **类型**：逻辑控制
- **说明**：查询：sources（接入层转发至 Service）
- **签名**：`listSources()`
- **位置**：brian-backend/Base/LogProvider/access/LogAccess.ts:109
- **引用次数**：4

## 文件 `brian-backend/Base/LogProvider/application/LogService.ts`

### LogService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:67
- **引用次数**：272

### LogService（私有）

#### `loadRules`

- **类型**：数据处理
- **说明**：获取：rules（操作关系数据库）
- **签名**：`loadRules(): Promise<void>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:86
- **引用次数**：3

### LogService

#### `shouldLog`

- **类型**：逻辑控制
- **说明**：判断校验：日志（遍历调度）
- **签名**：`shouldLog(source: string, method: string): boolean`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:97
- **引用次数**：16

#### `applyAging`

- **类型**：数据处理
- **说明**：更新：aging（操作关系数据库）
- **签名**：`applyAging(metrics?: Metrics): Promise<number>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:124
- **引用次数**：9

### LogService（私有）

#### `scheduleAging`

- **类型**：逻辑控制
- **说明**：处理 schedule / aging
- **签名**：`scheduleAging(metrics?: Metrics): void`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:159
- **引用次数**：2

### LogService

#### `addLog`

- **类型**：数据处理
- **说明**：写入/新增：日志（操作关系数据库，序列化输出）
- **签名**：`addLog(input: AddLogInput, output: AddLogOutput, _context: LogContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:167
- **引用次数**：58

### LogService（私有）

#### `shouldDropByMinLevel`

- **类型**：通用算法
- **说明**：判断校验：drop / min / level（纯计算，无外部 IO）
- **签名**：`shouldDropByMinLevel(level: string): boolean`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:213
- **引用次数**：2

#### `rowToLogRecord`

- **类型**：逻辑控制
- **说明**：处理 row / 日志 / record
- **签名**：`rowToLogRecord(row: Record<string, unknown>): LogRecord`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:222
- **引用次数**：7

### LogService

#### `soLogById`

- **类型**：数据处理
- **说明**：查询：日志 / 标识（操作关系数据库）
- **签名**：`soLogById(input: GetLogInput, output: GetLogOutput, _context: LogContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:226
- **引用次数**：7

#### `soLog`

- **类型**：数据处理
- **说明**：查询：日志（操作关系数据库）
- **签名**：`soLog(input: SoLogInput, output: SoLogOutput, _context: LogContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:258
- **引用次数**：22

#### `delLog`

- **类型**：数据处理
- **说明**：删除/清理：日志（操作关系数据库）
- **签名**：`delLog(input: DelLogInput, output: DelLogOutput, _context: LogContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:278
- **引用次数**：12

#### `countLog`

- **类型**：数据处理
- **说明**：计算统计：日志（操作关系数据库）
- **签名**：`countLog(input: CountLogInput, output: CountLogOutput, _context: LogContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:315
- **引用次数**：11

#### `visualizedLog`

- **类型**：数据处理
- **说明**：处理 visualized / 日志（操作关系数据库）
- **签名**：`visualizedLog(input: VisualizedLogInput, output: VisualizedLogOutput, _context: LogContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:340
- **引用次数**：12

### LogService（私有）

#### `ensureEnabled`

- **类型**：逻辑控制
- **说明**：确保就绪：enabled
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:390
- **引用次数**：118

### LogService

#### `enableLog`

- **类型**：数据处理
- **说明**：界面控制：日志（操作关系数据库）
- **签名**：`enableLog(input: EnableLogInput, _output: EnableLogOutput, _context: LogContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:396
- **引用次数**：21

#### `configLog`

- **类型**：通用算法
- **说明**：处理 配置 / 日志（纯计算，无外部 IO）
- **签名**：`configLog(input: ConfigLogInput, output: ConfigLogOutput, _context: LogContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:437
- **引用次数**：16

#### `queryLogs`

- **类型**：数据处理
- **说明**：查询：logs（操作关系数据库）
- **签名**：`queryLogs(options: { level?: string; source?: string; keyword?: string; trace_id?: string; work_id?: string; run_id?: string; log_source?: string; start_time?: number; end_time?: number; page?: number; pageSize?: number; }): Promise<{ logs: LogRecord[]; total: number }>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:489
- **引用次数**：43

#### `soLogStats`

- **类型**：数据处理
- **说明**：查询：日志 / stats（操作关系数据库）
- **签名**：`soLogStats(options?: { start_time?: number; end_time?: number; }): Promise<{ distribution: Array<{ level: string; count: number }> }>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:551
- **引用次数**：3

#### `listSources`

- **类型**：数据处理
- **说明**：查询：sources（操作关系数据库）
- **签名**：`listSources(): Promise<string[]>`
- **位置**：brian-backend/Base/LogProvider/application/LogService.ts:581
- **引用次数**：4

## 文件 `brian-backend/Base/LogProvider/domain/services/LogDomainService.ts`

### 模块级函数

#### `buildLogConditions`

- **类型**：通用算法
- **说明**：构建/初始化：日志 / conditions（纯计算，无外部 IO）
- **签名**：`buildLogConditions(input: Partial<Pick<LogRecord, 'level' \| 'source' \| 'trace_id' \| 'work_id' \| 'run_id'>> & { keyword?: string; start_time?: number; end_time?: number; }): Condition[] \| undefined`
- **位置**：brian-backend/Base/LogProvider/domain/services/LogDomainService.ts:5
- **引用次数**：3

#### `rowToLogRecord`

- **类型**：数据处理
- **说明**：处理 row / 日志 / record（反序列化）
- **签名**：`rowToLogRecord(row: Record<string, unknown>): LogRecord`
- **位置**：brian-backend/Base/LogProvider/domain/services/LogDomainService.ts:24
- **引用次数**：7

## 文件 `brian-backend/Base/LogProvider/infrastructure/LogSchemaInitializer.ts`

### LogSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/LogProvider/infrastructure/LogSchemaInitializer.ts:7
- **引用次数**：99

## 文件 `brian-backend/Base/LogProvider/interceptor/LogInterceptor.ts`

### LogInterceptor

#### `afterExecute`

- **类型**：数据处理
- **说明**：处理 after / execute
- **签名**：`afterExecute(ctx: InterceptContext, error?: Error): void`
- **位置**：brian-backend/Base/LogProvider/interceptor/LogInterceptor.ts:13
- **引用次数**：18

