# Agent 层接口设计

## 1. 接口命名规范

遵循 `_00_DevStandardization.md` 规范：
- 接口名：`动词+名词`，如 `addAgent`、`matchStrategy`
- 返回类型：`Boolean` 表示是否完成执行，结果通过 `output` 参数回传
- 方法签名：`Boolean methodName(Input input, Context context, Output output)`
- 所有 Input 继承 `Input` 基类，所有 Context 继承 `Context` 基类，所有 Output 继承 `Output` 基类
- 所有方法通过 AopProxy 代理增加切面注入，output 自动注入 `elapsed_ms`

## 2. AgentLibrary 接口

### 2.1. addAgent

```
Boolean addAgent(AddAgentInput input, AddAgentContext context, AddAgentOutput output)
```

**Input 字段**：agent_id, agent_type, strategy_id, llm_id, soul_id, task_signature, agent_name

**Output 字段**：agent_id

> Skill/MCP 绑定由 AgentBuilder 在构建阶段通过 SkillCore.optimizeSkill / MCPCore.optimizeMCP 写入 Core 层绑定表。

### 2.2. matchAgent

```
Boolean matchAgent(MatchAgentInput input, MatchAgentContext context, MatchAgentOutput output)
```

**Input 字段**：task_signature, agent_type(可选), similarity_threshold(可选)

**Output 字段**：agent_id, similarity_score

### 2.3. updateAgent

```
Boolean updateAgent(UpdateAgentInput input, UpdateAgentContext context, UpdateAgentOutput output)
```

**Input 字段**：agent_id, agent_name(可选), task_signature(可选), eval_score(可选), enable(可选), strategy_id(可选)

**Output 字段**：无额外字段

> 仅更新 `agent` 表自身字段。LLM/Skill/MCP/Soul 绑定变更统一通过 AgentBuilder.optimizeAgent 调用 Core 层接口完成。

### 2.4. recordAgentUsage

```
Boolean recordAgentUsage(RecordAgentUsageInput input, RecordAgentUsageContext context, RecordAgentUsageOutput output)
```

**Input 字段**：agent_id, work_id, interact_id, usage_context(可选)

**Output 字段**：无额外字段

### 2.5. getAgent

```
Boolean getAgent(GetAgentInput input, GetAgentContext context, GetAgentOutput output)
```

**Input 字段**：agent_id(可选), agent_type(可选), conditions(可选), order_by(可选), page(可选)

**Output 字段**：agents[]（每项含 agent_id, agent_name, agent_type, strategy_id, llm_id, soul_id, task_signature, usage_count, eval_score, enable, created, updated）

### 2.6. ageAgent

```
Boolean ageAgent(AgeAgentInput input, AgeAgentContext context, AgeAgentOutput output)
```

**Input 字段**：无必选字段

**Output 字段**：aged_count

### 2.7. getAgentRule

```
Boolean getAgentRule(GetAgentRuleInput input, GetAgentRuleContext context, GetAgentRuleOutput output)
```

**Input 字段**：conditions(可选), order_by(可选), page(可选)

**Output 字段**：rules[]（每项含 id, days, min_usage_count, min_eval_score）

### 2.8. updateAgentRule

```
Boolean updateAgentRule(UpdateAgentRuleInput input, UpdateAgentRuleContext context, UpdateAgentRuleOutput output)
```

**Input 字段**：operations[]（每项含 type=INSERT/UPDATE/DELETE, id, data={days, min_usage_count, min_eval_score}）

**Output 字段**：无额外字段

### 2.9. configAgentLibrary

```
Boolean configAgentLibrary(ConfigAgentLibraryInput input, ConfigAgentLibraryContext context, ConfigAgentLibraryOutput output)
```

**Input 字段**：prompt_template_id(可选), similarity_threshold(可选), max_agent_count(可选)

**Output 字段**：prompt_template_id, similarity_threshold, max_agent_count

---

## 3. AgentBuilder 接口

### 3.1. buildAgent

```
Boolean buildAgent(BuildAgentInput input, BuildAgentContext context, BuildAgentOutput output)
```

**Input 字段**：interact_id, task_content, task_complexity(可选), task_domain(可选), force_new(可选)

**Output 字段**：agent_id

### 3.2. optimizeAgent

```
Boolean optimizeAgent(OptimizeAgentInput input, OptimizeAgentContext context, OptimizeAgentOutput output)
```

**Input 字段**：agent_id, interact_id, usage_feedback(可选)

**Output 字段**：optimized, changes[]（每项含 component, from, to）

### 3.3. buildPlannerAgent

```
Boolean buildPlannerAgent(BuildPlannerAgentInput input, BuildPlannerAgentContext context, BuildPlannerAgentOutput output)
```

**Input 字段**：force_new(可选)

**Output 字段**：agent_id

### 3.4. buildWriterAgent

```
Boolean buildWriterAgent(BuildWriterAgentInput input, BuildWriterAgentContext context, BuildWriterAgentOutput output)
```

**Input 字段**：force_new(可选)

**Output 字段**：agent_id

### 3.5. buildEvolutorAgent

```
Boolean buildEvolutorAgent(BuildEvolutorAgentInput input, BuildEvolutorAgentContext context, BuildEvolutorAgentOutput output)
```

**Input 字段**：force_new(可选)

**Output 字段**：agent_id

### 3.6. configAgentBuilder

```
Boolean configAgentBuilder(ConfigAgentBuilderInput input, ConfigAgentBuilderContext context, ConfigAgentBuilderOutput output)
```

**Input 字段**：task_analysis_prompt_template_id(可选), default_strategy_id(可选), auto_optimize(可选)

**Output 字段**：task_analysis_prompt_template_id, default_strategy_id, auto_optimize

---

## 4. AgentExecution 接口

### 4.1. execAgent

```
Boolean execAgent(ExecAgentInput input, ExecAgentContext context, ExecAgentOutput output)
```

**Input 字段**：agent_id, work_id, interact_id, task_content, max_iterations(可选)

**Output 字段**：answer, iterations, trace_id, elapsed_ms

### 4.2. execAgentAsync

```
Boolean execAgentAsync(ExecAgentAsyncInput input, ExecAgentAsyncContext context, ExecAgentAsyncOutput output)
```

**Input 字段**：agent_id, work_id, interact_id, task_content, callback_queue(可选), max_iterations(可选)

**Output 字段**：job_id

### 4.3. think

```
Boolean think(ThinkInput input, ThinkContext context, ThinkOutput output)
```

**Input 字段**：agent_id, llm_id, soul_id, context_data, history[], iteration

**Output 字段**：reasoning, next_action, token_usage, elapsed_ms

### 4.4. act

```
Boolean act(ActInput input, ActContext context, ActOutput output)
```

**Input 字段**：agent_id, skill_ids[], mcp_ids[], next_action, context_data

**Output 字段**：result, tool_type, tool_id, elapsed_ms

### 4.5. reflect

```
Boolean reflect(ReflectInput input, ReflectContext context, ReflectOutput output)
```

**Input 字段**：agent_id, llm_id, soul_id, context_data, history[], iteration, max_iterations

**Output 字段**：should_continue, reflection, token_usage, elapsed_ms

### 4.6. answer

```
Boolean answer(AnswerInput input, AnswerContext context, AnswerOutput output)
```

**Input 字段**：agent_id, llm_id, soul_id, history[], context_data, task_content

**Output 字段**：answer, token_usage, elapsed_ms

### 4.7. getTrace

```
Boolean getTrace(GetTraceInput input, GetTraceContext context, GetTraceOutput output)
```

**Input 字段**：trace_id

**Output 字段**：trace（含 trace_id, agent_id, start_time, end_time, total_elapsed_ms, iterations[], total_token_usage）

### 4.8. getExecQueueStatus

```
Boolean getExecQueueStatus(GetExecQueueStatusInput input, GetExecQueueStatusContext context, GetExecQueueStatusOutput output)
```

**Input 字段**：无必选字段

**Output 字段**：queue_stats（pending, processing, completed, failed）, workers[]

### 4.9. configAgentExecution

```
Boolean configAgentExecution(ConfigAgentExecutionInput input, ConfigAgentExecutionContext context, ConfigAgentExecutionOutput output)
```

**Input 字段**：think_prompt_template_id(可选), reflect_prompt_template_id(可选), answer_prompt_template_id(可选), default_max_iterations(可选), async_worker_interval(可选)

**Output 字段**：当前生效的全部配置

---

## 5. AgentStrategy 接口

### 5.1. matchStrategy

```
Boolean matchStrategy(MatchStrategyInput input, MatchStrategyContext context, MatchStrategyOutput output)
```

**Input 字段**：task_content, task_complexity, task_domain

**Output 字段**：strategy_id

### 5.2. getStrategy

```
Boolean getStrategy(GetStrategyInput input, GetStrategyContext context, GetStrategyOutput output)
```

**Input 字段**：strategy_id

**Output 字段**：strategy_id, strategy_label, execution_rule

### 5.3. soStrategy

```
Boolean soStrategy(SoStrategyInput input, SoStrategyContext context, SoStrategyOutput output)
```

**Input 字段**：conditions(可选), order_by(可选), page(可选)

**Output 字段**：strategies[]（每项含 strategy_id, strategy_label, suitable_complexity_min, suitable_complexity_max, suitable_domains, execution_rule, enable, created, updated）

### 5.4. addStrategy

```
Boolean addStrategy(AddStrategyInput input, AddStrategyContext context, AddStrategyOutput output)
```

**Input 字段**：strategy_label, suitable_complexity_min, suitable_complexity_max, suitable_domains, execution_rule

**Output 字段**：strategy_id

### 5.5. updateStrategy

```
Boolean updateStrategy(UpdateStrategyInput input, UpdateStrategyContext context, UpdateStrategyOutput output)
```

**Input 字段**：strategy_id, strategy_label(可选), suitable_complexity_min(可选), suitable_complexity_max(可选), suitable_domains(可选), execution_rule(可选), enable(可选)

**Output 字段**：无额外字段

### 5.6. configAgentStrategy

```
Boolean configAgentStrategy(ConfigAgentStrategyInput input, ConfigAgentStrategyContext context, ConfigAgentStrategyOutput output)
```

**Input 字段**：default_strategy_id(可选), match_prompt_template_id(可选)

**Output 字段**：default_strategy_id, match_prompt_template_id

---

## 6. PlannerAgent 接口

### 6.1. plan

```
Boolean plan(PlanInput input, PlanContext context, PlanOutput output)
```

**Input 字段**：work_id, interact_id, task_content

**Output 字段**：plan_id, task_dag（含 nodes[], edges[]）

### 6.2. replan

```
Boolean replan(ReplanInput input, ReplanContext context, ReplanOutput output)
```

**Input 字段**：plan_id, failed_task_id, failure_reason, completed_task_ids[]

**Output 字段**：new_plan_id, task_dag（含 nodes[], edges[]）

### 6.3. getPlan

```
Boolean getPlan(GetPlanInput input, GetPlanContext context, GetPlanOutput output)
```

**Input 字段**：plan_id(可选), work_id(可选)

**Output 字段**：plans[]（每项含 plan_id, work_id, interact_id, task_dag, parent_plan_id, created）

### 6.4. configPlannerAgent

```
Boolean configPlannerAgent(ConfigPlannerAgentInput input, ConfigPlannerAgentContext context, ConfigPlannerAgentOutput output)
```

**Input 字段**：complexity_decompose_threshold(可选), plan_prompt_template_id(可选), max_subtask_count(可选)

**Output 字段**：当前生效的全部配置

---

## 7. WriterAgent 接口

### 7.1. write

```
Boolean write(WriteInput input, WriteContext context, WriteOutput output)
```

**Input 字段**：work_id, interact_id, user_query, agent_results[]（每项含 agent_id, task_content, result）, user_preferences(可选)

**Output 字段**：response, response_format, token_usage, elapsed_ms

### 7.2. saveUserProfile

```
Boolean saveUserProfile(SaveUserProfileInput input, SaveUserProfileContext context, SaveUserProfileOutput output)
```

**Input 字段**：session_id, language(可选), style(可选), depth(可选), format(可选), additional_preferences(可选)

**Output 字段**：无额外字段

### 7.3. getUserProfile

```
Boolean getUserProfile(GetUserProfileInput input, GetUserProfileContext context, GetUserProfileOutput output)
```

**Input 字段**：session_id

**Output 字段**：user_profile（含 language, style, depth, format, additional_preferences）

### 7.4. configWriterAgent

```
Boolean configWriterAgent(ConfigWriterAgentInput input, ConfigWriterAgentContext context, ConfigWriterAgentOutput output)
```

**Input 字段**：write_prompt_template_id(可选), default_language(可选), default_style(可选), default_depth(可选), default_format(可选)

**Output 字段**：当前生效的全部配置

---

## 8. EvolutorAgent 接口

### 8.1. evalWorkAgent

```
Boolean evalWorkAgent(EvalWorkAgentInput input, EvalWorkAgentContext context, EvalWorkAgentOutput output)
```

**Input 字段**：agent_id, work_id, interact_id, task_content, agent_output, trace_id

**Output 字段**：eval_id, scores（correctness, completeness, efficiency, relevance, overall）, suggestions[], need_optimize

### 8.2. evalWriterAgent

```
Boolean evalWriterAgent(EvalWriterAgentInput input, EvalWriterAgentContext context, EvalWriterAgentOutput output)
```

**Input 字段**：agent_id, work_id, interact_id, user_query, final_response, agent_results[]

**Output 字段**：eval_id, scores（clarity, informativeness, user_alignment, conciseness, overall）, suggestions[], need_optimize

### 8.3. startEvalSchedule

```
Boolean startEvalSchedule(StartEvalScheduleInput input, StartEvalScheduleContext context, StartEvalScheduleOutput output)
```

**Input 字段**：interval_ms(可选), eval_batch_size(可选)

**Output 字段**：worker_id

### 8.4. stopEvalSchedule

```
Boolean stopEvalSchedule(StopEvalScheduleInput input, StopEvalScheduleContext context, StopEvalScheduleOutput output)
```

**Input 字段**：worker_id(可选)

**Output 字段**：无额外字段

### 8.5. getEvaluation

```
Boolean getEvaluation(GetEvaluationInput input, GetEvaluationContext context, GetEvaluationOutput output)
```

**Input 字段**：agent_id(可选), eval_type(可选), conditions(可选), order_by(可选), page(可选)

**Output 字段**：evaluations[]（每项含 eval_id, agent_id, eval_type, work_id, scores, suggestions, created）

### 8.6. getEvolutionReport

```
Boolean getEvolutionReport(GetEvolutionReportInput input, GetEvolutionReportContext context, GetEvolutionReportOutput output)
```

**Input 字段**：agent_id, time_range_days(可选)

**Output 字段**：report（含 agent_id, agent_name, agent_type, score_trend[], component_changes[], usage_trend[], current_score, evolution_summary）

### 8.7. configEvolutorAgent

```
Boolean configEvolutorAgent(ConfigEvolutorAgentInput input, ConfigEvolutorAgentContext context, ConfigEvolutorAgentOutput output)
```

**Input 字段**：eval_work_prompt_template_id(可选), eval_write_prompt_template_id(可选), optimize_threshold(可选), eval_frequency_threshold(可选), eval_schedule_interval_ms(可选), eval_batch_size(可选)

**Output 字段**：当前生效的全部配置

---

## 9. 接口汇总矩阵

| 模块 | 接口数 | 接口列表 |
|------|--------|----------|
| AgentLibrary | 9 | addAgent, matchAgent, updateAgent, recordAgentUsage, getAgent, ageAgent, getAgentRule, updateAgentRule, configAgentLibrary |
| AgentBuilder | 6 | buildAgent, optimizeAgent, buildPlannerAgent, buildWriterAgent, buildEvolutorAgent, configAgentBuilder |
| AgentExecution | 9 | execAgent, execAgentAsync, think, act, reflect, answer, getTrace, getExecQueueStatus, configAgentExecution |
| AgentStrategy | 6 | matchStrategy, getStrategy, soStrategy, addStrategy, updateStrategy, configAgentStrategy |
| PlannerAgent | 4 | plan, replan, getPlan, configPlannerAgent |
| WriterAgent | 4 | write, saveUserProfile, getUserProfile, configWriterAgent |
| EvolutorAgent | 7 | evalWorkAgent, evalWriterAgent, startEvalSchedule, stopEvalSchedule, getEvaluation, getEvolutionReport, configEvolutorAgent |
| **总计** | **45** | |

## 10. Agent 层执行总流程

```
用户请求
  │
  ├── 1. PlannerAgent.plan        — 复杂度判定 + 任务拆解 → 输出 DAG
  │     └── (< 阈值) → 单节点 DAG（跳过拆分）
  │     └── (>= 阈值) → 多节点 DAG
  │
  ├── 2. 上层编排框架              — 遍历 DAG 节点，按依赖关系调度
  │     ├── 对每个节点：
  │     │   ├── AgentBuilder.buildAgent  — 构建/复用 Agent
  │     │   │   ├── AgentLibrary.matchAgent  — 尝试复用
  │     │   │   ├── AgentStrategy.matchStrategy
  │     │   │   ├── LLMCore.matchLLM
  │     │   │   ├── SkillCore.matchSkill
  │     │   │   ├── MCPCore.matchMCP
  │     │   │   ├── SoulCore.matchSoul
  │     │   │   └── AgentLibrary.addAgent  — 注册
  │     │   │
  │     │   └── AgentExecution.execAgent   — 执行 Agent
  │     │       ├── Think  → Act  → Reflect  ⇄  (策略循环)
  │     │       └── Answer
  │     │
  │     └── 上游结果传递给下游 Agent
  │
  ├── 3. WriterAgent.write         — 汇总 → 人性化展示
  │     └── 依赖用户画像
  │
  ├── 4. 返回最终回复给用户
  │
  └── 5. 异步评估与优化（后台）
        ├── EvolutorAgent.evalWorkAgent   — 评估各 Agent
        ├── EvolutorAgent.evalWriterAgent — 评估最终回复
        ├── AgentBuilder.optimizeAgent    — 触发优化
        ├── AgentLibrary.ageAgent         — 老化淘汰
        ├── SkillCore.ageSkill            — 老化 Skill
        └── SoulCore.ageSoul              — 老化 Soul
```
