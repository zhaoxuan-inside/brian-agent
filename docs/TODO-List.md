# 系统开发 TODO 列表

## 待实现功能

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
