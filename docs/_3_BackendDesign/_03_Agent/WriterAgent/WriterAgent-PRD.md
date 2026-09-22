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
    - result / answer：该 Agent 的执行输出（系统兼容 result 与 answer 字段）
  - user_preferences：用户偏好配置（可选，格式见 3.1）
- context：WriteContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：WriteOutput（继承 Output），承载返回内容：
  - agent_id：本次写作实际使用的系统 Writer Agent ID（供编排层记录执行轨迹）
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
   a. 调用 AgentContext.buildAgentContext({ session_id, agent_id, work_id }) 获取当前 session 的上下文（对话历史）；
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
  - language：偏好语言（可选，可选值：zh-CN / en-US，默认 zh-CN）
  - style：回复风格（可选，可选值：clear / concise / detailed / creative，默认 clear）
  - depth：回复深度（可选，可选值：shallow / medium / deep，默认 medium）
  - format：回复格式（可选，可选值：TEXT / MARKDOWN / JSON，默认 MARKDOWN）
  - additional_preferences：额外偏好说明（可选）
- context：SaveUserProfileContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SaveUserProfileOutput（继承 Output）

**处理流程**：

1. 对非空入参进行枚举校验：language 必须为 zh-CN / en-US；style 必须为 clear / concise / detailed / creative；depth 必须为 shallow / medium / deep；format 必须为 TEXT / MARKDOWN / JSON，非法值抛出 ValidationError；
2. 调用 RelationDBProvider 对 `writer_agent_user_profile` 表执行 upsert（按 session_id 唯一约束）；
3. 返回 true；

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
  - llm_id：指定写作使用的 LLM 模型 ID（可选，留空则由 LLMProvider 自动回退为系统默认模型或首个启用模型）
  - write_prompt_template_id：写作 prompt 模板 ID（可选）
  - default_language：默认语言（可选，可选值：zh-CN / en-US）
  - default_style：默认风格（可选，可选值：clear / concise / detailed / creative）
  - default_depth：默认深度（可选，可选值：shallow / medium / deep）
  - default_format：默认格式（可选，可选值：TEXT / MARKDOWN / JSON）
- context：ConfigWriterAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigWriterAgentOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `writer_agent_config` 表获取当前配置；
2. 对每个非空入参进行校验和更新：
   a. llm_id：若非空则写入；若为空字符串则清空；
   b. prompt_template_id：校验 PromptsProvider.soPrompt 中存在；
   c. 枚举字段校验：default_language 必须为 zh-CN / en-US；default_style 必须为 clear / concise / detailed / creative；default_depth 必须为 shallow / medium / deep；default_format 必须为 TEXT / MARKDOWN / JSON，非法值抛出 ValidationError；
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
| llm_id | 写作模型 ID | UUID | Y | | 留空时自动回退系统默认模型或可用首模型 |
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

## 代码变更记录

### [2026-08-20] 修复 WriterAgent 结果字段映射与 DAG 执行超时默认阈值
**变更原因**：
解决问答任务（如 `96eb7296-7201-4781-803e-395a5b26365f`）执行结果出现"上游 Agent 未返回有效数据（结果均为 undefined）"的问题；以及避免复杂多 Task 的 Agent DAG 在 5 分钟默认超时触发截断。

**修改的方法**：
  - `WriterAgentService.write(input, ctx, output)` — 兼容量化读取 `r.answer ?? r.result`
  - `WriteInput.agent_results` — 类型定义扩展为支持 `answer` 和 `result`
  - `OrchestrationExecutionConfig.dag_timeout_ms` — 默认值从 300,000ms（5分钟）调整为 600,000ms（10分钟）

**影响的端点**：
  - HTTP 接口 `POST /api/chat` 及后端 DAG 编排完整运行链路

**可能存在的问题**：
  - 无已知问题；改动均向下兼容旧格式数据。

### [2026-08-22] WriteOutput 回填 agent_id 以支持编排层采集 Writer 执行轨迹
**变更原因**：WriterAgent 的执行结果未写入 `orchestration_agent_execution` 表，导致「思考过程 / 执行过程」弹窗看不到 Writer Agent 的执行结果。为使 Writer 与其他 Agent 的采集方式一致，需在 `write` 完成后将本次实际使用的系统 Writer Agent ID 回填给编排层。

**修改的方法**：
  - `WriteOutput` — 新增 `agent_id` 字段。
  - `WriterAgentService.write(input, ctx, output)` — 调用 `buildSystemAgent` 后回填 `output.agent_id = buildOut.agent_id`。

**影响的端点**：
  - 后端编排链路 `JSONNodeService.handleWriteResult`（WRITE_RESULT 节点）— 读取 `writeOutput.agent_id` 写入执行记录。

**可能存在的问题**：
  - 无已知问题；`agent_id` 为新增默认字段，向下兼容。


### [2026-09-22] execWrite 方法拆分：282 行编排骨架化（逻辑零变更）
**变更原因**：`execWrite` 282 行，远超 DDDStandards §2 的 10-30 行约束；构建 Agent、偏好解析、上下文构建、LLM 调用、结果回写混在单方法内。

**修改的方法**：
- `WriterAgentService.execWrite` — 保留为 29 行编排骨架，步骤下沉为私有方法：`prepareWriterAgent`（构建 WRITER + 加载档案）、`resolveWritePreferences`（入参→画像→默认配置）、`buildSessionContext`（多源上下文，失败降级）、`emitErrorFallback`（全错误透传快路径）、`buildWriterTraceParams`（轨迹参数，双路径复用）、`loadSoulContent`（Soul 读取，失败降级）、`renderWritePrompt`、`buildWriteEventsInput`（SSE pushText 回调组装）、`execWriterLlm`（execLLMEvents 优先/execLLM 降级）、`applyWriteResult`（Markdown 直出/纯文本降级）、`recordWriterUsage`。
- 新增 `WriterAgent/domain/services/WriterDomainService.ts`（纯函数，零 I/O）：`buildWriterResultsContext` / `isErrorAgentResult` / `formatAgentResult` / `cleanFallbackResults` —— 子 Agent 结果加工（动态执行上下文包装 + 降级兜底文本清理）下沉领域层。

**影响的端点**：
- `WriterAgentAccess.execWrite` 对外签名与行为不变；SSE 事件（text_delta → pushText）推送顺序与 report 透传位置保持原样。

**可能存在的问题**：
- 无行为变更；`TC-WR-020` 既有用例全绿兜底。
