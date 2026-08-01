# Agent Strategy 模块测试用例

> 模块代码：`brian-backend/Agent/AgentStrategy/`  
> 接口数量：6 个（matchStrategy、getStrategy、soStrategy、addStrategy、updateStrategy、configAgentStrategy）  
> 测试用例总数：28  
> 覆盖目标：100% 接口覆盖，≥80% 场景覆盖

---

## 内置策略说明

框架内置 3 条策略用于开箱即用：

| Label | 复杂度范围 | 模式 | 描述 |
|-------|-----------|------|------|
| CoT | 0–40 | Think → Answer | 单步推理，无工具调用 |
| ReAct | 30–70 | Think → Act → Reflect 循环 → Answer | 迭代推理 + 工具调用 |
| Plan-and-Solve | 60–100 | Plan → Solve(Act/Reflect) → Summary(Answer) | 多阶段复杂任务 |

---

## 1. matchStrategy — 匹配策略

### TC-AS-001: 基础匹配 — task_complexity=20 匹配 CoT

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化（CoT 0–40、ReAct 30–70、Plan-and-Solve 60–100）；无 match_prompt_template |
| **测试步骤** | 调用 matchStrategy（task_complexity=20, task_content='简单问题', task_domain='general'） |
| **预期结果** | output.strategy_id 为 CoT 策略的 ID |
| **覆盖场景** | 复杂度范围匹配 |

### TC-AS-002: task_complexity=50 匹配 ReAct

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化 |
| **测试步骤** | 调用 matchStrategy（task_complexity=50） |
| **预期结果** | output.strategy_id 为 ReAct 策略的 ID |
| **覆盖场景** | 中等复杂度匹配 |

### TC-AS-003: task_complexity=80 匹配 Plan-and-Solve

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化 |
| **测试步骤** | 调用 matchStrategy（task_complexity=80） |
| **预期结果** | output.strategy_id 为 Plan-and-Solve 策略的 ID |
| **覆盖场景** | 高复杂度匹配 |

### TC-AS-004: task_complexity=40 边界 — 两者都覆盖，取最近中点

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化（CoT max=40, ReAct min=30） |
| **测试步骤** | 调用 matchStrategy（task_complexity=40） |
| **预期结果** | output.strategy_id 为 CoT（40 更接近 CoT 的中点 20 而非 ReAct 的中点 50）或按代码逻辑返回确定性结果 |
| **覆盖场景** | 重叠区间边界匹配 |

### TC-AS-005: task_complexity 超出所有策略范围（>100）

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化，最大范围为 Plan-and-Solve 的 max=100 |
| **测试步骤** | 调用 matchStrategy（task_complexity=120） |
| **预期结果** | 可能仍返回 Plan-and-Solve（最接近范围的策略），或返回特定策略 ID（取决于 bounded 逻辑） |
| **覆盖场景** | 超范围边界 |

### TC-AS-006: task_complexity 低于所有策略范围（<0）

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化，最小范围为 CoT 的 min=0 |
| **测试步骤** | 调用 matchStrategy（task_complexity=-10） |
| **预期结果** | 不抛异常，返回一个策略 ID（如 CoT）或 falsy 值 |
| **覆盖场景** | 负值边界 |

### TC-AS-007: 按 task_domain 过滤匹配

| 项 | 内容 |
|---|------|
| **前置条件** | 新增一条域特定的策略（suitable_domains 包含 'math'，complexity 0-100） |
| **测试步骤** | 调用 matchStrategy（task_complexity=50, task_domain='math'） |
| **预期结果** | 优先返回 domain 匹配的策略 |
| **覆盖场景** | domain 过滤 |

### TC-AS-008: 使用 match_prompt_template 做 LLM 精细选择

| 项 | 内容 |
|---|------|
| **前置条件** | agent_strategy_config 中设置了有效的 match_prompt_template_id |
| **测试步骤** | 调用 matchStrategy，确保有多个候选策略进入候选集 |
| **预期结果** | 通过 LLM 匹配选择策略，流程正常完成 |
| **覆盖场景** | LLM 精细匹配路径 |

### TC-AS-009: LLM 匹配失败时回退到中点距离匹配

| 项 | 内容 |
|---|------|
| **前置条件** | match_prompt_template_id 设置但 LLM 调用失败/抛异常 |
| **测试步骤** | 调用 matchStrategy |
| **预期结果** | 回退到中点距离算法匹配，不抛异常 |
| **覆盖场景** | LLM 失败兜底 |

### TC-AS-010: 无任何候选策略时抛异常或返回空

| 项 | 内容 |
|---|------|
| **前置条件** | 删除所有内置策略（enable=0），且无其他策略 |
| **测试步骤** | 调用 matchStrategy（task_complexity=50） |
| **预期结果** | 不抛异常，但可能返回空 strategy_id 或特定错误 |
| **覆盖场景** | 无可用策略 |

---

## 2. getStrategy — 按 ID 查询策略

### TC-AS-011: 按 strategy_id 精确查询

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化 |
| **测试步骤** | 调用 getStrategy（strategy_id=CoT的ID） |
| **预期结果** | output.strategies 长度=1，strategy_label='CoT' |
| **覆盖场景** | 精确查询 |

### TC-AS-012: 查询不存在的 strategy_id

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化 |
| **测试步骤** | 调用 getStrategy（strategy_id='不存在的ID'） |
| **预期结果** | output.strategies 为空数组 `[]` |
| **覆盖场景** | 查询无结果 |

---

## 3. soStrategy — 条件筛选策略

### TC-AS-013: 查询所有已启用的策略

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化（3 条均 enable=1） |
| **测试步骤** | 调用 soStrategy（无参数） |
| **预期结果** | output.strategies 长度=3 |
| **覆盖场景** | 全量查询 |

### TC-AS-014: 按 strategy_label 筛选

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化 |
| **测试步骤** | 调用 soStrategy（conditions=[{field:'strategy_label',op:EQ,value:'ReAct'}]） |
| **预期结果** | output.strategies 长度=1，label='ReAct' |
| **覆盖场景** | label 筛选 |

### TC-AS-015: 按 enable 状态筛选

| 项 | 内容 |
|---|------|
| **前置条件** | 禁用一条策略 |
| **测试步骤** | 调用 soStrategy（conditions=[{field:'enable',op:EQ,value:0}]） |
| **预期结果** | output.strategies 仅包含被禁用的策略 |
| **覆盖场景** | enable 筛选 |

### TC-AS-016: 分页 + 排序查询

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化（3 条） |
| **测试步骤** | 调用 soStrategy（page={current:1,size:2}, order_by=[{field:'suitable_complexity_min',direction:'ASC'}]） |
| **预期结果** | output.strategies 长度=2，按 complexity_min 升序 |
| **覆盖场景** | 分页 + 排序 |

---

## 4. addStrategy — 新增策略

### TC-AS-017: 正常新增一条自定义策略

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化 |
| **测试步骤** | 调用 addStrategy（strategy_label='CustomStrategy', suitable_complexity_min=20, suitable_complexity_max=60, execution_rule=有效的 JSON 执行规则） |
| **预期结果** | 新增成功，enable=1 |
| **覆盖场景** | 自定义策略新增 |

### TC-AS-018: strategy_label 重复时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化（label 'CoT' 已存在） |
| **测试步骤** | 调用 addStrategy（strategy_label='CoT'） |
| **预期结果** | 抛出 `ValidationError`，消息包含 label 已存在 |
| **覆盖场景** | label 唯一性校验 |

### TC-AS-019: execution_rule 不是合法 JSON 结构时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化 |
| **测试步骤** | 调用 addStrategy（execution_rule='not a json'） |
| **预期结果** | 抛出 `ValidationError`，消息涉及 execution_rule 格式校验 |
| **覆盖场景** | JSON 规则校验 |

### TC-AS-020: execution_rule 缺少 steps/phases 关键字时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化 |
| **测试步骤** | 调用 addStrategy（execution_rule='{"invalid_key":[]}'） |
| **预期结果** | 抛出 `ValidationError`（因为既无 steps 也无 phases） |
| **覆盖场景** | 执行规则结构校验 |

### TC-AS-021: execution_rule 为 steps 模式

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化 |
| **测试步骤** | 调用 addStrategy（execution_rule='{"steps":[{"type":"Think"},{"type":"Answer"}],"max_iterations":10}'） |
| **预期结果** | 新增成功 |
| **覆盖场景** | steps 模式策略 |

### TC-AS-022: execution_rule 为 phases 模式（Plan-and-Solve 风格）

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化 |
| **测试步骤** | 调用 addStrategy（execution_rule='{"phases":[{"name":"plan","steps":[{"type":"Think"}]},{"name":"solve","steps":[{"type":"Act"},{"type":"Reflect"}],"sub_steps":true},{"name":"summary","steps":[{"type":"Answer"}]}]}'） |
| **预期结果** | 新增成功 |
| **覆盖场景** | phases 模式策略 |

---

## 5. updateStrategy — 更新策略

### TC-AS-023: 更新 strategy_label

| 项 | 内容 |
|---|------|
| **前置条件** | 存在一条自定义策略 |
| **测试步骤** | 调用 updateStrategy（strategy_id, strategy_label='UpdatedLabel'） |
| **预期结果** | label 更新成功 |
| **覆盖场景** | label 更新 |

### TC-AS-024: 更新 complexity 范围

| 项 | 内容 |
|---|------|
| **前置条件** | 存在一条自定义策略 |
| **测试步骤** | 调用 updateStrategy（suitable_complexity_min=10, suitable_complexity_max=50） |
| **预期结果** | complexity 范围更新 |
| **覆盖场景** | 范围更新 |

### TC-AS-025: 更新 enable 状态

| 项 | 内容 |
|---|------|
| **前置条件** | 存在一条策略 |
| **测试步骤** | 调用 updateStrategy（enable=false） |
| **预期结果** | enable=0，该策略不再参与匹配 |
| **覆盖场景** | 禁用/启用策略 |

### TC-AS-026: 更新 execution_rule

| 项 | 内容 |
|---|------|
| **前置条件** | 存在一条自定义策略 |
| **测试步骤** | 调用 updateStrategy（execution_rule='{"steps":[{"type":"Think"},{"type":"Act"},{"type":"Reflect"},{"type":"Answer"}],"max_iterations":20}'） |
| **预期结果** | execution_rule 更新成功 |
| **覆盖场景** | 规则更新 |

### TC-AS-027: 更新不存在的策略抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 不存在该 strategy_id |
| **测试步骤** | 调用 updateStrategy（strategy_id='不存在的ID'） |
| **预期结果** | 抛出 `NotFoundError` |
| **覆盖场景** | 无效策略更新 |

---

## 6. configAgentStrategy — 配置策略模块

### TC-AS-028: 首次配置写入默认值

| 项 | 内容 |
|---|------|
| **前置条件** | agent_strategy_config 表为空 |
| **测试步骤** | 调用 configAgentStrategy（不传参数） |
| **预期结果** | 配置被初始化，default_strategy_id 为第一个默认策略的 ID |
| **覆盖场景** | 默认初始化 |

### TC-AS-029: 更新 default_strategy_id（需校验策略存在）

| 项 | 内容 |
|---|------|
| **前置条件** | 默认策略已初始化 |
| **测试步骤** | 调用 configAgentStrategy（default_strategy_id=ReAct的ID） |
| **预期结果** | default_strategy_id 更新 |
| **覆盖场景** | 默认策略切换 |

### TC-AS-030: 更新 match_prompt_template_id

| 项 | 内容 |
|---|------|
| **前置条件** | PromptsAccess 中存在有效 prompt ID |
| **测试步骤** | 调用 configAgentStrategy（match_prompt_template_id=有效ID） |
| **预期结果** | match_prompt_template_id 更新 |
| **覆盖场景** | prompt 模板配置 |

### TC-AS-031: 配置无效 default_strategy_id 时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 策略表中不存在该默认策略 |
| **测试步骤** | 调用 configAgentStrategy（default_strategy_id='不存在的ID'） |
| **预期结果** | 抛出 `ValidationError` |
| **覆盖场景** | 外键校验 |

---

## 附录：内置策略 execution_rule 参考

### CoT
```json
{"steps":[{"type":"Think"},{"type":"Answer"}],"max_iterations":1}
```

### ReAct
```json
{"steps":[{"type":"Think"},{"type":"Act"},{"type":"Reflect","condition":"should_continue","true_next":"Think","false_next":"Answer"},{"type":"Answer"}],"max_iterations":10}
```

### Plan-and-Solve
```json
{"phases":[{"name":"plan","steps":[{"type":"Think"}]},{"name":"solve","steps":[{"type":"Act"},{"type":"Reflect"}],"sub_steps":true},{"name":"summary","steps":[{"type":"Answer"}]}]}
```
