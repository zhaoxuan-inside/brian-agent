# MCP Core

## 1. 设计目标

1. 根据工作为Agent匹配最佳的MCP；
2. 推动MCP的匹配优化；

## 2. 功能设计

### 2.1. 匹配MCP（matchMCP）

**功能**：为要处理的工作匹配所需要的MCP
**入参**：
- input：MatchMCPInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - interact_id：交互 ID
- context：MatchMCPContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：MatchMCPOutput（继承 Output），承载返回内容：
  - mcp_ids：匹配的 MCP ID 列表
**处理流程**：

1. 调用 RelationDBProvider.selectDB 根据 `agent_id` 查询 `agent_mcp` 表，获取该 Agent 已绑定的 mcp_id 列表；
2. 若存在绑定的 MCP：生成随机数（0-100），若随机数 >= regen_rate（从 `mcp_core_config` 表读取，默认 75），则直接返回已绑定的 mcp_id 列表（复用已有绑定）；
3. 若随机数 < regen_rate 或不存在绑定，执行重新匹配流程：
   a. 根据 `interact_id` 和 `agent_id` 调用 `InfoCore.context` 接口获取当前工作内容；
   b. 调用 MCPProvider.soMcp 加载所有已启用的 MCP（conditions: `{ enable: true }`），获取各 MCP 的 ID 和简要描述（mcp_brief）；
   c. 若可用 MCP 列表为空，直接返回空列表（无 MCP 可用）；
   d. 调用 RelationDBProvider.selectOneDB 查询 `mcp_core_config` 表获取 `prompt_template_id`；
   e. 将工作内容和 MCP 列表（ID + brief）与 `prompt_template_id` 调用 PromptsProvider.execPrompt 构建 MCP 匹配 prompt；
   f. 调用 LLMProvider.execLLM 由模型推荐合适的 mcp_id 列表（LLM 输出需包含选中的 mcp_id JSON 数组，解析提取）；
4. 返回匹配到的 mcp_id 列表；

### 2.2. 自动优化任务（optimizeMCP）

**功能**：优化MCP
**入参**：
- input：OptimizeMCPInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - interact_id：交互 ID
  - mcp_id：MCP ID
- context：OptimizeMCPContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：OptimizeMCPOutput（继承 Output），承载返回内容

**处理流程**：

1. 调用 RelationDBProvider.selectDB 根据 `agent_id` 查询 `agent_mcp` 表，获取当前 Agent 已绑定的 mcp_id 列表；
2. 遍历已绑定的 mcp_id 列表，判断入参中的 `mcp_id` 是否已存在于列表中：
   a. 若已存在：无需优化，直接返回 true；
3. 若 `mcp_id` 不在列表中（新匹配到的 MCP 需要绑定）：
   a. 调用 RelationDBProvider.insertDB 向 `agent_mcp` 表新增一条记录 `{ agent_id, mcp_id }`（利用 agent_id + mcp_id 联合唯一索引实现幂等）；
4. 返回 true 表示优化完成；

### 2.3. 配置（configMCPCore）

SET 行为：接受 `regen_rate` 和 `prompt_template_id` 作为可选更新字段，仅更新传入的非空字段。返回更新后的当前配置。
**入参**：
- input：ConfigMCPCoreInput（继承 Input），包含以下字段：
  - regen_rate：重新选择MCP的概率（可选）
  - prompt_template_id：模板prompt ID（可选）
- context：ConfigMCPCoreContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigMCPCoreOutput（继承 Output），承载返回内容：
  - regen_rate：当前生效的重新选择概率
  - prompt_template_id：当前生效的模板prompt ID

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `mcp_core_config` 表获取当前配置；
2. 若 `regen_rate` 非空：校验为 0-100 的整数，更新 regen_rate 字段；
3. 若 `prompt_template_id` 非空：校验 PromptsProvider.soPrompt 中是否存在该 prompt_template_id，存在则更新，否则返回 false；
4. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `mcp_core_config` 表；

**返回**：更新后的当前配置（regen_rate、prompt_template_id）

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

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
