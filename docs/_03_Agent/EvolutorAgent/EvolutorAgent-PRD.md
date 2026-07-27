# Evolutor Agent

## 1. 设计目标

1. 负责对输入的内容（提问，回答）进行评估打分；
2. 将评估结果写入持久化存储，供 Agent 执行框架进行反馈强化和可靠性更新；

## 2. 功能设计

### 2.1. 评估打分（evaluateResult）

**功能**：接收提问和回答，进行评估打分；

**入参**：
- input：EvaluateResultInput（继承 Input），包含以下字段：
  - input_msg_id：提问内容（msg_id 关联的用户消息）
  - response_interact_id：回答内容（interact_id 关联的 Agent 输出）
- context：EvaluateResultContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：EvaluateResultOutput（继承 Output），承载返回内容：
  - overall_score：评估总得分
  - relevance_score：相关性得分
  - accuracy_score：准确性得分
  - completeness_score：完整性得分
  - coherence_score：连贯性得分
  - helpfulness_score：有用性得分
  - evolutor_desc：评估详情
  - improvement_suggestions：改进建议列表

**处理流程**：

1. **加载配置**：调用 RelationDBProvider 查询 `agent_evolutor_config` 表获取 `llm_id` 和 `prompt_template_id`；若配置缺失则抛出异常；
2. **加载评估内容**：根据 `input`（用户提问的 msg_id）和 `response`（Agent 输出的 interact_id）调用 InfoCore 获取完整的提问内容和回答内容（若信息已被压缩则获取摘要）；
3. **构建评估 Prompt**：将提问内容、回答内容和 `prompt_template_id` 调用 PromptsProvider 生成评估 prompt；评估 Prompt 模板需包含以下变量：
   - `{{user_query}}`：用户的原始提问；
   - `{{agent_response}}`：Agent 的最终回复；
   - `{{evaluation_criteria}}`：五维度的评估标准定义（由配置文件注入）；
4. **LLM 评估打分**：调用 LLMProvider（temperature=0.1 保证评分稳定性），要求 LLM 输出结构化 JSON：
   ```json
   {
     "relevance": { "score": 0-100, "reason": "..." },
     "accuracy": { "score": 0-100, "reason": "..." },
     "completeness": { "score": 0-100, "reason": "..." },
     "coherence": { "score": 0-100, "reason": "..." },
     "helpfulness": { "score": 0-100, "reason": "..." },
     "overall_score": 0-100,
     "overall_comment": "...",
     "improvement_suggestions": ["..."]
   }
   ```
5. **评估维度说明**：
   - **相关性（relevance）**：回答是否紧扣用户提问，是否答非所问；0 分表示完全无关，100 分表示精准回答；
   - **准确性（accuracy）**：回答中的事实、数据、代码等是否正确无误；0 分表示严重错误，100 分表示完全准确；
   - **完整性（completeness）**：回答是否覆盖了用户提问的所有方面；0 分表示仅回答了一小部分，100 分表示全面覆盖；
   - **连贯性（coherence）**：回答的逻辑结构是否清晰，段落衔接是否自然；0 分表示杂乱无章，100 分表示清晰流畅；
   - **有用性（helpfulness）**：回答对用户是否有实际帮助价值；0 分表示毫无帮助，100 分表示极具实用价值；
6. **总分计算**：
   a. 默认各维度等权平均：`overall_score = (relevance + accuracy + completeness + coherence + helpfulness) / 5`；
   b. 若 `agent_evolutor_config` 中配置了维度权重（`dimension_weights` JSON），则按加权平均计算；
   c. LLM 返回的 `overall_score` 与计算值交叉验证：若偏差超过 15 分，以计算值为准并记录告警；
7. **结果校验**：
   a. 校验 LLM 返回的 JSON 格式合法性；解析失败时重试一次（更换 temperature=0.2）；
   b. 若两次均解析失败，回退到启发式评分：基础分 50，输出长度在合理范围 +10，不含"抱歉/无法/错误"等负面词 +10，包含结构化格式（代码块/列表/标题）+10，上限 80；
   c. 校验各维度评分是否在 0-100 范围内，越界则裁剪；
8. **结果持久化**：将评估结果（total_score、各维度得分、evolutor_desc=LLM 返回的 JSON 原文含 reason 和 suggestions）保存至 `agent_evolutor_result` 表，关联 `session_id`、`work_id`、`interact_id`；
9. **反馈至 Agent 持久化层**（触发 Agent 强化与优化）：
   a. 根据 `work_id` 查询 `agent_work_plan` 表，获取本次工作使用的 `agent_id` 列表；
   b. 对每个 `agent_id`：
      - 若 `overall_score >= 70`：对该 Agent 进行正向强化（strength += 0.1，reliability 通过 EMA 更新），将成功经验（task_description、result_summary、score）写入 `agent_feedback_history` 表；
      - 若 `overall_score < 40`：对该 Agent 进行负向强化（strength -= 0.15，下限 0.1），将失败原因和改进建议写入 `agent_feedback_history` 表；
      - 若 `40 <= overall_score < 70`：仅写入评估记录，不触发强化；
   c. 若 `overall_score < 40` 且 `improvement_suggestions` 非空，触发 Agent 持久化层的优化流程（版本快照→尝试改进→对比评估→采纳或回退），基于改进建议尝试生成新版本 Agent（保留旧版本，新版本标记为 derived_from=agent_id）；
10. 将评估结果（含总分和维度得分）写入 output 返回；

**返回**：Boolean，表示评估是否完成

### 2.2. 配置管理（configEvolutor）

**功能**：支持配置评估使用的 LLM 和模板 prompt

**入参**：
- input：ConfigEvolutorInput（继承 Input），包含以下字段：
  - llm_id：LLM 配置 ID（可选）
  - prompt_template_id：模板 prompt ID（可选）
- context：ConfigEvolutorContext（继承 Context），配置上下文
- output：ConfigEvolutorOutput（继承 Output），承载返回内容：
  - config_result：配置结果

**处理流程**：

1. 调用 RelationDBProvider 更新 `agent_evolutor_config` 表中的 `llm_id` 和 `prompt_template_id`；

**返回**：Boolean，表示配置是否完成

---

### 2.3. 重要内容

所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；

---

## 3. 表设计

### 3.1. 评估Agent配置表

- 表名：`agent_evolutor_config`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | UUID | N | 外键 | 关联 llm_config 表 |
| prompt_template_id | 模板prompt ID | UUID | N | 外键 | 关联 prompt_template 表 |

### 3.2. 评估结果表

- 表名：`agent_evolutor_result`
- 库名：`agent`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话ID | UUID | N | 普通索引 | 关联 session 表 |
| work_id | 工作ID | UUID | N | 普通索引 | 关联 agent_work_plan 表 |
| interact_id | 交互ID | UUID | N | 普通索引 | |
| score | 评估总得分（百分值） | INT | N | | 0-100 |
| relevance_score | 相关性得分 | INT | Y | | 0-100 |
| accuracy_score | 准确性得分 | INT | Y | | 0-100 |
| completeness_score | 完整性得分 | INT | Y | | 0-100 |
| coherence_score | 连贯性得分 | INT | Y | | 0-100 |
| helpfulness_score | 有用性得分 | INT | Y | | 0-100 |
| evolutor_desc | 评估详情 | TEXT | N | | |
