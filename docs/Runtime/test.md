# Runtime / test

- 层：**Runtime**　模块：**test**
- 方法数：**10**（逻辑控制 3 · 数据处理 1 · 通用算法 6）

## 文件 `brian-backend/Runtime/test/AgentDefVectorMatch.test.ts`

### 模块级函数

#### `match`

- **类型**：逻辑控制
- **说明**：判断校验相关数据（异步编排）
- **签名**：`match(task: string): Promise<{ matched_by: string; def_id: string }>`
- **位置**：brian-backend/Runtime/test/AgentDefVectorMatch.test.ts:89
- **引用次数**：54

## 文件 `brian-backend/Runtime/test/AgentLoop.test.ts`

### 模块级函数

#### `makeLoopInput`

- **类型**：通用算法
- **说明**：构建/初始化：loop / 输入（纯计算，无外部 IO）
- **签名**：`makeLoopInput(overrides?: Partial<ExecAgentLoopInput>): ExecAgentLoopInput`
- **位置**：brian-backend/Runtime/test/AgentLoop.test.ts:100
- **引用次数**：7

#### `makeStreamReport`

- **类型**：通用算法
- **说明**：构建/初始化：流 / 报告（纯计算，无外部 IO）
- **签名**：`makeStreamReport(sessionKey: string): Promise<Report>`
- **位置**：brian-backend/Runtime/test/AgentLoop.test.ts:116
- **引用次数**：7

#### `replayEvents`

- **类型**：数据处理
- **说明**：处理 replay / events（操作关系数据库，反序列化）
- **签名**：`replayEvents(sessionKey: string): Promise<{ events: Array<{ type: string; payload: unknown }> }>`
- **位置**：brian-backend/Runtime/test/AgentLoop.test.ts:126
- **引用次数**：11

## 文件 `brian-backend/Runtime/test/AskUser.test.ts`

### 模块级函数

#### `task`

- **类型**：通用算法
- **说明**：处理 任务（纯计算，无外部 IO）
- **签名**：`task()`
- **位置**：brian-backend/Runtime/test/AskUser.test.ts:129
- **引用次数**：200

## 文件 `brian-backend/Runtime/test/RuntimeGateway.test.ts`

### 模块级函数

#### `submit`

- **类型**：逻辑控制
- **说明**：处理 submit（异步编排）
- **签名**：`submit(message: string, sessionKey: unknown, queueMode?: 'steer' \| 'followup' \| 'interrupt'): Promise<{ runId: string; steered: boolean; queued: boolean }>`
- **位置**：brian-backend/Runtime/test/RuntimeGateway.test.ts:169
- **引用次数**：21

#### `keyOf`

- **类型**：通用算法
- **说明**：处理 键（纯计算，无外部 IO）
- **签名**：`keyOf(k: string)`
- **位置**：brian-backend/Runtime/test/RuntimeGateway.test.ts:568
- **引用次数**：4

## 文件 `brian-backend/Runtime/test/Session.test.ts`

### 模块级函数

#### `makeSession`

- **类型**：通用算法
- **说明**：构建/初始化：会话（纯计算，无外部 IO）
- **签名**：`makeSession(): Promise<string>`
- **位置**：brian-backend/Runtime/test/Session.test.ts:43
- **引用次数**：5

#### `makeMessage`

- **类型**：通用算法
- **说明**：构建/初始化：消息（纯计算，无外部 IO）
- **签名**：`makeMessage(sessionId: string, role: MessageRole, content: string): Promise<string>`
- **位置**：brian-backend/Runtime/test/Session.test.ts:51
- **引用次数**：5

## 文件 `brian-backend/Runtime/test/SkillRuntime.test.ts`

### 模块级函数

#### `makeDef`

- **类型**：逻辑控制
- **说明**：构建/初始化：def
- **签名**：`makeDef(id: string): AnyToolDef`
- **位置**：brian-backend/Runtime/test/SkillRuntime.test.ts:120
- **引用次数**：4

