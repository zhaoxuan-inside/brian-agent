# Runtime / shared

- 层：**Runtime**　模块：**shared**
- 方法数：**3**（逻辑控制 2 · 数据处理 0 · 通用算法 1）

## 文件 `brian-backend/Runtime/shared/IterationBudget.ts`

### IterationBudget

#### `consume`

- **类型**：逻辑控制
- **说明**：处理 consume
- **签名**：`consume(): boolean`
- **位置**：brian-backend/Runtime/shared/IterationBudget.ts:50
- **引用次数**：23

#### `refund`

- **类型**：通用算法
- **说明**：处理 refund（纯计算，无外部 IO）
- **签名**：`refund(n: unknown): void`
- **位置**：brian-backend/Runtime/shared/IterationBudget.ts:65
- **引用次数**：3

#### `withinToolCallLimit`

- **类型**：逻辑控制
- **说明**：处理 within / 工具 / call / 限额
- **签名**：`withinToolCallLimit(count: number): boolean`
- **位置**：brian-backend/Runtime/shared/IterationBudget.ts:71
- **引用次数**：3

