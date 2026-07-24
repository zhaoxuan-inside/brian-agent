# Planner Agent

## 1. 设计目标

1. 根据前面WriteAgent的结果生成最终给用户的回复内容；

## 2. 功能设计

### 2.1. 完成工作（work）

**功能**：作为Agent DAG的结束节点，完成结果汇总以及结果人性化展示工作
**入参**：多个节点的工作内容
**处理流程**：

1. 调用RelationProvider查询write_agent_config获取llm_id和prompt_template_id；
2. 将收到的所有工作内容和prompt_template_id提交给PromptsProvider生成prompt；
3. 调用将prompt和llm_id调用LLPProvider，得到模型的结果；
4. 调用InfoProvider调用saveInfo接口保存结果

### 2.2. 配置（configLLMCore）

支持配置LLM，支持配置模板prompt

## 3. 表设计

### 3.1. WorkAgent表

- 表名：write_agent_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | UUID | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |
