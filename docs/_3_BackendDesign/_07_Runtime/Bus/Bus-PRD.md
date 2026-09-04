# Bus · 事件总线与 SSE v2 事件协议（前端协议重构）

> 父文档：`docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md` §4/§6/§9。
> 用户决策（2026-09-04）：前端事件协议按建议重构为 **v2 原生 Part 流**，**不做旧事件名兼容层**；取代 `_06_BlockStream` 的 SSE 协议与内联 pushEvent 副作用。

## 1. 设计目标

1. **副作用唯一出口**：弃用内联 `pushEvent/pushText`（旧代码各 handler 副作用内联）；全部上报、状态投影、可视化经 EventBus 发布——业务代码只发布事件，不感知传输（OpenCode EventV2 模式）。
2. **持久化可重放**：事件写入 `runtime_event`（每 session `seq` 严格递增）；订阅端可选 `durable` 语义——先重放历史再尾随直播（replay 后尾随，重放与首播一致）。
3. **UI = 纯投影**：前端 store 仅消费事件流归约（OpenCode sync 模式）；可视化（timeline/dag）由事件重放重建，取代旧 `OrchestrationVisualization` 从业务表重建。
4. **Report 通道收敛**：`Report.pushText/pushEvent` 底层通道改为 EventBus 投影（`ReportChannel` 适配），5 参签名的上报能力不变。

## 2. 领域类型（5 参基类）

```typescript
export interface RuntimeEvent { id: string; session_key: string; run_id?: string; seq: number; type: EventType; payload: unknown; ts: number; }
export type EventType =
  | 'run.accepted' | 'run.status'
  | 'part.created' | 'part.delta' | 'part.updated'
  | 'tool.launch' | 'tool.result'
  | 'permission.asked'
  | 'plan.updated'
  | 'message.block'
  | 'error';

export class PublishEventInput extends Input { session_key!: string; run_id?: string; type!: EventType; payload!: unknown; }
export class PublishEventOutput extends Output { seq!: number; }
export class SoEventReplayInput extends Input { session_key!: string; after_seq?: number; types?: EventType[]; }
export class SoEventReplayOutput extends Output { events!: RuntimeEvent[]; last_seq!: number; }
export class RegisterProjectionInput extends Input { session_key!: string; projection!: 'sse'; }
export class RegisterProjectionOutput extends Output { last_seq!: number; }   // 投影起点
export class ConfigBusInput extends Input { heartbeat_ms?: number; retention_days?: number; }
```

## 3. 公开方法（5 参签名）

| 方法 | 签名要点 | 拆分（≤40 行） |
|------|---------|---------------|
| `publishEvent` | 发布持久化事件（seq 单调；进内进程订阅扇出 + DB 落库） | `handlePublishEvent` + `prepareEventRecord` |
| `soEventReplay` | 重放查询（after_seq 之后按 seq 升序；**游标语义 GT（严格大于）**） | `handleSoEventReplay` + `soEventRows` |
| `registerProjection` | 注册投影（durable：重放→直播无缝尾随；**出参含 `last_seq` + `subscription_id`**） | `handleRegisterProjection` + `soProjectionReplay` + `tailProjection` |
| `unregisterProjection` | 释放投影订阅（幂等；阶段1 落地补充） | `handleUnregisterProjection` |
| `configBus` | 心跳/保留期/enable 配置 | `handleConfigBus` |

> 阶段1 落地说明（2026-09-04）：投影回调以 `deliver?: EventSubscriber` 注入（SSE writer 适配层在阶段4 网关接线）；seq 缓存与订阅注册表为**实例字段**（同进程多实例互不干扰，跨实例以 DB MAX 为持久事实源）；投递失败不中断发布方（写库保底，重连重放）。

## 4. 事件语义

| 事件 | payload 要点 | 发射方 | 取代旧事件 |
|------|-------------|--------|-----------|
| `run.accepted` | `{run_id, accepted_at, queued}` | Runs.submitRun | `loading` |
| `run.status` | `{run_id, phase:'start'\|'finishing'\|'end'\|'error', stop_reason?}` | Loop/Runs | `done`/`error` |
| `part.created` | `{run_id, message_id, part_id, part_type, tool_id?}` | Loop | `agent_created`/`agent_status` |
| `part.delta` | `{run_id, part_id, field:'text'\|'reasoning', delta}` | Loop 流处理 | `agent_thinking`/`text`（打字机） |
| `part.updated` | `{run_id, part_id, status, token_count?}` | Loop | `agent_reflection` |
| `tool.launch` | `{run_id, part_id, tool_id, input}` | ToolExecutor | `agent_action` |
| `tool.result` | `{run_id, part_id, tool_id, status:'ok'\|'error'\|'denied'\|'aborted', output, elapsed_ms, reason?}` | ToolExecutor | `agent_output`/`agent_error` |
| `permission.asked` | `{run_id, ask_id, question, kind:'clarify'\|'confirm'\|'approve', patterns?}` | ask_user/权限门 | `intent_confirmation_required`/`clarification_required` |
| `plan.updated` | `{run_id, steps:[{id, description, status}]}` | update_plan | `plan_created`/`agent_dag_created` |
| `message.block` | `{run_id, message_id, block:{id, type, content, meta, streaming_status}}` | 块 chunker | `text`（Block 事件） |
| `error` | `{run_id?, reason, message}` | 各层 fail-loud | `error` |

## 5. 内部流程要点

1. **durable 投影**：`handleRegisterProjection` 先 `soProjectionReplay`（after_seq=投影起点）逐条直发 → `tailProjection` 尾随进程订阅（无缝拼接，`last_seq` 校验防漏发）；SSE 写入经 `StreamProvider` 适配（`ReportChannel` 同构）。
2. **多投影扇出**：进程内 `Map<session_key, Set<subscriber>>`；`publishEvent` 扇出失败（订阅端掉线）不中断业务（写库保底，重连重放）。
3. **心跳**：SSE `: ping`（默认 15s）由投影层统一管理，不进业务代码。
4. **保留期（2026-09-04 落地）**：`runtime_event` 按天清理 —— `EventBusService.initialize` 启动清理 + `configBus({retention_days})` 变更即时清理；`retention_days=0` 表示永不清除；默认 30。可视化重放超窗提示改查归档。

## 6. 前端事件协议重构（v2，无兼容层）

1. **传输**：`GET /api/chat/stream?session_key=...` = 纯订阅投影（不再承载业务触发）；业务入口 = `POST /api/chat/run`（`submitRun`，立即 ack）+ `POST /api/chat/steer` / `POST /api/chat/abort` / `POST /api/chat/ask-reply`（permission 答复）。
2. **store 归约**（OpenCode sync 模式）：

| 事件 → store 动作 |
|-------------------|
| `run.accepted` → 新建 run 槽位 |
| `part.created` → 消息树插入 Part 节点 |
| `part.delta` → Part 字段追加 delta（reasoning 流入思考面板，text 流入回复面板） |
| `tool.launch/tool.result` → 工具节点状态机（launch→result） |
| `permission.asked` → 挂起弹层（答复经 `ask-reply` 恢复） |
| `plan.updated` → 计划卡替换（至多一个 in_progress） |
| `message.block` → 块渲染（heading/code_block/…，streaming_status 驱动光标） |
| `run.status(phase:'end')` → run 结算 |

3. **断线恢复**：重连以 `last_seq` 起点调 `registerProjection` 重放（`replay` 后尾随）；store 幂等（seq 去重，二分插入）。
4. **Block 模型沿用**：`BlockStream-PRD` 的 `Block` 类型（`text_paragraph/heading/code_block/list_item/artifact_preview/error_fallback`）保留为 `message.block` payload；**生产者改为主循环 assistant 流 + 块 chunker**（markdown 原生输出，永不切断代码围栏；OpenClaw chunker：min/max 字符界 + `paragraph→newline→sentence→whitespace→hard` 断裂链），弃用"LLM 输出 JSON Block 数组"。

## 7. 与旧模型的关系

| 旧 | 新 |
|----|----|
| 内联 `pushEvent`（各 handler/服务副作用散落） | `publishEvent` 唯一出口 |
| `StreamService` 打字机 2–5 字符分片 | delta 直传 + 前端渲染节奏 |
| `BlockStream-PRD` SSE 事件（loading/text/agent_thinking/…） | §4 v2 事件（无兼容层） |
| `OrchestrationVisualization`（702 行，从业务表重建 DAG/timeline） | `soEventReplay` 投影（事件重放） |
| `GET /api/chat/thinking`（读 trace 迭代 JSON） | reasoning Part 直查 |

## 8. 验收

- 单测：seq 单调与幂等重放；durable 投影重放→直播无缝（mock 抖动）；多投影扇出掉线保底。
- 集成：前端 v2 store 归约全部事件；断线重连不丢不重；permission 答复恢复后 delta 续流；块 chunker 代码围栏完整性（长 code_block 压测）。
