# MCP Core

## 1. 设计目标

1. 根据工作为Agent匹配最佳的MCP；
2. 推动MCP的匹配优化；

## 2. 功能设计

### 2.1. 匹配MCP（matchMCP）

**功能**：为要处理的工作匹配所需要的MCP
**入参**：agent_id,context_id,interact_id
**处理流程**：

1. 通过agent_id调用RelationProvider查询agent_mcp表中agent_id绑定的MCPIds列表；
2. 如果绑定了MCP，则以mcp_core_config表中的regen_rate的概率直接返回绑定的McpIds列表；否则执行下面流程
3. 根据context_id和agent_id调用AgentCore获取到当前要处理的工作内容，调用MCPProvider的matchMCP接口，根据工作匹配一个最佳的MCP的ID进行返回；

### 2.2. 自动优化任务（optMCP）

**功能**：优化MCP
**入参**：agent_id,context_id,interact_id,mcp_id

1. 通过agent_id调用RelationProvider查询agent_mcp表中Agent绑定的MCPIds列表；
2. 判断入参中的mcp_id是否存在于MCPIds列表中，若存在直接返回；否则继续执行下面的流程；
3. 调用RelationDBProvider将新增一条mcp_id和agent_id关联数据；

### 2.3. 配置（configMCPCore）

支持配置多大的概率重新选择MCP，支持配置模板prompt

## 3. 表设计

### 3.1. MCPCore配置表

- 表名：mcp_core_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| regen_rate | 重新匹配MCP的概率 | INTEGER | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |

### 3.2. AgentMCP关联表

- 表名：agent_mcp
- 库名：mcp

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | AgentId | UUID | N | 普通索引 | |
| mcp_id | 绑定的MCPId列表 | UUID | N | | |

注意：agent_id 和 mcp_id构成一个联合唯一索引
