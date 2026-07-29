# Orchestration Execution

## 1. 设计目标

1. 将 PlannerAgent 产出的 Task DAG 转换为 Agent DAG（每个 task 节点分配一个 Agent）；
2. 实现 DAG 依赖解析与拓扑排序执行引擎，确保上游 Agent 完成后下游才开始执行；
3. 管理 Agent 执行结果的传递——上游 Agent 的输出作为下游 Agent 的输入上下文；
4. 支持同步和异步（通过 MQ）两种 DAG 执行模式；
5. 提供任务执行追踪和进度查询能力；
6. 支持 DAG 执行中的失败处理（单任务失败、重试、DAG 重排）。

## 2. 功能设计

### 2.1. 构建 Agent DAG（buildAgentDAG）

**功能**：将 PlannerAgent 产出的 Task DAG 转换为 Agent DAG，为每个 task 构建或复用 WorkAgent
**入参**：
- input：BuildAgentDAGInput（继承 Input），包含以下字段：
  - plan_id：规划 ID
  - task_dag：任务 DAG（PlannerAgent.plan 的产出）
  - interact_id：交互 ID
  - force_new：强制为每个 task 新建 Agent（可选，默认 false）
- context：BuildAgentDAGContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：BuildAgentDAGOutput（继承 Output），承载返回内容：
  - agent_dag：Agent DAG，包含 agent_nodes 和 agent_edges
  - task_agent_map：task_id → agent_id 映射表

**Agent DAG 数据结构**：
```json
{
  "plan_id": "uuid",
  "total_agent_count": 3,
  "agent_nodes": [
    {
      "agent_id": "uuid",
      "task_id": "uuid",
      "task_content": "子任务1：查询用户数据",
      "task_complexity": 25,
      "task_domain": "data_query",
      "task_priority": 1,
      "status": "PENDING"
    },
    {
      "agent_id": "uuid",
      "task_id": "uuid",
      "task_content": "子任务2：分析用户数据并生成报告",
      "task_complexity": 60,
      "task_domain": "data_analysis",
      "task_priority": 2,
      "status": "PENDING"
    }
  ],
  "agent_edges": [
    { "from_agent_id": "agent_id_1", "to_agent_id": "agent_id_2", "data_dependency": "上游输出作为下游输入" }
  ]
}
```

**处理流程**：

1. **入口校验**
   a. 校验 `task_dag.nodes` 非空，若为空则返回空 agent_dag（total_agent_count=0）；
   b. 校验 `task_dag.edges` 中所有 from_task_id / to_task_id 均存在于 nodes 中；

2. **遍历构建 Agent**
   a. 初始化 `agent_nodes = []`、`task_agent_map = {}`；
   b. 遍历 task_dag.nodes 中的每个 task_node：
      - 调用 RelationDBProvider.insertDB 向 `orchestration_task_agent` 表插入映射记录 `{ plan_id, task_id: task_node.task_id, agent_id: "" }`（agent_id 暂为空，构建后更新）；
      - 调用 AgentBuilder.buildAgent，传入 `{ interact_id, task_content: task_node.task_content, task_complexity: task_node.task_complexity, task_domain: task_node.task_domain, force_new }`；
      - 获取 agent_id；
      - 调用 RelationDBProvider.updateDB 更新 `orchestration_task_agent` 表记录中的 agent_id；
      - 将 `{ agent_id, task_id: task_node.task_id, task_content: task_node.task_content, task_complexity: task_node.task_complexity, task_domain: task_node.task_domain, task_priority: task_node.priority, status: "PENDING" }` 加入 agent_nodes；
      - 记录映射 `task_agent_map[task_node.task_id] = agent_id`；
   c. 若任一 Agent 构建失败，将当前 task_node 的 status 标记为 "BUILD_FAILED"，记录错误原因，继续构建下一个（不中断整个 DAG 构建）；

3. **转换依赖关系**
   a. 初始化 `agent_edges = []`；
   b. 遍历 task_dag.edges 中的每条边：
      - 根据 task_agent_map 查找 from_task_id 和 to_task_id 对应的 from_agent_id、to_agent_id；
      - 若映射存在，生成 agent_edge：
        `{ from_agent_id, to_agent_id, data_dependency: "task_{from_task_id} → task_{to_task_id}" }`；
      - 将 agent_edge 加入 agent_edges；
   c. 对每条 agent_edge 调用 RelationDBProvider.insertDB 写入 `orchestration_agent_dag` 表 `{ plan_id, from_agent_id, to_agent_id }`；

4. **保存 Agent DAG**
   a. 将完整的 agent_dag JSON 调用 RelationDBProvider.insertDB 写入 `orchestration_agent_dag_record` 表：`{ plan_id, total_agent_count, agent_dag_json }`；
   b. 将 agent_dag 和 task_agent_map 写入 output 返回；

### 2.2. 执行单个 Agent（execSingleAgent）

**功能**：Simple 策略下执行单个 WorkAgent 的封装
**入参**：
- input：ExecSingleAgentInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - interact_id：交互 ID
  - agent_id：Agent ID
  - task_content：任务内容
  - work_context：工作上下文数据（可选，用于丰富 Agent 执行的上下文）
- context：ExecSingleAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ExecSingleAgentOutput（继承 Output），承载返回内容：
  - answer：Agent 的输出答案
  - trace_id：执行追踪 ID
  - iterations：迭代次数
  - elapsed_ms：耗时

**处理流程**：

1. 调用 RelationDBProvider.insertDB 向 `orchestration_agent_execution` 表写入执行记录（execution_type: SINGLE）；
2. 构造 AgentExecution 执行参数：将 work_context 拼接到 task_content 前端作为增强的任务内容（若 work_context 存在）；
3. 调用 AgentExecution.execAgent，传入 `{ agent_id, work_id, interact_id, task_content }`；
4. 获取 answer、iterations、trace_id；
5. 调用 RelationDBProvider.updateDB 更新 `orchestration_agent_execution` 表记录（status=COMPLETED，answer，iterations，trace_id）；
6. 调用 AgentLibrary.recordAgentUsage 记录本次使用；
 7. 调用 InfoCore.saveInfo 保存 Agent 本次执行的任务与结果：`{ session_id, work_id, interact_id, info_creator_id: agent_id, info_creator_role: "AGENT", info: "{ task_content } → { answer }" }`；
8. 将 answer、trace_id、iterations、elapsed_ms 写入 output 返回；

### 2.3. 执行 DAG（execDAG）

**功能**：按拓扑排序依次执行 Agent DAG 中的所有 Agent，管理依赖关系和数据传递
**入参**：
- input：ExecDAGInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - agent_dag：Agent DAG（含 agent_nodes 和 agent_edges）
  - work_context：工作上下文数据
  - max_concurrent：最大并发执行数（可选，默认 1——串行执行）
- context：ExecDAGContext（继承 Context），会话上下文（session_id, work_id 等）
- output：ExecDAGOutput（继承 Output），承载返回内容：
  - agent_results：所有 Agent 的执行结果列表（按拓扑顺序排列）
  - total_elapsed_ms：DAG 总执行耗时
  - failed_count：失败的 Agent 数量

**处理流程**：

1. **拓扑排序与依赖解析**
   a. 根据 agent_edges 构建邻接表：`{ from_agent_id → [to_agent_id] }` 和入度表 `{ agent_id → indegree }`；
   b. 对 agent_nodes 执行 Kahn 算法拓扑排序：
      - 初始化队列 `ready_queue = [所有 indegree == 0 的 agent_node]`；
      - 初始化结果列表 `results = []`；
      - 初始化 `agent_outputs = {}`（agent_id → output answer 缓存，用于传递给下游 Agent）；

2. **DAG 执行循环**
   a. 若 `max_concurrent > 1`（并发执行模式）：
       - 从 ready_queue 弹出最多 max_concurrent 个 Agent，并行调用 execSingleAgent 执行（execSingleAgent 内部通过 InfoCore.saveInfo 将每个节点的 task_content 和 answer 以 info_creator_role=AGENT 持久化）；
      - 每个 Agent 执行完成后：
        - 将其 output 存入 agent_outputs；
        - 遍历其下游邻接 Agent，将入度减 1；
        - 若下游 Agent 入度变为 0，将其加入 ready_queue；
   b. 若 `max_concurrent == 1`（串行执行模式，默认）：
      - 从 ready_queue 弹出 1 个 Agent；
      - **构建下游上下文**：对于当前 Agent，收集其所有上游 Agent 的输出（从 agent_outputs 聚合），将上游输出作为上下文拼接到当前 Agent 的 task_content 前端：
        ```
        增强的 task_content = "上游Agent完成的工作摘要：\n{上游输出1}\n{上游输出2}\n---\n当前任务：{原始 task_content}"
        ```
       - 调用 execSingleAgent 执行该 Agent，将 `task_content` 替换为增强后的内容；（execSingleAgent 内部通过 InfoCore.saveInfo 将每个节点的 task_content 和 answer 以 info_creator_role=AGENT 持久化）
      - 将其 output 存入 agent_outputs；
      - 遍历其下游邻接 Agent，将入度减 1；
      - 若下游 Agent 入度变为 0，将其加入 ready_queue；

3. **失败处理**
   a. 若任一 Agent 执行失败（execSingleAgent 返回 false 或 throw exception）：
      - 将该 Agent 的状态标记为 "EXEC_FAILED"；
      - 调用 OrchestrationStrategy.handleDAGFailure 处理失败；
      - 若 handleDAGFailure 返回 action="REPLAN" 和新 agent_dag：用新 agent_dag 替换当前 agent_dag，重新执行 execDAG（递归调用）；
      - 若 handleDAGFailure 返回 action="FAIL"：终止 DAG 执行，将 failed_count 和已完成的结果写入 output 返回；

4. **完成**
   a. 所有 Ready Queue 为空时 DAG 执行完成；
   b. 统计 total_elapsed_ms、failed_count；
   c. 将 agent_results（按拓扑顺序排列）、total_elapsed_ms、failed_count 写入 output 返回；

### 2.4. 异步执行 DAG（execDAGAsync）

**功能**：通过 MQ 异步执行 Agent DAG，立即返回 job_id
**入参**：
- input：ExecDAGAsyncInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - agent_dag：Agent DAG
  - work_context：工作上下文数据
  - callback_queue：结果回调队列名称（可选）
  - max_concurrent：最大并发数（可选，默认 1）
- context：ExecDAGAsyncContext（继承 Context），会话上下文（session_id, work_id 等）
- output：ExecDAGAsyncOutput（继承 Output），承载返回内容：
  - job_id：异步任务 ID

**处理流程**：

1. 生成 `job_id`（UUID）；
2. 调用 MQProvider.sendMQ 将执行任务 `{ job_id, work_id, agent_dag, work_context, max_concurrent, callback_queue }` 发送到 `orchestration.dag_execution` 队列；
3. 确保 `orchestration.dag_execution` 队列上有 Worker（调用 MQCore.startWorker 启动消费者，若已存在则复用）；
4. Worker 处理逻辑：从队列消费消息 → 调用 execDAG 同步执行 → 完成后将结果发送到 callback_queue（若指定）或写入 `orchestration_agent_dag_record` 表；
5. 返回 job_id 写入 output；

### 2.5. 查询 DAG 执行进度（getDAGProgress）

**功能**：查询一个 work 的 Agent DAG 执行进度
**入参**：
- input：GetDAGProgressInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - plan_id：规划 ID（可选，用于 Planning 策略）
- context：GetDAGProgressContext（继承 Context），会话上下文（session_id 等）
- output：GetDAGProgressOutput（继承 Output），承载返回内容：
  - progress：执行进度信息
    - work_id：工作 ID
    - plan_id：规划 ID
    - total_tasks：总任务数
    - completed_tasks：已完成任务数
    - running_tasks：正在执行的任务数
    - failed_tasks：失败的任务数
    - pending_tasks：等待执行的任务数
    - node_details：每个 Agent 的执行详情列表：
      - agent_id
      - task_content（摘要）
      - status：PENDING / RUNNING / COMPLETED / FAILED
      - answer：执行结果（仅 COMPLETED 状态有值）
      - trace_id：执行追踪 ID（仅 COMPLETED 状态有值）
      - elapsed_ms：单 Agent 耗时
    - total_elapsed_ms：DAG 执行总耗时

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 work_id 查询 `orchestration_work` 表获取 status、task_count、completed_task_count；
2. 调用 RelationDBProvider.selectDB 根据 work_id 查询 `orchestration_agent_execution` 表获取所有 Agent 执行记录；
3. 组装进度信息：
   a. total_tasks 从 orchestration_work.task_count 获取；
   b. completed_tasks 从 orchestration_work.completed_task_count 获取；
   c. 遍历执行记录，按 status 分类统计 running / failed / pending 数量；
4. 将进度信息写入 output 返回；

### 2.6. 取消 DAG 执行（cancelExecution）

**功能**：取消指定 work 下所有正在执行的 Agent DAG
**入参**：
- input：CancelExecutionInput（继承 Input），包含以下字段：
  - work_id：工作 ID
- context：CancelExecutionContext（继承 Context），会话上下文（session_id 等）
- output：CancelExecutionOutput（继承 Output），承载返回内容：
  - cancelled_count：取消的 Agent 数量

**处理流程**：

1. 调用 RelationDBProvider.selectDB 根据 work_id 查询 `orchestration_agent_execution` 表，筛选 status 为 "PENDING" 或 "RUNNING" 的执行记录；
2. 对每条记录，将其 status 置为 "CANCELLED"；
3. 若有正在执行的 Agent（status=RUNNING），中断执行机制：
   a. 若为异步执行模式：调用 MQCore.stopWorker 停止对应 Worker；
   b. 若为同步执行模式：通过抛出 CancelledError 中断 execSingleAgent 的执行循环（AgentExecution.execAgent 内部需支持中断信号）；
4. 更新 `orchestration_work` 表 status 为 "FAILED"，记录 cancel_reason；
5. 返回 cancelled_count 写入 output；

### 2.7. 获取队列执行状态（getExecQueueStatus）

**功能**：查看 `orchestration.dag_execution` 队列的异步执行状态
**入参**：
- input：GetOrchestrationExecQueueStatusInput（继承 Input）
- context：GetOrchestrationExecQueueStatusContext（继承 Context），会话上下文（session_id 等）
- output：GetOrchestrationExecQueueStatusOutput（继承 Output），承载返回内容：
  - queue_stats：队列统计（pending / processing / completed / failed 数量）
  - workers：正在运行的 Worker 列表

**处理流程**：

1. 调用 MQProvider.getQueueStats("orchestration.dag_execution") 获取队列统计；
2. 调用 MQCore.getWorker("orchestration.dag_execution") 获取 Worker 状态；
3. 将统计信息写入 output 返回；

### 2.8. 配置（configOrchestrationExecution）

**功能**：配置 Orchestration 执行引擎的参数
**入参**：
- input：ConfigOrchestrationExecutionInput（继承 Input），包含以下字段：
  - max_concurrent：默认最大并发执行数（可选，默认 1）
  - default_max_iterations：单 Agent 默认最大迭代次数（可选，默认 10，透传给 AgentExecution）
  - async_worker_interval：异步 DAG 执行 Worker 轮询间隔（可选，默认 1000ms）
  - dag_timeout_ms：DAG 执行总超时时间（可选，默认 300000 = 5 分钟，0 表示不限制）
- context：ConfigOrchestrationExecutionContext（继承 Context），会话上下文（session_id 等）
- output：ConfigOrchestrationExecutionOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `orchestration_config` 表获取当前配置；
2. 校验并更新非空入参（同上）；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. Task-Agent 映射表

- 表名：orchestration_task_agent
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| plan_id | 规划 ID | UUID | N | 普通索引 | |
| task_id | 任务 ID（来自 PlannerAgent.plan） | UUID | N | 普通索引 | |
| agent_id | Agent ID | UUID | N | 普通索引 | 构建完成后填充 |

### 3.2. Agent DAG 关系表

- 表名：orchestration_agent_dag
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| plan_id | 规划 ID | UUID | N | 普通索引 | |
| from_agent_id | 上游 Agent ID | UUID | N | 普通索引 | |
| to_agent_id | 下游 Agent ID | UUID | N | 普通索引 | |

注意：from_agent_id + to_agent_id 构成联合唯一索引防止重复边。

### 3.3. Agent DAG 快照记录表

- 表名：orchestration_agent_dag_record
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| plan_id | 规划 ID | UUID | N | 唯一索引 | |
| total_agent_count | Agent 总数 | INT | N | | |
| agent_dag_json | Agent DAG 完整 JSON | TEXT | N | | 含 nodes + edges 的序列化 |

### 3.4. Agent 执行记录表

- 表名：orchestration_agent_execution
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| work_id | 工作 ID | UUID | N | 普通索引 | |
| agent_id | Agent ID | UUID | N | 普通索引 | |
| plan_id | 规划 ID | UUID | Y | 普通索引 | Planning 模式下关联 |
| task_id | 任务 ID | UUID | Y | | 关联 PlannerAgent 的 task_id |
| execution_type | 执行类型 | VARCHAR | N | | SINGLE / DAG |
| task_content | 执行的任务内容 | TEXT | N | | |
| status | 执行状态 | VARCHAR | N | | PENDING / RUNNING / COMPLETED / FAILED / BUILD_FAILED / CANCELLED |
| answer | 执行结果 | TEXT | Y | | 仅在 COMPLETED 状态有值 |
| trace_id | 执行追踪 ID | UUID | Y | | 关联 AgentExecution.getTrace |
| iterations | 迭代次数 | INT | Y | | |
| elapsed_ms | 耗时（ms） | INT | Y | | |
| error_info | 错误信息 | TEXT | Y | | |

## 实现约定（与代码同步）

1. **拓扑排序**：使用 Kahn 算法，依赖 agent_edges 构建邻接表和入度表。
2. **上游输出传递**：下游 Agent 的 task_content 前缀拼接上游 Agent 的输出摘要（取上游 answer 的前 500 字作为上下文），避免 token 溢出。
3. **并发执行**：并发模式下，入度零的 Agent 可并行执行（通过 Promise.all），但需确保 AgentExecution 内部无共享状态冲突。
4. **中断机制**：AgentExecution.execAgent 需支持 `AbortSignal` 参数用于取消正在执行的任务；若当前 Agent 层实现不支持，则通过标记 status=CANCELLED + 忽略该 Agent 后续输出实现软中断。
5. **超时控制**：DAG 总执行时间超过 `dag_timeout_ms` 时，取消所有未完成的 Agent 节点，标记 work 为 FAILED。
6. **DB 操作**：所有 CRUD 经 RelationDBProvider，禁止直接操作。
7. **AOP**：所有方法经 AopProxy.wrap 生成代理。
