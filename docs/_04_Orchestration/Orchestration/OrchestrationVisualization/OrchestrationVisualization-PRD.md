# Orchestration Visualization

## 1. 设计目标

1. 提供 AgentDAG 的结构化数据（拓扑结构 + 节点执行状态 + 依赖关系）；Orchestration 层只保存执行架构的数据结构，不嵌入实际内容，渲染由上层负责；
2. 每个 Agent 节点通过 ID 引用方式提供完整画像——Agent 组件（角色、绑定的 LLM/Soul/Skill/MCP/Prompt模板）、运行时信息（耗时、状态、错误）、依赖上下文（区分来源的上下文 info_id 列表）；
3. 提供完整 work 执行流程的阶段时间线数据，各阶段通过 ID 引用关联下层资源；
4. 所有节点信息和上下文信息由下层 Agent/Core 层提供，本层仅聚合 ID 引用和结构关系，具体内容由上层按 ID 自行获取。

## 2. 功能设计

### 2.1. 获取 AgentDAG 结构（visualizeAgentDAG）

**功能**：获取 Agent DAG 的拓扑结构数据，返回节点（Agent）和边（依赖关系）的 ID 引用及执行状态
**入参**：
- input：VisualizeAgentDAGInput（继承 Input），包含以下字段：
  - work_id：工作 ID
- context：VisualizeAgentDAGContext（继承 Context），会话上下文（session_id, work_id 等）
- output：VisualizeAgentDAGOutput（继承 Output），承载返回内容：
  - agent_dag_structure：AgentDAG 结构数据

**数据结构**：
```json
{
  "work_id": "uuid",
  "session_id": "uuid",
  "orchestration_strategy": "PLANNING",
  "work_status": "COMPLETED",
  "total_elapsed_ms": 15200,
  "graph": {
    "nodes": [
      {
        "agent_id": "agent_uuid_1",
        "agent_type": "WORKER",
        "task_id": "task_uuid_1",
        "task_complexity": 25,
        "task_domain": "data_query",
        "dependency_level": 0,
        "status": "COMPLETED",
        "upstream_agent_ids": [],
        "downstream_agent_ids": ["agent_uuid_2", "agent_uuid_3"],
        "runtime": {
          "trace_id": "trace_uuid_1",
          "iterations": 3,
          "elapsed_ms": 3200,
          "error_info": null
        },
        "component_refs": {
          "agent_id": "agent_uuid_1",
          "strategy_id": "strategy_uuid_1",
          "llm_id": "llm_uuid_1",
          "soul_id": "soul_uuid_1",
          "skill_ids": ["skill_uuid_1", "skill_uuid_2"],
          "mcp_ids": ["mcp_uuid_1"],
          "prompt_template_ids": {
            "think": "prompt_uuid_think",
            "reflect": "prompt_uuid_reflect",
            "answer": "prompt_uuid_answer"
          }
        },
        "context_source_refs": {
          "trace_id": "trace_uuid_1",
          "pinned": { "count": 1, "info_ids": ["info_pin_1"] },
          "timeline": { "count": 20, "info_ids": ["info_tl_1", "info_tl_2", "..."] },
          "tag_relative": { "count": 12, "info_ids": ["info_tag_1", "..."] },
          "similarity": { "count": 8, "info_ids": ["info_sim_1", "..."] },
          "keyword": { "count": 5, "info_ids": ["info_kw_1", "..."] },
          "random": { "count": 3, "info_ids": ["info_rd_1", "..."] }
        },
        "result_refs": {
          "task_id": "task_uuid_1",
          "info_ids": ["info_uuid_1", "info_uuid_2"],
          "eval_id": "eval_uuid_2"
        },
        "created": "2026-07-29T10:00:01.000Z",
        "updated": "2026-07-29T10:00:04.200Z"
      }
    ],
    "edges": [
      {
        "from_agent_id": "agent_uuid_1",
        "to_agent_id": "agent_uuid_2",
        "edge_type": "DATA_DEPENDENCY",
        "data_dependency": "task_uuid_1 → task_uuid_2"
      }
    ],
    "metadata": {
      "total_nodes": 3,
      "total_edges": 2,
      "max_dependency_depth": 1,
      "parallel_branches": 2
    }
  }
}
```

> **ID 引用约定**（Orchestration 返回 ID 结构，上层按需获取内容）：
> 
> | 节点数据分类 | ID 引用字段 | 上层获取方式 |
> |------------|-----------|------------|
> | **运行时状态** | `runtime.trace_id` | `AgentExecution.getTrace(trace_id)` → Think/Act/Reflect/Answer 全链路 |
> | | `runtime.status` `runtime.elapsed_ms` `runtime.iterations` `runtime.error_info` | Orchestration 直接返回（来自 orchestration_agent_execution 表） |
> | **Agent 组件** | `component_refs.agent_id` | `AgentLibrary.getAgent(agent_id)` → agent_name, agent_type, strategy_id, llm_id, soul_id |
> | | `component_refs.strategy_id` | `AgentLibrary.getAgent(agent_id)` 或 `AgentStrategy.getStrategy(strategy_id)` |
> | | `component_refs.llm_id` | `AgentLibrary.getAgent(agent_id)` → llm_id |
> | | `component_refs.soul_id` | `AgentLibrary.getAgent(agent_id)` → soul_id |
> | | `component_refs.skill_ids` | Core 层 `agent_skill` 表（库名: skill）→ SkillProvider.getSkill |
> | | `component_refs.mcp_ids` | Core 层 `agent_mcp` 表（库名: mcp）→ MCPProvider.getMcp |
> | | `component_refs.prompt_template_ids` | agent_execution_config 表 → PromptsProvider.getPrompt |
> | **上下文来源** | `context_source_refs.trace_id` | `AgentExecution.getExecContext(trace_id)` → 各来源 info_ids 列表 |
> | | `context_source_refs.pinned/timeline/...` | 各来源的 info_ids 列表 → `InfoCore.lastNInfo({ info_id: [...] })` |
> | **执行结果** | `result_refs.task_id` | `PlannerAgent.getPlan(plan_id)` → task_dag.nodes[task_id].task_content |
> | | `result_refs.info_ids` | `InfoCore.lastNInfo({ info_id: [...] })` → Agent 产生的信息记录 |
> | | `result_refs.eval_id` | `EvolutorAgent.getEvaluation({ agent_id })` → 多维评分 |
> | **节点间依赖** | `upstream_agent_ids` `downstream_agent_ids` | Orchestration 直接返回（来自 orchestration_agent_dag 表）<br>`edges[].from_agent_id → to_agent_id` 形成有向边 |

**处理流程**：

1. **获取 Work 基础信息**
   a. 调用 RelationDBProvider.selectOneDB 根据 work_id 查询 `orchestration_work` 表，获取 work_status、orchestration_strategy、total_elapsed_ms；

2. **获取 Agent DAG 结构**
   a. 若 Planning 策略：
      - 调用 RelationDBProvider.selectDB 根据 work_id 查询 `orchestration_task_agent` 表获取 task_id → agent_id 映射；
      - 调用 RelationDBProvider.selectDB 根据 plan_id 查询 `orchestration_agent_dag` 表获取 Agent 依赖边（from_agent_id → to_agent_id）；
      - 组装 nodes（含 agent_id、task_id、task_complexity、task_domain）和 edges 列表；
   b. 若 Simple 策略：
      - 调用 RelationDBProvider.selectDB 根据 work_id 查询 `orchestration_agent_execution` 表获取唯一的 Agent 执行记录；
      - 构建单节点、edges=[] 的 DAG 图；

3. **填充运行时状态**
   a. 遍历每个 agent_id，调用 RelationDBProvider.selectOneDB 查询 `orchestration_agent_execution` 表获取 status、trace_id、iterations、elapsed_ms、error_info；
   b. 回填到 `runtime` 字段；

4. **填充 Agent 组件引用**
   a. 调用 AgentLibrary.getAgent(agent_id) 获取 agent_type、strategy_id、llm_id、soul_id；
   b. 调用 RelationDBProvider.selectDB 查 Core 层 `agent_skill` 表（库名: skill）获取 skill_ids；
   c. 调用 RelationDBProvider.selectDB 查 Core 层 `agent_mcp` 表（库名: mcp）获取 mcp_ids；
   d. 调用 RelationDBProvider.selectOneDB 查 `agent_execution_config` 表（库名: agent）获取 think/reflect/answer 的 prompt_template_ids；
   e. 回填到 `component_refs` 字段；

5. **填充上下文来源引用**
   a. 对每个有 trace_id 的 Agent，调用 AgentExecution.getExecContext(trace_id) 获取各来源 info_ids 分类；
   b. 回填到 `context_source_refs` 字段；

6. **填充结果引用**
   a. 从步骤2 获取的 task_id 回填到 `result_refs.task_id`；
   b. 调用 RelationDBProvider.selectDB 查 `info_raw` 表（库名: info）根据 work_id + info_creator_id=agent_id 收集 info_ids；
   c. 调用 RelationDBProvider.selectDB 查 `agent_evaluation` 表（库名: agent）根据 agent_id + work_id 获取 eval_id；
   d. 回填到 `result_refs` 字段；

7. **计算拓扑层级（dependency_level）**
   a. 根据 edges 的 from_agent_id → to_agent_id 构建邻接表，对 nodes 执行 BFS 拓扑遍历，根节点（入度为 0）的 dependency_level=0；
   b. 下游节点的 dependency_level = max(上游 dependency_level) + 1；
   c. 填充 upstream_agent_ids 和 downstream_agent_ids；

8. 将 agent_dag_structure 写入 output 返回；

### 2.2. 获取 Work 流程时间线（visualizeWorkFlow）

**功能**：获取一次 work 从入口到完成的阶段时间线数据，各阶段通过 ID 引用关联下层资源
**入参**：
- input：VisualizeWorkFlowInput（继承 Input），包含以下字段：
  - work_id：工作 ID
- context：VisualizeWorkFlowContext（继承 Context），会话上下文（session_id, work_id 等）
- output：VisualizeWorkFlowOutput（继承 Output），承载返回内容：
  - workflow_timeline：Work 流程时间线数据

**数据结构**：
```json
{
  "work_id": "uuid",
  "session_id": "uuid",
  "interact_id": "uuid",
  "orchestration_strategy": "PLANNING",
  "work_status": "COMPLETED",
  "total_elapsed_ms": 15200,
  "phases": [
    {
      "phase": "ENTRY",
      "status": "COMPLETED",
      "start_time": "2026-07-29T10:00:00.000Z",
      "end_time": "2026-07-29T10:00:00.500Z",
      "elapsed_ms": 500,
      "description": "接收用户请求，构建工作上下文"
    },
    {
      "phase": "PLANNING",
      "status": "COMPLETED",
      "start_time": "2026-07-29T10:00:00.500Z",
      "end_time": "2026-07-29T10:00:02.800Z",
      "elapsed_ms": 2300,
      "description": "PlannerAgent 拆解任务 → 生成 Task DAG（3个子任务）",
      "refs": {
        "plan_id": "plan_uuid"
      }
    },
    {
      "phase": "BUILD_AGENT_DAG",
      "status": "COMPLETED",
      "start_time": "2026-07-29T10:00:02.800Z",
      "end_time": "2026-07-29T10:00:03.000Z",
      "elapsed_ms": 200,
      "description": "Task DAG → Agent DAG 转换（3个WorkAgent已构建）",
      "refs": {
        "agent_ids": ["agent_uuid_1", "agent_uuid_2", "agent_uuid_3"],
        "agent_dag_record_id": "dag_record_uuid"
      }
    },
    {
      "phase": "EXECUTING",
      "status": "COMPLETED",
      "start_time": "2026-07-29T10:00:03.000Z",
      "end_time": "2026-07-29T10:00:13.200Z",
      "elapsed_ms": 10200,
      "description": "Agent DAG 执行（3/3 完成，0 失败）",
      "refs": {
        "agent_execution_ids": ["exec_uuid_1", "exec_uuid_2", "exec_uuid_3"]
      }
    },
    {
      "phase": "WRITING",
      "status": "COMPLETED",
      "start_time": "2026-07-29T10:00:13.200Z",
      "end_time": "2026-07-29T10:00:14.500Z",
      "elapsed_ms": 1300,
      "description": "WriterAgent 汇总结果 → 生成人性化最终回复",
      "refs": {
        "writer_agent_id": "writer_agent_uuid"
      }
    },
    {
      "phase": "EVALUATING",
      "status": "COMPLETED",
      "start_time": "2026-07-29T10:00:14.500Z",
      "end_time": "2026-07-29T10:00:15.200Z",
      "elapsed_ms": 700,
      "description": "EvolutorAgent 评估最终回复与 WorkAgent 表现",
      "refs": {
        "eval_ids": ["eval_uuid_1", "eval_uuid_2", "eval_uuid_3"]
      }
    }
  ],
  "timeline_summary": {
    "planning_ratio": 0.15,
    "executing_ratio": 0.67,
    "writing_ratio": 0.09,
    "evaluating_ratio": 0.05,
    "overhead_ratio": 0.04
  }
}
```

**处理流程**：

1. **获取 Work 基础信息**
   a. 调用 RelationDBProvider.selectOneDB 根据 work_id 查询 `orchestration_work` 表，获取完整记录；

2. **组装 ENTRY 阶段**
   a. 从 orchestration_work.created 作为相位起始时间；
   b. 从 `orchestration_agent_execution` 表中最早的 created 时间作为相位结束时间（近似）；

3. **组装 PLANNING 阶段**
   a. 若 orchestration_strategy=PLANNING：
      - 调用 PlannerAgent.getPlan 根据 work_id 查询 plan 记录，获取 plan_id；
      - 从 orchestration_work.metadata 或 `agent_plan` 表的 created 推断 planning 开始/结束时间；
   b. 若 orchestration_strategy=SIMPLE：跳过此阶段；

4. **组装 BUILD_AGENT_DAG 阶段**
   a. 调用 RelationDBProvider.selectDB 查询 `orchestration_task_agent` 表，收集所有 agent_id；
   b. 查询 `orchestration_agent_dag_record` 表获取 agent_dag_record_id；

5. **组装 EXECUTING 阶段**
   a. 调用 RelationDBProvider.selectDB 查询 `orchestration_agent_execution` 表获取所有执行记录的 id 和时间范围；
   b. 统计 completed_count、failed_count；

6. **组装 WRITING 阶段**
   a. 从 `agent_usage` 表（库名: agent）按 work_id 找 WriterAgent 的使用记录；

7. **组装 EVALUATING 阶段**
   a. 调用 RelationDBProvider.selectDB 查询 `agent_evaluation` 表（库名: agent）根据 work_id 获取 eval_id 列表；

8. **计算时间线占比**
   a. 各阶段 elapsed_ms / total_elapsed_ms，差额计入 overhead_ratio；

9. 将 workflow_timeline 写入 output 返回；

### 2.3. 获取 Agent 节点详情的 ID 引用（getAgentNodeDetail）

**功能**：获取单个 Agent 节点的依赖关系、执行状态和关联资源 ID 引用，具体内容由上层按 ID 自行获取
**入参**：
- input：GetAgentNodeDetailInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - agent_id：Agent ID
- context：GetAgentNodeDetailContext（继承 Context），会话上下文（session_id, work_id 等）
- output：GetAgentNodeDetailOutput（继承 Output），承载返回内容：
  - agent_node_detail：Agent 节点详情

**数据结构**：
```json
{
  "agent_id": "agent_uuid_2",
  "agent_type": "WORKER",
  "work_id": "uuid",
  "task_id": "task_uuid_2",
  "task_complexity": 60,
  "task_domain": "data_analysis",
  "status": "COMPLETED",
  "elapsed_ms": 8500,
  "iterations": 5,
  "dependency_chain": {
    "upstream_agent_ids": ["agent_uuid_1"],
    "downstream_agent_ids": []
  },
  "component_refs": {
    "strategy_id": "strategy_uuid_2",
    "llm_id": "llm_uuid_2",
    "soul_id": "soul_uuid_2",
    "skill_ids": ["skill_uuid_1"],
    "mcp_ids": [],
    "prompt_template_ids": {
      "think": "prompt_uuid_think",
      "reflect": "prompt_uuid_reflect",
      "answer": "prompt_uuid_answer"
    }
  },
  "context_source_refs": {
    "trace_id": "trace_uuid_2",
    "pinned": { "count": 0, "info_ids": [] },
    "timeline": { "count": 15, "info_ids": ["info_tl_1", "..."] },
    "tag_relative": { "count": 8, "info_ids": ["info_tag_1", "..."] },
    "similarity": { "count": 5, "info_ids": ["info_sim_1", "..."] },
    "keyword": { "count": 3, "info_ids": ["info_kw_1", "..."] },
    "random": { "count": 2, "info_ids": ["info_rd_1", "..."] }
  },
  "result_refs": {
    "task_id": "task_uuid_2",
    "info_ids": ["info_uuid_3", "info_uuid_4"],
    "info_roles": {
      "info_uuid_3": "AGENT",
      "info_uuid_4": "SKILL"
    },
    "eval_id": "eval_uuid_3"
  }
}
```

> **上层按需获取约定**：
> - **任务内容**：`task_id` → `PlannerAgent.getPlan(plan_id)` → task_dag.nodes 获取 task_content；
> - **Agent 元数据**：`agent_id` → `AgentLibrary.getAgent(agent_id)` 获取 agent_name、agent_type、strategy_id、llm_id、soul_id；
> - **Agent 组件**：`component_refs.skill_ids/mcp_ids` → Core 层 `agent_skill/agent_mcp` 表 → SkillProvider/MCPProvider；
> - **Prompt 模板**：`component_refs.prompt_template_ids` → `PromptsProvider.getPrompt`；
> - **执行链路**：`context_source_refs.trace_id` → `AgentExecution.getTrace(trace_id)` 获取 Think/Act/Reflect/Answer 全链路；
> - **上下文来源**：`context_source_refs.*.info_ids` → `InfoCore.lastNInfo({ info_id: [...] })` 获取信息内容，source 标注已由本层返回；
> - **执行结果**：`result_refs.info_ids` → `InfoCore.lastNInfo({ info_id: [...] })` 获取 Agent 产生的内容；
> - **评估**：`result_refs.eval_id` → `EvolutorAgent.getEvaluation` 获取多维度评分。

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 work_id + agent_id 查询 `orchestration_task_agent` 表获取 task_id、task_complexity、task_domain；
2. 调用 RelationDBProvider.selectOneDB 根据 work_id + agent_id 查询 `orchestration_agent_execution` 表获取 status、elapsed_ms、iterations、trace_id；
3. 调用 RelationDBProvider.selectDB 查询 `orchestration_agent_dag` 表获取 upstream_agent_ids（to_agent_id=当前）和 downstream_agent_ids（from_agent_id=当前）；
4. 填充 component_refs：调用 AgentLibrary.getAgent(agent_id) + Core 层 agent_skill/agent_mcp 表 + agent_execution_config 表；
5. 填充 context_source_refs：调用 AgentExecution.getExecContext(trace_id) 获取各来源 info_ids 分类；
6. 填充 result_refs：调用 RelationDBProvider 查 info_raw + agent_evaluation 表收集 info_ids、info_roles、eval_id；
7. 将 agent_node_detail 写入 output 返回；

### 2.4. 配置（configOrchestrationVisualization）

**功能**：配置可视化模块的参数
**入参**：
- input：ConfigOrchestrationVisualizationInput（继承 Input），包含以下字段：
  - max_nodes_in_graph：单图最大节点数（可选，默认 50，防止超大 DAG 返回）
- context：ConfigOrchestrationVisualizationContext（继承 Context），会话上下文（session_id 等）
- output：ConfigOrchestrationVisualizationOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：
1. 调用 RelationDBProvider.selectOneDB 查询 `orchestration_config` 表获取可视化相关配置；
2. 校验并更新非空入参；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

可视化模块不新增表，复用以下已有表：

| 表名 | 库名 | 用途 | 所属模块 |
|------|------|------|---------|
| orchestration_work | orchestration | Work 生命周期和状态 | OrchestrationEntry |
| orchestration_task_agent | orchestration | Task-Agent 映射 | OrchestrationExecution |
| orchestration_agent_dag | orchestration | Agent 依赖边 | OrchestrationExecution |
| orchestration_agent_execution | orchestration | Agent 执行记录 | OrchestrationExecution |
| orchestration_agent_dag_record | orchestration | Agent DAG 快照 | OrchestrationExecution |
| agent_evaluation | agent | 评估记录 | EvolutorAgent（Agent 层） |
| agent_usage | agent | Agent 使用记录 | AgentLibrary（Agent 层） |
| info_raw | info | 信息记录 | InfoCore（Core 层） |

## 实现约定（与代码同步）

1. **ID 引用原则**：可视化接口只返回结构和 ID 引用，不嵌入实际内容（task_content、answer、trace 详情等）；上层通过 ID 调用对应下层接口自行获取内容。
2. **只读操作**：可视化接口均为只读查询，不修改任何业务数据。
3. **节点层级计算**：dependency_level 通过 BFS 拓扑遍历计算，根节点 level=0。
4. **渲染分离**：Orchestration 层不预设渲染技术，图形布局、节点样式、交互行为等由上层（Application/Frontend）自行决定。
5. **错误容忍**：任一数据源查询失败（如 PlannerAgent.getPlan 返回空、某 Agent 无 trace_id），对应字段置空而非整体失败。
6. **AOP**：所有方法经 AopProxy.wrap 生成代理。
