# Chat Application 测试用例

> 基于 [Chat-PRD.md](../Chat/Chat-PRD.md) 生成，覆盖所有接口及 80%+ 场景。

---

## 测试约定

- 测试框架：vitest + supertest
- 每个测试用例独立：`beforeEach` 初始化临时目录/DB，`afterEach` 清理
- 环境变量：`BRIAN_DATA_DIR`、`BRIAN_DB_PATH`、`BRIAN_LOG_LEVEL=error`、`BRIAN_USE_SQLITE_GRAPH=true`
- 依赖 Mock：OrchestrationEntry（receiveWork/getWorkStatus/cancelWork）、InfoCore（saveInfo/lastNInfo/graphInfo/keywordKInfo/pinInfo）、WriterAgent（saveUserProfile/getUserProfile）、EvolutorAgent（getEvaluation）、RelationDBProvider、LogProvider

---

## 1. SSE 流式推送 — openChatStream

**端点**：`GET /api/chat/stream`

### 1.1 正常场景

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-001 | 正常建立 SSE 连接 | session_id 有效，会话存在 | HTTP 200，Content-Type: text/event-stream，首事件为 `connected`（含 session_id） |
| TC-CHAT-002 | 接收 loading 事件 | OrchestrationEntry 开始处理 work | 接续 connected 后推送 `loading` 事件（含 work_id） |
| TC-CHAT-003 | 接收 agent_created 事件 | AgentBuilder 完成构建一个 Agent | 推送 `agent_created`（含 agent_id, agent_type, agent_name） |
| TC-CHAT-004 | 接收 agent_status 事件 | Agent 状态变更 | 推送 `agent_status`（含 agent_id, status, elapsed_ms） |
| TC-CHAT-005 | 接收 agent_thinking 事件 | Agent Think 阶段产生思考内容 | 推送 `agent_thinking`（含 agent_id, think_content） |
| TC-CHAT-006 | 接收 agent_output 事件 | Agent Answer 阶段产生输出 | 推送 `agent_output`（含 agent_id, output_content） |
| TC-CHAT-007 | 接收 text 事件 | WriterAgent 生成回复文本片段 | 推送 `text`（含 work_id, chunk） |
| TC-CHAT-008 | 接收 done 事件 | work 执行完成 | 推送 `done`（含 work_id, interact_id, final_response, elapsed_ms, token_usage），SSE 连接关闭 |
| TC-CHAT-009 | 接收 error 事件 | work 执行失败 | 推送 `error`（含 work_id, error_message, error_code），SSE 连接关闭 |
| TC-CHAT-010 | 完整 SSE 事件序列 | 一次完整的 work 执行 | 按序推送：connected → loading → agent_created → agent_thinking → agent_status → agent_output → text → done，事件格式符合 SSE 规范 |
| TC-CHAT-015 | SSE 心跳保活 | 长时间无事件推送 | 每隔 sse_heartbeat_interval_ms（默认 30000ms）发送心跳事件 |

### 1.2 异常/边界场景

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-011 | session_id 缺失（空字符串） | 无 session_id 参数 | HTTP 400，error_message 提示 session_id 必填 |
| TC-CHAT-012 | session_id 不存在 | session_id 对应的会话未创建 | HTTP 404，抛出 NotFoundError |
| TC-CHAT-013 | 同 session 已存在 SSE 连接 | 同一 session_id 已有活跃 SSE 连接 | 旧连接关闭，新连接建立成功，旧连接收到 close 事件 |
| TC-CHAT-014 | 客户端主动断开 | SSE 连接中客户端断开 | 事件队列和关联资源被清理，无内存泄漏 |
| TC-CHAT-015 | SSE 心跳保活 | 长时间无事件推送 | 每隔 sse_heartbeat_interval_ms（默认 30000ms）发送心跳注释行 `: heartbeat` |
| TC-CHAT-016 | SSE 事件格式正确性 | 任意事件推送 | 格式为 `event: <type>\ndata: <JSON>\n\n`，JSON 可解析 |
| TC-CHAT-017 | SSE 响应头正确 | 建立 SSE 连接 | Cache-Control: no-cache，Connection: keep-alive，X-Accel-Buffering: no |

---

## 2. 提交工作 — submitWork

**端点**：`POST /api/chat/work`

### 2.1 正常场景

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-020 | 基本提交 work | session_id + msg_content 有效 | HTTP 200，返回 work_id 和 interact_id（UUID 格式） |
| TC-CHAT-021 | 带引用消息提交 | citing_msg_ids 包含有效消息 ID 列表 | HTTP 200，parent_info_ids 反映引用关系 |
| TC-CHAT-022 | 强制编排策略 SIMPLE | force_orchestration_strategy=SIMPLE | work 按 SIMPLE 策略执行 |
| TC-CHAT-023 | 强制编排策略 PLANNING | force_orchestration_strategy=PLANNING | work 按 PLANNING 策略执行 |
| TC-CHAT-024 | 不指定编排策略 | force_orchestration_strategy 不传 | OrchestrationEntry 自动选择策略 |
| TC-CHAT-025 | 提交后 SSE 推送 loading | submitWork 成功后 SSE 连接已建立 | SSE 收到 loading 事件（含 work_id） |

### 2.2 异常/边界场景

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-026 | session_id 缺失 | 请求 body 不含 session_id | HTTP 400 |
| TC-CHAT-027 | msg_content 缺失 | 请求 body 不含 msg_content | HTTP 400 |
| TC-CHAT-028 | msg_content 为空字符串 | msg_content="" | HTTP 400 |
| TC-CHAT-029 | msg_content 超长（> 128KB） | msg_content 超过系统上限 | HTTP 413 或 400 |
| TC-CHAT-030 | session 已溢出 | session 消息数达 max_messages_per_session | HTTP 400，error_message 提示会话已满 |
| TC-CHAT-031 | citing_msg_ids 包含不存在 ID | 引用 ID 列表中含无效 ID | HTTP 200（忽略无效引用，仅建立有效引用关系） |
| TC-CHAT-032 | force_orchestration_strategy 非法值 | 传入非 SIMPLE/PLANNING 的值 | HTTP 400，提示策略非法 |
| TC-CHAT-033 | OrchestrationEntry.receiveWork 返回错误 | 下层 work 提交失败 | HTTP 500，返回错误信息 |
| TC-CHAT-034 | InfoCore.saveInfo 保存失败 | DB 写入异常 | HTTP 500，事务回滚 |
| TC-CHAT-035 | 并发提交多个 work | 同一 session 快速连续提交 | 每个 work 独立处理，work_id 不重复 |

---

## 3. 会话管理

### 3.1 创建会话 — createSession

**端点**：`POST /api/chat/session`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-040 | 创建会话（带标题） | session_title="测试会话" | HTTP 201，返回 session_id（UUID）、session_title、created |
| TC-CHAT-041 | 创建会话（不带标题） | 不传 session_title | HTTP 201，session_title 默认为"新会话" |
| TC-CHAT-042 | 创建会话后 DB 记录落盘 | 创建成功 | chat_session 表存在对应记录，含 id/created/updated/session_id/session_title |
| TC-CHAT-043 | session_id 唯一性 | 连续创建两个会话 | 两个 session_id 不同 |
| TC-CHAT-044 | session_title 含特殊字符 | session_title 含 emoji/Unicode | HTTP 201，内容正确保存 |

### 3.2 删除会话 — deleteSession

**端点**：`DELETE /api/chat/session`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-050 | 删除单个会话 | session_ids=["valid_id"] | HTTP 200，deleted_count=1，会话及关联消息全部删除 |
| TC-CHAT-051 | 批量删除多个会话 | session_ids=["id1","id2","id3"] | HTTP 200，deleted_count=3 |
| TC-CHAT-052 | 删除不存在的会话 | session_ids=["nonexistent"] | HTTP 200，deleted_count=0（幂等） |
| TC-CHAT-053 | 部分存在的批量删除 | session_ids=["valid","nonexistent"] | deleted_count=1（只删除存在的） |
| TC-CHAT-054 | session_ids 为空数组 | session_ids=[] | HTTP 400 |
| TC-CHAT-055 | 删除会话级联清理 | 会话有消息和引用关系 | chat_session、info_raw、info_graph 中相关记录均删除 |
| TC-CHAT-056 | 删除会话事务回滚 | 删除过程中 DB 异常 | 事务回滚，会话和消息不被部分删除 |

### 3.3 搜索会话 — searchSession

**端点**：`GET /api/chat/session`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-060 | 无参数搜索（默认分页） | 无 query 参数 | HTTP 200，返回分页 sessions 列表，total>=0，默认 page_size=20 |
| TC-CHAT-061 | 关键词搜索 | keyword="测试" | 返回 session_title 包含"测试"的会话 |
| TC-CHAT-062 | 时间范围过滤 | start_time + end_time 有效 | 返回 created 在时间范围内的会话 |
| TC-CHAT-063 | 排序 | order_by="created" | 默认 DESC，最新创建的排前面 |
| TC-CHAT-064 | 分页 | page_current=2, page_size=5 | 返回第 2 页、每页 5 条 |
| TC-CHAT-065 | 返回字段完整性 | 搜索成功 | 每条含 session_id, session_title, message_count, last_message_time, created, updated |
| TC-CHAT-066 | 无匹配结果 | keyword 无匹配 | HTTP 200，sessions=[], total=0 |
| TC-CHAT-067 | message_count 正确 | 会话有 5 条消息 | message_count=5 |
| TC-CHAT-068 | 无效分页参数 | page_current=-1 或 page_size=0 | HTTP 400 |

### 3.4 获取会话详情 — getSessionDetail

**端点**：`GET /api/chat/session/:session_id`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-070 | 获取存在的会话详情 | session_id 有效 | HTTP 200，含 session_id, session_title, message_count, created, updated |
| TC-CHAT-071 | session_id 不存在 | 传入不存在的 session_id | HTTP 404 |

### 3.5 更新会话标题 — updateSessionTitle

**端点**：`PATCH /api/chat/session/:session_id`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-075 | 更新标题 | session_title="新标题" | HTTP 200，标题更新，updated 时间刷新 |
| TC-CHAT-076 | session_title 为空 | session_title="" | HTTP 400 |
| TC-CHAT-077 | session_id 不存在 | 更新不存在的会话 | HTTP 404 |

### 3.6 检查会话溢出 — checkSessionOverflow

**端点**：`GET /api/chat/session/:session_id/overflow`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-080 | 未溢出 | 消息数 < max_messages_per_session | is_overflowed=false, message_count < max_messages |
| TC-CHAT-081 | 已溢出 | 消息数 >= max_messages_per_session | is_overflowed=true, message_count >= max_messages |
| TC-CHAT-082 | max_messages_per_session 使用默认值 | 未配置 chat_config | max_messages=1000 |
| TC-CHAT-083 | max_messages_per_session 自定义 | chat_config 配置为 500 | max_messages=500 |
| TC-CHAT-084 | session_id 不存在 | 检查不存在会话 | HTTP 404 |

---

## 4. 消息管理

### 4.1 查询消息历史 — getChatHistory

**端点**：`GET /api/chat/history`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-090 | 按 session_id 查询 | session_id 有效 | HTTP 200，返回该会话消息列表（页间 DESC，页内 ASC），默认 lastN=50 |
| TC-CHAT-091 | 按 work_id 查询 | work_id 有效 | HTTP 200，返回该 work 的消息 |
| TC-CHAT-092 | 按 interact_id 查询 | interact_id 有效 | HTTP 200，返回该交互的消息 |
| TC-CHAT-093 | 限制最近 N 条 | lastN=10 | 返回最近 10 条消息 |
| TC-CHAT-094 | 分页查询 | page_current=1, page_size=10 | 返回第 1 页 10 条 |
| TC-CHAT-095 | 返回字段完整性 | 查询成功 | 每条含 info_id, info_creator_role, info, created, pin, citing_count |
| TC-CHAT-096 | citing_count 正确 | 消息被 3 条其他消息引用 | citing_count=3 |
| TC-CHAT-097 | 页间倒序、页内正序 | 消息 1-20 条 | 第 1 页：消息 20→11（倒序），第 2 页：消息 10→1（倒序）；页内按 created ASC |
| TC-CHAT-098 | 无消息的会话 | 空会话 | messages=[], total=0 |
| TC-CHAT-099 | 多过滤条件组合 | session_id + work_id + lastN | 返回交集结果 |

### 4.2 搜索消息 — searchMessage

**端点**：`GET /api/chat/message/search`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-105 | 关键词搜索 | keyword="React" | HTTP 200，返回消息列表含 info_id, info_creator_role, info, summary, created, session_id |
| TC-CHAT-106 | 限定会话搜索 | keyword="React", session_id 限定 | 仅返回该会话下的匹配消息 |
| TC-CHAT-107 | 分页搜索 | keyword + page_current + page_size | 分页正确 |
| TC-CHAT-108 | keyword 为空 | keyword="" 或不传 | HTTP 400 |
| TC-CHAT-109 | 无匹配结果 | keyword="不存在的关键词" | total=0, messages=[] |

### 4.3 钉住消息 — pinMessage

**端点**：`POST /api/chat/message/:info_id/pin`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-110 | 钉住未钉住的消息 | 消息 pin=false | pin=true，返回 pin=true |
| TC-CHAT-111 | 取消钉住已钉住的消息 | 消息 pin=true | pin=false，返回 pin=false |
| TC-CHAT-112 | info_id 不存在 | 钉住不存在的消息 | HTTP 404 |

### 4.4 获取消息引用关系图 — getMessageGraph

**端点**：`GET /api/chat/message/graph`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-115 | 获取引用图 | session_id 有效，存在引用关系 | HTTP 200，返回 graph_structure 含 nodes 和 edges |
| TC-CHAT-116 | 无引用关系的会话 | 会话无引用关系 | edges=[], nodes 包含所有消息节点 |
| TC-CHAT-117 | session_id 缺失 | 不传 session_id | HTTP 400 |
| TC-CHAT-118 | session_id 不存在 | 无效 session_id | HTTP 200，nodes=[], edges=[] |
| TC-CHAT-119 | 节点属性完整性 | 存在引用图 | nodes 每条含 info_id, info_creator_role, created, pin |
| TC-CHAT-120 | 边属性完整性 | 存在引用图 | edges 每条含 citing_info_id, cited_info_id |

---

## 5. 取消工作 — cancelWork

**端点**：`POST /api/chat/work/:work_id/cancel`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-130 | 取消进行中的 work | work 状态为 RUNNING | cancelled=true，SSE 推送 error 事件（error_message="用户取消"） |
| TC-CHAT-131 | 带原因取消 | reason="测试取消" | cancelled=true，OrchestrationEntry.cancelWork 收到 reason 参数 |
| TC-CHAT-132 | 取消已完成的 work | work 状态为 COMPLETED | cancelled=false |
| TC-CHAT-133 | work_id 不存在 | 无效 work_id | HTTP 404 或 cancelled=false |
| TC-CHAT-134 | OrchestrationEntry.cancelWork 异常 | 下层取消操作抛异常 | HTTP 500 |

---

## 6. 配置（委托 Config Application）

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CHAT-140 | Chat 模块无独立 HTTP 配置端点 | 尝试 POST /api/chat/config | configChat 为内部方法，仅供 Config Application 代理调用 |
| TC-CHAT-141 | Chat 配置通过 Config Application 修改 | POST /api/config/update { config_key: "chat.max_messages_per_session", value: 500 } | 配置成功，checkSessionOverflow 使用新值 |

---

## 覆盖率矩阵

| 功能模块 | 接口数 | 测试用例数 | 场景覆盖 |
|---------|--------|----------|---------|
| SSE 流式推送 | 1 | 22 | 正常流程 + 边界 + 错误处理 + 连接管理 + 心跳 + 重复连接 |
| 提交工作 | 1 | 18 | 正常 + 引用 + 策略 + 校验 + 溢出 + 异常 + 无效引用 |
| 会话管理 | 6 | 25 | CRUD + 批量 + 搜索 + 溢出 + 边界 |
| 消息管理 | 4 | 25 | 查询 + 搜索 + 钉住 + 引用图 + 分页 |
| 取消工作 | 1 | 5 | 正常 + 状态 + 异常 |
| 配置委托 | — | 2 | 内部方法验证 + 代理修改 |

**总计**：13 个 HTTP 端点，97 个测试用例，覆盖核心流程、边界条件、异常处理、连接冲突等场景。
