# Plan Agent

## 1. 设计目标

1. 负责接收工作，并对工作进行判断是否是大任务，如果是大任务则对任务进行递归的分解，构成任务执行图DAG；

## 2. 功能设计

### 2.1. 分解任务（planWork）

**功能**：接收工作，并对工作进行拆解
**入参**：工作内容
**处理流程**：

1. 调用RelationProvider查询agent_plan_config获取llm_id和prompt_template_id；
2. 将收到的工作内容和prompt_template_id调用promptsProvider生成prompt；
3. 调用LLMProvider分解工作；
4. 模型指导是否继续拆分工作，如果继续拆分就递归的调用，进行工作分解；直到不能继续拆分；

### 2.2. 配置（configLLMCore）

支持配置LLM，支持配置模板prompt

### 2.3. 获取任务分解结果（workPlan）

**功能**：接收指定的work_id获取本次工作的任务分解情况
**入参**：work_id
**处理流程**：

1. 调用RelationProvider查询agent_work_plan获取工作分解DAG图节点关系；

## 3. 表设计

### 3.1. LLMCore配置表

- 表名：agent_plan_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | INTEGER | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |

### 3.2. AgentPlan表

- 表名：agent_work_plan
- 库名：llm

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 完成一次工作的ID | UUID | N | 唯一索引 | |
| work_id | 完成一次工作的ID | UUID | N | 唯一索引 | |
| agent_id | Agent ID | UUID | N | | |
| parent_agent_id | 父AgentID | UUID | N | | |
