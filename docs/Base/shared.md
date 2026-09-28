# Base / shared

- 层：**Base**　模块：**shared**
- 方法数：**55**（逻辑控制 28 · 数据处理 14 · 通用算法 13）

## 文件 `brian-backend/Base/shared/aop/AopProxy.ts`

### ConsoleLogger

#### `debug`

- **类型**：数据处理
- **说明**：处理 调试（序列化输出）
- **签名**：`debug(message: string, meta?: Record<string, unknown>): void`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:22
- **引用次数**：49

#### `error`

- **类型**：数据处理
- **说明**：处理 错误（序列化输出）
- **签名**：`error(message: string, meta?: Record<string, unknown>): void`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:27
- **引用次数**：1044

#### `log`

- **类型**：数据处理
- **说明**：写入/新增相关数据（序列化输出）
- **签名**：`log(level: string, message: string, meta?: Record<string, unknown>): void`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:33
- **引用次数**：153

### AopProxy（静态）

#### `wrap`

- **类型**：数据处理
- **说明**：处理 wrap
- **签名**：`wrap(target: T, options?: AopProxyOptions): T`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:115
- **引用次数**：144

### AopProxy（静态）（私有）

#### `runBeforeExecute`

- **类型**：逻辑控制
- **说明**：处理执行：before / execute（含异常兜底，遍历调度）
- **签名**：`runBeforeExecute(interceptors: Interceptor[], ctx: InterceptContext): void`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:288
- **引用次数**：3

#### `runPreExecute`

- **类型**：逻辑控制
- **说明**：处理执行：pre / execute（含异常兜底，遍历调度）
- **签名**：`runPreExecute(interceptors: Interceptor[], ctx: InterceptContext): void`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:306
- **引用次数**：3

#### `runPostExecute`

- **类型**：逻辑控制
- **说明**：处理执行：post / execute（含异常兜底，遍历调度）
- **签名**：`runPostExecute(interceptors: Interceptor[], ctx: InterceptContext, result: unknown): void`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:324
- **引用次数**：4

#### `runAfterExecute`

- **类型**：逻辑控制
- **说明**：处理执行：after / execute（含异常兜底，遍历调度）
- **签名**：`runAfterExecute(interceptors: Interceptor[], ctx: InterceptContext, error?: Error): void`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:343
- **引用次数**：6

#### `fillElapsed`

- **类型**：逻辑控制
- **说明**：处理 fill / elapsed
- **签名**：`fillElapsed(args: unknown[], elapsed: number): void`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:366
- **引用次数**：5

#### `createLoggerInterceptor`

- **类型**：数据处理
- **说明**：写入/新增：logger / interceptor
- **签名**：`createLoggerInterceptor(logger: Logger): Interceptor`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:385
- **引用次数**：3

#### `pickTraceId`

- **类型**：逻辑控制
- **说明**：获取：执行轨迹 / 标识
- **签名**：`pickTraceId(ctx: InterceptContext): string \| undefined`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:423
- **引用次数**：2

#### `pickField`

- **类型**：通用算法
- **说明**：获取：字段（纯计算，无外部 IO）
- **签名**：`pickField(input: unknown, field: string): string \| undefined`
- **位置**：brian-backend/Base/shared/aop/AopProxy.ts:430
- **引用次数**：8

## 文件 `brian-backend/Base/shared/base/BusinessEvent.ts`

### 模块级函数

#### `businessEventMsgType`

- **类型**：逻辑控制
- **说明**：处理 business / 事件 / msg / type
- **签名**：`businessEventMsgType(event: BusinessEvent): 'TEXT' \| 'TRACE'`
- **位置**：brian-backend/Base/shared/base/BusinessEvent.ts:112
- **引用次数**：9

## 文件 `brian-backend/Base/shared/base/InfoEnums.ts`

### 模块级函数

#### `classifyHandleResult`

- **类型**：通用算法
- **说明**：处理 classify / result（纯计算，无外部 IO）
- **签名**：`classifyHandleResult(error: unknown, source: HandleErrorSource): HandleResultType`
- **位置**：brian-backend/Base/shared/base/InfoEnums.ts:42
- **引用次数**：8

## 文件 `brian-backend/Base/shared/base/Metrics.ts`

### Metrics

#### `beginSpan`

- **类型**：逻辑控制
- **说明**：启动：span
- **签名**：`beginSpan(key: string): MetricsSpan`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:79
- **引用次数**：15

#### `endSpan`

- **类型**：通用算法
- **说明**：结束释放：span（纯计算，无外部 IO）
- **签名**：`endSpan(handle?: MetricsSpan): MetricsSpan \| undefined`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:94
- **引用次数**：18

#### `lastClosedSpan`

- **类型**：逻辑控制
- **说明**：处理 closed / span（遍历调度）
- **签名**：`lastClosedSpan(): MetricsSpan \| undefined`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:114
- **引用次数**：4

#### `spanDuration`

- **类型**：逻辑控制
- **说明**：处理 span / 耗时
- **签名**：`spanDuration(span: MetricsSpan): number`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:125
- **引用次数**：6

#### `spanSelfMs`

- **类型**：逻辑控制
- **说明**：处理 span / ms（遍历调度）
- **签名**：`spanSelfMs(span: MetricsSpan): number`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:133
- **引用次数**：7

#### `getTotalDuration`

- **类型**：通用算法
- **说明**：获取：total / 耗时（纯计算，无外部 IO）
- **签名**：`getTotalDuration(): number`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:148
- **引用次数**：5

#### `recordLLMUsage`

- **类型**：逻辑控制
- **说明**：写入/新增：大模型 / 用量
- **签名**：`recordLLMUsage(usage: LLMCallUsageMetrics): void`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:162
- **引用次数**：15

#### `debug`

- **类型**：逻辑控制
- **说明**：处理 调试
- **签名**：`debug(message: string, meta?: Record<string, unknown>): void`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:172
- **引用次数**：49

#### `info`

- **类型**：逻辑控制
- **说明**：处理 信息
- **签名**：`info(message: string, meta?: Record<string, unknown>): void`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:177
- **引用次数**：568

#### `warn`

- **类型**：逻辑控制
- **说明**：处理 warn
- **签名**：`warn(message: string, meta?: Record<string, unknown>): void`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:182
- **引用次数**：188

#### `error`

- **类型**：逻辑控制
- **说明**：处理 错误
- **签名**：`error(message: string, meta?: Record<string, unknown>): void`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:187
- **引用次数**：1044

#### `saveInvocation`

- **类型**：数据处理
- **说明**：写入/新增：invocation（序列化输出）
- **签名**：`saveInvocation(record: { targetName: string; methodName: string; status: 'ok' \| 'error'; error?: string; args: Record<string, unknown>; }): void`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:194
- **引用次数**：9

### Metrics（私有）

#### `logAt`

- **类型**：通用算法
- **说明**：写入/新增：at（纯计算，无外部 IO）
- **签名**：`logAt(level: string, message: string, meta?: Record<string, unknown>): void`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:225
- **引用次数**：2

### Metrics（静态）

#### `safeSerialize`

- **类型**：数据处理
- **说明**：处理 safe / serialize（序列化输出，反序列化）
- **签名**：`safeSerialize(value: unknown, maxChars: unknown): unknown`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:249
- **引用次数**：3

### Metrics

#### `start`

- **类型**：逻辑控制
- **说明**：启动相关数据
- **签名**：`start(): number`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:285
- **引用次数**：235

#### `end`

- **类型**：逻辑控制
- **说明**：结束释放相关数据
- **签名**：`end(): number`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:291
- **引用次数**：174

### Metrics（私有）

#### `prefix`

- **类型**：逻辑控制
- **说明**：处理 prefix
- **签名**：`prefix(message: string): string`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:298
- **引用次数**：281

#### `merge`

- **类型**：通用算法
- **说明**：转换归并相关数据（纯计算，无外部 IO）
- **签名**：`merge(meta?: Record<string, unknown>): Record<string, unknown>`
- **位置**：brian-backend/Base/shared/base/Metrics.ts:302
- **引用次数**：8

## 文件 `brian-backend/Base/shared/base/Report.ts`

### Report

#### `bindMetrics`

- **类型**：逻辑控制
- **说明**：更新：指标
- **签名**：`bindMetrics(metrics: Metrics): void`
- **位置**：brian-backend/Base/shared/base/Report.ts:60
- **引用次数**：3

### Report（静态）

#### `setEventStreamGateway`

- **类型**：逻辑控制
- **说明**：更新：事件 / 流 / gateway
- **签名**：`setEventStreamGateway(gateway: ReportEventStream \| null): void`
- **位置**：brian-backend/Base/shared/base/Report.ts:74
- **引用次数**：10

#### `setLogger`

- **类型**：逻辑控制
- **说明**：更新：logger
- **签名**：`setLogger(logger: { error: (msg: string, meta?: unknown) => void } \| null): void`
- **位置**：brian-backend/Base/shared/base/Report.ts:79
- **引用次数**：2

### Report

#### `pushText`

- **类型**：逻辑控制
- **说明**：写入/新增：文本
- **签名**：`pushText(event: string, text: string, meta?: Record<string, unknown>): void`
- **位置**：brian-backend/Base/shared/base/Report.ts:89
- **引用次数**：9

#### `pushEvent`

- **类型**：逻辑控制
- **说明**：写入/新增：事件
- **签名**：`pushEvent(event: string, msgType: string, data: unknown, meta?: Record<string, unknown>): void`
- **位置**：brian-backend/Base/shared/base/Report.ts:95
- **引用次数**：19

#### `pushBusinessEvent`

- **类型**：逻辑控制
- **说明**：写入/新增：business / 事件
- **签名**：`pushBusinessEvent(event: BusinessEvent, data: unknown, meta?: Record<string, unknown>): void`
- **位置**：brian-backend/Base/shared/base/Report.ts:102
- **引用次数**：61

#### `child`

- **类型**：逻辑控制
- **说明**：处理 child
- **签名**：`child(meta?: ReportMeta): Report`
- **位置**：brian-backend/Base/shared/base/Report.ts:146
- **引用次数**：38

### Report（私有）

#### `mergeMeta`

- **类型**：通用算法
- **说明**：转换归并：meta（纯计算，无外部 IO）
- **签名**：`mergeMeta(meta?: Record<string, unknown>): Record<string, unknown>`
- **位置**：brian-backend/Base/shared/base/Report.ts:162
- **引用次数**：3

## 文件 `brian-backend/Base/shared/config/ConfigService.ts`

### ConfigService

#### `getString`

- **类型**：通用算法
- **说明**：获取：string（纯计算，无外部 IO）
- **签名**：`getString(key: string, defaultValue?: string): Promise<string \| undefined>`
- **位置**：brian-backend/Base/shared/config/ConfigService.ts:75
- **引用次数**：19

#### `getInt`

- **类型**：通用算法
- **说明**：获取：int（纯计算，无外部 IO）
- **签名**：`getInt(key: string, defaultValue: number): Promise<number>`
- **位置**：brian-backend/Base/shared/config/ConfigService.ts:87
- **引用次数**：32

#### `getDouble`

- **类型**：通用算法
- **说明**：获取：double（纯计算，无外部 IO）
- **签名**：`getDouble(key: string, defaultValue: number): Promise<number>`
- **位置**：brian-backend/Base/shared/config/ConfigService.ts:98
- **引用次数**：7

#### `getBoolean`

- **类型**：通用算法
- **说明**：获取：boolean（纯计算，无外部 IO）
- **签名**：`getBoolean(key: string, defaultValue: boolean): Promise<boolean>`
- **位置**：brian-backend/Base/shared/config/ConfigService.ts:109
- **引用次数**：14

#### `set`

- **类型**：数据处理
- **说明**：更新相关数据
- **签名**：`set(key: string, value: unknown, valueType: ValueType \| string, description?: string): Promise<void>`
- **位置**：brian-backend/Base/shared/config/ConfigService.ts:119
- **引用次数**：224

#### `initDefaults`

- **类型**：数据处理
- **说明**：构建/初始化：defaults
- **签名**：`initDefaults(defaults: ConfigItem[]): Promise<void>`
- **位置**：brian-backend/Base/shared/config/ConfigService.ts:159
- **引用次数**：7

## 文件 `brian-backend/Base/shared/llm/CallLLMJson.ts`

### 模块级函数

#### `callLLMJson`

- **类型**：逻辑控制
- **说明**：处理 call / 大模型 / JSON（含异常兜底，遍历调度，异步编排）
- **签名**：`callLLMJson(llmAccess: LLMAccess, opts: CallLLMJsonOptions<T>): Promise<T \| null>`
- **位置**：brian-backend/Base/shared/llm/CallLLMJson.ts:26
- **引用次数**：6

## 文件 `brian-backend/Base/shared/native/NativeLoader.ts`

### 模块级函数

#### `getPlatformInfo`

- **类型**：数据处理
- **说明**：获取：platform / 信息
- **签名**：`getPlatformInfo(): PlatformInfo`
- **位置**：brian-backend/Base/shared/native/NativeLoader.ts:20
- **引用次数**：2

### NativeLoader（静态）

#### `load`

- **类型**：通用算法
- **说明**：获取相关数据（纯计算，无外部 IO）
- **签名**：`load(moduleName: string, basePath: string): LoadResult`
- **位置**：brian-backend/Base/shared/native/NativeLoader.ts:44
- **引用次数**：16

### NativeLoader（静态）（私有）

#### `requireNative`

- **类型**：逻辑控制
- **说明**：处理 require / native
- **签名**：`requireNative(modulePath: string, matchType: LoadResult['matchType']): LoadResult`
- **位置**：brian-backend/Base/shared/native/NativeLoader.ts:66
- **引用次数**：2

## 文件 `brian-backend/Base/shared/query/RecordBuilder.ts`

### 模块级函数

#### `toDataObject`

- **类型**：通用算法
- **说明**：格式化/序列化：object（纯计算，无外部 IO）
- **签名**：`toDataObject(partial: Record<string, unknown>): DataObject[]`
- **位置**：brian-backend/Base/shared/query/RecordBuilder.ts:4
- **引用次数**：5

#### `newRecord`

- **类型**：数据处理
- **说明**：处理 record
- **签名**：`newRecord(partial: Record<string, unknown>): DataObject[]`
- **位置**：brian-backend/Base/shared/query/RecordBuilder.ts:10
- **引用次数**：30

#### `newPatch`

- **类型**：数据处理
- **说明**：处理 patch
- **签名**：`newPatch(partial: Record<string, unknown>): DataObject[]`
- **位置**：brian-backend/Base/shared/query/RecordBuilder.ts:20
- **引用次数**：28

## 文件 `brian-backend/Base/shared/query/SchemaHelpers.ts`

### 模块级函数

#### `ensureColumn`

- **类型**：数据处理
- **说明**：确保就绪：字段（操作关系数据库）
- **签名**：`ensureColumn(db: RelationDBAccess, table: string, column: string, ddl: string): Promise<void>`
- **位置**：brian-backend/Base/shared/query/SchemaHelpers.ts:3
- **引用次数**：2

#### `ensureIndex`

- **类型**：数据处理
- **说明**：确保就绪：索引（操作关系数据库）
- **签名**：`ensureIndex(db: RelationDBAccess, table: string, columns: string[], unique: unknown): Promise<void>`
- **位置**：brian-backend/Base/shared/query/SchemaHelpers.ts:16
- **引用次数**：2

