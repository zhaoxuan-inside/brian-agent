# LLM Core

## 1. 设计目标

1. 根据工作为Agent匹配最佳的LLM；

## 2. 功能设计

### 2.1. 匹配LLM（matchLLM）

**功能**：为要处理的工作匹配所需要的LLM
**入参**：agent_id,context_id,interact_id
**处理流程**：

1. 通过agent_id调用RelationProvider查询agent_llm表中agent_id绑定的LLMId；
2. 如果绑定了LLM，则以llm_core_config表中的regen_rate的概率直接返回绑定的LLM；否则执行下面流程
3. 根据context_id和agent_id调用AgentCore获取到当前要处理的工作内容，调用LLMProvider的matchLLM接口，根据工作匹配一个最佳的LLM的ID进行返回；

### 2.3. 配置（configLLMCore）

支持配置多大的概率重新选择LLM，支持配置模板prompt

## 3. 表设计

### 3.1. LLMCore配置表

- 表名：llm_core_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| regen_rate | 重新匹配LLM的概率 | INTEGER | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |

### 3.2. AgentLLM关联表

- 表名：agent_llm
- 库名：llm

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | AgentId | UUID | N | 唯一索引 | |
| llm_id | 绑定的LLMId列表 | UUID | N | | |
