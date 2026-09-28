# Brian-Agent 代码文档

> 全量静态分析自动生成：覆盖后端 5 层（Base / Core / Runtime / Agent / Application）、Server 入口、前端（Frontend）与共享包（Shared）。
> 文档以方法为粒度：每个方法标注类型（逻辑控制 / 数据处理 / 通用算法）、功能说明、签名与位置，并在 `method.idx.json` 建立全量索引。

- 方法总数：**2942**
- 类型分布：逻辑控制 1320 · 数据处理 1147 · 通用算法 475
- 存疑方法：空方法 0 · 桩代码 0 · 疑似死代码 0

## 层次目录

| 层 | 说明 | 模块数 | 方法数 |
|----|------|--------|--------|
| Base | 基础能力层：数据库、LLM、MCP、CDT、技能、日志等基础 Provider | 21 | [903](./Base/) |
| Core | 核心服务层：跨模块的核心 Provider（LLM/Skill/MCP/Info/Soul/MQ/CDT Core） | 9 | [402](./Core/) |
| Runtime | 运行时层：会话、运行、Agent 循环、技能运行时 | 7 | [309](./Runtime/) |
| Agent | Agent 层：各类 Agent 的构建、执行、进化与库管理 | 11 | [332](./Agent/) |
| Application | 应用层：Chat、Config、SelfLearning、UserProfile、Visualization | 6 | [480](./Application/) |
| Server | 服务入口：dev-server 路由与脚本 | 2 | [35](./Server/) |
| Frontend | 前端：Vue 3 组件、composables、stores、utils | 5 | [481](./Frontend/) |

## 模块索引

### Base

| 模块 | 方法数 | 文档 |
|------|--------|------|
| BookmarkProvider | 19 | [Base/BookmarkProvider.md](./Base/BookmarkProvider.md) |
| CDTProvider | 52 | [Base/CDTProvider.md](./Base/CDTProvider.md) |
| ChunkProvider | 12 | [Base/ChunkProvider.md](./Base/ChunkProvider.md) |
| components | 49 | [Base/components.md](./Base/components.md) |
| CronProvider | 25 | [Base/CronProvider.md](./Base/CronProvider.md) |
| FeedbackHandler | 28 | [Base/FeedbackHandler.md](./Base/FeedbackHandler.md) |
| GraphDBProvider | 45 | [Base/GraphDBProvider.md](./Base/GraphDBProvider.md) |
| LLMProvider | 122 | [Base/LLMProvider.md](./Base/LLMProvider.md) |
| LogProvider | 37 | [Base/LogProvider.md](./Base/LogProvider.md) |
| MCPProvider | 70 | [Base/MCPProvider.md](./Base/MCPProvider.md) |
| MQProvider | 28 | [Base/MQProvider.md](./Base/MQProvider.md) |
| PromptCatalog | 11 | [Base/PromptCatalog.md](./Base/PromptCatalog.md) |
| PromptsProvider | 32 | [Base/PromptsProvider.md](./Base/PromptsProvider.md) |
| RelationDBProvider | 53 | [Base/RelationDBProvider.md](./Base/RelationDBProvider.md) |
| shared | 55 | [Base/shared.md](./Base/shared.md) |
| SkillProvider | 41 | [Base/SkillProvider.md](./Base/SkillProvider.md) |
| SoulProvider | 29 | [Base/SoulProvider.md](./Base/SoulProvider.md) |
| StreamProvider | 24 | [Base/StreamProvider.md](./Base/StreamProvider.md) |
| test | 39 | [Base/test.md](./Base/test.md) |
| ToolProvider | 102 | [Base/ToolProvider.md](./Base/ToolProvider.md) |
| VectorDBProvider | 30 | [Base/VectorDBProvider.md](./Base/VectorDBProvider.md) |

### Core

| 模块 | 方法数 | 文档 |
|------|--------|------|
| CDTCoreProvider | 30 | [Core/CDTCoreProvider.md](./Core/CDTCoreProvider.md) |
| InfoCoreProvider | 176 | [Core/InfoCoreProvider.md](./Core/InfoCoreProvider.md) |
| LLMCoreProvider | 26 | [Core/LLMCoreProvider.md](./Core/LLMCoreProvider.md) |
| MCPCoreProvider | 25 | [Core/MCPCoreProvider.md](./Core/MCPCoreProvider.md) |
| MQCoreProvider | 8 | [Core/MQCoreProvider.md](./Core/MQCoreProvider.md) |
| shared | 34 | [Core/shared.md](./Core/shared.md) |
| SkillCoreProvider | 45 | [Core/SkillCoreProvider.md](./Core/SkillCoreProvider.md) |
| SoulCoreProvider | 35 | [Core/SoulCoreProvider.md](./Core/SoulCoreProvider.md) |
| test | 23 | [Core/test.md](./Core/test.md) |

### Runtime

| 模块 | 方法数 | 文档 |
|------|--------|------|
| Agents | 61 | [Runtime/Agents.md](./Runtime/Agents.md) |
| Loop | 48 | [Runtime/Loop.md](./Runtime/Loop.md) |
| Runs | 86 | [Runtime/Runs.md](./Runtime/Runs.md) |
| Session | 33 | [Runtime/Session.md](./Runtime/Session.md) |
| shared | 3 | [Runtime/shared.md](./Runtime/shared.md) |
| SkillRuntime | 68 | [Runtime/SkillRuntime.md](./Runtime/SkillRuntime.md) |
| test | 10 | [Runtime/test.md](./Runtime/test.md) |

### Agent

| 模块 | 方法数 | 文档 |
|------|--------|------|
| AgentBuilder | 50 | [Agent/AgentBuilder.md](./Agent/AgentBuilder.md) |
| AgentContext | 7 | [Agent/AgentContext.md](./Agent/AgentContext.md) |
| AgentExecution | 86 | [Agent/AgentExecution.md](./Agent/AgentExecution.md) |
| AgentLibrary | 42 | [Agent/AgentLibrary.md](./Agent/AgentLibrary.md) |
| AgentStrategy | 21 | [Agent/AgentStrategy.md](./Agent/AgentStrategy.md) |
| EvolutorAgent | 41 | [Agent/EvolutorAgent.md](./Agent/EvolutorAgent.md) |
| IntentAgent | 10 | [Agent/IntentAgent.md](./Agent/IntentAgent.md) |
| shared | 13 | [Agent/shared.md](./Agent/shared.md) |
| SummaryAgent | 10 | [Agent/SummaryAgent.md](./Agent/SummaryAgent.md) |
| test | 21 | [Agent/test.md](./Agent/test.md) |
| WriterAgent | 31 | [Agent/WriterAgent.md](./Agent/WriterAgent.md) |

### Application

| 模块 | 方法数 | 文档 |
|------|--------|------|
| Chat | 50 | [Application/Chat.md](./Application/Chat.md) |
| Config | 171 | [Application/Config.md](./Application/Config.md) |
| SelfLearning | 95 | [Application/SelfLearning.md](./Application/SelfLearning.md) |
| test | 53 | [Application/test.md](./Application/test.md) |
| UserProfile | 56 | [Application/UserProfile.md](./Application/UserProfile.md) |
| Visualization | 55 | [Application/Visualization.md](./Application/Visualization.md) |

### Server

| 模块 | 方法数 | 文档 |
|------|--------|------|
| dev-server | 28 | [Server/dev-server.md](./Server/dev-server.md) |
| scripts | 7 | [Server/scripts.md](./Server/scripts.md) |

### Frontend

| 模块 | 方法数 | 文档 |
|------|--------|------|
| api | 4 | [Frontend/api.md](./Frontend/api.md) |
| components | 159 | [Frontend/components.md](./Frontend/components.md) |
| composables | 19 | [Frontend/composables.md](./Frontend/composables.md) |
| utils | 45 | [Frontend/utils.md](./Frontend/utils.md) |
| views | 254 | [Frontend/views.md](./Frontend/views.md) |

## 死代码审计

空方法、桩代码与无调用方方法的完整核查清单见 [DeadCodeReport.md](./DeadCodeReport.md)（57 项，均经人工核实）。

## 方法类型说明

- **逻辑控制**：流程编排、条件路由、事件调度、层间委托转发。
- **数据处理**：数据库读写、文件 IO、网络请求、序列化/反序列化等数据操作。
- **通用算法**：纯计算逻辑（格式化、几何/数值计算、字符串处理），无外部 IO 与依赖调用。

## 方法状态说明（见 method.idx.json 的 status 字段）

- **normal**：正常方法。
- **empty**：空方法（方法体为空或仅有 return）。
- **stub**：桩代码（仅抛出未实现异常或占位返回）。
- **dead-suspect**：疑似死代码（全代码库静态引用次数 ≤ 1，即除定义处外无调用方；动态调用、字符串映射调用已纳入统计，仍建议人工复核）。

