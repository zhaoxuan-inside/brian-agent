# Writer Agent

## 1. 设计目标

1. 根据前面 Agent 执行结果生成最终给用户的回复内容；
2. 作为任务执行流程的结束节点，完成结果汇总以及结果人性化展示工作；

## 2. 功能设计

### 2.1. 结果汇总（writeResult）

**功能**：作为任务执行流程的结束节点，完成结果汇总以及结果人性化展示工作

**入参**：
- input：WriteResultInput（继承 Input），包含以下字段：
  - work_contents：多个节点的工作内容列表
- context：WriteResultContext（继承 Context），会话上下文（session_id, work_id, interact_id, info_id 等）
- output：WriteResultOutput（继承 Output），承载返回内容：
  - msg_id：产出消息的唯一标识
  - final_text：最终汇总文本

**处理流程**：

1. **加载配置**：调用 RelationDBProvider 查询 `agent_writer_config` 表获取 `llm_id` 和 `prompt_template_id`；若配置缺失则抛出异常；
2. **工作内容分类与预处理**：
   a. 遍历 `work_contents` 列表，按每个子工作的 `status` 分组：成功（SUCCESS）、失败（FAILED）、超时（TIMEOUT）；
   b. 对成功的工作内容，提取其最终输出文本；对失败/超时的工作内容，提取其错误信息和已完成的中间结果；
   c. 按任务在 DAG 中的原始顺序（task_order）排序；
3. **构建汇总结构**：
   a. 成功部分：`{ task_description, result_summary }`——若结果文本超过 2000 字符，先调用 `InfoCore.summaryInfo` 进行摘要压缩后再纳入；
   b. 失败/超时部分：`{ task_description, error_message, partial_result }`——标记为部分完成，附带错误原因；
4. **生成 Prompt**：将分类整理后的工作内容列表（含成功和失败信息）和 `prompt_template_id` 提交给 PromptsProvider 生成 prompt；Prompt 模板需包含以下占位符：
   - `{{success_tasks}}`：成功完成的任务及结果；
   - `{{failed_tasks}}`：失败/超时的任务及原因；
   - `{{user_query}}`：用户的原始提问；
   - `{{format_instruction}}`：输出格式要求（分点、结构化、语言风格等）；
5. **LLM 汇总生成**：将 prompt 和 `llm_id` 调用 LLMProvider（temperature 设为 0.5 兼顾准确性与自然度），LLM 需：
   a. 将多个子任务结果整合为连贯的最终回复；
   b. 若存在失败子任务，需在回复中标注"以下部分未能完成"并给出简要说明；
   c. 若所有子任务均失败，生成一则友好的错误提示（含重试建议）；
   d. 根据 WriterAgent 配置中的语言风格（默认：正式、专业、结构化）生成最终文本；
6. **后处理**：
   a. 检查输出长度，若超过 `max_output_length`（配置项，默认 8000 字符），调用 InfoCore.summaryInfo 进行最终摘要压缩；
   b. 去除 LLM 输出中可能残留的思维链标记、内部 JSON、工具调用日志等不需要展示给用户的内容；
   c. 添加必要的格式标记（如 Markdown 标题、列表、代码块等）确保前端正确渲染；
7. **结果保存**：
   a. 生成 `msg_id`（UUID），作为本次 WriterAgent 产出消息的唯一标识；
   b. 调用 InfoProvider 的 saveInfo 接口保存汇总结果：`{ session_id, work_id, interact_id, info_id: msg_id, info_creator_id: writer_agent_id, info_creator_role: "AGENT", info: final_text }`；
   c. 将 `msg_id` 和 `final_text` 写入 output 返回；
8. **失败降级**：若 LLM 调用失败，回退为直接拼接所有成功子任务的结果文本（用分隔线分隔），标记失败子任务；

**返回**：Boolean，表示结果汇总是否完成；汇总结果通过 output 参数返回

### 2.2. 配置管理（configWriterAgent）

**功能**：支持配置 LLM 和模板 prompt

**入参**：
- input：ConfigWriterAgentInput（继承 Input），包含以下字段：
  - llm_id：LLM 配置 ID（可选）
  - prompt_template_id：模板 prompt ID（可选）
- context：ConfigWriterAgentContext（继承 Context），配置上下文
- output：ConfigWriterAgentOutput（继承 Output），承载返回内容：
  - config_result：配置结果

**处理流程**：

1. 调用 RelationDBProvider 更新 `agent_writer_config` 表中的 `llm_id` 和 `prompt_template_id`；

**返回**：Boolean，表示配置是否完成

---

### 2.3. 重要内容

所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；

---

## 3. 表设计

### 3.1. WriterAgent配置表

- 表名：`agent_writer_config`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | UUID | N | 外键 | 关联 llm_config 表 |
| prompt_template_id | 模板prompt ID | UUID | N | 外键 | 关联 prompt_template 表 |
