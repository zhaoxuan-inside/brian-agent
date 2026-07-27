# Agent执行框架

## 1. 设计目标

1. **与上层编排框架分层解耦**：上层编排负责创建Agent要执行的任务，并将任务提供给Agent执行框架，后续的工作完全交由执行框架完成。
2. **策略与执行解耦**：将Agent的“思考推理策略”（CoT、ReAct、Plan-and-Solve等）与“具体执行动作”分离，使执行框架能够根据配置灵活切换策略，而无需修改底层代码逻辑。
3. **原子能力复用**：将Agent执行过程抽象为若干独立、可组合的原子接口（Think、Act、Reflect、Answer），各接口可独立开发、测试和部署，提升框架的可维护性和扩展性。
4. **执行闭环自驱**：原子接口的执行结果统一返回给执行框架内部的调度器，由执行框架根据策略逻辑（顺序/循环/条件分支）**自行决定任务的推进**。
5. **全链路可观测**：完整记录执行框架内每一次Think、Act、Reflect、Answer的输入输出、耗时及Token用量，支持执行过程追溯、性能分析和调试排错。
6. **动态产生以及优化Agent**： 框架需要可以根据任务产生适合的策略，LLM，Skill，MCP，Soul构成一个处理该任务的Agent，完成指定的任务；每次产生Agent都需要消耗成本因此需要根据任务来保存Agent依赖的内容，也需要根据评估结果以及Agent的使用频率来优化和老化Agent；

**Agent的构成**：
1. 策略：思考的策略；
2. LLM（Large Language Model）：负责执行推理和生成输出。
3. Skill（技能）：同Agent SKill对于Skill的定位；
4. MCP（多模态处理）：标准的MCP的定位；
5. Soul（智能体）：要执行的任务应该有的人类品格。

**必须有的Agent**：
1. Writer Agent，用来进行信息汇总，人性化展示信息的Agent；所有Agent执行完成后对结果的重新组织（依赖用户画像）；
2. Evolutor Agent，用来对给用户的返回进行评估打分的Agent；用户Agent的优化；

其他的Agent就是根据策略的不同以及具体的任务的不同，来创建不同的Agent，例如Planner Agent，Worker Agent等类型；

---

## 2. 功能设计 — 设计目标拆解与实现目标

以下围绕第1节定义的六个设计目标，将其拆解为可衡量、可验证的具体实现目标。各子模块（AgentLifecycle、AgentLibrary、AgentBuilder、MetaAgent、PlannerAgent、WorkAgent、WriterAgent、EvolutorAgent、GraphExecutor）的内部功能细节在各自 PRD 中独立定义，此处仅描述 Agent 执行框架层级必须达成的实现目标。

---

### 2.1. 与上层编排框架分层解耦

**对应设计目标 1**

1. **标准任务交接协议**：定义上层编排框架与Agent执行框架之间的任务传递规范。上层编排框架通过消息队列（mq）写入任务描述、session_id、work_id、策略指定等元数据；Agent执行框架从mq读取任务，接收完成后上层编排框架不再介入后续执行流程。
2. **执行进度透明化**：Agent执行框架在执行过程中，将状态变更（待执行→执行中→成功/失败/超时）实时写入持久化存储的指定状态字段并通过消息队列（mq）发送通知。上层编排框架接收通知，通过查询该状态字段感知执行进度，不直接调用Agent执行框架的内部控制接口。
3. **执行结果标准化**：Agent执行框架完成工作后，将最终答案、总步骤数、总耗时、最终状态写入持久化存储的结果字段，必要时通过消息队列（mq）发送工作完结通知。上层编排框架接收通知，从持久化存储中获取结果，不依赖Agent执行框架的内存态数据。 
4. **Agent内聚完整性**：Agent实例内聚合部执行依赖（策略、LLM、Soul、Skill、MCP），构建后不再向上层编排框架请求任何资源或决策指令，执行全程自包含。

---

### 2.2. 策略与执行解耦

**对应设计目标 2**

1. **策略可配置定义**：将思考推理策略（CoT、ReAct、Plan-and-Solve）抽象为可配置的执行流程定义，以结构化数据（JSON格式的状态机/DAG）描述Think、Act、Reflect、Answer四个原子接口的执行顺序、条件分支和循环逻辑。策略逻辑集中存储在`agent_strategy_config`表中，不作为代码硬编码。
2. **策略动态切换**：Agent实例在执行前可根据任务分析结果动态选择策略；执行中当某策略效果不达预期时（如Reflect评估连续低分），调度器支持策略轮转切换（如ReAct→Plan-and-Solve→CoT），切换过程不影响已累积的执行上下文。
3. **原子接口与策略无关**：Think、Act、Reflect、Answer四个原子接口内部不包含策略分支判断逻辑，接口行为完全由入参和当前上下文驱动，策略编排逻辑全部收敛在调度器内部。
4. **新增策略零代码侵入**：新增一种推理策略仅需：
   - 新增一条`agent_strategy_config`记录，定义新的执行流程；
   - 配置对应策略的默认LLM和prompt_template；
   无需修改任一原子接口代码，无需修改调度器核心循环逻辑。
5. **策略效果可对比**：每次执行记录策略名称和策略版本，支持按策略维度聚合统计成功率、平均步数、平均耗时，为策略选优提供数据依据。

---

### 2.3. 原子能力复用

**对应设计目标 3**

#### 2.3.1. Think 原子接口实现目标

1. 正确组装包含 Soul 描述、Skill 清单、MCP 清单、历史执行轨迹（reasoning_chain）的系统提示词（System Prompt）和用户提示词（User Prompt）。
2. 调用LLMProvider执行推理，获取结构化输出（要求LLM返回`action`和`action_input`字段）。
3. 解析LLM输出，提取动作类型（FINISH / CALL_TOOL / CONTINUE_THINK）及对应的推理文本（reasoning）；若为CALL_TOOL则进一步提取tool_name和tool_args。
4. 解析失败时具备逐级容错能力：格式修正重试→调整temperature重试→启发式正则解析→标记为解析错误返回调度器。
5. 将本次推理结果（action类型、reasoning文本、工具调用参数、时间戳、Token消耗）按时间顺序追加至上下文的推理链，递增步骤计数器。

#### 2.3.2. Act 原子接口实现目标

1. 接收调度器传入的tool_type（Skill / MCP）、tool_id、tool_args，分发到对应Provider（SkillProvider.execSkill 或 MCPProvider.execMCP）执行。
2. 向Provider传递标准化的工具调用参数，接收原始返回结果（raw_result），不做内容解析或语义理解。
3. 捕获工具调用过程中的超时、权限、网络、参数校验等异常，将异常信息封装为raw_result返回调度器，而非向上抛异常。

#### 2.3.3. Reflect 原子接口实现目标

1. 解析raw_result并进行结构化提取（JSON解析、关键字段提取），为评估提供可读信息。
2. 调用LLMProvider（或规则引擎）结合任务目标和当前执行上下文，判断raw_result是否满足任务需求，输出明确的动作方向：FINISH（任务完成）、CALL_TOOL（需要进一步工具调用）、CONTINUE_THINK（信息不足需重新思考）。
3. 将本次观察结论（action_type、判断依据）追加至上下文的observation_history。
4. 若判定为FINISH，同时标记任务完成标志。

#### 2.3.4. Answer 原子接口实现目标

1. 从上下文按时间顺序提取完整执行轨迹（推理链、工具调用记录、观察结果），拼接为结构化执行摘要。
2. 调用LLMProvider基于执行轨迹生成简洁、准确的最终回复，并可包含信息来源引用。
3. 对LLM生成结果进行后处理：去除内部思维链标记（若需对用户隐藏）、格式美化、引用脚注添加、长度截断保护。
4. 统计本次工作的总Token消耗和总耗时，一并纳入answer输出。

#### 2.3.5. 原子接口契约约束

1. 每个原子接口具备明确定义的Input/Output契约，入参和出参结构独立，不跨接口共享可变状态。
2. 每个原子接口可被独立单元测试，测试仅需构造模拟的Input和Context即可验证行为。
3. 原子接口由调度器统一编排调用，接口内部不调用其他原子接口，不决定下一步执行方向。

---

### 2.4. 执行闭环自驱

**对应设计目标 4**

1. **调度器内聚**：实现统一的ExecutionLoop调度器，该调度器根据策略配置的flow_definition自主编排原子接口的调用顺序、循环起止和分支跳转，不存在外部回调或外部触发推进。
2. **运行时上下文自维护**：调度器维护完整的运行时上下文（RuntimeContext），包括当前步骤数（step_num）、已执行推理链（reasoning_chain）、已调用工具记录（tool_call_history）、观察历史（observation_history）、累计Token消耗、已用时间。所有原子接口的输入从该上下文构造，输出回写该上下文。
3. **调度决策闭环**：调度器在每步原子接口执行后，根据返回结果中的action_type字段（FINISH / CALL_TOOL / CONTINUE_THINK）自主决定下一步操作：退出循环并进入Answer、继续循环调用Act、或重新调用Think。
4. **多层终止保护**：
   - 最大步骤数保护：step_num ≥ max_steps 时强制退出循环；
   - 单步超时保护：单次原子接口调用超时则标记当前步骤为TIMEOUT并进入降级流程；（TIMEOUT需要通过配置表进行控制，默认值为180秒）
   - 整体超时保护：工作总执行时间超过上限则强制终止并生成超时回复。
5. **取消信号协同**：每轮循环起始检测AgentLifecycle设置的取消标志（cancelFlag），检测到取消信号时优雅退出：完成当前步骤记录、输出已完成的部分结果、标记最终状态为CANCELLED。
6. **异常降级自愈**：原子接口执行异常时按以下降级链处理，避免单点失败导致整个work崩溃：
   - 重试（默认重试3次，间隔及次数通过策略配置表 `agent_strategy_config` 的 `retry_count` 和 `retry_interval_ms` 字段控制）；
   - 回退到次选LLM或次选Skill；
   - 回退到基于规则的启发式处理；
   - 最终降级为错误信息返回用户。

---

### 2.5. 全链路可观测

**对应设计目标 5**

1. **步骤级日志完整记录**：每次原子接口调用生成一条执行日志记录，包含session_id、work_id、step_order、step_type（THINK / ACT / REFLECT / ANSWER）、input_content、output_content、duration、status（SUCCESS / FAILED / TIMEOUT），持久化写入`agent_execution_log`表。
2. **工具调用追踪**：在Act步骤日志中记录详细的tool_calls字段（含tool_name和tool_args），支持按工具维度分析调用频率、成功率和耗时。
3. **Token消耗追踪**：在Think和Answer步骤中记录每次LLM调用的Token消耗（prompt_tokens + completion_tokens），按work_id和session_id维度汇总。
4. **执行日志查询**：支持按session_id和work_id查询完整执行步骤序列（按step_order升序），同时返回汇总统计（总步数、总耗时、总Token消耗、最终状态），供上层编排框架和开发者调试使用。
5. **执行轨迹回放**：基于执行日志数据还原完整的时间线视图，展示每一步的输入、输出、决策方向、耗时，支持开发者逐步骤审查Agent的推理过程和决策质量。
6. **异常日志分离标记**：失败步骤除基础日志字段外，额外记录error_message和error_stack，支持按错误类型聚合排查。

---

### 2.6. 动态产生及优化Agent

**对应设计目标 6**

**前置：可用Agent判断**：根据历史中执行任务的Agent配置描述判断是否满足当前任务需求；满足则以配置的概率采用（默认75%，通过策略配置表 `agent_strategy_config` 的 `reuse_probability` 字段控制），否则重新构建新的Agent。
1. **任务分析**：接收工作任务后，分析任务意图（调试/代码生成/解释/规划/搜索/翻译/分析/优化/其他）、领域（前端/后端/数据/运维/测试/通用）、复杂度（0.1~1.0量化值）、所需能力集合，为Agent组件选择和复用提供决策依据。
2. **Agent复用优先**：基于任务特征向量在AgentLibrary中进行相似性检索（键重叠得分 + 值相似度得分的加权综合 ≥ 0.3），命中相似Agent时优先复用而非重新构建，降低创建成本和LLM Token消耗。
3. **Agent按需构建**：当无复用的Agent时，根据任务分析结果为任务按需选取最优组件组合——策略（复杂度驱动选择）、LLM（自动匹配或指定）、Soul（人格匹配）、Skill（能力需求→Skill类别映射匹配）、MCP（正则匹配工具描述），组装为可执行的Agent实例。
4. **组件智能推荐**：基于LLM分析任务描述，自动推荐适合的Soul配置、Skill项和MCP工具包，生成的推荐需经用户（或自动化规则）确认后绑定到Agent实例。
5. **Agent持久化与复用积累**：Agent执行完成后，将其配置快照（策略、LLM、Soul、Skill、MCP、prompt_template）、任务特征、初始能力评分写入AgentLibrary持久化，供后续相似任务复用。
6. **Agent多维度评估**：EvolutorAgent对Agent的每次执行结果进行五维度评估（相关性、准确性、完整性、连贯性、有用性，每维度0~100分），生成综合评分和针对性改进建议，评估结果反馈给AgentLibrary。
7. **Agent反馈强化**：AgentLibrary根据评估分数和用户反馈（好评/中评/差评）调整Agent的强度分数（positive +0.1 / negative -0.15）和可靠性分数（EMA算法平滑更新），实现Agent能力的持续累积强化。
8. **Agent老化与遗忘**：基于艾宾浩斯遗忘曲线，对长时间未使用的Agent进行指数衰减（strength × exp(-0.05 × days_since_last_used)），强度低于阈值（默认0.2）的Agent自动归档，模拟记忆的自然淘汰。
9. **Agent优化迭代**：当Agent接收负向反馈且存在改进建议时，触发概率化优化流程：版本快照→尝试改进（调整prompt_template/Soul/Skill组合）→EvolutorAgent对比评估→采纳并升级版本或回退。优化后的Agent以新版本形式存储，保留旧版本支持回滚。
10. **Agent生命周期闭环**：AgentLifecycle实现从创建→激活→执行→完成/失败→评估→强化/优化→老化→归档/废弃的完整生命周期管理，确保Agent库持续健康运转。

---

### 2.7. 运行时配置管理

1. **策略配置管理**：支持对策略名称、执行流程定义（flow_definition JSON）、最大步骤数、关联默认LLM和prompt_template的增删改查。策略配置记录需支持启用/禁用控制。
2. **LLM配置管理**：支持对不同LLM提供商的端点、API Key、模型名称、超时时间、默认温度、最大Token数等参数的增删改查。
3. **prompt_template管理**：支持对不同场景（Think、Answer、Planner、Evolutor、Writer）的System Prompt和User Prompt模板的增删改查，模板需支持`{{context}}`、`{{tools}}`、`{{history}}`、`{{task}}`、`{{format_instruction}}`等变量占位符和变量替换渲染。
4. **工具注册管理**：支持对Agent可调用外部工具的注册、更新、注销，每条工具记录包含名称、描述、输入输出JSON Schema、处理器类型（Skill / MCP）及对应Provider配置。
5. **运行时动态生效**：所有配置变更（除已在执行循环中的Agent引用外）即时生效，无需重启Agent执行框架。正在执行的Agent在下一轮循环起始时刷新配置引用。

---

### 2.8. 切面注入（AOP）

所有方法通过代理模式增加切面注入能力，默认记录日志和耗时。Output参数中注入`elapsed_ms`字段记录本次调用耗时。支持通过`interceptors`选项注入自定义拦截器（前置：beforeExecute / preExecute；后置：postExecute / afterExecute），拦截器异常不影响业务方法执行。

---

## 3. 表设计

### 3.1. 策略配置表

- 表名：`agent_strategy_config`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| strategy_name | 策略名称 | VARCHAR(64) | N | 唯一索引 | 如CoT、ReAct、PlanAndSolve |
| agent_strategy_brief | 策略描述 | TEXT | Y | | |
| agent_strategy_flow | 执行流程定义 | JSONB | N | | 状态机/DAG定义，描述接口执行顺序和条件分支 |
| max_steps | 最大执行步骤数 | INTEGER | N | | 默认10，防止死循环 |
| step_timeout_seconds | 单步超时（秒） | INTEGER | N | | 默认180 |
| reuse_probability | Agent复用概率（0~1） | FLOAT | N | | 默认0.75，对应2.6节前置逻辑 |
| retry_count | 默认重试次数 | INTEGER | N | | 默认3 |
| retry_interval_ms | 重试间隔（毫秒） | JSONB | N | | 递增间隔数组，默认 [30000, 60000, 120000] |
| llm_id | 默认LLM配置ID | UUID | N | 外键 | 关联llm_config表 |
| think_prompt_template_id | 默认思考提示词模板ID | UUID | N | 外键 | 关联prompt_template表 |
| answer_prompt_template_id | 默认回答提示词模板ID | UUID | N | 外键 | 关联prompt_template表 |
| is_system | 是否内置策略 | BOOLEAN | N | | 默认false。内置策略（CoT、ReAct）不可修改、不可删除 |
| enable | 是否启用 | BOOLEAN | N | | 默认true |

> **外键ID默认值约定**：所有引用外部资源的ID字段（`llm_id`、`prompt_template_id` 等），当无法确定具体值时保持为空（空字符串或 NULL），由下层的 LLMProvider、PromptsProvider 在运行时解析默认值。严禁在配置表中硬编码 `"default"` 等占位字符串作为有效ID。

### 3.2. Agent执行日志明细表

- 表名：`agent_execution_log`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话ID | UUID | N | 联合索引 | |
| work_id | 工作ID | UUID | N | 联合索引 | 关联 work_strategy_assignment 表 |
| step_order | 执行步骤序号 | INTEGER | N | | 从1开始递增 |
| step_type | 步骤类型 | VARCHAR(32) | N | | THINK / ACT / REFLECT / ANSWER |
| input_content | 输入内容 | JSONB | Y | | 该步骤的入参 |
| output_content | 输出内容 | JSONB | Y | | 该步骤的出参 |
| tool_calls | 工具调用明细 | JSONB | Y | | 仅ACT步骤有值，含tool_name和args |
| duration | 执行耗时（毫秒） | INTEGER | Y | | |
| status | 执行状态 | VARCHAR(32) | N | | SUCCESS / FAILED / TIMEOUT |
| error_message | 错误信息 | TEXT | Y | | |

### 3.3. 工作策略分配表

- 表名：`work_strategy_assignment`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话ID | UUID | N | 普通索引 | |
| work_id | 工作ID | UUID | N | 唯一索引 | |
| strategy_id | 策略配置ID | UUID | N | 外键 | 关联 agent_strategy_config 表 |
| status | 执行状态 | VARCHAR(32) | N | | PENDING / RUNNING / SUCCESS / FAILED / TIMEOUT / CANCELLED |
| initial_input | 初始任务输入 | TEXT | N | | 上层编排下发的任务描述 |
| final_answer | 最终答案 | TEXT | Y | | |
| total_steps | 总执行步骤数 | INTEGER | Y | | |
| started_at | 开始执行时间 | timestamp | Y | | |
| finished_at | 完成时间 | timestamp | Y | | |
