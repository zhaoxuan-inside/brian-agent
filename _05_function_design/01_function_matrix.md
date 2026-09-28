# 01 功能矩阵与任务卡(_05_function_design)

> 状态:confirmed　更新:2026-09-26
> 范围:本次需求 R2(前端人性化改造)与 R3(后端重构治理)的任务卡;存量功能矩阵以 _04 模块职责表 + _07 方法索引(2529 方法)为准,不在此重复。

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
- 产出:补全覆盖全部 2942+ 方法的全量扫描器(当前 docs:index 仅覆盖 Access 层 505 方法;docs/method.idx.json 为 2026-09-26 10:37 快照),并重跑 gen-sop-07 刷新 _07 分片(重构新增的私有方法入库)
- 验收:`node scripts/gen-sop-07.mjs` 后 _07 分片与代码 grep 抽查一致
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
  8. 点击跳转：点击卡片主体进入 `/?session=${sessionId}`，各操作按钮使用 `@click.stop` 阻断冒泡。
- 验收: `npm run build` 通过；Vue 模板类型检查 0 错；单测全绿。
- 状态: **已完成 (commit 6d69238)**

## 5. 里程碑

| 里程碑 | 包含任务 | 完成标志 | 状态 |
|---|---|---|---|
| M1 文档完备 | chg-001(SOP 十一件套) | _00~_10 齐全且 _00 索引一致 | 已完成 |
| M2 令牌与共享件 | T-F01~F03 | build 绿;公共组件可用 | 已完成 |
| M3 页面人性化 | T-F04~F08 | build 绿;视觉验收通过 | 已完成 |
| M4 后端治理 | T-B01~B03 | typecheck+test 绿;offender 下降 | 已完成 |
| M5 收敛验收 | P8 清单 | 证据留存;_10 置 verified;提示人工测试 | 已完成 |
| M6 历史卡片与图谱治理 | T-B05~B08, T-F09 | 后端单测全绿、前端构建全绿、图安全与全量Token验证通过 | **已完成** |

