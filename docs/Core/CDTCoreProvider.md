# Core / CDTCoreProvider

- 层：**Core**　模块：**CDTCoreProvider**
- 方法数：**30**（逻辑控制 18 · 数据处理 11 · 通用算法 1）

## 文件 `brian-backend/Core/CDTCoreProvider/access/CDTCoreAccess.ts`

### CDTCoreAccess

#### `navigate`

- **类型**：逻辑控制
- **说明**：处理 navigate（接入层转发至 Service）
- **签名**：`navigate(i: CDTCoreNavigateInput, o: CDTCoreNavigateOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Core/CDTCoreProvider/access/CDTCoreAccess.ts:33
- **引用次数**：32

#### `typeText`

- **类型**：逻辑控制
- **说明**：处理 type / 文本（接入层转发至 Service）
- **签名**：`typeText(i: CDTCoreTypeTextInput, o: CDTCoreTypeTextOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Core/CDTCoreProvider/access/CDTCoreAccess.ts:37
- **引用次数**：10

#### `click`

- **类型**：逻辑控制
- **说明**：处理 点击（接入层转发至 Service）
- **签名**：`click(i: CDTCoreClickInput, o: CDTCoreClickOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Core/CDTCoreProvider/access/CDTCoreAccess.ts:41
- **引用次数**：424

#### `scroll`

- **类型**：逻辑控制
- **说明**：界面控制相关数据（接入层转发至 Service）
- **签名**：`scroll(i: CDTCoreScrollInput, o: CDTCoreScrollOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Core/CDTCoreProvider/access/CDTCoreAccess.ts:45
- **引用次数**：26

#### `evaluate`

- **类型**：逻辑控制
- **说明**：计算统计相关数据（接入层转发至 Service）
- **签名**：`evaluate(i: CDTCoreEvaluateInput, o: CDTCoreEvaluateOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Core/CDTCoreProvider/access/CDTCoreAccess.ts:49
- **引用次数**：33

#### `login`

- **类型**：逻辑控制
- **说明**：写入/新增相关数据（接入层转发至 Service）
- **签名**：`login(i: CDTCoreLoginInput, o: CDTCoreLoginOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Core/CDTCoreProvider/access/CDTCoreAccess.ts:53
- **引用次数**：7

#### `getLoginState`

- **类型**：逻辑控制
- **说明**：获取：login / state（接入层转发至 Service）
- **签名**：`getLoginState(i: CDTCoreGetLoginStateInput, o: CDTCoreGetLoginStateOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Core/CDTCoreProvider/access/CDTCoreAccess.ts:57
- **引用次数**：3

#### `getCookies`

- **类型**：逻辑控制
- **说明**：获取：cookies（接入层转发至 Service）
- **签名**：`getCookies(i: CDTCoreGetCookiesInput, o: CDTCoreGetCookiesOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Core/CDTCoreProvider/access/CDTCoreAccess.ts:61
- **引用次数**：5

#### `saveSession`

- **类型**：逻辑控制
- **说明**：写入/新增：会话（接入层转发至 Service）
- **签名**：`saveSession(i: CDTCoreSaveSessionInput, o: CDTCoreSaveSessionOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Core/CDTCoreProvider/access/CDTCoreAccess.ts:65
- **引用次数**：3

#### `restoreSession`

- **类型**：逻辑控制
- **说明**：处理 restore / 会话（接入层转发至 Service）
- **签名**：`restoreSession(i: CDTCoreRestoreSessionInput, o: CDTCoreRestoreSessionOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Core/CDTCoreProvider/access/CDTCoreAccess.ts:69
- **引用次数**：5

## 文件 `brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts`

### CDTCoreService（私有）

#### `humanDelay`

- **类型**：通用算法
- **说明**：处理 human / delay（纯计算，无外部 IO）
- **签名**：`humanDelay(minMs: number, maxMs: number): Promise<void>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:40
- **引用次数**：13

#### `ensureCDT`

- **类型**：逻辑控制
- **说明**：确保就绪：CDT（返回成功与否，异步编排）
- **签名**：`ensureCDT(): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:46
- **引用次数**：9

#### `exec`

- **类型**：逻辑控制
- **说明**：处理执行相关数据（异步编排）
- **签名**：`exec(method: string, params?: Record<string, unknown>): Promise<ExecCDPOutput>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:53
- **引用次数**：81

### CDTCoreService

#### `navigate`

- **类型**：逻辑控制
- **说明**：处理 navigate（返回成功与否，异步编排）
- **签名**：`navigate(input: CDTCoreNavigateInput, output: CDTCoreNavigateOutput, _ctx: CDTCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:64
- **引用次数**：32

#### `typeText`

- **类型**：数据处理
- **说明**：处理 type / 文本
- **签名**：`typeText(input: CDTCoreTypeTextInput, output: CDTCoreTypeTextOutput, _ctx: CDTCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:87
- **引用次数**：10

#### `click`

- **类型**：数据处理
- **说明**：处理 点击
- **签名**：`click(input: CDTCoreClickInput, output: CDTCoreClickOutput, _ctx: CDTCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:126
- **引用次数**：424

#### `scroll`

- **类型**：逻辑控制
- **说明**：界面控制相关数据（返回成功与否，异步编排）
- **签名**：`scroll(input: CDTCoreScrollInput, _output: CDTCoreScrollOutput, _ctx: CDTCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:182
- **引用次数**：26

#### `evaluate`

- **类型**：逻辑控制
- **说明**：计算统计相关数据（返回成功与否，异步编排）
- **签名**：`evaluate(input: CDTCoreEvaluateInput, output: CDTCoreEvaluateOutput, _ctx: CDTCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:208
- **引用次数**：33

#### `login`

- **类型**：数据处理
- **说明**：写入/新增相关数据
- **签名**：`login(input: CDTCoreLoginInput, output: CDTCoreLoginOutput, _ctx: CDTCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:235
- **引用次数**：7

### CDTCoreService（私有）

#### `soElementExists`

- **类型**：数据处理
- **说明**：查询：element / exists
- **签名**：`soElementExists(selector: string): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:262
- **引用次数**：4

#### `waitForCaptchaSolved`

- **类型**：逻辑控制
- **说明**：处理 wait / captcha / solved（返回成功与否，遍历调度，异步编排）
- **签名**：`waitForCaptchaSolved(input: CDTCoreLoginInput): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:270
- **引用次数**：2

#### `fillLoginCredentials`

- **类型**：逻辑控制
- **说明**：处理 fill / login / credentials（异步编排）
- **签名**：`fillLoginCredentials(input: CDTCoreLoginInput): Promise<void>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:290
- **引用次数**：2

#### `checkLoggedIn`

- **类型**：逻辑控制
- **说明**：判断校验：logged（返回成功与否）
- **签名**：`checkLoggedIn(input: CDTCoreLoginInput): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:314
- **引用次数**：2

#### `saveLoginCredential`

- **类型**：数据处理
- **说明**：写入/新增：login / credential（操作关系数据库）
- **签名**：`saveLoginCredential(input: CDTCoreLoginInput): Promise<string>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:319
- **引用次数**：2

#### `soCredentialFields`

- **类型**：数据处理
- **说明**：查询：credential / fields
- **签名**：`soCredentialFields(input: CDTCoreLoginInput, cookiesJson: string, sessionId: string, now: number): Array<{ field: string; value: unknown }>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:341
- **引用次数**：3

### CDTCoreService

#### `getLoginState`

- **类型**：数据处理
- **说明**：获取：login / state（操作关系数据库）
- **签名**：`getLoginState(input: CDTCoreGetLoginStateInput, output: CDTCoreGetLoginStateOutput, _ctx: CDTCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:363
- **引用次数**：3

#### `getCookies`

- **类型**：数据处理
- **说明**：获取：cookies（序列化输出）
- **签名**：`getCookies(_input: CDTCoreGetCookiesInput, output: CDTCoreGetCookiesOutput, _ctx: CDTCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:386
- **引用次数**：5

#### `saveSession`

- **类型**：数据处理
- **说明**：写入/新增：会话（操作关系数据库，浏览器本地存储）
- **签名**：`saveSession(input: CDTCoreSaveSessionInput, output: CDTCoreSaveSessionOutput, _ctx: CDTCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:406
- **引用次数**：3

#### `restoreSession`

- **类型**：数据处理
- **说明**：处理 restore / 会话（操作关系数据库，反序列化，浏览器本地存储）
- **签名**：`restoreSession(input: CDTCoreRestoreSessionInput, output: CDTCoreRestoreSessionOutput, _ctx: CDTCoreContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/CDTCoreProvider/application/CDTCoreService.ts:451
- **引用次数**：5

## 文件 `brian-backend/Core/CDTCoreProvider/infrastructure/CDTCoreSchemaInitializer.ts`

### CDTCoreSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Core/CDTCoreProvider/infrastructure/CDTCoreSchemaInitializer.ts:7
- **引用次数**：99

