# Agent Layer

## 1. 设计目标

1. **与上层编排框架分层解耦**：上层编排框架负责接收用户请求，根据编排策略将请求拆解为子任务或将简单任务直接提交给 Agent 执行框架。对于复杂任务调用 PlannerAgent 拆解为 DAG，上层编排框架将 DAG 中每个节点提交给 Agent 执行框架。Agent 层自主完成 LLM、Skill、MCP、Soul、策略的匹配，将任务 DAG 转换为 Agent DAG，由上层编排框架按依赖关系调用各 Agent 并将结果传递给下游 Agent。
2. **Agent 层自主决策**：接收到任务后，自主分析任务特征，自主决策绑定 LLM、配备 Skill、挂载 MCP、选择 Soul、选择执行策略，将每个任务节点转换为一个可执行的 Agent 实例。
3. **策略与执行解耦**：将"思考推理策略"（CoT、ReAct、Plan-and-Solve 等）与"具体执行动作"（Think、Act、Reflect、Answer）分离，使框架能够根据配置灵活切换策略而无需修改底层代码。
4. **原子能力复用**：将 Agent 执行过程抽象为 Think、Act、Reflect、Answer 四个原子接口，各接口独立开发、测试和部署。
5. **执行闭环自驱**：原子接口执行结果统一返回给执行调度器，由执行框架根据策略逻辑自行决定任务推进（顺序/循环/条件分支）。
6. **全链路可观测**：完整记录每次 Think、Act、Reflect、Answer 的输入输出、耗时及 Token 用量，支持执行过程追溯和性能分析。
7. **动态产生及优化 Agent**：根据每个任务特征自主产生适合的 Agent，完成后保存 Agent 以便复用，根据评估结果和使用频率优化和老化 Agent。

## 2. 模块划分

```
docs/_03_Agent/
├── AgentLayer-PRD.md          # 本文件：Agent 层总览
├── AgentLibrary/              # Agent 仓库：注册、复用、老化管理
│   └── AgentLibrary-PRD.md
├── AgentBuilder/              # Agent 构建：动态组装 Agent 实例
│   └── AgentBuilder-PRD.md
├── AgentExecution/            # Agent 执行：执行引擎与原子操作
│   └── AgentExecution-PRD.md
├── AgentStrategy/             # Agent 策略：推理策略模式
│   └── AgentStrategy-PRD.md
├── PlannerAgent/              # 规划 Agent：复杂任务拆解与 DAG
│   └── PlannerAgent-PRD.md
├── WriterAgent/               # 写作 Agent：信息汇总与人性化展示
│   └── WriterAgent-PRD.md
└── EvolutorAgent/             # 进化 Agent：评估、打分与模型优化
    └── EvolutorAgent-PRD.md
```

## 3. 模块职责矩阵

| 模块 | 职责 | 依赖的 Base Provider | 依赖的 Core 服务 |
|------|------|---------------------|------------------|
| AgentLibrary | Agent 元数据 CRUD、复用匹配、老化淘汰（仅管理 agent 表自身字段） | RelationDBProvider | - |
| AgentBuilder | 分析任务特征 → 调用 Core 层匹配组件 → 组装 Agent 并注册 | RelationDBProvider, LLMProvider, PromptsProvider | LLMCore, MCPCore, SkillCore, SoulCore |
| AgentExecution | 执行循环调度、原子操作分发、全链路记录 | RelationDBProvider, LLMProvider, MCPProvider, SkillProvider, SoulProvider | MQCore, InfoCore |
| AgentStrategy | 推理策略实现（CoT/ReAct/Plan-and-Solve） | - | - |
| PlannerAgent | 复杂任务识别、拆解为子任务、建立 DAG | LLMProvider, PromptsProvider | InfoCore |
| WriterAgent | 信息汇总、人性化输出、用户画像集成 | LLMProvider, PromptsProvider | InfoCore |
| EvolutorAgent | 响应评估打分、Agent 性能评估、优化建议 | LLMProvider, PromptsProvider, MQProvider | InfoCore |

> Agent 与 LLM/Skill/MCP/Soul 的 1-to-many 绑定关系（agent_llm、agent_skill、agent_mcp、agent_soul 表）由 Core 层统一管理，Agent 层不重复维护这些绑定表。Agent 层的 `agent` 表仅持有 1-to-1 的外键引用（llm_id、soul_id、strategy_id）。

## 4. Agent 数据模型

### 4.1. Agent 构成

一个 Agent 实例由以下 6 个要素组成：

| 要素 | 含义 | 存储位置 | 来源 |
|------|------|---------|------|
| strategy | 推理策略 | agent 表 strategy_id | AgentStrategy 模块选择 |
| llm_id | 绑定的 LLM | agent 表 llm_id + Core 层 agent_llm 表 | LLMCore.matchLLM |
| skill_ids | 绑定的 Skill 列表 | Core 层 agent_skill（库名: skill）表 | SkillCore.matchSkill |
| mcp_ids | 绑定的 MCP 列表 | Core 层 agent_mcp（库名: mcp）表 | MCPCore.matchMCP |
| soul_id | 绑定的 Soul | agent 表 soul_id + Core 层 agent_soul 表 | SoulCore.matchSoul |
| agent_type | Agent 类型 | agent 表 agent_type | WORKER / PLANNER / WRITER / EVOLUTOR |

> agent 表只存 1-to-1 的外键引用。1-to-many 绑定（Skill/MCP）完全由 Core 层表管理。

### 4.2. Agent 生命周期

```
创建(CREATED) → 就绪(READY) → 执行中(RUNNING) → 完成(COMPLETED)
                   ↓                               ↓
              老化(DISABLED)                  评估(EVALUATED) → 优化(OPTIMIZED)
```

1. **CREATED**：AgentBuilder 分析任务特征后新创建的 Agent，组件已绑定
2. **READY**：Agent 构建完成，等待执行
3. **RUNNING**：Agent 正在执行中
4. **COMPLETED**：Agent 执行完成
5. **EVALUATED**：EvolutorAgent 已完成对该 Agent 执行结果的评估
6. **OPTIMIZED**：根据评估结果优化了 Agent 的组件绑定
7. **DISABLED**：Agent 被老化，不再用于匹配复用

## 5. 依赖的对外接口（已被 Core 层实现）

Agent 层通过以下 Core 接口获取下层能力：

| Core 模块 | 调用的接口 |
|-----------|-----------|
| InfoCore | saveInfo, lastNInfo, graphNInfo, similarKInfo, keywordKInfo, relationKInfo, graphInfo, context |
| LLMCore | matchLLM, limitLLM, checkLLMQuota, configLLMCore |
| MCPCore | matchMCP, optimizeMCP, configMCPCore |
| SkillCore | matchSkill, optimizeSkill, ageSkill, configSkillCore |
| SoulCore | matchSoul, optimizeSoul, ageSoul, configSoulCore |
| MQCore | startWorker, stopWorker, getWorker |

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 7. 库名约定

Agent 层所有表统一使用 `agent` 库名（通过 RelationDBProvider 的库名参数指定）。
