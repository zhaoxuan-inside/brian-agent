# Chat Application

## 1. 设计目标

1. 接收用户的 HTTP Chat 请求，通过 SSE（Server-Sent Events）流式推送系统的处理进度和回复内容；
2. 将用户的工作请求委托给 Orchestration 层（OrchestrationEntry.receiveWork）完成工作编排，通过 SSE 将处理过程实时推送至前端；
3. 提供会话（session）管理能力：创建、删除、搜索、查询、溢出检查；
4. 提供消息（info）管理能力：历史查询、搜索、引用记录查询；
5. 提供 Agent 编排 DAG 可视化数据查询入口，透传 Orchestration 层可视化数据至前端；
6. 提供工作（work）取消能力，支持中断正在执行的 work；
7. 注意和消息相关的内容需要进行缓存，以及分步加在的机制，加快消息以及消息关系的展示；

## 2. 模块职责

Chat Application 是系统最上层的用户交互入口，位于 Application 层。它不直接处理 Agent 编排、执行或 LLM 调用，而是通过 Orchestration 层（`OrchestrationEntry.receiveWork`）启动工作流，并通过 SSE 将下层各阶段的状态变化实时推送给前端。

### 依赖关系

| 依赖层级 | 模块 | 调用接口 | 用途 |
|---------|------|---------|------|
| Orchestration | OrchestrationEntry | receiveWork | 同步提交工作，通过回调获取 SSE 事件和最终回复 |
| Orchestration | OrchestrationEntry | receiveWorkAsync | 异步提交工作，通过回调获取结果 |
| Orchestration | OrchestrationEntry | getWorkStatus | 查询 work 执行状态 |
| Orchestration | OrchestrationEntry | cancelWork | 取消正在执行的 work |
| Core | InfoCore | saveInfo | 保存用户输入消息 |
| Core | InfoCore | lastNInfo | 查询最近 N 条消息 |
| Core | InfoCore | graphInfo | 获取会话的消息引用图结构 |
| Core | InfoCore | keywordKInfo | 按关键词搜索消息 |
| Core | InfoCore | pinInfo | 钉住/取消钉住消息 |
| Agent | WriterAgent | saveUserProfile | 保存用户偏好设置 |
| Agent | WriterAgent | getUserProfile | 获取用户偏好设置 |
| Agent | EvolutorAgent | getEvaluation | 获取 Agent 评估历史 |
| Base | RelationDBProvider | insertDB / selectDB / updateDB / deleteDB | 会话和消息元数据 CRUD |
| Base | LogProvider | debug / info / warn / error | 日志记录 |

> **SSE 事件聚合约定**：OrchestrationEntry 作为事件聚合点，统一回调 SSE 事件（`agent_created`、`agent_status`、`agent_thinking`、`agent_output`、`text`、`done`、`error`）。Chat 仅依赖 `OrchestrationEntry` 一个入口，无需直接依赖 `OrchestrationExecution` 或 `AgentExecution`。

## 3. 功能设计

### 3.1. SSE 流式推送（openChatStream）

**功能**：建立 SSE 连接，将 work 执行过程中的各阶段事件实时推送给前端

**URL**：`POST /api/chat/stream`

**入参（JSON Body）**：
- `session_id`（STRING，必选）：会话 ID
- `msg_content`（STRING，必选）：用户输入内容
- `citing_msg_ids`（STRING[]，可选）：引用的消息 ID 列表
- `selected_msg_ids`（STRING[]，可选）：复选的消息 ID 列表（勾选消息进行问答时传入；复选消息自动作为本次输入消息的被引用信息写入 GraphDB 引用边，且本次问答仅以复选消息与钉住消息构建上下文）
- `force_orchestration_strategy`（ENUM，可选）：强制编排策略（"SIMPLE" | "PLANNING"）
- `trace_id`（STRING，可选）：请求链路追踪 ID，贯穿整条处理链路与日志，前端生成并透传；不传时由后端自动生成

**SSE 消息格式**：`data: {json}\n\n`，其中 json 为扁平对象 `{ event: <事件类型>, ...payload }`（事件名内嵌在 data 行中，前端按 `event` 字段分发）。心跳为 SSE 注释行 `: ping`，间隔由 `chat_config.sse_heartbeat_interval_ms` 配置（默认 30000ms）。

**SSE 事件类型**：

| 事件类型 | 数据内容 | 触发时机 | 数据来源 |
|---------|---------|---------|---------|
| `connected` | `{ session_id, trace_id }` | SSE 连接建立成功 | 本模块 |
| `loading` | `{ work_id }` | work 已提交，Orchestration 层开始处理 | OrchestrationEntry |
| `agent_created` | `{ agent_id, agent_type, agent_name, llm_id, soul_id, skill_ids, mcp_ids }` | AgentBuilder 构建完成一个 Agent | OrchestrationExecution |
| `agent_status` | `{ agent_id, status, elapsed_ms }` | Agent 执行状态变更（RUNNING → COMPLETED / FAILED） | OrchestrationExecution |
| `agent_thinking` | `{ agent_id, think_content, input }` | Agent 执行 Think 阶段产生思考内容 | AgentExecution |
| `agent_action` | `{ agent_id, tool_name, params, result }` | Agent 执行 Act 阶段调用工具/Skill | AgentExecution |
| `agent_reflection` | `{ agent_id, reflection, passed }` | Agent 执行 Reflect 阶段自我反思结论 | AgentExecution |
| `agent_output` | `{ agent_id, output_content }` | Agent 执行 Answer 阶段产生输出 | AgentExecution |
| `text` | `{ work_id, chunk }` | WriterAgent 生成最终回复的文本片段 | WriterAgent |
| `done` | `{ work_id, interact_id, trace_id, final_response, elapsed_ms, token_usage, paused }` | work 执行完成；`paused=true` 表示需求理解暂停等待确认（无最终回复，不流式输出文本） | OrchestrationEntry |
| `error` | `{ work_id, trace_id, error_message, error_code }` | work 执行失败（含节点级失败的真实错误信息） | OrchestrationEntry |

**处理流程**：

1. 校验 session_id 与 msg_content；
2. 读取 `chat_config.sse_heartbeat_interval_ms` 作为心跳间隔；
3. 设置 SSE 响应头（`Content-Type: text/event-stream`，`Cache-Control: no-cache`，`Connection: keep-alive`，`X-Accel-Buffering: no`）；
4. 启动心跳定时器，按间隔写入 SSE 注释 `: ping` 保活；
5. 调用 openChatStream 执行编排，通过 onEvent 回调实时将事件格式化为 `data: {...}` 写入响应流；
6. 当接收到 `done` 或 `error` 事件后，清理心跳定时器并关闭 SSE 连接；
7. 客户端断开连接时（req close），停止写入并清理资源。

### 3.2. 提交工作（submitWork）

**功能**：接收用户输入，提交工作到 Orchestration 层执行，并通过 SSE 推送执行过程

**URL**：`POST /api/chat/work`

**入参**：
- input：SubmitWorkInput（继承 Input），包含以下字段：
  - session_id（STRING，必选）：会话 ID
  - msg_content（STRING，必选）：用户输入内容
  - citing_msg_ids（STRING[]，可选）：引用的消息 ID 列表
  - selected_msg_ids（STRING[]，可选）：复选的消息 ID 列表（自动合入 citing_msg_ids 作为被引用信息，且作为本次问答的专属上下文）
  - force_orchestration_strategy（ENUM，可选）：强制编排策略（"SIMPLE" | "PLANNING"）
- context：SubmitWorkContext（继承 Context），会话上下文（session_id 等）
- output：SubmitWorkOutput（继承 Output），承载返回内容：
  - work_id：工作 ID
  - interact_id：交互 ID

**处理流程**：

1. 校验 `session_id` 和 `msg_content` 非空；
2. 调用 `checkSessionOverflow` 检查会话是否已溢出（消息数超过上限），若溢出则返回错误；
3. 生成 `work_id` 和 `interact_id`（UUID）；
4. 将 `user_query`、`citing_msg_ids`、`force_orchestration_strategy` 等透传给 `OrchestrationEntry.receiveWork` 提交工作（Chat 层不直接保存消息，落库统一由 Orchestration 层策略节点完成）；
5. 由 Orchestration 层 JSONNode 策略的 `SAVE_USER_INPUT` 节点保存 REQUEST 消息（含 `citing_msg_ids` 引用关系），`SAVE_RESPONSE` 节点保存 RESPONSE 消息——避免 Chat 层与 Orchestration 层重复落库；
6. 通过 SSE 推送 `loading` 事件（含 work_id）；
7. OrchestrationEntry 执行过程中，通过回调/事件机制将各阶段状态推送到 SSE 事件队列：
   a. Agent 创建 → `agent_created` 事件；
   b. Agent 状态变更 → `agent_status` 事件；
   c. Agent 思考内容（Think 阶段）→ `agent_thinking` 事件；
   d. Agent 输出内容（Answer 阶段）→ `agent_output` 事件；
   e. WriterAgent 文本片段 → `text` 事件；
8. work 执行完成，推送 `done` 事件（含 work_id、interact_id、final_response、elapsed_ms、token_usage、trace_id）；
9. 若 work 执行失败，推送 `error` 事件（含 error_message、error_code、trace_id）；
10. 将 work_id 和 interact_id 写入 output 返回；

### 3.3. 会话管理

#### 3.3.1. 创建会话（createSession）

**功能**：创建一个新的会话

**URL**：`POST /api/chat/create-session`

**入参**：
- input：CreateSessionInput（继承 Input），包含以下字段：
  - session_title（STRING，可选）：会话标题，不传则默认为"新会话"
- context：CreateSessionContext（继承 Context）

#### 3.3.1.1. 会话名称自动生成与手动修改规则

1. **自动生成**：当用户在某个会话中发送第一条消息时，若当前会话名称为默认占位名（如"新会话"或为空），系统会自动将会话的第一条消息截断前 50 个字符，作为本会话的名称。
2. **手动修改**：支持用户通过 `PUT /api/chat/session/:sessionId/title` 接口手动修改会话名称。
3. **保持规则**：当会话已存在自定义或自动生成的特定名称时，后续消息发送时系统不会自动再去生成或覆盖会话名称。
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
   b. 调用 InfoCore.delInfoGraph 删除 GraphDB 中该 session 的 info 节点与引用边；
   c. 调用 RelationDBProvider.deleteDB 删除 `info_raw` 表中该 session 的消息记录（级联清理摘要、向量、标签等加工数据由 InfoCore.delInfo 负责定时清理）；
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

### 3.3.4. 修改会话标题（updateSessionTitle）

**功能**：修改已有会话的标题；另外，在会话首条消息提交时，系统会自动截取前 50 个字符更新会话标题。

**URL**：`POST /api/chat/session/title`

**入参**：
- `session_id`（STRING，必选）：会话 ID
- `session_title`（STRING，必选）：新会话标题

**输出**：
- `updated`（BOOLEAN）：是否更新成功

**处理流程**：
1. 校验 `session_id` 和 `session_title` 非空；
2. 调用 RelationDBProvider.updateDB 更新 `chat_session` 表中对应 `session_id` 的 `session_title` 字段；
3. 返回更新状态；

### 3.4. 消息管理

#### 3.4.1. 查询消息历史（getChatHistory）

**功能**：查询指定会话/工作的消息历史(注意页间是时间倒序排列的，业内是时间正序排列的)

**URL**：`GET /api/chat/history`

**入参（Query String）**：
- session_id（STRING，可选）：会话 ID
- work_id（STRING，可选）：工作 ID
- interact_id（STRING，可选）：交互 ID
- lastN（INT，可选）：最近 N 条，默认 50
- page_current（INT，可选）：当前页码
- page_size（INT，可选）：每页记录数

**输出**（HTTP 层经 snake_case → camelCase 转换，仅保留 REQUEST / RESPONSE 消息）：
- messages：消息列表 [{ id, role, content, timestamp, pin, citingCount, citedCount, citingInfoIds, citedInfoIds, citingIds }]，其中 `role` 由 `info_creator_role` 映射（USER→user，其余→assistant）；包含完整的引用与被引用计数及关联消息 ID 列表；中间过程（THINK / SKILL / MCP / ACT）不在此返回，由 ChatMap DAG 承载
- total：总记录数

**处理流程**：

1. 调用 InfoCore.lastNInfo 查询消息（传入 session_id、work_id、lastN 等过滤条件）；
2. 调用 InfoCore.soCitationEdges 批量查询 GraphDB 引用边，计算每条消息的引用（cited_count / cited_info_ids）与被引用（citing_count / citing_info_ids）关联关系；
3. 过滤出 info_type ∈ {REQUEST, RESPONSE}，映射为前端 camelCase 结构后返回；

#### 3.4.2. 搜索消息（searchMessage）

**功能**：按关键词搜索消息

**URL**：`GET /api/chat/message/search`

**入参（Query String）**：
- keyword（STRING，必选）：搜索关键词
- session_id（STRING，可选）：限定会话范围
- page_current（INT，可选）：当前页码
- page_size（INT，可选）：每页记录数

**输出**：
- messages：消息列表 [{ info_id, info_type, info_creator_role, info, summary, created, session_id }]
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
- graph_structure：{ nodes: [{ info_id, info_type, info_creator_role, created, pin }], edges: [{ citing_info_id, cited_info_id }] }

**处理流程**：

1. 调用 InfoCore.graphInfo 获取会话内消息的引用关系图结构；
2. 直接透传返回给前端；

### 3.5. 可视化数据（委托 Visualization Application）

Chat Application 不直接提供可视化数据接口。前端可视化需求（Agent DAG、Work 时间线、Agent 执行详情、消息图等）统一通过 Visualization Application（`/api/visualization/*`）获取。详见 [Visualization-PRD.md](../Visualization/Visualization-PRD.md)。

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

### 3.7. 配置（委托 Config Application）

Chat 模块的配置通过 Config Application 统一管理（`/api/config/update`，config_key 前缀 `chat.`）。Chat 模块对内保留 `configChat` 方法供 Config Application 代理调用，不对外暴露独立 HTTP 配置端点。

对内 `configChat` 方法管理的可配置项：

| 配置项 | config_key | 类型 | 默认值 | 说明 |
|--------|-----------|------|--------|------|
| max_messages_per_session | `chat.max_messages_per_session` | INT | 1000 | 每会话最大消息数 |
| sse_heartbeat_interval_ms | `chat.sse_heartbeat_interval_ms` | INT | 30000 | SSE 心跳间隔（ms） |
| default_history_lastN | `chat.default_history_lastN` | INT | 50 | 首次加载历史对话时返回给前端展示的消息数量（对话区/图谱）；仅用于 getChatHistory 的展示，与 InfoCore 的上下文构建（context_config）无关 |

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
5. 配置管理委托 Config Application：Chat 不对前端暴露独立配置端点，对内保留 configChat 方法供 Config Application 代理；
6. 可视化数据委托 Visualization Application：Chat 不提供 Agent DAG、Work 时间线、消息图等可视化接口，前端通过 `/api/visualization/*` 获取；
7. SSE 事件由 OrchestrationEntry 统一聚合回调：Chat 仅依赖 OrchestrationEntry 一个入口接收完整事件流，无需直接依赖 OrchestrationExecution 或 AgentExecution；
8. 所有外部资源访问必须通过对应的 Provider/Access 层，禁止绕过；
9. 所有日志通过 LogProvider 记录，禁止 console.log；
10. 所有 ID 通过 IdGenerator.generate() 生成；

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
| 回复气泡流式显示 | openChatStreamV2（reply.delta 事件） | Runtime v2 逐增量推送文本 |
| Thinking 消息展示 | openChatStreamV2（think.created / think.delta 事件，经 Report→StreamProvider SSE）；点按"思考过程"按钮回放走 `GET /api/chat/thinking` | Agent 思考过程；回放数据源：V2 run 查 runtime_run / stream_event / runtime_message / runtime_message_part，V1 历史查编排 5 张表 |
| Planning 策略拆解展示 | openChatStreamV2（实时 agent_dag 事件）；`GET /api/chat/thinking` 响应含 `dag` 字段（V2 直连 run 为单节点 DAG，V1 历史为编排 DAG） | 任务拆解 / Agent DAG / 编排执行步骤 |
| 反馈按钮 | 见 Feedback Application（本文档暂不涉及） | 评分/点赞/点踩 |
| 会话列表 | searchSession | 搜索会话列表 |
| 会话创建 | createSession | 创建新会话 |
| 会话删除 | deleteSession | 删除会话 |
| 会话搜索 | searchSession（keyword） | 按关键词搜索会话 |
| 会话溢出检查 | checkSessionOverflow | 检查消息数量上限 |
| 钉住消息 | pinMessage | 钉住/取消钉住消息 |
| ChatMap 引用关系图 | 委托 Visualization Application | `GET /api/visualization/message-graph` |
| Agent 编排 DAG 弹窗 | 委托 Visualization Application | `GET /api/visualization/work/:work_id/dag` |
| Agent 节点详情 | 委托 Visualization Application | `GET /api/visualization/agent/:agent_id/trace` |
| Work 执行时间线 | 委托 Visualization Application | `GET /api/visualization/work/:work_id/timeline` |
| 取消工作 | cancelWork | 中断正在执行的 work |

## 7. 变更记录

### [2026-09-12] 历史同步只保留最终回复（中间轮叙述不同步 RESPONSE）
**变更原因**：Loop 每轮（含 tool_calls 中间轮）都持久化 assistant 消息，同步把"好的，我来帮你查一下…"等过程叙述各落一条 RESPONSE，历史对话区一次提问出现多个"回答"气泡。

**修改的方法**：
  - `ChatService.syncRuntimeMessagesToInfoRaw` — 含 tool Part 的中间轮 assistant 消息跳过，仅每 run 最后一条 assistant 消息兜底保留；wire 历史走 `runtime_*` 表不受影响（显示侧过滤）。
  - `dev-server.buildThinkingBlocksFromRuntime` — 中间轮文本记为 THINK 步骤（思考过程弹窗可见），仅末轮/纯文本轮文本作为最终回复 output。

**影响的端点**：
  - `GET /api/chat/history/:sessionId` — 每 run 仅一条 RESPONSE（最终回复）+ 完整 ThinkingChain（含中间叙述步骤）；摘要/图谱消费 RESPONSE，同步受益（无中间噪音）。

### [2026-09-09] "复制 TraceId" 关联语义修复（日志补盖 trace_id）
**语义约定**：TraceId = 一次 `openChatStream` SSE 交互的追踪 id（与该轮 `interact_id` 同值）。对话区消息卡"复制 TraceId"（`info_raw.trace_id`）、Feedback/Error 块与评估弹窗复制按钮、监控页 `log_record.trace_id` 过滤，三处同一 id 域。

**变更原因**：`ChatService` 直连 `logger?.info/warn` 绕过 `Metrics.merge` 的 trace_id 自动盖章，`log_record.trace_id` 恒 NULL——复制的 TraceId 在监控页查不到日志，id 失去关联语义。

**修改的方法**：
  - `ChatService.openChatStreamV2` — `run settled` 日志补 `trace_id` / `interact_id` / `work_id`（原行已注释保留）。
  - `ChatService.syncRuntimeMessagesToInfoRaw` — 同步失败 warn 日志补 `trace_id` / `interact_id`。

**影响的端点**：
  - `POST /api/chat/stream` — 每轮 settled 日志携带交互 trace；复制 TraceId → 监控页 `GET /api/monitor/logs/query?trace_id=<值>` 可命中。

### [2026-09-09] 对话区重复上一轮内容修复（同步判重键错误 + 空占位行中断同步）
**变更原因**：`syncRuntimeMessagesToInfoRaw` 每轮结束后按会话全量重读 `runtime_message`，去重条件 `(session_id, info, created)` 中 `created` 取保存时刻（旧数据）或 runtime 真实时间（新数据）——两者对不上时判重必然失败。事故（会话 `fb3efe8f`，interact `5f24881f`/`0c92601f`）：第二轮（`北京`，interact `5f24881f`）run 超时后的同步把第一轮问答（interact `0c92601f`）整组重复插入 info_raw（新 interact 盖旧消息），对话区重复出现上一轮内容；同时空内容占位行（run 未回复完成时 assistant 行 `content=''`）令 `saveInfo` 抛 ValidationError，中断整个同步循环致后续消息漏同步。

**修改的方法**：
  - `ChatService.syncRuntimeMessagesToInfoRaw` — 原代码：按 `created` 精确相等逐条判重 + 空内容直接进 `saveInfo` 抛错中断（原行已注释保留）；修改后：
    1. 去重键改为 `(work_id, info_type, info)`（与 `created` 无关，历史旧数据亦正确判重）；
    2. 已落库集合一次查询载入内存 Set（替代逐条 COUNT 的 N+1）；
    3. 空内容占位行 `continue` 跳过（不再中断循环）；
    4. 读取上限最近 200 条（`ORDER BY seq DESC LIMIT 200` 后反转为时间序）。
  - 注：仍按会话全量读取（而非仅本次 run），保证超时 run 迟到落库的最终回复能在下一轮补齐进历史；迟到补齐行会带当轮 `trace_id`，`work_id` 仍为原 run，历史按 work 分组不受影响。

**影响的端点**：
  - `POST /api/chat/stream` — 会话同步落库判重语义变化（work_id 维度），对话区不再重复历史内容。
  - `GET /api/chat/history/:session_id` — 每条消息仅一份（旧事故会话数据已手工修复：保留 interact `0c92601f` 一组、created 校正为 runtime 真实时间；删除重复组及其派生 tag/keyword）。

**可能存在的问题**：
  - 同一 run 内合法出现的完全相同消息文本（同 work、同类型、同内容）会被判重跳过一条（概率极低，展示无感知）；
  - 超时 run 迟到补齐的历史行 interact_id 归当轮 trace（语义近似，按 work 分组展示正确）。

### [2026-09-09] 对话区消息顺序颠倒修复（user/assistant 同时间戳 + 前端 UUID tie-break）
**变更原因**：`syncRuntimeMessagesToInfoRaw` 在 run 结束后统一同步消息且未携带真实时间 → 同一轮 user/assistant 落库同一 `created`；历史查询按 `created` 排序对同时间戳记录次序不稳定，前端 timeline 同时间戳同 kind 消息落入 UUID 字符串比较 → 用户消息随机显示在系统回复下面。

**修改的方法**：
  - `ChatService.syncRuntimeMessagesToInfoRaw` — 原代码：`SaveInfoInput` 未传 `created`（原行已注释保留）；修改后：`saveInput.created = runtime_message.created`，落库保留消息真实先后（user 先于 assistant），且按 `created` 去重的条件成立。
  - 前端 `ChatArea.vue` timeline — 原代码：同时间戳消息直接 `key.localeCompare`（UUID 随机序）；修改后：同 kind 消息按角色 tie-break（`user` 恒在 `assistant` 之前），兜底存量同时间戳数据的显示顺序。

**影响的端点**：
  - `GET /api/chat/history/:session_id` — 新会话消息按真实时间天然有序；存量同时间戳数据由前端角色 tie-break 保证 user 在前。
  - `POST /api/chat/stream` — 会话同步落库时间戳语义变化（真实消息时间，见 InfoCore-PRD 变更记录）。

**可能存在的问题**：
  - 存量 V2 数据（修复前落库）user/assistant 同时间戳，历史查询层（ORDER BY created）仍不稳定；显示已由前端兜底，无感知。

### [2026-09-09] V2 直连 run 思考过程重建修复（"思考过程"按钮恒为空）
**变更原因**：V1 编排链路移除（2026-09-05）后所有对话走 Runtime v2，但 `GET /api/chat/thinking` 的 `buildThinkingBlocksAndDag` 仅查编排 5 张表，V2 run 无编排记录 → "思考过程"按钮弹窗恒为"暂无思考过程"。实全会话 `09634b38`（interact `abe6eeae-…`）验证：V2 上报（agent.selected / agent.components / context.built / think.delta / reply.delta / run.*）与保存（stream_event / runtime_message_part）均正常，仅重建读表错位。**处理原则：不回退 V1，仅在 V2 链路基础上补齐重建流程。**

**修改的方法**：
  - `dev-server.ts buildThinkingBlocksAndDag` — 原实现改名 `buildThinkingBlocksFromOrchestration` 保留（V1 历史数据只读兼容）；新方法 = 编排表重建 + 无记录 work 回退 `buildThinkingBlocksFromRuntime`（从 runtime_run / stream_event / runtime_message / runtime_message_part 重建 ThinkingChain Block 与单节点 DAG）。
  - `Runtime/Loop/application/AgentLoopService.addTurnPart` — reasoning/text Part 直存后补 `updatePart(status=Completed)`，修复 Part 状态恒 pending。

**影响的端点**：
  - `GET /api/chat/thinking` — V2 直连 run 可回放思考过程（module=all|dag|blocks 均已验证）；V1 历史行为不变。
  - `POST /api/chat/stream` — 新对话的 reasoning/text Part 落库状态为 `completed`。

**可能存在的问题**：
  - `stream_event.run_id` 为空串（report2 未携带 run_id），重建按 session_key + 时间窗关联 run；同会话多 run 时间窗交叠的极端场景存在串扰风险。
  - V2 直连链路不产生 InfoCore 分类上下文，弹窗 pinned/similarity/keyword/random 等分类为空属预期。

### [2026-08-23] 需求理解暂停确认：done 事件 paused 标记、历史接口思考过程重建修复
**变更原因**：① IntentAgent 匹配得分低于阈值时 work 暂停，但 `openChatStream` 仍把暂停的 JSON 串当最终回复流式输出；② `/api/chat/history` 调用 `buildThinkingBlocksAndDag` 时参数错位（少传 infoCore），导致历史消息的思考 Blocks 恒为空，暂停/完成的工作思考过程均无法在刷新后恢复。

**修改的方法**：
  - `ChatService.openChatStream` — 识别 `ReceiveWorkOutput.paused`，暂停时跳过文本流式输出，`done` 事件携带 `paused` 标记（emit 与 streamAccess.pushEvent 双通道）；
  - `dev-server.ts` `/api/chat/history` — `buildThinkingBlocksAndDag` 修复为三参调用（补传 `ctx.infoCore`），并收集全部 work_id（含暂停无 RESPONSE 的 work）；REQUEST 消息在其 work 尚无 RESPONSE 时也挂载 IntentAgent 思考块。

**影响的端点**：
  - `POST /api/chat/stream` — 暂停时不再输出错误文本，`done` 事件 `paused=true`；
  - `GET /api/chat/history/:session_id` — 历史消息正确携带思考 Blocks（含暂停 work 的 IntentAgent 思考过程）。

**可能存在的问题**：
  - 依赖 `orchestration_work.metadata.intent_agent` 落库（暂停分支已保留）；历史旧数据（暂停分支修复前）无该结构时无法重建 IntentAgent 思考块。

### [2026-08-23] trace_id 统一由后端 ToolProvider(IdGenerator) 生成 UUID
**变更原因**：此前 `trace_id` 由前端 `crypto.randomUUID()` 生成，并在非安全上下文（如 `http://<局域网IP>`）下回退为 `trace-${Date.now()}-${Math.random()}` 非 UUID 格式；后端透传不重生成，导致「复制 TraceId」复制到非 UUID 值。生成职责分散于前端、后端 AOP、后端透传三处，反复出错。

**修改的方法**：
- `ChatService.openChatStream` — 统一 `traceId = context.trace_id || IdGenerator.generate()`，贯穿 connected / error / done 事件与 `receiveWork` 落库；
- `dev-server.ts` `/api/chat/stream` — 移除 `body.trace_id` 透传，由 AOP 层 / ChatService 统一生成；
- 前端 `ChatArea.vue` — 移除 `crypto.randomUUID()` + 非 UUID fallback，改为从 `connected` 事件回读后端生成的 trace_id。

**影响的端点**：
- `POST /api/chat/stream` — `connected` 事件回传后端生成的 UUID 格式 trace_id，前端「复制 TraceId」据此复制真实 UUID。

**可能存在的问题**：
- 历史旧数据 `info_raw.trace_id` 仍可能为旧格式（非 UUID），历史消息「复制 TraceId」按旧值展示；新问答统一为 UUID。

### [2026-08-22] getChatHistory 返回真实 trace_id
**变更原因**：`/api/chat/history` 此前将 `traceId` 字段错误回填为 `work_id || interact_id || info_id`，前端「复制 TraceId」复制到 work_id。

**修改的方法**：
- `ChatService.getChatHistory` — 消息映射新增 `trace_id`（取自 `info_raw.trace_id`），`GetChatHistoryOutput.messages` 新增 `trace_id` 字段；
- `dev-server.ts` `/api/chat/history` — `traceId` 改为 `m.trace_id || ''`（仅真实 trace_id，不回落业务 ID）。

**影响的端点**：
- `GET /api/chat/history/:session_id` — 历史消息携带真实 `trace_id`，前端 `MessageCard`「复制 TraceId」据此复制真实 trace_id。

**可能存在的问题**：
- 历史旧数据 `info_raw.trace_id` 为空时「复制 TraceId」按钮不展示；`trace_id` 依赖上游编排在 `saveInfo` 时落库，缺失时由 AOP 层自动生成。

### [2026-09-11] openChatStreamV2 删除重复 title 生成调用
**变更原因**：`openChatStreamV2` 内 `autoGenerateSessionTitleIfEmpty` 被连续调用两次（仅隔一次 Connected/Loading emit）， submitsRun 前每次多做一次 chat_session 查询往返；复盘 interact 65f80eb3 时随网络延迟清理项一并移除。

**修改的方法**：
  - `ChatService.openChatStreamV2` — 保留 `emit(Connected)` 前的一次调用，删除第二次调用（原行已注释保留于方法内）。

**影响的端点**：
  - `POST /api/chat/stream` — 每次问答少 1 次冗余 DB 查询往返；title 自动生成行为不变（首次空名为关键字截断 50 字符）。
