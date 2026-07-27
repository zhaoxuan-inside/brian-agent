# Soul Core

## 1. 设计目标

1. 根据工作为Agent匹配最佳的Soul；
2. 推动Soul的自动优化；
3. 老化不常用的Soul，保持Soul集合的精简；

## 2. 功能设计

### 2.1. 匹配Soul（matchSoul）

**功能**：生成处理工作所需要的Soul
**入参**：
- input：MatchSoulInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - interact_id：交互 ID
- context：MatchSoulContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：MatchSoulOutput（继承 Output），承载返回内容：
  - soul_id：匹配的 Soul ID
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 `agent_id` 查询 `agent_soul` 表，获取该 Agent 已绑定的 soul_id；
2. 若存在绑定的 soul_id：生成随机数（0-100），若随机数 >= regen_rate（从 `soul_core_config` 表读取，默认 75），则直接返回该 soul_id（复用已有绑定）；
3. 若随机数 < regen_rate 或不存在绑定，执行重新匹配流程：
   a. 根据 Context 参数中的 `interact_id` 和 `agent_id` 获取当前工作内容（由 Context 参数携带，无需显式调用 InfoCore.context）；
   b. 调用 SoulProvider.soSoul 加载所有已启用的 Soul（conditions: `{ enable: true }`），获取各 Soul 的 ID 和应用场景描述；
   c. 若没有可用的 Soul：调用 PromptsProvider.execPrompt 构建 Soul 生成 prompt（使用 `soul_core_config` 中的 `prompt_template_id`），调用 LLMProvider.execLLM 根据工作内容生成一个新 Soul（含内容、摘要、应用场景），调用 SoulProvider.addSoul 将生成的 Soul 保存到 `soul` 表，返回新生成的 soul_id；
   d. 若有可用的 Soul：调用 PromptsProvider.execPrompt 构建 Soul 匹配 prompt，调用 LLMProvider.execLLM 由模型推荐合适的 soul_id；
4. 返回匹配到的 soul_id；

### 2.2. 自动优化任务（optimizeSoul）

**功能**：agent-Soul绑定优化，判断是否为Agent更换更优的Soul
**入参**：
- input：OptimizeSoulInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - interact_id：交互 ID
  - soul_id：Soul ID
- context：OptimizeSoulContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：OptimizeSoulOutput（继承 Output），承载返回内容

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 `agent_id` 查询 `agent_soul` 表，获取当前绑定的 soul_id（记为 Soul_A）；
2. 若 Soul_A 与入参 `soul_id` 相同：无需优化，直接返回 true；
3. 若不同（新匹配的 Soul 需要与现有 Soul 对比）：
   a. 根据 Context 参数中的 `interact_id` 获取当前工作内容（由 Context 参数携带，无需显式调用 InfoCore.context）；
   b. 调用 SoulProvider.getSoul(soul_id) 获取新 Soul（Soul_B）的完整内容；
   c. 调用 SoulProvider.getSoul(Soul_A) 获取现有 Soul 的完整内容；
   d. 调用 RelationDBProvider.selectOneDB 查询 `soul_core_config` 表获取 `prompt_template_id`；
   e. 将工作内容、Soul_A 内容和 Soul_B 内容与 `prompt_template_id` 调用 PromptsProvider.execPrompt 构建对比 prompt；
   f. 调用 LLMProvider.execLLM 判断 Soul_A 还是 Soul_B 更优（LLM 输出 "A" 或 "B"）；
   g. 若 LLM 返回 "B"（新 Soul 更优）：调用 RelationDBProvider.updateDB 将 `agent_soul` 表中 agent_id 对应的 soul_id 更新为 Soul_B 的 ID；
   h. 若 LLM 返回 "A" 或解析失败：保持现有绑定不变；
4. 返回 true 表示优化执行完成（无论是否实际更换）；

### 2.3. 老化Soul（ageSoul）

**功能**：基于保留窗口内的使用数量老化Soul，将近期不常用的Soul标记为非启用状态
**实现**：委托给 `AgingEngine.age` 统一处理，Skill 与 Soul 共享同一老化引擎。
**入参**：无额外参数（规则从soul_opt_rule表读取）

**处理流程**：

1. 调用 AgingEngine 加载 `soul_opt_rule` 表中的所有老化规则（ALL rules must be satisfied for aging：所有规则必须全部满足，Soul 才会被老化），每条规则包含 days（统计天数）和 min_usage_count（最小使用次数阈值）；
2. AgingEngine 对每条规则：调用 RelationDBProvider 统计 `soul_usage` 表中各 Soul 在指定 days 天内的使用次数（`COUNT(*) WHERE created >= now() - days * 86400`）；
3. AgingEngine 将使用次数低于 min_usage_count 的 soul_id 收集为待老化列表；
4. 迭代待老化列表，对每个 soul_id 调用 SoulProvider.updateSoul 将 `enable` 字段置为 false；
5. 将老化的 Soul 数量写入 output 返回；

### 2.4. 查看老化规则（getSoulRule）

**功能**：查看Soul老化的优化规则
**入参**：
- input：GetSoulRuleInput（继承 Input），包含以下字段：
  - conditions：查询条件（可选）
  - order_by：排序字段（可选）
  - page：分页参数（可选）
- context：GetSoulRuleContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetSoulRuleOutput（继承 Output），承载返回内容：
  - rules：老化规则列表

**处理流程**：

1. 构建查询条件：若 `conditions` 非空则作为 WHERE 过滤条件，若 `order_by` 非空则作为 ORDER BY 排序字段，若 `page` 非空则作为分页参数；
2. 调用 RelationDBProvider.selectDB 查询 `soul_opt_rule` 表，返回匹配的规则列表；
3. 将规则列表（每条含 id, days, min_usage_count）写入 output 返回；

### 2.5. 修改老化规则（updateSoulRule）

**功能**：修改Soul老化的优化规则，支持新增、修改、删除
**入参**：
- input：UpdateSoulRuleInput（继承 Input），包含以下字段：
  - operations：操作列表，每项含 type=INSERT/UPDATE/DELETE, id, data={days, min_usage_count}
- context：UpdateSoulRuleContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateSoulRuleOutput（继承 Output），承载返回内容

**处理流程**：

1. 调用 RelationDBProvider.transactionDB 开启事务，保证以下操作的原子性；
2. 遍历 `operations` 列表，对每条操作：
   a. type=INSERT：校验 data 中 days 为正整数且 min_usage_count >= 0，调用 RelationDBProvider.insertDB 向 `soul_opt_rule` 表新增记录；
   b. type=UPDATE：校验 id 对应的记录是否存在，调用 RelationDBProvider.updateDB 更新 `{ days, min_usage_count }`；
   c. type=DELETE：调用 RelationDBProvider.deleteDB 根据 id 删除记录；
   d. 若任一条操作校验失败或执行失败，回滚事务并返回 false；
3. 事务提交成功，返回 true；

### 2.6. 配置（configSoulCore）

SET 行为：接受 `regen_rate` 和 `prompt_template_id` 作为可选更新字段，仅更新传入的非空字段。返回更新后的当前配置。
**入参**：
- input：ConfigSoulCoreInput（继承 Input），包含以下字段：
  - regen_rate：重新生成Soul的概率（可选）
  - prompt_template_id：模板prompt ID（可选）
- context：ConfigSoulCoreContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigSoulCoreOutput（继承 Output），承载返回内容：
  - regen_rate：当前生效的重新生成概率
  - prompt_template_id：当前生效的模板prompt ID

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `soul_core_config` 表获取当前配置；
2. 若 `regen_rate` 非空：校验为 0-100 的整数，更新 regen_rate 字段；
3. 若 `prompt_template_id` 非空：校验 PromptsProvider.soPrompt 中是否存在该 prompt_template_id，存在则更新，否则返回 false；
4. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `soul_core_config` 表；
5. 默认配置初始化由 `ConfigHelper.ensureDefaultConfig` 统一管理（regen_rate=75、prompt_template_id 为空）；

**返回**：更新后的当前配置（regen_rate、prompt_template_id）

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. SoulCore配置表

- 表名：soul_core_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| regen_rate | 重新生成Soul的概率 | INTEGER | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |

### 3.2. AgentSoul关联表

- 表名：agent_soul
- 库名：soul

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | AgentId | UUID | N | 唯一索引 | |
| soul_id | 绑定的SoulId | UUID | N | | |

### 3.3. Soul老化规则表

- 表名：soul_opt_rule
- 库名：soul

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| days | 统计天数 | INTEGER | N | 普通索引 | |
| min_usage_count | 最少使用次数 | INTEGER | N | | 低于该值则老化，默认0 |
