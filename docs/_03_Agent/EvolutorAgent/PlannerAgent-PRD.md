# Evolute Agent

## 1. 设计目标

1. 负责对输入的内容（提问，回答），进行评估打分；

## 2. 功能设计

### 2.1. 评估（evolute）

**功能**：接收提问和回答，进行评估打分；
**入参**：
input： 提问
response：回答
**处理流程**：

1. 调用RelationProvider查询evolute_agent_config获取llm_id和prompt_template_id；
2. 将收到的工作内容和prompt_template_id调用promptsProvider生成prompt；
3. 调用LLMProvider进行评估打分；

### 2.2. 配置（configEvolutionAgent）

支持配置LLM，支持配置模板prompt

## 3. 表设计

### 3.1. 评估Agent配置表

- 表名：evolute_agent_config
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | INTEGER | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |

### 3.2. 评估结果表

- 表名： agent_evolute_result
- 库名： agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话ID | UUID | N | 唯一索引 | |
| work_id | 完成一次工作的ID | UUID | N | 唯一索引 | |
| score | 评估得分（百分值 | INT | N | | |
| evolute_desc | 评估详情 | TEXT | N | | |
