# Skill Core

## 1. 设计目标

1. 根据工作为Agent匹配最佳的Skill；
2. 推动Skill的自动优化（agent-Skill绑定优化）；
3. 老化不常用的Skill，保持Skill集合的精简；

## 2. 功能设计

### 2.1. 匹配Skill（matchSkill）

**功能**：生成处理工作所需要的Skill
**入参**：
- input：MatchSkillInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - interact_id：交互 ID
- context：MatchSkillContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：MatchSkillOutput（继承 Output），承载返回内容：
  - skill_ids：匹配的 Skill ID 列表
**处理流程**：

1. 调用 RelationDBProvider.selectDB 根据 `agent_id` 查询 `agent_skill` 表，获取该 Agent 已绑定的 skill_id 列表；
2. 若存在绑定的 Skill：生成随机数（0-100），若随机数 >= regen_rate（从 `skill_core_config` 表读取，默认 75），则直接返回已绑定的 skill_id 列表（复用已有绑定）；
3. 若随机数 < regen_rate 或不存在绑定，执行重新匹配流程：
   a. 根据 Context 参数中的 `interact_id` 和 `agent_id` 获取当前工作内容（由 Context 参数携带，无需显式调用 InfoCore.context）；
   b. 调用 SkillProvider.soSkill 加载所有已启用的 Skill（conditions: `{ enable: true }`），获取各 Skill 的 ID 和简要描述（skill_brief）；
   c. 若可用 Skill 列表为空，直接返回空列表（无 Skill 可用）；
   d. 调用 RelationDBProvider.selectOneDB 查询 `skill_core_config` 表获取 `prompt_template_id`；
   e. 将工作内容和 Skill 列表（ID + brief）与 `prompt_template_id` 调用 PromptsProvider.execPrompt 构建 Skill 匹配 prompt；
   f. 调用 LLMProvider.execLLM 由模型推荐合适的 skill_id 列表（LLM 输出需包含选中的 skill_id JSON 数组，解析提取）；
4. 返回匹配到的 skill_id 列表；

### 2.2. 自动优化任务（optimizeSkill）

**功能**：优化Skill
**入参**：
- input：OptimizeSkillInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - interact_id：交互 ID
  - skill_id：Skill ID
- context：OptimizeSkillContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：OptimizeSkillOutput（继承 Output），承载返回内容

**处理流程**：

1. 调用 RelationDBProvider.selectDB 根据 `agent_id` 查询 `agent_skill` 表，获取当前 Agent 已绑定的 skill_id 列表；
2. 遍历已绑定的 skill_id 列表，判断入参中的 `skill_id` 是否已存在于列表中：
   a. 若已存在：无需优化，直接返回 true；
3. 若 `skill_id` 不在列表中（新匹配到的 Skill 需要绑定）：
   a. 调用 RelationDBProvider.insertDB 向 `agent_skill` 表新增一条记录 `{ agent_id, skill_id }`（利用 agent_id + skill_id 联合唯一索引实现幂等）；
4. 返回 true 表示优化完成；

### 2.3. 老化Skill（ageSkill）

**功能**：基于保留窗口内的使用数量老化Skill，将近期不常用的Skill标记为非启用状态
**实现**：委托给 `AgingEngine.age` 统一处理，Skill 与 Soul 共享同一老化引擎。
**入参**：无额外参数（规则从skill_opt_rule表读取）
**处理流程**：

1. 调用 AgingEngine 加载 `skill_opt_rule` 表中的所有老化规则（ALL rules must be satisfied for aging：所有规则必须全部满足，Skill 才会被老化），每条规则包含 days（统计天数）和 min_usage_count（最小使用次数阈值）；
2. AgingEngine 对每条规则：调用 RelationDBProvider 统计 `skill_usage` 表中各 Skill 在指定 days 天内的使用次数（`COUNT(*) WHERE created >= now() - days * 86400`）；
3. AgingEngine 将使用次数低于 min_usage_count 的 skill_id 收集为待老化列表；
4. 迭代待老化列表，对每个 skill_id 调用 SkillProvider.updateSkill 将 `enable` 字段置为 false；
5. 将老化的 Skill 数量写入 output 返回；

### 2.4. 查看优化规则（getSkillRule）

**功能**：查看Skill老化的优化规则
**入参**：
- input：GetSkillRuleInput（继承 Input），包含以下字段：
  - conditions：查询条件（可选）
  - order_by：排序字段（可选）
  - page：分页参数（可选）
- context：GetSkillRuleContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetSkillRuleOutput（继承 Output），承载返回内容：
  - rules：优化规则列表
**处理流程**：

1. 构建查询条件：若 `conditions` 非空则作为 WHERE 过滤条件，若 `order_by` 非空则作为 ORDER BY 排序字段，若 `page` 非空则作为分页参数（Page 对象含 page_size 和 page_num）；
2. 调用 RelationDBProvider.selectDB 查询 `skill_opt_rule` 表，返回匹配的规则列表；
3. 将规则列表（每条含 id, days, min_usage_count）写入 output 返回；

### 2.5. 修改优化规则（updateSkillRule）

**功能**：修改Skill老化的优化规则，支持新增、修改、删除
**入参**：
- input：UpdateSkillRuleInput（继承 Input），包含以下字段：
  - operations：操作列表，每项含 type=INSERT/UPDATE/DELETE, id, data={days, min_usage_count}
- context：UpdateSkillRuleContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateSkillRuleOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.transactionDB 开启事务，保证以下操作的原子性；
2. 遍历 `operations` 列表，对每条操作：
   a. type=INSERT：校验 data 中 days 为正整数且 min_usage_count >= 0，调用 RelationDBProvider.insertDB 向 `skill_opt_rule` 表新增记录；
   b. type=UPDATE：校验 id 对应的记录是否存在，调用 RelationDBProvider.updateDB 更新 `{ days, min_usage_count }`；
   c. type=DELETE：调用 RelationDBProvider.deleteDB 根据 id 删除记录；
   d. 若任一条操作校验失败或执行失败，回滚事务并返回 false；
3. 事务提交成功，返回 true；

### 2.6. 配置（configSkillCore）

SET 行为：接受 `regen_rate` 和 `prompt_template_id` 作为可选更新字段，仅更新传入的非空字段。返回更新后的当前配置。
**入参**：
- input：ConfigSkillCoreInput（继承 Input），包含以下字段：
  - regen_rate：重新选择Skill的概率（可选）
  - prompt_template_id：模板prompt ID（可选）
- context：ConfigSkillCoreContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigSkillCoreOutput（继承 Output），承载返回内容：
  - regen_rate：当前生效的重新选择概率
  - prompt_template_id：当前生效的模板prompt ID

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `skill_core_config` 表获取当前配置；
2. 若 `regen_rate` 非空：校验为 0-100 的整数，更新 regen_rate 字段；
3. 若 `prompt_template_id` 非空：校验 PromptsProvider.soPrompt 中是否存在该 prompt_template_id，存在则更新，否则返回 false；
4. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `skill_core_config` 表；

**返回**：更新后的当前配置（regen_rate、prompt_template_id）

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. SkillCore配置表

- 表名：skill_core_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| regen_rate | 重新生成Skill的概率 | INTEGER | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |

### 3.2. AgentSkill关联表

- 表名：agent_skill
- 库名：skill

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | AgentId | UUID | N | 普通索引 | |
| skill_id | 绑定的skillId | UUID | N | | |

重要：agent_id + skill_id 构成联合唯一索引

### 3.3. Skill老化规则表

- 表名：skill_opt_rule
- 库名：skill

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| days | 统计天数 | INT | N | 普通索引 | |
| min_usage_count | 最小使用次数 | INT | N | | 低于该值则老化 |
