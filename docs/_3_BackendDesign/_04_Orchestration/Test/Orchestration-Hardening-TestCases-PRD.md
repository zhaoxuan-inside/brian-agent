# Orchestration 层新增测试用例 PRD（风险加固类）

> 文档类型：测试用例 PRD（Test Case PRD）
> 所属模块：Orchestration
> 父文档：`Orchestration-PRD.md`
> 相关报告：`Orchestration-Test-Report.md §6 风险与建议`
> 生成日期：2026-07-30

---

## 1. 背景与目标

根据《Orchestration 层单元测试报告》第 6 章「风险与后续建议」，当前代码存在 **4 类未覆盖的高风险场景**，本 PRD 将其转化为可落地、可度量的具体测试用例，用于指导后续实现或手动验收测试。

### 1.1 新增测试用例大类编号

| 大类 ID | 大类名称 | 用例数量 | 建议优先级 | 风险来源（报告 §6） |
|---|---|---|---|---|
| **Category-A** | 并发数据传递（并发下的上游输出摘要增强） | 5 | P0 | 报告 §6.1-1 |
| **Category-B** | 嵌套 REPLAN / 无限重试防御 | 8 | P0 | 报告 §6.1-2、§6.2-1 |
| **Category-C** | CANCELLED 事务原子性与回滚 | 6 | P1 | 报告 §6.1-3 |
| **Category-D** | 失败审计日志可观测性 | 5 | P1 | 报告 §6.2 可观测性补充 |

**总用例数：24**

---

## 2. 通用前置条件与依赖

所有用例共用以下前置条件：

1. **SQLite 内存数据库**已初始化，包含 orchestration_*、agent_*、info_* 等完整 schema
2. **外部依赖全部 Mock**：
   - `PlannerAgent.plan` 返回 TaskDAG，`PlannerAgent.replan` 返回去除已完成任务的新 TaskDAG
   - `AgentBuilder.buildAgent` 成功返回 agent_id（需要时可通过 failBuild flag 强制失败）
   - `AgentExecution.execAgent` 支持可选 `sleepMs` 参数模拟耗时，以及 `failExec` flag 模拟失败
   - Logger 的 error / warn / info 方法可用 Vitest Spy 记录调用
3. **时间控制**：对于「超时」相关用例，建议使用 `vi.useFakeTimers()` + `vi.advanceTimersByTime()`（若 execDAG 中 setTimeout 可被劫持；当前实现基于 Date.now 轮询，可通过 mock AgentExecution 延迟触发）；必要时可将 `dag_timeout_ms` 设为极短（如 1ms）并通过微任务阻塞让超时分支命中

---

## 3. Category-A：并发数据传递（并发下的上游输出摘要增强）

> **目标**：当前实现 `concurrency === 1` 时串行模式会把上游 Agent 的 answer 拼接为「上游Agent完成的工作摘要」注入下游 prompt，当 `max_concurrent > 1` 时该增强被跳过。本类用例验证：
> a) 串行模式下增强生效（已有基础覆盖，此处扩展验证内容正确性）
> b) 并发模式下**不产生错误的 prompt**（例如把未完成的上游输出半值写入）
> c) Diamond 拓扑（`a→b, a→c, b→d, c→d`）下 d 点入度不被双重递减且 prompt 汇总正确

### 测试用例列表

| TC 编号 | 用例标题 | 输入 / 预置条件 | 关键断言 |
|---|---|---|---|
| **TC-A-001** | 串行链路 3 节点：下游 prompt 包含上游摘要（严格字符串包含） | DAG: t1→t2→t3，concurrency=1，t1 answer="RESULT_A"，t2 在自己的 task_content 中返回 "RESULT_B" | execAgent 被调用时传入的 task_content（取第 2、3 次）分别包含 "RESULT_A" 和 "RESULT_B"；最终 t3 的输入包含 "RESULT_A" 片段 |
| **TC-A-002** | 串行链路 3 节点：上游 answer 超长截断至 500 字符 | t1 输出 1200 字符长字符串，concurrency=1 | t2 的 prompt 中包含的上游摘要长度不超过 500+10（允许换行符误差），不会因为过长导致 LLM token 溢出 |
| **TC-A-003** | 并发 3 独立节点（无依赖）：prompt 不应包含彼此的内容 | 3 个根节点 t1/t2/t3 无边，concurrency=3，各自回答 "R1"/"R2"/"R3" | 每次 execAgent 的 task_content 中 **不** 出现 "上游Agent完成的工作摘要" 字样（并发下关闭增强是预期行为） |
| **TC-A-004** | Diamond 拓扑并发下 d 的入度计数不双重递减（核心边界用例） | 拓扑 t1→t2, t1→t3, t2→t4, t3→t4，concurrency=2；t2/t3 回答分别 "R2"/"R3" | **最终 agent_results 数量必须 = 4**；t4 仅被执行 1 次（非 2 次、非 0 次）；t4 的 status=COMPLETED（非 CANCELLED） |
| **TC-A-005** | 并发→串行混部：分叉后汇总节点的并发安全 | t1（根，并发第一批）→ t2/t3（并发第二批，max_concurrent=2）→ t4（汇总，需等 t2、t3 均完成） | t4 一定在 t2、t3 均 completed 后才被调度；若 t2 成功、t3 失败则整个 DAG 失败且 t4 不被误调度 |

---

## 4. Category-B：嵌套 REPLAN / 无限重试防御

> **目标**：报告 §6.1-2 指出「REPLAN 后新 DAG 再次失败不会做递归保护」。本类用例覆盖三条已实现的安全网：
> 1. `PlannerAgentService.MAX_TOTAL_REPLAN_DEPTH = 4` 的 parent_plan_id 链深度硬上限
> 2. `handleDAGFailure.loopDetected`：metadata.failure_history 中**相同 failed_task_id + 相同 failure_reason** 重复出现立即 FAIL
> 3. `handleDAGFailure.MAX_GLOBAL_REPLAN = 5`：跨 plan 的 work 维度 REPLAN 总次数上限
> 以及「外层异常恢复」场景

### 测试用例列表

| TC 编号 | 用例标题 | 输入 / 预置条件 | 关键断言 |
|---|---|---|---|
| **TC-B-001** | PlannerAgent.replan：链深度 = 4 时仍允许 | 在 agent_plan 表插入 4 层链（p0 parent null, p1→p0, p2→p1, p3→p2）；replan(input.plan_id=p3) | replan 返回 true；new_plan_id 生成；new_plan_id.parent_plan_id === p3；output.task_dag 非空 |
| **TC-B-002** | PlannerAgent.replan：链深度 = 5 时抛 ValidationError | 预置 5 层链（p0-p4）；replan(input.plan_id=p4) | 抛出 `ValidationError`；错误消息包含 "REPLAN 递归深度超过上限"；**不** 插入任何新 plan 行（查询 count 不变） |
| **TC-B-003** | handleDAGFailure：首次失败 → REPLAN（基线，验证新字段不影响原路径） | work.metadata = `{}`；strategy_execution.plan_retry_count = 0；失败 task=t5 reason="timeout" | handleDAGFailure 返回 `action='REPLAN'`；max_retry_reached=false；metadata.replan_total_count === 1；metadata.failure_history.length === 1 |
| **TC-B-004** | handleDAGFailure：**相同** (task, reason) 再次出现 → 立即 FAIL，触发 LOOP_DETECTED | work.metadata.failure_history 已包含 `{failed_task_id: 't5', failure_reason: 'timeout'}`；再调用相同 task='t5' reason='timeout' | 返回 action='FAIL'；max_retry_reached=true；work.status === 'FAILED'；metadata.replan_abort_reason === 'LOOP_DETECTED'；error_message 包含 "Loop detected" 字样 |
| **TC-B-005** | handleDAGFailure：**相同 task 但不同 reason** → 不算循环，正常 REPLAN（防误杀） | history 已含 (t5, "timeout")；本次失败为 (t5, "null pointer") | 返回 action='REPLAN'；不触发 LOOP_DETECTED；replan_total_count 递增 |
| **TC-B-006** | handleDAGFailure：全局 REPLAN 次数达 5 → MAX_GLOBAL_REPLAN_EXCEEDED 立即 FAIL，**跳过**原有的 plan_retry_count < 2 分支（防止绕开） | work.metadata.replan_total_count=5；plan_retry_count=0（原本会走 REPLAN） | 返回 action='FAIL'；max_retry_reached=true；metadata.replan_abort_reason='MAX_GLOBAL_REPLAN_EXCEEDED'；work.status='FAILED'；**未** 调用 plannerAgent.replan（验证 spy 调用次数 = 0） |
| **TC-B-007** | executePlanningStrategy：新 replan 生成的 DAG 再失败时，**整体最终仍为 FAILED 而非 hang**（集成级） | 构造 plannerAgent.replan 每次返回和上次「同构」的新 DAG（失败任务相同），且 agentExecution.execAgent 始终失败；设置 force_orchestration_strategy=PLANNING | 调用 executePlanningStrategy；最终返回值 = false；strategy_execution.execution_status='FAILED'；不会出现无限递归（测试需在 2s 内返回） |
| **TC-B-008** | 边界：空 failure_history 不触发任何保护；metadata 格式损坏（非 JSON）优雅降级 | work.metadata='garbage text' 或 metadata 为 NULL；首次失败 | 不抛异常；handleDAGFailure 返回 action='REPLAN'（plan_retry_count<2 情况下）；failure_history 被重置为新数组 |

---

## 5. Category-C：CANCELLED 事务原子性与回滚

> **目标**：报告 §6.1-3 指出「超时 CANCELLED 更新是多 UPDATE 循环，非单事务，极端情况下可能出现部分 CANCELLED 部分仍 RUNNING」。本类用例验证：
> a) 正常路径下通过事务一次性提交所有 CANCELLED
> b) 某一条 UPDATE 失败（如列约束冲突）时整批回滚且 fallback 到逐行更新不丢失状态
> c) 失败行数统计（failedCount）在两条路径下保持一致

### 5.1 测试辅助要求（Mock 注入点）

为验证事务回滚，需要在 `SQLiteRelationDBRepository.transaction` 中注入失败：
- 新增 Spy 能力：当 `operations.length > 0 && operations[0].conditions[1].value === 'SIMULATE_ROLLBACK_AGENT'` 时 **抛出 `DatabaseError('simulated rollback')`**
- 或直接通过 `vi.spyOn(relationDb, 'transactionRaw').mockReturnValue(false)` 模拟事务失败返回

### 测试用例列表

| TC 编号 | 用例标题 | 输入 / 预置条件 | 关键断言 |
|---|---|---|---|
| **TC-C-001** | 超时命中：readyQueue=3 节点 + pending=2 节点，**事务成功**路径下所有 5 个节点均为 CANCELLED 且 error_info 相同 | DAG 5 节点：3 个 ready（入度 0）+ 2 个 pending（indegree>0）；dag_timeout_ms=1；让 execAgent 阻塞直到超时（AgentExecution 内部 sleepMs 足够大） | 全部 5 条 orchestration_agent_execution.status === 'CANCELLED'；每条 error_info === 'DAG timeout exceeded'；failedCount === 2（仅 pending 计入 failed_count，ready 不计入） |
| **TC-C-002** | 事务成功路径：已 COMPLETED 的节点不被错误回滚（保持 COMPLETED） | DAG 3 节点 t1/t2/t3；t1 已完成（有 answer），t2/t3 ready；超时 | t1 仍为 COMPLETED 且 answer 保留；t2/t3 = CANCELLED |
| **TC-C-003** | 事务**失败**路径触发 fallback：`relationDb.transactionRaw() = false`，验证 fallback 到原 for-loop 逐行更新逐行更新成功，**结果和事务路径完全一致** | 同 TC-C-001；用 vi.spyOn(relationDb, 'transactionRaw').mockReturnValue(false) | 结果同 TC-C-001：5 条 CANCELLED，2 failedCount；**同时** spyOn 被调用次数 = 1（确实尝试过事务） |
| **TC-C-004** | 事务**抛出异常**路径（非 boolean 错误）：try-catch fallback | spyOn(relationDb, 'transactionRaw').mockImplementation(() => { throw new Error('oops') }) | 不抛到上层；fallback 生效，状态更新完整 |
| **TC-C-005** | timeoutMs = 0 或负数（用户配置错误）：**不** 命中超时分支，正常执行调度 | configOrchestrationExecution.dag_timeout_ms = 0；DAG 3 节点 | 最终 3 节点均 COMPLETED；**无** 任何 CANCELLED 行；status 不含 "DAG timeout exceeded" |
| **TC-C-006** | 空 readyQueue + 空 pending（罕见但安全）：while 退出不抛异常 | DAG 空；或所有节点均已 COMPLETED 后超时 | 不抛异常；不执行任何 UPDATE；数据库状态无变化 |

---

## 6. Category-D：失败审计日志可观测性

> **目标**：保障线上排障能力，验证在各类失败路径下「metadata / error_message / Logger.error / orchestration_agent_execution.error_info」四处关键日志字段被正确写入、不丢失、格式统一。

### 测试用例列表

| TC 编号 | 用例标题 | 输入 / 预置条件 | 关键断言 |
|---|---|---|---|
| **TC-D-001** | 单 Agent 失败：DB 层 + work 层的三处失败字段同时写入一致 | t2 执行失败，reason='LLM rate limit (429)' | 1) orchestration_agent_execution[t2].status='EXEC_FAILED', error_info='Agent execution failed (or 更详细消息)' 2) orchestration_work.metadata.failed_task_id='t2' 3) orchestration_work.metadata.failure_reason 包含 'rate limit' 字样 |
| **TC-D-002** | 超时 CANCELLED：pending vs ready 的 error_info 文案统一（两类节点都为同一字符串） | TC-C-001 场景 | 查询所有 CANCELLED 行的 error_info，按 GROUP BY error_info 聚合，只产生 1 组结果 = 'DAG timeout exceeded' |
| **TC-D-003** | Logger.error / warn 被调用次数：REPLAN（REPLAN 决策） 触发 warn，最终 FAIL 触发 error | 同 TC-B-002 + TC-B-006 两条失败路径（分别跑 2 个 test）；对 logger.error / logger.warn 做 spy | （本项目若 Logger 未使用则跳过）需保证最终 FAILED 状态转移必有一次 warn 或 error 调用，便于线上日志检索 |
| **TC-D-004** | execDAGAsync 中 worker handler 内部错误不丢：MQ Worker 的 catch 分支必须调用 logger.error 并包含 job_id | mqAccess.sendMQ 正常；mqCore.startWorker 实际触发 handler；handler 内部 execDAG 抛错；对 logger.error spy | logger.error 被调用 1 次；错误消息包含 'execDAGAsync: worker handler failed'；额外包含 job_id（可从 payload 或 output.job_id 交叉验证） |
| **TC-D-005** | executePlanningStrategy 顶层 catch 时，**strategy_execution 的 error_info 与 work.error_message 一致**（双写一致性） | execDAG 抛出；上层 handleDAGFailure 走 FAIL 分支 | strategy_execution.error_info === orchestration_work.error_message；且均与 DAG 失败原始 reason 吻合 |

---

## 7. 用例优先级与实现建议

| 优先级 | 建议批次 | 用例数 | 说明 |
|---|---|---|---|
| **P0 必做** | 第 1 批 | 13 | TC-A-001/003/004/005 + TC-B-001/002/003/004/006/007 + TC-C-001/003/005 | 覆盖报告指出的 3 条核心风险：并发数据安全、无限递归防御、CANCELLED 原子事务 |
| **P1 应该做** | 第 2 批 | 7 | TC-A-002 + TC-B-005/008 + TC-C-002/004 + TC-D-001/005 | 增强健壮性与一致性 |
| **P2 按需** | 第 3 批 | 4 | TC-C-006 + TC-D-002/003/004 | 边缘情况与运维可观测补充 |

### 7.1 代码层面的 Mock 注入约定（用于自动化实现）

| 注入点 | 建议做法 | 用途 |
|---|---|---|
| `AgentExecution.execAgent` | 增加可选字段 `__sleepMs` / `__failWithReason`（通过 task_content 内部 JSON 约定） | 模拟超时、模拟失败 |
| `RelationDBAccess.transactionRaw` | `vi.spyOn` 返回 false / throw | 验证 fallback 路径 |
| `PlannerAgent.replan` | 连续多次调用返回 `task_dag` 内容不同（或故意同构以触发 TC-B-004 LOOP_DETECTED） | 模拟循环/非循环 |
| metadata 字段 | JSON.parse 后读取 failure_history / replan_total_count / replan_abort_reason | 验证保护机制是否生效 |

---

## 8. 验收标准（Definition of Done）

1. **代码实现**通过回归：原有 173 个测试不受影响（100% 通过率）；本 PRD 新增 24 个用例的自动化覆盖率 ≥ 80%（即 ≥ 20 个被实现为 `.test.ts`）
2. **防御不改变正常语义**：
   - TC-B-001 等「正常深度、正常次数、非循环」的 REPLAN 用例全部通过 → 证明未影响原有正常重试能力
   - TC-A-003 并发下不开启增强（现有设计保持）
3. **数据库回滚可证**：TC-C-003 中 relationDb.transactionRaw spy 被调用 1 次（尝试事务），且最终状态与 TC-C-001 事务成功路径完全一致
4. **字段双写一致**：TC-D-001/005 中 work.status/message 与 execution 表的状态/错误信息交叉比对一致
