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

## 4. 里程碑

| 里程碑 | 包含任务 | 完成标志 |
|---|---|---|
| M1 文档完备 | chg-001(SOP 十一件套) | _00~_10 齐全且 _00 索引一致 |
| M2 令牌与共享件 | T-F01~F03 | build 绿;公共组件可用 |
| M3 页面人性化 | T-F04~F08 | build 绿;视觉验收(visual-judge)通过 |
| M4 后端治理 | T-B01~B03 | typecheck+test 绿;offender 下降 |
| M5 收敛验收 | P8 清单 | 证据留存;_10 置 verified;提示人工测试 |
