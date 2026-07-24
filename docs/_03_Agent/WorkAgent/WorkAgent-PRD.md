# Planner Agent

## 1. 设计目标

1. 负责接收工作，根据工作需要通过Soul，Skill，MCP等构建一个完整的Agent，在Agent框架的驱动下完整工作；

## 2. 功能设计

### 2.1. 构建WorkAgent（genWorkAgent）

**功能**：根据工作构建完成工作需要的Agent
**入参**：工作内容
**处理流程**：

1. 通过RelationDBProvider加载可用的WorkAgent的ID和摘要以及Agent执行策略ID；
2. 调用PromptsProvider根据工作内容WorkAgentID和摘要构建prompt；
3. 根据prompt调用LLMProvider，选择最适配当前工作的Agent；
4. 根据agent_id和工作内容调用SoulProvider获取合适的Soul；
5. 根据agent_id和工作内容调用SkillProvider获取合适的Skill；
6. 根据agent_id和工作内容调用SkillProvider获取合适的MCP；
7. 根据agent_id和工作内容调用LLMProvider获取合适的LLM；
8. 将获取到的LLM，Soul，MCP，Skill，工作内容，历史上下文，执行策略构建一个完整的Agent；

### 2.1. 完成工作（work）

**功能**：接收工作，基于ReACT模型完成工作
**入参**：工作内容
**处理流程**：

1. 在Agent执行框架根据策略的驱动完整工作；
--- 异步调用下面的优化接口
2. 调用SoulProvider的optSoul接口优化Soul；
3. 调用SkillProvider的optSkill接口优化Skill；
4. 调用MCPProvider的optMCP接口优化MCP；

### 2.2. 配置（configLLMCore）

支持配置LLM，支持配置模板prompt

## 3. 表设计

### 3.1. WorkAgent表

- 表名：work_agent
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_brief | Agent工作摘要 | TEXT | N | | |
| llm_id | LLM ID | UUID | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |
| agent_strategy_id | Agent执行策略ID | UUID | N | | |
