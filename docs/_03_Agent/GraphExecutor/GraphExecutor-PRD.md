# GraphExecutor（图执行器）

## 1. 设计目标

1. **任务图执行框架**：以有向图（DAG）作为任务编排的基础数据结构，支持节点（GraphNode）与边（GraphEdge）的动态构建，驱动多 Agent 协作的任务执行。
2. **拓扑排序与环路检测**：基于 Kahn 算法（入度表 + BFS）对任务图进行拓扑排序，确定节点执行顺序；通过排序结果与 DFS 检测环路，保证任务图无环可执行。
3. **并行执行与同步屏障**：借鉴 Pregel BSP（批量同步并行）模型，对无依赖关系的就绪节点进行 fanOut 并行执行，通过 barrier 同步屏障汇聚，再经 reduce 归约结果。
4. **检查点与恢复**：在执行迭代间创建状态检查点（深拷贝 GraphState），支持失败时回滚到历史检查点，保证执行可恢复。
5. **反射评估与策略切换**：每个节点执行后调用 Reflector 进行质量评估（qualityScore），低质量时触发重试与策略切换（react <-> plan-execute <-> cot），实现自适应执行。
6. **条件路由**：支持条件边（ConditionalEdge），基于 GraphState 动态评估条件函数，实现运行时分支路由。
7. **子 Agent 生成**：支持在执行过程中派生子 Agent（spawnSubAgent）处理子任务，并聚合结果（aggregateResults），支撑任务分解与并行处理。

---

## 2. 功能设计

### 2.1. 创建有向图（createGraph）

**功能**：基于节点列表与边列表创建一个任务图（TaskGraph）对象，作为执行框架的输入。

**入参**：
- input：CreateGraphInput（继承 Input），包含以下字段：
  - nodes：节点数组
  - edges：边数组
- context：CreateGraphContext（继承 Context），执行上下文
- output：CreateGraphOutput（继承 Output），承载返回内容：
  - graph：创建的 TaskGraph 对象

**处理流程**：

1. 浅拷贝 nodes 与 edges，构建 TaskGraph 对象；
2. 将 TaskGraph 写入 output 返回；

**返回**：Boolean，表示任务图创建是否完成

---

### 2.2. 添加节点（addNode）

**功能**：向任务图中追加一个节点。

**入参**：
- input：AddNodeInput（继承 Input），包含以下字段：
  - graph：任务图
  - node：待添加节点（含 id、agent、inputMapper、outputReducer）
- context：AddNodeContext（继承 Context），执行上下文
- output：AddNodeOutput（继承 Output），承载返回内容：
  - graph：更新后的任务图

**处理流程**：

1. 将 node 追加到 graph.nodes 数组末尾；

**返回**：Boolean，表示节点添加是否完成

---

### 2.3. 添加边（addEdge）

**功能**：向任务图中追加一条边（顺序/条件/并行/循环）。

**入参**：
- input：AddEdgeInput（继承 Input），包含以下字段：
  - graph：任务图
  - edge：待添加边（含 from、to、type、condition、priority）
- context：AddEdgeContext（继承 Context），执行上下文
- output：AddEdgeOutput（继承 Output），承载返回内容：
  - graph：更新后的任务图

**处理流程**：

1. 将 edge 追加到 graph.edges 数组末尾；

**返回**：Boolean，表示边添加是否完成

---

### 2.4. 添加条件边（addConditionalEdge）

**功能**：向任务图中追加一组条件边，每条边携带一个基于 GraphState 的条件函数，用于运行时路由。

**入参**：
- input：AddConditionalEdgeInput（继承 Input），包含以下字段：
  - graph：任务图
  - from：起始节点 id
  - conditions：条件列表（每项含 condition 函数与 to 目标节点 id）
- context：AddConditionalEdgeContext（继承 Context），执行上下文
- output：AddConditionalEdgeOutput（继承 Output），承载返回内容：
  - graph：更新后的任务图

**处理流程**：

1. 遍历 conditions 列表；
2. 对每条条件，构造边对象 `{ from, to, type: 'conditional', condition }`，追加到 graph.edges；

**返回**：Boolean，表示条件边添加是否完成

---

### 2.5. 拓扑排序（topologicalSort）

**功能**：基于 Kahn 算法（入度表 + BFS 队列）对任务图进行拓扑排序，返回节点 id 的执行顺序数组。

**入参**：
- input：TopologicalSortInput（继承 Input），包含以下字段：
  - graph：任务图
- context：TopologicalSortContext（继承 Context），执行上下文
- output：TopologicalSortOutput（继承 Output），承载返回内容：
  - sorted_ids：节点 id 排序数组（检测到环路时返回空数组）
  - has_cycle：是否存在环路

**处理流程**：

1. 收集所有节点 id，初始化入度表（inDegree）与邻接表（adjacency），入度均置 0；
2. 遍历所有边，对每条有效边（from 与 to 均在节点集合内），将 to 节点入度 +1，加入 from 节点的邻接表；
3. 将入度为 0 的节点入队（BFS 队列）；
4. 循环出队：取出当前节点加入 sorted，遍历其邻接节点，邻接节点入度 -1，入度归 0 则入队；
5. 若 sorted 长度等于节点总数，写入 output 返回（无环）；
6. 若不等，说明存在环路，返回空数组；

**返回**：Boolean，表示拓扑排序是否完成；是否存在环路通过输出是否为空判断

---

### 2.6. 检测环路（detectCycle）

**功能**：检测任务图中是否存在环路，存在时返回环路节点 id 列表，不存在时返回空。

**入参**：
- input：DetectCycleInput（继承 Input），包含以下字段：
  - graph：任务图
- context：DetectCycleContext（继承 Context），执行上下文
- output：DetectCycleOutput（继承 Output），承载返回内容：
  - cycles：环路列表 string[][]（无环时为空）

**处理流程**：

1. 调用 `topologicalSort`，若排序结果长度等于节点总数，则无环，返回空；
2. 若存在环路，构建邻接表，通过 DFS 深度优先遍历检测环路：
   - 维护 visited 集合与当前路径栈 stack；
   - 若当前节点已在 stack 中，说明找到环路，截取 stack 中从该节点起始的部分作为一条环路；
3. 收集所有检测到的环路，写入 output 返回；

**返回**：Boolean，表示环路检测是否完成；是否存在环路通过输出是否为空判断

---

### 2.7. 执行图（executeGraph）

**功能**：任务图执行框架的核心调度入口。对任务图进行拓扑排序，按依赖关系以迭代方式并行执行就绪节点，每个节点执行后进行反射评估与策略切换，最终归约输出。

**入参**：
- input：ExecuteGraphInput（继承 Input），包含以下字段：
  - task_graph：任务图
  - state：GraphState 执行状态
  - callbacks：回调函数（可选，含 onAgentOutput/onAgentStatus/onAgentInput）
  - signal：AbortSignal（可选，用于取消）
- context：ExecuteGraphContext（继承 Context），执行上下文
- output：ExecuteGraphOutput（继承 Output），承载返回内容：
  - final_state：最终的 GraphState（含 finalOutput、qualityScore、trace、errors）

**处理流程**：

1. **拓扑排序**：调用 `topologicalSort` 对任务图排序；若返回空（存在环路），将错误写入 state.errors，finalOutput 置为环路错误信息，返回 state；
2. **构建依赖映射**：构建 nodeMap（id -> node）、depsMap（id -> 依赖列表）、revDepsMap（id -> 反向依赖列表）；
3. **迭代执行**（while completed.size < sorted.length 且 iteration < maxIterations）：
   - 调用 `createCheckpoint` 创建当前迭代检查点；
   - 筛选就绪节点（dependencies 全部已完成且自身未完成）；
   - 若无就绪节点但未全部完成，判定为死锁，写入错误并跳出；
   - 检查 signal.aborted，命中则抛出 AbortError；
   - 调用 `fanOut` 并行执行所有就绪节点（Promise.all）：
     - 对每个节点，根据 agent.strategy 选择执行策略（plan-execute / cot / react）；
     - 用 agent.prompt.system 包装 LLM 调用，注入 agent 上下文；
     - 执行后调用 `reflect` 进行质量评估；
     - 若 reflection.shouldRetry 且未达最大迭代，调用 `switchStrategy` 切换策略重试；
     - 通过 callbacks 回调状态（running/completed/failed）与输出；
   - 将执行结果写入 state.subTaskResults，trace 追加步骤记录；
   - iteration++，更新 state.iterationCount；
4. **归约输出**：遍历 nodeResults，拼接各节点结果为 finalOutput，计算 qualityScore；
5. 将最终 GraphState 写入 output 返回；

**返回**：Boolean，表示图执行是否完成

---

### 2.8. 并行执行（fanOut）

**功能**：基于 BSP 模型，对一组子任务（含 Agent）进行并行执行，通过 Promise.all 同时发起 LLM 调用，汇聚结果。

**入参**：
- input：FanOutInput（继承 Input），包含以下字段：
  - sub_tasks：子任务数组
- context：FanOutContext（继承 Context），执行上下文
- output：FanOutOutput（继承 Output），承载返回内容：
  - results：结果列表 { id, result }[]

**处理流程**：

1. 对每个子任务，构造消息（system: agent.prompt.system，user: agent.prompt.instruction）；
2. 调用 `LLMService.chat` 执行（Promise.all 并行）；
3. 成功返回 `{ id, result: { content, usage } }`；失败返回 `{ id, result: { error } }`；
4. 将结果列表写入 output 返回；

**返回**：Boolean，表示并行执行是否完成

---

### 2.9. 同步屏障（barrier）

**功能**：BSP 模型中的同步屏障，确保所有并行 worker 完成后再进入 reduce 阶段。

**入参**：
- input：BarrierInput（继承 Input），无额外字段
- context：BarrierContext（继承 Context），执行上下文
- output：BarrierOutput（继承 Output），承载返回内容：
  - synced：同步完成标志

**处理流程**：

1. 由于 fanOut 使用 Promise.all，屏障已隐式保证；
2. 本接口提供显式的检查点与日志注入点，立即 resolve；

**返回**：Boolean，表示屏障同步是否完成

---

### 2.10. 归约结果（reduce）

**功能**：将并行执行的结果列表归约为一个合并对象，以子任务 id 为键。

**入参**：
- input：ReduceInput（继承 Input），包含以下字段：
  - results：结果列表 { id, result }[]
- context：ReduceContext（继承 Context），执行上下文
- output：ReduceOutput（继承 Output），承载返回内容：
  - combined：合并后的 Record<string, any>

**处理流程**：

1. 初始化空对象 combined；
2. 遍历 results，将每项 `combined[id] = result`；
3. 将 combined 写入 output 返回；

**返回**：Boolean，表示结果归约是否完成

---

### 2.11. 创建检查点（createCheckpoint）

**功能**：对当前 GraphState 进行深拷贝，生成检查点并存储到 state.checkpoints，返回检查点 id。

**入参**：
- input：CreateCheckpointInput（继承 Input），包含以下字段：
  - state：GraphState
  - label：检查点标签
- context：CreateCheckpointContext（继承 Context），执行上下文
- output：CreateCheckpointOutput（继承 Output），承载返回内容：
  - checkpoint_id：检查点ID

**处理流程**：

1. 生成 UUID 作为 checkpoint_id；
2. 深拷贝 GraphState（taskPlan 逐项拷贝、subTaskResults 新建 Map、memoryContext 逐项拷贝、errors 逐项拷贝、trace 逐项拷贝），checkpoints 置空避免递归；
3. 将检查点存入 state.checkpoints（Map）；
4. 将 checkpoint_id 写入 output 返回；

**返回**：Boolean，表示检查点创建是否完成

---

### 2.12. 恢复检查点（restoreCheckpoint）

**功能**：根据 checkpoint_id 将 GraphState 恢复到历史检查点状态。

**入参**：
- input：RestoreCheckpointInput（继承 Input），包含以下字段：
  - state：GraphState
  - checkpoint_id：检查点ID
- context：RestoreCheckpointContext（继承 Context），执行上下文
- output：RestoreCheckpointOutput（继承 Output），承载返回内容：
  - restored_state：恢复后的 GraphState

**处理流程**：

1. 从 state.checkpoints 中查找 checkpoint_id，不存在则抛出异常；
2. 将检查点的各字段深拷贝回写至当前 state（userMessage、taskPlan、subTaskResults、memoryContext、iterationCount、maxIterations、currentStrategy、qualityScore、qualityThreshold、finalOutput、errors、trace）；
3. 将恢复后的 state 写入 output 返回；

**返回**：Boolean，表示检查点恢复是否完成

---

### 2.13. 反射评估（reflectTask）

**功能**：对节点执行输出进行质量评估，输出质量评分、是否重试、是否切换策略与反馈意见。

**入参**：
- input：ReflectTaskInput（继承 Input），包含以下字段：
  - output：执行输出内容
  - context：任务上下文描述
- context：ReflectTaskContext（继承 Context），LLM 调用上下文
- output：ReflectTaskOutput（继承 Output），承载返回内容：
  - quality_score：质量评分
  - should_retry：是否需要重试
  - should_switch_strategy：是否需要切换策略
  - feedback：反馈意见

**处理流程**：

1. 构造系统消息，要求 LLM 作为质量评估器，从正确性、完整性、清晰度、相关性、有用性评估输出，输出 JSON；
2. 构造用户消息，包含 context 与待评估 output；
3. 调用 `LLMService.chat`（temperature 0.1），从响应中正则提取 JSON 并解析；
4. 解析成功则返回评估结果；失败时回退到启发式评估：
   - 基础分 0.5；输出长度 > 50 字符 +0.1，> 200 字符 +0.1；不含 error/fail/sorry 等词 +0.1；含换行（结构化）+0.1；上限 1.0；
   - qualityScore < 0.5 时 shouldRetry=true；< 0.3 时 shouldSwitchStrategy=true；
5. 将评估结果写入 output 返回；

**返回**：Boolean，表示反射评估是否完成

---

### 2.14. 策略切换（switchStrategy）

**功能**：根据当前策略与反射反馈，切换到下一个执行策略，驱动自适应执行。

**入参**：
- input：SwitchStrategyInput（继承 Input），包含以下字段：
  - current：当前策略名
  - reason：切换原因
- context：SwitchStrategyContext（继承 Context），执行上下文
- output：SwitchStrategyOutput（继承 Output），承载返回内容：
  - new_strategy：切换后的策略名

**处理流程**：

1. 按策略映射表切换：react -> plan-execute、plan-execute -> cot、cot -> react、hybrid -> plan-execute；
2. 将切换后策略名写入 output 返回；

**返回**：Boolean，表示策略切换是否完成

---

### 2.15. 重要内容

所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；

---

## 3. 执行流程与时序

### 3.1. BSP 并行执行模型

GraphExecutor 采用类 Pregel BSP（Bulk Synchronous Parallel）模型进行多 Agent 并行执行：

```
┌─────────────────────────────────────────────────────────┐
│                    GraphExecutor 迭代循环                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. 拓扑排序 → 确定就绪节点列表（入度为 0 且未完成）        │
│                    ↓                                    │
│  2. createCheckpoint   ← 创建检查点（深拷贝 GraphState）    │
│                    ↓                                    │
│  3. fanOut 并行执行所有就绪节点                            │
│     ┌─────────┐  ┌─────────┐  ┌─────────┐               │
│     │ Agent A │  │ Agent B │  │ Agent C │  ← Promise.all │
│     │ execute │  │ execute │  │ execute │               │
│     └────┬────┘  └────┬────┘  └────┬────┘               │
│          │            │            │                    │
│          ├── reflect  ├── reflect  ├── reflect ← 质量评估 │
│          │   (score)  │   (score)  │   (score)          │
│          │            │            │                    │
│          └── switch?  └── switch?  └── switch? ← 策略切换 │
│                    ↓                                    │
│  4. barrier  ← 同步等待所有节点完成（Promise.all 隐式）     │
│                    ↓                                    │
│  5. reduce  ← 归约本轮结果到 GraphState                   │
│                    ↓                                    │
│  6. 标记本轮完成节点，迭代计数 +1，进入下一轮               │
│                    ↓                                    │
│  7. 重复 1-6 直到全部节点完成 或 超时/取消                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.2. 端到端执行时序

以包含 3 个 Agent 节点（A → B, A → C）的简单 DAG 为例，展示完整执行时序：

```
GraphExecutor          生命周期管理            LLMService        Reflector
    │                       │                    │                │
    │  executeGraph(task)   │                    │                │
    │──────────────────────►│                    │                │
    │  topologicalSort()    │                    │                │
    │  → sorted: [A, B, C]  │                    │                │
    │                       │                    │                │
    │  depsMap: {A:[], B:[A], C:[A]}             │                │
    │                       │                    │                │
    │  === 迭代 1 ===        │                    │                │
    │  createCheckpoint()   │                    │                │
    │  → checkpoint_id: ck1 │                    │                │
    │                       │                    │                │
    │  就绪节点: [A]         │                    │                │
    │                       │                    │                │
    │  fanOut([A])          │                    │                │
    │  ├─ activate agent A    │                    │                │
    │  │───────────────────►│                    │                │
    │  │                    │  status: running   │                │
    │  │  LLM chat(A)       │                    │                │
    │  │───────────────────────────────────────►│                │
    │  │                    │                    │  result_A      │
    │  │◄───────────────────────────────────────│                │
    │  │  reflect(result_A) │                    │                │
    │  │────────────────────────────────────────────────────────►│
    │  │                    │                    │  { qualityScore: 0.85, │
    │  │                    │                    │    shouldRetry: false }│
    │  │◄────────────────────────────────────────────────────────│
    │  │  qualityScore=0.85 ≥ 0.7 → 不切换策略  │                │
    │  │  complete agent A    │                    │                │
    │  │───────────────────►│                    │                │
    │  │                    │  status: completed │                │
    │  │                    │                    │                │
    │  barrier() → Promise.all 已解析             │                │
    │  reduce([{A: result_A}])                   │                │
    │  completed.add("A")                        │                │
    │  iteration: 1                              │                │
    │                       │                    │                │
    │  === 迭代 2 ===        │                    │                │
    │  createCheckpoint()   │                    │                │
    │  → checkpoint_id: ck2 │                    │                │
    │                       │                    │                │
    │  就绪节点: [B, C]      │                    │                │
    │                       │                    │                │
    │  fanOut([B, C])       │                    │                │
    │  ├─ activate agent B    │                    │                │
    │  │───────────────────►│                    │                │
    │  │  LLM chat(B)       │                    │                │
    │  │───────────────────────────────────────►│                │
    │  │  reflect(result_B) │                    │                │
    │  │────────────────────────────────────────────────────────►│
    │  │  qualityScore=0.6 < 0.7 → shouldRetry=true               │
    │  │  switchStrategy(cot→react)                               │
    │  │  LLM chat(B) retry │                    │                │
    │  │───────────────────────────────────────►│                │
    │  │  complete agent B    │                    │                │
    │  │───────────────────►│                    │                │
    │  │                    │                    │                │
    │  ├─ activate agent C    │                    │                │
    │  │───────────────────►│                    │                │
    │  │  LLM chat(C)       │                    │                │
    │  │───────────────────────────────────────►│                │
    │  │  complete agent C    │                    │                │
    │  │───────────────────►│                    │                │
    │  │                    │                    │                │
    │  barrier() → 等待 B 和 C 都完成            │                │
    │  reduce([{B: result_B}, {C: result_C}])   │                │
    │  completed = {A, B, C}                    │                │
    │                       │                    │                │
    │  === 完成 ===          │                    │                │
    │  finalOutput = merge(result_A, result_B, result_C)          │
    │  qualityScore = avg(0.85, 0.75, 0.9) = 0.833               │
    │                       │                    │                │
    │  return GraphState { finalOutput, qualityScore, trace }     │
    │                       │                    │                │
```

### 3.3. 容错与恢复流程

```
执行中发生异常
    │
    ├── 单个节点执行失败
    │   ├─ 捕获异常，记录至 state.errors
    │   ├─ 标记 agent 为失败状态
    │   ├─ 若配置 retry_on_failure=true 且重试次数未超 max_retries
    │   │   └─ 从上次检查点恢复 state → 重新执行该节点
    │   ├─ 若配置 skip_on_failure=true
    │   │   └─ 跳过该节点，标记为 FAILED_SKIPPED，后续节点继续
    │   └─ 若配置 fail_fast=true
    │       └─ 终止整个 DAG 执行，返回错误
    │
    ├── 全局超时（iterationCount >= maxIterations）
    │   └─ 强制终止，返回已完成的 partial result，status=TIMEOUT
    │
    ├── 外部取消（signal.aborted）
    │   └─ 所有进行中的 Agent 发出取消信号，终止循环，status=CANCELLED
    │
    └── 死锁检测（无就绪节点但未全部完成）
        └─ 检查剩余未完成节点的依赖是否形成了循环等待，记录错误后终止
```

---

## 4. 数据结构

### 4.1. GraphNode（图节点）

| 字段名 | 含义 | 类型 | 备注 |
| ------ | ----- | ----- | ----- |
| id | 节点唯一标识 | string | 对应 agent_id |
| agent | 节点绑定的 Agent | Agent 实例 | 含 prompt/strategy/llm 等配置 |
| inputMapper | 输入映射函数 | (state) => any | 从 GraphState 提取节点输入 |
| outputReducer | 输出归约函数 | (state, output) => any | 将节点输出归约回 GraphState |

### 4.2. GraphEdge（图边）

| 字段名 | 含义 | 类型 | 备注 |
| ------ | ----- | ----- | ----- |
| from | 起始节点 id | string | |
| to | 目标节点 id | string | |
| type | 边类型 | string | sequential / conditional / parallel / loop |
| condition | 条件函数 | (state) => boolean | 仅 conditional 类型有值 |
| priority | 优先级 | number | 可选，用于多条件路由排序 |

### 4.3. TaskGraph（任务图）

| 字段名 | 含义 | 类型 | 备注 |
| ------ | ----- | ----- | ----- |
| nodes | 节点列表 | GraphNode[] | |
| edges | 边列表 | GraphEdge[] | |

### 4.4. ExecutionState / GraphState（执行状态）

| 字段名 | 含义 | 类型 | 备注 |
| ------ | ----- | ----- | ----- |
| userMessage | 用户原始消息 | string | |
| taskPlan | 任务计划 | `{ id, description, agentType, dependencies }[]` | 任务规划产出的分解计划 |
| subTaskResults | 子任务结果 | Map<string, unknown> | 节点 id -> 执行结果 |
| memoryContext | 记忆上下文 | UnifiedMemoryItem[] | 从 InformationService 获取的相关记忆 |
| iterationCount | 当前迭代次数 | number | |
| maxIterations | 最大迭代次数 | number | 默认 10 |
| currentStrategy | 当前策略 | StrategyType | react / plan-execute / cot / conditional-graph / hybrid |
| qualityScore | 质量评分 | number | 范围 [0, 1] |
| qualityThreshold | 质量阈值 | number | 默认 0.7 |
| finalOutput | 最终输出 | string | 归约后的最终结果 |
| errors | 错误列表 | `{ message, stack? }[]` | |
| trace | 执行轨迹 | `{ step, timestamp, data }[]` | 全链路步骤记录 |
| checkpoints | 检查点映射 | Map<string, GraphState> | checkpoint_id -> 状态快照 |
