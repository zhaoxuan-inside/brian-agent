# Planner Agent

## 1. 设计目标

1. 识别复杂任务，将复杂任务拆分为多个有依赖关系的子任务；
2. 构建子任务之间的 DAG（有向无环图）依赖关系；
3. 负责将拆分后的任务 DAG 交给上层编排框架，由编排框架调度 Agent DAG 执行；
4. 自己不执行子任务，仅负责任务规划。

## 2. 功能设计

### 2.1. 规划（plan）

**功能**：分析任务内容，将其拆解为子任务并建立 DAG 依赖关系
**入参**：
- input：PlanInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - interact_id：交互 ID
  - task_content：任务内容
- context：PlanContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：PlanOutput（继承 Output），承载返回内容：
  - plan_id：规划 ID
  - task_dag：任务 DAG，包含 nodes（子任务列表）和 edges（依赖关系列表）

**DAG 数据结构**：
```json
{
  "plan_id": "uuid",
  "total_task_count": 3,
  "nodes": [
    {
      "task_id": "uuid",
      "task_content": "子任务1：查询用户数据",
      "task_complexity": 25,
      "task_domain": "data_query",
      "priority": 1,
      "dependencies": []
    },
    {
      "task_id": "uuid",
      "task_content": "子任务2：分析用户数据并生成报告",
      "task_complexity": 60,
      "task_domain": "data_analysis",
      "priority": 2,
      "dependencies": ["task_id_1"]
    }
  ],
  "edges": [
    { "from_task_id": "task_id_1", "to_task_id": "task_id_2" }
  ]
}
```

**处理流程**：

1. **获取 PlannerAgent 实例**
   a. 调用 AgentBuilder.buildPlannerAgent 获取 agent_id（若无则新建）；
   b. 调用 AgentLibrary.getAgent(agent_id) 获取 PlannerAgent 的完整配置（llm_id、soul_id 等）；

2. **复杂度判定**
   a. 调用 RelationDBProvider.selectOneDB 查询 `planner_agent_config` 表获取 `complexity_decompose_threshold`（默认 50）；
   b. 调用 LLMProvider.execLLM 使用简单 prompt 快速评估 task_content 的复杂度（0-100）；
   c. 若复杂度 < complexity_decompose_threshold：返回单节点 DAG（nodes 仅含 1 个原任务），直接返回 — 无需拆分；

3. **任务拆解**
   a. 调用 AgentContext.buildAgentContext({ session_id }) 获取当前 session 的上下文（用于理解任务背景）；
   b. 调用 RelationDBProvider.selectOneDB 查询 `planner_agent_config` 表获取 `plan_prompt_template_id`；
   c. 调用 PromptsProvider.execPrompt 使用 `plan_prompt_template_id` 结合 `task_content` 和上下文构建拆分 prompt；
   d. 调用 LLMProvider.execLLM 生成任务拆解方案，要求输出 JSON 格式的 DAG（nodes + edges）；
   e. 校验 LLM 输出：DAG 无环（验证拓扑排序）、每个节点 task_id 唯一、dependencies 中的 task_id 全部存在于 nodes 中；
   f. 若校验失败：重试一次，仍失败则返回错误；

4. **生成 plan_id**
   a. 生成 `plan_id`（UUID）；
   b. 调用 RelationDBProvider.insertDB 将 DAG 结构保存到 `agent_plan` 表（`{ plan_id, work_id, interact_id, task_dag: JSON.stringify(dag) }`）；

5. **调用 InfoCore 保存规划结果**
   a. 调用 InfoCore.saveInfo 将规划结果（DAG 摘要）保存为 AGENT 角色的信息；

6. 将 plan_id 和 task_dag 写入 output 返回；

### 2.2. 重新规划（replan）

**功能**：某个子任务执行失败后，对受影响的下游任务进行重新规划
**入参**：
- input：ReplanInput（继承 Input），包含以下字段：
  - plan_id：原规划 ID
  - failed_task_id：失败的子任务 ID
  - failure_reason：失败原因
  - completed_task_ids：已完成的任务 ID 列表
- context：ReplanContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ReplanOutput（继承 Output），承载返回内容：
  - new_plan_id：新规划 ID
  - task_dag：调整后的 DAG（仅包含受影响的子任务）

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 `plan_id` 查询 `agent_plan` 表获取原 DAG；
2. 若原 plan 不存在，返回 false；
3. 在原 DAG 中定位 `failed_task_id`，收集其后继节点（所有依赖该节点的下游任务）及未完成的剩余任务；
4. 将剩余未完成的任务内容和失败原因提交给 PlannerAgent（复用 plan 中的 llm_id 和 soul_id），调用 LLM 重新规划；
5. 生成 `new_plan_id`（UUID），保存到 `agent_plan` 表（`parent_plan_id = plan_id`）；
6. 返回新的 plan_id 和调整后的 DAG 写入 output；

### 2.3. 获取规划（getPlan）

**功能**：查询规划的详细内容
**入参**：
- input：GetPlanInput（继承 Input），包含以下字段：
  - plan_id：规划 ID（可选）
  - work_id：工作 ID（可选）
- context：GetPlanContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetPlanOutput（继承 Output），承载返回内容：
  - plans：规划列表，每项含 { plan_id, work_id, interact_id, task_dag, parent_plan_id, created }

**处理流程**：

1. 若 `plan_id` 非空：调用 RelationDBProvider.selectOneDB 查询 `agent_plan` 表；
2. 若 `work_id` 非空：调用 RelationDBProvider.selectDB 按 work_id 查询所有规划；
3. 将规划列表写入 output 返回；

### 2.4. 配置（configPlannerAgent）

**功能**：配置 PlannerAgent 的参数
**入参**：
- input：ConfigPlannerAgentInput（继承 Input），包含以下字段：
  - complexity_decompose_threshold：拆解复杂度阈值（可选，默认 50）
  - plan_prompt_template_id：规划 prompt 模板 ID（可选）
  - max_subtask_count：最大子任务数量（可选，默认 10）
- context：ConfigPlannerAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigPlannerAgentOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `planner_agent_config` 表获取当前配置；
2. 对每个非空入参进行校验和更新：
   a. complexity_decompose_threshold：校验为 0-100 整数；
   b. plan_prompt_template_id：校验 PromptsProvider.soPrompt 中存在；
   c. max_subtask_count：校验为正整数；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. Agent 规划表

- 表名：agent_plan
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| plan_id | 规划 ID | UUID | N | 唯一索引 | |
| work_id | 工作 ID | UUID | N | 普通索引 | |
| interact_id | 交互 ID | UUID | N | | |
| task_dag | 任务 DAG | TEXT | N | | JSON 格式 |
| parent_plan_id | 父规划 ID | UUID | Y | | replan 时关联原规划 |

### 3.2. PlannerAgent 配置表

- 表名：planner_agent_config
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| complexity_decompose_threshold | 拆解复杂度阈值 | INT | N | | 0-100，默认 50 |
| plan_prompt_template_id | 规划 prompt 模板 ID | UUID | N | | |
| max_subtask_count | 最大子任务数 | INT | N | | 默认 10 |
