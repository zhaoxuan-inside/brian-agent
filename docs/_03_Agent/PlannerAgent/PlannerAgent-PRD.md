# Planner Agent

## 1. 设计目标

1. 负责接收工作，并对工作进行判断是否是大任务，如果是大任务则对任务进行递归的分解，构成任务执行图 DAG；

## 2. 功能设计

### 2.1. 分解任务（planWork）

**功能**：接收工作，并对工作进行拆解

**入参**：
- input：PlanWorkInput（继承 Input），包含以下字段：
  - work_content：工作内容
- context：PlanWorkContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：PlanWorkOutput（继承 Output），承载返回内容：
  - work_dag：工作分解DAG图

**处理流程**：

1. **初始化**：创建空的 `WorkDAG` 对象（nodes=[]、edges=[]），创建已访问任务描述集合（去重用）；
2. 调用 RelationDBProvider 查询 `agent_plan_config` 表获取 `llm_id` 和 `prompt_template_id`；若配置缺失则抛出异常；
3. 调用 `recursiveDecompose(work_content, parent_task_id, depth, max_depth)` 进行递归分解；
4. **递归分解子流程 `recursiveDecompose(task_description, parent_task_id, depth, max_depth)`**：
   a. 若 `depth >= max_depth`：将当前 `task_description` 作为一个原子任务节点（不可再拆），生成 `taskId`（UUID），写入 `WorkDAG.nodes`，类型标记为 `ATOMIC`，与 `parent_task_id` 建立依赖边（若 parent_task_id 非空），返回；
   b. 若 `task_description` 在已访问集合中（去重）：跳过本次分解，避免重复任务节点；
   c. 将 `task_description` 加入已访问集合；
   d. 将收到的任务描述和 `prompt_template_id` 调用 PromptsProvider 生成 prompt；
   e. 调用 LLMProvider 分解工作（temperature 建议设为 0.3 以提高分解稳定性），LLM 需输出结构化 JSON：`{ "can_decompose": true/false, "reason": "...", "sub_tasks": [{"description": "...", "dependencies": [0, 1], "required_capabilities": ["code_generation", "search"]}] }`；
   f. 解析 LLM 返回的 JSON：
      - 若 `can_decompose` 为 false 或 `sub_tasks` 为空：当前任务为原子任务，生成 `taskId`，写入 `WorkDAG.nodes`（类型=ATOMIC），与 `parent_task_id` 建立依赖边，返回；
      - 若 `can_decompose` 为 true：为当前任务生成 `taskId`，写入 `WorkDAG.nodes`（类型=DECOMPOSED）；遍历 `sub_tasks` 中的每个子任务：
        i. 为每个子任务调用 `recursiveDecompose(sub_task.description, taskId, depth+1, max_depth)`，递归分解；
        ii. 根据子任务的 `dependencies` 数组（值为子任务在 sub_tasks 中的数组索引），在子任务节点间建立依赖边；
5. **DAG 环路检测**：所有递归分解完成后，对 `WorkDAG` 调用拓扑排序检测环路；若检测到环路，记录告警日志，标记循环依赖的任务节点对，通知上层编排框架；
6. **DAG 降级处理**：若 LLM 调用连续失败 3 次，降级为原子任务模式——直接将整个 `work_content` 作为一个 ATOMIC 节点写入 WorkDAG；
7. **LLM 输出校验**：每次 LLM 返回后校验 JSON 格式合法性；解析失败时重试一次；仍失败则降级为原子任务；
8. 将分解结果（`WorkDAG` 的完整节点列表和边列表）调用 RelationDBProvider 批量保存至 `agent_work_plan` 表：
   a. 每个节点写一条记录（session_id, work_id, agent_id 初始为空, parent_agent_id, task_description, task_status=PENDING）；
   b. 依赖边通过 `parent_agent_id` 字段隐式表达（子任务的 `parent_agent_id` 指向父任务的 `agent_id`）；跨分支依赖单独记录在边的 `depends_on_task_id` 字段中；
9. 将 `WorkDAG` 对象写入 output 返回；

**返回**：Boolean，表示分解是否完成；分解结果（DAG 图）通过 output 参数返回

### 2.2. 配置管理（configPlanner）

**功能**：支持配置 LLM 和模板 prompt

**入参**：
- input：ConfigPlannerInput（继承 Input），包含以下字段：
  - llm_id：LLM 配置 ID（可选）
  - prompt_template_id：模板 prompt ID（可选）
- context：ConfigPlannerContext（继承 Context），配置上下文
- output：ConfigPlannerOutput（继承 Output），承载返回内容：
  - config_result：配置结果

**处理流程**：

1. 调用 RelationDBProvider 更新 `agent_plan_config` 表中的 `llm_id` 和 `prompt_template_id`；

**返回**：Boolean，表示配置是否完成

### 2.3. 获取任务分解结果（getWorkPlan）

**功能**：接收指定的 work_id 获取本次工作的任务分解情况

**入参**：
- input：GetWorkPlanInput（继承 Input），包含以下字段：
  - work_id：工作ID
- context：GetWorkPlanContext（继承 Context），查询上下文
- output：GetWorkPlanOutput（继承 Output），承载返回内容：
  - work_dag：工作分解DAG图

**处理流程**：

1. 调用 RelationDBProvider 查询 `agent_work_plan` 表，按 `work_id` 过滤；
2. 返回工作分解 DAG 图的节点关系（任务节点、依赖边）；

**返回**：Boolean，表示查询是否完成；DAG 图通过 output 参数返回

---

### 2.4. 重要内容

所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；

---

## 3. 数据结构

### 3.1. WorkDAG（工作DAG）

| 字段名 | 含义 | 类型 | 备注 |
| :--- | :--- | :--- | :--- |
| nodes | 节点列表 | WorkNode[] | 子任务节点 |
| edges | 边列表 | WorkEdge[] | 任务依赖关系 |

### 3.2. WorkNode（工作节点）

| 字段名 | 含义 | 类型 | 备注 |
| :--- | :--- | :--- | :--- |
| task_id | 任务节点唯一标识 | UUID | |
| parent_task_id | 父任务ID | UUID | 根节点为空 |
| description | 任务描述 | TEXT | |
| task_type | 节点类型 | VARCHAR | ATOMIC / DECOMPOSED |
| required_capabilities | 所需能力列表 | VARCHAR[] | code_generation / search / analysis 等 |
| priority | 优先级 | INT | 1-10，默认 5 |
| depth | 分解层级 | INT | 从 0 开始 |

### 3.3. WorkEdge（工作边）

| 字段名 | 含义 | 类型 | 备注 |
| :--- | :--- | :--- | :--- |
| from_task_id | 前置任务ID | UUID | 依赖的源 |
| to_task_id | 后置任务ID | UUID | 被依赖的目标 |
| edge_type | 边类型 | VARCHAR | parent_child / cross_dependency |

---

## 4. 表设计

### 4.1. PlannerAgent配置表

- 表名：`agent_plan_config`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | UUID | N | 外键 | 关联 llm_config 表 |
| prompt_template_id | 模板prompt ID | UUID | N | 外键 | 关联 prompt_template 表 |

### 4.2. 工作分解计划表

- 表名：`agent_work_plan`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话ID | UUID | N | 普通索引 | 关联 session 表 |
| work_id | 工作ID | UUID | N | 唯一索引 | |
| agent_id | Agent ID | UUID | N | | 当前任务节点对应的 Agent ID |
| parent_agent_id | 父Agent ID | UUID | Y | | 父任务节点对应的 Agent ID，根节点为空 |
| agent_strategy_id | Agent执行策略ID | UUID | Y | 外键 | 关联 agent_strategy_config 表 |
| depends_on_task_id | 依赖的任务ID（跨分支） | UUID | Y | 普通索引 | 跨父子的依赖关系，同父子通过 parent_agent_id 表达 |
| task_description | 任务描述 | TEXT | N | | |
| task_type | 任务类型 | VARCHAR | N | | ATOMIC / DECOMPOSED |
| task_priority | 任务优先级 | INT | N | | 1-10，默认 5 |
| task_depth | 分解层级深度 | INT | N | | 从 0 开始 |
| task_status | 任务状态 | VARCHAR | N | | PENDING / RUNNING / SUCCESS / FAILED |
