# OrchestrationExecution 测试用例

## 测试约定

- 所有方法通过 AOP 代理（AopProxy.wrap）生成代理对象，默认记录日志和耗时
- 方法签名：`Boolean methodName(Input input, Context context, Output output)`
- 拓扑排序使用 Kahn 算法
- 上游 Agent 输出取前 500 字作为下游 Agent 输入上下文
- 所有 DB 操作通过 RelationDBProvider

---

## 1. buildAgentDAG — 构建 Agent DAG

### 1.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-BAD-001 | 正常构建 Agent DAG（3 个 task） | `task_dag` 含 3 个 nodes 和 2 条 edges，`AgentBuilder.buildAgent` 为每个 task 返回 agent_id | `plan_id`, `task_dag`, `interact_id` 有效 | `output.agent_dag` 包含 3 个 `agent_nodes` 和 2 条 `agent_edges`，`output.task_agent_map` 包含 3 个映射，返回 true |
| TC-BAD-002 | 单个 task 构建 | `task_dag` 含 1 个 node，0 条 edges | `plan_id`, `task_dag` 有效 | `output.agent_dag.total_agent_count=1`，`agent_nodes` 长度为 1，`agent_edges` 为空数组，返回 true |
| TC-BAD-003 | agent_dag 节点包含完整字段 | 正常构建 | 完整参数 | 每个 agent_node 包含 `agent_id`、`task_id`、`task_content`、`task_complexity`、`task_domain`、`task_priority`、`status="PENDING"` |
| TC-BAD-004 | 依赖关系正确转换 | `task_dag` 中 task1→task2 | 完整参数 | `agent_edges` 包含 `{ from_agent_id: task1 对应的 agent_id, to_agent_id: task2 对应的 agent_id }` |
| TC-BAD-005 | force_new=true 强制新建 Agent | `force_new=true` | `plan_id`, `task_dag`, `interact_id`, `force_new=true` | `AgentBuilder.buildAgent` 被调用时 `force_new=true` |
| TC-BAD-006 | orchestration_task_agent 表写入映射记录 | 正常构建 | 完整参数 | 每个 task 在 `orchestration_task_agent` 表中有一条记录，`agent_id` 已填充 |
| TC-BAD-007 | orchestration_agent_dag 表写入依赖边 | task_dag 有 2 条 edges | 完整参数 | `orchestration_agent_dag` 表写入 2 条记录 |
| TC-BAD-008 | orchestration_agent_dag_record 表写入快照 | 正常构建 | 完整参数 | `orchestration_agent_dag_record` 表写入一条记录，含 `plan_id`、`total_agent_count`、`agent_dag_json` |

### 1.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-BAD-009 | task_dag.nodes 为空 | `task_dag.nodes=[]` | `plan_id`, `task_dag` 有效 | `output.agent_dag.total_agent_count=0`，`agent_nodes=[]`，`agent_edges=[]`，返回 true |
| TC-BAD-010 | task_dag 中 edge 引用不存在的 node | `task_dag.edges` 中 `from_task_id` 或 `to_task_id` 不在 nodes 中 | `plan_id`, `task_dag` 有效 | 返回 false 或跳过非法边 |
| TC-BAD-011 | 某 Agent 构建失败 | `AgentBuilder.buildAgent` 对某个 task 返回 false | 完整参数 | 该 task 的 agent_node status="BUILD_FAILED"，记录错误原因，继续构建下一个，不中断整个 DAG 构建 |
| TC-BAD-012 | 所有 Agent 构建失败 | `AgentBuilder.buildAgent` 对所有 task 返回 false | 完整参数 | 所有 agent_node status="BUILD_FAILED"，`agent_edges` 可能为空 |
| TC-BAD-013 | task_dag 中有大量节点（100 个） | `task_dag.nodes` 包含 100 个 task | 完整参数 | 成功构建 100 个 agent_node，`total_agent_count=100` |
| TC-BAD-014 | task_dag 中节点无 task_complexity 字段 | task_node 缺少可选字段 | 完整参数 | 对应 agent_node 的 task_complexity 为默认值或空 |

---

## 2. execSingleAgent — 执行单个 Agent

### 2.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-ESA-001 | 正常执行单个 Agent | `AgentExecution.execAgent` 返回 `answer`、`iterations`、`trace_id` | `work_id`、`interact_id`、`agent_id`、`task_content` 有效 | `output.answer` 非空，`output.trace_id` 非空，`output.iterations` 非负，`output.elapsed_ms` 非负，返回 true |
| TC-ESA-002 | 传入 work_context 拼接到 task_content | `work_context` 非空 | `task_content="当前任务"`, `work_context={...}` | `AgentExecution.execAgent` 的 `task_content` 参数以 work_context 为前缀 |
| TC-ESA-003 | 不传 work_context | `work_context` 为空 | `task_content="当前任务"`, `work_context` 不传 | `AgentExecution.execAgent` 的 `task_content` 参数为原始值 |
| TC-ESA-004 | 执行记录写入 orchestration_agent_execution 表 | 正常执行 | 完整参数 | `orchestration_agent_execution` 表写入一条 `execution_type="SINGLE"` 的记录 |
| TC-ESA-005 | 执行完成后记录更新 | 正常执行 | 完整参数 | `orchestration_agent_execution` 表记录 `status="COMPLETED"`，`answer`、`iterations`、`trace_id` 已填充 |
| TC-ESA-006 | AgentLibrary.recordAgentUsage 被调用 | 正常执行 | 完整参数 | `AgentLibrary.recordAgentUsage` 被调用 |
| TC-ESA-007 | InfoCore.saveInfo 保存 Agent 执行结果 | 正常执行 | 完整参数 | `InfoCore.saveInfo` 被调用，`info_creator_id=agent_id`，`info_creator_role="AGENT"`，`info` 包含 task_content 和 answer |

### 2.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-ESA-008 | AgentExecution.execAgent 执行失败 | `AgentExecution.execAgent` 返回 false | 完整参数 | 返回 false，`orchestration_agent_execution` 表 status="FAILED" |
| TC-ESA-009 | AgentExecution.execAgent 抛出异常 | `AgentExecution.execAgent` 模拟抛出异常 | 完整参数 | 返回 false，异常被捕获并记录 |
| TC-ESA-010 | agent_id 不存在 | `AgentLibrary` 中无该 agent_id | `agent_id="nonexistent"` | 返回 false |
| TC-ESA-011 | task_content 为空 | 正常 Agent 存在 | `task_content=""` | 返回 false 或 `AgentExecution.execAgent` 内部处理空内容 |
| TC-ESA-012 | AgentLibrary.recordAgentUsage 失败 | `recordAgentUsage` 模拟异常 | 完整参数 | 不阻塞主流程，返回 true（若执行已成功） |
| TC-ESA-013 | InfoCore.saveInfo 失败 | `saveInfo` 模拟异常 | 完整参数 | 不阻塞主流程，返回 true（若执行已成功） |

---

## 3. execDAG — 执行 DAG

### 3.1 正常流程（串行模式）

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-ED-001 | 串行执行链式 DAG（3 个节点） | `agent_dag` 中 node1→node2→node3，`max_concurrent=1` | 完整参数 | `output.agent_results` 数组长度为 3，按拓扑顺序排列，返回 true |
| TC-ED-002 | 串行执行时上游输出传递给下游 | node1→node2 | 完整参数 | node2 的 `task_content` 前缀包含 node1 的 answer 摘要（前 500 字） |
| TC-ED-003 | 串行执行独立节点 | 3 个节点无依赖，`max_concurrent=1` | 完整参数 | 3 个节点依次执行，返回 true |
| TC-ED-004 | 串行执行时 completed_task_count 递增 | 3 个节点 | 完整参数 | 每完成一个节点 `orchestration_work` 表 `completed_task_count` 递增 |
| TC-ED-005 | total_elapsed_ms 统计 | 3 个节点 | 完整参数 | `output.total_elapsed_ms` 为所有节点耗时之和 |
| TC-ED-006 | failed_count 正常为 0 | 所有节点执行成功 | 完整参数 | `output.failed_count=0` |

### 3.2 正常流程（并发模式）

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-ED-007 | 并发执行独立节点 | 3 个独立节点，`max_concurrent=3` | 完整参数 | 3 个节点并行执行，`total_elapsed_ms` 约等于最慢节点耗时 |
| TC-ED-008 | 并发执行时入度解析 | node1→node2, node1→node3，`max_concurrent=2` | 完整参数 | node1 先执行，完成后 node2 和 node3 并行执行 |
| TC-ED-009 | 并发执行结果完整性 | 3 个独立节点，`max_concurrent=3` | 完整参数 | `output.agent_results` 包含全部 3 个节点的结果 |

### 3.3 拓扑排序与依赖解析

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-ED-010 | 链式依赖拓扑排序 | node1→node2→node3 | 完整参数 | 执行顺序为 node1 → node2 → node3 |
| TC-ED-011 | 菱形依赖拓扑排序 | node1→node2, node1→node3, node2→node4, node3→node4 | 完整参数 | node1 先执行，node2 和 node3 可并行，node4 最后执行 |
| TC-ED-012 | 多入度节点等待所有上游完成 | node1→node3, node2→node3 | 完整参数 | node3 在 node1 和 node2 都完成后才执行 |
| TC-ED-013 | 无依赖多起点的 DAG | node1 和 node2 均为入度 0 | 完整参数 | 两个节点均可作为起始节点 |

### 3.4 失败处理

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-ED-014 | 某 Agent 执行失败触发 handleDAGFailure | node2 执行失败 | 完整参数 | `OrchestrationStrategy.handleDAGFailure` 被调用，传入失败信息 |
| TC-ED-015 | handleDAGFailure 返回 REPLAN 时重新执行 | `handleDAGFailure` 返回 `action="REPLAN"` 和 `new_agent_dag` | 完整参数 | 用新 agent_dag 替换当前 agent_dag，重新执行 execDAG |
| TC-ED-016 | handleDAGFailure 返回 FAIL 时终止 | `handleDAGFailure` 返回 `action="FAIL"` | 完整参数 | 终止 DAG 执行，`output.failed_count` 记录失败数，已完成的结果仍返回 |
| TC-ED-017 | 失败节点状态标记为 EXEC_FAILED | node2 执行失败 | 完整参数 | node2 的 status 标记为 "EXEC_FAILED" |
| TC-ED-018 | 所有节点执行完成时 Ready Queue 为空 | 所有节点执行完 | 完整参数 | 正常退出循环，返回结果 |

### 3.5 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-ED-019 | agent_dag 为空 | `agent_dag.agent_nodes=[]` | 完整参数 | `output.agent_results=[]`，`output.total_elapsed_ms=0`，返回 true |
| TC-ED-020 | agent_dag 只有一个节点 | 1 个 agent_node | 完整参数 | 正常执行，返回 true |
| TC-ED-021 | max_concurrent=0 | 无效值 | `max_concurrent=0` | 降级为串行执行或返回 false |
| TC-ED-022 | max_concurrent 大于节点数 | 3 个节点，`max_concurrent=10` | 完整参数 | 所有独立节点并行执行 |
| TC-ED-023 | 上游输出超过 500 字 | node1 的 answer 为 1000 字 | 完整参数 | 下游 node2 的 task_content 前缀只包含前 500 字摘要 |
| TC-ED-024 | DAG 执行超时 | `dag_timeout_ms` 设置，执行超过限制 | 完整参数 | 取消所有未完成的 Agent 节点，标记 work 为 FAILED |

---

## 4. execDAGAsync — 异步执行 DAG

### 4.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EDA-001 | 异步提交 DAG 执行 | `MQProvider.sendMQ` 可用 | 完整参数 | `output.job_id` 非空 UUID，返回 true |
| TC-EDA-002 | 异步提交指定回调队列 | `callback_queue="dag.result"` | `callback_queue="dag.result"` | 消息发送到 `orchestration.dag_execution` 队列，包含 `callback_queue` |
| TC-EDA-003 | Worker 消费并执行 DAG | `MQCore.startWorker` 可用 | 完整参数 | Worker 消费消息后调用 `execDAG`，完成后结果发送到 callback_queue |
| TC-EDA-004 | 已有 Worker 时不重复启动 | 已有 Worker 运行 | 完整参数 | `MQCore.startWorker` 不被调用或复用已有 Worker |

### 4.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EDA-005 | MQProvider.sendMQ 发送失败 | `MQProvider.sendMQ` 模拟异常 | 完整参数 | 返回 false |
| TC-EDA-006 | Worker 执行失败 | Worker 消费后 `execDAG` 失败 | 完整参数 | 失败信息写入 callback_queue 或记录到表 |

---

## 5. getDAGProgress — 查询 DAG 执行进度

### 5.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-GDP-001 | 查询执行中 DAG 的进度 | `orchestration_work` 表存在，`orchestration_agent_execution` 表有 3 条记录（2 COMPLETED，1 RUNNING） | `work_id` 有效 | `output.progress.total_tasks=3`，`completed_tasks=2`，`running_tasks=1`，`failed_tasks=0`，`pending_tasks=0`，返回 true |
| TC-GDP-002 | 查询已完成 DAG 的进度 | 3 条记录均为 COMPLETED | `work_id` 有效 | `output.progress.total_tasks=3`，`completed_tasks=3`，`running_tasks=0`，返回 true |
| TC-GDP-003 | 查询含失败节点的进度 | 3 条记录（1 COMPLETED，1 FAILED，1 PENDING） | `work_id` 有效 | `completed_tasks=1`，`failed_tasks=1`，`pending_tasks=1`，返回 true |
| TC-GDP-004 | node_details 包含完整信息 | 有执行记录 | `work_id` 有效 | 每项包含 `agent_id`、`task_content`（摘要）、`status`、`answer`（仅 COMPLETED）、`trace_id`（仅 COMPLETED）、`elapsed_ms` |
| TC-GDP-005 | 传入 plan_id 精确查询 | Planning 策略 | `work_id`、`plan_id` 有效 | 返回该 plan_id 下的执行进度 |

### 5.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-GDP-006 | 查询不存在的 work_id | 表中无记录 | `work_id="nonexistent"` | 返回空进度或返回 false |
| TC-GDP-007 | 无执行记录 | `orchestration_agent_execution` 表无对应记录 | `work_id` 有效 | `total_tasks=0`，`completed_tasks=0`，返回 true |
| TC-GDP-008 | work 为 Simple 策略 | 无 plan_id | `work_id` 有效，`plan_id` 不传 | 正常返回进度信息 |

---

## 6. cancelExecution — 取消 DAG 执行

### 6.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-CE-001 | 取消有 PENDING 和 RUNNING 记录的 work | `orchestration_agent_execution` 表有 2 PENDING + 1 RUNNING | `work_id` 有效 | `output.cancelled_count=3`，所有记录 status="CANCELLED"，返回 true |
| TC-CE-002 | 取消只有 PENDING 记录的 work | 表中有 3 PENDING | `work_id` 有效 | `output.cancelled_count=3`，所有记录 status="CANCELLED" |
| TC-CE-003 | 取消时更新 work 表状态 | 正常取消 | `work_id` 有效 | `orchestration_work` 表 status="FAILED"，`cancel_reason` 已记录 |
| TC-CE-004 | 异步模式取消时停止 Worker | 异步执行模式 | `work_id` 有效 | `MQCore.stopWorker` 被调用 |

### 6.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-CE-005 | 无 PENDING 或 RUNNING 记录 | 表中所有记录为 COMPLETED | `work_id` 有效 | `output.cancelled_count=0`，返回 true |
| TC-CE-006 | 无任何执行记录 | 表中无对应 work_id 记录 | `work_id` 有效 | `output.cancelled_count=0`，返回 true |
| TC-CE-007 | work_id 不存在 | 表中无记录 | `work_id="nonexistent"` | 返回 false 或 `cancelled_count=0` |
| TC-CE-008 | 同步模式中断正在执行的 Agent | 同步执行模式，有 RUNNING 记录 | `work_id` 有效 | 通过抛出 CancelledError 或标记 status="CANCELLED" 中断执行 |

---

## 7. getExecQueueStatus — 获取队列执行状态

### 7.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-GQS-001 | 查询队列统计信息 | 队列中有消息 | 无特殊输入 | `output.queue_stats` 包含 pending / processing / completed / failed 数量，返回 true |
| TC-GQS-002 | 查询运行中的 Worker | 有 Worker 运行 | 无特殊输入 | `output.workers` 列表非空，返回 true |

### 7.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-GQS-003 | 队列为空 | 无消息 | 无特殊输入 | `output.queue_stats` 所有数量为 0，返回 true |
| TC-GQS-004 | 无 Worker 运行 | 无 Worker | 无特殊输入 | `output.workers` 为空数组，返回 true |
| TC-GQS-005 | MQProvider.getQueueStats 失败 | 模拟异常 | 无特殊输入 | 返回 false 或返回空统计 |

---

## 8. configOrchestrationExecution — 配置

### 8.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-COE-001 | 更新 max_concurrent | `orchestration_config` 表存在 | `max_concurrent=3` | 配置更新成功，返回当前全部配置，返回 true |
| TC-COE-002 | 更新 default_max_iterations | 配置表存在 | `default_max_iterations=20` | 配置更新成功，返回 true |
| TC-COE-003 | 更新 async_worker_interval | 配置表存在 | `async_worker_interval=2000` | 配置更新成功，返回 true |
| TC-COE-004 | 更新 dag_timeout_ms | 配置表存在 | `dag_timeout_ms=600000` | 配置更新成功，返回 true |
| TC-COE-005 | dag_timeout_ms=0（不限制） | 配置表存在 | `dag_timeout_ms=0` | 配置更新成功，返回 true |
| TC-COE-006 | 不传参数查询当前配置 | 配置表存在 | 所有字段不传 | 返回当前配置，不修改任何值，返回 true |

### 8.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-COE-007 | max_concurrent 为负数 | 配置表存在 | `max_concurrent=-1` | 返回 false，校验失败 |
| TC-COE-008 | default_max_iterations 为负数 | 配置表存在 | `default_max_iterations=-5` | 返回 false，校验失败 |
| TC-COE-009 | async_worker_interval 为负数 | 配置表存在 | `async_worker_interval=-100` | 返回 false，校验失败 |
| TC-COE-010 | dag_timeout_ms 为负数 | 配置表存在 | `dag_timeout_ms=-1` | 返回 false，校验失败 |

---

## 9. AOP 代理通用测试

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-AOP-001 | 所有方法调用记录日志 | 任意 | 调用任意方法 | `LogProvider.debug/info` 记录方法调用日志 |
| TC-AOP-002 | 所有方法调用记录耗时 | 任意 | 调用任意方法 | `output.elapsed_ms` 字段存在且非负 |

---

## 10. 表结构验证

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-TBL-001 | orchestration_task_agent 表字段完整性 | 表已创建 | 查询表结构 | 包含 id、created、updated、plan_id、task_id、agent_id |
| TC-TBL-002 | orchestration_task_agent 表索引 | 表已创建 | 查询索引 | plan_id 普通索引，task_id 普通索引，agent_id 普通索引 |
| TC-TBL-003 | orchestration_agent_dag 表字段完整性 | 表已创建 | 查询表结构 | 包含 id、created、updated、plan_id、from_agent_id、to_agent_id |
| TC-TBL-004 | orchestration_agent_dag 表联合唯一索引 | 表已创建 | 插入重复边 | 插入失败，from_agent_id + to_agent_id 联合唯一索引 |
| TC-TBL-005 | orchestration_agent_dag_record 表字段完整性 | 表已创建 | 查询表结构 | 包含 id、created、updated、plan_id、total_agent_count、agent_dag_json |
| TC-TBL-006 | orchestration_agent_execution 表字段完整性 | 表已创建 | 查询表结构 | 包含 id、created、updated、work_id、agent_id、plan_id、task_id、execution_type、task_content、status、answer、trace_id、iterations、elapsed_ms、error_info |
| TC-TBL-007 | orchestration_agent_execution 表 status 枚举值 | 表已创建 | 插入 status="INVALID" | 插入失败或应用层校验拦截 |