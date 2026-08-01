# OrchestrationStrategy 测试用例

## 测试约定

- 所有方法通过 AOP 代理（AopProxy.wrap）生成代理对象，默认记录日志和耗时
- 方法签名：`Boolean methodName(Input input, Context context, Output output)`
- Simple 和 Planning 内置策略以 strategy_label 为 "SIMPLE" 和 "PLANNING" 的 JSONNode 定义方式存在
- 后处理链不可跳过，任何编排策略完成后必须经过 WriterAgent.write 和 EvolutorAgent 评估

---

## 1. startOrchestration — 启动编排

### 1.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-SO-001 | Simple 策略启动编排 | `strategy="SIMPLE"`，`work_id`、`interact_id`、`session_id`、`user_query`、`work_context` 均有效 | 完整输入参数 | `output.final_response` 非空，`executeSimpleStrategy` 被调用，`executePostProcessing` 被调用，返回 true |
| TC-SO-002 | Planning 策略启动编排 | `strategy="PLANNING"`，`work_id`、`interact_id`、`session_id`、`user_query`、`work_context` 均有效 | 完整输入参数 | `output.final_response` 非空，`executePlanningStrategy` 被调用，`executePostProcessing` 被调用，返回 true |
| TC-SO-003 | work_context 包含完整上下文数据 | 所有参数有效 | `work_context` 含 `session_context`、`user_profile`、`recent_works` | 策略执行时使用 work_context 中的数据，返回 true |

### 1.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-SO-004 | strategy 为无效值 | 参数有效 | `strategy="UNKNOWN"` | 返回 false，记录错误日志 |
| TC-SO-005 | work_id 不存在 | `orchestration_work` 表无对应记录 | `work_id="nonexistent"` | 返回 false，记录错误 |
| TC-SO-006 | user_query 为空 | 参数有效 | `user_query=""` | 返回 false 或执行后处理（取决于策略实现） |
| TC-SO-007 | executeSimpleStrategy 执行失败 | 策略执行模拟失败 | `strategy="SIMPLE"` | 返回 false，`orchestration_work` 表 status="FAILED" |
| TC-SO-008 | executePostProcessing 执行失败 | 后处理模拟失败 | `strategy="SIMPLE"` | 返回 false，`final_response` 可能为空 |

---

## 2. executeSimpleStrategy — Simple 策略执行

### 2.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-ESS-001 | 构建并执行单个 WorkAgent | `AgentBuilder.buildAgent` 返回 `agent_id`，`OrchestrationExecution.execSingleAgent` 返回 `answer` 和 `trace_id` | 完整参数 | `output.agent_results` 数组长度为 1，包含 `agent_id`、`task_content`、`result`、`trace_id`，`output.plan_id` 为空，返回 true |
| TC-ESS-002 | force_new=false 允许复用 Agent | `AgentBuilder.buildAgent` 被调用时 `force_new=false` | 完整参数 | `AgentBuilder.buildAgent` 的 `force_new` 参数为 false |
| TC-ESS-003 | 执行前更新 work 状态为 EXECUTING | `orchestration_work` 表存在记录 | 完整参数 | `orchestration_work` 表 status 被更新为 "EXECUTING" |
| TC-ESS-004 | agent_results 返回 task_content 为原始 user_query | `user_query="请帮我做某事"` | 完整参数 | `output.agent_results[0].task_content="请帮我做某事"` |

### 2.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-ESS-005 | AgentBuilder.buildAgent 失败 | `AgentBuilder.buildAgent` 模拟返回 false 或抛出异常 | 完整参数 | 返回 false，`orchestration_work` 表 status="FAILED" |
| TC-ESS-006 | OrchestrationExecution.execSingleAgent 失败 | `OrchestrationExecution.execSingleAgent` 模拟返回 false | 完整参数 | 返回 false |
| TC-ESS-007 | agent_results 中 trace_id 有效 | 正常执行 | 完整参数 | `output.agent_results[0].trace_id` 为非空 UUID |
| TC-ESS-008 | user_query 包含特殊字符 | 正常执行 | `user_query="请帮我分析 <script>alert('xss')</script>"` | 正常执行，内容被保留，返回 true |

---

## 3. executePlanningStrategy — Planning 策略执行

### 3.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EPS-001 | 任务拆解成功 | `PlannerAgent.plan` 返回 `plan_id` 和 `task_dag`（含 3 个 nodes 和 2 条 edges） | 完整参数 | `output.plan_id` 非空，`orchestration_work` 表 `task_count=3`，status 更新为 "PLANNING"，返回 true |
| TC-EPS-002 | 构建 Agent DAG 成功 | `OrchestrationExecution.buildAgentDAG` 返回 `agent_dag` | 完整参数 | `OrchestrationExecution.buildAgentDAG` 被调用，传入 `plan_id`、`task_dag`、`interact_id` |
| TC-EPS-003 | 执行 Agent DAG 成功 | `OrchestrationExecution.execDAG` 返回 `agent_results` 列表 | 完整参数 | `OrchestrationExecution.execDAG` 被调用，传入 `work_id`、`agent_dag`、`work_context` |
| TC-EPS-004 | completed_task_count 递增 | DAG 包含 3 个 Agent | 完整参数 | 每次完成一个 Agent 节点，`orchestration_work` 表 `completed_task_count` 递增，最终为 3 |
| TC-EPS-005 | agent_results 按 DAG 拓扑排序 | DAG 有 3 个节点，node1→node2, node1→node3 | 完整参数 | `output.agent_results` 按拓扑顺序排列，node1 的结果在最前 |
| TC-EPS-006 | 单个子任务拆解 | `PlannerAgent.plan` 返回只有 1 个 node 的 task_dag | 完整参数 | `output.agent_results` 数组长度为 1，`task_count=1`，返回 true |

### 3.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EPS-007 | PlannerAgent.plan 返回空 task_dag | `PlannerAgent.plan` 返回 `nodes=[]` | 完整参数 | 返回 false 或触发 fail 处理 |
| TC-EPS-008 | PlannerAgent.plan 执行失败 | `PlannerAgent.plan` 模拟抛出异常 | 完整参数 | 返回 false，`orchestration_work` 表 status="FAILED" |
| TC-EPS-009 | execDAG 中某 Agent 执行失败 | `OrchestrationExecution.execDAG` 中某 Agent 失败 | 完整参数 | 调用 `handleDAGFailure`，根据重试次数决定 REPLAN 或 FAIL |
| TC-EPS-010 | task_dag 中的节点无依赖关系 | `task_dag.edges=[]`，3 个独立节点 | 完整参数 | 所有 Agent 可并行执行（若 max_concurrent>1），返回 true |
| TC-EPS-011 | task_dag 中的节点为链式依赖 | node1→node2→node3 | 完整参数 | 串行执行，上游 Agent 输出传递给下游 |
| TC-EPS-012 | OrchestrationExecution.buildAgentDAG 失败 | `buildAgentDAG` 模拟异常 | 完整参数 | 返回 false |

---

## 4. executePostProcessing — 后处理链

### 4.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EPP-001 | WriterAgent 写作成功 | `WriterAgent.write` 返回 `response`、`response_format`、`token_usage` | `agent_results` 有 1 条结果 | `output.final_response` 非空，`orchestration_work` 表 status 更新为 "WRITING"，返回 true |
| TC-EPP-002 | EvolutorAgent 评估 WriterAgent（异步） | `EvolutorAgent.evalWriterAgent` 可用 | `agent_results` 有结果 | `EvolutorAgent.evalWriterAgent` 被调用，不阻塞主流程，`orchestration_work` 表 status 更新为 "EVALUATING" |
| TC-EPP-003 | EvolutorAgent 评估所有 WorkAgent（异步） | `agent_results` 有 3 条结果 | `agent_results` 有 3 条 | `EvolutorAgent.evalWorkAgent` 被调用 3 次，每次传入对应的 `agent_id`、`task_content`、`agent_output`、`trace_id` |
| TC-EPP-004 | 启动后台定时评估 | `EvolutorAgent.startEvalSchedule` 可用，无已有 Worker | 完整参数 | `EvolutorAgent.startEvalSchedule` 被调用 |
| TC-EPP-005 | 已有评估 Worker 时不重复启动 | `MQCore.getWorker` 返回已有 Worker | 完整参数 | `EvolutorAgent.startEvalSchedule` 不被调用 |
| TC-EPP-006 | eval_id 返回 | `EvolutorAgent.evalWriterAgent` 返回 `eval_id` | 完整参数 | `output.eval_id` 非空 |

### 4.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EPP-007 | WriterAgent.write 失败 | `WriterAgent.write` 模拟异常 | 完整参数 | 返回 false 或返回兜底回复 |
| TC-EPP-008 | agent_results 为空 | 无 Agent 执行结果 | `agent_results=[]` | `WriterAgent.write` 传入空结果，返回 true 或 false |
| TC-EPP-009 | EvolutorAgent.evalWriterAgent 异步失败 | 异步调用失败 | 完整参数 | 不阻塞主流程，`final_response` 正常返回 |
| TC-EPP-010 | EvolutorAgent.evalWorkAgent 对某 Agent 异步失败 | 某 WorkAgent 评估异步失败 | 完整参数 | 不阻塞主流程，其他 Agent 评估正常进行 |
| TC-EPP-011 | writerAgent 响应 token_usage 返回 | 正常执行 | 完整参数 | `token_usage` 被正确获取并记录 |

---

## 5. addStrategy — 注册策略

### 5.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-AS-001 | 注册新策略 | `strategy_label="custom_strategy"` 不重复，`jsonnode_definition` 合法 | `strategy_label="custom_strategy"`, `strategy_description="自定义策略"`, `jsonnode_definition` 合法，`enable=true` | `output.strategy_id` 非空 UUID，`orchestration_strategy` 表写入新记录，返回 true |
| TC-AS-002 | 注册策略 enable=false | `strategy_label` 不重复 | `enable=false` | `orchestration_strategy` 表 `enable=false`，返回 true |
| TC-AS-003 | JSONNode 定义通过校验 | `jsonnode_definition` 包含 version、start_node、nodes 数组 | 合法 JSONNode 定义 | `JSONNode.validate` 被调用并返回 valid=true，返回 true |

### 5.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-AS-004 | strategy_label 重复 | `orchestration_strategy` 表已存在 `strategy_label="custom_strategy"` | `strategy_label="custom_strategy"` | 返回 false，校验失败 |
| TC-AS-005 | strategy_label 为空 | 无 | `strategy_label=""` | 返回 false，校验失败 |
| TC-AS-006 | jsonnode_definition 不合法 | JSON 格式错误或不符合 JSONNode 规范 | 不合法的 `jsonnode_definition` | 返回 false，`JSONNode.validate` 返回 valid=false |
| TC-AS-007 | jsonnode_definition 缺失 version | nodes 中无 version 字段 | `jsonnode_definition` 缺失 version | 返回 false，校验失败 |
| TC-AS-008 | jsonnode_definition 缺失 start_node | nodes 中无 start_node 字段 | `jsonnode_definition` 缺失 start_node | 返回 false，校验失败 |
| TC-AS-009 | jsonnode_definition 中 next 引用不存在的节点 | nodes 中某节点的 next 指向不存在的 node_id | `jsonnode_definition` 包含非法引用 | 返回 false，校验失败 |
| TC-AS-010 | jsonnode_definition 有环 | DAG 中存在循环依赖 | 包含环的 `jsonnode_definition` | 返回 false，校验失败（DFS 检测到回边） |
| TC-AS-011 | jsonnode_definition 中 node_type 未注册 | 某节点 node_type 为未知类型 | `jsonnode_definition` 包含非法 node_type | 返回 false，校验失败 |

---

## 6. handleDAGFailure — 失败处理

### 6.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-HDF-001 | 首次失败触发 REPLAN | `plan_retry_count=0`，`max_plan_retries=2` | `plan_id`、`failed_task_id`、`failure_reason`、`completed_task_ids` 有效 | `output.action="REPLAN"`，`output.new_agent_dag` 非空，`output.max_retry_reached=false`，`PlannerAgent.replan` 被调用，返回 true |
| TC-HDF-002 | 重试次数达到上限返回 FAIL | `plan_retry_count=2`，`max_plan_retries=2` | `plan_id` 有效 | `output.action="FAIL"`，`output.max_retry_reached=true`，`orchestration_work` 表 status="FAILED"，返回 true |
| TC-HDF-003 | 超过最大重试次数 | `plan_retry_count=3`，`max_plan_retries=2` | `plan_id` 有效 | `output.action="FAIL"`，`output.max_retry_reached=true`，返回 true |
| TC-HDF-004 | REPLAN 后构建新 Agent DAG | `plan_retry_count=0`，`PlannerAgent.replan` 返回新 plan | 完整参数 | `OrchestrationExecution.buildAgentDAG` 被调用，仅包含未完成的任务 |
| TC-HDF-005 | metadata 中 plan_retry_count 递增 | `plan_retry_count=0` | 完整参数 | `orchestration_work` 表 metadata 中 `plan_retry_count=1` |

### 6.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-HDF-006 | max_plan_retries=0（不重试） | `orchestration_config` 表 `max_plan_retries=0` | `plan_retry_count=0` | `output.action="FAIL"`，`output.max_retry_reached=true`，返回 true |
| TC-HDF-007 | PlannerAgent.replan 失败 | `PlannerAgent.replan` 模拟异常 | `plan_retry_count=0` | 返回 false 或 action="FAIL" |
| TC-HDF-008 | completed_task_ids 为空 | 无已完成任务 | `completed_task_ids=[]` | 正常执行 REPLAN，返回 true |
| TC-HDF-009 | failed_task_id 不存在 | 传入无效的 `failed_task_id` | `failed_task_id="invalid"` | 返回 false 或 action="FAIL" |
| TC-HDF-010 | OrchestrationExecution.buildAgentDAG 在 REPLAN 后失败 | `buildAgentDAG` 模拟异常 | `plan_retry_count=0` | 返回 false |

---

## 7. soStrategy/getStrategy — 查看策略

### 7.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-SS-001 | 按 strategy_id 查询单个策略 | `orchestration_strategy` 表存在 `strategy_id="s1"` | `strategy_id="s1"` | `output.strategies` 数组长度为 1，返回 true |
| TC-SS-002 | 按 strategy_label 查询 | `orchestration_strategy` 表存在 `strategy_label="SIMPLE"` | `strategy_label="SIMPLE"` | `output.strategies` 数组至少包含 1 条，返回 true |
| TC-SS-003 | 组合条件查询 | `orchestration_strategy` 表有多条记录 | `strategy_label="SIMPLE"`, `conditions={ enable: true }` | `output.strategies` 返回匹配的记录 |
| TC-SS-004 | 分页查询 | `orchestration_strategy` 表有 5 条记录 | `page={ offset: 0, limit: 2 }` | `output.strategies` 数组长度为 2 |
| TC-SS-005 | 返回字段完整性 | 表中有记录 | `strategy_id="s1"` | 每项包含 `strategy_id`、`strategy_label`、`strategy_description`、`jsonnode_definition`、`enable`、`created`、`updated` |

### 7.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-SS-006 | 查询不存在的 strategy_id | 表中无对应记录 | `strategy_id="nonexistent"` | `output.strategies` 为空数组，返回 true |
| TC-SS-007 | 查询不存在的 strategy_label | 表中无对应记录 | `strategy_label="unknown"` | `output.strategies` 为空数组，返回 true |
| TC-SS-008 | 无任何查询参数 | 表中有多条记录 | 不传任何参数 | 返回所有策略或返回空（按实现约定） |

---

## 8. updateStrategy — 更新策略

### 8.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-US-001 | 更新策略描述 | `orchestration_strategy` 表存在 `strategy_id="s1"` | `strategy_id="s1"`, `strategy_description="新描述"` | 表中 `strategy_description` 更新为 "新描述"，返回 true |
| TC-US-002 | 更新启用状态 | 表中存在策略 | `strategy_id="s1"`, `enable=false` | 表中 `enable=false`，返回 true |
| TC-US-003 | 更新 JSONNode 定义 | 表中存在策略，新定义合法 | `strategy_id="s1"`, `jsonnode_definition` 合法 | 表中 `jsonnode_definition` 更新，返回 true |
| TC-US-004 | 更新多个字段 | 表中存在策略 | `strategy_id="s1"`, `strategy_label="new_label"`, `enable=true` | 多个字段同时更新，返回 true |

### 8.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-US-005 | 更新不存在的策略 | 表中无对应记录 | `strategy_id="nonexistent"` | 返回 false |
| TC-US-006 | 更改为已存在的 strategy_label | 表中已有 `strategy_label="SIMPLE"` | `strategy_id="s2"`, `strategy_label="SIMPLE"` | 返回 false，校验失败 |
| TC-US-007 | 更新 jsonnode_definition 为不合法值 | 表中存在策略 | `strategy_id="s1"`, `jsonnode_definition` 不合法 | 返回 false，同 addStrategy 校验规则 |
| TC-US-008 | 不传任何更新字段 | 表中存在策略 | `strategy_id="s1"`，其他字段不传 | 返回 true，无任何变更 |

---

## 9. configOrchestrationStrategy — 配置编排策略

### 9.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-COS-001 | 更新 default_strategy_id | `orchestration_strategy` 表中存在且 enable=true | `default_strategy_id="s1"` | 配置更新成功，返回当前全部配置，返回 true |
| TC-COS-002 | 更新 max_plan_retries | 配置表存在 | `max_plan_retries=3` | 配置更新成功，返回 true |
| TC-COS-003 | 更新 plan_prompt_template_id | `PromptsProvider.soPrompt` 中存在 | `plan_prompt_template_id="valid_id"` | 配置更新成功，返回 true |
| TC-COS-004 | 不传参数查询当前配置 | 配置表存在 | 所有字段不传 | 返回当前配置，不修改任何值，返回 true |

### 9.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-COS-005 | default_strategy_id 不存在 | `orchestration_strategy` 表中无对应记录 | `default_strategy_id="invalid"` | 返回 false，校验失败 |
| TC-COS-006 | default_strategy_id 对应的策略 enable=false | 表中存在但 enable=false | `default_strategy_id="disabled_id"` | 返回 false，校验失败 |
| TC-COS-007 | max_plan_retries 为负数 | 配置表存在 | `max_plan_retries=-1` | 返回 false，校验失败 |
| TC-COS-008 | max_plan_retries 为 0 | 配置表存在 | `max_plan_retries=0` | 配置更新成功（0 表示不重试），返回 true |
| TC-COS-009 | plan_prompt_template_id 不存在 | `PromptsProvider.soPrompt` 中不存在 | `plan_prompt_template_id="invalid"` | 返回 false，校验失败 |

---

## 10. 后处理链不可跳过测试

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-PP-001 | Simple 策略必须经过后处理 | 正常执行 | `strategy="SIMPLE"` | `WriterAgent.write` 被调用，`EvolutorAgent.evalWriterAgent` 被异步调用 |
| TC-PP-002 | Planning 策略必须经过后处理 | 正常执行 | `strategy="PLANNING"` | `WriterAgent.write` 被调用，`EvolutorAgent.evalWriterAgent` 被异步调用 |
| TC-PP-003 | 后处理链中 WriterAgent 在 EvolutorAgent 之前执行 | 正常执行 | 任意策略 | `WriterAgent.write` 先于 `EvolutorAgent.evalWriterAgent` 被调用 |
| TC-PP-004 | EVALUATING 状态在 WRITING 之后更新 | 正常执行 | 任意策略 | `orchestration_work` 表 status 先更新为 "WRITING"，再更新为 "EVALUATING" |

---

## 11. AOP 代理通用测试

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-AOP-001 | 所有方法调用记录日志 | 任意 | 调用任意方法 | `LogProvider.debug/info` 记录方法调用日志 |
| TC-AOP-002 | 所有方法调用记录耗时 | 任意 | 调用任意方法 | `output.elapsed_ms` 字段存在且非负 |

---

## 12. 表结构验证

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-TBL-001 | orchestration_strategy 表字段完整性 | 表已创建 | 查询表结构 | 包含 id、created、updated、strategy_id、strategy_label、strategy_description、jsonnode_definition、enable |
| TC-TBL-002 | orchestration_strategy 表索引 | 表已创建 | 查询索引 | strategy_id 唯一索引，strategy_label 唯一索引 |
| TC-TBL-003 | orchestration_strategy_execution 表字段完整性 | 表已创建 | 查询表结构 | 包含 id、created、updated、execution_id、work_id、strategy_id、plan_id、plan_retry_count、execution_status、error_info |
| TC-TBL-004 | 内置策略 SIMPLE 和 PLANNING 存在 | 系统初始化后 | 按 strategy_label 查询 | `strategy_label="SIMPLE"` 和 `strategy_label="PLANNING"` 各有一条记录，enable=true |