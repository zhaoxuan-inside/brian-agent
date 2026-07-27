# Chat Application

## 1. 设计目标

1. 接收用户的 HTTP Chat 请求，响应一个 SSE 端点，用于处理系统给用户的流式回复内容；
2. 接收来自用户的工作请求，调用 Agent 编排框架完成工作；
3. 提供会话管理能力（创建、删除、搜索、更新、溢出检查）；
4. 提供消息管理能力（历史查询、搜索、引用记录）；

## 2. 功能设计

### 2.1. 获取SSE端点（openChatStream）

**功能**：接收来自前端的 SSE 连接建立请求，建立流式推送通道

**入参**：
- input：OpenChatStreamInput（继承 Input），包含以下字段：
  - session_id：会话ID
- context：OpenChatStreamContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：OpenChatStreamOutput（继承 Output），承载返回内容：
  - stream_channel：流式推送通道

**处理流程**：

1. 完成 SSE 连接建立；
2. 返回流式推送通道；

**返回**：Boolean，表示连接是否建立成功

### 2.2. 发送工作请求（submitWork）

**功能**：接收来自前端的工作请求

**入参**：
- input：SubmitChatWorkInput（继承 Input），包含以下字段：
  - session_id：会话ID
  - msg_content：请求内容
  - citing_msg_ids：引用消息ID列表（可选）
- context：SubmitChatWorkContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SubmitChatWorkOutput（继承 Output），承载返回内容：
  - msg_id：消息ID

**处理流程**：

1. 调用 InfoCore 的 saveInfo 接口保存消息和引用消息列表，得到 msg_id；
2. 根据 msg_id 调用 Agent 编排框架的 submitWork 接口；
3. 将 msg_id 返回给前端；
4. --- 异步执行 ---
5. 根据 session_id 调用 RelationDBProvider 获取 session 信息；
6. 如果没有会话主题，则截取 msg_content 的不超过前 10 个字符作为会话主题，调用 updateSession 接口更新会话主题；

**返回**：Boolean，表示工作提交是否完成；msg_id 通过 output 参数返回

### 2.3. 回调方法（receiveCallback）

**功能**：接收来自 Agent 编排框架的消息，并通过 SSE 将消息发送给前端

**入参**：
- input：ReceiveCallbackInput（继承 Input），包含以下字段：
  - session_id：会话ID
  - work_id：工作ID
  - interact_id：交互ID
  - msg_id：消息ID
  - msg_content：消息内容
- context：ReceiveCallbackContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ReceiveCallbackOutput（继承 Output），承载返回内容（无额外输出字段）

**处理流程**：

1. 将请求体保存到内存队列中，并立即进行返回；
2. 根据 session_id 调用 RelationDBProvider 获取 session 信息；
3. 根据 msg_content 的长度 + chart_count 的已存在长度，作为新的 chart_count；
4. 根据 work_count 的数量 + 1，作为新的 work_count；
5. 将新的 chart_count 和 work_count 更新到 session 表中；
6. 通过 SSE 将 msg_content 发送给前端，直到发送完毕通过 `[end]` 作为结束标识符；

**返回**：Boolean，表示回调处理是否完成

### 2.4. 会话管理

#### 2.4.1. 创建会话（createSession）

**功能**：创建一个空的会话

**入参**：
- input：CreateSessionInput（继承 Input），包含以下字段（无额外输入字段）
- context：CreateSessionContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：CreateSessionOutput（继承 Output），承载返回内容：
  - session_id：会话ID

**处理流程**：

1. 通过 RelationDBProvider 在 `session` 表中新增一条记录获得 id；
2. 返回得到的 session_id；

**返回**：Boolean，表示创建是否完成；session_id 通过 output 参数返回

#### 2.4.2. 删除会话（deleteSession）

**功能**：删除一个会话（只删除 session 表数据，不删除底层消息数据）

**入参**：
- input：DeleteSessionInput（继承 Input），包含以下字段：
  - session_ids：会话ID列表
- context：DeleteSessionContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：DeleteSessionOutput（继承 Output），承载返回内容（无额外输出字段）

**处理流程**：

1. 根据 session_ids 列表通过 RelationDBProvider 在 `session` 表批量删除；

**返回**：Boolean，表示删除是否完成

#### 2.4.3. 搜索会话（searchSession）

**功能**：搜索会话

**入参**：
- input：SearchSessionInput（继承 Input），包含以下字段：
  - session_title：会话标题（可选）
  - session_id：会话ID（可选）
- context：SearchSessionContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SearchSessionOutput（继承 Output），承载返回内容：
  - sessions：会话列表

**处理流程**：

1. 根据 session_title 或 session_id 通过 RelationDBProvider 在 `session` 表匹配 id 或 session_title 字段；
2. 返回搜索到的 session_id 和 session_title；

**返回**：Boolean，表示搜索是否完成；会话列表通过 output 参数返回

#### 2.4.4. 更新会话标题（updateSession）

**功能**：更新会话标题

**入参**：
- input：UpdateSessionInput（继承 Input），包含以下字段：
  - session_id：会话ID
  - session_title：会话标题
- context：UpdateSessionContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateSessionOutput（继承 Output），承载返回内容（无额外输出字段）

**处理流程**：

1. 根据 session_id 通过 RelationDBProvider 在 `session` 表更新 session_title 字段；

**返回**：Boolean，表示更新是否完成

#### 2.4.5. 会话溢出检查（checkSessionOverflow）

**功能**：检查会话是否要溢出

**入参**：
- input：CheckSessionOverflowInput（继承 Input），包含以下字段：
  - session_id：会话ID
- context：CheckSessionOverflowContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：CheckSessionOverflowOutput（继承 Output），承载返回内容：
  - is_overflow：是否溢出

**处理流程**：

1. 根据 session_id 通过 RelationDBProvider 获取 `session` 表的 work_count 和 chart_count 字段；
2. 根据 session_id 通过 RelationDBProvider 获取 `session_config` 表的 max_work_count 和 max_chart_count 字段；
3. 判断 work_count < max_work_count 并且 chart_count < max_chart_count；

**返回**：Boolean，表示检查是否完成；是否溢出通过 output 参数返回

#### 2.4.6. 更新会话配置（updateSessionConfig）

**功能**：更新会话配置参数

**入参**：
- input：UpdateSessionConfigInput（继承 Input），包含以下字段：
  - session_id：会话ID
  - max_work_count：最大工作数量（可选）
  - max_chart_count：最大内容字符数（可选）
- context：UpdateSessionConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateSessionConfigOutput（继承 Output），承载返回内容（无额外输出字段）

**处理流程**：

1. 通过 RelationDBProvider 更新 `session_config` 表中支持的参数；

**返回**：Boolean，表示更新是否完成

#### 2.4.7. 搜索会话配置（searchSessionConfig）

**功能**：获取会话配置参数

**入参**：
- input：SearchSessionConfigInput（继承 Input），包含以下字段：
  - session_id：会话ID
- context：SearchSessionConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SearchSessionConfigOutput（继承 Output），承载返回内容：
  - config：配置信息

**处理流程**：

1. 通过 RelationDBProvider 获取 `session_config` 表中支持的参数；

**返回**：Boolean，表示查询是否完成；配置信息通过 output 参数返回

### 2.5. 消息管理

#### 2.5.1. 搜索消息（searchMessage）

**功能**：搜索会话中的消息

**入参**：
- input：SearchMessageInput（继承 Input），包含以下字段：
  - session_id：会话ID
  - keyword：搜索关键词
- context：SearchMessageContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SearchMessageOutput（继承 Output），承载返回内容：
  - messages：消息列表

**处理流程**：

1. 根据 session_id 和 keyword 通过 RelationDBProvider 搜索消息内容；

**返回**：Boolean，表示搜索是否完成；消息列表通过 output 参数返回

#### 2.5.2. 获取聊天历史（getChatHistory）

**功能**：分页获取会话的聊天历史

**入参**：
- input：GetChatHistoryInput（继承 Input），包含以下字段：
  - session_id：会话ID
  - page：页码
  - page_size：每页条数
- context：GetChatHistoryContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetChatHistoryOutput（继承 Output），承载返回内容：
  - messages：消息列表

**处理流程**：

1. 根据 session_id 通过 RelationDBProvider 分页查询消息记录；

**返回**：Boolean，表示查询是否完成；消息列表通过 output 参数返回

## 3. 表设计

### 3.1. 会话管理表

- 表名：`session`
- 库名：`chat`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_title | 会话主题 | TEXT | Y | | |
| work_count | 工作数量 | INT | N | | 默认为0 |
| chart_count | 内容字符数 | BIGINT | N | | 默认为0 |

### 3.2. 会话配置表

- 表名：`session_config`
- 库名：`chat`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话ID | UUID | N | 外键 | 关联 session 表 |
| max_work_count | 最大工作数量 | INT | Y | | |
| max_chart_count | 最大内容字符数 | BIGINT | Y | | 默认为0 |

## 4. 重要内容

1. Chat 应用是系统最核心的交互方式，所有用户输入通过 Chat 应用进入系统；
2. Chat 应用通过 SSE 实现流式回复，保证用户能实时看到 Agent 的思考过程和输出；
3. 会话管理仅管理 session 表数据，不级联删除底层消息数据；
4. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
