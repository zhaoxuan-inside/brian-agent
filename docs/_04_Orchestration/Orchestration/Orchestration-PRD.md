# Orchestra

## 1. 设计目标

1. 将Agent的**编排（Orchestration）**和**执行（Execution）**解耦，使编排策略可独立演进，执行逻辑可复用；Agent的构建和执行由下层的Agent层进行完成；
2. 对不同Agent编排方式进行抽象，定义编排流程的核心工作项，并设计标准化接口；
3. 提供统一的外部请求接收入口，屏蔽内部编排复杂性，对外暴露简洁的调用方式；
4. 构建工作处理的上下文；
5. 一套基于JSONNode进行编排的编排框架，对Agent的编排要完成的动作进行原子化拆分，通过JSONNode的方式组合这些原子动作实现策略编排；

### 1.1. 编排方式

Simple：简单编排，直接将工作认为是单一开执行的工作，调用WorkAgent完成任务，WriterAgent进行结果人性化美化，EvoluteAgent进行评估打分；
Planning：任务规划，调用PlannerAgent进行工作拆解，将拆解后的工作构成工作内容DAG图，根据工作DAG图构建AgentDAG图，然后从起点触发每一个DAG节点的执行，直到完成整个工作，WriterAgent进行结果人性化美化，EvoluteAgent进行评估打分；

## 2. 功能设计

### 2.1. 配置展示（soAgentOrchestra）

**功能**：搜索获取策略
**工作流程**：
通过RelationDBProvider关键词搜索agent_orchestra_config的strategy和strategy_brief，搜索策略；

### 2.1. 更新配置（updateAgentOrchestra）

**功能**：搜索获取策略
**工作流程**：
通过RelationDBProvider更新agent_orchestra_config的strategy和strategy_brief和Strategy；


### 2.1. 工作提交（submit）

**功能**：接收具体的工作（异步任务）
**入参**：
info_id（必选）
strategy（可选）
**工作流程**：
1. 根据info_id进行上下文的加载，准备工作完成的数据；
2. 如果strategy存在，通过RelationDBProvider从agent_orchestra_strategy表中加载策略并按照策略完成工作；
3. 如果strategy不存在，通过RelationDBProvider从agent_orchestra_config表中获取prompt_template_id和llm_id;
4. 从完成准备的数据中的当前消息以及prompt_template_id调用PromptsProvider生成prompt；
5. 根据llm_id和prompt调用LLMProvider，得到一个模型推荐的策略；
6. 根据策略完成工作；

## 3. 表设计

### 3.1. Agent编排配置表

- 表名：agent_orchestra_config
- 库名：agent_orchestra

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | UUID | N | | |
| prompt_template_id | prompt模板ID | UUID | N | | |

### 3.2. Agent编排策略配置表

- 表名：agent_orchestra_strategy
- 库名：agent_orchestra

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| strategy_title | 策略名 | VARCHAR | N | | |
| strategy_brief | 策略简述 | VARCHAR | N | | |
| strategy | 策略 | JSONNode | N | | |

## 4. 重要内容

1. 根据框架直接生成Simple和Planning这两种编排的策略配置；
