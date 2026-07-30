# Orchestra

## 1. 设计目标

1. 将Agent的**编排（Orchestration）**和**执行（Execution）**解耦，使编排策略可独立演进，执行逻辑可复用；Agent的构建和执行由下层的Agent层进行完成；
2. 对不同Agent编排方式进行抽象，定义编排流程的核心工作项，并设计标准化接口（动词+名词，Input/Context/Output 三参数模式）；
3. 提供统一的外部请求接收入口，屏蔽内部编排复杂性，对外暴露简洁的调用方式；
4. 构建工作处理的上下文，为整个工作（work）提供会话、历史、关联信息的上下文数据；
5. 一套基于JSONNode进行编排的编排框架，对Agent的编排要完成的动作进行原子化拆分，通过JSONNode的方式组合这些原子动作实现策略编排；

### 1.1. 编排方式（默认提供下面两种）

**Simple**：简单编排，直接将工作认为是单一执行的工作，调用 WorkAgent 完成任务，WriterAgent 进行结果人性化美化，EvolutorAgent 进行评估打分；

**Planning**：任务规划，调用 PlannerAgent 进行工作拆解，将拆解后的工作构成工作内容 DAG 图，根据工作 DAG 图构建 Agent DAG 图，然后从起点触发每一个 DAG 节点的执行，直到完成整个工作，WriterAgent 进行结果人性化美化，EvolutorAgent 进行评估打分；

## 2. 模块划分

```
docs/_04_Orchestration/Orchestration/
├── Orchestration-PRD.md                    # 本文件：Orchestration 层总览
├── OrchestrationEntry/                     # 编排入口：请求接收与工作上下文
│   └── OrchestrationEntry-PRD.md
├── OrchestrationStrategy/                  # 编排策略：Simple / Planning 策略
│   └── OrchestrationStrategy-PRD.md
├── OrchestrationExecution/                 # 编排执行：DAG 管理与执行引擎
│   └── OrchestrationExecution-PRD.md
├── JSONNode/                               # JSON 编排框架：原子化编排节点
│   └── JSONNode-PRD.md
└── OrchestrationVisualization/             # 可视化：AgentDAG 结构与执行情况展示
    └── OrchestrationVisualization-PRD.md
```

## 3. 模块职责矩阵

| 模块 | 职责 | 依赖的 Agent 层 | 依赖的 Core 层 | 依赖的 Base Provider |
|------|------|----------------|---------------|---------------------|
| OrchestrationEntry | 接收外部请求、构建工作上下文（work_id、session_id）、选择编排策略、管理 work 生命周期 | - | InfoCore | RelationDBProvider, LogProvider |
| OrchestrationStrategy | 编排策略定义（Simple/Planning）、策略选择、编排流程调度 | PlannerAgent, WriterAgent, EvolutorAgent | - | RelationDBProvider, LogProvider |
| OrchestrationExecution | 任务 DAG → Agent DAG 转换、DAG 依赖解析与执行、Agent 结果传递与汇总 | AgentBuilder, AgentExecution, AgentLibrary | MQCore | RelationDBProvider, MQProvider, LogProvider |
| JSONNode | JSONNode 原子节点定义、节点组合规则、节点执行调度语义 | - | - | RelationDBProvider, LogProvider |
| OrchestrationVisualization | AgentDAG 结构与执行状态可视化、Work 完整流程时间线展示、Agent 详细执行链路展示 | AgentExecution, AgentLibrary, PlannerAgent | InfoCore | RelationDBProvider, LogProvider |

## 4. 编排框架整体流程

```
外部请求（Application 层）
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ OrchestrationEntry.receiveWork                      │
│ 1. 生成 work_id、interact_id                        │
│ 2. 调用 InfoCore.saveInfo 保存用户请求（REQUEST）     │
│ 3. 选择编排策略 → 调用 selectOrchestrationStrategy   │
│ 4. 调用 InfoCore.context 构建会话上下文               │
│ 5. 调用 Strategy.start 启动编排                      │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ OrchestrationStrategy (选择策略)                     │
│ ├─ SimpleStrategy:                                  │
│ │   1. 调用 AgentBuilder.buildAgent 创建 WorkAgent    │
│ │   2. 调用 OrchestrationExecution.execSingleAgent   │
│ │   3. 调用 WriterAgent.write 人性化结果              │
│ │   4. 调用 EvolutorAgent.evalWriterAgent 评估        │
│ │                                                    │
│ └─ PlanningStrategy:                                │
│     1. 调用 PlannerAgent.plan 拆解任务 → Task DAG    │
│     2. 遍历 Task DAG 每个节点，调用                  │
│        AgentBuilder.buildAgent 创建 WorkAgent        │
│     3. Task DAG → Agent DAG（任务节点→Agent映射）    │
│     4. 调用 OrchestrationExecution.execDAG 按依赖执行 │
│     5. 调用 WriterAgent.write 人性化结果              │
│     6. 调用 EvolutorAgent.evalWriterAgent 评估        │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ OrchestrationEntry.finishWork                       │
│ 1. 调用 InfoCore.saveInfo 保存最终回复（RESPONSE）   │
│ 2. 返回最终结果给 Application 层                     │
│ 3. 异步启动 EvolutorAgent.startEvalSchedule 评估     │
└─────────────────────────────────────────────────────┘
```

## 5. Orchestration 层数据模型

### 5.1. Work 状态机

```
CREATED → PROCESSING → PLANNING → EXECUTING → WRITING → EVALUATING → COMPLETED
                                        ↓
                                      FAILED
```

1. **CREATED**：工作刚刚创建，尚未开始处理
2. **PROCESSING**：工作正在被编排策略处理（Simple策略可能直接跳到 EXECUTING）
3. **PLANNING**：Planning策略下，PlannerAgent 正在拆解任务
4. **EXECUTING**：Agent DAG 中的 Agent 正在执行
5. **WRITING**：WriterAgent 正在汇总结果并人性化
6. **EVALUATING**：EvolutorAgent 正在评估最终回复
7. **COMPLETED**：工作完成
8. **FAILED**：工作执行失败

## 6. 依赖的下层接口

Orchestration 层通过以下下层接口获取能力：

| 下层模块 | 调用的接口 |
|---------|-----------|
| AgentBuilder | buildAgent, buildPlannerAgent, buildWriterAgent, buildEvolutorAgent |
| AgentExecution | execAgent, execAgentAsync, getTrace, getExecContext, getExecContextByAgent |
| AgentLibrary | getAgent, recordAgentUsage |
| PlannerAgent | plan, replan, getPlan |
| WriterAgent | write, getUserProfile |
| EvolutorAgent | evalWorkAgent, evalWriterAgent, startEvalSchedule, stopEvalSchedule |
| InfoCore | saveInfo, context, lastNInfo |
| MQCore | startWorker, stopWorker |
| RelationDBProvider | insertDB, selectDB, selectOneDB, updateDB |
| MQProvider | sendMQ |
| LogProvider | debug, info, warn, error |

## 7. 下层能力缺口说明

以下能力在 Orchestration 层实现，下层不具备：

| 能力 | 说明 | 实现位置 |
|------|------|---------|
| Work 生命周期管理 | 管理 work_id 从创建到完成的全生命周期；下层各模块以单个 Agent 执行为单位，无 work 级别生命周期管理 | OrchestrationEntry |
| 编排策略选择与调度 | 根据任务特征选择 Simple/Planning 策略，编排 Agent 的执行顺序和结果流转；下层 AgentBuilder 只负责构建单个 Agent，不涉及多 Agent 编排 | OrchestrationStrategy |
| Task DAG → Agent DAG 转换 | 将 PlannerAgent 产出的 task DAG 的每个 task 节点转换为 Agent DAG 中的 Agent 节点（调用 AgentBuilder），并建立 Agent 间依赖关系；下层没有自动化转换流程 | OrchestrationExecution |
| DAG 依赖解析与执行调度 | 按 DAG 依赖顺序执行 Agent，将上游 Agent 输出传递给下游 Agent 作为输入；下层 AgentExecution 只执行单个 Agent | OrchestrationExecution |
| Agent 结果汇总与后处理链 | 收集所有 WorkAgent 结果 → 调用 WriterAgent → 调用 EvolutorAgent 的完整链路；下层各 Agent 独立工作，无上层链式调度 | OrchestrationStrategy |
| JSONNode 编排框架 | 定义编排动作的原子节点（CreateAgent、ExecAgent、WriteResult、EvalResult 等）及其组合规则，策略以此声明式定义编排流程 | JSONNode |
| AgentDAG 结构与执行状态可视化 | 提供 AgentDAG 拓扑结构、节点执行状态、依赖关系的数据，以 ID 引用方式关联 task_id、trace_id、info_id、eval_id，具体内容由上层按 ID 自行获取；渲染由上层负责 | OrchestrationVisualization |

以下能力需要在 Agent 层补充实现：

| 能力 | 说明 | 解决方案 |
|------|------|---------|
| **无需补充** | 当前 Agent 层 PRD 已覆盖 Orchestration 层所需的所有接口 | 直接使用 |

以下能力需要在 Core 层补充实现：

| 能力 | 说明 | 解决方案 |
|------|------|---------|
| **无需补充** | 当前 Core 层 PRD 已覆盖 Orchestration 层所需的所有接口 | 直接使用 |

## 8. 分层解耦约定

1. **编排 ≠ 执行**：Orchestration 层不直接调用 LLMProvider.execLLM、SkillProvider.execSkill、MCPProvider.execMcp；这些调用全部通过 Agent 层（AgentExecution 的 Think/Act/Reflect/Answer）完成；
2. **Agent 自主决策**：Orchestration 层只指定"什么任务交给哪个 Agent"，不干涉 Agent 内部选择哪个 LLM、Skill、MCP、Soul；这些由 AgentBuilder + Core 层自主匹配；
3. **任务依赖 vs Agent 依赖**：Orchestration 层管理 task 间的 DAG 依赖（来自 PlannerAgent），并将 task DAG 转换为 Agent DAG；Agent 层不了解其他 Agent 的存在，只执行分配给自己的 task；
4. **上下文传递**：Orchestration 层负责将上游 Agent 的输出作为下游 Agent 的 task_content 的一部分传递，不修改 Agent 执行逻辑；
5. **AOP 代理**：所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；
6. **误差处理**：任何下层调用异常均由 Orchestration 层捕获、记录日志，并根据策略决定是否重试或标记 FAILED；

## 9. 库名约定

Orchestration 层所有表统一使用 `orchestration` 库名（通过 RelationDBProvider 的库名参数指定）。

## 10. 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；
