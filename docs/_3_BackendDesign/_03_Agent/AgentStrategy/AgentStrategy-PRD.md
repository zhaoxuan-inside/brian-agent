# Agent Strategy

## 1. 设计目标

1. 将"思考推理策略"与"具体执行动作"解耦，使策略可灵活注册、切换和组合；
2. 提供多种内置策略实现：CoT（Chain of Thought）、ReAct（Reasoning + Acting）、Plan-and-Solve；
3. 根据任务特征（复杂度、领域、类型）自动匹配最佳策略；
4. 调度器根据策略定义调度 Think、Act、Reflect、Answer 原子操作的执行顺序和条件分支。

## 2. 功能设计

### 2.1. 匹配策略（matchStrategy）

**功能**：根据任务特征，从所有已启用的策略中选择最佳策略
**入参**：
- input：MatchStrategyInput（继承 Input），包含以下字段：
  - task_content：任务内容
  - task_complexity：任务复杂度（0-100）
  - task_domain：任务领域标签
- context：MatchStrategyContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：MatchStrategyOutput（继承 Output），承载返回内容：
  - strategy_id：匹配的策略 ID

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `agent_strategy` 表，加载所有启用（enable=true）的策略及其元数据（strategy_id、strategy_label、suitable_complexity_min、suitable_complexity_max、suitable_domains）；
2. 若可用策略列表为空，返回默认策略 ID（从 `agent_strategy_config` 表读取 default_strategy_id）；
3. 按复杂度匹配过滤：保留 `task_complexity` 在 `[suitable_complexity_min, suitable_complexity_max]` 范围内的策略；
4. 若只剩一个策略，直接返回其 strategy_id；
5. 若仍有多个候选策略（或 domain 标签需要精细化选择）：调用 RelationDBProvider.selectOneDB 查询 `agent_strategy_config` 表获取 `match_prompt_template_id`；
6. 将任务信息与候选策略列表（ID + label + 适用场景）与 `match_prompt_template_id` 调用 PromptsProvider.execPrompt 构建匹配 prompt；
7. 调用 LLMProvider.execLLM 由模型推荐最佳 strategy_id；
8. 解析 LLM 输出，返回匹配到的 strategy_id；

### 2.2. 获取策略（getStrategy）

**功能**：获取策略的完整定义，包括执行规则配置
**入参**：
- input：GetStrategyInput（继承 Input），包含以下字段：
  - strategy_id：策略 ID
- context：GetStrategyContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetStrategyOutput（继承 Output），承载返回内容：
  - strategy_id：策略 ID
  - strategy_label：策略标签（CoT / ReAct / Plan-and-Solve）
  - execution_rule：执行规则 JSON 定义（详见 3.1 策略执行规则格式）

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 `strategy_id` 查询 `agent_strategy` 表；
2. 若不存在，返回 false 并记录错误日志；
3. 返回策略的完整元数据写入 output；

### 2.3. 查看策略列表（soStrategy）

**功能**：查看所有已注册的策略（含启用/禁用状态）
**入参**：
- input：SoStrategyInput（继承 Input），包含以下字段：
  - conditions：查询条件（可选）
  - order_by：排序字段（可选）
  - page：分页参数（可选）
- context：SoStrategyContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SoStrategyOutput（继承 Output），承载返回内容：
  - strategies：策略列表，每项含 { strategy_id, strategy_label, suitable_complexity_min, suitable_complexity_max, suitable_domains, execution_rule, enable, created, updated }

**处理流程**：

1. 构建查询条件，调用 RelationDBProvider.selectDB 查询 `agent_strategy` 表；
2. 返回策略列表写入 output；

### 2.4. 注册策略（addStrategy）

**功能**：注册一个新的执行策略
**入参**：
- input：AddStrategyInput（继承 Input），包含以下字段：
  - strategy_label：策略标签
  - suitable_complexity_min：适用复杂度下限（0-100）
  - suitable_complexity_max：适用复杂度上限（0-100）
  - suitable_domains：适用领域标签列表（JSON 数组字符串）
  - execution_rule：执行规则 JSON（详见 3.1 节）
- context：AddStrategyContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：AddStrategyOutput（继承 Output），承载返回内容：
  - strategy_id：新建的策略 ID

**处理流程**：

1. 校验 `strategy_label` 不能为空且不重复；`suitable_complexity_min <= suitable_complexity_max`；`execution_rule` 为合法 JSON 且符合执行规则格式；
2. 生成 `strategy_id`（UUID）；
3. 调用 RelationDBProvider.insertDB 写入 `agent_strategy` 表（enable 默认为 true）；
4. 返回 strategy_id 写入 output；

### 2.5. 更新策略（updateStrategy）

**功能**：更新策略的元数据或执行规则
**入参**：
- input：UpdateStrategyInput（继承 Input），包含以下字段：
  - strategy_id：策略 ID
  - strategy_label：策略标签（可选）
  - suitable_complexity_min：适用复杂度下限（可选）
  - suitable_complexity_max：适用复杂度上限（可选）
  - suitable_domains：适用领域标签（可选）
  - execution_rule：执行规则 JSON（可选）
  - enable：启用/禁用（可选）
- context：UpdateStrategyContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateStrategyOutput（继承 Output），承载返回内容

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 确认 strategy_id 对应的策略存在；
2. 校验更新字段的合法性（同 addStrategy 的校验规则）；
3. 调用 RelationDBProvider.updateDB 更新变更字段；
4. 返回 true；

### 2.6. 配置（configAgentStrategy）

**功能**：配置 Strategy 模块的参数
**入参**：
- input：ConfigAgentStrategyInput（继承 Input），包含以下字段：
  - default_strategy_id：默认策略 ID（当匹配失败时使用）
  - match_prompt_template_id：策略匹配 prompt 模板 ID
- context：ConfigAgentStrategyContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigAgentStrategyOutput（继承 Output），承载返回内容：
  - default_strategy_id
  - match_prompt_template_id

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `agent_strategy_config` 表获取当前配置；
2. 若 `default_strategy_id` 非空：校验该策略在 `agent_strategy` 表中存在且 enable=true，存在则更新；
3. 若 `match_prompt_template_id` 非空：校验 PromptsProvider.soPrompt 中存在，存在则更新；
4. 调用 RelationDBProvider.updateDB 写入配置；
5. 返回更新后的配置写入 output；

## 3. 内置策略定义

### 3.1. 策略执行规则格式

每个策略的 `execution_rule` 是一个 JSON 对象，定义原子操作的执行顺序和条件控制：

```json
{
  "version": "1.0",
  "steps": [
    {
      "step": "Think",
      "next": "Act",
      "on_error": "Answer"
    },
    {
      "step": "Act",
      "next": "Reflect",
      "condition": {
        "field": "should_continue",
        "operator": "EQ",
        "value": true,
        "true_next": "Think",
        "false_next": "Answer"
      }
    },
    {
      "step": "Reflect",
      "next_field": "should_continue"
    },
    {
      "step": "Answer",
      "next": null
    }
  ]
}
```

### 3.2. CoT（Chain of Thought）策略

- **strategy_label**：CoT
- **suitable_complexity_min**：0
- **suitable_complexity_max**：40
- **suitable_domains**：`["*"]`（通用）
- **execution_rule**：Think → Answer（单步推理，不执行工具）
  - Think 阶段完成推理后直接跳到 Answer 阶段
  - 无 Act 阶段（不使用工具）
  - 无 Reflect 阶段（不迭代）

```json
{
  "version": "1.0",
  "max_iterations": 1,
  "steps": [
    { "step": "Think", "next": "Answer", "on_error": "Answer" },
    { "step": "Answer", "next": null }
  ]
}
```

### 3.3. ReAct（Reasoning + Acting）策略

- **strategy_label**：ReAct
- **suitable_complexity_min**：30
- **suitable_complexity_max**：70
- **suitable_domains**：`["*"]`（通用）
- **execution_rule**：Think → Act → Reflect ⇄ Think → Answer（循环直到 Reflect 判定可结束）

```json
{
  "version": "1.0",
  "max_iterations": 10,
  "steps": [
    { "step": "Think", "next": "Act", "on_error": "Answer" },
    { "step": "Act", "next": "Reflect" },
    { "step": "Reflect", "condition_field": "should_continue", "true_next": "Think", "false_next": "Answer" },
    { "step": "Answer", "next": null }
  ]
}
```

### 3.4. Plan-and-Solve 策略

- **strategy_label**：Plan-and-Solve
- **suitable_complexity_min**：60
- **suitable_complexity_max**：100
- **suitable_domains**：`["*"]`（通用）
- **execution_rule**：
  - Phase 1 - Plan：Think（制定分步计划）→ 输出子步骤列表
  - Phase 2 - Solve：对每个子步骤执行 Act → Reflect，完成全部后汇总 Answer

```json
{
  "version": "1.0",
  "max_iterations": 20,
  "phases": [
    {
      "phase": "Plan",
      "steps": [
        { "step": "Think", "next": "SolvePhase", "on_error": "Answer" }
      ]
    },
    {
      "phase": "Solve",
      "loop_over": "sub_steps",
      "steps": [
        { "step": "Act", "next": "Reflect" },
        { "step": "Reflect", "condition_field": "should_continue", "true_next": "Act", "false_next": "SummaryAnswer" }
      ]
    },
    {
      "phase": "Summary",
      "steps": [
        { "step": "Answer", "next": null }
      ]
    }
  ]
}
```

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 4. 表设计

### 4.1. Agent 策略表

- 表名：agent_strategy
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| strategy_id | 策略 ID | UUID | N | 唯一索引 | |
| strategy_label | 策略标签 | VARCHAR | N | | CoT / ReAct / Plan-and-Solve |
| suitable_complexity_min | 适用复杂度下限 | INT | N | | 0-100 |
| suitable_complexity_max | 适用复杂度上限 | INT | N | | 0-100 |
| suitable_domains | 适用领域标签 | TEXT | N | | JSON 数组字符串 |
| execution_rule | 执行规则 | TEXT | N | | JSON 格式 |
| enable | 是否启用 | BOOL | N | | 默认 true |

### 4.2. AgentStrategy 配置表

- 表名：agent_strategy_config
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| default_strategy_id | 默认策略 ID | UUID | N | | 关联 agent_strategy.strategy_id |
| match_prompt_template_id | 策略匹配 prompt 模板 ID | UUID | N | | |
