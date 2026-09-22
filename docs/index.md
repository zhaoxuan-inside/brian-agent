# 文档总索引

> 全局入口：从需求关键词 → 文档 → 代码 三跳可达。方法级索引见 [MethodIndex/README.md](./MethodIndex/README.md)（`npm run docs:index` 自动生成，请勿手工编辑）。

## 分层与模块

| 层/模块 | 文档路径 | 核心职责 | 关键方法数 |
|---------|---------|---------|-----------|
| Base | docs/_3_BackendDesign/_01_Base/（各子目录 *-PRD.md） | 最底层能力：DB/图/向量/LLM/MCP/MQ/Prompt/Skill/Soul/Stream 等 Provider | 220 |
| Core | docs/_3_BackendDesign/_02_Core/ | 构建在 Base 上：InfoCore/LLMCore/MCPCore/MQCore/SkillCore/SoulCore/CDTCore | 75 |
| Runtime | docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md | v2 编排内核：Session/Runs/Loop/Tools/Agents/Bus | 35 |
| Agent | docs/_3_BackendDesign/_03_Agent/AgentLayer-PRD.md | 智能体：Builder/Context/Execution/Library/Strategy + Planner/Writer/Evolutor/Intent/Summary | 65 |
| Orchestration | docs/_3_BackendDesign/_04_Orchestration/ | 编排（v1，退役中，见 TODO-List Runtime v2 条目） | — |
| Application | docs/_3_BackendDesign/_05_Application/Application-PRD.md | 业务应用：Chat/Config/SelfLearning/UserProfile/Visualization | 111 |
| frontend | docs/_2_FrontendDesign/整体页面-PRD.md | Vue 3 前端（对话/配置/信息/学习/监控/工具/首页七页） | — |
| shared | shared/src/ | 前后端共享类型与 schema | — |
| packaging | packaging/README.md + docs/打包部署.md | SEA 单文件打包（三平台） | — |

## 横切文档

| 文档 | 路径 | 用途 |
|------|------|------|
| 方法索引（自动生成） | docs/MethodIndex/README.md | 各层 access 公开方法清单（506） |
| 术语表 | docs/_01_TerminologyStandardization.md | 先登记后使用；改名/新概念必读 |
| 开发规范 | docs/_1_DevStandards/DevStandards.md | 五参签名/AOP/Metrics 日志网关/命名动词表 |
| DDD 规范 | docs/_1_DevStandards/DDDStandards.md | 模块四层结构/方法长度/复用优先级/质量门 |
| 决策记录 | docs/decisions.md | 轻量 ADR：只记为什么 |
| 变更记录 | docs/CHANGELOG.md | 按时间倒序的代码变更记录 |
| TODO 队列 | docs/TODO-List.md | Runtime v2 收尾、方法长度拆分队列 |
| 设计思想 | docs/_0_DesignPrinciples/AgentThink.md | 系统最底层设计思想 |
| 使用手册 | docs/使用手册.md | 启动/关闭/日常管理（brian 命令） |
| 打包部署 | docs/打包部署.md | 单文件可执行打包 |

## 检索路径示例

- 「方法签名怎么写」→ DevStandards.md §3 → 各模块 access/ 
- 「为什么不用 DAG」→ TODO-List.md §1 决策记录 → Runtime-PRD.md
- 「Agent 怎么匹配任务」→ MethodIndex/Agent/AgentLibrary.md → docs/_3_BackendDesign/_03_Agent/AgentLibrary/AgentLibrary-PRD.md
- 「加新术语」→ _01_TerminologyStandardization.md 登记 → 全局替换 → docs:index
