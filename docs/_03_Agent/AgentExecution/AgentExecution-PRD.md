# Agent Execution

## 1. 设计目标

1. 提供统一的 Agent 执行引擎，支持不同策略的调度；
2. 将执行过程抽象为 Think、Act、Reflect、Answer 四个原子接口；
3. 原子接口执行结果统一返回给调度器，由调度器根据策略逻辑自行决定任务推进（闭环自驱）；
4. 全链路记录每次原子操作的输入输出、耗时和 Token 用量；
5. 支持同步执行和异步执行（通过 MQCore 启动后台 Worker）。

## 2. 功能设计

### 2.1. 执行 Agent（execAgent）

**功能**：以同步方式执行一个 Agent 实例，运行完整的策略循环直到产生最终答案
**入参**：
- input：ExecAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - work_id：工作 ID
  - interact_id：交互 ID
  - task_content：任务内容
  - max_iterations：最大迭代次数（可选，默认 10，防止死循环）
- context：ExecAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ExecAgentOutput（继承 Output），承载返回内容：
  - answer：Agent 产生的最终答案
  - iterations：实际迭代次数
  - trace_id：执行追踪 ID（用于全链路日志关联）
  - elapsed_ms：总耗时

**处理流程**：

1. **前置准备**
   a. 生成 `trace_id`（UUID），用于关联本次执行的所有日志；
   b. 调用 AgentLibrary.getAgent(agent_id) 获取 Agent 元数据（strategy_id、llm_id、soul_id）；
   c. 调用 RelationDBProvider.selectDB 查 Core 层 `agent_skill`（库名: skill）表获取绑定的 skill_ids；
   d. 调用 RelationDBProvider.selectDB 查 Core 层 `agent_mcp`（库名: mcp）表获取绑定的 mcp_ids；
   e. 若 Agent 不存在或 enable=false，返回 false 并记录错误日志；

2. **LLM 限额校验**
   a. 调用 RelationDBProvider.selectOneDB 根据 llm_id 查询该 LLM 所属的 llm_provider_id；
   b. 调用 LLMCore.checkLLMQuota 校验该提供商是否超出调用限额；
   c. 若超出限额，返回 false 并记录告警日志："LLM 调用已超出限额"；

3. **构建初始上下文**
   a. 调用 InfoCore.context 构建当前 session 的上下文数据；
   b. 将 task_content 拼接到上下文前端；
   c. 调用 SoulProvider.getSoul(soul_id) 获取 Soul 内容，作为系统 prompt 头部；

4. **执行循环（调度器驱动）**
   a. 调用 AgentStrategy.getStrategy(strategy_id) 获取策略配置（原子操作调用顺序和执行控制逻辑）；
   b. 初始化迭代计数器 `iteration = 0`；
   c. 初始化执行历史记录 `history = []`（累积记录每次原子操作的输出）；
   d. 进入策略定义的执行循环：
      - 根据策略调度逻辑，依次调用原子接口（Think → Act → Reflect → Answer）；
      - 每次原子操作完成后，将输出记录到 `history`；
      - 策略调度器判断是否继续循环或终止；
   e. 若 `iteration >= max_iterations`，强制终止循环，调用 Answer 接口生成当前状态下最优的答案；

5. **后置处理**
   a. 调用 AgentLibrary.recordAgentUsage 记录本次使用；
   b. 调用 InfoCore.saveInfo 保存本次 Agent 的执行结果为 RES

 用；
   c. 将 answer、iterations、trace_id、elapsed_ms 写入 output 返回；

6. **异步触发优化（fire-and-forget）**
   a. 通过 MQCore.startWorker 投递一条优化任务：EvolutorAgent 评估本次 Agent 执行结果；
   b. 根据评估结果触发 AgentBuilder.optimizeAgent；

### 2.2. 异步执行 Agent（execAgentAsync）

**功能**：通过 MQ 异步执行 Agent，适用于长任务或批量任务
**入参**：
- input：ExecAgentAsyncInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - work_id：工作 ID
  - interact_id：交互 ID
  - task_content：任务内容
  - callback_queue：结果回调队列名称（可选）
  - max_iterations：最大迭代次数（可选，默认 10）
- context：ExecAgentAsyncContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ExecAgentAsyncOutput（继承 Output），承载返回内容：
  - job_id：异步任务 ID

**处理流程**：

1. 生成 `job_id`（UUID）；
2. 调用 MQProvider.sendMQ 将执行任务 `{ job_id, agent_id, work_id, interact_id, task_content, max_iterations, callback_queue }` 发送到 `agent.execution` 队列；
3. 确保 `agent.execution` 队列上有 Worker 在运行（调用 MQCore.startWorker 启动消费者，若已存在则复用）；
4. Worker 的处理逻辑：从队列消费消息 → 调用 execAgent 同步执行 → 执行完成后将结果通过 MQProvider.sendMQ 发送到 `callback_queue`（若指定）；
5. 返回 `job_id` 写入 output；

### 2.3. 原子接口

Agent 执行过程被抽象为以下四个原子接口。各接口可独立开发、测试和部署，策略调度器按策略配置组合调用。

#### 2.3.1. Think（思考）

**功能**：LLM 基于当前上下文进行推理，分析当前状态并决定下一步行动
**入参**：
- input：ThinkInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - llm_id：LLM ID
  - soul_id：Soul ID
  - context_data：当前上下文数据
  - history：执行历史记录
  - iteration：当前迭代次数
- context：ThinkContext（继承 Context），会话上下文（session_id, work_id, interact_id, trace_id 等）
- output：ThinkOutput（继承 Output），承载返回内容：
  - reasoning：推理结果文本
  - next_action：下一步行动计划（JSON）
  - token_usage：本次 LLM 调用的 Token 用量
  - elapsed_ms：耗时

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `agent_execution_config` 表获取 `think_prompt_template_id`；
2. 将 `context_data`、`history` 与 `think_prompt_template_id` 调用 PromptsProvider.execPrompt 构建 Think prompt；
3. 将 Soul 内容作为 system message 拼接到 prompt 前方；
4. 调用 LLMProvider.execLLM 执行推理，获取 reasoning 和 next_action；
5. 调用 InfoCore.saveInfo 保存 Think 的结果（info_creator_role=AGENT，parent_info_ids 关联之前的 context）；
6. 从 LLMProvider 返回中提取 token_usage 和耗时，写入 output 返回；
7. 通过 AOP 自动记录 elapsed_ms；

#### 2.3.2. Act（执行）

**功能**：执行由 Think 阶段决定的下一步行动（调用 Skill 或 MCP 工具）
**入参**：
- input：ActInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - skill_ids：可用 Skill ID 列表
  - mcp_ids：可用 MCP ID 列表
  - next_action：Think 阶段产出的行动计划（JSON：`{ "tool_type": "SKILL"|"MCP", "tool_id": "...", "params": {...} }`）
  - context_data：当前上下文数据
- context：ActContext（继承 Context），会话上下文（session_id, work_id, interact_id, trace_id 等）
- output：ActOutput（继承 Output），承载返回内容：
  - result：工具执行结果
  - tool_type：使用的工具类型
  - tool_id：使用的工具 ID
  - elapsed_ms：耗时

**处理流程**：

1. 解析 `next_action` JSON，提取 `tool_type`、`tool_id`、`params`；
2. 若 `tool_type` 为 SKILL：
   a. 校验 `tool_id` 是否在入参 `skill_ids` 列表中；不存在则返回错误："Skill 不在 Agent 的绑定列表中"；
   b. 调用 SkillProvider.execSkill，传入 `tool_id` 和 `params`，执行 Skill 沙箱；
   c. 获取执行结果写入 `result`；
3. 若 `tool_type` 为 MCP：
   a. 校验 `tool_id` 是否在入参 `mcp_ids` 列表中；不存在则返回错误："MCP 不在 Agent 的绑定列表中"；
   b. 调用 MCPProvider.execMcp，传入 `tool_id` 和 `params`，执行 MCP 调用；
   c. 获取执行结果写入 `result`；
4. 若 `tool_type` 为 NONE（Think 阶段决定不需要工具）：直接返回空 result；
5. 调用 InfoCore.saveInfo 保存 Act 的执行结果（info_creator_role=SKILL 或 MCP，parent_info_ids 关联 Think 的 msg_id）；
6. 将执行结果写入 output 返回；

#### 2.3.3. Reflect（反思）

**功能**：评估当前执行进展，判断是否需要继续迭代或可以给出最终答案
**入参**：
- input：ReflectInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - llm_id：LLM ID
  - soul_id：Soul ID
  - context_data：当前上下文数据
  - history：完整的执行历史记录（Think + Act 的累积）
  - iteration：当前迭代次数
  - max_iterations：最大迭代次数
- context：ReflectContext（继承 Context），会话上下文（session_id, work_id, interact_id, trace_id 等）
- output：ReflectOutput（继承 Output），承载返回内容：
  - should_continue：是否继续迭代（true=继续，false=可以给出最终答案）
  - reflection：反思总结文本
  - token_usage：Token 用量
  - elapsed_ms：耗时

**处理流程**：

1. 若 `iteration >= max_iterations`：直接返回 `should_continue=false`，跳过 LLM 调用；
2. 调用 RelationDBProvider.selectOneDB 查询 `agent_execution_config` 表获取 `reflect_prompt_template_id`；
3. 将 `history` 与 `reflect_prompt_template_id` 调用 PromptsProvider.execPrompt 构建 Reflect prompt；
4. 将 Soul 内容作为 system message 拼接；
5. 调用 LLMProvider.execLLM 执行反思，获取 `should_continue`（boolean）和 `reflection` 文本；
6. 调用 InfoCore.saveInfo 保存 Reflect 的结果；
7. 将反思结果写入 output 返回；

#### 2.3.4. Answer（回答）

**功能**：基于完整的执行历史，生成最终的用户可见答案
**入参**：
- input：AnswerInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - llm_id：LLM ID
  - soul_id：Soul ID
  - history：完整的执行历史记录
  - context_data：当前上下文数据
  - task_content：原始任务内容
- context：AnswerContext（继承 Context），会话上下文（session_id, work_id, interact_id, trace_id 等）
- output：AnswerOutput（继承 Output），承载返回内容：
  - answer：最终答案文本
  - token_usage：Token 用量
  - elapsed_ms：耗时

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `agent_execution_config` 表获取 `answer_prompt_template_id`；
2. 将 `task_content`、`history` 与 `answer_prompt_template_id` 调用 PromptsProvider.execPrompt 构建 Answer prompt；
3. 将 Soul 内容作为 system message 拼接；
4. 调用 LLMProvider.execLLM 生成结构化最终答案；
5. 调用 InfoCore.saveInfo 保存 Answer 的结果（info_creator_role=RESPONSE）；
6. 将答案写入 output 返回；

### 2.4. 获取执行追踪（getTrace）

**功能**：根据 trace_id 查询一次 Agent 执行的完整链路详情
**入参**：
- input：GetTraceInput（继承 Input），包含以下字段：
  - trace_id：执行追踪 ID
- context：GetTraceContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetTraceOutput（继承 Output），承载返回内容：
  - trace：执行追踪详情
    - trace_id
    - agent_id
    - start_time / end_time
    - total_elapsed_ms
    - iterations：每轮迭代的详情列表：
      - iteration_index
      - think：Think 输出
      - act：Act 输出（若有）
      - reflect：Reflect 输出
      - answer：Answer 输出（最后一轮）
      - iteration_elapsed_ms
    - total_token_usage

**处理流程**：

1. 调用 InfoCore.lastNInfo 根据 trace_id（通过 info_creator_role 过滤）获取本次执行的所有信息记录；
2. 按迭代顺序重组 Think → Act → Reflect 的执行序列；
3. 汇总计算 total_token_usage 和 total_elapsed_ms；
4. 将结构化追踪数据写入 output 返回；

### 2.5. 获取队列执行状态（getExecQueueStatus）

**功能**：查看 `agent.execution` 队列的状态（异步执行情况）
**入参**：
- input：GetExecQueueStatusInput（继承 Input）
- context：GetExecQueueStatusContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetExecQueueStatusOutput（继承 Output），承载返回内容：
  - queue_stats：队列统计（pending / processing / completed / failed 数量）
  - workers：正在运行的 Worker 列表

**处理流程**：

1. 调用 MQProvider.getQueueStats("agent.execution") 获取队列统计；
2. 调用 MQCore.getWorker("agent.execution") 获取 Worker 状态；
3. 将统计信息写入 output 返回；

### 2.6. 配置（configAgentExecution）

**功能**：配置 AgentExecution 的执行参数
**入参**：
- input：ConfigAgentExecutionInput（继承 Input），包含以下字段：
  - think_prompt_template_id：Think prompt 模板 ID（可选）
  - reflect_prompt_template_id：Reflect prompt 模板 ID（可选）
  - answer_prompt_template_id：Answer prompt 模板 ID（可选）
  - default_max_iterations：默认最大迭代次数（可选，默认 10）
  - async_worker_interval：异步执行 Worker 轮询间隔（可选，默认 1000ms）
- context：ConfigAgentExecutionContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigAgentExecutionOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `agent_execution_config` 表获取当前配置；
2. 对每个非空入参进行校验和更新：
   a. prompt_template_id 类：校验 PromptsProvider.soPrompt 中存在；
   b. default_max_iterations：校验为正整数；
   c. async_worker_interval：校验为正整数（ms）；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. AgentExecution 配置表

- 表名：agent_execution_config
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| think_prompt_template_id | Think prompt 模板 ID | UUID | N | | |
| reflect_prompt_template_id | Reflect prompt 模板 ID | UUID | N | | |
| answer_prompt_template_id | Answer prompt 模板 ID | UUID | N | | |
| default_max_iterations | 默认最大迭代次数 | INT | N | | 默认 10 |
| async_worker_interval | 异步 Worker 轮询间隔（ms） | INT | N | | 默认 1000 |

## 实现约定（与代码同步，2026-07-28）

1. **LLM**：仅使用 Agent 已绑定的 `llm_id`（来自 Core.matchLLM），禁止 `llm_model LIMIT 1`。
2. **执行闭环**：按 strategy 的 execution_rule（CoT/ReAct/Plan-and-Solve）调度 Think→Act→Reflect→Answer；
   - Think/Reflect/Answer：execPrompt（若配置）+ getSoul system + execLLM(agent.llm_id) + saveInfo；
   - Act：根据模型 next_action 调用 Base `execSkill` / `execMcp`；
3. **规则引擎**：支持 `true_next`/`false_next`/`on_error`；Plan-and-Solve 支持跨 phase 跳转（如 SolvePhase、SummaryAnswer）与 `loop_over: sub_steps`。
4. **评估**：execAgent 完成后向 MQ 队列 `agent.eval` 投递，由 Evolutor 消费；不直接回调 Evolutor。
5. **ID/时间**：统一 `IdGenerator.generate()` / `IdGenerator.now()`（毫秒）。
6. **DB**：业务 CRUD 经 RelationDBAccess.insert/select/update/count，禁止业务路径 queryRaw 拼条件。
