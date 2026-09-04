# 代码变更记录 (CHANGELOG)

## [2026-09-04] Runtime v2 · 线上切换：Chat v2 分流（编排内核/Agent 选择上线）+ Agents 确定性匹配 + Runs 两段式网关 —— 修复「身份问题套编码人设」错配

**变更原因**：
- 线上证据（work `a5b6d442`，trace `6a7afdec`）：「你是谁？」命中 `general-通用问答助手`（名/用途匹配正确），但其**历史 Soul 绑定为「专业编码与研究助手」**，LLM 按人设回答「专业编码与研究助理」；且线上编排仍是旧 JSONNode workflow（Runtime v2 未接线）。

**修改的方法与模块**：
- `Runtime/Agents/`（新增）— **确定性匹配**：`matchAgentDef`（exact 签名 → bigram Jaccard 相似度 ≥0.7 → LLM 打分（builtin.agent_match）→ AgentBuilder.force_new 构建，**无随机重建**，弃用 `shouldReuseByRegenRate`）；`runtime_agent_def` 表（name/agent_ref/task_signature/agent_purpose/model_id/soul_id/tools_json/budget）；`soAgentSnapshot` **组件按当前任务经 Core match 动态重解析**（soul/skills/mcps 不沿用 agent_soul/agent_skill 历史绑定——根治错配）+ `builtin.identity` 身份段模板（PromptCatalog，身份问题由此回答，自称 Brian，禁止罗列内部工具）；
- `Runtime/Runs/`（新增）— `runtime_run` 表 + `RunGatewayService`：两段式 `submitRun`（立即 ack `{run_id, queued, steered}`）/ session lane（并发 1）/ 队列模式 steer（注入活动 run）/ followup（排队）/ interrupt（中止后排队）/ `waitRun`（结算 waiter，未注册 run 立即兜底）/ `abortRun`（类型化取消）/ `soRunStatus`；
- `Runtime/Loop/` — 接 steering/followup **真队列**（鸭子接口 `LoopQueue`，RunGateway 后绑定注入；外层 followup + steering 残留兜底，内层边界抽干）；
- `Application/Chat/ChatService` — `openChatStreamV2`（`runtime.v2_enabled` 开关，缺省 true）：Runtime 会话幂等创建 → **v2 事件 → 现有前端 SSE 协议过渡投影**（part.delta(text)→text_chunk、part.delta(reasoning)→agent_thinking、tool.launch/result→agent_action/agent_output、run.status 结算→done；投影起点=会话最新 seq，**不重放历史 run**）→ submitRun → waitRun → done(final_response)；
- `dev-server.ts` — 组合根装配 Runtime（Session/EventBus/Tool(内置3工具)/Loop/AgentDef/RunGateway）+ queue bridge + v2 开关（runtime_config 表）；
- **两处关键 LLM 链路修复**（线上联调定位）：
  1. `BaseLLMStrategy.prepareEventsBody` — **补 `stream: true`**（旧 execLLM 流式路径是事后注入 strategy body，events API 构造期缺失 → 端点返回非流式 JSON → SSE 解析无帧 → 断流误判 error）；
  2. `prepareEventsMessages`（Strategy + Service）— **messages 路径丢失 system**：input.messages 非空时直接 return，编排层 system 从未到达模型（自称 Claude/工具清单漂移的根因）→ 修复为 **system 前置/替换首条 system 消息**；
- `Runtime/Agents` — `agent_purpose` 列（兼容 ALTER）+ 旧行回填（用途用于 LLM 打分展示，签名仅作匹配键）。

**影响的端点**：
- `POST /api/chat/stream` — **行为切换**：编排内核从 JSONNode SIMPLE workflow → Runtime v2（RunGateway + Loop + 确定性 Agent 匹配 + identity 身份段）；SSE 出口协议不变（前端零改动）；`runtime_config.v2_enabled=false` 可一键回退旧链路；
- 线上验证：干净会话「你是谁？」→「我是 Brian，你的智能个人助理……」（不再套编码 Soul）；一般问答/技能场景正常；同任务复用同 def（不重复构建）。

**测试**（Runtime 39（+5 网关/匹配）+ Base 799 全过；方法行数零超限）：
- `Runtime/test/RuntimeGateway.test.ts`：确定性复用（两次提交 buildAgent 仅 1 次）/ 组件动态重解析（system 含 identity + matchSoul 内容）/ session lane steer 语义（steered=true 同 run_id，边界抽干成为第二条 user 消息）/ 事件投影 / waitRun 兜底。

**可能存在的问题/风险点**：
- 过渡投影保留旧事件名（前端 v2 原生协议改造后删除，TODO 已列）；
- LLM 打分质量依赖 `agent_purpose`（构建时从 agent 表读取；历史 def 已回填）；
- 会话历史 assistant 回复会形成模式 prior（历史污染），长会话需阶段3+ compaction；
- `matchSkill/matchSoul` 当前 Soul 库仅编码类条目，身份/闲聊场景建议补充通用 Soul 资产。

## [2026-09-04] Runtime v2 · 审计遗留修复：流断流判定 / 降级混合流禁止 / part.delta 合帧 / 事件保留期 / tool_id 命名统一

**变更原因**：
- 修复审计与各阶段 CHANGELOG 记录的全部可修复遗留项（用户指令「修复所有的内容」）：
  ① 流中途断开（无 finish_reason 帧）被误判为 stop，与正常完成不可区分；
  ② 故障降级期间跨候选混合流（消费方无法区分事件归属）；
  ③ `part.delta` 每条 delta 一次事件 INSERT（流式长回复高频写）；
  ④ `runtime_event` 保留期清理未实现；
  ⑤ 工具标识命名不一致（wire `function.name` 与内部 `tool_id` 混用）；
  ⑥ SessionService seq 缓存/忙锁为模块级变量（与 EventBus 实例字段不一致，跨实例污染）。

**修改的方法与模块**：
- `Base/shared/llm/LLMEvent.ts` — **修复⑤**：`LLMToolSpec.name`/`ParsedToolCall.name`/`tool_call_delta.name` → `tool_id`；wire `function.name` 映射收敛至两处边界（`BaseLLMStrategy.prepareToolSpec` 出向 / `LLMEventsParser` 入向）；
- `Base/LLMProvider/application/llmevents/LLMEventsParser.ts` — 修复⑤同步 + 新增 `sawFinishReason`（记录流内是否出现显式 finish_reason 帧）；
- `Base/LLMProvider/application/llmevents/LLMEventsRunner.ts` — **修复①**：`buildResult` 流结束但 `sawFinishReason=false`（中途断流）→ `finish_reason='error'`；`LLMEventsRunResult` 新增 `emitted_events`；事件投递统一经 `emitToSubscriber` 计数；
- `Base/LLMProvider/application/LLMService.ts` — **修复②**：`executeEventsSingle` 包装 `on_event` 记录 `emitted`（成功与异常路径均可判定）；`execLLMEvents` 降级循环中候选已产出流事件 → **禁止降级**（break），未产出事件照常降级；
- `Base/LLMProvider/application/strategies/BaseLLMStrategy.ts` — 修复⑤出向映射（`spec.tool_id` → `function.name`）；
- `Runtime/Loop/application/AgentLoopService.ts` — **修复③**：`bufferDelta`/`flushDeltaBuffer`（50ms 合帧，delta 拼接语义不变；turn 完成/结算同步 flush，timer 清理）；`runInnerTurn` 消费侧识别 `finish_reason='error'` → `stop_reason='error'`；`settleLoop` 结算事件失败 warn 不掩盖业务结果；`configLoop` 未用 `output` → `_output`；`call.tool_id` 链路统一；
- `Runtime/Bus/application/EventBusService.ts` — **修复④**：`retentionDays`（默认 30）+ `purgeExpiredEvents`（initialize 启动清理 + configBus 变更即时清理；0=永不清除）；`ConfigBusInput.retention_days`；
- `Runtime/Session/application/SessionService.ts` — **修复⑥**：`sessionSeqCache`/`sessionBusyLock` 模块级 → 实例字段；清理无意义 `output.error = undefined`；
- `Runtime/Tools/application/ToolService.ts` — `configTool` 未用 `output` → `_output`。

**影响的端点**：无业务端点变化；方法索引不变（518）。

**测试**（Base 799 全过（新增 failover 语义 3 用例）+ Runtime 34 全过）：
- `Base/test/LLMEventsFailover.test.ts`（新增，3）：已产出事件失败禁止降级（fetch 仅一次）/ 无事件失败正常降级到第二候选 / 无 on_event 不受 emitted 约束；
- `Base/test/LLMEventsParser.test.ts`（+1）：`sawFinishReason` 显式帧判定；`Base/test/LLMEventsRunner.test.ts`（+1）：断流 → `finish_reason='error'`；
- 测试助手修正：streams 规范 `controller.error()` 同步丢弃已入队 chunk → 改异步触发（先读后错）。

**可能存在的问题/风险点**：
- 断流判定为严格语义：provider 正常结束但不发 finish_reason 帧（罕见）也会判 error —— fail-loud 取向，可接受；
- 「已产出事件禁止降级」收紧了流式降级健壮性（宁可失败不出混合流）——非流式 `execLLM` 降级语义不变；
- 多进程 seq 分配仍为单进程边界（架构级，随阶段4 网关评估）。

## [2026-09-04] Runtime v2 · 开发规范审计：修复 3 处违规（Context 类型统一 / 未处理 rejection / controller 泄漏）

**变更原因**：
- 按 `docs/_1_DevStandards/DevStandards.md` + Runtime-PRD §7（5 参签名 / ≤40 行 / 逻辑数据拆分）对阶段0-2 全部新增代码做系统审计。

**修复的方法**：
- `Loop/application/AgentLoopService.ts` — ① `execAgentLoop/abortLoopTurn/configLoop` 的 `_context` 由基类 `Context` / inline `import('@brian-agent/base').Context` 统一为模块 `LoopContext`（DevStandards §3 XxxContext 约定 + 规则1 同一定义同一单词）；② `publishPartDelta` 的 `void this.bus.publishEvent(...)` 未处理 rejection → 显式 `.catch` + `logger.warn`（流处理不因事件总线故障中断）；③ `prepareLoopContext` 在 controller 注册后（persistUserMessage/publishRunStatus 失败）泄漏注册表项 → try/catch 清理后重抛；
- `Loop/access/LoopAccess.ts` — 三个方法 `context: Context` → `context: LoopContext`。

**影响的端点**：无（Runtime 内部类型与健壮性修正；34 用例回归通过）。

**可能存在的问题/风险点**：
- 工具标识在 LLM wire 边界为 `function.name`（OpenAI 格式强制），内部统一 `tool_id` —— 边界映射为协议驱动而非命名不一致；
- `part.delta` 每条 delta 一次事件 INSERT（流式长回复高频写），阶段4 可加合帧降频；
- LLMEventsRunner 流式 fetch 不经 HttpService（无代理支持）—— 与旧 `execLLM` 流式路径先例一致（Provider 层自身即接入点）。

## [2026-09-04] Runtime v2 · 阶段2：AgentLoopService 两级循环 + Tool 框架（zod）+ 内置 3 工具 —— DIRECT 场景端到端验证

**变更原因**：
- Runtime v2 迁移路线阶段2（Runtime-PRD §9）：落地「代码即编排」核心 —— 单一两级 while 循环（弃用 ExecutionRule steps/phases 状态机与 Think/Act/Reflect 模拟工具调用）、编排原语工具化（zod schema 工具框架，用户决策新增依赖 zod），并完成 DIRECT 场景端到端验证（替代 SIMPLE workflow 的等价路径）。

**修改的方法与模块**（全部新增，5 参签名，每方法 ≤40 行，逻辑/数据拆分）：
- `Runtime/Tools/domain/types.ts` — `ToolDef<P>`（zod schema 强类型）/ `ToolResult`（ok/error/denied 配对语义）/ `ToolExecutionContext` / 5 组 Input/Output；
- `Runtime/Tools/domain/zodToJsonSchema.ts` — 紧凑 zod→JSON Schema 转换器（**决策：仅依赖 zod，不引入 zod-to-json-schema**；覆盖 object/string/number/boolean/enum/array/record/optional/nullable/default/union/discriminatedUnion/literal/unknown/any；未覆盖类型 fail-loud `ProcessingError`）；
- `Runtime/Tools/application/builtinTools.ts` — 内置 3 工具：`skill_exec`（经 `SkillAccess.execSkill`）/ `mcp_exec`（经 `MCPAccess.execMcp`）/ `cdt_browser`（经 Core `CDTCoreAccess` 六操作 navigate/get_content/type_text/click/scroll/evaluate；get_content=evaluate(body.innerText) 截断 8000，与旧 `execCdtAction` 语义一致）；Provider 未注入 fail-loud；
- `Runtime/Tools/application/ToolService.ts` — `registerTool`（内置 id 不可覆盖）/ `registerBuiltinTools`（幂等）/ `execTool`（**zod 校验失败与 execute 抛错均归一为配对 error 结果回流模型**，OpenCode invalid-args 语义）/ `soTools`（zod→JSON Schema 规格）/ `configTool`；
- `Runtime/Tools/access/ToolAccess.ts` — AopProxy 门面（内置工具 Provider 经构造注入）；
- `Runtime/Loop/domain/types.ts` — `ExecAgentLoopInput/Output`（stop_reason: stop/aborted/error/budget + token_usage + iterations + message_id）/ `AbortLoopTurnInput`（类型化取消）/ `ConfigLoopInput`；
- `Runtime/Loop/application/AgentLoopService.ts` — **两级循环核心**：
  - 消息中心：`prepareModelMessages` 每轮从 `runtime_message_part` 重读派生 wire 消息（user / assistant(tool_calls) / tool 配对结果），**无跨轮内存消息状态**；tool Part `input_json = {tool_call_id, arguments}`；
  - 预算：`consumeBudget`（IterationBudget；宽限消费 → `finalTurn` 收掉工具强制收尾）；
  - LLM：`callLLMTurn` → `LLMAccess.execLLMEvents`（阶段0 地基）；`streamHandler` 把 reasoning/text delta 投影为 `part.delta` 事件（Part 于轮完成时持久化）；
  - 持久化：`persistAssistantTurn`（消息 + reasoning/text/tool Parts + part.created 事件）；
  - 工具：`consumeToolCalls`（execTool 配对结果 → Part 状态机 pending→running→completed/error + tool.launch/tool.result 事件）；
  - 真取消：run 级 AbortController 注册表（`abortLoopTurn` 类型化取消 + 外部 signal 转发）→ `AbortedError` 收敛 `stop_reason='aborted'`；
  - 事件结算：`run.status`（start / end / error + stop_reason）；
- `Runtime/Loop/access/LoopAccess.ts` — AopProxy 门面（DI：LLMAccess + SessionAccess + EventBusAccess + ToolAccess）；
- Runtime barrel 导出 Loop/Tools；`Runtime/package.json` 增加 `@brian-agent/core` 依赖（cdt_browser 需要）。

**影响的端点**：
- 无业务端点变化（阶段2 additive：Loop 未接 dev-server，阶段4 网关切换时接线）；
- 方法索引已重生成（`npm run docs:index` → 518 个方法）。

**测试**（Runtime 34 用例全过；Base 794 回归通过）：
- `Runtime/test/Tools.test.ts`（11）：zodToJSONSchema 三组形态 / 注册执行 / 非法参数回流 / execute 抛错归一 / JSON Schema 规格 / 未注册 fail-loud / 内置 skill_exec 经 Provider / 内置不可覆盖 / mcp 未注入 fail-loud；
- `Runtime/test/AgentLoop.test.ts`（4，DIRECT 端到端）：多轮 tool_calls 配对回流→stop（验证第 2 轮 wire 消息 = user→assistant(tool_calls)→tool(result)，由持久化 Part 派生）/ 预算耗尽→budget / 外部取消→aborted / LLM 失败→error。

**可能存在的问题/风险点**：
- 阶段2 steering/followup 为占位（外层单轮），阶段3 接 Runs 队列模式后两级循环完整；
- 权限门（denied/ask_user Deferred 挂起）阶段3 落地；update_plan/delegate 编排工具阶段3 落地；
- 工具注册表为内存态（阶段2 无持久化）；loop 每轮全量重读会话消息（limit 100），超长会话需在阶段3+ 引入 compaction。

## [2026-09-04] Runtime v2 · 阶段1：Session 模块（会话/消息/Part + 忙锁）与 EventBus（持久化事件 + durable 投影）

**变更原因**：
- Runtime v2 迁移路线阶段1（Runtime-PRD §9）：为两级循环提供「消息中心」状态载体（Session-PRD：会话→消息→Part 三级模型，循环控制状态从持久化 Part 派生）与「副作用唯一出口」（Bus-PRD：业务代码只发布事件，UI 是纯投影，支持重放）。

**修改的方法与模块**（全部新增，5 参签名，每方法 ≤40 行，逻辑/数据拆分）：
- `Runtime/Session/domain/types.ts` — `PartType`（reasoning/text/tool/steering/subtask）/ `PartStatus` 状态机（pending→running→completed/error/aborted）/ `MessageWithParts` / 9 组 Input/Output（均继承 `@brian-agent/base` 基类）；
- `Runtime/Session/infrastructure/SessionSchemaInitializer.ts` — `runtime_session`（session_key 唯一 + last_seq 游标）/ `runtime_message`（seq 严格递增）/ `runtime_message_part`（toolCall 配对字段 input_json/output_json）+ `runtime_session_config` 共 4 表；
- `Runtime/Session/application/SessionService.ts` — `addSession`（幂等）/ `addMessage`（seq 分配：进程缓存 + DB last_seq 持久事实源）/ `addPart`（part_order）/ `updatePart`（状态机 + `content_patch` delta 追加）/ `appendPartContent`（delta 委托入口）/ `soMessages`（seq 倒序取页升序返回 + Parts 组装）/ `ensureRunState`/`releaseRunState`（每会话忙锁，进程内 Map；DB 双重校验待阶段4 runtime_run）/ `configSession`；错误 fail-loud（ValidationError/NotFoundError）；
- `Runtime/Session/access/SessionAccess.ts` — AopProxy 门面（10 个公开方法）；
- `Runtime/Bus/domain/types.ts` — `EventType`（v2 事件协议 11 类）/ `RuntimeEvent` / `EventSubscriber` / 5 组 Input/Output；
- `Runtime/Bus/infrastructure/BusSchemaInitializer.ts` — `runtime_event`（session_key+seq 索引）+ `runtime_bus_config`；
- `Runtime/Bus/application/EventBusService.ts` — `publishEvent`（seq 单调 → 落库 → 进程内扇出；**投递失败不中断发布方**）/ `soEventReplay`（after_seq 之后=GT，升序 + 类型过滤）/ `registerProjection`（**durable：先重放后尾随**，出参 `last_seq`+`subscription_id`）/ `unregisterProjection`（幂等）/ `configBus`；seq 缓存与订阅注册表为实例字段；
- `Runtime/Bus/access/EventBusAccess.ts` — AopProxy 门面；
- `Base/shared/index.ts` — 补导出 `newRecord/newPatch/toDataObject`（Runtime 经包名导入所需，additive）；
- `Base/index.ts` 无变化；Runtime barrel（index.ts）导出 Session/Bus 两模块；
- `scripts/generate-method-index.mjs` / `scripts/analyze-method-length.mjs` — LAYERS 增加 `Runtime`（方法索引 508 个；Runtime 层方法长度零超限）。

**影响的端点**：
- 无业务端点变化（阶段1 additive：Session/EventBus 未接入 dev-server，阶段4 网关切换时接线）；
- 方法索引已重生成（`npm run docs:index` → Runtime/Bus 6 方法 + Runtime/Session 10 方法）。

**测试**（19 用例全过，Base 全量 794 回归通过）：
- `Runtime/test/Session.test.ts`（7）：addSession 幂等 / seq 严格递增 / Parts 有序 / 状态机+delta 追加 / fail-loud / 忙锁互斥与重取 / before_seq 分页；
- `Runtime/test/EventBus.test.ts`（6）：seq 单调 / 游标+类型过滤重放 / durable 重放→尾随无缝 / 断线重连不丢不重 / 投递失败写库保底 / 订阅幂等释放；
- `Runtime/test/IterationBudget.test.ts`（6，阶段0）。

**可能存在的问题/风险点**：
- seq 分配为进程内缓存 + DB 持久事实源，单进程安全；多进程部署（当前架构单机单进程）下需改用 DB 原子自增；
- 忙锁为进程内 Map，崩溃后自动释放（进程生命周期即锁生命周期）；阶段4 接入 runtime_run 表后补 DB 双重校验；
- `runtime_event` 保留期清理（retention_days）未实现（阶段4 接线时随心跳/保留期配置一并落地）。

## [2026-09-04] Runtime v2 · 阶段0：LLMProvider 归一化事件流 + 原生 tool_calls + AbortSignal 真取消 + Runtime 工作区骨架

**变更原因**：
- Runtime v2 编排内核（`docs/_3_BackendDesign/_07_Runtime/`，弃用 workflow 决策定稿）阶段0 迁移路线（Runtime-PRD §9）：编排循环需要「1 次 LLM/迭代 + 原生 tool_calls + 归一化流事件 + 真取消」的 LLM 地基；旧 `execLLM` 流式路径仅解析 `delta.content`（usage 记 0/0、丢失 reasoning_content/tool_calls/finish_reason）、流式计时器在 fetch 响应头后即失效（读循环流停滞可永久悬挂）、且无外部取消信号入口。

**修改的方法与模块**：
- `Base/shared/llm/LLMEvent.ts`（新增）— `LLMEvent` 归一化流事件四类 delta（reasoning/text/tool_call/finish）+ `LLMMessage`（原生消息数组，严格角色交替）+ `LLMToolSpec`（JSON Schema 工具规格）+ `ParsedToolCall`/`TokenUsage`；
- `Base/shared/errors` — 新增 `AbortedError`（类型化取消原因 user/timeout/budget/superseded，OpenClaw turn-interruption 范式）+ `ProcessingError` 补入 shared 统一导出；
- `Base/LLMProvider/domain/types.ts` — 新增 `ExecLLMEventsInput`（messages 优先兼容 prompt/system · tools · tool_choice · signal · idle_watchdog_ms · on_event）与 `ExecLLMEventsOutput`（result/reasoning/tool_calls/finish_reason/usage/wire_messages）；
- `Base/LLMProvider/application/llmevents/LLMEventsParser.ts`（新增，每方法 ≤40 行）— 状态化解析：`delta.content`→text_delta、`delta.reasoning_content`→reasoning_delta、`delta.tool_calls` 按 index 聚合→tool_call_delta、finish 事件（wire finish_reason 映射 tool_calls/function_call→tool-calls；usage 帧缺失按 4 字符/Token 粗估输出侧）；
- `Base/LLMProvider/application/llmevents/LLMEventsRunner.ts`（新增，每方法 ≤40 行）— 流执行器：fetch + SSE 读循环 + **双取消接线**（外部 AbortSignal 与空闲看门狗合并 controller；**每次 reader.read() 与 aborted promise 竞速**——对任何流实现都真取消）+ 空闲看门狗逐帧重置（默认 30s）+ 错误归类（HTTP 非 2xx→`REMOTE_ERROR`，网络/解析→`CONNECT_ERROR`，取消→`ABORTED`）；
- `Base/LLMProvider/application/LLMService.ts` — 新增 `execLLMEvents`（5 参签名，additive 不动旧 `execLLM`）+ `executeEventsSingle`（候选模型故障降级，复用 `resolveCandidateModels`）+ `buildEventsRequest`/`fillEventsOutput`/`validateEventsInput`/`prepareWireMessages`（逻辑/数据拆分）；**真取消不触发降级**（AbortedError 立即上抛）；
- `Base/LLMProvider/application/strategies/` — `ILLMProviderStrategy` 新增 `buildChatEventsRequest`；`BaseLLMStrategy` OpenAI 兼容实现（`prepareEventsBody/prepareEventsMessages/prepareEventsMaxTokens/prepareToolSpec`，JSON Schema 直传 tools，透传黑名单扩展 tools/tool_choice）；**阶段0 边界：事件 API 仅面向 OpenAI 兼容 wire**（与既有流式路径边界一致，Anthropic/Google 原生格式后续补齐）；
- `Base/LLMProvider/access/LLMAccess.ts` — 新增 `execLLMEvents` 委托；
- `brian-backend/Runtime/`（新增工作区 `@brian-agent/runtime`）— `shared/IterationBudget`（Hermes 迭代预算：total/tool_call_limit/grace 宽限收尾/refund）+ `shared/types`（LLMEvent/AbortedError re-export）+ 依赖 zod（^3.23.8，决策记录：工具参数 schema 校验）；根 package.json 注册 workspace 并入 build/test/typecheck 链；
- `Base/tsconfig.json`（修复既有构建缺陷）— 删除无效 `paths`（`@base/*`）映射：与 `include:"**/*.ts"` + declaration 输出交互使 dist 全部 .d.ts 进入程序输入，与 outDir=dist 碰撞（TS5055），**重复构建必挂**；
- `Base/shared/llm/CallLLMJson.ts`（修复既有缺陷）— 原自引用包名 `import ... from '@brian-agent/base'` 解析到自身 dist（同一 TS5055 链根因），改为相对导入。

**影响的端点**：
- 无业务端点变化（阶段0 additive：旧 `execLLM` 全链路不变，15+ 调用方无感）；
- `POST /api/chat/stream` — 间接地基：后续阶段2 起 Loop 经 `execLLMEvents` 消费归一化事件（本阶段未接线）；
- 方法索引已重生成（`npm run docs:index`，492 个方法，含 `execLLMEvents`）。

**测试**：
- `Base/test/LLMEventsParser.test.ts`（8 用例）+ `Base/test/LLMEventsRunner.test.ts`（6 用例：mock fetch SSE 归一化/跨帧 tool_calls 聚合/看门狗超时/外部 signal 真取消/REMOTE_ERROR/CONNECT_ERROR）+ `Runtime/test/IterationBudget.test.ts`（6 用例）；Base 全量 794 用例回归通过。

**可能存在的问题/风险点**：
- 阶段0 事件 API 仅 OpenAI 兼容 wire：Anthropic/Google 提供商经事件 API 走默认 OpenAI 形状（与既有流式路径边界一致），原生格式归一化待后续阶段；
- 流中途断开（无 finish_reason 帧即连接关闭）当前映射为 `stop`，与正常完成不可区分（旧实现同语义）；后续可在 Runner 增加断流标记；
- 故障降级期间若首个候选已流出部分事件后失败，`on_event` 回调消费方可能收到跨候选混合流（旧 `execLLM` 流式路径同语义）；消费方（Loop）应在 `finish` 前不落账。

## [2026-08-26] DagScheduler 快速失败立即收敛，修复并发 DAG 节点失败后 work 卡死

**变更原因**：
- 并发执行下，某节点失败触发快速失败后，`Promise.all` 仍等待其他正在执行的并发节点；若这些节点因底层 LLM / CDT 调用挂起（如 `CDP WebSocket 连接已关闭` 后复用该 Agent 的后续任务卡死），整个 DAG 永久卡在 `EXECUTING`，work 不收敛为 FAILED、也不写错误 RESPONSE（本次「我想去北京旅游」work 卡死约 2 小时）。

**修改的方法与模块**：
- `DagScheduler.ts` — 新增快速失败信号 `failureSignal`，节点失败即 resolve；`run()` 以 `Promise.race([Promise.all(runners), failureSignal])` 立即收敛并抛 `DagNodeFailureError`，不再等待卡死的并发节点。

**影响的端点**：
- `POST /api/chat/stream`（Planning 策略）— 并发 DAG 任一节点失败后 work 立即收敛为 FAILED 并写错误 RESPONSE。

**可能存在的问题/风险点**：
- 快速失败后正在执行的节点在后台继续直至自行失败，其落库与事件推送为 best-effort。

## [2026-08-26] 上下文弱相关维度数量+比例双控制 + 关键词 bm25 评分截断

**变更原因**：
1. 关键词 / 标签关联 / 语义相似三个弱相关维度仅有「基础数量」单一控制，缺少「占 total 上限百分比」的比例控制；随机维度的 `random_max_percent` 在单模式重构后未实际生效；
2. 关键词匹配缺少 bm25 评分截断，低相关命中混入上下文。

**修改的方法与模块**：
- `InfoCoreService.context` — 弱相关维度限额改为 `min(base_xxx_count, floor(total × xxx_max_percent / 100)) × shrinkFactor` 双控制；关键词维度按 `keyword_score_threshold` 截断；
- `InfoCoreService.keywordKInfo` — bm25 做 min-max 全量归一化到 0-100（命中集合值域线性映射，最优=100、最差=0），输出项附 `keyword_score`；
- `info_context_config` 新增 `tag_relative_max_percent`(20) / `similarity_max_percent`(15) / `keyword_max_percent`(10) / `keyword_score_threshold`(95) 四列（含迁移）与配置注册。

**影响的端点**：
- `InfoCore.context` — 弱相关维度受数量+比例双控制，关键词仅保留评分 ≥ 阈值的命中；
- 配置页「Agent 上下文构建」— 支持四个新增配置项。

**可能存在的问题/风险点**：
- bm25 采用 min-max 全量归一化（命中集合值域线性映射到 0-100），不同查询间绝对值不可比较；阈值 95 保留位于命中集合前 5% 相关度的消息。

## [2026-08-26] 修复需求确认取消后信息残留 + keywordKInfo 改 FTS5 MATCH

**变更原因**：
1. 需求确认「取消（CANCEL）」仅将 work 置为 `CANCELLED`、未删除 `info_raw` 中已保存的 REQUEST，前端本地移除刷新后重新出现（「我想去旅游」会话已取消提问残留）；
2. `keywordKInfo` 用 `word IN (...)` 等值匹配 + 命中次数排序，未按 PRD 使用 FTS5 MATCH 语法与 bm25 相关性评分，关键词匹配不符合上下文构建逻辑。

**修改的方法与模块**：
- `InfoCoreService.keywordKInfo` — 改用 `info_keyword` FTS5 `MATCH`（`word:"..." OR ...`）检索，按 `bm25` 升序返回，info_id 聚合取最优 bm25，保留 `keyword_match_count`；
- `InfoCoreService.delInfoByWork` / `InfoCoreAccess.delInfoByWork` — 新增按 work_id 级联删除信息及派生数据；
- `OrchestrationEntryService.confirmIntent` — CANCEL 分支调用 `delInfoByWork` 删除已落库 REQUEST。

**影响的端点**：
- `POST /api/chat/confirm-intent`（action=CANCEL）— 取消后提问彻底移除，刷新不再出现；
- `InfoCore.keywordKInfo` — 返回按 bm25 相关性排序的匹配消息。

**可能存在的问题/风险点**：
- 删除为 best-effort；bm25 针对「每 info 每关键词一行」打分，经聚合取最优值近似整条 info 相关度。

## [2026-08-24] 修复 LLM 代理请求超时挂起与编排层超时兜底

**变更原因**：
1. `HttpService.proxyFetch` 超时后仅 `destroy` 请求、不 `reject` Promise，导致经代理的 LLM 请求超时后调用方永久挂起（本次「研究 AI」问答挂在第 6 个 Work Agent 上约 15 分钟，最终被 20 分钟节点超时强制终止，work 状态 FAILED）；
2. `DagScheduler` / `execDAG` 无单 Agent 级超时，单个 Work Agent 挂起会拖垮整个 DAG；
3. Work Agent 执行子任务时 `InfoCore.context` 会做跨会话召回（标签/向量相似/关键词/随机全局兜底），无关历史会话内容污染当前任务上下文，导致任务漂移（如「研究 AI」漂成「搜索并总结 DeepSeek V4」）；
4. `orchestration_config.node_timeout_ms` 被配置为 1200000（20 分钟），单点卡死放大到 20 分钟以上。

**修改的方法与模块**：
- `HttpService.proxyFetch` — 重构为小粒度方法（`createProxySettle` / `resolveProxyAgent` / `buildProxyOptions` / `openProxyRequest` / `armProxyTimeout` / `attachProxyResponse` / `buildProxyHttpResponse` / `sendProxyBody` / `timeoutError`），任何终止路径（超时 / abort / 连接错误 / 响应完成）均通过一次性 `settle` 收敛 Promise，超时不再永久挂起；
- `DagScheduler` — 新增 `DagSchedulerConfig.nodeTimeoutMs` 与 `executeNode` 节点级超时，节点挂起时快速失败；
- `OrchestrationExecutionService` / `OrchestrationExecutionConfig` / `ConfigOrchestrationExecutionInput` — 新增 `agent_timeout_ms`（默认 300000）配置，经 `ensureConfigLoaded` / `configOrchestrationExecution` / 配置中心加载与下发；
- `OrchestrationEntrySchemaInitializer` — 幂等迁移：新增 `agent_timeout_ms` 列；`node_timeout_ms` 收敛到 <=600000；
- `InfoCoreService.context` / `ContextInfoInput` — 新增 `enable_cross_session`（默认 true），关闭后跳过 TAG_RELATIVE / SIMILARITY / KEYWORD 与 RANDOM 全局兜底；
- `AgentExecutionService.execAgent` — Work Agent 上下文构建传 `enable_cross_session: false`；
- `ConfigService` / `configRegistrations` — 注册并映射 `orchestration.execution.agent_timeout_ms`。

**影响的端点**：
- `POST /api/chat/stream` — Work Agent 执行不再跨会话召回上下文；单 Agent 挂起由最长 20 分钟缩短为 `agent_timeout_ms`（默认 5 分钟）快速失败；
- 所有经代理（HTTPS_PROXY / HTTP_PROXY）的外部 HTTP / LLM 调用 — 超时从「永久挂起」改为抛错返回；
- `POST /api/config/update` — 新增 `orchestration.execution.agent_timeout_ms` 配置项。

**可能存在的问题/风险点**：
- 节点超时后底层 `execSingleAgent` 无法被强制取消，其内部未完成的 LLM 调用仍会在后台自行失败（2 分钟 HTTP 超时），落库为 best-effort，不影响后续编排；
- `enable_cross_session: false` 使 Work Agent 丢失跨会话长程记忆，仅保留当前会话时间线/钉住/引用（任务内上游摘要仍经 task_content 注入）；
- 存量库中 `node_timeout_ms > 600000` 会在下次启动迁移时被 clamp 到 600000。

## [2026-08-22] 模型启用状态布尔化与保存误禁用修复

**变更原因**：
1. `PUT /api/config/model/:id` 无条件执行 `enable = (data.enable ?? data.enabled) ? 1 : 0`，前端保存模型时未携带 `enable`，导致每次编辑模型（如"一键补全"后保存）都会把 `llm_available.enable` 静默重置为 0，默认模型被误禁用，后续对话报 `LLM xxx 已禁用`；
2. 前端模型卡片对默认模型只显示"默认"角标、不显示启停状态，且无启停开关，用户无法发现也无法恢复；
3. 模型启用状态以字符串 `status: 'active'/'inactive'` 表达，语义不统一。

**修改的方法与模块**：
- `dev-server.ts` — `GET /api/config/model` 与 `GET /api/config/model/:id` 返回布尔 `enable`（替代 `status` 字符串）；`PUT /api/config/model/:id` 改为部分更新语义，仅当显式携带 `enable`/`enabled` 时更新启用状态，否则保留原值；
- 前端 `api/types.ts` — `ModelInfo.status` 改为 `enable: boolean`；
- 前端 `ConfigView.vue` — `BackendModel` 用 `enable?: boolean`；`submitModelForm` 保存时携带 `enable`；新增 `handleToggleModel`，模型卡片增加启用/停用 toggle 开关与状态圆点（默认模型也展示）。

**影响的端点**：
- `GET /api/config/model` / `GET /api/config/model/:id` — 返回结构由 `status` 改为 `enable`；
- `PUT /api/config/model/:id` — 未传 `enable` 时不再修改启用状态；
- 前端配置页 `/config` 模型管理视图。

**可能存在的问题/风险点**：
- `enable` 布尔化后，若存在依赖旧 `status` 字符串的前端/第三方消费方需同步（已全局排查，仅模型卡片使用，已改）；
- 存量数据中已误禁用的模型需手动重新启用（本次已恢复默认模型 `deepseek-v4-flash-260425`）。

## [2026-08-22] 思考过程 Prompt 去重与空维度渲染修复

**变更原因**：
1. 「需求理解 Agent」输入 Prompt 在无某类消息时仍渲染该维度标题与「（无历史上下文）/（无固定钉住信息）/（无显式引用消息）」等占位文案；
2. 「general-专业编码与研究助手」等 WorkAgent 的输入 Prompt 中 `<时间线消息>` 包含了本次问答输入（与 `task_content` 重复）；
3. `</上下文信息>` 标签之后额外拼接了原始任务内容，出现「什么是 AI]]>」等异常重复内容；
4. 「模型的完整回复 (LLM Response)」在取不到 raw_response 时回退到了用户输入（content/inputQuery）。

**修改的方法与模块**：
- `PromptsService.execPrompt` / `PromptCatalog.renderTemplate` — 新增 `{{#if var}}...{{/if}}` 条件块渲染（空变量整块移除），并新增 `stripEmptyConditionalBlocks` 共用函数；
- `PromptCatalog` — `intentUnderstanding` 模板改用 `{{#if}}` 条件块包裹可选维度；`think`/`reflect` 模板新增 `Task: {{task_content}}` 行；
- `IntentAgentService.understandRequirement` — 空消息类型不再传占位文案，改为空字符串；
- `InfoCoreProvider.context` — 时间线最新一条消息拆出为 `CURRENT` 类型（新增 `CollectionSource.CURRENT`），不再进入时间线/弱相关维度；`ContextInfoCategories`/`category_ids`/`sources_summary` 增加 `current` 字段；
- `AgentExecutionService.execAgent` / `think` / `reflect` — `context_data` 不再拼接 `task_content`，任务内容经 `task_content` 变量单独注入 Think/Reflect/Answer；
- `dev-server.buildThinkingBlocksAndDag` — `fullRawResponse` 回退仅允许 `outputAnswer`，禁止回退到 content/inputQuery；
- 前端 `ThinkingBlock.vue` — 「模型的完整回复」不再回退到 `block.content`。

**影响的端点**：
- `POST /api/chat/stream` — WorkAgent 各阶段 Prompt 不再重复携带本次输入；
- `GET /api/chat/thinking` — 「模型的完整回复」不再误显示为用户输入；
- 后端 InfoCore `context` 相关调用（`buildWorkContext` / `execAgent` 内部）。

**可能存在的问题/风险点**：
- `think`/`reflect` 模板新增 `task_content` 依赖，需确保 `ThinkInput`/`ReflectInput` 均传入 `task_content`（已同步）；
- `CURRENT` 为新增 CollectionSource 枚举值，老数据 `info_context_source` 表中无该来源，属正常（历史记录不受影响）。

## [2026-08-20] 系统核心功能增强与模版编排重构

**变更原因**：
1. 增强意图理解与问答上下文匹配度评估，新增 IntentAgent 模块与 Base 层 PromptCatalog 单一真相源；
2. 优化会话标题生成逻辑（自动截断首条消息前 50 字）与新增手动修改标题接口；
3. 升级 Planning / Simple 编排策略的思考过程展示（ThinkingModal），将 DAG 重构并抽离至弹窗视图，提升主对话区视觉体验；
4. 修复 WriterAgent 结果字段映射问题以及 AgentDAG 构建中跨 Plan 复用 Agent 的唯一索引冲突 Bug；
5. 调整配置划分，将 Agent 重新评估概率配置 `regen_rate` 归属由 `agent_builder` 统一迁移至 `agent_library`。

**修改的方法与模块**：
- `IntentAgentService.understandRequirement` — 新增内置意图识别 Agent；
- `PromptCatalog` — Base 层新增集中式 Prompt 模版管理 Catalog 与稳定 ID 注册机制；
- `ChatService.updateSessionTitle` — 支持手动修改会话标题与首条消息自动提取生成；
- `OrchestrationExecutionService` & `JSONNodeService` — 优化 Agent 复用、思考过程透传与 DAG 节点映射；
- `WriterAgentService` — 修复结果映射与格式化流程。

**影响的端点**：
- `POST /api/chat/session/title` — 修改会话标题端点；
- `POST /api/chat/stream` — 增强 SSE 事件与 Thinking 思考过程流；
- `GET /api/chat/thinking` — 获取思考过程与 DAG 数据；
- `POST /api/config/update` — 配置更新路由及属性归属。

**可能存在的问题/风险点**：
- 高并发复杂任务场景下，多 Agent 级联推理耗时仍受 LLM 响应速度影响，已提高默认 DAG 超时配置进行防护。
