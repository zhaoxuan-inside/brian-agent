# Work Agent

## 1. 设计目标

1. 负责接收工作，根据工作需要通过 Soul，Skill，MCP 等构建一个完整的 Agent，在 Agent 框架的驱动下完成工作；

## 2. 功能设计

### 2.1. 构建WorkAgent（buildWorkAgent）

**功能**：根据工作构建完成工作需要的 Agent

**入参**：
- input：BuildWorkAgentInput（继承 Input），包含以下字段：
  - work_content：工作内容
- context：BuildWorkAgentContext（继承 Context），会话上下文（session_id, work_id, interact_id, info_id 等）
- output：BuildWorkAgentOutput（继承 Output），承载返回内容：
  - agent_instance：构建完成的Agent实例

**处理流程**：

1. **加载可用 Agent 模板**：通过 RelationDBProvider 查询 `agent_work_config` 表，获取所有已配置的 WorkAgent 模板（id、agent_brief、llm_id、prompt_template_id、agent_strategy_id）；
2. **检查已有绑定**：通过 RelationDBProvider 根据 `session_id` 和 `work_id` 查询 `agent_work_plan` 表，检查当前工作节点是否已绑定过 Agent（agent_id 非空）；若已绑定，则获取已有 Agent 实例并返回；
3. **LLM 选择 Agent 模板**：将工作内容和所有 WorkAgent 模板的 ID 和摘要（agent_brief）作为输入，调用 PromptsProvider 构建 Agent 选择 prompt，调用 LLMProvider 由模型推荐最适配当前工作的 `agent_work_config` 记录；
4. **匹配 Soul**：根据选中的 `agent_work_config.id` 和工作内容，调用 `SoulCore.matchSoul` 接口，获取匹配的 Soul ID；若匹配失败则使用系统默认 Soul；
5. **匹配 Skill**：根据选中的 `agent_work_config.id` 和工作内容，调用 `SkillCore.matchSkill` 接口，获取匹配的 Skill ID 列表；若匹配失败则 skill_ids 为空；
6. **匹配 MCP**：根据选中的 `agent_work_config.id` 和工作内容，调用 `MCPCore.matchMcp` 接口，获取匹配的 MCP ID 列表；若匹配失败则 mcp_ids 为空；
7. **匹配 LLM**：根据选中的 `agent_work_config.id` 和工作内容，调用 `LLMCore.matchLLM` 接口，获取匹配的 LLM ID；若匹配失败则使用 `agent_work_config` 中配置的默认 llm_id；
8. **组装 Agent 实例**：
   a. 生成 `agent_id`（UUID）；
   b. 调用 `SoulProvider.getSoul(soul_id)` 获取 Soul 完整内容（persona、style、constraints）；
   c. 调用 `SkillProvider.getSkill(skill_id)` 批量获取各 Skill 的完整定义（brief、work、scripts、references、assets）；
   d. 调用 `MCPProvider.getMcp(mcp_id)` 批量获取各 MCP 的工具描述和调用规范；
   e. 调用 `LLMProvider.getLLM(llm_id)` 获取 LLM 模型的配置（endpoint、api_key、model_name、temperature 等）；
   f. 调用 `PromptsProvider.execPrompt(prompt_template_id)` 渲染 Agent 的系统 prompt，注入 Soul、Skill 描述、MCP 工具描述作为变量；
   g. 从 `agent_work_config.agent_strategy_id` 查询 `agent_strategy_config` 表，获取执行策略定义（flow_definition、max_steps）；
   h. 组装完整的 WorkAgent 对象：`{ agent_id, type: "work", llm_config, soul, skills[], mcps[], system_prompt, strategy, work_content, created_at, status: "PENDING" }`；
9. **可选持久化**：将 WorkAgent 持久化至图数据库，便于后续复用；
10. 将 WorkAgent 对象和 `agent_work_config.id` 更新写入 `agent_work_plan` 表对应的任务记录中；
11. 将 WorkAgent 写入 output 返回；

**返回**：Boolean，表示 Agent 构建是否完成；构建的 Agent 通过 output 参数返回

### 2.2. 完成工作（executeWork）

**功能**：接收工作，基于 ReACT 模型完成工作

**入参**：
- input：ExecuteWorkInput（继承 Input），包含以下字段：
  - work_content：工作内容
  - agent：构建好的 Agent 实例
- context：ExecuteWorkContext（继承 Context），会话上下文（session_id, work_id, interact_id, info_id, skill_ids, mcp_ids, soul_id 等）
- output：ExecuteWorkOutput（继承 Output），承载返回内容：
  - work_result：工作执行结果

**处理流程**：

1. **生命周期激活**：创建 Agent 运行时实例并激活为 running 状态；
2. **加载历史上下文**：根据 `context` 中的 `session_id`、`work_id` 调用 `InfoCore.context` 接口构建完整的工作上下文（包含时间线消息、语义相似消息、关键词相关消息、标签相关性消息）；
3. **初始化执行环境**：将 `work_content`、历史上下文、Agent 的 system_prompt、Soul 配置注入 Runtime 对象，初始化 `step_count=0`、`max_steps`（默认从策略配置读取，上限 30）、`reasoning_chain=[]`、`observation_history=[]`；
4. **策略分发**：根据 Agent 的 `strategy.strategy_name` 选择不同的执行模式：
   - **ReAct 模式**：执行 Think-Act-Reflect 循环（见步骤 5）；
   - **CoT 模式**：执行 Think-Answer 顺序链（跳过 Act/Reflect）；
   - **Plan-and-Solve 模式**：先 Plan（产出子步骤列表），再对每个子步骤执行 Solve（Think-Act-Reflect 循环），最后 Answer；
5. **ReAct 核心执行循环**（以 ReAct 为例）：
   a. 调用 `executeThink(history_info, info, runtime, context)`，获得 `ThinkResult { action, reasoning, tool_name, tool_args }`；
   b. 调度器判断 `ThinkResult.action`：
      - `FINISH`：跳出循环，进入步骤 6（Answer）；
      - `CALL_TOOL`：进入步骤 c；
      - `CONTINUE_THINK`：`step_count++`，若未超 `max_steps` 则回到步骤 a，否则标记 TIMEOUT 跳出；
   c. 调用 `executeAct(tool_type, tool_id, tool_args, context)`，获得工具执行原始结果 `RawResult`；
   d. 调用 `executeReflect(history_info, info, runtime, RawResult, context)`，获得 `ActionType`（FINISH / CALL_TOOL / CONTINUE_THINK）；
   e. 调度器判断 `ActionType`：FINISH 则跳出；CALL_TOOL 或 CONTINUE_THINK 则 `step_count++`，回到步骤 a；
   f. **超时保护**：每次循环前检查 `step_count >= max_steps`，超限则强制跳出并标记 status 为 TIMEOUT；
   g. **取消检测**：每次循环前检查取消标志，命中则优雅退出；
6. **生成最终答案**（Answer）：调用 `executeAnswer(history_info, info, runtime, context)`，整合全部推理链、工具调用记录、观察结果，由 LLM 生成最终格式化的回复内容；
7. **异步优化**（fire-and-forget，不阻塞主流程）：
   a. 调用 `SoulCore.optSoul(agent_id, context, soul_id)` 根据本次工作结果优化 Soul 匹配；
   b. 调用 `SkillCore.optSkill(agent_id, context, skill_id)` 将新匹配的 Skill 绑定到 Agent；
   c. 调用 `MCPCore.optMCP(agent_id, context, mcp_id)` 将新匹配的 MCP 绑定到 Agent；
8. **结果持久化**：
   a. 调用 `InfoCore.saveInfo` 将 Agent 的所有输出消息（think 过程、tool 调用、最终答案）按时间顺序写入 `info_raw` 表，各条消息标记 `info_creator_role` 为 AGENT/MCP/SKILL/LLM 等对应角色；
   b. 将完整的执行步骤明细（每步的 step_type、input_content、output_content、duration、tool_calls）批量写入 `agent_execute_log` 表；
9. **生命周期结束**：根据最终状态标记 Agent 为已完成或失败；
10. 将最终结果写入 output 返回；

**返回**：Boolean，表示工作是否完成；工作结果通过 output 参数返回

### 2.3. 配置管理（configWorkAgent）

**功能**：支持配置 LLM 和模板 prompt

**入参**：
- input：ConfigWorkAgentInput（继承 Input），包含以下字段：
  - llm_id：LLM 配置 ID（可选）
  - prompt_template_id：模板 prompt ID（可选）
- context：ConfigWorkAgentContext（继承 Context），配置上下文
- output：ConfigWorkAgentOutput（继承 Output），承载返回内容：
  - config_result：配置结果

**处理流程**：

1. 调用 RelationDBProvider 更新 `agent_work_config` 表中的 `llm_id` 和 `prompt_template_id`；

**返回**：Boolean，表示配置是否完成

---

### 2.4. 重要内容

所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；

---

## 3. 表设计

### 3.1. WorkAgent配置表

- 表名：`agent_work_config`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| agent_brief | Agent工作摘要 | TEXT | N | | |
| llm_id | LLM ID | UUID | N | 外键 | 关联 llm_config 表 |
| prompt_template_id | 模板prompt ID | UUID | N | 外键 | 关联 prompt_template 表 |
| agent_strategy_id | Agent执行策略ID | UUID | N | 外键 | 关联 agent_strategy_config 表 |
