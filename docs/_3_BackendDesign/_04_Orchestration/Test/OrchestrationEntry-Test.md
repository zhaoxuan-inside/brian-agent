# OrchestrationEntry 测试用例

## 测试约定

- 所有方法通过 AOP 代理（AopProxy.wrap）生成代理对象，默认记录日志和耗时
- 方法签名：`Boolean methodName(Input input, Context context, Output output)`
- ID 生成统一使用 `IdGenerator.generate()`
- 日志记录通过 `LogProvider`
- 外部资源调用通过对应的 Provider/Access 层
- 所有 DB 操作通过 `RelationDBProvider`

---

## 1. receiveWork — 接收工作

### 1.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-RW-001 | Simple 策略同步接收工作 | `session_id` 有效，`orchestration_config` 表存在 `complexity_decompose_threshold=50` | `user_query="你好"`, `force_orchestration_strategy=null` | `output.work_id` 非空 UUID，`output.interact_id` 非空 UUID，`output.orchestration_strategy="SIMPLE"`，`output.final_response` 非空，`orchestration_work` 表 status="COMPLETED"，返回 true |
| TC-RW-002 | Planning 策略同步接收工作（复杂任务） | `session_id` 有效，`user_query` 包含多个子任务描述 | `user_query="请帮我分析数据、生成报告并发送邮件"`, `force_orchestration_strategy=null` | `output.orchestration_strategy="PLANNING"`，`orchestration_work` 表 `task_count > 1`，`output.final_response` 非空，返回 true |
| TC-RW-003 | 强制指定 Simple 策略 | `session_id` 有效 | `user_query="请帮我分析数据、生成报告并发送邮件"`, `force_orchestration_strategy="SIMPLE"` | `output.orchestration_strategy="SIMPLE"`，忽略自动策略选择，返回 true |
| TC-RW-004 | 强制指定 Planning 策略 | `session_id` 有效 | `user_query="你好"`, `force_orchestration_strategy="PLANNING"` | `output.orchestration_strategy="PLANNING"`，忽略自动策略选择，返回 true |
| TC-RW-005 | 传入 user_profile | `session_id` 有效，`user_profile` 含 `language="en"` | `user_query="Hello"`, `user_profile={ "language": "en", "style": "concise" }` | 工作上下文包含传入的 `user_profile`，不调用 `WriterAgent.getUserProfile`，返回 true |

### 1.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-RW-006 | session_id 为空 | 无 | `session_id=""`, `user_query="你好"` | 返回 false，`output` 包含错误信息 |
| TC-RW-007 | user_query 为空 | `session_id` 有效 | `user_query=""` | 返回 false，`orchestration_work` 表 status 可能为 "FAILED" |
| TC-RW-008 | user_query 为超长文本 | `session_id` 有效 | `user_query` 为 100KB 文本 | 正常处理，`orchestration_work` 表 `user_query` 字段完整存储，返回 true |
| TC-RW-009 | force_orchestration_strategy 为无效值 | `session_id` 有效 | `force_orchestration_strategy="INVALID"` | 返回 false 或降级为自动选择策略 |
| TC-RW-010 | InfoCore.saveInfo 调用失败 | `session_id` 有效，`InfoCore.saveInfo` 模拟抛出异常 | `user_query="你好"` | 返回 false，`orchestration_work` 表 status="FAILED"，`error_message` 记录错误信息 |
| TC-RW-011 | OrchestrationStrategy.startOrchestration 执行失败 | `session_id` 有效，策略执行模拟失败 | `user_query="你好"` | 返回 false，`orchestration_work` 表 status="FAILED"，`error_message` 记录错误 |
| TC-RW-012 | RelationDBProvider.insertDB 写入 work 记录失败 | `session_id` 有效，DB 写入模拟异常 | `user_query="你好"` | 返回 false，异常被 AOP 层捕获并记录 |
| TC-RW-013 | force_orchestration_strategy 为 "SIMPLE" 但大小写不同 | `session_id` 有效 | `force_orchestration_strategy="simple"` | 应正常处理（大小写不敏感或返回错误，按实现约定） |

### 1.3 状态流转

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-RW-014 | Work 状态完整流转 | `session_id` 有效 | `user_query="你好"` | `orchestration_work` 表 status 依次经历 CREATED → PROCESSING → EXECUTING → WRITING → EVALUATING → COMPLETED |
| TC-RW-015 | Work 创建后 InfoCore 记录 REQUEST 消息 | `session_id` 有效 | `user_query="你好"` | `InfoCore.saveInfo` 被调用，`info_creator_role="REQUEST"`，`info_creator_id="USER"` |
| TC-RW-016 | Work 完成后 InfoCore 记录 RESPONSE 消息 | `session_id` 有效 | `user_query="你好"` | `InfoCore.saveInfo` 被调用，`info_creator_role="RESPONSE"`，`info_creator_id=work_id` |

---

## 2. selectOrchestrationStrategy — 选择编排策略

### 2.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-SS-001 | 简单问题选择 Simple 策略 | `orchestration_config` 表 `complexity_decompose_threshold=50`，`strategy_prompt_template_id` 有效 | `user_query="今天天气怎么样"` | `output.strategy="SIMPLE"`，`output.complexity < 50`，返回 true |
| TC-SS-002 | 复杂问题选择 Planning 策略 | `orchestration_config` 表 `complexity_decompose_threshold=50`，`strategy_prompt_template_id` 有效 | `user_query="帮我分析今年销售数据，对比去年，生成报告并发送给团队"` | `output.strategy="PLANNING"`，`output.complexity >= 50`，返回 true |
| TC-SS-003 | 使用 LLM 评估策略 | `strategy_prompt_template_id` 有效，`PromptsProvider.execPrompt` 返回有效 prompt，`LLMProvider.execLLM` 返回 `{ complexity: 30, strategy: "SIMPLE", reason: "..." }` | `user_query="简单的问题"` | `output.strategy="SIMPLE"`，`output.complexity=30`，`output.reason` 为 LLM 返回的原因 |
| TC-SS-004 | 使用 LLM 评估判断为 Planning | `strategy_prompt_template_id` 有效，`LLMProvider.execLLM` 返回 `{ complexity: 80, strategy: "PLANNING", reason: "..." }` | `user_query` 为复杂问题 | `output.strategy="PLANNING"`，`output.complexity=80` |

### 2.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-SS-005 | strategy_prompt_template_id 为空（降级为规则判定） | `orchestration_config` 表 `strategy_prompt_template_id=""` | `user_query="你好"` | `output.reason="rule_based"`，基于规则判定复杂度，返回 true |
| TC-SS-006 | strategy_prompt_template_id 无效（降级为规则判定） | `orchestration_config` 表 `strategy_prompt_template_id` 指向不存在的模板 | `user_query="你好"` | `output.reason="rule_based"`，降级为规则判定，返回 true |
| TC-SS-007 | LLM 返回格式错误 | `strategy_prompt_template_id` 有效，`LLMProvider.execLLM` 返回非 JSON 格式 | `user_query="你好"` | 降级为规则判定或返回 false |
| TC-SS-008 | LLM 返回 complexity 超出 0-100 范围 | `strategy_prompt_template_id` 有效，`LLMProvider.execLLM` 返回 `{ complexity: 150 }` | `user_query="你好"` | 按规则判定处理或钳位到 0-100 |
| TC-SS-009 | LLM 返回无效 strategy 值 | `strategy_prompt_template_id` 有效，`LLMProvider.execLLM` 返回 `{ strategy: "UNKNOWN" }` | `user_query="你好"` | 降级为规则判定，返回 true |
| TC-SS-010 | complexity_decompose_threshold 为边界值 0 | `orchestration_config` 表 `complexity_decompose_threshold=0` | `user_query="你好"` | 所有问题判定为 Planning 或 Simple（取决于实现） |
| TC-SS-011 | complexity_decompose_threshold 为边界值 100 | `orchestration_config` 表 `complexity_decompose_threshold=100` | `user_query` 为复杂问题 | 所有问题判定为 Simple 或 Planning（取决于实现） |
| TC-SS-012 | user_query 仅包含多个问号 | `strategy_prompt_template_id` 为空 | `user_query="什么是AI？什么是ML？什么是DL？"` | 规则判定 complexity 可能较高，返回 true |
| TC-SS-013 | user_query 包含分步关键词 | `strategy_prompt_template_id` 为空 | `user_query="首先分析数据，然后生成报告，最后发送邮件"` | 规则判定 complexity 可能较高，返回 true |

---

## 3. receiveWorkAsync — 异步接收工作

### 3.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-RWA-001 | 异步提交工作 | `session_id` 有效，`MQProvider.sendMQ` 可用 | `user_query="你好"`, `callback_queue="work.result"` | `output.work_id` 非空，`output.interact_id` 非空，`output.job_id` 非空 UUID，返回 true |
| TC-RWA-002 | 异步提交不指定回调队列 | `session_id` 有效 | `user_query="你好"`, `callback_queue` 不传 | `output.job_id` 非空，结果写入 `orchestration_work` 表，返回 true |
| TC-RWA-003 | 异步提交后 Worker 消费并处理 | `session_id` 有效，`MQCore.startWorker` 可用 | `user_query="你好"` | Worker 消费消息后调用 `receiveWork` 同步处理，处理完成后 `orchestration_work` 表 status="COMPLETED" |
| TC-RWA-004 | 已有 Worker 运行时不重复启动 | `orchestration.work` 队列已有 Worker 运行 | `user_query="你好"` | `MQCore.startWorker` 不被调用或复用已有 Worker |

### 3.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-RWA-005 | MQProvider.sendMQ 发送失败 | `MQProvider.sendMQ` 模拟异常 | `user_query="你好"` | 返回 false，异常被记录 |
| TC-RWA-006 | session_id 为空异步提交 | 无 | `session_id=""`, `user_query="你好"` | 返回 false |
| TC-RWA-007 | Worker 处理失败 | `session_id` 有效，Worker 消费后 `receiveWork` 执行失败 | `user_query="你好"` | `orchestration_work` 表 status="FAILED"，错误信息写入 `callback_queue` |
| TC-RWA-008 | 异步提交强制指定策略 | `session_id` 有效 | `user_query="你好"`, `force_orchestration_strategy="PLANNING"` | 消息中包含 `force_orchestration_strategy`，Worker 处理时使用指定策略 |

---

## 4. buildWorkContext — 构建工作上下文

### 4.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-BWC-001 | 构建完整工作上下文 | `session_id` 有效，`InfoCore.context` 返回会话上下文，`WriterAgent.getUserProfile` 返回用户画像，`orchestration_work` 表有历史记录 | `session_id`, `work_id`, `user_query` 均有效 | `output.work_context` 包含 `work_id`、`session_id`、`user_query`、`session_context`、`user_profile`、`recent_works`、`created_at`、`metadata`，返回 true |
| TC-BWC-002 | 无历史工作时构建上下文 | `session_id` 有效，`orchestration_work` 表无历史记录 | `session_id`, `work_id`, `user_query` 均有效 | `output.work_context.recent_works` 为空数组，返回 true |
| TC-BWC-003 | 无用户画像时构建上下文 | `WriterAgent.getUserProfile` 返回空 | `session_id`, `work_id`, `user_query` 均有效 | `output.work_context.user_profile` 为空或默认值，返回 true |
| TC-BWC-004 | 最近工作数量等于 max_recent_works | `orchestration_work` 表有 10 条历史记录，`max_recent_works=5` | `session_id`, `work_id`, `user_query` 均有效 | `output.work_context.recent_works` 数组长度为 5 |

### 4.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-BWC-005 | InfoCore.context 返回空 | `InfoCore.context` 模拟返回空 | `session_id`, `work_id`, `user_query` 均有效 | `output.work_context.session_context` 为空，返回 true |
| TC-BWC-006 | WriterAgent.getUserProfile 调用失败 | `WriterAgent.getUserProfile` 模拟抛出异常 | `session_id`, `work_id`, `user_query` 均有效 | `output.work_context.user_profile` 为空或默认值，不中断上下文构建，返回 true |
| TC-BWC-007 | session_id 为空 | 无 | `session_id=""`, `work_id` 有效 | 返回 false 或返回基础上下文 |
| TC-BWC-008 | work_id 为空 | `session_id` 有效 | `work_id=""`, `user_query` 有效 | 返回 false |
| TC-BWC-009 | work_context 中 metadata.orchestration_version 值 | 任意 | `session_id`, `work_id`, `user_query` 均有效 | `output.work_context.metadata.orchestration_version="1.0"` |

---

## 5. getWorkStatus — 查询 Work 状态

### 5.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-GWS-001 | 按 work_id 查询单个 work | `orchestration_work` 表存在 `work_id="w1"` 的记录 | `work_id="w1"` | `output.works` 数组长度为 1，返回 true |
| TC-GWS-002 | 按 session_id 查询所有 work | `orchestration_work` 表存在 `session_id="s1"` 的 3 条记录 | `session_id="s1"` | `output.works` 数组长度为 3，返回 true |
| TC-GWS-003 | 按 status 筛选 | `orchestration_work` 表存在 status="COMPLETED" 的 2 条记录 | `status="COMPLETED"` | `output.works` 数组长度为 2，所有记录 status="COMPLETED"，返回 true |
| TC-GWS-004 | 分页查询 | `orchestration_work` 表存在 20 条记录 | `page={ offset: 0, limit: 10 }` | `output.works` 数组长度为 10，返回 true |
| TC-GWS-005 | 组合条件查询 | `orchestration_work` 表存在多条记录 | `session_id="s1"`, `status="FAILED"` | `output.works` 仅返回匹配 `session_id` 和 `status` 的记录，返回 true |
| TC-GWS-006 | 返回字段完整性 | `orchestration_work` 表存在一条记录 | `work_id="w1"` | 返回的每项包含 `work_id`、`interact_id`、`session_id`、`user_query`（前100字）、`status`、`orchestration_strategy`、`task_count`、`completed_task_count`、`elapsed_ms`、`error_message`、`created`、`updated` |

### 5.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-GWS-007 | 查询不存在的 work_id | `orchestration_work` 表无对应记录 | `work_id="nonexistent"` | `output.works` 为空数组，返回 true |
| TC-GWS-008 | 无任何查询条件 | 无 | 不传任何筛选参数 | 返回所有记录或返回空（按实现约定） |
| TC-GWS-009 | user_query 超过 100 字 | `orchestration_work` 表存在一条 `user_query` 为 200 字的记录 | `work_id` 有效 | 返回的 `user_query` 字段截断为前 100 字 |
| TC-GWS-010 | 查询条件 work_id 和 session_id 均不传 | 无 | 无 work_id 和 session_id | 返回 false 或全量结果 |

---

## 6. cancelWork — 取消 Work

### 6.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-CW-001 | 取消正在执行的 work | `orchestration_work` 表存在 `work_id="w1"`，status="EXECUTING" | `work_id="w1"`, `reason="用户主动取消"` | `output.cancelled=true`，`orchestration_work` 表 status="FAILED"，`cancel_reason="用户主动取消"`，`OrchestrationExecution.cancelExecution` 被调用，返回 true |
| TC-CW-002 | 取消 PROCESSING 状态的 work | `orchestration_work` 表存在 `work_id="w1"`，status="PROCESSING" | `work_id="w1"`, `reason="超时取消"` | `output.cancelled=true`，`orchestration_work` 表 status="FAILED"，返回 true |
| TC-CW-003 | 取消 PLANNING 状态的 work | `orchestration_work` 表存在 `work_id="w1"`，status="PLANNING" | `work_id="w1"`, `reason="重新规划"` | `output.cancelled=true`，`orchestration_work` 表 status="FAILED"，返回 true |

### 6.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-CW-004 | 取消已完成的 work | `orchestration_work` 表存在 `work_id="w1"`，status="COMPLETED" | `work_id="w1"`, `reason="..."` | `output.cancelled=false`，提示"工作已结束"，返回 true |
| TC-CW-005 | 取消已失败的 work | `orchestration_work` 表存在 `work_id="w1"`，status="FAILED" | `work_id="w1"`, `reason="..."` | `output.cancelled=false`，提示"工作已结束"，返回 true |
| TC-CW-006 | 取消不存在的 work | `orchestration_work` 表无 `work_id="nonexistent"` 记录 | `work_id="nonexistent"`, `reason="..."` | 返回 false 或 `output.cancelled=false` |
| TC-CW-007 | cancel_reason 为空 | `orchestration_work` 表存在 status="EXECUTING" 的记录 | `work_id="w1"`, `reason=""` | `output.cancelled=true`，`cancel_reason` 为空字符串，返回 true |
| TC-CW-008 | OrchestrationExecution.cancelExecution 调用失败 | `OrchestrationExecution.cancelExecution` 模拟异常 | `work_id="w1"`, `reason="测试"` | 返回 false，`orchestration_work` 表可能部分更新 |

---

## 7. configOrchestrationEntry — 配置

### 7.1 正常流程

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-CONF-001 | 更新 complexity_decompose_threshold | `orchestration_config` 表存在记录 | `complexity_decompose_threshold=60` | `orchestration_config` 表 `complexity_decompose_threshold=60`，返回当前全部配置，返回 true |
| TC-CONF-002 | 更新 strategy_prompt_template_id | `orchestration_config` 表存在记录，`PromptsProvider.soPrompt` 中存在该模板 | `strategy_prompt_template_id="valid_template_id"` | 配置更新成功，返回 true |
| TC-CONF-003 | 更新 default_strategy | `orchestration_config` 表存在记录 | `default_strategy="PLANNING"` | 配置更新成功，返回 true |
| TC-CONF-004 | 更新 max_recent_works | `orchestration_config` 表存在记录 | `max_recent_works=10` | 配置更新成功，返回 true |
| TC-CONF-005 | 更新 async_worker_interval | `orchestration_config` 表存在记录 | `async_worker_interval=2000` | 配置更新成功，返回 true |
| TC-CONF-006 | 不传任何参数（查询当前配置） | `orchestration_config` 表存在记录 | 所有字段不传 | 返回当前生效的全部配置，不修改任何值，返回 true |

### 7.2 边界与异常

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-CONF-007 | complexity_decompose_threshold 超出范围 | `orchestration_config` 表存在记录 | `complexity_decompose_threshold=150` | 返回 false，校验失败 |
| TC-CONF-008 | complexity_decompose_threshold 为负数 | `orchestration_config` 表存在记录 | `complexity_decompose_threshold=-10` | 返回 false，校验失败 |
| TC-CONF-009 | complexity_decompose_threshold 为边界值 0 | `orchestration_config` 表存在记录 | `complexity_decompose_threshold=0` | 配置更新成功，返回 true |
| TC-CONF-010 | complexity_decompose_threshold 为边界值 100 | `orchestration_config` 表存在记录 | `complexity_decompose_threshold=100` | 配置更新成功，返回 true |
| TC-CONF-011 | strategy_prompt_template_id 不存在 | `orchestration_config` 表存在记录，`PromptsProvider.soPrompt` 中不存在该模板 | `strategy_prompt_template_id="invalid_id"` | 返回 false，校验失败 |
| TC-CONF-012 | default_strategy 为无效值 | `orchestration_config` 表存在记录 | `default_strategy="INVALID"` | 返回 false，校验失败 |
| TC-CONF-013 | max_recent_works 为非正整数 | `orchestration_config` 表存在记录 | `max_recent_works=-1` | 返回 false，校验失败 |
| TC-CONF-014 | max_recent_works 为 0 | `orchestration_config` 表存在记录 | `max_recent_works=0` | 校验失败（应为正整数），返回 false |
| TC-CONF-015 | async_worker_interval 为负数 | `orchestration_config` 表存在记录 | `async_worker_interval=-500` | 返回 false，校验失败 |

---

## 8. AOP 代理通用测试

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-AOP-001 | 所有方法调用记录日志 | 任意 | 调用任意方法 | `LogProvider.debug/info` 记录方法调用日志 |
| TC-AOP-002 | 所有方法调用记录耗时 | 任意 | 调用任意方法 | `output.elapsed_ms` 字段存在且非负 |
| TC-AOP-003 | AOP 拦截器异常不影响业务方法 | `beforeExecute` 拦截器模拟抛出异常 | 调用任意方法 | 业务方法正常执行并返回结果 |
| TC-AOP-004 | 方法异常时 afterExecute 仍记录 | 方法内部模拟抛出异常 | 调用任意方法 | `LogProvider` 记录错误日志，`output.elapsed_ms` 仍被记录 |

---

## 9. 表结构验证

| 编号 | 测试场景 | 前置条件 | 输入 | 预期输出 |
|------|---------|---------|------|---------|
| TC-TBL-001 | orchestration_work 表字段完整性 | 表已创建 | 查询表结构 | 包含 id、created、updated、work_id、interact_id、session_id、user_query、status、orchestration_strategy、task_count、completed_task_count、elapsed_ms、cancel_reason、error_message、final_response、metadata |
| TC-TBL-002 | orchestration_work 表索引 | 表已创建 | 查询索引 | work_id 唯一索引，created、updated、session_id、status 普通索引 |
| TC-TBL-003 | orchestration_config 表字段完整性 | 表已创建 | 查询表结构 | 包含所有 PRD 定义的字段 |
| TC-TBL-004 | orchestration_work 表 status 枚举值约束 | 表已创建 | 插入 status="INVALID" 的记录 | 插入失败或应用层校验拦截 |