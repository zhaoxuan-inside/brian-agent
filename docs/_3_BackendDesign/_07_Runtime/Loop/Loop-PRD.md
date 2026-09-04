# Loop · 两级循环 / LLM 适配 / 工具执行 / 预算

> 父文档：`docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md` §4/§6/§9。

## 1. 设计目标

1. **单一循环**：弃用 ExecutionRule steps/phases 状态机（第二个 workflow 引擎）；循环只有一种，终止条件 = finish reason 无 tool_calls（三家共同范式）。
2. **两级结构**：外层 while（followup 队列）+ 内层 while（tool_calls + steering 检查点），边界抽干排队消息（OpenClaw steering 模式）。
3. **原生 tool_calls**：弃用 Think→Act→Reflect 模拟工具调用（3 次 LLM/迭代）与 history 字符串 regex 反解析；1 次 LLM/迭代，多工具并行执行，结果配对回流。
4. **AbortSignal 真取消**：signal 贯穿 LLM 流、工具执行、预算检查；弃用 `Promise.race` 假取消。
5. **5 参签名 + ≤40 行**：公开边界 `execAgentLoop` 5 参；内部私有方法同样 ≤40 行、逻辑/数据拆分。

## 2. 领域类型

```typescript
// LLMEvent：LLMProvider 新增的归一化流事件（见 §4）
export type LLMEvent =
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call_delta'; index: number; id?: string; name?: string; args_delta?: string }
  | { type: 'finish'; finish_reason: 'tool-calls' | 'stop' | 'aborted' | 'error'; tool_calls?: ParsedToolCall[]; usage?: TokenUsage };

export class ExecAgentLoopInput extends Input { run_id!: string; session_id!: string; agent_ref!: string; }
export class ExecAgentLoopOutput extends Output { stop_reason!: string; token_usage!: TokenUsage; }
export class AbortLoopTurnInput extends Input { run_id!: string; reason!: AbortReason; }
```

## 3. 公开方法（5 参签名）

| 方法 | 签名要点 | 拆分（≤40 行） |
|------|---------|---------------|
| `execAgentLoop` | 循环入口（Access 唯一公开边界；经 Runs 网关触发） | `runOuterLoop` + `runInnerLoop` + `runInnerTurn`（逻辑）+ `prepareLoopContext`/`prepareContextFields`/`validateLoopInput`（数据） |
| `abortLoopTurn` | 类型化 turn 取消（run 级 AbortController 注册表；幂等） | `handleAbortLoopTurn` |
| `configLoop` | 循环参数配置（enabled · default_budget_total） | `handleConfigLoop` |

内部私有（已落地，均 ≤40 行，逻辑/数据拆分）：

| 方法 | 职责 | 拆出 |
|------|------|------|
| `runOuterLoop` | 外层 while：followup（阶段3 接 Runs；当前单轮外层） | `runInnerLoop` |
| `runInnerLoop` | 内层 while：终止 = verdict ≠ continue | `runInnerTurn` |
| `consumeBudget` | 预算消费 + 宽限收尾判定（finalTurn 收掉工具） | IterationBudget |
| `runInnerTurn` | 单轮：预算 → LLM → 持久化 → 工具消费 | `consumeBudget` + `callLLMTurn` |
| `callLLMTurn` | execLLMEvents（AbortedError → aborted 收敛） | `prepareLLMTurnInput` + `fillTurnResult` |
| `streamHandler` | 流事件 → part.delta 事件投影（Part 于轮完成时持久化） | `publishPartDelta` |
| `prepareModelMessages` | **消息中心派生**：会话持久化消息 → wire 消息 | `assistantToWire` + `toWireToolCall` + `toToolResultMessage` |
| `persistAssistantTurn` | assistant 消息 + reasoning/text/tool Parts + 事件 | `persistTurnParts` + `addTurnPart` + `addToolPart` |
| `consumeToolCalls` | 顺序执行 tool_calls（配对回流） | `soToolPart` + `markPartRunning` + `execLoopTool` + `completeToolPart` |
| `settleLoop` | 注销 run controller + run.status 结算 | `publishRunStatus` |

> 落地差异（2026-09-04）：`prepareModelMessages` 每轮从 `runtime_message_part` 重读派生 wire 消息（**无跨轮内存消息状态**）；tool Part 的 `input_json` 约定为 `{tool_call_id, arguments}` JSON。

## 4. LLMProvider 改造（`Base/LLMProvider`，阶段0 已落地）

现状改造（2026-09-04，见 CHANGELOG 同日记录）：

1. **LLMEvent 类型**：定义于 `Base/shared/llm/LLMEvent.ts`（Base 生产流事件，类型归属 Base；Runtime 经 `@brian-agent/base` re-export）。四类 delta：`reasoning_delta`（`delta.reasoning_content`）/ `text_delta`（`delta.content`）/ `tool_call_delta`（按 index 聚合）/ `finish`（含聚合完成的 `ParsedToolCall[]` + `TokenUsage`）。
   **命名统一（2026-09-04 修复⑤）**：内部工具标识统一 `tool_id`（`LLMToolSpec.tool_id` / `ParsedToolCall.tool_id` / `tool_call_delta.tool_id`）；wire 格式 `function.name` 仅在两处边界映射——`BaseLLMStrategy.prepareToolSpec`（出向）与 `LLMEventsParser`（入向）。
2. **`execLLMEvents`（5 参签名）**：`ExecLLMEventsInput`（`messages` 优先，兼容 `prompt/system`；`tools: LLMToolSpec[]`（JSON Schema，经 zod 在 Tools 层转换）；`tool_choice`；`signal`；`idle_watchdog_ms`（默认 30000）；`on_event` 回调）/ `ExecLLMEventsOutput`（`result`/`reasoning`/`tool_calls`/`finish_reason`/`usage`/`wire_messages`）。
   - **事件暴露形态**：`on_event` 回调（与既有 `onDelta` 约定同构，AopProxy 友好）；Loop 侧内部事件队列转 `AsyncIterable<LLMEvent>` 供 §5 骨架的 `for await` 消费。
   - **故障降级**：复用 `resolveCandidateModels` 语义；**真取消不触发降级**（`AbortedError` 立即上抛，类型化原因）。
3. **AbortSignal 真取消**：`LLMEventsRunner` 将外部 signal 与空闲看门狗合并为同一 `AbortController`，**每次 `reader.read()` 与 aborted promise 竞速**——对任何流实现（含未接线 signal 的流）都真取消；修复旧流式路径「计时器在 fetch 响应头后即 clearTimeout，读循环流停滞可永久悬挂」缺陷。
4. **原生 tool_calls**：`BaseLLMStrategy.buildChatEventsRequest` OpenAI 兼容实现（tools JSON Schema 直传 + `tool_choice` 默认 auto）；**阶段0 边界：事件 API 仅面向 OpenAI 兼容 wire**（与既有流式路径边界一致），Anthropic/Google 原生格式归一化后续补齐。
5. **接入点唯一性**：经 `LLMAccess.execLLMEvents` → `LLMProvider` 链路（DevStandards §8），Runtime 不直连 HTTP/SDK。
6. **错误归类（fail-loud）**：HTTP 非 2xx → `REMOTE_ERROR`；网络/解析 → `CONNECT_ERROR`；取消 → `AbortedError`（`ABORTED` + 类型化原因）。
7. **流断开判定（2026-09-04 修复①）**：`LLMEventsParser.sawFinishReason` 记录流内是否出现显式 finish_reason 帧；流结束但无 finish_reason 帧（中途断流）→ `finish_reason='error'`，与正常完成（stop）可区分；消费侧 `runInnerTurn` 据此收敛 `stop_reason='error'`。
8. **降级约束（2026-09-04 修复②）**：候选已向 `on_event` 产出过流事件后失败 → **禁止降级**（避免跨候选混合流，消费方无法区分归属）；未产出事件（如 HTTP 4xx/5xx）照常降级。无 `on_event` 时不受约束。
9. **part.delta 合帧（2026-09-04 修复③）**：Loop 侧 50ms 缓冲合并相邻 delta（拼接语义不变，显著降低事件 INSERT 频率）；turn 完成/结算时同步 flush。
7. **tool 修复**：tool 名大小写不匹配自动重试一次，仍失败则改写为 `invalid` 工具结果回流模型（OpenCode repairToolCall 模式）——**Tools 层落地**（阶段2，与 zod 校验同层）。

## 5. 循环骨架（已落地；事件暴露形态见 §4 落地差异）

```typescript
// AgentLoopService —— 两级循环（公开边界 execAgentLoop 5 参）
async function runOuterLoop(ctx: LoopRunContext): Promise<void> {
  ctx.stopReason = await this.runInnerLoop(ctx);          // 阶段3 接 followup 队列
}
async function runInnerLoop(ctx): Promise<StopReason> {
  for (;;) {
    const verdict = await this.runInnerTurn(ctx);          // 预算→LLM→持久化→工具
    if (verdict !== 'continue') return verdict;
  }
}
```

`runInnerTurn` 内部：`consumeBudget`（耗尽无宽限 → 'budget'；宽限消费 → `finalTurn` 收掉工具）→
`callLLMTurn`（execLLMEvents；`on_event` → `streamHandler` 投影 part.delta）→
`persistAssistantTurn`（消息 + reasoning/text/tool Parts + part.created 事件）→
finish=tool-calls → `consumeToolCalls`（execTool 配对结果 → Part 状态机 → tool.launch/tool.result 事件）
→ finish=stop → `ctx.result` → 'stop'。

## 6. IterationBudget（`Runtime/shared/IterationBudget.ts`）

- 参数：`total`（主循环默认 60）、`tool_call_limit`、`grace`（超支宽限期：预算耗尽仍允许 1 次无工具收尾调用）；
- `consume(): boolean`、`refund(n)`（子代理退还不适用时忽略）、`remaining`；
- 子代理独立预算（`delegate` 工具传入 `SUBAGENT_BUDGET`，默认 30）；
- 取代旧 `max_iterations: 10` / `max_execution_depth: 50` 配置。

## 7. StreamProcessor（`Runtime/Loop/StreamProcessorService.ts`）

| 事件 | 处理 |
|------|------|
| `reasoning_delta` | 追加 reasoning Part 字段 `reasoning` → `part.delta` 事件 |
| `text_delta` | 追加 text Part 字段 `text` → `part.delta` 事件 |
| `tool_call_delta` | 聚合 args → finish 时建 tool Part（pending）→ `part.created` 事件 |
| `finish` | tool Part 逐个 `running`；usage 记账 |
| `AbortedError` | 未配对 tool Part 标记 `aborted(reason)` → `tool.result(status:aborted)` 事件 |

并行工具执行：无依赖 tool_calls 默认顺序执行（保配对清晰）；`parallel_batches` 参数可开启批次并行（单批次原子启动检查点）。

## 8. 与旧模型的关系

| 旧 | 新 |
|----|----|
| `execThink/execAct/execReflect/execAnswer`（4 步词表） | LLMEvent 流 + tool_calls finish |
| `tool_type=NONE` 跳步补丁 | 不存在（原生循环无该语义） |
| `extractLastNextAction` regex 反解析 | tool_call 结构化参数（zod 校验） |
| `Promise.race(node_timeout_ms)` | AbortSignal + 模型空闲 watchdog（120s 云/300s 本地，OpenClaw） |
| `runSteps/runPhases` 双状态机 | `handleOuterLoop/handleInnerTurn` 两级 while |

## 9. 验收

- 单测：LLMEvent 归一化（mock provider 流）——**已落地**（`Base/test/LLMEventsParser.test.ts` 8 用例 + `Base/test/LLMEventsRunner.test.ts` 6 用例，2026-09-04）；finish=tool-calls → 执行 → 配对；预算超支 prefill；aborted 未配对 Part 规范化。IterationBudget —— 已落地（`Runtime/test/IterationBudget.test.ts` 6 用例）。
- 集成：mock LLM 多轮 tool_calls 后 stop；steering 注入点边界正确；watchdog 触发 abort。
