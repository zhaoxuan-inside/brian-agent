# Agent Builder

## 1. 设计目标

1. 接收任务后，自主分析任务特征，决定策略的选择；
2. LLM、Skill、MCP、Soul 的组件匹配与绑定由 Core 层对应的模块（LLMCore、SkillCore、MCPCore、SoulCore）负责，AgentBuilder 通过 Core 层接口委托调用；
3. 组装完整的 Agent 实例并注册到 AgentLibrary；
4. 对未命中复用的情况，全自动构建新 Agent。

## 2. 功能设计

### 2.1. 构建 Agent（buildAgent）

**功能**：根据任务输入，全流程构建一个可执行的 Agent 实例
**入参**：
- input：BuildAgentInput（继承 Input），包含以下字段：
  - interact_id：交互 ID
  - task_content：任务内容（文本描述）
  - task_complexity：任务复杂度评分（0-100，可选，不传由模型自动评估）
  - task_domain：任务领域标签（可选）
  - force_new：强制新建 Agent（跳过匹配复用，可选）
- context：BuildAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：BuildAgentOutput（继承 Output），承载返回内容：
  - agent_id：构建完成的 Agent ID

**处理流程**：

1. **步骤 1：任务特征提取（extractTaskSignature）**
   a. 调用 RelationDBProvider.selectOneDB 查询 `agent_builder_config` 表获取 `task_analysis_prompt_template_id`；
   b. 调用 PromptsProvider.execPrompt 使用 `task_analysis_prompt_template_id` 结合 `task_content` 生成任务分析 prompt；
   c. 调用 LLMProvider.execLLM 分析任务特征，输出 JSON：`{ "complexity": 0-100, "domain": "领域标签", "signature": "任务特征摘要" }`；
   d. 若入参 `task_complexity` 非空，以入参为准覆盖模型输出；
   e. 提取 `complexity`、`domain` 和 `signature` 供后续步骤使用；

2. **步骤 2：尝试复用现有 Agent（tryMatchAgent）**
   a. 若 `force_new` 为 true，跳过此步骤，直接进入步骤 3；
   b. 调用 AgentLibrary.matchAgent 传入 `task_signature=signature`，`agent_type=WORKER`（Work Agent 类型）；系统级 Agent（Planner/Writer/Evolutor）各有专用的构建入口，不在此处匹配；
   c. 若 matchAgent 返回有效的 agent_id：直接返回该 agent_id（复用成功）；调用 AgentLibrary.recordAgentUsage 记录本次复用；
   d. 若未匹配到：继续执行步骤 3；

3. **步骤 3：匹配策略**
    根据步骤 1 提取的任务特征，调用策略匹配接口：
    a. **匹配策略**：调用 AgentStrategy.matchStrategy（详见 AgentStrategy 模块），传入 `complexity`、`domain`、`task_content`，返回 `strategy_id`；
    b. LLM、Skill、MCP、Soul 的匹配由 Core 层对应模块（LLMCore、SkillCore、MCPCore、SoulCore）在 Agent 执行时按需进行匹配，不在 Agent 构建阶段执行；

 4. **步骤 4：组装 Agent 实例**
    a. 生成新的 `agent_id`（UUID）；
    b. 调用 AgentLibrary.addAgent，传入 Agent 元数据：`{ agent_id, agent_type: "WORKER", strategy_id, llm_id: "", soul_id: "", task_signature: signature }`；
    c. llm_id 和 soul_id 在首次执行时由 Core 层按需匹配；
    d. 返回 agent_id；

5. **步骤 5：后续优化（异步 fire-and-forget）**
   a. 调用 optimizeAgent 异步优化各组件绑定（新 Agent 的首次优化）；

### 2.2. 优化 Agent 绑定（optimizeAgent）

**功能**：优化 Agent 各组件的绑定关系，逐步提升 Agent 与任务的匹配度
**入参**：
- input：OptimizeAgentInput（继承 Input），包含以下字段：
  - agent_id：Agent ID
  - interact_id：交互 ID
  - usage_feedback：使用反馈（可选，来自 EvolutorAgent 的评估结果）
- context：OptimizeAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：OptimizeAgentOutput（继承 Output），承载返回内容：
  - optimized：是否发生了优化变更
  - changes：变更详情列表

**处理流程**：

1. 调用 AgentLibrary.getAgent(agent_id) 获取当前 Agent 的完整配置；
2. 初始化变更详情列表 `changes` 为空数组；
3. 调用 AgentStrategy.matchStrategy 重新匹配最优策略；若与当前 strategy_id 不同，调用 AgentLibrary.updateAgent 更新策略绑定，追加 change 记录；
4. LLM、Skill、MCP、Soul 的优化绑定由 Core 层对应模块（LLMCore、SkillCore、MCPCore、SoulCore）负责；AgentBuilder 将优化事件通过 EvolutorAgent 触发 Core 层优化流程；
5. 若 `changes` 非空：返回 `optimized=true` 和变更列表；
6. 若 `changes` 为空：返回 `optimized=false`，表示当前绑定已是最优；

### 2.3. 构建 PlannerAgent（buildPlannerAgent）

**功能**：构建 PlannerAgent 实例（系统级 Agent，不使用 Worker Agent 匹配流程）
**入参**：
- input：BuildPlannerAgentInput（继承 Input），包含以下字段：
  - force_new：强制新建（可选）
- context：BuildPlannerAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：BuildPlannerAgentOutput（继承 Output），承载返回内容：
  - agent_id：PlannerAgent ID

**处理流程**：

1. 若 `force_new` 不为 true：调用 AgentLibrary.getAgent 按 `agent_type=PLANNER` 查询已有 PlannerAgent；若存在且 enable=true，直接返回其 agent_id；
2. 若不存在或 force_new=true：按 buildAgent 的步骤 3 流程构建新 Agent（agent_type 固定为 PLANNER，task_signature 固定为 "planner"）；策略固定为 Plan-and-Solve；
3. 返回 agent_id；

### 2.4. 构建 WriterAgent（buildWriterAgent）

**功能**：构建 WriterAgent 实例（系统级 Agent）
**入参**：
- input：BuildWriterAgentInput（继承 Input），包含以下字段：
  - force_new：强制新建（可选）
- context：BuildWriterAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：BuildWriterAgentOutput（继承 Output），承载返回内容：
  - agent_id：WriterAgent ID

**处理流程**：

1. 若 `force_new` 不为 true：调用 AgentLibrary.getAgent 按 `agent_type=WRITER` 查询已有 WriterAgent；若存在且 enable=true，直接返回其 agent_id；
2. 若不存在或 force_new=true：按 buildAgent 的步骤 3 流程构建新 Agent（agent_type 固定为 WRITER，task_signature 固定为 "writer"）；策略固定为 CoT；
3. 该 Agent 的 LLM 偏好为擅长文本书写和结构化表达的模型；
4. 返回 agent_id；

### 2.5. 构建 EvolutorAgent（buildEvolutorAgent）

**功能**：构建 EvolutorAgent 实例（系统级 Agent）
**入参**：
- input：BuildEvolutorAgentInput（继承 Input），包含以下字段：
  - force_new：强制新建（可选）
- context：BuildEvolutorAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：BuildEvolutorAgentOutput（继承 Output），承载返回内容：
  - agent_id：EvolutorAgent ID

**处理流程**：

1. 若 `force_new` 不为 true：调用 AgentLibrary.getAgent 按 `agent_type=EVOLUTOR` 查询已有 EvolutorAgent；若存在且 enable=true，直接返回其 agent_id；
2. 若不存在或 force_new=true：按 buildAgent 的步骤 3 流程构建新 Agent（agent_type 固定为 EVOLUTOR，task_signature 固定为 "evolutor"）；策略固定为 ReAct；
3. 返回 agent_id；

### 2.6. 配置（configAgentBuilder）

**功能**：配置 AgentBuilder 的参数
**入参**：
- input：ConfigAgentBuilderInput（继承 Input），包含以下字段：
  - task_analysis_prompt_template_id：任务分析 prompt 模板 ID（可选）
  - default_strategy_id：默认策略 ID（可选）
  - auto_optimize：是否自动优化（可选，默认 true）
- context：ConfigAgentBuilderContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ConfigAgentBuilderOutput（继承 Output），承载返回内容：
  - task_analysis_prompt_template_id：当前生效的模板 prompt ID
  - default_strategy_id：当前生效的默认策略 ID
  - auto_optimize：当前生效的自动优化开关

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `agent_builder_config` 表获取当前配置；
2. 若 `task_analysis_prompt_template_id` 非空：校验 PromptsProvider.soPrompt 中存在则更新；
3. 若 `default_strategy_id` 非空：校验 Strategy 模块中存在则更新；
4. 若 `auto_optimize` 非空：更新；
5. 调用 RelationDBProvider.updateDB 写入配置；
6. 返回更新后的配置写入 output；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

### 3.1. AgentBuilder 配置表

- 表名：agent_builder_config
- 库名：agent

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| task_analysis_prompt_template_id | 任务分析 prompt 模板 ID | UUID | N | | |
| default_strategy_id | 默认策略 ID | UUID | N | | |
| auto_optimize | 是否自动优化 | BOOL | N | | 默认 true |

## 实现约定（与代码同步，2026-07-28）

1. **组件匹配**：LLM/Skill/MCP/Soul 一律经 Core（matchLLM/matchSkill/matchMCP/matchSoul + opt*），Agent 层不自选底层模型表。
2. **optimizeAgent**：由 Evolutor 评估后经 MQ 触发；负责重匹配 strategy 与 Core 组件，并将 llm_id/soul_id/strategy_id 写回 agent 表。
3. **task_signature**：格式 `[domain] 任务前256字`（见名词词典）。
4. **系统 Agent**：Planner/Writer/Evolutor 预置策略标签 Plan-and-Solve / CoT / ReAct，经 AgentStrategy.soStrategy 解析 strategy_id。
