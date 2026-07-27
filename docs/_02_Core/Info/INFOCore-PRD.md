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
  - info_creator_id：信息的产生人ID（必选）
  - info_creator_role：信息产生人角色；REQUEST,AGENT,MCP,SKILL,LLM,RESPONSE（必选）
  - info：信息内容；USER角色就是用户发送的角色；AGENT就是AGENT产生的内容；MCP就是调用MCP后的结果；SKILL就是调用SKILL后的结果；LLM就是LLM的回答；RESPONSE为一次工作给用户的最终返回内容（必选）
  - parent_info_ids：父级信息ID列表（可选）
- context：SaveInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SaveInfoOutput（继承 Output），承载返回内容：
  - info_id：新创建的信息 ID
**处理流程**：

1. 生成 `info_id`（UUID），计算 `info_length = len(info)`；
2. 调用 RelationDBProvider.insertDB 将 `{ session_id, work_id, interact_id, info_id, info_creator_id, info_creator_role, info, info_length, pin: false }` 写入 `info_raw` 表；
3. 若 `parent_info_ids` 非空，遍历列表：
   a. 对每个 `parent_info_id`，调用 RelationDBProvider.insertDB 将引用关系 `{ session_id, info_id, citing_info_id: info_id, cited_info_id: parent_info_id }` 写入 `info_graph` 表；
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

1. 调用 RelationDBProvider.selectOneDB 查询 `info_vector_config` 表获取配置（enable, llm_id, dimension）；如果 enable=false 或 llm_id 为空，直接返回 true（跳过向量化）；
2. 根据 info_id 调用 RelationDBProvider.selectOneDB 查询 `info_raw` 表获取信息内容（info 字段）；
3. 根据信息内容调用 LLMProvider.execLLM 使用配置的 llm_id 对应的 embedding 模型获取内容的向量（浮点数组，长度等于 dimension）；
4. 调用 VectorDBProvider.addVector 将向量和信息 ID 保存到 `info_vector` 表（upsert 语义：若 info_id 已存在则更新向量）；

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
6. 对每个 tag，调用 LLMProvider.execLLM 使用 embedding 模型计算 tag 文本的向量，调用 VectorDBProvider.addVector 将向量和 tag 的数据库 ID（tag_id）保存到 `info_tag_vector` 表；

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
3. 调用 LLMProvider.execLLM 使用 embedding 模型计算标签文本的向量；
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

1. 调用 RelationDBProvider.selectOneDB 查询 `info_summary_config` 表获取配置（enable, llm_id, prompt_template_id）；如果 enable=false 或缺少 llm_id 或 prompt_template_id，直接返回 true（跳过摘要压缩）；
2. 根据 info_id 调用 RelationDBProvider.selectOneDB 查询 `info_raw` 表获取信息内容（info 字段）；
3. 将信息内容和 prompt_template_id 调用 PromptsProvider.execPrompt 生成 prompt；
4. 将 llm_id 和 prompt 调用 LLMProvider.execLLM 生成信息的摘要文本（建议 temperature=0.3，max_tokens 根据内容长度动态设置）；
5. 调用 RelationDBProvider.insertDB 将 `{ info_id, summary: 摘要文本 }` 保存到 `info_summary` 表（upsert 语义：若 info_id 已存在则更新摘要）；

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
3. 遍历关键词列表，调用 RelationDBProvider 将每条 `{ info_id, word: 关键词 }` 写入 FTS5 虚拟表 `info_keyword`（使用 SQLite FTS5 INSERT，FTS5 自动维护全文索引）；

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
  - llm_id：LLM ID（可选）
  - prompt_template_id：Prompt模板ID（可选）
  - enable：是否启用（可选）
- context：UpdateInfoTagConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateInfoTagConfigOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_tag_config` 表，获取当前配置记录；
2. 若 `enable` 非空，更新 enable 字段；
3. 若 `llm_id` 非空：
   a. 校验 LLMProvider.soLLM 中是否存在该 llm_id（确保 LLM 已注册且可用）；
   b. 若存在，更新 llm_id 字段；否则返回 false 并记录错误日志；
4. 若 `prompt_template_id` 非空：
   a. 校验 PromptsProvider.soPrompt 中是否存在该 prompt_template_id；
   b. 若存在，更新 prompt_template_id 字段；否则返回 false 并记录错误日志；
5. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `info_tag_config` 表；

**返回**：Boolean，表示更新是否完成

#### 2.4.3. 信息摘要配置查看（getInfoSummaryConfig）

**功能**：调用RelationDBProvider获取info_summary_config表中配置
**入参**：
- input：GetInfoSummaryConfigInput（继承 Input）
- context：GetInfoSummaryConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetInfoSummaryConfigOutput（继承 Output），承载返回内容：
  - config：摘要配置信息（llm_id, prompt_template_id, enable）
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_summary_config` 表，获取唯一配置记录；
2. 将查询到的配置（llm_id, prompt_template_id, enable）写入 output 返回；
3. 若配置表为空（首次使用），返回默认值：enable=true, llm_id 和 prompt_template_id 为空；

**返回**：Boolean，表示查询是否完成

#### 2.4.4. 修改信息摘要配置（updateInfoSummaryConfig）

支持配置LLM和PromptTemplate和是否开启
**入参**：
- input：UpdateInfoSummaryConfigInput（继承 Input），包含以下字段：
  - llm_id：LLM ID（可选）
  - prompt_template_id：Prompt模板ID（可选）
  - enable：是否启用（可选）
- context：UpdateInfoSummaryConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateInfoSummaryConfigOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_summary_config` 表，获取当前配置记录；
2. 若 `enable` 非空，更新 enable 字段；
3. 若 `llm_id` 非空：校验 LLMProvider.soLLM 中是否存在该 llm_id，存在则更新，否则返回 false 并记录错误日志；
4. 若 `prompt_template_id` 非空：校验 PromptsProvider.soPrompt 中是否存在该 prompt_template_id，存在则更新，否则返回 false 并记录错误日志；
5. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `info_summary_config` 表；

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
3. 若配置表为空（首次使用），返回默认值：enable=true, dimension=1024, llm_id 为空；

**返回**：Boolean，表示查询是否完成

#### 2.4.8. 修改信息向量化配置（updateInfoVectorConfig）

支持配置LLM和是否开启
注意：dimension只允许在没有计算过向量数据的情况下修改
**入参**：
- input：UpdateInfoVectorConfigInput（继承 Input），包含以下字段：
  - llm_id：LLM ID（可选）
  - enable：是否启用（可选）
  - dimension：向量维度（可选）
- context：UpdateInfoVectorConfigContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：UpdateInfoVectorConfigOutput（继承 Output），承载返回内容
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_vector_config` 表，获取当前配置记录；
2. 若 `enable` 非空，更新 enable 字段；
3. 若 `llm_id` 非空：校验 LLMProvider.soLLM 中是否存在该 llm_id，存在则更新，否则返回 false 并记录错误日志；
4. 若 `dimension` 非空：
   a. 调用 RelationDBProvider.selectOneDB 检查 `info_vector` 表是否已有向量数据（count > 0）；
   b. 若已有向量数据，dimension 不允许修改（维度不匹配会导致已有向量失效），返回 false 并记录错误日志："dimension 只允许在没有计算过向量数据的情况下修改"；
   c. 若无向量数据，校验 dimension 为正整数且与模型输出维度一致（如 1024、1536、768），更新 dimension 字段；
5. 调用 RelationDBProvider.updateDB 将变更后的配置写入 `info_vector_config` 表；

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
  - info_creator_id：信息的产生人ID（可选）
  - info_creator_role：信息产生人角色；USER、AGENT、MCP、SKILL、LLM（可选）
  - lastN：最近的N条信息（必选）
- context：LastNInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：LastNInfoOutput（继承 Output），承载返回内容：
  - info_list：信息内容列表
**处理流程**：

1. 构建查询条件（Condition）：将入参中所有非空字段（session_id, work_id, interact_id, info_id, info_creator_id, info_creator_role）作为 AND 条件，调用 RelationDBProvider.selectDB 按 created 倒序查询 `info_raw` 表，LIMIT lastN；
2. 遍历查询结果，对每条记录：
   a. 若 info 字段不为空：视为完整信息，直接加入结果列表；
   b. 若 info 字段为空（已被老化清理）：调用 RelationDBProvider.selectOneDB 查询 `info_summary` 表根据 info_id 获取摘要文本，将摘要作为本条信息内容加入结果列表；若摘要也不存在则跳过本条；
3. 返回处理后的信息内容列表（含 info_id, info_creator_role, created, info 字段），写入 output 返回；

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

1. 以 info_id 为起点，通过跳数限制和邻接点选择策略裁剪遍历 `info_graph` 表（非完整 BFS），权衡效率与效果：
   a. 从 info_id 出发，查询 `cited_info_id = info_id` 的所有记录（即 info_id 引用了哪些消息），收集 citing_info_id 列表；
   b. 对每个 citing_info_id 递归查询其引用的消息，按引用层级（hop）递增，最多遍历 lastN 条或直到没有更多引用；
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
- context：SimilarKInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：SimilarKInfoOutput（继承 Output），承载返回内容：
  - info_list：信息内容列表
**处理流程**：

1. 根据入参中的 info 文本内容，调用 LLMProvider.execLLM 使用 embedding 模型计算文本的向量；
2. 调用 VectorDBProvider.soVector 根据向量搜索 `info_vector` 表，返回语义最相似的前 topK 条记录的 info_id 列表及相似度分数（score）；
3. 根据 info_id 列表调用 `lastNInfo` 接口（传入 info_id 列表作为过滤条件），获取每条信息的实际内容；
4. 返回信息内容列表（按相似度分数降序），写入 output 返回；

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
3. 根据 info_id 列表调用 `lastNInfo` 接口获取每条信息的实际内容；
4. 返回信息内容列表（按 FTS5 相关性评分降序），写入 output 返回；

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
3. 根据 tag 列表调用 GraphDBProvider.getGraphNeighbors 从每个 tag 节点出发，按 `similarTo` 边遍历，获取通过加权计算后权重最高的 topN 个关联 tag；
4. 根据关联 tag 列表，调用 RelationDBProvider.selectDB 反向查询 `info_tag` 表获取包含这些 tag 的 info_id 列表（去重）；
5. 对收集到的每个 info_id，调用 `lastNInfo` 接口获取实际内容，按 Tag 相关性权重算法（详见 `Tag相关性权重设计.md`）计算的最终分数降序排列；
6. 返回完整的信息内容列表（含相关性分数），写入 output 返回；

**注意**：relationKInfo 通过 GraphDBProvider.getGraphNeighbors 沿 `similarTo` 边遍历标签图获取关联标签。每一次 Tag 相关性计算后，需要对涉及的 `similarTo` 边调用 GraphDBProvider.activateGraphEdge 触发激活事件，当天的激活次数加一，用于动态活跃度维护（详见 `Tag相关性权重设计.md`）；

### 2.5.6. 信息图结构（graphInfo）

**功能**：展示某一个session所有对话内容的图引用结构
**入参**：
- input：GraphInfoInput（继承 Input），包含以下字段：
  - session_id：会话 ID
- context：GraphInfoContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GraphInfoOutput（继承 Output），承载返回内容：
  - graph_structure：图引用结构
**处理流程**：

1. 调用 RelationDBProvider.selectDB 根据 `session_id` 查询 `info_graph` 表，获取该会话中所有的消息引用关系记录（citing_info_id → cited_info_id）；
2. 调用 RelationDBProvider.selectDB 根据 `session_id` 查询 `info_raw` 表，获取该会话中所有消息的元数据（info_id, info_creator_role, created, pin）；
3. 以 info_id 为节点，引用关系（citing_info_id → cited_info_id）为有向边，在内存中构建有向图结构：
   a. 每个节点标注 role（user/assistant/system）、created（时间戳）、pin（是否钉住）；
   b. 每条边标注方向：从引用者（citing_info_id）指向被引用者（cited_info_id）；
4. 按时间顺序对节点排序，将图结构（nodes + edges）序列化为 JSON 格式写入 output 返回；
5. 若 `info_graph` 或 `info_raw` 表无数据，返回空图结构（nodes=[], edges=[]）；

**返回**：Boolean，表示查询是否完成；图结构通过 output 参数返回

### 2.5.7. 构建上下文（context）

**功能**：根据session_id构建上下文
**入参**：
- input：ContextInput（继承 Input），包含以下字段：
  - session_id：会话 ID
  - info_id：信息 ID
- context：ContextContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ContextOutput（继承 Output），承载返回内容：
  - context_data：构建的上下文数据
**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `info_context_config` 表获取上下文构建参数：base_timeline_count, base_tag_relative_count, base_similarity_count, base_keyword_count, base_random_count, total；
2. 调用 RelationDBProvider.selectDB 查询 `info_raw` 表中当前 session 下 pin=true 的消息，按创建时间倒序排列。钉住的消息优先作为上下文的最前端部分，收集数量为 `pinned_count`（上限不超过 total）；
3. 以 info_id 为起点，通过 BFS 逐层遍历 `info_graph` 表的引用链（cited_info_id → citing_info_id），收集消息到达 base_timeline_count 条或直到没有更多引用（使用 visited 集合去重），按消息的原始创建时间倒序排列；
4. 以步骤 3 中获取到的时间线消息实际数量 `timeline_actual` 为基准，动态计算剩余配额 `remaining = total - pinned_count - timeline_actual`，按比例分配其他来源的加载数量：
   a. `tag_count = min(base_tag_relative_count, remaining)`，调用 `relationKInfo` 接口获取基于 Tag 相关性的关联信息；
   b. `similarity_count = min(base_similarity_count, remaining - tag_count)`，调用 `similarKInfo` 接口获取基于语义相似度的关联信息；
   c. `keyword_count = min(base_keyword_count, remaining - tag_count - similarity_count)`，调用 `keywordKInfo` 接口获取基于关键词搜索的关联信息；
   d. `random_count = min(base_random_count, remaining - tag_count - similarity_count - keyword_count)`，调用 RelationDBProvider.selectDB 从 `info_raw` 表随机采样（使用 SQLite 的 `ORDER BY RANDOM() LIMIT random_count`）获取随机联想信息；
5. 将所有来源的信息合并：按来源优先级（pinned > timeline > tag_relative > similarity > keyword > random）和各自内部的相关性/时间排序组装为统一的上下文列表；
6. 若合并后的总数超过 total，截取前 total 条；
7. 返回上下文数据列表（info_id, info 内容, source 来源标注），写入 output 返回；

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

**功能**：按照时间进行正序排序，获取大于某个时间的INFO信息，仅清空 info 字段内容（设为 ""），不删除整条记录。钉住的消息（pin=true）跳过不清理。清理前确保至少有一种索引（向量/标签/摘要）存在；
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
5. 对于已确保至少有一种索引（向量/标签/摘要）存在的过期记录，调用 RelationDBProvider.updateDB 将该记录的 info 字段置为空字符串（`""`），保留其他字段（id, created, session_id, work_id 等）不变；
6. 将清理的信息数量（deleted_count）写入 output 返回；

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

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
| info_creator_id | 信息产生人ID | UUID | N | | |
| info_creator_role | 信息产生人角色 | VARCHAR | N | | |
| info | 信息内容 | TEXT | N | | |
| info_length | 信息长度 | INT | N | | |
| pin | 是否钉住本消息 | BOOL | N | | |

### 3.2. 图结构信息（SQLite）

- 表名：info_graph
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话ID | UUID | N | 普通索引 | |
| info_id | 信息ID | UUID | N | 普通索引 | |
| citing_info_id | 引用的消息ID | UUID | N | 普通索引 | |
| cited_info_id | 被引用的消息ID | UUID | N | 普通索引 | |

### 3.3. 信息向量表（MiniVectorDB）

- 表名：info_vector
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| info_id | 信息ID | UUID | N | | |
| embedding | embedding向量（1024维度） | embedding | N | | |

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
| embedding | embedding向量（1024维度） | embedding | N | | |

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

### 3.11. INFO Keyword表（SQLite-FST5虚拟表）

- 表名：info_keyword
- 库名：info
- 分词器：unicode61

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
| total | 总的消息量 | INT | N | | 默认为1000 |
