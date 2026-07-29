# Agent Library 模块测试用例

> 模块代码：`brian-backend/Agent/AgentLibrary/`  
> 接口数量：9 个（addAgent、matchAgent、updateAgent、recordAgentUsage、getAgent、ageAgent、getAgentRule、updateAgentRule、configAgentLibrary）  
> 测试用例总数：45  
> 覆盖目标：100% 接口覆盖，≥80% 场景覆盖

---

## 1. addAgent — 新增 Agent

### TC-AL-001: 正常新增一个 WORKER Agent

| 项 | 内容 |
|---|------|
| **前置条件** | 数据库已初始化，Agent 表为空 |
| **测试步骤** | 构造 AddAgentInput（agent_id、agent_type='WORKER'、strategy_id、llm_id、soul_id、task_signature、agent_name），调用 addAgent |
| **预期结果** | 返回 `true`，output.agent_id 等于 input.agent_id；数据库 agent 表存在该记录，usage_count=0、eval_score=50、enable=1 |
| **覆盖场景** | 基础新增流程 |

### TC-AL-002: 新增 PLANNER Agent

| 项 | 内容 |
|---|------|
| **前置条件** | 数据库已初始化 |
| **测试步骤** | 以 agent_type='PLANNER' 调用 addAgent |
| **预期结果** | 成功插入，agent_type 字段为 'PLANNER' |
| **覆盖场景** | 系统 Agent 类型 |

### TC-AL-003: 新增 WRITER Agent

| 项 | 内容 |
|---|------|
| **前置条件** | 数据库已初始化 |
| **测试步骤** | 以 agent_type='WRITER' 调用 addAgent |
| **预期结果** | 成功插入，agent_type 字段为 'WRITER' |
| **覆盖场景** | 系统 Agent 类型 |

### TC-AL-004: 新增 EVOLUTOR Agent

| 项 | 内容 |
|---|------|
| **前置条件** | 数据库已初始化 |
| **测试步骤** | 以 agent_type='EVOLUTOR' 调用 addAgent |
| **预期结果** | 成功插入，agent_type 字段为 'EVOLUTOR' |
| **覆盖场景** | 全部有效类型枚举 |

### TC-AL-005: agent_id 为空时抛 ValidationError

| 项 | 内容 |
|---|------|
| **前置条件** | 数据库已初始化 |
| **测试步骤** | 设置 agent_id=''，调用 addAgent |
| **预期结果** | 抛出 `ValidationError`，消息包含 "agent_id 为必填" |
| **覆盖场景** | 必填字段校验 |

### TC-AL-006: agent_type 为非法值时抛 ValidationError

| 项 | 内容 |
|---|------|
| **前置条件** | 数据库已初始化 |
| **测试步骤** | 设置 agent_type='INVALID_TYPE'，调用 addAgent |
| **预期结果** | 抛出 `ValidationError`，消息包含 "invalid agent_type" |
| **覆盖场景** | 类型枚举校验 |

### TC-AL-007: strategy_id 为空时抛 ValidationError

| 项 | 内容 |
|---|------|
| **前置条件** | 数据库已初始化 |
| **测试步骤** | 设置 strategy_id=''，调用 addAgent |
| **预期结果** | 抛出 `ValidationError`，消息包含 "strategy_id 为必填" |
| **覆盖场景** | 必填字段校验 |

### TC-AL-008: 可选字段为空时的默认行为（llm_id/soul_id/agent_name 未提供）

| 项 | 内容 |
|---|------|
| **前置条件** | 数据库已初始化 |
| **测试步骤** | 不传入 llm_id、soul_id、agent_name、task_signature 字段，调用 addAgent |
| **预期结果** | 成功插入，llm_id=''，soul_id=''，agent_name 自动生成（'Agent-' + 前8位），task_signature='' |
| **覆盖场景** | 可选字段默认值 |

### TC-AL-009: agent_name 自定义

| 项 | 内容 |
|---|------|
| **前置条件** | 数据库已初始化 |
| **测试步骤** | 传入 agent_name='我的自定义Agent' |
| **预期结果** | 数据库中 agent_name 为指定值 |
| **覆盖场景** | 自定义名称 |

---

## 2. matchAgent — Agent 匹配

### TC-AL-010: 无候选 Agent 时返回空

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 表为空 |
| **测试步骤** | 调用 matchAgent（task_signature='任意任务'） |
| **预期结果** | 返回 `true`，output.agent_id=''、similarity_score=0 |
| **覆盖场景** | 空库匹配 |

### TC-AL-011: 有候选 Agent 且简单相似度超阈值匹配成功

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个开启的 WORKER Agent（task_signature='[coding] write a function'），config 中 prompt_template_id 为空（回退到简单相似度），similarity_threshold=0.3 |
| **测试步骤** | 调用 matchAgent（task_signature='[coding] write a function to sort'） |
| **预期结果** | output.agent_id 不为空，similarity_score >= 0.3 |
| **覆盖场景** | 简单相似度匹配 |

### TC-AL-012: 简单相似度低于阈值时不匹配

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 Agent（task_signature='[cooking] make pasta'），similarity_threshold=0.8 |
| **测试步骤** | 调用 matchAgent（task_signature='[coding] write code'） |
| **预期结果** | output.agent_id=''，similarity_score < 0.8 |
| **覆盖场景** | 阈值过滤 |

### TC-AL-013: LLM 匹配成功时返回 Agent

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在多个开启的 WORKER Agent（其中一个绑定了 llm_id），config 中有 prompt_template_id 指向有效 prompt、LLMAccess 可正常调用并返回 `{"agent_id":"xxx","score":0.9}` |
| **测试步骤** | 调用 matchAgent |
| **预期结果** | LLM 匹配流程被触发，返回匹配到的 agent_id 和 score |
| **覆盖场景** | LLM 匹配路径 |

### TC-AL-014: LLM 匹配返回的 agent 已禁用时不采用

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 返回的 agent_id 对应的 Agent 在数据库中 enable=0 |
| **测试步骤** | 调用 matchAgent |
| **预期结果** | 该 LLM 匹配结果被跳过，回退到简单相似度或返回不匹配 |
| **覆盖场景** | 匹配结果二次校验 |

### TC-AL-015: 按 agent_type 过滤候选集

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在 WORKER 和 WRITER 两类 Agent，均开启 |
| **测试步骤** | 调用 matchAgent（agent_type='WRITER'） |
| **预期结果** | 仅从 agent_type='WRITER' 的 Agent 中匹配 |
| **覆盖场景** | 类型过滤匹配 |

### TC-AL-016: 传入自定义 similarity_threshold 覆盖配置默认值

| 项 | 内容 |
|---|------|
| **前置条件** | 注入一个 Agent（task_signature 含有部分相同词），config.similarity_threshold=0.5 |
| **测试步骤** | 调用 matchAgent（task_signature 有 30% 相似，similarity_threshold=0.2） |
| **预期结果** | 使用 0.2 阈值匹配成功 |
| **覆盖场景** | Input 阈值覆盖 config |

### TC-AL-017: 禁用 Agent 不出现在候选集中

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 enable=0 的 Agent（其他条件满足匹配） |
| **测试步骤** | 调用 matchAgent |
| **预期结果** | 该 Agent 不被纳入候选，不会匹配到 |
| **覆盖场景** | enable 过滤 |

### TC-AL-018: LLM 调用失败时回退到简单相似度

| 项 | 内容 |
|---|------|
| **前置条件** | 配置中设置了 prompt_template_id 但 LLMAccess 调用返回 `false` 或抛异常 |
| **测试步骤** | 调用 matchAgent，确保有可匹配的候选 |
| **预期结果** | 回退到简单相似度匹配，不抛异常 |
| **覆盖场景** | LLM 失败兜底 |

---

## 3. updateAgent — 更新 Agent

### TC-AL-019: 更新 agent_name

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 Agent（agent_id='test-agent'） |
| **测试步骤** | 调用 updateAgent（agent_id='test-agent'，agent_name='新名称'） |
| **预期结果** | 数据库中 agent_name 更新为 '新名称'，updated 时间戳变化 |
| **覆盖场景** | 单个字段更新 |

### TC-AL-020: 更新 eval_score（合法范围）

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 Agent |
| **测试步骤** | 调用 updateAgent（eval_score=85） |
| **预期结果** | eval_score 更新为 85 |
| **覆盖场景** | 评分更新 |

### TC-AL-021: eval_score 为 0（边界值）

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 Agent |
| **测试步骤** | 调用 updateAgent（eval_score=0） |
| **预期结果** | eval_score 更新为 0 |
| **覆盖场景** | 评分下边界 |

### TC-AL-022: eval_score 为 100（边界值）

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 Agent |
| **测试步骤** | 调用 updateAgent（eval_score=100） |
| **预期结果** | eval_score 更新为 100 |
| **覆盖场景** | 评分上边界 |

### TC-AL-023: eval_score 超出范围（<0）抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 Agent |
| **测试步骤** | 调用 updateAgent（eval_score=-1） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "eval_score 必须在 0-100 之间" |
| **覆盖场景** | 评分范围校验下界 |

### TC-AL-024: eval_score 超出范围（>100）抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 Agent |
| **测试步骤** | 调用 updateAgent（eval_score=101） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "eval_score 必须在 0-100 之间" |
| **覆盖场景** | 评分范围校验上界 |

### TC-AL-025: 更新 enable 状态（启用 -> 禁用）

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 enable=true 的 Agent |
| **测试步骤** | 调用 updateAgent（enable=false） |
| **预期结果** | enable 变为 0/false |
| **覆盖场景** | 禁用一个 Agent |

### TC-AL-026: 更新 enable 状态（禁用 -> 启用）

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 enable=false 的 Agent |
| **测试步骤** | 调用 updateAgent（enable=true） |
| **预期结果** | enable 变为 1/true |
| **覆盖场景** | 重新启用 Agent |

### TC-AL-027: 更新不存在的 Agent 抛 NotFoundError

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 表中无 target_id |
| **测试步骤** | 调用 updateAgent（agent_id='不存在的ID'） |
| **预期结果** | 抛出 `NotFoundError`，消息包含 'Agent' 和 agent_id |
| **覆盖场景** | 不存在的 Agent |

### TC-AL-028: 同时更新多个字段

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 Agent |
| **测试步骤** | 调用 updateAgent（agent_name='新名'、task_signature='新签名'、strategy_id='新策略'、llm_id='新LLM'、soul_id='新Soul'） |
| **预期结果** | 所有字段均更新，updated 时间戳变化 |
| **覆盖场景** | 批量更新 |

---

## 4. recordAgentUsage — 记录 Agent 使用

### TC-AL-029: 正常记录使用并自增 usage_count

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 Agent（usage_count=0） |
| **测试步骤** | 调用 recordAgentUsage（agent_id、work_id、interact_id） |
| **预期结果** | agent_usage 表新增一条记录（含 work_id、interact_id、usage_context=''）；agent 表 usage_count 变为 1 |
| **覆盖场景** | 基础使用记录 |

### TC-AL-030: agent_id 为空抛 ValidationError

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 recordAgentUsage（agent_id=''） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "agent_id 为必填" |
| **覆盖场景** | 必填校验 |

### TC-AL-031: Agent 不存在时抛 NotFoundError

| 项 | 内容 |
|---|------|
| **前置条件** | Agent 表中无此 agent_id |
| **测试步骤** | 调用 recordAgentUsage（agent_id='不存在的ID'） |
| **预期结果** | 抛出 `NotFoundError` |
| **覆盖场景** | 无效 Agent |

### TC-AL-032: 多次使用后 usage_count 持续递增

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 Agent（usage_count=0） |
| **测试步骤** | 连续 3 次调用 recordAgentUsage |
| **预期结果** | agent_usage 表有 3 条记录；agent 表 usage_count=3 |
| **覆盖场景** | usage_count 累加 |

### TC-AL-033: usage_context 传入自定义内容

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一个 Agent |
| **测试步骤** | 调用 recordAgentUsage（usage_context='{"feedback":"good"}'） |
| **预期结果** | agent_usage 表 usage_context 字段为指定 JSON 字符串 |
| **覆盖场景** | 上下文记录 |

---

## 5. getAgent — 查询 Agent

### TC-AL-034: 按 agent_id 精确查询

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在 Agent（agent_id='qa-1'） |
| **测试步骤** | 调用 getAgent（agent_id='qa-1'） |
| **预期结果** | output.agents 长度=1，agent_id='qa-1' |
| **覆盖场景** | 精确查询 |

### TC-AL-035: 按 agent_type 查询

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在 WORKER 2 个、WRITER 1 个 |
| **测试步骤** | 调用 getAgent（agent_type='WORKER'） |
| **预期结果** | output.agents 长度=2，全部为 WORKER 类型 |
| **覆盖场景** | 类型筛选 |

### TC-AL-036: 按 agent_id 查询不存在时返回空列表

| 项 | 内容 |
|---|------|
| **前置条件** | 无此 Agent |
| **测试步骤** | 调用 getAgent（agent_id='不存在的ID'） |
| **预期结果** | output.agents 为空数组 `[]` |
| **覆盖场景** | 查询无结果 |

### TC-AL-037: 带自定义条件查询

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在多个 Agent |
| **测试步骤** | 调用 getAgent（conditions=[{field:'enable',operator:EQ,value:1}]） |
| **预期结果** | 仅返回 enable=true 的 Agent |
| **覆盖场景** | Condition 过滤 |

### TC-AL-038: 分页查询

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在 10 个 Agent |
| **测试步骤** | 调用 getAgent（page={current:1,size:3}，order_by=[{field:'created',direction:'ASC'}]） |
| **预期结果** | output.agents 长度=3，为最早的 3 个 Agent |
| **覆盖场景** | 分页 + 排序 |

### TC-AL-039: soAgent 别名行为等价于 getAgent

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在 Agent |
| **测试步骤** | 分别调用 getAgent 和 soAgent（相同参数），比较 output |
| **预期结果** | 两次调用返回相同的 agents 列表 |
| **覆盖场景** | 别名接口一致性 |

---

## 6. ageAgent — Agent 老化

### TC-AL-040: 无老化规则时 aged_count=0

| 项 | 内容 |
|---|------|
| **前置条件** | agent_opt_rule 表为空 |
| **测试步骤** | 调用 ageAgent |
| **预期结果** | output.aged_count=0 |
| **覆盖场景** | 无规则不老化 |

### TC-AL-041: ALL 规则语义 — 所有规则同时满足才老化

| 项 | 内容 |
|---|------|
| **前置条件** | 插入 2 条规则（规则A: days=365, min_usage=5, min_score=30；规则B: days=365, min_usage=1, min_score=10）；库中有 1 个 WORKER Agent（usage_count=0, eval_score=20） |
| **测试步骤** | 调用 ageAgent |
| **预期结果** | Agent 仅满足规则A（usage=0<5 且 eval=20<30）但不满足规则B（eval=20 >= 10），因此不过老化；aged_count=0 |
| **覆盖场景** | ALL 规则语义——部分满足不老化 |

### TC-AL-042: ALL 规则全部满足时老化该 Agent

| 项 | 内容 |
|---|------|
| **前置条件** | 插入 1 条规则（days=365, min_usage=5, min_score=30）；库中有 1 个 WORKER Agent（usage_count=0, eval_score=20） |
| **测试步骤** | 调用 ageAgent |
| **预期结果** | aged_count=1，该 Agent 的 enable 被设为 0 |
| **覆盖场景** | 基础老化流程 |

### TC-AL-043: 系统 Agent（PLANNER/WRITER/EVOLUTOR）不参与老化

| 项 | 内容 |
|---|------|
| **前置条件** | 插入老化规则（规则满足条件）；库中分别有 EVOLUTOR、PLANNER、WRITER Agent 各 1 个（stats 满足老化条件） |
| **测试步骤** | 调用 ageAgent |
| **预期结果** | aged_count=0，系统 Agent 的 enable 保持不变 |
| **覆盖场景** | 系统 Agent 豁免 |

### TC-AL-044: 已禁用的 Agent 不参与老化检测

| 项 | 内容 |
|---|------|
| **前置条件** | 一个满足老化条件的 Agent（enable=0） |
| **测试步骤** | 调用 ageAgent |
| **预期结果** | 该 Agent 不被老化（aged_count=0），因为 ageAgent 只检查 enable=1 的 Agent |
| **覆盖场景** | enable 过滤 |

### TC-AL-045: 窗口内 usage_count 超过阈值时不过老化

| 项 | 内容 |
|---|------|
| **前置条件** | 规则（days=365, min_usage=5, min_score=30）；WORKER Agent（30 天内有 10 次 usage，eval_score=20） |
| **测试步骤** | 调用 ageAgent |
| **预期结果** | 虽然 eval_score 低于阈值，但 usage_count(10) >= min_usage(5)，不满足单条规则的 (lowUsage && lowEval) 条件，不过老化 |
| **覆盖场景** | usage_count 保护 |

---

## 7. getAgentRule — 查询老化规则

### TC-AL-046: 空库查询返回空列表

| 项 | 内容 |
|---|------|
| **前置条件** | agent_opt_rule 表为空 |
| **测试步骤** | 调用 getAgentRule（无参数） |
| **预期结果** | output.rules 为空数组 |
| **覆盖场景** | 空结果 |

### TC-AL-047: 带条件查询

| 项 | 内容 |
|---|------|
| **前置条件** | 插入 3 条规则（days 分别为 7、30、90） |
| **测试步骤** | 调用 getAgentRule（conditions=[{field:'days',operator:EQ,value:30}]） |
| **预期结果** | output.rules 长度=1，days=30 |
| **覆盖场景** | 条件筛选 |

---

## 8. updateAgentRule — 管理老化规则

### TC-AL-048: INSERT 一条新规则

| 项 | 内容 |
|---|------|
| **前置条件** | agent_opt_rule 表为空 |
| **测试步骤** | 调用 updateAgentRule（operations=[{type:'INSERT', data:[{field:'days',value:7},{field:'min_usage_count',value:3},{field:'min_eval_score',value:50}]}]） |
| **预期结果** | 规则表新增 1 条记录，字段值正确 |
| **覆盖场景** | INSERT 操作 |

### TC-AL-049: INSERT 时 days <= 0 抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 updateAgentRule（operations=[{type:'INSERT', data:[...], days=0}]） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "days 必须为正整数" |
| **覆盖场景** | days 合法性校验 |

### TC-AL-050: UPDATE 一条已有规则

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一条规则 |
| **测试步骤** | 调用 updateAgentRule（operations=[{type:'UPDATE', id:规则ID, data:[{field:'days',value:14}]}]） |
| **预期结果** | 该规则 days 更新为 14，updated 时间变化 |
| **覆盖场景** | UPDATE 操作 |

### TC-AL-051: DELETE 一条规则

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在一条规则 |
| **测试步骤** | 调用 updateAgentRule（operations=[{type:'DELETE', id:规则ID}]） |
| **预期结果** | 该规则被删除，查询返回空 |
| **覆盖场景** | DELETE 操作 |

### TC-AL-052: operations 为空抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 updateAgentRule（operations=[]） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "operations 为必填" |
| **覆盖场景** | 空操作校验 |

### TC-AL-053: INSERT 时 min_eval_score 超出 0-100

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 updateAgentRule（min_eval_score=150） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "min_eval_score 必须在 0-100" |
| **覆盖场景** | score 范围校验 |

### TC-AL-054: UPDATE 不存在的规则抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 规则不存在 |
| **测试步骤** | 调用 updateAgentRule（operations=[{type:'UPDATE', id:'不存在的ID'}]） |
| **预期结果** | 抛出 `NotFoundError` |
| **覆盖场景** | 无效 ID 更新 |

---

## 9. configAgentLibrary — 配置 AgentLibrary

### TC-AL-055: 首次配置写入默认值

| 项 | 内容 |
|---|------|
| **前置条件** | agent_library_config 表为空（首次调用） |
| **测试步骤** | 调用 configAgentLibrary（不传任何参数） |
| **预期结果** | 配置被初始化，output.similarity_threshold=0.7、max_agent_count=100、prompt_template_id='' |
| **覆盖场景** | 默认配置初始化 |

### TC-AL-056: 更新 similarity_threshold

| 项 | 内容 |
|---|------|
| **前置条件** | 配置已初始化（threshold=0.7） |
| **测试步骤** | 调用 configAgentLibrary（similarity_threshold=0.85） |
| **预期结果** | output.similarity_threshold=0.85 |
| **覆盖场景** | 阈值更新 |

### TC-AL-057: 更新 max_agent_count 触发老化

| 项 | 内容 |
|---|------|
| **前置条件** | 库中存在 50 个开启的 Agent，当前 max_agent_count=100 |
| **测试步骤** | 调用 configAgentLibrary（max_agent_count=30） |
| **预期结果** | max_agent_count 更新为 30；由于当前数量(50) > 30，自动触发 ageAgent（异步调用） |
| **覆盖场景** | 超量触发老化 |

### TC-AL-058: similarity_threshold 超出 0-1 抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 配置已初始化 |
| **测试步骤** | 调用 configAgentLibrary（similarity_threshold=1.5） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "similarity_threshold 必须在 0-1" |
| **覆盖场景** | 阈值范围校验 |

### TC-AL-059: max_agent_count 为 0 或负数抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 配置已初始化 |
| **测试步骤** | 调用 configAgentLibrary（max_agent_count=0） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "max_agent_count 必须为正整数" |
| **覆盖场景** | count 合法性校验 |

### TC-AL-060: prompt_template_id 不存在时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 配置已初始化，PromptsAccess 中不存在该 ID |
| **测试步骤** | 调用 configAgentLibrary（prompt_template_id='不存在的ID'） |
| **预期结果** | 抛出 `ValidationError`，消息包含 "prompt_template_id 不存在" |
| **覆盖场景** | 外键校验 |
