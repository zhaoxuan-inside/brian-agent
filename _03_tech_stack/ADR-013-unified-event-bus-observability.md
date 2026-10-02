# ADR-013: 统一事件总线与可观测投影（OBS v2）

状态: accepted
日期: 2026-09-30
关联: ADR-005(Run v2)、ADR-007(五参签名)、ADR-012(记录/组织二分)

## 背景

改造前三条观测链路互相耦合且数据结构各异:

1. BusinessEvent(SSE): `Report.pushBusinessEvent` → `StreamService.publishEvent` 同步"落库 stream_event_record + 发帧"一把梭;37 种事件 payload 均为 `unknown`,无 schema。
2. ExecuteEvent(AOP): `ExecuteEventInterceptor` → `ExecuteEventProcessor` 队列落 execute_record(ADR-012,保留)。
3. Metrics spans: 内存环形缓冲,run 结束即丢,仅 push 时打戳。

同一事件流被三套解析器各写一遍: `server/thinkingBlocks.ts`(2037 行离线重放)、`server/executionAnalyzer.ts`(1433 行,输入约 20 个异构手拼字段)、前端 `chatStreamEvents.ts`(1006 行实时累积)。事件时序按 ts 排序存在歧义。思考过程依赖 run 结束后离线重放才可见,实时弹窗为空态。

## 决策

1. **单一契约** `shared/src/contracts/task-event.ts`: TaskEvent envelope(v/seq/ts/session_id/run_id/work_id/agent_id/round/span/ref/kind/type/payload)+ 32 事件 payload zod(`task-event-payloads.ts`)。`session_key` 一词消亡,统一 `session_id`。死事件删除: `plan.updated`、`message.block`、裸 `text_chunk`/`agent_thinking`/`agent_action`/`agent_reflection` 通道。
2. **总线三解耦** `Base/ObservabilityProvider`:
   - `EventDispatcher`: run 内单调 seq 单点分配 + envelope 组装(payload 经 parsePayload 归一)+ 同步 fan-out。
   - `SseTransportSink` = StreamService(瘦身: 只剩 注册/心跳/writeFrame/close,删落库与分片打字机);帧 data=完整 TaskEvent。
   - `EventLogSink`: 队列 + 50ms/200 条批量 insert `task_event_record`(UNIQUE(run_id,seq))。
   - `RunStateSink`: 平铺列直更 `run_state_record`(phase/round/tokens/计数,O(1) 状态查询)。
   - 强制 flush 点: `settleRun` 收尾前、`prepareModelMessages` 读 wire 前(`Report.flushObservability`)。
3. **唯一投影** `shared/src/contracts/task-reduce*.ts`: `reduceObservation(obs, ev)` 纯函数(seq 幂等,支撑历史拉取+实时叠加合流),实时与回放同一 reducer。服务端不投影、不生成任何"分析"。
4. **读路径** `GET /api/chat/observation?run_id|info_id&after_seq`: 从 task_event_record 按 seq 重放。执行中=拉历史+SSE 叠加;结束后=纯重放,结果与实时视图一致。
5. **行为修正**: `reasoning_delta→think.delta`、`text_delta→reply.delta` 分流(修 text 误入思考流);删除 run 末尾一次性整段 ReplyDelta;`reply.delta.replace` 标记实现 Writer 排版稿替换 Loop 原稿;`reply.created` 只登记归属不重置正文。
6. **数据增补**(思考过程信息全覆盖): `agent.selected.mechanisms[]`(匹配选举明细)、`context.built.sources[]`(记忆来源分布)、`profile.snapshot`、`run.merge`(委派收口,保留该功能并发事件化)。

## 删除清单

`server/thinkingBlocks.ts`、`server/executionAnalyzer.ts`(整文件)、`/api/chat/thinking`与`/thinking/step-content`路由、`StreamService.publishEvent/pushStream/pushText/分片打字机`、`Report.pushBusinessEvent/pushText/channel/TIMELINE_POINT_EVENTS/businessEventMsgType`、前端 `ThinkingIntegratedPipelineView/ThinkingAnalysisView/ThinkingTrustTraceView/ThinkingContext/ThinkingStreamEntryDetail/ThinkingBlock` 与 chatUi 旧累积状态(liveTimeline/liveContextRounds/agentExecutions)、`task_event_record` 替代 `stream_event_record`(直接 drop,历史不迁移)。

## 后果

- 正面: 可观测代码 ~3500 行收敛至 ~800 行;思考过程执行中实时可见且与回放同源;新增观测点只需 emit+登记 payload schema;seq 严格有序可审计。
- 代价: 旧版本历史消息无过程数据(空态标注);前端弹窗视图(ObservationView)为重写实现。
- 风险控制: payload schema `.passthrough()` 宽松起步;EventLogSink 批量写不阻塞 SSE;run 收尾强制 flush 保证读侧可见。
