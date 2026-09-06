# StreamProvider

## 1. 设计目标

1. 解耦 SSE (Server-Sent Events) 端点管理与上层业务逻辑，为整个 Brian-Agent 体系提供统一的高性能流式通信基座；
2. 管理基于 `session_id` 的客户端流式连接生命周期与自动心跳保活（默认 `15000ms`）；
3. 支持多 Agent 并发流缓冲与通道隔离（`agent_id` / `node_id`），杜绝并发场景下的文本交叉污染；
4. 提供打字机分片机制（默认随机 2-5 字符 chunk 切片），为前端呈现优雅流畅的实时打字机视觉效果；
5. 统一数据封装协议（`BrianSSEMessage` 结构化对象），杜绝裸文本推送，保障传输格式严谨可追溯；
6. 贯通全链路生命周期事件（上下文构建概况、Agent 自主构建决策、DAG 节点执行输入输出、CoT/ReACT 思考过程、回答汇总等）。

## 2. 结构化 SSE 消息对象协议（BrianSSEMessage）

```typescript
export type SSEMessageType = 'TEXT' | 'DAG' | 'CONTEXT' | 'AGENT_SPEC' | 'TRACE' | 'CONTROL';

export interface BrianSSEMessage<T = unknown> {
  msg_id: string;              // 每条 SSE 消息唯一 ID (UUID)
  seq: number;                 // 单会话内严格单调自增编号 (0, 1, 2, ...)
  session_id: string;          // 会话 ID
  interact_id: string;         // 单轮交互 ID
  work_id: string;             // 编排任务工作 ID
  agent_id?: string;           // 产出该消息的 Agent ID (用于多 Agent 并发隔离)
  node_id?: string;            // 所属 DAG 节点 ID
  task_id?: string;            // 所属任务 ID (同一 Agent 复用到多个任务时精确关联执行归属)
  event: string;               // SSE 事件名 (如 agent_thinking, text_chunk, dag_node_start 等)
  msg_type: SSEMessageType;    // 内容大类 (TEXT | DAG | CONTEXT | AGENT_SPEC | TRACE | CONTROL)
  full_length?: number;        // 预期完整长度 (已知时传递)
  chunk_length: number;        // 本次推送的数据长度
  accumulated_length: number;  // 当前通道累计已推送长度
  timestamp: number;           // 服务端统一定时毫秒时间戳
  data: T;                     // 强类型的结构化数据负载
}
```

## 3. 功能设计

### 3.1. 注册与管理 SSE 端点（registerStream）

**方法签名**：`Boolean registerStream(RegisterStreamInput input, StreamContext context, RegisterStreamOutput output)`

* 为指定会话建立流式通道，绑定底层写入器 `writer`；
* 若该会话存在未关闭的旧连接，平滑关闭旧连接；
* 启动会话级心跳定时器（每隔 `sse_heartbeat_interval_ms` 自动写入 `: ping\n\n` 保活）。

### 3.2. 推送流式数据（pushStream）

**方法签名**：`Boolean pushStream(PushStreamInput input, StreamContext context, PushStreamOutput output)`

* 支持推送结构化事件对象（DAG、上下文概况、Agent 规格等）及文本片段；
* 当 `enable_chunking = true` 时，自动按随机 2-5 字符进行打字机分片输出；
* 单会话严格保证 `seq` 单调自增，按 Agent 通道独立统计累积推送长度 `accumulated_length`。

### 3.3. 关闭 SSE 端点（closeStream）

**方法签名**：`Boolean closeStream(CloseStreamInput input, StreamContext context, CloseStreamOutput output)`

* 优雅注销会话通道，清理心跳定时器并触发 `onClose` 回调。

### 3.4. 便捷方法扩展（StreamAccess）

* `pushText(sessionId, event, text, meta)`：快捷推送打字机文本片段；
* `pushEvent(sessionId, event, msgType, data, meta)`：快捷推送结构化事件帧。

## 落地差异（2026-09-05 · 事件流承载：保存/断线恢复/审计 + 端点 ID 寻址）

1. **事件事实源**：新增 `stream_event 表（session_key/run_id/seq/event_type/payload_json/ts，每 session_key 严格递增 seq）——数据的保存、审计、断线恢复重放由 StreamProvider 承载（取代 Runtime/Bus 的 runtime_event，Bus 模块删除）。
2. **端点 ID 寻址**：`registerStream 生成 SSE 端点 ID（output.endpoint_id，缺省服务端生成，重连可显式传入接管）；`endpoints 注册表（端点 ID → session）支持按 ID 定位具体 SSE 连接。前端创建 SSE 端点时获得端点 ID，请求时携带，后端放入 Report 对象。
3. **新方法**：`publishEvent（按端点 ID 推送：持久化 + v1 兼容格式化投递；未映射类型仅持久化）、`replayEvents（after_seq 后按 seq 升序重放到端点）；发布按 session 串行化（fire-and-forget 下 seq 与投递顺序一致）。
4. **Report 分工**：Report 只负责接收业务的消息并携带端点 ID（`stream_endpoint_id，经 ReportMeta/AopProxy 从 Input 回填）；上报经静态网关 `Report.setEventStreamGateway（组合根注入 StreamAccess 适配）调用 StreamProvider。
