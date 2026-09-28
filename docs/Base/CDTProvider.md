# Base / CDTProvider

- 层：**Base**　模块：**CDTProvider**
- 方法数：**52**（逻辑控制 26 · 数据处理 22 · 通用算法 4）

## 文件 `brian-backend/Base/CDTProvider/access/CDTAccess.ts`

### CDTAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:30
- **引用次数**：272

#### `startCDT`

- **类型**：逻辑控制
- **说明**：启动：CDT（接入层转发至 Service）
- **签名**：`startCDT(i: StartCDTInput, o: StartCDTOutput, c: CDTContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:34
- **引用次数**：12

#### `stopCDT`

- **类型**：逻辑控制
- **说明**：删除/清理：CDT（接入层转发至 Service）
- **签名**：`stopCDT(i: StopCDTInput, o: StopCDTOutput, c: CDTContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:38
- **引用次数**：9

#### `soCDTEndpoint`

- **类型**：逻辑控制
- **说明**：查询：CDT / 端点（接入层转发至 Service）
- **签名**：`soCDTEndpoint(i: GetCDTEndpointInput, o: GetCDTEndpointOutput, c: CDTContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:42
- **引用次数**：3

#### `execCDP`

- **类型**：逻辑控制
- **说明**：处理执行：cdp（接入层转发至 Service）
- **签名**：`execCDP(i: ExecCDPInput, o: ExecCDPOutput, c: CDTContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:46
- **引用次数**：6

#### `isCDTRunning`

- **类型**：逻辑控制
- **说明**：判断校验：CDT / running（接入层转发至 Service）
- **签名**：`isCDTRunning(i: IsCDTRunningInput, o: IsCDTRunningOutput, c: CDTContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:50
- **引用次数**：5

#### `startScreencast`

- **类型**：逻辑控制
- **说明**：启动：screencast（返回成功与否，接入层转发至 Service）
- **签名**：`startScreencast(maxWidth: unknown, maxHeight: unknown, quality: unknown): Promise<boolean>`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:55
- **引用次数**：5

#### `getLatestFrame`

- **类型**：逻辑控制
- **说明**：获取：latest / 框架（接入层转发至 Service）
- **签名**：`getLatestFrame(): string`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:59
- **引用次数**：4

#### `getLatestFrameDimensions`

- **类型**：逻辑控制
- **说明**：获取：latest / 框架 / dimensions（接入层转发至 Service）
- **签名**：`getLatestFrameDimensions(): { width: number; height: number }`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:63
- **引用次数**：4

#### `sendMouseEvent`

- **类型**：逻辑控制
- **说明**：发送通知：鼠标 / 事件（接入层转发至 Service）
- **签名**：`sendMouseEvent(type: string, x: number, y: number, button: unknown, clickCount: unknown, deltaX: unknown, deltaY: unknown, buttons: unknown, ctrl: unknown, alt: unknown, shift: unknown, meta: unknown)`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:67
- **引用次数**：15

#### `sendKeyEvent`

- **类型**：逻辑控制
- **说明**：发送通知：键 / 事件（接入层转发至 Service）
- **签名**：`sendKeyEvent(type: string, text: unknown, key: unknown, ctrl: unknown, alt: unknown, shift: unknown, meta: unknown)`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:73
- **引用次数**：4

#### `sendKeyBatch`

- **类型**：逻辑控制
- **说明**：发送通知：键 / batch（接入层转发至 Service）
- **签名**：`sendKeyBatch(events: Array<{ type: string; text?: string; key?: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }>)`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:77
- **引用次数**：4

#### `insertText`

- **类型**：逻辑控制
- **说明**：写入/新增：文本（接入层转发至 Service）
- **签名**：`insertText(text: string)`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:81
- **引用次数**：9

#### `injectAntiDetection`

- **类型**：逻辑控制
- **说明**：处理 inject / anti / detection（接入层转发至 Service）
- **签名**：`injectAntiDetection(env?: import('../domain/types').CDTEnv)`
- **位置**：brian-backend/Base/CDTProvider/access/CDTAccess.ts:85
- **引用次数**：6

## 文件 `brian-backend/Base/CDTProvider/application/CDTService.ts`

### 模块级函数

#### `computeModifiers`

- **类型**：逻辑控制
- **说明**：计算统计：modifiers
- **签名**：`computeModifiers(ctrl: boolean, alt: boolean, shift: boolean, meta: boolean): number`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:58
- **引用次数**：3

#### `fillKeyParams`

- **类型**：通用算法
- **说明**：处理 fill / 键（纯计算，无外部 IO）
- **签名**：`fillKeyParams(key: string, params: Record<string, unknown>, ctrl: unknown, alt: unknown, shift: unknown, meta: unknown): void`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:62
- **引用次数**：3

### CDTService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:114
- **引用次数**：272

### CDTService（静态）

#### `platform`

- **类型**：数据处理
- **说明**：处理 platform
- **签名**：`platform(): string`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:118
- **引用次数**：62

#### `detectChromePath`

- **类型**：数据处理
- **说明**：判断校验：chrome / 路径
- **签名**：`detectChromePath(): string \| null`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:125
- **引用次数**：2

### CDTService

#### `startCDT`

- **类型**：数据处理
- **说明**：启动：CDT
- **签名**：`startCDT(_input: StartCDTInput, output: StartCDTOutput, _ctx: CDTContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:154
- **引用次数**：12

#### `stopCDT`

- **类型**：逻辑控制
- **说明**：删除/清理：CDT（返回成功与否）
- **签名**：`stopCDT(_input: StopCDTInput, _output: StopCDTOutput, _ctx: CDTContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:260
- **引用次数**：9

#### `soCDTEndpoint`

- **类型**：逻辑控制
- **说明**：查询：CDT / 端点（返回成功与否）
- **签名**：`soCDTEndpoint(_input: GetCDTEndpointInput, output: GetCDTEndpointOutput, _ctx: CDTContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:272
- **引用次数**：3

#### `isCDTRunning`

- **类型**：通用算法
- **说明**：判断校验：CDT / running（纯计算，无外部 IO）
- **签名**：`isCDTRunning(_input: IsCDTRunningInput, output: IsCDTRunningOutput, _ctx: CDTContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:278
- **引用次数**：5

#### `execCDP`

- **类型**：数据处理
- **说明**：处理执行：cdp（序列化输出，反序列化）
- **签名**：`execCDP(input: ExecCDPInput, output: ExecCDPOutput, _ctx: CDTContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:287
- **引用次数**：6

#### `startScreencast`

- **类型**：数据处理
- **说明**：启动：screencast（序列化输出，反序列化）
- **签名**：`startScreencast(maxWidth: unknown, maxHeight: unknown, quality: unknown): Promise<boolean>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:368
- **引用次数**：5

#### `stopScreencast`

- **类型**：逻辑控制
- **说明**：删除/清理：screencast（含异常兜底）
- **签名**：`stopScreencast(): void`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:416
- **引用次数**：4

#### `getLatestFrame`

- **类型**：逻辑控制
- **说明**：获取：latest / 框架
- **签名**：`getLatestFrame(): string`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:424
- **引用次数**：4

#### `getLatestFrameDimensions`

- **类型**：逻辑控制
- **说明**：获取：latest / 框架 / dimensions
- **签名**：`getLatestFrameDimensions(): { width: number; height: number }`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:428
- **引用次数**：4

### CDTService（私有）

#### `getCommandWs`

- **类型**：数据处理
- **说明**：获取：command / ws
- **签名**：`getCommandWs(): Promise<import('ws').WebSocket \| null>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:432
- **引用次数**：6

#### `stopCommandWs`

- **类型**：逻辑控制
- **说明**：删除/清理：command / ws（含异常兜底）
- **签名**：`stopCommandWs(): void`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:445
- **引用次数**：4

#### `sendCmd`

- **类型**：数据处理
- **说明**：发送通知：cmd（序列化输出）
- **签名**：`sendCmd(ws: import('ws').WebSocket, method: string, params: Record<string, unknown>): void`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:452
- **引用次数**：10

### CDTService

#### `sendMouseEvent`

- **类型**：数据处理
- **说明**：发送通知：鼠标 / 事件
- **签名**：`sendMouseEvent(type: string, x: number, y: number, button: string, clickCount: number, deltaX: number, deltaY: number, buttons: number, ctrl: unknown, alt: unknown, shift: unknown, meta: unknown): Promise<void>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:459
- **引用次数**：15

#### `sendKeyEvent`

- **类型**：数据处理
- **说明**：发送通知：键 / 事件
- **签名**：`sendKeyEvent(type: string, text: string, key: string, ctrl: unknown, alt: unknown, shift: unknown, meta: unknown): Promise<void>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:489
- **引用次数**：4

#### `sendKeyBatch`

- **类型**：数据处理
- **说明**：发送通知：键 / batch
- **签名**：`sendKeyBatch(events: Array<{ type: string; text?: string; key?: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }>): Promise<void>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:504
- **引用次数**：4

#### `insertText`

- **类型**：数据处理
- **说明**：写入/新增：文本
- **签名**：`insertText(text: string): Promise<void>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:520
- **引用次数**：9

#### `injectAntiDetection`

- **类型**：数据处理
- **说明**：处理 inject / anti / detection（网络请求，序列化输出）
- **签名**：`injectAntiDetection(env?: CDTEnv): Promise<void>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:527
- **引用次数**：6

### CDTService（私有）

#### `seedProfileFromSnapshot`

- **类型**：数据处理
- **说明**：处理 seed / 画像 / 快照
- **签名**：`seedProfileFromSnapshot(profileDir: string, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:581
- **引用次数**：4

#### `freeDebugPort`

- **类型**：数据处理
- **说明**：处理 free / 调试 / port
- **签名**：`freeDebugPort(metrics?: Metrics): void`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:601
- **引用次数**：4

#### `handleUnexpectedExit`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / unexpected / exit（异步编排）
- **签名**：`handleUnexpectedExit(code: number \| null, signal: string \| null, errorMessage?: string): Promise<void>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:623
- **引用次数**：3

#### `isCDPEndpointAlive`

- **类型**：数据处理
- **说明**：判断校验：cdp / 端点 / alive（网络请求）
- **签名**：`isCDPEndpointAlive(): Promise<boolean>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:645
- **引用次数**：3

#### `startKeepAlive`

- **类型**：数据处理
- **说明**：启动：keep / alive（序列化输出）
- **签名**：`startKeepAlive(metrics?: Metrics): Promise<boolean>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:657
- **引用次数**：4

#### `stopKeepAlive`

- **类型**：逻辑控制
- **说明**：删除/清理：keep / alive（含异常兜底）
- **签名**：`stopKeepAlive(): void`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:722
- **引用次数**：5

#### `isProcessAlive`

- **类型**：数据处理
- **说明**：判断校验：alive
- **签名**：`isProcessAlive(): boolean`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:733
- **引用次数**：4

#### `killProcess`

- **类型**：数据处理
- **说明**：处理 kill / process
- **签名**：`killProcess(metrics?: Metrics): void`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:743
- **引用次数**：5

#### `fetchWebSocketEndpoint`

- **类型**：数据处理
- **说明**：获取：web / socket / 端点（网络请求，反序列化）
- **签名**：`fetchWebSocketEndpoint(): Promise<string \| null>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:755
- **引用次数**：2

#### `connectWebSocket`

- **类型**：数据处理
- **说明**：处理 connect / web / socket
- **签名**：`connectWebSocket(): Promise<import('ws').WebSocket>`
- **位置**：brian-backend/Base/CDTProvider/application/CDTService.ts:776
- **引用次数**：3

## 文件 `brian-backend/Base/CDTProvider/application/ProfileSnapshot.ts`

### 模块级函数

#### `resolveSnapshotSourceDir`

- **类型**：通用算法
- **说明**：获取：快照 / source / 目录（纯计算，无外部 IO）
- **签名**：`resolveSnapshotSourceDir(raw: string \| undefined): string \| null`
- **位置**：brian-backend/Base/CDTProvider/application/ProfileSnapshot.ts:16
- **引用次数**：11

#### `readSeedMarker`

- **类型**：通用算法
- **说明**：获取：seed / marker（纯计算，无外部 IO）
- **签名**：`readSeedMarker(profileDir: string): string \| null`
- **位置**：brian-backend/Base/CDTProvider/application/ProfileSnapshot.ts:26
- **引用次数**：7

#### `writeSeedMarker`

- **类型**：逻辑控制
- **说明**：写入/新增：seed / marker
- **签名**：`writeSeedMarker(profileDir: string, sourceDir: string): void`
- **位置**：brian-backend/Base/CDTProvider/application/ProfileSnapshot.ts:34
- **引用次数**：5

#### `copyFile`

- **类型**：逻辑控制
- **说明**：处理 复制 / 文件
- **签名**：`copyFile(src: string, dest: string): void`
- **位置**：brian-backend/Base/CDTProvider/application/ProfileSnapshot.ts:38
- **引用次数**：3

#### `copySnapshotAuthFiles`

- **类型**：数据处理
- **说明**：处理 复制 / 快照 / 鉴权 / files（操作关系数据库）
- **签名**：`copySnapshotAuthFiles(sourceDir: string, targetDataDir: string, metrics?: Metrics): boolean`
- **位置**：brian-backend/Base/CDTProvider/application/ProfileSnapshot.ts:43
- **引用次数**：9

## 文件 `brian-backend/Base/CDTProvider/infrastructure/CDTSchemaInitializer.ts`

### CDTSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/CDTProvider/infrastructure/CDTSchemaInitializer.ts:7
- **引用次数**：99

