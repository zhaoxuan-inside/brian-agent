## [2026-09-12] 全量 ID 规范化为 UUID + 移除代码种子播种 + 任务特质 Soul 匹配与 AgentDef 资产同步修复

**变更原因**：
1. 系统中存在 `builtin.*` / `strategy_selector_prompt` 等非规范字符串 ID，未遵守「所有 ID 均为标准 UUID 格式」规范；
2. 启动时通过 `PromptCatalogAccess.seed()` 强制向 `prompt_template` 表播种代码内置模板，违反「配置与模板由 PromptProvider/DB 统一管理，快照与恢复由专门模块负责」的设计原则；
3. `AgentDefService.insertDefFromAgent` 在将 `AgentBuilder` 构建的 `agent` 写入 `runtime_agent_def` 时将 `soul_id`、`prompt_template_id`、`tools_json`、`model_id` 写入空串，导致运行时快照丢失 Soul 与工具注入；
4. 当现有 Soul 库中仅有特定类型（如仅编码助手）时，数学推导、文字创作等不同任务类型未能自动生成与匹配差异化特质的专属 Soul。

**修改的方法**：
- `Base/PromptsProvider/infrastructure/PromptsSchemaInitializer.ts` — 新增存量非 UUID 模板迁移为标准 UUID 的能力，并级联更新各引用表；
- `Base/PromptsProvider/access/PromptsAccess.ts` — `initialize()` 移除 `catalog.seed()` 硬编码播种；
- `Core/SoulCoreProvider/application/SoulCoreService.ts` — `matchSoul` 在无合适可用 Soul（均未达采纳阈值）或库为空时，自动调用 `generateAndAddSoul` 为任务领域（数学、写作、代码等）生成具备专属特质的角色设定并赋予 UUID 存入 `soul` 表；移除硬编码 `PROMPT_IDS`，按标题动态从 DB 查询模板 UUID；
- `Agent/AgentBuilder/application/AgentBuilderService.ts` & `AgentLibraryService.ts` & `AgentExecutionService.ts` & `WriterAgentService.ts` & `PlannerAgentService.ts` & `EvolutorAgentService.ts` & `IntentAgentService.ts` & `SummaryAgentService.ts` — 移除对 `PROMPT_IDS` 的依赖，统一使用 PromptsAccess / DB 动态模板查找；
- `Runtime/Agents/application/AgentDefService.ts` — 
  - `insertDefFromAgent`：从 `agent` 资产中同步读取 `soul_id`、`prompt_template_id`、`skill_ids / mcp_ids`，持久化到 `runtime_agent_def` 表的对应字段；
  - `soAgentSnapshot`：读取 `def.soul_id`（兜底回退 `agent` 绑定）并加载 Soul 内容，上报真实模板 UUID；
  - `prepareSystemPrompt`：在 Brian 统一身份骨架下将针对任务特质的专属 Soul 注入到 `{{soul}}` 中。
- `Runtime/test/RuntimeGateway.test.ts` — 新增「Soul 注入：当构建出的 Agent 绑定了 Soul 时，Soul 正确同步到 def 并注入到 system prompt 中」测试用例。

**影响的端点**：
- `POST /api/chat/stream` — 问答会话中的 Soul 注入与工具数正确生效并展示，不同任务类型具备差异化特质的 Soul。
- `GET /api/chat/thinking` — 思考过程中的模板 ID、Soul 注入、工具数准确上报并展示真实数据。

## [2026-09-12] 恢复评估 Agent 与写作 Agent 至主链路（完整五阶段闭环）

**变更原因**：用户反馈主链路缺少「评估本次输出质量」与「以最佳形式展示（Markdown 层次排版、Mermaid 流程图）」的完整能力。在 V2 直连执行完成后，重新接入 EvolutorAgent 对 Worker Agent 的输出进行质量打分，并接入 WriterAgent 对最终结果进行 Markdown/Mermaid 结构化美化与排版。

**修改的方法**：
  - `Base/shared/base/BusinessEvent.ts` — 新增 `WriterCompleted = 'writer.completed'` 业务事件。
  - `Base/PromptCatalog/catalog.ts` — 升级 `PROMPT_IDS.writer` 模板：明确支持 Markdown 层级结构与 Mermaid 流程图（````mermaid ... ````）排版。
  - `Runtime/Loop/domain/types.ts` & `AgentLoopService.ts` — `ExecAgentLoopInput` 新增 `defer_final_reply`，在注入 Writer 时由 Loop 延迟发送最终 `reply.delta` 和 `run.finished`。
  - `Runtime/Runs/application/RunGatewayService.ts` & `RunGatewayAccess.ts` — 新增 `OutputEvaluator` 与 `OutputWriter` 鸭子接口注入：
    - 执行 Worker Loop 得到粗糙结果；
    - 阶段四（评估）：调用 `EvolutorAgent.evalWorkAgent` 评估本次输出（正确性/完整性/效率/相关性打分并发布 `evaluation.completed`）；
    - 阶段五（写作）：调用 `WriterAgent.execWrite` 生成 Markdown 与 Mermaid 流程图，发布 `writer.completed`，发送最终 `reply.delta`，并同步更新消息库；
    - Gateway 统筹发布 `run.finished`。
  - `brian-backend/dev-server.ts` — 为 `runtimeGateway` 注入 `evolutorAgent` 和 `writerAgent`，在时间线重建中新增 `writer.completed` 节点支持。
  - `brian-frontend/src/composables/sseEventTypes.ts` & `ThinkingModal.vue` — 登记 `writer.completed` 事件展示样式与图标。
  - `Runtime/test/RuntimeGateway.test.ts` — 新增「完整五阶段链路：评估 Agent 打分 + 写作 Agent 美化排版后输出最终 reply.delta」单元测试，42 项测试全绿。

**影响的端点**：
  - `POST /api/chat/stream` — 问答回复经过 Evolutor 评估与 Writer 排版后流式输出，流程图自动以 Mermaid 代码块呈现。
  - `GET /api/chat/thinking` — 思考过程时间线清晰呈现：`需求确认 → 选择 Agent → 组件装配 → 执行 Agent → 评估 Agent → 写作 Agent` 完整闭环。

**可能存在的问题**：
  - 写作 Agent 针对简单文本问答仅做轻量 Markdown 格式化，有流程图/时序/步骤时自动生成 Mermaid 流程图；
  - 写作 Agent 若遇异常，降级直发原始输出，不影响用户正常使用。

## [2026-09-12] 思考过程时间线：全节点详情 + 选择/装配顺序修复 + 轨迹真实性澄清

**变更原因**：某次问答（interact `369b27f9-…`）的「思考过程」时间线大部分环节无详情、只有「上下文构建 / 深度思考」两步可点开，且「选定模型 / 选定提示词」出现在「选中 Agent」之前、组件清单显空，让用户误以为时间线是假数据。排查确认：时间线逐一来自 `stream_event` 真实事件；问题根源是——① `agent.selected` 在 `soSnapshot`（LLM/提示词选定）之后才上报，顺序颠倒；② 意图/选择/组件/模型等过程事件未生成结构化详情；③ 该次为「LLM 命中复用」的 CoT 直问解答（无 ReACT、无 Planner/评估/写作 Agent），复用 def 的 soul/prompt/model/tools 均为空，故组件显空。

**修改的方法**：
  - `Runtime/Runs/application/RunGatewayService.ts` — `executeRun` 将 `agent.selected` 上报提前到 `soSnapshot` 之前（用 `matchOut.def.name`），使事件顺序符合「需求确认→选择 Agent→组件写作（LLM/Soul/Prompt/Skill/MCP）→开始执行」。
  - `brian-backend/dev-server.ts` — `buildThinkingBlocksFromRuntime`：新增 `nodes`（运行节点结构化明细，`pushNode` 生成 `node-{seq}` 锚点）；时间线各过程事件补 `target` 与丰富 `detail`（意图分析含得分/采纳/候选数/命中 Agent/理由，组件装配含 Soul/Prompt/LLM/Skill/MCP 逐一标注（缺省显「（无）/（默认）」），选定模型/提示词含模板与工具数）；`trace` 新增 `nodes`，`trace.run` 组件名去 `w2-` 前缀。
  - `brian-frontend/src/api/types.ts` — 新增 `ThinkingNodeTrace`，`ThinkingTrace` 新增 `nodes`。
  - `brian-frontend/src/components/chat/ThinkingModal.vue` — 「执行内容」新增「运行节点」分组；时间线节点标题区分「开始思考（Agent 推理）」「开始组织回复（Agent 输出）」；思考/回复 summary 节点补 Agent 名说明（同一 Agent 两阶段）。
  - `brian-frontend/src/utils/format.ts` / `ThinkingBlock.vue` / `AgentDagFlow.vue` — 耗时秒级（`formatDuration`），见上一条变更。

**影响的端点**：
  - `GET /api/chat/thinking` — `trace.nodes` 新增结构化过程节点明细（纯增量字段）；新 run 事件顺序修正（历史 run 数据顺序不变，仅展示侧补详情）。
  - 思考过程弹窗 — 时间线每个节点均可点开查看结构化详情，思考/回复两阶段标注清晰。

**可能存在的问题**：
  - 历史 run 的 `agent.selected` 仍位于 LLM/提示词选定之后（数据已定序，仅新 run 修正）；展示侧不改写历史顺序，以免再造“假数据”。
  - 复用空组件 def 时组件装配显「无 Soul/Prompt/LLM/Skill/MCP 显式绑定」，反映真实空绑定而非造假。
  - 该次无 Planner/评估/写作 Agent（直答 CoT），故时间线无这些阶段——属真实执行路径（LLM 命中复用、无 ReACT 工具）。

## [2026-09-12] 思考过程弹窗优化：执行内容扁平化 + 耗时秒级 + Agent 构建组件可点击 + 每轮输入输出

**变更原因**：①执行内容三个子块（工具调用/授权记录/深度思考）各套独立卡片容器，形成三层卡片嵌套，视觉层级过深；②耗时以毫秒展示，与真实执行尺度（秒级）不符；③Agent 卡片仅平铺展示 soul/skill/mcp 名称文本，无法查看组件详情，且缺少 Prompt 组件；④CoT/ReACT 思考步骤缺少每轮的输入与输出内容。

**修改的方法**：
  - `brian-frontend/src/utils/format.ts` — 新增 `formatDuration`（耗时统一秒级：`0.85s` / `3.2s` / `1m20s`）。
  - `brian-frontend/src/components/chat/ThinkingModal.vue` — 执行内容段去嵌套：工具调用/授权记录/深度思考由独立卡片改为分组标题行 + 下方卡片列表；工具耗时改 `formatDuration`。
  - `brian-frontend/src/components/blocks/ThinkingBlock.vue` — 新增构建组件胶囊（Prompt/Soul/LLM/Skill/MCP，点击弹出 `ComponentInfoModal`）；思考步骤展示每轮「本轮输入/本轮输出」；Agent 与步骤耗时改秒级。
  - `brian-frontend/src/components/chat/ComponentInfoModal.vue`（新增）— 组件详情弹窗：按 kind 从 `/api/prompts`、`/api/config/soul`、`/api/config/model`、`/api/skill`、`/api/config/mcp` 拉取，展示友好字段 + 原始 JSON。
  - `brian-frontend/src/components/chat/AgentDagFlow.vue` — 节点耗时改秒级。
  - `brian-backend/dev-server.ts` — `agentInfo` 新增 `promptId`（Runtime 直连取 `agent.components.prompt_template_id`，编排历史取首个 `prompt_ref.template_id`）；steps 新增 `input/output`（Runtime 直连按 `runtime_message` user→assistant 轮次配对，编排历史按迭代 `think/reflect.prompt/raw_response`、`act.result` 还原）。
  - `brian-frontend/src/api/types.ts` — `ThinkingStep` 新增 `input/output`，`ThinkingBlock.agentInfo` 新增 `promptId`。
  - `brian-frontend/test/formatDuration.test.ts`（新增）— 秒级格式化单测。

**影响的端点**：
  - `GET /api/chat/thinking` — 思考块新增 `agentInfo.promptId` 与步骤 `input/output`（纯增量字段，老数据缺失时前端不展示对应区块）。

**可能存在的问题**：
  - 编排历史路径的 ACT 步骤 input 取当轮 `think.prompt`（决策该动作的 prompt），无 think 时缺失；output 取工具结果（与 toolCalls.result 一致）。
  - Runtime 直连路径的每轮 output 取 assistant 消息文本内容（非逐轮 raw_response），含工具轮无文本时为 `''` 不展示。
  - 历史数据无 promptId 时「构建组件」区仅展示现有字段。

## [2026-09-12] 思考过程弹窗：执行内容扁平化 + 耗时秒级 + Agent 构建组件可点击 + CoT/ReACT 每轮输入输出

**变更原因**：执行内容三段（工具调用/授权记录/深度思考）各套独立卡片容器再叠卡片，三层嵌套视觉过重；耗时以毫秒展示不符合"秒级"直觉；Agent 卡片仅平铺组件 ID 不可点击，无法查看组件详情；思考步骤只展示推理/工具调用，未展示每轮（iteration）的输入与输出。

**修改的方法**：
  - `brian-frontend/src/utils/format.ts` — 新增 `formatDuration(ms)`：统一秒级展示（`0.85s` / `3.2s` / `1m20s`），不再输出毫秒。
  - `brian-frontend/src/components/chat/ThinkingModal.vue` — 「执行内容」扁平化：三个子块由独立嵌套卡片改为分组标题行 + 下方卡片列表（去掉一层卡片嵌套）；工具卡片耗时改用 `formatDuration`。
  - `brian-frontend/src/components/blocks/ThinkingBlock.vue` — Agent 头部耗时/步骤耗时改用 `formatDuration`；组件区（Prompt/Soul/LLM/Skill/MCP）改为可点击胶囊，点击弹出 `ComponentInfoModal`；思考步骤 Tab 新增「本轮输入 / 本轮输出」展示。
  - `brian-frontend/src/components/chat/ComponentInfoModal.vue`（新增）— 组件详情弹窗：按 kind 拉取（`/api/prompts`、`/api/config/soul`、`/api/config/model`、`/api/skill`、`/api/config/mcp`）并展示友好字段 + 原始 JSON，未命中时展示原始引用。
  - `brian-frontend/src/components/chat/AgentDagFlow.vue` — 节点耗时展示改用 `formatDuration`（秒级）。
  - `brian-backend/dev-server.ts` — `buildThinkingBlocksFromRuntime`：steps 按 `runtime_message` 轮次配对补 `input`（该轮前最近的 user 消息）/ `output`（assistant 消息内容或工具结果）；`agentInfo` 新增 `promptId`（`components.prompt_template_id`）。编排历史重建路径：steps 按迭代补 `input`/`output`（`think.prompt/raw_response`、`reflect.prompt/raw_response`），`agentInfo` 新增 `promptId`（`firstPromptRef.template_id`）。
  - `brian-frontend/src/api/types.ts` — `ThinkingStep` 新增 `input`/`output`；`ThinkingBlock.agentInfo` 新增 `promptId`。
  - `brian-frontend/test/formatDuration.test.ts`（新增）— `formatDuration` 秒级展示单元测试（空值/亚秒/秒/分钟）。

**影响的端点**：
  - `GET /api/chat/thinking` — blocks.steps 携带 `input`/`output`、agentInfo 携带 `promptId`（纯增量字段，老数据缺失时前端自动隐藏）；耗时展示全面切秒级。
  - 思考过程弹窗（实时流式与历史回放）— 执行内容嵌套层级减少、Agent 构建组件可点击查看详情、思考步骤逐轮展示输入输出。

**可能存在的问题**：
  - 老历史 trace 无迭代 `prompt/raw_response` 时步骤无 input/output（隐藏，不报错）；`promptId` 缺失时 Prompt 胶囊不显示。
  - `ComponentInfoModal` 依赖 `configApi`/`skillApi` 接口，某类组件接口异常时该 kind 弹窗展示错误文案，不影响其他组件查看。

## [2026-09-12] 运行概览输入Token缺失修复 + Agent名清理 + llm_call_log schema修复

**变更原因**：运行概览Token显示输入恒为 0（llm_call_log 表缺 `updated` 列，newRecord() 每次插入静默失败，明细账恒空）；且运行概览/深度思考头部展示了内部运行时 Agent 名（w2-xxx-8位hex 后缀）。

**修改的方法**：
  - `Base/LLMProvider/infrastructure/LLMSchemaInitializer.ts` — llm_call_log 建表补充 `updated` 列 + 存量库 ALTER TABLE 迁移（newRecord 恒补 id/created/updated 三列）。
  - `brian-backend/dev-server.ts` — `buildThinkingBlocksFromRuntime` 明细账为空时输入侧按 prompt 字符数/4 预估（不再恒记 0，system 提示词与 wire 消息合计）；agentName 去掉 `w2-` 前缀与 8 位 hex 随机后缀，展示人类可读名称。
  - `brian-frontend/src/components/chat/ThinkingModal.vue` — 运行概览卡片移除内部 Agent 名行（整体问答不展示单个 Agent 内部运行时名称）。

**影响的端点**：
  - `GET /api/chat/thinking` — trace.run/block 的 agentName 与 inputTokens 显示更合理；老数据（无明细账）输入 Token 为预估值。

**可能存在的问题**：
  - 输入 Token 预估为字符数/4 近似值，非提供商真实值；提供商返回真实 usage 的明细账写入后（schema 已修）自动恢复真实值。
  - 运行概览不再显示 Agent 名，Agent 名仅在"深度思考"块头部展示。

## [2026-09-12] 思考过程弹窗四段式重组（运行概览 → 基础上下文 → 执行时间线 → 执行内容）

**变更原因**：思考过程弹窗信息层次混乱：上下文/工具/授权/深度思考平铺并列，无"概览-上下文-时序-明细"的主次结构；执行时间线节点与执行明细割裂，无法从时间线直接定位某项工作的详细内容。

**修改的方法**：
  - `brian-backend/dev-server.ts` — 执行时间线节点新增 `target` 跳转锚点：tool.started/result→`tool-{part_id}`（无 part_id 用顺序 `tool-idx-N`）、permission.asked/answered→`perm-{permission_id}`、think/reply 相关→`agent-0`、context.built→`ctx-{round}`；trace.tools/permissions/contextRounds 同步补 `targetKey` 对应锚点。
  - `brian-frontend/src/components/chat/ThinkingModal.vue` — 重排为四段：①运行概览 ②基础上下文（`ThinkingContext` 组件聚合 context 字段 + 每轮上下文轮次，原底部"上下文"区块并入，含上下文轮次卡片锚点）③执行时间线（节点可点击，`scrollToAnchor` smooth 滚动 + `thinking-jump-flash` 短暂高亮）④执行内容（工具调用/授权记录/深度思考三个可折叠子块合入，卡片带 `data-anchor` 供时间线跳转）；live 模式实时时间线/工具/授权归约同步生成对应 `target`/`targetKey`。
  - `brian-frontend/src/api/types.ts` — `ThinkingTimelineItem` 新增 `target`、`ThinkingToolTrace`/`ThinkingPermissionTrace`/`ThinkingContextRound` 新增 `targetKey`。
**影响的端点**：
  - `GET /api/chat/thinking` — 时间线节点与 trace 明细携带 `target`/`targetKey`（纯增量字段，老数据缺失时前端降级为不可点击）。
**可能存在的问题**：
  - 老历史数据无 target/targetKey 时对应节点不可点击（不跳转），不报错。
  - 授权记录无 permission_id 时按 `perm-idx-{toolId}-{askedAt}` 定位，事件侧兜底行可正常关联。

## [2026-09-12] 运行概览Token拆分 + LLMProvider明细账分级统计

**变更原因**：运行概览定位为全流程耗时/输入输出Token/工具次数/授权次数，但 Token 为单值（实为输出和）；llm_usage 仅按模型×天聚合，无法归因到会话/交互/问答；流式 usage 缺失时按 len/4 预测，违反真实值要求。

**修改的方法**：
  - `Base/LLMProvider/domain/types.ts` — ExecLLM/Events/Embed 入参新增 `session_id/interact_id/work_id`；新增 `LLMCallLogRecord`、`SoTokenUsageInput/Output`、`LLM_CALL_LOG_TABLE`。
  - `Base/LLMProvider/infrastructure/LLMSchemaInitializer.ts` — 新建 `llm_call_log`表明细账 + 三维度索引。
  - `Base/LLMProvider/application/LLMService.ts` — 新增 `logCall`（成功调用记一条真实值，best-effort）+ `soTokenUsage`（分级求和）；`executeEventsSingle/executeSingleLLM/embedLLM` 均记明细账。
  - `Base/LLMProvider/application/llmevents/LLMEventsParser.ts` — `buildUsage` 缺 usage 记 0/0，去掉 len/4 预测。
  - `Base/LLMProvider/access/LLMAccess.ts` — 暴露 `soTokenUsage`。
  - `Runtime/Loop/domain/types.ts` + `application/AgentLoopService.ts` — `ExecAgentLoopInput/interact_id`，Loop 上下文透传，`prepareLLMTurnInput` 设 `session_id/interact_id/work_id`。
  - `Runtime/Runs/application/RunGatewayService.ts` — `prepareLoopInput` 透传 `interact_id`。
  - `brian-backend/dev-server.ts` — `buildThinkingBlocksFromRuntime` 按 `work_id=runId` 查明细账得 `inputTokens/outputTokens`，空账回退 `runtime_message` 求和；`trace.run/block` 新增拆分字段；新增 `GET /api/llm/token-usage`。
  - `brian-frontend/src/api/types.ts` + `components/chat/ThinkingModal.vue` + `api/index.ts` — 运行概览 `Token 输入/输出`拆分展示 + `monitorApi.tokenUsage` 封装。
**影响的端点**：
  - `GET /api/chat/thinking` — `run` 新增 `inputTokens/outputTokens`（`tokenUsage` 保留兼容）。
  - `GET /api/llm/token-usage?session_id=&interact_id=&work_id=` — 新增，分级统计真实值。
**可能存在的问题**：
  - 历史 run 无明细账，回退值为输出侧合计，输入记 0。
  - 提供商不返 usage 的流式调用记 0/0（诚实零值）。

## [2026-09-12] 工具盒改圆球 + 流式 Markdown 渲染

**变更原因**：①工具执行长条卡纵向占位大；②流式过程中 Markdown 从不渲染（TextBlock 恒纯文本；MessageCard 被全局 `isStreaming` 误伤，之前问答的排版在本轮结束前全部退化为纯文本）。

**修改的方法**：
  - `brian-frontend/src/components/blocks/ToolCallBlock.vue` — 改版为状态圆球 + 点击展开：36px 圆球（执行中旋转/完成绿/失败红 + 状态点，悬停提示工具名与状态）；详情面板参数 JSON 缩进、响应按类型渲染（对象/JSON 串 → JSON 缩进块，其余 → Markdown）。
  - `brian-frontend/src/utils/markdown.ts` — 新增 `createThrottledMarkdownRenderer(throttleMs)`：非流式立即全量，流式最多每 300ms 解析一次，实例级缓存隔离。
  - `brian-frontend/src/components/blocks/TextBlock.vue` — 正文改 Markdown 渲染（流式节流，结束全量对齐）；标题分支不变。
  - `brian-frontend/src/components/chat/ChatArea.vue` — MessageCard `:is-streaming` 恒传 `false`（流式文本载体是临时 Block，卡片内从不逐字更新）。
  - 单测：`test/throttledMarkdown.test.ts` 新增 5 用例（立即渲染/窗口节流/缓存命中/结束对齐/实例隔离）。

**影响的端点**：纯前端展示变更，无后端接口变化；对话区流式文本与工具展示行为如上。

**可能存在的问题**：
  - 流中未闭合 fence 按 marked 容错渲染，形态短暂不规整，结束后自动对齐。
  - 超长回答流式解析每 300ms 一次，主线程仍有毫秒级开销——如卡顿可继续调大阈值。

**验收**：`vue-tsc` 全绿；前端 unit 11 过；eslint 0 错误（ChatArea 4 warning 为预存）。

## [2026-09-12] 对话区四问修复（Block 对齐 + 工具盒回填 + 中间文本进思考过程 + 永久批准）

**变更原因**：问答复盘（会话 `cdfb00ba`）：①助手流式文本出现在用户消息位置；②Tool 执行过程框空且过长；③"好的，我来帮你查一下…""页面还没加载完…"等中间过程进了对话框；④工具授权缺"永久批准"，安全命令重复确认。

**修改的方法**：
  - `brian-frontend/src/components/chat/ChatArea.vue` — Block 按 `role` 对齐：仅 `user` 靠左，其余（assistant/tool/system）靠右（原仅 ToolInvocation 靠右，TextParagraph 流式文本落在用户侧）。
  - `brian-frontend/src/composables/chatStreamEvents.ts` — 新增 `normalizeToolPayload`：后端 `{part_id, tool_id, input}`（input 多为 JSON 串）归一化；块 id 按 `part_id` 关联（started/launch/result 同一块更新）；`onToolResult` 回填 result 并收敛 done/error（原仅回填思考块）；新增 `onPermissionAnswered`（自动放行时卡片翻态，不悬挂 pending）。
  - `brian-frontend/src/components/blocks/ToolCallBlock.vue` — 折叠态加状态文案与结果摘要单行预览。
  - `brian-frontend/src/components/chat/PermissionConfirmCard.vue` + `useChatStream.ts` + `api/index.ts` — 新增"始终允许"按钮，`answerPermission(..., remember)` 透传。
  - `Runtime/Loop/application/AgentLoopService.ts` — 转轮文本分流：轮中 50ms 合帧文本保守进 `think.delta`；轮末残留刷向 think，最终轮再把全文（`turn.text`）发一条 `reply.delta`；失败轮残留同样进 thinking。`askPermission` 透传 `tool_id`，应答后下发 `permission.answered`（含 `auto_approved`）。
  - `Runtime/Runs/application/RunGatewayService.ts` + `domain/types.ts` — 信任工具表：内存态 + `runtime_runs_config.trusted_tools`（JSON 数组）持久化；命中直接放行；`answerPermission(remember)` 入表；`configRuns` 支持全量覆盖（撤销入口）并回显。
  - `Runtime/Loop/access/LoopAccess.ts` + `dev-server.ts` — 权限门鸭子接口透传 `tool_id`/`autoApproved`；`/api/chat/permission/answer` 透传 `remember`。
  - `Application/Chat/application/ChatService.syncRuntimeMessagesToInfoRaw` — 含 tool Part 的中间轮 assistant 消息不同步 RESPONSE（每 run 末条兜底）；`dev-server.buildThinkingBlocksFromRuntime` — 中间轮文本记 THINK 步骤。
  - 单测：`AgentLoop.test.ts` 精确断言分流（think 含中间叙述、reply 仅最终全文）+ `permission.answered` 断言；`RuntimeGateway.test.ts` 新增信任表两用例（自动放行/持久化/撤销）。

**影响的端点**：
  - `POST /api/chat/stream` — 流式事件语义变化：中间轮不再产 `reply.delta`（只 `think.delta`），最终轮末单条全文 `reply.delta`；每次权限询问必有 `permission.answered` 配对事件。
  - `GET /api/chat/history/:sessionId` — 每 run 仅一条 RESPONSE；思考块含中间叙述 THINK 步骤。
  - `POST /api/chat/permission/answer` — 新增 `remember` 字段；信任工具后续自动放行（跨会话、重启保留）。

**可能存在的问题**：
  - 最终回复改为轮末整块到达（不再逐字直播；思考中指示 + 思考弹窗直播保留进度感）——如需恢复逐字感，后续可对最终轮全文做快速分块重发。
  - 信任粒度为整工具（不含参数）；撤销暂只能走 `configRuns`（无管理页入口）。
  - 存量历史中的中间轮 RESPONSE 行不会被回扫清理（仅新 run 生效）。

**验收**：runtime 41 / application 476 / 前端 unit 全过；runtime+application `tsc --noEmit` 全绿；根 tsconfig 仅剩 2 处预存 `trace_id` 报错（与本次 diff 零交集）；eslint 无错误；Runtime dist 已重建（dev-server 引 dist）。

## [2026-09-11] trace_id 收敛为维护字段（唯一存放点 = Metrics）+ console.log 出清

**变更原因**：规范确立——Context / Input / Output 均为业务承载对象，trace_id 是链路追踪维护字段，唯一存放点应为 Metrics（或 Report 事件关联），不得散落 Context/Input；调试日志一律走 Metrics→LogProvider 网关，不得直用 console.log。

**修改的方法**：
  - `Base/shared/base/Input.ts` / `Context.ts` — 基类删除 `trace_id`；领域 Input 上的业务同名键（如 `GetTraceInput.trace_id` 查询字段）不受限。
  - `Base/shared/aop/AopProxy.ts` — trace_id 生成/回填重写：来源 = Metrics.trace_id（显式传播）→ IdGenerator 新生成；仅回填 Metrics 与 Report，不再写 Context；`pickTraceId`（旧式兜底错误日志）改为 Metrics 优先、领域 Input 兜底。
  - `Base/LogProvider/interceptor/LogInterceptor.ts` — 错误日志 trace_id 提取顺序：metrics 优先 → 领域 input 字段兜底。
  - `Application/Chat/application/ChatService.openChatStreamV2` — `context.trace_id` 读写改为 `metrics.trace_id`（无 metrics 时本地生成并回填到其 metrics 实例）。
  - `Base/components/SQLite/SQLiteComponent.ts` — verbose 输出不再直用 console，改为 `verbose_logger` 注入通道（未注入时不输出）。
  - `docs/_1_DevStandards/DevStandards.md` — §7 日志规范新增第 5 条：trace_id 属维护字段，唯一承载点 = Metrics；console.log 禁用原则重申。

**影响的端点**：全链路无对外行为变化；log_record.trace_id 采集来源由 Input/Context 改为 Metrics（AOP 自动回填保证语义不变）。

**可能存在的问题**：旧式 3 参调用（无 Metrics）若 Input 无领域级 trace_id 字段，错误日志将缺 trace_id——经查运行时核心链路均已 5 参化，影响面为空。

**验收**：typecheck 5 workspace 全绿；base 807 / core 192 / runtime 39 / agent 121 / application 476 全过；eslint 无错误；残留 console 仅 3 处合法场景（ConsoleLogger 兜底 / dev-server 退出前 Fatal / 沙箱内 no-op 注入）。

## [2026-09-11] 错误 Agent 立即杀死（与正确 Agent 自然凋亡分离；复盘：session 2e871085 无删除发起）

**变更原因**：复盘发现解散机制（evalWorkAgent → disbandBadAgent）对错误 run 从未触达——Runtime v2 生态圈（RunGateway→AgentLoop）不写 agent_usage（usage 最新记录停留在 2026-08-31，v2 上线后评估闭环断粮），错误产物（tool.result error）也无通道进入评估输入；错误 Agent 若不立即处置，同类任务仍命中同一 def 持续报错（实测会话 2e871085 连续 skill_exec/mcp_exec 两次猜 id 报错）。确立原则：正确 Agent 走评估衰减/老化自然凋亡；错误 Agent 执行即杀死。

**修改的方法**：
  - `Runtime/Agents/domain/types.ts` — 新增 `KillErroredAgentInput/Output`。
  - `Runtime/Agents/application/AgentDefService` — 新增 `killErroredAgent`：1) 错误 usage 落账（usage_context 带 run_error:true/error 摘要，评估闭环可回溯）；2) disable 全部 runtime_agent_def（agent_ref 对齐）并失效 active def 缓存 → 下一轮匹配立即不再命中；3) system 归属 → `delAgent` 硬删除（连带 usage/skill_usage/agent_llm 清理）；user 归属 → 仅软禁用（delAgent 内守卫拒绝越权）；4) 上报 `agent.disbanded`（reason=run_error）。
  - `Runtime/Agents/access/AgentDefAccess` — `killErroredAgent` 代理。
  - `Runtime/Runs/application/RunGatewayService.executeRun` — stop_reason=error（loop 报错或异常收敛两条路径）结算后**立即触发杀死**（fire-and-forget 内联 await，失败不阻断 run 结算）；`settleRun` 补充 agent_ref/错误信息参数并上报 error.occurred（agent_id 关联）。

**影响的端点**：
  - `POST /api/chat/stream` — run error 结算即：该 Agent def 立即失效，同任务下一轮重新走三层匹配（低配重建或 L4 构建）；不再出现"同一错误 Agent 反复被选中反复报错"。
  - 评估闭环（SelfLearning runEvalOnce）— 错误 usage（run_error=true）进入 agent_usage，可回溯评估。

**可能存在的问题**：
  - 瞬时故障（LLM 单次断流/超时）也会触发杀死——按"错误立即杀死"语义执行，重建成本可接受（构建器会对同类任务重新构建）；如需容错可后续加"连错 N 次才杀"的阈值。
  - 测试库 agent 表无 created_by 列时归属判定回退 user（仅软禁用），生产库含该列。

**验收**：runtime 39（新增错误立即杀死用例）/ agent 121 / application 476 全过；tsc+eslint 全绿；e2e 用例断言 def 行状态 active→disabled + agent.disbanded 事件投影。

## [2026-09-11] 选/执分离：组件选择收敛到 match 阶段，执行门按绑定清单放行（复盘 session 2e871085）

**变更原因**：复盘会话 2e871085-7d5c-49b3-9416-aac3e56b76a4（"今天应该穿什么衣服"）——skill/mcp.selected 均为空、agent.components 绑定为空，但 LLM 仍看到常驻工具 `skill_exec`/`mcp_exec` 且 system 没有可用 id 清单，只能凭语义猜 id（`skill_exec{"skill_id":"weather"}` → "Skill 不存在: weather"，MCP 同样失败），浪费两轮工具调用并降级为反问。根因：组件选择与组件执行未分离（工具可见性与绑定脱钩、执行不校验 id 来源）。

**修改的方法**：
  - `Runtime/Tools/domain/types.ts` — 新增 `ComponentScope`（skills/mcps id 清单）；`ToolExecutionContext` / `ExecToolInput` 增加 `component_scope`（执行门依据）。
  - `Runtime/Loop/domain/types.ts` — `ExecAgentLoopInput` 增加 `component_scope`。
  - `Runtime/Runs/application/RunGatewayService.prepareLoopInput` — 按快照绑定组装 Loop 工具清单：`skill_exec` 仅在 ≥1 skill 绑定时注入、`mcp_exec` 仅在 ≥1 MCP 绑定时注入（显式清单含 cdt_browser/update_plan/delegate 通用原语）；同时携带 `component_scope`。
  - `Runtime/Loop/application/AgentLoopService` — `component_scope` 贯穿 LoopRunContext → execLoopTool → ExecToolInput。
  - `Runtime/Tools/application/ToolService.prepareToolContext` — `component_scope` 透传到 ToolExecutionContext。
  - `Runtime/Tools/application/builtinTools.ts` — `skill_exec` / `mcp_exec` 执行门：无 component_scope（Agent 未绑定任何组件）→ 拒执行；id 不在绑定清单内 → 拒执行并回示可用 id 清单（"Skill 不在本运行的组件绑定范围内。可用 Skill id：…"）。

**影响的端点**：
  - `POST /api/chat/stream` — 未绑定 Skill/MCP 的 Agent 不再看到 skill_exec/mcp_exec（消除"猜 id"路径）；越权 id 调用在执行门处被拒，错误文案可回流模型改写。
  - 权限门之前完成校验（越权 id 不再触发 permission.asked 弹窗，减少用户侧无谓审批）。

**可能存在的问题**：
  - 显式 `tools_json` 绑定的 id 若已被删除，执行门仍会拒执行（提示可能为空清单）——与 `AgentKit.validateAgentSkills`（配置期校验）互补，形成双保险。
  - Skill/MCP/Soul/Prompt 的"按需创建（demand-provision）"（Provider 建组件→返回 id→建立 agent 绑定关系）为后续增强，本变更只做"绑定约束执行"。

**验收**：runtime 38 / agent 121 / application 476 全过；tsc --noEmit 与 eslint 全绿。

## [2026-09-11] Soul/Skill/MCP match 结果内存缓存 + MCP 排序 max_tokens（复盘：interact 9b68defe / 4f69b46b）

**变更原因**：同 (agent, 任务) 的组件排序每轮重复全量 LLM（实测变异 2.6s→9.3s→32.9s，provider 对 max_tokens 不约束其深度思考输出），用户复现"新会话同一问题 65s 无回复"（run f8410358：accept→消息落库间隔 56.3s = Soul 排序 32.9s + Skill 排序 23.2s 两级串行）。耗时不随用户问题难度，而随排序模型发挥。

**修改的方法**：
  - `Core/SoulCoreProvider/SoulCoreService.matchSoul`、`Core/SkillCoreProvider/SkillCoreService.matchSkill`、`Core/MCPCoreProvider/MCPCoreService.matchMCP` — 进程内存匹配缓存：键 `agent_id|任务前缀(128字)`，TTL 10 分钟，容量 500（FIFO）；`config*Core` 配置变更即清缓存；MatchSkillInput/MatchMcpInput 新增 `task_content?`（AgentDefService snapshot 透传）。
  - `MCPCoreService.rankMcpsWithLLM` — 排序新增 `max_tokens: 300`。
  - 复述:`matchSkill` 排序 prompt 已摘要化（只带 name/skill_brief，先元数据后按需 enrich 全文 —— 渐进式加载语义）。

**影响的端点**：
  - `POST /api/chat/stream` — 同 (agent, 同任务) 复现：预匹配 LLM 由 2 次串行（最坏 56s）→ 0 次；端到端 52s → 5.2s（首问仍需 1 次排序入缓存，30.2s，受模型深度思考影响）。

**可能存在的问题**：
  - 任务内容前缀 key 对"同义改写"不命中（仍走 LLM 排序一次）；深度思考 provider 对 max_tokens 约束不生效的尾部延迟仍在（仅新任务首问受影响）。

## [2026-09-11] 参数全量入配置中心（消除硬编码业务参数）

**变更原因**：用户要求"几乎所有的参数都应该在配置中心可以看到和配置"，清理系统内仍有硬编码的 Marshalling 业务参数。

**修改的方法**：
  - `Base/LLMProvider` — `exec_timeout_ms`（默认 120000）与 `embed_timeout_ms`（默认 15000）改为 `llm_config` 表读取（initialize 时载入），`LLMService` 取消两处写死常量的直接使用。
  - `Runtime/Runs` — 权限等待超时改为 `runtime_runs_config.permission_wait_timeout_ms`（默认 120000），`configRuns` 可读写；`waitPermission` 超时由配置驱动（回退 120000）。
  - `Runtime/Agents` — Agent 匹配 LLM 打分采纳阈值改读 `agent_library_config.match_score_threshold`（默认 70），删除 `LLM_SCORE_THRESHOLD` 直取常量。
  - `Agent/AgentLibrary` — `match_score_threshold` 加入 `AgentLibraryConfigRecord` / Config 输入输出；config 表 ALTER 迁移；老测试库容错降级重插。
  - `Agent/EvolutorAgent` — 新增 `evolutor_agent_config.critical_disband_score`（默认 30），解散判定读该配置，老表容错降级重插。
  - `Core` 四模块 — `VectorMatchCache.configure()` 支持 capacity / similarityThreshold / ttlMs 动态调整；soul/skill/mvp 三核现在的 `match_cache_ttl_ms`(600000) / `match_cache_capacity`(500) 与 `vector_similarity_threshold` 均进配置中心（Application/Config/configRegistrations 注册）。
  - `Application/Config/configRegistrations.ts` — 新增 12 项注册：4 项 LLM 超时与启用、soul/skill/mcp/llm_core 的 score_threshold / vector_similarity_threshold / match_cache_ttl_ms / match_cache_capacity、agent_library 的 match_score_threshold、evolutor_agent 的 critical_disband_score。

**影响的端点**：
  - `GET /api/config/:module` — 以上 12 项均可在"配置中心"查看；Soul/Skill/MCP/Llm 采纳阈值与缓存参数改后即时生效（缓存按新参数重置）。
  - `POST /api/chat/stream` — 同参数不再依赖重启；regen 概率已由 agent_library_config.regen_rate（实测=10）控制。

**验收**：base 807 / core 192 / runtime 36 / agent 121 / application 476 全过；tsc/lint/build 全绿；E2E 对照：首问 14.5s（2 次排序 1.3s+3.8s）→ 同句复问 **4.9s**（组件匹配 0 次 LLM，仅答案回话 1 次）。

## [2026-09-11] 组件匹配体系重构（统一 [{id,score}] + score_threshold + MD5/向量缓存 + 解散 + regen）

**变更原因**：复盘 interact 9b68defe / 4f69b46b —— 组件排序全量 LLM 每轮重跑且输出无界（provider 不受 max_tokens 约束的深度思考，实测 52s/2840 tokens）；skill 排序 prompt 携带全量 skill_md；match 结果无记忆；无 score 无法判定"最匹配的也不合适"。

**修改的方法**：
  - `Base` — prompt_template 表新增 `is_system` / `seed_hash` 列；`seed()` INSERT-only + 指纹刷新（用户未编辑的系统模板随代码升级，编辑过的保留）；`delPrompt`/`updatePrompt` 系统模板守卫；全部 `getBuiltinTemplate` 运行时硬编码回退删除（4 Core + AgentKit + 6 Agent/Application Service），DB 渲染失败 fail-loud；四个排序模板统一输出 `[{"id","score":百分制}]`。
  - `Core/shared` — 新增 `FifoCache`（可复用容量淘汰）、`MatchConstants`（枚举：ScoreThreshold=90 / AgentScoreThreshold=70 / VectorSimilarity=0.8 / CacheCapacity=500 / CacheTTL=10min / CreatedBy / DisbandThreshold=30）、`RankingParser`（宽容解析 + threshold 截断）、`VectorMatchCache`（MD5 精确 → cosine 相似度两级命中）。
  - `Core` 4 Service — config 表新增 `score_threshold`(90) / `vector_similarity_threshold`(0.8)，config*Core 可读写、变更清缓存；matchSoul/matchSkill/matchMCP 换 VectorMatchCache（embedding 走 nomic-embed；embed 失败降级 MD5-only；embedLLM 独立 15s 超时）；排序调用统一禁用深度思考（thinking:disabled）；matchSkill 排序仅用元数据（渐进式加载：命中后 enrichMatchedSkills 取全文）；LLMCore 无缓存（按用户决策）。
  - `Agent` — agent 表新增 `created_by`(user/system)；`delAgent` 守卫（user 资产 fail-loud）；EvolutorAgent 低分解散（overall < 30 且 system 归属 → delAgent + runtime_agent_def disabled + `agent.disbanded` 事件）；`businessEvent` 新增。
  - `Runtime` — `matchAgentDef` 命中后走 `agent_library_config.regen_rate` 随机判决，触发时 `soAgentSnapshot` `bypass_cache` 强制全量重排；`Match*Input` 新增 `task_content` / `bypass_cache`。

**影响的端点**：
  - `POST /api/chat/stream` — 思考禁用后排序回归 1~8s 级；同 (agent, 任务) 第二次问 → MD5 缓存命中零排序 LLM；embedding 服务（127.0.0.1:8080 LLamaCPP）当前 502 不可达期间命中链路 15s 快速失败降级，请优先修复 embedding 服务以恢复全速。
  - `POST /api/config` — soul/skill/mcp/llm 四核可调 `score_threshold`（默认 90）与 `vector_similarity_threshold`（默认 0.8）；`agent_library_config.regen_rate`（默认 75）控制命中后重评估概率。
  - `DELETE /api/prompts/:id` — 系统模板（is_system=1）拒绝（400）。

**验收**：base 807 / core 192 / runtime 36 / agent 121 / application 476 全过；tsc/lint/build 全绿；同句二次问答已验证缓存命中路径；首问阈值驱动 Layer-3 自生成仍需观测（score_threshold=90 严格度可在配置中心下调）。

## [2026-09-11] 权限等待 120s 超时兜底 + 启动收敛遗留 run（复盘僵尸 run b5a8b667 / c19996e8）

**变更原因**：两个 run 永久卡 `running`——权限卡（`cdt_browser` 首次执行确权）挂起后用户关闭页面，`waitPermission` Deferred 无超时无兜底；重启后内存 waiters 丢失，遗留 run 行永远无法结算。

**修改的方法**：
  - `Runtime/Runs/application/RunGatewayService.waitPermission` — 等待加 `PERMISSION_WAIT_TIMEOUT_MS=120s` 超时兜底，超时默认拒绝（approved=false），Loop 按拒绝配对流收敛结算（原实现已注释保留）。
  - 同文件 `initialize()` — 新增 `convergeOrphanRuns()`：启动时把遗留 `running/queued` 收敛为 `aborted`（stop_reason=service_restart）。
  - `Runtime/shared/types.ts` — `AbortReason` 新增 `ServiceRestart = 'service_restart'`。
- 权限卡展示语义复核：对话区展示（`dev-server.ts` /api/chat/history 将 PERMISSION 并入消息）、ChatMap 不展示（前端 `messageGraph.ts` 仅收 REQUEST/RESPONSE）——已满足，无需改动。

**影响的端点**：
  - `POST /api/chat/stream`（权限门 run）— 挂起上限 120s；`POST /api/chat/permission/answer/{id}` 超时后 answered=false。
  - 后端启动（`tsx dev-server.ts`）— 遗留 running/queued 统一 aborted（实测 count=2 落账成功）。

**验收**：runtime 36 单测 + tsc + lint 全绿；重启后 b5a8b667/c19996e8 均 aborted/service_restart，E2E 问答 13.7s 正常收尾。

## [2026-09-11] 组件匹配廉价化（摘要排序 + max_tokens）+ AgentDef 启动资产缓存（复盘：interact 9b68defe）

**变更原因**：同一句"今天天气怎么样？"最坏 65s：LLM 回答仅 3.7s，61.4s 烧在 soAgentSnapshot 的组件动态匹配——Soul 排序 9.3s 叠 Skill 排序 LLM 无 max_tokens 上限（流式 2840 tokens/52s），且 matchSkill 的 prompt 把**全量 skill_md** JSON 进 prompt。耗时不随问题难度而随排序模型发挥。

**修改的方法**：
  - `Core/SkillCoreProvider/application/SkillCoreService.matchSkill` — 排序 prompt 只带 `name/skill_brief`（不再携带全量 skill_md，原代码已注释保留）；`callLLM` 加 `max_tokens: 300`（原来无上限）。
  - `Runtime/Agents/application/AgentDefService` — `initialize()` 启动预热：agent 绑定事实源（agent 表全量）+ active def 全表进内存；`soActiveDefsCached()` 匹配每轮读内存（TTL 30s 过期重读，`insertDefFromAgent` 写侧失效）；`soAgentAsset()` 回退绑定缓存行。
  - 语义保持：Soul/Skill/MCP 仍按任务内容动态匹配（未启用 Layer 1 绑定水合），与 RuntimeGateway 测试锁定的 PRD 语义一致。

**影响的端点**：
  - `POST /api/chat/stream` — 同任务复现 65s → 16s；排序 LLM 有了终止上限；匹配/快照消除每轮重复全表查询。

**可能存在的问题**：
  - 排序 LLM 延迟仍受模型速度影响（变异正常范围）；资产缓存 TTL 30s 内外部改写以旧值为准。

## [2026-09-11] LLM 调用 Metrics 遥测 + 会话入口冗余清理 + 启动期工具规格缓存（优化：interact 65f80eb3）

**变更原因**：
复盘 interact `65f80eb3`（run `f53058fd`，用户问"今天天气怎么样"）发现简单问答也耗时约 7.5s：LLM 调用仅约 3.2s，其余为 run 受理后到 LLM 首次调用前的固定开销（工具规格解析、冗余 title 生成 DB 往返等），且全仓无"单次 LLM 调用"粒度的 token/耗时统计（llm_usage 仅按天聚合），延迟无法归因。

**修改的方法**：
  - `Base/shared/base/Metrics.ts` — 新增 `LLMCallUsageMetrics` 接口与 `Metrics.llm_usage` 字段、`recordLLMUsage(usage)` / `summarizeLLMUsage()` 方法；AOP 落 log_record 时随 Metrics 序列化自动携带（原结构已注释保留于方法上方）。
  - `Base/LLMProvider/application/LLMService.ts` — `execLLM` / `execLLMEvents` 成功路径回填新增 `recordLLMCallMetrics(metrics, ...)`：Metrics.recordLLMUsage 记 token 与单次耗时，并发 INFO 日志（`LLM call: X in / Y out tokens in Zms`，含 llm_id/attempt，带 trace_id 可在监控页关联）。
  - `Runtime/Loop/application/AgentLoopService.callLLMTurn` — 透传 `ctx.metrics` 至 `execLLMEvents`（原调用未传 metrics，AOP 默认实例与 run 无关联）。
  - `Application/Chat/application/ChatService.openChatStreamV2` — 删除重复的第二次 `autoGenerateSessionTitleIfEmpty` 调用（原行已注释保留；每次调用为一次 chat_session 查询往返）。
  - `Runtime/Tools/application/ToolService` — 新增 `specCache`（Map<tool_id, ToolSpecJson>）；`initialize()` 与 `registerBuiltinTools()` 启动期 `warmSpecCache()` 预热；`soTools` 改走 `soCachedSpec`（miss 重建回填，原实现已注释保留）；`registerTool` 覆盖注册时使旧缓存失效，下次查询按新 def 自动重建。

**影响的端点**：
  - `POST /api/chat/stream` — 每次 LLM 调用在 log_record 留一条多小时延遥测日志（token + 单次耗时），`metrics.llm_usage` 随 AOP invocation 记录携带；run 启动期少 1 次 title DB 往返，每轮 LLM 前不再重复 zod→JSON Schema 转换。

**验收**：
  - tsc --noEmit / lint:backend 全绿；base 807 + runtime 36 + application 476 单测全部通过。
  - E2E：重启后端后发送"今天天气怎么样"，SSE 正常收流收尾，log_record 出现 `ChatService.openChatStream LLM call: 1200 in / 343 out tokens in 3229ms`（trace_id 已关联），title 自动生成正常（仅一次）。

**可能存在的问题**：
  - `llm_usage` 只累积内存 Metrics 实例：直连调用链未把 run 级 metrics 传到 AOP 落库的调用（如 waitRun）时，stats 只体现在 INFO 遥测日志，不体现在 invocation_json；后续可在 run 结算时把 summarizeLLMUsage 写入 runtime_message.token_count/output 侧记账。
  - 工具规格缓存基于"注册后 def 不变"假设：registerTool 覆盖同一 id 的自定义工具时会正确失效重建，但 init 期以外热注册新工具首次查询有一次性构建成本。
  - 单次耗时 duration_ms 在降级失败次数多时语义为"最终成功候选的本次耗时"（attempt 字段已给出降级序号可区分）。

## [2026-09-11] 权限确认卡独立组件 + 权限审计落库（事故：interact 2109c9a5）

**变更原因**：
用户反馈"CDP 还是调用失败了"。复盘 interact `2109c9a5`（run `46a7be65`，会话 `58348296`，用户输入"北京"查天气）定位根因：**不是 CDP 调用失败**，`cdt_browser navigate` 从未执行，在权限门即被拒（49s 后 tool part error："工具 cdt_browser 被用户拒绝执行（permission denied）"）。权限确认卡复用了需求理解卡 IntentConfirmCard（三按钮：取消/按原文执行/按理解执行），`handleIntentConfirm` 的 `answerPermission(approved = action === 'APPROVE')` 把用户点「按原文执行」也解释为拒绝。且 permission 询问/应答无任何落库记录，历史对话区无权限卡可回放。

**修改的方法**：
  - `Base/shared/base/InfoEnums.ts` — `InfoType` 新增 `PERMISSION`。
  - `Runtime/Loop/application/AgentLoopService.askPermission` — 原代码（已注释保留）：
    ```
    private async askPermission(ctx: LoopRunContext, call: ParsedToolCall): Promise<boolean> {
      if (!this.permissionGate) return true;
      const permissionId = IdGenerator.generate();
      ctx.report?.pushBusinessEvent(BusinessEvent.PermissionAsked, {...});
      const result = await this.permissionGate.wait({ permission_id: permissionId });
      return result.approved;
    }
    ```
    修改后：挂起前/后分别回调 `permissionAudit?.asked(...)` / `permissionAudit?.answered(...)`；新增 `PermissionAudit` 鸭子接口（asked/answered，可选注入）。
  - `Runtime/Loop/access/LoopAccess` 构造器新增第 8 参 `permissionAudit`；`Runtime/Loop/index.ts` 与 `Runtime/index.ts` 导出类型。
  - `dev-server.ts` — 新增 `permissionAuditBridge`：asked 直插 `info_raw`（info_type=PERMISSION，info=JSON{permission_id/tool_id/input/status:'pending'/asked_at}），answered 按内存映射回写 status='allowed'/'denied'（best-effort，失败仅记日志）；`GET /api/chat/history` 加入 PERMISSION 消息映射（带 `permission` 字段）并入返回。
  - 前端：新增 `components/chat/PermissionConfirmCard.vue`（允许/拒绝双按钮，六种状态文案：等待授权/已允许/已拒绝）；`api/types.ts` ChatMessage 增 `permission?: PermissionCardData`；`stores/session.ts` 新增 `updateMessage`；`chatStreamEvents.onPermissionAsked` — 原代码（已注释保留）改为把 permission.asked 以独立卡片消息插入对话区（id=`perm-<permission_id>` 幂等），不再写 chatUi.intentConfirmation；`useChatStream.handlePermissionConfirm` 新增（answerPermission + 本地状态翻转），`handleIntentConfirm` 移除 permission 分流；`ChatArea.vue` 权限消息渲染 PermissionConfirmCard（历史/实时同路径）。

**影响的端点**：
  - `POST /api/chat/permission/answer` — 应答即落库决策（allowed/denied），历史可追溯。
  - `GET /api/chat/history/{sessionId}` — 权限卡并入历史，对话区展示；ChatMap 因 `buildMessageGraph` 仅收 REQUEST/RESPONSE 而不展示。
  - `GET /api/chat/stream`（所有权限门 run）— asked/answered 落库 best-effort，不改挂起语义。

**验收**：
  - lint:backend / typecheck（base/core/runtime/agent/application）/ vue-tsc 全绿；runtime 36 + application 476 + base 807 单测全部通过（含权限门挂起-恢复既有用例）。
  - dev-server 未重启（tsx 无 watch），生效需重启后端。

**可能存在的问题**：
  - 权限卡运行中状态由点击端本地翻转，多端不同步（后端 PermissionAnswered 事件有枚举未接线）；
  - 重启时 pending 权限的内存映射丢失，answered 无法回写，记录停留 pending；
  - permission 记录未经 saveInfo 全链路（无向量/关键词/GraphDB 派生），属只读存档。
# 代码变更记录 (CHANGELOG)

## [2026-09-11] 权限确认卡历史消失修复（PERMISSION 落库 session_id 用错会话域）
**变更原因**：用户反馈"对话区权限确认卡交互后就看不到了，应该保留"。定位：`Runtime/Runs/application/RunGatewayService.prepareLoopInput` 传给 Loop 的 `session_id` 是 Runtime 内部会话 ID（runtimeSessionId），`AgentLoopService.askPermission` 把它透传给权限审计桥，`dev-server.ts permissionAuditBridge.asked` 将该内部 ID 落入 `info_raw.session_id`；而 `GET /api/chat/history` 经 `ChatService.soChatHistory` 按 chat session_key 过滤 info_raw，PERMISSION 行永远查不到——run 收尾 `runSseInteraction` finally 里 `loadChatHistory` 全量替换 messages（useChatStream.ts:61），实时卡被替换成空，卡片消失（落库为空、只存 stream_event）。
**修改的方法**：
  - `dev-server.ts permissionAuditBridge.asked` — 原代码（已注释保留）：`{ field: 'session_id', value: input.session_id }`；修改后：`{ field: 'session_id', value: input.session_key || input.session_id }`（session_key 即 chat 会话键，与历史查询同域）。
**影响的端点**：
  - `POST /api/chat/stream`（权限门 run）— PERMISSION 审计行落 chat 会话域，历史可回放。
  - `GET /api/chat/history/{sessionId}` — 权限卡并入历史后真正可查，交互/刷新后卡片保留。
**可能存在的问题**：
  - 修复前已交互但落错域的 PERMISSION 行（session_id=runtimeSessionId）属孤儿数据，历史仍查不到，如需可手工 UPDATE；
  - 后端未重启（tsx 无 watch）时改动不生效，需重启 dev-server。


## [2026-09-09] "复制 TraceId" 关联语义修复：Chat 链路日志补盖 trace_id（此前 log_record.trace_id 恒 NULL）
**变更原因**：用户指出"id 的含义不对——复制 TraceId 按钮复制的应该就是 TraceId"。排查发现按钮本身复制的是 `info_raw.trace_id`（交互 trace，取值正确），但该 id 在监控页失去关联语义：`ChatService` 直连 `logger?.info/warn` 的调用绕过了 `Metrics.merge` 的 trace_id 自动盖章（AOP Metrics 路径有盖章，直连路径没有），导致 `log_record.trace_id` 全部为 NULL——对话区复制的 TraceId 在监控页按 trace 过滤查不到任何日志。**TraceId 语义约定：一次 openChatStream SSE 交互的追踪 id（与该轮 interact_id 同值），对话区消息卡 / Feedback / Error 块 / 评估弹窗复制按钮、监控页 log_record.trace_id、info_raw.trace_id 三处同一 id 域。**

**修改的方法**：
  - `Application/Chat/application/ChatService.openChatStreamV2` — 原代码：`run settled` 日志 meta 仅含 session/run/status（原行已注释保留）；修改后：补 `trace_id` / `interact_id` / `work_id`（= 本轮交互 trace 与 run id）。
  - `Application/Chat/application/ChatService.syncRuntimeMessagesToInfoRaw` — 原代码：同步失败 warn 日志 meta 无 trace；修改后：补 `trace_id` / `interact_id`。

**影响的端点**：
  - `POST /api/chat/stream` — 每轮 settled 日志携带交互 trace；实测复制 TraceId 后在监控页 `GET /api/monitor/logs/query?trace_id=<复制的值>` 可命中该轮日志。

**可能存在的问题**：
  - 其余模块（SelfLearning / UserProfile 等）仍有直连 logger 调用未盖 trace_id——它们无用户可复制的 TraceId 入口，暂不扩散；后续若监控页需要按 trace 关联其他域，可统一改为经 Metrics 或 AsyncLocalStorage 传播。

## [2026-09-09] 对话区重复上一轮内容修复 + CDP 命令超时（事故：interact 5f24881f / 0c92601f）
**变更原因**：用户报告两起对话区故障——(1) interact `5f24881f`（输入"北京"）后对话区重复出现上一轮问答；(2) interact `0c92601f`（输入"今天天气怎么样？"）整轮执行与保存流程异常。经数据库取证（info_raw / runtime_message / runtime_run / stream_event / brian_log）还原事故链：
1. 第一轮（interact `0c92601f`，run `1636e735`，11:44）由旧版同步落库（未传 created），user/assistant 同时间戳（保存时刻 11:44:09.274）；
2. 第二轮（interact `5f24881f`，run `367d9572`，11:54）`cdt_browser navigate` 后 CDP 命令应答无超时被挂死（工具 Part 恒 running）→ run 永不 settle → `waitRun` 5 分钟超时（11:59:48，status=running）；
3. 超时后的 `syncRuntimeMessagesToInfoRaw` 按会话全量重读 runtime_message，去重条件 `(session_id, info, created)` 与第 1 步落库的保存时刻时间戳不相等 → 判重失败，把第一轮问答整组重复插入（interact 盖章为 `5f24881f`），对话区即"重复上一轮内容"；随后空内容占位行（assistant `content=''`）令 `saveInfo` 抛 ValidationError 中断同步。
**处理原则：判重键与 created 解耦（work_id 维度）+ 空行跳过 + CDP 命令级超时，不动 Runtime v2 消息模型。**

**修改的方法**（原始代码均以注释保留在文件中）：
  - `Application/Chat/application/ChatService.syncRuntimeMessagesToInfoRaw` — 原代码：逐条 `COUNT(*) WHERE session_id+info+created` 判重（created 恒不匹配历史数据）+ 空内容直接进 saveInfo 抛错中断；修改后：去重键改 `(work_id, info_type, info)`、已落库集合一次载入内存 Set、空内容占位行 `continue` 跳过、读取上限最近 200 条；保留会话全量读取以补齐超时 run 迟到落库的最终回复。
  - `Base/CDTProvider/application/CDTService.execCDP` — 原代码：命令 Promise 仅依赖 message/error/close 事件无超时；修改后：新增 `CDP_COMMAND_TIMEOUT_MS=30s`，超时按失败结算（`CDP 命令超时（30000ms）：<method>`）并关闭连接，工具返回 error 结果，Agent 可换路重试。
  - `Base/CDTProvider/application/CDTService.connectWebSocket` — 补 30s 连接超时（防 WebSocket 停在 CONNECTING 永不结算）。
  - 数据修复（会话 `fb3efe8f`）：删除重复组（info_id `36b2f961`/`3272b9db` 及其派生 info_tag×10 / info_keyword×12），保留 interact `0c92601f` 一组并校正 created 为 runtime 真实时间（user 11:44:01.685 / assistant 11:44:09.272）；卡死 run `367d9572` 状态置 error/aborted。

**影响的端点**：
  - `POST /api/chat/stream` — 同步判重语义变化（work_id 维度）；cdt_browser 单条 CDP 命令最长 30s，run 不再永久挂死。
  - `GET /api/chat/history/:session_id` — 每条消息仅一份；实测会话 `5410fe25`（3 轮连续发送 + 1 次超时场景）无任何重复、时序正确。

**可能存在的问题**：
  - 同一 run 内完全相同的消息文本会被判重跳过一条（概率极低）；
  - 超时 run 迟到补齐的历史行 interact_id 归当轮 trace（按 work 分组展示正确）；
  - 30s 超时对极慢页面可能偏紧（`Page.navigate` 应答本身不受影响；拟人化等待在应答之后）；
  - 运行中 run 仍无整体看门狗（budget/timeout 不落账），依赖单命令超时兜底，后续可补 run 级 watchdog。

## [2026-09-09] 全链路过程上报补齐：意图识别/Agent构建/LLM/Prompt/Skill/MCP 选定/评估结论经 Report 上报
**变更原因**：逐项核查 V2 链路上报覆盖发现 7 类过程信息缺口——意图识别（matchAgentDef L3 LLM 匹配评估的 score/reason）、Agent 构建（buildNewDef → AgentBuilder.buildAgent）、LLM 选定（快照 def.model_id）、Prompt 选定（prepareSystemPrompt 模板与渲染结果）、Skill/MCP 选定（matchSkill/matchMCP 动态解析）、Evolutor 评估结论（evalWorkAgent/evalWriterAgent）均未上报；`context.built` 缺 system prompt（模型调用输入的 system 侧）。根源：`matchAgentDef`/`soAgentSnapshot`/`evalWorkAgent`/`evalWriterAgent` 方法签名均接收 `report` 但弃用（`_report`）。**处理原则：在对应方法内、功能完成点立即经 `report.pushBusinessEvent` 上报，事件名以 BusinessEvent 枚举注册。**

**修改的方法**（原始方法均注释保留在文件中）：
  - `Base/shared/base/BusinessEvent.ts` — 新增 7 个枚举成员：`intent.analyzed` / `agent.built` / `llm.selected` / `prompt.selected` / `skill.selected` / `mcp.selected` / `evaluation.completed`（19 → 26 成员）。
  - `Runtime/Agents/application/AgentDefService.soLLMRankedDef(defs, taskContent, report?)` — 原代码：LLM 打分后仅按阈值采纳，结果不外露（原方法已注释保留）；修改后：解析出 score/reason/agent_ref 后立即上报 `intent.analyzed` `{ score, reason(≤1000), agent_id, adopted, candidates_count }`。
  - `Runtime/Agents/application/AgentDefService.buildNewDef(input, report?)` — 原代码：`buildAgent` 后直接 `insertDefFromAgent` 返回（原方法已注释保留）；修改后：构建+def 落账完成后上报 `agent.built` `{ agent_id, def_id, name, purpose, task_signature }`。
  - `Runtime/Agents/application/AgentDefService.soAgentSnapshot(..., report?)` — 原代码：`_report` 弃用（原方法已注释保留）；修改后：`soDefRow` 后立即上报 `llm.selected` `{ llm_id }`；`prepareSystemPrompt` 后上报 `prompt.selected` `{ template_id, system(≤4000), soul_selected, tools_count }`。
  - `Runtime/Agents/application/AgentDefService.soSnapshotTools(def, input, report?)` / `appendMcpEntries(def, input, entries, report?)` — 原代码：matchSkill/matchMCP 结果仅进快照（原方法已注释保留）；修改后：match 完成即上报 `skill.selected` `{ source, skills[{id,brief}] }` / `mcp.selected` `{ mcps[{id,brief}] }`（显式 tools_json 路径以 source='explicit' 上报）。
  - `Runtime/Loop/application/AgentLoopService.prepareLLMTurnInput(ctx)` — 原代码：`context.built` payload 仅 `{ round, message_count, messages }`（原方法已注释保留）；修改后：补 `system`（system prompt 截断 4000），模型调用输入两侧（system + wire 消息）完整可观测。
  - `Agent/EvolutorAgent/application/EvolutorAgentService.evalWorkAgent(..., report?)` / `evalWriterAgent(..., report?)` — 原代码：`_report` 弃用，评估结论只落 `agent_evaluation` 表（原方法已注释保留）；修改后：评分/建议/落账/MQ 触发完成后上报 `evaluation.completed` `{ eval_type, eval_id, agent_id, work_id, interact_id, scores, suggestions, need_optimize }`（call_error/internal_error 跳过路径不报；离线闭环无流会话时静默降级 no-op）。
  - `brian-frontend/src/composables/sseEventTypes.ts` — BusinessEvent mirror + `EVENT_UI_STYLE` 同步登记 7 个新事件（均 area='thinking'）。
  - `brian-frontend/src/composables/chatStreamEvents.ts` — 新增 7 个处理器（onIntentAnalyzed/onAgentBuilt/onLlmSelected/onPromptSelected/onSkillSelected/onMcpSelected/onEvaluationCompleted），按既有直改思考块 content 约定追加展示行；`prompt.selected` 同时回填 `thinkBlock.prompt`。

**影响的端点**：
  - `POST /api/chat/stream`（V2 链路）— 每轮 run 新增最多 6 类过程事件（intent.analyzed 仅 L3 层触发；agent.built 仅 Built 层触发；llm/prompt/skill/mcp.selected 每次 soAgentSnapshot 各一条；context.built payload 增 system 字段）。
  - Evolutor 评估链路（`POST /api/learning/start` 直调 runEvalOnce / MQ 队列消费）— 携带 report 时评估结论进事件流；无流会话静默降级。

**验证**：
  - `npm run typecheck`（base/core/runtime/agent/application）0 错；`lint:backend` 0 error；前端 `vue-tsc --noEmit` 0 错、eslint 0 error（8 条警告均为既有）
  - 单测全绿：Base 807/807、Runtime 36/36（含 AgentLoop）、Agent 121/121、Application 476/476

**可能存在的问题/风险点**：
  - `prompt.selected` 上报渲染后的 system prompt（截断 4000），含 soul 内容与任务指令；事件流持久化于 stream_event，注意敏感信息面
  - 离线评估闭环（runEvalOnce/MQ）当前调用方未传 report → 评估事件静默 no-op；如需离线可观测需在调度层构造 Report
  - exact/signature 命中层不经 LLM，无 intent.analyzed（意图分析仅 LLM 评估层存在）；确定性层过程仍仅由 agent.selected 的 matched_by 表达

---

## [2026-09-09] 对话区消息顺序颠倒修复（user/assistant 同时间戳 + 前端 UUID tie-break）
**变更原因**："对话"页面对话区出现"用户消息显示在系统回复下面"。根因有二：① `ChatService.syncRuntimeMessagesToInfoRaw` 在 run 结束后统一调 `saveInfo`，未携带真实消息时间 → 同一轮 user/assistant 落库同一 `created`（实测同轮两条 created 完全相同，而真实先后在 `runtime_message.created` 中：user 1788921198811 < assistant 1788921200138）；② 前端 `ChatArea.vue` timeline 对同时间戳同 kind 消息落入 `key.localeCompare`（UUID 字符串比较），顺序由 UUID 随机决定。连带发现：去重条件 `created = msg.created` 与落库时间（保存时刻）错位，去重恒不匹配、存在重复插入风险。

**修改的方法**：
  - `Core/InfoCoreProvider/domain/types.ts SaveInfoInput` — 新增可选 `created?: number`（消息真实创建时间，毫秒；缺省行为不变，全调用方向后兼容）。
  - `Core/InfoCoreProvider/application/InfoCoreService.saveInfo` — 原代码：`info_raw.created/updated` 一律取保存时刻（原行已注释保留）；修改后：`createdAt = input.created > 0 ? input.created : now`。
  - `Application/Chat/application/ChatService.syncRuntimeMessagesToInfoRaw` — 原代码：未传 `created`（原行已注释保留）；修改后：`saveInput.created = runtime_message.created`，落库保留真实先后并使去重条件成立。
  - `brian-frontend/src/components/chat/ChatArea.vue` timeline — 原代码：同时间戳消息直接 `key.localeCompare`（UUID 随机序，原行已注释保留）；修改后：同 kind 消息按角色 tie-break（`user` 恒在 `assistant` 之前），兜底存量同时间戳数据。

**影响的端点**：
  - `GET /api/chat/history/:session_id` — 新会话按真实时间天然有序；存量数据由前端 tie-break 兜底。
  - `POST /api/chat/stream` — 会话同步落库时间戳语义变化（保存真实消息时间）。

**验证**：
  - 后端 tsc 0 错、eslint 0 error；Core 192/192、Application 476/476；前端 vue-tsc 0 错、eslint 0 error（既有警告不涉及本次文件）；全量回归 1632/1632
  - E2E（重启后端）：① 存量会话 `09634b38`（同时间戳）经修复后 timeline 排序 user 在前、assistant 在后 ✓；② 真实新对话（session `361db3dd`）：info_raw 中 REQUEST created=1788925927771 < RESPONSE created=1788925929044，天然有序 ✓

**可能存在的问题/风险点**：
  - 存量 V2 数据（修复前落库）user/assistant 同时间戳不可追溯，历史查询层（ORDER BY created）对同时间戳仍不稳定；显示已由前端兜底，无感知
  - 修复前已同步过的旧会话若再触发同步（新 run 完成），旧消息按 `(session_id, info, created=msg.created)` 去重仍不匹配旧落库行（created=旧保存时刻）→ 可能重复插入旧消息；此为修复前既有缺陷，新落库行（created=真实消息时间）去重已正确

---

## [2026-09-09] SelfLearning 测试契约迁移：startEvalSchedule → runEvalOnce（单轮任务模型）
**变更原因**：全量回归 5 例失败（TC-SL-050/051/053/059/060，断言 `evolutorAgent.startEvalSchedule` 被调用但得到 0 次）。根因：`SelfLearningService.startLearning` 已随"单轮任务"重构迁移到新契约——CONVERSATION 分支改为 `runConversationLearningPass()` → `EvolutorAgent.runEvalOnce`（单轮完整评估闭环），不再启动常驻评估调度；防重入由 `conversationPassRunning` 承担（原 `evalSchedule*` 标记移除）。测试仍断言已移除的旧契约。**生产代码为新设计不动，仅迁移测试断言。**

**修改的方法**：
  - `Application/test/self-learning.test.ts`（beforeEach）— `runEvalOnce` / `stopEvalSchedule` 改为**透传 spy**（`vi.spyOn` 不替换实现、不伪造数据）：仅用于调用计数断言，真实单轮评估闭环对真实测试库完整执行；移除已无调用方的 `startEvalSchedule` 桩（单轮任务化重构后不再被调用）。
  - `TC-SL-050/051/053/059` — 断言与标题迁移：`startEvalSchedule toHaveBeenCalled` → `runEvalOnce toHaveBeenCalled`（计数对象为真实执行）。
  - `TC-SL-052/054/055/056/058/061` — 反向断言同步迁移为 `runEvalOnce not.toHaveBeenCalled`（原断言 startEvalSchedule 未被调用，在旧桩下恒真、语义失真）。
  - `TC-SL-060` — 幂等语义随重构迁移：检验 SelfLearningService 自身的 `conversationPassRunning` 防重入守卫（真实代码）。因真实 `runEvalOnce` 在空库上为微任务级瞬时完成、无法确定性构造"第一轮仍在执行"的并发窗口，仅对依赖边界做**挂起门控**（pending promise，不伪造任何数据与返回值），第一轮未完成时第二次 start 不再触发第二轮，`toHaveBeenCalledTimes(1)`；标题与注释同步更新。

**影响的端点**：无业务端点变化；`POST /api/learning/start`（CONVERSATION/ALL 模式）行为契约已在测试层对齐为 runEvalOnce 单轮模型；生产代码零改动、零 mock（已扫描 SelfLearningService / EvolutorAgentService / EvolutorAgentAccess 无 mock/fake/stub）。

**测试**：
  - `self-learning.test.ts` 107/107 全绿；Application 全量 476/476 全绿（修复前 471/476）
  - `tsc --noEmit`（application）0 错；eslint 0 error

**可能存在的问题/风险点**：
  - `runEvalOnce` 在真实链路中为同步闭环，单轮耗时取决于待评估 usage 量（默认阈值 5 / 批量 20）；若未来引入异步调度语义，TC-SL-060 的 pending-mock 幂等验证需随之调整
  - `startLearning` 手动触发为 fire-and-forget，HTTP 立即返回；任务结果经任务列表（running→completed/failed）可观测

---

## [2026-09-09] V2 直连 run 思考过程重建修复（"思考过程"按钮恒为空）
**变更原因**：会话 `09634b38`（interact/trace `abe6eeae-70ac-49aa-b653-8cc88f08318d`）点击消息卡"思考过程"按钮后弹窗显示"暂无思考过程"。排查链路：V2 Runtime 上报与保存均正常（stream_event 完整记录 run.accepted / agent.selected / agent.components / run.started / context.built / think.delta×5 / reply.delta×7 / think.created / reply.created / run.finished，runtime_message_part 的 reasoning/text 内容完整），但 `GET /api/chat/thinking` 的重建函数 `buildThinkingBlocksAndDag` 仅查 V1 编排 5 张表（orchestration_agent_dag_record / agent_plan / orchestration_agent_execution / agent / agent_execution_trace / orchestration_work）；V1 编排链路已于 2026-09-05 移除（ChatService.openChatStream 即 v2 链路），新对话不再写编排表 → blocks 恒为 0。另发现 reasoning/text Part 直存后状态恒为 `pending`（与 tool Part 状态机不一致）。**处理原则：不回退 V1，仅在 V2 链路基础上补齐重建流程。**

**修改的方法**：
  - `dev-server.ts buildThinkingBlocksAndDag(...)` — 原始代码：单函数仅查编排表重建（已整体改名为 `buildThinkingBlocksFromOrchestration` 保留，注释标记"原始方法保留作为参考"，供 2026-09-05 前 V1 历史数据继续重建）；新方法 = 编排表重建 + 逐 work 判空后回退 `buildThinkingBlocksFromRuntime`。
  - `dev-server.ts buildThinkingBlocksFromRuntime(relationDb, runId)`（新增）— 从 V2 表重建：`runtime_run`（session_key/时间窗/状态）→ `stream_event`（按 created 时间窗取 agent.selected / agent.components / context.built）→ `runtime_message`（user 输入 + assistant 轮次）→ `runtime_message_part`（reasoning→THINK 步骤、tool→ACT 步骤（params/result 配对）、text→输出）；组装 ThinkingChain Block（agentInfo 组件清单 / prompt=当轮 wire 消息 / input/output / thinkingStrategy=CoT|ReACT / durationMs=settled-started / tokenUsage=assistant 消息 token 合计）与单节点 DAG（status 按 run.status 映射）。
  - `Runtime/Loop/application/AgentLoopService.addTurnPart(ctx, messageId, partType, content)` — 原始代码：
    ```typescript
    private async addTurnPart(ctx: LoopRunContext, messageId: string, partType: PartType, content: string): Promise<void> {
      const input = new AddPartInput();
      input.message_id = messageId;
      input.run_id = ctx.runId;
      input.part_type = partType;
      input.content = content;
      const output = new AddPartOutput();
      await this.session.addPart(input, output, new SessionCtx());
      await this.publishPartCreated(ctx, messageId, output.part_id, partType);
    }
    ```
    修改后：追加 `updatePart(status=Completed)`——reasoning/text Part 直存即终态，不再恒为 pending。

**影响的端点**：
  - `GET /api/chat/thinking`（info_id / interact_id / work_id 任一参数，module=all|dag|blocks）— V2 直连 run 现可重建思考块与单节点 DAG；V1 历史数据行为不变。
  - 全部 `POST /api/chat/stream` 会话 — 新对话的 runtime_message_part reasoning/text 状态落库为 `completed`（此前恒 pending）。

**验证**：
  - `tsc -p brian-backend/tsconfig.json --noEmit` 0 错；eslint 0 error；Runtime 36/36 测试全绿
  - E2E：`GET /api/chat/thinking?info_id=6483328f…`（interact abe6eeae）→ count=1，agentInfo=w2-general-…、steps=[THINK]、input="hello"、output=完整回复、prompt=[user] wire 消息、dag 单节点 COMPLETED；module=dag/blocks 分参数行为正确

**可能存在的问题/风险点**：
  - `stream_event.run_id` 恒为空串（ChatService 的 report2 未携带 run_id/work_id，Report.pushBusinessEvent 落库时无 run 可带）；当前重建按 session_key + 时间窗关联，多 run 交叠时间窗极端场景可能串扰（当前按 seq 顺序取每类事件最后值，风险可控）
  - V2 重建的 context 仅含 wire 消息（timelineMessages）与策略标注，V1 时代的 InfoCore 分类上下文（pinned/similarity/keyword/random 等）在 V2 直连链路不产生，弹窗对应分类显示为空
  - 前端按钮仅能回放已结束 run；流式期间自动弹窗仍走 SSE 实时块（不受本次修改影响）

---

## [2026-09-07] isolated-vm 版本策略核查结论固化 + 运行时编译兜底 npx 第三级解析加固

**变更原因**：用户要求评估"高版本 isolated-vm 不支持某平台时降级使用早期版本预编译"的可行性。核查上游全部 Release（v4.6.0 → v6.0.2）得出结论性事实：**darwin-x64 预编译二进制在上游任何版本都不存在 Node 22 (ABI 127) 形态**——仅 v4.6.0/v4.7.2 发布过 darwin-x64 且 ABI 为 93/108/115（Node 16/18/19）；isolated-vm 为 V8 直接绑定（非 N-API），ABI 严格锁定，v4 二进制在本仓库 .nvmrc（Node 22.22.1）上物理不可加载；且降级整个 vendored 副本会破坏现有 linux-x64/win32-x64/darwin-arm64 的 node127 预编译。**结论：降级旧版不可行，v5.0.4 源码编译即 darwin-x64 的上游官方路径**（binding.gyp `MACOSX_DEPLOYMENT_TARGET=10.12`，mac-x64 上 `npm install isolated-vm` 本身就是源码编译）。据此固化保障链并对运行时兜底做最后加固。

**修改的方法与模块**：
- `Base/SkillProvider/infrastructure/sandbox/vendor/isolated-vm/isolated-vm.js` — `resolveNodeGyp` 升级为**三级解析**：仓库内 node_modules → 全局 PATH → `npx --yes node-gyp`（在线获取；便携包自带 Node 运行时必有 npm/npx，保证无 node_modules 的发行形态也能完成源码编译兜底）；编译命令按解析结果分派（`node <gyp.js>` 直执 / npx 转发，win32 走 shell）；错误信息列出完整尝试链。
- `brian-backend/scripts/build-isolated-vm.js` — 同步三级 node-gyp 解析与分派逻辑。
- `brian-backend/prebuilt/README.md` / `docs/_3_BackendDesign/_01_Base/SkillProvider/SkillProvider-PRD.md` — 固化版本策略结论（ABI 矩阵 + 降级不可行依据 + 三级编译兜底 + build-isolated-vm.js 入库路径）。

**影响的端点**：无业务端点变化；影响面为 `.js` Skill 沙箱的可用性保障链（`SkillAccess` → `IsolatedVMSandbox` → vendored loader）。

**测试**：
- npx 兜底分支实测：`cd vendor && npx --yes node-gyp rebuild --release -j max` 完整编译成功，产物加载 + Isolate 创建通过
- 恢复原二进制后 require + Isolate 冒烟通过；`build-isolated-vm.js --check` 三处路径 OK
- 全量回归：typecheck 0 错、eslint 0 error、五工作区 1632/1632 全绿（Base 807 / Core 192 / Runtime 36 / Agent 121 / Application 476）

**可能存在的问题/风险点**：
- npx 第三级需网络（node-gyp 会缓存到 npm 缓存目录，二次离线可用）；完全离线且无全局 node-gyp 的 darwin-x64 环境仍会 fail-fast——消除手段唯一且明确：在 Intel Mac 上跑 `build-isolated-vm.js` 提交预编译入库
- 上游若未来发布 darwin-x64 预编译，直接放置到 `prebuilt/isolated-vm/darwin-x64/node{abi}/` 即可，无需改代码

---

## [2026-09-07] isolated-vm 三平台可用性保障补全 + 存量测试与工具链问题修复

**变更原因**：用户确认 isolated-vm 沙箱为硬性要求（无沙箱不可接受，Win/Mac/Linux 三平台必须可用），并要求同步修复存量问题。调查发现：① 上游 isolated-vm v5.0.4 Release **不再发布 darwin-x64 预编译包**（仅 darwin-arm64），此前仓库对该平台只有"运行时源码编译兜底"一条路，缺仓库级工具与文档闭环；② `self-learning.test.ts` TC-SL-065/067 稳定失败——`SelfLearningService` 存在**启停竞态**：`startLearning` 将 CONVERSATION 分支 fire-and-forget 后立即返回，`evalScheduleRunning=true` 要等 `await startEvalSchedule` 完成才置位，紧接的 `stopLearning` 以该 flag 为守卫会跳过 `stopEvalSchedule`（前端快速 start→stop 同样命中，属真实代码缺陷而非测试问题）；③ `visualization.test.ts` 的 `insOrchWork`/`insOrchAgentExec` fixtures 指向已删除的 V1 编排表（orchestration_work / orchestration_agent_execution，b31f289 删除），每次运行产生 22 个 Unhandled Rejection（"no such table"），全量跑时 vitest 偶发将其计为用例失败；④ `npm run docs:index` 扫描已删除的 Orchestration 目录直接崩溃。

**修改的方法与模块**：
- `brian-backend/scripts/build-isolated-vm.js`（新增）— isolated-vm 预编译构建工具：从 vendor 全量 C++ 源码 node-gyp 编译，产物同时安装到 `brian-backend/prebuilt/isolated-vm/{platform}-{arch}/node{abi}/`（离线包分发源）、vendor `prebuilt/` 镜像与 `out/`（dev require 加载路径）三处；`--check` 仅检查。维护者在 Intel Mac 上执行后可将 darwin-x64 二进制提交入库，实现该平台离线覆盖。
- `packaging/pack.mjs` — isolated-vm 解析增强：目标平台 = 本机平台且预编译缺失时，打包期自动执行 build-isolated-vm.js 源码构建补齐（构建失败保留告警并依赖运行时兜底）；"已知限制"注释同步改写。
- `brian-backend/prebuilt/README.md` — 覆盖表 isolated-vm darwin-x64 标注 ○* 并说明双路径（运行时自动编译 / build-isolated-vm.js 产出入库）。
- `Application/SelfLearning/application/SelfLearningService.ts` — **启停竞态修复（三态协调）**：① `startLearning` CONVERSATION 分支同步置位意图标记 `evalScheduleRunning`；② `startConversationLearning` 增加实际状态 `evalScheduleActive` + in-flight 去重句柄 `evalScheduleStartPromise`（并发 start 只触发一次 startEvalSchedule，保住 TC-SL-060 幂等断言），启动完成时若意图已复位则**补偿停止**（避免悬挂调度）；③ `stopLearning` 同步复位意图标记与实际状态，并**无条件调用** `stopEvalSchedule`（幂等），不再以未置位的 flag 为守卫。
- `Application/test/visualization.test.ts` — 删除死 fixtures：`insOrchWork`/`insOrchAgentExec` helper 与全部 22 处调用（服务只读 info_raw / visualization_config / info_summary / info_context_config，V1 编排表已随框架删除；`insTrace` 使用的 agent_execution_trace 仍存在，保留）。
- `scripts/generate-method-index.mjs` — LAYERS 移除已删除的 'Orchestration' 层；`collectAccessFiles` 对不存在目录跳过（容错）。
- `Agent/SummaryAgent/access/SummaryAgentAccess.ts` — `initialize` 补 JSDoc（方法索引自动生成可提取说明）。
- 文档重新生成：`npm run docs:index` 恢复可用，485 个方法重索引（Orchestration 索引文件随之删除）。

**影响的端点**：
- `POST /api/learning/start` → `POST /api/learning/stop` 快速连续调用：stop 不再漏掉 Evolutor 评估调度停止（真实缺陷修复，前端学习页立即受益）
- 便携包打包（`node packaging/pack.mjs`）：本机目标缺 isolated-vm 二进制时自动源码构建补齐
- `npm run docs:index`：恢复可用
- Application 测试套件：从 474/476（2 flaky + 22 unhandled）修复为 **476/476 全绿 0 unhandled**

**测试**：
- `self-learning.test.ts` **107/107** 全绿（TC-SL-065/067 修复；TC-SL-060 幂等语义保持）
- `visualization.test.ts` **94/94** 全绿且 0 Unhandled Rejection
- 全量回归：Base 807/807、Core 192/192、Runtime 36/36、Agent 121/121、Application 476/476 —— **五工作区 1632/1632 全绿**
- 静态检查：typecheck 0 错；eslint 0 error
- 沙箱端到端冒烟：真实 isolated-vm 执行 .js Skill（result=42）通过；`build-isolated-vm.js --check` 三处路径 OK

**可能存在的问题/风险点**：
- darwin-x64 便携包最终用户若既无预编译二进制又无 Xcode CLT，沙箱将 fail-fast（不降级）——维护者可在 Intel Mac 上跑 `build-isolated-vm.js` 提交二进制消除该情形；上游恢复发布 darwin-x64 预编译后可直接替换
- `stopLearning` CONVERSATION 分支现在无条件调用 `stopEvalSchedule`（原为 flag 守卫跳过）——evolutor 侧幂等（按 worker 标识停止），多调一次无害；若未来 Evolutor 停止变为有副作用操作需回归此处

---

## [2026-09-07] 审计整改：桩方法补齐 + JS 沙箱全平台源码编译兜底 + 死代码删除 + LLM/Agent 绑定资源 DB 校验

**变更原因**：后端审计发现 6 处问题并按用户要求逐项整改：① `VectorDBService.initializeConfig()` 为空方法体（注释声称"写入默认配置项并恢复 enabled 状态"但什么都没做）；② `SummaryAgentAccess.initialize()` 为空 no-op，与其余 Agent 模块的初始化行为不一致；③ `.js` Skill 沙箱在缺 isolated-vm 预编译二进制的平台（darwin-x64）降级为抛错占位 `UnavailableJsSandbox`，不满足"Win/Mac/Linux 三环境必须可用"；④ `Core/shared/AgingEngine.ts` 实现完整但生产代码零引用（Skill/Soul 各自私有实现），属重构遗留死代码；⑤ `LLMCoreService.matchLLM` 对"绑定存在但 LLM 表无记录"的缓存命中返回未经 DB 验证的合成记录 `{ id, llm_title, enable: true }`；⑥ Agent 层缺少对 LLM/Prompt/Skill/MCP/Soul 绑定资源的统一校验。

**修改的方法与模块**：
- `Base/VectorDBProvider/application/VectorDBService.ts` — `initializeConfig()` 补齐实现：经 `ConfigService.initDefaults` 幂等写入 4 个默认配置项（`enabled=true`/`default_top_k=10`/`default_similarity_threshold=0`/`default_distance_metric=COSINE`，仅缺失时写入不覆盖已有值），随后从配置表恢复 `enabled` 状态（上次禁用重启后保持禁用）。
- `Agent/SummaryAgent/application/SummaryAgentService.ts` + `access/SummaryAgentAccess.ts` — 新增 `SummaryAgentService.initialize(ctx)`：执行该模块真实初始化工作（确保内置摘要 Soul + 内置系统 Agent 就绪，幂等；失败仅 logger.warn 不阻断启动）；Access 层改为 `initPromise` 模式（构造时启动初始化，`initialize/ensureBuiltin/generateSummary` 统一 `await this.initPromise`），与其他 Agent 模块行为一致。
- `Base/SkillProvider/infrastructure/sandbox/vendor/isolated-vm/isolated-vm.js` — vendored loader 增加源码编译兜底：预编译路径（BRIAN_NATIVE_DIR → prebuilt/{platform}-{arch}/node{abi} → prebuilt/{platform}-{arch} → out/）全部未命中时自动 node-gyp rebuild（锁文件防并发 + 进程内去重 + build/Release→out 拷贝缓存），Win/macOS/Linux 三平台均可获得可用的 isolated-vm 服务；加载失败直接抛错 fail-fast。实测：隐藏全部 linux-x64 二进制后首次加载 45s 完成源码编译并通过沙箱执行验证（result=42）。
- `Base/SkillProvider/access/SkillAccess.ts` — 删除 `UnavailableJsSandbox` 降级分支与 try/catch，直接构造 `IsolatedVMSandbox`（源码编译兜底保证任意平台可用）；`infrastructure/sandbox/UnavailableJsSandbox.ts` 删除。
- `Core/shared/AgingEngine.ts` + `Core/test/shared/AgingEngine.test.ts` — 删除死代码及 `Core/shared/index.ts` 导出（SkillCore/SoulCore 各自私有老化实现为生效路径）。
- `Core/LLMCoreProvider/application/LLMCoreService.ts` — `matchLLM` 第 1 层缓存命中改为先经 DB 校验（`getLLMById` 确认存在且 enable）：校验通过才复用绑定；校验失败清除失效绑定（`clearMatchCache`）并继续第 2/3 层重新匹配；**移除合成记录**。
- `Agent/shared/AgentKit.ts` — 新增 Agent 绑定资源校验套件（全部经 DB 校验）：`validateAgentSoul`（Soul 存在且启用）、`validateAgentPrompt`（Prompt 模板存在且启用）、`validateAgentSkills`/`validateAgentMcps`（批量存在且启用，返回 valid/invalid 列表）、`validateAgentLlm`（LLMProvider 存在且启用）、`validateAgentResources`（组合校验，返回 issues 清单与有效 ID 集合，不抛异常由调用方决定降级策略）。
- `Agent/AgentExecution/application/AgentExecutionService.ts` — `execAgent` 接入校验门：执行前对 Agent 绑定的 Soul/Prompt/Skill/MCP 全量 DB 校验（失效 Skill/MCP 从本次执行剔除、问题清单 logger.warn），LLM 绑定校验失败直接抛 ValidationError（执行必须依赖有效 LLM）。
- 文档同步：`VectorDBProvider-PRD.md`（新增 initializeConfig 默认配置项表）、`LLMCore-PRD.md`（§2.1 matchLLM 补 DB 校验步骤）、`SkillProvider-PRD.md`（§5 沙箱全平台可用说明）、`MethodIndex/Agent/SummaryAgent.md`（initialize 说明）、`packaging/pack.mjs` 与 `brian-backend/prebuilt/README.md`（移除"降级禁用"过时说明）。

**影响的端点**：
- `SkillAccess` 构造（`Base/SkillProvider`）：行为变更——原生模块不可用时启动 fail-fast（原为降级启动），满足"三平台必须可用"要求
- `POST/GET /api/config`（vectordb 模块）：首次初始化后 vectordb_config 出现 4 个默认配置项，配置中心可见可改
- Agent 执行链路（`/api/chat/stream` → 编排 → `AgentExecutionAccess.execAgent`）：失效绑定资源（Soul/Prompt/Skill/MCP）不再参与执行并被告警记录；LLM 绑定失效时执行明确失败
- `LLMCoreAccess.matchLLM`（全部 Agent 的 LLM 解析路径）：绑定 LLM 被删除/禁用后自动重新匹配，不再返回假记录

**测试**：
- 新增单测：`Base/test/VectorDBProvider.test.ts`（默认配置幂等写入 + 禁用状态重启恢复，17/17）、`Core/test/LLMCoreProvider.test.ts`（绑定失效清缓存重新匹配、不返回合成记录，22/22）
- 全量回归：Base 807/807、Core 192/192、Runtime 36/36、Agent 121/121 全绿；Application 474/476（2 个失败为 `self-learning.test.ts` TC-SL-065/067，属工作区既有未提交改动，与本次 diff 零交集，隔离复跑稳定复现；`visualization.test.ts` 单跑 94/94 通过）
- 端到端冒烟：真实 isolated-vm 沙箱执行 .js Skill `result = params.a + params.b` → 42 通过
- 静态检查：typecheck 5 工作区 0 错；eslint 0 error（0 新增 warning）

**可能存在的问题/风险点**：
- 源码编译兜底要求构建机具备 C/C++ 工具链与 Python 3，首次编译需联网下载 Node 头文件；无工具链的离线环境加载 isolated-vm 将 fail-fast（不再有降级路径）——SEA/便携包通过内置 prebuilt 二进制覆盖 linux-x64/win32-x64/darwin-arm64，darwin-x64 依赖运行时编译
- `execAgent` 的资源校验为逐条 DB 查询（Soul/Prompt/逐 Skill/逐 MCP），绑定数量极大时增加少量延迟；当前量级无感知
- Application 工作区 `self-learning.test.ts` TC-SL-065/067 存量失败（用户未提交的 SelfLearning 改动），建议随该改动一并修复

---

## [2026-09-07] 学习页面前后端联调收尾：增量同步入库 + 前端任务条补渲染 + 全新库初始化崩溃修复 + e2e 装配漂移修复

**变更原因**：继续学习页面开发任务——验证"学习"页面前后端全链路可用并符合 SelfLearning-PRD。实测发现 4 个问题：① 文档学习只认 `self_learning_file` 表存量记录，磁盘上新增的 .md 文件永远学不到（资料库加文件后学习无产出）；② 前端 `LearningPanel` 轮询了学习任务列表（2s）但模板从未渲染（commit 6fc4276 只落了数据管道，任务条 UI 缺失）；③ `SelfLearningSchemaInitializer.init()` 把存量迁移 UPDATE（作用于 self_learning_result）与 chat_session 索引放在建表之前执行，全新数据库（e2e :memory: 库实测复现）直接抛 SQLITE_ERROR("no such table")，学习模块在全新库上无法初始化；④ 前端 e2e 装配 `e2e-server.ts` 仍 import 已删除的 `@brian-agent/orchestration`（V1 编排已删），学习页 e2e 全套无法启动，且 chat/memory 路由按旧式 3 参 `(input, context, output)` 调用新式 Access 方法（Runtime v2 后为 `(input, output, context)`），服务把返回值写到错误对象上，输出全空。

**修改的方法与模块**：
- `Application/SelfLearning/application/SelfLearningService.ts` — `scanLibraryDirectory(libraryId, rootPath, now, skipExisting?)` 新增可选判重集合（命中跳过入库、子目录仍递归）；新增私有 `syncLibraryFiles(libraryId, rootPath, now)`：按 relative_path + file_path（绝对路径，兼容空 relative_path 存量数据）判重，把磁盘新增文件/目录登记为 PENDING，已有记录保持原状态（COMPLETED 不重复学习），磁盘移除不删记录；`startDocumentLearning` 每个 tick 对每个资料库先增量同步再取 PENDING 分页学习。
- `brian-frontend/src/components/panels/LearningPanel.vue` — 补学习任务条渲染（running 优先蓝色脉冲、completed 绿勾、failed 红叉含错误信息、时间 HH:mm:ss，最多 5 条，随 2s 轮询刷新；无任务时整条隐藏）；新增 `visibleTasks/runningTaskCount/taskTime` 派生。
- `Application/SelfLearning/infrastructure/SelfLearningSchemaInitializer.ts` — 存量迁移 UPDATE 移到 `self_learning_result` 建表之后；chat_session 索引包 try/catch（表由 Chat 模块负责建，未就绪时跳过）——全新库初始化不再崩溃。
- `brian-frontend/test/e2e-server.ts` — 删除 `@brian-agent/orchestration` import 与全部 V1 编排装配（保留注释）；ChatAccess 构造改新签名 `(relationDb, infoCore, logger)`；新增真实 `SelfLearningAccess` 装配（依赖与 dev-server 组合根一致：relationDb/infoCore/mqCore/llmCore/evolutorAgent/writerAgent/graphDBAccess/mqAccess/chunkAccess/llmAccess/promptsAccess），learning 全部 11 条路由从硬编码 Mock 改为调真实服务（镜像 dev-server 语义，stop 支持显式 learning_mode 供 e2e 清理定时器）；chat/memory 路由改新式参数序 `(input, output, context)`；`/api/chat/send` 显式 501（submitWork 已删，Runtime v2 发送链路属对话页专项）。
- `brian-frontend/test/learning-page.e2e.test.ts` — progress-enhanced 断言对齐真实契约（mode/running/randomFactor/queueSize/modes，原 status/queue 断言注释保留）；新增 stats 三来源过滤用例与任务注册表用例（start → tasks 登记 running/completed）；afterAll 先 POST stop(ALL) 清定时器再关服务（防 vitest 挂起），server 未定义兜底。
- 顺修 3 处存量 eslint error（unused vars）：`SelfLearningService.soLearningTasks` slice 复用 limit 变量、`SelfLearningAccess` 移除未用 LearningTaskStatus import、`dev-server.ts` 移除未用 LoopQueue import。

**影响的端点**：
- 学习页全部端点（live dev-server 实测 200）：`POST /api/learning/start`、`POST /api/learning/stop`、`PUT /api/learning/mode|auto|random-factor|driver-weights`、`GET /api/learning/tasks|stats|progress-enhanced|queue|knowledge|insights`
- `POST /api/learning/start`（DOCUMENT）行为增强：每 tick 先增量同步资料库目录再学习——磁盘新增文件自动入库学习（实测：新建 incr-e2e-verify.md → 触发后 PENDING→COMPLETED → knowledge 列表可见），存量 COMPLETED 不重学
- `GET /api/learning/tasks`：前端任务条数据源（running 优先、上限 50 条）——此前已实现，本次补齐前端渲染
- e2e 测试服路由（学习 11 条 + chat/memory 若干）：真实服务替换 Mock；`/api/chat/send` 返回 501

**测试**：
- 学习页 e2e：`test/learning-page.e2e.test.ts` **15/15 全绿**（控制启停/模式与配置/统计含来源过滤/进度含新契约断言/成果/任务注册表）
- 全前端 e2e 套件：**83/88**（learning 15 + monitor 15 + config 21 + info 12 + chatMapLayout 6 + chat 14；仅 5 条对话发送用例因 Runtime v2 send 链路未在 e2e 装配而 501，属对话页专项）
- 静态检查：backend typecheck 0 错 + eslint 0 error；frontend vue-tsc 0 错 + eslint 0 error
- live 验证：tsx dev-server 重启后 11 个学习端点全 200；三模式触发任务均登记且 completed；增量同步实测通过；vite HMR 正常编译 LearningPanel

**可能存在的问题/风险点**：
- `self_learning_result` 中存在 `type='DOCUMENT'`（source=文件名）的"文件学习记录"行与 `type='TAG_MAINTENANCE'` 维护记录行，均超出 PRD 5.5 的 type ENUM（KNOWLEDGE/INSIGHT）——它们是"总学习次数/学习趋势"的数据源且信息页 Tag 卡片依赖 source 词表（cfb2001），本次不改语义，已在 PRD 增补说明
- e2e 装配中对话发送链路（RunGateway/streamAccess/session）未接，`POST /api/chat/send` 501——对话页专项补齐
- `syncLibraryFiles` 每 tick 对每个资料库做一次全表 select 判重；资料库极大时（万级文件）可换索引/缓存，当前量级无感知

---

## [2026-09-05] 融合架构：Report 参数 = 上报端点的管理对象，Bus 保留事件流的持久化/断线恢复/审计

**变更原因**：用户决策——融合"Report 直推"与"Bus 事件流"两个方案：Report 参数作为**上报端点的管理对象**（端点注册、断线恢复、在线投递），Bus 保留**数据的保存（持久化）、断线恢复、审计**等事件流功能。此前 Report 通道建而未通（全仓无 channel 接线，6 类 Runtime 业务事件上报全部 no-op），SSE 依赖 ChatService 手工 registerProjection 桥接且有订阅泄漏。

**修改的方法与模块**：
- `Base/shared/base/Report.ts` — 新增 `ReportEventPublisher 接口（publish/registerEndpoint/unregisterEndpoint，Base 定义接口、Runtime 实现注入，不反向依赖）；Report 新增 `session_key/run_id 字段与 **`attachEventPublisher/detachEventPublisher`（端点管理：重复注册先注销旧端点；child 派生共享端点）；`pushBusinessEvent 语义升级：有发布器 → fire-and-forget 落 Bus（持久化+端点扇出）；无发布器 → 退化为 channel 直推（旧行为）；两者皆无 → no-op。
- `Runtime/Bus/application/BusEndpointManager.ts（新增）— ReportEventPublisher 的 Bus 适配：registerEndpoint = registerProjection（durable：先重放 after_seq 之后事件再尾随）、publish = publishEvent（持久化/审计/seq）、unregisterEndpoint。经 Bus/index 与 Runtime/index 导出。
- `AopProxy 自动创建 Report 补 session_key/run_id 回填（从 Input 提取，供事件流定位）。
- `Application/Chat/ChatService.openChatStreamV2 — 接线改造：构造 channel 级 Report（session_key=外部会话 id）+ attachEventPublisher（after_seq=会话最新 seq，deliver=v2 桥接）；report 传入 submitRun → Runs → Loop（此前 no-op 的 run.accepted/run.status/part.created/part.delta/tool.launch/tool.result 全部激活）；**手工 registerProjection 删除（由 attachEventPublisher 取代），请求结束 finally detachEventPublisher（顺带修复投影订阅泄漏）；`ChatRuntimeV2Deps 增加 endpointManager；`dev-server 组合根注入 BusEndpointManager。
- 文档：Bus-PRD 增补「融合架构」落地差异节；DevStandards §3 更新 Report 上报语义。

**语义核对**：单一投递路径 —— 业务 → report.pushBusinessEvent → Bus（持久化/审计）→ 扇出 → Report 端点（SSE）与其余订阅者；detach 后不再投递；未 attach 的 Report 行为与历史版本一致。

**测试**（全仓 1907 全绿：Base 802 + Core 198 + Runtime 42(+3) + Agent 121 + Orchestration 212 + Application 532；typecheck 0 错）：
- 新增 `Runtime/test/ReportEndpoint.test.ts（3 用例）：pushBusinessEvent 经发布器落 Bus 且端点收到（持久化可重放=审计）；端点注册先重放历史事件再尾随新事件（断线恢复）；detach 后不再投递、未 attach Report 保持 no-op。

**可能存在的问题/风险点**：
- pushBusinessEvent 为 fire-and-forget，发布失败静默（Report 无 logger；Bus 写库失败时该事件丢失——与既有 Bus 直调路径的 catch 告警策略不同，后续可统一）；
- 桥接 deliver（v2 事件→SSE 名）保留在 ChatService，前端 v2 原生归约改造后与 Report 端点一并收敛；
- 多标签页同会话：每请求各自 attach 端点（Bus 支持多投影订阅者），天然支持。

---

## [2026-09-05] 日志级别参数化：调用 LogProvider 保存日志显式携带级别参数；AOP 切面调用记录定为 DEBUG 级别

**变更原因**：用户设计——调用 LogProvider 保存日志时需要增加日志级别的参数（此前级别隐含在 debug/info/warn/error 方法名中，Metrics.saveInvocation 写 INFO）；AOP 切面的调用记录应为 **DEBUG** 级别（同时解决上一变更引入的"每次方法调用落 1 条记录"的体量问题：默认 min_level=INFO 时 DEBUG 自动过滤）。

**修改的方法与模块**：
- `Base/shared/aop/AopProxy.ts` — `Logger` 接口新增可选 **`log(level, message, meta?)`**（级别参数化保存入口）；`ConsoleLogger` 实现 `log`（按级别分发输出）。
- `Base/shared/base/Metrics.ts` — `MetricsLogger` 接口同步新增 `log(level, …)`；新增私有 `logAt(level, …)`：优先 `logger.log(level, …)` 显式携带级别，logger 未实现 `log` 时按级别回退 debug/info/warn/error；`saveInvocation` 改为 **DEBUG 级别**（经 logAt）。
- `dev-server.ts` — `createLogger` 返回的 logger 补 `log(level, message, meta)` 入口（级别直传既有 write → LogService.addLog，落库仍由 log_config.min_level 统一控制）。
- `Base/test/MetricsInvocation.test.ts` — 新增用例：logger 实现 `log(level,…)` 时 AOP 调用记录显式携带 DEBUG 级别参数；原用例断言回退路径（无 log 实现 → debug 方法）级别为 DEBUG。

**语义**：AOP 切面调用记录（saveInvocation）= DEBUG 级别 + JSON 全参数内容；默认 `log_config.min_level=INFO` 不落库，排查问题时把 min_level 配置调整为 DEBUG 即开启全量调用记录（级别过滤在 LogService.shouldDropByMinLevel 统一执行）。

**测试**（全仓 1904 全绿：Base 802(+1) + Core 198 + Runtime 39 + Agent 121 + Orchestration 212 + Application 532；typecheck 0 错）。

---

## [2026-09-05] Metrics 日志网关：方法内与 AOP 切面日志统一经 Metrics 保存（JSON 格式），AOP 在返回/抛异常时采集全部参数内容

**变更原因**：用户设计——Metrics 对象封装 LogProvider 调用接口，方法内与 AOP 切面的日志保存都通过 Metrics 对象进行；日志以 JSON 格式保存；AOP 切面的日志保存时机为方法**返回或抛异常**，此时采集方法调用的所有参数及参数内容。此前 AOP 内置切面仅失败时经裸 logger 记录（无参数内容）、LogInterceptor 仅记失败、成功路径无任何调用记录。

**修改的方法与模块**：
- `Base/shared/base/Metrics.ts` — 新增 `saveInvocation({targetName, methodName, status, error, args})`：以 JSON 采集方法调用的全部参数（Input/Output/Context/Metrics/Report）及参数内容，经 logger → LogService.addLog 持久化（log_record.metadata.invocation_json）；新增静态 `safeSerialize`（函数/符号→'[fn]'、循环引用→'[circular]'、深度>6/单值超长截断，序列化失败回退摘要）——Report.channel 等不可序列化成员不破坏 JSON。
- `Base/shared/aop/AopProxy.ts` — 内置日志切面重写：`afterExecute`（切入点 4）在**成功与失败双路径**均经本次调用的 Metrics 实例调用 `saveInvocation`（ctx 已携带全部参数）；旧式 3 参签名（无 Metrics）退化为仅错误日志（旧行为）。
- `Base/LogProvider/interceptor/LogInterceptor.ts` — 与内置切面对齐：方法返回/抛异常时保存调用记录（有 Metrics 走 saveInvocation，旧式签名退化仅错误日志），保留 shouldLog 白名单闸门与 fire-and-forget；文件头设计说明同步。
- `Runtime/Loop/AgentLoopService` + `Runtime/Runs/RunGatewayService` — 方法内日志切换 Metrics 试点：LoopRunContext 增加 `metrics`（execAgentLoop 第 4 参贯通），publishPartDelta/settleLoop 的告警与 executeRun 的错误日志改经 `metrics.warn/error`。
- `docs/_1_DevStandards/DevStandards.md` §7 — 修订为「Metrics 日志网关」：Metrics 是日志唯一保存网关；方法内日志用第 4 参 metrics；AOP 切面在返回/抛异常时经 saveInvocation 以 JSON 采集全部参数内容；体量由 log_rule 白名单 + min_level + 日志老化约束。
- 新增 `Base/test/MetricsInvocation.test.ts`（2 用例）：saveInvocation JSON 采集（函数/循环引用安全、参数内容可断言）；AopProxy 成功/抛异常双路径均经 Metrics 采集全部参数内容。

**日志保存格式**：log_record 结构化列（level/source/message/trace_id/elapsed_ms…）+ `metadata` JSON 列承载调用记录全文（`invocation_json` = {method, status, error, elapsed_ms, args:{input,output,context,metrics,report 内容}}）。

**可能存在的问题/风险点**：
- 每次经 AOP 的方法调用现在产生 1 条调用记录（info 级）；体量由 min_level（低于阈值静默丢弃）、log_rule 白名单（LogInterceptor 路径）、日志老化三重约束——上线后建议按模块收敛 log_rule 白名单；
- 5 参方法体内仍有 ~77 处 `this.logger?.` 调用待按同一模式切换为 `metrics?.`（涉及私有辅助方法的 metrics 透传），本轮完成机制、规范与 Runtime 试点，其余按模块机械迁移；
- 3 参旧式调用（如各 `initialize()`）无 Metrics 实例，维持仅错误日志的旧行为。

---

## [2026-09-05] Agent 选择流程闭环：matchAgent 匹配最佳 Agent → 失效概率/未命中触发 Agent 重构 → match×4 选组件 → LLM 生成说明沉淀匹配依据

**变更原因**：用户流程定义——`matchAgent` 匹配最佳 Agent；匹配不上、或按一定失效概率时进行 **Agent 重构**；重构调用 Soul/Prompt/MCP/Skill 的 match 结构选择最合适组件，并**为新 Agent 生成说明**（该说明是后续 matchAgent 的匹配依据）。此前说明（agent_purpose）不参与匹配、失效概率语义不完整（概率失效后仍可能被 LLM 层复用）、重构时无 Prompt 选择、说明为拼串而非生成。

**修改的方法与模块**：
- `Agent/AgentLibrary` — `matchAgent` 语义升级：① **说明参与匹配**（第一层取 `similarity(task_signature)` 与 `similarity(task_content, agent_purpose)` 的最大值——说明即沉淀的匹配依据）；② **失效概率一次判定**（`MatchAgentOutput` 新增 `matched`/`regenerate`：命中但失效概率命中 → `matched=true, regenerate=true, agent_id=''`，不再落入 LLM 层复用，交由调用方重构）；③ 未命中 → `matched=false` 触发重构。
- `Agent/AgentBuilder` — `buildAgent` 成为流程闭环入口：非 force_new 时先 `matchAgent`，命中且未失效 → 复用（记 usage + `agent_matched` 事件）；未命中/失效 → **Agent 重构**：任务分析 → matchStrategy/matchLLM → **matchSoul/matchSkill/matchMCP（纯选择）+ 新增 Prompt 选择**（`matchPromptForAgent`：经 PromptsAccess 取启用模板，simpleSimilarity 对任务/领域与 模板名+摘要 打分取最优，无候选回退空串由执行侧内置兜底）→ **`generateAgentPurpose` LLM 生成说明**（基于任务+领域+人格/技能/MCP 清单生成 50 字内说明，LLM 失败回退拼串兜底）→ 绑定（含 prompt_template_id）落 agent 表。说明写入 agent_purpose，供下一次 matchAgent 匹配。
- 约束保持：绑定唯一事实源仍为 agent 表（上一变更）；Runtime v2 声明式链路（matchAgentDef，确定性、无随机）不受影响——本流程作用于 Agent 模块自有链路（buildAgent 由 EvolutorAgent/编排调用）。

**测试**（全仓 1901 全绿：Base 799 + Core 198 + Runtime 39 + Agent 121(+2 流程) + Orchestration 212 + Application 532；typecheck 0 错）：
- 说明参与匹配（签名刻意不匹配、说明与任务高重叠 → 命中 SIMILARITY）；
- 失效概率确定性验证（regen_rate=100 → 命中也输出 `regenerate=true, agent_id=''`）。

**可能存在的问题/风险点**：
- `generateAgentPurpose` 依赖 LLMAccess 质量；LLM 不可用时回退拼串说明（匹配面变窄）；
- 失效概率重构会创建新 Agent（旧 Agent 保留，由 ageAgent 老化回收）——长期高频重构需关注 agent 数量增长（`max_agent_count` 配置已存在）。

---

## [2026-09-05] 绑定关系收权：Agent↔Soul/Skill/MCP/Prompt 绑定唯一事实源收敛至 agent 表，Core 选择流程纯化

**变更原因**：用户设计决策——Agent 与 Soul/MCP/Skill/Prompt 的绑定关系此前散落在 Core 层绑定表（agent_soul/agent_skill/agent_mcp）+ MatchCacheHelper 缓存，Base 层资源模块与 Agent 模块对绑定状态各持一份认知；按"绑定关系只放 Agent 保存表、由 Agent 模块评估决定绑定/解绑"的原则收敛，同时消除 SkillCore 与 Base SkillProvider 共用 skill_usage 表的双 schema 冲突。

**目标架构**：
- **绑定唯一事实源 = agent 表**（Agent/AgentLibrary 所有）：新增列 `skill_ids_json` / `mcp_ids_json` / `prompt_template_id`（soul_id 已有；ALTER 兼容迁移）；`AgentLibrary` 新增绑定 API `bindAgentComponent` / `unbindAgentComponent`（5 参，`ComponentKind` 枚举 Soul/Skill/Mcp/Prompt；bind 为同 kind 全量替换的幂等 upsert，unbind 缺省解绑该类全部）；`delAgent` 清理简化（不再删 agent_skill/agent_soul/agent_mcp 行）。
- **Core 选择流程 = 纯选择（零绑定持久化）**：`matchSoul/matchSkill/matchMCP` 删除 checkMatchCache/clearMatchCache/persistMatchBinding；Input 新增 `bound_soul_id/bound_skill_ids/bound_mcp_ids` —— 调用方传入 agent 表既有绑定时确定性水合（失效 id 自动过滤），不传则按任务纯选择（Runtime v2 语义）；`optSoul/optSkill/optMCP` 只记 usage（评估依据，键换为 (agent_id, component_id)），不再 upsert 绑定；`ageSkill/ageSoul` 改为**输出解绑候选**（stale_skills/stale_souls，按 opt 规则窗口内低使用统计，不删除——解绑动作由 Agent 模块执行）；agent_soul/agent_skill/agent_mcp 表停止创建（旧库残留不读写），soul_core_usage/agent_mcp_usage 检测旧键自动重建，**Core SkillCore usage 表更名 `skill_core_usage`**（skill_usage 表名归还 Base SkillProvider，根治共表冲突，real-test-helpers 的 addColumn hack 移除）。
- **Agent 模块评估驱动绑定/解绑**：`AgentBuilder.buildAgent` 匹配结果直接落 agent 表（addAgent 初始绑定）；`optimizeAgent`（由 EvolutorAgent 评估后触发）完整承担"评估 → 绑定/解绑"：先 ageSkill/ageSoul 输出低使用候选并解绑（changes 记录 from→''），再重新 match 并整组重绑（skill/mcp diff 增删、soul 经 A/B 裁决 verdict 后重绑）；`AgentExecution.loadSkills/loadMcps` 改为经 `soAgent` 读 agent 表绑定后传 bound ids 水合（Core 不再持有绑定状态）；`OrchestrationVisualization` 组件引用改读 agent 表 JSON 列。MatchCacheHelper 保留（仅 LLMCore 使用——LLM 绑定按既有设计留在 LLMProvider agent_llm，不在本次四组件范围）。

**影响的端点**：无 HTTP 协议变化；skill_core_usage 旧表数据不迁移（usage 历史重置，评估冷启动）。

**测试**（全仓 1899 全绿：Base 799 + Core 198 + Runtime 39 + Agent 119(+3 绑定 API) + Orchestration 212 + Application 532；全链路 typecheck 0 错）：
- 新增 `Agent/test/agent-library-binding.test.ts`：全量替换 upsert / 单值绑定与缺省全解绑 / 幂等 / 未知 agent fail-loud；
- Core 3 套件绑定断言改写为"bound 水合 + 纯选择 + usage 记账"语义；Orchestration/Agent 测试夹具 DDL 同步新列。

**可能存在的问题/风险点**：
- 旧库的 agent_soul/agent_skill/agent_mcp 残留表与其中历史绑定不再迁移（绑定关系由 optimizeAgent 评估重建）；usage 历史重置；
- MCP 无 ageMCP（无 opt 规则表），其解绑仅由 match-diff 驱动；
- `optSkill` 输出 `binding.id` 恒为空串（兼容保留字段），下游如依赖绑定 id 需改走 agent 表。

---

## [2026-09-05] Runtime v2 逐方法审查修复：枚举注册 + Report 业务事件通道 + Runs 排队语义修复 + 规范对齐

**变更原因**：Runtime v2 逐方法规范审查（对照 DevStandards/DDDStandards + 六份 Runtime PRD）发现 18 项问题：2 项功能缺陷（排队 run 双记录致 waitRun 永久挂起；interrupt 入队与结算排水竞态）、5 项规范违反（Application 行内 SQL 直查、`as unknown as` 断言、跨模块直查 soul/agent 表、session_id 语义错位、insert 手写样板）、11 项一致性/性能问题；另有两项新规范落地：有限值域一律 Enum 注册、业务事件一律经 Report（StreamProvider）上报且以 Enum 注册。

**修改的方法与模块**：
- `Base/shared/base/BusinessEvent.ts`（新增）— **业务事件全库唯一注册点**：11 类 v2 事件协议以 Enum 注册 + `businessEventMsgType`（msg_type 映射）；`Report.pushBusinessEvent(event, data, meta)` 新增（底层 StreamProvider，无流会话静默降级 no-op）；
- `Core/SoulCoreProvider` — 新增 `soSoulContent`（按 id 读 Soul 内容，走 SoulAccess；供声明式 Agent 快照，替代跨模块直查 soul 表）；
- `Runtime/shared/` — `AbortReason/RunPhase` 枚举 + `DEFAULT_BUDGET_TOTAL` 常量收敛（消除 60 魔数 4 处散落）；删除 `BUDGET_GRACE_MARKER`（宽限收尾由 Loop finalTurn 收工具实现，标记常量为死代码）；`RuntimeConfigTable` 收敛组合根 v2 开关表 DDL；
- `Runtime/Runs/` — **修复①**：排队 run 结算**复用原 run_id**（queued 行 patch 转 running，消除双记录孤儿行，`waitRun(queued_run_id)` 不再永久挂起）；**修复②**：interrupt **先入队后 abort** + `maybeDrainLane` 双侧兜底复核（PRD §4.3 排水竞态防护落地）；`QueueMode/RunStatus` 枚举化（含 collect 注册，入队显式抛错）；`runtime_run.session_id` 统一落 `runtime_session.id`（submitRun 内幂等解析）；`submitRun` 发布 `run.accepted` 事件；Report 贯通（submitRun→executeRun→execAgentLoop/matchAgentDef/soAgentSnapshot）；`drainSteeringFor/takeFollowupFor` 去掉 `as unknown as` 双断言（service 方法本为 public）；
- `Runtime/Loop/` — `LoopStopReason` 枚举；Report 贯通（run.status/part.created/part.delta/tool.launch/tool.result 经 `pushBusinessEvent`，Bus 持久化不受影响）；`part_type/role/status` 枚举化；外部 signal reason 白名单归一（未知原因 → user，不再裸 cast）；
- `Runtime/Session/` — **移除忙锁**（`ensureRunState/releaseRunState` + sessionBusyLock，并发 1 由 Runs lane 唯一承担）与 `appendPartContent`（无调用方，`updatePart.content_patch` 即 delta 语义）与 `MessageData` 死类型；`MessageRole/SessionStatus/PartType/PartStatus` 枚举化；`token_usage` → `token_count` 列更名（RENAME COLUMN 兼容迁移，与 Part 表同名同义）；`configSession` 支持 enabled 启停（修复错误信息引用不存在的 enableSession）；`soMessages` SQL 分页下推 + Parts `IN` 批查（消除 N+1 与内存分页）；`addSession` 落账 id 取 `newRecord` 首字段（去掉插入后回查）；
- `Runtime/Bus/` — 事件类型改挂 `BusinessEvent` 枚举（Runtime 本地 union 保留别名）；新增 `soEventLastSeq`（投影起点定位，**替代 Chat 直查 runtime_event 的行内 SQL**）；`nextEventSeq` 取 MAX 改 SQL LIMIT 1（不全量载入）；`payload_json` 解析加守卫（坏行回退空对象不阻断重放）；insert 样板改用 `newRecord`（删除误导性 `newPatchEvent`）；
- `Runtime/Tools/` — `ToolResultStatus` 枚举；zod v3 内省收敛至 `zodDef/zodShape`（12 处 `as unknown as` → 单一逃逸口）；`CDT_CONTENT_MAX` 语义收窄（skill/mcp 走默认截断）；
- `Runtime/Agents/` — `AgentMode/AgentDefStatus/AgentMatchLayer` 枚举化；构建落账取名/用途经 **AgentLibraryAccess**（删除直查 agent 表）；Soul 内容经 **SoulCoreAccess.soSoulContent**（删除直查 soul 表）；`insertDefFromAgent` 落账 id 取插入记录（消除按 agent_ref 回查取错行风险）；`declareAgent` id 同改；`AgentsSchemaInitializer.init` 与其余模块统一为同步；
- `Application/Chat/ChatService` — `soSessionLastSeq` 改经 `EventBusAccess.soEventLastSeq`（消除 Application 行内 SQL + 静默吞错）；投影事件比较枚举化；**顺手修复 HEAD 遗留编译错误**（`placeholders` 作用域错位致全量 typecheck 不通过）；
- `dev-server.ts` — AgentDefAccess 注入 agentLibrary；runtime_config DDL 收敛至 `ensureRuntimeRootConfigTable`；
- **Base 源码树清理**：删除 97 个就地生成的编译产物（`*.js/*.js.map/*.d.ts/*.d.ts.map`，outDir 已为 dist 的历史遗留）——**根因修复 Base 测试 5 个 instanceof 断言失败**（源码内 `.js` 遮蔽 `.ts` 导致同类双副本）；
- **文档**：Runs/Session/Tools PRD 增补「落地差异」节（分阶段边界与本轮修复记录）；Session-PRD 移除忙锁/appendPartContent 方法行；DDDStandards 注记 Runtime 模块方法长度按其 PRD ≤40 执行。

**影响的端点**：
- `POST /api/chat/stream`（v2 链路）— steer 语义不变；新增 `run.accepted` 持久化事件（前端无感）；其余 SSE 协议零改动。

**测试**（Runtime 41（+2 排水回归）+ 全仓 799 全过；全链路 typecheck 0 错；方法行数零超限）：
- `Runtime/test/RuntimeGateway.test.ts`：**followup 排队复用 run_id**（queued→running→finished 同一记录，无孤儿 queued 行）/**interrupt 入队-结算竞态**（maybeDrainLane 兜底，不留卡死队列）。

**可能存在的问题/风险点**：
- `runtime_message.token_usage` → `token_count` 靠启动时 RENAME COLUMN 迁移；SQLite 低版本（<3.25）不支持 RENAME COLUMN 时迁移静默跳过（旧库该列名保留，代码读写将报错，需手动迁移）；
- `waitRun` 未注册 run 仍兜底返回 `running`（测试固化的既有决策，如需语义精确化建议改 output.error，阶段4 评估）；
- 内置工具执行中不支持中途取消（Base/Core Input 契约暂无 signal 字段，见 Tools-PRD 落地差异 2）；
- Bus 事件 seq 缓存/会话 seq 缓存为实例 Map 无上限（单进程长周期内存风险低，阶段4 与 compaction 一并评估）。

---

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

## [2026-09-11] 组件绑定收敛：def 命中即复用绑定 + 删除 Runtime 侧重复的 regen 概率判决
**变更原因**：复盘 session `27890105`（"今天适合穿什么衣服"）26s 慢响应：① Runtime `applyRegenDecision`（regen_rate 概率推翻 L1/L2 复用）与 Agent 层 `AgentLibraryService.matchAgent` 的 regen_rate 失效判决同义重复（且两处 `shouldReuseByRegenRate` 语义相反）；② def 已命中仍经 Core matchSoul/matchSkill/matchMCP 按任务动态重解析组件——按约束"命中即绑定，无绑定就是没有"，两者都应删除。
**修改的方法**：
  - `Runtime/Agents/application/AgentDefService` —
    - `matchAgentDef(input, output, context, metrics?, report?)` — 原始代码（regen 版，已注释保留）：
      ```
      await this.applyRegenDecision(input);
      const exact = input.regenerate ? null : this.soExactMatch(...);
      const signatureHit = input.regenerate && !input.force_new ? null : this.soSignatureMatch(...);
      ... output.regenerate = input.regenerate === true;
      ```
      修改后：命中即复用（exact/signature/llm → def），无概率推翻、无 regenerate 输出。
    - `applyRegenDecision(input)` — 注释弃用（原方法已注释保留）；"重新生成概率"唯一实现收敛于 Agent 层 `AgentLibraryService.matchAgent`（regen_rate 失效判决 → AgentBuilder 重构）。
    - `soAgentSnapshot(...)` / `soSoulContent(...)` / `soSnapshotTools(...)` / `appendMcpEntries(...)` — 原始代码（动态 match 版，已注释保留）；修改后：soul 只读 `def.soul_id`（无绑定即空）、tools 只读 `def.tools_json`（无绑定即无工具），不再调用 Core 组件匹配，`bypass_cache`/`regenerate` 透传删除；`skill.selected`/`mcp.selected` 仅 `tools_json` 显式绑定时上报（source='explicit'）。
  - `Runtime/Agents/domain/types.ts` — `MatchAgentDefInput/Output.regenerate`、`SoAgentSnapshotInput.regenerate` 注释弃用（原字段已注释保留）。
  - `Runtime/Runs/application/RunGatewayService.soSnapshot(...)` — 删除 regenerate 透传参（原方法已注释保留）。
  - `Runtime/test/RuntimeGateway.test.ts` — 断言改锁"def 无 soul 绑定 → system 无 Soul 段且 matchSoul 不被调用"。
**影响的端点**：
  - `POST /api/chat/stream` — e2e 实测（"你是谁"，signature 命中）：run 全程 1.4s（修复前 26s）；无 regen 判决、无组件匹配调用；def 空绑定时不再上报 skill.selected/mcp.selected。
**可能存在的问题**：
  - skill/mcp/soul 此后只能经 def 显式绑定（构建/declareAgent）获得，LLM 侧不再有组件级"选择"能力；
  - 运行中服务加载的是 `@brian-agent/runtime` dist 产物，需重跑 `npm run build --workspace=@brian-agent/runtime` 并重启后端才生效。
