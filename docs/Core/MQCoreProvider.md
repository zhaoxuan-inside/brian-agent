# Core / MQCoreProvider

- 层：**Core**　模块：**MQCoreProvider**
- 方法数：**8**（逻辑控制 3 · 数据处理 3 · 通用算法 2）

## 文件 `brian-backend/Core/MQCoreProvider/access/MQCoreAccess.ts`

### MQCoreAccess

#### `startWorker`

- **类型**：逻辑控制
- **说明**：启动：Worker（返回成功与否，接入层转发至 Service）
- **签名**：`startWorker(input: StartWorkerInput, output: StartWorkerOutput, context: MQCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MQCoreProvider/access/MQCoreAccess.ts:26
- **引用次数**：22

#### `stopWorker`

- **类型**：逻辑控制
- **说明**：删除/清理：Worker（返回成功与否，接入层转发至 Service）
- **签名**：`stopWorker(input: StopWorkerInput, output: StopWorkerOutput, context: MQCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MQCoreProvider/access/MQCoreAccess.ts:32
- **引用次数**：10

#### `soWorker`

- **类型**：逻辑控制
- **说明**：查询：Worker（返回成功与否，接入层转发至 Service）
- **签名**：`soWorker(input: SoWorkerInput, output: SoWorkerOutput, context: MQCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MQCoreProvider/access/MQCoreAccess.ts:38
- **引用次数**：11

## 文件 `brian-backend/Core/MQCoreProvider/application/MQCoreService.ts`

### MQCoreService

#### `startWorker`

- **类型**：通用算法
- **说明**：启动：Worker（纯计算，无外部 IO）
- **签名**：`startWorker(input: StartWorkerInput, output: StartWorkerOutput, _context: MQCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MQCoreProvider/application/MQCoreService.ts:55
- **引用次数**：22

#### `stopWorker`

- **类型**：数据处理
- **说明**：删除/清理：Worker
- **签名**：`stopWorker(input: StopWorkerInput, output: StopWorkerOutput, _context: MQCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MQCoreProvider/application/MQCoreService.ts:99
- **引用次数**：10

#### `soWorker`

- **类型**：通用算法
- **说明**：查询：Worker（纯计算，无外部 IO）
- **签名**：`soWorker(input: SoWorkerInput, output: SoWorkerOutput, _context: MQCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/MQCoreProvider/application/MQCoreService.ts:131
- **引用次数**：11

### MQCoreService（私有）

#### `pollTick`

- **类型**：数据处理
- **说明**：监听订阅：tick
- **签名**：`pollTick(state: WorkerState): Promise<void>`
- **位置**：brian-backend/Core/MQCoreProvider/application/MQCoreService.ts:159
- **引用次数**：2

#### `handleFailure`

- **类型**：数据处理
- **说明**：处理执行：ndle / failure
- **签名**：`handleFailure(state: WorkerState, msg: MessageRecord): Promise<void>`
- **位置**：brian-backend/Core/MQCoreProvider/application/MQCoreService.ts:209
- **引用次数**：3

