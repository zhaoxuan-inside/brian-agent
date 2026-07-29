# Agent Context

## 1. 设计目标

1. **统一 Agent 层上下文入口**：封装 `InfoCore.context`，为 Agent 层所有模块（AgentExecution、PlannerAgent、WriterAgent、EvolutorAgent）提供面向 Agent 的上下文构建能力，Agent 层不再直接调用 `InfoCore.context`；
2. **上下文快照持久化**：每次构建上下文时自动生成 `context_id` 并持久化来源分类元数据（各 source 的计数摘要），供可视化模块追溯某次 Agent 执行时使用了哪些上下文；
3. **上下文来源透明化**：提供接口按 trace_id / agent_id+work_id / context_id 查询上下文的来源分类及详细 info_id 列表（按需钻取）；
4. **与 InfoCore 解耦**：上下文数据本身（info 记录的内容）仍由 InfoCore 管理，AgentContext 仅管理快照索引和来源分类映射。

## 2. 功能设计

### 2.1. 构建 Agent 上下文（buildAgentContext）

**功能**：构建 Agent 执行所需的上下文数据，同时持久化上下文快照（来源分类元数据）

**入参**：
- input：BuildAgentContextInput（继承 Input），包含以下字段：
  - session_id：会话 ID
  - agent_id：Agent ID（若有，用于关联）
  - work_id：工作 ID（若有，用于关联）
  - trace_id：执行追踪 ID（若有，用于关联）
- context：BuildAgentContextContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：BuildAgentContextOutput（继承 Output），承载返回内容：
  - context_data：上下文数据数组 `[{ info_id, content, source }]`——透传 InfoCore.context 的返回值
  - context_id：上下文快照 ID（UUID）
  - total_context_count：上下文总条数

**处理流程**：

1. 校验入参 `session_id` 非空；
2. 调用 InfoCore.context 构建当前 session 的上下文数据；
3. 生成 `context_id`（UUID）；
4. 将返回的上下文数据按 source 分组，统计各来源的 info 条数，构建 `context_sources_summary`：
   ```json
   { "pinned": 2, "timeline": 20, "tag_relative": 12, "similarity": 8, "keyword": 5, "random": 3 }
   ```
5. 调用 RelationDBProvider.insertDB 将上下文快照元数据写入 `agent_context` 表（context_id、session_id、agent_id、work_id、trace_id、context_total_count、context_sources_summary）；
6. 调用 RelationDBProvider.insertDB 批量写入 `agent_context_item` 表（每行：context_id、info_id、source）；
7. 返回 context_data、context_id、total_context_count 写入 output；

> **来源分类说明**（对应 `InfoCore.context` 的 source 标注）：  
> - `pinned`：钉住的消息，始终排在上下文最前方；  
> - `timeline`：基于 `info_graph` 引用链 BFS 遍历的关联消息；  
> - `tag_relative`：基于 Tag 相关性（`relationKInfo`）匹配的关联消息；  
> - `similarity`：基于语义相似度（`similarKInfo`）匹配的关联消息；  
> - `keyword`：基于关键词搜索（`keywordKInfo`）匹配的关联消息；  
> - `random`：随机采样的联想消息。

### 2.2. 按 trace_id 查询上下文摘要（getContextByTrace）

**功能**：根据 trace_id 查询某次 Agent 执行时所使用的上下文来源分类统计

**入参**：
- input：GetContextByTraceInput（继承 Input），包含以下字段：
  - trace_id：执行追踪 ID
- context：GetContextByTraceContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetContextByTraceOutput（继承 Output），承载返回内容：
  - context_id：上下文快照 ID
  - trace_id / agent_id / work_id
  - total_context_count：总条数
  - sources：按来源分组的计数摘要

**数据结构**：
```json
{
  "context_id": "ctx_uuid_1",
  "trace_id": "trace_uuid_1",
  "agent_id": "agent_uuid_1",
  "work_id": "work_uuid",
  "total_context_count": 50,
  "sources": {
    "pinned": { "count": 2 },
    "timeline": { "count": 20 },
    "tag_relative": { "count": 12 },
    "similarity": { "count": 8 },
    "keyword": { "count": 5 },
    "random": { "count": 3 }
  }
}
```

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 `trace_id` 查询 `agent_context` 表；
2. 若记录不存在，返回空 sources（所有 source 的 count=0）、context_id 为空；
3. 解析 context_sources_summary JSON 返回；

### 2.3. 按 agent_id + work_id 查询上下文摘要（getContextByAgent）

**功能**：根据 agent_id + work_id 查询该 Agent 节点的执行上下文（不依赖 trace_id）

**入参**：
- input：GetContextByAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - work_id：工作 ID
- context：GetContextByAgentContext（继承 Context），会话上下文（session_id, work_id 等）
- output：GetContextByAgentOutput（继承 Output），承载返回内容：
  - sources：同 getContextByTrace 的数据结构

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 `agent_id + work_id` 查询 `agent_context` 表（同一 work 中同一 Agent 只执行一次，agent_id + work_id 联合唯一）；
2. 解析 context_sources_summary JSON 返回；

### 2.4. 按 context_id 查询上下文详情（getContextDetail）

**功能**：根据 context_id 获取某次上下文快照中各来源的完整 info_id 列表（用于可视化钻取）

**入参**：
- input：GetContextDetailInput（继承 Input），包含以下字段：
  - context_id：上下文快照 ID
  - sources：需要查询的来源列表（可选，不传则返回所有来源）
- context：GetContextDetailContext（继承 Context）
- output：GetContextDetailOutput（继承 Output），承载返回内容：
  - context_id：上下文快照 ID
  - total_context_count：总条数
  - sources：按来源分组的 info_id 列表（含 count）

**数据结构**：
```json
{
  "context_id": "ctx_uuid_1",
  "total_context_count": 50,
  "sources": {
    "pinned": {
      "count": 2,
      "info_ids": ["info_pin_1", "info_pin_2"]
    },
    "timeline": {
      "count": 20,
      "info_ids": ["info_tl_1", "info_tl_2", "..."]
    }
  }
}
```

**处理流程**：

1. 校验 `context_id` 非空；
2. 调用 RelationDBProvider.selectOneDB 根据 `context_id` 查询 `agent_context` 表确认快照存在；不存在返回空 sources；
3. 调用 RelationDBProvider.selectDB 查询 `agent_context_item` 表，按 `context_id` + 可选的 `sources` 筛选；
4. 按 source 分组组装 info_id 列表；
5. 返回结果写入 output；

### 2.5. 配置（configAgentContext）

**功能**：配置 AgentContext 模块的参数

**入参**：
- input：ConfigAgentContextInput（继承 Input），包含以下字段：
  - max_context_items：最大上下文条数（可选，默认 200）
  - enable_snapshot_persistence：是否启用上下文快照持久化（可选，默认 true）
- context：ConfigAgentContextContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigAgentContextOutput（继承 Output），承载返回内容：
  - max_context_items：当前生效的最大上下文条数
  - enable_snapshot_persistence：当前生效的快照持久化开关

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `agent_context_config` 表获取当前配置；
2. 若 `max_context_items` 非空：校验为正整数，更新；
3. 若 `enable_snapshot_persistence` 非空：更新；
4. 调用 RelationDBProvider.updateDB 写入配置；
5. 返回更新后的配置写入 output；

## 3. 表设计

### 3.1. Agent 上下文快照表

- 表名：agent_context
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| context_id | 上下文快照 ID | UUID | N | 唯一索引 | |
| session_id | 会话 ID | UUID | N | 普通索引 | |
| agent_id | Agent ID | UUID | Y | 普通索引 | 可为空（buildAgentContext 可不传） |
| work_id | 工作 ID | UUID | Y | 普通索引 | 可为空 |
| trace_id | 执行追踪 ID | UUID | Y | 普通索引 | 可为空 |
| context_total_count | 上下文总条数 | INT | N | | |
| context_sources_summary | 上下文来源计数摘要 | TEXT | N | | JSON 格式，仅含 source→count |

**context_sources_summary JSON 格式**：
```json
{
  "pinned": 2,
  "timeline": 20,
  "tag_relative": 12,
  "similarity": 8,
  "keyword": 5,
  "random": 3
}
```

> 若 agent_id + work_id 均非空，则构成联合唯一约束（同一次 work 中同一 Agent 只执行一次）。

### 3.2. Agent 上下文详情表（按需查询 info_id）

- 表名：agent_context_item
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| context_id | 上下文快照 ID | UUID | N | 普通索引 | 关联 agent_context |
| info_id | 信息 ID | UUID | N | | 关联 InfoCore 中的 info 记录 |
| source | 来源类型 | VARCHAR | N | 普通索引 | pinned / timeline / tag_relative / similarity / keyword / random |

> 此表为轻量映射表，每行仅 3 个业务字段。一次执行若有 50 条上下文记录，则产生 50 行，通过 (context_id) 或 (context_id, source) 索引高效查询。上下文数据本身（info 记录的 content）由 InfoCore 管理，不在此表冗余存储。

### 3.3. AgentContext 配置表

- 表名：agent_context_config
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| max_context_items | 最大上下文条数 | INT | N | | 默认 200 |
| enable_snapshot_persistence | 是否启用快照持久化 | BOOL | N | | 默认 true，关闭后不写 agent_context / agent_context_item 表 |

## 4. 与 InfoCore 的关系

| 职责 | 归属 | 说明 |
|------|------|------|
| info 记录的 CRUD（content 存储） | InfoCore | AgentContext 不管理 info 内容 |
| 上下文检索与组装（context 算法） | InfoCore | InfoCore.context 是上下文构建的核心实现 |
| 上下文快照索引（context_id + 来源元数据） | AgentContext | Agent 层自有表，引用 info_id 但不存储 content |
| 上下文查询接口（getContextByTrace 等） | AgentContext | 面向可视化和追溯场景 |

Agent 层所有模块统一通过 `AgentContext.buildAgentContext` 获取上下文，不再直接调用 `InfoCore.context`。`InfoCore.saveInfo` 和 `InfoCore.lastNInfo` 等接口不受影响，仍由各模块直接调用。

## 5. 调用方接入指南

各 Agent 层模块替换 `InfoCore.context` 为 `AgentContext.buildAgentContext`：

| 模块 | 原调用 | 替换为 | 备注 |
|------|--------|--------|------|
| AgentExecution.execAgent 步骤3 | `InfoCore.context` | `AgentContext.buildAgentContext({ session_id, agent_id, work_id, trace_id })` | 执行时构建上下文，同时持久化快照供可视化 |
| PlannerAgent.plan 步骤3 | `InfoCore.context` | `AgentContext.buildAgentContext({ session_id })` | 规划阶段仅用上下文辅助分析，不关联特定 agent |
| WriterAgent.write 步骤3 | `InfoCore.context` | `AgentContext.buildAgentContext({ session_id, agent_id, work_id })` | 写作阶段获取对话历史作为上下文 |
| EvolutorAgent.evalWorkAgent 步骤2 | `InfoCore.context` | `AgentContext.buildAgentContext({ session_id, agent_id, work_id, trace_id })` | 评估时获取上下文用于判断输出相关性 |
| EvolutorAgent.evalWriterAgent 步骤2 | `InfoCore.context` | `AgentContext.buildAgentContext({ session_id, agent_id, work_id })` | 评估时获取对话上下文 |

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；
