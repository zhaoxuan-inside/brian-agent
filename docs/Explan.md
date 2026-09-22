# docs 目录说明

> 全局文档索引见 [index.md](./index.md)（从需求关键词 → 文档 → 代码 的检索入口）。本文件只说明目录组织。

## 目录结构

### _0_DesignPrinciples

系统的整体设计思想目录。

- `AgentThink.md`：个人对 Agent 的思考，指导本系统设计的最底层思想。

### _01_TerminologyStandardization.md

统一术语表。**先登记后使用**：新概念（实体/状态/动作）必须先在此登记再写代码；术语变更须全局替换代码与文档标识。

### _1_DevStandards

开发规范目录。

- `DevStandards.md`：方法五参签名、AopProxy 切面、Metrics 日志网关、表设计、命名动词表等编码约定。
- `DDDStandards.md`：模块四层结构（access/application/domain/infrastructure）、方法长度约束、复用优先级、设计模式选择表、质量门。

### _2_FrontendDesign

前端设计文档目录。

- `FrontendTechStackChoice.md`：前端技术选型。
- `整体页面-PRD.md`：前端页面整体 UI 设计。
- `_00_内容块展示/` 至 `_07_首页页面/`：各页面 PRD（对话/配置/信息/学习/监控/工具/首页）。

### _3_BackendDesign

后端设计文档目录，按层组织，子目录与 `brian-backend/` 各层一一对应。

- `_00_BackendDesign.md`：后端分层总体设计。
- `_01_Base/`：Base 层各 Provider 的 PRD。
- `_02_Core/`：Core 层各模块的 PRD。
- `_03_Agent/`：Agent 层 PRD 与测试用例（Test/）。
- `_04_Orchestration/`：v1 编排（退役中，见 TODO-List Runtime v2 条目）。
- `_05_Application/`：Application 层 PRD 与测试用例。
- `_06_BlockStream/`：Block 事件流设计（后续演进方向）。
- `_07_Runtime/`：Runtime v2 编排内核 PRD（Session/Runs/Loop/Tools/Agents/Bus）。

### MethodIndex

`npm run docs:index` 自动生成的方法索引（TS AST 解析各层 access 公开方法），**请勿手工编辑**；改了 access 方法后重新生成。

## 根目录文档

- `CHANGELOG.md`：代码变更记录（按 dev 工作流步骤 14 格式，时间倒序）。
- `decisions.md`：决策记录（轻量 ADR，只记为什么）。
- `TODO-List.md`：待办队列（Runtime v2 收尾、方法长度拆分队列等）。
- `使用手册.md`：系统启动/关闭/日常管理（对应根目录 `brian` 命令行脚本）。
- `打包部署.md`：SEA 单文件可执行打包说明（对应 `packaging/` 目录）。
