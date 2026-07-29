# Evolutor Agent

## 1. 设计目标

1. 对 Worker Agent 的每次执行结果进行质量评估和打分；
2. 对 WriterAgent 生成的最终回复进行用户体验评估；
3. 基于评估结果触发 Agent 的组件优化（LLM、Skill、MCP、Soul、策略）；
4. 维护评估历史数据，用于 Agent 的长期进化追踪；
5. 支持定时评估任务（通过 MQCore Worker 后台执行）。

## 2. 功能设计

### 2.1. 评估 Work Agent（evalWorkAgent）

**功能**：评估 Work Agent 单次执行的质量
**入参**：
- input：EvalWorkAgentInput（继承 Input），包含以下字段：
  - agent_id：被评估的 Agent ID
  - work_id：工作 ID
  - interact_id：交互 ID
  - task_content：该 Agent 的执行任务内容
  - agent_output：Agent 的执行输出
  - trace_id：执行追踪 ID
- context：EvalWorkAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：EvalWorkAgentOutput（继承 Output），承载返回内容：
  - eval_id：评估 ID
  - scores：分项评分
    - correctness：正确性（0-100）
    - completeness：完整性（0-100）
    - efficiency：效率（0-100）：基于 token 用量和迭代次数的效率评分
    - relevance：相关性（0-100）
    - overall：综合评分（0-100）
  - suggestions：优化建议列表
  - need_optimize：是否需要触发优化

**处理流程**：

1. **获取 EvolutorAgent 实例**
   a. 调用 AgentBuilder.buildEvolutorAgent 获取 agent_id（若无则新建）；
   b. 调用 AgentLibrary.getAgent(agent_id) 获取 EvolutorAgent 的完整配置（llm_id、soul_id 等）；

2. **加载评估上下文**
   a. 若 `trace_id` 非空：调用 AgentExecution.getTrace 获取执行追踪详情（含 Think/Act/Reflect/Answer 全链路）；
   b. 调用 InfoCore.context 获取当前 session 的上下文（用于理解任务背景和判断输出相关性）；

3. **执行评估**
   a. 调用 RelationDBProvider.selectOneDB 查询 `evolutor_agent_config` 表获取 `eval_work_prompt_template_id`；
   b. 调用 PromptsProvider.execPrompt 使用 `eval_work_prompt_template_id` 结合 `{ task_content, agent_output, trace, context }` 构建评估 prompt；
   c. 调用 LLMProvider.execLLM 生成五维评分和优化建议（LLM 输出 JSON 格式）；
   d. 解析 LLM 输出，提取 correctness、completeness、efficiency、relevance、overall、suggestions；

4. **计算效率评分**
   a. 若 trace 中包含 token_usage：基于任务复杂度和 token 消耗量计算效率基数；
   b. 若 trace 中包含迭代次数：高迭代次数对应低效率评分（每超过 3 次迭代扣 5 分）；

5. **保存评估结果**
   a. 生成 `eval_id`（UUID）；
   b. 调用 RelationDBProvider.insertDB 将评估结果写入 `agent_evaluation` 表；
   c. 调用 AgentLibrary.updateAgent 将 overall 分数更新到 `agent` 表的 `eval_score` 字段；

6. **判断是否需要优化**
   a. 调用 RelationDBProvider.selectOneDB 查询 `evolutor_agent_config` 表获取 `optimize_threshold`（默认 60）；
   b. 若 overall < optimize_threshold：need_optimize = true；
   c. 若 need_optimize = true：通过 MQProvider.sendMQ 投递优化任务到 `agent.optimize` 队列（异步触发 AgentBuilder.optimizeAgent）；

7. 将评估结果写入 output 返回；

### 2.2. 评估 WriterAgent（evalWriterAgent）

**功能**：评估 WriterAgent 生成的最终回复质量
**入参**：
- input：EvalWriterAgentInput（继承 Input），包含以下字段：
  - agent_id：WriterAgent ID
  - work_id：工作 ID
  - interact_id：交互 ID
  - user_query：原始用户问题
  - final_response：最终回复内容
  - agent_results：上游 Agent 的原始结果汇总
- context：EvalWriterAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：EvalWriterAgentOutput（继承 Output），承载返回内容：
  - eval_id：评估 ID
  - scores：分项评分
    - clarity：清晰度（0-100）
    - informativeness：信息量（0-100）
    - user_alignment：用户对齐度（0-100）：回复是否符合用户预期
    - conciseness：简洁度（0-100）
    - overall：综合评分（0-100）
  - suggestions：优化建议
  - need_optimize：是否需要优化

**处理流程**：

1. 获取 EvolutorAgent 实例（同 evalWorkAgent 步骤 1）；
2. 调用 InfoCore.context 获取对话上下文；
3. 调用 RelationDBProvider.selectOneDB 查询 `evolutor_agent_config` 表获取 `eval_write_prompt_template_id`；
4. 调用 PromptsProvider.execPrompt + LLMProvider.execLLM 生成四维评分和优化建议；
5. 保存评估结果到 `agent_evaluation` 表（eval_type = WRITER）；
6. 若 overall < optimize_threshold：异步触发 WriterAgent 的优化（调整用户画像或 WriterAgent 的 prompt 模板）；
7. 将评估结果写入 output 返回；

### 2.3. 触发定时评估（startEvalSchedule）

**功能**：启动后台定时评估 Worker，定期对近期 Agent 使用记录进行评估
**入参**：
- input：StartEvalScheduleInput（继承 Input），包含以下字段：
  - interval_ms：评估间隔（毫秒，默认 3600000 = 1 小时）
  - eval_batch_size：每批评估数量（默认 20）
- context：StartEvalScheduleContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：StartEvalScheduleOutput（继承 Output），承载返回内容：
  - worker_id：评估 Worker ID

**处理流程**：

1. 调用 MQCore.startWorker 在 `agent.eval_schedule` 队列上启动一个后台评估 Worker；
2. Worker 的轮询逻辑：
   a. 调用 RelationDBProvider.selectDB 查询 `agent_usage` 表，获取最近的尚未评估的 Agent 使用记录（通过 LEFT JOIN `agent_evaluation` 表，evaluation 表无对应记录的视为未评估）；
   b. 对每条未评估记录，调用 evalWorkAgent 进行评估；
   c. 若某 Agent 的 `agent_usage` 表中有新的使用记录 且 累计未评估次数超过 `eval_frequency_threshold`（默认 5 次），将 Agent 的 eval_score 取多次评估的加权平均更新到 `agent` 表；
3. 返回 worker_id 写入 output；

### 2.4. 停止定时评估（stopEvalSchedule）

**功能**：停止后台定时评估 Worker
**入参**：
- input：StopEvalScheduleInput（继承 Input），包含以下字段：
  - worker_id：Worker ID（可选，不传则停止所有评估 Worker）
- context：StopEvalScheduleContext（继承 Context）
- output：StopEvalScheduleOutput（继承 Output）

**处理流程**：

1. 调用 MQCore.stopWorker 停止指定的评估 Worker；
2. 返回 true；

### 2.5. 获取评估历史（getEvaluation）

**功能**：查询 Agent 的评估历史
**入参**：
- input：GetEvaluationInput（继承 Input），包含以下字段：
  - agent_id：Agent ID（可选）
  - eval_type：评估类型（可选：WORK_AGENT / WRITER_AGENT）
  - conditions：额外的 Condition 查询条件（可选）
  - order_by：排序字段（可选，默认 created DESC）
  - page：分页参数（可选）
- context：GetEvaluationContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetEvaluationOutput（继承 Output），承载返回内容：
  - evaluations：评估列表，每项含 { eval_id, agent_id, eval_type, work_id, scores, suggestions, created }

**处理流程**：

1. 构建查询条件（agent_id + eval_type + conditions），调用 RelationDBProvider.selectDB 查询 `agent_evaluation` 表；
2. 将评估列表写入 output 返回；

### 2.6. 获取 Agent 进化报告（getEvolutionReport）

**功能**：生成某个 Agent 的进化报告，展示其评估分数的趋势和组件变更历史
**入参**：
- input：GetEvolutionReportInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - time_range_days：统计天数（默认 30）
- context：GetEvolutionReportContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetEvolutionReportOutput（继承 Output），承载返回内容：
  - report：进化报告
    - agent_id / agent_name / agent_type
    - score_trend：按时间排列的评估分数列表 [{ date, overall, correctness, completeness, ... }]
    - component_changes：组件变更历史 [{ time, component, from, to }]
    - usage_trend：使用频率趋势 [{ date, usage_count }]
    - current_score：当前综合评分
    - evolution_summary：进化总结（LLM 生成的自然语言总结）

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `agent_evaluation` 表，获取指定时间范围内的所有评估记录；
2. 调用 RelationDBProvider.selectDB 查询 `agent_usage` 表，统计每日使用次数；
3. 调用 AgentLibrary.getAgent 获取当前配置；
4. 调用 PromptsProvider.execPrompt + LLMProvider.execLLM 生成 evolution_summary（自然语言）；
5. 组装进化报告写入 output 返回；

### 2.7. 配置（configEvolutorAgent）

**功能**：配置 EvolutorAgent 的参数
**入参**：
- input：ConfigEvolutorAgentInput（继承 Input），包含以下字段：
  - eval_work_prompt_template_id：Work Agent 评估 prompt 模板 ID（可选）
  - eval_write_prompt_template_id：WriterAgent 评估 prompt 模板 ID（可选）
  - optimize_threshold：触发优化的评分阈值（可选，默认 60）
  - eval_frequency_threshold：累计未评估次数阈值（可选，默认 5）
  - eval_schedule_interval_ms：定时评估间隔（可选，默认 3600000）
  - eval_batch_size：每批评估数量（可选，默认 20）
- context：ConfigEvolutorAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigEvolutorAgentOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `evolutor_agent_config` 表获取当前配置；
2. 对每个非空入参进行校验和更新：
   a. prompt_template_id 类：校验 PromptsProvider.soPrompt 中存在；
   b. optimize_threshold：校验为 0-100 整数；
   c. eval_frequency_threshold：校验为正整数；
   d. 其他：校验为正整数；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. 评估记录表

- 表名：agent_evaluation
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| eval_id | 评估 ID | UUID | N | 唯一索引 | |
| agent_id | 被评估的 Agent ID | UUID | N | 普通索引 | |
| eval_type | 评估类型 | VARCHAR | N | 普通索引 | WORK_AGENT / WRITER_AGENT |
| work_id | 工作 ID | UUID | N | | |
| interact_id | 交互 ID | UUID | N | | |
| scores | 评分详情 | TEXT | N | | JSON 格式 |
| suggestions | 优化建议 | TEXT | Y | | JSON 数组 |
| need_optimize | 是否需要优化 | BOOL | N | | |

### 3.2. EvolutorAgent 配置表

- 表名：evolutor_agent_config
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| eval_work_prompt_template_id | 评估 Work Agent 的 prompt 模板 ID | UUID | N | | |
| eval_write_prompt_template_id | 评估 WriterAgent 的 prompt 模板 ID | UUID | N | | |
| optimize_threshold | 触发优化的评分阈值 | INT | N | | 默认 60 |
| eval_frequency_threshold | 累计未评估次数阈值 | INT | N | | 默认 5 |
| eval_schedule_interval_ms | 定时评估间隔（毫秒） | INT | N | | 默认 3600000 |
| eval_batch_size | 每批评估数量 | INT | N | | 默认 20 |

## 实现约定（与代码同步，2026-07-28）

1. **优化决策**：evalWorkAgent/evalWriterAgent 在 need_optimize 时向 MQ `agent.optimize` 发送消息，**不**直接调用 optimizeAgent。
2. **startEvalSchedule**：通过 MQCore.startWorker 启动 `agent.optimize`、`agent.eval`、`agent.eval_schedule` 三类 worker；optimize worker 内调用 AgentBuilder.optimizeAgent。
3. **LLM**：使用 Evolutor 系统 Agent 自身绑定的 llm_id（Core.matchLLM），禁止 llm_model 自选。
4. **stopEvalSchedule**：调用 MQCore.stopWorker(identifier)。
