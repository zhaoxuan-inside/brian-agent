# AgentBuilder（Agent 构建器）

## 1. 设计目标

1. **面向用户的自定义 Agent 管理**：为终端用户提供自定义 Agent（CustomAgent）的创建、更新、删除、克隆、启用/禁用、列表与详情查询能力，支撑前端 Agent 配置场景。
2. **LLM 辅助配置生成**：通过 LLM 辅助生成 System Prompt、Instruction、变量模板，以及 Soul（人格）配置（风格、性格、内容规则、约束、温度画像），降低用户手动配置成本。
3. **LLM 辅助能力推荐**：基于 Agent 用途，通过 LLM 推荐匹配的 Skill、MCP 包、Soul 与 Work，辅助用户完成 Agent 能力组装。
4. **配置校验**：对 Agent 配置（名称、角色、描述、策略类型、LLM 参数、Prompt）进行合法性校验，保证配置可用性。
5. **关联资源查询**：支持查询 Agent 关联的 MCP（关系型库）、Skill、Soul、Work（图数据库）详情，支撑 Agent 详情展示。
6. **双库协同存储**：CustomAgent 主体配置存于图数据库（Graph DB），Agent 与 MCP 的关联关系存于关系型数据库（SQLite），通过 agent_id 关联。

---

## 2. 功能设计

### 2.1. 创建 Agent（createAgent）

**功能**：创建一个自定义 Agent，持久化到图数据库，并建立 Agent 与 MCP 的关联关系。

**入参**：
- input：Agent 配置，包含 name、role、description、strategy、llm、prompt、skillIds、mcpIds、soulId、workIds、sources；以及 isSystem 标记（是否系统内置，默认 false）
- context：会话上下文（session_id 等）
- output：输出对象，承载创建完成的 CustomAgent 实例

**处理流程**：

1. 取当前 ISO 时间戳作为 createdAt / updatedAt；
2. 初始化各字段默认值：strategy.type 默认 react、maxIterations 默认 10；llm.providerId/modelId 默认 default、temperature 默认 0.5、maxTokens 默认 4096；prompt.variables 默认空数组；sources.webSearch 默认 false；active 默认 true；
3. 调用 `storage.graph.createNode` 创建图节点（type=concept），将 Agent 配置序列化为 JSON 存入 content，metadata 记录 agentType=custom、agentName、role、isSystem；
4. 回写节点 id 到 content，调用 `storage.graph.updateNode` 更新；
5. 遍历 mcpIds，调用 `storage.sqlite.createAgentMcp` 逐条建立 Agent-MCP 关联（agent_mcp 表）；
6. 将完整 CustomAgent 写入 output 返回；

**返回**：Boolean，表示自定义 Agent 创建是否完成

---

### 2.2. 更新 Agent（updateAgent）

**功能**：更新指定 Agent 的配置，若 mcpIds 变更则重建 Agent-MCP 关联关系。

**入参**：
- input：agent_id 与更新字段字典（updates）
- context：会话上下文
- output：输出对象，承载更新后的 CustomAgent 实例

**处理流程**：

1. 调用 `get` 获取现有 Agent，不存在则抛出异常；
2. 合并 updates 到现有配置，更新 updatedAt 为当前 ISO 时间戳；
3. 调用 `storage.graph.updateNode` 持久化合并后的配置；
4. 若 updates 中包含 mcpIds：先调用 `storage.sqlite.deleteAllAgentMcps` 清除旧关联，再逐条调用 `createAgentMcp` 重建新关联；
5. 将更新后的 CustomAgent 写入 output 返回；

**返回**：Boolean，表示 Agent 更新是否完成

---

### 2.3. 删除 Agent（deleteAgent）

**功能**：删除指定 Agent，先按 agent_id 直接删除图节点，再扫描全量节点按内容匹配删除（兼容 id 存储于 content 的场景）。

**入参**：
- input：agent_id
- context：会话上下文
- output：输出对象

**处理流程**：

1. 尝试调用 `storage.graph.deleteNode` 按 agent_id 直接删除；
2. 调用 `storage.graph.getAllNodes` 获取全量节点，遍历解析 content，匹配 content.id === agent_id 的节点并删除（兼容历史数据）；
3. 命中即返回；

**返回**：Boolean，表示 Agent 删除是否完成

---

### 2.4. 克隆 Agent（cloneAgent）

**功能**：克隆现有 Agent 生成副本，名称追加 "(Copy)" 后缀，默认置为禁用状态（active=false），便于用户基于模板修改。

**入参**：
- input：agent_id
- context：会话上下文
- output：输出对象，承载克隆后的 CustomAgent 实例

**处理流程**：

1. 调用 `get` 获取源 Agent，不存在则抛出异常；
2. 构建克隆配置：name 追加 " (Copy)"，active 置为 false，createdAt/updatedAt 更新为当前时间；
3. 调用 `storage.graph.createNode` 创建新节点（metadata 标记 agentType=custom）；
4. 回写节点 id 到 content，调用 `storage.graph.updateNode` 更新；
5. 将克隆后的 CustomAgent 写入 output 返回；

**返回**：Boolean，表示 Agent 克隆是否完成

---

### 2.5. 启用/禁用 Agent（toggleAgent）

**功能**：切换 Agent 的启用/禁用状态（active 字段取反）。

**入参**：
- input：agent_id
- context：会话上下文
- output：输出对象，承载切换后的 CustomAgent 实例

**处理流程**：

1. 调用 `get` 获取现有 Agent，不存在则抛出异常；
2. 将 active 字段取反，更新 updatedAt；
3. 调用 `storage.graph.updateNode` 持久化；
4. 将更新后的 CustomAgent 写入 output 返回；

**返回**：Boolean，表示 Agent 启用/禁用切换是否完成

---

### 2.6. 列出 Agent（listAgent）

**功能**：列出全部自定义 Agent，支持按名称、角色、描述模糊搜索；返回时补全每个 Agent 的 MCP 关联。

**入参**：
- input：搜索关键词 search（可选）
- context：会话上下文
- output：输出对象，承载 CustomAgent 列表

**处理流程**：

1. 调用 `storage.graph.getAllNodes` 获取全量节点；
2. 遍历节点，解析 content 为 CustomAgent，校验 id 与 name 字段有效性；
3. 对每个有效 Agent，调用 `storage.sqlite.getAgentMcpIds` 查询关联的 mcp_id 列表，回填到 agent.mcpIds；
4. 若提供 search，按名称、角色、描述（转小写）模糊匹配过滤；
5. 将列表写入 output 返回；

**返回**：Boolean，表示 Agent 列表查询是否完成

---

### 2.7. 获取 Agent（getAgent）

**功能**：根据 agent_id 获取自定义 Agent 详情，补全 MCP 关联。

**入参**：
- input：agent_id
- context：会话上下文
- output：输出对象，承载 CustomAgent 实例（不存在时为空）

**处理流程**：

1. 调用 `storage.graph.getNode` 按 agent_id 获取节点；
2. 若节点不存在，output 返回空；
3. 解析 content 为 CustomAgent，调用 `storage.sqlite.getAgentMcpIds` 补全 mcpIds；
4. 将结果写入 output 返回；解析失败时返回空；

**返回**：Boolean，表示 Agent 获取是否完成

---

### 2.8. 生成 Prompt（generatePrompt）

**功能**：通过 LLM 根据用途与约束生成高质量的 System Prompt、Instruction 模板与变量定义。

**入参**：
- input：purpose（用途）、constraints（约束，可选）
- context：LLM 调用上下文
- output：输出对象，承载 `{ system, instruction, variables }`

**处理流程**：

1. 构造系统消息，要求 LLM 作为 prompt 工程师生成 system prompt 与带 `{{variable}}` 占位符的 instruction 模板，输出 JSON；
2. 构造用户消息，包含 purpose 与 constraints；
3. 调用 `LLMService.chat`（temperature 0.5），从响应中正则提取 JSON 并解析；
4. 解析成功则返回 system、instruction、variables；失败时回退到默认模板（system 基于用途、instruction 含 `{{task}}` 变量）；
5. 将结果写入 output 返回；

**返回**：Boolean，表示 Prompt 生成是否完成

---

### 2.9. 生成 Soul（generateSoul）

**功能**：通过 LLM 根据用途与偏好生成 Soul（人格）配置，包括沟通风格、性格特征、内容规则、约束、温度画像。

**入参**：
- input：purpose（用途）、preference（偏好，可选）
- context：LLM 调用上下文
- output：输出对象，承载 `{ style, personality, contentRules, constraints, temperatureProfile }`

**处理流程**：

1. 构造系统消息，要求 LLM 作为人格设计师生成 style、personality、contentRules、constraints、temperatureProfile（creative/analytical/factual），输出 JSON；
2. 构造用户消息，包含 purpose 与 preference；
3. 调用 `LLMService.chat`（temperature 0.7），从响应中正则提取 JSON 并解析；
4. 解析成功则返回完整 Soul 配置；失败时按用途关键词回退：creative 类用创意风格（creative 1.2）、code 类用技术风格（factual 1.0）、chat 类用友好风格，默认专业正式；
5. 将结果写入 output 返回；

**返回**：Boolean，表示 Soul 生成是否完成

---

### 2.10. 推荐 Skill（suggestSkills）

**功能**：通过 LLM 基于 Agent 用途，从已注册 Skill 中推荐最匹配的 Skill 列表。

**入参**：
- input：purpose（用途）、description（描述，可选）
- context：LLM 调用上下文
- output：输出对象，承载 `{ skillId, name, reason }[]`

**处理流程**：

1. 调用 `storage.graph.getAllNodes` 获取全量节点，筛选出 Skill 节点（含 id、name、mode 字段）；
2. 若无已注册 Skill，返回空列表；
3. 构造系统消息，要求 LLM 作为 Skill 匹配助手，从可用 Skill 中推荐最相关的，输出 JSON 数组；
4. 构造用户消息，包含 purpose、description 与可用 Skill 列表（id/name/description）；
5. 调用 `LLMService.chat`（temperature 0.3），从响应中正则提取 JSON 数组并解析；
6. 解析失败时回退到关键词匹配：按用途词与 Skill 名称/描述匹配，取前 5 条；
7. 将结果写入 output 返回；

**返回**：Boolean，表示 Skill 推荐是否完成

---

### 2.11. 推荐 MCP（suggestMcps）

**功能**：通过 LLM 基于 Agent 用途，从预置 MCP 包中推荐最匹配的 MCP 列表。

**入参**：
- input：purpose（用途）、description（描述，可选）
- context：LLM 调用上下文
- output：输出对象，承载 `{ mcpId, packageName, reason }[]`

**处理流程**：

1. 加载预置 MCP 包清单（含 filesystem、github、postgres、brave-search、memory、puppeteer、fetch、sequential-thinking，每个含 mcpId、packageName、keywords）；
2. 构造系统消息，要求 LLM 作为 MCP 推荐助手，输出 JSON 数组；
3. 构造用户消息，包含 purpose、description 与可用 MCP 包列表（含关键词）；
4. 调用 `LLMService.chat`（temperature 0.3），从响应中正则提取 JSON 数组并解析；
5. 解析失败时回退到关键词匹配：按用途词命中 MCP keywords 过滤，取前 3 条；
6. 将结果写入 output 返回；

**返回**：Boolean，表示 MCP 推荐是否完成

---

## 3. 重要内容

1. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；

---

## 4. 表设计

### 4.1. 自定义 Agent 表

- 表名：`custom_agent`
- 库名：`agent`

> 说明：CustomAgent 主体配置存储于图数据库（Graph DB），以下为逻辑表结构。

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识（agent_id） | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | ISO 时间字符串 |
| updated | 最后更新时间 | timestamp | N | 普通索引 | ISO 时间字符串 |
| name | Agent 名称 | VARCHAR(128) | N | | |
| role | Agent 角色 | VARCHAR(64) | N | | planner / worker / evaluator 等 |
| description | Agent 描述 | TEXT | N | | |
| strategy | 执行策略配置 | JSONB | N | | 含 type/maxIterations/stopConditions |
| llm_config | LLM 配置 | JSONB | N | | 含 providerId/modelId/temperature/maxTokens |
| prompt | 提示词配置 | JSONB | N | | 含 system/instruction/variables |
| soul_id | Soul ID | UUID | Y | 外键 | 关联 soul 配置 |
| work_ids | Work ID 列表 | JSONB | Y | | 数组 |
| sources | 知识来源配置 | JSONB | Y | | 含 knowledgeBase/webSearch/searchEngine |
| active | 是否启用 | BOOLEAN | N | | 默认 true |
| is_system | 是否系统内置 | BOOLEAN | Y | | 默认 false |

### 4.2. Agent-MCP 关联表

- 表名：`agent_mcp`
- 库名：`agent`

> 说明：存储于关系型数据库（SQLite），建立 Agent 与 MCP 的多对多关联。

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | | 默认当前时间 |
| agent_id | Agent ID | UUID | N | 外键 | 关联 custom_agent 表 |
| mcp_id | MCP ID | UUID | N | 外键 | 关联 mcp_installed 表 |
| | | | | 联合唯一索引 | (agent_id, mcp_id) 唯一 |

### 4.3. Agent-Skill 关联表

- 表名：`agent_skill`
- 库名：`agent`

> 说明：建立 Agent 与 Skill 的多对多关联。Skill ID 列表当前以 JSONB 内嵌于 custom_agent，独立关联表用于规范化查询场景。

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | | |
| updated | 更新时间 | timestamp | N | | |
| agent_id | Agent ID | UUID | N | 外键 | 关联 custom_agent 表 |
| skill_id | Skill ID | UUID | N | 外键 | 关联 skill 表 |
| | | | | 联合唯一索引 | (agent_id, skill_id) 唯一 |
