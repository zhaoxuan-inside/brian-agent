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
