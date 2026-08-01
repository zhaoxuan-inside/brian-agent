# Application Layer

## 1. 层级定位

Application 层是系统架构的最上层，负责面向用户的前端请求路由、会话交互和可视化数据封装。它不执行业务逻辑，而是将用户请求委托给下层（Orchestration → Agent → Core → Base）处理，并将处理结果封装为前端友好的格式返回。

### 层级依赖规则

```
Application  ──access──► Orchestration
Application  ──access──► Agent
Application  ──access──► Core
Application  ──access──► Base (仅 RelationDBProvider、LogProvider)
```

Application 层可依赖 Orchestration、Agent、Core、Base 层的能力，通过各层的 Access 接口访问。

## 2. 模块清单

| 模块 | 职责 | 对外端点前缀 |
|------|------|------------|
| **Chat** | 用户对话交互入口，SSE 流式推送，会话/消息管理 | `/api/chat` |
| **Config** | 系统全局配置的唯一对外入口，采用"注册+代理"模式统一管理所有可配置项 | `/api/config` |
| **SelfLearning** | 自主学习引擎，管理资料库和文档学习、对话学习、Tag 图维护 | `/api/learning` |
| **UserProfile** | 用户画像管理和展示，聚合多维度画像数据 | `/api/profile` |
| **Visualization** | 系统可视化数据的统一封装层，提供 Agent DAG、消息图、资源查询等可视化数据 | `/api/visualization` |

## 3. 模块间协作规则

### 3.1. 配置入口唯一性原则

**Config Application 是系统的唯一配置入口**。其他 Application 模块（Chat、UserProfile、SelfLearning、Visualization）仅对内保留 `config*` 方法供 Config Application 代理调用，不对外暴露 HTTP 配置端点。

| 规则 | 说明 |
|------|------|
| 配置注册 | 各模块（含本层及其他层）在初始化时向 Config Application 注册配置元数据 |
| 配置查询 | 前端通过 `GET /api/config/detail` 统一查询所有配置 |
| 配置修改 | 前端通过 `POST /api/config/update` 统一修改配置，Config Application 代理调用下层 |
| 禁止独立端点 | 其他模块不得暴露 `/api/*/config` 类 HTTP 端点 |

**违规示例**（以下端点不得存在）：
- `POST /api/chat/config` — 应由 `POST /api/config/update` (config_key=chat.*) 替代
- `POST /api/profile/config` — 应由 `POST /api/config/update` (config_key=user_profile.*) 替代
- `POST /api/learning/config` — 应由 `POST /api/config/update` (config_key=self_learning.*) 替代
- `POST /api/visualization/config` — 应由 `POST /api/config/update` (config_key=visualization.*) 替代

### 3.2. 可视化数据入口唯一性原则

**Visualization Application 是系统可视化数据的唯一封装层**。Chat Application 不直接透传 Visualization 数据，前端可视化需求统一通过 Visualization Application 接口获取。

| 可视化需求 | 唯一入口 |
|-----------|---------|
| Agent DAG 图（含完整资源内容） | `GET /api/visualization/work/:work_id/dag` |
| Work 执行时间线 | `GET /api/visualization/work/:work_id/timeline` |
| Agent 执行全链路 | `GET /api/visualization/agent/:agent_id/trace` |
| 消息引用关系图 | `GET /api/visualization/message-graph` |
| 消息列表（增强版） | `GET /api/visualization/messages` |
| 消息关联 DAG | `GET /api/visualization/message-dag` |
| 资源内容查询 | `GET /api/visualization/resource/:resource_type/:resource_id` |

Chat Application 仅保留消息历史基本查询（`GET /api/chat/history`）供 SSE 流式对话页面使用。

### 3.3. 外部资源访问规则

Application 层访问外部资源（LLM、Skill、MCP、Prompts）必须通过 Core 层，**禁止直接调用 Base 层 Provider**：

| 外部资源 | 正确路径 | 禁止路径 |
|---------|---------|---------|
| LLM 推理 | Application → LLMCore.execLLM → LLMProvider | Application → LLMProvider.execLLM |
| Prompt 渲染 | Application → Core 层对应模块 → PromptsProvider | Application → PromptsProvider.execPrompt |
| Skill 执行 | Application → Core 层对应模块 → SkillProvider | Application → SkillProvider.execSkill |
| MCP 调用 | Application → Core 层对应模块 → MCPProvider | Application → MCPProvider.execMcp |

**例外**：RelationDBProvider 和 LogProvider 为基础设施组件，Application 层可直接调用。

### 3.4. 模块间数据归属

| 数据域 | 归属模块 | 其他模块访问方式 |
|--------|---------|----------------|
| 用户偏好设置 | **WriterAgent**（Agent 层），UserProfile 聚合展示 | UserProfile → WriterAgent.getUserProfile / saveUserProfile |
| 画像生成调度 | **UserProfile** Application | SelfLearning 不维护独立的 USER_PROFILE 定时任务 |
| Session 管理 | **Chat** Application | 其他模块使用 session_id 引用 |
| 系统内置 Session | **SelfLearning** Application（`"self_learning"` session） | 初始化时自动创建，用于文档学习的工作上下文 |

## 4. 命名与接口规范

遵循 `_00_DevStandardization.md` 和 `_01_TerminologyStandardization.md`：

| 规范项 | 说明 |
|--------|------|
| 方法命名 | 动词+名词，如 `submitWork`、`createSession`、`getUserProfile` |
| 方法签名 | `Boolean method(Input input, Context context, Output output)` |
| AOP 代理 | 所有方法通过 `AopProxy.wrap` 生成代理对象 |
| 日志 | 通过 `LogProvider` 记录，禁止 `console.log` |
| ID 生成 | 通过 `IdGenerator.generate()` 生成 |
| 表设计 | 必须包含 id、created、updated 三个字段；外键 ID 字段格式为 `表B_id` |
| 外键默认值 | 无法确定的 ID 保持空字符串，由下层 Provider 解析默认值；禁止硬编码 `"default"` |

## 5. 模块依赖总览

| Application 模块 | Orchestration 依赖 | Agent 依赖 | Core 依赖 | Base 依赖 |
|-----------------|-------------------|-----------|----------|----------|
| **Chat** | OrchestrationEntry | WriterAgent, EvolutorAgent | InfoCore | RelationDBProvider, LogProvider |
| **Config** | OrchestrationEntry, OrchestrationStrategy, OrchestrationExecution, OrchestrationVisualization, JSONNode | WriterAgent, EvolutorAgent, AgentLibrary, AgentBuilder, AgentExecution, AgentStrategy, AgentContext | InfoCore, LLMCore, MCPCore, SkillCore, SoulCore | 全部 Provider |
| **SelfLearning** | OrchestrationEntry | EvolutorAgent, WriterAgent | InfoCore, MQCore, LLMCore | RelationDBProvider, LogProvider, MQProvider, GraphDBProvider |
| **UserProfile** | — | WriterAgent, EvolutorAgent | InfoCore, LLMCore | RelationDBProvider, LogProvider, PromptsProvider |
| **Visualization** | OrchestrationVisualization | AgentExecution, AgentLibrary, AgentContext, EvolutorAgent, PlannerAgent | InfoCore | RelationDBProvider, LogProvider, LLMProvider, SoulProvider, SkillProvider, MCPProvider, PromptsProvider, GraphDBProvider |

## 6. SSE 事件流约定

Chat Application 通过 SSE 推送 work 执行过程事件，事件源由 Orchestration 层统一聚合后回调：

| SSE 事件 | 数据来源 | 数据路径 |
|---------|---------|---------|
| `connected` | Chat 模块自身 | — |
| `loading` | OrchestrationEntry | receiveWork 回调 |
| `agent_created` | OrchestrationEntry | OrchestrationStrategy → OrchestrationExecution 回调 |
| `agent_status` | OrchestrationEntry | OrchestrationExecution 回调 |
| `agent_thinking` | OrchestrationEntry | AgentExecution.Think 回调 |
| `agent_output` | OrchestrationEntry | AgentExecution.Answer 回调 |
| `text` | OrchestrationEntry | WriterAgent.write 回调 |
| `done` | OrchestrationEntry | receiveWork 完成回调 |
| `error` | OrchestrationEntry | receiveWork 异常回调 |

`OrchestrationEntry` 作为事件聚合点，Chat 仅依赖 `OrchestrationEntry` 一个接口即可接收完整的 SSE 事件流，无需直接依赖 `OrchestrationExecution` 和 `AgentExecution`。

## 7. 已识别的需求空白

| 空白项 | 说明 |
|--------|------|
| Feedback Application | 前端需求提到反馈功能（评分/点赞/点踩），`docs/_05_Application/` 下暂无此模块的 PRD。需后续补充。 |

## 8. 子模块 PRD 索引

| 模块 | PRD 文件 |
|------|---------|
| Chat | [Chat-PRD.md](Chat/Chat-PRD.md) |
| Config | [Config-PRD.md](Config/Config-PRD.md) |
| SelfLearning | [SelfLearning-PRD.md](SelfLearning/SelfLearning-PRD.md) |
| UserProfile | [UserProfile-PRD.md](UserProfile/UserProfile-PRD.md) |
| Visualization | [Visualization-PRD.md](Visualization/Visualization-PRD.md) |
