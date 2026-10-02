# 01 对外 API 规范(_06_interface_design)

> 状态:reviewed　更新:2026-09-30(chg-045 ADR-013)
> 路由权威源:`brian-backend/dev-server.ts` createServer()(R3 拆分后以各路由域模块为权威)。本文件为路径域级契约;R3 拆分路由时同步补全每条路由的 method 列。

## 1. 协议与风格

- 基础路径 `/api/*`;HTTP/1.1(node:http);前端 dev 经 Vite 代理,生产由后端静态托管(serveFrontend)。
- 认证:本地单用户,无鉴权;默认监听 `127.0.0.1:8000`(BRIAN_PORT/BRIAN_HOST)。
- 内容类型:请求 `application/json`;对话流 `text/event-stream`(SSE,帧格式 `data: {"event":...,"data":...,"msg_id":...,"timestamp":...}`)。
- 响应包络:业务方法五参签名,输出统一 `XxxOutput`(含 `error`/`error_code`/`elapsed_ms`);HTTP 层 JSON 序列化。
- WebSocket:`/ws` 当前为 echo 占位通道;全部实时推送走 SSE(StreamProvider)。

## 2. API 域清单(151 条路径)

| 域 | 路径前缀 | 条数 | 用途 | 主要模块 |
|---|---|---|---|---|
| 系统 | /api/health | 1 | 健康检查 | dev-server |
| 对话 | /api/chat/* | 16 | 会话 CRUD、SSE 流、搜索、observation 重放(chg-045)、评估、权限/提问应答、取消 | Application/Chat |
| 配置 | /api/config* | 26 | 配置树/模型/供应商/Soul/MCP/队列/快照/历史 | Application/Config |
| 记忆 | /api/memory* | 10 | 记忆列表/搜索/标签/图谱/热力/日期分布/删除 | Core/InfoCore |
| 智能体 | /api/agent*、/api/orchestration/strategies | 5 | Agent 库 CRUD、策略 | Agent/Library·Strategy |
| 能力 | /api/skill*、/api/mcp* | 9 | 技能 CRUD、MCP 生命周期/市场/用量 | Base/Skill·MCPProvider |
| 学习 | /api/learning/* | 12 | 自学习扫描/队列/insights/知识/进度 | Application/SelfLearning |
| 画像 | /api/profile* | 8 | 画像生成/历史/方向/偏好/重置 | Application/UserProfile |
| 资料库 | /api/library/* | 7 | 路径/文件/查询/批注 | Base 相关 Provider |
| 反馈 | /api/feedback* | 6 | 反馈提交/记录/分析/配置 | Base/FeedbackHandler |
| 观测 | /api/monitor/*、/api/analytics/*、/api/llm/token-usage | 9 | 健康聚合/日志查询/资源/最近运行/模型分布/Token 趋势 | Base/LogProvider 等 |
| 可视化 | /api/visualization/* | 7 | 消息图/DAG/Agent 追溯/资源 | Application/Visualization |
| 工具原语 | /api/tool/* | 11 | JSON/XML/Regex/ID/Cron 纯函数工具 | Base/ToolProvider |
| 向量 | /api/vectordb/search | 1 | 向量检索 | Base/VectorDBProvider |
| 书签 | /api/bookmark/* | 7 | 书签树 CRUD/移动 | Base/BookmarkProvider |
| CDT | /api/cdt/* | 17 | Chrome 启停/导航/点击/键入/求值/ Cookie/录屏/指纹环境 | Base/CDT·CDTCore |
| 定时 | /api/cron/tasks* | 2 | cron 任务 CRUD | Base/CronProvider |
| 提示词 | /api/prompts* | 2 | 提示词模板 CRUD | Base/PromptsProvider |

## 3. 关键接口契约

### API-001 POST /api/chat/stream(对话主通道,SSE)

- **请求**:`{ session_id?, message, agent_id?, mode?, references? }`(字段以 ChatStreamInput 为准)
- **响应**:SSE 结构化帧序列(BrianSSEMessage:`msg_id/event/data/timestamp`)。ADR-013 起业务帧 `data`=完整 TaskEvent(`shared/contracts/task-event.ts`:v/seq/ts/session_id/run_id/work_id/kind/type/payload/span/ref),共 32 契约事件;传输帧(session.connected/loading/done)仍为扁平 data
- **事件流**:run.accepted → 装配(intent/选举/组件) → run.started → loop(turn/think.delta/reply.delta/llm.invoked/skill.*) → writer/eval → run.finished → session.done;正文流式=reply.delta(delta 累积,`replace:true` 表 Writer 接管替换),思考流=think.delta
- **错误**:流内错误帧;HTTP 层异常 500
- **约束**:TC-V2-010 锁定帧必备字段

### API-002 POST /api/chat/permission/answer(权限问答)

- 敏感工具挂起 → 本接口应答 allow/deny → Run 恢复。

### API-003 POST /api/chat/ask/answer(提问问答)

- Loop 内 ask_user 技能挂起 → 本接口应答 → Run 恢复。

### API-004 POST /api/memory/*(记忆面)

- list/search/tags/tag-graph/keyword-graph/graph-search/heatmap/date-counts + DELETE;对应 InfoCore 七路召回与图重建。

### API-005 POST /api/cdt/*(浏览器自动化面)

- start/stop/status/navigate/click/dblclick/rightclick/mouse/key/key-batch/insert-text/evaluate/frame/cookies/screencast/start/spoof-env。

### API-005b GET /api/chat/observation(任务观测重放,ADR-013)

- **参数**:`run_id` 或 `info_id`(dialog_record.work_id 反查),可选 `after_seq`(增量拉取)
- **响应**:`{ run_id, session_id, phase, last_seq, events: TaskEvent[] }`,事件按 seq ASC;执行中=历史+实时叠加(seq 幂等),结束后=纯重放,与实时视图同一 reducer
- **删除**:原 `GET /api/chat/thinking` 与 `/api/chat/thinking/step-content` 已随 thinkingBlocks/executionAnalyzer 删除(chg-045)

### API-006 GET /api/chat/list(会话历史查询)

- **入参**: `userId`, `keyword?`, `start_time?`, `end_time?`, `page_current?`, `page_size?`
- **响应**:
  ```json
  {
    "sessions": [
      {
        "sessionId": "string",
        "sessionTitle": "string (源头限制 8~12 字以内)",
        "lastMessage": "string",
        "lastTime": 1720000000000,
        "created": 1720000000000,
        "createdTime": 1720000000000,
        "messageCount": 10,
        "qaCount": 5,
        "questionChars": 120,
        "answerChars": 850,
        "inputTokens": 2048,
        "outputTokens": 1024,
        "tags": ["Tag1", "Tag2"]
      }
    ],
    "total": 1
  }
  ```
- **契约约束**: `created` / `createdTime` 为 R5 补齐字段；`inputTokens` / `outputTokens` 覆盖会话所有 LLM 调用；`qaCount` 仅计完整问答轮数。


## 4. 错误码表

| 错误码 | HTTP 状态 | 含义 | 调用方应对 |
|---|---|---|---|
| Output.error_code(域内枚举) | 200 包络内 | 业务失败(如 VALIDATION_ERROR) | 按 error_code 分支提示 |
| ValidationError | 400 | 参数校验失败 | 修正入参 |
| 未匹配路由 | 404 | 路径不存在 | 检查路径 |
| 服务异常 | 500 | 未捕获异常 | 查看日志(trace_id) |

## 5. 版本与兼容策略

- 无 URI 版本号;契约以测试锁定(TC-CHAT-*,TC-V2-*)。
- 兼容承诺:字段只增不删;破坏性变更需在 _06 登记 deprecated 并保留旧字段一个里程碑。
- 前端路由契约见 `02_internal_interfaces.md` 第 4 节(页面路径即对外 API)。
