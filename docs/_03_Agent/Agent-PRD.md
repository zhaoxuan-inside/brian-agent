# Agent执行框架

## 1. 设计目标

1. **策略与执行解耦**：将Agent的“思考推理策略”（CoT、ReAct、Plan-and-Solve等）与“具体执行动作”分离，使执行框架能够根据配置灵活切换策略，而无需修改底层代码逻辑。
2. **原子能力复用**：将Agent执行过程抽象为若干独立、可组合的原子接口（Think、Act、Reflect、Answer），各接口可独立开发、测试和部署，提升框架的可维护性和扩展性。
3. **执行闭环自驱**：原子接口的执行结果统一返回给执行框架内部的调度器，由执行框架根据策略逻辑（顺序/循环/条件分支）**自行决定任务的推进**，绝不将内部调度权交由外部模块。
4. **与上层编排框架分层隔离**：执行框架接收来自上层**Agent编排框架**下发的`work_id`和`initial_input`，执行过程中通过标准化状态字段向上层汇报进度，执行结束后将完整结果回写至数据库。两者仅通过数据表进行通信，不产生直接的方法调用依赖。
5. **全链路可观测**：完整记录执行框架内每一次Think、Act、Reflect、Answer的输入输出、耗时及Token用量，支持执行过程追溯、性能分析和调试排错。
6. **解耦Agent的编排和Agent的执行**：Agent的编排，依赖关系的解决交给上层的编排层；

**Agent分类**：
1. Planner Agent，用来进行工作分解的Agent；
2. Work Agent，用来进行完成具体工作的Agent；
3. Writer Agent，用来进行信息汇总，人性化展示信息的Agent；
4. Evolutor Agent，用来对给用户的返回进行评估打分的Agent；

---

## 2. 功能设计

### 2.1. 构建Agent（genAgent）

**功能**：构建一个可以真正可以执行的Agent，包括运行的环境，依赖的工具（Skill，MCP）基础的Prompt（Soul）

**入参**：

- history_info：历史对话上下文；（不可变）
- info：当前信息；
- context：其他所有的关于会话的信息（session_id,work_id,interact_id,info_id,skill_ids,mcp_ids,soul_id等）

**处理流程**：

1. 针对不同类型的Agent生成完成工作需要使用的工具（Skill，MCP）和基础Prompt（Soul）；
2. 构建并初始化runtime环境；

### 2.1. 执行推理（think）

**功能**：基于当前上下文进行内部推理，输出下一步的行动计划或最终结论。该接口是CoT和ReAct策略的核心推理引擎，负责将复杂问题分解为可执行的子步骤。

**入参**：
- history_info：历史对话上下文；（不可变）
- info：当前信息；
- runtime：运行信息（Agent根据不同的策略需要的运行环境信息例如step_num等）；
- context：其他所有的关于会话的信息（session_id,work_id,interact_id,info_id,skill_ids,mcp_ids,soul_id等）

**处理流程**：

1. 从上下文中获取当前已执行的历史记录（包括历史推理文本、行动记录和观察结果）；
2. 调用`RelationProvider`查询`agent_strategy_config`表，获取当前策略配置中的`llm_id`和`prompt_template_id`；
3. 调用`PromptsProvider`组装完整的System Prompt和User Prompt，其中System Prompt包含工具描述、输出格式约束（要求输出`action`和`action_input`），User Prompt包含任务目标和历史上下文；
4. 调用`LLMProvider`执行推理，获取模型输出；
5. 解析模型输出，提取推理文本（`reasoning`）和动作类型（`action`，取值为`FINISH` / `CALL_TOOL` / `CONTINUE_THINK`）；
6. 若`action`为`CALL_TOOL`，进一步提取`tool_name`和`tool_args`；若解析失败，则按异常处理；
7. 将本次推理结果（含时间戳、Token消耗）写入上下文的`reasoning_chain`列表中，并递增`step_count`；
8. **将`ThinkResult`对象返回给执行框架的调度器**，由调度器根据`action`类型决定后续流程。

---

### 2.2. 执行行动（act）

**功能**：根据推理结果调用外部工具，执行具体操作（查询API、执行SQL、调用微服务、文件操作等）。该接口仅在ReAct等需要外部交互的策略中被调度器调用。

**入参**：
- context：其他所有的关于会话的信息（session_id,work_id,interact_id,info_id,skill_ids,mcp_ids,soul_id等）
- tool_type：工具类型（Skill，MCP）
- id：具体的工具ID
- args：工具参数字典

**处理流程**：

1. 根据tool_type的不同调用SkillProvider的execSkill接口或者MCPProvider的execMCP接口，入参为args中的参数；
2. 将工具的结果返回给执行框架

---

### 2.3. 观察反思（reflect）

**功能**：解析工具执行结果，结合任务目标评估当前进展，判断任务是否完成或需要继续执行。该接口仅在ReAct等需要外部交互的策略中被调度器调用。

**入参**：
- history_info：历史对话上下文；（不可变）
- info：当前信息；
- runtime：运行信息（Agent根据不同的策略需要的运行环境信息例如step_num等）；
- context：其他所有的关于会话的信息（session_id,work_id,interact_id,info_id,skill_ids,mcp_ids,soul_id等）
- raw_result：工具执行的原始返回结果（由Act接口产出）

**处理流程**：

1. 将`raw_result`进行结构化解析（如将JSON字符串转为对象，提取关键字段）；
2. 调用`LLMProvider`（或基于规则引擎）判断当前结果是否满足任务目标：
   - 若结果明确回答了用户问题，判定为`FINISH`；
   - 若结果提供了中间数据但还需要进一步操作，判定为`CALL_TOOL`；
   - 若结果无效或信息不足，判定为`CONTINUE_THINK`，需要重新规划；
3. 将本次观察结论（含判定依据）写入上下文的`observation_history`列表中；
4. 若判定为`FINISH`，同时将任务完成标志置为`True`；
5. **将`ActionType`枚举值（FINISH / CALL_TOOL / CONTINUE_THINK）返回给执行框架的调度器**，由调度器决定是退出循环、继续下一轮Think，还是直接调用Act。

---

### 2.4. 生成答案（answer）

**功能**：基于完整的上下文（包含所有推理链、工具调用和观察结果），生成最终格式化的答案返回给上层编排框架。该接口在策略循环结束时被调度器调用。

**入参**：
- history_info：历史对话上下文；（不可变）
- info：当前信息；
- runtime：运行信息（Agent根据不同的策略需要的运行环境信息例如step_num等）；
- context：其他所有的关于会话的信息（session_id,work_id,interact_id,info_id,skill_ids,mcp_ids,soul_id等）

**处理流程**：

1. 从上下文中提取所有推理步骤、工具调用记录和观察结果，按时间顺序拼接为完整的执行轨迹；
2. 调用`RelationProvider`查询`agent_strategy_config`表，获取该策略配置的`answer_prompt_template_id`；
3. 调用`PromptsProvider`组装最终回答的Prompt，要求LLM基于完整的执行轨迹生成简洁、准确的最终回复（可包含引用来源）；
4. 调用`LLMProvider`生成最终答案；
5. 对答案进行后处理：去除思维链内部标记（若需隐藏）、添加格式美化、插入引用脚注等；
6. 将最终答案、总Token消耗、总耗时等信息写入上下文的`final_answer`字段；
7. **将封装好的`FinalResult`对象返回给执行框架的调度器**，由调度器负责将结果持久化并通知上层编排框架。

---

### 2.5. 执行循环调度（executionLoop）【框架核心调度器】

**功能**：执行框架的内部调度核心。负责根据策略配置，动态编排原子接口（Think/Act/Reflect/Answer）的执行顺序，并**独立决定每一步的推进方向**。该调度器与上层Agent编排框架完全解耦，仅通过数据库表（`work_strategy_assignment`）进行输入接收和结果回写。

**入参**：
- `work_id`：上层编排框架下发的工作ID（全局唯一）
- `strategy_name`：策略名称（如`CoT`、`ReAct`），若未指定则从`work_strategy_assignment`表中读取
- `initial_input`：用户原始输入或上层下发的任务描述
- `max_steps`：最大执行步骤数（从策略配置读取，默认10）

**处理流程**：

1. **初始化**：
   - 根据`work_id`从`work_strategy_assignment`表中加载任务元数据；
   - 创建上下文对象`ctx`，写入`work_id`、`initial_input`、`max_steps`；
   - 调用`RelationProvider`查询`tool_registry`表，加载该策略可用的工具列表并缓存至上下文；
   - 更新`work_strategy_assignment`表中的`status`为`RUNNING`，记录`started_at`；
2. **策略路由**：根据`strategy_name`加载对应的执行流程定义（从`agent_strategy_config.flow_definition`字段读取JSON格式的状态机/流程图）；
3. **核心循环**（以ReAct策略为例）：
   - **Step 2.1**：调用`Think`接口 → 收到`ThinkResult`。
   - **Step 2.2**：调度器判断`ThinkResult.action`：
     - 若为`FINISH` → 跳出循环，进入步骤4；
     - 若为`CALL_TOOL` → 进入Step 2.3；
     - 若为`CONTINUE_THINK` → 直接回到Step 2.1（重新思考）；
   - **Step 2.3**：调度器调用`Act`接口，传入`ThinkResult.tool_name`和`ThinkResult.tool_args` → 收到`RawResult`；
   - **Step 2.4**：调度器调用`Reflect`接口，传入`RawResult` → 收到`ActionType`；
   - **Step 2.5**：调度器判断`Reflect`返回的`ActionType`：
     - 若为`FINISH` → 跳出循环，进入步骤4；
     - 若为`CALL_TOOL`或`CONTINUE_THINK` → 回到Step 2.1，进入下一轮循环；
   - **超时/步数保护**：每轮循环前检查`ctx.step_count`是否超过`max_steps`，若超限则强制跳出循环，并标记`status`为`TIMEOUT`；
4. **异常捕获**：若任何原子接口（Think/Act/Reflect）抛出未捕获异常，调度器捕获异常，记录错误日志至`agent_execution_log`，并直接跳转至步骤5（调用Answer返回错误信息）；
5. **最终输出**：调用`Answer`接口，生成最终结果；
6. **结果持久化与回写**：
   - 将`ctx.final_answer`、总步骤数、最终状态（SUCCESS / FAILED / TIMEOUT）写入`work_strategy_assignment`表；
   - 将完整的执行步骤明细（每步的输入输出、耗时）批量写入`agent_execution_log`表；
   - 更新`work_strategy_assignment`表中的`finished_at`和`status`字段，**上层Agent编排框架通过轮询或数据库触发器感知该状态变更**，以决定宏观工作流的后续推进。

> **关键说明**：调度器在整个执行过程中**自行控制循环的起止、分支跳转和异常降级**，绝不将内部流转权暴露给上层。上层编排框架仅通过`work_strategy_assignment`表的`status`字段（PENDING→RUNNING→SUCCESS/FAILED/TIMEOUT）感知执行进度，实现了完美的分层隔离。

---

### 2.6. 查询执行记录（getExecutionLog）

**功能**：供上层编排框架或开发者查询某次执行的完整日志，用于调试、性能分析和审计。

**入参**：
- `work_id`：工作ID（必填）

**处理流程**：

1. 调用`RelationProvider`查询`agent_execution_log`表，按`work_id`过滤；
2. 按`step_order`升序排序，还原完整的执行步骤序列；
3. 关联查询`llm_config`和`tool_registry`表，补全模型和工具的元数据信息；
4. 将日志列表、汇总统计（总耗时、总Token、总步数）封装为`ExecutionLogDetail`对象返回。

---

### 2.7. 配置管理（configAgent）

**功能**：提供对策略配置、LLM配置、提示词模板、工具注册等核心配置的增删改查管理能力，支持运行时动态生效。

**配置项**：

1. **策略配置**：定义策略名称、执行流程模板（DAG/状态机JSON）、最大步骤数、关联的默认LLM和提示词模板；
2. **LLM配置**：配置不同大模型提供商的端点、API Key、模型名称、超时时间、默认温度等参数；
3. **提示词模板**：配置不同场景下的System Prompt和User Prompt，支持`{{context}}`、`{{tools}}`、`{{history}}`等变量占位符；
4. **工具注册**：注册Agent可调用的外部工具，包含工具名称、描述、输入输出JSON Schema、处理器类型及配置。

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
| llm_id | 默认LLM配置ID | UUID | N | 外键 | 关联llm_config表 |
| think_prompt_template_id | 默认思考提示词模板ID | UUID | N | 外键 | 关联prompt_template表 |
| answer_prompt_template_id | 默认回答提示词模板ID | UUID | N | 外键 | 关联prompt_template表 |
| enable | 是否启用 | BOOLEAN | N | | 默认true |

### 3.2. Agent执行日志明细表

- 表名：`agent_execute_log`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识（interact_id） | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 更新时间 | timestamp | N | 普通索引 | |
| session_id | 工作ID | UUID | N | 联合索引 |  |
| work_id | 工作ID | UUID | N | 联合索引 | 关联work_strategy_assignment表 |
| step_order | 执行步骤序号 | INTEGER | N | | 从1开始递增 |
| step_type | 步骤类型 | VARCHAR(32) | N | | THINK / ACT / REFLECT / ANSWER |
| input_content | 输入内容 | JSONB | Y | | 该步骤的入参 |
| output_content | 输出内容 | JSONB | Y | | 该步骤的出参 |
| tool_calls | 工具调用明细 | JSONB | Y | | 仅ACT步骤有值，含tool_name和args |
| duration | 执行耗时（毫秒） | INTEGER | Y | | |
| status | 执行状态 | VARCHAR(32) | N | | SUCCESS / FAILED / TIMEOUT |
| error_message | 错误信息 | TEXT | Y | | |
