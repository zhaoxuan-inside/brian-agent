# Orchestration Strategy

## 1. 设计目标

1. 定义编排流程的核心工作项，设计标准化接口（动词+名词）；
2. 支持 Simple 和 Planning 两种内置编排策略，并提供策略可扩展能力；
3. 编排策略基于 JSONNode 框架声明式定义编排流程，使策略与执行解耦；
4. 对每种策略提供 Agent 结果汇总、后处理链（WriterAgent + EvolutorAgent）的统一调度；
5. 策略之间共享 WriterAgent 和 EvolutorAgent 的后处理步骤，避免重复代码。

## 2. 功能设计

### 2.1. 启动编排（startOrchestration）

**功能**：根据指定的编排策略，启动完整的编排流程
**入参**：
- input：StartOrchestrationInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - interact_id：交互 ID
  - session_id：会话 ID
  - user_query：用户输入内容
  - strategy：编排策略（SIMPLE / PLANNING）
  - work_context：工作上下文数据（由 OrchestrationEntry.buildWorkContext 产出）
- context：StartOrchestrationContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：StartOrchestrationOutput（继承 Output），承载返回内容：
  - final_response：最终回复内容

**处理流程**：

1. **策略分发**
   a. 若 `strategy` 为 "SIMPLE"，调用 `executeSimpleStrategy`（详见 2.2）；
   b. 若 `strategy` 为 "PLANNING"，调用 `executePlanningStrategy`（详见 2.3）；
   c. 策略内部负责完成 Agent 构建、执行、结果汇总和后处理的全流程；

2. **后处理链**（两种策略共享）
   a. 将 Agent 执行结果（所有 WorkAgent 的输出聚合）传入 `executePostProcessing`（详见 2.4）；
   b. executePostProcessing 依次调用 WriterAgent.write 生成最终回复，再异步触发 EvolutorAgent 评估；

3. 将 `final_response` 写入 output 返回；

### 2.2. Simple 策略执行（executeSimpleStrategy）

**功能**：Simple 策略——直接将用户输入作为单一任务，构建 WorkAgent 执行，然后后处理
**入参**：
- input：ExecuteSimpleStrategyInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - interact_id：交互 ID
  - session_id：会话 ID
  - user_query：用户输入内容
  - work_context：工作上下文数据
- context：ExecuteSimpleStrategyContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ExecuteSimpleStrategyOutput（继承 Output），承载返回内容：
  - agent_results：WorkAgent 执行结果列表（含单个元素）
  - plan_id：规划 ID（Simple 策略为空）

**处理流程**：

1. **构建 WorkAgent**
   a. 调用 AgentBuilder.buildAgent，传入 `{ interact_id, task_content: user_query }`，force_new=false（允许复用已有 Agent）；
   b. 将 agent_id 写入 `agent_id`；

2. **执行 Agent**
   a. 更新 `orchestration_work` 表 status 为 "EXECUTING"；
   b. 调用 OrchestrationExecution.execSingleAgent，传入 `{ work_id, interact_id, agent_id, user_query, work_context }`；
   c. OrchestrationExecution 内部调用 AgentExecution.execAgent 执行 Agent 并返回 answer、trace_id；

3. **组装结果**
   a. 将单个 AgentResult `{ agent_id, task_content: user_query, result: answer, trace_id }` 封装为 `agent_results` 列表；
   b. 将 agent_results 写入 output 返回（供后续后处理使用）；

### 2.3. Planning 策略执行（executePlanningStrategy）

**功能**：Planning 策略——调用 PlannerAgent 拆解任务 → 构建 Task DAG → 转换 Agent DAG → 执行 DAG
**入参**：
- input：ExecutePlanningStrategyInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - interact_id：交互 ID
  - session_id：会话 ID
  - user_query：用户输入内容
  - work_context：工作上下文数据
- context：ExecutePlanningStrategyContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ExecutePlanningStrategyOutput（继承 Output），承载返回内容：
  - agent_results：所有 WorkAgent 执行结果列表（按 DAG 拓扑排序）
  - plan_id：规划 ID

**处理流程**：

1. **任务拆解**
   a. 更新 `orchestration_work` 表 status 为 "PLANNING"；
   b. 调用 PlannerAgent.plan，传入 `{ work_id, interact_id, task_content: user_query }`；
   c. 获取 `plan_id` 和 `task_dag`（含 nodes 列表和 edges 列表）；
   d. 调用 RelationDBProvider.updateDB 更新 `orchestration_work` 表：`task_count = task_dag.nodes.length`，`status = "PLANNING"`；

2. **构建 Agent DAG**
   a. 调用 OrchestrationExecution.buildAgentDAG，传入 `{ plan_id, task_dag, interact_id }`；
   b. OrchestrationExecution 遍历 task_dag.nodes 中的每个子任务：
      - 调用 AgentBuilder.buildAgent 为每个子任务构建 WorkAgent；
      - 记录 agent_id → task_id 映射；
      - 将 task_dag.edges 中的依赖关系转换为 Agent 间的依赖关系（from_agent_id → to_agent_id）；
   c. 获取 `agent_dag`（含 agent_nodes 和 agent_edges）；

3. **执行 Agent DAG**
   a. 更新 `orchestration_work` 表 status 为 "EXECUTING"；
   b. 调用 OrchestrationExecution.execDAG，传入 `{ work_id, agent_dag, work_context }`；
   c. OrchestrationExecution 按拓扑排序依次执行每个 Agent，将上游 Agent 的输出传递给下游 Agent；
   d. 每次完成一个 Agent 节点，更新 `orchestration_work` 表 `completed_task_count += 1`；
   e. 监控执行进度：若任一 Agent 执行失败，调用 `handleDAGFailure`（详见 2.6）处理失败；

4. **收集结果**
   a. 收集所有 Agent 的执行结果列表 `agent_results`（每项含 agent_id、task_content、result、trace_id）；
   b. 将 agent_results 和 plan_id 写入 output 返回（供后续后处理使用）；

### 2.4. 后处理链（executePostProcessing）

**功能**：统一的 Agent 结果后处理链——WriterAgent 汇总 + EvolutorAgent 评估
**入参**：
- input：ExecutePostProcessingInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - interact_id：交互 ID
  - session_id：会话 ID
  - user_query：用户原始输入
  - agent_results：WorkAgent 执行结果列表
- context：ExecutePostProcessingContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ExecutePostProcessingOutput（继承 Output），承载返回内容：
  - final_response：WriterAgent 生成的最终回复
  - eval_id：评估 ID（WriterAgent 的评估）

**处理流程**：

1. **WriterAgent 写作**
   a. 更新 `orchestration_work` 表 status 为 "WRITING"；
   b. 调用 WriterAgent.write，传入 `{ work_id, interact_id, user_query, agent_results }`；
   c. 获取 `response`、`response_format`、`token_usage`；
   d. 将 `response` 作为 `final_response`；

2. **EvolutorAgent 评估 WriterAgent 回复（异步 fire-and-forget）**
   a. 更新 `orchestration_work` 表 status 为 "EVALUATING"；
   b. 调用 EvolutorAgent.evalWriterAgent，传入 `{ agent_id: WriterAgent_ID, work_id, interact_id, user_query, final_response: response, agent_results }`；
   c. 评估在后台异步执行，不阻塞主流程；

 3. **评估 WorkAgent（异步 fire-and-forget）**
   a. 遍历 agent_results 列表，对每个 WorkAgent 调用 EvolutorAgent.evalWorkAgent，传入 `{ agent_id, work_id, interact_id, task_content, agent_output: result, trace_id }`；
   b. 所有评估在后台异步执行，不阻塞主流程；

4. **启动后台定时评估（异步 fire-and-forget）**
   a. 调用 EvolutorAgent.startEvalSchedule，传入默认参数，确保后台评估 Worker 持续运行；
   b. 若已有评估 Worker 在运行（通过 MQCore.getWorker 检查），则复用不重复启动；
   c. 启动在后台异步执行，不阻塞主流程；

5. 将 `final_response` 和 `eval_id` 写入 output 返回；

### 2.5. 注册策略（addStrategy）

**功能**：注册一个新的编排策略（扩展 Simple/Planning 之外的策略）
**入参**：
- input：AddOrchestrationStrategyInput（继承 Input），包含以下字段：
  - strategy_label：策略标签（唯一标识）
  - strategy_description：策略描述
  - jsonnode_definition：策略的 JSONNode 编排定义（符合 JSONNode 框架规范）
  - enable：是否启用（默认 true）
- context：AddOrchestrationStrategyContext（继承 Context），会话上下文（session_id 等）
- output：AddOrchestrationStrategyOutput（继承 Output），承载返回内容：
  - strategy_id：新建的策略 ID

**处理流程**：

1. 校验 `strategy_label` 不能为空且不重复（调用 RelationDBProvider.selectOneDB 按 strategy_label 查 `orchestration_strategy` 表）；
 2. 校验 `jsonnode_definition` 为合法 JSON 且符合 JSONNode 框架规范（调用 JSONNode.validate）：
   a. 必须包含 `version`（"1.0"）、`start_node` 和 `nodes` 数组；
   b. 每个 node 必须指定 `node_id`（唯一）、`node_type`（合法的 JSONNode 类型）、`params`、`next`（跳转下一节点 ID 或 null）、`on_error`（错误跳转节点 ID）；
   c. 所有 node 中的 `next`、`on_error`、`true_next`、`false_next` 引用的 node_id 必须存在于 nodes 中；
   d. DAG 不能有环（从 start_node 出发 DFS 检测回边）；
3. 生成 `strategy_id`（UUID）；
4. 调用 RelationDBProvider.insertDB 写入 `orchestration_strategy` 表；
5. 返回 strategy_id 写入 output；

### 2.6. 失败处理（handleDAGFailure）

**功能**：Planning 策略下某子任务执行失败时，触发重新规划或直接标记 work 失败
**入参**：
- input：HandleDAGFailureInput（继承 Input），包含以下字段：
  - plan_id：原规划 ID
  - failed_task_id：失败的子任务 ID
  - failure_reason：失败原因
  - completed_task_ids：已完成的任务 ID 列表
  - work_id：工作 ID
  - interact_id：交互 ID
  - agent_dag：当前 Agent DAG
- context：HandleDAGFailureContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：HandleDAGFailureOutput（继承 Output），承载返回内容：
  - action：处理动作（REPLAN / FAIL）
  - new_agent_dag：重新规划后的 Agent DAG（若 REPLAN）
  - max_retry_reached：是否达到最大重试次数

**处理流程**：

1. 调用 RelationDBProvider.updateDB 更新 `orchestration_work` 表，记录 failed_task_id 和 failure_reason 到 metadata 字段；
2. 检查失败重试次数：从 metadata 中读取 `plan_retry_count`（默认 0），若 >= `max_plan_retries`（从 `orchestration_config` 表读取，默认 2）：
   a. 将 `orchestration_work` 表 status 置为 "FAILED"，error_message 记录 failure_reason；
   b. 返回 action="FAIL"、max_retry_reached=true；
3. 若未超过最大重试次数：
   a. 调用 PlannerAgent.replan，传入 `{ plan_id, failed_task_id, failure_reason, completed_task_ids }`；
   b. 获取新的 `new_plan_id` 和 `new_task_dag`；
   c. 调用 OrchestrationExecution.buildAgentDAG 基于 new_task_dag 重新构建 Agent DAG（仅包含未完成的任务）；
   d. 更新 `orchestration_work` 表 metadata 中 `plan_retry_count += 1`；
   e. 返回 action="REPLAN"、new_agent_dag；

### 2.7. 查看策略（soStrategy / getStrategy）

**功能**：查看已注册的编排策略
**入参**：
- input：SoOrchestrationStrategyInput（继承 Input），包含以下字段：
  - strategy_id：策略 ID（可选，传入则查单个）
  - strategy_label：策略标签（可选）
  - conditions：额外的 Condition 查询条件（可选）
  - page：分页参数（可选）
- context：SoOrchestrationStrategyContext（继承 Context），会话上下文（session_id 等）
- output：SoOrchestrationStrategyOutput（继承 Output），承载返回内容：
  - strategies：策略列表，每项含 { strategy_id, strategy_label, strategy_description, jsonnode_definition, enable, created, updated }

**处理流程**：

1. 若 `strategy_id` 非空：调用 RelationDBProvider.selectOneDB 查询 `orchestration_strategy` 表；
2. 否则：构建查询条件（strategy_label + conditions），调用 RelationDBProvider.selectDB 查询；
3. 返回策略列表写入 output；

### 2.8. 更新策略（updateStrategy）

**功能**：更新编排策略的配置或启用状态
**入参**：
- input：UpdateOrchestrationStrategyInput（继承 Input），包含以下字段：
  - strategy_id：策略 ID
  - strategy_label：策略标签（可选）
  - strategy_description：策略描述（可选）
  - jsonnode_definition：JSONNode 编排定义（可选）
  - enable：启用/禁用（可选）
- context：UpdateOrchestrationStrategyContext（继承 Context），会话上下文（session_id 等）
- output：UpdateOrchestrationStrategyOutput（继承 Output）

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 确认 strategy_id 对应的策略存在；
2. 校验更新字段的合法性（同 addStrategy 的校验规则）；
3. 调用 RelationDBProvider.updateDB 更新变更字段；
4. 返回 true；

### 2.9. 配置编排策略（configOrchestrationStrategy）

**功能**：配置策略模块的全局参数
**入参**：
- input：ConfigOrchestrationStrategyInput（继承 Input），包含以下字段：
  - default_strategy_id：默认编排策略 ID（可选）
  - max_plan_retries：Planning 策略最大重试次数（可选，默认 2）
  - plan_prompt_template_id：计划生成 prompt 模板 ID（可选）
- context：ConfigOrchestrationStrategyContext（继承 Context），会话上下文（session_id 等）
- output：ConfigOrchestrationStrategyOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `orchestration_config` 表获取当前配置；
2. 校验并更新非空字段：
   a. default_strategy_id：校验 `orchestration_strategy` 表中存在且 enable=true；
   b. max_plan_retries：校验为非负整数（0 表示不重试）；
   c. plan_prompt_template_id：校验 PromptsProvider.soPrompt 中存在；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. 编排策略表

- 表名：orchestration_strategy
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| strategy_id | 策略 ID | UUID | N | 唯一索引 | |
| strategy_label | 策略标签 | VARCHAR | N | 唯一索引 | SIMPLE / PLANNING 为内置标签 |
| strategy_description | 策略描述 | TEXT | N | | |
| jsonnode_definition | JSONNode 编排定义 | TEXT | N | | JSON 格式，符合 JSONNode 规范 |
| enable | 是否启用 | BOOL | N | | 默认 true |

### 3.2. 编排策略执行记录表

- 表名：orchestration_strategy_execution
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| execution_id | 执行 ID | UUID | N | 唯一索引 | |
| work_id | 工作 ID | UUID | N | 普通索引 | |
| strategy_id | 策略 ID | UUID | N | 普通索引 | |
| plan_id | 规划 ID | UUID | Y | | Planning 策略关联 PlannerAgent 的 plan_id |
| plan_retry_count | 重试次数 | INT | N | | 默认 0 |
| execution_status | 执行状态 | VARCHAR | N | | PENDING / RUNNING / COMPLETED / FAILED |
| error_info | 错误信息 | TEXT | Y | | JSON 格式 |

## 实现约定（与代码同步）

1. **Simple 和 Planning 内置策略**：以 strategy_label 为 "SIMPLE" 和 "PLANNING" 的 JSONNode 定义方式存在，系统初始化时写入 `orchestration_strategy` 表，enable 默认为 true。
2. **后处理链不可跳过**：任何编排策略完成后必须经过 WriterAgent.write 和 EvolutorAgent 评估（eval 异步执行）。
3. **Planning 重试**：DAG 执行失败时尝试 replan 重新规划；超过 max_plan_retries 则直接标记 FAILED。
4. **策略扩展**：通过 addStrategy 注册新策略，策略定义基于 JSONNode 框架，新策略的 node_type 需在 JSONNode 模块中注册。
5. **AOP**：所有方法经 AopProxy.wrap 生成代理。
