# Writer Agent

## 1. 设计目标

1. 汇总所有 Work Agent 的执行结果，进行信息整合和重组；
2. 进行人性化展示，将原始 Agent 输出转化为用户友好的结构化回复；
3. 依赖用户画像（user profile），根据用户偏好调整回复风格、精度和表达方式；
4. 作为 Agent DAG 的最后一个节点，接收上游 Agent 的输出汇总。

## 2. 功能设计

### 2.1. 写作（write）

**功能**：接收上游 Agent 的执行结果和原始用户问题，生成最终的人性化回复
**入参**：
- input：WriteInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - interact_id：交互 ID
  - user_query：原始用户问题
  - agent_results：上游 Agent 执行结果列表，每项含：
    - agent_id
    - task_content：该 Agent 处理的任务描述
    - result：该 Agent 的执行输出
  - user_preferences：用户偏好配置（可选，格式见 3.1）
- context：WriteContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：WriteOutput（继承 Output），承载返回内容：
  - response：最终用户可见回复
  - response_format：回复格式（TEXT / MARKDOWN / JSON）
  - token_usage：Token 用量
  - elapsed_ms：耗时

**处理流程**：

1. **获取 WriterAgent 实例**
   a. 调用 AgentBuilder.buildWriterAgent 获取 agent_id；
   b. 调用 AgentLibrary.getAgent(agent_id) 获取 WriterAgent 的完整配置（llm_id、soul_id 等）；

2. **加载用户画像**
   a. 若 `user_preferences` 非空，使用入参中的偏好配置；
   b. 若 `user_preferences` 为空：调用 RelationDBProvider.selectOneDB 根据 session_id 查询 `writer_agent_user_profile` 表获取该用户的偏好配置；
   c. 若用户画像不存在：使用默认偏好（language=zh-CN、style=clear、depth=medium、format=MARKDOWN）；
   d. 将用户画像作为 prompt 的一部分传递给 LLM，控制回复的风格深度；

3. **构建写作上下文**
   a. 调用 InfoCore.context 获取当前 session 的上下文（对话历史）；
   b. 收集 agent_results 中每个 Agent 的 task_content 和 result，按 Agent 处理顺序排列；
   c. 若 agent_results 为空（简单任务未拆分）：直接使用上游单个 Agent 的输出；

4. **调用 LLM 生成回复**
   a. 调用 RelationDBProvider.selectOneDB 查询 `writer_agent_config` 表获取 `write_prompt_template_id`；
   b. 调用 PromptsProvider.execPrompt 使用 `write_prompt_template_id` 结合 `{ user_query, agent_results, user_preferences, context }` 构建 prompt；
   c. 将 Soul 内容作为 system message 拼接（WriterAgent 的 Soul 通常为"专业、友好的写作助手"）；
   d. 调用 LLMProvider.execLLM 生成回复；
   e. 从 LLM 输出中解析 response 和 response_format；

5. **保存结果**
   a. 调用 InfoCore.saveInfo 将最终回复保存为 RESPONSE 角色；
   b. 调用 AgentLibrary.recordAgentUsage 记录 WriterAgent 使用；

6. 将 response、response_format、token_usage、elapsed_ms 写入 output 返回；

### 2.2. 管理用户画像（saveUserProfile / getUserProfile）

**功能**：管理用户偏好配置，用于个性化回复风格

#### 2.2.1. 保存用户画像（saveUserProfile）

**入参**：
- input：SaveUserProfileInput（继承 Input），包含以下字段：
  - session_id：会话 ID
  - language：偏好语言（可选，默认 zh-CN）
  - style：回复风格（可选，可选值：clear / concise / detailed / creative，默认 clear）
  - depth：回复深度（可选，可选值：shallow / medium / deep，默认 medium）
  - format：回复格式（可选，可选值：TEXT / MARKDOWN / JSON，默认 MARKDOWN）
  - additional_preferences：额外偏好说明（可选）
- context：SaveUserProfileContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SaveUserProfileOutput（继承 Output）

**处理流程**：

1. 调用 RelationDBProvider 对 `writer_agent_user_profile` 表执行 upsert（按 session_id 唯一约束）；
2. 返回 true；

#### 2.2.2. 获取用户画像（getUserProfile）

**入参**：
- input：GetUserProfileInput（继承 Input），包含以下字段：
  - session_id：会话 ID
- context：GetUserProfileContext（继承 Context）
- output：GetUserProfileOutput（继承 Output），承载返回内容：
  - user_profile：用户画像 { language, style, depth, format, additional_preferences }

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `writer_agent_user_profile` 表；
2. 若不存在，返回默认画像；否则返回实际配置；

### 2.3. 配置（configWriterAgent）

**功能**：配置 WriterAgent 的参数
**入参**：
- input：ConfigWriterAgentInput（继承 Input），包含以下字段：
  - write_prompt_template_id：写作 prompt 模板 ID（可选）
  - default_language：默认语言（可选）
  - default_style：默认风格（可选）
  - default_depth：默认深度（可选）
  - default_format：默认格式（可选）
- context：ConfigWriterAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigWriterAgentOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `writer_agent_config` 表获取当前配置；
2. 对每个非空入参进行校验和更新：
   a. prompt_template_id：校验 PromptsProvider.soPrompt 中存在；
   b. 其他配置字段：校验枚举值合法；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. WriterAgent 配置表

- 表名：writer_agent_config
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| write_prompt_template_id | 写作 prompt 模板 ID | UUID | N | | |
| default_language | 默认语言 | VARCHAR | N | | 默认 zh-CN |
| default_style | 默认风格 | VARCHAR | N | | clear / concise / detailed / creative |
| default_depth | 默认深度 | VARCHAR | N | | shallow / medium / deep |
| default_format | 默认格式 | VARCHAR | N | | TEXT / MARKDOWN / JSON |

### 3.2. 用户画像表

- 表名：writer_agent_user_profile
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话 ID | UUID | N | 唯一索引 | |
| language | 偏好语言 | VARCHAR | N | | 默认 zh-CN |
| style | 回复风格 | VARCHAR | N | | clear / concise / detailed / creative |
| depth | 回复深度 | VARCHAR | N | | shallow / medium / deep |
| format | 回复格式 | VARCHAR | N | | TEXT / MARKDOWN / JSON |
| additional_preferences | 额外偏好 | TEXT | Y | | |
