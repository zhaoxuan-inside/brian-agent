# Chat Application

## 1. 设计目标

1. 接收用户的 HTTP Chat 请求，通过 SSE（Server-Sent Events）流式推送系统的处理进度和回复内容；
2. 将用户的工作请求委托给 Orchestration 层（OrchestrationEntry.receiveWork）完成工作编排，通过 SSE 将处理过程实时推送至前端；
3. 提供会话（session）管理能力：创建、删除、搜索、查询、溢出检查；
4. 提供消息（info）管理能力：历史查询、搜索、引用记录查询；
5. 提供 Agent 编排 DAG 可视化数据查询入口，透传 Orchestration 层可视化数据至前端；
6. 提供工作（work）取消能力，支持中断正在执行的 work。

## 2. 模块职责

Chat Application 是系统最上层的用户交互入口，位于 Application 层。它不直接处理 Agent 编排、执行或 LLM 调用，而是通过 Orchestration 层（`OrchestrationEntry.receiveWork`）启动工作流，并通过 SSE 将下层各阶段的状态变化实时推送给前端。

### 依赖关系

| 依赖层级 | 模块 | 调用接口 | 用途 |
|---------|------|---------|------|
| Orchestration | OrchestrationEntry | receiveWork | 同步提交工作，获取最终回复 |
| Orchestration | OrchestrationEntry | receiveWorkAsync | 异步提交工作，通过回调获取结果 |
| Orchestration | OrchestrationEntry | getWorkStatus | 查询 work 执行状态 |
| Orchestration | OrchestrationEntry | cancelWork | 取消正在执行的 work |
| Orchestration | OrchestrationVisualization | visualizeAgentDAG | 获取 Agent DAG 结构数据 |
| Orchestration | OrchestrationVisualization | visualizeWorkFlow | 获取 work 流程时间线 |
| Orchestration | OrchestrationVisualization | getAgentNodeDetail | 获取单个 Agent 节点详情 |
| Core | InfoCore | saveInfo | 保存用户输入消息 |
| Core | InfoCore | lastNInfo | 查询最近 N 条消息 |
| Core | InfoCore | graphInfo | 获取会话的消息引用图结构 |
| Core | InfoCore | keywordKInfo | 按关键词搜索消息 |
| Core | InfoCore | similarKInfo | 按语义相似度搜索消息 |
| Core | InfoCore | pinInfo | 钉住/取消钉住消息 |
| Core | InfoCore | context | 构建会话上下文 |
| Agent | WriterAgent | saveUserProfile | 保存用户偏好设置 |
| Agent | WriterAgent | getUserProfile | 获取用户偏好设置 |
| Agent | EvolutorAgent | getEvaluation | 获取 Agent 评估历史 |
| Base | RelationDBProvider | insertDB / selectDB / updateDB / deleteDB | 会话和消息元数据 CRUD |
| Base | LogProvider | debug / info / warn / error | 日志记录 |

## 3. 功能设计

### 3.1. SSE 流式推送（openChatStream）

**功能**：建立 SSE 连接，将 work 执行过程中的各阶段事件实时推送给前端

**URL**：`GET /api/chat/stream`

**入参（Query String）**：
- `session_id`（STRING，必选）：会话 ID

**SSE 事件类型**：

| 事件类型 | 数据内容 | 触发时机 | 数据来源 |
|---------|---------|---------|---------|
| `connected` | `{ session_id }` | SSE 连接建立成功 | 本模块 |
| `loading` | `{ work_id }` | work 已提交，Orchestration 层开始处理 | OrchestrationEntry |
| `agent_created` | `{ agent_id, agent_type, agent_name }` | AgentBuilder 构建完成一个 Agent | OrchestrationExecution |
| `agent_status` | `{ agent_id, status, elapsed_ms }` | Agent 执行状态变更（RUNNING → COMPLETED / FAILED） | OrchestrationExecution |
| `agent_thinking` | `{ agent_id, think_content }` | Agent 执行 Think 阶段产生思考内容 | AgentExecution |
| `agent_output` | `{ agent_id, output_content }` | Agent 执行 Answer 阶段产生输出 | AgentExecution |
| `text` | `{ work_id, chunk }` | WriterAgent 生成最终回复的文本片段 | WriterAgent |
| `done` | `{ work_id, interact_id, final_response, elapsed_ms, token_usage }` | work 执行完成 | OrchestrationEntry |
| `error` | `{ work_id, error_message, error_code }` | work 执行失败 | OrchestrationEntry |

**处理流程**：

1. 设置 SSE 响应头（`Content-Type: text/event-stream`，`Cache-Control: no-cache`，`Connection: keep-alive`）；
2. 发送 `connected` 事件确认连接建立；
3. 维护一个事件队列（per-session），下层通过回调/事件机制向该队列推送事件；
4. 循环从事件队列取出事件，格式化为 SSE 消息（`event: xxx\ndata: {...}\n\n`）写入响应流；
5. 当接收到 `done` 或 `error` 事件时，关闭 SSE 连接；
6. 客户端断开连接时，清理事件队列和关联资源。

### 3.2. 提交工作（submitWork）

**功能**：接收用户输入，提交工作到 Orchestration 层执行，并通过 SSE 推送执行过程

**URL**：`POST /api/chat/work`

**入参**：
- input：SubmitWorkInput（继承 Input），包含以下字段：
  - session_id（STRING，必选）：会话 ID
  - msg_content（STRING，必选）：用户输入内容
  - citing_msg_ids（STRING[]，可选）：引用的消息 ID 列表
  - force_orchestration_strategy（ENUM，可选）：强制编排策略（"SIMPLE" | "PLANNING"）
- context：SubmitWorkContext（继承 Context），会话上下文（session_id 等）
- output：SubmitWorkOutput（继承 Output），承载返回内容：
  - work_id：工作 ID
  - interact_id：交互 ID

**处理流程**：

1. 校验 `session_id` 和 `msg_content` 非空；
2. 调用 `checkSessionOverflow` 检查会话是否已溢出（消息数超过上限），若溢出则返回错误；
3. 生成 `work_id` 和 `interact_id`（UUID）；
4. 调用 InfoCore.saveInfo 保存用户输入消息（info_creator_role=REQUEST）；
5. 若 `citing_msg_ids` 非空，在 InfoCore.saveInfo 中传入 parent_info_ids 建立引用关系；
6. 通过 SSE 推送 `loading` 事件（含 work_id）；
7. 调用 OrchestrationEntry.receiveWork 提交工作（传入 session_id、user_query、force_orchestration_strategy）；
8. OrchestrationEntry 执行过程中，通过回调/事件机制将各阶段状态推送到 SSE 事件队列：
   a. Agent 创建 → `agent_created` 事件；
   b. Agent 状态变更 → `agent_status` 事件；
   c. Agent 思考内容（Think 阶段）→ `agent_thinking` 事件；
   d. Agent 输出内容（Answer 阶段）→ `agent_output` 事件；
   e. WriterAgent 文本片段 → `text` 事件；
9. work 执行完成，推送 `done` 事件（含 work_id、interact_id、final_response、elapsed_ms、token_usage）；
10. 若 work 执行失败，推送 `error` 事件（含 error_message）；
11. 将 work_id 和 interact_id 写入 output 返回；

### 3.3. 会话管理

#### 3.3.1. 创建会话（createSession）

**功能**：创建一个新的会话

**URL**：`POST /api/chat/session`

**入参**：
- input：CreateSessionInput（继承 Input），包含以下字段：
  - session_title（STRING，可选）：会话标题，不传则默认为"新会话"
- context：CreateSessionContext（继承 Context）
- output：CreateSessionOutput（继承 Output），承载返回内容：
  - session_id：新创建的会话 ID
  - session_title：会话标题
  - created：创建时间

**处理流程**：

1. 生成 `session_id`（UUID）；
2. 调用 RelationDBProvider.insertDB 向 `chat_session` 表（库名=chat）插入会话记录：`{ session_id, session_title, created, updated }`；
3. 将 session_id、session_title、created 写入 output 返回；

#### 3.3.2. 删除会话（deleteSession）

**功能**：删除指定的会话及其关联的所有消息

**URL**：`DELETE /api/chat/session`

**入参**：
- input：DeleteSessionInput（继承 Input），包含以下字段：
  - session_ids（STRING[]，必选）：要删除的会话 ID 列表（支持批量）
- context：DeleteSessionContext（继承 Context）
- output：DeleteSessionOutput（继承 Output），承载返回内容：
  - deleted_count：删除的会话数量

**处理流程**：

1. 校验 `session_ids` 非空；
2. 调用 RelationDBProvider.transactionDB 开启事务：
   a. 遍历 session_ids，调用 RelationDBProvider.deleteDB 删除 `chat_session` 表中对应记录；
   b. 调用 RelationDBProvider.deleteDB 删除 `chat_session` 表中关联记录（级联清理）；
   c. 注意：关联的消息（info_raw 表）由 InfoCore.delInfo 负责清理，不在此处删除；
3. 事务提交，返回 deleted_count；

#### 3.3.3. 搜索会话（searchSession）

**功能**：搜索会话，支持关键词搜索、时间范围过滤、排序、分页

**URL**：`GET /api/chat/session`

**入参（Query String）**：
- keyword（STRING，可选）：搜索关键词（匹配 session_title）
- start_time（INT64，可选）：起始时间（毫秒时间戳）
- end_time（INT64，可选）：结束时间（毫秒时间戳）
- order_by（STRING，可选）：排序字段（created），默认 created DESC
- page_current（INT，可选）：当前页码，默认 1
- page_size（INT，可选）：每页记录数，默认 20

**输出**：
- sessions：会话列表 [{ session_id, session_title, message_count, last_message_time, created, updated }]
- total：总记录数

**处理流程**：

1. 构建查询条件（Condition[]）：keyword → LIKE 匹配 session_title；start_time/end_time → BETWEEN；
2. 调用 RelationDBProvider.selectDB 查询 `chat_session` 表；
3. 对每条会话记录，通过 RelationDBProvider.countDB 统计 `info_raw` 表中该 session 的消息数量（message_count）；
4. 按 order_by 排序，按 page 分页返回；

#### 3.3.4. 获取会话详情（getSessionDetail）

**功能**：获取指定会话的详细信息

**URL**：`GET /api/chat/session/:session_id`

**入参**：
- session_id（Path Param，必选）

**输出**：
- session：{ session_id, session_title, message_count, created, updated }

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 session_id 查询 `chat_session` 表；
2. 统计消息数量；
3. 返回会话详情；

#### 3.3.5. 更新会话标题（updateSessionTitle）

**功能**：更新会话的标题

**URL**：`PATCH /api/chat/session/:session_id`

**入参**：
- input：UpdateSessionTitleInput（继承 Input），包含以下字段：
  - session_id（STRING，必选，来自 Path Param）
  - session_title（STRING，必选）：新标题
- context：UpdateSessionTitleContext（继承 Context）
- output：UpdateSessionTitleOutput（继承 Output）

**处理流程**：

1. 校验 session_title 非空；
2. 调用 RelationDBProvider.updateDB 更新 `chat_session` 表中 session_id 对应记录的 session_title 和 updated 字段；

#### 3.3.6. 检查会话溢出（checkSessionOverflow）

**功能**：检查指定会话的消息数量是否超出上限

**URL**：`GET /api/chat/session/:session_id/overflow`

**入参**：
- session_id（Path Param，必选）

**输出**：
- is_overflowed（BOOLEAN）：是否溢出
- message_count（INT）：当前消息数量
- max_messages（INT）：最大消息数量阈值

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `chat_config` 表获取 `max_messages_per_session`（默认 1000）；
2. 调用 RelationDBProvider.countDB 统计 `info_raw` 表中该 session_id 的消息数量；
3. 比较 message_count 与 max_messages_per_session，返回是否溢出；

### 3.4. 消息管理

#### 3.4.1. 查询消息历史（getChatHistory）

**功能**：查询指定会话/工作的消息历史

**URL**：`GET /api/chat/history`

**入参（Query String）**：
- session_id（STRING，可选）：会话 ID
- work_id（STRING，可选）：工作 ID
- interact_id（STRING，可选）：交互 ID
- lastN（INT，可选）：最近 N 条，默认 50
- page_current（INT，可选）：当前页码
- page_size（INT，可选）：每页记录数

**输出**：
- messages：消息列表 [{ info_id, info_creator_role, info, created, pin, citing_count }]
- total：总记录数

**处理流程**：

1. 调用 InfoCore.lastNInfo 查询消息（传入 session_id、work_id、lastN 等过滤条件）；
2. 对每条消息，调用 RelationDBProvider.countDB 统计 `info_graph` 表中该消息被引用的次数（citing_count）；
3. 返回消息列表；

#### 3.4.2. 搜索消息（searchMessage）

**功能**：按关键词搜索消息

**URL**：`GET /api/chat/message/search`

**入参（Query String）**：
- keyword（STRING，必选）：搜索关键词
- session_id（STRING，可选）：限定会话范围
- page_current（INT，可选）：当前页码
- page_size（INT，可选）：每页记录数

**输出**：
- messages：消息列表 [{ info_id, info_creator_role, info, summary, created, session_id }]
- total：总记录数

**处理流程**：

1. 调用 InfoCore.keywordKInfo 按关键词搜索（传入 info=keyword）；
2. 若指定 session_id，在结果中过滤；
3. 对每条结果调用 InfoCore.lastNInfo 获取完整内容；
4. 分页返回；

#### 3.4.3. 钉住消息（pinMessage）

**功能**：钉住或取消钉住一条消息

**URL**：`POST /api/chat/message/:info_id/pin`

**入参**：
- info_id（Path Param，必选）：消息 ID

**输出**：
- pin：当前钉住状态（true/false）

**处理流程**：

1. 调用 InfoCore.pinInfo 切换钉住状态；
2. 返回当前钉住状态；

#### 3.4.4. 获取消息引用关系（getMessageGraph）

**功能**：获取指定会话内消息的引用关系图结构

**URL**：`GET /api/chat/message/graph`

**入参（Query String）**：
- session_id（STRING，必选）：会话 ID

**输出**：
- graph_structure：{ nodes: [{ info_id, info_creator_role, created, pin }], edges: [{ citing_info_id, cited_info_id }] }

**处理流程**：

1. 调用 InfoCore.graphInfo 获取会话内消息的引用关系图结构；
2. 直接透传返回给前端；

### 3.5. 可视化数据透传

#### 3.5.1. 获取 Agent DAG 可视化数据（getAgentDAG）

**功能**：获取一次 work 的 Agent DAG 结构数据，用于前端 Canvas 渲染

**URL**：`GET /api/chat/work/:work_id/dag`

**入参**：
- work_id（Path Param，必选）

**输出**：
- agent_dag_structure：透传 OrchestrationVisualization.visualizeAgentDAG 的返回结果

**处理流程**：

1. 调用 OrchestrationVisualization.visualizeAgentDAG(work_id) 获取 DAG 结构；
2. 对结构中的节点，按需调用下层接口获取补充信息：
   a. AgentExecution.getTrace(trace_id) → 执行链路详情；
   b. AgentLibrary.getAgent(agent_id) → Agent 元数据；
   c. AgentContext.getContextByTrace(trace_id) → 上下文来源统计；
3. 返回完整 DAG 结构数据；

#### 3.5.2. 获取 Agent 节点详情（getAgentNodeDetail）

**功能**：获取单个 Agent 节点的执行详情

**URL**：`GET /api/chat/work/:work_id/agent/:agent_id`

**入参**：
- work_id（Path Param，必选）
- agent_id（Path Param，必选）

**输出**：
- agent_node_detail：透传 OrchestrationVisualization.getAgentNodeDetail 的返回结果

**处理流程**：

1. 调用 OrchestrationVisualization.getAgentNodeDetail(work_id, agent_id) 获取节点详情；
2. 按需调用下层接口获取内容详情（trace、Agent 配置、上下文内容等）；
3. 返回详情数据；

#### 3.5.3. 获取 Work 执行时间线（getWorkFlow）

**功能**：获取一次 work 的完整执行阶段时间线

**URL**：`GET /api/chat/work/:work_id/timeline`

**入参**：
- work_id（Path Param，必选）

**输出**：
- workflow_timeline：透传 OrchestrationVisualization.visualizeWorkFlow 的返回结果

**处理流程**：

1. 调用 OrchestrationVisualization.visualizeWorkFlow(work_id) 获取时间线数据；
2. 返回时间线；

### 3.6. 取消工作（cancelWork）

**功能**：取消一个正在执行的 work

**URL**：`POST /api/chat/work/:work_id/cancel`

**入参**：
- work_id（Path Param，必选）
- reason（STRING，可选）：取消原因

**输出**：
- cancelled（BOOLEAN）：是否成功取消

**处理流程**：

1. 调用 OrchestrationEntry.cancelWork(work_id, reason) 取消 work；
2. 通过 SSE 推送 `error` 事件（error_message="用户取消"）；
3. 返回取消结果；

### 3.7. 配置（configChat）

**功能**：配置 Chat Application 的参数

**URL**：`POST /api/chat/config`

**入参**：
- input：ConfigChatInput（继承 Input），包含以下字段：
  - max_messages_per_session（INT，可选）：每会话最大消息数，默认 1000
  - sse_heartbeat_interval_ms（INT，可选）：SSE 心跳间隔（毫秒），默认 30000
  - default_history_lastN（INT，可选）：默认历史消息查询数量，默认 50
- context：ConfigChatContext（继承 Context）
- output：ConfigChatOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `chat_config` 表获取当前配置；
2. 对每个非空入参进行校验和更新；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置；

## 4. 重要内容

1. 所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；
2. Chat Application 不直接调用 LLMProvider、SkillProvider、MCPProvider 等 Base 层 Provider，所有 LLM/Skill/MCP 调用通过 Orchestration → Agent 层完成；
3. SSE 连接管理：每个 session 最多允许一个 SSE 连接，新连接建立时关闭旧连接；
4. 会话溢出检查：在 submitWork 前自动检查，溢出时拒绝新消息提交；
5. 所有外部资源访问必须通过对应的 Provider/Access 层，禁止绕过；
6. 所有日志通过 LogProvider 记录，禁止 console.log；
7. 所有 ID 通过 IdGenerator.generate() 生成；

## 5. 表设计

### 5.1. Chat 会话表（SQLite）

- 表名：chat_session
- 库名：chat

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话 ID | UUID | N | 唯一索引 | |
| session_title | 会话标题 | VARCHAR | N | | 默认"新会话" |

### 5.2. Chat 配置表（SQLite）

- 表名：chat_config
- 库名：chat

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| max_messages_per_session | 每会话最大消息数 | INT | N | | 默认 1000 |
| sse_heartbeat_interval_ms | SSE 心跳间隔（ms） | INT | N | | 默认 30000 |
| default_history_lastN | 默认历史消息查询数量 | INT | N | | 默认 50 |

## 6. 前端页面需求覆盖

| 前端页面需求 | 对应接口 | 说明 |
|------------|---------|------|
| 对话输入 | submitWork | 提交用户输入，启动 work 执行 |
| SSE 流式回复 | openChatStream | 实时推送 work 执行过程 |
| 消息列表展示 | getChatHistory | 查询会话消息历史 |
| 消息引用 | submitWork（citing_msg_ids） | 提交时携带引用消息 ID |
| 回复气泡流式显示 | openChatStream（text 事件） | WriterAgent 逐块推送文本 |
| Thinking 消息展示 | openChatStream（agent_thinking 事件） | Agent 思考过程 |
| 反馈按钮 | 见 Feedback Application（本文档暂不涉及） | 评分/点赞/点踩 |
| 会话列表 | searchSession | 搜索会话列表 |
| 会话创建 | createSession | 创建新会话 |
| 会话删除 | deleteSession | 删除会话 |
| 会话搜索 | searchSession（keyword） | 按关键词搜索会话 |
| 会话溢出检查 | checkSessionOverflow | 检查消息数量上限 |
| ChatMap 引用关系图 | getMessageGraph | 获取消息引用关系图 |
| Agent 编排 DAG 弹窗 | getAgentDAG | 获取 Agent DAG 图结构 |
| Agent 节点详情 | getAgentNodeDetail | 获取单个 Agent 执行详情 |
| Work 执行时间线 | getWorkFlow | 获取 work 阶段时间线 |
| 取消工作 | cancelWork | 中断正在执行的 work |
| 钉住消息 | pinMessage | 钉住/取消钉住消息 |