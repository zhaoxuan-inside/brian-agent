# Base / ToolProvider

- 层：**Base**　模块：**ToolProvider**
- 方法数：**102**（逻辑控制 47 · 数据处理 12 · 通用算法 43）

## 文件 `brian-backend/Base/ToolProvider/access/HttpAccess.ts`

### HttpAccess

#### `execRequest`

- **类型**：逻辑控制
- **说明**：处理执行：request（返回成功与否，异步编排）
- **签名**：`execRequest(input: ExecRequestInput, output: ExecRequestOutput, _context: HttpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/HttpAccess.ts:18
- **引用次数**：18

## 文件 `brian-backend/Base/ToolProvider/access/SystemMonitorAccess.ts`

### SystemMonitorAccess

#### `soCpuUsage`

- **类型**：逻辑控制
- **说明**：查询：cpu / 用量（返回成功与否，接入层转发至 Service）
- **签名**：`soCpuUsage(_input: SoCpuUsageInput, output: SoCpuUsageOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/SystemMonitorAccess.ts:22
- **引用次数**：2

#### `soMemoryUsage`

- **类型**：逻辑控制
- **说明**：查询：记忆 / 用量（返回成功与否，接入层转发至 Service）
- **签名**：`soMemoryUsage(_input: SoMemoryUsageInput, output: SoMemoryUsageOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/SystemMonitorAccess.ts:28
- **引用次数**：2

#### `soDiskUsage`

- **类型**：逻辑控制
- **说明**：查询：disk / 用量（返回成功与否，接入层转发至 Service）
- **签名**：`soDiskUsage(input: SoDiskUsageInput, output: SoDiskUsageOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/SystemMonitorAccess.ts:34
- **引用次数**：2

#### `soResource`

- **类型**：逻辑控制
- **说明**：查询：resource（返回成功与否，接入层转发至 Service）
- **签名**：`soResource(input: SoResourceInput, output: SoResourceOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/SystemMonitorAccess.ts:40
- **引用次数**：24

## 文件 `brian-backend/Base/ToolProvider/access/ToolAccess.ts`

### ToolAccess

#### `generateId`

- **类型**：逻辑控制
- **说明**：构建/初始化：标识（返回成功与否，接入层转发至 Service）
- **签名**：`generateId(_input: GenerateIdInput, output: GenerateIdOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:27
- **引用次数**：11

#### `generateIds`

- **类型**：逻辑控制
- **说明**：构建/初始化：ids（返回成功与否，接入层转发至 Service）
- **签名**：`generateIds(input: GenerateIdsInput, output: GenerateIdsOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:33
- **引用次数**：9

#### `now`

- **类型**：逻辑控制
- **说明**：处理 now（返回成功与否，接入层转发至 Service）
- **签名**：`now(_input: NowInput, output: NowOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:39
- **引用次数**：1116

#### `today`

- **类型**：通用算法
- **说明**：格式化/序列化相关数据（纯计算，无外部 IO，接入层转发至 Service）
- **签名**：`today(_input: TodayInput, output: TodayOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:45
- **引用次数**：74

#### `jsonCheck`

- **类型**：逻辑控制
- **说明**：处理 JSON / check（返回成功与否，接入层转发至 Service）
- **签名**：`jsonCheck(input: JsonCheckInput, output: JsonCheckOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:51
- **引用次数**：10

#### `jsonFormat`

- **类型**：逻辑控制
- **说明**：处理 JSON / format（返回成功与否，接入层转发至 Service）
- **签名**：`jsonFormat(input: JsonFormatInput, output: JsonFormatOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:57
- **引用次数**：10

#### `jsonMinify`

- **类型**：逻辑控制
- **说明**：处理 JSON / minify（返回成功与否，接入层转发至 Service）
- **签名**：`jsonMinify(input: JsonMinifyInput, output: JsonMinifyOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:63
- **引用次数**：10

#### `xmlCheck`

- **类型**：逻辑控制
- **说明**：处理 xml / check（返回成功与否，接入层转发至 Service）
- **签名**：`xmlCheck(input: XmlCheckInput, output: XmlCheckOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:69
- **引用次数**：10

#### `xmlFormat`

- **类型**：逻辑控制
- **说明**：处理 xml / format（返回成功与否，接入层转发至 Service）
- **签名**：`xmlFormat(input: XmlFormatInput, output: XmlFormatOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:75
- **引用次数**：10

#### `xmlMinify`

- **类型**：逻辑控制
- **说明**：处理 xml / minify（返回成功与否，接入层转发至 Service）
- **签名**：`xmlMinify(input: XmlMinifyInput, output: XmlMinifyOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:81
- **引用次数**：9

#### `regexMatch`

- **类型**：逻辑控制
- **说明**：处理 regex / match（返回成功与否，接入层转发至 Service）
- **签名**：`regexMatch(input: RegexMatchInput, output: RegexMatchOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:87
- **引用次数**：10

#### `cronCheck`

- **类型**：逻辑控制
- **说明**：处理 定时任务 / check（返回成功与否，接入层转发至 Service）
- **签名**：`cronCheck(input: CronCheckInput, output: CronCheckOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:93
- **引用次数**：4

#### `cronGenerate`

- **类型**：逻辑控制
- **说明**：处理 定时任务 / generate（返回成功与否，接入层转发至 Service）
- **签名**：`cronGenerate(input: CronGenerateInput, output: CronGenerateOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:99
- **引用次数**：4

#### `cronParse`

- **类型**：逻辑控制
- **说明**：处理 定时任务 / parse（返回成功与否，接入层转发至 Service）
- **签名**：`cronParse(input: CronParseInput, output: CronParseOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:105
- **引用次数**：4

#### `cronNext`

- **类型**：逻辑控制
- **说明**：处理 定时任务 / next（返回成功与否，接入层转发至 Service）
- **签名**：`cronNext(input: CronNextInput, output: CronNextOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ToolProvider/access/ToolAccess.ts:111
- **引用次数**：4

## 文件 `brian-backend/Base/ToolProvider/application/HttpService.ts`

### HttpService

#### `getDefaultTimeout`

- **类型**：通用算法
- **说明**：获取：default / 超时（纯计算，无外部 IO）
- **签名**：`getDefaultTimeout(): Promise<number>`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:21
- **引用次数**：2

#### `request`

- **类型**：数据处理
- **说明**：处理 request（网络请求）
- **签名**：`request(req: HttpRequest): Promise<HttpResponse>`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:35
- **引用次数**：210

### HttpService（私有）

#### `directFetch`

- **类型**：数据处理
- **说明**：处理 direct / fetch（网络请求）
- **签名**：`directFetch(req: HttpRequest, timeoutMs: number): Promise<HttpResponse>`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:68
- **引用次数**：2

#### `proxyFetch`

- **类型**：逻辑控制
- **说明**：处理 代理 / fetch
- **签名**：`proxyFetch(req: HttpRequest, parsedUrl: URL, proxy: string, timeoutMs: number): Promise<HttpResponse>`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:98
- **引用次数**：2

#### `createProxySettle`

- **类型**：通用算法
- **说明**：写入/新增：代理 / settle（纯计算，无外部 IO）
- **签名**：`createProxySettle(resolve: (v: HttpResponse) => void, reject: (e: Error) => void): ProxySettle`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:116
- **引用次数**：2

#### `resolveProxyAgent`

- **类型**：逻辑控制
- **说明**：获取：代理 / Agent（含异常兜底）
- **签名**：`resolveProxyAgent(parsedUrl: URL, proxy: string): unknown`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:130
- **引用次数**：2

#### `buildProxyOptions`

- **类型**：数据处理
- **说明**：构建/初始化：代理 / options（网络请求）
- **签名**：`buildProxyOptions(parsedUrl: URL, req: HttpRequest, agent: unknown, timeoutMs: number): https.RequestOptions`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:150
- **引用次数**：2

#### `openProxyRequest`

- **类型**：逻辑控制
- **说明**：启动：代理 / request
- **签名**：`openProxyRequest(parsedUrl: URL, options: https.RequestOptions): http.ClientRequest`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:173
- **引用次数**：2

#### `armProxyTimeout`

- **类型**：逻辑控制
- **说明**：处理 arm / 代理 / 超时
- **签名**：`armProxyTimeout(clientReq: http.ClientRequest, req: HttpRequest, timeoutMs: number, settle: ProxySettle): () => void`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:179
- **引用次数**：2

#### `attachProxyResponse`

- **类型**：数据处理
- **说明**：更新：代理 / response（网络请求）
- **签名**：`attachProxyResponse(clientReq: http.ClientRequest, cleanup: () => void, settle: ProxySettle): void`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:197
- **引用次数**：2

#### `buildProxyHttpResponse`

- **类型**：通用算法
- **说明**：构建/初始化：代理 / http / response（纯计算，无外部 IO）
- **签名**：`buildProxyHttpResponse(res: http.IncomingMessage, chunks: Buffer[]): HttpResponse`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:217
- **引用次数**：2

#### `sendProxyBody`

- **类型**：逻辑控制
- **说明**：发送通知：代理 / body
- **签名**：`sendProxyBody(clientReq: http.ClientRequest, req: HttpRequest): void`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:229
- **引用次数**：2

#### `timeoutError`

- **类型**：逻辑控制
- **说明**：处理 超时 / 错误
- **签名**：`timeoutError(timeoutMs: number): Error`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:237
- **引用次数**：3

#### `headersToRecord`

- **类型**：逻辑控制
- **说明**：处理 headers / record（遍历调度）
- **签名**：`headersToRecord(h: Headers): Record<string, string>`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:241
- **引用次数**：2

#### `lowercaseHeaders`

- **类型**：通用算法
- **说明**：处理 lowercase / headers（纯计算，无外部 IO）
- **签名**：`lowercaseHeaders(h: Record<string, string \| string[] \| undefined>): Record<string, string>`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:247
- **引用次数**：2

#### `combineSignals`

- **类型**：逻辑控制
- **说明**：转换归并：signals
- **签名**：`combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal`
- **位置**：brian-backend/Base/ToolProvider/application/HttpService.ts:257
- **引用次数**：2

## 文件 `brian-backend/Base/ToolProvider/application/SystemMonitorService.ts`

### SystemMonitorService

#### `getCpuUsagePercent`

- **类型**：通用算法
- **说明**：获取：cpu / 用量 / 百分比（纯计算，无外部 IO）
- **签名**：`getCpuUsagePercent(): number`
- **位置**：brian-backend/Base/ToolProvider/application/SystemMonitorService.ts:28
- **引用次数**：3

#### `getMemoryUsagePercent`

- **类型**：通用算法
- **说明**：获取：记忆 / 用量 / 百分比（纯计算，无外部 IO）
- **签名**：`getMemoryUsagePercent(): number`
- **位置**：brian-backend/Base/ToolProvider/application/SystemMonitorService.ts:50
- **引用次数**：3

#### `getDiskUsagePercent`

- **类型**：数据处理
- **说明**：获取：disk / 用量 / 百分比（文件系统）
- **签名**：`getDiskUsagePercent(path?: string): number`
- **位置**：brian-backend/Base/ToolProvider/application/SystemMonitorService.ts:58
- **引用次数**：3

#### `collect`

- **类型**：逻辑控制
- **说明**：处理 collect
- **签名**：`collect(path?: string): SystemResourceMetrics`
- **位置**：brian-backend/Base/ToolProvider/application/SystemMonitorService.ts:71
- **引用次数**：12

### SystemMonitorService（私有）

#### `clampPercent`

- **类型**：通用算法
- **说明**：处理 clamp / 百分比（纯计算，无外部 IO）
- **签名**：`clampPercent(value: number): number`
- **位置**：brian-backend/Base/ToolProvider/application/SystemMonitorService.ts:80
- **引用次数**：5

## 文件 `brian-backend/Base/ToolProvider/application/ToolService.ts`

### ToolService

#### `generateId`

- **类型**：逻辑控制
- **说明**：构建/初始化：标识
- **签名**：`generateId(): string`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:27
- **引用次数**：11

#### `generateIds`

- **类型**：通用算法
- **说明**：构建/初始化：ids（纯计算，无外部 IO）
- **签名**：`generateIds(count: number): string[]`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:32
- **引用次数**：9

#### `now`

- **类型**：逻辑控制
- **说明**：处理 now
- **签名**：`now(): number`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:38
- **引用次数**：1116

#### `today`

- **类型**：逻辑控制
- **说明**：格式化/序列化相关数据
- **签名**：`today(): string`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:43
- **引用次数**：74

#### `jsonCheck`

- **类型**：逻辑控制
- **说明**：处理 JSON / check
- **签名**：`jsonCheck(text: string): ToolCheckResult`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:52
- **引用次数**：10

#### `jsonFormat`

- **类型**：逻辑控制
- **说明**：处理 JSON / format
- **签名**：`jsonFormat(text: string, indent: unknown): ToolTransformResult`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:57
- **引用次数**：10

#### `jsonMinify`

- **类型**：逻辑控制
- **说明**：处理 JSON / minify
- **签名**：`jsonMinify(text: string): ToolTransformResult`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:66
- **引用次数**：10

#### `xmlCheck`

- **类型**：逻辑控制
- **说明**：处理 xml / check
- **签名**：`xmlCheck(text: string): ToolCheckResult`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:79
- **引用次数**：10

#### `xmlFormat`

- **类型**：逻辑控制
- **说明**：处理 xml / format
- **签名**：`xmlFormat(text: string, indent: unknown): ToolTransformResult`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:84
- **引用次数**：10

#### `xmlMinify`

- **类型**：逻辑控制
- **说明**：处理 xml / minify
- **签名**：`xmlMinify(text: string): ToolTransformResult`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:93
- **引用次数**：9

#### `regexMatch`

- **类型**：通用算法
- **说明**：处理 regex / match（纯计算，无外部 IO）
- **签名**：`regexMatch(pattern: string, text: string, flags: unknown): ToolRegexResult`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:107
- **引用次数**：10

#### `cronCheck`

- **类型**：逻辑控制
- **说明**：处理 定时任务 / check
- **签名**：`cronCheck(expr: string): ToolCronCheckResult`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:158
- **引用次数**：4

#### `cronGenerate`

- **类型**：逻辑控制
- **说明**：处理 定时任务 / generate（含异常兜底）
- **签名**：`cronGenerate(fields: CronFields): ToolCronGenerateResult`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:164
- **引用次数**：4

#### `cronParse`

- **类型**：逻辑控制
- **说明**：处理 定时任务 / parse（含异常兜底）
- **签名**：`cronParse(expr: string): ToolCronParseResult`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:174
- **引用次数**：4

#### `cronNext`

- **类型**：逻辑控制
- **说明**：处理 定时任务 / next（含异常兜底）
- **签名**：`cronNext(expr: string, fromMs?: number): ToolCronNextResult`
- **位置**：brian-backend/Base/ToolProvider/application/ToolService.ts:184
- **引用次数**：4

## 文件 `brian-backend/Base/ToolProvider/CronUtils.ts`

### 模块级函数

#### `resolveMonthName`

- **类型**：通用算法
- **说明**：获取：month / name（纯计算，无外部 IO）
- **签名**：`resolveMonthName(token: string): number \| null`
- **位置**：brian-backend/Base/ToolProvider/CronUtils.ts:37
- **引用次数**：2

#### `resolveWeekName`

- **类型**：通用算法
- **说明**：获取：week / name（纯计算，无外部 IO）
- **签名**：`resolveWeekName(token: string): number \| null`
- **位置**：brian-backend/Base/ToolProvider/CronUtils.ts:42
- **引用次数**：2

#### `validateField`

- **类型**：通用算法
- **说明**：判断校验：字段（纯计算，无外部 IO）
- **签名**：`validateField(field: keyof CronFields, expr: string): string \| null`
- **位置**：brian-backend/Base/ToolProvider/CronUtils.ts:48
- **引用次数**：3

#### `resolveValue`

- **类型**：通用算法
- **说明**：获取：值（纯计算，无外部 IO）
- **签名**：`resolveValue(field: keyof CronFields, token: string): number \| null`
- **位置**：brian-backend/Base/ToolProvider/CronUtils.ts:92
- **引用次数**：6

#### `normalizeCron`

- **类型**：通用算法
- **说明**：转换归并：定时任务（纯计算，无外部 IO）
- **签名**：`normalizeCron(expr: string): string`
- **位置**：brian-backend/Base/ToolProvider/CronUtils.ts:106
- **引用次数**：3

#### `checkCron`

- **类型**：通用算法
- **说明**：判断校验：定时任务（纯计算，无外部 IO）
- **签名**：`checkCron(expr: string): CronCheckResult`
- **位置**：brian-backend/Base/ToolProvider/CronUtils.ts:120
- **引用次数**：23

#### `parseCron`

- **类型**：通用算法
- **说明**：解析：定时任务（纯计算，无外部 IO）
- **签名**：`parseCron(expr: string): CronFields`
- **位置**：brian-backend/Base/ToolProvider/CronUtils.ts:139
- **引用次数**：7

#### `generateCron`

- **类型**：通用算法
- **说明**：构建/初始化：定时任务（纯计算，无外部 IO）
- **签名**：`generateCron(fields: CronFields): string`
- **位置**：brian-backend/Base/ToolProvider/CronUtils.ts:155
- **引用次数**：8

#### `matchesField`

- **类型**：通用算法
- **说明**：判断校验：字段（纯计算，无外部 IO）
- **签名**：`matchesField(field: keyof CronFields, expr: string, value: number): boolean`
- **位置**：brian-backend/Base/ToolProvider/CronUtils.ts:166
- **引用次数**：12

#### `matchesCron`

- **类型**：通用算法
- **说明**：判断校验：定时任务（纯计算，无外部 IO）
- **签名**：`matchesCron(expr: string, date: Date): boolean`
- **位置**：brian-backend/Base/ToolProvider/CronUtils.ts:198
- **引用次数**：8

#### `nextRunTime`

- **类型**：通用算法
- **说明**：处理 时间（纯计算，无外部 IO）
- **签名**：`nextRunTime(expr: string, fromMs?: number): number \| null`
- **位置**：brian-backend/Base/ToolProvider/CronUtils.ts:214
- **引用次数**：17

## 文件 `brian-backend/Base/ToolProvider/IdGenerator.ts`

### IdGenerator（静态）

#### `generate`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据
- **签名**：`generate(): string`
- **位置**：brian-backend/Base/ToolProvider/IdGenerator.ts:6
- **引用次数**：178

#### `now`

- **类型**：逻辑控制
- **说明**：处理 now
- **签名**：`now(): number`
- **位置**：brian-backend/Base/ToolProvider/IdGenerator.ts:12
- **引用次数**：1116

#### `today`

- **类型**：通用算法
- **说明**：格式化/序列化相关数据（纯计算，无外部 IO）
- **签名**：`today(): string`
- **位置**：brian-backend/Base/ToolProvider/IdGenerator.ts:18
- **引用次数**：74

#### `dateOf`

- **类型**：通用算法
- **说明**：处理 日期（纯计算，无外部 IO）
- **签名**：`dateOf(ts: number): string`
- **位置**：brian-backend/Base/ToolProvider/IdGenerator.ts:28
- **引用次数**：3

#### `platform`

- **类型**：数据处理
- **说明**：处理 platform
- **签名**：`platform(): string`
- **位置**：brian-backend/Base/ToolProvider/IdGenerator.ts:38
- **引用次数**：62

## 文件 `brian-backend/Base/ToolProvider/infrastructure/ToolSchemaInitializer.ts`

### ToolSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/ToolProvider/infrastructure/ToolSchemaInitializer.ts:7
- **引用次数**：99

## 文件 `brian-backend/Base/ToolProvider/JsonParser.ts`

### JsonParser（静态）

#### `stripCodeFence`

- **类型**：通用算法
- **说明**：处理 strip / code / fence（纯计算，无外部 IO）
- **签名**：`stripCodeFence(text: string): string`
- **位置**：brian-backend/Base/ToolProvider/JsonParser.ts:4
- **引用次数**：8

#### `parse`

- **类型**：通用算法
- **说明**：解析相关数据（纯计算，无外部 IO）
- **签名**：`parse(text: string): unknown \| null`
- **位置**：brian-backend/Base/ToolProvider/JsonParser.ts:14
- **引用次数**：179

#### `parseObject`

- **类型**：通用算法
- **说明**：解析：object（纯计算，无外部 IO）
- **签名**：`parseObject(text: string): Record<string, unknown> \| null`
- **位置**：brian-backend/Base/ToolProvider/JsonParser.ts:38
- **引用次数**：8

#### `parseArray`

- **类型**：通用算法
- **说明**：解析：array（纯计算，无外部 IO）
- **签名**：`parseArray(text: string): unknown[] \| null`
- **位置**：brian-backend/Base/ToolProvider/JsonParser.ts:48
- **引用次数**：4

#### `extractObject`

- **类型**：通用算法
- **说明**：解析：object（纯计算，无外部 IO）
- **签名**：`extractObject(text: string): string \| null`
- **位置**：brian-backend/Base/ToolProvider/JsonParser.ts:58
- **引用次数**：5

#### `extractArray`

- **类型**：通用算法
- **说明**：解析：array（纯计算，无外部 IO）
- **签名**：`extractArray(text: string): string \| null`
- **位置**：brian-backend/Base/ToolProvider/JsonParser.ts:66
- **引用次数**：4

#### `check`

- **类型**：数据处理
- **说明**：判断校验相关数据（反序列化）
- **签名**：`check(text: string): { valid: boolean; error: string }`
- **位置**：brian-backend/Base/ToolProvider/JsonParser.ts:74
- **引用次数**：79

#### `format`

- **类型**：数据处理
- **说明**：格式化/序列化相关数据（序列化输出）
- **签名**：`format(text: string, indent: unknown): string \| null`
- **位置**：brian-backend/Base/ToolProvider/JsonParser.ts:85
- **引用次数**：95

#### `minify`

- **类型**：数据处理
- **说明**：处理 minify（序列化输出）
- **签名**：`minify(text: string): string \| null`
- **位置**：brian-backend/Base/ToolProvider/JsonParser.ts:97
- **引用次数**：18

### JsonParser（静态）（私有）

#### `tryParse`

- **类型**：数据处理
- **说明**：处理 parse（反序列化）
- **签名**：`tryParse(text: string): unknown \| null`
- **位置**：brian-backend/Base/ToolProvider/JsonParser.ts:109
- **引用次数**：4

## 文件 `brian-backend/Base/ToolProvider/XmlParser.ts`

### 模块级函数

#### `escapeRegExp`

- **类型**：通用算法
- **说明**：处理 escape / reg / exp（纯计算，无外部 IO）
- **签名**：`escapeRegExp(s: string): string`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:12
- **引用次数**：8

### XmlTokenizer（私有）

#### `peek`

- **类型**：逻辑控制
- **说明**：处理 peek
- **签名**：`peek(offset: unknown): string`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:24
- **引用次数**：9

#### `eof`

- **类型**：逻辑控制
- **说明**：处理 eof
- **签名**：`eof(): boolean`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:28
- **引用次数**：7

#### `skipWhitespace`

- **类型**：通用算法
- **说明**：处理 skip / whitespace（纯计算，无外部 IO）
- **签名**：`skipWhitespace(): void`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:32
- **引用次数**：8

#### `skipProlog`

- **类型**：通用算法
- **说明**：处理 skip / prolog（纯计算，无外部 IO）
- **签名**：`skipProlog(): void`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:39
- **引用次数**：2

#### `readName`

- **类型**：通用算法
- **说明**：获取：name（纯计算，无外部 IO）
- **签名**：`readName(): string`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:55
- **引用次数**：4

#### `parseAttributes`

- **类型**：通用算法
- **说明**：解析：attributes（纯计算，无外部 IO）
- **签名**：`parseAttributes(): Record<string, string>`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:65
- **引用次数**：2

### XmlTokenizer

#### `parseElement`

- **类型**：通用算法
- **说明**：解析：element（纯计算，无外部 IO）
- **签名**：`parseElement(): XmlNode`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:109
- **引用次数**：3

### XmlParser（静态）

#### `decodeEntities`

- **类型**：通用算法
- **说明**：解析：entities（纯计算，无外部 IO）
- **签名**：`decodeEntities(text: string): string`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:196
- **引用次数**：7

### XmlParser（静态）（私有）

#### `encodeEntities`

- **类型**：通用算法
- **说明**：格式化/序列化：entities（纯计算，无外部 IO）
- **签名**：`encodeEntities(text: string): string`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:204
- **引用次数**：4

### XmlParser（静态）

#### `parse`

- **类型**：通用算法
- **说明**：解析相关数据（纯计算，无外部 IO）
- **签名**：`parse(text: string): XmlNode \| null`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:216
- **引用次数**：179

#### `toObject`

- **类型**：通用算法
- **说明**：格式化/序列化：object（纯计算，无外部 IO）
- **签名**：`toObject(text: string): Record<string, unknown> \| null`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:228
- **引用次数**：4

#### `extract`

- **类型**：通用算法
- **说明**：解析相关数据（纯计算，无外部 IO）
- **签名**：`extract(text: string, tag: string): string \| null`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:236
- **引用次数**：7

#### `extractAll`

- **类型**：数据处理
- **说明**：解析相关数据
- **签名**：`extractAll(text: string, tag: string): string[]`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:248
- **引用次数**：4

#### `check`

- **类型**：逻辑控制
- **说明**：判断校验相关数据
- **签名**：`check(text: string): { valid: boolean; error: string }`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:264
- **引用次数**：79

#### `format`

- **类型**：通用算法
- **说明**：格式化/序列化相关数据（纯计算，无外部 IO）
- **签名**：`format(text: string, indent: unknown): string \| null`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:274
- **引用次数**：95

#### `minify`

- **类型**：逻辑控制
- **说明**：处理 minify
- **签名**：`minify(text: string): string \| null`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:282
- **引用次数**：18

### XmlParser（静态）（私有）

#### `serializeNode`

- **类型**：通用算法
- **说明**：格式化/序列化：节点（纯计算，无外部 IO）
- **签名**：`serializeNode(node: XmlNode, indent: number \| null, level: number): string`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:290
- **引用次数**：4

#### `nodeToObject`

- **类型**：通用算法
- **说明**：处理 节点 / object（纯计算，无外部 IO）
- **签名**：`nodeToObject(node: XmlNode): Record<string, unknown>`
- **位置**：brian-backend/Base/ToolProvider/XmlParser.ts:327
- **引用次数**：3

