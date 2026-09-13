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

**功能**：根据任务特征匹配已存在的 Agent，实现复用（标准 3 层匹配逻辑）
**入参**：
- input：MatchAgentInput（继承 Input），包含以下字段：
  - task_signature：任务特征签名（内容摘要、复杂度评分、领域标签等）
  - agent_type：期望的 Agent 类型（可选，不传则不限类型；注意：PLANNER / WRITER / EVOLUTOR 等固定内置系统 Agent 不走动态选择/自生成逻辑）
  - similarity_threshold：相似度阈值（0-1，默认 0.7）
- context：MatchAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：MatchAgentOutput（继承 Output），承载返回内容：
  - agent_id：匹配到的 Agent ID（未匹配到则为空）
  - similarity_score：相似度分数
  - matched_by：匹配来源（`SIMILARITY` / `LLM` / 空）

**处理流程**：

1. 调用 RelationDBProvider 从 `agent_library_config` 表加载 `similarity_threshold` 与 `regen_rate`（默认 75）；
2. 从 `agent` 表加载启用的 Worker Candidate 候选列表（排除禁用节点）；
3. **第 1 层算法匹配 (simpleSimilarity)**：针对候选 Worker Agents，计算 `task_signature` 的跨领域 2-gram 字符特征相似度。若得分 $\ge \text{similarity\_threshold}$，且随机概率命中复用（$Roll \ge \text{regen\_rate}$），直接复用该 Agent 并返回 `matched_by = 'SIMILARITY'`；
4. **第 2 层 LLM 打分评估**：若第 1 层未命中，将候选 Agent 列表通过 Prompt 提交 LLM 评估，得分 $\ge \text{similarity\_threshold}$ 时选用并返回 `matched_by = 'LLM'`；
5. **第 3 层自生成**：若前两层均未匹配，返回空 `agent_id`，触发 `AgentBuilder.buildAgent` 构建新的 Worker Agent；

### 2.3. 更新 Agent（updateAgent）

**功能**：更新 `agent` 表的元数据字段（名称、用途描述 agent_purpose、任务特征签名、评估分数、启用状态、策略 ID、llm_id、soul_id）。Skill/MCP 1-to-many 绑定仍由 Core 管理；llm_id/soul_id 的 1-to-1 外键可由 Evolutor 触发的 optimizeAgent 写回。
**入参**：
- input：UpdateAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - agent_name：Agent 名称（可选）
  - agent_purpose：Agent 用途/描述（可选，对应"配置中心 > Agent 配置 > Agent 实例"页面的"描述"字段，参与 Agent 复用匹配的 LLM 评估）
  - task_signature：任务特征签名（可选）
  - eval_score：评估分数（可选，0-100）
  - enable：启用/禁用（可选）
  - strategy_id：策略 ID（可选）
  - llm_id：绑定的 LLM ID（可选，来自 Core.matchLLM）
  - soul_id：绑定的 Soul ID（可选，来自 Core.matchSoul/optSoul）
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
2. 按日统计 upsert：以 `IdGenerator.today()`（YYYY-MM-DD）为键，对 `agent_usage_daily` 表执行 upsert——当天已有记录则 `usage_count + 1`，否则新增 `{ agent_id, usage_date, usage_count: 1 }`；
3. 调用 RelationDBProvider 更新 `agent` 表的 `usage_count` 字段自增 1（UPDATE agent SET usage_count = usage_count + 1, updated = now() WHERE agent_id = ...）；
4. 返回 true；

> 三层口径：`agent_usage`（带时间戳的明细，可追溯单次使用）→ `agent_usage_daily`（按日聚合，供老化按日期窗口统计）→ `agent.usage_count`（累计快照，供 Evolutor 评分加权平均）。

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

1. 调用 RelationDBAccess.select 加载 `agent_opt_rule` 全部规则；
2. **ALL-rules 语义**：对每个启用中的非系统 Agent，当且仅当「每一条规则」都同时满足  
   `窗口内 usage_count < min_usage_count` **且** `eval_score < min_eval_score` 时，才将该 Agent 老化；  
   任一条规则不满足（使用足够多或评分足够高）则保留；
3. 时间窗口按日期统计：截止日期 `cutoffDate = IdGenerator.dateOf(now - days * 24 * 60 * 60 * 1000)`（YYYY-MM-DD），  
   窗口内使用量 = `SUM(agent_usage_daily.usage_count) WHERE agent_id = ? AND usage_date >= cutoffDate`；
4. 排除 `PLANNER` / `WRITER` / `EVOLUTOR` 系统 Agent；
5. 对通过 ALL-rules 判定的 agent_id 调用 RelationDBAccess.update 将 `enable=0`；
6. 将老化数量写入 output；

> 分页 Page 字段统一为 Base 定义：`{ current, size }`（从 1 开始），禁止使用 page/page_size。

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

### 2.9. 删除 Agent（delAgent）

**功能**：按主键 ID 删除 Agent，并级联清理其关联数据（使用记录与绑定关系）
**入参**：
- input：DelAgentInput（继承 Input），包含以下字段：
  - ids：Agent 主键 ID 列表（`agent.id`，非 `agent_id`）
- context：AgentLibraryContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：DelAgentOutput（继承 Output），承载返回内容：
  - deleted_count：实际删除的 Agent 数量

**处理流程**：

1. 遍历 `ids`：对每个主键 ID 调用 RelationDBAccess.select 查询 `agent` 表，不存在则跳过；
2. 命中后取出该记录的 `agent_id`，依次级联清理关联数据：
   a. 删除 `agent_usage`（使用统计，按 agent_id）；
   b. 删除绑定关系 `agent_llm` / `agent_skill` / `agent_soul`（按 agent_id）；
   c. 删除 `agent_mcp_usage`（通过子查询按 agent_id 关联的 agent_mcp.id）后删除 `agent_mcp`；
3. 删除 `agent` 表主记录（按主键 id）；
4. 将删除数量累加写入 output.deleted_count。

### 2.10. 切换启用状态（toggleAgent）

**功能**：按主键 ID 翻转 Agent 的 enable 状态（启用 ↔ 禁用）
**入参**：
- input：ToggleAgentInput（继承 Input），包含以下字段：
  - id：Agent 主键 ID（`agent.id`，非 `agent_id`）
- context：AgentLibraryContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ToggleAgentOutput（继承 Output），承载返回内容：
  - enable：翻转后的启用状态

**处理流程**：

1. 校验 `id` 非空；调用 RelationDBAccess.select 按主键 id 查询 `agent` 表，不存在则抛出 NotFoundError；
2. 读取当前 enable 并取反，调用 RelationDBAccess.update 将 `enable` 写回（同时更新 `updated`）；
3. 将翻转后的 enable 写入 output。

> 禁用生效：`matchAgent` 匹配候选仅加载 enable=true 的 Agent；`AgentExecution.execAgent` 执行前校验 Agent enable，禁用时抛 NotFoundError 拒绝执行。

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

### 3.2.1. Agent 按日使用统计表

- 表名：agent_usage_daily
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | Agent ID | UUID | N | 普通索引 | |
| usage_date | 使用日期 | TEXT | N | 普通索引 | YYYY-MM-DD，本地时区 |
| usage_count | 当日使用次数 | INT | N | | 默认 0 |

> 唯一约束：`UNIQUE(agent_id, usage_date)`。由 `recordAgentUsage` 实时维护（当天 upsert）；
> 历史数据在 Schema 初始化时从 `agent_usage` 明细表按 `(agent_id, usage_date)` 幂等回填（仅当日历表为空时执行一次）。
> 老化 `ageAgent` 直接按 `usage_date >= cutoffDate` 对 `usage_count` 求和，无需再扫描明细表。

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

---

## 6. 代码变更记录

### [2026-08-19] Agent 实例全量检查与最佳配置生成
**变更原因**："配置中心 > Agent 配置 > Agent 实例"页面所有 Agent 参数（描述 / 任务签名 / 执行策略）需生成并落地最佳配置；同时发现该页面创建与编辑保存为桩实现，无法持久化，且"描述"字段未打通前后端。
**修改的方法**：
  - `updateAgent(UpdateAgentInput, AgentLibraryContext, UpdateAgentOutput)` — 原始代码：不持久化 `agent_purpose`（前端"描述"字段提交后丢失）。修改后：新增 `agent_purpose` 字段持久化。
    ```
    原始代码（updateAgent 内）：
    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
    if (input.agent_name !== undefined) data.push({ field: 'agent_name', value: input.agent_name });
    if (input.task_signature !== undefined) data.push({ field: 'task_signature', value: input.task_signature });
    ...（不含 agent_purpose）
    ```
  - `dev-server.ts` 中 `POST /api/agent` — 原始桩实现直接返回假 ID；修改后真实调用 `agentLibrary.addAgent` 创建（校验 agent_type，缺省策略取 `agent_strategy_config.default_strategy_id`，缺省 LLM 取 `llm_available.is_default=1`）。
  - `dev-server.ts` 中 `PUT /api/agent/{id}` — 原始桩实现直接返回 success；修改后按行主键 `id` 解析出 `agent_id` 并调用 `agentLibrary.updateAgent` 持久化 name/description(agent_purpose)/task_signature/strategy_id/llm_id/soul_id。
  - `AgentLibrary/index.ts` — 导出 `VALID_AGENT_TYPES` 供 dev-server 创建时校验。
  - `ConfigView.vue` — Agent 卡片展示与编辑弹窗打通 `agent_purpose`（描述）；执行策略下拉/标签改用 `/api/agent/strategy`（Agent 执行策略 CoT/ReAct/Plan-and-Solve），原误用编排策略 `/api/orchestration/strategies`。
**影响的端点**：
  - `GET /api/agent` — 返回数据不变，新增 agent_purpose 已正确填充，前端卡片展示"描述"。
  - `POST /api/agent` — 从桩实现改为真实创建（修复页面"创建 Agent"按钮）。
  - `PUT /api/agent/{id}` — 从桩实现改为真实更新（修复页面"保存"按钮）。
  - `DELETE /api/agent/{id}`、`POST /api/agent/{id}/toggle` — 不变。
  - 定时任务 / 学习链路 — 不受影响。
**可能存在的问题**：
  - 手工通过 API 创建 Agent 时不会自动绑定 Skill/MCP（与 AgentBuilder 动态构建流程不同），仅写 agent 表元数据；如需完整绑定请走构建链路。
  - 系统 Agent（PLANNER/WRITER/EVOLUTOR/SUMMARY）的 task_signature 已由精简签名（如 `[writer] writer`）改为关键字丰富签名，可提升 `simpleSimilarity` 复用命中率，但不会改变执行行为。
  - 4 个 WORKER Agent 原先指向已不存在的 LLM ID（4a6bada6-...），现统一指向默认文本模型 gemini-3.7-flash（574cca78-...），消除每次调用先失败再降级的日志噪音。

### [2026-08-19] 全部 15 个 Agent 最佳配置落地
- 描述（agent_purpose）：4 个系统 Agent 由空补全为职责描述；11 个 WORKER Agent 细化领域职责描述。
- 任务签名（task_signature）：4 个系统 Agent 由极简签名改写为关键字丰富签名；WORKER 保持领域签名。
- 执行策略（strategy_id）：`planning-规划筹备助手` 由 ReAct 调整为 Plan-and-Solve（规划类任务典型为复杂多步骤）。
- LLM：全部 Agent 统一为 gemini-3.7-flash（574cca78-ee61-4c58-ba91-82f5d7485089），清理悬空 ID。
- Soul：EvolutorAgent 调整为"严苛导师"（0f8c432e-...）以契合严格评估角色；Summary 保持"摘要生成专家"；其余保持"专业编码与研究助手"。

### [2026-08-19] usage_count 改造：新增按日统计表 agent_usage_daily
**变更原因**：原老化统计直接对 `agent_usage` 明细表按 `created` 毫秒时间窗 COUNT，明细表越大扫描越重；需要按日期维度统计每日使用量，方便老化按过期日期窗口精确计数。
**修改的方法**：
  - `recordAgentUsage(RecordAgentUsageInput, AgentLibraryContext, RecordAgentUsageOutput)` — 原始代码：仅写 `agent_usage` 明细 + `agent.usage_count` 累计。修改后：新增对 `agent_usage_daily` 按 `IdGenerator.today()`（YYYY-MM-DD）upsert 当天计数。
    ```
    原始代码（recordAgentUsage 内）：
    await this.relationDb.insert(AGENT_USAGE_TABLE, [ ...明细... ]);
    const usageCount = Number(existing.usage_count ?? 0) + 1;
    await this.relationDb.update(AGENT_TABLE, [ usage_count... ], ...);
    ```
  - `ageAgent(AgeAgentInput, AgentLibraryContext, AgeAgentOutput)` — 原始代码：`count(agent_usage WHERE created >= now - days*86400000)` 扫描明细表。修改后：`SUM(agent_usage_daily.usage_count) WHERE usage_date >= dateOf(now - days*86400000)` 按日期窗口求和。
  - `AgentLibrarySchemaInitializer.init()` — 新增 `agent_usage_daily` 表（UNIQUE(agent_id, usage_date)）+ 索引；新增私有方法 `backfillDailyUsage()` 从 `agent_usage` 幂等回填（仅当日历表为空时执行）。
  - `Base/ToolProvider/IdGenerator` — 新增 `dateOf(ts)`：将毫秒时间戳格式化为本地 YYYY-MM-DD，与 `today()` 同口径，供回填与老化截止日期计算。
  - `Agent/domain/types.ts` — 新增 `AgentUsageDailyRecord` 接口与 `AGENT_USAGE_DAILY_TABLE` 常量。
  - `Agent/test/test-helpers.ts` — 内存测试库新增 `agent_usage_daily` 表。
  - `Agent/test/agent-library.test.ts` — 新增 TC-AL-029b：按日统计当天计数自增校验。
**影响的端点**：
  - 使用统计链路（AgentExecution / WriterAgent / AgentBuilder 复用命中 / OrchestrationExecution 触发 recordAgentUsage）— 行为不变，仅新增按日统计写。
  - 老化定时任务 `ageAgent`（由 SelfLearning 触发）— 统计口径从明细时间窗改为按日表日期窗，结果等价且更高效。
  - `agent.usage_count` 累计快照保留，Evolutor 评分加权平均逻辑不变。
**可能存在的问题**：
  - `agent_usage_daily` 是新增表，旧库首次启动自动建表+回填；若 `agent_usage` 数据量极大，首次回填会占用一些启动时间（本项目当前 85 行，可忽略）。
  - 时区口径：`usage_date` 使用本地时区（`IdGenerator.today()` / `dateOf()` 均为本地），跨时区部署时历史回填与实时写入保持一致（都走本地）。

### [2026-09-13] Agent 实例去重合并与中文命名规范治理
**变更原因**："配置中心 > Agent 配置 > Agent 实例"页面共 43 个 Agent，存在大量同领域一次性任务副本（8 个 general、4 个 coding、4 个 travel、2 个 devops 等，签名多为 "hi"/"你是谁？"/具体子任务），且命名带英文前缀（`general-`/`coding-`）与"助手"后缀，不符合命名规范。执行去重合并 + 统一中文命名。
**修改的方法**：
  - 数据治理（无代码改动），执行脚本 `agent_merge_20260913.py`，备份 `brian-backend/data/brian.db.bak-agentmerge-20260913-230950`：
    - 删除 25 个重复/一次性 Agent（architecture→并入 ai；4 个 coding 副本→并入 coding；2 个 devops 副本→并入 devops；evaluation→并入 testing；12 个 general 副本 + math→并入 通用问答；1 个 research 副本→并入 research；3 个 travel 副本→并入 travel）；级联清理 `agent_llm`/`agent_usage`/`agent_skill`/`agent_soul`（口径对齐 `delAgent`），历史 `agent_evaluation`/trace 保留。
    - 保留 18 个并统一改名（10-30 个汉字、纯中文核心功能名、无 `general-` 前缀/随机后缀/"助手"后缀）：EVOLUTOR→执行结果质量评估与组件自动进化；INTENT→用户需求理解与意图识别；PLANNER→复杂任务拆解与执行规划；SUMMARY→内容摘要提炼与上下文压缩；WRITER→执行结果汇总与最终回答生成；WORKER 每领域保留 1 个代表（人工智能模型选型与智能体架构设计 / 数据分析研判与风险论证 / 软件编码开发与测试部署 / 视觉物料与创意方案设计 / 环境部署上线与运维监控 / 测试用例设计与评测基准建设 / 日常问答与知识科普咨询 / 品牌定位与营销活动策划 / 目标方案规划与执行编排 / 资料检索调研与综述报告 / 旅行行程规划与票务住宿预订 / 出行天气信息查询与播报 / 文稿撰写与内容创作润色），同步泛化被并入领域的 `agent_purpose` 与 `task_signature`。
**影响的端点**：
  - `GET /api/agent` — 数量 43→18，名称全部为中文核心功能名。
  - `AgentBuilder.buildSystemAgent` — 系统 Agent 按 `agent_type` 查找复用，改名不影响命中；仅当库中不存在时才会用 `defaultName`（任务规划/写作汇总等短名）新建，与现存名称不一致属兜底路径。
  - Worker 匹配复用 — 各任务签名域前缀（`[ai]`/`[coding]`/…）唯一化，同域任务将命中领域代表 Agent，不再命中一次性副本。
  - `DELETE /api/agent/{id}` 的 user 资产守卫 — 本次为 DB 层人工治理（非系统自动删除），不走 `delAgent` 守卫，与 2026-08-19 全量检查口径一致。
**可能存在的问题**：
  - 被删除 Agent 的 `agent_evaluation`/`agent_execution_trace` 历史保留但指向已不存在的 agent_id，历史页面按名称快照展示不受影响。
  - 一次性任务签名（如 "[general] 什么是 AI ？"）不再有可复用实例，后续同类任务会由 AgentBuilder 重新匹配领域代表或新建实例（usage 高的热门一次性任务可能触发一次新建）。
  - 系统级 Agent 新建兜底名（`SYSTEM_AGENT_CONFIG.defaultName`，如"任务规划"）短于 10 字，与本次命名规范不完全一致；如需完全对齐可后续统一 defaultName。
