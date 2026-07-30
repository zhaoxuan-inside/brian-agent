# Orchestration 层集成测试用例

## 测试约定

- 所有方法通过 AOP 代理（AopProxy.wrap）生成代理对象，默认记录日志和耗时
- 集成测试覆盖跨模块的完整调用链路
- 遵循分层解耦约定：编排层不直接调用 LLMProvider、SkillProvider、MCPProvider
- 编排层只指定任务分配给哪个 Agent，不干涉 Agent 内部选择

---

## 1. 端到端工作流

### 1.1 Simple 策略完整流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-001 | Simple 策略端到端执行 | 所有下层模块正常 | `user_query="你好"` | 1. `OrchestrationEntry.receiveWork` 创建 work；2. 自动选择 Simple 策略；3. `OrchestrationStrategy.startOrchestration` 启动；4. `executeSimpleStrategy` 构建并执行 WorkAgent；5. `executePostProcessing` 执行后处理；6. `OrchestrationEntry.finishWork` 完成；7. `output.final_response` 非空 |
| TC-INT-002 | Simple 策略不经过 PlannerAgent | 所有下层模块正常 | `user_query="你好"` | `PlannerAgent.plan` 不被调用 |
| TC-INT-003 | Simple 策略经过 WriterAgent 和 EvolutorAgent | 所有下层模块正常 | `user_query="你好"` | `WriterAgent.write` 被调用，`EvolutorAgent.evalWriterAgent` 被异步调用，`EvolutorAgent.evalWorkAgent` 被异步调用 |

### 1.2 Planning 策略完整流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-004 | Planning 策略端到端执行 | 所有下层模块正常，`PlannerAgent.plan` 返回 3 个子任务 | `user_query` 为复杂任务 | 1. `OrchestrationEntry.receiveWork` 创建 work；2. 自动选择 Planning 策略；3. `PlannerAgent.plan` 拆解 3 个子任务；4. `OrchestrationExecution.buildAgentDAG` 构建 Agent DAG；5. `OrchestrationExecution.execDAG` 按拓扑顺序执行；6. `executePostProcessing` 后处理；7. `output.final_response` 非空 |
| TC-INT-005 | Planning 策略 work 状态流转完整 | 所有下层模块正常 | `user_query` 为复杂任务 | `orchestration_work` 表 status 依次经历 CREATED → PROCESSING → PLANNING → EXECUTING → WRITING → EVALUATING → COMPLETED |
| TC-INT-006 | Planning 策略中 task_count 和 completed_task_count 正确 | 3 个子任务 | `user_query` 为复杂任务 | 拆解后 `task_count=3`，执行过程中 `completed_task_count` 从 0 递增到 3 |

### 1.3 异步工作流

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-007 | 异步提交端到端执行 | 所有下层模块正常，MQ 可用 | `user_query="你好"` | 1. `receiveWorkAsync` 返回 `job_id`；2. Worker 从 MQ 消费消息；3. 调用 `receiveWork` 同步处理；4. 结果写入 `callback_queue`；5. `orchestration_work` 表最终 status="COMPLETED" |
| TC-INT-008 | 异步提交带回调队列 | MQ 可用 | `user_query="你好"`, `callback_queue="work.result"` | 完成后结果发送到 `work.result` 队列 |

---

## 2. 跨模块数据流

### 2.1 上下文传递

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-009 | work_context 从 Entry 传递到 Strategy 到 Execution | 所有模块正常 | `user_query="你好"` | `OrchestrationEntry.buildWorkContext` 产出的 `work_context` 经过 `startOrchestration` → `executeSimpleStrategy` / `executePlanningStrategy` → `execSingleAgent` / `execDAG` 传递 |
| TC-INT-010 | DAG 中上游 Agent 输出传递给下游 | node1→node2 | `user_query` 为复杂任务 | node2 的 `task_content` 前缀包含 node1 的 answer 摘要 |
| TC-INT-011 | agent_results 从 Execution 传递到 Strategy 后处理 | Planning 策略 | `user_query` 为复杂任务 | `execDAG` 返回的 `agent_results` 传递给 `executePostProcessing`，`WriterAgent.write` 和 `EvolutorAgent` 评估均使用该数据 |

### 2.2 InfoCore 数据流

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-012 | REQUEST 和 RESPONSE 信息保存 | 所有模块正常 | `user_query="你好"` | `InfoCore.saveInfo` 被调用至少 2 次：一次 `info_creator_role="REQUEST"`，一次 `info_creator_role="RESPONSE"` |
| TC-INT-013 | Agent 执行信息保存 | 至少 1 个 WorkAgent 执行 | `user_query="你好"` | `InfoCore.saveInfo` 被调用，`info_creator_role="AGENT"`，`info_creator_id=agent_id` |

### 2.3 状态同步

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-014 | Work 状态与子模块状态同步 | Planning 策略 | `user_query` 为复杂任务 | `orchestration_work` 表 status 与 `orchestration_agent_execution` 表各节点 status 保持一致 |
| TC-INT-015 | completed_task_count 与实际完成数一致 | Planning 策略，3 个子任务 | `user_query` 为复杂任务 | 执行完成后 `orchestration_work.completed_task_count = orchestration_agent_execution` 表中 status="COMPLETED" 的记录数 |

---

## 3. 失败与恢复

### 3.1 单点失败

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-016 | Entry 层 receiveWork 失败时 work 状态为 FAILED | `InfoCore.saveInfo` 模拟失败 | `user_query="你好"` | `orchestration_work` 表 status="FAILED"，`error_message` 记录错误 |
| TC-INT-017 | Strategy 层 Agent 构建失败 | `AgentBuilder.buildAgent` 失败 | `user_query="你好"` | `orchestration_work` 表 status="FAILED" |
| TC-INT-018 | Execution 层 Agent 执行失败（Simple 策略） | `AgentExecution.execAgent` 失败 | `user_query="你好"` | `orchestration_work` 表 status="FAILED"，`orchestration_agent_execution` 表对应记录 status="FAILED" |
| TC-INT-019 | Planning 策略中某子任务失败触发 REPLAN | `max_plan_retries=2`，第 1 次失败 | `user_query` 为复杂任务 | `handleDAGFailure` 返回 action="REPLAN"，`PlannerAgent.replan` 被调用，重新构建并执行 |
| TC-INT-020 | Planning 策略中重试耗尽后 FAIL | `max_plan_retries=2`，第 3 次失败 | `user_query` 为复杂任务 | `handleDAGFailure` 返回 action="FAIL"，`orchestration_work` 表 status="FAILED" |

### 3.2 取消与中断

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-021 | 执行中取消 work | work 状态为 EXECUTING | `cancelWork` 调用 | 1. `OrchestrationExecution.cancelExecution` 被调用；2. 所有 PENDING/RUNNING 的 Agent 标记为 CANCELLED；3. `orchestration_work` 表 status="FAILED" |
| TC-INT-022 | 取消后不再执行后续步骤 | work 被取消 | `cancelWork` 调用 | `WriterAgent.write` 和 `EvolutorAgent` 评估不被调用 |

---

## 4. 分层解耦验证

### 4.1 编排层不直接调用底层 Provider

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-023 | 编排层不直接调用 LLMProvider | 正常执行 | 任意 `user_query` | `LLMProvider.execLLM` 不被 Orchestration 层直接调用（仅通过 Agent 层间接调用） |
| TC-INT-024 | 编排层不直接调用 SkillProvider | 正常执行 | 任意 `user_query` | `SkillProvider.execSkill` 不被 Orchestration 层直接调用 |
| TC-INT-025 | 编排层不直接调用 MCPProvider | 正常执行 | 任意 `user_query` | `MCPProvider.execMcp` 不被 Orchestration 层直接调用 |
| TC-INT-026 | 编排层不直接调用 PromptsProvider.execPrompt | 正常执行（策略选择除外） | 任意 `user_query` | 除 `selectOrchestrationStrategy` 中的策略选择 prompt 外，`PromptsProvider.execPrompt` 不被 Orchestration 层直接调用 |

### 4.2 Agent 自主决策

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-027 | 编排层不干涉 Agent 组件选择 | 正常执行 | 任意 `user_query` | 编排层不指定 Agent 使用哪个 LLM、Skill、MCP、Soul——这些由 AgentBuilder + Core 层自主匹配 |
| TC-INT-028 | 编排层不修改 Agent 执行逻辑 | 正常执行 | 任意 `user_query` | 编排层只传递 task_content，不修改 AgentExecution 内部的 Think/Act/Reflect/Answer 循环 |

---

## 5. 并发与异步

### 5.1 并发执行

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-029 | max_concurrent > 1 时并行执行无依赖 Agent | 3 个独立节点，`max_concurrent=3` | `user_query` 为复杂任务 | 3 个 Agent 并行执行，总耗时约等于最慢节点耗时 |
| TC-INT-030 | 并发执行时无共享状态冲突 | 3 个独立节点，`max_concurrent=3` | `user_query` 为复杂任务 | 各 Agent 执行结果独立，无数据错乱 |
| TC-INT-031 | 并发执行时 completed_task_count 正确 | 3 个独立节点 | `user_query` 为复杂任务 | 并发执行完成后 `completed_task_count=3` |

### 5.2 异步执行

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-032 | 异步 DAG 执行不阻塞 | `execDAGAsync` 调用 | `user_query` 为复杂任务 | 立即返回 `job_id`，不等待 DAG 执行完成 |
| TC-INT-033 | 异步 DAG 执行结果回调 | `callback_queue` 指定 | `user_query` 为复杂任务 | DAG 执行完成后结果发送到 `callback_queue` |
| TC-INT-034 | EvolutorAgent 评估异步不阻塞后处理 | 正常执行 | 任意 `user_query` | `EvolutorAgent.evalWriterAgent` 和 `EvolutorAgent.evalWorkAgent` 的异步调用不阻塞 `final_response` 返回 |

---

## 6. 配置一致性

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-035 | orchestration_config 表为整个 Orchestration 层共享 | 系统初始化后 | 查询 `orchestration_config` 表 | 一张表包含 Entry、Strategy、Execution、JSONNode、Visualization 所有子模块的配置字段 |
| TC-INT-036 | 各子模块 config 方法只更新自身相关字段 | 配置表存在 | 分别调用各子模块的 config 方法 | 每个方法只更新其负责的字段，不影响其他模块配置 |

---

## 7. JSONNode 策略与硬编码策略一致性

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-037 | Simple 策略 JSONNode 定义与硬编码执行结果一致 | `jsonnode_definition` 为 Simple 内置定义 | 相同 `user_query` | `execJSONNode` 执行结果与 `executeSimpleStrategy` 直接调用结果一致 |
| TC-INT-038 | Planning 策略 JSONNode 定义与硬编码执行结果一致 | `jsonnode_definition` 为 Planning 内置定义 | 相同 `user_query` | `execJSONNode` 执行结果与 `executePlanningStrategy` 直接调用结果一致 |
| TC-INT-039 | 自定义策略通过 JSONNode 注册后可正常执行 | `addStrategy` 注册合法策略 | `user_query="你好"` | 自定义策略可通过 `startOrchestration` 正常执行 |

---

## 8. 可视化数据完整性

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-040 | 执行完成后可视化数据可查询 | work 状态为 COMPLETED | `visualizeAgentDAG` 调用 | 返回完整的 AgentDAG 结构数据 |
| TC-INT-041 | 执行完成后时间线数据可查询 | work 状态为 COMPLETED | `visualizeWorkFlow` 调用 | 返回完整的阶段时间线数据 |
| TC-INT-042 | Agent 节点详情可查询 | 有 Agent 执行记录 | `getAgentNodeDetail` 调用 | 返回完整的 Agent 节点详情 |
| TC-INT-043 | 可视化数据与执行数据一致 | 正常执行 | 对比可视化数据与执行记录 | `total_elapsed_ms`、各节点状态、耗时等数据一致 |

---

## 9. AOP 代理全链路

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-044 | 全链路 AOP 日志记录 | 所有模块正常 | `user_query="你好"` | 从 `receiveWork` → `startOrchestration` → `execSingleAgent`/`execDAG` → `executePostProcessing` 每个方法调用均记录日志 |
| TC-INT-045 | 全链路耗时统计 | 所有模块正常 | `user_query="你好"` | 每个方法的 `output.elapsed_ms` 非空，`orchestration_work.elapsed_ms` 为总耗时 |
| TC-INT-046 | AOP 拦截器异常不影响全链路 | 某拦截器模拟异常 | `user_query="你好"` | 业务方法正常执行，最终返回 `final_response` |

---

## 10. 极端场景

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-INT-047 | 所有下层模块同时失败 | 模拟所有下层异常 | `user_query="你好"` | `orchestration_work` 表 status="FAILED"，`error_message` 记录错误，异常被捕获 |
| TC-INT-048 | 大量并发 Work 同时提交 | 10 个并发请求 | 10 个 `user_query` | 每个 work 独立创建，`work_id` 不重复，状态独立 |
| TC-INT-049 | 超长文本 user_query（1MB） | 所有模块正常 | `user_query` 为 1MB 文本 | 正常处理，`orchestration_work` 表 `user_query` 完整存储 |
| TC-INT-050 | 空 session_id 新会话 | 无历史会话 | `session_id=""` 或新 UUID | 返回 false 或正常处理新会话 |
| TC-INT-051 | 连续多次同一 session 的 work | 同一 session 已有 5 个历史 work | `user_query="你好"` | `buildWorkContext` 中 `recent_works` 包含最近 5 个 work 摘要 |