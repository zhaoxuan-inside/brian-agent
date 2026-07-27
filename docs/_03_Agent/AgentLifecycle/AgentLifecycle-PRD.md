# AgentLifecycle（Agent 生命周期）

## 1. 设计目标

1. **运行时状态管理**：对 Agent 运行时实例进行全生命周期状态管理，维护每个 Agent 的状态、创建时间、最后活跃时间、取消标志等运行时元数据。
2. **状态机驱动**：基于明确的状态机（idle → running → completed/failed/cancelled）管控 Agent 执行流转，保证状态转换的合法性与可追溯性。
3. **取消与销毁**：支持对运行中 Agent 的取消（通过取消标志位协同执行框架轮询终止）与销毁（清理运行时资源），防止僵尸 Agent 占用资源。
4. **状态查询与过滤**：支持按 agent_id 查询单个状态、按状态批量过滤 Agent 列表，供调度器与监控模块感知全局执行态势。
5. **运行时度量**：提供 Agent 存活时长（age）、距上次活跃时长等度量接口，支撑超时检测与资源回收决策。
6. **内存态轻量设计**：生命周期管理采用内存态 Map 存储，不持久化，进程重启即重置，适用于单进程内运行时调度场景。

---

## 2. 功能设计

### 2.1. 创建 Agent（createAgent）

**功能**：为指定 agent_id 创建运行时实例，初始化状态为 idle，记录创建时间与活跃时间，清除取消标志。

**入参**：
- input：CreateAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent唯一标识
- context：CreateAgentContext（继承 Context），会话上下文（session_id, work_id 等）
- output：CreateAgentOutput（继承 Output），承载返回内容：
  - instance：创建的运行时实例

**处理流程**：

1. 检查 agent_id 是否已存在，若存在则记录告警日志（允许重新创建覆盖）；
2. 将状态置为 `idle`，写入状态表（statuses Map）；
3. 记录创建时间（createdAt）与最后活跃时间（lastActiveAt）为当前时间戳；
4. 将取消标志（cancelFlags）置为 false；
5. 记录 Agent 创建日志；

**返回**：Boolean，表示 Agent 运行时实例创建是否完成

---

### 2.2. 激活 Agent（activateAgent）

**功能**：将 Agent 状态从 idle 转为 running，重置取消标志，更新活跃时间，表示 Agent 开始执行。

**入参**：
- input：ActivateAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent唯一标识
- context：ActivateAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ActivateAgentOutput（继承 Output），承载返回内容：
  - status：激活后的状态

**处理流程**：

1. 查询 agent_id 状态，不存在则抛出异常（提示需先调用 createAgent）；
2. 若状态已为 `running`，记录告警日志并直接返回（幂等）；
3. 将状态置为 `running`；
4. 更新 lastActiveAt 为当前时间戳；
5. 将 cancelFlags 置为 false；
6. 记录 Agent 激活日志；

**返回**：Boolean，表示 Agent 激活是否完成

---

### 2.3. 停用 Agent（deactivateAgent）

**功能**：将运行中的 Agent 暂时置回 idle 状态，便于后续重新激活。

**入参**：
- input：DeactivateAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent唯一标识
- context：DeactivateAgentContext（继承 Context），会话上下文
- output：DeactivateAgentOutput（继承 Output），承载返回内容：
  - status：停用后的状态

**处理流程**：

1. 查询 agent_id 状态，不存在则抛出异常；
2. 若状态已为 `idle`，直接返回（幂等）；
3. 将状态置为 `idle`；
4. 记录 Agent 停用日志；

**返回**：Boolean，表示 Agent 停用是否完成

---

### 2.4. 取消 Agent（cancelAgent）

**功能**：设置取消标志并标记 Agent 为 failed，执行框架通过轮询 isCancelled 感知并终止执行。

**入参**：
- input：agent_id
- context：会话上下文（session_id, work_id 等）
- output：输出对象

**处理流程**：

1. 查询 agent_id 状态，不存在则抛出异常；
2. 将 cancelFlags 置为 true（执行框架在循环中轮询此标志，命中后主动退出）；
3. 将状态置为 `failed`；
4. 记录 Agent 取消日志；

**返回**：Boolean，表示 Agent 取消是否完成

---

### 2.5. 销毁 Agent（destroyAgent）

**功能**：彻底销毁 Agent 运行时实例，清理所有内存态记录。若 Agent 仍在运行，先设置取消标志再清理。

**入参**：
- input：DestroyAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent唯一标识
- context：DestroyAgentContext（继承 Context），会话上下文
- output：DestroyAgentOutput（继承 Output），承载返回内容：
  - destroyed：是否成功销毁

**处理流程**：

1. 查询 agent_id 状态，不存在则直接返回（幂等）；
2. 若状态为 `running`，先设置 cancelFlags 为 true（通知执行框架终止）；
3. 从 statuses、createdAt、lastActiveAt、cancelFlags 四个 Map 中删除该 agent_id 的所有记录；
4. 记录 Agent 销毁日志；

**返回**：Boolean，表示 Agent 销毁是否完成

---

### 2.6. 标记完成（completeAgent）

**功能**：将 Agent 状态标记为 completed，表示工作成功完成。

**入参**：
- input：CompleteAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent唯一标识
- context：CompleteAgentContext（继承 Context），会话上下文（session_id, work_id 等）
- output：CompleteAgentOutput（继承 Output），承载返回内容：
  - status：完成后的状态

**处理流程**：

1. 查询 agent_id 状态，不存在则抛出异常；
2. 将状态置为 `completed`；
3. 记录 Agent 完成日志；

**返回**：Boolean，表示 Agent 完成标记是否完成

---

### 2.7. 标记失败（failAgent）

**功能**：将 Agent 状态标记为 failed，表示工作因异常失败。

**入参**：
- input：FailAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent唯一标识
- context：FailAgentContext（继承 Context），会话上下文（session_id, work_id 等）
- output：FailAgentOutput（继承 Output），承载返回内容：
  - status：失败后的状态

**处理流程**：

1. 查询 agent_id 状态，不存在则抛出异常；
2. 将状态置为 `failed`；
3. 记录 Agent 失败日志；

**返回**：Boolean，表示 Agent 失败标记是否完成

---

### 2.8. 获取状态（getAgentStatus）

**功能**：查询指定 Agent 的当前运行时状态。

**入参**：
- input：GetAgentStatusInput（继承 Input），包含以下字段：
  - agent_id：Agent唯一标识
- context：GetAgentStatusContext（继承 Context），会话上下文
- output：GetAgentStatusOutput（继承 Output），承载返回内容：
  - status：Agent当前状态（idle / running / completed / failed）

**处理流程**：

1. 查询 agent_id 状态，不存在则抛出异常；
2. 将状态写入 output 返回；

**返回**：Boolean，表示状态获取是否完成

---

### 2.9. 按状态列出 Agent（listAgentByStatus）

**功能**：按指定状态过滤，返回所有匹配的 agent_id 列表，供调度器与监控模块使用。

**入参**：
- input：ListAgentByStatusInput（继承 Input），包含以下字段：
  - status：目标状态（AgentStatus）
- context：ListAgentByStatusContext（继承 Context），会话上下文
- output：ListAgentByStatusOutput（继承 Output），承载返回内容：
  - agent_ids：匹配的 agent_id 列表

**处理流程**：

1. 遍历状态表（statuses Map）；
2. 收集状态与入参匹配的所有 agent_id；
3. 将列表写入 output 返回；

**返回**：Boolean，表示列表查询是否完成

---

### 2.10. 状态机设计

Agent 运行时状态机如下，所有状态转换均由上述接口驱动：

```
                    createAgent
                        │
                        ▼
                     ┌──────┐
        ┌───────────►│ idle │◄───────────┐
        │            └───┬──┘            │
        │   activate     │               │ deactivate
        │                ▼               │
        │            ┌─────────┐         │
        │            │ running │─────────┘
        │            └────┬────┘
        │     complete    │    fail / cancel
        │         ┌───────┴───────┐
        │         ▼               ▼
        │   ┌──────────┐   ┌────────┐
        └───│completed │   │ failed │
            └──────────┘   └────────┘
```

| 状态 | 含义 | 可转换至 |
| --- | --- | --- |
| idle | 已创建待执行 | running（activate）、销毁（destroy） |
| running | 执行中 | idle（deactivate）、completed（complete）、failed（fail/cancel）、销毁（destroy） |
| completed | 成功完成 | 终态（可销毁） |
| failed | 失败/取消 | 终态（可销毁） |

**取消协同机制**：`cancelAgent` 设置 cancelFlags=true 并标记 failed，执行框架在每轮循环中调用 `isCancelled` 轮询该标志，命中后主动退出执行循环，实现协作式取消。

---

### 2.11. 重要内容

所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；

---

## 3. 表设计

AgentLifecycle 采用纯内存态设计（基于 Map 结构），不维护持久化数据表。运行时数据结构如下：

| 内存结构 | 键 | 值 | 用途 |
| --- | --- | --- | --- |
| statuses | agent_id | AgentStatus | 状态表 |
| createdAt | agent_id | number（时间戳） | 创建时间 |
| lastActiveAt | agent_id | number（时间戳） | 最后活跃时间 |
| cancelFlags | agent_id | boolean | 取消标志位 |

> **说明**：进程重启后所有运行时状态清空。如需跨进程或持久化的生命周期管理，应通过 Agent 执行框架的持久化存储能力补充。
