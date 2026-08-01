# OrchestrationVisualization 测试用例

## 测试约定

- 所有方法通过 AOP 代理（AopProxy.wrap）生成代理对象，默认记录日志和耗时
- 方法签名：`Boolean methodName(Input input, Context context, Output output)`
- 可视化接口只返回结构和 ID 引用，不嵌入实际内容
- 可视化接口均为只读操作，不修改任何业务数据
- 任一数据源查询失败时，对应字段置空而非整体失败（错误容忍）

---

## 1. visualizeAgentDAG — 获取 AgentDAG 结构

### 1.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-VAD-001 | Planning 策略获取完整 AgentDAG 结构 | `orchestration_work` 表 status="COMPLETED"，`orchestration_strategy="PLANNING"`，`orchestration_task_agent` 表有 3 条记录，`orchestration_agent_dag` 表有 2 条边 | `work_id` 有效 | `output.agent_dag_structure` 包含 `work_id`、`session_id`、`orchestration_strategy`、`work_status`、`total_elapsed_ms`，`graph.nodes` 长度为 3，`graph.edges` 长度为 2，返回 true |
| TC-VAD-002 | Simple 策略获取 AgentDAG 结构 | `orchestration_work` 表 status="COMPLETED"，`orchestration_strategy="SIMPLE"`，`orchestration_agent_execution` 表有 1 条记录 | `work_id` 有效 | `graph.nodes` 长度为 1，`graph.edges=[]`，返回 true |
| TC-VAD-003 | graph.nodes 包含完整字段 | 正常执行 | `work_id` 有效 | 每个 node 包含 `agent_id`、`agent_type`、`task_id`、`task_complexity`、`task_domain`、`dependency_level`、`status`、`upstream_agent_ids`、`downstream_agent_ids`、`runtime`、`component_refs`、`context_source_refs`、`result_refs`、`created`、`updated` |
| TC-VAD-004 | runtime 字段填充 | `orchestration_agent_execution` 表有对应记录 | `work_id` 有效 | `runtime.trace_id` 非空，`runtime.iterations` 非负，`runtime.elapsed_ms` 非负，`runtime.error_info` 为 null（正常情况） |
| TC-VAD-005 | component_refs 填充 Agent 组件引用 | `AgentLibrary.getAgent` 返回 agent 信息 | `work_id` 有效 | `component_refs` 包含 `agent_id`、`strategy_id`、`llm_id`、`soul_id`、`skill_ids`、`mcp_ids`、`prompt_template_ids` |
| TC-VAD-006 | context_source_refs 填充上下文来源 | `AgentExecution.getExecContext` 返回来源分类 | `work_id` 有效 | `context_source_refs` 包含 `trace_id`、`pinned`、`timeline`、`tag_relative`、`similarity`、`keyword`、`random`，每项含 `count` 和 `info_ids` |
| TC-VAD-007 | result_refs 填充结果引用 | `info_raw` 表和 `agent_evaluation` 表有记录 | `work_id` 有效 | `result_refs` 包含 `task_id`、`info_ids`、`eval_id` |
| TC-VAD-008 | graph.edges 包含完整字段 | `orchestration_agent_dag` 表有记录 | `work_id` 有效 | 每条 edge 包含 `from_agent_id`、`to_agent_id`、`edge_type`、`data_dependency` |
| TC-VAD-009 | graph.metadata 统计信息正确 | 3 个节点，2 条边 | `work_id` 有效 | `total_nodes=3`，`total_edges=2`，`max_dependency_depth` 计算正确，`parallel_branches` 计算正确 |

### 1.2 拓扑层级计算

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-VAD-010 | 根节点 dependency_level=0 | 单个节点无依赖 | `work_id` 有效 | 该节点的 `dependency_level=0` |
| TC-VAD-011 | 链式依赖层级计算 | node1→node2→node3 | `work_id` 有效 | node1.level=0, node2.level=1, node3.level=2 |
| TC-VAD-012 | 多上游节点取最大层级 | node1→node3, node2→node3，node1.level=0, node2.level=1 | `work_id` 有效 | node3.level=max(0,1)+1=2 |
| TC-VAD-013 | upstream_agent_ids 和 downstream_agent_ids 正确 | node1→node2, node1→node3 | `work_id` 有效 | node1.downstream=[node2, node3]，node2.upstream=[node1]，node3.upstream=[node1] |

### 1.3 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-VAD-014 | 查询不存在 work_id | 表中无记录 | `work_id="nonexistent"` | 返回空结构或返回 false |
| TC-VAD-015 | 某 Agent 无 trace_id | `orchestration_agent_execution` 表中某记录 trace_id 为空 | `work_id` 有效 | 对应 node 的 runtime.trace_id 为空，不中断整体返回 |
| TC-VAD-016 | AgentLibrary.getAgent 返回空 | 某 agent_id 无对应 agent 记录 | `work_id` 有效 | 对应 node 的 component_refs 部分字段为空，不中断整体返回 |
| TC-VAD-017 | AgentExecution.getExecContext 返回空 | 无上下文来源数据 | `work_id` 有效 | 对应 node 的 context_source_refs 各来源 count=0，info_ids=[]，不中断整体返回 |
| TC-VAD-018 | agent_evaluation 表无记录 | 未执行评估 | `work_id` 有效 | result_refs.eval_id 为空，不中断整体返回 |
| TC-VAD-019 | info_raw 表无记录 | 无信息记录 | `work_id` 有效 | result_refs.info_ids 为空数组，不中断整体返回 |
| TC-VAD-020 | work 状态为 FAILED 时查询 | `orchestration_work` 表 status="FAILED" | `work_id` 有效 | `work_status="FAILED"`，runtime.error_info 可能非空 |
| TC-VAD-021 | work 状态为 EXECUTING 时查询 | `orchestration_work` 表 status="EXECUTING" | `work_id` 有效 | 部分节点 status="RUNNING" 或 "PENDING" |

---

## 2. visualizeWorkFlow — 获取 Work 流程时间线

### 2.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-VWF-001 | Planning 策略完整时间线 | `orchestration_work` 表 status="COMPLETED"，`orchestration_strategy="PLANNING"` | `work_id` 有效 | `output.workflow_timeline` 包含 `work_id`、`session_id`、`interact_id`、`orchestration_strategy`、`work_status`、`total_elapsed_ms`、`phases` 数组、`timeline_summary`，返回 true |
| TC-VWF-002 | Planning 策略包含所有阶段 | Planning 策略正常执行 | `work_id` 有效 | `phases` 包含 ENTRY、PLANNING、BUILD_AGENT_DAG、EXECUTING、WRITING、EVALUATING 六个阶段 |
| TC-VWF-003 | Simple 策略不包含 PLANNING 和 BUILD_AGENT_DAG 阶段 | `orchestration_strategy="SIMPLE"` | `work_id` 有效 | `phases` 不包含 PLANNING 和 BUILD_AGENT_DAG 阶段 |
| TC-VWF-004 | 每个阶段包含完整字段 | 正常执行 | `work_id` 有效 | 每个 phase 包含 `phase`、`status`、`start_time`、`end_time`、`elapsed_ms`、`description` |
| TC-VWF-005 | PLANNING 阶段包含 refs.plan_id | Planning 策略 | `work_id` 有效 | `phases` 中 PLANNING 阶段 `refs.plan_id` 非空 |
| TC-VWF-006 | BUILD_AGENT_DAG 阶段包含 refs.agent_ids 和 agent_dag_record_id | Planning 策略 | `work_id` 有效 | `refs.agent_ids` 为数组，`refs.agent_dag_record_id` 非空 |
| TC-VWF-007 | EXECUTING 阶段包含 refs.agent_execution_ids | 正常执行 | `work_id` 有效 | `refs.agent_execution_ids` 为数组 |
| TC-VWF-008 | WRITING 阶段包含 refs.writer_agent_id | 正常执行 | `work_id` 有效 | `refs.writer_agent_id` 非空 |
| TC-VWF-009 | EVALUATING 阶段包含 refs.eval_ids | 正常执行 | `work_id` 有效 | `refs.eval_ids` 为数组 |
| TC-VWF-010 | timeline_summary 各阶段占比之和约等于 1 | 正常执行 | `work_id` 有效 | `planning_ratio + executing_ratio + writing_ratio + evaluating_ratio + overhead_ratio ≈ 1.0` |

### 2.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-VWF-011 | 查询不存在 work_id | 表中无记录 | `work_id="nonexistent"` | 返回空结构或返回 false |
| TC-VWF-012 | PlannerAgent.getPlan 返回空 | Planning 策略但无 plan 记录 | `work_id` 有效 | PLANNING 阶段 refs.plan_id 为空，不中断整体返回 |
| TC-VWF-013 | 无 agent_usage 记录 | WriterAgent 未记录使用 | `work_id` 有效 | WRITING 阶段 refs.writer_agent_id 为空，不中断整体返回 |
| TC-VWF-014 | 无 agent_evaluation 记录 | 未执行评估 | `work_id` 有效 | EVALUATING 阶段 refs.eval_ids 为空，不中断整体返回 |
| TC-VWF-015 | work 状态为 FAILED | status="FAILED" | `work_id` 有效 | 各阶段 status 可能为 "FAILED" 或 "SKIPPED" |
| TC-VWF-016 | total_elapsed_ms 为 0 | 刚创建 | `work_id` 有效 | `timeline_summary` 中各占比处理除零情况 |

---

## 3. getAgentNodeDetail — 获取 Agent 节点详情

### 3.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-GAD-001 | 获取完整节点详情 | `orchestration_task_agent` 表、`orchestration_agent_execution` 表、`orchestration_agent_dag` 表均有记录 | `work_id`、`agent_id` 有效 | `output.agent_node_detail` 包含 `agent_id`、`agent_type`、`work_id`、`task_id`、`task_complexity`、`task_domain`、`status`、`elapsed_ms`、`iterations`、`dependency_chain`、`component_refs`、`context_source_refs`、`result_refs`，返回 true |
| TC-GAD-002 | dependency_chain 包含上下游 | node1→node2→node3 | `work_id="w1"`, `agent_id="node2"` | `dependency_chain.upstream_agent_ids=["node1"]`，`dependency_chain.downstream_agent_ids=["node3"]` |
| TC-GAD-003 | 无上游节点 | 根节点 | `work_id="w1"`, `agent_id="node1"` | `dependency_chain.upstream_agent_ids=[]` |
| TC-GAD-004 | 无下游节点 | 叶子节点 | `work_id="w1"`, `agent_id="node3"` | `dependency_chain.downstream_agent_ids=[]` |
| TC-GAD-005 | result_refs 包含 info_roles | `info_raw` 表有记录 | `work_id`、`agent_id` 有效 | `result_refs.info_roles` 包含每个 info_id 对应的角色 |

### 3.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-GAD-006 | 查询不存在的 agent_id | 表中无对应记录 | `work_id="w1"`, `agent_id="nonexistent"` | 返回空结构或返回 false |
| TC-GAD-007 | 查询不存在的 work_id | 表中无对应记录 | `work_id="nonexistent"`, `agent_id="a1"` | 返回空结构或返回 false |
| TC-GAD-008 | 某数据源查询失败 | 模拟 `AgentLibrary.getAgent` 失败 | `work_id`、`agent_id` 有效 | 对应字段置空，不中断整体返回 |
| TC-GAD-009 | component_refs 中 skill_ids 为空 | Agent 未绑定 Skill | `work_id`、`agent_id` 有效 | `component_refs.skill_ids=[]`，不中断 |
| TC-GAD-010 | component_refs 中 mcp_ids 为空 | Agent 未绑定 MCP | `work_id`、`agent_id` 有效 | `component_refs.mcp_ids=[]`，不中断 |

---

## 4. configOrchestrationVisualization — 配置

### 4.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-COV-001 | 更新 max_nodes_in_graph | `orchestration_config` 表存在 | `max_nodes_in_graph=100` | 配置更新成功，返回当前全部配置，返回 true |
| TC-COV-002 | 不传参数查询当前配置 | `orchestration_config` 表存在 | 所有字段不传 | 返回当前配置，不修改任何值，返回 true |

### 4.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-COV-003 | max_nodes_in_graph 为负数 | 配置表存在 | `max_nodes_in_graph=-1` | 返回 false，校验失败 |
| TC-COV-004 | max_nodes_in_graph 为 0 | 配置表存在 | `max_nodes_in_graph=0` | 配置更新成功或返回 false（取决于实现） |

---

## 5. ID 引用原则验证

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-IDR-001 | 返回不嵌入 task_content | 正常执行 | `work_id` 有效 | 返回数据中不包含完整的 task_content 文本 |
| TC-IDR-002 | 返回不嵌入 answer 内容 | 正常执行 | `work_id` 有效 | 返回数据中不包含完整的 answer 文本 |
| TC-IDR-003 | 返回不嵌入 trace 详情 | 正常执行 | `work_id` 有效 | 返回数据中不包含完整的 trace 步骤详情 |
| TC-IDR-004 | 返回不嵌入 info 内容 | 正常执行 | `work_id` 有效 | 返回数据中不包含 info 的实际内容 |
| TC-IDR-005 | 返回不嵌入 eval 评分详情 | 正常执行 | `work_id` 有效 | 返回数据中不包含 eval 的多维度评分值 |

---

## 6. 只读操作验证

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-RO-001 | visualizeAgentDAG 不修改任何数据 | 正常执行 | `work_id` 有效 | `orchestration_work` 表、`orchestration_agent_execution` 表等无任何变更 |
| TC-RO-002 | visualizeWorkFlow 不修改任何数据 | 正常执行 | `work_id` 有效 | 所有关联表无任何变更 |
| TC-RO-003 | getAgentNodeDetail 不修改任何数据 | 正常执行 | `work_id`、`agent_id` 有效 | 所有关联表无任何变更 |

---

## 7. AOP 代理通用测试

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-AOP-001 | 所有方法调用记录日志 | 任意 | 调用任意方法 | `LogProvider.debug/info` 记录方法调用日志 |
| TC-AOP-002 | 所有方法调用记录耗时 | 任意 | 调用任意方法 | `output.elapsed_ms` 字段存在且非负 |

---

## 8. 表结构验证

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-TBL-001 | 可视化模块不新增表 | 系统初始化后 | 查询所有表 | 无可视化模块专属表（复用已有表） |
| TC-TBL-002 | 复用表关联正确 | 各模块表已创建 | 跨表查询 | 可视化模块正确读取 OrchestrationEntry、OrchestrationExecution、Agent、Core 层的表 |