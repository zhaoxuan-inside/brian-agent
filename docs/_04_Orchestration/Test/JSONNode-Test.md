# JSONNode 编排框架 测试用例

## 测试约定

- 所有方法通过 AOP 代理（AopProxy.wrap）生成代理对象，默认记录日志和耗时
- 方法签名：`Boolean methodName(Input input, Context context, Output output)`
- JSONNode 定义支持序列化/反序列化，策略通过引用 jsonnode_definition 定义流程
- 内置节点设计为幂等（多次执行同一节点产生相同效果）
- 节点间通过 shared_data 传递数据，不依赖全局状态

---

## 1. execJSONNode — 执行 JSONNode 编排

### 1.1 Simple 策略执行

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EJN-001 | 执行 Simple 策略 JSONNode 定义 | `jsonnode_definition` 为 Simple 策略定义，`initial_data` 含 `user_query`、`session_id`、`work_id`、`interact_id` | 完整参数 | `output.shared_data.final_response` 非空，`output.execution_trace` 包含所有节点的执行记录，返回 true |
| TC-EJN-002 | Simple 策略节点执行顺序 | 正常执行 | Simple 策略定义 | 执行顺序为 node_1 → node_2 → node_3 → node_4 → node_5 → node_6 → node_7（或 node_8 错误路径） |
| TC-EJN-003 | Simple 策略 shared_data 传递 | 正常执行 | Simple 策略定义 | `SAVE_USER_INPUT` 写入 user_query，`BUILD_WORK_CONTEXT` 写入 work_context，`BUILD_WORK_AGENT` 写入 agent_id，`EXEC_AGENT` 写入 agent_answer，`WRITE_RESULT` 写入 final_response |

### 1.2 Planning 策略执行

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EJN-004 | 执行 Planning 策略 JSONNode 定义（多子任务） | `jsonnode_definition` 为 Planning 策略定义，`PlannerAgent.plan` 返回 task_count > 1 | 完整参数 | node_3 后走 false_next（node_5 BUILD_AGENT_DAG），返回 true |
| TC-EJN-005 | 执行 Planning 策略 JSONNode 定义（单子任务） | `jsonnode_definition` 为 Planning 策略定义，`PlannerAgent.plan` 返回 task_count=1 | 完整参数 | node_3 后走 true_next（node_6 BUILD_WORK_AGENT），跳过 node_5 和 node_7 |
| TC-EJN-006 | Planning 策略 CONDITION 分支正确 | `PlannerAgent.plan` 返回 task_count=2 | Planning 策略定义 | `CONDITION` 节点从 shared_data 读取 task_count，EQ 1 为 false，跳转 false_next（node_5） |

### 1.3 初始化与校验

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EJN-007 | 初始化 shared_data 包含 initial_data | `initial_data` 含 `user_query`、`session_id`、`work_id` | 完整参数 | `shared_data` 初始包含所有 initial_data 字段 |
| TC-EJN-008 | 初始化 node_map 包含所有节点 | JSONNode 定义有 8 个节点 | 完整参数 | 执行引擎正确构建 node_map |
| TC-EJN-009 | start_node 不存在于 nodes 中 | `jsonnode_definition.start_node` 指向不存在的 node_id | 完整参数 | 返回 false，校验失败 |
| TC-EJN-010 | true_next / false_next 引用不存在的节点 | `CONDITION` 节点的 `true_next` 指向不存在节点 | 完整参数 | 返回 false，校验失败 |

### 1.4 执行循环

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EJN-011 | next 为 null 时流程结束 | 最后一个节点 next=null | 完整参数 | 执行到该节点后退出循环，返回 true |
| TC-EJN-012 | node_type 未注册时跳转 on_error | 某节点 node_type 为未注册类型 | 完整参数 | 当前节点执行失败，跳转 on_error 节点 |
| TC-EJN-013 | 节点执行成功记录 SUCCESS | 节点正常执行 | 完整参数 | `execution_trace` 中该节点 status="SUCCESS" |
| TC-EJN-014 | 节点执行失败记录 ERROR | 节点 handler 抛出异常 | 完整参数 | `execution_trace` 中该节点 status="ERROR"，包含 error 信息 |
| TC-EJN-015 | 节点执行失败跳转 on_error | 节点执行失败，on_error 存在 | 完整参数 | 跳转到 on_error 指向的节点继续执行 |
| TC-EJN-016 | on_error 不存在时退出循环 | 节点执行失败，on_error 不存在 | 完整参数 | 退出循环，返回 shared_data 和 execution_trace |
| TC-EJN-017 | execution_trace 记录节点耗时 | 正常执行 | 完整参数 | 每条 trace 记录包含 `elapsed_ms` 字段 |

### 1.5 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EJN-018 | nodes 为空数组 | `jsonnode_definition.nodes=[]` | 完整参数 | 返回 false 或空结果 |
| TC-EJN-019 | 执行深度超过 max_execution_depth | `max_execution_depth=50`，循环执行超过 50 个节点 | 完整参数 | 中断执行，跳转 on_error 或返回 false |
| TC-EJN-020 | 单节点执行超时 | `node_timeout_ms` 设置，某节点执行超过限制 | 完整参数 | 中断当前节点，跳转 on_error |
| TC-EJN-021 | shared_data 读写正确 | 正常执行 | 完整参数 | 后续节点能读取前面节点写入的 shared_data 字段 |
| TC-EJN-022 | 错误信息注入 shared_data._error | 节点执行失败 | 完整参数 | `shared_data._error` 包含错误信息 |

---

## 2. 内置原子节点类型测试

### 2.1 SAVE_USER_INPUT — 保存用户输入

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-SUI-001 | 保存用户输入 | `shared_data.user_query` 非空 | `params={ info_creator_role: "REQUEST", update_work_status: "CREATED" }` | `InfoCore.saveInfo` 被调用，`info_creator_role="REQUEST"`，`RelationDBProvider.updateDB` 更新 status |
| TC-SUI-002 | update_work_status 为 PROCESSING | 正常执行 | `params.update_work_status="PROCESSING"` | `orchestration_work` 表 status 更新为 "PROCESSING" |

### 2.2 BUILD_WORK_CONTEXT — 构建工作上下文

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-BWC-001 | 构建工作上下文 | `OrchestrationEntry.buildWorkContext` 可用 | `params={ max_recent_works: 5, include_user_profile: true }` | `OrchestrationEntry.buildWorkContext` 被调用，`shared_data.work_context` 被写入 |
| TC-BWC-002 | include_user_profile=false | 正常执行 | `params.include_user_profile=false` | `OrchestrationEntry.buildWorkContext` 被调用且不包含 user_profile |

### 2.3 SELECT_STRATEGY — 选择编排策略

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-SS-001 | 选择策略 | `OrchestrationEntry.selectOrchestrationStrategy` 可用 | `params={ complexity_decompose_threshold: 50 }` | `OrchestrationEntry.selectOrchestrationStrategy` 被调用，`shared_data` 写入 `strategy`、`complexity`、`reason` |

### 2.4 CONDITION — 条件分支

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-COND-001 | EQ 操作符 true | `shared_data.strategy="PLANNING"` | `params={ field: "strategy", operator: "EQ", value: "PLANNING" }` | 跳转到 `true_next` |
| TC-COND-002 | EQ 操作符 false | `shared_data.strategy="SIMPLE"` | `params={ field: "strategy", operator: "EQ", value: "PLANNING" }` | 跳转到 `false_next` |
| TC-COND-003 | NE 操作符 true | `shared_data.strategy="SIMPLE"` | `params={ field: "strategy", operator: "NE", value: "PLANNING" }` | 跳转到 `true_next` |
| TC-COND-004 | GT 操作符 | `shared_data.complexity=60` | `params={ field: "complexity", operator: "GT", value: "50" }` | 跳转到 `true_next` |
| TC-COND-005 | LT 操作符 | `shared_data.complexity=30` | `params={ field: "complexity", operator: "LT", value: "50" }` | 跳转到 `true_next` |
| TC-COND-006 | GE 操作符 | `shared_data.complexity=50` | `params={ field: "complexity", operator: "GE", value: "50" }` | 跳转到 `true_next` |
| TC-COND-007 | LE 操作符 | `shared_data.complexity=50` | `params={ field: "complexity", operator: "LE", value: "50" }` | 跳转到 `true_next` |
| TC-COND-008 | IN 操作符 true | `shared_data.reason` 包含 "rule" | `params={ field: "reason", operator: "IN", value: "rule" }` | 跳转到 `true_next` |
| TC-COND-009 | IN 操作符 false | `shared_data.reason` 不包含 "rule" | `params={ field: "reason", operator: "IN", value: "rule" }` | 跳转到 `false_next` |
| TC-COND-010 | field 不存在于 shared_data | `shared_data` 无该字段 | `params={ field: "nonexistent", operator: "EQ", value: "x" }` | 跳转到 `false_next` 或 `on_error` |
| TC-COND-011 | 不支持的操作符 | 未知 operator | `params={ operator: "UNKNOWN" }` | 跳转到 `on_error` |

### 2.5 BUILD_WORK_AGENT — 构建 WorkAgent

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-BWA-001 | 构建 WorkAgent | `AgentBuilder.buildAgent` 返回 agent_id | `params={ force_new: false }` | `AgentBuilder.buildAgent` 被调用，`shared_data.agent_ids` 追加 agent_id |
| TC-BWA-002 | force_new=true 强制新建 | 正常执行 | `params={ force_new: true }` | `AgentBuilder.buildAgent` 被调用时 `force_new=true` |
| TC-BWA-003 | AgentBuilder.buildAgent 失败 | 模拟失败 | `params={ force_new: false }` | 跳转到 `on_error` |

### 2.6 EXEC_AGENT — 执行单个 Agent

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EA-001 | 执行 Agent | `OrchestrationExecution.execSingleAgent` 返回 answer | `params={ agent_id_key: "current_agent_id", save_result_key: "agent_answer" }` | `shared_data.agent_answer` 被写入 answer |
| TC-EA-002 | agent_id_key 对应的值不存在 | `shared_data` 无 `current_agent_id` | `params` 同上 | 跳转到 `on_error` |

### 2.7 PLAN_WORK — 规划任务

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-PW-001 | 规划任务 | `PlannerAgent.plan` 返回 plan_id 和 task_dag | `params={ save_plan_key: "plan_result" }` | `shared_data.plan_result` 包含 plan_id 和 task_dag，`orchestration_work` 表 status="PLANNING" |
| TC-PW-002 | PlannerAgent.plan 失败 | 模拟失败 | `params` 同上 | 跳转到 `on_error` |

### 2.8 BUILD_AGENT_DAG — 构建 Agent DAG

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-BAD-001 | 构建 Agent DAG | `OrchestrationExecution.buildAgentDAG` 返回 agent_dag | `params={ plan_key: "plan_result", save_agent_dag_key: "agent_dag" }` | `shared_data.agent_dag` 被写入 agent_dag |
| TC-BAD-002 | plan_key 对应的值不存在 | `shared_data` 无 `plan_result` | `params` 同上 | 跳转到 `on_error` |

### 2.9 EXEC_DAG — 执行 Agent DAG

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-ED-001 | 执行 DAG | `OrchestrationExecution.execDAG` 返回 agent_results | `params={ agent_dag_key: "agent_dag", max_concurrent: 1, save_results_key: "agent_results" }` | `shared_data.agent_results` 被写入 agent_results |
| TC-ED-002 | agent_dag_key 对应的值不存在 | `shared_data` 无 `agent_dag` | `params` 同上 | 跳转到 `on_error` |

### 2.10 WRITE_RESULT — WriterAgent 写作

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-WR-001 | 写作结果 | `WriterAgent.write` 返回 response | `params={ agent_results_key: "agent_results", save_response_key: "final_response" }` | `shared_data.final_response` 被写入 response |
| TC-WR-002 | WriterAgent.write 失败 | 模拟失败 | `params` 同上 | 跳转到 `on_error` |

### 2.11 EVAL_RESULT — EvolutorAgent 评估

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-ER-001 | 异步评估（async=true） | `EvolutorAgent` 可用，`MQProvider.sendMQ` 可用 | `params={ agent_results_key: "agent_results", final_response_key: "final_response", async: true }` | 通过 MQ 投递评估任务，不等待结果，继续执行下一个节点 |
| TC-ER-002 | 同步评估（async=false） | `EvolutorAgent` 可用 | `params={ async: false }` | 同步调用 `EvolutorAgent.evalWorkAgent` / `evalWriterAgent`，等待结果 |
| TC-ER-003 | async=true 时不阻塞流程 | 正常执行 | `params={ async: true }` | 即使评估任务投递失败，也不阻塞主流程（取决于实现） |

### 2.12 SAVE_RESPONSE — 保存最终回复

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-SR-001 | 保存回复 | `shared_data.final_response` 非空 | `params={ response_key: "final_response", update_work_status: "COMPLETED" }` | `InfoCore.saveInfo` 被调用，`info_creator_role="RESPONSE"`，`orchestration_work` 表 status="COMPLETED"，`final_response` 字段已填充 |
| TC-SR-002 | response_key 对应的值不存在 | `shared_data` 无 `final_response` | `params` 同上 | 跳转到 `on_error` 或使用空字符串 |

### 2.13 HANDLE_ERROR — 错误处理

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-HE-001 | 错误处理写入兜底回复 | 正常执行 | `params={ default_response: "抱歉，出错了。", update_work_status: "FAILED" }` | `shared_data.final_response` 为 default_response，`orchestration_work` 表 status="FAILED" |
| TC-HE-002 | 错误处理记录日志 | 正常执行 | `params` 同上 | `LogProvider.error` 被调用 |
| TC-HE-003 | HANDLE_ERROR 节点 next=null | 正常执行 | `params` 同上 | 执行完该节点后流程结束 |

### 2.14 INVOKE — 自定义调用

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INV-001 | 调用已注册的服务 | 服务注册表中存在 `ServiceName.methodName` | `params={ target: "ServiceName.methodName", params: {}, save_result_key: "invoke_result" }` | 函数被调用，返回值写入 `shared_data.invoke_result` |
| TC-INV-002 | 调用未注册的服务 | 服务注册表中不存在 target | `params={ target: "Unknown.service" }` | 跳转到 `on_error` |

---

## 3. getJSONNodeTrace — 获取执行追踪

### 3.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-GJT-001 | 查询执行追踪 | `orchestration_jsonnode_trace` 表有记录 | `orchestration_id` 有效 | `output.trace` 为追踪记录列表，每条含 `node_id`、`node_type`、`status`、`elapsed_ms`、`error_info`，返回 true |
| TC-GJT-002 | 查询无记录的 orchestration_id | 表中无对应记录 | `orchestration_id="nonexistent"` | `output.trace` 为空数组，返回 true |

### 3.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-GJT-003 | trace 包含 SUCCESS 和 ERROR 记录 | 执行中有成功和失败节点 | `orchestration_id` 有效 | `output.trace` 中同时包含 SUCCESS 和 ERROR 状态的记录 |

---

## 4. registerNodeType — 注册节点类型

### 4.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-RNT-001 | 注册自定义节点类型 | `node_type="custom_type"` 不与内置重名，`handler` 为合法函数 | `node_type="custom_type"`, `handler` 有效 | `output.registered=true`，`node_type_registry` 中新增映射，返回 true |
| TC-RNT-002 | 覆盖已注册的自定义节点类型 | `node_type="custom_type"` 已存在 | `node_type="custom_type"`, `handler` 为新的函数 | `output.registered=true`，`node_type_registry` 中 handler 被更新，返回 true |

### 4.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-RNT-003 | node_type 为空 | 无 | `node_type=""` | 返回 false，校验失败 |
| TC-RNT-004 | node_type 与内置节点重名 | 内置节点如 "SAVE_USER_INPUT" | `node_type="SAVE_USER_INPUT"` | 返回 false，校验失败 |
| TC-RNT-005 | handler 不是函数 | 无 | `handler="not_a_function"` | 返回 false，校验失败 |
| TC-RNT-006 | handler 为 null | 无 | `handler=null` | 返回 false，校验失败 |

---

## 5. validate — 校验 JSONNode 定义

### 5.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-VAL-001 | 校验合法的 JSONNode 定义 | Simple 策略定义 | `jsonnode_definition` 为合法定义 | `output.valid=true`，`output.errors=[]`，返回 true |
| TC-VAL-002 | 校验合法的 Planning 策略定义 | Planning 策略定义 | `jsonnode_definition` 为合法定义 | `output.valid=true`，`output.errors=[]`，返回 true |

### 5.2 校验规则失败

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-VAL-003 | version 缺失 | 无 version 字段 | `jsonnode_definition` 缺失 version | `output.valid=false`，`output.errors` 包含 "version 缺失" |
| TC-VAL-004 | version 不为 "1.0" | version="2.0" | `jsonnode_definition.version="2.0"` | `output.valid=false`，`output.errors` 包含版本错误 |
| TC-VAL-005 | start_node 缺失 | 无 start_node 字段 | `jsonnode_definition` 缺失 start_node | `output.valid=false`，`output.errors` 包含 "start_node 缺失" |
| TC-VAL-006 | start_node 不在 nodes 中 | start_node 指向不存在的 node_id | `jsonnode_definition.start_node="nonexistent"` | `output.valid=false`，`output.errors` 包含 "start_node 不存在" |
| TC-VAL-007 | node_id 不唯一 | 两个节点有相同 node_id | `jsonnode_definition` 包含重复 node_id | `output.valid=false`，`output.errors` 包含 "node_id 重复" |
| TC-VAL-008 | node_type 未注册 | 某节点 node_type 为未注册类型 | `jsonnode_definition` 包含非法 node_type | `output.valid=false`，`output.errors` 包含 "node_type 未注册" |
| TC-VAL-009 | next 引用不存在的节点 | 某节点 next 指向不存在的 node_id | `jsonnode_definition` 包含非法 next 引用 | `output.valid=false`，`output.errors` 包含 "next 引用不存在" |
| TC-VAL-010 | on_error 引用不存在的节点 | 某节点 on_error 指向不存在的 node_id | `jsonnode_definition` 包含非法 on_error 引用 | `output.valid=false`，`output.errors` 包含 "on_error 引用不存在" |
| TC-VAL-011 | true_next 引用不存在的节点 | CONDITION 节点 true_next 指向不存在 | `jsonnode_definition` 包含非法 true_next 引用 | `output.valid=false`，`output.errors` 包含 "true_next 引用不存在" |
| TC-VAL-012 | false_next 引用不存在的节点 | CONDITION 节点 false_next 指向不存在 | `jsonnode_definition` 包含非法 false_next 引用 | `output.valid=false`，`output.errors` 包含 "false_next 引用不存在" |
| TC-VAL-013 | DAG 有环 | 节点间存在循环依赖 | 包含环的 `jsonnode_definition` | `output.valid=false`，`output.errors` 包含 "存在环" |
| TC-VAL-014 | 节点缺少 params | 某节点无 params 字段 | `jsonnode_definition` 某节点缺少 params | `output.valid=false`，`output.errors` 包含 "params 缺失" |
| TC-VAL-015 | 多个错误同时返回 | 定义包含多个问题 | 包含多个不合法的 `jsonnode_definition` | `output.valid=false`，`output.errors` 包含所有错误 |

### 5.3 环检测

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-VAL-016 | 直接环（A→B→A） | node1.next=node2, node2.next=node1 | 包含直接环的定义 | `output.valid=false`，检测到环 |
| TC-VAL-017 | 间接环（A→B→C→A） | 三个节点形成循环 | 包含间接环的定义 | `output.valid=false`，检测到环 |
| TC-VAL-018 | 通过 CONDITION 分支形成的环 | CONDITION true_next 形成回边 | 包含分支环的定义 | `output.valid=false`，检测到环 |
| TC-VAL-019 | 无环的合法 DAG | 合法 DAG 定义 | 合法定义 | `output.valid=true`，DFS 未检测到回边 |

---

## 6. configJSONNode — 配置

### 6.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-CJN-001 | 更新 max_execution_depth | `orchestration_config` 表存在 | `max_execution_depth=100` | 配置更新成功，返回当前全部配置，返回 true |
| TC-CJN-002 | 更新 node_timeout_ms | 配置表存在 | `node_timeout_ms=600000` | 配置更新成功，返回 true |
| TC-CJN-003 | 更新 trace_enabled | 配置表存在 | `trace_enabled=false` | 配置更新成功，返回 true |
| TC-CJN-004 | 不传参数查询当前配置 | 配置表存在 | 所有字段不传 | 返回当前配置，不修改任何值，返回 true |

### 6.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-CJN-005 | max_execution_depth 为负数 | 配置表存在 | `max_execution_depth=-1` | 返回 false，校验失败 |
| TC-CJN-006 | max_execution_depth 为 0 | 配置表存在 | `max_execution_depth=0` | 配置更新成功或返回 false（取决于实现） |
| TC-CJN-007 | node_timeout_ms 为负数 | 配置表存在 | `node_timeout_ms=-1` | 返回 false，校验失败 |
| TC-CJN-008 | node_timeout_ms 为 0 | 配置表存在 | `node_timeout_ms=0` | 配置更新成功或不限制 |

---

## 7. 节点幂等性测试

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-IDM-001 | SAVE_USER_INPUT 多次执行 | 正常执行 | 相同参数执行两次 | 两次执行产生相同效果（InfoCore 可能插入两条记录） |
| TC-IDM-002 | BUILD_WORK_CONTEXT 多次执行 | 正常执行 | 相同参数执行两次 | 两次执行产生相同效果 |
| TC-IDM-003 | HANDLE_ERROR 多次执行 | 正常执行 | 相同参数执行两次 | 两次执行产生相同效果（work status 更新两次为 FAILED） |

---

## 8. 错误传播测试

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-EP-001 | 节点错误注入 shared_data._error | 内置节点 handler 抛出异常 | 正常执行 | `shared_data._error` 包含错误信息，供 HANDLE_ERROR 节点使用 |
| TC-EP-002 | 错误链传播 | 多个节点连续失败 | 正常执行 | 每次失败都跳转 on_error，错误信息逐次更新 |
| TC-EP-003 | on_error 节点本身失败 | HANDLE_ERROR 节点 handler 抛出异常 | 正常执行 | 退出循环，记录错误 |

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
| TC-TBL-001 | orchestration_jsonnode_trace 表字段完整性 | 表已创建 | 查询表结构 | 包含 id、created、updated、orchestration_id、node_id、node_type、status、elapsed_ms、error_info |
| TC-TBL-002 | orchestration_jsonnode_trace 表索引 | 表已创建 | 查询索引 | orchestration_id 普通索引 |
| TC-TBL-003 | orchestration_node_type 表字段完整性 | 表已创建 | 查询表结构 | 包含 id、created、updated、node_type、description、handler_module、is_builtin |
| TC-TBL-004 | orchestration_node_type 表 node_type 唯一索引 | 表已创建 | 插入重复 node_type | 插入失败 |
| TC-TBL-005 | 内置节点类型 is_builtin=true | 系统初始化后 | 查询内置节点 | 14 个内置节点类型，is_builtin=true |
| TC-TBL-006 | 内置节点类型不可删除 | 系统初始化后 | 尝试删除 is_builtin=true 的记录 | 操作被拒绝 |