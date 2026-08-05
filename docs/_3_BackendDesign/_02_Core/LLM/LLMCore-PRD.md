# LLM Core

## 1. 设计目标

1. 根据工作为Agent匹配最佳的LLM；
2. 管理LLM提供商的调用限额，避免超额调用；

## 2. 功能设计

### 2.1. 匹配LLM（matchLLM）

**功能**：为要处理的工作匹配所需要的LLM
**入参**：
- input：MatchLLMInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - interact_id：交互 ID
- context：MatchLLMContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：MatchLLMOutput（继承 Output），承载返回内容：
  - llm_id：匹配的 LLM ID
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 `agent_id` 查询 `agent_llm` 表，获取该 Agent 已绑定的 llm_id；
2. 若存在绑定的 llm_id：生成随机数（0-100），若随机数 >= regen_rate（从 `llm_core_config` 表读取，默认 75），则直接返回该 llm_id（复用已有绑定）；
3. 若随机数 < regen_rate 或不存在绑定，执行重新匹配流程：
   a. 调用 LLMProvider.soLLM 加载所有已启用的 LLM；
   b. 若可用 LLM 数量为 0，返回 false 并记录错误日志；
   c. **若可用 LLM 数量为 1，直接返回该 LLM，跳过 LLM 排名调用**；
   d. 调用 RelationDBProvider.selectOneDB 查询 `llm_core_config` 表获取 `prompt_template_id`；
   e. 将工作内容和模型列表与 `prompt_template_id` 调用 PromptsProvider.execPrompt 构建 LLM 匹配 prompt；
   f. 调用 LLMProvider.execLLM 由模型推荐合适的 llm_id（LLM 输出需包含选中的 llm_id，解析提取）；
4. 返回匹配到的 llm_id；

### 2.2. 限额管理（limitLLM）

**功能**：管理LLM提供商的调用限额配置（Token数量、调用次数，按天/周/月）
**入参**：
- input：LimitLLMInput（继承 Input），包含以下字段：
  - llm_provider_id：LLM 提供商 ID
  - quota_tokens_per_day：每日 Token 限额（可选）
  - quota_tokens_per_week：每周 Token 限额（可选）
  - quota_tokens_per_month：每月 Token 限额（可选）
  - quota_calls_per_day：每日调用次数限额（可选）
  - quota_calls_per_week：每周调用次数限额（可选）
  - quota_calls_per_month：每月调用次数限额（可选）
- context：LimitLLMContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：LimitLLMOutput（继承 Output），承载返回内容
**处理流程**：

1. 校验入参：`llm_provider_id` 不能为空；调用 LLMProvider.soLLM 确认该提供商已注册，不存在则返回 false 并记录错误日志；
2. 遍历入参中所有非空的限额字段，构建 DataObject（仅包含非空字段）；
3. 调用 RelationDBProvider.insertDB 将 DataObject 写入 `llm_provider_quota` 表（upsert 语义：按 `llm_provider_id` 唯一约束，存在则更新，不存在则新增）；
4. 限额数据即时生效，后续 `checkLLMQuota` 调用将从该表读取最新限额；

### 2.3. 限额校验（checkLLMQuota）

**功能**：在调用LLM前校验是否超出限额
**入参**：
- input：CheckLLMQuotaInput（继承 Input），包含以下字段：
  - llm_provider_id：LLM 提供商 ID
- context：CheckLLMQuotaContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：CheckLLMQuotaOutput（继承 Output），承载返回内容：
  - within_quota：是否在限额内
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 `llm_provider_id` 查询 `llm_provider_quota` 表获取限额配置；若无配置记录，视为无限额（返回 within_quota=true）；
2. 计算当前时间在各周期中的边界范围：
   a. 当天：`day_start = today 00:00:00`，`day_end = today 23:59:59`；
   b. 本周：`week_start = 本周一 00:00:00`，`week_end = 本周日 23:59:59`；
   c. 本月：`month_start = 本月1日 00:00:00`，`month_end = 本月最后一日 23:59:59`；
3. 分别调用 RelationDBProvider.selectDB 查询 `llm_usage` 表，按 `llm_provider_id` 和各时间范围统计：
   a. 当天 Token 总用量和调用次数；
   b. 本周 Token 总用量和调用次数；
   c. 本月 Token 总用量和调用次数；
4. 将统计值与限额配置逐项比较：任一项超出限额（quota > 0 且 usage >= quota），返回 within_quota=false；
5. 全部在限额内则返回 within_quota=true；

### 2.4. 配置（configLLMCore）

SET 行为：接受 `regen_rate` 和 `prompt_template_id` 作为可选更新字段，仅更新传入的非空字段。返回更新后的当前配置。
**入参**：
- input：ConfigLLMCoreInput（继承 Input），包含以下字段：
  - regen_rate：重新匹配LLM的概率（可选）
  - prompt_template_id：模板prompt ID（可选）
- context：ConfigLLMCoreContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigLLMCoreOutput（继承 Output），承载返回内容：
  - regen_rate：当前生效的重新匹配概率
  - prompt_template_id：当前生效的模板prompt ID

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `llm_core_config` 表获取当前配置；
2. 若 `regen_rate` 非空：校验为 0-100 的整数，更新 regen_rate 字段；
3. 若 `prompt_template_id` 非空：校验 PromptsProvider.soPrompt 中是否存在该 prompt_template_id，存在则更新，否则返回 false；
4. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `llm_core_config` 表；
5. 默认配置初始化由 `ConfigHelper.ensureDefaultConfig` 统一管理（regen_rate=75、prompt_template_id 为空）；

**返回**：更新后的当前配置（regen_rate、prompt_template_id）

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. LLMCore配置表

- 表名：llm_core_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| regen_rate | 重新匹配LLM的概率 | INTEGER | N | | 默认75 |
| prompt_template_id | 模板promptID | UUID | N | | |

### 3.2. AgentLLM关联表

- 表名：agent_llm
- 库名：llm

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_id | AgentId | UUID | N | 唯一索引 | |
| llm_id | 绑定的LLMId列表 | UUID | N | | |

### 3.3. LLM提供商限额配置表

- 表名：llm_provider_quota
- 库名：llm

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_provider_id | LLM提供商ID | UUID | N | 普通索引 | 关联llm_provider.id |
| quota_tokens_per_day | 每日Token限额 | INT | N | | |
| quota_tokens_per_week | 每周Token限额 | INT | N | | |
| quota_tokens_per_month | 每月Token限额 | INT | N | | |
| quota_calls_per_day | 每日调用次数限额 | INT | N | | |
| quota_calls_per_week | 每周调用次数限额 | INT | N | | |
| quota_calls_per_month | 每月调用次数限额 | INT | N | | |

注意：llm_provider_id 构成业务唯一约束
