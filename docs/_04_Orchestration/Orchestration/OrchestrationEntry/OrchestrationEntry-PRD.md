# Orchestration Entry

## 1. 设计目标

1. 提供统一的外部请求接收入口，接收来自 Application 层的工作请求；
2. 生成 work_id、interact_id 等标识，管理 work 的完整生命周期；
3. 构建工作处理的上下文数据（会话历史、关联信息、用户偏好等）；
4. 根据任务特征和编排配置选择合适的编排策略；
5. 管理工作执行状态，提供状态查询和错误恢复能力；
6. 支持同步和异步两种工作提交流。

## 2. 功能设计

### 2.1. 接收工作（receiveWork）

**功能**：接收外部请求，创建 work 记录并启动编排流程
**入参**：
- input：ReceiveWorkInput（继承 Input），包含以下字段：
  - session_id：会话 ID
  - user_query：用户输入内容
  - force_orchestration_strategy：强制指定编排策略（可选："SIMPLE" | "PLANNING"，不传则自动选择）
  - user_profile：用户偏好配置（可选，不传则从 WriterAgent.getUserProfile 获取）
- context：ReceiveWorkContext（继承 Context），会话上下文（session_id 等）
- output：ReceiveWorkOutput（继承 Output），承载返回内容：
  - work_id：工作 ID
  - interact_id：交互 ID
  - orchestration_strategy：使用的编排策略（SIMPLE / PLANNING）
  - final_response：最终回复内容（同步模式下返回）

**处理流程**：

1. **生成标识**
   a. 生成 `work_id`（UUID）和 `interact_id`（UUID）；
   b. 调用 RelationDBProvider.insertDB 向 `orchestration_work` 表插入工作记录：`{ work_id, interact_id, session_id, user_query, status: "CREATED" }`；

2. **保存用户请求**
   a. 调用 InfoCore.saveInfo，传入 `{ session_id, work_id, interact_id, info_creator_id: "USER", info_creator_role: "REQUEST", info: user_query }`，记录用户的原始输入；

3. **选择编排策略**
   a. 若 `force_orchestration_strategy` 非空，直接使用入参指定的策略；
   b. 否则调用 `selectOrchestrationStrategy`（详见 2.2）根据任务特征自动选择策略；

4. **更新 Work 状态**
   a. 调用 RelationDBProvider.updateDB 将 `orchestration_work` 表中该 work_id 的 status 置为 "PROCESSING"，并记录选中的 orchestration_strategy；

5. **构建工作上下文**
   a. 调用 `buildWorkContext`（详见 2.4）构建完整的工作上下文数据，供后续编排策略使用；

6. **启动编排**
   a. 调用 OrchestrationStrategy.startOrchestration，传入 `work_id`、`interact_id`、`user_query`、编排策略、工作上下文；
   b. 编排策略执行完成后，将结果写入 `final_response`；
   c. 若编排策略执行失败，将 status 置为 "FAILED"，记录错误信息并返回 false；

7. **完成工作**
   a. 调用 InfoCore.saveInfo，传入 `{ session_id, work_id, interact_id, info_creator_id: work_id, info_creator_role: "RESPONSE", info: final_response }`；
   b. 调用 RelationDBProvider.updateDB 将 status 置为 "COMPLETED"；
   c. 将 work_id、interact_id、orchestration_strategy、final_response 写入 output 返回；

### 2.2. 选择编排策略（selectOrchestrationStrategy）

**功能**：根据任务特征自动选择 Simple 或 Planning 编排策略
**入参**：
- input：SelectOrchestrationStrategyInput（继承 Input），包含以下字段：
  - user_query：用户输入内容
  - work_context：工作上下文数据
- context：SelectOrchestrationStrategyContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SelectOrchestrationStrategyOutput（继承 Output），承载返回内容：
  - strategy：编排策略（SIMPLE / PLANNING）
  - complexity：任务复杂度评分（0-100）
  - reason：选择原因

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `orchestration_config` 表获取 `complexity_decompose_threshold`（默认 50）、`strategy_prompt_template_id`；
2. 若 `strategy_prompt_template_id` 非空且有效：
   a. 调用 PromptsProvider.execPrompt 使用 `strategy_prompt_template_id` 结合 `user_query` 和 `work_context` 构建策略选择 prompt；
   b. 调用 LLMProvider.execLLM 由模型评估任务复杂度和推荐策略（输出 JSON：`{ "complexity": 0-100, "strategy": "SIMPLE"|"PLANNING", "reason": "..." }`）；
   c. 解析 LLM 输出，获取 `complexity`、`strategy`、`reason`；
3. 若 `strategy_prompt_template_id` 为空或无效（降级为纯规则判定）：
   a. 通过简单规则推断复杂度（如 query 长度、是否包含多个问号/分步关键词）；
   b. 复杂度 < complexity_decompose_threshold → SIMPLE，否则 → PLANNING；
   c. reason 记录为 "rule_based"；
4. 将 `strategy`、`complexity`、`reason` 写入 output 返回；

### 2.3. 异步接收工作（receiveWorkAsync）

**功能**：通过 MQ 异步接收并处理工作，立即返回 work_id 和 job_id，后续通过回调获取结果
**入参**：
- input：ReceiveWorkAsyncInput（继承 Input），包含以下字段：
  - session_id：会话 ID
  - user_query：用户输入内容
  - callback_queue：结果回调队列名称（可选）
  - force_orchestration_strategy：强制编排策略（可选）
- context：ReceiveWorkAsyncContext（继承 Context），会话上下文（session_id 等）
- output：ReceiveWorkAsyncOutput（继承 Output），承载返回内容：
  - work_id：工作 ID
  - interact_id：交互 ID
  - job_id：异步任务 ID

**处理流程**：

1. 同 receiveWork 步骤 1-3（生成标识、保存请求、构建上下文）；
2. 生成 `job_id`（UUID）；
3. 调用 MQProvider.sendMQ 将工作消息 `{ job_id, work_id, interact_id, session_id, user_query, force_orchestration_strategy }` 发送到 `orchestration.work` 队列；
4. 确保 `orchestration.work` 队列上有 Worker 在运行（调用 MQCore.startWorker 启动消费者，若已存在则复用）；
5. Worker 处理逻辑：从队列消费消息 → 调用 receiveWork 同步处理 → 处理完成后将结果发送到 `callback_queue`（若指定）或写入 `orchestration_work` 表；
6. 将 work_id、interact_id、job_id 写入 output 返回；

### 2.4. 构建工作上下文（buildWorkContext）

**功能**：为整个 work 构建完整的上下文数据，供编排策略和 Agent 使用
**入参**：
- input：BuildWorkContextInput（继承 Input），包含以下字段：
  - session_id：会话 ID
  - work_id：工作 ID
  - user_query：用户输入内容
- context：BuildWorkContextContext（继承 Context），会话上下文（session_id, work_id 等）
- output：BuildWorkContextOutput（继承 Output），承载返回内容：
  - work_context：工作上下文（组织为结构化 JSON 对象）

**处理流程**：

1. **获取会话上下文**
   a. 调用 InfoCore.context 根据 session_id 构建会话级上下文（包含时间线消息、标签关联、语义相似、关键词匹配等）；
   b. 记为 `session_context`；

2. **获取用户画像**
   a. 调用 WriterAgent.getUserProfile 根据 session_id 获取用户偏好配置（language、style、depth、format 等）；
   b. 记为 `user_profile`；

3. **收集最近的相关工作**
   a. 调用 RelationDBProvider.selectDB 根据 session_id 查询 `orchestration_work` 表，获取最近 N 条（默认 5）已完成工作的 user_query 和 final_response 摘要；
   b. 记为 `recent_works`；

4. **组装工作上下文**
   a. 组装为以下结构：
   ```json
   {
     "work_id": "uuid",
     "session_id": "uuid",
     "user_query": "原始用户输入",
     "session_context": { "...session_context" },
     "user_profile": { "...user_profile" },
     "recent_works": [{ "user_query": "...", "response_summary": "..." }],
     "created_at": "timestamp",
     "metadata": { "orchestration_version": "1.0" }
   }
   ```
   b. 将 work_context 写入 output 返回；

### 2.5. 查询 Work 状态（getWorkStatus）

**功能**：查询一个 work 的当前状态和执行进展
**入参**：
- input：GetWorkStatusInput（继承 Input），包含以下字段：
  - work_id：工作 ID（可选）
  - session_id：会话 ID（可选）
  - status：状态筛选（可选）
  - page：分页参数（可选）
- context：GetWorkStatusContext（继承 Context），会话上下文（session_id 等）
- output：GetWorkStatusOutput（继承 Output），承载返回内容：
  - works：工作记录列表，每项含：
    - work_id：工作 ID
    - interact_id：交互 ID
    - session_id：会话 ID
    - user_query：用户输入摘要（前100字）
    - status：当前状态
    - orchestration_strategy：使用的编排策略
    - task_count：子任务数量（Planning 模式）
    - completed_task_count：已完成子任务数
    - elapsed_ms：总耗时
    - error_message：错误信息（若有）
    - created：创建时间
    - updated：最后更新时间

**处理流程**：

1. 构建查询条件：work_id / session_id / status 等作为 AND 条件；
2. 调用 RelationDBProvider.selectDB 查询 `orchestration_work` 表；
3. 将查询结果写入 output 返回；

### 2.6. 取消 Work（cancelWork）

**功能**：取消一个正在执行的 work，停止所有关联的 Agent 执行
**入参**：
- input：CancelWorkInput（继承 Input），包含以下字段：
  - work_id：工作 ID
  - reason：取消原因
- context：CancelWorkContext（继承 Context），会话上下文（session_id 等）
- output：CancelWorkOutput（继承 Output），承载返回内容：
  - cancelled：是否成功取消

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 work_id 查询 `orchestration_work` 表确认 work 存在；
2. 若 work 状态为 COMPLETED 或 FAILED，返回 cancelled=false，提示"工作已结束"；
3. 若 work 状态为 PROCESSING/PLANNING/EXECUTING：
   a. 调用 OrchestrationExecution.cancelExecution(work_id) 取消该 work 下所有正在执行的 Agent；
   b. 调用 RelationDBProvider.updateDB 将 status 置为 "FAILED"，记录 cancel_reason；
4. 返回 cancelled=true；

### 2.7. 配置（configOrchestrationEntry）

**功能**：配置 OrchestrationEntry 的参数
**入参**：
- input：ConfigOrchestrationEntryInput（继承 Input），包含以下字段：
  - complexity_decompose_threshold：任务拆解复杂度阈值（可选，默认 50，0-100）
  - strategy_prompt_template_id：编排策略选择 prompt 模板 ID（可选）
  - default_strategy：默认编排策略（可选，"SIMPLE" 或 "PLANNING"）
  - max_recent_works：构建上下文时收集的最近工作数量（可选，默认 5）
  - async_worker_interval：异步工作 Worker 轮询间隔（可选，默认 1000ms）
- context：ConfigOrchestrationEntryContext（继承 Context），会话上下文（session_id 等）
- output：ConfigOrchestrationEntryOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `orchestration_config` 表获取当前配置；
2. 校验并更新传入的非空字段：
   a. complexity_decompose_threshold：校验为 0-100 整数；
   b. strategy_prompt_template_id：校验 PromptsProvider.soPrompt 中存在；
   c. default_strategy：校验为 "SIMPLE" 或 "PLANNING"；
   d. max_recent_works：校验为正整数；
   e. async_worker_interval：校验为正整数（ms）；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. Work 执行记录表

- 表名：orchestration_work
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| work_id | 工作 ID | UUID | N | 唯一索引 | |
| interact_id | 交互 ID | UUID | N | | |
| session_id | 会话 ID | UUID | N | 普通索引 | |
| user_query | 用户输入内容 | TEXT | N | | |
| status | 工作状态 | VARCHAR | N | 普通索引 | CREATED / PROCESSING / PLANNING / EXECUTING / WRITING / EVALUATING / COMPLETED / FAILED |
| orchestration_strategy | 编排策略 | VARCHAR | N | | SIMPLE / PLANNING |
| task_count | 子任务数量 | INT | N | | 默认 0，Planning 模式下记录 |
| completed_task_count | 已完成子任务数 | INT | N | | 默认 0 |
| elapsed_ms | 总耗时（ms） | INT | N | | 默认 0，完成后更新 |
| cancel_reason | 取消原因 | TEXT | Y | | |
| error_message | 错误信息 | TEXT | Y | | |
| final_response | 最终回复 | TEXT | Y | | |
| metadata | 扩展元数据 | TEXT | Y | | JSON 格式 |

### 3.2. Orchestration 配置表

- 表名：orchestration_config
- 库名：orchestration

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| complexity_decompose_threshold | 任务拆解复杂度阈值 | INT | N | | 0-100，默认 50 |
| strategy_prompt_template_id | 策略选择 prompt 模板 ID | UUID | N | | |
| default_strategy | 默认编排策略 | VARCHAR | N | | SIMPLE / PLANNING |
| max_recent_works | 上下文构建最近工作数 | INT | N | | 默认 5 |
| async_worker_interval | 异步工作轮询间隔（ms） | INT | N | | 默认 1000 |
| default_strategy_id | 默认编排策略 ID | UUID | Y | | 关联 orchestration_strategy.strategy_id |
| max_plan_retries | Planning 策略最大重试次数 | INT | N | | 默认 2 |
| plan_prompt_template_id | 计划生成 prompt 模板 ID | UUID | N | | |
| max_concurrent | 默认最大并发执行数 | INT | N | | 默认 1 |
| default_max_iterations | 单 Agent 默认最大迭代次数 | INT | N | | 默认 10 |
| dag_timeout_ms | DAG 执行总超时时间（ms） | INT | N | | 默认 300000，0 表示不限制 |
| max_execution_depth | JSONNode 最大执行深度 | INT | N | | 默认 50 |
| node_timeout_ms | JSONNode 单节点执行超时（ms） | INT | N | | 默认 300000 |
| trace_enabled | JSONNode 是否开启执行追踪 | BOOL | N | | 默认 true |

注意：`orchestration_config` 为整个 Orchestration 层共享配置表，各子模块的 config* 方法仅更新自身相关字段。

## 实现约定（与代码同步）

1. **ID生成**：统一 `IdGenerator.generate()` 生成所有 UUID。
2. **时间**：统一 `IdGenerator.now()`（毫秒）获取时间戳。
3. **DB操作**：业务 CRUD 经 RelationDBProvider，禁止绕过 Provider 操作。
4. **日志**：所有日志通过 LogProvider 记录，禁止 console.log。
5. **外部资源**：所有 LLM/Prompt 调用经 LLMProvider/PromptsProvider，禁止直接访问。
6. **AOP**：所有方法经 AopProxy.wrap 生成代理，默认记录耗时日志。
