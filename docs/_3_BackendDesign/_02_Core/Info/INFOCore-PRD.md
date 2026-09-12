# INFO Core

## 1. 设计目标

1. 保存信息；
2. 加工信息；
3. 根据需要搜索信息；
4. 自动老化信息；

## 2. 功能设计

### 2.1. 保存信息（saveInfo）

**功能**：接收整个工作处理过程中的信息
**入参**：
- input：SaveInfoInput（继承 Input），包含以下字段：
  - session_id：标识用户的一个会话（必选）
  - work_id：标识一次完整的问答工作（必选）
  - interact_id：标识工作执行过程中的一次问答（必选）
  - info_type：信息类型；REQUEST（用户请求/编排输入）、RESPONSE（模型/编排最终回复）、THINK（Agent 思考）、SKILL（技能调用结果）、MCP（MCP 调用结果）、ACT（Agent 行动/执行）、REFLECT（Agent 反思）（必选）
  - info_creator_role：信息产生方角色；USER（用户）、LEARNING（自学习）、AGENT（Agent）、SKILL（技能）、MCP（MCP 工具）（可选，默认空）
  - info_creator_id：信息产生方实例 ID，UUID 类型；USER 与 LEARNING 为空字符串，AGENT/SKILL/MCP 为各自实例 ID（可选，默认空）
  - info：信息内容（必选）
  - created：消息真实创建时间（毫秒时间戳，可选，缺省取保存时刻）。会话同步等场景传入原始消息时间（如 `runtime_message.created`），保证 user 消息先于 assistant 回复的时间先后次序，并使按 `created` 去重的条件成立（2026-09-09 起）
  - parent_info_ids：父级信息ID列表（可选）
- context：SaveInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SaveInfoOutput（继承 Output），承载返回内容：
  - info_id：新创建的信息 ID
**处理流程**：

1. 生成 `info_id`（UUID），计算 `info_length = len(info)`；
2. 调用 RelationDBProvider.insertDB 将 `{ session_id, work_id, interact_id, info_id, info_type, info_creator_role, info_creator_id, info, info_length, pin: false }` 写入 `info_raw` 表；
3. 若 `parent_info_ids` 非空，遍历列表：
   a. 对每个 `parent_info_id`，调用 GraphDBProvider 建立 info 节点与 `CITATION` 边（边 properties 存 `citing_info_id`/`cited_info_id`/`session_id`）；
4. 将 `info_id` 写入 output 返回，主流程结束；
5. —— 以下步骤异步执行（fire-and-forget，不阻塞主流程）——
6. 调用 `keywordInfo` 接口对信息内容进行分词，写入 FTS5 虚拟表 `info_keyword`；
7. 若 `info_vector_config.enable = true`，调用 `vectorInfo` 接口对信息内容进行向量化，写入 `info_vector` 表；
8. 若 `info_tag_config.enable = true`，调用 `tagInfo` 接口对信息内容抽取标签，写入 `info_tag` 表和 `info_tag_vector` 表；
9. 若 `info_summary_config.enable = true`，调用 `summaryInfo` 接口对信息内容进行压缩摘要，写入 `info_summary` 表；

### 2.2. 钉住消息（pinInfo）

**功能**：钉住一条具体的信息
**入参**：
- input：PinInfoInput（继承 Input），包含以下字段：
  - info_id：信息 ID
- context：PinInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：PinInfoOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 根据 info_id 查询 `info_raw` 表，确认该消息记录存在；
2. 若记录不存在，返回 false 并记录错误日志；
3. 调用 RelationDBProvider.updateDB 将 `info_raw` 表中该 info_id 对应的记录的 `pin` 字段切换钉住状态（pin ⇄ unpin）。钉住的消息在构建上下文（context）中优先排在最前面，且在 delInfo 老化清理时不会被清空 info 内容；

### 2.3. 加工信息

#### 2.3.1. 对信息进行向量化（vectorInfo）

**功能**：对指定的信息进行向量化
**入参**：
- input：VectorInfoInput（继承 Input），包含以下字段：
  - info_id：信息 ID
- context：VectorInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：VectorInfoOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_vector_config` 表获取配置（enable, llm_id, dimension）；如果 enable=false，直接返回 true（跳过向量化）；
2. 根据 info_id 调用 RelationDBProvider.selectOneDB 查询 `info_raw` 表获取信息内容（info 字段）；
3. 调用 LLMProvider.embedLLM 使用配置的 llm_id（embedding 类型模型，llm_id 为空时自动选择默认 embedding 模型）获取内容的向量（浮点数组，长度等于 dimension）；
4. 调用 RelationDBProvider.insertDB 将 `{ info_id, embedding: JSON 序列化的向量 }` 保存到 `info_vector` 表（已存在则跳过，不做覆盖）；

#### 2.3.2. 对信息抽取标签（tagInfo）

**功能**：对指定的信息抽取标签
**入参**：
- input：TagInfoInput（继承 Input），包含以下字段：
  - info_id：信息 ID
- context：TagInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：TagInfoOutput（继承 Output），承载返回内容：
  - tags：抽取的标签列表
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_tag_config` 表获取配置（enable, llm_id, prompt_template_id）；如果 enable=false 或缺少 llm_id 或 prompt_template_id，直接返回 true（跳过标签抽取）；
2. 根据 info_id 调用 RelationDBProvider.selectOneDB 查询 `info_raw` 表获取信息内容（info 字段）；
3. 将信息内容和 prompt_template_id 调用 PromptsProvider.execPrompt 生成 Prompt；
4. 根据 llm_id 和 prompt 调用 LLMProvider.execLLM 得到 tag 列表（JSON 数组格式，如 `["标签1", "标签2", ...]`）；
5. 遍历 tag 列表，调用 RelationDBProvider.insertDB 将每条 tag 和 info_id 的关系保存到 `info_tag` 表（使用 upsert 语义：tag + info_id 联合唯一，存在则跳过）；
6. 对每个 tag，调用 LLMProvider.embedLLM 使用 embedding 模型计算 tag 文本的向量，调用 RelationDBProvider.insertDB 将向量和 tag 文本（tag_id）保存到 `info_tag_vector` 表；

#### 2.3.3. 对信息标签进行建立连接图（graphTag）

**功能**：为信息的标签建立相关性连通图
**入参**：
- input：GraphTagInput（继承 Input），包含以下字段：
  - tag_id：标签 ID
- context：GraphTagContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GraphTagOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_tag_config` 表获取 `tag_top_k` 和 `enable`；如果 enable=false，直接返回 true（跳过建图）；
2. 调用 RelationDBProvider.selectOneDB 根据 tag_id 查询 `info_tag` 表获取标签文本内容（tag 字段）；
3. 调用 LLMProvider.embedLLM 使用 embedding 模型计算标签文本的向量；
4. 调用 VectorDBProvider.soVector 根据标签向量搜索语义最相似的 top_k 个 tag_id 及相似距离（排除自身，即过滤掉与 tag_id 相同的结果）；
5. 遍历 top_k 结果，对每个相似 tag_id：
   a. 调用 GraphDBProvider.addGraphEdge 在 tag_id 和相似 tag_id 之间建立 `similarTo` 类型的边，边属性包含 `similarity`（相似距离）和 `actMap`（激活图，初始化为空 JSON 对象 `{}`）；
   b. 若边已存在（GraphDBProvider 内部 upsert），更新 `similarity` 属性值；

**注意**：graphTag 通过 GraphDB 的 `similarTo` 边类型在标签之间建立相似图边，形成标签语义关联网络。tag 之间建图的具体权重设计与激活老化策略详见 `Tag相关性权重设计.md`；

#### 2.3.4. 对信息进行压缩（summaryInfo）

**功能**：对一段内容进行压缩
**入参**：
- input：SummaryInfoInput（继承 Input），包含以下字段：
  - info_id：信息 ID
- context：SummaryInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SummaryInfoOutput（继承 Output），承载返回内容：
  - summary：信息摘要
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_summary_config` 表获取配置（enable, llm_id, prompt_template_id, threshold）；如果 enable=false 或缺少 llm_id 或 prompt_template_id，直接返回 true（跳过摘要压缩）；
2. 根据 info_id 调用 RelationDBProvider.selectOneDB 查询 `info_raw` 表获取信息内容（info 字段）；
3. **阈值判断**：若信息内容字符数不超过 `threshold`（默认 100），直接以原文作为摘要（无需调用 LLM）；否则进入下一步；
4. 将信息内容和 prompt_template_id 调用 PromptsProvider.execPrompt 生成 prompt；
5. 将 llm_id 和 prompt 调用 LLMProvider.execLLM 生成信息的摘要文本（建议 temperature=0.3，max_tokens 根据内容长度动态设置）；
6. 调用 RelationDBProvider.insertDB 将 `{ info_id, summary: 摘要文本 }` 保存到 `info_summary` 表（upsert 语义：若 info_id 已存在则更新摘要）；

> **摘要生成方式变更**：所有 LLM 摘要生成逻辑统一由上层编排调用内置 **SummaryAgent** 负责（经 `saveInfo.input.summary` 传入落库）。`InfoCoreService.summaryInfo` 仅保留字符数不超过 `threshold`（默认 100）的短内容原文落库功能，内部不再独立调用 LLM 避免出现两套不一致的摘要生成逻辑。

#### 2.3.5. 对信息进行keyword（keywordInfo）

**功能**：对一段内容进行压缩
**入参**：
- input：KeywordInfoInput（继承 Input），包含以下字段：
  - info_id：信息 ID
- context：KeywordInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：KeywordInfoOutput（继承 Output），承载返回内容
**处理流程**：

1. 根据 info_id 调用 RelationDBProvider.selectOneDB 查询 `info_raw` 表获取信息内容（info 字段）；
2. 调用 nodejieba（Node.js 中文分词库）对信息内容进行分词，去除停用词（的、了、是、在、和、等中文常见虚词），得到关键词列表；
3. 遍历关键词列表，调用 RelationDBProvider.executeRaw 将每条 `{ info_id, word: 关键词 }` 写入 `info_keyword` 表（普通表，位置参数 `(?, ?)` 绑定；不支持重复，按 info_id + word 去重写入）；

**确认**：关键词提取使用 nodejieba（Node.js 中文分词库）进行中文分词并去除停用词，结果存储于 SQLite FTS5 虚拟表 `info_keyword` 中以支持全文搜索；

### 2.4. 配置查看

#### 2.4.1. 信息标签配置查看（getInfoTagConfig）

**功能**：调用RelationDBProvider获取info_tag_config表中配置
**入参**：
- input：GetInfoTagConfigInput（继承 Input）
- context：GetInfoTagConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetInfoTagConfigOutput（继承 Output），承载返回内容：
  - config：标签配置信息（llm_id, prompt_template_id, tag_top_k, enable）
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_tag_config` 表，获取唯一配置记录；
2. 将查询到的配置（llm_id, prompt_template_id, tag_top_k, enable）写入 output 返回；
3. 若配置表为空（首次使用），返回默认值：enable=true, tag_top_k=5, llm_id 和 prompt_template_id 为空；

**返回**：Boolean，表示查询是否完成

#### 2.4.2. 修改标签配置（updateInfoTagConfig）

支持配置LLM和PromptTemplate和是否开启
**入参**：
- input：UpdateInfoTagConfigInput（继承 Input），包含以下字段：
  - llm_id：LLM ID（可选，须为 text 类型模型）
  - prompt_template_id：Prompt模板ID（可选）
  - tag_top_k：标签 Top-K 数量（可选，须为 >= 1 的整数）
  - enable：是否启用（可选）
- context：UpdateInfoTagConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateInfoTagConfigOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_tag_config` 表，获取当前配置记录；
2. 若 `enable` 非空，更新 enable 字段；
3. 若 `llm_id` 非空：
   a. 校验 LLMProvider.soLLM 中是否存在该 llm_id（确保 LLM 已注册且可用），且其 `llm_type` 必须为 `text`（标签生成是文本生成任务）；
   b. 若存在且类型正确，更新 llm_id 字段；否则返回 false 并记录错误日志；
4. 若 `prompt_template_id` 非空：
   a. 校验 PromptsProvider.soPrompt 中是否存在该 prompt_template_id；
   b. 若存在，更新 prompt_template_id 字段；否则返回 false 并记录错误日志；
5. 若 `tag_top_k` 非空：校验为正整数且 >= 1，否则返回 false 并记录错误日志，通过则更新 tag_top_k 字段；
6. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `info_tag_config` 表；

**返回**：Boolean，表示更新是否完成

#### 2.4.3. 信息摘要配置查看（getInfoSummaryConfig）

**功能**：调用RelationDBProvider获取info_summary_config表中配置
**入参**：
- input：GetInfoSummaryConfigInput（继承 Input）
- context：GetInfoSummaryConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetInfoSummaryConfigOutput（继承 Output），承载返回内容：
  - config：摘要配置信息（llm_id, prompt_template_id, enable, threshold, info_types）
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_summary_config` 表，获取唯一配置记录；
2. 将查询到的配置（llm_id, prompt_template_id, enable, threshold, info_types）写入 output 返回；
3. 若配置表为空（首次使用），返回默认值：enable=true, llm_id 和 prompt_template_id 为空, threshold=100, info_types='RESPONSE'；

**返回**：Boolean，表示查询是否完成

#### 2.4.4. 修改信息摘要配置（updateInfoSummaryConfig）

支持配置LLM和PromptTemplate和是否开启
**入参**：
- input：UpdateInfoSummaryConfigInput（继承 Input），包含以下字段：
  - llm_id：LLM ID（可选，须为 text 类型模型）
  - prompt_template_id：Prompt模板ID（可选）
  - enable：是否启用（可选）
  - threshold：摘要生成阈值（可选，内容字符数不超过该值时直接以原文作为摘要）
  - info_types：需要生成摘要的信息类型白名单（可选，逗号分隔）
- context：UpdateInfoSummaryConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateInfoSummaryConfigOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_summary_config` 表，获取当前配置记录；
2. 若 `enable` 非空，更新 enable 字段；
3. 若 `llm_id` 非空：校验 LLMProvider.soLLM 中是否存在该 llm_id，且其 `llm_type` 必须为 `text`（摘要生成是文本生成任务），存在且类型正确则更新，否则返回 false 并记录错误日志；
4. 若 `prompt_template_id` 非空：校验 PromptsProvider.soPrompt 中是否存在该 prompt_template_id，存在则更新，否则返回 false 并记录错误日志；
5. 若 `threshold` 非空，更新 threshold 字段；若 `info_types` 非空，更新 info_types 字段；
6. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `info_summary_config` 表；

**返回**：Boolean，表示更新是否完成

#### 2.4.5. 信息配置查看（getInfoConfig）

**功能**：调用RelationDBProvider获取info_config表中配置
**入参**：
- input：GetInfoConfigInput（继承 Input）
- context：GetInfoConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetInfoConfigOutput（继承 Output），承载返回内容：
  - config：信息配置（alive_max_days）
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_config` 表，获取唯一配置记录；
2. 将查询到的配置（alive_max_days）写入 output 返回；
3. 若配置表为空（首次使用），返回默认值：alive_max_days=30；

**返回**：Boolean，表示查询是否完成

#### 2.4.6. 修改信息配置（updateInfoConfig）

支持配置LLM和PromptTemplate
**入参**：
- input：UpdateInfoConfigInput（继承 Input），包含以下字段：
  - alive_max_days：信息最大存活天数（可选）
- context：UpdateInfoConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateInfoConfigOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_config` 表，获取当前配置记录；
2. 若 `alive_max_days` 非空：
   a. 校验 `alive_max_days` 为正整数且 >= 1（最小保留1天），否则返回 false 并记录错误日志；
   b. 更新 alive_max_days 字段；
3. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `info_config` 表；

**返回**：Boolean，表示更新是否完成

#### 2.4.7. 信息向量化配置查看（getInfoVectorConfig）

**功能**：调用RelationDBProvider获取info_vector_config表中配置
**入参**：
- input：GetInfoVectorConfigInput（继承 Input）
- context：GetInfoVectorConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetInfoVectorConfigOutput（继承 Output），承载返回内容：
  - config：向量化配置信息（llm_id, dimension, enable）
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_vector_config` 表，获取唯一配置记录；
2. 将查询到的配置（llm_id, dimension, enable）写入 output 返回；
3. 若配置表为空（首次使用），返回默认值：enable=true, dimension=1536, llm_id 为空；

**返回**：Boolean，表示查询是否完成

#### 2.4.8. 修改信息向量化配置（updateInfoVectorConfig）

支持配置LLM和是否开启
注意：dimension只允许在没有计算过向量数据的情况下修改
**入参**：
- input：UpdateInfoVectorConfigInput（继承 Input），包含以下字段：
  - llm_id：LLM ID（可选，须为 embedding 类型模型）
  - enable：是否启用（可选）
  - dimension：向量维度（可选）
- context：UpdateInfoVectorConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateInfoVectorConfigOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_vector_config` 表，获取当前配置记录；
2. 若 `enable` 非空，更新 enable 字段；
3. 若 `llm_id` 非空：校验 LLMProvider.soLLM 中是否存在该 llm_id，且其 `llm_type` 必须为 `embedding`（向量化是嵌入任务），存在且类型正确则更新，否则返回 false 并记录错误日志；
4. 若 `dimension` 非空：
   a. 调用 RelationDBProvider.selectOneDB 检查 `info_vector` 表是否已有向量数据（count > 0）；
   b. 若已有向量数据，dimension 不允许修改（维度不匹配会导致已有向量失效），返回 false 并记录错误日志："dimension 只允许在没有计算过向量数据的情况下修改"；
   c. 若无向量数据，校验 dimension 为正整数且与模型输出维度一致（如 1536、1024、768），更新 dimension 字段，并同步重建向量表（VectorDBAccess.applyDimension）；
5. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `info_vector_config` 表；

**返回**：Boolean，表示更新是否完成

#### 2.4.9. 上下文构建配置查看（getInfoContextConfig）

**功能**：调用RelationDBProvider获取info_context_config表中配置
**入参**：
- input：GetInfoContextConfigInput（继承 Input）
- context：GetInfoContextConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetInfoContextConfigOutput（继承 Output），承载返回内容：
  - config：上下文构建配置（base_timeline_count, base_tag_relative_count, base_similarity_count, base_keyword_count, base_random_count, total）
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_context_config` 表，获取唯一配置记录；
2. 将查询到的配置写入 output 返回；
3. 若配置表为空（首次使用），返回默认值：base_timeline_count=500、base_tag_relative_count=200、base_similarity_count=150、base_keyword_count=100、base_random_count=50、total=1000；

**返回**：Boolean，表示查询是否完成

#### 2.4.10. 修改上下文构建配置（updateInfoContextConfig）

**功能**：配置上下文构建时的各来源信息加载数量
**入参**：
- input：UpdateInfoContextConfigInput（继承 Input），包含以下字段：
  - base_timeline_count：时间线基础数量（可选，须为 >= 0 的整数）
  - base_tag_relative_count：标签关联基础数量（可选，须为 >= 0 的整数）
  - base_similarity_count：相似度基础数量（可选，须为 >= 0 的整数）
  - base_keyword_count：关键词基础数量（可选，须为 >= 0 的整数）
  - base_random_count：随机基础数量（可选，须为 >= 0 的整数）
  - total：上下文总数（可选，须为 >= 1 的整数）
- context：UpdateInfoContextConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateInfoContextConfigOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_context_config` 表，获取当前配置记录；
2. 校验各入参：5 个数量类字段（base_timeline_count / base_tag_relative_count / base_similarity_count / base_keyword_count / base_random_count）必须为 >= 0 的整数，total 必须为 >= 1 的整数，非法值抛出 ValidationError；
3. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `info_context_config` 表；

**返回**：Boolean，表示更新是否完成

## 2.5. 查询接口

### 2.5.1. 滑动窗口获取last n信息（lastNInfo）

**功能**：获取最近的N条信息
**入参**：
- input：LastNInfoInput（继承 Input），包含以下字段：
  - session_id：标识用户的一个会话（可选）
  - work_id：标识一次完整的问答工作（可选）
  - interact_id：标识工作执行过程中的一次问答（可选）
  - info_id：信息 ID（可选）
  - info_type：信息类型（REQUEST/RESPONSE/THINK/SKILL/MCP/ACT/REFLECT）（可选）
  - info_creator_role：信息产生方角色（USER/LEARNING/AGENT/SKILL/MCP）（可选）
  - info_creator_id：信息产生方实例 ID（可选）
  - lastN：最近的N条信息（必选）
- context：LastNInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：LastNInfoOutput（继承 Output），承载返回内容：
  - info_list：信息内容列表
**处理流程**：

1. 构建查询条件（Condition）：将入参中所有非空字段（session_id, work_id, interact_id, info_id, info_type, info_creator_role, info_creator_id）作为 AND 条件，调用 RelationDBProvider.selectDB 按 created 倒序查询 `info_raw` 表，LIMIT lastN；
2. 遍历查询结果，对每条记录：
   a. 若 info 字段不为空：视为完整信息，直接加入结果列表；
   b. 若 info 字段为空（已被老化清理）：调用 RelationDBProvider.selectOneDB 查询 `info_summary` 表根据 info_id 获取摘要文本，将摘要作为本条信息内容加入结果列表；若摘要也不存在则跳过本条；
3. 返回处理后的信息内容列表（含 info_id, info_type, info_creator_role, created, info 字段），写入 output 返回；

### 2.5.2. 图状获取last n信息（graphNInfo）

**功能**：根据数据的关联关系获取最近的N条信息
**入参**：
- input：GraphNInfoInput（继承 Input），包含以下字段：
  - info_id：信息 ID（必选）
  - lastN：最近的N条信息（必选）
- context：GraphNInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GraphNInfoOutput（继承 Output），承载返回内容：
  - info_list：信息内容列表
**处理流程**：

1. 以 info_id 为起点，通过 GraphDB 图遍历（递归 CTE，带跳数限制与扇出熔断）在 info 引用图中遍历（非完整 BFS），权衡效率与效果：
   a. 从 info_id 出发，查询 GraphDB 中与该 info 节点相连的 `CITATION` 边，收集邻居 info 节点；
   b. 对每个邻居递归展开，按引用层级（hop）递增，最多遍历 lastN 条或直到没有更多引用；
   c. 使用 visited 集合避免重复遍历同一条消息；
2. 按引用层级（越靠近起点的越优先）和创建时间倒序排序，截取前 lastN 条；
3. 遍历结果，对每条记录判断 info 字段是否不为空：是则直接返回；否则查询 `info_summary` 表获取摘要替代；
4. 返回信息内容列表（含 info_id, info_creator_role, created, info 字段），写入 output 返回；

### 2.5.3. 语义相似topK信息（similarKInfo）

**功能**：获取语义最相似的K条信息
**入参**：
- input：SimilarKInfoInput（继承 Input），包含以下字段：
  - info：信息内容
  - topK：最相似的K条信息
  - similarity_threshold：归一化相似度阈值 0-100（可选，0=返回全部，100=仅完全匹配），低于此值结果不返回
- context：SimilarKInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SimilarKInfoOutput（继承 Output），承载返回内容：
  - list：信息记录列表（`InfoRawRecord & { score?: number }`），按相似度分数降序
**处理流程**：

1. 根据入参中的 info 文本内容，调用 LLMProvider.execLLM 使用 embedding 模型计算文本的向量；
2. 从 SQLite `info_vector` 表加载全部信息向量，逐条计算与查询向量的余弦相似度，并归一化到 0-100（与向量库余弦相似度口径一致）；
3. 过滤低于 `similarity_threshold` 的结果，按分数降序取前 topK 条；
4. 根据 info_id 列表查询 `info_raw` 表，获取每条信息的实际内容（含 info_id、info_type、info_length、created、info 等），附上相似度分数 score；
5. 返回信息内容列表（按相似度分数降序），写入 output 返回；

> 说明：info 的向量存储于 SQLite `info_vector` 表（而非 LanceDB `vector_record` 表），因此 similarKInfo 直接在 SQLite 表上做余弦相似度检索，无需经 VectorDBProvider.soVector。

### 2.5.4. 关键词搜索信息（keywordKInfo）

**功能**：获取关键词搜索最相似的K条信息
**入参**：
- input：KeywordKInfoInput（继承 Input），包含以下字段：
  - info：信息内容
- context：KeywordKInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：KeywordKInfoOutput（继承 Output），承载返回内容：
  - info_list：信息内容列表
**处理流程**：

1. 调用 nodejieba 对入参中的 info 文本内容进行分词，去除停用词，得到关键词列表；
2. 使用 SQLite FTS5 MATCH 语法，根据关键词列表通过 RelationDBProvider 在 `info_keyword` 虚拟表中执行全文搜索，得到匹配的 info_id 列表（按 FTS5 内置的相关性评分 bm25 排序）；
3. 按 info_id 聚合（每条 info 的每个关键词占一行，取最小/最优 bm25 作为该 info 的相关度），并将 bm25 做 min-max 全量归一化到 0-100（本次命中集合的 bm25 值域线性映射，最优命中为 100、最差命中为 0），附上 `keyword_score` 与 `keyword_match_count`；
4. 根据 info_id 列表调用 `getInfoByInfoId` 获取每条信息的实际内容；
5. 返回信息内容列表（按 bm25 归一化评分降序），写入 output 返回；

> 说明：`keyword_score` 为 0-100 的 min-max 全量归一化评分（本次命中集合的 bm25 值域线性映射到 [100, 0]，最优命中 = 100、最差命中 = 0）。上层上下文构建（`context`）据此按 `keyword_score_threshold`（默认 95）截断低相关命中，仅保留评分不低于阈值的消息。

### 2.5.5. 相关性搜索信息（relationKInfo）

**功能**：通过标签的相关性搜索最相关的K条信息
**入参**：
- input：RelationKInfoInput（继承 Input），包含以下字段：
  - info_id：信息 ID
  - topN：最相关的N条信息数量
- context：RelationKInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：RelationKInfoOutput（继承 Output），承载返回内容：
  - info_ids：信息 ID 列表
**处理流程**：

1. 根据 info_id 调用 RelationDBProvider.selectDB 查询 `info_tag` 表，获取该信息关联的所有 tag 列表；
2. 若 tag 列表为空（该信息尚未抽取标签）：
   a. 调用 RelationDBProvider.selectOneDB 查询 `info_tag_config` 表获取 prompt_template_id 和 llm_id；
   b. 调用 RelationDBProvider.selectOneDB 查询 `info_raw` 表获取该信息的原始内容；
   c. 将信息内容和 prompt_template_id 调用 PromptsProvider.execPrompt 生成 Prompt；
   d. 调用 LLMProvider.execLLM 得到该信息的 tag 列表；
   e. 将 tag 列表暂时用于本次搜索（也将其异步写入 `info_tag` 表以避免下次重复抽取）；
3. 根据 tag 列表调用 GraphDBProvider.getGraphNeighbors 从每个 tag 节点出发，按 `similarTo` 边遍历，读取边的 `weight`（向量相似度）作为标签相关度，聚合得到关联标签及其权重；
4. 根据关联标签列表，调用 RelationDBProvider.selectDB 反向查询 `info_tag` 表获取包含这些 tag 的 info_id 列表（多个标签命中同一 info 取最大权重），计算每个 info_id 的累计相关度；
5. 对收集到的每个 info_id 按累计相关度权重降序排列并截取 topN，调用 `getInfoByInfoId` 获取实际内容；
6. 返回完整的信息内容列表（含 `relevance_score` 相关性分数，来自 similarTo 边的 weight），写入 output 返回；

**注意**：relationKInfo 沿 `similarTo` 边遍历标签图，以边的 `weight`（向量相似度）作为标签相关度权重扩散到目标信息，使标签图召回真正按相关性排序（而非时间倒序）。`Tag相关性权重设计.md` 中描述的动态活跃度（actMap 衰减）、度数惩罚、跳数衰减、日期分布一致性等扩展公式为后续演进方向，当前实现采用边的静态相似度作为相关性权重。

### 2.5.6. 信息图结构（graphInfo）

**功能**：展示某一个session所有对话内容的图引用结构
**入参**：
- input：GraphInfoInput（继承 Input），包含以下字段：
  - session_id：会话 ID
- context：GraphInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GraphInfoOutput（继承 Output），承载返回内容：
  - graph_structure：图引用结构
**处理流程**：

1. 调用 GraphDBProvider 查询 GraphDB 中 `CITATION` 边（按 `session_id` 过滤），获取该会话中所有的消息引用关系记录（citing_info_id → cited_info_id）；
2. 调用 RelationDBProvider.selectDB 根据 `session_id` 查询 `info_raw` 表，获取该会话中所有消息的元数据（info_id, info_creator_role, created, pin）；
3. 以 info_id 为节点，引用关系（citing_info_id → cited_info_id）为有向边，在内存中构建有向图结构：
   a. 每个节点标注 role（user/assistant/system）、created（时间戳）、pin（是否钉住）；
   b. 每条边标注方向：从引用者（citing_info_id）指向被引用者（cited_info_id）；
4. 按时间顺序对节点排序，将图结构（nodes + edges）序列化为 JSON 格式写入 output 返回；
5. 若 GraphDB 中无该会话的 `CITATION` 边或 `info_raw` 表无数据，返回空图结构（nodes=[], edges=[]）；

**返回**：Boolean，表示查询是否完成；图结构通过 output 参数返回

### 2.5.7. 构建上下文（context）

**功能**：根据 session_id 构建上下文，采用单模式多维度智能混合构建。构建结果按 work_id 落盘到 `info_context_source` 表（来源 → info_id 关系），供历史上下文查看。
**入参**：
- input：ContextInfoInput（继承 Input），包含以下字段：
  - session_id：会话 ID（必选）
  - work_id：问答工作 ID（必选，作为本次上下文快照的区分维度）
  - info_id：信息 ID（可选，用于辅助检索关联消息）
  - mode：构建模式（已废弃，保留字段以兼容旧调用；不再区分 DEFAULT/CUSTOM 两种模式）
  - selected_msg_ids / custom_info_ids：复选消息 ID 列表（可选；若提供且非空，复选消息替换时间线）
  - enable_cross_session：是否允许跨会话召回（可选，默认 true；传 false 时跳过标签相关性 / 向量相似 / 关键词 / 随机全局兜底等全系统维度，仅保留会话内时间线 / 钉住 / 引用，供 Work Agent 执行子任务时规避无关历史会话污染）
- context：InfoCoreContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ContextInfoOutput（继承 Output），承载返回内容：
  - list：构建的上下文消息列表，每项对象包含：
    - `id` / `info_id`：数据唯一标识 / 消息 ID
    - `summary`：消息摘要文本
    - `info` / `content`：消息内容文本（若原始消息老化清空则自动回退使用摘要）
    - `summary_length`：消息摘要长度
    - `info_length` / `content_length`：消息内容长度
    - `info_type`：消息类型（`REQUEST` / `RESPONSE` / `SELF_LEARNING` / `AGENT` 等）
    - `collection_source`：采集方式（`PINNED` / `TIMELINE` / `CITING` / `TAG_RELATIVE` / `SIMILARITY` / `KEYWORD` / `RANDOM` / `CUSTOM` / `CURRENT`）
    - `source`：来源标注
  - categories：按来源分类的消息字典（`selected`, `pinned`, `timeline`, `citing`, `tag_relative`, `similarity`, `keyword`, `random`, `current`）
  - sources_summary：各分类消息数量汇总统计（`Record<string, number>`）
  - **三对象结构（本次新增，用于内容/属性归一化与历史查看）**：
    - `source_ids_map`：对象1，采集来源 → info_id 列表（`Record<CollectionSource, string[]>`，无 work_id 层）
    - `content_map`：对象2，info_id → 消息内容（去重）
    - `attribute_map`：对象3，info_id → 消息属性（不含内容，字段：`info_id/session_id/work_id/interact_id/info_type/info_creator_role/info_creator_id/pin/created/updated`）

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_context_config` 表获取配置：`base_timeline_count`, `base_tag_relative_count`, `base_similarity_count`, `base_keyword_count`, `base_random_count`, `total`, `priority_order`；
2. 收集**钉住消息（会话内）**：查询当前 session 下所有 `pin=1` 的消息，标记为 `PINNED`；
3. 收集**基础上下文（会话内）**：
   - 若提供 `selected_msg_ids` / `custom_info_ids`：复选消息**替换**时间线，逐条反查消息记录（会话内校验），标记为 `CITING`，不再并行采集时间线；
   - 否则：查询当前 session 下最近 `base_timeline_count` 条消息（按 created 倒序），标记为 `TIMELINE`；
4. **当前消息拆分**：最新一条消息（即本次问答输入）单独拆出，标记为 `CURRENT`，不参与时间线上下文拼接，并从弱相关维度（标签/向量相似/关键词/随机）候选中剔除，避免与任务内容重复出现；复选模式下当前输入不在复选列表内，单独取最新一条用于 CURRENT 标注与弱相关剔除；
5. **数量与比例双控制 + 动态收缩**：除钉住消息外，各弱相关维度（标签 / 向量相似 / 关键词 / 随机）限额先取「基础数量」与「`total` × 上限百分比」的较小值，再按基础上下文（钉住 + 复选/时间线）占比收缩，收缩因子 `shrinkFactor = max(0, 1 - baseContextCount / total)`；基础上下文越多，弱相关维度越少，把预算让给更明确的上下文；
6. 按收缩后的限额依次收集各弱相关维度候选消息：
   - **标签相关性消息（全系统）**：根据参考消息通过 `relationKInfo` 检索（按 similarTo 边 weight 相关度降序）；
   - **向量相似度消息（全系统）**：根据参考消息通过 `similarKInfo` 检索（按相似度分数降序）；
   - **关键词相关性消息（全系统）**：根据参考消息通过 `keywordKInfo` 检索（按 bm25 归一化评分降序），仅保留 `keyword_score >= keyword_score_threshold`（默认 95/100）的高相关命中；
   - **随机关联消息（全系统）**：从会话内未选中消息（不足时从全局）随机抽样；
7. 解析 `priority_order` 配置的维度优先级（默认：`PINNED > TIMELINE > TAG_RELATIVE > SIMILARITY > KEYWORD > RANDOM`）；`priority_order` 未列出的维度**不参与采集**（即以该列表为准，仅采集并排序已开启的维度）；
8. 按优先级顺序依次遍历各维度候选池进行**全局去重**：当某条消息被多个维度同时命中时，优先保留高优先级维度的采集归属与属性；`CURRENT` 消息若已被钉住/引用等显式维度采集则不再重复标记；
9. 对收集的所有消息填充标准数据结构（含摘要回退、内容与摘要长度计算等），内部执行轨迹（ACT trace JSON）统一剔除，错误消息（handle_result_type 非 correct）统一过滤；
10. 截取前 `total` 条，填充 `output.list`、`output.categories` 与 `output.sources_summary` 返回；
11. 组装三对象（`source_ids_map` / `content_map` / `attribute_map`）到 output（按 info_id 全局去重）；
12. 将 `source_ids_map`（来源 → info_id 关系）按 work_id 落盘到 `info_context_source` 表（幂等：先删除该 work_id 旧记录，再逐条插入），内容与属性不落库、需要时经 `info_raw` 实时回查。

### 2.5.8. 按 work_id 查询上下文（soContextByWork）

**功能**：根据 work_id 查询该次问答使用到的上下文，以三对象结构返回（供历史「思考过程」上下文查看）。
**入参**：
- input：SoContextByWorkInput（继承 Input）：
  - work_id：问答工作 ID（必选）
- output：SoContextByWorkOutput（继承 Output）：
  - source_ids_map：采集来源 → info_id 列表
  - content_map：info_id → 消息内容
  - attribute_map：info_id → 消息属性

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `info_context_source` 表，按 work_id 分组得到各来源的 info_id 列表（`source_ids_map`）；
2. 遍历所有 info_id，调用 `getInfoByInfoId` 回查 `info_raw` 表获取内容与属性；
3. 对老化清空（`info` 为空）的消息执行摘要回退（`info_summary` 表，前缀 `[摘要] `）；
4. 填充 `output.source_ids_map` / `output.content_map` / `output.attribute_map` 返回。

## 2.6. 老化清理

### 2.6.1. 检查是否处理过

#### 2.6.1.1. 是否向量化（existVectorInfo）

**功能**：根据info_id判断是否已经对信息进行向量化；
**入参**：
- input：ExistVectorInfoInput（继承 Input），包含以下字段：
  - info_id：信息 ID
- context：ExistVectorInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ExistVectorInfoOutput（继承 Output），承载返回内容：
  - exists：是否存在向量
**处理流程**：

1. 调用RelationDBProvider根据info_id查询info_vector表是否存在数据；

#### 2.6.1.2. 是否标签化（existTagInfo）

**功能**：根据info_id判断是否已经对信息进行标签化；
**入参**：
- input：ExistTagInfoInput（继承 Input），包含以下字段：
  - info_id：信息 ID
- context：ExistTagInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ExistTagInfoOutput（继承 Output），承载返回内容：
  - exists：是否存在标签
**处理流程**：

1. 调用RelationDBProvider根据info_id查询info_tag表是否存在数据；

#### 2.6.1.3. 是否压缩化（existSummaryInfo）

**功能**：根据info_id判断是否已经对信息进行压缩化；
**入参**：
- input：ExistSummaryInfoInput（继承 Input），包含以下字段：
  - info_id：信息 ID
- context：ExistSummaryInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ExistSummaryInfoOutput（继承 Output），承载返回内容：
  - exists：是否存在摘要
**处理流程**：

1. 调用RelationDBProvider根据info_id查询info_summary表是否存在数据；

### 2.6.2. INFO 老化清理（delInfo）

**功能**：按照时间进行正序排序，获取大于某个时间的INFO信息，仅清空 info 字段内容（设为 ""），不删除整条记录。钉住的消息（pin=true）跳过不清理。清理前确保至少有一种索引（向量/标签/摘要）存在。**向量数据、标签关联、关键词索引不会被清理，保留用于后续的语义搜索、关键词搜索和标签相关性搜索。**
**入参**：
- input：DelInfoInput（继承 Input）
- context：DelInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：DelInfoOutput（继承 Output），承载返回内容：
  - deleted_count：清理的信息数量
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_config` 表获取 `alive_max_days` 配置值；
2. 计算允许存活的最早时间戳：`expire_before = now() - alive_max_days * 86400`（秒）；
3. 调用 RelationDBProvider.selectDB 查询 `info_raw` 表，条件为 `created < expire_before AND info != '' AND pin = false`（已过期且未钉住且未被清空），获取过期的信息记录列表；
4. 遍历过期信息列表，对每条记录：
   a. 调用 `existVectorInfo(info_id)` 检查是否已向量化 → 若未向量化且 `info_vector_config.enable = true`，调用 `vectorInfo(info_id)` 进行补向量化（保留信息的语义索引）；
   b. 调用 `existTagInfo(info_id)` 检查是否已标签化 → 若未标签化且 `info_tag_config.enable = true`，调用 `tagInfo(info_id)` 进行补标签抽取；
   c. 调用 `existSummaryInfo(info_id)` 检查是否已摘要化 → 若未摘要化且 `info_summary_config.enable = true`，调用 `summaryInfo(info_id)` 生成摘要（后续通过摘要可检索到该信息）；
5. 对于已确保至少有一种索引（向量/标签/摘要）存在的过期记录，调用 RelationDBProvider.updateDB 将该记录的 info 字段置为空字符串（`""`），保留其他字段（id, created, session_id, work_id 等）不变。**向量（info_vector）、标签（info_tag）、关键词（info_keyword）数据保持不变；**
6. 将清理的信息数量（deleted_count）写入 output 返回；

**设计说明**：老化清理仅清空原始内容以节省存储空间，向量、标签、关键词等索引数据全部保留。在构建上下文时，若通过语义相似度、关键词或标签匹配到已老化的信息，系统自动以 `[摘要] {summary}` 格式使用该信息的摘要内容替代原始内容。

**调度方式**：`delInfo` 由服务入口（dev-server.ts）在**启动时**执行一次，并注册**每日午夜 0:00** 的定时任务（与 MQ 过期消息清理同一模式），使 `alive_max_days` 配置真正生效。

### 2.6.3. 按 work 删除信息（delInfoByWork）

**功能**：按 work_id 删除该次问答落库的全部信息及其派生数据，供需求确认「取消（CANCEL）」丢弃被取消的提问。
**入参**：
- input：DelInfoByWorkInput（继承 Input），包含字段：
  - work_id：工作 ID（必选）
- context：InfoCoreContext（继承 Context），会话上下文
- output：DelInfoByWorkOutput（继承 Output），承载返回内容：
  - deleted_count：删除的 info_raw 记录数量
**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `info_raw` 表，按 work_id 收集所有 info_id；
2. 若 info_id 非空，级联删除派生表：`info_tag` / `info_summary` / `info_keyword` / `info_vector`（按 info_id IN），并调用 `delInfoGraph(info_ids)` 删除 GraphDB 中该信息的引用节点与边（共享的标签/关键词文本节点不在此清理）；
3. 调用 RelationDBProvider.deleteDB 删除 `info_raw` 中该 work 的记录，并删除 `info_context_source` 中该 work 的上下文快照关系；
4. 将删除数量（deleted_count）写入 output 返回。

**设计说明**：与 `delInfo`（老化清空内容、保留索引）相反，`delInfoByWork` 是「彻底删除」语义——被取消的提问不应在对话历史 / ChatMap 中留下任何痕迹，因此主表与派生索引一并删除。

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

1. `context` 的默认构建模式默认会做「全系统」跨会话召回（标签相关性 / 向量相似 / 关键词 / 随机全局兜底）；当 `enable_cross_session=false` 时跳过这些跨会话维度，仅保留会话内时间线 / 钉住 / 引用，供 Work Agent 子任务执行时规避无关历史会话污染（2026-08-24 新增）。
2. `context` 构建不再区分 DEFAULT/CUSTOM 两种模式（`mode` 字段废弃保留）：复选消息（`selected_msg_ids` / `custom_info_ids`）在提供时**替换**时间线（标记为 `CITING`），其余维度逻辑不变；除钉住消息外，各弱相关维度限额按基础上下文占比动态收缩（2026-08-25 重构）。
3. `relationKInfo` 标签图召回改为以 `similarTo` 边的 `weight`（向量相似度）作为相关度权重，按累计相关度降序返回，使标签图召回真正按相关性排序（2026-08-25 重构）。

## 3. 表设计

### 3.1. 原始INFO表（SQLite）

- 表名：info_raw
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话ID | UUID | N | | |
| work_id | 问答工作ID | UUID | N | | |
| interact_id | 交互ID | UUID | N | | |
| info_id | 信息ID | UUID | N | | |
| info_type | 信息类型 | VARCHAR | N | 普通索引 | REQUEST/RESPONSE/THINK/SKILL/MCP/ACT/REFLECT |
| info_creator_role | 信息产生方角色 | VARCHAR | N | | USER/LEARNING/AGENT/SKILL/MCP |
| info_creator_id | 信息产生方实例ID | UUID | N | 普通索引 | USER/LEARNING 为空 |
| info | 信息内容 | TEXT | N | | |
| info_length | 信息长度 | INT | N | | |
| pin | 是否钉住本消息 | BOOL | N | | |

### 3.2. 图结构信息（GraphDB）

信息引用关系存储于 GraphDB（`graph_node` / `graph_edge`，见 GraphDBProvider-PRD）：

- info 节点：`node_type = 'info'`，`content = { info_id, session_id, info_preview }`；
- 引用边：`edge_type = 'CITATION'`，`from_node_id`（引用者）→ `to_node_id`（被引用者），`properties = { citing_info_id, cited_info_id, session_id }`。

### 3.3. 信息向量表（MiniVectorDB）

- 表名：info_vector
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| info_id | 信息ID | UUID | N | | |
| embedding | embedding向量（维度由 info_vector_config.dimension 决定，默认 1536） | embedding | N | | |

### 3.4. INFO标签表（SQLite）

- 表名：info_tag
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| tag | 标签 | VARCHAR | N | 普通索引 | |
| info_id | 信息ID | UUID | N | 普通索引 | |

注意：tag 和 info_id 构成联合唯一索引

### 3.5. INFO标签向量表（MiniVectorDB）

- 表名：info_tag_vector
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| tag_id | 信息ID | UUID | N | | |
| embedding | embedding向量（维度由 info_vector_config.dimension 决定，默认 1536） | embedding | N | | |

### 3.6. INFO标签配置表（SQLite）

- 表名：info_tag_config
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | UUID | N | 普通索引 | |
| prompt_template_id | prompt模板ID | UUID | N | | |
| tag_top_k | 标签相似top_k | INT | N | | 默认为5 |
| enable | 启用/禁用信息标签 | BOOL | N | | 默认打开 |

### 3.7. INFO摘要配置表（SQLite）

- 表名：info_summary_config
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | UUID | N | 普通索引 | |
| prompt_template_id | 信息压缩prompt模板ID | UUID | N | | |
| enable | 启用/禁用信息压缩 | BOOL | N | | 默认打开 |
| threshold | 摘要生成阈值（内容字符数不超过该值时直接以原文作为摘要） | INT | N | | 默认 100 |
| info_types | 需要生成摘要的信息类型白名单（逗号分隔） | TEXT | N | | 默认 RESPONSE |

### 3.8. INFO配置表（SQLite）

- 表名：info_config
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| alive_max_days | 信息最大存活天数 | INT | N | | |

### 3.9. INFO向量配置表（SQLite）

- 表名：info_vector_config
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | UUID | N | | |
| dimension | 向量维度 | INT | N | | 要与模型保持一致 |
| enable | 启用/禁用信息向量化 | BOOL | N | | 默认打开 |

### 3.10. INFO摘要表（SQLite）

- 表名：info_summary
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| info_id | 信息ID | UUID | N | 普通索引 | |
| summary | 信息摘要 | TEXT | N | | |

### 3.11. INFO Keyword表（SQLite）

- 表名：info_keyword
- 库名：info
- 说明：普通表（非 FTS5 虚拟表），按 info_id + word 存储关键词索引，写入时由 keywordInfo 去重

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| info_id | 信息ID | UUID | N | | |
| word | 分词 | VARCHAR | N | | |

### 3.12. 上下文构建配置表（SQLite）

- 表名：info_context_config
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| base_timeline_count | 基于时间线的信息加载数量 | INT | N | 普通索引 | 默认500 |
| base_tag_relative_count | 基于tag相关性的信息加载数量 | INT | N | | 默认200 |
| base_similarity_count | 基于语义相似度的信息加载数量 | INT | N | | 默认 150 |
| base_keyword_count | 基于关键词搜索的信息加载数量 | INT | N | | 默认100 |
| base_random_count | 随机联想的信息加载数量 | INT | N | | 默认50 |
| random_max_percent | 随机消息采集数量上限百分比（占 total） | INT | N | | 默认20 |
| tag_relative_max_percent | 标签关联消息采集数量上限百分比（占 total） | INT | N | | 默认20 |
| similarity_max_percent | 语义相似消息采集数量上限百分比（占 total） | INT | N | | 默认15 |
| keyword_max_percent | 关键词消息采集数量上限百分比（占 total） | INT | N | | 默认10 |
| keyword_score_threshold | 关键词 bm25 归一化评分截断阈值（0-100） | INT | N | | 默认95，仅保留评分不低于该值的命中 |
| total | 上下文总数 | INT | N | | 默认为1000 |
| enable_snapshot_persistence | 启用上下文快照持久化 | INT | N | | 默认1 (true) |
| priority_order | 维度优先级顺序 | TEXT | N | | 默认 PINNED,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM |

### 3.13. 上下文采集来源表（SQLite）

- 表名：info_context_source
- 库名：info
- 说明：保存每次问答（work_id）构建上下文时，各采集来源命中的 info_id 关系。内容与属性不落库，需要时经 info_raw 实时回查。

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| work_id | 问答工作ID | UUID | N | 普通索引 | 上下文区分维度 |
| source | 采集来源 | VARCHAR | N | 联合索引 | CollectionSource 枚举（PINNED/TIMELINE/CITING/TAG_RELATIVE/SIMILARITY/KEYWORD/RANDOM/CUSTOM/CURRENT） |
| info_id | 信息ID | UUID | N | | 命中的消息 ID |

## 4. HTTP 路由映射（dev-server.ts 装配）

InfoCore 的业务方法通过 `dev-server.ts` 手写路由分发暴露给前端「信息」页面。以下路由均直接读取 `info_raw` / `info_tag` / `info_keyword` 等表，将 info 记录映射为前端 `MemoryItem`（`{ id, type, content, tags, confidence, createdAt, updatedAt }`）。

| 方法 | 路由 | 数据来源 | 说明 |
| :--- | :--- | :--- | :--- |
| GET | `/api/memory/list` | `info_raw` + `info_tag` | 按 created 倒序取最近 500 条信息，批量关联标签，映射为 `MemoryItem` |
| GET | `/api/memory/search?keyword=&type=&limit=` | `info_raw` + `info_tag` | 内容/标签 LIKE 搜索；`type` 为前端类型（semantic/episodic/procedural/working），映射到 `info_type` 集合 |
| GET | `/api/memory/tags` | `info_tag` | 去重标签列表（按频次降序） |
| GET | `/api/memory/tag/:userId/:tag` | `info_raw` JOIN `info_tag` | 按标签文本查询关联信息，映射为 `MemoryItem` |
| GET | `/api/memory/tag-graph` | GraphDB | Tag 共现图：节点为去重标签（weight=节点 content.freq），边为同一 info 上标签的共现对（`cooccur` 边） |
| GET | `/api/memory/keyword-graph` | GraphDB | 关键词共现图：节点为去重关键词（weight=节点 content.freq），边为同一 info 上关键词的共现对（`keywordCooccur` 边） |
| GET | `/api/memory/stats/:userId` | `info_raw` | 统计信息总数及按 `info_type` 分布 |
| DELETE | `/api/memory` | `info_raw` + 派生表 | 按 `info_ids` 批量删除记忆，级联清理 `info_tag` / `info_summary` / `info_keyword` / `info_vector`，并删除 GraphDB info 节点与引用边 |

### 4.1 info_type → 前端展示类型映射

| info_type | 前端 type | 展示含义 |
| :--- | :--- | :--- |
| REQUEST | episodic | 用户请求（情景记忆） |
| RESPONSE | semantic | 模型回复（语义知识） |
| THINK / REFLECT / SKILL / MCP | procedural | 思考/反思/技能/MCP（程序性记忆） |
| ACT | working | Agent 行动（工作记忆） |

### 4.2 Tag 图 / 关键词图说明

Tag 图与关键词图采用 **共现（co-occurrence）** 策略构建边：两个标签（或关键词）出现在同一条 info 记录上即建立一条边，边权重为共现次数。该策略不依赖向量相似度（`similarTo` 边），保证在未完成向量化或标签建图时也能稳定展示关联网络。`graphTag` 构建的 `similarTo` 边仍用于 `relationKInfo` 相关性搜索与图搜索（`/api/memory/graph-search`）。

共现关系同时持久化到 GraphDB：`tagInfo` 在保存时为同一 info 的标签两两建立 `cooccur` 边（边类型 `cooccur`，权重为共现次数），`rebuildCooccurGraph` 用于存量数据全量回填。这样 GraphDB 的边数（「监控 > 系统健康 > GraphDB」）与标签图展示一致，不再依赖向量化。

## 5. 变更记录

### [2026-09-09] saveInfo 支持传入真实创建时间（修复对话区消息顺序颠倒）
**变更原因**：Runtime v2 会话同步（ChatService.syncRuntimeMessagesToInfoRaw）在 run 结束后统一调 saveInfo，未携带真实消息时间 → 同一轮 user/assistant 落库同一 `created`；历史查询 `lastNInfo` 按 `created DESC` 排序对同时间戳记录次序不稳定，前端同时间戳 tie-break 又落入 UUID 字符串比较 → 对话区出现"用户消息显示在系统回复下面"的随机颠倒。同时按 `(session_id, info, created)` 去重的条件因落库时间与消息时间错位而恒不匹配，重复同步存在重复插入风险。

**修改的方法**：
  - `SaveInfoInput` — 新增可选 `created?: number`（消息真实创建时间，毫秒；缺省行为不变）；
  - `InfoCoreService.saveInfo` — 原代码：`info_raw.created/updated` 一律取保存时刻 `now`（原行已注释保留）；修改后：`createdAt = input.created > 0 ? input.created : now`，`info_raw` 写入真实时间。

**影响的端点**：
  - 所有经 `saveInfo` 落库的调用方（向后兼容：未传 `created` 的行为与原实现一致）；
  - `ChatService.syncRuntimeMessagesToInfoRaw` — 传入 `runtime_message.created`（见 Chat-PRD 变更记录），历史查询天然有序、去重条件成立。

**可能存在的问题**：
  - 存量 V2 数据（已以保存时刻时间落库）时间戳不可追溯；显示层由前端角色 tie-break 兜底（同时间戳 user 恒在前）。

### [2026-08-22] info_raw 新增 trace_id 列并随 saveInfo 落库

**变更原因**：trace_id 此前仅停留在 SSE 事件与 `orchestration_work.metadata`，未随消息落库，历史加载后无法还原真实 trace_id，导致前端「复制 TraceId」复制到 work_id。

**修改的方法**：
- `InfoCoreService.saveInfo` — 写入 `info_raw.trace_id` 字段（取自 `SaveInfoInput.trace_id`）；
- `InfoCoreService.toInfoRawRecord` / `InfoRawRecord` — 透传 `trace_id`；
- `InfoCoreSchemaInitializer` — `info_raw` 新增 `trace_id` 列（含迁移与 `idx_info_raw_trace_id` 索引）。

**影响的端点**：
- 所有经 `saveInfo` 落库的消息（REQUEST / RESPONSE / 错误回复等），以及依赖 `lastNInfo` / `getChatHistory` 读取 `info_raw` 的历史查询接口。

**可能存在的问题**：
- 历史旧数据 `trace_id` 为空，回退展示 `work_id`；`trace_id` 仍依赖上层编排在各 `saveInfo` 调用处携带。

### [2026-08-22] context 将当前消息从时间线中拆出为 CURRENT 类型

**变更原因**：WorkAgent 输入 Prompt 的 `<时间线消息>` 中包含了本次问答输入（与 `task_content` 重复）。

**修改的方法**：
- `InfoCoreService.context()` — 默认构建模式下，时间线最新一条消息拆出为 `CURRENT`（`CollectionSource.CURRENT`），不参与时间线/弱相关维度采集，作为独立 `current` 分类落盘 `info_context_source`；
- 新增 `CollectionSource.CURRENT` 枚举、`ContextInfoCategories.current`、`category_ids.current` 与 `sources_summary.current` 字段。

**影响的端点**：
- 后端 InfoCore `context` 的调用方（`OrchestrationEntry.buildWorkContext` / JSONNode `BUILD_WORK_CONTEXT` / `AgentExecution.execAgent` 内部），以及历史「思考过程」上下文（`soContextByWork`）的 `CURRENT` 来源展示。

**可能存在的问题**：
- 若当前输入尚未保存至 `info_raw`，时间线最新一条可能为历史 RESPONSE（被误拆为 CURRENT）；标准编排流程由 `SAVE_USER_INPUT` 节点先落库，正常不受影响。

### [2026-08-23] MemoryItem.confidence 由硬编码改为按规则计算

**变更原因**：`mapInfoToMemory` 此前对所有记忆固定返回 `confidence: 1`（前端「置信度」恒为 100%），属占位假数据。改为基于记忆自身属性的规则计算，使置信度真实反映记忆的可信程度。

**置信度定义**：`confidence = 来源可信度（info_type 基础分） + 语义加工增益`，四舍五入保留 2 位小数，收敛到 `[0.05, 0.95]`。

- 来源可信度（info_type → 基础分）：
  - `SELF_LEARNING` 0.6、`REQUEST` 0.55、`RESPONSE` 0.5、`SKILL`/`MCP`/`AGENT` 0.45、`ACT` 0.4、`REFLECT` 0.35、`THINK` 0.3、其他 0.5。
- 语义加工增益：
  - 标签数：`min(标签数, 5) × 0.04`（最多 +0.2）；
  - 内容长度 ≥ 100 字符：+0.05；
  - `pin = 1`（用户钉住）：+0.1。

**修改的方法**：
- `dev-server.ts#mapInfoToMemory` — 恢复 `confidence` 字段，改为调用 `computeMemoryConfidence`；
- `dev-server.ts#computeMemoryConfidence` — 新增置信度计算函数；
- `dev-server.ts` 记忆 list/search/tag 三条 SQL — `info_raw` 查询新增 `pin` 列。

**影响的端点**：
- `GET /api/memory/list`、`GET /api/memory/search`、`GET /api/memory/tag/:userId/:tag` 返回的 `MemoryItem.confidence` 由恒为 1 变为 0.05~0.95 的真实置信度。

**可能存在的问题**：
- 置信度为规则估算而非 LLM 评分，语义加工增益仅覆盖标签/长度/钉住维度，未纳入向量相似度与引用关系；后续可扩展。

### [2026-08-23] context 召回剔除内部执行轨迹（ACT trace），防止 LLM 输入超限

**变更原因**：Work Agent 的完整 ReACT trace（info_type=ACT、内容为 `{"type":"trace",...}` 的超大 JSON，含每轮完整 prompt/response）被落库到 `info_raw` 后，`context` 的时间线/标签/向量/关键词/随机召回不区分 info_type，将其重新拼入上下文，导致后续 Agent 的 Prompt 输入超限（实测单 session 7 条 trace 合计约 270 万字符，过滤后仅剩约 3.5 万字符）。

**修改的方法**：
- `InfoCoreService.context` — 组装候选映射表前，对 PINNED / CITING / TIMELINE / TAG_RELATIVE / SIMILARITY / KEYWORD / RANDOM 全部维度统一 `withoutTraces` 过滤；
- `InfoCoreService.isTraceInfo`（新增私有方法）— 识别 `info_type === ACT` 且 `info` 以 `{"type":"trace"` 开头的内部执行轨迹记录。

**影响的端点**：
- 后端编排链路中 WorkAgent / PlannerAgent / WriterAgent 的上下文构建（`InfoCore.context`）。

**可能存在的问题**：
- 仅剔除内部执行轨迹；正常的 REQUEST / RESPONSE / THINK / REFLECT 等语义内容仍参与召回；trace 记录仍落库用于 ChatMap/思考过程展示，仅不再作为 LLM 上下文。

### [2026-08-24] context 上下文快照冻结：仅问答请求处理时落盘，内部 Agent 复用不再覆盖

**变更原因**：`info_context_source` 快照由 `InfoCoreService.context()` 每次调用都「先删后插」落盘。同一 work 在 IntentAgent（fetchPinnedInfo）、buildWorkContext、BUILD_WORK_CONTEXT、以及后续 execAgent / Planner / Writer 内部会多次复用 `context()`，导致快照被反复覆盖：时间线推进后混入「本次问答之后」的消息，且随机采样（Math.random）与向量/关键词/标签召回（索引持续更新）的弱相关维度在后续重采时结果漂移，最终「思考过程」弹窗展示的上下文与问答处理时实际执行使用的上下文不一致。

**修改的方法**：
- `ContextInfoInput` — 新增 `persist_snapshot?: boolean`（默认 true，仅问答请求处理时落盘）；
- `InfoCoreService.context` / `fillContextTriplesAndPersist` — 增加 `persist` 参数，仅 `persist_snapshot !== false` 时才调用 `persistContextSourceMap`（CUSTOM 与 DEFAULT 两种构建模式均条件化）；
- 内部 Agent 复用 `context()` 的调用点（`AgentExecutionService.execAgent`、`PlannerAgentService`、`WriterAgentService`、`IntentAgentService.fetchPinnedInfo`）— 显式传 `persist_snapshot: false`，仅取查询结果、不覆盖权威快照；
- 权威快照落盘点收敛为 JSONNode `BUILD_WORK_CONTEXT`（`JSONNodeService.handleBuildWorkContext` 显式传 `persist_snapshot: true`，其在 `SAVE_USER_INPUT` 之后执行，当前 REQUEST 已落库，快照完整）；入口 `OrchestrationEntry.buildWorkContext` 显式传 `persist_snapshot: false`（其在 `SAVE_USER_INPUT` 之前执行，快照的 CURRENT 会误识别，故不落盘）。快照全程按 `work_id` 请求（`soContextByWork`）、生成（`context`）、落盘（`persistContextSourceMap`）。

**影响的端点**：
- 历史「思考过程」上下文（`soContextByWork`）— 快照冻结在问答请求处理时（BUILD_WORK_CONTEXT），不再混入问答之后的消息、随机/语义召回结果固定；
- 权威上下文构建（JSONNode `BUILD_WORK_CONTEXT`）— 按同一 `work_id` 生成并落盘快照，展示与执行一致。

**可能存在的问题**：
- 暂停等待确认（paused）的 work 在确认重跑前仅由 IntentAgent 阶段处理，此时 `persist_snapshot: false` 不落盘，快照在确认重跑后的 `BUILD_WORK_CONTEXT` 阶段才写入（与现有「暂停 work 思考过程仅展示 Intent 块」行为一致）。

### [2026-08-25] GraphDB 持久化共现边（cooccur），修复「系统健康 GraphDB 无边」

**变更原因**：GraphDB 的边此前仅有 `similarTo`（标签语义相似）一种，依赖 `info_vector_config.llm_id` 生成 embedding 并在 VectorDB 检索相似标签。当 embedding 链路不可用（向量配置指向已删除模型、无 embedding 模型启用）时，`searchSimilarTags` 恒返回空，GraphDB 只有 463 个 `Tag` 节点却 0 条边，与「涌现」标签图 /「关键词图」展示的共现边不一致。

**修改的方法**：
- `InfoCoreService.tagInfo` — 标签落库后调用 `buildCooccurEdges(tags)`，为同一 info 上的标签两两建立 `cooccur` 边；
- `InfoCoreService.buildCooccurEdges` / `upsertCooccurEdge`（新增私有方法）— 按标签文本规范化方向建立/累加 `cooccur` 边（权重为共现次数，幂等）；
- `InfoCoreService.rebuildCooccurGraph`（新增）— 删除旧 `cooccur` 边后从 `info_tag` 表按 `info_id` 分组全量重建，用于存量回填；
- `InfoCoreAccess.rebuildCooccurGraph` + `RebuildCooccurGraphInput/Output` — 暴露回填入口；
- `dev-server.ts` — 启动时调用 `rebuildCooccurGraph` 一次性回填存量标签共现边。

**影响的端点**：
- `GET /api/monitor/health-all` — GraphDB 组件「边」计数由 0 变为真实共现边数；
- 所有经 `saveInfo` 触发 `tagInfo` 的消息，新增标签时同步写入 GraphDB `cooccur` 边。

**可能存在的问题**：
- `cooccur` 边暂未被 `relationKInfo` / 图搜索（`/api/memory/graph-search`）消费，仅用于 GraphDB 健康计数与图数据完整性；后续可让图搜索同时遍历 `cooccur` 边；
- 存量回填为启动时一次性执行，若 `info_tag` 因 `delInfo` 级联删除而减少，已存在的 `cooccur` 边不会自动衰减，需再次重启触发重建。

### [2026-08-25] 图结构收敛到 GraphDB：删除 info_graph 表，引用边迁移为 CITATION 边

**变更原因**：info↔info 引用关系此前双轨并存——`info_graph` 表（RelationDB）存引用边、GraphDB 存 `similarTo`/`cooccur` 标签边；且 `ensureInfoGraphNode` 为死代码，GraphDB 无 `info` 节点，`graphNInfo` 恒返回空。为消除旧式关系库存边的代码逻辑，将图结构统一收敛到 GraphDB（SQLite + CTE）。

**修改的方法**：
- `InfoCoreService.saveInfo` — 不再写 `info_graph`；改为 `connectCitationEdges`（确保 info 节点 + 建 `CITATION` 边，边 properties 存 `citing_info_id`/`cited_info_id`/`session_id`）；
- `InfoCoreService` 新增 `soCitationEdges`（查 CITATION 边）、`delInfoGraph`（级联删 info 节点与边）、`rebuildCitationGraph`（迁移旧表并 DROP）；删除 `createGraphEdges`；
- `InfoCoreSchemaInitializer` — 移除 `info_graph` 表与索引；
- `ChatService.deleteSession` / 消息列表、`VisualizationService`、`UserProfileService`、`dev-server.ts DELETE /api/memory` — 引用边读写全部改走 `InfoCoreAccess.soCitationEdges` / `delInfoGraph`；
- 删除 `InfoGraphRecord` / `INFO_GRAPH_TABLE` 类型与常量。

**影响的端点**：
- `graphInfo` / 消息图可视化 / 会话删除 / 用户画像「引用频次」等全部改为读取 GraphDB CITATION 边；
- 启动时一次性迁移旧 `info_graph` 存量数据到 GraphDB 并 DROP 旧表。

**可能存在的问题**：
- 旧 `info_graph` 表仅在启动迁移后被 DROP，干净新库无此表；迁移失败时旧表保留但不再被读写；
- `graphNInfo` 依赖 GraphDB info 节点，现仅对存在引用关系的 info 建节点（无引用的 info 无节点）。

### [2026-08-25] 图逻辑全收敛到 GraphDB：关键词建图 + 关联图端点改读 GraphDB + 递归 CTE 遍历

**变更原因**：「涌现」标签图 /「关键词图」端点此前从 RelationDB 实时算共现，关键词甚至从未建图；图遍历（getGraphNeighbors）此前为应用层迭代 BFS，与 PRD「SQLite + CTE」口径不符。为落实「所有图逻辑走 GraphDBProvider」这一硬性约束，将标签/关键词共现图完全落图，前端关联图改读 GraphDB，遍历改为 SQLite 递归 CTE。

**修改的方法**：
- `GraphDBComponent.queryNeighborsByCTE`（新增）— 原生 SQL `WITH RECURSIVE` 多跳遍历（方向 / edge_type / is_active / 深度 / 扇出熔断）；
- `GraphDBService.getGraphNeighbors` — 由应用层迭代 BFS 改为调用递归 CTE；
- `InfoCoreService.keywordInfo` — 关键词落库后调用 `buildKeywordCooccurEdges` 建 `keyword` 节点 + `keywordCooccur` 边；
- `InfoCoreService` 泛化共现建图：`ensureTextNode` / `buildCooccurEdgesForType` / `upsertCooccurEdgeForType` 同时支撑标签与关键词；`rebuildCooccurGraph` 同时回填标签与关键词共现边；
- `dev-server.ts` `/api/memory/tag-graph` 与 `/api/memory/keyword-graph` — 改从 GraphDB 读节点与共现边（频次由 RelationDB 统计补齐，属上层统计而非图结构）。

**影响的端点**：
- `GET /api/memory/tag-graph`、`GET /api/memory/keyword-graph` — 图结构（节点/边/共现权重）改由 GraphDB 提供；
- 所有经 `saveInfo` 触发 `tagInfo` / `keywordInfo` 的消息，同步写 GraphDB 标签/关键词节点与共现边。

**可能存在的问题**：
- 节点展示频次仍从 `info_tag` / `info_keyword` 统计补齐（未存于 GraphDB 节点 content），若后续要求节点属性完全自包含需迁移频次入节点；
- 孤立标签/关键词（未与其它项共现）已通过 `buildCooccurEdgesForType` 预先建节点，保证节点完整；但历史存量需重启触发 `rebuildCooccurGraph` 回填。

### [2026-08-25] 节点属性（频次）完全迁入 GraphDB，关联图不再依赖关系数据库

**变更原因**：上一版「涌现」/「关键词图」端点的节点频次仍由 RelationDB（info_tag / info_keyword）统计补齐，违反「节点属性应存于图数据库」的原则。

**修改的方法**：
- `InfoCoreService.ensureTextNode` — 节点 content 新增 `freq` 属性（频次），`incrementFreq` 参数支持每次标签/关键词出现时 freq+1；
- `InfoCoreService.findGraphNode`（新增）— 返回完整节点记录（替代仅返回 ID 的 `findGraphNodeId`）；
- `InfoCoreService.tagInfo` / `keywordInfo` — 落库 info_tag / info_keyword 时同步 `ensureTextNode(..., true)` 累加节点频次；
- `InfoCoreService.rebuildCooccurForSource` — 重建时删除该 node_type 全部节点并重建（content 含频次），共现边去重后按共现次数赋权；
- `dev-server.ts buildCooccurGraphFromGraphDB` — 节点权重改读 GraphDB 节点 `content.freq`，不再查 RelationDB。

**影响的端点**：
- `GET /api/memory/tag-graph`、`GET /api/memory/keyword-graph` — 节点、边、节点频次、共现权重全部由 GraphDB 提供。

**可能存在的问题**：
- `rebuildCooccurGraph` 仍以 `info_tag` / `info_keyword` 表为回填数据源（这是标签/关键词的权威内容存储，非图结构）；运行时增量写入以 GraphDB 为准。

### [2026-08-25] 关联图可观测性：节点限流 + 一键清理 + 搜索定位

**变更原因**：关键词图节点过多（数百节点、数千边）导致前端力导向图不可观测；且缺少一键清理与按节点定位能力。

**修改的方法**：
- `InfoCoreService.clearGraph`（新增）— 按 node_type 删除该类型全部节点（级联删边与激活数据）；
- `dev-server.ts buildCooccurGraphFromGraphDB` — 新增 `limit`（默认 100）：按频次降序取前 N 节点，只返回这些节点之间的边；
- `dev-server.ts` `GET /api/memory/tag-graph` / `GET /api/memory/keyword-graph` — 支持 `limit` 查询参数（1~500）；
- `dev-server.ts` `DELETE /api/memory/tag-graph` / `DELETE /api/memory/keyword-graph`（新增）— 一键清理对应图。

**影响的端点**：
- `GET /api/memory/tag-graph?limit=`、`GET /api/memory/keyword-graph?limit=` — 返回限流后的图；
- `DELETE /api/memory/tag-graph`、`DELETE /api/memory/keyword-graph` — 删除全部节点与边。

**可能存在的问题**：
- 一键清理只删 GraphDB 节点/边，不删 `info_tag` / `info_keyword` 表数据；重启后 `rebuildCooccurGraph` 会从表回填重建图。

### [2026-08-25] 向量化按 chunk_size 分块（递归分隔符 + 重叠），检索聚合去重

**变更原因**：长文本 info 整段生成单个 embedding，语义被稀释、跨段落相似度失真；相似信息检索一个 info 只有一个向量，命中精度低。

**修改的方法**：
- `Base/ChunkProvider` 新增 `RecursiveTextSplitter`（LangChain 风格递归分隔符 + 重叠）；
- `InfoCoreService.vectorInfo` — 按 `chunk_size` 拆分（分隔符 + 重叠），逐块生成 embedding 写入 LanceDB；单 chunk 时向量 id = info_id（兼容历史），多 chunk 时为 `info_id#1…`；
- `InfoCoreService.similarKInfo` — 检索放大 topK（topK×3）后按 info_id 去重聚合取最高分，截回 topK；命中 chunk 片段收集到 `matched_chunks`；
- `info_vector_config` 表新增 `chunk_size`（默认 512）/ `chunk_overlap`（默认 64），`UpdateInfoVectorConfigInput` 支持这两个字段。

**影响的端点**：
- `POST /api/memory/similar`（similarKInfo）— 返回 `matched_chunks` 字段（命中原文片段）；
- 向量化配置更新接口 — 支持 `chunk_size` / `chunk_overlap`。

**可能存在的问题**：
- 存量已向量化的长文本不会自动重新分块，需重建向量表后重新向量化；
- chunk 拆分后同一 info 的多个 chunk 命中会被聚合，`score` 取最高分。

### [2026-08-26] keywordKInfo 改用 FTS5 MATCH + bm25，并新增 delInfoByWork

**变更原因**：
1. `keywordKInfo` 此前用 `word IN (...)` 等值匹配 + 命中次数排序，未按 PRD 2.5.4 使用 SQLite FTS5 MATCH 语法与 bm25 相关性评分，检索排序与构建逻辑不符；
2. 需求确认「取消」需要彻底移除被取消提问已落库的信息，缺一个按 work_id 级联删除的入口。

**修改的方法**：
- `InfoCoreService.keywordKInfo` — 改为 `info_keyword` FTS5 虚拟表 `MATCH`（关键词 `word:"..." OR ...` 组合）检索，按 `bm25` 升序（相关性降序）返回；按 info_id 聚合取最小（最优）bm25，保留 `keyword_match_count`；FTS5 语法异常时降级为空结果；
- `InfoCoreService.delInfoByWork` / `InfoCoreAccess.delInfoByWork` — 新增按 work_id 级联删除 `info_raw` 及 `info_tag` / `info_summary` / `info_keyword` / `info_vector` / `info_context_source` 派生表与 GraphDB 引用节点边的方法。

**影响的端点**：
- `InfoCore.keywordKInfo` — 返回按 bm25 相关性排序的匹配消息列表；
- `InfoCore.delInfoByWork` — 供需求确认 CANCEL 流程删除已落库信息。

**可能存在的问题**：
- bm25 针对「每 info 每关键词一行」的行打分，经 info_id 聚合取最优值近似整条 info 的相关度，与按文档全文索引的 bm25 口径存在差异；`word` 列限制匹配避免误命中 `info_id` 列。

### [2026-08-26] 弱相关维度数量+比例双控制 + 关键词 bm25 评分截断

**变更原因**：
1. 关键词 / 标签关联 / 语义相似三个弱相关维度仅有「基础数量」单一控制，缺少「占 total 上限百分比」的比例控制，弱相关维度可能挤占上下文预算（随机维度已有 `random_max_percent` 但重构后未实际生效）；
2. 关键词匹配缺少 bm25 评分截断，低相关命中会混入上下文。

**修改的方法**：
- `InfoCoreService.context` — 弱相关维度限额改为「数量+比例双控制」：`min(base_xxx_count, floor(total × xxx_max_percent / 100)) × shrinkFactor`，其中 `random_max_percent` 重新生效，新增 `tag_relative_max_percent` / `similarity_max_percent` / `keyword_max_percent`；关键词维度按 `keyword_score_threshold` 截断；
- `InfoCoreService.keywordKInfo` — bm25 归一化到 0-100（最优命中满分 100，其余按比例折算），输出项附 `keyword_score`；
- `info_context_config` 表新增 `tag_relative_max_percent`（默认 20）/ `similarity_max_percent`（默认 15）/ `keyword_max_percent`（默认 10）/ `keyword_score_threshold`（默认 95）四列（含迁移），`UpdateInfoContextConfigInput` / `InfoContextConfigRecord` 同步扩展；
- `configRegistrations` — 注册上述四个配置项。

**影响的端点**：
- `InfoCore.context` — 弱相关维度采集受数量+比例双控制约束；关键词维度仅保留评分 ≥ 阈值的命中；
- 配置更新接口 / 配置页 — 支持四个新增配置项。

**可能存在的问题**：
- bm25 采用 min-max 全量归一化（本次命中集合的 bm25 值域线性映射到 0-100，最优=100、最差=0），不同查询间的绝对值不可直接比较；阈值 95 会保留位于命中集合前 5% 相关度的消息，若某次命中的 bm25 值域较窄（各命中相关度接近），可能截断过多或过少。
