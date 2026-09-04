# Runtime 编排内核（Runtime v2）

> 状态：设计定稿（2026-09-04），替代 `_04_Orchestration`（JSONNode workflow）与 `Agent/AgentExecution`（ExecutionRule 状态机）。
> 决策来源：借鉴 OpenCode / Hermes / OpenClaw 2.0 的编排与思考过程执行设计，弃用 workflow 实现方式。

## 1. 设计目标

1. **代码即编排**：弃用 JSON 驱动代码（外置 DSL + 魔法键 + 双引擎）。编排只有一个两级 `while` 循环；思考过程 = 消息 + 原生工具调用；人类介入 = 队列与挂起原语。不再存在"workflow 引擎"。
2. **消息中心**：循环控制状态（终止判定、待执行工具、排队消息）全部从持久化的消息/Part 派生，不持有内存变量；崩溃后可由持久化数据恢复（OpenCode 模式）。
3. **单一循环 + 编排原语工具化**：计划（`update_plan` 工具）、并行子任务（`delegate` 工具）、澄清/确认（`ask_user` 工具）全部为循环内工具；**不保留 DAG**（用户决策 2026-09-04），并行性由 delegate + subagent lane 提供。
4. **声明式 Agent**：Agent = 纯数据（提示 + 模型 + 工具集 + 权限 + 预算）。行为差异（plan/build/curator）零代码；运行时取会话级原子快照。
5. **事件驱动边界**：全部副作用（SSE 上报、状态落库、可视化）经 EventBus 持久化事件发布；UI 是纯投影；支持重放。
6. **两级网关协议**：立即 ack `{runId, acceptedAt}` → 事件流 → 结算（OpenClaw 两段式 run 协议），HTTP 请求路径零阻塞。
7. **边界 steering 不抢占**：steering 只在工具启动检查点与模型边界抽干重定向；未来工作重定向与已开始工作取消严格分离。

## 2. 决策记录（2026-09-04）

| 决策点 | 结论 | 影响 |
|--------|------|------|
| 是否保留 DAG / DagScheduler | **不保留** | `DagScheduler.ts`（403 行）、TaskDAG/AgentDAG、`buildAgentDAG/execDAG` 全部退役；并行 = delegate 子代理 |
| 是否引入 Effect-TS | **不引入** | 用原生 TS（`AsyncGenerator + AbortSignal + Promise/Deferred`），零框架依赖 |
| 工具参数校验 | **新增依赖 zod** | 项目唯一新增依赖；工具 schema 校验错误作为模型反馈回流 |
| 前端事件协议 | **按建议重构为 v2** | 前端 v2 原生消费 Part 流；**不做旧事件名兼容层**；见 `Bus/Bus-PRD.md` §6 |
| 方法签名 | **5 参规范** | `Boolean method(XxxInput, XxxOutput, XxxContext, XxxMetrics, XxxReport)`；继承 `Base/shared/base/` 五基类 |
| 方法行数 | **≤ 40 行** | 逻辑控制与数据处理必须拆分；见 §7 |

## 3. 概念映射表（旧 → 新）

| 旧概念 | 新概念 | 范式来源 |
|--------|--------|---------|
| `orchestration_work` + `receiveWork` 阻塞 await | **Run**（两段式：submit → ack → 事件流 → settle） | OpenClaw |
| JSONNode strategy JSON（SIMPLE/PLANNING） | **删除**；差异 = 声明式 Agent（`main` 的 plan/build 模式） | OpenCode |
| `ExecutionRule` steps/phases JSON | **删除**；终止条件 = finish reason（无 tool_calls） | 三家 |
| Think→Act→Reflect 模拟工具调用（3 次 LLM/迭代） | 原生 `tool_calls` 循环（1 次 LLM/迭代） | Hermes |
| history 拼接字符串 + regex 反解析 | **结构化 Part**（reasoning/text/tool，每 toolCall 必有配对 result） | OpenCode |
| `sharedData` 魔法键黑板 | 消息流 + Part 引用；工具签名 zod 强类型 | OpenCode |
| PlannerAgent → TaskDAG → DagScheduler | `update_plan` 工具（过程性计划卡）+ `delegate` 工具 | OpenClaw |
| IntentAgent 暂停 `PAUSED_WAITING_CONFIRMATION` | `ask_user` 工具（Deferred 挂起，答复=下一条消息） | OpenCode question |
| WriterAgent 单独角色 | 主循环自身：assistant 消息 + 块流式输出（代码围栏不断裂） | OpenClaw chunker |
| Evolutor 3 个 MQ worker | **background lane 上的 curator**（会话后 fork 审查代理） | Hermes background_review |
| `max_iterations` / `max_execution_depth` | **IterationBudget**（总预算 + 子代理独立预算 + 超支宽限期） | Hermes |
| `Promise.race` 超时（假取消） | **AbortSignal 全链路**（真取消，原因类型化：user/timeout/budget/superseded） | OpenClaw |
| 内联 pushEvent / DB 写散落 | **EventBus**（持久化、每 session 序号、投影订阅） | OpenCode EventV2 |
| AgentBuilder 25% 随机重建 | 声明式 Agent + 会话级快照（快照内不做随机） | OpenClaw generations |

## 4. 模块划分

```
brian-backend/Runtime/                     # 新编排内核
├── Session/    SessionService · MessageService(Part) · RunStateService
├── Runs/       RunGateway(两段式) · RunRegistry · QueueService(steer/followup/collect/interrupt)
├── Loop/       AgentLoopService(两级循环) · StreamProcessorService · ToolExecutorService
├── Tools/      ToolService(defineTool · registry · 6 内置工具)
├── Agents/     AgentDefService(声明式定义 · 会话级快照)
├── Bus/        EventBusService(持久化事件) · EventProjectionService(SSE v2 投影)
└── shared/     IterationBudget · AbortReason · LLMEvent 类型
```

```
docs/_3_BackendDesign/_07_Runtime/
├── Runtime-PRD.md          # 本文件：总览
├── Session/Session-PRD.md  # 会话 · 消息/Part · 运行忙锁
├── Runs/Runs-PRD.md        # 网关 · Lane · 队列模式 · Abort
├── Loop/Loop-PRD.md        # 两级循环 · LLM 适配 · 工具执行 · 预算
├── Tools/Tools-PRD.md      # 工具框架 · 内置工具
├── Agents/Agents-PRD.md    # 声明式 Agent · 系统代理转换
└── Bus/Bus-PRD.md          # 事件总线 · SSE v2 事件协议（前端协议重构）
```

## 5. 模块职责矩阵

| 模块 | 职责 | 依赖层 | 依赖 Provider |
|------|------|--------|--------------|
| Session | runtime_session/message/part/run_state 生命周期；每 session 忙锁 | - | RelationDBProvider, LogProvider |
| Runs | Run 两段式生命周期；lane 代数（session×global×subagent×background）；队列模式；类型化 abort | Session, Bus | LogProvider |
| Loop | 两级 agent 循环；LLMEvent 流处理；工具执行调度；AbortSignal 贯穿 | Session, Runs, Tools, Agents, Bus | LLMProvider, LogProvider |
| Tools | defineTool（zod 校验+权限+截断+错误回流）；内置 6 工具 | Agents | SkillProvider, MCPProvider, CDTProvider, LogProvider |
| Agents | 声明式 Agent 定义 CRUD；会话级原子快照；工作 Agent 组件匹配复用 | - | LLMProvider, LogProvider |
| Bus | 持久化事件发布/订阅/重放；SSE v2 投影；前端 store 规约 | - | StreamProvider, LogProvider |

依赖方向：`Runs → Session/Bus`、`Loop → Session/Runs/Tools/Agents/Bus`、`Tools → Agents`（组件匹配）、`Bus → StreamProvider`。**Runtime 对外只经 `RunGateway` 一个入口**（Application/Chat → RunGateway.submitRun）。

## 6. 整体执行流程

```
POST /api/chat/stream（SSE 长连接，仅订阅）
  └── RunGateway.submitRun(HTTP 独立入口 POST /api/chat/run)
        │  立即返回 { run_id, accepted_at }（两段式 ack）
        │  lane 获取: session lane(并发1) → global lane(并行上限)
        ▼
┌─────────────────── AgentLoopService.execAgentLoop ───────────────────┐
│ 外层 while(followup 队列)                                             │
│   内层 while(tool_calls + steering)                                   │
│     1. drainSteering() 边界抽干排队消息 → 注入消息流                   │
│     2. budget.consume() 超支 → 强制收尾 prefill                       │
│     3. llm.stream({system, messages, tools, signal})                  │
│        ├─ reasoning/text delta → part.delta 事件 → SSE                │
│        ├─ tool_call delta → part.created(tool)                        │
│        └─ finish reason                                               │
│     4. finish 无 tool_calls → break                                   │
│     5. 逐个 toolExecutor.exec(call) → resultPart（配对）              │
│        ├─ update_plan → plan.updated 事件                             │
│        ├─ delegate → 子 run（subagent lane）→ push 回传 steering 队列 │
│        ├─ ask_user → permission.asked → Deferred 挂起 → 答复=下条消息 │
│        └─ skill/mcp/cdt → 对应 Provider 执行                          │
└───────────────────────────────────────────────────────────────────────┘
        │ agent_end 事件（stop_reason）→ RunGateway.settleRun
        ▼
  background lane: curator（fork 会话 → 评估/优化 Agent/Soul → 更新声明式定义）
```

## 7. 方法签名与拆分规范（强制）

1. **5 参签名**（公开方法/Access 层接口一律）：
   `Boolean methodName(XxxInput input, XxxOutput output, XxxContext context, XxxMetrics metrics, XxxReport report)`
   - `XxxInput extends Input`、`XxxOutput extends Output`、`XxxContext extends Context`、`XxxMetrics extends Metrics`、`XxxReport extends Report`（基类位于 `Base/shared/base/`）。
   - Metrics：耗时统计与日志（AopProxy 自动回填 `elapsed_ms`/`trace_id`）；Report：SSE 客户端上报（无流会话静默降级 no-op）；调用方未传 metrics/report 由 AopProxy 自动创建。
2. **≤ 40 行**（所有方法，含私有）。逻辑控制与数据处理必须拆分：
   - 逻辑控制方法 `handleXxx`：只做流程编排（循环、分支、调用数据方法），每行不处理数据；
   - 数据处理方法 `prepareXxx`/`soXxx`/`transformXxx`：单一职责数据变换，不做流程控制；
   - 例：`handleRunTurn`（逻辑）拆出 `prepareModelMessages`（数据）+ `consumeToolCalls`（逻辑）+ `toResultPart`（数据）。
3. 命名：动词+名词；查询类 `so` 前缀；所有方法经 Access 层 `AopProxy.wrap` 切面注入。
4. 语义约束：错误必须 fail-loud（禁止 `catch { /* best-effort */ }` 静默吞错）；AbortSignal 贯穿全部异步方法。

## 8. 依赖与新增

| 依赖 | 用途 | 说明 |
|------|------|------|
| **zod（新增）** | 工具参数 schema 校验 | 项目唯一新增运行时依赖；校验错误文本作为模型反馈回流（invalid-args 模式） |
| AsyncGenerator / AbortSignal / Promise | 结构化并发 | 不引入 Effect-TS（决策记录 §2） |
| LLMProvider（改造） | LLMEvent 流式事件 | 新增 `LLMEvent`（reasoning/text/tool_call/finish delta）+ 原生 `tool_calls` + AbortSignal（见 `Loop/Loop-PRD.md` §4） |
| StreamProvider（改造） | SSE v2 | 投影通道适配（见 `Bus/Bus-PRD.md`） |

## 9. 迁移路线（并行构建，双轨切换）

| 阶段 | 内容 | 验收标准 |
|------|------|---------|
| **0 地基** ✅（2026-09-04） | `Runtime/` 骨架；Base/LLMProvider 增加 LLMEvent 流 + 原生 tool_calls + AbortSignal | 单测：LLMEvent 流归一化（14 用例）；tool_calls 请求/响应；IterationBudget（6 用例）；zod 依赖就位；见 CHANGELOG 同日记录 |
| **1 数据模型** | Session/Message/Part/RunState（SQLite 6 表）；EventBus + SSE v2 投影 | soContextDetail 读取正确；事件重放一致 |
| **2 单代理循环** ✅（2026-09-04） | agentLoop + Tool 框架（skill/mcp/cdt 3 工具）+ Budget | DIRECT 场景端到端验证（`Runtime/test/AgentLoop.test.ts`：多轮 tool_calls 配对回流→stop / 预算→budget / 取消→aborted / 失败→error）；消息中心派生 wire 消息验证；见 CHANGELOG 同日记录 |
| **3 编排即工具**（部分落地 2026-09-04） | ✅ Runs（两段式 submitRun + session lane + steer/followup/interrupt + waitRun）；✅ Agents（确定性匹配 exact→signature→LLM→构建 + 组件按任务动态重解析 + identity 身份段）；✅ Loop 接 steering/followup 真队列；⬜ update_plan/delegate/ask_user 工具、curator | 线上验证：身份问答自称 Brian（不再套编码 Soul）、一般问答正常、确定性复用不重复构建 |
| **4 网关切换**（过渡投影已上线 2026-09-04） | ✅ Chat v2 分流（`runtime.v2_enabled` 开关，缺省 true）；✅ v2 事件 → 现有前端 SSE 协议过渡投影（part.delta→text_chunk/agent_thinking、tool.*→agent_action/agent_output）；⬜ 前端 v2 原生协议改造（完成后删除过渡投影） | 线上 `/api/chat/stream` 全量走 v2 内核；run 两段式结算 + done 帧 final_response 正确 |
| **5 退役** | 退役清单 §10 全部下线；可视化改为事件投影 | 退役后全量测试通过 |

## 10. 退役清单

| 退役对象 | 行数 | 替代 |
|---------|------|------|
| `Orchestration/JSONNode/application/JSONNodeService.ts`（引擎 + 14 builtin handler） | 1423 | agentLoop + 编排工具 |
| `Orchestration/JSONNode/`（domain/types 节点定义 · validate · trace 表） | ~300 | 消息/Part 模型 |
| `Agent/AgentExecution/application/AgentExecutionService.ts`（ExecutionRule 状态机 + ReACT） | 1559 | Loop + Tools |
| `Agent/AgentExecution/application/trace/`（TraceCodec/TraceStore/PromptRebuilder） | ~300 | Part 持久化 |
| `Orchestration/OrchestrationStrategy/`（SIMPLE/PLANNING 死路径 + handleDAGFailure） | ~1100 | 声明式 Agent + plan 工具 |
| `Orchestration/OrchestrationExecution/`（DagScheduler + TaskDAG→AgentDAG） | ~1500 | delegate + subagent lane |
| `Agent/PlannerAgent` planHierarchical 的 TaskDAG 输出 | ~500 | update_plan 工具（过程性计划卡） |
| `Agent/IntentAgent` 暂停语义 | ~240 | ask_user 工具 |
| `Agent/WriterAgent` Block JSON 输出 | ~540 | 主循环 assistant 流 + 块 chunker |
| `Orchestration/OrchestrationVisualization`（从 DB 重建） | ~700 | 事件投影（timeline/dag 由持久化事件重放） |

保留并复用：`AgentBuilder/AgentLibrary` 组件匹配（LLM/Skill/MCP/Soul 复用判定收敛为 AgentDefService 的组件匹配）；`EvolutorAgent` 评估逻辑（迁入 curator 工具集）；`DagScheduler` **不保留**（决策记录 §2）。

## 11. 表设计（6 表，遵循 DevStandards §5）

| 表名 | 关键字段 | 说明 |
|------|---------|------|
| `runtime_session` | id, created, updated, session_key, title, agent_def_id, status, last_seq | 会话 |
| `runtime_message` | id, created, updated, session_id, run_id, role, seq, token_usage | 消息（user/assistant） |
| `runtime_message_part` | id, created, updated, message_id, run_id, part_type, part_order, content, tool_id, input_json, output_json, status, block_type, block_meta, token_count, elapsed_ms | Part（reasoning/text/tool/steering/subtask） |
| `runtime_run` | id, created, updated, session_id, agent_def_id, parent_run_id, lane, status, stop_reason, queue_mode, budget_total, budget_used, accepted_at, started_at, settled_at | 运行记录 |
| `runtime_event` | id, created, updated, session_id, run_id, seq, event_type, payload_json, ts | 持久化事件日志（重放源） |
| `runtime_agent_def` | id, created, updated, name, mode, prompt_text, prompt_template_id, model_id, tools_json, permissions_json, temperature, budget_default, status | 声明式 Agent 定义 |

外键格式遵循 `表B_id`；所有表含 id/created/updated。

## 12. 测试策略

1. **单测**（vitest）：各模块 Access 公开方法 5 参签名；方法行数 ≤40（脚本 `scripts/analyze-method-length.mjs` 纳入 Runtime）；Loop 的 steering 边界 / 预算超支 / abort 原因；Tool 的 schema 错误回流 / 权限拒绝配对。
2. **集成**：DIRECT/PLANNING 等价场景；澄清挂起-恢复；子代理 push 回传；事件重放与首播一致（replay=durable 语义）。
3. **退役验收**：阶段 5 后，`_04_Orchestration`/`AgentExecution` 相关测试与文档索引（MethodIndex）同步清理。
