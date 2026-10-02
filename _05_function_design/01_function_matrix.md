# 01 功能矩阵与任务卡(_05_function_design)

> 状态:confirmed　更新:2026-09-26
> 范围:本次需求 R2(前端人性化改造)与 R3(后端重构治理)的任务卡;存量功能矩阵以 _04 模块职责表 + _07_method_idx 方法索引(2529 方法)为准,不在此重复。

## 1. 功能矩阵(本次需求相关)

| 模块 \ 层 | UI(组件/页面) | app(编排 hooks/stores) | infra(api 适配) | 后端关联 |
|---|---|---|---|---|
| 前端-设计令牌 | tailwind.config + globals.css | — | — | — |
| 前端-共享组件 | ModalShell/ConfirmDialog/ToggleSwitch/StatusNote(T-R2 组) | — | — | — |
| 前端-Chat | ChatView/ChatArea/MessageCard/blocks | useChatStream | api/index | /api/chat/* |
| 前端-Info | InfoView + 7 tab | useXxxTab ×6 | api | /api/memory、/api/library、/api/profile |
| 前端-Config | ConfigView(6243 行,子区块 20+) | — | api | /api/config* |
| 前端-Learning/Monitor | LearningPanel/MonitorPanel | 轮询 | api | /api/learning、/api/monitor |
| 前端-Tool/Cron/Home | ToolView/CronView/HomeView | useTypewriter 等 | api | /api/tool/*、/api/cron |
| 后端-dev-server | — | createServer/buildContext(组合根) | node:http | 全部路由 |

## 2. 任务卡 — R2 前端人性化改造(纯 style/refactor,契约不变)

### T-F01 设计令牌地基
- 文件:`brian-frontend/tailwind.config.js`、`src/styles/globals.css`、`index.html`
- 产出:语义色板补全(info/success/warning/error 语义化,替换裸 sky/amber/red/purple/green);type scale(text-2xs~text-lg 收敛 arbitrary 字号);z-index 层级表(modal=z-50/drawer=z-40/tooltip=z-60 统一);圆角阶梯修正(xl:28px>2xl:16px 异常);btn-danger 公共类;焦点环/滚动条/选区/reduced-motion 基础态;遮罩统一 bg-black/50
- 验收:`npm run build`(vue-tsc + vite)通过;视觉抽查
- 预估:30 分钟

### T-F02 共享弹层组件(ModalShell + ConfirmDialog)
- 文件:新建 `src/components/common/ModalShell.vue`、`ConfirmDialog.vue`
- 产出:Teleport 弹层骨架(遮罩统一、focus trap、Esc 关闭、aria-modal);确认弹窗(危险/普通两种意图);替换 12+ 处重复弹窗骨架中本次触及的页面(ChatView/HistoryTab/MemoryTab/ProfileTab/CronView 等确认弹窗)
- 验收:build 通过;弹窗交互手测项留待人工
- 预估:40 分钟

### T-F03 共享开关与状态组件(ToggleSwitch + StatusNote)
- 文件:新建 `src/components/common/ToggleSwitch.vue`、`StatusNote.vue`(loading/empty/error 三态)
- 产出:统一 w-9 h-5 开关替换手写 3 种规格;三态组件替换"加载中..."纯文本(HistoryTab/MemoryTab/GraphPane/CronView 等)
- 验收:build 通过
- 预估:30 分钟

### T-F04 语义色收敛(聊天与弹窗族)
- 文件:ThinkingContext.vue、EvalResultModal.vue、ConfigValueDiff.vue、LearningPanel.vue、PermissionConfirmCard.vue、IntentConfirmCard.vue、AskUserCard.vue、MessageCard.vue、ThinkingModal.vue(rgba(37,99,235)→令牌)
- 产出:裸 tailwind 原生色→语义 token;弹窗深色底统一(apple-gray-800)
- 验收:build 通过
- 预估:30 分钟

### T-F05 图组件暗色与主题修复
- 文件:GraphPane.vue、ChatMap.vue
- 产出:SVG 硬编码 #0071e3/#d1d1d6/#2563eb → CSS 变量(含 dark 变体);tooltip 底色令牌化
- 验收:build 通过;暗色模式目测
- 预估:20 分钟

### T-F06 ConfigView 修复与收敛(不拆文件)
- 文件:ConfigView.vue
- 产出:**修 pt-12→pt-14 顶栏遮挡 bug**;ml-2/ml-5 笔误;内联 style 收敛(:3700/:3715/:3765/:3731);弹窗底色统一;checkbox 样式统一 accent-brian-blue
- 验收:build 通过
- 预估:25 分钟

### T-F07 页面工具条与细节统一
- 文件:ChatView.vue、InfoView.vue、ToolView.vue、CronView.vue、MonitorView.vue
- 产出:面包屑条 sticky 一致化(ChatView 补 sticky);水平内距统一(px-5/px-6 → 统一);tab 语言统一(实底选中 vs 浅底选中按页统一);ChatView checkbox 对比度;重复 formatTime → utils/format.ts;HomeView 裸 fetch → api 层
- 验收:build 通过
- 预估:30 分钟

### T-F08 可访问性与响应式补强(轻量)
- 文件:Header.vue、ChatArea.vue、LoginPage.vue、各 ModalShell 接入处
- 产出:icon 按钮 aria-label;低对比文字修正;ChatArea 窄屏单栏(md 断点);Header 窄屏溢出可横滚;HistoryTab/MemoryTab 日期栏窄屏折叠
- 验收:build 通过
- 预估:30 分钟

## 3. 任务卡 — R3 后端重构治理(契约不变)

### T-B01 超长方法治理(>100 行 Top offenders)
- 文件:Base/shared/aop/AopProxy.ts(wrap 166/get 148)、Core/SkillCoreProvider/SkillCoreService.ts(matchSkill 119)、Agent/EvolutorAgent/EvolutorAgentService.ts(runEvaluationCycle 115)、Base/LLMProvider/LLMService.ts(genLLMAttr 112/embedLLM 107)、Base/StreamProvider/StreamService.ts(pushStream 108)、Application/UserProfile/UserProfileService.ts(soUserProfile 108)、Agent/AgentExecution/AgentExecutionService.ts(runPhases 106)、Base/CDTProvider/CDTService.ts(startCDT 105)、Base/PromptsProvider/PromptsService.ts(soPromptWithUsageSorting 104)、Application/SelfLearning/SelfLearningService.ts(soLearningStats 101)
- 产出:按三分类下沉私有方法,主体 ≤30 行;行为不变,既有测试回归
- 验收:`npm run typecheck` + 对应层 vitest 通过;`analyze:methods 30` 报告 offender 数下降
- 预估:60 分钟(逐方法小步提交)

### T-B02 dev-server 思考块组装下沉
- 文件:brian-backend/dev-server.ts(buildThinkingBlocksFromRuntime ~700 行 / buildThinkingBlocksFromOrchestration ~420 行)
- 产出:下沉为独立模块(如 Server 层 `thinking/`),dev-server 只保留调用;行为不变
- 验收:typecheck + Runtime/Application 测试通过
- 预估:30 分钟

### T-B03 dev-server 组合根与路由域拆分(结构化,风险最高)
- 文件:brian-backend/dev-server.ts(createServer ~3200 行 / buildContext ~530 行)
- 产出:buildContext 按域拆容器;路由 if-else 链抽为 `server/routes/<domain>.ts` 注册表;**不改变任何路由路径与行为**
- 验收:typecheck + 全量测试 + 前端 e2e(API 集成)通过
- 预估:90 分钟;若回归不稳定则缩小范围并在 _10 记录(底线 T-B01/T-B02 已达成)

### T-B04(后续)全量方法索引工具补全
- 文件:`scripts/generate-method-index.mjs`、`scripts/gen-sop-07.mjs`
- 产出:补全覆盖全部 2942+ 方法的全量扫描器(当前 docs:index 仅覆盖 Access 层 505 方法;docs/method.idx.json 为 2026-09-26 10:37 快照),并重跑 gen-sop-07 刷新 _07_method_idx 分片(重构新增的私有方法入库)
- 验收:`node scripts/gen-sop-07.mjs` 后 _07_method_idx 分片与代码 grep 抽查一致
- 预估:40 分钟

### T-F13 i18n 补全(用户选 B:保留语言按钮;分期)
- P1(已完成):i18n 基建升级(参数化 t(key, params)/html lang 同步/标题即时刷新/语言按钮自指文案修复);全局骨架接线(Header 按钮、8 页面包屑、router 标题、NavItems);主对话流(ChatView 侧栏/溢出提示/删除确认、ChatArea 空态、InputBox、MessageCard 芯片);公共组件(ConfirmDialog/ModalShell/StatusNote);词典 38→78 键。中文 UI 逐字不变,英文为新增
- P2(后续):信息页 7 tab 内部面板、思考/评估/组件弹窗内部、Cron 执行记录弹窗
- P3(后续):ConfigView 20+ 子区块、Learning/Monitor/UserProfile 面板内部、HomeView 营销文案
- 验收(P1):浏览器双语往返实测(EN:lang 属性/标题/导航/侧栏/芯片/Info tabs;ZH 无损还原);vue-tsc 0 错;前端 vitest 无新增失败

## 4. 任务卡 — R5 历史会话卡片与图谱治理

### T-B05 会话标题源头控制与创建时间暴露
- 文件: `brian-backend/Application/Chat/application/ChatService.ts`、`brian-backend/dev-server.ts`、`brian-frontend/src/api/types.ts`
- 产出:
  1. `autoGenerateSessionTitleIfEmpty`: 标题从源头截取并约束在 8~12 个字以内；
  2. `updateSessionTitle`: 限制手动更新标题长度不超过 12 个字；
  3. `soSession` / `dev-server.ts`: `/api/chat/list` 响应增加 `created` 与 `createdTime`；
  4. 前端 `ChatSession` 接口补充 `created?: number; createdTime?: number`。
- 验收: 单测验证标题生成与截断、`/api/chat/list` 返回正确时间戳；typecheck 0 错。
- 预估: 15 分钟

### T-B06 全量 Token 消耗聚合与严格成对问答统计
- 文件: `brian-backend/Application/Chat/application/ChatService.ts`
- 产出:
  1. `soSessionTokenStats`: 从 `llm_call_log` 按 `session_id` 聚合 `input_tokens` 与 `output_tokens`，全面覆盖 Agent 调用及 skill/soul/mcp/prompt/agent 等辅助匹配消耗；
  2. `soSessionQaStats`: 严格按“一次完整用户请求 + 一次系统回答”计算完整问答轮数（匹配 `work_id` 同时包含 REQUEST 与 RESPONSE）；
  3. 字符数保持返回 `question_chars` 与 `answer_chars` 供上层求和。
- 验收: 单测验证含辅助LLM调用的Token汇总计算、未完成请求不计入问答轮次。
- 预估: 20 分钟

### T-B07 会话彻底删除与图数据安全解绑
- 文件: `brian-backend/Application/Chat/application/ChatService.ts`、`brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts`
- 产出:
  1. `ChatService.deleteSingleSession`: 级联清理 `llm_call_log`（清除该会话全部 Token 流水）、`orchestration_work`、`orchestration_agent_execution`、`agent_execution_trace`、运行时各表与反馈表；
  2. 保护图数据：会话删除时仅清理 `info_tag`、`info_keyword` 关系记录及 info 消息节点与 CITATION 边，严禁直接删除共享的 Tag/keyword 图节点。
- 验收: 单测验证删除会话后 Token 记录被清除，且同名 Tag/keyword 节点在图数据库中完好保留。
- 预估: 25 分钟

### T-B08 图节点修复学习——孤立节点安全清理
- 文件: `brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts`
- 产出:
  1. 新增/扩展图修复方法（如 `cleanOrphanGraphNodes` / `rebuildCooccurGraph` 增强）：
  2. 扫描 `graph_node` 中 `node_type='Tag'` 与 `node_type='keyword'` 的节点，对比 `info_tag` 与 `info_keyword`；
  3. 当且仅当某节点完全没有关联任何消息（引用计数为 0）时，安全删除该孤立节点及其相连共现边。
- 验收: 单测验证孤立节点被准确清理，仍有消息引用的节点未被误删。
- 预估: 20 分钟

### T-F09 历史会话卡片改版
- 文件: `brian-frontend/src/components/info/HistoryTab.vue`、`brian-frontend/src/composables/useHistoryTab.ts`
- 产出:
  1. 标题展示：严格展示 8~12 字以内标题（超出做省略处理）；
  2. 创建时间：展示 `formatTime(item.createdTime || item.created)`；
  3. Token 消耗：展示总 Token（`formatTokens(inputTokens + outputTokens)`），带输入/输出 tooltip；
  4. 问答轮数：展示严格成对的 `item.qaCount ?? 0`；
  5. 总字符数：展示提问与回答总字符数 `formatTokens(item.questionChars + item.answerChars)`；
  6. 标签展示：默认渲染前 4 个标签徽章；超出 4 个时渲染 `+N 更多` 按钮，点击弹出标签浮层；
  7. 删除按钮：确认后级联删除；
  8. 点击跳转：点击卡片主体进入 `/chat?session=${sessionId}`，各操作按钮使用 `@click.stop` 阻断冒泡。
- 验收: `npm run build` 通过；Vue 模板类型检查 0 错；单测全绿。
- 状态: **已完成 (commit 6d69238)**

## 5. 任务卡 — R6 LLM 选型隔离与 Agent 级联匹配优化

### T-B10 LLMCore 模型类型隔离与非抛错健壮性重构
- 文件: `brian-backend/Core/LLMCoreProvider/domain/types.ts`、`brian-backend/Core/LLMCoreProvider/application/LLMCoreService.ts`
- 产出:
  1. `MatchLLMInput` 支持 `llm_type?: 'text' | 'embedding'`。
  2. `matchLLM` 支持类型过滤。无模型或缺失参数时不抛出异常，设 `output.error` / `output.error_code` 并返回 `false`。
  3. 过滤后单一可用模型直接命中返回，免调 LLM 裁判。
  4. 拆分私有辅助方法 `soAvailableLLMsByType`、`checkCachedLLM`、`fillSingleLLM`、`rankMultipleLLMs`，均严格 ≤30 行。
- 验收: `npm test -w @brian-agent/core` 通过，20/20 单测全绿。

### T-B11 BM25 纯算法粗筛模块
- 文件: `brian-backend/Runtime/Agents/application/bm25.ts`、`brian-backend/Runtime/test/bm25.test.ts`
- 产出:
  1. 支持中英文混合分词、CJK bi-gram、BM25 打分与 0-100 归一化。
  2. 纯计算无 I/O，符合算法类方法签名与无副作用规范。
- 验收: 单测验证相关性打分与无匹配情况，全量测试通过。

### T-B12 Agent 级联三级匹配与候选瘦身
- 文件: `brian-backend/Runtime/Agents/application/AgentDefService.ts`、`brian-backend/Runtime/test/AgentDefVectorMatch.test.ts`
- 产出:
  1. Stage 1: BM25 粗筛（阈值默认 50），无候选即短路新建 Agent。
  2. Stage 2: 向量过滤（阈值默认 50，高置信度 ≥85 直接采纳）。
  3. Stage 3: LLM 语义精确裁判。
  4. 候选 Profile 极大瘦身：仅传递 `agent_id` + `agent_name` + `description`，彻底剥离 Skill/MCP 组件，杜绝 Prompt 膨胀。
  5. 快速路由阶段禁用思维链（`thinking: { type: 'disabled' }`）并限制 `max_tokens`（默认 512）。
  6. 全面接入配置中心（`match_bm25_threshold`, `match_vector_threshold`, `match_max_tokens`, `match_enable_thinking`）。
  7. 全量方法消除抛错，统一通过 `output.error` / `output.error_code` 返回 `false`，方法体 ≤30 行。
- 验收: `npm test -w @brian-agent/runtime` 8/8 通过，66/66 单测全绿。

### T-R6-01 存储层三表 DDL 与兼容迁移
- 文件: `brian-backend/Core/InfoCoreProvider/infrastructure/InfoCoreSchemaInitializer.ts`、`brian-backend/Core/InfoCoreProvider/domain/types.ts`
- 产出:
  1. 新增 `dialog` 表（纯净问答实体，包含 id, session_id, work_id, type, dialog, dialog_length, dialog_brief, trace_id, created, updated）。
  2. 新增 `execute` 表（组件级执行轨迹，包含 agent_id, exec_no, component_id, component_type, input, input_length, output, output_length, gap 等）。
  3. 新增 `context` 表（仅关联 dialog 表，包含 id, session_id, work_id, dialog_id, type, created, updated）。
  4. 建立高性能索引，彻底清理并废弃 `info_raw` 兼容代码与视图。
  5. 提供初始化时从旧表自动迁移数据至新三表并彻底 DROP 旧表。
- 验收: 单测验证建表与三表增删改查正常，无兼容性代码。

### T-R6-02 InfoCore 与 ChatService 读写分流重构
- 文件: `brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts`、`brian-backend/Application/Chat/application/ChatService.ts`
- 产出:
  1. `saveInfo`: REQUEST/RESPONSE 写入 `dialog` 表；其他中间执行或工具步骤写入 `execute` 表。
  2. `soChatHistory` 与会话统计: 直接查询 `dialog` 表，彻底摆脱中间执行大 JSON 扫描，加载提速 5~10 倍。
  3. `persistContextSourceMap` 与 `soContextByWork`: 对接 `context` 表的 `dialog_id` 关系映射。
- 验收: `npm test -w @brian-agent/core` 与 `@brian-agent/application` 通过。

### T-R6-03 复选框上下文历史时序回溯
- 文件: `brian-backend/Core/InfoCoreProvider/application/InfoCoreService.ts`
- 产出:
  1. 改造 `collectSelectedOrTimelineCandidates`: 当提供 `selected_msg_ids` 时，除作为 `citingCandidates` 之外，提取选中消息的 `work_id`。
  2. 查 `context` 表获取该 `work_id` 历史所使用的上下文 `dialog_id`。
  3. 批量查 `dialog` 表按 `created ASC` 排序回填入 `timelineCandidates`。
  4. 支持前端传入 `pinned_msg_ids` 作为置顶上下文快照。
- 验收: 单元测试验证复选消息时 timelineCandidates 成功包含历史上下文。

### T-R6-04 前端 Pin 与复选会话级内存化
- 文件: `brian-frontend/src/stores/session.ts`、`brian-frontend/src/composables/useChatStream.ts`
- 产出:
  1. Pin 与复选状态统一为前端 Store 内存维护，页面刷新后自然重置失效。
  2. 提问时同时附带 `selected_msg_ids` 与 `pinned_msg_ids`。
- 验收: 前端构建通过，提问链路正常。

### T-B13 组件漏斗明细事件透传(component.funnel)
- 文件: `brian-backend/Base/shared/match/FunnelSelector.ts`、`brian-backend/Base/shared/base/BusinessEvent.ts`、`brian-backend/Base/shared/match/ComponentFunnelTrace.ts`、`brian-backend/Core/{SkillCoreProvider,SoulCoreProvider,MCPCoreProvider,LLMCoreProvider}/application/*`、`brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts`
- 背景: 思考全景「加载 Agent 快照」步骤的组件筛选明细(Prompt/Soul/Skill/MCP/LLM 的 BM25/向量/大模型三级结果)此前为硬编码假数据;真实漏斗存在于四处 Core 匹配服务与 Builder 的 Prompt 漏斗中,但仅打 metrics 日志未结构化透传。
- 产出:
  1. FunnelSelector 新增全量排序算法 `funnelBm25Ranking` / `funnelVectorRanking`(返回全部候选绝对置信度,既有 stage 函数复用重构,不复制打分逻辑)。
  2. `BusinessEvent.ComponentFunnel = 'component.funnel'` 事件与 `ComponentFunnelTrace` 采集器(统一负载契约: component/mechanisms[]/candidates[]/prompt/output/detail,LLM 机制含原始评估 Prompt 与输出)。
  3. SkillCore.matchSkill、SoulCore.matchSoul、MCPCore.matchMCP、LLMCore.matchLLM、AgentBuilderService.matchPromptForAgent 五处在匹配终态上报真实漏斗明细;绑定/缓存/单候选路径上报 `direct` 直接事实机制。
  4. executionAnalyzer 聚合 helper `soComponentFunnelMatches`: 从 streamEvents 提取 `component.funnel` 组装 `snapshotDetails.componentMatches`;无事件的组件(复用既有 Agent 场景)从 selectedComponents 合成「绑定事实源」direct 条目;彻底移除硬编码假数据。
- 验收: FunnelSelector 新算法与聚合 helper 单测通过;Core/Runtime/Agent 全量单测回归绿;后端 tsc 0 错误。

### T-F10 思考全景组件筛选明细真实化(前端)
- 文件: `brian-frontend/src/api/types.ts`、`brian-frontend/src/components/chat/ThinkingIntegratedPipelineView.vue`
- 产出:
  1. `MatchMechanismDetail.mechanism` 扩展 `'direct'` 联合类型。
  2. `getSnapshotComponentMatches` 移除前端硬编码假数据兜底,仅渲染后端真实 `componentMatches`;空态显示「暂无筛选明细」。
- 验收: vue-tsc + vite build 0 错误;点击各组件筛选 Tab 展示真实漏斗明细或绑定事实源。

### T-OBS-01 事件契约与唯一投影(shared)
- **内容**:task-event envelope + 32 事件 payload zod;RunObservation + reduceObservation(seq 幂等);R5 起增补:run.failed 保留 stop_reason(四态终态 成功/失败/中断/预算耗尽,前端 observationPhase 统一映射),llm.invoked 按 caller 归组聚合 usageStages(弹窗 Token/耗时分布条数据源)
- **文件**:shared/src/contracts/*
- **验收**:32 事件样例单测;重复 seq 不产生脏状态

### T-OBS-02 观测总线三解耦(后端)
- **内容**:EventDispatcher(seq 单点分配)→ SSE 纯传输帧 + task_event_record 批量落库(50ms/200条) + run_state_record 直更;StreamService 瘦身;Report.emit 换芯
- **文件**:Base/ObservabilityProvider/*、StreamProvider/*、shared/base/Report.ts
- **验收**:npm test 5/5 绿;settle 前 flush 可见;SSE 帧契约与 E2E 实测通过

### T-OBS-03 发射点迁移与行为修正
- **内容**:delta 分流(reasoning→think.delta/text→reply.delta)、删一次性整段 Reply、裸通道(text_chunk/agent_thinking/action/reflection)并入标准事件、agent.selected.mechanisms / context.built.sources / profile.snapshot / run.merge 增补
- **文件**:Runtime/Loop、Runtime/Runs、Runtime/Agents、Agent/*、ChatService
- **验收**:RuntimeGateway/AgentLoop 回归绿;E2E 实测思考流与正文流式正确、Writer replace 不叠加

### T-OBS-04 观测读路径与删除清单
- **内容**:GET /api/chat/observation(seq 重放+after_seq 增量);删 thinkingBlocks.ts/executionAnalyzer.ts//api/chat/thinking;stream_event_record drop(不迁移)
- **文件**:dev-server.ts、server/*
- **验收**:全仓无引用;同一 run 实时态=回放态

### T-OBS-05 前端观测视图重构
- **内容**:chatUi.observation 唯一状态源;chatStreamEvents 1006→170 行;ThinkingModal(genie 外壳)+ObservationView+ThinkingLivePill;逻辑/样式分离;删旧分析视图 6 个与旧累积状态
- **文件**:stores/chatUi.ts、composables/chatStreamEvents.ts、composables/useObservation*、components/chat/*
- **验收**:前端 vitest 161 用例绿;vue-tsc/lint 绿;E2E 弹窗实时可见、历史回放一致

### T-EMB-01 组件 Embedding 预存与漏斗加速 (ADR-012/014)
- **内容**:
  1. 为 Agent, MCP, Skill, Soul, Prompt 落地 5 张 `xxx_embedding_record` 物理表。
  2. 建立通用算法与生命周期辅助库 `ComponentEmbeddingHelper`（内容 SHA-256 Hash 校验、同步写入、失效安全删除、预存批量直读与 Cache-Aside 缺失自动兜底补算）。
  3. 改造 `FunnelSelector` 与 5 大业务服务（`AgentLibraryService`, `MCPCoreService`, `SkillCoreService`, `SoulCoreService`, `PromptsService`），在初筛和匹配阶段直接复用预存向量进行内存余弦计算，消除重复模型调用。
  4. 组件新增与描述修改时同步更新向量；模型不可用时安全删除旧向量防止语义漂移；组件删除时级联清理对应向量。
- **文件**:Base/shared/match/*, Base/*Provider, Core/*CoreProvider, Agent/AgentLibrary/*, server/context.ts
- **验收**:ComponentEmbeddingHelper 8 单元测试 100% 通过；Monorepo 5/5 全量测试回归绿（1700+ 用例）；build 与 typecheck 0 错误。

## 6. 任务卡 — R7 配置中心卡片体系与语义路由全链路 (chg-057)

> 目标:统一六大组件(Agent/MCP/Skill/Soul/Prompt/LLM)的「名称 5-10 字 / 描述 30-40 字(输入+输出+功能) / 正面范例 3-5 条 / 负面范例 3-5 条(每条 ≤15 字)」内容规范,打通「生成引擎 → 正负范例向量 → 语义路由双向裁决 → 统一 DTO → 统一卡片」全链路;不做临时兼容。

### T-SEM-01 统一语义规范生成引擎
- **内容**:
  1. 新建 `Base/shared/semantics/ComponentSemanticsGenerator`:统一 Prompt 契约(生成 5-10 字名称 / 30-40 字输入输出功能描述 / 正负范例各 3-5 条)。
  2. `clampComponentSemantics` 规则强制收敛(纯算法,单测覆盖);LLM 失败按规则回退,不阻塞创建。
  3. `createSemanticsTaskFn(llmAccess)` 组合根注入式,同 `createEmbedTaskFn` 模式。
- **文件**:Base/shared/semantics/*, server/context.ts
- **验收**:ComponentSemanticsGenerator 单测绿;clamp 边界(超长/条数)全覆盖。

### T-SEM-02 五组件生成接线与正负范例落库
- **内容**:SoulService / SkillService / PromptsService / MCPService / AgentLibraryService 在 add/update 时调用语义生成,brief 收敛 30-40 字,正负范例经 `syncComponentExamples` 落 `xxx_example_embedding_record`(example_type 列已在 M11 落地);MCP 安装路径同步。
- **文件**:Base/{SoulProvider,SkillProvider,PromptsProvider,MCPProvider}/application/*, Agent/AgentLibrary/application/AgentLibraryService.ts, Agent/AgentBuilder/application/AgentBuilderService.ts
- **验收**:五组件创建后 example 表出现 positive/negative 两类记录;服务重启不重复生成(hash 幂等)。

### T-SEM-03 MCP 工具清单与入参样例沉淀
- **内容**:
  1. `MCPService.listMcpTools`:对已安装 MCP 拉取工具清单(stdio/HTTP 双通道),`generateMockParamsFromSchema` 生成每工具 `test_params_sample` 并持久化到 `mcp_install_record.test_params_sample`。
  2. 新增路由 `POST /api/mcp/:id/tools`;既有 `POST /api/mcp/:id/call` 作为执行测试通道。
- **文件**:Base/MCPProvider/*, dev-server.ts, Base/MCPProvider/infrastructure/MCPSchemaInitializer.ts(DDL)
- **验收**:tools 清单含 test_params_sample;重复拉取直接读缓存列。

### T-SEM-04 统一组件 DTO 与 LLM Token 聚合
- **内容**:
  1. `shared/src/contracts/component-dto.ts`:UniversalComponentDTO + Agent/LLM/MCP/Skill/Soul/Prompt 六个专属 DTO。
  2. `LLMService.soModelTokenStats`:按 llm_available_id 聚合 llm_usage_org 的 input/output tokens;模型列表路由响应附 `usage_tokens`。
  3. llm_type 值域收敛为 `text|embedding|multimodal`(vision 历史值迁移)。
- **文件**:shared/src/contracts/component-dto.ts, Base/LLMProvider/application/LLMService.ts, dev-server.ts, Base/LLMProvider/infrastructure/LLMSchemaInitializer.ts
- **验收**:模型卡片可展示 In/Out tokens;vision 数据迁移后为 multimodal。

### T-SEM-05 前端统一卡片与范例编辑
- **内容**:
  1. `UniversalConfigCard.vue`:统一 4 层卡片(标题行/描述/正负范例/特有插槽/操作行)。
  2. 范例编辑器:字符计数合规指示(名称 5-10/描述 30-40/范例 ≤15 字且 3-5 条)。
  3. 「AI 规范润色」按钮调 `POST /api/config/semantics/suggest`;MCP 测试弹窗工具选中自动预填 test_params_sample。
  4. ConfigView 六大 section 卡片接入统一骨架。
- **文件**:brian-frontend/src/components/config/*, brian-frontend/src/views/ConfigView.vue, brian-frontend/src/api/*
- **验收**:前端 vitest 绿;六 section 卡片渲染一致;MCP 测试预填生效。

## 7. 里程碑

| 里程碑 | 包含任务 | 完成标志 | 状态 |
|---|---|---|---|
| M1 文档完备 | chg-001(SOP 十一件套) | _00~_10 齐全且 _00 索引一致 | 已完成 |
| M2 令牌与共享件 | T-F01~F03 | build 绿;公共组件可用 | 已完成 |
| M3 页面人性化 | T-F04~F08 | build 绿;视觉验收通过 | 已完成 |
| M4 后端治理 | T-B01~B03 | typecheck+test 绿;offender 下降 | 已完成 |
| M5 收敛验收 | P8 清单 | 证据留存;_10 置 verified;提示人工测试 | 已完成 |
| M6 历史卡片与图谱治理 | T-B05~B08, T-F09 | 后端单测全绿、前端构建全绿、图安全与全量Token验证通过 | **已完成** |
| M7 级联匹配与选型优化 | T-B10~B12 | Core/Runtime/Agent 全量单测与构建通过，零抛错与方法≤30行达标 | **已完成** |
| M8 三表重构与上下文回溯 | T-R6-01~R6-04 | 消息三表重构完成、复选时序回溯生效、全量单测通过 | **已完成** |
| M9 思考全景组件漏斗明细真实化 | T-B13, T-F10 | component.funnel 事件透传生效、假数据移除、全量单测与构建通过 | **已完成** |
| M10 统一事件总线与可观测投影(OBS v2) | T-OBS-01~05, chg-045 | 后端 5/5 + 前端 161 用例全绿;E2E 实测思考过程实时可见且与回放同源(ADR-013) | **已完成** |
| M11 组件 Embedding 持久化与向量匹配加速 | T-EMB-01, chg-056 | 五大组件 embedding_record 落地;内存余弦秒级匹配;缺失懒计算自愈;全量单测与类型检查绿 | **已完成** |
| M12 卡片体系与语义路由全链路 | T-SEM-01~05, chg-057 | 正负范例生成落库、语义路由双向裁决+BM25 双向增强生效、统一卡片与测试弹窗接入(Agent 构成标签/LLM Token 仪表/MCP 样例预填测试)、Agent 弹窗语义编辑;后端 5/5+前端 18 文件 169 用例全绿,typecheck/lint/build 全绿 | **已完成** |





## 7. 任务卡 — R8 统一选举引擎 (chg-058)

> 目标:六组件(Agent/LLM/Prompt/Soul/Skill/MCP)选举统一到一套模板方法流程,组件只实现 ComponentElectionAdapter 钩子;阈值可配置;信号提取可扩展。规格:①复用判定(续写请求/绑定/缓存/签名事实源直命中)→②并行信号提取(合法/BM25/向量正例/向量反例/结构 五路候选集)→③分级候选集阶梯(T1=(结构∪向量正例)−反例→T2=(结构∪正例范例)−反例;LLM 另有 T3~T7)逐级综合得分择优(LLM/Agent/Prompt/Soul)或整集采纳(Skill/MCP)→④终端动作(创建新的组件/默认模型)。综合得分=0.7×向量+0.3×BM25(可配)。

| 任务卡 | 内容 | 验证 |
|---|---|---|
| T-ELEC-01 | election/ 引擎四件套+续写识别+阈值配置存储;16 个引擎单测 | ✓ 单测 16/16 |
| T-ELEC-02 | MCP 接线(multiSelect;拆除 LLM 裁判死链;终端=空集+负缓存) | ✓ Core 测试 |
| T-ELEC-03 | Skill 接线(multiSelect;LLM 裁判/外部来源降级为终端) | ✓ Core 测试 |
| T-ELEC-04 | Soul 接线(单选;终端=动态生成) | ✓ Core 测试 |
| T-ELEC-05 | LLM 接线(directAdoptSingle+全量阶梯;终端=默认模型;MatchLLMInput.task_content) | ✓ Core 测试 |
| T-ELEC-06 | Prompt 接线(终端=按任务生成新模板入库) | ✓ Agent 测试 |
| T-ELEC-07 | Agent 接线(AgentDef 级:签名精确复用降为①事实源,拆除规则评分/[领域]过滤/LLM 裁判级;终端=构建新 AgentDef) | ✓ Runtime 测试 |
| T-ELEC-08 | GET/PUT /api/config/election/:component;FunnelComponentKind+agent;exampleSim 信号 | ✓ build/typecheck |

| 里程碑 | 任务卡 | 验证 | 状态 |
|---|---|---|---|
| M13 统一选举引擎 | T-ELEC-01~08, chg-058 | 六组件统一模板方法选举;5/5 工作区测试全绿;typecheck/lint/build 全绿 | **已完成** |

## 8. 任务卡 — R9 会话话题连续性与轮次向量 (chg-059)

> 目标:一个会话聊的大概率是同一话题——会话内沿用同一 Agent,避免每轮重新选举/构建 Agent 的耗时。存在向量模型时每轮固化"请求+回复"拼接 embedding 到 `dialog_embedding_record`;matchAgent 在"继续"等强信号之后、其他信号提取(BM25/Embedding 相似度)之前插入话题连续性匹配裁决是否沿用。

| 任务卡 | 内容 | 验证 |
|---|---|---|
| T-TOPIC-01 | `dialog_embedding_record` DDL(id/created/updated/session_id/work_id UNIQUE/embedding/dimension)+InfoCoreSchemaInitializer 注册 | ✓ 建表幂等(_12 同步) |
| T-TOPIC-02 | InfoCore `saveDialogEmbedding`(向量模型门控+按 work_id upsert)/`matchDialogTopic`(最近 20 轮维度过滤 cosine 取最大)两方法+Access 转发 | ✓ Core 测试 |
| T-TOPIC-03 | RunGateway executeRun settle 前 fire-and-forget 固化轮次向量(仅主 lane、Finished 轮);matchAgent 升级 decideSessionAffinity:显式切换→强信号续写(isContinuationRequest)→话题连续性(≥70 沿用/<70 漂移重选举/未评估回退沿用) | ✓ Runtime 测试 |
| T-TOPIC-04 | 文档与索引同步(_04/_05/_06/_12/_07/_09/_10/_00) | ✓ 文档评审 |

| 里程碑 | 任务卡 | 验证 | 状态 |
|---|---|---|---|
| M14 会话话题连续性 | T-TOPIC-01~04, chg-059 | 强信号 0 向量开销沿用;话题漂移自动重选举;无向量模型优雅降级;typecheck/lint/test 全绿 | **已完成** |
