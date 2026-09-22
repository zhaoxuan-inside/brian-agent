## [2026-09-22l] fix: CDT 反检测脚本两处静默失效（Page.enable 缺失 + webdriver 实例级伪装暴露）

**变更原因**：真机验证反爬表现时发现 JS 层指纹伪装整体未生效：① `injectAntiDetection` 从未调用 `Page.enable`，而 Chrome 在 Page domain 未 enable 时 `Page.addScriptToEvaluateOnNewDocument` 应答成功但注入永不生效（对照实验：enable 后同一脚本正常注入）——webdriver/cores/mem/languages/isTrusted 覆盖全部静默丢失；② webdriver 用实例级 defineProperty 伪装，被 sannysoft「WebDriver (New)」（`_.has(navigator,'webdriver')` 只查自有属性）识破。

**修改的方法**（`Base/CDTProvider/application/CDTService.ts` injectAntiDetection）：
  - 注册脚本前先 `Page.enable`；注册后追加 `Runtime.evaluate` 在当前文档立即执行同一脚本（覆盖"注册后、下次导航前"的窗口期）。
  - webdriver 改为 `Navigator.prototype` 原型级重定义（patchright 同思路）：`navigator.webdriver` 读 false、无自有属性（lodash `_.has` 探测为 false）、原型 getter 返回 false，三者同时满足。

**影响的端点**：`POST /cdt/spoof-env`、`POST /cdt/navigate`（内部调用 injectAntiDetection 的所有路径）；种子登录态与页面功能无回归（知乎登录态跨重启验证通过）。

**验证**：bot.sannysoft.com 实测 14+ 检测项全部通过（UA/WebDriver New/WebDriver Advanced/Chrome/Permissions/Plugins/Languages/PHANTOM_*/SELENIUM_DRIVER/Canvas 一致性）；修复前对照：WebDriver (New) present(failed)、cores/mem/languages 为真实值。

**已知边界**：WebGL context 在 VMware 无 GPU 环境不可用（`getContext('webgl')` 返回 null，`--enable-unsafe-swiftshader` 实测未解决），对 WebGL 指纹检测站点是一个信号；与本机硬件一致（用户本机 Chrome 同样无 WebGL），待 GPU/驱动或 swiftshader 路径另行验证。

## [2026-09-22k] feat: CDT 登录态种子——远程浏览器继承本机 Chrome 已登录站点

**变更原因**：产品远程浏览器访问需登录站点时，首次都要在 Remote Browser 里手工登录。新增「登录态种子」（seed_profile）：用户配置本机 Chrome profile 目录后，CDT 启动时把其 Cookies + Local Storage 复制进产品 profile，已登录站点直接可用，绕过产品内登录流程（方案对齐 agent-browser 的 profile 复用与 Playwright storage_state 范围）。

**修改的方法**：
  - `CDTService.startCDT` — 原 mkdirSync 后仅建目录；现追加调用 `seedProfileFromSnapshot(absProfileDir, metrics)`（2026-09-22 修改注释已就地标注，启动主链路其余逻辑零变更）。
  - 新增 `CDTService.seedProfileFromSnapshot(profileDir, metrics)`（私有编排，14 行）：读 `profile_snapshot_source` 配置 → 源校验 → 标记比对 → 复制 → 写标记；失败仅 warn 不阻塞启动。
  - 新增 `CDTProvider/application/ProfileSnapshot.ts` 纯函数（数据操作与编排分离）：`resolveSnapshotSourceDir`（~ 展开 + 目录校验）/ `copySnapshotAuthFiles`（Network/Cookies 或旧版 Cookies + Local Storage/leveldb 递归复制）/ `readSeedMarker` / `writeSeedMarker`（`.cdt-profile-seeded` 记录已播源路径）。
  - 新增配置注册 `cdt_provider.profile_snapshot_source`（configRegistrations.ts + Application/Config BASE_PROVIDER_CONFIG_TABLES 映射 → cdt_config 表），配置中心可编辑。
  - 前端 `configDisplay.ts` cdt 分区新增「浏览器参数」params 子区（configModule: cdt_provider）。

**影响的端点**：
  - `POST /cdt/start` — 启动前增加播种步骤（同源已播种时为空操作，语义向后兼容）
  - `GET /config`、`PUT /config` — 新增可读可写配置键 `cdt_provider.profile_snapshot_source`
  - 其余 CDT 端点行为零变更

**可能存在的问题**：
  - 源路径变更后的重播种会覆盖产品侧 Cookies/Local Storage（预期行为：用户显式改源即希望切换登录身份）；产品内新登录的其他站点若仅存于被覆盖存储中会丢失。
  - 种子范围不含 IndexedDB / Session Storage，少数以 IndexedDB 承载登录态的站点（如部分 Firebase 应用）不会被继承，需在 Remote Browser 内登录一次（由持久化 profile 保留）。
  - Windows 下 Chrome profile 含中文路径/空格时复制按 Node cpSync 处理，未见异常；极端杀软拦截场景播种失败仅降级为未播种。

**实战修正（2026-09-22 真机验证发现）**：初版把登录态平铺复制到 user-data-dir 根——但产品 Chrome 未传 `--profile-directory`，登录态实际存于 `Default/` 子目录，Chrome 找不到种子。修正：目标改为 `<user-data-dir>/Default/`；补充 SQLite 伴生文件（-journal/-wal/-shm）复制；leveldb 先清空目标旧库再整体复制（避免 CURRENT/MANIFEST 混存损坏）。真机回归：知乎 23 条 cookie（含 z_c0/d_c0）种子成功，产品浏览器打开知乎首页即登录态（头像/创作中心渲染，无登录按钮）。

**验证**：Base vitest 842/842（新增 CDTProfileSnapshot.test.ts 9 例）；Application vitest 489/489（Config 注册读写回归）；tsc --noEmit（base/application）0 错误；eslint（CDTProvider + Config）0 problems；前端构建（vue-tsc + vite）通过；E2E `brian-backend/scripts/e2e-cdt-profile-snapshot.mjs` 真实 Chrome 启动链路 7 项断言全 PASS（复制落盘 / 标记写入 / CDP 探活 / 二次启动不覆盖 / 无进程残留）。

## [2026-09-22l] feat: 首页动图升级——假鼠标功能演示 + 力导向图谱范例化

**变更原因**：用户评审「卡片排布很短、不够优雅」：① Hero 地图缺少功能演示动效；② 涌现图/关键词图的高斯撒点 + kNN 连边形态散乱，不像优秀力导向图范例。

**修改的内容**：
  - `HeroAppShot.vue`：画布 640×560→640×620，卡片放大、间距拉开，新增点阵背景；新增**假鼠标演示循环**（约 8.4s/轮）——光标移动到消息卡复选框 → 点击（涟漪 + 按压缩放 + 勾选框点亮、卡片描边变蓝、气泡「已勾选进本轮上下文」、追问卡「引用 1」胶囊点亮）→ 移动到另一张卡 Pin 按钮 → 点击钉住（Pin 变橙 + 红色脉冲环、气泡「已钉住 · 每轮生效」）→ 复位重播；复选框/Pin 使用与 MessageCard 一致的图标形态；`prefers-reduced-motion` 降级为「已勾选 + 已钉住」静态终态。
  - `graphData.ts` 重写：涌现图组织为 4 个主题簇（出行天气/美食住宿/Agent 技术/面板行业孤岛）+ 语义桥接边，关键词图 4 个语义簇 + 外围孤点 + external/required/tool 三角；坐标改由 `utils/forceDirectedLayout`（与真实涌现页同款力导向算法，复用而非新写）确定性生成；节点半径按权重、颜色沿用蓝→红频率映射（权重指数衰减突出枢纽）。
  - `GraphShot.vue`：连边改由数据传入（移除内部 kNN 生成与 neighbors prop），新增枢纽光晕、标签描边晕（paint-order），连边细化至 rgba(.17)。
  - 新增 `test/graphData.test.ts`（3 用例：画布边界/枢纽形态/确定性）。

**影响的端点**：仅前端首页 `/`，无接口变更。

**可能存在的问题**：
  - 力导向布局在模块加载时同步计算（两图约 400×O(n²) 次迭代，实测 <30ms），如未来节点数大幅增加需改异步。
  - 假鼠标演示为定时器驱动状态机（8.4s/轮），页面长期停留会持续重播；`prefers-reduced-motion` 下不运行。

**验证**：vue-tsc 0 错误；eslint 0 problems；vitest 117/122（新增 3 用例全绿，5 个失败为既有基线）；`npm run build` 通过（HomeView 55.56 kB）；headless Chrome 目检：reduced-motion 终态（勾选/钉住/气泡/点亮齐全）+ 正常模式假鼠标按压帧。


**变更原因**：评审反馈「消息框的连线不够优雅」：HeroAppShot 与 HomeView 记忆地图的连线为手写坐标折线/硬斜线，锚点随卡片几何漂移，直线与折角生硬，虚线样式粗糙（`4 5` 平头虚线）。

**修改的内容**：
  - 新增 `src/utils/edgePath.ts`：`edgeAnchor`（卡片边缘锚点，along 沿边偏移）+ `smoothEdgePath`（控制点沿边缘法线外伸、幅度随间距 24~96 收敛，切线恒垂直卡片边缘、无折角）；不复用 chatMapGeometry（与 ChatMap 固定节点尺寸强耦合，泛化属顺手重构，见 decisions.md）。
  - `HeroAppShot.vue` / `HomeView.vue`：连线数据只声明「起始卡片边 → 目标卡片边」（原始手写路径注释保留）；虚线改圆帽点状（`0.1 6.9`）并流动，实线绘制入场后叠加 SMIL animateMotion 流动光点暗示引用方向（`prefers-reduced-motion` 下不渲染光点、不播动画）；箭头 marker 缩小并柔化。
  - 修复 HomeView 连线入场缺陷：原 `.home-map-drawn .home-mline { stroke-dasharray: 600 }` 会把虚线也变成实线且 reduced-motion 覆盖特异度不足；现虚线淡入 + 流动、实线绘制，媒体查询内补齐等特异度选择器。
  - 新增 `test/edgePath.test.ts`（5 用例：锚点/along 偏移/端点贴边/切线方向/弯曲钳制）。

**影响的端点**：仅前端首页 `/` 两处示意 SVG 的连线渲染，无接口变更。

**可能存在的问题**：
  - 流动光点使用 SMIL animateMotion（Chrome/Firefox/Safari 均支持，IE 不支持；项目无 IE 目标）。

**验证**：vue-tsc 0 错误；eslint 0 problems；vitest 114/119（新增 5 用例全绿，5 个失败为既有基线）；headless Chrome 目检两处连线形态（reduced-motion 终态 + 正常模式光点渲染）。

## [2026-09-22j] feat: 首页 4 张静态产品截图替换为前端动态展示组件

**变更原因**：首页 hero-map / memory-pin / tag-graph / keyword-graph 四张 PNG 截图（合计约 2MB）为静态死图，无法承载入场/交互动效，且拖慢构建产物体积；改为前端代码实现后可动态呈现并随主题/文案迭代。

**新增的组件**（`brian-frontend/src/components/home/`）：
  - `HeroAppShot.vue` — Hero 应用窗口动态复刻：左侧 ChatMap 记忆地图（连线入场绘制 + 虚线流动 + 节点漂浮 + Pin 脉冲），右侧对话区（消息依次浮现 + 输入框光标闪烁）；替代 hero-map.png。
  - `MemoryPinShot.vue` — Memory Pin 动态示意：钉住消息的 Pin 图标红色高亮脉冲，两条消息渐次浮现；替代 memory-pin.png。
  - `GraphShot.vue` — 通用动态图谱组件（涌现图/关键词图共用，props 驱动）：复刻应用窗口 chrome（面包屑/页签/搜索栏/一键清理/图例），SVG 节点确定性布点 + 按邻近度自动连边，rAF 直接操作 DOM 实现节点漂移与连线随动（避免高频响应式开销），悬浮高亮关联节点与连线；替代 tag-graph.png / keyword-graph.png。
  - `graphData.ts` — 两图节点数据（确定性伪随机布点，数据与编排分离）；原文数据以注释保留于 HomeView.vue。

**影响的端点**：仅前端首页 `/`（HomeView.vue 4 处 `<img>` 替换为组件，原实现按规范注释保留）；无路由/接口变更。构建产物不再包含 4 张 PNG（dist/assets 仅剩 qr-qq/qr-wechat.jpg 二维码）。

**可能存在的问题**：
  - GraphShot 漂移动画为 rAF 常驻循环（进入视口后启动、卸载时停止），低端设备长驻首页时占用少量 CPU；`prefers-reduced-motion` 下不启动。
  - 图谱节点标签仅在半径 ≥9 或悬浮时显示，与原图「部分节点有标签」的形态一致；如需全量标签需调整 GraphShot 显示阈值。

**验证**：vue-tsc 0 错误；eslint 0 problems；`npm run build` 通过（HomeView chunk 50.29 kB）；headless Chrome 目检 hero/记忆地图/涌现图/关键词图四个区块渲染正常；前端 vitest 109/114 通过（5 个 chat-page e2e 失败为基线已存在，git stash 复测确认与本次改动无关）。

## [2026-09-22g] refactor: InfoCoreService.context 方法拆分——401 行编排水 monolith → 30 行骨架 + 25 个原子步骤方法

**变更原因**：`context` 401 行为全库最长方法（analyze-method-length.mjs >30 榜首），违反 DDDStandards §2 方法长度约束与流程控制/数据处理拆分判据。

**修改的方法**（`Core/InfoCoreProvider/application/InfoCoreService.ts`，纯代码移动：条件/顺序/副作用/返回值/日志文本零变更，签名不变）：
  - 编排骨架 `context` 30 行，按「参数准备 → 各维度候选采集 → 装配回写」顺序编排 25 个新私有方法（全部 ≤30 行）：validateContextInput / prepareContextBuildPlan / parseContextPriorityList（缺省优先级收敛为模块常量 CONTEXT_COLLECTION_SOURCES）；collectPinnedCandidates / collectSelectedOrTimelineCandidates / extractCurrentCandidate；resolveWeakDimensionLimits / resolveReferenceText / collectWeakDimensionCandidates → collectTagRelativeCandidates / collectSimilarityCandidates / collectKeywordCandidates / pickKeywordCandidates；collectRandomCandidates → sampleRandomCandidates → sampleSessionRandomCandidates / sampleGlobalRandomCandidates；excludeCurrentFromWeakDimensions / buildContextCandidatesMap / prefetchContextSummaries / collectDedupedContextItems / toContextItem（局部 helper 提升）/ buildContextCategories / buildContextCategoryIds / buildContextSourcesSummary。
  - 复用既有方法：getInfoByInfoId / lastNInfoTimeline / toInfoRawRecord / isCorrectInfo / isTraceInfo / getInfoSummaryBatchByInfoIds / fillContextTriplesAndPersist（内含 persistContextSourceMap）。
  - `// ===== 修改后的方法 =====` 过渡标记移除（DDDStandards §6.2 禁止注释保留旧实现，历史由变更记录与 git 承载）。

**影响的端点**：无接口行为变更（POST/GET 上下文构建相关路由均等价）；TAG/SIM/KW/RANDOM 降级 warn 日志文本原样保留。

**可能存在的问题**：
  - buildContextCandidatesMap/excludeCurrentFromWeakDimensions 等装配方法为 application 私有（模块无 domain/services 目录，按规范不强建）；若后续其它编排需复用候选去重/分类装配，再上提 domain/services。

**验证**：typecheck（@brian-agent/core）0 错误；core vitest 197/197 全绿；analyze-method-length 30 中 InfoCoreService 仅余 saveInfo（90 行，另行任务）；InfoCoreService.ts eslint 0 error。

## [2026-09-22i] chore: Nit 清理——前端死代码与未用 import、豁免条款补登

**变更原因**：评审 Nit 级遗留：① 前端 25 个 no-unused-vars warning（ConfigView 16 个未用图标 import + 2 个未用类型、chatStreamEvents 5 个未用 DAG 类型 + 1 个未用常量 + 1 个死函数）；② `analyze:methods` 在 docs/MethodIndex 残留 method-length-report.md 副本（bfdea75 已从库中删除但脚本仍会再生成）；③ RelationDBAccess 便捷方法偏离五参签名属有意豁免但未登记。

**修改的内容**：
  - `chatStreamEvents.ts`：删除死函数 `onToolLaunch`（v2 协议已无 tool.launch 事件，分发表无注册，仅 3 行转发包装）；移除 5 个未用 DAG 类型与 EVENT_UI_STYLE import。
  - `ConfigView.vue`：移除 16 个未用图标 import 与 2 个未用类型 import。
  - `analyze-method-length.mjs` 报告输出位置维持，残留副本删除（脚本按需再生成，不入库）。
  - DDDStandards §6.2 豁免条款补登第 ④ 条：RelationDBAccess 便捷方法为数据层原语，不受五参签名约束，业务代码不得绕过 access 直接持有。

**影响的端点**：无（前端仅删除确认未引用的代码；图标经 vue-eslint-parser 模板检测确认未用）。

**验证（门禁）**：前端 lint 0 problems（25→0）；后端 lint 0 errors。

## [2026-09-22h] docs: 文档骨架补齐——全局索引 + Explan 重写 + Access 层 JSDoc 100%

**变更原因**：评审发现缺全局索引（需求→文档→代码三跳不可达）、Explan.md 过期（路径错误/层描述复制粘贴错误/漏登术语表与决策记录等 6 处）、AgentExecutionAccess 与 ChatAccess 共 23 个公开方法 0 JSDoc（违反 DDDStandards §5 质量门）、过期 SelfLearning PRD stub 与正本并存。

**修改的内容**：
  - 新增 `docs/index.md`：分层模块表（含方法数，引自动索引）+ 横切文档表 + 检索路径示例。
  - 重写 `docs/Explan.md`：修正目录说明（新增 _07_Runtime/术语表/根目录五件套），清除不存在路径与复制粘贴错误。
  - `AgentExecutionAccess.ts`（10 方法）与 `ChatAccess.ts`（13 方法）补齐 JSDoc（+391 行纯注释，含 @see PRD 章节引用，说明与实现对齐）。
  - 删除 `docs/_02_Application/`（7 行过期 stub，标题错误，正本 820 行在 _05_Application）。
  - TODO-List 配套遗留补登：Base/Core 双路径收口、目录结构偏差（④⑤）。

**影响的端点**：无代码行为变更。

**验证（门禁）**：typecheck 全绿；lint 0 errors；npm test 5/5。

## [2026-09-22g] refactor: 超长方法拆分——12 个 >120 行方法归位 + SchemaInitializer 数据驱动收敛

**变更原因**：评审发现 341 个方法 >30 行（24 个 >120 行，最大 InfoCoreService.context 400 行），远超 DDDStandards §2 上限。

**修改的方法**（编排骨架全部 ≤31 行，逻辑零变更，纯代码移动）：
  - `InfoCoreService.context` 400→30：拆 20+ 私有步骤方法（参数准备/五维度采集/装配回写），4 个结构 interface + 优先级常量收敛。
  - `AgentBuilderService.buildAgent` 310→28、`optimizeAgent` 207→21：组件装配/绑定/重绑拆分；`optSkillBindings`/`optMcpBindings` 收敛两方法重复段；binding diff 上提 `BindingDiffDomainService`。
  - `WriterAgentService.execWrite` 282→29、`AgentExecutionService.execAgent` 273→24：ReACT 阶段全复用既有 execThink/Act/Reflect/Answer，未重复实现。
  - `ChatService.soSession` 267→22（五类聚合拆分 + `SessionSearchDomainService`）、`RunGatewayService.executeRun` 175→31（事件顺序逐字保留）、`LLMService.executeSingleLLM` 168→21。
  - `EvolutorAgentService.evalWorkAgent` 199→27 + `EvalScoreDomainService`。
  - 新增领域服务（纯函数零 I/O）：AgentNaming/BindingDiff/AgentBuildSummary/Writer/SessionSearch/EvalScore 6 个。
  - SchemaInitializer ×4（SelfLearning 321→5、LLM 257→11、InfoCore 231→11、MCP 156→11）：DDL 提取数据驱动表 `ddlStatements`，执行序列经 TS 转译录制逐字比对证明等价。
  - 删除拆分中发现的死代码 `buildChatRequestBody`（纯函数返回值从未消费，每次 LLM 调用空转）。

**影响的端点**：无接口/事件/DDL 行为变更（Runtime 事件序列有专项用例兜底）。

**验证（门禁）**：typecheck 5 workspace 0 错误；lint 0 errors；npm test 5/5（base 824/core 197/runtime 47/agent 118/application 486）；analyze:methods 复测 120+ 行方法 24→11，榜首 400→166。

## [2026-09-22f] refactor: Config 模块消 any 清零——149 处 any 归零并取消 eslint 豁免

**变更原因**：ConfigService.ts（145 处）/ConfigAccess.ts（4 处）共 149 处 `any` 使 Config 路由层完全绕过类型检查（实际 eslint 计数 149，超出任务预估的 104+4）；依赖（chatAccess 等 4 个跨模块 Access）与全部配置写入路由的真实类型在下游签名文件中齐备，具备诚实标注条件。

**修改的方法**（仅类型注解 / `import type` / 类型断言，运行时逻辑与实参顺序零变更）：
  - `ConfigService` 4 个依赖字段与构造参数：`any` → `ChatAccess/SelfLearningAccess/UserProfileAccess/VisualizationAccess`（同包跨模块走 `import type` 相对导入，编译期擦除不产生运行时循环依赖）。
  - `getCurrentValue`：agent_context / visualization 分支的收集对象按实际参数位（Context 位）标注，读取处 `Record<string, unknown>` 断言；log 分支标注 `ConfigLogOutput`。
  - `getConfigFromAccess` 泛型化 `<I, C, O extends object>`，10 个回调参数标注各模块真实 Input/Context/Output 类型。
  - `extractConfigValue` 入参 `any` → `unknown`（TS 4.9+ `in` 窄化）。
  - `setProviderEnabled` 9 个 enableXxx 调用标注 `EnableXxxInput/Output` 与对应 Context。
  - 23 个 `writeXxxConfig` 路由处理器：input 标注对应模块 Input 类型（`value: unknown` 补 `as number/string/boolean` 断言），`VALID_LAYERS` 检查改 `(VALID_LAYERS as readonly string[]).includes(...)`。
  - `ConfigAccess` 构造参数同步标注 4 个真实类型。
  - eslint.backend.config.mjs：no-explicit-any 豁免清单全量取消（9 个业务文件 + Config 两文件），仅保留 dev-server.ts（工具链豁免，DDDStandards §6.2 登记在案）。
  - 其余 4 文件同步清零：`AgentExecutionService`（6 处：env 接口补 `agent_type?` 后 3 处断言自然消失；StreamService meta 类型精确匹配后 3 处移除）、`IntentAgentService`（4 处：2 修复 + 2 处 `LastNInfoRecord` 最窄兜底——发现存量缺陷 `info.info_content` 恒 undefined 拼入历史 prompt，另行任务）、`SelfLearningService`（6 处：mqAccess 落真实类型 + 5 处断言收窄）、`UserProfileService`（4 处断言直接删除，上游本就满足 Condition[]/OrderBy[]）、`SkillCoreService`（3 处断言收窄，上游 SoSkillOutput 契约错位已注释标记）、`InfoCoreService`/`LogService`（各 1 处删除断言）。

**关键类型决策**（详见 docs/decisions.md [2026-09-22e]）：writeXxxConfig 中名为 `output` 的局部变量历史实参位于第 3 参（Context 位），按实际参数位诚实标注为 Context 类型，不改名不换位；`writeLLMCoreQuotaConfig`（limitLLM 缺 `llm_provider_id`，运行时会抛 ValidationError）与 `writeAgentStrategyConfig`（`{config_key, value}` 语义不匹配）以断言 + 坑位警告注释标记，修复需改运行时代码，另行任务。

**影响的端点**：无接口行为变更；Config 配置读写路由、Provider enable 切换、配置详情查询均为等价类型收敛。

**验证（门禁）**：typecheck（@brian-agent/application）0 错误；两文件 no-explicit-any:error 专项 0 error；lint:backend 全量 0 errors；test/config.test.ts 139/139 通过。

## [2026-09-22e] refactor: 术语治理——msg_id/message_id 裁决统一 + 术语表补登记

**变更原因**：评审发现术语漂移违反「先登记后使用」：① 聊天消息标识 `msg_id`（SSE 协议/前端契约/领域引用）与 `message_id`（runtime_message_part 列）两套名字并存，同概念双词导致检索链路断裂；② run（641 处）/conversation（62 处）/assistant（50 处）活跃使用但未入术语表；③ 术语表自身残留旧 3 参签名与五参规范冲突。

**裁决与修改**：
  - **msg_id 统一**：聊天消息标识全局统一为 `msg_id`——runtime_message_part 列 RENAME COLUMN 幂等迁移（SessionSchemaInitializer，存量库启动自动迁移，索引定义自动跟随）、Session/Loop/Runs/Chat/dev-server 代码与 Runtime 三份 PRD 同步；`message_id` 保留给 MQ 队列信封概念（不同概念，分别登记，禁用混用）。
  - **术语表登记**：run（运行实例；run_id 业务维度与 trace_id 可观测维度独立）、assistant（LLM 协议角色边界，域内用 info_creator_role 表达产生方）、conversation（SelfLearning 对话学习通道概念，≠session 实体）、message_id（MQ 队列消息ID）。
  - **术语表修正**：旧 3 参签名示例改为五参规范签名。

**影响的端点**：无接口行为变更；SSE 协议字段未动（本就是 msg_id）；存量 SQLite 启动时自动执行列迁移。

**验证（门禁）**：typecheck 全绿；npm test 5/5 工作区通过（Runtime 47 + Application 486 含迁移库初始化路径）；lint 0 errors。

## [2026-09-22d] 修复：吞异常治理——182 处空/注释 catch 可见化（容忍保留、诊断走 Metrics 网关）

**变更原因**：评审发现 329 处空/仅注释 catch 系统性吞错（业务层 181 + SchemaInitializer 幂等 23 + dev-server 51 等），失败不可见违反 DevStandards §7.1「Metrics 是日志唯一网关」与统一签名异常约定。

**修改的方法**（37 文件，+873/-303）：
  - 业务层约 95 处补 `metrics?.warn('<类>.<方法> <容忍语义>', { error, 业务键 })`；约 50 处私有 helper 经 ≤2 跳链穿透可选 `metrics` 尾参（如 `ChatService.autoGenerateSessionTitleIfEmpty`、`TraceStore.save`、`LLMService.resolveCandidateModels`、`CDTService.freeDebugPort/killProcess`、`LogService.applyAging` 等），`_metrics` 启用为 `metrics` 计 30+ 方法。
  - 预期内分支（DDL 幂等、协议格式容忍、日志自递归禁区、纯函数模块）约 40 处补判定条件注释；豁免条款登记进 DDDStandards §6.2。
  - dev-server.ts 21 处走 fileLogger 通道；AopProxy 4 处走文件级 console 豁免先例。
  - 控制流零变化：不新增 return false/throw，原容忍注释全保留。决策记录见 docs/decisions.md [2026-09-22d]。

**影响的端点**：无接口行为变更；失败诊断从无输出迁移至 LogProvider 通道。

**验证（门禁）**：typecheck 5 workspace 0 错误；lint:backend 0 errors；npm test 5/5 工作区通过。

## [2026-09-22c] 修复：质量门禁回绿——测试归属修正 + 测试链聚合 + console 收口 Metrics

**变更原因**：HS-Code-Skill 评审发现三项门禁红灯：① Agent 层 2 个测试失败——`shared-full.test.ts` 的 TC-SH-020/021/022 是旧中文标签格式的过期副本（实现已改为英文功能标签 + usage-note，Base/test/ContextFormatter.test.ts 已显式断言旧标签不再出现），且 Agent 层测 Base 函数属测试归属错位，正是漂移根因；② `npm test` 用 `&&` 串联 5 个工作区，Agent 失败后 Application 486 个测试被短路跳过，掩盖失败面；③ InfoCoreService 6 处 `console.warn` 绕过 Metrics 日志唯一网关（DevStandards §7.1），lint:backend 6 errors。

**修改的方法**：
  - `Agent/test/shared-full.test.ts` — 删除过期的 formatContextCategories 重复用例（3 个），测试归属归还 Base 层，保留注释指路。
  - `scripts/test-all.mjs`（新增）+ `package.json` — `npm test` 改为聚合运行器：逐工作区执行、失败不中断、末尾汇总并按聚合结果退出。
  - `InfoCoreService` — 6 处 console.warn 收口为 `metrics?.warn(...)`，并沿调用链透传 metrics：`generateSummaryText`/`execSummaryLLM`/`purgeNonCorrectTagRows`/`generateEmbedding`/`getTagEmbedding`/`maintainTagVector` 增加可选 `metrics` 尾参；`summaryInfo`/`rebuildCooccurGraph`/`vectorInfo`/`similarKInfo`/`tagInfo`/`graphTag` 的 `_metrics` 启用为 `metrics` 并向下传递（公开方法签名形状不变）。

**影响的端点**：
  - 无接口行为变更；`InfoCoreService` 各 access 方法运行时诊断日志从 stdout 迁移至 LogProvider 通道（可经 log 配置 min_level 检索）。
  - `npm test`：任一工作区失败时其余工作区仍完整执行，汇总退出码非零。

**验证（门禁）**：lint:backend 0 errors；typecheck 5 workspace 全绿；`npm test` 5/5 工作区通过（base/core/runtime/agent/application，Agent 层 118 用例全绿——移除 3 个过期重复用例后）。

## [2026-09-22b] 优化：写作 Agent 表达组件升级——专属 Soul + 人类友好阐述协议

**变更原因**：用户判定 Writer 美化目标未达标（对工作 Agent 输出做人类友好阐述）。DB 实证三大组件缺陷：① Soul——WRITER agent 复用共享 soul `c708f478`（「专业编码与研究助手」，62 字，被 14 个 agent 共用），与编辑润色职责完全错位；② Prompt 模板——只有格式协议（标题/列表/mermaid），零表达质量标准，preferences 枚举（style=clear/depth=medium）语义未定义，LLM 无从执行；③ 双重人格注入——soul 同时走 system message 与模板 `{{ soul }}`，冗余且路径不一；④ Skill——`skill_ids_json='[]'` 且 `execWrite` 无 skill 注入链路，现有 9 个 skill 全为工具型（搜索/计算器/编排），对 Writer 无适用项。

**修改的方法**：
  - DB `soul` — 新增 Writer 专属 soul `ff605218`（brief「Brian最终表达层·人类友好阐述编辑」）：身份定位（首席编辑，原料→成品的转化者）+ 四信条（读者优先/准确为底/说人话/有温度不失分寸）+ 四纪律（承接语境/结论先行/节奏均衡/尊重原意）。
  - DB `agent` — WRITER agent `a18bcf7f` 重绑 `soul_id=ff605218`；共享 soul `c708f478` 其余 13 个绑定不动（已确认 `buildSystemAgent` 复用现有 agent 不重建，绑定持久生效）。
  - DB `prompt_template`（95b7c089）— `synthesis_protocol` 重写为「人类友好阐述协议」五步：读者视角重组（结论先行/例子类比）、**preferences 语义表**（style: clear/warm/professional；depth: brief≈200字/medium/deep）、表达自然化（禁「一、二、三」序号标题与「首先/其次/最后」八股、禁空洞总结与套路化反问）、排版按需服务可读性；删除 `<identity>{{ soul }}</identity>` 段（人格统一由 system 消息承载，消除双份注入）。
  - 后端 `Base/PromptCatalog/catalog.ts` — 内置 writer 模板（`builtin.writer`）同步五条规则（英文镜像版），原文注释保留。

**影响的端点**：
  - `POST /api/chat/stream`（V2 链路）— Writer 阶段人格与表达协议变更；接口结构、事件、落库格式不变。

**验证（e2e）**：重启 dev-server 后两轮追问式实测（同 session：「记忆的本质是什么？」→「记忆的分类呢？」）。TURN2（事故同题）表达质量全面达标：承接语境自然（「上一回我们说到它是个永远在线的编辑系统，这一回往里面走走」）、无序号标题（小标题带语义如「按时间分：三层仓库」「把它串回上一回」）、生活化例子与隐喻贯穿（电话号码/楼/图书馆/肌肉/人生篇章）、结尾为承接隐喻的自然延展（「想往哪个房间再走近一步？」）而非套路反问。lint/typecheck/单测与基线一致（仅既存问题）。

**决策记录**：Skill 组件本次不注入——工具型 skill 对无工具链路的 Writer 无意义，写作技巧内化进 prompt 模板；若未来引入「写作风格/排版」类提示词型 skill，需先在 `execWrite` 补 skill 加载与注入逻辑（另立任务）。

**可能存在的问题**：
  - `matchSoul` 对新建 agent 仍按任务语义生成 soul，未来若 WRITER agent 被删除重建（`force_new`），会重新生成通用 soul 而非本专属版；如需固化可把专属 soul 文案登记进 SoulCore 生成策略；
  - preferences 语义目前定义 clear/warm/professional × brief/medium/deep，`writer_agent_config` 可配置值若超出此集合（如 funny），模板行为未定义（回退默认）。

## [2026-09-22] 优化：写作 Agent 输出协议 JSON blocks → Markdown 直出

**变更原因**：trace `418a19a1`（2026-09-22 10:20「记忆的分类呢？」）实证写作 Agent 整合产出为整段原始 JSON：Writer LLM 按模板要求输出 JSON content blocks 数组，但输出在结尾截断（612 output tokens，缺尾 `]`），`parseBlocks` JSON.parse 失败后走 catch 降级——把**残缺 JSON 原文**当作回复投递（`reply.delta`）并落库。结构性根源是输出协议本身：① 长 JSON 截断即整篇报废；② JSON 转义膨胀 ~30% token 加重截断概率；③ 下游 `blocks.map(b=>b.content).join('\n\n')` 压平丢弃 heading 层级与 list_item 标记（同日成功 run 3a94a7d8 实证排版全丢）；④ 消费端（reply.delta → 前端 Markdown 渲染）原生吃 Markdown，blocks 中间协议与管线不匹配。按「优化写作 Agent 本身、让它一次产出合格输出，不做下游检测补救」的决策，将输出协议改为 Markdown 直出。

**修改的方法**：
  - 后端 `Agent/WriterAgent/application/WriterAgentService.ts` — `execWrite` 成功分支：`response` 直取 `eventsOutput.result.trim()`，`output.blocks` 由 `parseBlocks(response)` 生成（对 Markdown 原文自然回退为单一 text_paragraph 全文块，接口兼容）；原 JSON blocks join 逻辑注释保留。`parseBlocks` 方法保留（BlockStream 预留）。
  - 后端 `Base/PromptCatalog/catalog.ts` — 内置 writer 模板（`builtin.writer`）：删除规则 4-9（JSON blocks 契约与示例），改为 Markdown 直出规范（`##` 分节 / 列表层级 / 加粗 / 表格 / mermaid / preferences.format 语义），原文注释保留。
  - DB `prompt_template`（id=95b7c089「Writer 结构化响应」，`is_system=0` 用户模板、`seed_hash` 为空，为运行时实际生效模板）— `output_contract` 由「仅输出合法 JSON 数组」改为「直接输出 Markdown 正文」，删除 `<block_registry>` 段；`synthesis_protocol` 补 Markdown 排版步骤。全库备份 `brian-backend/data/brian.db.bak-writermd-20260922`。

**影响的端点**：
  - `POST /api/chat/stream`（V2 链路）— `writer.completed` 与 `reply.delta` 语义不变；`reply.delta` 内容从「可能为 JSON 字符串」变为稳定 Markdown 正文；`output.blocks` 结构兼容不变。
  - 会话历史（info_raw RESPONSE）— 新问答落库为 Markdown 排版正文。

**验证（e2e）**：`tsc --noEmit` 通过；lint 仅既存 `InfoCoreService.ts` no-console（非本次文件）；Agent workspace 单测 119 通过、2 失败为既存（`shared-full.test.ts` formatContextCategories，stash 验证与本次无关）。重启 dev-server 后以事故同题「记忆的分类呢？」实测：`writer.completed` `format=MARKDOWN length=712`，`reply.delta` 与 info_raw 落库均为结构化 Markdown（`## 一、按保持时间分…` 标题 + 列表 + 加粗，无 JSON、无围栏包裹）。

**可能存在的问题**：
  - `writer_agent_config.default_format` 枚举仍含 `JSON` 选项（FORMAT_ENUM），直出协议下该偏好无对应行为（模板仅区分 TEXT/MARKDOWN），后续可收敛枚举；
  - Writer LLM 输出仍无 max_tokens 上限（llm_available.max_tokens=0 → 端点默认），Markdown 直出已大幅降低截断危害（截断只丢尾段），如需彻底杜绝可另配；
  - `llm_call_log` 不记录 finish_reason，截断仍不可观测（本次未改，另立任务）；
  - BlockStream-PRD 的 blocks 原生管线规划不受影响：parseBlocks 与 blocks 接口保留，届时以独立协议接入。

## [2026-09-22] 修复：摘要生成失败静默丢摘要——LLM 重试 + 启动时缺失摘要回填

**变更原因**：对话页消息框摘要区回退显示原文（观感为「没有摘要」）。排查确认：摘要生成链路（saveInfo → summaryInfo → LLM → info_summary → message-dag 接口 → 前端 MessageCard）本身完好，但 `llm_call_log` 实测本地/远程模型服务间歇性 CONNECT_ERROR（2026-09-22 上午 45 次，其中一次摘要生成调用挂起 120s 后失败），`generateSummaryText` 捕获异常后仅 console.warn 到终端即返回空串——摘要丢失不可见、不可恢复。

**修改的方法**：
  - 后端 `Core/InfoCoreProvider/application/InfoCoreService.ts` — `generateSummaryText` 拆出 `execSummaryLLM`（单次调用）+ 重试循环（最多 2 次尝试、间隔 2s，常量 `SUMMARY_LLM_MAX_ATTEMPTS` / `SUMMARY_LLM_RETRY_DELAY_MS`）；新增 `backfillMissingSummaries`（Lifecycle 区）：防重入标志 + 一次 SQL 选出「长文本超阈值、info_summary 无行、handle_result_type=correct、info 非空」候选，逐条复用 summaryInfo（内部幂等）补生成；`backfillRunning` 私有字段防并发重入。原始实现注释保留。
  - 后端 `Core/InfoCoreProvider/domain/types.ts` — 新增 `BackfillMissingSummariesInput/Output`。
  - 后端 `Core/InfoCoreProvider/access/InfoCoreAccess.ts` + 模块 `index.ts` — 同步暴露新方法与类型。
  - 后端 `dev-server.ts` — 启动序列（每日 Info 老化清理之后）调用一次 backfill，失败 warn 不阻塞启动。

**影响的端点**：
  - 启动序列 — 新增一次性缺失摘要回填（需重启 dev-server 生效）。
  - `GET /api/visualization/message-dag` 与 `GET /api/chat/history/:sessionId` — 无接口结构变化；回填后缺摘要消息的 `info_summary` 由空变为真实 AI 摘要，前端消息框摘要区不再回退原文。
  - `POST /api/chat/send`（V2 流）— 摘要生成失败重试发生在 saveInfo 后的 setImmediate 异步链路内，不阻塞 SSE 流；最坏情况摘要延迟约 2×LLM 超时。

**验证（e2e）**：单元测试 3 项（候选筛选排除短文本/错误/已老化清空信息；补生成成功 + 幂等重跑 0 条；LLM 失败降级重试 1 次后返回 0 不抛错），InfoCoreProvider 全量 83 用例通过、Core 与根 tsconfig 类型检查通过。一次性脚本对真实库执行 backfill：57d67751（262 字回复，10:17 LLM 失败丢摘要）成功补生成「记忆是面向未来的动态建构而非过去拷贝…」，message-dag 接口 4/4 节点均有摘要。

**可能存在的问题**：
  - 历史数据层面：`chat_session` 仅剩 2 会话、`info_raw` 仅剩 4 条，而 runtime_* / info_context_source（47 个孤儿 work）/ GraphDB 残留完整——历史会话的 info_* 数据曾被「非现有 deleteSession 级联」的路径删除（疑与 chat_session 双 schema 冲突处理相关），runtime_message 中仍存有 09-04/09-08 原始消息可作回填源，如需恢复历史摘要可另立任务；
  - 本地 llama.cpp 服务（127.0.0.1:8080，nomic-embed 向量化模型）处于宕机状态，与摘要无关但影响记忆向量化，需另行拉起；
  - 重试仅 1 次，针对间歇性 CONNECT_ERROR；若模型服务持续宕机，摘要仍会丢失（由启动回填兜底）。

## [2026-09-21] 修复：反馈数据随会话级联删除 + 孤儿反馈启动清理

**变更原因**：反馈表（feedback_record / feedback_process_log）以 run_id（关联 runtime_run.id）与 work_id（关联 info_raw.work_id）引用会话内容，但删除会话时从未级联清理反馈——会话删除后监控页残留大量「无法关联任何内容」的孤儿反馈：列表卡片永远显示「暂无提问内容」、详情只剩一串 ID（Process ID / Run ID / Agent ID 全部指向已删除的数据）。用户要求：关联信息已删除的反馈应被关联删除。

**修改的方法**：
  - 后端 `Application/Chat/application/ChatService.ts` — `deleteSession` 会话循环内新增级联（遵循该文件既有的按日期注释增量修改惯例）：删除会话数据**之前**先收集该会话的 run_id（runtime_run.session_key 反查）与 work_id（info_raw.session_id 反查，去重），随后按 `run_id IN … OR work_id IN …` 删除 `feedback_record` 与 `feedback_process_log`（表名按名引用，同 writer_agent_user_profile 惯例；失败 warn 不阻塞会话删除）。单删/批删/孤儿会话清理（purgeOrphanSessions 复用 deleteSession）三条路径一并覆盖。
  - 后端 `Base/FeedbackHandler/domain/types.ts` — 新增 `DeleteFeedbackByRefsInput/Output`、`PurgeOrphanFeedbackInput/Output`。
  - 后端 `Base/FeedbackHandler/application/FeedbackService.ts` — 新增 `deleteFeedbackByRefs`（按 run_id/work_id OR 引用删除两表）与 `purgeOrphanFeedback`（孤儿判据：run_id 无效于 runtime_run **且** work_id 无效于 info_raw，即关联内容全部已删除或本为空 → 按 id 走标准删除路径移除）；FeedbackAccess/模块 index 同步暴露。
  - 后端 `dev-server.ts` — 启动时（孤儿会话记忆清理之后）调用一次 `purgeOrphanFeedback` 清理历史残留，失败不阻塞启动。

**影响的端点**：
  - `DELETE /api/chat/session` 与 `DELETE /api/chat/session/:id` — 删除会话时级联删除关联反馈（含 Agent 评估反馈），响应结构不变。
  - 启动序列 — 新增一次性孤儿反馈清理（dev-server 已重启生效）。
  - 监控页反馈记录/详情 — 孤儿记录不再展示，剩余记录均可关联到真实对话内容。

**验证（e2e）**：向 DB 注入测试会话（runtime_run + info_raw + 按 run_id/work_id 引用的反馈 + 无关反馈），调用 `DELETE /api/chat/session`：run_id 关联反馈、work_id 关联反馈、处理日志均被级联删除，无关会话的反馈正确保留；历史孤儿反馈（含用户示例中 2026/9/14 的 8 条）启动清理后监控页总数归零。

**可能存在的问题**：
  - 孤儿判据以 info_raw.work_id 为 work 存在性依据（works 表不在同一库），若未来出现独立的作品删除路径需同步接入级联；
  - 无任何引用（run_id 与 work_id 均空）的「裸评分」反馈会被启动清理删除——此类记录在监控页本就无任何可展示内容，符合「无法关联即清理」的预期；
  - `DELETE /api/memory`（按 info_id 删记忆）不删 runtime_run，关联该 run 的反馈仍保留（对话轮次仍存在，口径一致）。

## [2026-09-21] 优化：监控页「反馈处理记录」去 ID 化，改为「人话优先」卡片流

**变更原因**：上一轮仅修复了表格重叠，但列表主体仍是一串 ID（Process ID / Agent ID / Run ID），用户无法一眼看出「这条反馈对应哪次提问、评价如何」——信息密度高但对人不友好。

**修改的方法**：
  - 后端 `Base/FeedbackHandler/domain/types.ts` — 新增 `FeedbackProcessLogListItem`（继承原始记录，附加 `source` / `category` / `comment` / `user_question` 展示字段），`QueryProcessLogsOutput.logs` 改用该类型。
  - 后端 `Base/FeedbackHandler/application/FeedbackService.ts` — `getProcessLogs` 查询后调用新增私有方法 `enrichProcessLogs` 批量补充人性化字段：`feedback_id IN` 一次批量关联反馈来源/分类/评论，`run_id IN` 一次批量取该轮对话首条用户提问（与详情接口同口径，非逐行 N+1）；失败静默降级为仅原始字段（原始实现注释保留）。
  - 前端 `api/types.ts` + `api/index.ts` — 镜像新增 `FeedbackProcessLogListItem`，`feedbackApi.records` 返回类型更新。
  - 前端 `components/panels/MonitorPanel.vue` — 反馈记录由 ID 表格重构为**卡片流**：主文案优先展示用户提问摘要（无提问依次回退用户评论/分类），行首为评分徽章（≥70 好评 / 41-69 中评 / ≤40 差评 / 0 未评分，阈值与后端 RATING_*_THRESHOLD 一致）+ 动作徽章（带图标）+ 来源徽章（用户反馈/Agent 评估），时间改相对时间（悬浮显示绝对时间），分类与 agent_id 降为次要信息行；整卡可点开详情。
  - 反馈详情弹窗 — 评分改为同款好评/中评/差评徽章，新增来源/分类/用户评论展示，Process ID 增加一键复制。

**影响的端点**：
  - `GET /api/feedback/records` — 响应在原字段基础上追加 `source` / `category` / `comment` / `user_question`（向后兼容，前端对缺失字段有回退）；轮询频率与参数不变。后端 dev-server 已重启生效（原进程不支持热加载）。
  - `GET /api/feedback/records/:processId` — 行为不变（本次校验其 enrichment 口径与列表一致）。

**可能存在的问题**：
  - 列表 enrichment 对每页日志额外增加 2 次批量查询（IN 上限 = 页大小 50），当前量级无感；若未来日志量大可考虑缓存或改为 SQL JOIN；
  - `user_question` 依赖 info_raw 中 `info_creator_role='user'` 的首条消息，历史数据缺失时该卡片自动回退显示评论/分类；
  - 卡片主文案使用 `line-clamp-2` 截断，超长提问需点开详情查看全文。

## [2026-09-21] 修复：监控页「反馈处理记录」内容重叠 + 页面展示优化

**变更原因**：反馈记录表格为 `table-fixed` 固定列宽布局，「时间」列仅 96px（`w-24`），而单元格内容 `2026/9/21 14:30:25`（约 140px）带 `whitespace-nowrap` 强制不换行——文字溢出列边界直接压到「Process ID」列上，产生内容重叠。另有轮询体验问题：`fetchFeedbackRecords` 每次执行都置 `fbLoading=true` 并整表替换为「加载中...」，10 秒轮询导致表格每 10 秒闪烁一次；轮询失败还会清空已有记录误显「暂无」。

**修改的方法**：
  - 前端 `components/panels/MonitorPanel.vue` — `fetchFeedbackRecords(manual)` 重写：仅首次加载（`fbLoaded` 标记）展示阻塞式「加载中...」，10s 轮询与手动刷新静默更新（手动刷新时刷新图标旋转 `fbRefreshing`），失败时保留旧数据而非清空（原始实现注释保留）；新增 `fbTotal` 展示总条数。
  - 反馈记录表格：列宽重排（时间 `w-40` / Process ID `w-32` / 评分 `w-14` / 动作 `w-16` / Agent ID `w-28` / Run ID 自适应），溢出单元格全部改 `truncate` + `title` 悬浮完整值（去掉 JS `slice` 假省略号），表格加 `min-w-[640px]` + 容器 `overflow-auto`（窄屏横向滚动而非挤压重叠）；动作标签改圆角胶囊样式。
  - 最近日志表格：同样加 `min-w-[760px]` + `overflow-auto`，时间列 `whitespace-nowrap` 改 `truncate`（消除同类重叠隐患）。
  - 系统健康卡片：组件详情 key/value 加 `min-w-0 truncate` + `title`，长值不再撑破布局。
  - 反馈详情弹窗：长 UUID 字段加 `break-all`（不再溢出弹窗）、元信息栅格移动端单列（`grid-cols-1 sm:grid-cols-2`）、动作/评分空值兜底显示。
  - 刷新按钮补充 `title="刷新"` 提示。

**影响的端点**：
  - 纯前端展示层改动，无后端端点变化；生效入口为「监控」页面（`MonitorView` → `MonitorPanel`）。
  - `GET /feedback/records` 调用频率与参数不变，仅前端消费 `total` 字段展示总条数。

**可能存在的问题**：
  - 反馈记录 `fbTotal` 为后端返回的全量总数，列表仍只加载最近 50 条，两者数字不一致属预期（表格为滚动窗口）；
  - 轮询失败静默保留旧数据，界面无失败提示（数据时间戳不更新可间接察觉）；如需强提示可后续加 toast；
  - 深色模式下胶囊标签配色沿用既有 `actionColors`，未单独调整对比度。

## [2026-09-21] 修复：询问读伴点击「咨询」后一直转圈、失败无反馈

**变更原因**：读伴问答为同步 LLM 推理（实测约 19s，大上下文更久），而前端 `fetch` 无超时、`submitAsk` 的 `catch` 静默吞错——请求慢/挂起/失败时按钮转圈或弹窗停滞，均无任何反馈，感知为「一直在转圈」。另发现后端 `execDocumentQueryLlm` 出错时把错误包装为 200 +「解释失败：…」文案返回（见可能存在的问题）。

**修改的方法**：
  - 前端 `api/index.ts` — `request` 助手新增可选 `timeoutMs`（`AbortSignal.timeout`，默认不传保持所有既有接口行为不变；原始实现注释保留）；`libraryApi.queryDocument` 传入 `timeoutMs: 60000`，超时自动中止请求。
  - 前端 `composables/useLibraryTab.ts` — 新增 `askError` 状态；`submitAsk` 失败不再静默：`TimeoutError` 映射为「咨询超时：读伴响应超过 60 秒…」，其余映射为「咨询失败：<原因>」，错误展示在弹窗内并保留已输入内容便于重试（原始实现注释保留）；`openAskDialog`/`closeFileModal` 清理 `askError`。
  - 前端 `components/info/LibraryTab.vue` — 询问弹窗增加等待提示（「读伴正在结合文档上下文思考，通常需要 10~30 秒」）与失败错误文案展示。

**影响的端点**：
  - 纯前端改动，无后端端点变化；生效入口为「信息 > 资料库 > 划词右键询问读伴 > 咨询」。
  - `POST /api/library/query` 行为不变；前端 60s 超时后本地中止（后端请求继续完成但结果被丢弃）。

**可能存在的问题**：
  - 后端 `execDocumentQueryLlm` 出错时以 200 +「解释失败：…」文案返回，前端会当作正常回答生成卡片（不拦截）；建议后续后端改为抛错返回 5xx，前端按错误分支处理——涉及后端重启，本次未改；
  - 后端 `execLLM` 链路无显式超时，LLM provider 挂起时后端请求会一直等待（前端 60s 超时仅中止本地等待）；
  - 60s 超时阈值按当前实测延迟（约 19s）×3 余量设定，若更换更慢的 LLM 需相应调整。

## [2026-09-21] 修复：编辑文档后咨询标注与正文的引用关系丢失

**变更原因**：`restoreMark` 按选中文本在**单个文本节点**内 `indexOf` 精确匹配——① 编辑后选区内只要引入行内格式（加粗/链接等）即把文本节点拆开，跨节点选中则从来匹配不上；② 选区内改错别字/增删词/调标点后全量精确匹配失败，直接标记「原文已变更」，下划线与边注对齐关系全部丢失。

**修改的方法**：
  - 前端 `composables/useLibraryTab.ts` — 新增模块级纯函数并导出：`normalizeForFuzzy`（去空白/标点/大小写 + 原始下标映射）、`fuzzyLocate`（头/中/尾探针收集候选窗口，字符重合度计数交集评分，≥0.6 命中并映射回原始区间）；新增（组合函数内）`buildDomTextIndex`（拼接文本节点 + (node,offset) 索引，跳过已标注文本）、`wrapRange`（`surroundContents` 失败退回 extract/insert，跨块级元素还原并放弃以防非法嵌套）；`restoreMark` 重写为「跨节点精确匹配 → 模糊重锚定 → 放弃」三级策略（原始实现注释保留）；`markSelection` 复用 `wrapRange`，新提问跨内联节点选中也能落标注（原始实现注释保留）。
  - 前端 `components/info/LibraryTab.vue` — 编辑器保存提示文案更新为「标注自动重新对齐，无法对齐才标记失效」。
  - 前端 `test/annotationAnchoring.test.ts`（新增）— `normalizeForFuzzy`/`fuzzyLocate` 单元测试 9 例：逐字命中与映射、选区内改字/加词/调标点重锚定、相似段落择优、无关内容/低相似度/过短否定用例。

**影响的端点**：
  - 纯前端展示层改动，无后端端点变化；生效入口为「信息 > 资料库 > 打开文档（恢复历史标注）/ 保存编辑（重对齐标注）/ 划词询问读伴（落标注）」。

**可能存在的问题**：
  - 模糊重锚定基于字符重合度（顺序无关），选区被大幅重写（相似度 <0.6）或头/中/尾探针全部被改时仍会标记「原文已变更」；
  - 全文多处高度相似段落同时存在时，取重合度最高者，理论上可能锚定到错误的相似段落（探针候选 + 阈值已缓解）；
  - 每条标注重建时重新拼接全文文本索引（N×O(文档长度)），万字符级文档 × 数十条标注无感知，超大文档可按需缓存索引。

## [2026-09-21] 资料库阅读器：读伴问答改为「纸质书边注（marginalia）」呈现

**变更原因**：读伴问答卡片集中在独立右栏，垂直位置与正文无对应关系，看不出问答结果和 Markdown 原文之间的联系。期望体验是「读纸质书时在空白区写批注」——补充内容紧挨对应原文，联系一目了然。

**修改的方法**：
  - 前端 `composables/useLibraryTab.ts` — 新增边注子系统：`marginMode`（matchMedia `≥1360px`）、`noteTops`/`relayoutMarginNotes`（按正文标注垂直位置对齐边注卡片，相邻重叠向下顺延，末卡片底边撑开内容区 minHeight）、`marginLayerRef`、`handleMarkClick`（正文标注点击事件委托，联动激活卡片）；`refreshAnnotationMarks` 末尾追加边注重排触发、`setActiveAnnotation` 追加边注卡片滚入视口、`submitAsk` 新卡落位后重排、`closeFileModal` 清理 `noteTops`；`onBeforeUnmount` 追加 ResizeObserver / matchMedia 清理；`watch(contentAreaRef)` 挂载 ResizeObserver 监听正文高度变化重排；`DocAnnotation` 移至模块顶层并导出（原始实现以注释保留）。
  - 前端 `components/info/AnnotationCard.vue`（新增）— 读伴提问卡片组件，右栏列表与边注共用：编号徽章（激活时橙色）、原文引用、问题、回答 Markdown；`compact` 形态供边注使用（回答区限高内滚）；失效标注展示「原文已变更」。
  - 前端 `components/info/LibraryTab.vue` — 阅读区正文外层加 relative 包裹层：宽屏切 `doc-margin-grid`（正文限宽 42rem + 右侧 `minmax(240px,288px)` 边注层，版心居中），窄屏回退独立右栏列表（卡片替换为 `AnnotationCard`）；正文标注点击事件委托；正文列样式随模式切换（边注模式取消 `mx-auto` 居中）。
  - 前端 `styles/globals.css` — 新增 `.doc-margin-grid`（grid 版心布局）、`.doc-margin-layer`/`.doc-margin-note`（绝对定位边注卡片）、`::before` 引线（蓝/激活橙，含暗色）、`.doc-margin-answer`（内滚防长回答顶飞后续卡片）。

**影响的端点**：
  - 纯前端展示层改动，无后端端点变化；业务入口为「信息 > 资料库 > 打开文档阅读 / 划词询问读伴」。
  - 视口 ≥1360px 时读伴问答从右栏变为正文右侧边注；<1360px 行为与改版前一致。

**可能存在的问题**：
  - 边注首帧先全部落在 `top:0` 再测量定位，`nextTick` 后一次重排到位，理论上存在单帧跳动（实测不明显）；
  - 失效（stale）标注无正文锚点，边注只能顺延在前一卡片之后，不与原文对齐；
  - 窗口在 1360px 断点附近反复拖动会触发布局模式来回切换（matchMedia 已做状态去重，成本可控）；
  - 边注回答限高 15rem 内滚，超长回答需在卡片内滚动查看。

## [2026-09-21] 资料库文档阅读器重构 + 文档编辑/删除 + 读伴专用 Agent/Prompt/Soul

**变更原因**：资料库文档阅读区原为「章节 | 正文 | 咨询卡片 + SVG 虚线连线」布局，卡片拥挤、连线穿过正文、选中高亮无样式；文档只读无法编辑/删除；内容变更后咨询标注无法优雅降级。同时文档问答此前直连 `execLLM`，缺少专用 Agent/Prompt/Soul，问答能力有限。

**修改的方法**：
  - 前端 `components/info/LibraryTab.vue` — 阅读区重构为「目录 / 正文阅读栏 / 读伴提问栏」；正文限宽居中、内部滚动；移除 SVG 虚线连线，改为编号下划线 + 点击卡片定位高亮；新增编辑模式与删除二次确认；提问文案改「询问读伴」。
  - 前端 `composables/useLibraryTab.ts` — 新增 `openEditor/saveEditor/requestDeleteFile/confirmDeleteFile`；新增 `refreshAnnotationMarks`（内容变更后重匹配，失败置 `stale`）与 `setActiveAnnotation`；`openFile` 批量加载并统一标注；移除 `annotationLines/recomputeLines`；`queryDocument` 透传 `document_title`。
  - 前端 `styles/globals.css` — 新增 `.doc-reading` 与 `.doc-annotation-mark`/`.is-active` 样式（含暗色）。
  - 前端 `api/index.ts` / `api/types.ts` — 新增 `libraryApi.updateFileContent` / `deleteFile`；`queryDocument` 增加 `document_title`；新增 `DocumentAnnotation` 类型。
  - 后端 `SelfLearningService` — 新增 `updateFileContent`（写回本地文件、状态置 `PENDING`）、`deleteFile`（删本地文件 + 级联清理 `document_annotation`/`self_learning_file`）、`soFileRecord`；`queryDocument` 改为经「文档伴读」声明式 Agent（读 Agent 定义取模型/温度）+ 专用身份模板（`builtin.document_reading_identity`，内存渲染，不依赖 DB 播种）与专用 Soul 组装 system，配置项优先；新增 `ensureBuiltinDocumentAgent` / `ensureDocumentReadingSoul` / `soDocumentReadingAgent` / `buildDocumentReadingSystem` / `soDocumentReadingSoulContent` / `matchDocumentQueryLlm` / `execDocumentQueryLlm`（原始实现注释保留）；`renderPrompt` 支持内置模板优先渲染。
  - 后端 `SelfLearning/domain/types.ts` — 新增 `UpdateFileContentInput/Output`、`DeleteFileInput/Output`、`QueryDocumentInput.document_title` 与文档伴读常量。
  - 后端 `SelfLearning/access/SelfLearningAccess.ts` — 构造接收 `soulAccess`/`agentDefAccess`（可选），新增三个包装方法。
  - 后端 `Base/PromptCatalog/catalog.ts` — 增强 `builtin.document_query`（含文档标题与伴读式回答要求）；新增 `builtin.document_reading_identity`（文档伴读身份段）。
  - 后端 `dev-server.ts` — 装配 Soul/AgentDef 到 SelfLearning，启动幂等装配文档伴读 Agent/Soul；新增文件编辑/删除路由；`/api/library/query` 透传 `document_title`。

**影响的端点**：
  - 新增 `PUT /api/library/files/:fileId/content`（`{ content }` → `{ fileName, content, size }`）。
  - 新增 `DELETE /api/library/files/:fileId`（→ `{ success, deletedAnnotations }`）。
  - `POST /api/library/query` — 新增可选 `document_title`，后端改走专用 Agent 组装 system/模型。

**可能存在的问题**：
  - 删除文档为物理删除（不可恢复），仅级联清理索引与咨询记录，不回收该文档历史学习产生的知识条目；
  - 标注按 `selection_text` 全量首匹配，编辑后可能出现定位偏移或标记「原文已变更」；
  - 内置 Soul/Agent 采用代码内置种子（沿用 Summary/Intent Agent 约定），与 DevStandards「禁止硬编码种子」口径存在差异；
  - 需重启后端（tsx dev-server.ts 无热加载）后新路由与 Agent 装配才生效。



**变更原因**：「涌现」图中出现由系统报错信息派生的节点（如「工具缺失」「工具不可用」等）。Tag 图节点由 `info_tag` 聚合、经 `rebuildCooccurGraph` 建入 GraphDB；`tagInfo` 实时抽取虽已按 `handle_result_type != correct` 跳过错误信息，但存量错误标签（隔离机制引入前抽取）与已删除会话遗留的孤儿标签仍在 `info_tag` 中，而 `rebuildCooccurGraph` 全量重建时未回溯 `info_raw.handle_result_type`，导致这些标签被重新建入「涌现」图。DB 实证：`info_raw` 已清空、`info_tag` 残留 23 条孤儿标签，`GET /api/memory/tag-graph` 仍返回「工具缺失 / No external tool」等系统标签节点。

**修改的方法**：
  - `InfoCoreService.rebuildCooccurGraph` — 新增步骤 0：调用 `purgeNonCorrectTagRows` 清理存量（原始实现注释保留）；
  - `InfoCoreService.purgeNonCorrectTagRows`（新增）— 删除 `info_id` 无法回溯到 `info_raw`、或对应信息 `handle_result_type != correct` 的 `info_tag` 行；
  - `InfoCoreService.rebuildCooccurForSource` — 读表改为 `INNER JOIN info_raw` 且仅保留 `handle_result_type = 'correct'`（原始全量 `relationDb.select` 注释保留），标签 / 关键词图节点与共现边仅由正确信息派生；
  - `InfoCoreProvider/domain/types.ts` — `RebuildCooccurGraphOutput` 新增 `purged_rows` 字段；
  - `Core/test/InfoCoreProvider.test.ts` — 新增用例：错误信息派生标签被清理且不入 GraphDB「涌现」图。

**影响的端点**：
  - `GET /api/memory/tag-graph` — 仅返回正确信息派生的标签节点，系统报错信息不再入图；
  - `GET /api/memory/keyword-graph` — 关键词图同样仅由正确信息派生；
  - 服务启动 `[startup] rebuild cooccur edges` — 触发存量清理与重建。

**可能存在的问题**：
  - 判定口径为「`handle_result_type != correct` 或 `info_raw` 无对应行（孤儿）」；若后续出现以 `correct` 落库但属系统运行信息（非用户信息）的写入方，需扩展过滤条件；
  - 启动时全量 `DELETE ... NOT IN` 在 `info_tag` 体量极大时有短时耗时（当前量级可忽略）；
  - `info_keyword`（FTS5）仅在建图侧过滤，未做行级清理（`keywordInfo` 抽取侧已有 correct 过滤）。

## [2026-09-21] 删除会话后「信息 > 记忆」页对话内容残留：孤儿会话记忆清理（purgeOrphanSessions）

**变更原因**：在「对话」页删除会话后，「信息 > 记忆」页仍展示该会话的对话内容。DB 实证：`chat_session` 已空，但 `info_raw` 仍残留 23 条记录（来自 2026-08-10 ~ 08-14 已删除会话，全为 `PERMISSION` / `USER_FEEDBACK` 类型）。根因是 `info_raw.session_id` 无法匹配任何 `chat_session` 的孤儿行：
1. 历史版本权限审计桥（`dev-server.ts permissionAuditBridge.asked`）早期把 `info_raw.session_id` 落为 Runtime 内部 session id（2026-09-11 才改为落对话会话键 `session_key`），旧行删除会话时按对话会话键删除命中不到；
2. 会话级联删除逻辑 2026-09-15 才收敛到 `InfoCore.delInfoBySession`，此前删除的会话亦可能遗留孤儿记忆。
这类孤儿行不会被按指定 `session_id` 的 `deleteSession` 命中，因而长期残留并被「记忆」页签（`GET /api/memory/search` 直读 `info_raw`）展示。

**修改的方法**：
  - `ChatService.purgeOrphanSessions`（新增）— 以 `chat_session.session_id` 为唯一存活集合，取 `info_raw` 中 `DISTINCT session_id` 的差集为孤儿会话，复用 `deleteSession` 的级联逻辑（`info_raw` / `info_tag` / `info_summary` / `info_keyword` / `info_vector` / `info_context_source` / GraphDB 引用边 / `runtime_*` / `stream_event` / `writer_agent_user_profile`）彻底清理；支持 `dry_run` 仅统计不删除；
  - `Application/Chat/domain/types.ts` — 新增 `PurgeOrphanSessionsInput`（`dry_run?`）/ `PurgeOrphanSessionsOutput`（`purged_count` / `purged_session_ids`）；`Chat/index.ts` 导出；
  - `Application/Chat/access/ChatAccess.ts` — 新增 `purgeOrphanSessions` 包装方法；
  - `dev-server.ts` — 服务启动时执行一次孤儿会话记忆清理，并注册每日午夜复查（复用 `cronTrace('cron.orphanmemory')`，与 Info 老化清理同一模式）。

**影响的端点**：
  - 无新增 HTTP 端点；维护任务在服务启动与每日午夜触发，清理 `info_raw` 孤儿行。
  - 「信息 > 记忆」页签数据源 `GET /api/memory/search` / `GET /api/memory/date-counts` 间接受影响：不再返回孤儿记忆。

**可能存在的问题**：
  - 判定口径为「`session_id` 不在 `chat_session` 即孤儿」，若未来出现不落 `chat_session` 的记忆写入方，需同步纳入存活集合；
  - 会话删除与进行中的 run 并发时，run 迟到的记忆写入（如 `saveStepInfo`）可能在下次启动/午夜清理前短暂残留，建议后续评估「删除会话时中止进行中 run」；
  - 启动清理为一次性全表 `DISTINCT` 扫描，`info_raw` 极大时可能有秒级开销（每日复查同理），如体量增长需改为增量游标。

---

## [2026-09-21] 对话页「历史会话」批量删除修复：补批量端点 + 级联清理关联数据（writer_agent_user_profile 残留）

**变更原因**：对话页「历史会话」侧栏批量勾选后点击删除，会话删除不完整且关联数据残留。根因有两点：
1. 前端批量删除为逐条调用单条接口 `DELETE /api/chat/session/:id`，无二次确认、无失败处理（顺序 `for await`，任一失败即中断循环，剩余会话不删且选中项不清空），与 PRD「session_ids[] 一次提交」契约不符；
2. 后端 `ChatService.deleteSession` 虽已级联清理 info_*、runtime_*、stream_event，但 **`writer_agent_user_profile`（WriterAgent 会话级写作偏好，session_id 唯一）未随会话删除**，DB 实证删除后残留为孤儿数据；HTTP 层亦无批量删除端点。

**修改的方法**：
  - `ChatService.deleteSession` — 在删除 `chat_session` 后新增按 `session_id` 清理 `writer_agent_user_profile`（独立 try/catch 最佳努力清理，表不存在时静默跳过；表名按名引用避免 Application → Agent 运行时耦合）；
  - `dev-server.ts` — 新增 `DELETE /api/chat/session`（请求体 `session_ids: string[]`）批量端点：调用 `ChatService.deleteSession` 一次级联清理，并逐会话 `resetUserProfile` 清理 `user_profile_record` / `user_profile_dimension_data`；空数组返回 400。单条路径 `DELETE /api/chat/session/:id` 保留不变；
  - `brian-frontend/src/api/index.ts` — 新增 `chatApi.deleteSessions(sessionIds)`（`DELETE /api/chat/session`）；
  - `brian-frontend/src/stores/session.ts` — 新增 `deleteSessions(ids)`：一次请求删除多个会话，成功后从 `chatList` 移除，当前会话在集合内则 `clearMessages()`；
  - `brian-frontend/src/views/ChatView.vue` — 单条/批量删除改为二次确认弹窗（`deleteConfirm` / `requestDeleteSession` / `requestBatchDelete` / `confirmDelete`，对齐信息页「历史」Tab）；批量走 `deleteSessions` 一次提交，失败保留列表与选中项；原逐个删除实现注释保留；
  - `brian-frontend/src/composables/useHistoryTab.ts` — 批量删除由逐条 `Promise.allSettled` 改为一次 `chatApi.deleteSessions`（原实现注释保留）；
  - `brian-frontend/test/e2e-server.ts` — 镜像新增 `DELETE /api/chat/session` 批量路由。

**影响的端点**：
  - `DELETE /api/chat/session` — 新增批量删除；一次清理会话记忆 / Runtime 数据 / 写作偏好 / 用户画像；
  - `DELETE /api/chat/session/:sessionId` — 单条删除行为不变，额外清理 writer_agent_user_profile；
  - `POST /api/chat` 不存在此路径，无影响。

**可能存在的问题**：
  - 存量已删除会话遗留的 `writer_agent_user_profile` / `llm_call_log` / 旧 `runtime_event`、`runtime_metrics` 孤儿行不会自动回填清理，如需可另做一次性迁移；
  - `llm_call_log` 属监控审计数据，本次未纳入会话级联（保留用于 Token/日志追溯），如需随会话删除需单独评估对监控统计的影响；
  - 批量端点非事务整体回滚：与单条一致采用逐会话级联，个别会话清理失败仅记录 warn 不影响其余会话。

---

## [2026-09-15] /api/chat/eval-result 数据源迁移到 agent_evaluation（「评估结果」弹窗永远为空）

**变更原因**：对话页消息框「评估结果」按钮点击后永远提示"暂无评估结果"。根因是 2026-09-14 Runtime v2 重构后的数据源错位：
1. Evolutor 评估结果不再写 `orchestration_agent_execution`（该表已无任何写入方，最新行为 2026-09-14 20:41 之前的旧架构数据），改写 `agent_evaluation`；
2. Runtime v2 中评估阶段使用框架生成的私有 `evalWorkId`（`RunGatewayService.executeRun` 内 `IdGenerator.generate()`），与问答的 `work_id` 完全无关——评估关联到问答的唯一键变成了 `run_id`（= 一次问答的 `runtime_run.id` = `info_raw.work_id` / `info_raw.run_id`）；
3. 原端点按 `work_id = info_raw.work_id` 查 `orchestration_agent_execution`，两个数据源对不上，恒 `found=false`。DB 实证：`agent_evaluation` 在 2026-09-14 20:30 后持续新增且 `run_id` 与新问答 `work_id` 精确匹配，而原端点查的表从那一时刻起零新增。

**修改的方法**：
  - `dev-server.ts` `/api/chat/eval-result` 端点 — 反查 `info_raw` 额外取 `run_id`；优先按 `run_id`（= `work_id`）查 `agent_evaluation`，由其 `scores` / `suggestions` / `need_optimize` 三列组装原 `answer` 字段等价的评分 JSON（前端 `EvalResultModal` 解析契约不变）；`agent_evaluation` 未命中且 `work_id` 存在时回退旧 `orchestration_agent_execution` 查询（历史数据兜底）。原查询逻辑完整注释保留。

**影响的端点**：
  - `GET /api/chat/eval-result` — 已评估问答可正常返回 `found=true`；接口响应 schema 不变，前端零改动。

**可能存在的问题**：
  - `agent_evaluation` 无 `elapsed_ms` / `agent_name` 列：`elapsed_ms` 返回 0（前端已判空不显示），`agent_name` 固定"进化 Agent (Evolutor)"（与前端默认文案一致）；
  - 单轮直答（iterations≤1）在 `eval_skip_low_risk=true`（默认开）下按设计跳过评估，此类消息的「评估结果」按钮仍显示"暂无评估结果"，属预期而非缺陷；
  - 评估私有 `evalWorkId` 与问答断链后，「思考过程」弹窗若按 work 关联评估块可能受同样影响（本次未涉及，需单独确认）。

---

## [2026-09-15] 弱相关维度数量口径重定义（用户裁定）：上限 = min(基础上限, 基础上下文数量 × 占比)；random 默认占比改为 5%

**变更原因**：用户指出原「动态收缩」口径与实际预期不符——原实现为 `min(base, total×percent)×shrinkFactor`（占比基准是 total、再对基础占比做二次收缩）；正确口径应为：

> 弱相关维度实际上限 = **min（该维度基础上限 base_xxx_count, 「基础上下文消息数量」× xxx_max_percent%）**

即占比基准从 total 改为 **基础上下文数量（pinned + citing + timeline）**，取消 shrinkFactor 二次折算。用户例子：基础上下文 100 条 → 随机采样最多 5 条（random 占比 5%）。

**修改的方法**：
  - `InfoCoreService.context` — `capByPercent`（min(base, total×percent)×shrink）替换为 `capByBase`：`min(base, floor(baseContextCount × percent / 100))`；原始实现注释保留；
  - `random_max_percent` 默认值 20 → **5**（四处同步：代码回退值 `toInfoContextConfigRecord`、`updateInfoContextConfig` 默认落库、SchemaInitializer 建表/加列 DEFAULT、configRegistrations 注册默认与描述文案），其余三维度占比描述文案同步改为「相对于基础上下文数量」；
  - DB `info_context_config.random_max_percent` 存量行 20 → 5（含 priority_order 前一轮已更新）；
  - 配套单测调整：RANDOM 用例改为 30 条消息会话（5% 口径下基础 ≥ 20 才产生随机配额，8 条会话恰好 0 条随机，符合新口径）。

**新的数量公式（默认配置，随机 5%、标签 20%、相似 15%、关键词 10%）**：

  基础上下文 = 100 条 → 随机 ≤ 5、标签 ≤ 20、相似 ≤ 15、关键词 ≤ 10（同时受各自基础上限 50/200/150/100 约束）
  基础上下文 < 20 条 → 随机配额为 0（新会话大部分场景无随机记忆）

**影响的端点**：
  - `InfoCore.context` — 四个弱相关维度（TAG/SIM/KW/RANDOM）限额口径统一改为「基础上限 vs 基础上下文×占比」取小，不再占 total、不再动态收缩。

**可能存在的问题**：
  - 新会话（基础上下文 < 20 条）随机配额为 0，跨会话随机联想记忆在小会话初期不再出现——这是新口径的直接推论（风险已向用户确认接受）；
  - `total`（1000 条总预算）仍保留用于最终 `slice` 封顶，但不再参与弱相关配额的计算。

## [2026-09-15] RANDOM 随机采样名额核算与 PRD 对齐（trace 162c58fc）：CURRENT 提前剔除 + 库内遗留 priority_order 补 CITING

**变更原因**：问答 trace 162c58fc（run bcae81a5，16:52）实测快照 RANDOM=49/48 条（loop/work），与数量逻辑（randLimit = min(base_random_count=50, total=1000×20%) × shrinkFactor = **50**）不符、差 1。根因：新会话中 info_raw 仅 1 条 REQUEST（当前消息），RANDOM 第一阶段"会话内未选中消息随机抽样"先把它采进候选并占一个名额，CURRENT 剔除在**抽样之后**（PRD 步骤 4 要求当前输入不进弱相关候选），splice 掉后名额不再回补，最终实收比限额少 1。

**修改的方法**：
  - `InfoCoreService.context` — RANDOM 采集块：当前消息（CURRENT）在会话内/全局候选**采样阶段即排除**（`curExcludeId` 过滤并入 filledIds），不再依赖事后 splice 回补（原实现注释保留）；会话采样 SQL limit 放宽为 `min((randLimit+1)*3, count)` 防腾挪误差；效果：trace 162c58fc 场景下最终 RANDOM 实收 = randLimit（50）满额。

**附带数据修复**：库内 `info_context_config.priority_order` 为 CITING 默认值修复（2026-09-14 PRD 对齐）之前的旧值 `TIMELINE,PINNED,TAG_RELATIVE,...`（不含 CITING、PINNED 次序不符）。现有行未被 SchemaInitializer 的默认值迁移覆盖，本次直接 UPDATE 为 PRD 默认 `PINNED,CITING,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM`。

**影响的端点**：
  - `InfoCore.context` — RANDOM 维度实收数量恢复与限额一致（基础场景满额 50 / 收缩后足额），CURRENT 不再挤占随机名额。

**可能存在的问题**：
  - TAG_RELATIVE / SIMILARITY / KEYWORD 同样存在「采样后才剔 CURRENT」的同类名额占用模式（影响 ≤1 条，且这些维度限额由检索排序截断而非精确取满，影响可忽略）；若后续要完全对齐可同样前置剔除；
  - `ORDER BY RANDOM() LIMIT min(remaining*3, 100)` 的 100 上限在面对超大库（>100 万行）时可能样本不足，需表分区/模块化后再评估。


## [2026-09-15] 记忆管理收敛 InfoCoreProvider：消多路径 ①快照读取唯一化（删 SQL 复刻）②会话级删除收敛 ③摘要生成内建

**变更原因**：用户要求"记忆的构建都要集中到 InfoCoreProvider，不要有多条路径；InfoProvider 提供上下文构建、上下文快照、内容摘要生成等上下文管理的功能"。盘点现存多条路径：
1. dev-server 内联复刻 SQL（`soContextByWorkRaw`）直查 `info_context_source`/`info_raw`/`info_summary`——与 `InfoCoreProvider.soContextByWork` 双路径；
2. `ChatService.deleteSession` 内联直写派生表（info_tag/info_summary/info_keyword/info_vector + delInfoGraph + info_raw）——与 `delInfoByWork` 同构的第二条删除路径；
3. 摘要生成：InfoCore.summaryInfo 长文本直接 return（摘要生成名义上由 SummaryAgent 承担，实际**无任何调用方**），`info_summary` 表长期空置（实测 0 行）——记忆能力名存实亡。

**修改的方法**：
  - `InfoCoreService.summaryInfo` — 长文本（>threshold）改由 InfoCore 本体内经 `config.llm_id` / `prompt_template_id` 调 LLM 生成摘要（`generateSummaryText`，错误/未配置 warn 降级不阻塞）；`info_types` 类型过滤仅作用于生成阶段（短文本原文即摘要与既有行为一致，保住既有测试语义；原始实现注释保留）；`saveInfo` 异步自学习链路恢复 summaryInfo 触发（原注释行保留）——摘要生成路径收敛为 InfoCore 类。
  - `InfoCoreService.delInfoBySession`（新增，`DelInfoBySession{Input,Output}` 新类型 + Access/index 导出）—— 会话级等删除（info_raw + info_tag/summary/keyword/vector + info_context_source 快照 + GraphDB 级联），消掉派生表内联直写；`ChatService.deleteSession` 改调 `infoCore.delInfoBySession`（原内联批次注释保留），本层只保留 chat_session / runtime_ / stream_event 等非记忆表清理。
  - `dev-server.ts` — `soContextByWorkRaw`（InfoCore.soContextByWork 的 SQL 复刻）删除，快照三对象统一走 `InfoCoreProvider.soContextByWork`（`soContextByWorkShared` 鸭子封装）；`buildThinkingBlocksFromRuntime` / `buildRuntimeWorkContext` 增加 infoCore 参数；run 权威快照（work_id=runId）纳入合并展示。

**影响的端点**：
  - `info_summary` — saveInfo 后自动补摘要（长文本走 LLM，info_summary 不再空置，context 的 `[摘要]` 回退开始有效）；
  - `POST /api/chat`（deleteSession）— 会话删除经 InfoCore 单路径清理记忆（含本轮新增的 runId 权威快照）；
  - `GET /api/chat/thinking` — 快照读取唯一走 soContextByWork。

**可能存在的问题**：
  - 摘要 LLM 依赖 `info_summary_config.llm_id`（当前库中已配置但指向的模型 ID 需有效；未配置时 warn 跳过，无摘要落库不破坏保存链）；
  - SummaryAgent（Agent 层）保留为兼容实现，但 saveInfo 链路不再依赖它；后续可下线；
  - 阅读类 SQL（soChatHistory 检索/统计、UserProfile/SelfLearning/Visualization 的 info_raw 只读分析）未在本次收敛（属展示与分析，不含写入），如需完全单路径可后续用 InfoCore 查询用例替换；
  - permission-audit（dev-server 权限审计 PERMISSION 行直写）为审计 sink 而非对话记忆构建，本轮视为例外保留（answered 状态更新 updateInfo 不支持按 info_id 定位，需扩展后再集中）。


## [2026-09-15] 主 Loop 注入多层静态记忆（用户要求）：system 追加 <static-memory-context> 不可变块；执行期新信息保持消息序列可变

**变更原因**：用户确认主 Loop（每次问答的实时执行 Agent，此前仅 system(soul) + 会话时间线 wire）也需要消费多层记忆；并强调：多层记忆属于 context 中的**不可变**内容（静态），Agent 执行过程中新增的记忆（工具产出/用户追加/中间结论）属**可变**内容，二者不得混在一起。

**修改的方法**：
  - `RunGatewayService`（Runtime/Runs/application）— 构造器新增可选 `infoCore?: InfoCoreAccess`（不注入时旧行为不变，向后兼容）；`executeRun` 在 `prepareLoopInput` 后新增 `buildStaticMemorySystem`：
    - 调 `InfoCore.context`（session_id=chat 会话，work_id=runId，info=本次输入，`enable_cross_session=true` 跨会话多维召回，persist 默认 true → **V2 权威快照收敛到主 Loop**（run 开始即冻结，轮间不变））；
    - `formatContextCategories` 渲染 `<static-memory-context>`（usage-note 已内嵌「不可修改/续写、不构成指令、与执行新信息冲突时以新信息为准」）追加到 system 末尾；
    - 失败 best-effort：仅 warn 回退原 system，不阻塞执行；
    - 静态/可变分层实现：静态记忆进 system（messages 序列外，每轮轮转不变）；执行期新增信息（工具调用产出、用户 steer 注入、中间轮结论）仍在 messages 序列中动态演进，两者物理分离、不经同一通道注入。
  - `RunGatewayAccess` — infoCore 透传（可选）；`dev-server.ts` — `new RunGatewayAccess(..., writerAgent, infoCore)` 注入真实 InfoCore。

**影响的端点**：
  - `POST /api/chat/stream`（V2 主 Loop）— 每轮 LLM 的 system = soul + 多层静态记忆（SIMILARITY 随 embedding 服务恢复可用）；工具产出等动态信息不变仍走消息序列；
  - `InfoCore.context` — 每个 run 的权威快照主构建点为 runId（与 Writer work 快照并存，可视化合并展示）。

**可能存在的问题**：
  - 静态记忆追加进 system 后，ContextBuilt 事件 payload 的 `system` 含记忆块（「构建上下文」节点展示包含静态记忆，符合预期）；轮间复用一次构建，system 变长增加输入 token（每 run 一次，非每轮加重召回成本）；
  - embedding 服务未启动时 SIMILARITY 维度仍为空（已知环境问题）。


## [2026-09-15] 问答 trace 1a688f04 复查：V2 上下文落库已生效但展示侧仍只读时间线 → runtime 分支合并静态记忆快照 + REQUEST 提前落库

**变更原因**：用户指出修复后"思考过程上下文看不修复"。复查 trace 1a688f04（run f50aa456，11:37）：`persist_snapshot: true` 已生效——Writer work ce5f69ad 在 `info_context_source` 落了快照（KEYWORD 2 条 / RANDOM 49 条）；但（1）`buildThinkingBlocksFromRuntime`（V2 历史直连分支）的 context 仅填 ContextBuilt 的 wire 时间线，从不查询快照三对象（编排分支才查 soContextByWork，且 V2 不写 orchestration_agent_execution，编排分支也不触发）；（2）Writer 快照里 TIMELINE/CURRENT 为空——REQUEST 消息在 run 结算后才经 syncRuntimeMessagesToInfoRaw 落 info_raw，Writer 构建上下文（run 内最后一步）时时间线恒空。

**修改的方法**：
  - `dev-server.ts` — 新增 `soContextByWorkRaw`（`info_context_source` + `info_raw`/`info_summary` 只读 SQL 复刻 soContextByWork，不依赖 InfoCoreAccess 注入）与 `buildRuntimeWorkContext`：按 `llm_call_log.run_id` 反查本 run 持有快照的 work（排除 run 自身），构建三对象并合并为与编排分支同构的 `context` 展示字段（selected/citing/timeline/pinned/similarity/tagRelative/keyword/random *Messages + categoryIds + source_ids_map）；无快照 work 时保持原 wire 时间线兜底（原内联对象注释保留）；
  - `dev-server.ts` — 顺带修复既存 lint：重复 `case 'writer.completed'`（dead code）合并进首个 case 保留耗时累计，原代码注释保留；

**影响的端点**：
  - `GET /api/chat/thinking`（V2 历史直连 run）— 思考过程「上下文」页签展示 Writer 静态记忆快照多来源（KEYWORD/RANDOM/…）+ wire 动态消息，可视化与实际注入一致；
  - `POST /api/chat/stream`（ChatService.openChatStreamV2）— 用户 REQUEST 在 submitRun 后立即落 info_raw（best-effort，失败由结算期同步兜底，`work_id|info_type|info` 去重键幂等不双写），Writer 构建上下文时时间线包含本次输入，快照出现 TIMELINE/CURRENT。

**可能存在的问题**：
  - submitRun 与立即 saveInfo 之间存在微小竞态：若 run 在毫秒级完成 Writer（不可能：writer 在 loop 轮之后，loop 至少一次 LLM 调用秒级），快照可能仍缺本次输入；结算期同步兜底；
  - `buildRuntimeWorkContext` 最多合并 5 个快照 work（防极端 run 爆炸），快照总量本身受 writer work 唯一性约束，正常只有一个。


## [2026-09-15] analysis trace 35a7f3a4：（采纳建议）"上下文只有单一时间线"修复 ①：V2 恢复快照落库 + 向量化失败可见化 ②：上下文注入功能化（静态记忆不可修改 / 动态执行上下文分区）

**变更原因**：问答 trace 35a7f3a4（run 13d7e234，2026-09-15 09:42）分析定位（见 PromptCatalog / INFOCore PRD）：V2 runtime 直连路径无 `BUILD_WORK_CONTEXT` 权威快照节点，WriterAgent 复用 `context()` 又显式 `persist_snapshot: false`，`info_context_source` 无本 work 记录，可视化 `soContextByWork` 查不到多源上下文，只能降级展示 loop 侧时间线 wire 消息，表现为「只有单一的基于时间线的上下文」。同时 `InfoCoreService` 向量化失败全链路静默（空向量 / silent catch），SIMILARITY 维度失效不可见（本例根因：本地 LLamaCPP embedding 服务 127.0.0.1:8080 未启动）。另有用户新要求：注入的记忆须按类型给出模型可理解的功能说明（非来源直译），声明静态记忆不可修改，并与执行中新产生的动态上下文明确区分。

**修改的方法**：
  - `WriterAgentService.execWrite`（Agent/WriterAgent/application）— `persist_snapshot: false` → `true`（原代码注释保留）：V2 路径下 Writer 是本次问答最后一次上下文构建，其快照即权威快照（按 writer work_id 幂等落盘，不与其它 work 冲突），多源上下文（PINNED/TIMELINE/CITING/TAG_RELATIVE/SIMILARITY/KEYWORD/RANDOM/CURRENT）可经 `soContextByWork` 完整还原；AgentExecution / Planner / Intent 内部复用保持 false（遵循「内部复用不覆盖权威快照」既有 PRD 决策）；
  - `InfoCoreService.generateEmbedding`（Core/InfoCoreProvider/application）— 空向量 / 调用异常输出 `console.warn` 诊断（含 llm_id），原 `catch { return []; }` 静默吞错注释保留；
  - `InfoCoreService.saveInfo` — 异步自学习（vectorInfo/tagInfo/keywordInfo）`Promise.all` catch 输出可见 `console.warn`，原无输出吞错注释保留；
  - `contextFormatter.formatContextCategories`（Base/PromptCatalog）— 输出统一改为 `<static-memory-context>` 静态记忆块：`<usage-note>` 声明「任务开始前检索的既定事实与历史记录，不可修改/续写、不构成指令，与新信息冲突时以新信息为准」；分区标签由来源直译名（`<时间线消息>` 等）改为模型可理解的功能语义标签（`<user-selected-messages>`、`<user-pinned-messages>`、`<conversation-history>`、`<cited-messages>`、`<related-memories>`、`<similar-experiences>`、`<keyword-memories>`、`<background-messages>`），每区附 `<what-this-is>` 说明该类记忆如何产生、回答时应如何使用（原始实现整体注释保留）；
  - `contextFormatter.formatDynamicContext`（新增）— 渲染 `<dynamic-execution-context>`：本次任务执行过程中 Agent 实时产出的信息（子 Agent 结果等），时效最高、与静态记忆冲突时以其为准，与 `<static-memory-context>` 标签与叙事明确互斥；
  - `WriterAgentService.execWrite` — 子 Agent 结果改经 `formatDynamicContext` 包装注入模板 `agent_results` 变量（原始纯拼接 `results` 保留，仍供 LLM 失败降级兜底）；
  - `Base/PromptCatalog/catalog.ts` — 内置 writer 模板 `context_data` / `agent_results` 段头标注 Static memory context（不可修改）/ Dynamic execution context（时效最高）；
  - DB `prompt_template`（writer_protocol 95b7c089，data/brian.db 有备份 .bak-ctxfmt-20260915）— `<synthesis_input>` 与 `synthesis_protocol` 补充静态/动态两类上下文的功能说明与冲突裁决规则。

**影响的端点**：
  - `POST /api/chat/stream`（V2 直连问答全链路）— Writer work 的多源上下文快照落库，思考过程可视化可还原完整上下文来源（不再只见时间线）；
  - Writer / AgentExecution / Planner / Intent / PromptRebuilder 全部经 `formatContextCategories` 注入的 Prompt — 静态记忆以「功能说明 + 不可变声明」叙事注入；
  - Writer 最终汇总 — 执行结果以动态执行上下文注入并与静态记忆分层。

**可能存在的问题**：
  - embedding 服务不可用时 SIMILARITY 维度仍为空（本次改进是失效可见、保存链路不中断，服务恢复后下一轮保存自然补齐向量）；
  - 功能说明文字计入上下文预算（约 1-2KB），超长上下文场景实际记忆条目数略减；
  - 标签由中文直译名改英文语义标签，前端不解析 prompt 文本（读取 `source_ids_map`），已确认无影响；若有脚本对旧标签硬编码需排查。


## [2026-09-14] 问答 ruthless 提速①：Agent 匹配向量+LLM 两级 ②：评估 Agent 异步化+低风险跳过

**变更原因**：问答 trace 7fc0147f（run 53cc55da，2026-09-14 20:41）实测 41.1s 全程 4 段串行 LLM：意图/Agent 匹配 5.2s → Loop 轮 10.3s → 评估 19.7s → 写作 5.8s。两处结构性浪费：匹配层每轮必跑 LLM 意图打分（对既有 Agent 的重复确认）；评估同步 await 阻塞写作与结算 20s。

**修改的方法**：
  - `AgentDefService.matchAgentDef`（Runtime/Agents/application）— 匹配层由「exact → LLM 裁判」扩为「exact → **向量召回 → LLM 裁判**」（原方法注释保留）：
    - 新增 `soVectorRankedDef` — 任务与 def 用途/签名代理文本分别经 `LLMAccess.embedLLM` 向量化（def 向量惰性缓存 `defEmbeddingCache`，随 active def 缓存刷新清空），余弦相似度 ≥ `match_vector_threshold`（`runtime_agents_config` 可调，默认 0.85）→ 直接采纳 `AgentMatchLayer.Vector`（新枚举值 'vector'），上报 `intent.analyzed`（`matched_via: 'vector'`，reason 注明余弦分数），**跳过一次 5-20s 意图打分 LLM**；
    - 置信度不足 or embedding 不可用 → 回退原 `soLLMRankedDef`（payload 补 `matched_via: 'llm'`），行为向后兼容；
  - `RunGatewayService.executeRun`（Runtime/Runs/application）— 评估 Agent 段重写（原同步段注释保留）：单轮直答（stop 且 iterations≤1）低风险跳过（`eval_skip_low_risk`，默认开）；需评估时改为后台 fire-and-forget（`runWorkEvaluation` 拆分方法），与写作 LLM 并行，不再阻塞 `settleRun`（`eval_async`，默认开）；
  - `RunGatewayService.configRuns` / `ConfigRuns{Input,Output}` — 新增 `eval_async / eval_skip_low_risk` 配置项（出参回显）；
  - `AgentsSchemaInitializer` 语义不变；`runtime_agents_config` 新增可调键 `match_vector_threshold`。

**影响的端点**：
  - `POST /api/chat/stream` — 预期 run 总耗时典型场景降 ~5-25s（向量命中省意图 LLM 5-20s / 评估不再阻塞 20s）；
  - `agent.selected` 事件 `matched_by` 新增取值 `vector`（前端按字符串展示，无需改动）；
  - `configRuns` — 新增两项运行时可调参数（回滚口：`eval_async=false, eval_skip_low_risk=false` 即恢复旧行为）。

**可能存在的问题**：
  - 向量召回只有"够熟"才采纳：embedding 阈值 0.85 偏保守，未命中的新领域任务仍走 LLM 裁判与 build 链路（成本与旧版一致，无劣化）；
  - 异步评估的 `evaluation.completed` 可能晚于 `run.finished`（实时流已收尾），前端实时时间线可能看不到收尾，历史时间线（stream_event 落库）完整；
  - 进程在评估 LLM 进行中重启时会丢失该次评估（原同步方案同样丢，无新增风险）。

## [2026-09-14] 思考过程执行时间线「卡受理→爆发涌现」修复：慢阶段补 started 事件

**变更原因**：问答 012aa85a-00af-484c-a67b-bbdaf158fa42 实测：`run.accepted`（20:20:15）之后 **19 秒无任何事件**——期间在跑意图打分 LLM（`AgentDefService.matchAgentDef` L3，deepseek 18.9s，llm_call_log 佐证），随后 20:20:34 同一秒爆发 `intent.analyzed / agent.selected / llm.selected / skill.selected / prompt.selected / agent.components / run.started / context.built` 共 8 个节点；评估 Agent（18.5s）与写作 Agent（6.6s）同样只有 completed 事件。用户观感即「长时间停在『开始受理请求』→ 突然涌出大量时间线节点」。根因：三类慢 LLM 阶段只有"完成"事件没有"开始"事件，LLM 调用期间时间线静止。

**修改的方法**：
  - `BusinessEvent`（Base/shared/base）— 新增 `IntentStarted('intent.started') / EvaluationStarted('evaluation.started') / WriterStarted('writer.started')` 三个开始事件（前端 sseEventTypes.ts / EVENT_UI_STYLE 同步登记）；
  - `AgentDefService.soLLMRankedDef` — LLM 打分调用前上报 `intent.started`（瞬时回执，不带耗时）；
  - `RunGatewayService.executeRun` — 评估/写作 LLM 执行前分别上报 `evaluation.started / writer.started`；
  - `chatStreamEvents.ts` — 新增 onIntentStarted / onEvaluationStarted / onWriterStarted 三个实时时间线处理器（「意图分析中… / 评估中… / 写作排版中…」）；并修复 `run.started` 直发曾复用 `run.accepted` 分支导致实时时间线推入重复「开始受理请求」节点的问题（现 run.started 推「开始执行」，与历史时间线一致）；
  - `dev-server.ts` — 历史时间线重建新增 `intent.started / evaluation.started / writer.started` 三个 case 节点。

**影响的端点/链路**：
  - `POST /api/chat/stream` — 实时思考过程时间线在意图打分/评估/写作 LLM 调用期间实时显示进行中节点；
  - `GET /api/chat/thinking` — 历史时间线同样包含这三个开始节点（trace 时序完整）。

**可能存在的问题**：
  - `intent.started` 仅在 L3 LLM 打分路径发射；L1/L2 确定性命中（exact/签名相似度）不发事件，短时间内时间线由受理直接跳到选中 Agent（时长毫秒级，静止不明显）；
  - run 终态收敛后 `runtime_run.metrics_json` 本次实测为 `{}`（本次 run 未落地 Metrics），与本修复无关、另行跟踪。

## [2026-09-14] Token 明细账全链路覆盖：业务/可观测 ID 分离 + 系统执行全部入账

**变更原因**：「思考过程」运行概览的 Token 统计只认 `llm_call_log.work_id=runId`，而意图识别、Agent 选择、评估 Agent、写作 Agent、Skill/MCP/Soul 组件选择与向量化等 LLM 调用落库时业务维度为空，全部漏统计。且业务维度（session/interact/work）与可观测维度（trace_id）混用（`SubmitRunInput.interact_id` 曾传 traceId、`work_id` 曾当 run_id 用）。

**修改的方法**：
  - `Context` 基类（Base/shared/base）— 统一携带 `session_id / interact_id / work_id / caller` 业务维度（各子类重复声明删除，共 12 处清理）；
  - `LLMService.applyDims` — 新增：`execLLM / execLLMEvents / embedLLM` 入口统一按「Context 优先、Input 回退」解析维度；`logCall` 增强为记录 `caller / llm_title / llm_type / status / error_code`（模型快照删库后仍可读），并新增 error 路径落账；
  - `LLMSchemaInitializer` — llm_call_log 新增 5 列（caller / llm_title / llm_type / status / error_code，旧库 ALTER 迁移）；
  - `RunGatewayService` — matchAgent（Agent 选择）、Loop（Work Agent）、评估、写作各阶段执行前由框架生成私有 work_id；`interact_id` 全链路统一 = run_id；`soRunTraceId` 收敛为仅取 metrics.trace_id；
  - `AgentLoopService.prepareLLMTurnInput` — work_id 改取 `ctx.workId`（缺省回退 runId）；
  - `AgentDefService.soLLMRankedDef` — Agent 选择 LLM 打分携带全维度与 caller；
  - `EvolutorAgentService / WriterAgentService / IntentAgentService` — 评估/写作/意图识别 LLM 调用补齐维度与 caller；
  - `SkillCore / MCPCore / SoulCore`（matchSkill/matchMCP/matchSoul → soRankLLM/embedTask）与 `InfoCore`（vectorInfo/similarKInfo → generateEmbedding）— 组件选择与向量化调用透传 Context 维度；
  - `ChatService` — `interact_id = run_id`（Done 事件 / 日志 / info_raw 落库），trace_id 保持独立；
  - `SubmitRunInput` — 删除 `interact_id` 字段；`dev-server` 运行概览 token 统计改按 `llm_call_log.interact_id` 求和。

### [2026-09-14 后续] 遗留问题清理：全调用点入账 + 模型属性/后台流 caller + SoulCore 用例

**变更原因**：首轮收敛后仍有序列暂未入账/无来源归因的 LLM 调用点，以及一个基线即失败的 SoulCore 用例。

**修改的方法**：
  - `AgentLoopService.fillLoopOutput` / `ExecAgentLoopOutput` — 补 `work_id`（本次 Agent 执行标识存入 Response，work_id 存在性闭环）；
  - `AgentLoopService.prepareLLMTurnInput` / `IntentAgentService` / `WriterAgentService`（回退路径）— 补 `caller` 归因；
  - `AgentLibraryService.matchAgent`（LLM 二层打分）— `MatchAgentInput` 新增 interact_id/work_id，维度经入参/上下文透传，caller 落账；
  - `AgentExecutionService.execLLMOrThrow` — 增加 biz 维度参数，think/reflect/answer 三阶段全部携带 caller + 维度；
  - `LLMCoreService.matchLLM` / `SoulCoreService.compareSouls` / `InfoCoreService.extractTags` — 维度与 caller 接入；
  - `PlannerAgent / SummaryAgent / AgentBuilder（三处）/ UserProfile / SelfLearning / LLMService.genLLMAttr / dev-server 模型调试端点` — 全部补 `caller` 来源归因；
  - `dev-server /api/llm/token-usage` — 新增 `caller` 维度过滤；
  - `Core/test/SoulCoreProvider.test.ts` — beforeEach 播种「Soul 匹配选择」Prompt 模板（与生产 PromptCatalog 对齐），修复基线即失败的 `generateAndAddSoul` 三层回退用例。

**影响的端点**：
  - `GET /api/llm/token-usage` — 支持 `caller` 过滤；
  - 全部 LLM 落账点 — 明细账 caller 列可按来源分维度统计。

**可能存在的问题**：
  - 业务表锚点列命名（work_id）保持兼容取值恒等（= run_id = interact_id），语义以 interact_id 为准（PRD 已记录，存量数据不做迁移）。

**影响的端点**：
  - `POST /api/chat/stream` — Done 事件 `interact_id = run_id`；
  - `GET /api/chat/thinking` — 运行概览 Token = 该次问答下全部 Agent/Tool 执行求和（此前漏计的系统 Agent 与向量化全部纳入）；
  - `GET /api/llm/token-usage` — 支持 session / interact / work 三级统计（口径更正：interact=一次问答，work=一次 Agent/Tool 执行）。

**可能存在的问题**：
  - ~~业务表（info_raw / orchestration_* / 前端契约）的 work_id 仍承载"问答锚点"语义（= run_id）~~ **已收敛（2026-09-14 后续）**：全量 LLM 调用点维度/caller 接入完成、ExecAgentLoopResponse 补 work_id、SoulCore 基线用例修复；问答锚点值恒等（work_id = interact_id = run_id），锚点列命名维持兼容（存量数据无需迁移），语义以 interact_id 为准并写入 PRD；
  - 后台流（UserProfile / SelfLearning / cron 等）调用 LLM 无业务维度 → 已全部落 `caller` 来源归因（业务后台流本无 session/run，维度空属正确语义）；
  - 组件匹配缓存命中时零 LLM 调用属正常（无明细账记录）。

### [2026-09-14 最终定名] interact_id → run_id：业务三级维度统一为 session_id / run_id / work_id

**变更原因**：用户最终确认三级业务维度定名——`session_id（会话）→ run_id（一次问答，= runtime_run.id）→ work_id（一次 Agent/Tool 执行）`，interact_id 作为中间维度名废弃，前后端代码与数据库全量统一。

**修改的方法**：
  - 全仓 codemod（81 个 ts/vue 文件）：`interact_id → run_id`、`interactId → runId`，并消除同对象因重名产生的重复键（Report / AopProxy / Loop 上下文与日志对象等）；
  - 数据库迁移（各 SchemaInitializer 内置 RENAME COLUMN）：llm_call_log / info_raw / log_record / feedback_record / feedback_process_log / agent_usage / agent_plan / agent_evaluation 的 `interact_id` 列统一 RENAME 为 `run_id`，旧索引清理、run_id 索引重建，模块自初始化时自动完成；
  - 前端：Done 事件改读 `run_id`、MonitorPanel「Interact ID」文案改「Run ID」、反馈提交与 MessageCard prop 统一 runId / run_id；
  - `GET /api/llm/token-usage` 与 `soTokenUsage`：参数定名 `{session_id, run_id, work_id, caller}`。

**影响的端点**：
  - `POST /api/chat/stream`（Done 事件）、`GET /api/chat/thinking`、`GET /api/llm/token-usage`、`/api/monitor/logs/query`、Feedback 全链路 — ID 维度统一为 run_id。

**可能存在的问题**：
  - 存量数据库经启动时 RENAME COLUMN 自动迁移（SQLite ≥3.25）；若运行环境 SQLite 过旧不支持 RENAME，需手工迁移一次。

### [2026-09-14 存量迁移落库] 真实存量库 RENAME 迁移完成 + 明细账 caller 全量闭环

**变更原因**：验证三级维度定名落地——存量 SQLite 库（brian-backend/data/brian.db、brian_log.db、data/brian.db）完成 interact_id → run_id 列迁移；并以真实问答端到端验证 token 明细账的维度完整性（发现并补齐 execLLM / execLLMEvents 成功路径漏传 caller/status 的两处落账缺口，及 Skill/MCP/Soul 选择打分、Soul 自生成的 caller 归因缺口）。

**修改的方法**：
  - 存量库迁移（已执行 + 备份 `*.bak-20260914`）：`llm_call_log` / `info_raw` / `log_record` / `feedback_record` / `feedback_process_log` / `agent_usage` / `agent_plan` / `agent_evaluation` 共 3 库 10 表（含空表）执行 `ALTER TABLE ... RENAME COLUMN interact_id TO run_id`，旧索引清理、run_id 索引重建；
  - `LLMService.executeSingleLLM / executeEventsSingle` — 成功路径 logCall 补 `caller` 与 `status='ok'`（此前仅失败路径携带，成功调用 caller 恒空）；
  - `SkillCore / MCPCore / SoulCore` `soRankLLM` — 组件选择 LLM 打分统一落 `caller`（SkillCoreService.rankSkills / MCPCoreService.rankMcps / SoulCoreService.rankSouls）并随 Context 透传业务维度；
  - `SoulCoreService.generateAndAddSoul` — Soul 自生成经 `callLLMJson` 落 `caller` + 业务维度（Context 透传）；`CallLLMJsonOptions` 新增 `caller` 选项；
  - `SelfLearningService` 标签提取 callLLMJson 调用补 `caller`。

**影响的端点**（真实冒烟验证通过）：
  - 完整问答链路实测入账：意图/Agent 选择（matchAgentDef）→ LLM 选择（matchLLM）→ Agent 构建（taskAnalysis / rankSkills / rankSouls / Soul 自生成）→ Prompt 匹配（matchPromptTemplate）→ Loop 各轮 → 评估 → 写作 → 后台标签（extractTags）——**每一行均有 caller 归因；问答内调用均携带 session/run/work 三维**；
  - `GET /api/llm/token-usage?run_id=` 实测返回该次问答真实求和（3 调 2752 tokens）；
  - Feedback 提交实测写入 run_id 列。

**历史数据说明**：llm_call_log 存量行（89 条）的 run_id 列值为旧维度语义（历史 traceId），如实保留不做改写；运行概览对历史 run 已有估算兜底。

## [2026-09-14] 思考过程「Skill 选定」运行节点：逐 Skill 展示名称 + ID（可观测选定的是哪个技能）

**变更原因**：用户反馈「思考过程」弹窗「运行节点」的「Skill 选定」节点只有「数量 + 明细」两个字段，明细为一串拼接名称（如「Information Retrieval Assistant」），既看不到选定的 Skill 名称字段，也看不到原始 Skill ID（字段无 `id` → 前端无悬浮 tooltip），无法确认选定的具体是哪个技能。

**修改的方法**：
- `brian-backend/dev-server.ts` — `buildThinkingBlocksFromRuntime` `skill.selected` 分支（原代码注释保留）：运行节点字段由「数量 + 明细拼接串」改为逐 Skill 输出「Skill 名称」（`skill.name` 优先，回退 `skill_brief`/载荷 `brief`/原始 ID）与「Skill ID」（同时作为字段 `id` 供前端悬浮 tooltip）；时间线 `detail` 展示技能名称清单、`tooltip` 携带原始 ID 列表（多 Skill 时字段标签为 `Skill N 名称` / `Skill N ID`）。

**影响的端点**：
- `GET /api/chat/thinking` — 历史问答思考过程「Skill 选定」运行节点逐 Skill 展示名称 + ID，时间线悬浮可见原始 ID。

**可能存在的问题**：
- 实时 SSE 思考块（`chatStreamEvents.onSkillSelected`）仍展示载荷 `brief`（缺失回退 ID），本次未改动；
- `mcp.selected` 运行节点为同样的「数量 + 明细」结构，如需同样改造可后续跟进。

## [2026-09-14] 执行内容组件可观测性：全链路「名称 + ID」双展示（运行概览组件清单/工具与授权所属组件/深度思考胶囊名称化）

**变更原因**：「执行内容」各子块组件信息不完整——运行概览无任何组件信息；组件装配 Skill/MCP 仅拼接清单无逐项 ID；MCP 选定无 ID；构建 Agent 无 Agent ID；工具调用/授权记录看不出调用属于哪个 Skill/MCP；深度思考「构建组件」胶囊直接显示原始 UUID 且点击查详情传的是名称（会查失败）。底层意图：通过执行内容可观测本次问答用到了哪些组件、组件信息有哪些。

**展示总则（不留旧兼容）**：凡组件处一律「名称为主文本、ID 可见」（独立字段行 / 悬浮 tooltip / 卡片明文），点击可进 ComponentInfoModal；名称回退链：载荷名称 → DB 名称列 → 原始 ID →「（未知）」。

**修改的方法**：
- `brian-backend/dev-server.ts` — `buildThinkingBlocksFromRuntime`：
  - 新增 `componentEntryFields`（逐组件「名称+ID」运行节点字段构造器）与 `toolComponentOf`（skill_exec→Skill、mcp_exec→MCP 所属组件解析，内置工具标注）；
  - `agent.components` 节点：Skill/MCP 改为逐项「名称 + ID」字段 + 数量；`agent.built` 节点：补 Agent ID/定义 ID 字段；`skill.selected`/`mcp.selected` 节点：统一逐项「名称 + ID」；
  - 工具/授权 trace 新增 `builtin/componentKind/componentId/componentName/componentSubTool` 字段；
  - `trace.run` 新增 `components`（agent/llm/prompt/soul/skills/mcps，名称+ID 结构化）；
  - `agentInfo.skills/mcps` 由 `string[]` 改为 `{id,name}[]`，`llmId/soulId/promptId` 改为 `llm/soul/prompt: {id,name}`（不留旧字段）；
  - 删除旧版 `buildThinkingBlocksFromRuntime` 全量注释代码块（约 250 行）与旧 `skill.selected` 注释块。
- `brian-frontend/src/api/types.ts` — `ThinkingToolTrace`/`ThinkingPermissionTrace` 新增组件字段；`ThinkingRunTrace` 新增 `components`；`agentInfo` 组件信息结构化（旧 `llmId/soulId/promptId/skills: string[]` 字段删除）。
- `brian-frontend/src/components/chat/ThinkingModal.vue` — 运行概览新增「组件清单」汇总区（Agent/LLM/Prompt/Soul/Skill/MCP 胶囊，悬浮显示 ID）；工具/授权卡片标题新增所属组件胶囊（或「内置」徽标），展开首行展示「所属 Skill/MCP：名称 + ID」；实时路径同规则解析（`realtimeToolComponentOf`，名称回退原始 ID）；删除旧 `liveTimeline` 注释块。
- `brian-frontend/src/components/blocks/ThinkingBlock.vue` — 构建组件胶囊改为：label=名称、title=`名称（ID：xxx）`、点击传 ID；头部 LLM 徽标显示模型名称（悬浮 ID）。
- `brian-frontend/src/composables/chatStreamEvents.ts` — `onAgentComponents` 将组件信息同步进思考块 `agentInfo`（实时深度思考胶囊立即可见）；删除旧 `getOrCreateThinkBlock` 注释块。

**影响的端点**：
- `GET /api/chat/thinking` — 历史问答：运行概览组件清单、运行节点逐项名称+ID、工具/授权所属组件、深度思考胶囊名称化。
- `POST /api/chat/stream` — 实时：`agent.components` 同步 agentInfo、工具/授权卡片组件解析。

**可能存在的问题**：
- 历史事件载荷中 `mcp_id`/`skill_id` 为运行时短名（如 `weather`）而非 UUID 时，DB 名称解析不命中，回退展示原始短名（本身可读）；
- 实时路径组件名称依赖事件载荷自带名称，缺失时显示原始 ID（历史轨迹由后端 DB 解析兜底）。

## [2026-09-14] 可观测计时框架化：Span 树 + 事件自动盖章（旧计时方案整体删除）

**变更原因**：问答 6fed30e6 执行时间线暴露两类架构缺陷：(1) 父子包含——「选中 Agent（23.1s）」内含「构建 Agent（18.2s）」等，编排方法的整段 AOP 耗时吸收了内部子步骤；(2) 扁平键体系缺陷——同 key 多次调用（多轮 LLM）末次覆盖、消费端硬编码四元组键随方法重命名静默失配（如已不存在的 analyzeIntent）、`||1` 伪毫秒兜底。均为计时框架缺陷，按「步骤编排/路由与步骤内部逻辑拆分」原则在框架层根治。

**框架设计（对标 OpenTelemetry Span）**：
  - **一切耗时都是 span，span 构成树；时间线节点耗时 = span self 时间（duration − 直接子 span 之和）**——父子包含关系在数据层不可能出现；
  - `Base/shared/base/Metrics.ts` — 内建 Span 树：`spans: MetricsSpan[]` + `beginSpan` / `endSpan` / `lastClosedSpan` / `spanDuration` / `spanSelfMs` / `sumSpanSelfMs` / `getTotalDuration`（根 span 包络）；
  - `Base/shared/aop/AopProxy.ts` — 每个新式 5 参服务调用自动 begin/end 一个 span（键 = `<层名>.<模块名>.<类名>.<方法名>`），父关系由未闭合 span 栈顶自动解析，服务调用拓扑零改动即成树；同步绑定 Report；
  - `Base/shared/base/Report.ts` — `bindMetrics` + `pushBusinessEvent` 自动盖章 `elapsed_ms`（最近闭合 span 的 self 时间）/`span_key`/`span_seq`（payload 已带 elapsed_ms 不覆盖）——**事件发射点即真实执行位置，耗时由框架保证正确**；
  - `Base/shared/base/BusinessEvent.ts` — 新增 `loop.turn.completed`（每轮 LLM span 闭合即上报，供「深度推理思考」多轮求和口径）；前端 `sseEventTypes` / `chatStreamEvents` 同步登记；
  - 私有段落显式成 span：`AgentDefService`（快照 system 组装）、`AgentLoopService`（上下文构建）经 `beginSpan/endSpan`，其余（意图打分、评估打分、Agent 构建、写作排版等）由切面自动覆盖；
  - 消费端（`dev-server.ts`）：节点耗时唯一读事件 payload；生命周期瞬时节点（受理/开始执行/调用工具）不展示伪耗时；「深度推理」= 多轮 `loop.turn.completed` 求和、「生成回答」= writer completed 消费；总耗时 = run 行 started_at ~ settled_at 包络。

**旧统计方案删除（不保留兼容）**：
  - `Metrics.timings` 扁平键与 `recordTiming / recordStart / recordEnd / getDuration / getProcessDurations` API；`TIMING_KEYS` 注册表与分段助手（TimingKeys.ts 删除）；
  - `runtime_run.metrics_json` 列与 `runtime_metrics` 表（建表/索引/settleRun 双写）；
  - `dev-server` 的 metrics_json 解析 / runtime_metrics 查询 / `getTimingDuration` / `eventElapsed` fallback / `|| 1` 伪耗时；
  - 存量历史 run（无 payload 计时）时间线节点显示空白 = 真实语义，不做静默伪造。

**顺带修复**：
  - `Base/LLMProvider/application/LLMService.ts` — 存量类型错误（`single.result`/`single.token_usage` 不存在，应为 `single.text`/token 字段），解除 Base 层整层构建阻塞；
  - `dev-server.ts` — `new Metrics(ctx.logAccess, ...)` 的 MetricsLogger 类型适配（LogAccess 不实现该接口）。

**影响的端点**：
  - `GET /api/chat/thinking` — 节点耗时为 span self 时间（父子互斥），全部来自事件自带耗时；
  - `POST /api/chat/stream` — 实时时间线同口径。

**可能存在的问题**：
  - Span 树仅驻留内存（审计与总耗时计算足够）；并发内嵌执行需 AsyncLocalStorage 上下文传播（预留）。

## [2026-09-13] Agent 实例去重合并与中文核心功能命名落地

**变更原因**：
1. 运行时库 `agent` 表累积 43 个实例，其中 25 个为历史任务自动生成的一次性副本（如签名为 "hi"、"你是谁？"、"什么是 AI ？"、具体旅行/编码子任务的 `general-`/`coding-`/`travel-` 副本），同领域多副本并存导致复用匹配命中错误实例；
2. 存量命名带英文前缀（`general-`/`math-`）与「助手/专家」后缀，违反「纯中文、10-30 字、核心功能命名」规范。

**修改的方法**（数据治理，无代码改动；备份 `brian-backend/data/brian.db.bak-agentmerge-20260913-230950`）：
  - 删除 25 个重复/一次性 Agent，级联清理 `agent_llm`/`agent_usage`/`agent_skill`/`agent_soul`（口径对齐 `AgentLibraryService.delAgent`），历史 `agent_evaluation` 与执行 trace 保留；同域任务副本分别并入 ai / coding / devops / testing / general / research / travel 领域代表；
  - 保留 18 个并重命名为纯中文核心功能名（系统 5 个：执行结果质量评估与组件自动进化、用户需求理解与意图识别、复杂任务拆解与执行规划、内容摘要提炼与上下文压缩、执行结果汇总与最终回答生成；WORKER 13 个领域代表），同步泛化 `agent_purpose` 与 `task_signature`，各域签名前缀唯一化；
  - 同步清理 `runtime_agent_def` 中 9 条 `agent_ref` 悬空的声明定义（一次性测试/任务副本登记，含 1 条历史悬空 `出行推荐`），保留正常的气象天气 def；Runtime 侧 `ASSET_CACHE_TTL_MS=30s` 过期后自动收敛，同类任务下次匹配经 `matchAgentDef → buildNewDef` 重建 def 并指向保留的领域代表 Agent。

**影响的端点**：
  - `GET /api/agent` — 43→18，名称全部为 10-30 字纯中文；
  - `AgentBuilder.buildSystemAgent` / `matchAgent` — 系统 Agent 按 `agent_type` 命中、Worker 按签名域命中，改名不影响既有匹配；同域任务后续复用领域代表实例。

**可能存在的问题**：
  - 历史评测/trace 表仍引用已删除 agent_id（仅展示用快照，不受影响）；
  - 热门一次性任务签名失去复用实例，后续同类任务可能触发一次新建；
  - `SYSTEM_AGENT_CONFIG.defaultName` 兜底短名（如「任务规划」）仍短于 10 字，仅在新建兜底路径生效。

## [2026-09-13] Agent 全汉字命名规范、废除 2-gram 关键词匹配与写作 Agent 修复

**变更原因**：
1. Agent 命名存在英文领域前缀（`general-`）、技术前缀（`w2-`）、哈希后缀（`-fa0f8c2e`）及冗余的「助手」后缀，浪费 Token 且表达不直观；系统属性（如 system/user）和领域属性（如 general/weather）应作为独立字段持久化。
2. 2-gram Jaccard 字符相似度算法缺乏语义理解，因英文单词偶发字母重合错误选错 Prompt 模板（如将通用散步推荐误选为「Planner 任务拆解」）；需废除 2-gram 关键词匹配，全链路采用「语义向量 + 大模型语义裁判」，并统一百分制（0-100）。
3. 写作 Agent（WriterAgent）调用底层旧版 `execLLM` 流式解析器时只监听 `delta.content`，且响应头到达后立即 `clearTimeout`，在长文本推流或模型输出思考字段时发生解析中断或超时异常，最终静默判为 `ok = false` 触发保底拼接逻辑；同时模板变量占位符 `{{ user_query }}` 与 `{{ context }}` 存在错配。

**修改的方法**：
  - `Agent/AgentBuilder/application/AgentBuilderService.ts`：
    - `SYSTEM_AGENT_CONFIG` 系统 Agent 名称改为纯全汉字功能命名（`任务规划`、`写作汇总`、`进化评估`、`内容摘要`、`需求理解`）；
    - `generateAgentName` 重构为全汉字功能命名生成函数，剥离英文前缀、哈希及尾部「助手」后缀；
    - `matchPromptForAgent` 废除 2-gram 匹配，采用大模型语义打分（百分制 0-100，阈值 75），自动过滤系统内部流转组件模板；
  - `Runtime/Agents/application/AgentDefService.ts`：
    - `insertDefFromAgent` 去掉 `w2-` 前缀与随机哈希，纯中文功能命名直接落账，并支持基于 `agent_ref` 幂等更新；
    - `matchAgentDef` 移除 2-gram `soSignatureMatch`，保留精确匹配与大模型裁判（百分制 0-100）；
  - `Runtime/Agents/infrastructure/AgentsSchemaInitializer.ts`：
    - `runtime_agent_def` 移除 `name` 列的 `UNIQUE` 约束，支持纯功能命名灵活落账；
  - `Agent/AgentLibrary/application/AgentLibraryService.ts`：
    - `matchAgent` 废除 2-gram 匹配，采用精确签名/领域包含 + 大模型语义裁判（百分制 0-100）；
  - `Core/shared/SimilarityHelper.ts` & `Core/shared/index.ts`：
    - 新增 `vectorCosineSimilarity`（余弦相似度百分制 0-100 映射），标记 `simpleSimilarity` 为 `@deprecated`；
  - `Agent/WriterAgent/application/WriterAgentService.ts`：
    - 补齐 Prompt 渲染变量 `user_query` 与 `context`；
    - 升级为 `execLLMEvents` 原生流式通道与全生命周期看门狗保活，彻底解决流式解析中断与超时问题；
    - 优化降级兜底逻辑，清理内部技术前缀，保证输出格式友好；
  - `Base/LLMProvider/application/LLMService.ts`：
    - 清理 `executeSingleLLM` 中脆弱的旧版 manual fetch 流式解析代码，统一委托现代 `LLMEventsRunner` 引擎。

**影响的端点**：
  - `POST /api/chat/stream` — 问答回复由现代化流式管道与全汉字 Agent 驱动，彻底根治 Prompt 错选与写作 Agent 降级拼接问题；
  - `GET /api/agent/list` / `GET /api/chat/thinking` — Agent 名称全部规范展示为纯中文功能名称（如「专业编码与研究」、「任务规划」）。

**可能存在的问题**：
  - 无

## [2026-09-13] 修复「构建上下文」时间线耗时误计入 LLM 生成时长问题

**变更原因**：用户反馈历史问答 `a07dd1ae-0ef5-4f33-b84e-28175857d58d` 的「构建上下文：第 1 轮 · 1 条消息」显示耗时 10.1s。
根因分析：
1. `context.built` 事件发生于 LLM 调用即将启动的时刻，而下一节点（如深度推理/回复）是在 LLM 流式生成完毕（耗时 10.1s）后才到达。
2. 前端 `ThinkingModal.vue` 原有的 `nextTs - item.ts` 盲目相减回退逻辑把「当前事件到下一事件」的跨度（包含了整整 10.1s 的 LLM 推理生成时长）错误地归咎于「构建上下文」环节。
3. `AgentLoopService.prepareLLMTurnInput` 构建上下文属于毫秒级内存操作，原先未在事件载荷中携带真实构建耗时。

**修改的方法**：
  - `Runtime/Loop/application/AgentLoopService.ts` — `prepareLLMTurnInput`：对上下文构建流程打点 `Runtime.Loop.AgentLoopService.prepareContext.start` 与 `.end`，并在 `context.built` 业务事件载荷中显式携带真实的构建耗时 `elapsed_ms: Math.max(1, endContext - startContext)`；
  - `dev-server.ts` — `buildThinkingBlocksFromRuntime`：`context.built` 节点优先从载荷 `payload.elapsed_ms` 或 `prepareContext` / `soMessages` timings 获取真实毫秒级耗时（默认 1ms），彻底消除虚假秒级估算；
  - `brian-frontend/src/composables/chatStreamEvents.ts` — `onContextBuilt`：实时流式阶段将载荷携带的真实 `elapsed_ms` 写入 `liveTimeline`；
  - `brian-frontend/src/components/chat/ThinkingModal.vue` — `timelineWithElapsed`：彻底废弃基于相邻节点时间戳盲目相减的 `nextTs - item.ts` 计算方式，严格使用由后端 Metrics 统计的真实耗时 `item.elapsedMs`。

**影响的端点**：
  - `GET /api/chat/thinking` — 历史问答「构建上下文」节点耗时准确显示为真实构建时长（毫秒级，如 1ms~5ms），不再错误显示 10s；
  - `POST /api/chat/stream` — 实时流式时间线中「构建上下文」同样显示真实毫秒耗时。

**可能存在的问题**：
  - 无

## [2026-09-13] 问答全流程计时体系与 Metrics 隔离落地

**变更原因**：问答执行时间线中记录的耗时不对（此前基于前后相邻事件时间差估算，存在误差与重叠不准）。需将计时逻辑集中存放在 Metrics 对象中，按 `<层名>.<模块名>.<类名>.<方法名>.start/end` 为 key，以毫秒时间戳为 value 记录所有流程的开始与结束时间，用于统计所有流程耗时及总耗时；每一次问答使用同一个 Metrics 对象保证环境隔离；最后落地数据库以便后续查看。

**修改的方法**：
  - `Base/shared/base/Metrics.ts` — 新增 `timings: Record<string, number>` 属性与 `recordTiming` / `recordStart` / `recordEnd` / `getDuration` / `getProcessDurations` / `getTotalDuration` 统计方法：
    ```typescript
    timings: Record<string, number> = {};
    recordTiming(key: string, timestamp: number = Date.now()): void;
    recordStart(layer: string, module: string, className: string, methodName: string, timestamp?: number): string;
    recordEnd(layer: string, module: string, className: string, methodName: string, timestamp?: number): string;
    getDuration(layer: string, module: string, className: string, methodName: string): number;
    getProcessDurations(): Array<{ key: string; layer: string; module: string; className: string; methodName: string; start: number; end: number; duration: number }>;
    getTotalDuration(): number;
    ```
  - `Base/shared/aop/AopProxy.ts` — 拦截所有服务方法调用：
    - 根据目标类名和 options 推导 `<层名>.<模块名>.<类名>.<方法名>`；
    - 方法执行前记录 `<层名>.<模块名>.<类名>.<方法名>.start` 时间戳；
    - 方法返回/异常时记录 `<层名>.<模块名>.<类名>.<方法名>.end` 时间戳；
  - `Runtime/Runs/infrastructure/RunsSchemaInitializer.ts` — `runtime_run` 表新增 `metrics_json` 列，并新增 `runtime_metrics` 表（包含 `id`, `created`, `updated`, `run_id`, `session_key`, `trace_id`, `timings_json`, `total_duration_ms`）；
  - `Runtime/Runs/application/RunGatewayService.ts` — `executeRun` / `settleRun`：
    - `matchAgent`、`soSnapshot`、`execAgentLoop`、`evalWorkAgent`、`execWrite` 全链路透传同一个 `Metrics` 实例；
    - `settleRun` 将 `metrics.timings` 序列化并落地写入 `runtime_run.metrics_json` 与 `runtime_metrics` 表；
  - `Runtime/Loop/application/AgentLoopService.ts` — 循环内消息持久化、工具执行、模型推理透传 `ctx.metrics`；
  - `Runtime/Tools/application/ToolService.ts` & `builtinTools.ts` — 工具执行与 Skill/MCP/CDT 调用透传 `metrics`；
  - `Application/Chat/application/ChatService.ts` — `openChatStreamV2` 与 `syncRuntimeMessagesToInfoRaw` 透传 `metrics`，Done 事件回传精确总耗时；
  - `dev-server.ts` — `POST /api/chat/stream` 创建独立 `Metrics` 对象；`buildThinkingBlocksFromRuntime` 读取持久化 `metrics` 并按精确计时计算各环节 `elapsedMs`；
  - `brian-frontend/src/components/chat/ThinkingModal.vue` — 时间线优先使用后端记录的真实耗时 `item.elapsedMs`。

**影响的端点**：
  - `POST /api/chat/stream` — 问答全流程使用独立单例 Metrics 对象追踪并落库；
  - `GET /api/chat/thinking` — 执行时间线准确展示各阶段精确耗时（不再依赖相邻事件时间差估算）。

**可能存在的问题**：
  - 无

## [2026-09-13] 思考过程「Skill 选定」明细展示修复：优先技能名称（name），回退简述

**变更原因**：用户反馈「思考过程」弹窗「运行节点」的「Skill 选定」节点「明细」展示的是技能简述（skill_brief，如英文长描述），而非选定技能的名称（如「Information Retrieval Assistant」）。根因是名称解析统一读取 `skill_brief` 列（简述），而 `skill` 表的 `name` 列才是技能名称。

**修改的方法**：
- `brian-backend/dev-server.ts` — `buildThinkingBlocksFromRuntime`：`skillName` 由 `resolveComponentName(id, 'skill', 'skill_brief')` 改为 `resolveComponentName(id, 'skill', 'name') || resolveComponentName(id, 'skill', 'skill_brief')`（历史轨迹 `skill.selected` 节点明细、`agent.components` 节点 Skill 清单、运行概览均受益）；顺带移除重构遗留的未使用变量 `thinkDeltaCount`/`replyDeltaCount`。
- `brian-backend/Runtime/Runs/application/RunGatewayService.ts` — `executeRun` 上报 `agent.components` 载荷 Skill `brief` 由 `soComponentName(t.id,'skill','skill_brief')` 改为新增的 `soSkillName(t.id)`（优先 `name` 列，回退 `skill_brief`）。
- `brian-backend/Runtime/Agents/application/AgentDefService.ts` — `soSnapshotTools` 上报 `skill.selected` 事件载荷 `brief` 由空串改为 `soSkillName(e.id)`（新增私有方法，优先 `name` 列，回退 `skill_brief`），实时 SSE 思考块展示技能名称而非原始 UUID。

**影响的端点**：
- `GET /api/chat/thinking` — 历史问答思考过程「Skill 选定」节点明细展示技能名称。
- `POST /api/chat/stream` — 实时思考过程「Skill 选定」思考块与 `agent.components` 组件装配展示技能名称。

**可能存在的问题**：
- 技能表 `name` 列缺失时回退展示 `skill_brief`（此时行为与原版一致）；
- 旧历史 `stream_event` 载荷中 `brief` 为空，由名称解析兜底，无需数据迁移。

## [2026-09-13] 思考过程弹窗：组件展示名称化（时间线/执行内容不再裸显组件 ID，悬浮可见原始 ID）

**变更原因**：用户反馈「思考过程」弹窗的「执行时间线」与「执行内容」中大量节点直接展示组件 ID（Soul/Prompt/LLM/Skill/MCP 的 UUID），不利于阅读；应展示组件名称，鼠标悬浮可见对应 ID。

**修改的方法**：
- `brian-backend/dev-server.ts` — `buildThinkingBlocksFromRuntime`：
  - 新增组件名称解析（`soul_name/prompt_name/llm_name/skill/mcp` 按 id 查 `soul`/`prompt_template`/`llm_available`/`skill`/`mcp_install` 表，带进程内缓存）；另新增 `agentNameOf`（`runtime_agent_def.name` 优先、回退 V1 `agent.agent_name`）解析「需求确认 / 意图分析」命中 Agent 名称；
  - `agent.components` / `llm.selected` / `prompt.selected` / `skill.selected` / `mcp.selected` / `intent.analyzed` 运行节点字段与时间线标题/详情统一展示组件名称（缺失回退原 ID）；字段新增 `id`、时间线新增 `tooltip` 下发原始组件 ID；
  - `agentInfo.skills/mcps` 列表同样优先展示名称。
- `brian-backend/Runtime/Runs/application/RunGatewayService.ts` — `executeRun` 上报 `agent.components` 载荷补充 `soul_name/prompt_name/llm_name` 与 Skill/MCP 的 `brief` 兜底解析（实时路径展示名称）。
- `brian-backend/Runtime/Agents/application/AgentDefService.ts` — `soAgentSnapshot` 上报 `llm.selected` / `prompt.selected` 载荷补充 `llm_name` / `prompt_name`；`soLLMRankedDef` 上报 `intent.analyzed` 载荷补充 `agent_name`。
- `brian-frontend/src/api/types.ts` — `ThinkingTimelineItem` 新增 `tooltip`；`ThinkingNodeTrace.fields` 新增可选 `id`。
- `brian-frontend/src/components/chat/ThinkingModal.vue` — 时间线标题与运行节点字段值悬浮（`title`）展示原始组件 ID。
- `brian-frontend/src/composables/chatStreamEvents.ts` — `onAgentComponents`/`onLlmSelected`/`onPromptSelected`/`onSkillSelected`/`onMcpSelected`/`onIntentAnalyzed` 优先使用载荷携带的组件名称，时间线 `tooltip` 携带原始 ID。
- `brian-frontend/test/chatStreamEvents.test.ts` — 新增「组件装配时间线展示名称、悬浮携带原始 ID」「intent.analyzed 命中 Agent 展示名称」单元测试。

**影响的端点**：
- `GET /api/chat/thinking` — 历史问答「思考过程」弹窗：时间线与运行节点展示组件名称，悬浮可见原始 ID。
- `POST /api/chat/stream` — 实时思考过程弹窗组件装配环节同样展示名称、悬浮可见 ID。

**可能存在的问题**：
- 组件表查无名称记录时回退展示原始 ID（此时无名称可展示，行为与原版一致）；
- 名称解析为按 id 的单行 SELECT，每次 run 有限次查询，缓存复用不引入额外热点。

## [2026-09-13] 思考过程时间线因果时序与节点聚合优化

**变更原因**：
1. 历史问答时间线汇总流式增量时使用了 `seq: -1`，导致「深度思考汇总」和「组织回复汇总」被错误排序在时间线最顶端（先于「开始受理请求」与「需求确认 / 意图分析」），出现严重的因果时序倒置；
2. 时间线上同时存在「深度思考：173 个增量 · 共 5449 字」与「开始思考（Agent 推理）」，出现概念技术黑话与重复割裂；
3. 流式实时阶段（进行中），前端在未解析出具体 Agent 前将意图分析和组件装配事件直接追加至初始块，产生多个无明确命名的「思考：执行 Agent」割裂节点。

**修改的方法**：
- `brian-backend/dev-server.ts` — `buildThinkingBlocksFromRuntime`：
  - 彻底移除 `seq: -1` 侵入式设计；
  - 追踪深度思考与组织回复的真实起始事件（`thinkAnchor` 与 `replyAnchor`），以事件真实发生的 `seq` 和 `ts` 挂载汇总节点；
  - 规范业务化标题文案：原「深度思考：X 个增量 · 共 Y 字」优化为「Agent 深度推理思考（Y 字）」，原「组织回复：X 个增量 · 共 Y 字」优化为「生成回答内容（Y 字）」；
  - 去除重复的空思考节点，时间线严格按 `受理 → 意图识别/Agent选择 → 组件装配 → 上下文构建 → 深度思考/工具调用 → 评估 → 写作排版 → 完成` 线性排序。
- `brian-frontend/src/composables/chatStreamEvents.ts` — 
  - `getOrCreateThinkBlock`：同轮次优先复用未绑定块，在 `agent.selected` 到达时更新 `agentInfo.name`，避免单轮问答创建多个冗余思考块；
  - 修复 `formatAgentTitle`：仅纯 UUID 视为无名称，有意义的名称和 ID 均正常展示；
  - 补充各过程事件对 Pinia store 的即时触发响应。
- `brian-frontend/src/components/chat/ThinkingModal.vue` — `liveTimeline`：
  - 任务进行中动态展示「Agent 深度推理思考（已推导 X 字）」或「Agent 深度推理思考中…」，避免出现空白或「思考：执行 Agent」的无意义重复节点。
- `brian-frontend/test/chatStreamEvents.test.ts` — 新增思考过程流式事件与单块复用单元测试。

**影响的端点**：
- `GET /api/chat/thinking` — 完整时间线严格按因果顺序呈现，消除因果倒置与网络增量碎片黑话。
- `POST /api/chat/stream` — 实时思考过程弹窗平滑追加进展，节点标题业务友好。

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

## [2026-09-14] traceId 源头治理：前端/Cron 触发源头生成、X-Trace-Id 全链路传播、run 级 trace 落库、迟到补齐按原 run 反查

**变更原因**：事故 trace `989acae9-d399-4775-b436-04e7c2650c7e`——上一轮 run 因后端进程重启未及执行自身消息同步，下一轮 `syncRuntimeMessagesToInfoRaw` 迟到补齐时把历史行盖上**当轮** traceId，对话区"两次提问复制出的 TraceId 相同"。根因是 traceId 在链路中途多处产生（AOP 兜底、端点、补齐路径），归属无约束。按"所有 traceId 从请求源头产生（前端请求、定时任务触发）"从源头治理。

**修改的方法**：
- 前端 `src/utils/trace.ts`（新增）— `newTraceId()` / `TRACE_ID_HEADER`；
- 前端 `src/api/index.ts` — `request()` 每次 HTTP 请求源头生成 `X-Trace-Id`（原始代码注释保留）；CDT fire-and-forget 内联 fetch 收敛为 `cdtFire` 并同样携带；
- 前端 `src/composables/useChatStream.ts` — SSE 请求同样携带源头 `X-Trace-Id`；
- `dev-server.ts` — `soReqTraceId(req)` 消费 `X-Trace-Id`（UUID 校验、非法兜底生成）用于 `POST /api/chat/stream`（原 `IdGenerator.generate()` 注释保留）；CORS Allow-Headers 增加 `X-Trace-Id`；定时任务每次触发在触发源头生成 traceId（`cronTrace`）传入任务 Metrics 与日志 meta（Info cleanup / Skill-Soul aging / MCP sync / MQ cleanup）；
- `Runtime/Runs` — `runtime_run` 新增 `trace_id` 列（含旧库迁移）；`startRun`/`insertQueuedRun` 受理即持久化源头 trace（`soRunTraceId`：`input.interact_id` → `metrics.trace_id` → `''`）；
- `ChatService.syncRuntimeMessagesToInfoRaw` — 行 trace 一律按原 run 反查 `runtime_run.trace_id`，兜底规则：当轮 run 用本轮 trace、历史 run 查不到显式 `''`，绝不盖当轮 trace（原始代码注释保留）；
- `InfoCoreService.saveInfo` — `trace_id` 显式传入（含 `''`）优先，未传回落 `metrics.trace_id`（原始代码注释保留）；`SaveInfoInput` 新增 `trace_id` 字段。

**影响的端点**：
- `POST /api/chat/stream` — connected/done 事件 trace 与前端请求头同源，两轮提问 trace 天然不同；
- `GET /api/chat/history/:session_id` — 历史行归因其所属 run 的受理源头 trace；进程重启期间的运行消息迟到补齐不再产生跨轮污染；
- 定时任务日志（`[cron]`/`[startup]`）— 携带触发级 trace_id，不再空 trace。

**可能存在的问题**：
- steer 合流进同一 run 的后续提问当前无消息级 trace（统一归因 run 受理源头 trace）；消息级归因需 steer 链路携带 trace，阶段4 扩展；
- 历史旧数据（本次事故中的既有行）trace 已被污染为错误值，数据层不做回改（新问答起全部正确）。

## [2026-09-14] AOP 兜底强化：Metrics 可检测但缺 trace_id 时立即生成回填（ctx.traceId 兜底盖章失败日志）

**变更原因**：traceId 源头治理收尾——兜底网点需收敛到 AOP 单点：调用方传入的 Metrics 一旦缺少 trace_id，必须在方法体执行前立即生成回填，保证任何经由切面的方法其 Metrics.trace_id 语义完备；同时覆盖旧式 3 参签名（无 Metrics 实例）失败日志此前无兜底 trace 的空档。

**修改的方法**：
- `Base/shared/aop/AopProxy.ts` — `wrapped` 内兜底收口：
  - 自动创建默认 Metrics 后再次校验：凡 `args[3]` 为 Metrics 实例（含调用方传入与后期修正为实例的调用），缺 `trace_id` 时立即生成并回填（`effectiveTraceId`，已有链路 trace 不覆盖）；`traceId` 同步写入 `InterceptContext.traceId`（不污染 Context/Input 业务对象）；
  - 原始"仅 instanceof 单一路径"分支已注释保留；
- `Base/shared/aop/Interceptor.ts` — `InterceptContext` 新增 `traceId?: string` 字段；
- `Base/LogProvider/interceptor/LogInterceptor.ts` — 旧式 3 参失败日志 trace 提取改为第三优先级：`metricsTraceId || inputTraceId || ctx.traceId`（原始代码注释保留）。

**影响的端点**：
- 全部经由 AopProxy 的服务方法 — Metrics 缺 trace_id 时方法体执行前必已回填；
- 旧式 3 参方法失败日志（`log_record` ERROR）— 无 Metrics 时亦携带 AOP 兜底 trace_id，监控页可按 trace 关联。

**可能存在的问题**：
- 兜底 trace 为 AOP 现场生成，与上游请求源头 trace 无传播关系（旧式链路本就无源头透传能力；新式 5 参链路均已显式传播源头 trace，此兜底仅保证可关联性，不伪造归属）。

## [2026-09-19] 上下文前置 + 新 Agent 组件化体现 + CoT/ReAct 选定与逐轮执行体现

**变更原因**：复盘 trace ccc6e0ee 的执行语义缺口：多层静态记忆召回晚于意图分析/Agent 构建（基本上下文未前置）；新建 Agent 的 LLM/Soul/Skill/MCP/Prompt 组件选择/生成仅有一处终态汇总；Agent 思维模型（CoT/ReAct）选择无结论无理由；逐轮的上下文依赖、本轮结果、是否继续执行不可见。

**修改的方法**：
  - `RunGatewayService.buildStaticMemorySystem(3参快照版)` — 注释保留，拆分为 `buildStaticMemory`（第一步召回 + `round=0` `context.built(base=true)`）与 `composeSystemWithMemory`（快照 system + 静态记忆一次性拼接，Loop 与意图分析消费同一份基本上下文）；`executeRun` 内记忆召回上移至匹配前；
  - `RunGatewayService.decideThoughtMode` — 新增 CoT/ReAct 确定性规则：绑定 Skill/MCP → ReAct（理由随事件下发），否则 CoT；上报 `thought.selected`（mode+reason），经 `ExecAgentLoopInput.thought_mode` 传入 Loop；
  - `AgentBuilderService.buildAgent`（原签名 `_metrics/_report` 改用透传）— 构建阶段逐组件上报：`llm.selected(stage=build)`、`skill.selected(source=build)`、`mcp.selected(stage=build)`、`soul.selected`（brief+reason，命中/未绑定区分）、`prompt.selected(stage=build, score≥75 采纳特定模板否则回退内置)`；
  - `AgentLoopService.runInnerTurn` — 注释保留原实现；每轮上报 `loop.turn.started`（round/thought_mode/final_turn/base_context）与 `loop.turn.result`（finish_reason/result_preview/tool_calls/next_action/decision_reason）；`context.built` payload 新增 `thought_mode`；
  - `Runtime/Loop/domain/types.ts` — `ExecAgentLoopInput.thought_mode` 新增字段；
  - `Base/shared/base/BusinessEvent.ts` — 新增事件 `soul.selected / thought.selected / loop.turn.started / loop.turn.result`；`TIMELINE_POINT_EVENTS` 补 `loop.turn.started`；
  - 前端同步（`sseEventTypes.ts` + `chatStreamEvents.ts`）— 4 个新事件登记 EVENT_UI_STYLE 与处理器（时间线/思考面板逐轮标注）；`Base/dist` 重建（运行时走 dist）。

**影响的端点**：
  - `POST /api/chat/stream` — 事件序变为：run.accepted → context.built(round=0 基础上下文) → 意图/Agent 构建（llm/skill/mcp/soul/prompt 逐件 selected）→ agent.components → thought.selected → run.started → 每轮（loop.turn.started → context.built(round N) → tool.* → loop.turn.result）→ 写作/评估 → run.finished；
  - 全量测试基线不变：新事件仅追加，不改焦点。

**可能存在的问题**：
  - CoT/ReAct 判定为无 LLM 的规则裁决（快照组件事实），复杂任务含隐式工具需求时仍选 CoT——默认预算内 Loop 允许通用原语工具兜底；
  - 评估异步（eval_async）时 evaluation.completed 可能晚于 run.finished（既有行为不变）。

## [2026-09-22] 新增：BrianAgent.html 宣传页移植为系统首页（/），对话页迁移至 /chat

**变更原因**：产品宣传页 BrianAgent.html 此前为独立单文件（含加群二维码：QQ 群 942758906 / 微信群），与前端分离。用户要求将其作为系统首页，且风格与现有前端保持一致。

**修改的方法**：
  - 前端新增 `views/HomeView.vue` — 宣传页整页移植：Hero、数据统计（滚动计数）、痛点对话、记忆地图（SVG 节点悬浮高亮 + 连线绘制动画）、涌现图/关键词图、需求确认与执行时间线（逐步点亮循环）、第二大脑、数据归属、终端打字动画、对比表、交流群二维码（QQ 群号可点击复制）。视觉全面对齐前端设计体系：apple-gray 色板 + brian-blue 强调色 + glass-panel/block-card 卡片，支持明暗主题与 prefers-reduced-motion；背景复用 NeuralBackground（替代原宣传页独立 canvas）。
  - 前端新增 composables：`useRevealOnScroll.ts`（v-reveal 渐显指令）、`useCountUp.ts`（数字滚动）、`useTypewriter.ts`（终端打字循环）、`useOnceVisible.ts`（进入视口触发一次）。
  - 前端新增 `src/env.d.ts`（vite/client 资源类型声明）与 `src/assets/home/`（从 BrianAgent.html 提取的 6 张图：hero-map / memory-pin / tag-graph / keyword-graph / qr-qq / qr-wechat）。
  - 前端 `router/index.ts` — 路由调整：`/` 由对话页改为首页（HomeView），对话页迁移至 `/chat`（原配置注释保留）。
  - 前端 `components/layout/Header.vue` — 导航新增「首页」项（Home 图标，路由 /），对话项路由改为 /chat。
  - 前端 `stores/i18n.ts` — 新增 `nav.home` 词条。
  - 文档：新增 `_07_首页页面/首页Page-PRD.md`；同步更新 整体页面-PRD.md 与 test/TR-整体页面-全局导航与框架.md 的导航项/默认页描述。

**影响的端点**：
  - 无后端接口变化。前端路由：`/` = 宣传首页（新），`/chat` = 对话（原 `/`），其余路由不变；顶部导航 Logo 与「首页」图标均回首页，宣传页内「立即体验 / 现在就试」进入 `/chat`。
  - 构建产物新增 HomeView chunk 与 6 张静态图片资源。

**验证**：eslint、vue-tsc --noEmit、vite build 全部通过；vitest e2e 109/114 通过——5 个失败（chat-page 发消息链路，HTTP 501）在未含本次改动的工作区基线上同样失败（已用 git stash 复测确认），属后端在改代码的既有问题，与本次无关。

**可能存在的问题**：
  - 宣传页文案当前为中文硬编码（与对话页等既有页面中文硬编码做法一致），未接入 i18n；后续若需英文版需补齐文案词条；
  - 首页图片资源约 1.6MB（PNG 截图为主），首屏懒加载已对二维码启用（loading=lazy），截图区随路由懒加载拆包，弱网首访可再考虑转 WebP；
  - e2e 中 chat 发送链路 5 个用例因后端在改代码（Chat 模块 501）失败，需后端改动完成后单独修复验证。
