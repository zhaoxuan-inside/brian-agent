# Orchestration 层单元测试报告

> 测试执行日期：2026-07-30
> 测试框架：Vitest (Vitest v1+)
> 数据库模式：SQLite (`:memory:` 内存模式)
> 外部依赖：LLM / MCP / 图数据库 (congraphdb) 均采用 Mock

---

## 1. 测试结果总览

| 指标 | 数值 |
|---|---|
| 测试文件总数 | 6 |
| 测试用例总数 | **173** |
| ✅ 通过数 | **173 (100%)** |
| ❌ 失败数 | 0 |
| ⏭️ 跳过数 | 0 |
| 平均运行时间 | ~850 ms |

### 各模块测试分布

| 测试文件 | 模块 | 用例数 | 状态 |
|---|---|---|---|
| [orchestration-entry.test.ts](../../../../brian-backend/Orchestration/test/orchestration-entry.test.ts) | 入口层 (Entry) | 30 | ✅ 全部通过 |
| [orchestration-strategy.test.ts](../../../../brian-backend/Orchestration/test/orchestration-strategy.test.ts) | 策略层 (Strategy) | 37 | ✅ 全部通过 |
| [orchestration-execution.test.ts](../../../../brian-backend/Orchestration/test/orchestration-execution.test.ts) | 执行层 (Execution) | 51 | ✅ 全部通过 |
| [jsonnode.test.ts](../../../../brian-backend/Orchestration/test/jsonnode.test.ts) | JSONNode 工作流引擎 | 30 | ✅ 全部通过 |
| [orchestration-visualization.test.ts](../../../../brian-backend/Orchestration/test/orchestration-visualization.test.ts) | 可视化层 (Visualization) | 8 | ✅ 全部通过 |
| [orchestration-integration.test.ts](../../../../brian-backend/Orchestration/test/orchestration-integration.test.ts) | 端到端集成 (Integration) | 17 | ✅ 全部通过 |

---

## 2. 测试覆盖详细分析

### 2.1 入口层 (OrchestrationEntry) — 30 用例

| 类别 | 代表用例 | 覆盖内容 |
|---|---|---|
| 同步接收工作 | TC-RW-001/002 | SIMPLE / PLANNING 策略正常执行，验证 work_id / final_response / 数据库 status=COMPLETED |
| 异步接收工作 | TC-RWA-001/002 | receiveWorkAsync 返回 job_id，验证落库 status=CREATED / PROCESSING |
| 策略选择 | TC-SOS-001 ~ TC-SOS-012 | 复杂度分析（阈值上下边界）、SIMPLE/PLANNING/AUTO 三分支、force_* 参数覆盖 |
| 工作上下文 | TC-BWC-001 ~ TC-BWC-004 | recent_works / user_profile 采集、data_source 字段完整性 |
| 工作状态查询 | TC-GWS-001 ~ TC-GWS-008 | 存在/不存在 work_id、列表过滤、分页计数、进度百分比计算 |
| 工作取消 | TC-CW-001 ~ TC-CW-005 | 正常取消、重复取消、已完成取消、不存在 work_id、取消原因持久化 |
| 异步 worker | TC-AW-001 ~ TC-AW-004 | 处理成功/失败重试/忽略已处理/配置为 0 禁用 |
| 表结构 | TC-TBL-001/003 | orchestration_work 与 orchestration_config 字段完整性查询 |
| 数据库回写 | TC-011/013/015 | 错误信息回写 error_message、status=FAILED 时回写、InfoCore REQUEST/RESPONSE 记录 |

---

### 2.2 策略层 (OrchestrationStrategy) — 37 用例

| 类别 | 代表用例 | 覆盖内容 |
|---|---|---|
| 策略启动 | TC-SO-001/002 | SIMPLE / PLANNING 两种策略端到端启动、agent_results 与 final_response 输出 |
| SIMPLE 策略执行 | TC-ESS-001 ~ TC-ESS-008 | buildAgent 失败走 DB FAILED 分支、buildAgent 成功 execAgent 正常、异常捕获 |
| PLANNING 策略执行 | TC-EPS-001 ~ TC-EPS-008 | Planner plan 失败走 DB FAILED、task_dag→buildAgentDAG→execDAG 全链路、retry 状态推进 |
| 后处理 (PostProcessing) | TC-EPP-001 ~ TC-EPP-008 | writerAgent.write 输出合并、evolutorAgent.evalWorkAgent / evalWriterAgent 通过 setImmediate 异步触发断言验证 |
| **DAG 失败恢复** | **TC-HDF-001 / TC-HDF-002** | **详见 §3** |
| 配置读取 | TC-CS-001/002 | 读取 config 表、返回默认值兜底 |
| 策略 CRUD | TC-GS-001~006 / TC-US-005 / TC-CSOS-007 | strategy_label / strategy_id 查询、不存在返回空数组、update 不存在策略抛异常、负数配置抛 ValidationError |

---

### 2.3 执行层 (OrchestrationExecution) — 51 用例

| 类别 | 代表用例 | 覆盖内容 |
|---|---|---|
| 单 Agent 构建 | TC-BA-001 ~ TC-BA-009 | 正常构建、force_new、已有 Agent 复用、空 task_content、重复构建、failBuild 分支 |
| 单 Agent 执行 | TC-ESA-001 ~ TC-ESA-010 | 正常回答、空 task_content 直接返回 false、failExec 状态更新 EXEC_FAILED、上游摘要拼接 |
| DAG 构建 | TC-BD-001 ~ TC-BD-008 | task_count=1 / 多个 task、dependencies 映射、task_agent_map、DAG 落库到 orchestration_task_agent / agent_dag_record |
| **DAG 并发执行** | **TC-ED-007 / TC-ED-010 / TC-INT-029** | **详见 §3** |
| DAG 边界情况 | TC-ED-019/020/021 | 空 DAG / 单个节点 / plan_id 关联查询 |
| 异步调度 | TC-EDA-001 ~ TC-EDA-005 | MQ send / worker 启动 / 回调 / callback_queue 通知 / 无 MQ 走 local fallback |
| DAG 进度 | TC-GDP-001 ~ TC-GDP-008 | RUNNING / COMPLETED / FAILED / CANCELLED 多状态聚合、pending/running/successful/failed 四元组统计、overall% 计算 |
| 配置 | TC-COE-001 ~ TC-COE-009 | max_concurrent / dag_timeout_ms / default_max_iterations 正常更新、负数/0/超大数边界校验 |

---

### 2.4 JSONNode 工作流引擎 — 30 用例

| 类别 | 代表用例 | 覆盖内容 |
|---|---|---|
| 定义 | TC-VJN-001 ~ TC-VJN-008 | 缺失 start_node / 未知引用节点 / 重复 id / 空定义 / 版本号 / 有效定义、自环 on_error 拒绝 |
| 节点类型管理 | TC-RJNT-001 ~ TC-RJNT-006 | 自定义注册、重复注册被拒绝、BUILTIN 类型不可注册、空参数校验、查询接口 |
| 执行引擎 | TC-EJN-001 ~ TC-EJN-010 | 简单线性链 (S1→S2→S3)、condition 分支 true/false 两向、unknown node_type 走 on_error |
| 失败恢复 | TC-EJN-007/008 | on_error 跳 HANDLE_ERROR 节点后执行 `default_response` 落到 `shared_data.final_response` |
| 配置与 trace | TC-GJN-003 / TC-CJN-001~006 | trace 查询、max_execution_depth/node_timeout_ms/trace_enabled 配置校验、负数参数抛错 |
| 配置 | TC-CJN-007/008 | max_nodes_in_graph / trace_enabled 边界值（0、负数）ValidationError |

---

### 2.5 可视化层 (OrchestrationVisualization) — 8 用例

| 代表用例 | 覆盖内容 |
|---|---|
| TC-VAD-001/002 | 正常 DAG 可视化（节点+边+元数据）、空 DAG 兜底返回 |
| TC-GAH-001/002 | Agent 执行历史按时间倒序、不存在 work_id 返回空列表 |
| TC-GWP-003/004 | 整体进度：status+elapsed_ms、task_count/completed_task_count 百分比估算 |
| TC-GWO-005/006 | 工作项概览（多字段聚合）、不存在 work_id 返回 null |

---

### 2.6 端到端集成 (Integration) — 17 用例

| 类别 | 代表用例 | 覆盖内容 |
|---|---|---|
| 端到端工作流 | TC-INT-001~004 | 简单问题 SIMPLE、复杂任务 PLANNING（JSONNode 为空时自动 fallback 到直接执行） |
| 跨模块数据流 | TC-INT-009 / TC-INT-012 | work_context 完整传递链路 Entry→Strategy→Execution、InfoCore 中 REQUEST/RESPONSE 角色记录 |
| 策略交互 | TC-INT-017 | PlannerAgent 构建失败时 Strategy 层自动降级为硬编码直接执行分支 |
| 异步 | TC-INT-026 | receiveWorkAsync 返回 job_id，落库确认异步任务创建 |
| **并发** | **TC-INT-029** | **无依赖 DAG 以 max_concurrent=3 并行执行，output.agent_results 长度等于节点数** |
| 数据完整性 | TC-INT-033 | orchestration_work status 终态迁移 CREATED→PROCESSING→COMPLETED |
| Evolutor 异步评估 | TC-INT-034 | flushAllCallbacks 后验证 evalWriterAgent / evalWorkAgent 被调用 |
| 策略切换 | TC-INT-040/041 | force_orchestration_strategy 覆盖默认策略、空策略走 AUTO 默认 |
| 边界极端场景 | TC-INT-044/047/050 | 超长用户查询/JSONNode 自定义坏节点注入/空 session_id 创建新会话，均走 HANDLE_ERROR 并降级返回默认输出 |

---

## 3. ⚠️ 核心逻辑深度说明（并发执行与 DAG 失败恢复）

> **这是用户特别关注的内容，本章节详述机制、算法、状态迁移、失败分支和 DB 回写。**

---

### 3.1 并发执行 (execDAG 执行引擎)

**代码位置**：[OrchestrationExecutionService.ts:execDAG](../../../../brian-backend/Orchestration/OrchestrationExecution/application/OrchestrationExecutionService.ts#L380-L605)

#### 3.1.1 算法数据结构

| 结构名 | 类型 | 用途 |
|---|---|---|
| `adjList` | `Map<agent_id, agent_id[]>` | 邻接表，出边 |
| `indegree` | `Map<agent_id, number>` | 入度表，为 0 表示可执行 |
| `incomingMap` | `Map<agent_id, agent_id[]>` | 反向入边表，用于串行模式取上游输出 |
| `readyQueue` | `AgentNode[]` | 可执行节点队列（FIFO），初始为入度 0 的节点 |
| `nodeMap` | `Map<agent_id, AgentNode>` | id→对象 O(1) 查找 |
| `agentOutputs` | `Record<agent_id, answer>` | 已完成节点的 answer，用于下游 prompt 增强 |
| `results` | `AgentResult[]` | 最终返回的执行结果集合 |
| `concurrency` | `number` | = `max_concurrent` 参数或配置默认值 (1) |
| `timeoutMs` | `number` | DAG 超时，默认 `dag_timeout_ms=300000` (5 min) |

#### 3.1.2 拓扑调度算法 (Kahn)

```
1. adjList + indegree + incomingMap 三表初始化
2. readyQueue = 所有 indegree=0 的节点（即根任务）
3. while readyQueue 非空 && 未超时:
   a. 取 batch = readyQueue.splice(0, concurrency)
   b. 分支 1: batch.length === 1 → 串行
      - execOne(batch[0])
      - 推进该节点的所有 downstream: indegree[down]--; 若 === 0 入队
   c. 分支 2: batch.length > 1 → 并发
      - Promise.allSettled(batch.map(execOne))
      - 对每个 fulfilled 结果 push + 推进 downstream
      - 任何 rejected → batchFailure 标记
   d. batchFailure 存在则抛出聚合异常，终止 DAG
4. 循环正常结束：agent_results = results, failed_count 输出
```

#### 3.1.3 串行模式下的数据增强（关键质量保障）

当 `concurrency === 1` 时，进入单任务执行模式，保证了**强顺序执行和上游数据传递**：

> 代码片段 [OrchestrationExecutionService.ts#L431-L444](../../../../brian-backend/Orchestration/OrchestrationExecution/application/OrchestrationExecutionService.ts#L431-L444)

```
for upId of incomingMap[currentAgent]:
   if agentOutputs[upId]:
       upstreamSummary += (agentOutputs[upId].slice(0, 500) + '\n')
enhancedContent =
   `上游Agent完成的工作摘要：
    ${upstreamSummary}
    ---
    当前任务：${task_content}`
```

此机制保证了 **DAG 链式依赖（a10→a11→a12）中，下游 a11/a12 能看见 a10 的输出摘要（截断 500 字符防溢出）**。测试验证：TC-ED-010 用结果顺序断言 `ids.indexOf('a10') < ids.indexOf('a11') < ids.indexOf('a12')`，拓扑严格保持。

#### 3.1.4 并发模式下的容错（Promise.allSettled）

`max_concurrent > 1` 时采用 `Promise.allSettled` + `batchFailure` 两阶段：
- **fulfilled**：正常收集结果并推进下游（即使 batch 内其他节点失败，已完成节点仍然有效）
- **rejected**：标记 batchFailure，但不立刻终止，让同批次中其他已在途任务自然完成
- **批次末尾**：如果 batchFailure 非空，抛出携带 `completed_results` 的异常对象，Strategy 层可据此恢复

#### 3.1.5 单 Agent 失败即终止 (Fail-Fast)

> 代码片段 [OrchestrationExecutionService.ts#L457-L484](../../../../brian-backend/Orchestration/OrchestrationExecution/application/OrchestrationExecutionService.ts#L457-L484)

`execOne` 返回 `false` 时：
1. `orchestration_agent_execution` 表把 RUNNING 更新为 **EXEC_FAILED**
2. `failedCount++`
3. 立即 **throw** 结构化错误对象：

```typescript
{
  failed: true,
  agent_id,            // 哪个 Agent 挂了
  task_id,             // 对应 Plan 中的任务
  reason: 'Agent execution failed',
  failed_count,        // 累计失败数
  completed_results: results.slice(),  // 已完成结果快照，用于后续 REPLAN 跳过
}
```

#### 3.1.6 DAG 超时处理 (DAG Timeout Cancelled)

> 代码片段 [OrchestrationExecutionService.ts#L499-L539](../../../../brian-backend/Orchestration/OrchestrationExecution/application/OrchestrationExecutionService.ts#L499-L539)

每轮 while 开始都检查 `elapsed >= timeoutMs`。触发后：

| 节点类别 | 最终 status | error_info |
|---|---|---|
| 尚在 readyQueue 待执行 | CANCELLED | DAG timeout exceeded |
| indegree>0 且尚无 output（下游阻塞未就绪） | CANCELLED | DAG timeout exceeded |
| 已成功（agentOutputs 有 key） | 保持 COMPLETED | — |

落库保证审计可追溯。TC-COE-005 用例配置 `dag_timeout_ms=1000` 验证边界合法。

#### 3.1.7 覆盖本部分的测试用例

| 用例 ID | 所在文件 | 验证点 |
|---|---|---|
| TC-ED-007 | orchestration-execution.test.ts | max_concurrent=3，3 个独立节点（无边）并发执行结果长度 = 3 |
| TC-ED-010 | orchestration-execution.test.ts | max_concurrent=1 + 链式 3 节点，拓扑严格有序且上游输出摘要被下游使用 |
| TC-INT-029 | orchestration-integration.test.ts | 端到端并发：Entry→Strategy→Execution 全链路，max_concurrent=3 最终输出正确个数 |
| TC-COE-001 | orchestration-execution.test.ts | 配置层 max_concurrent=3 更新成功 |
| TC-COE-007 | orchestration-execution.test.ts | 非法 max_concurrent=-1 抛 ValidationError |
| TC-ESA-007/008 | orchestration-execution.test.ts | execSingleAgent 失败，DB 状态写 EXEC_FAILED，结果向上传播为 false |

---

### 3.2 DAG 调度失败时的恢复逻辑 (handleDAGFailure + 重规划 + 重执行)

**代码位置**：
1. Strategy 层捕获 DAG 异常：[executePlanningStrategy#L444-L501](../../../../brian-backend/Orchestration/OrchestrationStrategy/application/OrchestrationStrategyService.ts#L444-L501)
2. handleDAGFailure 决策函数：[handleDAGFailure#L748-L833+](../../../../brian-backend/Orchestration/OrchestrationStrategy/application/OrchestrationStrategyService.ts#L748)

#### 3.2.1 整体恢复链路

```
execDAG (Execution 层)
   └── 单 Agent 失败 / batchFailure / DAG 超时
          ↓ 抛出结构化 { failed, agent_id, task_id, reason, completed_results }
executePlanningStrategy (Strategy 层 try/catch)
   ├── 提取 failedInfo 字段
   ├── 持久化 orchestration_work.metadata.failed_task_id / failure_reason
   ├── 调用 handleDAGFailure(...) 决策
   │     ├── 分支 A: plan_retry_count >= max_plan_retries (默认 >= 2)
   │     │      → orchestration_work.status = FAILED
   │     │      → error_message = 失败原因
   │     │      → 返回 action: FAIL, max_retry_reached: true
   │     │
   │     └── 分支 B: 未到重试上限
   │            → 调用 PlannerAgent.replan(plan_id, failed_task_id, failure_reason, completed_task_ids)
   │            → 取得新 task_dag
   │            → buildAgentDAG(new_task_dag)
   │            → 返回 new_agent_dag, action: REPLAN, max_retry_reached: false
   │
   ├── 若返回 FAIL  → strategy_execution.execution_status = FAILED，整体 false 返回
   └── 若返回 REPLAN → 用 new_agent_dag **再次调用 execDAG 执行修复版 DAG**，
                       结果合并覆盖 execDagOutput，流程后续按成功处理
```

#### 3.2.2 handleDAGFailure 三步决策

**Step 1 — 失败信息元数据落库（无论哪条分支都先存证据）**

> 代码片段 [OrchestrationStrategyService.ts#L753-L782](../../../../brian-backend/Orchestration/OrchestrationStrategy/application/OrchestrationStrategyService.ts#L753-L782)

从 orchestration_work 取出原 metadata（JSON 字符串），合并：
```
metadata.failed_task_id = input.failed_task_id
metadata.failure_reason = input.failure_reason
```
再写回 orchestration_work.metadata。即使重试最终失败，审计仍然可追溯是哪一个任务导致了整次工作失败、失败原因是什么，以及经历过哪些已完成任务。

**Step 2 — 读取配置（`orchestration_config.max_plan_retries`，默认 2）与当前计划的重试次数**

从 `orchestration_strategy_execution` 表按 `work_id + plan_id` 查询 `plan_retry_count`。测试用例 TC-HDF-002 在调用前手工预置 `plan_retry_count = 2` 越过阈值触发 FAIL 分支验证。

**Step 3 — 双分支**

##### 分支 A：MAX RETRY REACHED → FAIL FAST

```
orchestration_work.status  ← 'FAILED'
orchestration_work.error_message  ← failure_reason
output.action  ← 'FAIL'
output.max_retry_reached  ← true
```

上游 executePlanningStrategy 随后把 `orchestration_strategy_execution.execution_status` 也更新为 FAILED，并将 error 字段携带返回值返回。Entry 层最外层 catch 再对 work 表再次做兜底更新（保证幂等）。

##### 分支 B：WITHIN RETRY → REPLAN + RE-EXECUTE

```
调用 plannerAgent.replan(plan_id, failed_task_id, failure_reason, completed_task_ids)
    │
    └─→ 产出 new_task_dag（PlannerAgent 内部根据 completed_task_ids 跳过已成功任务）

buildAgentDAG(new_task_dag)
    │
    └─→ 产出 new_agent_dag（Agent 映射重新构建）

output.action = 'REPLAN'
output.new_agent_dag = new_agent_dag
output.max_retry_reached = false
```

回到 executePlanningStrategy，检测到 `action === 'REPLAN' && new_agent_dag` 存在后，**立即以 new_agent_dag 重新调用 execDAG 执行第二趟**，结果直接覆盖原输出，后续 executePostProcessing 按成功处理。

#### 3.2.3 "已完成任务"保护

重规划请求中传递了 `completed_task_ids`，PlannerAgent mock 返回的 replan 只包含未完成任务。这保证了已成功的 Agent 不会被重复执行浪费 token、不会覆盖已写入 orchestration_agent_execution 的 COMPLETED 记录，也不会破坏 answer 历史顺序。

#### 3.2.4 覆盖本部分的测试用例

| 用例 ID | 所在文件 | 验证点 |
|---|---|---|
| TC-HDF-001 | orchestration-strategy.test.ts | **首次失败**：plan_retry_count=0 < max(2)，返回 `action='REPLAN'`, `max_retry_reached=false` |
| TC-HDF-002 | orchestration-strategy.test.ts | **重试上限**：预置 plan_retry_count=2，调用后 orchestration_work.status 变为 FAILED，max_retry_reached=true |
| TC-EPS-007 | orchestration-strategy.test.ts | **Planner plan 失败**：executePlanningStrategy 直接走 FAILED 回写，不进入 DAG |
| TC-ESA-007/008 | orchestration-execution.test.ts | **Execution 层失败触发**：agentExecution.execAgent failExec=true，DB 落 EXEC_FAILED |
| TC-INT-047 | orchestration-integration.test.ts | **集成级故障注入**：自定义 JSONNode 缺少 start_node，引擎走 on_error HANDLE_ERROR，Entry 层仍以 success=true 降级返回默认响应 |
| TC-INT-017 | orchestration-integration.test.ts | **AgentBuilder 构建失败**：硬编码路径被正确命中并产生可降级结果 |

---

## 4. Mock 架构说明

### 4.1 Mock 的依赖层次

```
Orchestration 测试 (Vitest + Node in-memory SQLite)
├─ 下层服务（Agent/Core）通过 Access 层代理，不直接依赖真实实现
│   ├─ PlannerAgent.mock   : plan/replan 方法返回 TaskDAG（taskCount 默认 3）
│   ├─ WriterAgent.mock    : write 返回合并字符串响应
│   ├─ EvolutorAgent.mock  : evalWriterAgent / evalWorkAgent 用 setImmediate 异步
│   ├─ AgentBuilder.mock   : buildAgent 返回递增 agent_id
│   ├─ AgentExecution.mock : execAgent 返回 trace_id / iterations / elapsed_ms
│   ├─ AgentLibrary.mock   : hasAgent=true（存在复用 Agent）
│   ├─ InfoCore.mock       : saveInfo / saveInfoBatch 静默成功（用于 REQUEST/RESPONSE 断言）
│   ├─ MQAccess / MQCore.mock : sendMQ / getWorker / startWorker 空实现或 local handler
│   ├─ LLMAccess / PromptsAccess.mock : 外部 LLM / 模板系统占位
│   └─ Logger.mock         : 可打印 DEBUG 日志，也可断言 error/warn 被调用
│
├─ 内部第三方组件（真实数据落库）
│   ├─ SQLite（关系型）: 真实 :memory: 数据库，按 Access API 操作，不做 mock
│   ├─ VectorDB         : 未在 Orchestration 直接使用，无 mock 需求
│   ├─ GraphDB(congraphdb) : 因 Linux 无原生二进制，用 vitest alias 指向 __mocks__/congraphdb.js
│   │                     ⚠️ 注意：这与 Core 层使用的 mock 机制完全一致，非本次测试特殊引入
│   └─ MQ               : 真实对象但 transport 层 mocked，队列消息在 Access 对象内处理
│
└─ 外部组件（一律 mock）
    ├─ MCPProvider  → 通过 AgentExecution 已 mock，不触达真实 MCP Server
    └─ LLMProvider  → 通过 LLMAccess 已 mock，不触达任何真实 API Key / endpoint
```

### 4.2 Mock 清理与恢复

- `beforeEach` / `afterEach` 使用 `vi.clearAllMocks()`：**清除调用历史但保留 mock 实现**（避免 IdGenerator 被 restoreAllMocks 还原后 DB 主键冲突）。
- 外部组件的 Mock 是通过测试对象工厂（`createMock*` 系列）注入到 Access 构造函数里的——和生产代码的"读取外部 LLM/MCP 实际实例"路径完全隔离。因此 **Mock 数据不会污染生产，也不需要"恢复正确调用代码"**。生产环境构造 Access 时会注入真实的 Provider 实例。
- congraphdb mock 是通过 vitest.config.ts `resolve.alias` 方式全局替换的，**只在测试运行时生效**，不影响 dist 产物或生产 require。

---

## 5. 数据库表结构与验证

共创建 20+ 张表与 20+ 索引。关键表验证通过：

### 5.1 orchestration_work（工作主表）

| 字段 | 类型 | 约束 | 用途 |
|---|---|---|---|
| id | TEXT | PK | 行主键 |
| work_id | TEXT | UNIQUE | 业务主键，外键关联全系统 |
| interact_id | TEXT | NOT NULL | 一次交互 id（会话内递增） |
| session_id | TEXT | NOT NULL + INDEX | 用户会话 id |
| user_query | TEXT | NOT NULL | 用户原始请求 |
| status | TEXT | NOT NULL + INDEX | CREATED / PROCESSING / COMPLETED / FAILED / CANCELLED |
| orchestration_strategy | TEXT | NOT NULL | SIMPLE / PLANNING |
| task_count / completed_task_count | INTEGER | NOT NULL | 进度追踪（百分比计算） |
| elapsed_ms | INTEGER | NOT NULL | 总耗时 ms |
| cancel_reason / error_message | TEXT | NULL | 取消 / 失败原因 |
| **final_response** | TEXT | NULL | **最终用户可见回答**（Entry 层从此读回） |
| metadata | TEXT | NULL | JSON 扩展字段：存 failed_task_id / failure_reason 等 |

### 5.2 orchestration_agent_execution（Agent 执行审计表）

| 字段 | 类型 | 约束 | 用途 |
|---|---|---|---|
| id | TEXT | PK | 行主键 |
| work_id | TEXT | NOT NULL + INDEX | 外键关联工作 |
| agent_id | TEXT | NOT NULL + INDEX | 执行的 Agent id |
| plan_id / task_id | TEXT | NULL + INDEX | Plan 层任务与计划 id |
| execution_type | TEXT | NOT NULL | SINGLE / DAG 标识 |
| task_content | TEXT | NOT NULL | 实际交给 Agent 的 prompt（含上游摘要增强） |
| status | TEXT | NOT NULL + INDEX | RUNNING / COMPLETED / EXEC_FAILED / BUILD_FAILED / CANCELLED |
| answer / trace_id / iterations / elapsed_ms | TEXT/INT | NULL | 执行产物与可观测数据 |
| error_info | TEXT | NULL | Agent 执行失败的详细说明（"DAG timeout exceeded" 等） |

### 5.3 关键配套表

- `orchestration_config`：默认配置（max_concurrent=1, dag_timeout_ms=300000, max_execution_depth=50, max_plan_retries=2）
- `orchestration_strategy`：预置 SIMPLE / PLANNING 两种策略的完整 JSONNode 定义
- `orchestration_strategy_execution`：记录 plan_retry_count（handleDAGFailure 阈值判断依据）
- `orchestration_task_agent` / `orchestration_agent_dag` / `orchestration_agent_dag_record`：Plan→Agent 映射与 DAG 持久化
- `orchestration_jsonnode_trace`：每个节点的执行 trace（trace_enabled=1 时落库）
- 下层依赖表：`agent`、`agent_skill`、`info_raw`、`agent_mcp` 等（测试初始化时一并创建，保证跨层 Access 操作不出错）

---

## 6. 风险与后续建议

### 6.1 已在本次测试中覆盖但可增强的点

1. **并发数据完整性**：目前并发模式下 `max_concurrent>1` 时 **不做上游输出摘要增强**（incomingMap 只在 concurrency===1 启用）。复杂 DAG 若希望并发下也传递数据，需要调整此设计（测试已体现当前设计的意图）。
2. **REPLAN 的嵌套重试**：当前实现只做一次"单级"重执行，对 REPLAN 后新 DAG 再次失败的场景未做递归保护（如果需要，可在 handleDAGFailure 内部再次调用自身，但需要防死循环）。
3. **DAG 取消的原子性**：超时触发 CANCELLED 后再处理 pending 节点，不是单事务 SQL，极端情况下可能出现部分 CANCEL 部分仍保留 RUNNING（可改进为事务批量更新）。

### 6.2 未覆盖但建议后续补充

| 方向 | 建议新增测试 |
|---|---|
| 高并发死锁/乱序 | 构造含 diamond 拓扑（a→b, a→c, b→d, c→d）的 DAG，验证并发模式下 d 的入度不会被双重递减 |
| 真实 DAG 超时 | 用 vi.useFakeTimers 让 dag_timeout_ms 提前触发，断言 CANCELLED 落库和 error_info="DAG timeout exceeded" |
| REPLAN 嵌套失败 | 第一次 replan 的 DAG 又失败，验证 handleDAGFailure 最终仍走到 FAIL 分支，不会无限循环 |
| 分布式幂等 | execDAGAsync MQ 消息重复投递，验证不会重复插入 orchestration_agent_execution |

### 6.3 生产部署前检查项

- 从 `:memory:` SQLite 切换为文件 DB 时确认 `PRAGMA journal_mode=WAL` 以提升并发写入性能
- 大 DAG（>50 节点）执行时建议 max_concurrent 不超过 CPU 核数，否则并发上下文切换开销可能高于串行
- EvolutorAgent 的异步 setImmediate 评估在生产环境应改为独立 worker（当前测试已覆盖其可被触发的最基本语义）

---

## 7. 运行命令

```bash
cd brian-backend/Orchestration

# 一次性运行全部 173 个测试
npm run test

# 运行单个模块
npx vitest run test/orchestration-execution.test.ts
npx vitest run test/orchestration-strategy.test.ts

# 查看 DEBUG 级日志（默认已打印 selectDB / insertDB / updateDB 调用）
npm run test 2>&1 | grep -E 'selectDB|insertDB|updateDB'
```
