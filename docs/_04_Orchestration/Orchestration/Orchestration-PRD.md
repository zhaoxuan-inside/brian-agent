# Orchestra

## 1. 设计目标

1. 将Agent的**编排（Orchestration）**和**执行（Execution）**解耦，使编排策略可独立演进，执行逻辑可复用；Agent的构建和执行由下层的Agent层进行完成；
2. 对不同Agent编排方式进行抽象，定义编排流程的核心工作项，并设计标准化接口；
3. 提供统一的外部请求接收入口，屏蔽内部编排复杂性，对外暴露简洁的调用方式；
4. 构建工作处理的上下文；
5. 一套基于JSONNode进行编排的编排框架，对Agent的编排要完成的动作进行原子化拆分，通过JSONNode的方式组合这些原子动作实现策略编排；

### 1.1. 编排方式（默认提供下面两种）

**Simple**：简单编排，直接将工作认为是单一执行的工作，调用 WorkAgent 完成任务，WriterAgent 进行结果人性化美化，EvolutorAgent 进行评估打分；

**Planning**：任务规划，调用 PlannerAgent 进行工作拆解，将拆解后的工作构成工作内容 DAG 图，根据工作 DAG 图构建 Agent DAG 图，然后从起点触发每一个 DAG 节点的执行，直到完成整个工作，WriterAgent 进行结果人性化美化，EvolutorAgent 进行评估打分；

### 1.2. 工作DAG与Agent DAG

**工作DAG（Work DAG）**：
- 由 PlannerAgent 对用户工作进行分解产生；
- 节点表示一个子工作（subtask），包含：任务描述、依赖关系、所需能力；
- 数据结构：`{ taskId, description, dependencies[], requiredCapabilities[], priority }`

**Agent DAG**：
- 根据工作 DAG 映射产生，每个工作节点对应一个或多个 Agent 节点；
- 节点表示一个 Agent 执行单元，包含：Agent ID、Agent 类型、绑定的子任务；
- 数据结构：`{ agentNodeId, agentId, agentType, taskId, inputs[], outputs[], status }`
- Agent 类型包括：planner（规划）、work（执行）、writer（汇总）、evolutor（评估）；

**DAG 执行引擎**：
- 拓扑排序：按依赖关系确定节点执行顺序；
- 并行执行：无依赖关系的节点可并行执行；
- 失败重试：节点执行失败时，根据策略配置进行重试或跳过；
- 检查点：支持执行状态的保存与恢复；

### 1.3. JSONNode 编排框架设计

JSONNode 编排框架是编排层的核心引擎，将 Agent 编排要完成的动作进行原子化拆分，通过 JSONNode 层级组合实现策略编排。编排框架负责解析 JSONNode 策略定义，按节点类型执行对应动作，管理节点间的串行/并行/条件依赖，驱动整个工作流完成。

#### 1.3.1. JSONNode 节点类型定义

| 节点类型 | 含义 | 执行逻辑 |
| :--- | :--- | :--- |
| `llm_select_strategy` | 通过 LLM 确定使用哪种编排策略 | 调用 PromptsProvider 生成 prompt，调用 LLMProvider 推理，返回 Simple / Planning |
| `build_context` | 构建工作处理的上下文 | 根据 msg_id 调用 InfoCore 加载历史对话、用户画像等上下文数据 |
| `planner_decompose` | 调用 PlannerAgent 分解工作 | 将工作内容提交给 PlannerAgent，获得工作 DAG |
| `dag_build_agent` | 将工作 DAG 映射为 Agent DAG | 遍历工作 DAG 节点，为每个子任务调用 MetaAgent 构建 WorkAgent |
| `dag_execute` | 执行 Agent DAG | 调用 GraphExecutor 按拓扑顺序执行 Agent DAG |
| `writer_summarize` | 结果汇总与人性化展示 | 调用 WriterAgent 汇总所有 Agent 输出 |
| `evolutor_evaluate` | 评估结果质量 | 调用 EvolutorAgent 对输入输出进行多维度评估打分 |
| `callback_notify` | 结果回调通知 | 通过回调机制将最终结果推送至 Application 层 |
| `info_save` | 保存交互信息 | 调用 InfoCore.saveInfo 将本轮交互的全部消息持久化 |
| `condition` | 条件分支节点 | 根据运行时变量（如 strategy 值）选择分支路径 |
| `parallel` | 并行执行节点 | 同时执行多个子节点（fanOut），等待全部完成后继续（barrier） |
| `sequence` | 顺序执行节点 | 按顺序依次执行子节点列表 |

#### 1.3.2. JSONNode 编排策略模板

**Simple 策略模板**：

```json
{
  "type": "sequence",
  "nodes": [
    { "type": "build_context" },
    { "type": "info_save", "role": "USER" },
    {
      "type": "sequence",
      "nodes": [
        { "type": "planner_decompose", "max_depth": 0 },
        { "type": "dag_build_agent" },
        { "type": "dag_execute" }
      ]
    },
    { "type": "writer_summarize" },
    { "type": "evolutor_evaluate" },
    { "type": "info_save", "role": "AGENT" },
    { "type": "callback_notify" }
  ]
}
```

**Planning 策略模板**：

```json
{
  "type": "sequence",
  "nodes": [
    { "type": "build_context" },
    { "type": "info_save", "role": "USER" },
    { "type": "planner_decompose", "max_depth": 3 },
    { "type": "dag_build_agent" },
    { "type": "dag_execute" },
    { "type": "writer_summarize" },
    { "type": "evolutor_evaluate" },
    { "type": "info_save", "role": "AGENT" },
    { "type": "callback_notify" }
  ]
}
```

#### 1.3.3. JSONNode 编排执行引擎

**执行逻辑**：编排引擎接收 JSONNode 策略定义（AST 树），自顶向下递归解释执行。

**递归执行算法**：

1. 读取当前节点的 `type`，根据类型分发到对应的执行器；
2. `sequence` 节点：按 `nodes` 数组顺序依次递归执行每个子节点；任一个子节点返回 false 则整个 sequence 返回 false；
3. `parallel` 节点：并发（Promise.all）执行 `nodes` 数组中的所有子节点；任一子节点失败不影响其他节点继续执行，最终按"全成功则成功"判定返回值；
4. `condition` 节点：根据 `condition_key` 在当前运行时上下文中取值，与 `branches` 中的 `match_value` 比对，命中后执行对应 branch 的子节点列表；
5. 原子动作节点（`build_context`、`planner_decompose` 等）：调用对应的 Agent 层接口执行，将结果写入运行时上下文供后续节点使用；
6. 执行过程中，上下文对象（`OrchestraContext`）在节点间传递，包含：`session_id`、`work_id`、`interact_id`、`msg_id`、`work_dag`（工作 DAG）、`agent_dag`（Agent DAG）、`final_result`、`evaluation_result` 等运行时数据；
7. 任一节点执行失败时，记录错误日志，通过 `callback_notify` 向 Application 层推送错误信息；已执行的 `info_save` 内容保留不撤回；

**运行时上下文（OrchestraContext）数据结构**：

| 字段名 | 含义 | 类型 | 备注 |
| :--- | :--- | :--- | :--- |
| session_id | 会话ID | UUID | |
| work_id | 工作ID | UUID | 编排层生成 |
| interact_id | 交互ID | UUID | |
| msg_id | 消息ID | UUID | |
| strategy | 编排策略名 | VARCHAR | Simple / Planning |
| work_dag | 工作DAG | WorkDAG | PlannerAgent 产出 |
| agent_dag | AgentDAG | AgentDAG | 由 work_dag 映射生成 |
| final_result | 最终结果 | TEXT | WriterAgent 产出 |
| evaluation | 评估结果 | EvaluationResult | EvolutorAgent 产出 |
| status | 执行状态 | VARCHAR | PENDING / RUNNING / SUCCESS / FAILED / TIMEOUT / CANCELLED |
| started_at | 开始时间 | timestamp | |
| finished_at | 结束时间 | timestamp | |
| errors | 错误信息列表 | Error[] | |

---

## 2. 功能设计

### 2.1. 搜索编排策略（searchOrchestra）

**功能**：搜索获取编排策略

**入参**：
- input：SearchOrchestraInput（继承 Input），包含以下字段：
  - keyword：搜索关键词
- context：Context（继承 Context），会话上下文
- output：SearchOrchestraOutput（继承 Output），承载返回内容：
  - strategies：搜索到的策略列表

**处理流程**：

1. 通过 RelationDBProvider 关键词搜索 `agent_orchestra_strategy` 表的 `strategy_title` 和 `strategy_brief`，搜索策略；

**返回**：Boolean，表示搜索是否完成；策略列表通过 output 参数返回

### 2.2. 更新编排配置（updateOrchestra）

**功能**：更新编排配置

**入参**：
- input：UpdateOrchestraInput（继承 Input），包含以下字段：
  - strategy_title：策略名（可选）
  - strategy_brief：策略简述（可选）
  - strategy：策略内容（JSONNode 格式，可选）
- context：Context（继承 Context），会话上下文
- output：Output（继承 Output），承载返回内容

**处理流程**：

1. 通过 RelationDBProvider 更新 `agent_orchestra_strategy` 表中的 `strategy_title`、`strategy_brief` 和 `strategy`；

**返回**：Boolean，表示更新是否完成

### 2.3. 工作提交（submitWork）

**功能**：接收具体的工作（异步任务）

**入参**：
- input：SubmitWorkInput（继承 Input），包含以下字段：
  - msg_id：消息ID（必选），用户输入的消息标识
  - strategy：编排策略（可选），指定使用 Simple 或 Planning 编排方式
- context：SubmitWorkContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SubmitWorkOutput（继承 Output），承载返回内容：
  - work_id：工作ID

**处理流程**：

1. 根据 `msg_id` 调用 InfoCore 的 `lastNInfo` 接口加载历史对话上下文（最近会话消息）；
2. 根据 `session_id` 调用 UserProfile 的 `getProfile` 接口获取用户画像数据（偏好、兴趣、标签等）；
3. 生成 `work_id`（UUID），初始化 `OrchestraContext` 运行时上下文对象；
4. 将 `work_id`、`session_id`、`interact_id`、`msg_id` 写入 `work_orchestra_assignment` 表（status = PENDING）；
5. 更新 `work_orchestra_assignment` 表 status 为 RUNNING，记录 started_at；
6. 加载编排策略：
   a. 如果入参 `strategy` 非空，调用 `searchOrchestra` 从 `agent_orchestra_strategy` 表加载对应名称的 JSONNode 策略定义；
   b. 如果入参 `strategy` 为空，从 `agent_orchestra_config` 表获取 `prompt_template_id` 和 `llm_id`，调用 PromptsProvider 生成 strategy 选择 prompt，调用 LLMProvider 推理得到推荐策略（Simple 或 Planning），再从 `agent_orchestra_strategy` 表加载对应 JSONNode 策略定义；
7. 将 JSONNode 策略定义、加载好的上下文数据、用户画像注入 `OrchestraContext`；
8. 调用 JSONNode 编排执行引擎，传入 `OrchestraContext` 和策略定义 AST 树，递归执行各节点；
9. 执行引擎内部流程：
   - `build_context`：将历史消息和用户画像组装为结构化上下文对象；
   - `info_save(USER)`：将用户原始消息保存至 InfoCore；
   - `planner_decompose`：以 Simple 模式（max_depth=0，不拆解）或 Planning 模式（max_depth=3，递归拆解）调用 PlannerAgent.planWork，产出工作 DAG；
   - `dag_build_agent`：遍历工作 DAG 的每个子任务节点，调用 MetaAgent.buildAgent 为每个子任务构建 WorkAgent，产出 Agent DAG；
   - `dag_execute`：将 Agent DAG 提交至 GraphExecutor.executeGraph，按拓扑排序并行执行各节点，收集所有节点的执行结果，监听各节点回调推送进度给上层；
   - `writer_summarize`：将 dag_execute 的所有节点结果传入 WriterAgent.writeResult，生成人性化的最终回复；
   - `evolutor_evaluate`：将用户原始输入和最终回复传入 EvolutorAgent.evaluateResult，获得多维度评估分数；
   - `info_save(AGENT)`：将 Agent 产出的全部消息（think 过程、tool call 结果、最终回复等）保存至 InfoCore；
   - `callback_notify`：通过回调机制将最终结果、评估分数推送至 Application 层（Chat 的 receiveCallback 接口），由 Chat 层通过 SSE 推送给前端；
10. 更新 `work_orchestra_assignment` 表：写入 `final_result`、`finished_at`、status 为 SUCCESS；
11. 若任一步骤抛出异常，更新 status 为 FAILED，记录错误信息至 `errors` 字段，通过 `callback_notify` 推送错误消息给上层；

**返回**：Boolean，表示工作提交是否完成；work_id 通过 output 参数返回

### 2.4. 取消工作（cancelWork）

**功能**：取消正在执行的工作

**入参**：
- input：CancelWorkInput（继承 Input），包含以下字段：
  - work_id：工作ID
- context：Context（继承 Context），会话上下文
- output：Output（继承 Output），承载返回内容

**处理流程**：

1. 根据 `work_id` 查询 `work_orchestra_assignment` 表，获取当前编排任务的状态；
2. 若状态为终态（SUCCESS / FAILED / TIMEOUT / CANCELLED），直接返回（幂等）；
3. 若状态为 PENDING（尚未开始执行），直接更新 status 为 CANCELLED，返回；
4. 若状态为 RUNNING：
   a. 向 JSONNode 编排执行引擎发送取消信号（设置 OrchestraContext 中的 abort_signal）；
   b. 编排引擎收到取消信号后：停止当前正在执行的步骤、对已提交至 GraphExecutor 的 Agent DAG 调用 GraphExecutor 的终止接口、等待所有并行子任务优雅退出；
   c. 对 Agent DAG 中状态为 RUNNING 的节点，调用 AgentLifecycle.cancelAgent 设置取消标志；
   d. 将已完成的中间结果保留在 work_orchestra_assignment 表，更新 status 为 CANCELLED，记录 finished_at；
5. 通过 `callback_notify` 将取消通知推送至 Application 层；

**返回**：Boolean，表示取消是否完成

### 2.5. 查询工作状态（getWorkStatus）

**功能**：查询工作执行状态

**入参**：
- input：GetWorkStatusInput（继承 Input），包含以下字段：
  - work_id：工作ID
- context：Context（继承 Context），会话上下文
- output：GetWorkStatusOutput（继承 Output），承载返回内容：
  - status：工作状态
  - progress：进度信息

**处理流程**：

1. 根据 `work_id` 查询当前编排任务的执行状态；
2. 返回工作状态（PENDING/RUNNING/SUCCESS/FAILED/TIMEOUT/CANCELLED）及进度信息；

**返回**：Boolean，表示查询是否完成；状态信息通过 output 参数返回

## 3. 表设计

### 3.1. Agent编排配置表

- 表名：`agent_orchestra_config`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | UUID | N | 外键 | 关联 llm_config 表 |
| prompt_template_id | prompt模板ID | UUID | N | 外键 | 关联 prompt_template 表 |

### 3.2. Agent编排策略配置表

- 表名：`agent_orchestra_strategy`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| strategy_title | 策略名 | VARCHAR | N | | |
| strategy_brief | 策略简述 | VARCHAR | N | | |
| strategy | 策略内容 | JSON | N | | JSONNode 格式，描述编排动作组合 |

### 3.3. 工作编排分配表

- 表名：`work_orchestra_assignment`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话ID | UUID | N | 普通索引 | 关联 session 表 |
| work_id | 工作ID | UUID | N | 唯一索引 | |
| interact_id | 交互ID | UUID | N | 普通索引 | |
| msg_id | 消息ID | UUID | N | 普通索引 | 关联消息表 |
| strategy | 编排策略 | VARCHAR | Y | | Simple / Planning |
| status | 执行状态 | VARCHAR | N | | PENDING / RUNNING / SUCCESS / FAILED / TIMEOUT / CANCELLED |
| started_at | 开始时间 | timestamp | Y | | |
| finished_at | 结束时间 | timestamp | Y | | |
| final_result | 最终结果 | TEXT | Y | | |

## 4. 重要内容

1. 根据框架直接生成 Simple 和 Planning 这两种编排的策略配置；
2. 编排层与 Agent 层通过标准接口通信，编排层不直接操作 Agent 内部状态；
3. 编排层通过回调机制向 Application 层通知工作进度和结果；
4. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
