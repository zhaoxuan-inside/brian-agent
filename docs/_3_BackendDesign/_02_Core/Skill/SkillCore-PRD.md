# Skill Core

## 1. 设计目标

1. 根据工作为 Agent 匹配最佳的 Skill（LLM 基于 skill_brief + skill_md 进行相关性排序）；
2. 推动 Skill 的自动优化（Agent-Skill 绑定优化）；
3. 老化不常用的 Skill，保持 Skill 集合的精简；

## 2. 功能设计

### 2.1. 匹配 Skill（matchSkill）

**功能**：为 Agent 匹配处理工作所需的最佳 Skill。

**入参**：
- input：MatchSkillInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - context_id：交互上下文 ID
  - interact_id：交互记录 ID
- context：SkillCoreContext（继承 Context）
- output：MatchSkillOutput（继承 Output），承载返回内容：
  - skills：匹配到的 Skill 列表（MatchedSkillEntry[]，含 skill_id、skill_brief、relevance）

**处理流程**：

1. 调用 RelationDBProvider 根据 `agent_id` 查询 `agent_skill` 表，检查是否有已缓存的绑定；
2. 若存在缓存绑定且在 regen_rate 窗口内：直接返回缓存结果（skill_id + skill_brief）；
3. 否则执行重新匹配：
   a. 调用 SkillProvider.soSkill 加载所有已启用的 Skill（`enable = true`），获取各 Skill 的 id、skill_brief、skill_md 等字段；
   b. 若可用 Skill 列表为空，直接返回空列表；
   c. 从 `skill_core_config` 表获取 `prompt_template_id`；
   d. 若指定了 prompt_template_id，使用 PromptsProvider.execPrompt 渲染模板；否则使用 **默认 Prompt**：将每个 Skill 的 skill_brief 和 skill_md 拼接为 Prompt，由 LLM 按相关性排序；
   e. 调用 LLMProvider.execLLM 由模型推荐合适的 skill_id 列表（LLM 输出 JSON 数组，格式：`[{"skill_brief": "...", "relevance": 0.95}]`）；
   f. 解析 LLM 返回，按 skill_brief 匹配到 Skill ID；
4. 持久化匹配结果到 agent_skill 表（幂等，利用 agent_id + skill_id 联合唯一索引）；
5. 返回匹配到的 skill_id 列表；

**LLM 匹配提示词（默认模板）**：
- 向 LLM 发送每个 Skill 的 `skill_brief`（简述）和 `skill_md`（SKILL.md 全文）
- LLM 据此判断 Skill 与当前工作的相关性，返回排序结果
- 匹配的核心线索是 skill_md（技能"大脑"）

### 2.2. 自动优化任务（optimizeSkill / optSkill）

**功能**：自动将 Skill 绑定到 Agent，并记录使用。

**入参**：
- input：OptSkillInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - context_id：交互上下文 ID
  - interact_id：交互记录 ID
  - skill_id：Skill ID
- context：SkillCoreContext
- output：OptSkillOutput，承载返回内容：
  - binding：绑定记录或 null

**处理流程**：

1. 调用 RelationDBProvider 根据 agent_id + skill_id 查询 `agent_skill` 表；
2. 若已存在绑定：直接跳到步骤 3；
3. 若不存在：向 `agent_skill` 表新增一条绑定记录（利用联合唯一索引实现幂等）；
4. 向 `skill_usage` 表记录本次使用（记录 agent_skill_id、timestamp）；
5. 返回绑定记录；

### 2.3. 老化 Skill（ageSkill）

**功能**：基于保留窗口内的使用数量老化 Skill，将近期不常用的 Skill 标记为非启用状态。

**实现**：委托给 `AgingEngine.age` 统一处理，Skill 与 Soul 共享同一老化引擎。

**入参**：无额外参数（规则从 skill_opt_rule 表读取）

**处理流程**：

1. 调用 AgingEngine 加载 `skill_opt_rule` 表中的所有老化规则（ALL rules must be satisfied：所有规则必须全部满足，Skill 才会被老化），每条规则包含 days（统计天数）和 min_usage_count（最小使用次数阈值）；
2. AgingEngine 对每条规则：统计 `skill_usage` 表中各 Skill 在指定 days 天内的使用次数（`COUNT(*) WHERE created >= now() - days * 86400`）；
3. AgingEngine 将使用次数低于 min_usage_count 的 skill_id 收集为待老化列表；
4. 迭代待老化列表，对每个 skill_id 调用 SkillProvider.updateSkill 将 `enable` 字段置为 false；
5. 将老化的 Skill 数量写入 output 返回；

### 2.4. 查看优化规则（soSkillRule）

**功能**：查看 Skill 老化的优化规则。

**入参**：
- input：SoSkillRuleInput（继承 Input），包含以下字段：
  - conditions：查询条件（可选）
  - order_by：排序字段（可选）
  - page：分页参数（可选）
- context：SkillCoreContext
- output：SoSkillRuleOutput，承载返回内容：
  - rules：优化规则列表

**处理流程**：

1. 构建查询条件：若 `conditions` 非空则作为 WHERE 过滤条件，若 `order_by` 非空则作为 ORDER BY 排序字段，若 `page` 非空则作为分页参数（Page 对象含 page_size 和 page_num）；
2. 调用 RelationDBProvider.selectDB 查询 `skill_opt_rule` 表，返回匹配的规则列表；
3. 将规则列表（每条含 id, days, min_usage_count）写入 output 返回；

### 2.5. 修改优化规则（updateSkillRule）

**功能**：修改 Skill 老化的优化规则，支持新增、修改、删除。

**入参**：
- input：UpdateSkillRuleInput（继承 Input），包含以下字段：
  - operations：操作列表（Operation[]），每项含 type=INSERT/UPDATE/DELETE, table, data, conditions
- context：SkillCoreContext
- output：UpdateSkillRuleOutput

**处理流程**：

1. 遍历 `operations` 列表，对每条操作：
   a. type=INSERT：补充 id、created、updated 系统字段后调用 RelationDBProvider.insertDB
   b. type=UPDATE：补充 updated 后调用 RelationDBProvider.updateDB
   c. type=DELETE：调用 RelationDBProvider.deleteDB
2. 若任一条操作执行失败，抛出错误；

### 2.6. 配置（configSkillCore）

**功能**：获取或更新 skill_core_config 配置（SET 语义）。接受 `regen_rate` 和 `prompt_template_id` 作为可选更新字段，仅更新传入的非空字段。返回更新后的当前配置。

**入参**：
- input：ConfigSkillCoreInput（继承 Input），包含以下字段：
  - regen_rate：重新选择 Skill 的概率（可选）
  - prompt_template_id：模板 Prompt ID（可选）
- context：SkillCoreContext
- output：ConfigSkillCoreOutput：
  - regen_rate：当前生效的重新选择概率
  - prompt_template_id：当前生效的模板 Prompt ID

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `skill_core_config` 表获取当前配置；
2. 若 `regen_rate` 非空：校验为 0-100 的整数，更新 regen_rate 字段；
3. 若 `prompt_template_id` 非空：校验 PromptsProvider.soPrompt 中是否存在该 prompt_template_id，存在则更新，否则返回 false；
4. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `skill_core_config` 表；
5. 若表中尚无记录则 INSERT 新行；

**返回**：更新后的当前配置（regen_rate、prompt_template_id）

## 3. 表设计

### 3.1. SkillCore 配置表

- 表名：skill_core_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| regen_rate | 重新生成 Skill 的概率 | INTEGER | N | | 默认 75 |
| prompt_template_id | 模板 Prompt ID | UUID | N | | 指定则用模板渲染；为空则用默认 Prompt |

### 3.2. Agent Skill 关联表

- 表名：agent_skill
- 库名：skill

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | Agent ID | UUID | N | 普通索引 | |
| skill_id | 绑定的 Skill ID | UUID | N | | |

重要：agent_id + skill_id 构成联合唯一索引

### 3.3. Skill 老化规则表

- 表名：skill_opt_rule
- 库名：skill

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| days | 统计天数 | INT | N | 普通索引 | |
| min_usage_count | 最小使用次数 | INT | N | | 低于该值则老化 |

### 3.4. Skill 使用记录表

- 表名：skill_usage
- 库名：skill

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| skill_id | Skill ID | UUID | N | 普通索引 | |
| agent_skill_id | Agent-Skill 绑定 ID | UUID | N | 普通索引 | 关联 agent_skill.id |
| usage_date | 使用日期 | STRING | N | | YYYY-MM-DD |
| usage_count | 使用次数 | INT | N | | |

## 4. 重要内容

1. SkillCore 匹配时，将 Skill 的 `skill_brief`（简述）和 `skill_md`（SKILL.md 全文）一起发给 LLM 进行相关性排名；
2. skill_md 是 LLM 判断 Skill 能否完成指定工作的核心线索；
3. 匹配结果缓存到 agent_skill 表，regen_rate 控制缓存刷新概率（默认 75%）；
4. 所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 5. 变更记录

### [2026-08-15] configSkillCore 校验补全 + opt_rule 读取修复 + 老化定时触发 + NOT NULL 约束修复

**变更原因**：
1. `configSkillCore` 原先直接写入 `regen_rate` / `prompt_template_id`，缺少 PRD 2.6 节要求的校验；
2. `skill_core.opt_rule.*` 的配置读取返回整个 `SoSkillRuleOutput`（list/total），前端无法取到 `days`/`min_usage_count` 值；
3. `ageSkill` 老化逻辑实现了但没有触发入口，配置了 `opt_rule` 也不会生效；
4. `skill_core_config.prompt_template_id` 为 `NOT NULL` 且无默认值，只写 `regen_rate` 时 INSERT 缺列触发 `NOT NULL constraint failed`。

**修改的方法**：
- `configSkillCore`：`regen_rate` 校验 0-100；`prompt_template_id` 非空时经 Base 层 `PromptsAccess.getPrompt` 校验存在性；INSERT 时补写 `prompt_template_id=''`。
- `SkillCoreSchemaInitializer`：`prompt_template_id` 改为 `TEXT NOT NULL DEFAULT ''`。
- `ConfigService.getCurrentValue`：`skill_core.opt_rule.*` 从 `list[0]` 提取 `days`/`min_usage_count`；`skill_core.regen_rate`/`prompt_template_id` 返回具体字段值（不再返回整个 Output 对象）。
- `dev-server`：新增每日午夜 `scheduleDailyAging()`，调用 `ageSkill` + `ageSoul` 老化不活跃实体。
- 前端「匹配与优化」参数卡片改为单网格连续排布（不再按分类拆成多个网格）。

**影响的端点**：
- `GET/PUT /api/config`（skill_core 相关项）— 正确返回原始值并校验写入。
- 每日定时任务 — 触发 Skill/Soul 老化。

**可能存在的问题**：
- `ageSkill` 依赖 `skill_opt_rule` 表存在规则才生效（默认无规则，需用户在配置页配置 days/min_usage_count）。

## 落地差异（2026-09-05 · 绑定收权）

Agent↔本模块组件的绑定关系收敛至 **Agent 模块 agent 表**（唯一事实源）：Core 的 agent_* 绑定表停止创建与读写；`match*` 为纯选择（Input 增 `bound_*` 传入既有绑定做确定性水合，不传则按任务选择，零持久化）；`opt*` 仅记 usage（键 (agent_id, component_id)，usage 表检测旧键自动重建）；`age*` 输出解绑候选（不删除）；绑定/解绑由 Agent 模块 `AgentLibrary.bindAgentComponent/unbindAgentComponent` 经评估链路（EvolutorAgent 评估 → AgentBuilder.optimizeAgent）执行。
