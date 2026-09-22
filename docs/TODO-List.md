# 系统开发 TODO 列表

## 待实现功能

### 0. 方法长度拆分队列（2026-09-22 评审立项，`npm run analyze:methods 30` 生成）

> 背景：HS-Code-Skill 全量整改拆掉了 12 个 >120 行超长方法（最大 400 行），剩余 ~331 个 >30 行方法多为 31–80 行区间。按 DDDStandards §2「连贯性优先、不为拆而拆」分批消化，本表登记排队。

| 批次 | 范围 | 说明 |
|------|------|------|
| 已完成 | 24 个 >120 行中 11 个 + 4 个 SchemaInitializer | context/buildAgent/optimizeAgent/evalWorkAgent/execWrite/execAgent/soSession/executeRun/executeSingleLLM 已拆；SelfLearning/LLM/InfoCore/MCP 四个 init 数据驱动收敛 |
| 批次 1 | >120 行余量 11 个（AopProxy.wrap 166、ConfigService.getCurrentValue 164、CDTCoreService.login 157、soTagGraph 156、listLLM 152 等） | AopProxy 为横切基建，拆分需同步回归全部 46 个接入点，单独排期 |
| 批次 2 | 80–120 行 ~37 个 | 按层分组拆分 |
| 批次 3 | 50–80 行 ~96 个 | 拆分收益递减，结合触达时顺手拆（单一关注点，不顺手重构原则的例外按 decisions.md 登记） |
| 批次 4 | 31–50 行 ~187 个 | 仅在行为变更同文件触达时拆 |

**配套遗留**：① `evalWriterAgent` 前置段与 `resolveEvalContext` 逐字重复（EvolutorAgent-PRD 已登记）；② IntentAgent `info_content` 恒 undefined 拼入历史 prompt（any 治理发现，修复需上游结构对齐）；③ `writeLLMCoreQuotaConfig` 传参缺 `llm_provider_id` 运行时会抛 ValidationError（any 治理发现，decisions.md [2026-09-22e] 登记）；④ Base/Core 双路径并存——上层（AgentDefService/ChatService/ConfigService 等）同时持有 Base Access 具体类与 Core Access，违反外部资源接入唯一性的精神，收口需逐模块裁决 canonical 路径（单独排期）；⑤ 目录结构偏差 ~8 处（ChunkProvider/MQCoreProvider 等缺 infrastructure、ToolProvider 根目录散落 4 个工具文件），移动文件涉及跨模块 import 调整，批次 1 拆分时顺带处理。

### 1. Runtime v2 编排内核重构（弃用 workflow，2026-09-04 决策定稿）

| 项目 | 内容 |
|------|------|
| **所属模块** | Runtime（新增，替代 `_04_Orchestration` + `Agent/AgentExecution`） |
| **优先级** | P0 |
| **设计文档** | `docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md`（含 Session/Runs/Loop/Tools/Agents/Bus 6 子 PRD） |
| **需求来源** | OpenCode / Hermes / OpenClaw 2.0 编排与思考过程设计对照分析 |

**决策记录**（2026-09-04）：
- 不保留 DAG（DagScheduler/TaskDAG/AgentDAG 全部退役）；不引入 Effect-TS；新增依赖 zod；
- 前端事件协议重构为 v2 原生 Part 流（无旧事件名兼容层）；
- 新方法一律 5 参签名（Input/Output/Context/Metrics/Report）；所有方法 ≤40 行，逻辑控制与数据处理拆分。

**阶段任务**（详见 Runtime-PRD §9 迁移路线）：

| 阶段 | 任务 | 状态 |
|------|------|------|
| 0 地基 | `Runtime/` 骨架；Base/LLMProvider 增加 LLMEvent 流 + 原生 tool_calls + AbortSignal | ✅ 已完成（2026-09-04，见 CHANGELOG；zod 已就位） |
| 1 数据模型 | Session/Message/Part/RunState（6 表）；EventBus + SSE v2 投影 | ✅ 核心已完成（2026-09-04：Session 3 表 + runtime_event + durable 投影；runtime_run 表随阶段4 Runs 接入） |
| 2 单代理循环 | agentLoop + Tool 框架（skill/mcp/cdt）+ IterationBudget | ✅ 已完成（2026-09-04：Loop/Tools 模块落地；DIRECT 端到端验证；见 CHANGELOG） |
| 3 编排即工具 | update_plan + delegate + ask_user；steering/队列模式；Evolutor → curator | ✅ 核心已落地（2026-09-04：Runs 两段式 + Agents 确定性匹配/组件重解析 + Loop 真队列）；⬜ 编排工具三件套 + curator |
| 4 网关切换 | RunGateway 两段式接管 HTTP；前端 v2 协议切换 | ✅ 后端已上线（Chat v2 分流 + 过渡投影，`runtime.v2_enabled` 可回退）；⬜ 前端 v2 原生协议改造 |
| 5 退役 | Runtime-PRD §10 退役清单全部下线；可视化改为事件投影 | 待开发 |

**状态**：设计定稿，待开发

### 2. 配置变更历史记录与 Diff 对比

| 项目 | 内容 |
|------|------|
| **所属模块** | Config Application |
| **优先级** | P1 |
| **设计文档** | `docs/_3_BackendDesign/_05_Application/Config/Config-PRD.md` |
| **需求来源** | `docs/_2_FrontendDesign/_02_配置页面/配置Page-PRD.md` |

**前端需求**：
- `getConfigHistory` GET — 获取配置变更历史
- 配置项 L5 修改前 Diff 对比视图

**后端需实现**：
- 新增 `config_history` 表（config_key, old_value, new_value, change_time, operator）
- 每次 `updateConfig` 时记录变更历史
- `GET /api/config/history/:config_key` — 查询某配置项的变更历史
- `GET /api/config/history` — 查询全局变更历史（支持时间范围过滤）

**状态**：待开发
