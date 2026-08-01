# Agent Execution 模块测试用例

> 模块代码：`brian-backend/Agent/AgentExecution/`  
> 接口数量：9 个（execAgent、execAgentAsync、think、act、reflect、answer、getTrace、getExecQueueStatus、configAgentExecution）  
> 测试用例总数：38  
> 覆盖目标：100% 接口覆盖，≥80% 场景覆盖

---

## 1. execAgent — 同步执行 Agent

### TC-AE-001: CoT 策略执行 — Think → Answer 单步

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 绑定 CoT 策略（max_iterations=1，steps=[Think, Answer]）；LLM 正常返回；无需 Skill/MCP |
| **测试步骤** | 调用 execAgent（agent_id、work_id、user_query='简单问题'） |
| **预期结果** | 执行 Think → Answer 两步；output.answer 非空；agent_usage 被记录；InfoCore 保存了 trace/answer 信息 |
| **覆盖场景** | 基础 CoT 执行流程 |

### TC-AE-002: ReAct 策略执行 — 迭代循环

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 绑定 ReAct 策略（max_iterations=10）；LLM 返回 think 结果；act 执行 skill 成功；reflect 返回 should_continue=true(1次) 后 should_continue=false |
| **测试步骤** | 调用 execAgent |
| **预期结果** | 执行 2 个循环后 Answer；output.iteration_count > 1；trace 记录了每步的详细信息 |
| **覆盖场景** | ReAct 多轮迭代 |

### TC-AE-003: ReAct 策略到达 max_iterations 时强制终止

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 绑定 ReAct 策略（max_iterations=3）；reflect 始终返回 should_continue=true |
| **测试步骤** | 调用 execAgent |
| **预期结果** | 执行 3 轮后强制终止迭代，进入 Answer；output.iteration_count <= 3 |
| **覆盖场景** | 最大迭代限制 |

### TC-AE-004: Plan-and-Solve 策略执行 — 多阶段流程

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 绑定 Plan-and-Solve 策略（phases: plan → solve(sub_steps) → summary）；LLM 返回 plan 结果（子任务列表）；执行子任务 |
| **测试步骤** | 调用 execAgent |
| **预期结果** | 完成 3 个阶段：plan Think → solve 子任务循环 → summary Answer；output.answer 非空 |
| **覆盖场景** | 多阶段执行流程 |

### TC-AE-005: Agent 不存在时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | AgentLibrary 中无该 agent_id |
| **测试步骤** | 调用 execAgent（agent_id='不存在的ID'） |
| **预期结果** | 抛出 `NotFoundError` |
| **覆盖场景** | 无效 Agent |

### TC-AE-006: Agent 已禁用时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 存在但 enable=false |
| **测试步骤** | 调用 execAgent |
| **预期结果** | 抛出 `ValidationError`，消息提示 Agent 已禁用 |
| **覆盖场景** | 禁用 Agent 执行保护 |

### TC-AE-007: Skill 调用执行（act 步骤）

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 绑定一个 Skill；think 返回 `{"next_action":{"type":"SKILL","skill_id":"xxx","action":"execute"}}` |
| **测试步骤** | 调用 execAgent |
| **预期结果** | act 步骤调用 SkillAccess 执行技能；skill_access.execSkill 被调用 |
| **覆盖场景** | Skill 执行 |

### TC-AE-008: MCP 工具调用执行（act 步骤）

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 绑定一个 MCP；think 返回 `{"next_action":{"type":"MCP","mcp_id":"yyy","action":"call"}}` |
| **测试步骤** | 调用 execAgent |
| **预期结果** | act 步骤调用 MCPAccess 执行工具；mcp_access.execMCP 被调用 |
| **覆盖场景** | MCP 执行 |

### TC-AE-009: think 返回的 next_action 格式异常时 act 跳过

| 项 | 内容 |
|---|------|
| **前置条件** | think 返回 `{"next_action":"invalid format"}` 或非 JSON |
| **测试步骤** | 调用 execAgent（进入 act 步骤） |
| **预期结果** | act 识别为无效 action，跳过执行；reflect 步骤可能返回 should_continue=true 进入下一轮 |
| **覆盖场景** | 无效 Action 处理 |

### TC-AE-010: 执行异常时错误记录到 trace

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 调用在 Think 步骤抛出异常 |
| **测试步骤** | 调用 execAgent |
| **预期结果** | 不崩溃；output.error 非空；trace 中记录了错误步骤信息 |
| **覆盖场景** | 执行容错 |

### TC-AE-011: 执行后 recordAgentUsage 被调用

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 执行成功 |
| **测试步骤** | 调用 execAgent |
| **预期结果** | AgentLibrary.recordAgentUsage 被调用（通过检查 agent_usage 表记录） |
| **覆盖场景** | 使用记录 |

### TC-AE-012: 执行后触发评估（MQ 消息发送）

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 执行完成 |
| **测试步骤** | 调用 execAgent |
| **预期结果** | 向 `agent.eval` MQ 队列发送包含 agent_id、work_id 的评估消息 |
| **覆盖场景** | 后置评估触发 |

### TC-AE-013: 配置的 prompt 模板（think/reflect/answer）被使用

| 项 | 内容 |
|---|------|
| **前置条件** | agent_execution_config 中设置了 think_prompt_template_id 指向有效 prompt |
| **测试步骤** | 调用 execAgent |
| **预期结果** | think 步骤使用 prompt 模板渲染出 prompt 并传参 LLM（相比无模板时 LLM 入参不同） |
| **覆盖场景** | prompt 模板渲染 |

### TC-AE-014: 无配置模板时使用默认 prompt 渲染

| 项 | 内容 |
|---|------|
| **前置条件** | agent_execution_config 中 think_prompt_template_id 为空 |
| **测试步骤** | 调用 execAgent |
| **预期结果** | think 步骤使用代码内置的默认 prompt 文本 |
| **覆盖场景** | 默认 prompt 兜底 |

---

## 2. execAgentAsync — 异步执行 Agent

### TC-AE-015: 正常提交异步任务

| 项 | 内容 |
|---|------|
| **前置条件** | 有效的 Agent；MQAccess 正常 |
| **测试步骤** | 调用 execAgentAsync（agent_id、work_id、async_callback） |
| **预期结果** | 返回 true；MQ 消息被发送到 agent.execution 队列 |
| **覆盖场景** | 异步执行提交 |

### TC-AE-016: 异步执行完成后回调

| 项 | 内容 |
|---|------|
| **前置条件** | MQ Worker 消费 agent.execution 消息 |
| **测试步骤** | 模拟 Worker 消费消息，执行 execAgent，回调通知 |
| **预期结果** | execAgent 被调用；结果返回给回调方 |
| **覆盖场景** | 异步执行完整流程 |

---

## 3. think — 原子思考操作

### TC-AE-017: 基本思考 — LLM 返回推理结果

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 存在且绑定有效 LLM；传入 user_query 和 history |
| **测试步骤** | 调用 think（agent_id、user_query、history=[]、context={}） |
| **预期结果** | LLM 被调用；output.reasoning 非空；output.next_action 为解析后的 JSON |
| **覆盖场景** | 基础 think 操作 |

### TC-AE-018: think 使用 Soul 系统提示

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 绑定了 soul_id |
| **测试步骤** | 调用 think |
| **预期结果** | LLM 调用时包含从 Soul 加载的 personality 提示语 |
| **覆盖场景** | Soul 注入 |

### TC-AE-019: think 解析 next_action 失败时返回原始响应

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 返回无法解析为 JSON 的文本 |
| **测试步骤** | 调用 think |
| **预期结果** | output.reasoning 包含 LLM 原始返回；output.next_action 可能为 null 或包含 parser_error |
| **覆盖场景** | JSON 解析降级 |

### TC-AE-020: think 使用配置的 prompt 模板

| 项 | 内容 |
|---|------|
| **前置条件** | agent_execution_config 中 think_prompt_template_id 指向有效 prompt 模板 |
| **测试步骤** | 调用 think |
| **预期结果** | prompt 模板被 ExecPrompt 渲染后，传入 LLM 的 prompt 内容包含模板变量 |
| **覆盖场景** | 模板渲染 think prompt |

---

## 4. act — 原子执行操作

### TC-AE-021: 执行 Skill 类型的 next_action

| 项 | 内容 |
|---|------|
| **前置条件** | next_action = `{"type":"SKILL","skill_id":"s1","action":"run","params":{"arg":"val"}}` |
| **测试步骤** | 调用 act（agent_id、next_action） |
| **预期结果** | SkillAccess.execSkill 被调用；output.act_result 包含 skill 执行结果 |
| **覆盖场景** | Skill 执行 |

### TC-AE-022: 执行 MCP 类型的 next_action

| 项 | 内容 |
|---|------|
| **前置条件** | next_action = `{"type":"MCP","mcp_id":"m1","action":"search","params":{"q":"query"}}` |
| **测试步骤** | 调用 act |
| **预期结果** | MCPAccess.execMCP 被调用；output.act_result 包含 MCP 返回 |
| **覆盖场景** | MCP 执行 |

### TC-AE-023: next_action.type 未知时 act 返回错误

| 项 | 内容 |
|---|------|
| **前置条件** | next_action = `{"type":"UNKNOWN"}` |
| **测试步骤** | 调用 act |
| **预期结果** | output.act_result 包含 error 信息；不抛异常 |
| **覆盖场景** | 未知 action 类型 |

### TC-AE-024: act 执行 Skill 失败时返回错误信息

| 项 | 内容 |
|---|------|
| **前置条件** | SkillAccess.execSkill 返回 false 或抛异常 |
| **测试步骤** | 调用 act（next_action 指向该 Skill） |
| **预期结果** | output.act_result 包含 error 描述；不崩溃 |
| **覆盖场景** | Skill 执行失败容错 |

---

## 5. reflect — 原子反思操作

### TC-AE-025: reflect 评估后建议继续迭代

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 返回评估结果含 should_continue=true |
| **测试步骤** | 调用 reflect（agent_id、step_results=[Think/Act 结果]） |
| **预期结果** | output.should_continue=true；output.reflection 非空 |
| **覆盖场景** | 继续迭代 |

### TC-AE-026: reflect 评估后建议结束迭代

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 返回评估结果含 should_continue=false |
| **测试步骤** | 调用 reflect |
| **预期结果** | output.should_continue=false |
| **覆盖场景** | 终止迭代 |

### TC-AE-027: reflect 使用配置的 prompt 模板

| 项 | 内容 |
|---|------|
| **前置条件** | agent_execution_config 中 reflect_prompt_template_id 指向有效 prompt |
| **测试步骤** | 调用 reflect |
| **预期结果** | prompt 模板被渲染后传入 LLM |
| **覆盖场景** | 模板渲染 reflect prompt |

### TC-AE-028: reflect LLM 调用失败时 should_continue=true（安全兜底）

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 在 reflect 调用中失败/抛异常 |
| **测试步骤** | 调用 reflect |
| **预期结果** | output.should_continue=true 或 false（取决于实现兜底策略），不崩溃 |
| **覆盖场景** | reflect 失败容错 |

---

## 6. answer — 生成最终回答

### TC-AE-029: 生成最终答案

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 执行完成，有完整 trace |
| **测试步骤** | 调用 answer（agent_id、user_query、execution_context） |
| **预期结果** | LLM 被调用生成最终答案；output.answer 非空 |
| **覆盖场景** | 基础 answer 操作 |

### TC-AE-030: answer 使用 Soul 风格

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 绑定了 soul_id |
| **测试步骤** | 调用 answer |
| **预期结果** | answer 的 prompt 包含 soul 风格的 personality 描述 |
| **覆盖场景** | Soul 风格注入 |

### TC-AE-031: answer 使用配置的 prompt 模板

| 项 | 内容 |
|---|------|
| **前置条件** | agent_execution_config 中 answer_prompt_template_id 指向有效 prompt |
| **测试步骤** | 调用 answer |
| **预期结果** | prompt 模板被渲染 |
| **覆盖场景** | answer prompt 模板 |

---

## 7. getTrace — 获取执行追踪

### TC-AE-032: 获取完整的执行 trace

| 项 | 内容 |
|---|------|
| **前置条件** | 某次 execAgent 已完成执行（trace 已持久化） |
| **测试步骤** | 调用 getTrace（trace_id=执行时的 trace_id） |
| **预期结果** | output.trace 包含完整迭代历史；answer 非空；total_token_usage >= 0 |
| **覆盖场景** | 基础 trace 查询 |

### TC-AE-033: 查询不存在的 trace_id 返回空

| 项 | 内容 |
|---|------|
| **前置条件** | 无此 trace_id |
| **测试步骤** | 调用 getTrace（trace_id='不存在的ID'） |
| **预期结果** | output.trace 为 null 或空对象 |
| **覆盖场景** | 无效 trace_id |

### TC-AE-034: trace 中包含 token 用量统计

| 项 | 内容 |
|---|------|
| **前置条件** | 执行过程中调用了多次 LLM |
| **测试步骤** | 调用 getTrace |
| **预期结果** | output.total_token_usage 为多轮 LLM token 之和 |
| **覆盖场景** | token 统计 |

---

## 8. getExecQueueStatus — 执行队列状态

### TC-AE-035: 获取队列统计信息

| 项 | 内容 |
|---|------|
| **前置条件** | MQAccess 正常 |
| **测试步骤** | 调用 getExecQueueStatus |
| **预期结果** | output 包含 agent.execution 队列的 pending 数量、worker 状态等信息 |
| **覆盖场景** | 队列状态查询 |

### TC-AE-036: MQ 服务不可用时的容错

| 项 | 内容 |
|---|------|
| **前置条件** | MQAccess 调用失败 |
| **测试步骤** | 调用 getExecQueueStatus |
| **预期结果** | 不抛异常；output 可能返回 error 标记或默认值 |
| **覆盖场景** | MQ 不可用容错 |

---

## 9. configAgentExecution — 配置执行引擎

### TC-AE-037: 首次配置写入默认值

| 项 | 内容 |
|---|------|
| **前置条件** | agent_execution_config 表为空 |
| **测试步骤** | 调用 configAgentExecution（不传参数） |
| **预期结果** | 配置初始化：default_max_iterations=10、async_worker_interval=5000 等 |
| **覆盖场景** | 默认配置初始化 |

### TC-AE-038: 更新 think/reflect/answer prompt 模板 + max_iterations

| 项 | 内容 |
|---|------|
| **前置条件** | 配置已初始化 |
| **测试步骤** | 调用 configAgentExecution（think_prompt_template_id='p1'、reflect_prompt_template_id='p2'、answer_prompt_template_id='p3'、default_max_iterations=20、async_worker_interval=10000） |
| **预期结果** | 所有字段正确更新 |
| **覆盖场景** | 完整配置更新 |
