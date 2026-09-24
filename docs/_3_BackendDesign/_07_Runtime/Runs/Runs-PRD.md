# Runs · 运行网关 / Lane / 队列模式 / Abort

> 父文档：`docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md` §4/§6/§9。

## 1. 设计目标

1. **两段式协议**：`submitRun` 立即返回 `{run_id, accepted_at}`；结果由 `agent_end` 事件承载、`settleRun` 落账；HTTP 请求路径零阻塞（OpenClaw 模式）。
2. **Lane 代数**：`session:<key>`（并发 1）× `main`（并发 `min(16, max(8, CPU))`）× `subagent`（默认 8）× `background`（2）——简单 promise 队列实现，零外部依赖。
3. **队列模式**：steering/followup/collect/interrupt 四种排队语义取代旧 `cancelWork/confirmIntent/submitClarification` 重入状态机。
4. **类型化 Abort**：abort 原因 `user | timeout | budget | superseded`；AbortSignal 全链路真取消；规范失败消息（零 usage 记账，OpenClaw turn-interruption）。
5. **5 参签名 + ≤40 行**：逻辑控制与数据处理拆分。

## 2. 领域类型

```typescript
export type LaneKind = 'session' | 'main' | 'subagent' | 'background';
export type QueueMode = 'steer' | 'followup' | 'collect' | 'interrupt';
export type AbortReason = 'user' | 'timeout' | 'budget' | 'superseded';
export type RunStatus = 'accepted' | 'running' | 'queued' | 'finished' | 'error' | 'aborted';

export class SubmitRunInput extends Input { session_key!: string; query!: string; queue_mode?: QueueMode; agent_ref?: string; attachments?: unknown[]; }
export class SubmitRunOutput extends Output { run_id!: string; accepted_at!: number; queued!: boolean; }
export class SettleRunInput extends Input { run_id!: string; stop_reason?: string; error?: string; }
export class SteerRunInput extends Input { run_id!: string; messages!: string[]; mode?: QueueMode; }
export class AbortRunInput extends Input { run_id!: string; reason!: AbortReason; }
export class SoRunStatusInput extends Input { run_id!: string; }
export class SoRunStatusOutput extends Output { status!: RunStatus; stop_reason?: string; budget_used?: number; budget_total?: number; }
export class SoRunsBySessionInput extends Input { session_key!: string; limit?: number; }
export class SoRunHistoryOutput extends Output { runs!: RunRecord[]; }
export class ConfigRunsInput extends Input { max_concurrent?: number; subagent_concurrency?: number; background_concurrency?: number; steering_cap?: number; steering_debounce_ms?: number; collect_quiet_ms?: number; }
```

## 3. 公开方法（5 参签名）

| 方法 | 签名要点 | 拆分（≤40 行） |
|------|---------|---------------|
| `submitRun` | 两段式 ack；session lane 忙 → 按队列模式入队 | `handleSubmitRun` + `resolveLaneForRun` + `enqueueByQueueMode` |
| `settleRun` | 结算落账（status/stop_reason/settled_at）+ release lane/忙锁 | `handleSettleRun` + `prepareSettlementRecord` |
| `steerRun` | 活动运行注入消息（steer 模式 500ms 防抖，cap 20，超限 `drop:'summarize'`） | `handleSteerRun` + `prepareSteeringBatch` + `applyOverflowPolicy` |
| `abortRun` | 类型化取消（queued 先取消，活动 run 后取消——防队列排水竞态） | `handleAbortRun` + `cancelQueuedRuns` + `signalActiveRun` |
| `soRunStatus` | 查单个 run 状态 | `handleSoRunStatus` + `soRunRow` |
| `soRunsBySession` | 查会话 run 历史 | `handleSoRunsBySession` + `soRunRows` |
| `takeFollowup` | 外层循环取 followup（内部经 Loop 调用） | `handleTakeFollowup` |
| `drainSteering` | 内层循环边界抽干 steering 队列 | `handleDrainSteering` |
| `configRuns` | lane 并发与队列参数配置 | `handleConfigRuns` |

## 4. 内部流程要点

### 4.1 两段式生命周期

```
submitRun ──ack──► accepted(queued)
   │ session lane 空闲 → ensureRunState 成功
   ▼ running ──事件流──► Loop 结束（agent_end）
   ▼ settleRun ──► finished | error | aborted（release lane + releaseRunState）
```

### 4.2 队列模式（入队语义）

| 模式 | session lane 忙时行为 | 取代旧语义 |
|------|----------------------|-----------|
| `steer`（默认） | 注入活动 run 边界（500ms 防抖；cap 20；溢出保留摘要注入为合成消息） | 无（新能力） |
| `followup` | 排队，当前 run 结束后下一 turn | 旧重入 `receiveWork` |
| `collect` | 合并静默窗口内消息为一条 followup | 无（新能力） |
| `interrupt` | abort 活动 run（`reason:'superseded'`）→ 运行最新消息 | 旧 `cancelWork` |

### 4.3 Lane 实现

- `Lanes.ts`：`Map<laneKey, promiseQueue>`；`session` 并发 1、`main` 全局上限、`subagent` 8、`background` 2。
- **嵌套规则**：子代理运行占用 `subagent` lane，curator 占用 `background` lane，前台回复永不与维护工作竞争。
- **排水竞态**：`abortRun` 先取消 queued 再取消活动，防止取消期间队列排水把半停会话推进新工作。

### 4.4 Abort 贯穿

- `signalActiveRun` 为 run 创建 `AbortController`，signal 经 Loop 传入 LLM 流与全部工具执行；
- aborted turn 写入规范化失败消息（assistant 消息，stop_reason=abort 原因，usage=0）+ 下轮注入 `<turn_aborted>` 引导消息（无 `turnHandoff` 原因时）。

## 5. 与旧模型的关系

| 旧 | 新 |
|----|----|
| `OrchestrationEntry.receiveWork`（313 行阻塞 await） | `submitRun`（ack 即返回）+ 事件流 |
| `cancelWork` | `abortRun('user')` |
| `confirmIntent` / `submitClarification` 重入 | `steerRun` / `ask_user` 答复（Steering 队列） |
| `PAUSED_WAITING_CONFIRMATION / PAUSED_WAITING_INPUT` | run 保持 running，`permission.asked` 事件 + Deferred 挂起 |
| `orchestration_work` 状态机 | `runtime_run.status`（仅 6 态）+ 事件投影 |

## 6. 验收

- 单测：两段式 ack 即时性；四种队列模式语义；abort 排水竞态（queued 先取消）；防抖与 cap 溢出策略。
- 集成：interrupt 后最新消息立即执行；steer 注入点严格在工具启动检查点/模型边界；lane 并发上限生效。

## 7. 落地差异（2026-09-05 · 最小可用版 → 本次修复）

**阶段3/4 前置的最小可用版**与 §2/§3/§4 的差距（后续阶段补齐，验收以本节为准）：

1. **未实现（阶段4）**：`collect` 队列模式（入队抛 ValidationError 提示）；steer 500ms 防抖 / cap 20 / 溢出摘要；`Lanes.ts` 多 lane（main/subagent/background，当前仅 `session` lane）；`abortRun` 先取消 queued 再取消活动的完整语义；`soRunsBySession`。
2. **忙锁归属**：§4.1 的 `ensureRunState/releaseRunState` 接线改为 **session lane 实例内 Map 独立承担**（Session 忙锁已删，去重优先）。
3. **修复①排队 run 双记录（2026-09-05）**：排队 run 结算后**复用原 run_id**（queued 行 patch 为 running，不新插入），`submitRun` ack 的 run_id 全程有效，`waitRun` 可正常等待排队 run。
4. **修复②排水竞态（2026-09-05）**：interrupt 模式**先入队后 abort**（§4.3 防护落地），且入队与结算双方经 `maybeDrainLane` 兜底复核（活动位空闲即排水），消除"结算窗口入队卡死"竞态。
5. **session_id 语义修复**：`runtime_run.session_id` 统一落 `runtime_session.id`（submitRun 内按 session_key 幂等解析；入参 `session_id` 仅为兼容保留）。
6. **run.accepted 事件**：submitRun 受理时发布（§4 的 11 类事件协议补齐）。
7. **业务事件双通道**：持久化经 Bus（重放/审计事实源）；客户端可感知的业务事件同步经 `Report.pushBusinessEvent`（BusinessEvent 枚举注册，无流会话静默降级）。

### [2026-09-11] 权限等待超时兜底 + 启动时遗留 run 收敛（复盘僵尸 run b5a8b667 / c19996e8）

**变更原因**：两个 run 卡死 `running` 数十分钟——用户在权限卡（`cdt_browser` 首次执行确权）挂 await 后关闭页面，`waitPermission` Deferred 永远无人 resolve，且无超时；服务重启后内存 waiters 丢失，run 行永久停留 running。

**修改的方法**：
  - `RunGatewayService.waitPermission` — 等待加 `PERMISSION_WAIT_TIMEOUT_MS`（默认 120s）超时兜底：超时删除 waiter 并以默认拒绝（approved=false）收敛，Loop 按配对拒绝语义正常结算（原实现已注释保留）。
  - `RunGatewayService.initialize()` → `convergeOrphanRuns()` —— 启动时把遗留 `running/queued` run 统一收敛为 `aborted`（stop_reason=service_restart；内存 lane 队列/waiters 重启后不可恢复）。
  - `Runtime/shared/types.ts` `AbortReason` 新增 `ServiceRestart = 'service_restart'`。

**影响的端点**：
  - `POST /api/chat/permission/answer/{permission_id}` — 120s 后回答幂等失效（waiter 已删），返回 answered=false。
  - 所有权限门 run — 挂起不再可能无限期（≤120s）；重启不再遗留永久 running run。

### [2026-09-14] 可观测计时框架化：Span 树（父子互斥 self 时间）+ 事件自动盖章 —— 旧计时方案整体删除

**变更原因**：执行时间线曾出现两类结构性缺陷：(1) 父子包含——编排方法（如 matchAgentDef 内含 buildAgent）整段耗时被子步骤吸收，「选中 Agent」包含「构建 Agent」；(2) 扁平键覆盖——同 key 多次调用（多轮 LLM）末次覆盖、键名随方法重命名静默失配、`||1` 假兜底。均为架构缺陷，不在单点上修补；按「编排/路由与步骤内部逻辑拆分」原则框架化解决。

**框架设计（Span 模型，对标 OpenTelemetry）**：
  - **一切耗时都是 span，span 构成树；时间线节点耗时 = span 的 self 时间（duration − 直接子 span 之和），父节点天然不包含子步骤**；
  - `Metrics` 内建 Span 树：`beginSpan(key)` / `endSpan(span)` / `lastClosedSpan()` / `spanSelfMs` / `sumSpanSelfMs` / `getTotalDuration`（根 span 包络）；
  - `AopProxy` 每个新式 5 参调用自动 begin/end 一个 span（键 = `<层名>.<模块名>.<类名>.<方法名>`），父关系由未闭合 span 栈顶自动解析 —— 服务调用拓扑自动成树，业务代码零改动；
  - `Report.bindMetrics`（AopProxy 发现 Metrics+Report 配对时自动绑定）+ `pushBusinessEvent` 统一自动盖章 `elapsed_ms`（最近闭合 span 的 self 时间）、`span_key`、`span_seq` —— **发射点即真实执行位置**，事件耗时由框架保证正确，业务零感知；
  - 私有不经切面的关键段落（快照 system 组装、上下文构建）经 `beginSpan/endSpan` 显式成 span；Loop 每轮 `loop.turn.completed` 事件自带该轮 LLM span 耗时（供「深度推理」多轮求和）。

**旧统计方案删除（不保留兼容）**：
  - `Metrics.timings` 扁平键与 `recordTiming / recordStart / recordEnd / getDuration / getProcessDurations` API 及 `Base/shared/base/TimingKeys.ts` 注册表 → 删除；
  - `runtime_run.metrics_json` 列与 `runtime_metrics` 重复表（建表/索引/settleRun 写入）→ 删除；
  - `dev-server` 的 metrics 字典解析、注册表回退查询、`||1` 假兜底 → 删除；时间线环节耗时唯一数据源 = 业务事件 payload 自带 elapsed_ms（历史/实时一致），总耗时 = run 行 started_at ~ settled_at 包络。

**影响的端点**：
  - `GET /api/chat/thinking` — 各节点耗时为 span self 时间（父子互斥，选择 Agent 与构建 Agent 不再互相包含），受理/开始执行等生命周期瞬时节点不再展示伪耗时；
  - `POST /api/chat/stream` — 实时时间线同口径。

**可能存在的问题**：
  - Span 树仅驻留内存（审计价值足够；如需落库审计后续纳入 Run 流程，不作为时间线数据源）；
  - 并发内嵌执行需以 AsyncLocalStorage 扩展 span 上下文传播（预留）。

### [2026-09-15] Span 框架收口修复 + 时间点事件不盖章 + 思考/耗时数据生命周期跟随会话删除

**变更原因**：本地问答执行时间线仍出现部分环节缺失耗时。复盘定位三个框架级静默漏盖路径（此前历次均为单事件点修复，根因未除，逐次复现）：
  1. `Metrics.endSpan(handle)` 忽略传入句柄、永远收口"栈顶"（LIFO 假设）：异步交错（begin 在方法入口同步执行、end 在 Promise then 中异步执行）时 begin/end 非栈序，会关错 span 且遗留永不闭合的 span；
  2. `lastClosedSpan()` 按数组序（创建序）倒扫，交错时创建序 ≠ 闭合序，事件可能盖到较早闭合的无关 span；
  3. `spanSelfMs` 子项之和 > 父 duration 时 self 被 clamp 成 0 —— 前端 `elapsedMs > 0` 才展示（不伪造耗时），表现为"该步骤没统计到"。

**修改的行为**：
  - `Metrics.endSpan(handle)`：按 handle.id 显式配对收口（begin/end 句柄配对校验），不再依赖栈顶；已闭合/未知 handle 为 no-op（防止关错其他 span）；缺省（无 handle）仍收口栈顶（兼容缺省语义）；原始实现注释保留；
  - `Metrics.lastClosedSpan()`：按 end 时间戳取最近闭合（max end），不依赖创建序；
  - `Metrics.spanSelfMs`：子项之和超过父 duration（交叠时间轴）时不再 clamp 0，回退取整段 duration；
  - `Report.pushBusinessEvent`：新增 `TIMELINE_POINT_EVENTS`（Base/shared/base/BusinessEvent.ts 注册表）——开始/结束是**时间点而非动作**，没有耗时语义，一律不盖章：`run.accepted/run.started/run.finished/run.failed`、`intent.started/evaluation.started/writer.started`、`reply.created/think.created/tool.started`、`permission.asked/answered`；环节耗时由对应完成事件携带；
  - `ChatService.deleteSession`：删除会话时同步清理思考过程与耗时统计的持久事实源（生命周期跟随问答）：`stream_event`（session_key）、`runtime_run`（session_key）、`runtime_message_part`/`runtime_message`/`runtime_session`（经 session_key 关联）；Runtime/stream 表不存在或清理失败时静默跳过（warn 日志），不阻塞会话删除主体流程。

**影响的端点**：
  - `GET /api/chat/thinking` — 开始/结束类节点不再携带伪耗时；其余节点耗时由按句柄配对收口后的 span self 时间保证归属正确，不再出现"没统计到"/错位；
  - `POST /api/chat/stream` — 实时时间线同口径；
  - `DELETE /api/chat/session/{session_id}` — 删除会话联动清理 `stream_event`/runtime 派生表（思考内容与 elapsed_ms 一并清除）。

**可能存在的问题**：
  - span 父子关系仍由"begin 时栈顶"近似解析，极端并发的父子归属可能不精确（根治需 AsyncLocalStorage 上下文传播，预留）；
  - 历史存量 stream_event 无 elapsed_ms 的节点不再回填（按约定不做兼容）；
  - 会话删除的 stream/runtime 清理与 info 主表删除非同一事务，中途失败以 warn 日志暴露（可后续引入孤儿清理任务）。

### [2026-09-14] run 级源头 trace 持久化（runtime_run.trace_id）

**变更原因**：traceId 源头治理（见 Chat-PRD 2026-09-14）：run 只在受理时刻与源头 trace 关联，此后任何延后路径（迟到补齐、断线恢复、审计）都需要"按 run 反查源头 trace"；此前该信息只存在于调用方 Metrics 内存对象，进程重启即丢失，导致历史消息被后续轮次 trace 污染（事故 989acae9）。

**修改的方法**：
  - `RunsSchemaInitializer.init` — `runtime_run` 新增 `trace_id` 列（建表 + 旧库 ALTER 迁移，列已存在时忽略）；
  - `RunGatewayService` — 新增 `soRunTraceId`（优先级 `input.interact_id` → `metrics.trace_id` → `''`，不伪造）；`startRun`（新建 run）与 `insertQueuedRun`（排队 run）受理即落库 `trace_id`；排队转 running 复用原记录不覆盖。

**影响的端点**：
  - `POST /api/chat/stream`（经 gateway.submitRun）— 每条 `runtime_run` 记录持久化请求源头 traceId；
  - 消费方：`ChatService.syncRuntimeMessagesToInfoRaw` 迟到补齐按原 run 反查归因。

**可能存在的问题**：
  - steer 注入的后续消息仍归因 run 受理 trace（无消息级 trace，阶段4 扩展）。

### [2026-09-14] 业务/可观测 ID 分离 + 维度最终定名：session_id / run_id / work_id 三级

**变更原因**：原实现把 work_id 当 run_id 用（llm_call_log.work_id=runId、评估/写作收到 work_id=runId），token 统计按单一 run_id 聚合，导致意图识别、Agent 选择、评估、写作、组件选择/向量化等 LLM 消耗（落库维度为空）全部漏统计；且 `SubmitRunInput.interact_id` 传 traceId，把业务维度与可观测维度混用。

**修改的方法**：
  - `RunGatewayService.matchAgent` / `prepareLoopInput` / 评估、写作阶段 — 执行框架在每次 Agent 执行前生成其私有 `work_id`；`run_id` 维度统一 = runtime_run.id（一次问答）；
  - `RunGatewayService.soRunTraceId` — 收敛为仅取 `metrics.trace_id`（trace_id 属可观测体系，不再借用业务维度承载）；
  - `SubmitRunInput` — 删除原 `interact_id` 字段（维度最终定名 run_id，业务入口不再传）；
  - `AgentLoopService.prepareLLMTurnInput` — Token 归因维度 `work_id = ctx.workId`（缺省回退 runId 兼容旧调用）、`run_id = runId`；
  - `AgentDefService.soLLMRankedDef` — Agent 选择 LLM 打分携带 session/run/work 维度；
  - 运行概览 token 统计（`GET /api/chat/thinking`）改按 `llm_call_log.run_id` 求和，覆盖该次问答全部 Agent/Tool 执行。

**影响的端点**：
  - `POST /api/chat/stream` — Done 事件 `run_id = runtime_run.id`（trace_id 保持独立，不再混用）；
  - `GET /api/chat/thinking` — 运行概览 Token 统计口径扩为 run 维度求和（含评估/写作/选择等系统 Agent）；
  - `log`/`trace` 类端点 — trace_id 归因不变（源头治理规则保持）。

### [2026-09-14] 评估 Agent 异步化 + 低风险跳过（run 首延时不因评估 LLM 拉长）

**变更原因**：问答 trace 7fc0147f 实测全程 41.1s：意图/Agent 匹配 LLM 5.2s → Loop 轮 10.3s → **评估 LLM 19.7s（同步 await，阻塞写作与结算）** → 写作 5.8s。评估是对"Agent 长期质量"的后台反馈，不构成用户拿到回复的关键路径；且单轮直答类低风险问答评估收益极低。

**修改的方法**：
  - `RunGatewayService.executeRun` — 评估 Agent 段重写为两级策略（原同步段注释保留）：
    1. **低风险跳过**（`eval_skip_low_risk`，默认开）：单轮直答（stop 且 iterations≤1）直接跳过评估；
    2. **异步后台执行**（`eval_async`，默认开）：需评估时 fire-and-forget（`runWorkEvaluation` 拆分自同步段，异常自吞），评估与写作 LLM 并行，不再阻塞 writer 阶段与 `settleRun`；
  - `RunGatewayService.configRuns` / `ConfigRunsInput / ConfigRunsOutput` — 新增 `eval_async / eval_skip_low_risk`（runtime_runs_config 持久化，出参回显当前值）；
  - `evaluation.started` 事件 payload 新增 `mode: 'async' | 'sync'`。

**影响的端点**：
  - `POST /api/chat/stream` — 正常 run 总耗时预计降 ~20s（写作即可与评估并行/评估跳过）；`run.finished` 提前于评估完成；
  - `configRuns` 接口 — 可回滚同步评估 / 关闭跳过（`eval_async=false, eval_skip_low_risk=false`）。

**可能存在的问题**：
  - 异步评估的 `evaluation.completed` 事件可能晚于 `run.finished` 到达（SSE 流已收尾时前端历史时间线以 stream_event 落库为准，`GET /api/chat/thinking` 可查）；评估结论落账（agent_evaluation / llm_call_log / MQ 优化触发）不受影响。

**可能存在的问题**：
  - ~~业务表 work_id 仍承载"问答锚点"语义~~ → 已收敛：**三级维度全量定名**——业务维度最终为 `session_id → run_id → work_id`，interact_id 已在前后端代码与数据库列（llm_call_log/info_raw/log_record/feedback_record/feedback_process_log/agent_usage/agent_plan/agent_evaluation）全部以 RENAME COLUMN 迁移为 run_id，前后端契约同步；
  - 系统级后台流调用 LLM 本无 session/run（业务维度空属正确语义），已全部落 `caller` 来源归因；
  - 
### [2026-09-19] 上下文前置构建 + 思维模型选定（CoT/ReAct）+ 思维模型逐轮透出

**变更原因**：复盘 trace ccc6e0ee：① 多层静态记忆召回发生在 Agent 选择/构建之后，意图分析与 Agent 构建阶段拿不到基本上下文，违反「上下文先行、后续步骤全依赖基本上下文」的执行语义；② 新建 Agent 的组件（LLM/Soul/Skill/MCP/Prompt）选择/生成过程未体现（仅最终 agent.components 汇总一处）；③ Agent 执行的 CoT/ReAct 选择及理由、逐轮上下文/结果/终止决策不可见。

**修改的方法**：
  - `RunGatewayService.executeRun` — 第一段新增 `buildStaticMemory`（会话时间线 + 跨会话多层静态记忆召回，上报 `round=0、base=true` 的 `context.built`）；快照组装后 `composeSystemWithMemory` 复用该份记忆与 soul system 拼接（原 `buildStaticMemorySystem` 整体注释保留，不再二次召回）；
  - `RunGatewayService.decideThoughtMode`（新增）— 绑定 Skill/MCP → `ReAct`（外部「行动→观察→再决策」闭环）；无绑定 → `CoT`（无观察点，ReAct Act 退化）。经 `thought.selected` 事件上报 mode + reason，并随 `ExecAgentLoopInput.thought_mode` 传入 Loop；
  - `LoginContainer` 无改动；组件逐件体现由 Agent 层 `AgentBuilderService.buildAgent` 上报。

**影响的端点**：
  - `POST /api/chat/stream` — 新增事件 `context.built(round=0, base=true)`、`thought.selected`；静态记忆召回提前（时间线上移）；Loop 每轮不再重复调 InfoCore.context。

**可能存在的问题**：
  - 上下文前置后，意图分析/构建期间记忆已冻结，用户 steer 追加内容本轮仍走消息序列动态演进（静态记忆不重建）；
  - thought.selected 当前为确定性规则判定（无工具 → CoT），策略表（agent_strategy）仅落账不作裁决。

### [2026-09-22] ask_user 挂起/应答原语落地 + curator background lane 调度（阶段3 编排三件套收尾）

**变更原因**：Runtime-PRD §9 阶段3 收尾项——`ask_user` 工具与 curator 未落地（update_plan/delegate 已于此前完成）。ask_user 补齐"澄清/确认 = Deferred 挂起原语"，curator 补齐"会话后维护工作在 background lane 执行、不与前台风争"的 lane 嵌套规则。

**修改的方法**：
  - `RunGatewayService` — 新增 `userAskWaiters` 注册表与 `waitUserAnswer`（ask_user 工具调用；Deferred 挂起，超时复用 `permission_wait_timeout_ms` 配置，超时归一为未应答）、`answerUserAsk`（HTTP 端点调用；答复经 `persistUserAnswer` 落库为 role=user 消息归因原 run 后唤醒挂起，**答复=下一条 user 消息**，Runs-PRD §4 映射表语义）；新增 `backgroundLane`（`LaneSemaphore`，并发上限 `LANE_CONCURRENCY[background]=2`）与 `scheduleCurator`（background lane 异步执行评估）。
  - `RunGatewayService.executeRunEvaluation` — 原实现：async 路径直接 `runWorkEvaluation` fire-and-forget（原始代码已注释保留于方法内说明）；修改后：eval_async=true 时经 `scheduleCurator` 走 background lane 信号量调度（评估即 curator 会话后审查，复用 Evolutor 评估链——Runtime-PRD §10「保留并复用」条款）。
  - `RunGatewayService.prepareLoopInput` — 工具可见清单加入 `ask_user`。
  - `Runs/domain/types` — 新增 `WaitUserAnswerInput/Output`、`AnswerUserAskInput/Output`；`Runs/infrastructure/LaneSemaphore` — 新增 lane 并发信号量（promise 队列，零依赖）。
  - `RunGatewayAccess` / `Runtime/index.ts` — 透传新方法与类型。
  - `dev-server.ts` — 组合根接线 `askUserGate`（Tool→Gateway 迟绑定，同 delegate 模式）；新增端点 `POST /api/chat/ask/answer`（`{ask_id, answer}` → answerUserAsk）。

**影响的端点**：
  - `POST /api/chat/ask/answer` — 新增：ask_user 挂起恢复入口，答复成为会话下一条 user 消息。
  - 所有含评估的 run 结算（`POST /api/chat/stream`）— 评估改在 background lane 排队执行（并发 2），run 结算不再与评估 LLM 竞争执行资源。

**可能存在的问题**：
  - ask_user 挂起期间 run 停留在 running（与权限门同构），会话忙锁阻止同会话新 run——多端同会话第二端消息将按 steer 入队，答复后一并消化；
  - 服务重启丢失 userAskWaiters 内存态，挂起中的 ask_user 随遗留 run 收敛路径（convergeOrphanRuns）结算为 aborted，前端卡片呈未应答终态；
  - 前端 ask_user 提问卡（问题+文本输入）属阶段4 前端 v2 协议改造范围，当前 permission.asked 事件仅可确认/拒绝。

### [2026-09-23] 委派收口改造：子会话隔离 + 子 run join + 写作 Agent 唯一收口（事故 trace 22f3ce79 复盘）

**变更原因**：复盘 trace 22f3ce79（"检查系统磁盘还有多少可用"）：① `persistUserMessage` 对所有 lane 无差别写 role=user —— subagent run 把委派任务当用户发言写进共享会话，一次问答在对话区"派生"出四次问答；且这些假 user 消息污染后续所有 LLM 上下文与 info_raw（syncRuntimeMessagesToInfoRaw 把它们同步为 REQUEST）；② delegate 为 fire-and-forget：无 run_id、无 parent_run_id、结果不回传，父 run 收不到子结果被迫重复委派，子代理继续向下递归委派（四级链）；③ `executeRun` 对所有 lane 共享评估+写作路径 —— 每个子 run 各自成"小问答"各自产出最终回复，主 run 不等子 run 结算，写作 Agent 只收到主 Agent 自己一条结果（WriterAgent-PRD §1 要求"汇总所有 Work Agent 结果"，Tools-PRD §6.3 设计的"push 式回传"从未实现）。

**修改的方法**：
  - `RunGatewayService.executeRun`（原实现注释保留）— 拆出 `finishRunByLane`：仅 session lane（前台问答）在 Loop 收敛后执行 `joinChildRuns`（限时 180s 轮询全部子 run 结算）→ `collectChildResults`（任务=子会话首条 user 消息；结果=子会话最后一条 assistant 消息）→ `updateDelegatePartOutputs`（delegate 工具结果从"已受理"回写为子任务实际结果摘要，受理回执中 run_id 配对）→ 评估 → 写作；收口后 run 才 settleRun。
  - `RunGatewayService.executeRunWriting`（原实现注释保留）— `agent_results = 主 Agent 结果 + 全部子 run 结果`（子结果超时未完成的如实标注状态）。
  - `RunGatewayService.soRunSessionId`（新增）/ `soSubSessionKey`（新增）— subagent lane 的消息落隔离子会话 `${sessionKey}::sub:${runId}`：不变量 = 主会话时间线 role=user 只来自真实用户输入；委派任务在子会话内即首条 user 消息，语义自洽；lane/队列/记忆召回仍用父 session_key（并发与排队语义不变）。
  - `RunGatewayService.prepareLoopInput` — subagent run 不注入 `delegate`（委派链一级封顶，杜绝子代理递归委派）。
  - `RunGatewayService.submitRun`（原实现注释保留）/ `registerDelegation`（新增）— `parent_run_id` 存在即登记父子关系（内存 Map：父 run → 子 run 列表；steer 复用活动 run id 情形不登记）。
  - `Runs/domain/types` — `SubmitRunInput` 新增 `parent_run_id / agent_ref`。
  - `AgentDefService.matchAgentDef` — 新增 agent_ref 直选层（`soDefByAgentRef`，位于 exact 之前）：委派指定既有 Agent 时不经语义匹配直接命中，杜绝委派任务被误路由；`MatchAgentDefInput` 新增 `agent_ref`；`RunGatewayService.matchAgent` 透传。
  - `Tools/application/delegateTool.ts` — 重写（原版见 git 历史）：`DelegateDeps.submitRun` 改为返回 `{run_id}` 并透传 `parent_run_id / agent_ref`；受理回执携带 run_id 并明确"结果将统一汇总，请勿重复委派"；`Tools/application/builtinTools.ts` 的 `BuiltinToolDeps.runGateway` 签名同步。
  - `dev-server.ts` — delegate 桥接补全（原实现丢弃 agent_ref、返回 void），返回 run_id。
  - `Application/Chat/application/ChatService.syncRuntimeMessagesToInfoRaw` — 按 `runtime_run.lane` 过滤：subagent run 的消息不再同步进对话历史（抽象的是历史脏数据兜底，新数据经子会话隔离已不落主会话）。
  - `brian-backend/scripts/cleanup-subagent-messages.mjs`（新增）— 一次性清理脚本（runtime_message / runtime_message_part / info_raw 中 subagent run 脏数据；默认 dry-run，`--commit` 执行）。本次已清理事故 trace 22f3ce79 的 4 个 subagent run / 10 条消息 / 14 个 Part / 2 行 info_raw。

**影响的端点**：
  - `POST /api/chat/stream` — 含委派的问答：最终回复唯一产出点 = 写作 Agent（汇总主 Agent 与全部子 run 结果）；主 run 结算时间延长至 join 完成（子 run 串行 + 各自预算，超时 180s 上限；外层 `waitRun` 300s 兜底不变）；
  - 委派链语义：delegate 指定 `agent_ref` 时精准路由；子代理无 delegate 工具，链长恒为 1；
  - 对话历史（info_raw 同步）— subagent 过程消息不再出现在对话区。

**可能存在的问题**：
  - 父子关系登记为内存 Map，服务重启丢失（重启后 join 返回空集——主 run 也不在内存，语义自洽；waitRun 超时兜底）；
  - 子 run 结果摘要回写 delegate Part 截断 500 字，完整内容在子会话（`${sessionKey}::sub:${runId}`）可审计；
  - subagent lane 当前实际串行（activeRunId 兼作单活动锁，与 LANE_CONCURRENCY=8 的设计存在偏差）——历史行为，join 语义下串行反而简单可控，并行化另立任务。
