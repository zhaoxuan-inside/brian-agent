# Frontend / api

- 层：**Frontend**　模块：**api**
- 方法数：**4**（逻辑控制 0 · 数据处理 4 · 通用算法 0）

## 文件 `brian-frontend/src/api/index.ts`

### 模块级函数

#### `request`

- **类型**：数据处理
- **说明**：处理 request（网络请求）
- **签名**：`request(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T>`
- **位置**：brian-frontend/src/api/index.ts:19
- **引用次数**：210

#### `cdtFire`

- **类型**：数据处理
- **说明**：处理 CDT / fire（网络请求）
- **签名**：`cdtFire(path: string, body?: string)`
- **位置**：brian-frontend/src/api/index.ts:513
- **引用次数**：9

#### `answerPermission`

- **类型**：数据处理
- **说明**：处理 回答 / 授权（序列化输出）
- **签名**：`answerPermission(permission_id: string, approved: boolean, remember: unknown): Promise<{ ok: boolean; answered: boolean }>`
- **位置**：brian-frontend/src/api/index.ts:674
- **引用次数**：13

#### `answerUserAsk`

- **类型**：数据处理
- **说明**：处理 回答 / 用户 / ask（序列化输出）
- **签名**：`answerUserAsk(ask_id: string, answer: string): Promise<{ ok: boolean; answered: boolean }>`
- **位置**：brian-frontend/src/api/index.ts:678
- **引用次数**：11

