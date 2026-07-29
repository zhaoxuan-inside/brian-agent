# Agent Builder 模块测试用例

> 模块代码：`brian-backend/Agent/AgentBuilder/`  
> 接口数量：6 个（buildAgent、optimizeAgent、buildPlannerAgent、buildWriterAgent、buildEvolutorAgent、configAgentBuilder）  
> 测试用例总数：32  
> 覆盖目标：100% 接口覆盖，≥80% 场景覆盖

---

## 1. buildAgent — 构建 Work Agent

### TC-AB-001: 首次构建 — 完整组装新 Agent

| 项 | 内容 |
|---|------|
| **前置条件** | AgentLibrary 中无匹配的 Agent；AgentStrategy 有可用策略；所有 Core 层 match 正常返回 |
| **测试步骤** | 调用 buildAgent（interact_id、task_content='编写排序算法'、task_domain='coding'） |
| **预期结果** | 成功返回 agent_id；agent 表新增 WORKER 记录（含 strategy_id、llm_id、soul_id）；Skill/MCP/Soul Core 的 opt* 被调用 |
| **覆盖场景** | 新 Agent 的完整组装流程 |

### TC-AB-002: 已有匹配 Agent — 复用现有 Agent

| 项 | 内容 |
|---|------|
| **前置条件** | AgentLibrary 中已有 WORKER Agent（task_signature 与新任务高相似度） |
| **测试步骤** | 调用 buildAgent（task_content 与现有 Agent 签名相似的任务） |
| **预期结果** | 返回现有 Agent 的 agent_id；agent 表 Agent 数量不变；recordAgentUsage 被调用 |
| **覆盖场景** | Agent 复用机制 |

### TC-AB-003: force_new=true — 强制创建新 Agent 跳过匹配

| 项 | 内容 |
|---|------|
| **前置条件** | AgentLibrary 中有可复用的 Agent |
| **测试步骤** | 调用 buildAgent（force_new=true, task_content 与现有 Agent 签名相似） |
| **预期结果** | 返回全新的 agent_id（不同于已有 Agent）；不调用 recordAgentUsage |
| **覆盖场景** | 强制新建 |

### TC-AB-004: force_new=false（或不传）— 优先尝试匹配

| 项 | 内容 |
|---|------|
| **前置条件** | AgentLibrary 中有可复用的 Agent |
| **测试步骤** | 调用 buildAgent（不传 force_new 或 force_new=false） |
| **预期结果** | 优先尝试 matchAgent，匹配成功则复用 |
| **覆盖场景** | 默认行为 |

### TC-AB-005: task_complexity 和 task_domain 自动推断

| 项 | 内容 |
|---|------|
| **前置条件** | agent_builder_config 中配置了 task_analysis_prompt_template_id，LLM 可正常返回 analysis JSON |
| **测试步骤** | 调用 buildAgent（不传入 task_complexity 和 task_domain） |
| **预期结果** | 通过 LLM 分析任务提取 complexity、domain、signature；默认 complexity=50、domain='general' |
| **覆盖场景** | LLM 任务分析 |

### TC-AB-006: LLM 任务分析失败时的兜底

| 项 | 内容 |
|---|------|
| **前置条件** | task_analysis_prompt_template_id 已配置但 LLM 调用失败/抛异常 |
| **测试步骤** | 调用 buildAgent |
| **预期结果** | 使用 buildTaskSignature 生成的默认签名（domain='general'、complexity=50 或传入值），流程继续 |
| **覆盖场景** | 任务分析兜底 |

### TC-AB-007: 匹配 Strategy 失败时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | AgentStrategy 的 matchStrategy 返回空 strategy_id |
| **测试步骤** | 调用 buildAgent（force_new=true） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "Failed to match strategy" |
| **覆盖场景** | 策略匹配失败 |

### TC-AB-008: addAgent 失败时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | AgentLibrary.addAgent 因为某种原因返回 false |
| **测试步骤** | 调用 buildAgent（force_new=true） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "addAgent failed" |
| **覆盖场景** | Agent 入库失败 |

### TC-AB-009: Core 层 matchLLM 返回空时的处理

| 项 | 内容 |
|---|------|
| **前置条件** | 模拟 llmCore.matchLLM 返回空的 llm_id |
| **测试步骤** | 调用 buildAgent（force_new=true） |
| **预期结果** | Agent 的 llm_id 为 analysisLlm 或空字符串，流程完成 |
| **覆盖场景** | LLM 匹配空结果 |

### TC-AB-010: Skill/MCP/Soul 匹配结果为空列表时正常完成

| 项 | 内容 |
|---|------|
| **前置条件** | skillCore.matchSkill 返回空 skills 列表、mcpCore.matchMCP 返回空 mcp_ids、soulCore.matchSoul 返回空 soul_id |
| **测试步骤** | 调用 buildAgent（force_new=true） |
| **预期结果** | 不抛异常，不会调用 optSkill/optMCP/optSoul（因为遍历空数组） |
| **覆盖场景** | 可选绑定为空 |

### TC-AB-011: 任务分析 prompt 配置不存在时使用默认逻辑

| 项 | 内容 |
|---|------|
| **前置条件** | agent_builder_config 的 task_analysis_prompt_template_id 为空 |
| **测试步骤** | 调用 buildAgent |
| **预期结果** | 跳过 LLM 分析，直接使用 task_content + domain 构建签名，complexity 使用传入值或默认 50 |
| **覆盖场景** | 无分析 prompt |

### TC-AB-012: 多 Skill 绑定 — SkillCore.optSkill 被分别调用

| 项 | 内容 |
|---|------|
| **前置条件** | skillCore.matchSkill 返回 3 个 skills |
| **测试步骤** | 调用 buildAgent（force_new=true） |
| **预期结果** | skillCore.optSkill 被调用 3 次（每个 skill 一次） |
| **覆盖场景** | 多 Skill 绑定 |

---

## 2. optimizeAgent — 优化 Agent 配置

### TC-AB-013: Agent 存在时重新匹配策略并发现变更

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在 WORKER Agent（strategy_id='old-strategy'）；AgentStrategy.matchStrategy 返回不同的 strategy_id |
| **测试步骤** | 调用 optimizeAgent（agent_id, interact_id） |
| **预期结果** | output.optimized=true；output.changes 包含 strategy 变更记录（from='old-strategy', to=new ID）；Agent 的 strategy_id 更新 |
| **覆盖场景** | 策略优化 |

### TC-AB-014: Agent 配置无需优化时 optimized=false

| 项 | 内容 |
|---|------|
| **前置条件** | 所有 Core 重新匹配返回的结果与 Agent 当前配置一致 |
| **测试步骤** | 调用 optimizeAgent |
| **预期结果** | output.optimized=false；output.changes 为空数组 |
| **覆盖场景** | 无需优化 |

### TC-AB-015: LLM 绑定优化

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 当前 llm_id='old-llm'；llmCore.matchLLM 返回不同的 llm_id |
| **测试步骤** | 调用 optimizeAgent |
| **预期结果** | output.changes 包含 component='llm' 的变更；Agent llm_id 更新 |
| **覆盖场景** | LLM 组件优化 |

### TC-AB-016: Soul 绑定优化

| 项 | 内容 |
|---|------|
| **前置条件** | soulCore.optSoul 返回新的 current_soul_id 且不同于当前值 |
| **测试步骤** | 调用 optimizeAgent |
| **预期结果** | output.changes 包含 component='soul' 的变更；Agent soul_id 更新 |
| **覆盖场景** | Soul 组件优化 |

### TC-AB-017: Skill 绑定优化

| 项 | 内容 |
|---|------|
| **前置条件** | skillCore.matchSkill 返回新的 skills 列表 |
| **测试步骤** | 调用 optimizeAgent |
| **预期结果** | output.changes 中包含 component='skill' 的变更（每个 skill 一条记录）；Core optSkill 被调用 |
| **覆盖场景** | Skill 组件优化 |

### TC-AB-018: MCP 绑定优化

| 项 | 内容 |
|---|------|
| **前置条件** | mcpCore.matchMCP 返回新的 mcp_ids 列表 |
| **测试步骤** | 调用 optimizeAgent |
| **预期结果** | output.changes 中包含 component='mcp' 的变更（每个 mcp_id 一条记录）；Core optMCP 被调用 |
| **覆盖场景** | MCP 组件优化 |

### TC-AB-019: 不存在的 Agent 抛 NotFoundError

| 项 | 内容 |
|---|------|
| **前置条件** | AgentLibrary 中无该 Agent |
| **测试步骤** | 调用 optimizeAgent（agent_id='不存在的ID'） |
| **预期结果** | 抛出 `NotFoundError` |
| **覆盖场景** | 无效 Agent |

### TC-AB-020: usage_feedback 传入用于策略匹配

| 项 | 内容 |
|---|------|
| **前置条件** | 存在 Agent |
| **测试步骤** | 调用 optimizeAgent（usage_feedback='某具体反馈内容'） |
| **预期结果** | matchStrategy 使用 usage_feedback 而不是 agent.task_signature 进行匹配 |
| **覆盖场景** | 反馈驱动优化 |

---

## 3. buildPlannerAgent — 构建 Planner 系统 Agent

### TC-AB-021: 首次构建 — 创建新的 Planner Agent

| 项 | 内容 |
|---|------|
| **前置条件** | 库中无 PLANNER Agent |
| **测试步骤** | 调用 buildPlannerAgent |
| **预期结果** | 创建新的 PLANNER Agent（agent_type='PLANNER'）；strategy_label 为 'Plan-and-Solve'；task_signature 为 '[planner] planner' |
| **覆盖场景** | Planner 首次创建 |

### TC-AB-022: 已有 Planner Agent 时复用

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 enabled PLANNER Agent |
| **测试步骤** | 调用 buildPlannerAgent（不传 force_new 或 force_new=false） |
| **预期结果** | 返回已存在的 Planner agent_id，不创建新 Agent |
| **覆盖场景** | Planner 复用 |

### TC-AB-023: force_new=true 时强制新建

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 PLANNER Agent |
| **测试步骤** | 调用 buildPlannerAgent（force_new=true） |
| **预期结果** | 创建新的 PLANNER Agent，agent_id 不同于已有 Agent |
| **覆盖场景** | Planner 强制新建 |

### TC-AB-024: Plan-and-Solve 策略不存在时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 策略表中无 'Plan-and-Solve' label 的启用策略 |
| **测试步骤** | 调用 buildPlannerAgent（force_new=true） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "strategy not found: Plan-and-Solve" |
| **覆盖场景** | 预定义策略缺失 |

---

## 4. buildWriterAgent — 构建 Writer 系统 Agent

### TC-AB-025: 首次构建 — 创建新的 Writer Agent

| 项 | 内容 |
|---|------|
| **前置条件** | 库中无 WRITER Agent |
| **测试步骤** | 调用 buildWriterAgent |
| **预期结果** | 创建新的 WRITER Agent（agent_type='WRITER'）；strategy_label 为 'CoT'；task_signature 为 '[writer] writer' |
| **覆盖场景** | Writer 首次创建 |

### TC-AB-026: 已有 Writer Agent 时复用

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 enabled WRITER Agent |
| **测试步骤** | 调用 buildWriterAgent |
| **预期结果** | 返回已存在的 Writer agent_id |
| **覆盖场景** | Writer 复用 |

### TC-AB-027: CoT 策略不存在时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 策略表中无 'CoT' label 的启用策略 |
| **测试步骤** | 调用 buildWriterAgent（force_new=true） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "strategy not found: CoT" |
| **覆盖场景** | Writer 策略缺失 |

---

## 5. buildEvolutorAgent — 构建 Evolutor 系统 Agent

### TC-AB-028: 首次构建 — 创建新的 Evolutor Agent

| 项 | 内容 |
|---|------|
| **前置条件** | 库中无 EVOLUTOR Agent |
| **测试步骤** | 调用 buildEvolutorAgent |
| **预期结果** | 创建新的 EVOLUTOR Agent（agent_type='EVOLUTOR'）；strategy_label 为 'ReAct'；task_signature 为 '[evolutor] evolutor' |
| **覆盖场景** | Evolutor 首次创建 |

### TC-AB-029: 已有 Evolutor Agent 时复用

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 enabled EVOLUTOR Agent |
| **测试步骤** | 调用 buildEvolutorAgent |
| **预期结果** | 返回已存在的 Evolutor agent_id |
| **覆盖场景** | Evolutor 复用 |

### TC-AB-030: ReAct 策略不存在时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 策略表中无 'ReAct' label 的启用策略 |
| **测试步骤** | 调用 buildEvolutorAgent（force_new=true） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "strategy not found: ReAct" |
| **覆盖场景** | Evolutor 策略缺失 |

---

## 6. configAgentBuilder — 配置 AgentBuilder

### TC-AB-031: 首次配置写入默认值

| 项 | 内容 |
|---|------|
| **前置条件** | agent_builder_config 表为空 |
| **测试步骤** | 调用 configAgentBuilder（不传参数） |
| **预期结果** | 配置初始化：auto_optimize=true、task_analysis_prompt_template_id=''、default_strategy_id='' |
| **覆盖场景** | 默认配置初始化 |

### TC-AB-032: 更新 task_analysis_prompt_template_id（校验 prompt 存在）

| 项 | 内容 |
|---|------|
| **前置条件** | agent_builder_config 已初始化；PromptsAccess 中存在有效 prompt |
| **测试步骤** | 调用 configAgentBuilder（task_analysis_prompt_template_id=有效promptID） |
| **预期结果** | 配置更新；prompt_analysis_prompt_template_id 变更 |
| **覆盖场景** | prompt ID 配置 + 外键校验 |

### TC-AB-033: task_analysis_prompt_template_id 不存在时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | PromptsAccess 中不存在该 prompt |
| **测试步骤** | 调用 configAgentBuilder（task_analysis_prompt_template_id='不存在的ID'） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "prompt_template_id 不存在" |
| **覆盖场景** | 外键校验 |

### TC-AB-034: 更新 default_strategy_id

| 项 | 内容 |
|---|------|
| **前置条件** | agent_builder_config 已初始化；存在有效的策略 |
| **测试步骤** | 调用 configAgentBuilder（default_strategy_id=有效策略ID） |
| **预期结果** | default_strategy_id 更新 |
| **覆盖场景** | 默认策略配置 |

### TC-AB-035: default_strategy_id 无效时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 策略表中无此策略 |
| **测试步骤** | 调用 configAgentBuilder（default_strategy_id='不存在的ID'） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "default_strategy_id 不存在" |
| **覆盖场景** | 策略外键校验 |

### TC-AB-036: 更新 auto_optimize 开关

| 项 | 内容 |
|---|------|
| **前置条件** | agent_builder_config 已初始化（auto_optimize=true） |
| **测试步骤** | 调用 configAgentBuilder（auto_optimize=false） |
| **预期结果** | auto_optimize 变为 0/false |
| **覆盖场景** | 优化开关配置 |
