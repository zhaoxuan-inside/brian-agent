# Base / CronProvider

- 层：**Base**　模块：**CronProvider**
- 方法数：**25**（逻辑控制 13 · 数据处理 12 · 通用算法 0）

## 文件 `brian-backend/Base/CronProvider/access/CronAccess.ts`

### CronAccess

#### `registerTask`

- **类型**：逻辑控制
- **说明**：写入/新增：任务（异步编排，接入层转发至 Service）
- **签名**：`registerTask(name: string, description: string \| undefined, defaultCron: string, handler: CronHandler): Promise<void>`
- **位置**：brian-backend/Base/CronProvider/access/CronAccess.ts:37
- **引用次数**：6

#### `start`

- **类型**：逻辑控制
- **说明**：启动相关数据（接入层转发至 Service）
- **签名**：`start(): void`
- **位置**：brian-backend/Base/CronProvider/access/CronAccess.ts:47
- **引用次数**：235

#### `stop`

- **类型**：逻辑控制
- **说明**：删除/清理相关数据（接入层转发至 Service）
- **签名**：`stop(): void`
- **位置**：brian-backend/Base/CronProvider/access/CronAccess.ts:52
- **引用次数**：139

#### `listCronTasks`

- **类型**：逻辑控制
- **说明**：查询：定时任务 / tasks（返回成功与否，接入层转发至 Service）
- **签名**：`listCronTasks(_input: ListCronTasksInput, output: ListCronTasksOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/CronProvider/access/CronAccess.ts:60
- **引用次数**：2

#### `soCronTask`

- **类型**：逻辑控制
- **说明**：查询：定时任务 / 任务（返回成功与否，接入层转发至 Service）
- **签名**：`soCronTask(input: GetCronTaskInput, output: GetCronTaskOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/CronProvider/access/CronAccess.ts:65
- **引用次数**：3

#### `setCronTask`

- **类型**：逻辑控制
- **说明**：更新：定时任务 / 任务（返回成功与否，接入层转发至 Service）
- **签名**：`setCronTask(input: SetCronTaskInput, output: SetCronTaskOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/CronProvider/access/CronAccess.ts:70
- **引用次数**：3

#### `setCronTaskEnabled`

- **类型**：逻辑控制
- **说明**：更新：定时任务 / 任务 / enabled（返回成功与否，接入层转发至 Service）
- **签名**：`setCronTaskEnabled(input: SetCronTaskEnabledInput, output: SetCronTaskEnabledOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/CronProvider/access/CronAccess.ts:75
- **引用次数**：2

#### `triggerCronTask`

- **类型**：逻辑控制
- **说明**：处理执行：定时任务 / 任务（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`triggerCronTask(input: TriggerCronTaskInput, output: TriggerCronTaskOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/CronProvider/access/CronAccess.ts:80
- **引用次数**：2

#### `listCronTaskRuns`

- **类型**：逻辑控制
- **说明**：查询：定时任务 / 任务 / runs（返回成功与否，接入层转发至 Service）
- **签名**：`listCronTaskRuns(input: ListCronTaskRunsInput, output: ListCronTaskRunsOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/CronProvider/access/CronAccess.ts:85
- **引用次数**：2

## 文件 `brian-backend/Base/CronProvider/application/CronService.ts`

### CronService

#### `registerTask`

- **类型**：数据处理
- **说明**：写入/新增：任务（操作关系数据库）
- **签名**：`registerTask(reg: CronTaskRegistration): Promise<void>`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:49
- **引用次数**：6

#### `start`

- **类型**：逻辑控制
- **说明**：启动相关数据
- **签名**：`start(): void`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:85
- **引用次数**：235

#### `stop`

- **类型**：逻辑控制
- **说明**：删除/清理相关数据
- **签名**：`stop(): void`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:96
- **引用次数**：139

### CronService（私有）

#### `recomputeStaleNextRuns`

- **类型**：数据处理
- **说明**：处理 recompute / stale / runs（操作关系数据库）
- **签名**：`recomputeStaleNextRuns(): void`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:104
- **引用次数**：3

#### `tick`

- **类型**：数据处理
- **说明**：处理 tick（操作关系数据库）
- **签名**：`tick(): Promise<void>`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:128
- **引用次数**：14

#### `executeTask`

- **类型**：数据处理
- **说明**：处理执行：任务（操作关系数据库）
- **签名**：`executeTask(name: string, handler: CronHandler, _manual: boolean): Promise<CronTaskRunRecord>`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:162
- **引用次数**：3

### CronService

#### `listTasks`

- **类型**：数据处理
- **说明**：查询：tasks（操作关系数据库）
- **签名**：`listTasks(): CronTaskRecord[]`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:221
- **引用次数**：2

#### `getTask`

- **类型**：逻辑控制
- **说明**：获取：任务
- **签名**：`getTask(name: string): CronTaskRecord \| null`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:228
- **引用次数**：4

#### `setCron`

- **类型**：数据处理
- **说明**：更新：定时任务（操作关系数据库）
- **签名**：`setCron(name: string, cron: string): CronTaskRecord \| null`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:232
- **引用次数**：4

#### `setEnabled`

- **类型**：数据处理
- **说明**：更新：enabled（操作关系数据库）
- **签名**：`setEnabled(name: string, enabled: boolean): CronTaskRecord \| null`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:248
- **引用次数**：6

#### `trigger`

- **类型**：数据处理
- **说明**：处理执行相关数据
- **签名**：`trigger(name: string): Promise<CronTaskRunRecord>`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:265
- **引用次数**：7

#### `listRuns`

- **类型**：数据处理
- **说明**：查询：runs（操作关系数据库）
- **签名**：`listRuns(name?: string, limit: unknown): CronTaskRunRecord[]`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:271
- **引用次数**：2

### CronService（私有）

#### `getTaskRow`

- **类型**：数据处理
- **说明**：获取：任务 / row（操作关系数据库）
- **签名**：`getTaskRow(name: string): CronTaskRecord \| null`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:289
- **引用次数**：6

#### `toTaskRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：任务 / record
- **签名**：`toTaskRecord(raw: Record<string, unknown>): CronTaskRecord`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:296
- **引用次数**：3

#### `toRunRecord`

- **类型**：逻辑控制
- **说明**：格式化/序列化：record
- **签名**：`toRunRecord(raw: Record<string, unknown>): CronTaskRunRecord`
- **位置**：brian-backend/Base/CronProvider/application/CronService.ts:310
- **引用次数**：4

## 文件 `brian-backend/Base/CronProvider/infrastructure/CronSchemaInitializer.ts`

### CronSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/CronProvider/infrastructure/CronSchemaInitializer.ts:7
- **引用次数**：99

