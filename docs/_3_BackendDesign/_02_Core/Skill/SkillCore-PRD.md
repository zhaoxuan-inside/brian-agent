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
  - run_id：交互记录 ID
  - task_content：当前任务内容（无绑定时四层瀑布匹配的任务语义来源，2026-09-22 起必传）
  - bound_skill_ids：调用方传入的既有绑定（传入时确定性水合，不再按任务重选）
  - bypass_cache：跳过匹配缓存
- context：SkillCoreContext
- output：MatchSkillOutput，承载返回内容：
  - skills：匹配到的 Skill 列表（MatchedSkillEntry[]，含 skill_id、skill_brief、relevance）

**处理流程（四层瀑布，2026-09-22）**：

1. **第 1 层 绑定水合**：`bound_skill_ids` 非空 → 直接从 Skill 表水合返回（绑定唯一事实源 = Agent 表 skill_ids_json）；
2. **缓存命中水合**：MD5（任务前缀）+ 任务向量两级缓存（`mcp/skill_core_config` 的 TTL/容量/向量阈值可配）；
   - 正缓存命中 → 水合 Skill 返回（重复任务零 LLM）；
   - **负缓存命中**（该任务曾被判定不需要 Skill）→ 直接返回空；
3. **第 2 层 LLM 需求判定与排序合并**：渲染匹配模板（"Skill 匹配排序"，输出契约 `{"need": bool, "keywords": [...], "candidates": [{"id","score"}]}`）；
   - LLM 判定任务不需要 Skill（need=false，如闲聊）→ 写负缓存，返回空；
   - 本地候选过 score_threshold → 正缓存，返回；
   - 模板/LLM 失败 → 保守返回空（不写缓存、不触发外部获取，可重试）；
4. **第 3 层 GitHub 外部检索**（need=true 且本地无合格者；`github_search_enabled` 可关）：
   - 由 LLM 输出的英文 keywords 检索 GitHub：Code Search（`filename:SKILL.md`，需 token，匿名 401 自动降级）→ Repository Search 降级（top 仓库根目录探测 SKILL.md）；
   - 命中 → raw 拉取 → 解析 frontmatter（name/description）→ `addSkill` 导入本地（enable=true，流程闭环，同名校验幂等）→ 返回；
5. **第 4 层 完整自建**（GitHub 也无果；`auto_generate_enabled` 可关）：
   - LLM 基于任务生成完整 Skill：name / skill_brief / skill_md / scripts（≤3 个，≤20000 字符）/ references（≤3 个，≤20000 字符）；
   - `addSkill` 落库（enable=true，下次任务本地可命中）→ 返回；
6. 全部无果 → 返回空。

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

**功能**：获取或更新 skill_core_config 配置（SET 语义）。接受可选更新字段，仅更新传入的字段。返回更新后的当前配置。

**入参**：
- input：ConfigSkillCoreInput（继承 Input），包含以下字段：
  - regen_rate：重新选择 Skill 的概率（可选）
  - prompt_template_id：模板 Prompt ID（可选）
  - score_threshold：排序候选采纳阈值 0-100（可选）
  - vector_similarity_threshold：任务向量命中阈值 0.0-1.0（可选）
  - match_cache_ttl_ms / match_cache_capacity：匹配缓存参数（可选）
  - github_token：GitHub API Token（可选，2026-09-22 新增；匿名搜索配额 10 次/分钟，配置后提升配额并启用 Code Search）
  - github_search_enabled：GitHub 外部检索层开关（可选，默认 true）
  - auto_generate_enabled：完整自建层开关（可选，默认 true）
- context：SkillCoreContext
- output：ConfigSkillCoreOutput：
  - regen_rate / prompt_template_id：当前生效配置
  - github_token / github_search_enabled / auto_generate_enabled：当前生效配置（2026-09-22 新增）

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

### [2026-09-11] match 结果内存缓存 + 排序 max_tokens 上限（复盘 interact 9b68defe / 4f69b46b）

**变更原因**：同一 (agent, 任务) 的组件排序每轮都全量重跑 LLM，实测延迟变异 2.6s→9.3s→32.9s（provider 对 max_tokens 的约束不覆盖深度思考输出的变异性），单轮 run 启动期最长 61s；排列 prompt 还携带全量 skill_md 原文。

**修改的方法**：
  - `match*`（matchSoul / matchSkill / matchMCP）新增进程内存缓存：键 `agent_id|任务前缀(128字)`，TTL 10 分钟、容量 500（FIFO 淘汰）；`config*Core` 配置变更即清缓存。命中直接水合（`from_cache`/返回结构与原语义一致）。
  - matchSkill 排序 prompt 已摘要化（只带 name/skill_brief，命中后 enrichMatchedSkills 取全量）；matchMCP 排序新增 `max_tokens: 300`；MatchSkillInput / MatchMcpInput 新增 `task_content?: string`（AgentDefService 快照透传，供缓存键）。

**影响的端点**：
  - `POST /api/chat/stream` — 同 (agent, 同任务) 复现：预匹配 LLM 从 2 次串行（最坏 56s）降为 0 次；同句问答端到端 52s→5.2s。
