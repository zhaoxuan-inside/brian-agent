# 决策记录

> 非显而易见的取舍记录：只记「为什么这么做」，不记流水账；能被 git 历史回答的问题不记。

## [2026-09-23] 依赖安全清零：vendored isolated-vm 摘除 prebuild 死链；vite/vitest 升最新稳定线

**决策**：① 移除 vendored isolated-vm（`Base/SkillProvider/infrastructure/sandbox/vendor/isolated-vm`）devDependencies 中的 `prebuild@^13.0.1`；② vitest 全 workspace 一次性升 ^5.0.1、frontend vite ^5→^8.3.0 + plugin-vue ^6.0.9、@types/node 全线 ^22，不做中间过渡版本（如 vitest 3.2.x 保守跳板）。
**原因**：① npm audit 剩余 4 条 moderate（request SSRF 链）全部来自 prebuild@13→node-ninja→request 死链；全仓 grep 无任何流程引用 prebuild CLI，prebuilt 二进制产出工作流为 `node-gyp rebuild` + `copy-prebuilt.js`（`brian-backend/prebuilt/<module>/<platform>/node<abi>/` 布局非 prebuild 产物格式），摘除零功能影响。② 中间跳板版本（vitest 3.x）仍落在漏洞范围（≤3.2.5），修一次到位；vitest 1.6→5 主要破坏点为异步断言强制 await 与 pool/配置类型收紧，实测仅 Base 两处测试断言未 await 需修，runner 行为兼容。
**备选**：prebuild 链换 `overrides` 强升（弃用——request/node-ninja API 无兼容新版本，覆盖终会点名 break）；vite 只升 6.4.3 保守过渡（弃用——属漏洞版线上边缘，二次迁移成本更高）。
**影响**：`npm audit` 25→0；构建/测试门禁验收标准不变（npm test / build:frontend / lint 同一套）；Runtime test 2 失败与 frontend chat e2e 5 失败为另会话进行中改动的既有失败，与本决策无关。

## [2026-09-22e] Config 模块消 any：按「实际参数位」诚实标注，不迁就变量名

**决策**：ConfigService/ConfigAccess 清零 149 处 any 时，writeXxxConfig 系列中名为 `output` 的局部变量实际处于被调方法第 3 参（Context 位），类型按实际参数位标注为对应 Context（变量名不改、实参顺序不动）；`limitLLM`/`configAgentStrategy` 历史传入的 `{config_key, value}` 与真实入参类型不符，用 `as unknown as`（或结构兼容单断言）+ 坑位警告注释标记，不重构运行时。
**原因**：消 any 的目的让类型如实描述运行时；按变量名「想当然」标注成 Output 会被迫换实参顺序（改变对象流向）或产生谎言类型。`limitLLM` 实测缺 `llm_provider_id` 会在运行时抛 ValidationError（`llm_core.quota_*` 路由现状），修复必须改上游入参构造，超出「仅类型注解」边界。
**备选**：把 output 变量改名为 ctx / 内联进调用点（弃用——超出类型注解改动边界）；直接修 limitLLM 入参构造（推迟——属行为修复，另行任务）。

## [2026-09-22c] 旧实现不再注释保留，统一依赖 git 历史承载

**决策**：重构/修改方法时不再按 dev 工作流步骤 7 将原实现注释保留在源码中；旧实现由 git 历史承载，源码只保留「修改后」的 why 注释。
**原因**：dev 工作流步骤 7 的「注释保留原方法」与 HS-Code-Skill §11 质量门禁「无注释死代码」及本项目 DDDStandards §6.2「无注释保留的旧实现」冲突；按 HS-Code-Skill 冲突裁决原则执行后者。实证：该机制累积 661+ 行死代码（94 处标记、最大单块 140 行），git 可随时回溯，注释保留零收益。
**备选**：维持注释保留（弃用——与两套标准门禁直接冲突，且污染检索链路）。
**影响**：`scripts/remove-dead-code.mjs` 增强「修改后」边界保护后清理存量 1902 行；后续修改方法直接覆盖旧实现，变更说明进 CHANGELOG。

## [2026-09-22d] 吞异常治理三分法：容忍保留、诊断可见、豁免显式

**决策**：业务层空/仅注释 catch（181 处）按三类处置：① 容忍行为保留（不新增 return false/throw，best-effort 降级语义本就是设计意图），catch 块内补 `metrics?.warn(方法名+容忍语义, {error, 业务键})` 可见诊断，私有 helper 沿调用链 ≤2 跳穿透可选 `metrics` 尾参；② 上下文明确的预期分支（DDL 幂等、协议格式容忍、日志自递归禁区）仅补判定条件注释，登记豁免；③ >2 跳或纯函数模块不强加 metrics（避免污染签名与纯函数设计），补注释说明。
**原因**：统一签名约定要求异常经 metrics 网关可见（DevStandards §7.1），但 329 处存量中过半是有意的容忍分支，全部改为 fail-fast 会破坏降级设计且改动面失控；「容忍 + 可见」是行为保持的最小修复。
**备选**：全部改为 metrics.error + return false（弃用——改变控制流，回归风险不可控）；维持静默（弃用——正是本次评审发现的 Critical 级问题）。
**影响**：约 95 处补诊断、约 50 处启用/穿透 metrics 参数（签名仅加可选尾参）、约 40 处 intent-documented；10 处 VisualizationService V1 死代码路径（enrichAgentDAG 等无存活调用方）保持原状，待后续清理。

## [2026-09-22] Writer 输出协议：Markdown 直出，弃用 JSON content blocks 中间协议

**决策**：写作 Agent 最终回复由「强制输出 JSON blocks 数组 → parseBlocks → join(content)」改为 LLM 直出 Markdown 正文。
**原因**：① 长 JSON 截断即整篇报废（trace 418a19a1 实证：612 output tokens 缺尾 `]`，parse 失败后残缺 JSON 原文被当回复投递）；② JSON 转义膨胀 ~30% token 加重截断概率；③ join 压平丢弃 heading 层级与 list_item 标记；④ 消费端（reply.delta → 前端 Markdown 渲染）原生吃 Markdown，中间协议与管线不匹配。
**备选**：保留 blocks 协议仅强化模板（弃用——协议内优化天花板低，LLM 输出长 JSON 天然不稳）；下游截断检测与修复（弃用——用户裁决：检测补救写不出合格输出，应在源头让 Writer 一次产出合格输出）。
**影响**：`parseBlocks()` 与 `WriteOutput.blocks` 接口保留（Markdown 回退为单一 text_paragraph 块）；BlockStream-PRD 的 Block 原生事件流仍为后续演进方向。

## [2026-09-22b] Writer 表达组件：专属 Soul + 表达协议进模板，Skill 不注入

**决策**：① 为 WRITER 新建专属 soul（首席编辑人格）并重绑，不动被 13 个 agent 共用的万金油 soul；② 「人类友好阐述协议」与 preferences 枚举语义写进 prompt 模板；③ Skill 组件不接入 Writer。
**原因**：① 共享 soul（编码研究助理）与编辑职责错位且改动会污染全部系统 agent；② 表达质量标准（读者视角/反机器腔/枚举语义）只有进模板才能被执行，配置枚举无语义等于没配；③ Writer 无工具链路，现有 skill 全为工具型，注入不生效也无意义——写作技巧内化进模板成本最低收益直接。
**备选**：给 `execWrite` 补 skill 加载注入逻辑（推迟——待出现真正的「写作风格/排版」类提示词型 skill 需求再建，遵循 YAGNI）。
**影响**：`buildSystemAgent` 对 WRITER 复用不重建，DB 绑定持久生效；若 WRITER agent 被删除重建会回退为 matchSoul 生成的通用 soul。

## [2026-09-22] curator v1 = background lane 评估调度，声明式定义重写暂缓

**决策**：阶段3 收尾的 curator 按「会话后维护工作上 background lane」最小语义落地：`scheduleCurator`（LaneSemaphore 并发 2）调度既有 Evolutor 评估链（evalWorkAgent 含评分/优化派发/低分解散），不做 runtime_agent_def 的直接重写。
**原因**：Evolutor 评估链已覆盖「评估/优化/解散」全闭环且经线上验证（Runtime-PRD §10「保留并复用」条款）；声明式 def（runtime_agent_def）与旧 agent 体系经 agent_ref 绑定，优化经旧体系生效后再考虑 def 快照重写，避免双写不一致。
**备选**：curator 独立 fork 会话 + LLM 审查 + def CRUD（推迟——runtime_agent_def 优化闭环尚未设计，先建会产生无消费方的写路径，违反 YAGNI）。
**影响**：Runs/infrastructure 新增 LaneSemaphore（lane 并发信号量）；eval_async=true 的评估从裸 fire-and-forget 改为 background lane 排队，前台 run 不再与维护工作竞争。

## [2026-09-22] 方法长度批次1 完成：9 个 >120 行方法拆分，AopProxy 继续单独排期

**决策**：批次1 的 9 个非横切方法（getCurrentValue/login/soTagGraph/listLLM/evalWriterAgent/generateProfile/soResource/soConfigDetail/deleteSession）全部拆至 ≤40 行编排 + 纯数据子方法，`120+` 由 11 降至 2；`AopProxy.wrap(166)/get(148)` 不在本批处理。
**原因**：① 拆分全部按「编排只做流程、子方法只做数据/IO」分层，每方法可独立测试；② AopProxy 是全库 46 个 Access 接入点的横切切面，动它需要全量回归接入点行为（日志/耗时/trace 盖章语义），收益/风险比低于批次2-4，故保持单独排期。
**备选**：顺带把 AopProxy 一起拆掉（弃用——一次改动只解决一个问题，横切回归面失控会污染本批 diff）。
**影响**：Application/Test 489 + Agent 118 + Runtime 53 + Base/Core 全量测试通过；`analyze:methods` 报告见 docs/MethodIndex/method-length-report.md。同批消灭配套遗留①（evalWriterAgent 与 resolveEvalContext 逐字重复）。

## [2026-09-22] 阶段5 退役再收敛：Orchestration 遗留接线清理，AgentExecution 退役前置三步排期

**决策**：阶段5 本轮只清理零风险残留（根 workspace 声明、@brian-agent/orchestration 依赖/tsconfig 路径/vitest alias、ORCHESTRATION 层配置种子），AgentExecution/PlannerAgent 本体不删。
**原因**：AgentExecution 仍被 Evolutor（soTrace/TraceCodec）、VisualizationService（soTrace/soPlan）、ConfigService（configAgentExecution 注册）活引用；其替代物「事件投影可视化」尚未建成。先删后建会直接破坏评估、可视化、配置页面三个线上功能。
**备选**：直接删除并同步改写三个消费方（弃用——等价于把「可视化事件投影重建」硬塞进退役批次，违反单一关注点）。
**影响**：Runtime-PRD §10 增加退役前置清单（Visualization 事件投影重建 → Evolutor trace 迁移 → ConfigService 收口 → 删除本体）；config.test.ts 两个 ORCHESTRATION 夹具用例改用 AGENT 层。

## [2026-09-22] 沙箱运行时契约：解释器为硬性部署前置，启动期 fail-fast，零降级

**决策**：LocalSandbox 的 python/bash 解释器改为 `SandboxRuntime.resolveSandboxRuntime` 在 SkillService 构造期按平台规范定位（POSIX python3/bash；win32 py -3→python、Git Bash 标准安装点→PATH，显式拒绝 WSL shim）并做版本校验，结果注入执行器；任一解释器缺失/版本不符 → SandboxRuntimeError → 后端拒绝启动。`BRIAN_SANDBOX_PYTHON`/`BRIAN_SANDBOX_BASH` 部署旋钮指定即唯一候选，不落回自动定位。
**原因**：用户裁决——产品部署三平台，危险命令必须且只能在沙箱完成；原实现硬编码 `python3`/`bash`（Windows 无 python3 命令名、bash 依赖 WSL/Git Bash）属隐式环境假设，而"运行时试错换一个凑合"的兜底会把降级静默带进生产。根源解法 = 把解释器声明为部署契约：启动期解析+校验+fail-fast，错误含平台精确修复指引。
**边界说明**：① 平台规范名/标准安装点候选是**定位唯一正确解释器**的查找顺序，与"降级兜底"的区别在于——全部落空即失败，绝不产生次级执行方式；② 拒绝 WSL shim 是正确性过滤（cwd/env 翻译语义与契约不兼容），非候选降级；③ isolated-vm 的"预编译缺失→源码编译"同样非降级（产物提供同等 V8 隔离能力）。
**附带修复**：LocalSandbox 超时判定原匹配 `err.code` 含 'TIMEOUT'（Windows 侧写法），POSIX 上超时文案从未产出；改按 Node 语义 `killed/signal` 判定。
**影响**：SkillService 构造失败即后端启动失败（fail-fast 契约）；Windows 部署前置 = Git for Windows（文档化，PRD §5）；新增 SandboxRuntime.ts + 9 个单测；Base 833 全绿。

## [2026-09-22] CDT 登录态种子：播种一次 + 源变更重播，而非每次启动全量快照

**决策**：配置 `profile_snapshot_source` 后，CDT 启动时仅在产品 profile 未播种或源路径变更时，复制本机 Chrome 的 Cookies（Network/Cookies 或旧版根路径）+ Local Storage/leveldb；`.cdt-profile-seeded` 标记记录已播源的绝对路径。
**原因**：产品自带 Remote Browser，用户会在产品浏览器内产生新登录态；若每次启动都从源全量覆盖（agent-browser 只读快照模式），产品侧登录会被静默回滚。"播种一次 + 源变更重播"同时满足「继承用户本机登录」与「产品内登录可持续」。
**备选**：每次启动复制只读快照（弃用——覆盖产品侧登录态）；复制完整 profile 目录（弃用——Preferences/Login Data 跨 Chrome 版本噪音大，且登录态 90% 场景由 Cookies+LocalStorage 承载，与 Playwright storage_state 范围对齐）。
**影响**：播种失败仅告警不阻塞 Chrome 启动；种子复制发生在 startCDT 的进程存活早退之后，不存在与运行中 Chrome 的文件锁竞争。

## [2026-09-22] 首页示意图连线独立为 utils/edgePath.ts，不复用 ChatMap 的 chatMapGeometry.ts

**决策**：HeroAppShot 与 HomeView 记忆地图的消息卡片连线由新增 `src/utils/edgePath.ts`（edgeAnchor/smoothEdgePath，任意尺寸矩形 + 任意边锚点）生成；不复用 `chatMapGeometry.ts` 的 verticalEdgePath/citationEdgePath。
**原因**：后者与 ChatMap 布局强耦合（NODE_W/NODE_H 常量、节点左上角定位约定、仅纵向/引用两类边），泛化它会触碰生产 ChatMap 及其测试，属顺手重构。
**备选**：继续手写坐标路径（弃用——卡片几何一变锚点即脱靶，且直线/折角生硬）。

## [2026-09-23] 委派结果不逐条回传父循环，采用"父 run 收敛后 join + 写作 Agent 唯一收口"

**决策**：delegate 子任务的结果不在父循环内逐条 push 回传，而是：子 run 落隔离子会话（`${sessionKey}::sub:${runId}`），父 run Loop 收敛后 join 全部子 run（超时 180s），子结果并入写作 Agent 的 agent_results 统一产出唯一最终回复；subagent run 不注入 delegate（委派链一级封顶）；子 run 不执行评估/写作。
**原因**：事故 trace 22f3ce79 —— 旧 fire-and-forget 委派下，父 run 收不到结果被迫重复委派、子代理继续递归委派成四级链；每个子 run 各自走评估+写作成为独立"小问答"；委派任务被持久化为 user 角色消息，一次问答在对话区"派生"出四次问答。写作收口（WriterAgent-PRD §1"汇总所有 Work Agent 结果"）与消息角色不变量（session 时间线 user 行只来自真实用户）都要求确定性收口而非异步注入。
**备选**：Tools-PRD 原"push 式回传经 steering 队列注入父循环"（弃用——子结果注入时机不确定会扰动父循环决策，且共享会话消息会互相污染各 run 上下文；若未来需要执行中吸收子结果，再以"子结果注入 steering + 独立组件范围消息"扩展）。
**影响**：主 run 结算时间延长至 join 完成（受 LLM 配额/网络影响时外层 waitRun 300s 兜底）；父子关系为内存登记，重启丢失后 join 空集语义自洽；subagent lane 串行执行（既有行为），join 超时下未完成子任务如实标注进写作。

## [2026-09-24] 组件判定 need 语义解耦：库存无货 ≠ 任务不需要；LLM 失败不落负缓存

**决策**：组件匹配瀑布的 need 判定只回答"任务是否需要外部能力/事实/执行"（由匹配模板承载、判定不受本地库存影响），库存匹配由 candidates/阈值单独表达；need=false 仅在 LLM 显式判定（confirmed）时写负缓存，解析失败/空数组兜底禁止写入并上报 parse_failed 终态；GitHub/市场层的检索关键词为空时以任务文本兜底。
**原因**：事故 trace 95b8e237 —— 模板契约与代码契约漂移叠加"保守 false 也落负缓存"双重缺陷，使四层瀑布的扩容层（GitHub 导入/自建）架构性死锁（skill 表升级后 0 新增），且统一"无强匹配即空绑定"文案掩盖真实走向。
**备选**：给 need 判定加代码侧启发式（关键字白名单）提判（弃用——不可维护且冒名判定）；全部走自建不加 GitHub 层（弃用——自建 LLM 生成质量需外部锚点）。

## [2026-09-24] 思维模型判据从"绑定组件数"升级为"工具面感知"

**决策**：CoT/ReAct 判定取消"仅以绑定 Skill/MCP 数"的单一判据，改为以 loop 组装后的实际工具清单为单一事实源：绑定 Skill/MCP 或工具面含可执行/可观察原语（exec / cdt_browser，已注入的 skill_exec/mcp_exec 同计入）→ ReAct；仅剩编排原语（update_plan/delegate/ask_user）且无绑定 → CoT。
**原因**：事故 trace 008ca7ae（"统计 GitHub 目录已克隆项目数"）——"代码仓库审计员"空绑定且携 exec，思考过程构造"纯知识类任务/CoT"（thought.selected reason 固定文案"无须 Skill"叠加），实际执行是 6 轮 exec 行动-观察——观察者视角"思考与执行不相符"。
**备选**：CoT 判据随 AgentPurpose 启发式（弃用——内容判断不可靠）；多次执行真实统计（弃用——多走 LLM）。
**影响**：thought.selected/loop.turn.started 事件与实际执行形态一致；测试 RuntimeGateway 16/16（含新一致判据用例）。

## [2026-09-24] Tool ⊕ Skill 合并为单一工具体系（MCP 独立保留）

**决策**：绑定的 Skill 以一等工具（skill_<id>）直接进入 wire 工具清单，与内置原语同表同权限语义（绑定即授权）；run 作用域注册（ToolService.runTools，Loop settle 清理）；skill_exec 间接 gate 从默认注入路径移除（工具本体保留兼容）。MCP 通道（mcp_exec + component_scope.mcps）独立运行不动。
**原因**：Tool/Skill 平行管线（匹配/绑定/注入/执行门/判据五条线）反复产生同族漂移缺陷（thought 判据漏原语、能力档案漏内置面、双注册事实源）；单一工具体系消除"两个定位重复的概念"（用户裁决）。
**备选**：维持双体系仅统一判据（弃用——判据修了管线漂移仍在）；Skill/MCP 一并合并（弃用——用户明确 MCP 独立）。
