# Brian Agent 对话页面产品需求文档 (PRD)

## 1. 文档概述

| 项目 | 内容 |
| :--- | :--- |
| **产品名称** | Brian Agent |
| **功能模块** | 对话交互页面 (Chat Interface) |
| **版本号** | V2.0 |
| **文档状态** | 正式发布 |
| **优先级** | P0 |

## 2. 功能目标
构建基于 Block-Native 架构的对话交互界面，实现内容数据与视觉展示的彻底解耦。通过标准化的块级渲染引擎支持异构内容（文本、思维链、工具调用、产物预览）的统一流式展示；结合 ChatMap 可视化与消息关联关系元数据，帮助用户理解 AI 思考链路及消息间的逻辑引用；提供高性能、可扩展、具备无障碍支持的会话管理与反馈机制。

## 3. 页面布局与结构

### 3.1 整体架构
-   **双栏自适应布局**：左侧 ChatMap 区（默认 40%）+ 右侧对话区（默认 60%）。
-   **分隔交互**：中间设置 `ResizableDivider`，支持鼠标拖拽调整左右宽度比例，最小宽度限制需防止内容挤压。

### 3.2 响应式规则
-   当窗口宽度 < 1024px 时，ChatMap 区默认折叠或转为悬浮面板模式。
-   对话输入区宽度始终占对话区宽度的 80%，居中显示。

## 4. 详细功能需求

### 4.1 对话输入区 (Input Zone)

| 字段/组件 | 类型 | 规则/逻辑 | 备注 |
| :--- | :--- | :--- | :--- |
| 输入框 | Textarea | 1. 占位符："输入消息..."2. 高度自适应，Max-height: 200px3. Enter 发送，Shift+Enter 换行 | 需防抖处理 |
| 引用标签 | Tag | 选中历史消息后在输入框上方显示摘要，支持点击 × 移除 | 多选时横向排列 |
| 发送按钮 | Icon Button | 1. 默认蓝色，空内容禁用(灰色)2. 发送中显示 Loading 动画 | 状态机管理 |
| 乐观更新 | - | 提交后立即构造临时 UserTextBlock 插入列表尾部，待服务端返回正式 Block ID 后替换 | 提升体感速度 |
| 会话初始化 | API | 发送前通过 `ensureSession()` 确保会话有效：若已有会话 ID，先调用 `getSessionDetail()` 校验其是否真实存在于后端（404 则视为失效并重新创建），否则调用 `createSession()` 在后端创建会话；禁止前端本地拼造 session_id（如 `session-${Date.now()}`），否则后端校验 session 不存在而报错 | 会话 ID 由后端 `IdGenerator.generate()` 生成 |
| TraceId | - | 每次发送消息前由前端生成 `trace_id`（`crypto.randomUUID()`），随请求体透传到后端，后端贯穿整条处理链路并回写到 SSE 事件（`connected`/`done`/`error`）；前端将本次对话的 trace_id 挂载到 FeedbackBlock/ErrorBlock 供复制 | 用于问题排查与日志检索 |
| 提交接口 | API | `submitWork(session_id, msg_content, citing_msg_ids, trace_id)`（流式走 `openChatStream` → `POST /api/chat/stream`） | 发送成功后清空输入框 |

### 4.2 ChatMap 可视化区

-   **渲染引擎**：基于 DOM + SVG 渲染，支持富交互（复选框、展开列表、钉住开关、连线与节点高亮选择）。
-   **排布算法**：
    -   **顺序问答**（默认，提问未通过复选框复选上下文）→ 纵向顺序排布：`问题1 → 回答1 → 问题2 → 回答2`（回答放在提问正下方，同一列，按时间依次向下）。
    -   **引用问答**（提问通过复选框复选了内容）→ 横向展开：引用的问题框放在被引用消息的右边（X 轴偏移，引用方位于被引用方右侧），且引用问题框的顶部与被引用消息中「最靠下（y 最大）」的那一个顶部对齐；引用的问题与其回答仍上下紧邻。
    -   **追问**（未复选上下文但衔接上一轮回答）→ 按纵向排布，追问放在上一回答正下方，仍保留一条指向上一回答的向下连线（FOLLOW_UP）。
    -   连线与锚点规范：
        -   **回复关系**（QUESTION_ANSWER）与**追问关系**（FOLLOW_UP）：从来源方（上一消息）底部中点 `(x + W/2, y + H)` 指向目标方顶部中点 `(x + W/2, y)`，箭头向下；
        -   **引用关系**（CITATION）：从**被引用方**右边中点 `(x + W, y + H/2)` 指向**引用方**左边中点 `(x, y + H/2)`，箭头向右进入引用方左侧；
        -   **同向连线唯一性**：两个消息展示框之间在同一方向上严格保持单一连线，当同时存在问答回复与引用关系时自动去重，杜绝重复多余连线。
-   **选中与联动高亮**：
    -   **选中消息展示框**：点击消息卡片使其高亮聚焦（`ring-2 ring-brian-blue`）；该节点关联的所有连线变色联动高亮（其发出的被引用连线显示为紫色 `#8b5cf6`，其接收的引用连线显示为天蓝色 `#0284c7`），其余无关连线半透明淡化；
    -   **选中连线**：点击任意连线（含 14px 隐形点击响应热区），仅当前被点击的连线加粗变色高亮（`#2563eb`），其他连线与节点保持原样；
    -   **取消选中**：点击画布空白区域重置所有选中态与高亮样式。
-   **消息框结构一致性**：ChatMap 区与对话区复用同一消息框组件（`MessageCard`），结构完全一致（顶部栏 = 时间/错误标识/复选框/钉住开关；内容区 = 摘要 + 原文双区；底部栏 = 引用/被引用胶囊、思考过程按钮、评估结果按钮、复制 TraceId、消息长度）。摘要与原文双区均支持折叠/展开，且均渲染 Markdown 内容；两区差异仅通过 `mode` 样式覆盖区分（字号、最大高度、配色）：
    -   **ChatMap 区**（`mode=map`）：默认展开**摘要**、折叠**原文**（折叠时仅显示标签行，可手动展开）；
    -   **对话区**（`mode=timeline`）：默认展开**原文（Markdown 全文）**、折叠**摘要**；
    -   **折叠/展开可交互**：用户可随时手动切换任意一区的展开状态，折叠状态由响应式状态保存，不受组件重渲染影响；摘要为空时回退原文展示，双区均为空时摘要区显示「(无内容)」。
-   **节点内容**（与右侧对话列表内容一致）：消息产生时间、消息摘要、消息原文（默认折叠）、消息引用消息数量（胶囊内数字，点击展开引用消息摘要列表，可跳转到指定消息）、消息被引用消息数量（胶囊内数字，点击展开被引用消息摘要列表，可跳转）、钉住/解开钉住开关（右上角）、复选框（右上角钉住按钮旁，用于勾选指定本次问答的专属上下文，勾选后仅基于复选消息与钉住消息进行问答，问答完成后自动取消勾选）、消息长度。
-   **错误展示与引用关系**：
    -   **错误全域展示**：即使执行报错，错误回复也会保存并在 ChatMap 区（红色边框与警告标识）和对话区（ErrorBlock/错误卡片）完整展示；
    -   **问答引用关系**：一次问答天然构成一次引用和被引用关系（系统回复作为引用方自动引用用户的提问）；提问框下方的引用胶囊与 ChatMap 节点中的引用/被引用计数均如实计入并可双向跳转追溯。
-   **交互能力**：
    -   画布：支持 Pan (拖拽平移) + Zoom (滚轮缩放)。
    -   节点点击：右侧对话列表滚动定位到对应消息并居中；对话列表点击消息：ChatMap 平移使对应节点居中并高亮。
-   **数据联动**：ChatMap 节点与对话区消息基于同一套 `info_id` 体系进行双向同步。
-   **数据加载**：页面挂载（onMounted）时若有当前会话，自动调用 `getVisualizedMessageDAG`（`/api/visualization/message-dag`）加载消息关系图谱（一问一答 + 引用 + 引用/被引用计数 + 钉住状态）；每轮对话结束（done/error）后再次刷新。
-   **空态**：无节点时显示「暂无 ChatMap 数据」占位，提示发送消息后生成对话图谱。

### 4.3 对话内容展示层 (Block-Native Message Stream)

#### 4.3.1 展示架构原则
-   **块级原子化**：所有消息内容均抽象为标准 `Block` 对象序列进行渲染，禁止直接渲染原始 Markdown 字符串。
-   **数据视图解耦**：展示层仅消费符合《Block 数据消费契约》的标准化数据，不感知后端 Agent 编排逻辑。
-   **增量流式更新**：采用 SSE 事件驱动 Block 的插入、追加与状态变更，支持帧率缓冲合并，保障生成流畅度。

#### 4.3.2 消息容器与时间序展示
-   **虚拟化列表**：消息列表采用虚拟化滚动容器，仅渲染视口内及预加载区的 Block，支持动态高度测量与缓存，杜绝布局抖动。
-   **时间序列基准**：消息容器严格按 `timestamp` 升序排列 Block 组。每个消息组（Message Group）包含一个或多个语义相关的 Block。
-   **智能锚定**：
    -   当最新 Block 处于流式生成态且用户视口位于底部阈值内时，自动跟随滚动。
    -   用户主动上滑超出阈值后，立即解除自动跟随，直至手动回到底部。
-   **角色区分**：通过 Block 元数据中的 `role` 字段（user/assistant/system）驱动差异化容器样式（左对齐浅蓝底 / 右对齐白底），而非硬编码消息类型。
-   **消息复选框**：对话区和 ChatMap 区每一条消息展示框右上角（钉住消息按钮旁边）内置复选框。用户勾选任意消息后，本次提问仅以复选的消息和已钉住的消息作为上下文传给后端；输入区提示当前勾选条数；本次问答完成后，复选框自动取消勾选。

#### 4.3.3 关联关系展示规范
消息间的引用与关联关系通过 Block 数据契约中的关系字段进行可视化表达：

| 关联类型 | 数据载体 | 展示形式 | 交互行为 |
| :--- | :--- | :--- | :--- |
| 消息引用 | TextBlock.meta.citing_ids | 在文本块顶部渲染“引用标签条”，显示被引用消息摘要 | 点击跳转定位到被引用块 |
| 被引用计数 | Block.meta.cited_count | 在块左下角渲染计数徽章，数字 > 0 时可见 | Hover 显示引用来源列表 Tooltip |
| 思维链归属 | ThinkingBlock.meta.parent_msg_id | 以缩进+左侧边框样式吸附于父消息下方，默认折叠 | 展开/收起具备平滑过渡动画 |
| 工具调用关联 | ToolCallBlock.meta.related_block_id | 以卡片形式内联于消息流中，通过虚线连接相关文本块 | 点击卡片展开完整参数与返回值 |
| 跨消息线程 | RelationLineBlock | 独立的关系连线块，在消息列表中插入视觉分隔与引导线 | 点击可高亮关联的两端消息块 |

#### 4.3.4 内置 Block 类型应用规范

| Block 类型 | 应用场景 | 关键展示规则 |
| :--- | :--- | :--- |
| TextParagraph | 用户消息、Agent 最终回复 | 支持富文本行内样式；流式生成时末尾显示闪烁光标；完成后光标淡出；支持原生选中复制 |
| Heading | 长回复的结构化分段 | 支持多级字阶；点击生成锚点链接，支持 URL 分享定位 |
| CodeBlock | 代码生成、SQL、JSON 输出 | 语法高亮不阻塞主线程；流式生成时自动滚至最新行；提供一键复制与语言标签 |
| ThinkingChain | Agent 思考过程、规划步骤 | 对话区不直接展示（以弹窗形式呈现）；ChatMap/对话区消息框底部提供「思考过程」按钮，点击后先调用 `GET /api/chat/thinking` 从后端采集该消息对应 Work 的 Agent 执行轨迹，再以弹窗（ThinkingModal）展示；弹窗内默认折叠，仅显示摘要+时长；流式生成中显示活动指示器；支持切换查看 Context (用户画像/历史引用)、Input (任务 Prompt)、Steps (Think 推理 / Act 工具调用及参数结果 / Reflect 自我反思与 Pass 结论) 与 Output (节点产出)；刷新/加载历史记录时完整恢复对应 Work 的 Agent 执行 Blocks |
| ToolInvocation | 工具调用、API 请求 | 卡片式展示工具名+参数摘要+状态；加载中显示骨架屏；完成后支持展开详情 |
| ArtifactPreview | 生成的图表、文档、图片 | 带边框卡片+缩略图；资源加载中显示占位符；点击触发外部预览回调 |
| ErrorFallback | 生成失败、接口异常 | 警示样式+友好文案；Hover 显示原始错误码；支持重试按钮（若上游提供回调） |
| Unsupported | 未注册类型、数据异常 | 虚线边框+“不支持的内容类型”标签；开发环境可切换查看原始 JSON |

#### 4.3.5 流式协议与 Block 映射

* **事件驱动与无冗余占位**：发送消息时前端不再本地预插空白 `ThinkingChain` 块，所有 Block 均由后端 SSE `BrianSSEMessage` 结构化事件驱动按需生成，杜绝空状态与时序倒置；
* **流式与持久化平滑衔接**：流式过程中以打字机形式渲染 `TextParagraph` 与 `ThinkingChain`；对话结束（`done`）后拉取后端完整历史消息，平滑清理临时 `TextParagraph` 块，避免与官方 `MessageCard` 产生双份重复渲染。

| SSE Event | Block 操作 | 说明 |
| :--- | :--- | :--- |
| `connected` | Update(ConnectionState) | 确认 SSE 链路已建立 |
| `loading` | Insert(StatusBlock, state=loading) | 插入加载状态块，后续被实际内容块替换 |
| `plan_created` | Update(PlanningData.task_dag) | Planning 策略下 PlannerAgent 完成任务级拆解（Task DAG），弹窗展示子任务清单（领域/复杂度/优先级/依赖） |
| `agent_dag_created` | Update(PlanningData.agent_dag) | 任务级拆解映射为 Agent DAG（agent_nodes / agent_edges），弹窗内复用 AgentDagFlow 渲染工作节点网络 |
| `dag_node_start` | Update(PlanningData.execution_steps) | JSONNode 编排节点开始执行，追加 RUNNING 步骤 |
| `dag_node_end` | Update(PlanningData.execution_steps) | JSONNode 编排节点执行结束，更新步骤状态与耗时 |
| `intent_agent_result` | Insert/Update(ThinkingChainBlock, Intent) | 需求理解 Agent 结果：创建「需求理解 Agent (Intent)」思考块，写入 understood_requirement / match_score / threshold_score / reasoning 与 Token 用量 |
| `intent_confirmation_required` | Update(IntentConfirmationState) | 需求理解得分低于阈值：弹出「确认需求理解」弹窗，由用户选择按理解执行 / 按原文执行 / 取消 |
| `agent_building` | Update(AgentSpec) | 提示 Agent 正在分析与装配 |
| `agent_built` | Update(ThinkingChainBlock, meta.agent_info) | 更新思维链块的 Agent 名称与类型元数据 |
| `agent_thinking` | Append(ThinkingChainBlock, content) | 向思维链块追加思考内容（以 2-5 字符打字机 chunk 渲染） |
| `agent_action` / `agent_status` | Insert/Update(ToolInvocationBlock) | 插入或更新工具调用块的执行状态与参数结果 |
| `text_chunk` / `text` | Append(TextParagraphBlock, delta) | 向文本块追加增量内容，以打字机 chunk 进行流畅渲染 |
| `citation` | Update(TextParagraphBlock, meta.citing_ids) | 更新文本块的引用关系元数据，触发引用标签条重渲染 |
| `done` | Finalize(BlockGroup) | 标记当前消息组所有 Block 为完成态，移除光标，加载官方 MessageCard 并清理临时文本块；`paused=true` 时仅标记完成、不关闭思考弹窗、不追加 Feedback 块（等待用户确认） |

#### 4.3.6 块级交互与反馈
-   **思考过程弹窗**：对话区与 ChatMap 区每条消息框底部提供「思考过程」按钮（紫色胶囊 + 大脑图标）。点击后：
    1. 立即打开 `ThinkingModal` 弹窗（含流式场景下 target 为空时实时展示当前流式思考块）；
    2. 并行调用 `GET /api/chat/thinking?info_id=...` 从后端采集该消息对应 Work 的 Agent 执行轨迹（ThinkingChain Blocks、执行时间线、工具/授权明细、运行概览与上下文轮次），返回后弹窗切换到历史数据；
    3. 采集失败或反查不到 work_id 时展示「暂无思考过程」空态，不阻断弹窗关闭。

    弹窗内容自上而下固定四段顺序：

    1. **运行概览**：整次问答汇总——耗时（settled-started）、Token 输入/输出（LLMProvider 明细账 `llm_call_log` 按 work_id=runId 求和，均为模型提供商返回真实值，空账回退 `runtime_message` 输出侧）、工具调用次数、授权次数；
    2. **基础上下文**（ContextProvider 提供）：`ThinkingContext` 组件聚合各思考块的 context 字段——用户画像、引用消息按采集方式分类（显式引用/时间线/钉住/语义相似/标签相关/关键词/随机/手动勾选）与数量统计、分类保存的上下文 ID 列表、最近工作、相关知识/编排策略；下方附每轮上下文轮次（wire 消息明细，即模型实际输入侧）；
3. **执行时间线**：run 级事件按时间序排布（受理/需求确认/Agent 选择/LLM 与提示词选定/组件装配/开始执行/上下文构建/多轮思考与工具执行/评估 Agent 质量打分/写作 Agent 美化排版/回复/完成），高频 delta 聚合为统计节点；**慢阶段先行「进行中」节点**（2026-09-14）：意图打分（`intent.started`，实测 19s+）、评估（`evaluation.started`，实测 18s+）、写作（`writer.started`，实测 7s+）三处 LLM 调用在执行前即上报开始事件，时间线立刻推进到「意图分析中… / 评估中… / 写作排版中…」，避免 LLM 调用期间时间线静止在上一节点、完成后节点同秒集中涌现；**每个节点可点击**——点击后 smooth 滚动到下方「执行内容」中对应卡片并短暂高亮（过程节点→「运行节点」卡片、工具事件→工具卡片、授权事件→授权记录卡片、思考/回复事件→深度思考卡片、上下文构建→上下文轮次卡片，`data-anchor` 关联）；任务进行中实时追加并自动滚动到底部；轨迹来源为 `stream_event` 逐条真实事件（非假数据），涵盖 `需求确认 → 选择 Agent → 组件装配 → 执行 Agent → 评估 Agent → 写作 Agent` 完整五阶段。组件装配/选定模型/选定提示词/**需求确认命中 Agent** 等环节**展示组件/Agent 名称**（查无名称回退原始 ID），**鼠标悬浮时间线标题可见原始组件 ID**（`tooltip` 字段）。**组件名称解析回退链统一为：事件载荷自带名称 → DB 名称列 → 原始 ID →「（未知）」**；各组件 DB 名称列：Agent=`runtime_agent_def.name`（回退 `agent.agent_name`）、Soul=`soul.soul_brief`、Prompt=`prompt_template.prompt_template_title`、LLM=`llm_available.llm_title`、Skill=`skill.name`（回退 `skill_brief`）、MCP=`mcp_install.mcp_title`。
     4. **执行内容**：时间线中每个节点的工作详细内容——**扁平分组行**（运行节点/工具调用/授权记录/深度思考四个子块由独立卡片改为分组标题行 + 下方卡片列表，消除三层卡片嵌套）。**组件可观测性总则：凡出现组件处一律「名称为主文本、ID 可见」**（独立字段行 / 悬浮 tooltip / 卡片内明文三种形态），组件字段点击可进 `ComponentInfoModal` 组件详情：
        - **运行节点**：意图分析/Agent 选择/组件装配/模型与提示词/计划/评估/写作排版等过程节点的结构化字段明细。其中「组件装配」的 Skill/MCP 逐项输出「Skill N 名称 / Skill N ID」「MCP N 名称 / MCP N ID」字段；「Skill 选定」「MCP 选定」节点逐项展示「名称 + ID」独立字段（含数量）；「构建 Agent」节点展示 Agent 名称/Agent ID/定义 ID/用途；「LLM 选定」「提示词选定」展示名称 + ID。
        - **工具调用**：卡片标题展示工具 ID + 所属组件胶囊（`skill_exec` 解析 `input.skill_id` → Skill 名称+ID；`mcp_exec` 解析 `input.mcp_id` → MCP 名称+ID 与二级 `tool_name`），展开后首行展示「所属 Skill/MCP：名称 + ID」；内置工具（skill_exec/mcp_exec/cdt_browser/update_plan/delegate）标「内置」徽标。
        - **授权记录**：与工具调用同规则解析所属组件（名称+ID），内置工具标「内置」。
        - **深度思考**：各 Agent 的 ThinkingChain Block（Agent 构建组件、思考步骤 THINK/工具步骤 ACT/最终输出）；「构建组件」胶囊显示**组件名称**、悬浮显示**组件 ID**、点击传 **ID** 弹出 `ComponentInfoModal` 组件详情（按 kind 从 `/api/prompts`、`/api/config/soul`、`/api/config/model`、`/api/skill`、`/api/config/mcp` 拉取并展示友好字段 + 原始 JSON）。
        - **运行概览「组件清单」**：耗时/Token/工具/授权统计下方新增组件汇总区——本次问答用到的 Agent/LLM/Prompt/Soul/Skill/MCP 逐项胶囊（名称显示、悬浮显示 `kind：名称（ID：xxx）`），数据源为 `trace.run.components`（由 `agent.selected`/`agent.components` 事件装配），无绑定时显示「（无组件绑定）」。

    **CoT / ReACT 每轮输入输出**：思考步骤 Tab 中每个步骤（轮）展示「本轮输入」（该轮发送给 LLM 的 prompt / 用户消息）与「本轮输出」（该轮 LLM 回复内容）——Runtime 直连路径按 `runtime_message` 的 user→assistant 轮次配对，编排历史路径按迭代 `think.prompt/raw_response`、`reflect.prompt/raw_response` 还原。

    **耗时秒级统一**：运行概览、工具卡片、Agent 卡片与思考步骤的耗时统一经 `formatDuration`（`utils/format.ts`）展示为秒级（`0.85s` / `3.2s` / `1m20s`），不再展示毫秒。

    弹窗支持点击遮罩 / 右上角 X 关闭；流式对话进行中（`done` 事件前）弹窗自动弹出并实时展示思考块，`done`/`error` 事件后自动关闭。
-   **悬浮工具栏**：鼠标悬停 Block 区域 300ms 后浮现轻量操作栏（复制、引用、反馈）；移出后延迟 200ms 消失；移动端改为长按触发底部面板。
-   **本地视觉状态**：折叠/展开、详情展开等状态由独立本地状态管理，不与数据层混合，页面刷新后重置。
-   **反馈组件**：系统回复消息组底部渲染 FeedbackBlock，包含 1-5 星评分与点赞/点踩按钮，点击调用 `addFeedback(msg_id, score, type)`，触发即时视觉反馈；并渲染「复制 TraceId」按钮，点击将本次对话的 trace_id 写入剪贴板。
-   **错误展示**：对话失败时渲染 ErrorBlock，展示后端返回的真实 `error_message` 与 `error_code`（不再展示通用兜底文案），并附带 trace_id 复制按钮，便于日志检索定位。
-   **键盘与无障碍**：所有可交互 Block 支持 Tab 聚焦 + Enter/Space 触发；流式文本块声明 `aria-live="polite"`；折叠元素声明 `aria-expanded`；错误块使用 `role="alert"`。

#### 4.3.7 性能与降级要求
-   **渲染帧率**：文本流式生成峰值 ≥ 55fps；千块规模滚动 ≥ 58fps。
-   **首屏性能**：百块规模 FCP ≤ 800ms。
-   **布局稳定**：流式生成期间 CLS ≤ 0.05。
-   **内存控制**：两千块规模内存占用 ≤ 150MB。
-   **降级可靠性**：未知块类型或异常数据 100% 渲染 Fallback Block，严禁白屏或崩溃。

### 4.4 会话管理侧边栏

-   **触发方式**：右上角按钮 Hover 显示，Click 展开（宽度 300px，右侧滑入覆盖层）。
-   **核心操作**：
    -   搜索：调用 `searchSession(keyword)`，支持模糊匹配（匹配会话名称 `sessionTitle` 与消息内容）。
    -   新建：调用 `createSession()`，成功后自动切换并关闭面板。
    -   删除：单条删除或批量勾选删除，需二次确认。
    -   重命名：会话条目提供编辑按钮（Edit3 图标），点击进入内联编辑，回车或点击确认（Check）调用 `chatApi.updateTitle`（`PUT /api/chat/session/:sessionId/title`）保存，X 取消。名称优先展示 `sessionTitle`，为空回退 `lastMessage` 或「新会话」。
-   **溢出保护**：切换会话前调用 `checkSessionOverflow()`，超限则 Toast 提示并阻断操作。
-   **会话切换清理**：切换会话时，清空当前 Block 列表并重新初始化流解析器，避免跨会话 Block 状态污染。
-   **刷新恢复**：页面挂载（onMounted）时，若 localStorage 存在当前会话 ID，自动调用 `getChatHistory`（`GET /api/chat/history`）恢复历史消息，并调用 `getVisualizedMessageDAG`（`GET /api/visualization/message-dag`）恢复 ChatMap 消息关系图谱，刷新后不丢失对话。

### 4.5 Agent 编排 DAG 弹窗

-   **触发**：ChatMap 卡片上的 DAG 按钮。
-   **展示内容**：全屏遮罩弹窗 (800×600)，Canvas 绘制 Agent 执行链路。
-   **节点信息**：Planner → Work → Writer → Evolutor。
-   **详情查看**：点击节点弹出 Tooltip/侧边详情，展示 Input/Output/Token/Duration。其中“输出”字段复用 Block 渲染组件进行展示，保持视觉一致性。
-   **数据源**：`getAgentChain(session_id, msg_id)`。

## 5. 接口清单

| 接口名称 | 方法 | 用途 | 关键参数 |
| :--- | :--- | :--- | :--- |
| submitWork | POST | 发送消息 | session_id, msg_content, citing_msg_ids |
| getBlockStream | GET | 历史消息 Block 结构化回溯 | session_id, msg_id |
| searchSession | GET | 搜索/获取会话列表 | keyword, page, size |
| createSession | POST | 创建新会话 | - |
| deleteSession | DELETE | 删除会话 | session_ids[] |
| checkSessionOverflow | GET | 检查会话上限 | user_id |
| getAgentChain | GET | 获取 Agent 执行链路 | session_id, msg_id |
| addFeedback | POST | 提交反馈 | msg_id, score, type |

## 6. 非功能性需求

-   **兼容性**：支持 Chrome 90+, Safari 15+, Edge 90+ 最新两个大版本；不支持的特性需提供优雅降级方案。
-   **主题支持**：所有视觉样式通过 CSS 变量驱动，支持运行时主题切换且不引发额外重绘。
-   **状态持久化**：刷新页面后保持当前会话 ID 及 ChatMap 视图位置；Block 本地视觉状态不持久化。
-   **移动端适配**：针对触摸操作、横向溢出、工具栏触发方式做专项适配。

## 7. 变更记录

### [2026-09-12] 工具盒改圆球 + 流式 Markdown 渲染
- **变更原因**：①工具执行长条卡纵向占位大、多工具堆叠时间线冗长；②流式过程中 Markdown 从不渲染（TextBlock 恒纯文本；MessageCard 被全局 isStreaming 误伤，之前问答的 Markdown 在本轮结束前全部退化为纯文本）。
- **功能变更**：
  1. `ToolCallBlock.vue` 改版为状态圆球：默认仅 36px 圆球（执行中琥珀旋转图标、完成绿、失败红，右下状态点，悬停显示工具名+状态），右侧配工具名小字；点击展开详情面板——参数 JSON 缩进展示，响应按类型渲染（对象/JSON 串 → JSON 缩进块，其余 → Markdown 渲染），空参/无返回有占位文案。
  2. `TextBlock.vue` 正文改 Markdown 渲染：流中经 `createThrottledMarkdownRenderer(300)` 节流（最多 300ms 全量解析一次，避免每帧重解析的 O(n²) 开销），流结束翻转即全量对齐；标题分支保持纯文本样式。
  3. `ChatArea.vue` — MessageCard 的 `:is-streaming` 恒传 `false`：流式文本实际承载于临时 TextParagraph Block（自带 streaming 状态），从不在卡片内逐字更新；原全局绑定导致整轮流式期间所有历史回答卡退化为纯文本。
- **行为差异**：
  - 修改前：工具=长条卡（空盒问题已于同日早前修复）；流式全程纯文本、结束后才有排版。
  - 修改后：工具=圆球+按需展开；流式过程中即见排版（300ms 级延迟），历史问答排版不受本轮流式影响。
- **新增边界条件**：流中未闭合的 Markdown  fence/标记按 marked 容错渲染，结束后自动规整； throttle 缓存按组件实例隔离，多块互不串扰。

### [2026-09-12] 对话区四问修复（Block 对齐 + 工具盒 + 中间文本 + 永久批准）
- **变更原因**：问答复盘——①流式文本（TextParagraph）靠左落在用户消息同侧，被误读为用户输入；②工具执行盒恒为空（字段映射错位 + result 从未回填）且多个空盒堆叠过长；③"好的，我来帮你查一下…""页面还没加载完…"等中间过程进了对话框；④工具授权每次重复确认。
- **功能变更**：
  1. `ChatArea.vue` — Block 按 `role` 对齐：仅 `user` 靠左（`mr-auto`），`assistant/tool/system` 靠右（`ml-auto`），与消息气泡左右侧一致。
  2. `chatStreamEvents.ts` — 后端 `{part_id, tool_id, input}` 归一化（input 支持 JSON 串/对象）；块 id 按 `part_id` 关联，started/launch/result 命中同一块（更新不重复建）；`tool.result` 回填 result 并收敛 `done/error`。`ToolCallBlock.vue` 折叠态新增状态文案与结果摘要单行预览。
  3. 中间过程只进思考过程：最终回复仅由最终轮 `reply.delta` 提供（后端转轮分流，见 Loop-PRD）；前端 `permission.answered` 回执翻卡（自动放行无点击时不悬挂 pending）。
  4. `PermissionConfirmCard.vue` 新增"始终允许"按钮 → `answerPermission(remember=true)` → 工具入后端信任表（跨会话、重启保留），后续同工具自动放行。
- **行为差异**：
  - 修改前：流式文本/工具盒靠左（用户侧）；工具盒空且多；中间叙述占对话框气泡（流式 + 历史各一条）；每次执行都弹窗授权。
  - 修改后：用户文本唯一靠左；工具盒含名/参/结果/状态且单块更新；对话框仅最终回复，中间叙述只在"思考过程"弹窗（含历史重建的 THINK 步骤）；信任工具不再打扰。
- **新增边界条件**：信任粒度为整工具（不含参数）；撤销走 `configRuns({trusted_tools})` 全量覆盖（暂无管理页入口）。

### [2026-08-25] ChatMap 连线逻辑重构：顺序问答纵向排布 + 引用问答横向对齐
- **变更原因**：原布局把「未复选上下文」的追问也生成 `CITATION` 边并横向布局，导致默认问答被画成横向；引用问答此前为「整列底部对齐」，与需求「引用问题框与被引用最下面消息框对齐」不符。
- **功能变更**：
  1. **边类型区分**：后端 `VisualizationService.getVisualizedMessageDAG` 将「追问边」（未复选上下文的上一回答→本次提问）从 `CITATION` 改为独立类型 `FOLLOW_UP`，与「复选引用」（CITATION）区分；同时按职责拆分为 `queryMessageRows` / `buildMessageNodes` / `buildMessageEdges` / `buildQuestionAnswerEdges` / `buildCitationEdges` / `appendFollowUpEdges` 等小方法（单方法 ≤20 行），边类型常量收敛至 `domain/types.ts`。
  2. **布局抽离**：前端新增纯函数布局模块 `@/utils/chatMapLayout`（`layoutChatMap`），规则：
     - `QUESTION_ANSWER` / `FOLLOW_UP` → 纵向排布（回答/追问在来源消息正下方，同列，按时间依次向下）；
     - `CITATION` → 引用方放在被引用方右边（列 +1），且与被引用消息中「y 最大（最靠下）」的那一个顶部对齐。
  3. **连线绘制**：`ChatMap.vue` 中 `FOLLOW_UP` 与 `QUESTION_ANSWER` 同用向下箭头（来源底部中点 → 目标顶部中点）；`FOLLOW_UP` 与 `CITATION` 同为虚线样式，`QUESTION_ANSWER` 实线，三种关系清晰可辨。
- **行为差异**：
  - 修改前：默认问答（未复选）也被横向布局到上一回答右边；引用问答为整列底部对齐（引用方的回答与被引用的回答对齐）。
  - 修改后：默认问答/追问纯纵向顺序排布；引用问答的问题框与被引用最下面消息框顶部对齐。
- **新增边界条件**：一次提问复选多个消息时，引用问题框取所有被引用消息中 y 最大者顶部对齐、列取最右者 +1；孤立节点（无任何入边）按时间顺序纵向兜底排布。

### [2026-08-24] AgentDAG 节点状态按 task_id 定位 + 执行过程实时推送每轮输入/输出
- **变更原因**：① AgentDAG 画布节点以 `task_id` 为主键，但前端运行时状态按 `agent_id` 广播（`setAgentStatus` / `resolveStatus`），同一 Agent 复用到多个任务（如一个研究 Agent 承担 5 个子任务）时，该 Agent 完成任一任务即把其余复用节点一并标绿，出现「任务4 早于任务3、任务8 早于任务7 完成」的展示错误（后端实际按 task 级拓扑顺序执行，属状态展示错误，非编排错误）；② think/act/reflect 各轮输入（prompt/params）与输出（raw_response）此前未推送，「执行过程」块看不到每轮输入输出。
- **功能变更**（前端 + 后端）：
  1. **task 级状态存储**：`session.ts` 新增 `taskExecutions`（key = task_id），与 `agentExecutions`（key = agent_id）分离；`setAgentStatus(agentId, status, agentName, taskId)` 同时推进 agent 级（供"执行过程"卡片）与 task 级（供 AgentDAG 节点）状态，节点按 `taskId` 精确定位而非广播。
  2. **节点状态解析**：`AgentDagFlow.vue` 的 `resolveStatus` 优先取 `taskExecutions[node.taskId]`，其次 `agentExecutions[node.agentId]`，最后回退节点自带 `status`。
  3. **事件透传 task_id**：后端 `BrianSSEMessage` / `StreamAccess.pushText` / `pushEvent` 增加 `task_id` 字段；`agent_thinking` / `agent_action` / `agent_reflection` / `agent_output` / `agent_error` 均携带 `task_id`；`handleStreamEvent` 解析 `data.task_id` 并透传 `setAgentStatus`。
  4. **每轮输入/输出实时推送**：后端 `pushThink` / `pushAct` / `pushReflect` 携带 `prompt` / `raw_response` / `params` / `next_action` / `iteration`；前端对应事件处理回填 `thinkBlock.prompt` / `rawResponse`、steps 的 toolCalls 参数与迭代序号；`agent_output` / `agent_error` 回填 `input` / `output`。
- **行为差异**：
  - 修改前：复用 Agent 的节点状态广播式着色，出现"任务4 早于任务3、任务8 早于任务7"；执行过程看不到每轮输入（prompt/params）。
  - 修改后：AgentDAG 节点按 task_id 精确着色（任务4 仅在真正执行完成才变绿）；执行过程实时展示每轮 Think/Act/Reflect 的输入与输出。
- **新增边界条件**：无 task_id 的旧事件（如 Intent / 构建阶段）回退按 agent_id 定位；历史消息点击"思考过程"走 `buildThinkingBlocksAndDag`（后端已按 task_id 定位节点），行为不变。

### [2026-08-24] 修复思考过程弹窗：系统回复展示后仍显示「思考中...」
- **变更原因**：思考块（`ThinkingChain`）的 `meta.status` 仅在 `done` 事件才被 `finalizeBlocks` 收敛为 `done`，而最终回复（`text_chunk`）在 `done` 之前就开始流式输出，导致「思考过程」弹窗顶部 `overallStreaming` 在系统回复已展示后仍因残留 streaming 思考块而显示「思考中...」；同理，Work Agent 的中间产出（`agent_output`）也会先于最终回复展示，加剧该错位。
- **功能变更**（前端）：
  1. **新增 `finalizeThinkingBlocks`**：`session.ts` 新增 `finalizeThinkingBlocks(msgId)`，仅将 `msgId` 匹配且 `type === 'ThinkingChain'`、`status === 'streaming'` 的思考块收敛为 `done`（不影响文本块等其它块），并随 store 导出。
  2. **回复开始时收敛**：`ChatArea.vue` 的 `handleStreamEvent` 在 `text_chunk` / `text` 分支（最终回复开始流式输出，即全部 Agent 已执行完成）调用 `finalizeThinkingBlocks(botMsgId)`，使 `overallStreaming` 即时归 false。
  3. **Agent 完成即收敛**：`intent_agent_result` / `agent_matched` / `agent_output` / `agent_error` 各分支在 `updateBlock` 时补充 `meta.status = 'done'`，单个 Agent 完成后其思考块立即脱离 streaming，不再依赖整轮 `done`。
- **行为差异**：
  - 修改前：思考块直到 `done` 才置为 `done`，系统回复流式展示期间弹窗仍显示「思考中...」。
  - 修改后：最终回复开始输出（或单个 Agent 完成）即收敛思考块，弹窗「思考中...」即时结束；`done` 后自动关闭逻辑不变。
- **新增边界条件**：`finalizeThinkingBlocks` 只作用于 `ThinkingChain` 块，不影响 `TextParagraph` 打字机块的 streaming 光标；空回复（无 `text_chunk`）时仍由 `done` 的 `finalizeBlocks` 兜底收敛。

### [2026-08-24] 确认需求理解：前端防重复调用 + 前后端同步替换 REQUEST
- **变更原因**：① 后端日志显示 `confirmIntent` 被连续调用两次（前端快速重复点击「按理解执行 / 按原文执行」时重复提交）；② APPROVE 仅前端本地 `replaceUserMessageContent` 替换用户消息，后端 `info_raw` 已保存的 REQUEST 仍为原始模糊输入，刷新页面后替换失效。
- **功能变更**（前端 + 后端）：
  1. **前端防重复调用**：`ChatArea.vue` 的 `handleIntentConfirm` 在 `if (!conf) return` 之后、`clearIntentConfirmation()` 之前增加 `if (confirmingIntent.value) return` 防重入锁，并将 `confirmingIntent.value = true` 提前到弹窗关闭之前，杜绝同一确认请求被并发提交。
  2. **后端同步替换**：`OrchestrationEntryService.confirmIntent` 在 APPROVE 且需求被改写时调用新增的 `InfoCore.updateInfo` 将 `info_raw` 中该 work 的 REQUEST 消息改写为理解后的需求。
  3. **前端兜底替换**：`handleIntentConfirm` 的 `finally` 中 `replaceUserMessageContent` 保留为兜底（后端未同步成功时本地替换保证界面即时一致）。
- **行为差异**：
  - 修改前：确认请求可被重复提交；APPROVE 替换仅前端生效，刷新后回退为原始输入。
  - 修改后：确认请求单次提交；后端持久化同步替换，刷新后仍展示理解后的需求。
- **新增边界条件**：`confirmingIntent` 为 `true` 时直接 return，不触发第二次 `confirm-intent`；后端 `updateInfo` best-effort，失败时前端本地替换兜底。

### [2026-08-24] 确认需求理解：confirm-intent 改为 SSE 流式，实时展示思考过程与系统回答
- **变更原因**：确认（APPROVE / KEEP）后 `confirm-intent` 为同步 JSON 请求，重入编排耗时数分钟且前端无流式进度，导致「确认后既无『思考过程』弹窗自动展示、也看不到系统回答」，用户以为请求卡死；确认完成依赖刷新历史才看到结果。
- **功能变更**（前端 + 后端）：
  1. **前端流式确认**：`ChatArea.vue` 的 `handleIntentConfirm` 不再经 `chatApi.confirmIntent`，改为 `fetch('/api/chat/confirm-intent')` 流式读取 SSE（复用 `handleStreamEvent` 解析），确认前重置 `textBlockId` / `resetPlanning` / `resetAgentStatus` 并 `setStreaming(true)`，流结束后统一 `finalizeBlocks` / 刷新历史 / 回写用户消息（APPROVE 替换、CANCEL 丢弃）。
  2. **后端流式确认**：`POST /api/chat/confirm-intent` 由 JSON 改为 SSE 端点（`registerStream` + SSE 头），编排过程中 `context_built` / `agent_thinking` / `agent_output` 等事件实时到达前端，编排完成后 `ChatService.confirmIntent` 推送 `text_chunk` 与 `done`。
- **行为差异**：
  - 修改前：确认后弹窗关闭，但无思考过程弹窗、无系统回答，需等同步请求返回并刷新历史才显示最终结果。
  - 修改后：确认后「思考过程」弹窗随 `context_built` 自动展示、`text_chunk` 打字机输出系统回答，`done` 后自动关闭弹窗并展示 Feedback，流结束后刷新历史兜底一致。
- **新增边界条件**：CANCEL 不推送文本（仅关闭流），前端流结束后 `removeUserMessageByContent` 丢弃原始提问；`done` 事件沿用 `paused:false` 语义触发自动关闭思考弹窗。

### [2026-08-24] 修复确认需求理解弹窗：点击按钮立即关闭
- **变更原因**：`handleIntentConfirm` 的弹窗关闭逻辑位于 `finally` 块，需等 `await chatApi.confirmIntent(...)` 返回后才执行；而 APPROVE/KEEP 会让后端同步重入 `receiveWork` 重新执行完整编排（重新跑所有 Agent 与 LLM 调用，耗时较长），HTTP 响应迟迟不回，导致「按理解执行 / 按原文执行」点击后弹窗长期停留、看似"没有关闭"。
- **功能变更**（前端）：
  1. `ChatArea.vue` 的 `handleIntentConfirm` 将 `sessionStore.clearIntentConfirmation()` 从 `finally` 块提前到函数开头（捕获 `conf` 之后、发起 `confirm-intent` 请求之前）立即执行，弹窗即时关闭。
  2. `confirm-intent` 请求改为后台异步完成；`finally` 块仍负责刷新 `loadDag` / `loadChatHistory` 并按 action 回写用户消息（按理解执行替换、取消丢弃）。
- **行为差异**：
  - 修改前：点击「按理解执行 / 按原文执行」后，弹窗需等后端同步编排全部完成、confirm-intent 响应返回后才关闭，耗时期间弹窗看似无响应。
  - 修改后：点击任意动作按钮（按理解执行 / 按原文执行 / 取消）后弹窗立即关闭，后续编排与历史刷新在后台完成。
- **新增边界条件**：弹窗立即关闭后，`conf` 为点击时捕获的局部变量，后续 `replaceUserMessageContent(conf.original_query, conf.understood_requirement)` / `removeUserMessageByContent(conf.original_query)` 仍按捕获值正确执行，不受弹窗关闭影响。

### [2026-08-24] 确认需求理解弹窗：按理解执行替换原始输入、取消丢弃原始输入
- **变更原因**：确认弹窗三个动作此前仅触发 `confirm-intent` 并刷新历史，未按要求回写用户原始输入——「按理解执行」后对话区仍展示原始提问而非理解后的需求；「取消」后原始提问仍残留在对话区，与"按理解执行替换、按原文执行保留、取消丢弃"的交互预期不符。
- **功能变更**（前端）：
  1. **按理解执行（APPROVE）**：`ChatArea.vue` 的 `handleIntentConfirm` 在刷新历史后调用 `sessionStore.replaceUserMessageContent(original_query, understood_requirement)`，将最近一条内容等于 `original_query` 的用户消息替换为理解后的需求，随后关闭弹窗。
  2. **取消（CANCEL）**：刷新历史后调用 `sessionStore.removeUserMessageByContent(original_query)`，丢弃用户原始输入消息，随后关闭弹窗。
  3. **按原文执行（KEEP）**：仅刷新历史并关闭弹窗，保留原始输入不变。
  4. **状态管理**：`session.ts` 新增 `replaceUserMessageContent` / `removeUserMessageByContent` 两个方法（按内容从后往前定位最近一条 `role==='user'` 且 `content===original_query` 的消息做替换 / 移除），并随 store 导出。
- **行为差异**：
  - 修改前：三个动作均仅调用 `confirm-intent` 并刷新历史，对话区用户消息始终显示原始提问；「取消」后原始提问仍保留。
  - 修改后：「按理解执行」将对话区用户消息替换为理解后的需求；「按原文执行」保留原文；「取消」移除用户消息。
- **新增边界条件**：替换 / 移除基于「刷新后后端仍存原始 REQUEST」这一前提，按 `original_query` 精确匹配最近一条用户消息；历史刷新后原提问仍保留在数据库（后端 `confirmIntent` 幂等复用 REQUEST，不重写内容），因此该替换 / 移除仅作用于前端展示层，刷新页面后「取消」丢弃的消息会随历史重新出现。

### [2026-08-23] 需求理解确认弹窗：intent_confirmation_required 事件处理与 confirm-intent 调用
- **变更原因**：IntentAgent 匹配得分低于阈值时后端暂停 work 并推送 `intent_confirmation_required` 事件，但前端既无该事件处理、也无 `POST /api/chat/confirm-intent` 调用，导致确认弹窗永不弹出、work 永久卡在 `PAUSED_WAITING_CONFIRMATION`；同时暂停分支此前不落库 REQUEST，历史刷新后用户提问被清空。
- **功能变更**：
  1. **确认弹窗**：`ChatArea.vue` 的 `handleStreamEvent` 新增 `intent_confirmation_required` 分支，将事件 payload 与 `currentSessionId` 写入 `sessionStore.setIntentConfirmation`；新增「确认需求理解」弹窗，展示原始输入 / 理解后的需求 / 匹配度（分数 vs 阈值）/ 判断依据，并提供「按理解执行（APPROVE）/ 按原文执行（KEEP）/ 取消（CANCEL）」三个动作。
  2. **确认 API**：`api/index.ts` 新增 `chatApi.confirmIntent({ session_id, work_id, action, understood_requirement })`，调用 `POST /api/chat/confirm-intent`；`handleIntentConfirm` 执行后刷新 `loadDag` 与 `loadChatHistory` 展示最终结果，失败时渲染 ErrorBlock。
  3. **状态管理**：`session.ts` 新增 `intentConfirmation` 状态与 `setIntentConfirmation` / `clearIntentConfirmation`。
  4. **done 事件 paused 处理**：`handleStreamEvent` 的 `done` 分支识别 `paused=true` 时仅标记完成态，不关闭思考弹窗、不追加 Feedback 块，等待用户确认。
- **行为差异**：
  - 修改前：发送低匹配度问题时对话区 / ChatMap 无消息、无思考过程、无确认入口，work 卡死。
  - 修改后：提问立即落库并在对话区 / ChatMap 展示；低匹配度时弹出确认弹窗，确认后继续编排并刷新结果。
- **新增边界条件**：`done(paused=true)` 后思考弹窗保持打开（展示 Intent 需求理解思考块）；确认（APPROVE/KEEP）由后端同步完成编排，前端在 confirm-intent 响应后刷新历史与 ChatMap 才看到最终结果（无流式进度）。

### [2026-08-23] 思考弹窗后置到上下文构建后、确认弹窗 z-index 提升
- **变更原因**：① 发送消息时立即弹出「思考过程」弹窗（`ThinkingModal`，`z-[120]`），低匹配度场景下会遮挡「确认需求理解」弹窗（原 `z-50`），用户点击确认按钮实际点到思考弹窗遮罩，无响应；② 后端 `confirmIntent` 的 `selectOneDB` 入参结构错误导致 500，进一步导致点击无反馈。
- **功能变更**：
  1. **思考弹窗后置**：移除 `handleSend` 中发送即弹 `openThinkingModal(null)`；改为在 `context_built` 事件（上下文构建成功）时再弹出思考过程弹窗。正常流程在上下文构建后弹出；暂停流程（should_modify_query=true）不经过 `context_built`，因此只弹「确认需求理解」弹窗，不再互相遮挡。
  2. **确认弹窗层级**：确认弹窗 z-index 从 `z-50` 提升为 `z-[150]`，高于 `ThinkingModal`（`z-[120]`）与 `EvalResultModal`（`z-[130]`），作为双保险。
- **行为差异**：
  - 修改前：思考弹窗先弹出并遮挡确认弹窗，确认按钮点击无响应。
  - 修改后：上下文构建前不弹思考弹窗；低匹配度时仅弹确认弹窗，点击可正常触发 `confirm-intent`。
- **新增边界条件**：暂停流程下思考过程弹窗不自动弹出（无 `context_built`），用户仍可点击消息框「思考过程」按钮查看 Intent 需求理解思考块。

### [2026-08-22] trace_id 全链路透传并落库 info_raw、消息框新增「评估结果」按钮
- **变更原因**：
  1. 消息框底部的「复制 TraceId」按钮此前复制的是 `work_id`（后端 `/api/chat/history` 将 `traceId` 字段错误回填为 `work_id || interact_id || info_id`），与真实 trace_id（前端 `crypto.randomUUID()` 生成）语义不符，误导排查与日志检索；
  2. trace_id 仅停留在 SSE 事件与 `orchestration_work.metadata`，未随消息落库，历史加载后无法还原真实 trace_id；
  3. 缺少从消息框直接查看某次工作 Evolutor 评估评分 JSON 的入口（此前只能在「思考过程」弹窗的"执行过程"聚合块中查看）。
- **功能变更**：
  1. **trace_id 落库**：`info_raw` 表新增 `trace_id` 列（含迁移与索引）；`SaveInfoInput` 透传 `trace_id`，`InfoCoreService.saveInfo` 落库，`toInfoRawRecord` / `GetChatHistoryOutput` / `ChatService.getChatHistory` 回传；`JSONNodeService`（handleSaveUserInput / handleSaveResponse / handleError）与 `OrchestrationEntryService`（错误回退）在各 `saveInfo` 调用中携带 `trace_id`。
  2. **trace_id 独立且全链路自动生成**：traceId 与 `work_id` / `interact_id` / `info_id` 相互独立，不再互相回退。AOP 层（`AopProxy`）在任意方法入口自动生成缺失的 trace_id（经 `ToolProvider.IdGenerator`，优先级：`Input.trace_id` → `Context.trace_id` → 新生成，回填到 `Context` 避免污染查询类入参的 trace_id 过滤字段）；业务入口（`/api/chat/stream` / `/api/chat/send`）显式生成并透传。日志系统（`LogService.addLog`）持久化 `trace_id`，AOP 日志拦截器与 `createLogger` 自动写入，可按 `trace_id` 检索。
  3. **历史返回真实 trace_id**：`/api/chat/history` 的 `traceId` 字段改为 `m.trace_id || ''`（仅真实 trace_id，不回落业务 ID）；`/api/visualization/message-dag` 节点同样回传 `trace_id`。
  4. **新增「评估结果」按钮**：`MessageCard` 底部栏在「思考过程」按钮旁新增「评估结果」按钮（Gauge 图标），点击后弹出 `EvalResultModal` 展示对应 work 的 Evolutor 评估评分 JSON（解析 scores / suggestions / need_optimize 结构化展示，并保留原始 JSON 与 trace_id）。
  5. **后端新增接口**：`GET /api/chat/eval-result?info_id=xxx`（或 `work_id`），按 info_id 反查 `info_raw` 得到 `work_id` 与 `trace_id`，再从 `orchestration_agent_execution`（`execution_type=SYSTEM` 且 `agent_type=EVOLUTOR`）读取最新评估 `answer` 返回。
     - **[2026-09-15 修改]** Runtime v2 重构后评估结果改落 `agent_evaluation` 表（`run_id` = 一次问答的 `runtime_run.id`，即 `info_raw.work_id`），且评估使用框架生成的私有 work_id，按 `orchestration_agent_execution.work_id` 永远查不到。接口现优先按 `run_id`（= info_raw.work_id / run_id）查 `agent_evaluation`，未命中时回退旧 `orchestration_agent_execution`（历史数据）。
  6. **状态管理**：`session.ts` 新增 `evalResultVisible` / `evalResultLoading` / `evalResult` / `evalResultError` / `evalTraceId` 与 `openEvalResult` / `closeEvalResult`。
- **行为差异**：
  - 修改前：消息框复制按钮复制 `work_id` 却标注为 TraceId；trace_id 不随消息历史还原；无「评估结果」按钮。
  - 修改后：消息框「复制 TraceId」复制真实客户端 trace_id；traceId 独立于业务 ID，任意方法缺失时自动生成，日志统一保存 trace_id；点击「评估结果」可直接查看评分 JSON，评估未完成时提示"暂无评估结果（评估可能尚未完成，稍后重试）"。
- **新增边界条件**：Evolutor 评估为异步（setImmediate / MQ），评估完成前点击「评估结果」可能返回 `found=false`，稍后重试即可；历史旧数据无 `trace_id` 列值时「复制 TraceId」按钮不展示（不回落业务 ID）。
- **[2026-09-15 变更原因]**（见本文件下方 2026-09-15 变更记录）。

### [2026-09-15] /api/chat/eval-result 数据源迁移到 agent_evaluation（修复「评估结果」弹窗永远为空）
- **变更原因**：2026-09-14 Runtime v2 重构后，Evolutor 评估结果不再写 `orchestration_agent_execution`（该表已无任何写入方，成为历史数据），改为写 `agent_evaluation`（`run_id` = 一次问答的 `runtime_run.id`，与 `info_raw.work_id` / `info_raw.run_id` 同值）；且评估阶段使用框架生成的私有 `evalWorkId`，此 ID 与问答的 work_id 完全无关，导致原接口按 `work_id = info_raw.work_id` 查 `orchestration_agent_execution` **永远查不到任何行**，消息框「评估结果」按钮始终显示"暂无评估结果"。DB 实证：`orchestration_agent_execution` 最新行 created=2026-09-14（旧架构），而 `agent_evaluation` 在 2026-09-14 20:30 后仍在持续新增且 `run_id` 与新问答 `work_id` 精确匹配。
- **功能变更**（后端，`brian-backend/dev-server.ts` `/api/chat/eval-result` 端点）：
  1. **反查维度变更**：`info_id` 反查 `info_raw` 额外返回 `run_id`；关联键以 `run_id`（= `info_raw.work_id` / `info_raw.run_id`）为主。
  2. **新链路查询**：优先查 `agent_evaluation`（`WHERE run_id = ? OR work_id = ?`，取最新一行），按其 `scores` / `suggestions` / `need_optimize` 三列组装与原 `answer` 字段等价的评分 JSON（前端 `EvalResultModal` 按 scores / suggestions / need_optimize 结构化解析，契约不变）。
  3. **旧数据兜底**：`agent_evaluation` 未命中且 `work_id` 存在时，回退旧的 `orchestration_agent_execution` 查询（`execution_type=SYSTEM` 且 `agent_type=EVOLUTOR`），保持历史消息可查看。
  - 前端无改动（接口响应 schema 保持 `{ work_id, trace_id, found, evaluation: { answer, created, elapsed_ms, agent_name } }`）。
- **行为差异**：
  - 修改前：点击「评估结果」永远返回 `found=false`（Runtime v2 流量按 work_id 查 `orchestration_agent_execution` 恒为空）。
  - 修改后：已执行评估的问答可正常解析展示评分/建议/是否需优化；历史旧架构数据走兜底路径仍可展示。
- **新增边界条件**：
  - 评估被跳过（`eval_skip_low_risk=true` 且单轮直答 iterations≤1）、评估尚未完成（`eval_async` fire-and-forget）、或 `agent_evaluation` 因错误跳过评估（call_error / internal_error 不评分）时 `found=false`，提示"暂无评估结果"，属预期；
  - `agent_evaluation` 无 `elapsed_ms` / `agent_name` 列，`elapsed_ms` 返回 0、`agent_name` 固定返回"进化 Agent (Evolutor)"（前端默认文案一致）。

### [2026-08-22] "执行过程"聚合块展示 Write Agent 与评估 Agent 的执行结果
- **变更原因**：Writer / Evolutor 系统 Agent 不经过 `orchestration_agent_execution`（`execSingleAgent` 的 ReACT 循环），其执行结果未落库，导致「思考过程」弹窗的"执行过程"看不到 Write Agent 与评估 Agent 的执行结果（属展示缺失，非调度缺失）。
- **功能变更**（后端）：
  1. **系统 Agent 执行轨迹落库**：`OrchestrationExecutionService` 新增 `recordSystemAgentExecution`，`JSONNodeService.handleWriteResult`（Writer）与 `handleEvalResult`（Evolutor，抽取共享 `runEval`）调用其将执行结果写入 `orchestration_agent_execution` 表。
  2. **系统 Agent ID 回填**：`WriteOutput` / `EvalWriterAgentOutput` / `EvalWorkAgentOutput` 新增 `agent_id` 字段，`WriterAgentService.write` / `EvolutorAgentService.eval*` 回填系统 Agent 自身 ID。
  3. **展示侧无需改动**：`ThinkingModal.vue` 的"执行过程"聚合块按 `orchestration_agent_execution.created ASC` 聚合展示，Writer（type=WRITER → "表达 Agent"）、Evolutor（type=EVOLUTOR → "进化 Agent"）随记录落库自动出现在列表中。
- **行为差异**：
  - 修改前："执行过程"仅展示 Intent / Planner / Worker，看不到 Writer 与评估 Agent。
  - 修改后：完整执行链路（Intent → Planner → Worker → Writer → Evolutor）按顺序展示；Writer 的 `answer` 为最终回复、Evolutor 的 `answer` 为评分 JSON。Evolutor 评估为异步，评估完成前打开弹窗可能暂时缺失，稍后刷新即可。
- **新增边界条件**：Writer / Evolutor 仅记录 `answer` 与 `task_content`（未写 `agent_execution_trace`），其"完整 Prompt / 思考步骤"展示描述性文本而非真实 LLM prompt。

### [2026-08-22] "思考过程"弹窗：Intent 需求理解 Agent 展示输入/输出 Token 用量
- **变更原因**："思考过程"弹窗中 Intent（需求理解）Agent 节点缺少输入/输出 Token 用量展示，与其他工作 Agent 的 Token 用量展示不一致。
- **功能变更**：
  1. **后端 Token 用量回填**：`IntentAgentService.understandRequirement` 在 LLM 调用完成后回填 `output.input_tokens` / `output.output_tokens`（`UnderstandRequirementOutput` 新增 `input_tokens` / `output_tokens` 字段）。
  2. **编排层透传**：`OrchestrationEntryService` 将 `intentOut.input_tokens` / `output_tokens` 透传至 `intent_agent_result` SSE 事件与 `orchestration_work.metadata` 的 `intent_agent` 字段。
  3. **思考块重建**：`dev-server.ts` 的 `buildThinkingBlocksAndDag` 在重建 Intent 思考块时回填 `inputTokens` / `outputTokens`。
  4. **前端展示**：`ChatArea.vue` 的 `handleStreamEvent` 在 `intent_agent_result` 事件中解析并写入 `inputTokens` / `outputTokens` / `durationMs`，供思考过程弹窗的 Intent 节点展示。
- **行为差异**：
  - 修改前：Intent 节点 Token 用量显示为 0 或不展示。
  - 修改后：Intent 节点正确展示输入/输出 Token 用量与耗时。

### [2026-08-22] "思考过程"弹窗：上下文折叠、引用消息标签切换与"执行过程"聚合块
- **变更原因**：① "运行与对话上下文环境 (Context)" 内容块较长且无法折叠，占满弹窗顶部空间；② "引用的消息与上下文背景"将所有采集方式的引用消息一次性平铺展示，无法按标签聚焦查看某类消息；③ 弹窗将 Agent 按类型（工作 Agent / Writer / 系统 Agent）拆为三个区块，割裂了 Agent 的实际执行时序，无法直观看到完整执行链路。
- **功能变更**：
  1. **上下文环境折叠**（`ThinkingContext.vue`）：标题栏"运行与对话上下文环境 (Context)"改为可点击折叠按钮（旋转 `ChevronRight` 指示符 + `aria-expanded`），新增 `isContextCollapsed` 状态（默认展开），折叠后隐藏画像/引用消息/ID 列表/最近工作等全部子内容。
  2. **引用消息按标签切换**（`ThinkingContext.vue`）：将原"采集方式分类与数量统计网格"改为可点击的**标签页**（含"全部"及 8 种采集方式标签，各标签展示消息条数），新增 `activeCategoryTab` 状态（默认"全部"）；点击标签后仅展示该采集方式对应的引用消息列表，切换"全部"时恢复全部展示。
  3. **新增"执行过程"聚合块**（`ThinkingModal.vue`）：移除按类型分组的三个独立区块（工作 Agent / Writer / 系统 Agent，原代码注释保留参考），改为单一"执行过程 (Execution Process)"内容块，按 Agent 执行顺序（Intent 优先、其余按 `orchestration_agent_execution.created ASC`）聚合展示所有 Agent 的执行过程列表，每条前置序号徽标。
- **行为差异**：
  - 修改前：上下文环境无法折叠；引用消息按采集方式一次性全部平铺；Agent 按类型分三块展示（工作 Agent → Writer → 系统 Agent），顺序与真实执行时序不一致。
  - 修改后：上下文环境支持折叠/展开；引用消息可按标签切换聚焦查看；所有 Agent（Intent / Planner / Worker / Writer / Evolutor）统一在"执行过程"块内按执行顺序排列。
- **新增边界条件**：某标签下无消息时展示"该标签下暂无引用的消息"空态；总引用消息为 0 时仍展示"会话内未采集到任何关联或引用的消息"；Simple 策略下无 Planner/Writer 时"执行过程"块仅展示实际存在的 Agent。
- **术语澄清**：`显式引用 (CITING)` 与 `手动勾选 (SELECTED/CUSTOM)` 为两种不同采集方式，同一 Work 内互不重合——CITING 在 DEFAULT 多维采集模式下将传入的 `selected_msg_ids`/`custom_info_ids`（显式引用 ID）标记为"显式引用"；CUSTOM 仅在 `mode === 'CUSTOM'` 纯自定义构建模式下将同一批 ID 标记为"手动勾选"。二者数据源相同但对应互斥的构建模式，不会同时出现。

### [2026-08-21] 修复刷新后系统回复重复展示与移除冗余 exchanges 请求
- **变更原因**：刷新对话页面后，对话区将系统回复消息展示两次——一次经 `MessageCard`（正确消息框结构），另一次经 `loadChatHistory` 中为 blocks 为空消息构造的 `TextParagraph` 兜底块（纯文本段落，非消息框结构），不符合「对话结束拉取历史消息后应避免与官方 MessageCard 产生双份重复渲染」的要求；同时页面挂载/切换会话时发起了无实际用途的 `/api/chat/exchanges` 请求（结果被丢弃）。
- **功能变更**：
  1. **移除兜底 TextParagraph 块**：`session.ts` 的 `loadChatHistory` 不再为 blocks 为空的 assistant 消息构造 `TextParagraph` 兜底块（原代码注释保留为参考）。系统回复内容统一由 `messages` 经 `MessageCard` 渲染；`blocks` 仅用于承载后端下发的 ThinkingChain 等思考块（供「思考过程」弹窗采集，对话区不直接展示）。
  2. **移除冗余 exchanges 请求**：删除 `session.ts` 的 `loadExchanges`、`api/index.ts` 的 `chatApi.exchanges` 及 `ChatView.vue` 中的两处调用（原代码注释保留为参考）。页面刷新/切换会话仅保留 `GET /api/chat/history` 与 `GET /api/visualization/message-dag` 两个必要接口。
- **行为差异**：
  - 修改前：刷新后系统回复在对话区出现两次，其中一次为非消息框结构的纯文本段落；页面刷新会额外发起 `/api/chat/exchanges` 请求。
  - 修改后：系统回复在对话区仅经 `MessageCard` 展示一次；页面刷新仅发起历史消息与消息图谱两个必要接口。
- **新增边界条件**：后端 `/api/chat/exchanges` 路由保留（供 e2e 测试与后续扩展使用），仅前端不再调用。

### [2026-08-19] 对话区不展示 Planning 策略拆解
- **变更原因**：用户要求对话区只保留 REQUEST/RESPONSE 消息的清爽展示，"Planning 策略拆解"卡片不应混入消息流。
- **功能变更**：`ChatArea.vue` 对话区消息流移除 `AgentDagFlow` 渲染（原代码注释保留为参考），长程多 Agent DAG 网络不再在对话区展示；Planning 策略拆解仅保留在"思考过程"弹窗（`PlanningBreakdown`）内展示。
- **行为差异**：
  - 修改前：RESPONSE 消息上方渲染"Planning 策略拆解"DAG 网络卡片（`AgentDagFlow`）。
  - 修改后：对话区仅展示 REQUEST/RESPONSE 消息卡片与交互块，不再展示拆解 DAG 卡片；拆解详情通过消息框底部「思考过程」按钮在弹窗内查看。
- **新增边界条件**：无（纯前端展示移除，`/api/chat/history` 仍返回 `agentDag` 字段，兼容弹窗/信息页后续消费）。

### [2026-08-19] Planning 策略拆解加入"思考过程"弹窗
- **变更原因**：此前"思考过程"弹窗仅展示各 Agent 的 ThinkingChain 思考块，未包含 Planning 策略下的任务分解与 Agent DAG，复杂任务看不到"如何被拆解"的全貌。
- **功能变更**：
  1. **后端数据采集**：`dev-server.ts` 的 `buildThinkingBlocksAndDag` 解析 `agent_plan.task_dag` 得到 Planner 任务级拆解（Task DAG），随 `workDagMap` 一并下发；`GET /api/chat/thinking` 响应新增 `dag` 字段（`planId` / `totalCount` / `taskDag` / `nodes` / `edges`）。
  2. **流式实时拆解**：`ChatArea.vue` 的 `handleStreamEvent` 新增 `plan_created`（记录 Task DAG）、`agent_dag_created`（记录 Agent DAG）、`dag_node_start` / `dag_node_end`（记录 JSONNode 编排执行步骤）四个事件处理，实时写入 `sessionStore.planning`。
  3. **弹窗展示**：新增 `PlanningBreakdown.vue`，弹窗顶部展示任务拆解清单（领域/复杂度/优先级/依赖）、任务→Agent 映射 DAG（复用 `AgentDagFlow`）、编排执行步骤（状态/耗时）；`ThinkingModal.vue` 依据 target 是否为流式自动选择实时拆解或接口采集拆解数据。
  4. **前端类型**：`types.ts` 新增 `TaskDagNode` / `TaskDagEdge` / `TaskDagData` / `DagNodeItem` / `DagEdgeItem` / `AgentDagData` / `DagExecutionStep` / `PlanningData`；`session.ts` 新增 `planning` / `thinkingDag` 状态及 `resetPlanning` / `updatePlanning` 操作。
- **行为差异**：
  - 修改前：弹窗仅显示 Agent 思考块；点击"思考过程"仅返回 ThinkingChain Blocks。
  - 修改后：弹窗顶部展示 Planning 策略拆解（任务拆解 → Agent DAG → 编排执行步骤），流式期间实时填充，历史消息点击按钮从后端采集完整拆解数据。
- **新增边界条件**：Simple 策略或无拆解数据时不渲染拆解区块；接口反查不到 task_dag / agent_dag 时 `dag` 为 `null`，弹窗仅展示思考块。

### [2026-08-19] ChatMap 布局：回答正下方 + 引用底部对齐
- **变更原因**：用户提出 ChatMap 区两条布局要求——① 系统回答应放在提问的正下方；② 引用方与被引用方的最下面的一个消息框纵坐标一致。
- **功能变更**（`session.ts` 的 `loadDag` 布局算法）：
  1. **回答正下方**：层级传播不再只针对 CITATION 边，QUESTION_ANSWER 边同样参与（回答方层级 = 提问方层级），保证每条问答同列、回答位于提问正下方一行。
  2. **引用底部对齐**：问答边连接的 REQUEST+RESPONSE 归为「消息列」（party）；引用边将引用方与被引用方的消息列归入同一「行带」，行带内所有消息列共享底部行（最下面的消息框纵坐标一致）。
  3. **行带排布**：行带按节点最早时间先后排序依次分配底部行索引，行带之间留一行间距。
- **行为差异**：
  - 修改前：y 仅按消息时间序号线性递增，x 仅按引用层级；若回答被后续引用，回答方与提问方可能不同列（回答不在提问正下方）。
  - 修改后：回答必在提问正下方；引用关系两端消息列的最下面的消息框纵坐标对齐；无引用关系的独立话题按时间纵向分离并留出行间距。
- **新增边界条件**：提问尚无回答（流式进行中）时，该提问作为单消息列放在行带底部行，与所引用的被引用方底部对齐。

### [2026-08-19] 消息框摘要/原文双区统一折叠与 Markdown 渲染
- **变更原因**：ChatMap 区消息框此前摘要/原文均为纯文本展示（未渲染 Markdown），且摘要区与原文区由两套不同分支实现，不符合「ChatMap 与对话区消息框结构统一、差异仅靠样式覆盖」的要求。
- **功能变更**：
  1. **双区结构统一**：`MessageCard.vue` 内容区改为「摘要 + 原文」双区统一 `<details>` 结构（均支持折叠/展开，均渲染 Markdown）：
     - 摘要区：新增 `renderedSummary`，走 `marked` + `DOMPurify` 渲染 Markdown，无摘要时回退原文（再为空显示「(无内容)」）；
     - 原文区：`renderedContent` 走 `marked` + `DOMPurify` 渲染 Markdown（原有能力）。
  2. **默认展开态**：ChatMap（`mode=map`）默认展开摘要、折叠原文；对话区（`mode=timeline`）默认展开原文、折叠摘要；差异仅由 mode 样式覆盖（字号、最大高度、配色）区分，不再使用两套模板分支。
  3. **折叠状态可交互且持久**：折叠/展开状态由响应式 ref（`summaryOpen`/`contentOpen`）管理，经 `@toggle` 同步；用户手动切换后不因组件重渲染重置为默认态；隐藏原生 `<details>` 箭头，改用旋转 `▸` 指示符。
- **行为差异**：
  - 修改前：ChatMap 消息框摘要为单行纯文本截断、原文为纯文本（`whitespace-pre-wrap`），均不渲染 Markdown；对话区仅原文渲染 Markdown。
  - 修改后：ChatMap 与对话区消息框结构一致，摘要与原文双区均渲染 Markdown，均支持折叠/展开，仅默认展开态不同。
- **新增边界条件**：摘要为空时回退原文展示；摘要与原文均为空时摘要区显示「(无内容)」。

### [2026-08-19] 消息框摘要统一生成与无截断展示
- **变更原因**：解决消息框摘要被后端（50字原文截断）与前端（20字截断）多重截断的问题，同时收拢 LLM 摘要生成逻辑至 SummaryAgent。
- **功能变更**：
  1. **前端摘要取消 20 字截断**：`session.ts` 移除 `.slice(0, 20)`，保留完整的 `info_summary` 数据。
  2. **后端摘要使用真实 AI 摘要**：`VisualizationService.getVisualizedMessageDAG` (`GET /api/visualization/message-dag`) 改从 `info_summary` 表读取真实 AI 摘要，不再对原文做 50 字截断。
- **行为差异**：对话区与 ChatMap 消息框展示完整的 AI 生成摘要（超阈值内容不被截断，≤100字短内容展示完整原文作为摘要）。

### [2026-08-20] "思考过程"弹窗：PromptProvider完整Prompt与引用消息采集分类统计

- **变更原因**：确保"思考过程"弹窗中展示的"Agent 发送给 LLM 的完整 Prompt"全量使用 PromptProvider 渲染返回的完整 Prompt（涵盖 System Soul、提示词模板、对话历史与变量），同时按消息采集方式对"引用的消息"进行精确分类与数量统计。
- **功能变更**：
  1. **PromptProvider 完整 Prompt 全链路贯通**：
     - 在 Agent 层（`AgentExecutionService.ts`、`IntentAgentService.ts`、`PlannerAgentService.ts` 等）将 `promptsAccess.execPrompt` / `PromptProvider` 返回的 `prompt` 完整保存至执行 Trace 记录、`IntentAgentOutput` 与 Work 元数据。
     - 在实时流式 SSE 事件（`agent_thinking`、`agent_reflection`、`intent_agent_result`、`agent_output`）中全量透传 `prompt` 属性，确保前端流式期间即能完整获取 PromptProvider 渲染的完整 Prompt。
     - 前端 `ThinkingBlock.vue` 明确标记并优先渲染 PromptProvider 返回的完整 Prompt（含系统提示词与上下文渲染变量）。
  2. **“引用的消息”按采集方式分类及数量统计**：
     - 前端 `ThinkingContext.vue` 与 `ChatArea.vue` 解析完整 `context_categories`（含有显式引用 CITING、时间线 TIMELINE、钉住关注 PINNED、语义相似 SIMILARITY、标签相关 TAG_RELATIVE、关键词匹配 KEYWORD、随机采样 RANDOM、手动勾选 SELECTED）及分类 ID 映射。
     - `ThinkingContext.vue` 提供顶部**采集方式分类与数量统计网格**（如显式引用: 2条 | 时间线: 5条 | ...）与引用消息总计徽章，并在下方按采集方式分类列出所有引用的消息列表。
- **行为差异**：
  - 修改前：思考弹窗中 Prompt 在流式阶段容易降级为当前发送消息 Query；引用的消息二选一展示且缺乏采集方式的数量统计分类。
  - 修改后：思考弹窗全程展示 PromptProvider 返回的完整 Prompt；引用的消息按 8 种采集方式分类列出并进行数量统计。

### [2026-08-20] "思考过程"弹窗上下文丰富度提升、Prompt脱敏非内容属性、复制跨平台与Markdown渲染修复
- **变更原因**：修复"思考过程"弹窗中运行与对话上下文环境展示不足、Agent 发送给 LLM 的 Prompt 混入 work_context 等非内容 JSON 属性、输入/输出 Token 显示为 0、Prompt 与回复复制未跨平台写入系统剪贴板以及 LLM 回复未正确渲染 Markdown 的问题。
- **功能变更**：
  1. **上下文环境全分类数据透传**：`JSONNodeService.ts` 的 `context_built` SSE 事件与 `dev-server.ts` 的 `/api/chat/thinking` 端点完整解析并透传 `context_categories`（含有引用消息、时间线消息、钉住消息、语义相似消息、标签相关消息、关键词相关消息、随机消息）与 `context_category_ids` 映射表，使 `ThinkingContext.vue` 能展示完整的问答上下文。
  2. **Prompt 剥离非内容 JSON 属性**：在 Agent 层 (`AgentExecutionService.ts`) 调用 `PromptProvider` 前以及后端重建思考块时，调用 `parseTaskContentAndContext` 自动剥离 `work_context` JSON 前缀，确保 Prompt 变量仅包含干净的用户 Query / Task Content，消除非内容 JSON 属性。
  3. **输入与输出 Token 统计修复**：在 trace 追踪与单步 answer 执行时完整记录 `prompt`、`raw_response`、`input_tokens` 与 `output_tokens`；`agent_output` SSE 事件中透传 Token 细项，并在前端 `ChatArea.vue` 和 `dev-server.ts` 中完成准确计算与回填。
  4. **跨平台剪贴板复制 (Windows/Linux/macOS)**：`ThinkingBlock.vue` 复制 Prompt 与复制回复按钮重构为使用 `@/utils/clipboard` 中的 `copyToClipboard`，支持现代 Clipboard API 与 `document.execCommand('copy')` 双重降级，彻底解决非安全上下文/跨 OS 剪贴板失效问题。
  5. **模型完整回复 Markdown 渲染**：`ThinkingBlock.vue` 中“模型的完整回复 (LLM Response)”改用 `marked` 解析并经 `DOMPurify` 过滤后渲染 Markdown HTML，配合 `.markdown-body` 样式展现丰富的标题、代码块、列表与表格。

### [2026-08-20] "思考过程"弹窗上下文全维度增强、Prompt与回复完整展示及Token/思考方式升级
- **变更原因**：满足"思考过程"弹窗全维度上下文展示、问答上下文 ID 分类保存、完整 Prompt 与模型回复展示、思考方式标签 (CoT/ReACT) 保留与移除 Canvas 图，以及输入/输出 Token 分别展示的需求。
- **功能变更**：
  1. **全维度上下文环境展示 (ThinkingContext.vue)**：展示完整的上下文类型：① 会话内：基于时间线的信息 或 引用的消息（二选一）；② 会话内：钉住的消息；③ 全系统：语义相似消息；④ 全系统：标签相关性消息；⑤ 全系统：关键词相关消息；⑥ 会话内：随机消息（受配置中心 `random_max_percent` 上限约束，默认 ≤20%）。
  2. **问答上下文 ID 列表分类保存**：`InfoCoreService.ts` 与 `ContextInfoOutput` 输出 `category_ids` 映射表，保存并透传一次问答按选择方式（timeline, citing, pinned, similarity, tag_relative, keyword, random）分类的消息 ID 列表；并在弹窗 Context 区提供可视化分类 ID 列表。
  3. **完整 Prompt 与 模型完整回复 (ThinkingBlock.vue)**：Agent 展示区块中新增完整 Prompt 区域（提供一键复制与字符统计）与 LLM 模型完整回复区域。
  4. **思考方式标签与 Canvas 优化**：移除 `CanvasReActFlow` 图形渲染，顶部标栏保留思考方式标签（如 `CoT`、`ReACT`）。
  5. **Token 用量分别展示**：顶部与用量面板中分别展示 `输入 Token` 和 `输出 Token`（如 `输入: 120 | 输出: 45 (共 165)`）。
- **行为差异**：
  - 修改前：上下文仅展示部分引用/画像；思考块展示 CanvasReActFlow 图；Token 仅显示总数。
  - 修改后：上下文全维度精准分类并显示 ID 列表；单独展示 Prompt 和完整回复；显示 CoT/ReACT 思考方式标签并移除 Canvas 图；Token 拆分展示输入与输出。

### [2026-08-20] "思考过程"弹窗独立模块加载与动态加载态升级
- **变更原因**：解决打开思考过程弹窗时展示静态"暂无思考过程"空白弹窗的问题，实现弹窗内各模块（上下文、DAG编排、Agent节点输出）独立按需加载，提升响应速度与交互体验。
- **功能变更**：
  1. **"正在加载思考过程..."动态加载态**：`session.ts` 新增 `thinkingLoading`、`dagLoading`、`blocksLoading` 状态；`ThinkingModal.vue` 弹窗打开时显示标题与居中动画"正在加载思考过程..."，避免静态空白或"暂无思考过程"提示。
  2. **模块独立并发加载**：`dev-server.ts` 的 `/api/chat/thinking` 端点支持 `module=dag` / `module=blocks` / `module=all` 参数；`ChatArea.vue` 与 `ChatMap.vue` 并发调用 DAG 与 Blocks 模块接口，实现 DAG 编排图与 Agent 节点输出独立更新展示。
  3. **模块级 Skeleton/加载骨架屏**：`ThinkingModal.vue` 为 DAG 模块与 Agent 节点输出模块分别提供独立的 Loading 骨架提示，各模块数据就绪后即刻渲染展示。
- **行为差异**：
  - 修改前：弹窗打开时同步等待整包数据，数据未返回时展示静态"暂无思考过程"；
  - 修改后：弹窗打开即展示"正在加载思考过程..."，各模块独立加载并渐进式渲染。

### [2026-08-19] 思考过程弹窗与 ChatMap/对话区消息框结构统一
- **变更原因**：用户需要点击「思考过程」按钮以弹窗形式查看 Agent 思考过程；同时要求 ChatMap 区与对话区消息框结构一致，仅默认展开态不同（ChatMap 默认展示摘要折叠详情，对话区默认展示详情折叠摘要）。
- **功能变更**：
  1. **思考过程按钮**：`MessageCard.vue` 底部栏新增带文字标签的「思考过程」按钮（紫色胶囊 + 大脑图标），点击后先调用 `GET /api/chat/thinking` 采集指定消息对应 Work 的 Agent 执行轨迹，再打开 `ThinkingModal.vue` 弹窗展示（流式期间 target 为空时实时展示当前流式思考块，`done`/`error` 自动关闭）。
  2. **消息框结构统一**：`MessageCard.vue` 内容区重构为「摘要 + 详情」双区统一结构（顶部栏 / 摘要区 / 详情区 / 底部栏两区完全一致）：
     - ChatMap（`mode=map`）：默认展开摘要、折叠「原文」详情；
     - 对话区（`mode=timeline`）：默认展开详情（Markdown 全文）、折叠「摘要」，无摘要数据时不渲染摘要区。
  3. **对话区摘要数据来源**：`ChatArea.vue` 为对话区消息卡传递 `summary`，取自 ChatMap 节点（`info_summary`），保证两区摘要一致。
- **行为差异**：
  - 修改前：思考过程仅大脑图标按钮（无文字），且对话区消息框不展示摘要、仅有全文。
  - 修改后：按钮明确标注「思考过程」，对话区消息框新增可折叠摘要区，与 ChatMap 结构一致，仅默认展开态不同。
- **新增边界条件**：反查不到 work_id 或采集失败时弹窗展示「暂无思考过程」空态；对话区无摘要数据时不渲染折叠摘要区。

### [2026-08-19] "思考过程"弹窗重构：独立 Agent 思考中状态 + Canvas 式 DAG 展示
- **变更原因**：原弹窗按"Planning 拆解 + 思考块"展示，未按 上下文→TaskDAG→AgentDAG→工作 Agent→Writer 的顺序组织；各 Agent "思考中"状态不独立（依赖整块 streaming 标志）；AgentDAG 无执行状态着色，也无法与下方 Agent 执行联动。
- **功能变更**：
  1. **每个 Agent 独立的"思考中"状态**：`session.ts` 新增 `agentExecutions`（key=agent_id 的运行时状态表）与 `setAgentStatus/resetAgentStatus`；`ChatArea.vue` 在 `agent_building/agent_built`、`agent_thinking`、`agent_reflection` 置为 RUNNING（思考中/黄色），`agent_output` 置为 SUCCESS（成功/绿色）并回填 `tokenUsage`/`durationMs`，`agent_error`/`error` 置为 ERROR（失败/红色）。`ThinkingBlock.vue` 标题栏展示独立状态徽标（思考中/已完成/执行失败）。
  2. **整体"思考中"状态**：`ThinkingModal.vue` 顶部若任一 Agent 处于 RUNNING 或存在流式思考块则整体显示"思考中..."。
  3. **展示顺序重构**：`ThinkingModal.vue` 按 ① 上下文 `ThinkingContext.vue`（聚合用户画像/引用历史/最近工作/记忆知识/策略）→ ② TaskDAG Canvas 图 `TaskDagFlow.vue`（分层 DAG + 依赖箭头）→ ③ AgentDAG Canvas 图 `AgentDagFlow.vue`（Agent 名称 + 状态着色 + 点击定位下方对应 Agent）→ ④ 工作 Agent（每个独立展示 CoT/ReAct Canvas、Prompt、模型输出、Token 用量与耗时）→ ⑤ Writer Agent 的顺序展示。
  4. **AgentDAG 与 Agent 执行联动**：`AgentDagFlow.vue` 重写为分层 DAG（`dagLayout.ts` 最长路径分层布局），节点未执行灰色 / 执行中黄色 / 成功绿色 / 失败红色，含图例；点击节点触发 `focusAgent` 滚动并高亮下方对应 Agent 卡片（`agent-focus-ring`）。
  5. **后端 Agent 执行完成事件**：`OrchestrationExecutionService.execSingleAgent` 在成功/失败时推送 `agent_output` / `agent_error` SSE 事件（含 `agent_id`、`answer`、`elapsed_ms`、`token_usage`），使流式期间 AgentDAG 能实时由黄转绿/红；`dev-server.ts` DI 装配 `streamAccess` 传入。
  6. **历史 AgentDAG 状态回填**：`dev-server.ts` 的 `buildThinkingBlocksAndDag` 按 `orchestration_agent_execution.status` 回填 DAG 节点状态（COMPLETED 成功 / EXEC_FAILED 失败 / CANCELLED·PENDING 未执行），历史任务重看时 AgentDAG 颜色准确。
- **行为差异**：
  - 修改前：弹窗为"Planning 拆解（列表式 Task DAG + 链式 AgentDAG）+ 思考块"；Agent "思考中"依赖整块 streaming 标志（不独立）；AgentDAG 无执行状态与联动。
  - 修改后：弹窗严格按 上下文 → TaskDAG → AgentDAG → 工作 Agent → Writer 顺序展示；每个 Agent 独立"思考中"状态；AgentDAG 为 Canvas 式分层图并实时状态着色、可点击联动下方 Agent。
- **新增边界条件**：无 AgentDAG/TaskDAG 数据（Simple 策略）时仅展示上下文 + 工作 Agent；AgentDAG 节点点击但下方无对应 Agent 卡片时无副作用；`agent_output` 事件缺失（旧后端）时 Agent 保持 RUNNING 直至 `done`。

### [2026-08-18] Agent 思考过程、上下文与输入输出完整展示升级
- **变更原因**：针对原本“思考过程信息不全，未展示上下文及各个 Agent 输入输出”的问题进行全链路重构。
- **功能变更**：
  1. **ThinkingBlock.vue 重构**：新增 Agent 身份规范标签（LLM 模型 ID、Soul 品格、技能/MCP 工具数），新增 Tab 导航与分块结构，支持展示 Agent 上下文 Context (用户画像/引用消息)、任务输入 Input、步骤步骤 (Think 推理 / Act 工具调用及参数结果 / Reflect 自我反思与通过结论) 以及节点输出 Output。
  2. **SSE 流式解析增强**：`ChatArea.vue` 在对话流推进中，完整解析并归集 `context_built`, `agent_building`, `agent_built`, `agent_thinking`, `agent_action`, `agent_reflection`, `agent_output` 等事件。
  3. **历史会话恢复**：后端 `/api/chat/history` 在查询会话记录时，从 `orchestration_agent_execution` 及 `agent_execution_trace` 聚合各 Work 的 Agent 执行轨迹，为回答组装对应的 ThinkingBlocks，前端 `sessionStore.ts` 载入会话时自动恢复，实现刷新页面后思考过程与上下文不丢失。
  4. **Agent 相似度匹配算法升级**：重构 `simpleSimilarity` 为 Bigram + 中文字符级 Jaccard 算法（包含去标点归一化与领域隔离），彻底解决相同或相似提问下因传统空格切词失效而无法复用 Agent 的问题。
  5. **思考 Blocks 严格时间序**：重构 `ChatArea.vue` 时间线排序，确保多 Agent 思考块严格按 `createdAt` 升序及消息角色优先关系无倒置呈现。
### [2026-09-12] 交互复盘修复（interact 307bee46）：一次提问不再出现两个回答 + Tool 执行卡靠右对齐
- **变更原因**：用户在问答 interact 307bee46-f0b3-4365-8f60-61d6c041f1d8 中反馈两点不合理：① 一次提问出现"两个回答"——`tool.result` 的工具输出经 `onAgentOutput → appendAssistantChunk` 被追加进用户可见 TextParagraph，随后的 `reply.delta` 最终回复又拼进同一块，形成"工具结果 + 最终回复"两段回答；② 工具执行动画卡（ToolInvocation）在对话区靠左渲染，与用户消息同侧，视觉上误读为用户输入。
- **修改的方法**：
  - `chatStreamEvents.ts onAgentOutput(ctx)` — 原始代码（保留在文件内注释参考）：
    ```
    // 如果也是向用户展示的文本块
    appendAssistantChunk(ctx, typeof outputVal === 'string' ? outputVal : String(outputVal || ''))
    ```
    修改后：删除该追加调用；Agent 输出只回填思考块，用户可见最终回复仅由 `reply.delta` / `text_chunk` 提供。
  - `ChatArea.vue` 时间线 Block 包裹层 — 原始代码（保留在文件内注释参考）：
    ```
    :class="entry.block.role === 'user' ? 'ml-auto' : 'mr-auto'"
    ```
    修改后：`entry.block.type === 'ToolInvocation' ? 'ml-auto' : 'mr-auto'`，ToolInvocation 执行卡靠右、与系统回复消息一致。
- **影响的端点**：
  - `POST /api/chat/stream`、`POST /api/chat/confirm-intent`、`POST /api/chat/submit-clarification` — SSE 帧分发逻辑变更：`tool.result` 不再流入对话区正文。
- **可能存在的问题**：
  - 若某些编排路径仅通过 `agent.output`（`tool.result` 承载）交付最终答案而无 `reply.delta`，对话区正文将不再展示该路径的答案（可观测回归点）。
  - ToolInvocation 卡靠右后与 Feedback 块、错误块的左右混排需在后续回归中确认视觉一致性。
