# Agent Library

## 1. 设计目标

1. 管理 Agent 实例的注册、存储和查询（CRUD），仅维护 `agent` 表自身的元数据；
2. 基于任务特征匹配现有 Agent 以实现复用（降低构建成本）；
3. 基于保留窗口内的使用频率和评估分数老化 Agent，保持 Agent 仓库的精简与高质量。

> 注意：Agent 与 Skill/MCP/LLM/Soul 的绑定关系由 Core 层（SkillCore/optimizeSkill、MCPCore/optimizeMCP、LLMCore/matchLLM、SoulCore/optimizeSoul）统一管理，Agent 层不重复写这些绑定表。

## 2. 功能设计

### 2.1. 添加 Agent（addAgent）

**功能**：将一个构建完成的 Agent 保存到仓库中
**入参**：
- input：AddAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - agent_type：Agent 类型（WORKER / PLANNER / WRITER / EVOLUTOR）
  - strategy_id：绑定的策略 ID
  - llm_id：绑定的 LLM ID
  - soul_id：绑定的 Soul ID
  - task_signature：任务特征签名（用于复用匹配）
  - agent_name：Agent 名称
- context：AddAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：AddAgentOutput（继承 Output），承载返回内容：
  - agent_id：保存的 Agent ID

**处理流程**：

1. 校验入参：`agent_id` 不能为空、`agent_type` 必须为有效枚举值、`strategy_id` 不能为空；
2. 调用 RelationDBProvider.insertDB 将 Agent 元数据写入 `agent` 表；
3. 将 `agent_id` 写入 output 返回；

> Skill/MCP 的绑定关系由 AgentBuilder 在构建阶段通过 SkillCore.optimizeSkill、MCPCore.optimizeMCP 写入 Core 层管理的 `agent_skill`/`agent_mcp` 表，AgentLibrary 不重复操作。

### 2.2. 匹配 Agent（matchAgent）

**功能**：根据任务特征匹配已存在的 Agent，实现复用
**入参**：
- input：MatchAgentInput（继承 Input），包含以下字段：
  - task_signature：任务特征签名（内容摘要、复杂度评分、领域标签等）
  - agent_type：期望的 Agent 类型（可选，不传则不限类型）
  - similarity_threshold：相似度阈值（0-1，默认 0.7）
- context：MatchAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：MatchAgentOutput（继承 Output），承载返回内容：
  - agent_id：匹配到的 Agent ID（未匹配到则为空）
  - similarity_score：相似度分数

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `agent_library_config` 表获取 `prompt_template_id` 和 `similarity_threshold`；
2. 调用 RelationDBProvider.selectDB 从 `agent` 表加载所有启用（enable=true）的 Agent，获取各 Agent 的 ID、agent_type、task_signature、usage_count 和 eval_score；
3. 若入参 `agent_type` 非空，过滤仅保留匹配类型的 Agent；
4. 若符合条件的 Agent 列表为空，返回 agent_id 为空（表示需要新建 Agent）；
5. 调用 PromptsProvider.execPrompt 使用 `agent_library_config` 中的 `prompt_template_id` 构建 Agent 匹配 prompt，将 `task_signature` 与候选 Agent 的 `task_signature` 列表一并提交；
6. 调用 LLMProvider.execLLM 由模型评估任务特征与各候选 Agent 的匹配度，返回最匹配的 agent_id 和 similarity_score（LLM 输出 JSON `{ "agent_id": "...", "score": 0.85 }`）；
7. 若 similarity_score >= similarity_threshold 且 agent_id 有效：调用 RelationDBProvider.selectOneDB 校验 agent_id 对应的 Agent 仍处于启用状态，若 Agent 已被禁用则视为未匹配到；校验通过后返回 agent_id 及 similarity_score；
8. 若 similarity_score < similarity_threshold 或 agent_id 无效/已被禁用：返回 agent_id 为空，表示需要调用 AgentBuilder 创建新 Agent；
9. 返回匹配结果写入 output；

### 2.3. 更新 Agent（updateAgent）

**功能**：更新 `agent` 表的元数据字段（名称、任务特征签名、评估分数、启用状态、策略 ID）。不涉及 Skill/MCP/LLM/Soul 绑定变更——绑定变更统一通过 AgentBuilder.optimizeAgent 调用 Core 层的 optimize/match 接口完成。
**入参**：
- input：UpdateAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - agent_name：Agent 名称（可选）
  - task_signature：任务特征签名（可选）
  - eval_score：评估分数（可选，0-100）
  - enable：启用/禁用（可选）
  - strategy_id：策略 ID（可选）
- context：UpdateAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateAgentOutput（继承 Output），承载返回内容

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 `agent_id` 查询 `agent` 表确认 Agent 存在；不存在则返回 false；
2. 调用 RelationDBProvider.updateDB 更新入参中传入的非空字段；
3. 返回 true；

### 2.4. 使用记录（recordAgentUsage）

**功能**：记录 Agent 被使用的事件，用于老化统计和复用权重
**入参**：
- input：RecordAgentUsageInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - work_id：工作 ID
  - interact_id：交互 ID
  - usage_context：使用上下文摘要（可选）
- context：RecordAgentUsageContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：RecordAgentUsageOutput（继承 Output），承载返回内容

**处理流程**：

1. 调用 RelationDBProvider.insertDB 向 `agent_usage` 表写入使用记录 `{ agent_id, work_id, interact_id, usage_context }`；
2. 调用 RelationDBProvider 更新 `agent` 表的 `usage_count` 字段自增 1（UPDATE agent SET usage_count = usage_count + 1, updated = now() WHERE agent_id = ...）；
3. 返回 true；

### 2.5. 查看 Agent（getAgent / soAgent）

**功能**：根据条件查询 Agent 列表或单个 Agent
**入参**：
- input：GetAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent ID（可选，传入则查单个）
  - agent_type：Agent 类型（可选）
  - conditions：额外的 Condition 查询条件（可选）
  - order_by：排序字段（可选）
  - page：分页参数（可选）
- context：GetAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetAgentOutput（继承 Output），承载返回内容：
  - agents：Agent 列表，每项含 { agent_id, agent_name, agent_type, strategy_id, llm_id, soul_id, task_signature, usage_count, eval_score, enable, created, updated }

**处理流程**：

1. 若 `agent_id` 非空：调用 RelationDBProvider.selectOneDB 查询 `agent` 表获取该 Agent 元数据；
2. 否则：构建查询条件（agent_type + conditions），调用 RelationDBProvider.selectDB 查询 `agent` 表；
3. 返回 Agent 元数据列表写入 output；

> 调用方如需获取 Agent 绑定的 Skill/MCP 列表，可直接查询 Core 层管理的 `agent_skill`（库名: skill）、`agent_mcp`（库名: mcp）表。

### 2.6. 老化 Agent（ageAgent）

**功能**：基于保留窗口内的使用频率和评估分数，将低质量/不常用 Agent 标记为非启用状态
**入参**：无额外参数（规则从 agent_opt_rule 表读取）
- input：AgeAgentInput（继承 Input）
- context：AgeAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：AgeAgentOutput（继承 Output），承载返回内容：
  - aged_count：老化的 Agent 数量

**处理流程**：

1. 调用 RelationDBProvider.selectDB 加载 `agent_opt_rule` 表中的所有老化规则（ALL rules must be satisfied：所有规则必须全部满足，Agent 才会被老化），每条规则包含：
   - days：统计天数
   - min_usage_count：最小使用次数阈值
   - min_eval_score：最小评估分数阈值
2. 对每条规则：调用 RelationDBProvider 统计 `agent_usage` 表中各 Agent 在指定 days 天内的使用次数（`COUNT(*) WHERE created >= now() - days * 86400`）；
3. 调用 RelationDBProvider.selectDB 查询 `agent` 表获取每个 Agent 的 eval_score；
4. 收集使用次数 < min_usage_count 且 eval_score < min_eval_score 的 agent_id 作为待老化列表（排除 PlannerAgent、WriterAgent、EvolutorAgent 类型的系统级 Agent）；
5. 迭代待老化列表，对每个 agent_id 调用 RelationDBProvider.updateDB 将 `agent` 表的 `enable` 字段置为 false；
6. 将老化的 Agent 数量写入 output 返回；

### 2.7. 老化规则管理（getAgentRule / updateAgentRule）

**功能**：查看和修改 Agent 老化规则
**入参**：
- input：GetAgentRuleInput（继承 Input），包含以下字段：
  - conditions：查询条件（可选）
  - order_by：排序字段（可选）
  - page：分页参数（可选）
- context：GetAgentRuleContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetAgentRuleOutput（继承 Output），承载返回内容：
  - rules：老化规则列表

**updateAgentRule 入参**：
- input：UpdateAgentRuleInput（继承 Input），包含以下字段：
  - operations：操作列表，每项含 type=INSERT/UPDATE/DELETE, id, data={days, min_usage_count, min_eval_score}
- context：UpdateAgentRuleContext（继承 Context）
- output：UpdateAgentRuleOutput（继承 Output）

**处理流程**：

**getAgentRule**：
1. 构建查询条件，调用 RelationDBProvider.selectDB 查询 `agent_opt_rule` 表；
2. 返回规则列表写入 output；

**updateAgentRule**：
1. 调用 RelationDBProvider.transactionDB 开启事务；
2. 遍历 `operations` 列表：
   a. type=INSERT：校验 days 为正整数、min_usage_count >= 0、min_eval_score 为 0-100 整数，调用 RelationDBProvider.insertDB 新增记录；
   b. type=UPDATE：校验 id 存在，调用 RelationDBProvider.updateDB 更新；
   c. type=DELETE：调用 RelationDBProvider.deleteDB 删除；
3. 事务提交成功返回 true；

### 2.8. 配置（configAgentLibrary）

**功能**：配置 AgentLibrary 的参数
**入参**：
- input：ConfigAgentLibraryInput（继承 Input），包含以下字段：
  - prompt_template_id：Agent 匹配 prompt 模板 ID（可选）
  - similarity_threshold：复用匹配相似度阈值（0-1，可选）
  - max_agent_count：最大 Agent 保留数量（可选，超过则触发老化清理）
- context：ConfigAgentLibraryContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigAgentLibraryOutput（继承 Output），承载返回内容：
  - prompt_template_id：当前生效的模板 prompt ID
  - similarity_threshold：当前生效的相似度阈值
  - max_agent_count：当前生效的最大保留数量

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `agent_library_config` 表获取当前配置；
2. 若 `prompt_template_id` 非空：校验 PromptsProvider.soPrompt 中存在，存在则更新；
3. 若 `similarity_threshold` 非空：校验为 0-1 的浮点数，更新；
4. 若 `max_agent_count` 非空：校验为正整数，更新；
5. 调用 RelationDBProvider.updateDB 写入配置；
6. 若更新后 Agent 总数 > max_agent_count，触发一次 ageAgent（异步执行）；
7. 默认配置初始化：similarity_threshold=0.7、max_agent_count=100、prompt_template_id 为空；
8. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. Agent 表

- 表名：agent
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | Agent ID | UUID | N | 唯一索引 | |
| agent_name | Agent 名称 | VARCHAR | N | | |
| agent_type | Agent 类型 | VARCHAR | N | 普通索引 | WORKER/PLANNER/WRITER/EVOLUTOR |
| strategy_id | 绑定的策略 ID | UUID | N | | |
| llm_id | 绑定的 LLM ID | UUID | N | | |
| soul_id | 绑定的 Soul ID | UUID | N | | |
| task_signature | 任务特征签名 | TEXT | N | | 去除停用词的摘要文本 |
| usage_count | 累计使用次数 | INT | N | | 默认 0 |
| eval_score | 评估分数 | INT | N | | 0-100，默认 50 |
| enable | 是否启用 | BOOL | N | | 默认 true |

> 1-to-many 的 Skill/MCP 绑定关系由 Core 层表管理（`agent_skill` 库名: skill、`agent_mcp` 库名: mcp、`agent_llm` 库名: llm、`agent_soul` 库名: soul），Agent 层不重复建表。

### 3.2. Agent 使用记录表

- 表名：agent_usage
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | Agent ID | UUID | N | 普通索引 | |
| work_id | 工作 ID | UUID | N | | |
| interact_id | 交互 ID | UUID | N | | |
| usage_context | 使用上下文摘要 | TEXT | Y | | |

### 3.3. Agent 老化规则表

- 表名：agent_opt_rule
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| days | 统计天数 | INT | N | 普通索引 | 默认 30 |
| min_usage_count | 最小使用次数 | INT | N | | 低于该值则匹配老化条件 |
| min_eval_score | 最小评估分数 | INT | N | | 低于该分则匹配老化条件 |

### 3.4. AgentLibrary 配置表

- 表名：agent_library_config
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| prompt_template_id | Agent 匹配 prompt 模板 ID | UUID | N | | |
| similarity_threshold | 复用相似度阈值 | FLOAT | N | | 默认 0.7 |
| max_agent_count | 最大 Agent 保留数量 | INT | N | | 默认 100 |
