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
session_id：标识用户的一个会话；（必选）
work_id：标识一次完整的问答工作；（必选）
interact_id：标识工作执行过程中的一次问答；（必选）
info_creator_id：信息的产生人ID；（必选）
info_creator_role：信息产生人角色；REQUEST,AGENT,MCP,SKILL,LLM,RESPONSE（必选）
info：信息内容；USER角色就是用户发送的角色；AGENT就是AGENT产生的内容；MCP就是调用MCP后的结果；SKILL就是调用SKILL后的结果；LLM就是LLM的回答；RESPONSE为一次工作给用户的最终返回内容；
**处理流程**：

1. 调用RelationDBProvider将内容保存到info_raw表中;
2. 根据parent_info_ids列表调用RelationDBProvider将引用关系保存到info_graph表中；
3. 根据parent_info_ids列表调用RelationDBProvider将更新反向引用关系保存到info_graph表中；

--- 异步线程处理下面的keyword
3. 调用keywordInfo接口进行keyword处理信息；

### 2.1. 钉住消息（pinInfo）

**功能**：钉住一条具体的信息
**入参**：
info_id： 信息ID
**处理流程**：

1. 根据info_id调用RelationDBProvider更新info_id对应的消息的pin字段为true；

### 2.2. 加工信息

#### 2.2.1. 对信息进行向量化（vectorInfo）

**功能**：对指定的信息进行向量化
**入参**：info_id(信息ID)
**处理流程**：

1. 调用RelationDBProvider获取info_vector_config表中的配置信息；如果未开启或者缺少llm_id；直接返回成功；
2. 根据信息ID调用RelationDBProvider获取信息内容；
3. 根据信息内容调用LLMProvider的向量模型获取内容的向量;
4. 将向量和信息的ID调用VectorProvider进行保存到info_vector表；

### 2.2.1. 对信息抽取标签（tagInfo）

**功能**：对指定的信息抽取标签
**入参**：info_id(信息ID)
**处理流程**：

1. 调用RelationDBProvider获取info_tag_config表中配置的prompt_template_id和llm_id；如果未开启或者缺少llm_id和prompt_template_id；直接返回成功；
2. 根据信息ID调用RelationDBProvider获取信息内容；
3. 根据信息内容和prompt_template_id调用PromptsProvider生成Prompt;
4. 根据llm_id和prompt调用LLMProvider得到tag列表；
5. 调用RelationDBProvider保存tag和info的关系到info_tag表中；
6. 根据tab调用LLMProvider的向量模型计算tag的向量，将向量和tagID调用VectorProvider保存到info_tag_vecotr表中；

### 2.2.2. 对信息标签进行建立连接图（graphTag）

**功能**：为信息的标签建立相关性连通图
**入参**：tag_id(标签ID)
**处理流程**：

1. 调用RelationDBProvider获取`info_tag_config`中的`top_k`数值；如果未开启；直接返回成功；
2. 根据tag_id调用RelationDBProvider获取标签内容；
3. 调用VectorDBProvider根据标签内容获取`top_k`的tag_id以及相似距离（排除自身）;
4. 调用GraphDBProvider建立tag_id和获取到的top_k的tag_id之间的连接，并将相似距离作为边的一个属性；

### 2.2.3. 对信息进行压缩（summaryInfo）

**功能**：对一段内容进行压缩
**入参**：info_id(信息ID)
**处理流程**：

1. 调用RelationDBProvider获取info_summary_config配置表的prompt_template_id和llm_id;如果未开启或者缺少llm_id和prompt_template_id；直接返回成功；
2. 根据info_id调用RelationDBProvider获取信息内容；
3. 将信息内容和summary_prompt_template_id调用PromptsProvider生成prompt；
4. 将summary_llm_id和prompt调用LLMProvider生成信息的摘要；
5. 将info_id和信息摘要调用RelationDBProvider保存到信息摘要表(info_summary)中；

### 2.2.3. 对信息进行keyword（keywordInfo）

**功能**：对一段内容进行压缩
**入参**：info_id(信息ID)
**处理流程**：

1. 根据info_id调用RelationDBProvider获取信息内容；
2. 通过nodejieba对信息内容进行分词；
3. 将分词和信息ID保存到FTS5虚拟表info_keyword中;

### 2.3. 配置查看

#### 2.3.1. 信息标签配置查看（soInfoTagConfig）

**功能**：调用RelationDBProvider获取info_tag_config表中配置

#### 2.3.2. 修改标签配置（updateInfoTagConfig）

支持配置LLM和PromptTemplate和是否开启

#### 2.3.3. 信息摘要配置查看（soInfoSummaryConfig）

**功能**：调用RelationDBProvider获取info_summary_config表中配置

#### 2.3.4. 修改信息摘要配置（updateInfoSummaryConfig）

支持配置LLM和PromptTemplate和是否开启

#### 2.3.5. 信息配置查看（soInfoConfig）

**功能**：调用RelationDBProvider获取info_config表中配置

#### 2.3.6. 修改信息配置（updateInfoConfig）

支持配置LLM和PromptTemplate

#### 2.3.5. 信息向量化配置查看（soInfoVectorConfig）

**功能**：调用RelationDBProvider获取info_vector_config表中配置

#### 2.3.6. 修改信息向量化配置（updateInfoVectorConfig）

支持配置LLM和是否开启
注意：dimension只允许在没有计算过向量数据的情况下修改

## 2.4. 查询接口

### 2.4.1. 滑动窗口获取last n信息（lastNInfo）

**功能**：获取最近的N条信息
**入参**：
session_id：标识用户的一个会话；（可选）
work_id：标识一次完整的问答工作；（可选）
interact_id：标识工作执行过程中的一次问答；（可选）
info_id：标识工作执行过程中的一次信息ID；（可选）
info_creator_id：信息的产生人ID；（可选）
info_creator_role：信息产生人角色；USER、AGENT、MCP、SKILL、LLM（可选）
info_id：信息ID
lastN：最近的N条信息（必选）
**处理流程**：

1. 按照入参作为查询条件调用RelationDBProvider按照创建时间倒叙获取最近的lastN条信息；
2. 判断info字段是否不为空；是：视为正常信息；否：继续执行下面流程；
3. 根据info_id调用RelationDBProvider获取info_id对应的info_summary中的信息摘要，作为本条信息；
4. 返回信息内容列表；

### 2.4.2. 图状获取last n信息（graphNInfo）

**功能**：根据数据的关联关系获取最近的N条信息
**入参**：
info_id：信息ID（必选）
lastN：最近的N条信息（必选）
**处理流程**：

1. 按照入参作为查询条件调用RelationDBProvider按照从info_id为起点获取info_id引用的信息按照引用的层级倒叙获取最近的lastN条信息；
2. 判断info字段是否不为空；是：视为正常信息；否：继续执行下面流程；
3. 根据info_id调用RelationDBProvider获取info_id对应的info_summary中的信息摘要，作为本条信息；
4. 返回信息内容列表；

### 2.4.3. 语义相似topK信息（similarKInfo）

**功能**：获取语义最相似的K条信息
**入参**：
info：信息内容；
topK：最相似的K条信息；
**处理流程**：

1. 根据信息内容调用LLMProvider的向量模型获取内容的向量；
2. 将向量调用VectorProvider搜索最相似的TopK条信息的信息ID列表；
3. 根据信息ID列表调用INFOCore的lastNInfo接口获取信息内容列表；

### 2.4.4. 关键词搜索信息（keywordKInfo）

**功能**：获取关键词搜索最相似的K条信息
**入参**：
info：信息内容；
**处理流程**：

1. 通过nodejieba对信息内容进行分词；
2. 根据分词结果通过RelationDBProvider进行关键词搜索info_keyword表得到关键词搜索的信息ID列表；
3. 根据信息ID列表调用INFOCore的lastNInfo接口获取信息内容列表；

### 2.4.5. 相关性搜索信息（relationKInfo）

**功能**：通过标签的相关性搜索最相关的K条信息
**入参**：
info_id
topN
**处理流程**：

1. 根据info_id调用RelationDBProvider从info_tag表中获取tag列表；
    没有tag列表
    1.1. 调用RelationDBProvider获取info_tag_config表中配置的prompt_template_id和llm_id；
    1.2. 根据信息内容和prompt_template_id调用PromptsProvider生成Prompt;
    1.3. 根据llm_id和prompt调用LLMProvider得到tag列表；
2. 根据tag列表调用GraphDBProvider进行搜索得到和tag列表加权权重最高的topN个信息ID；

具体的Tag相关性权重设计方位：Tag相关性权重设计.md文件
**注意**：每一次计算Tag相关性计算后，都需要对激活的边进行当天的激活次数加一

### 2.4.6. 信息图结构（graphInfo）

**功能**：展示某一个session所有对话内容的图引用结构
**入参**：session_id
**处理流程**：

1. 根据session_id调用RelationProvider

### 2.4.7. 构建上下文（context）

**功能**：根据session_id构建上下文
**入参**：
session_id，
info_id
**处理流程**：

1. 调用RelationDBProvider获取info_context_config表获取上下文构建参数；
2. 根据info_id的逐层获取消息引用的消息ID，直到没有消息或达到base_timeline_count；（注意不能重复）
3. 以获取到的基于时间的消息ID数量为基准，根据base_timeline_count和其他类型消息来源的比例计算每一种来源的数量；
4. 根据每一种来源的数量分别调用不同的接口；
    相关性搜索：relationKInfo
    关键词搜索：keywordKInfo
    相似度搜索：similarKInfo

## 2.5. 老化清理

### 2.5.1. 检查是否处理过

#### 2.5.1. 是否向量化（existVectorInfo）

**功能**：根据info_id判断是否已经对信息进行向量化；
**处理流程**：

1. 调用RelationDBProvider根据info_id查询info_vecotr表是否存在数据；

#### 2.5.2. 是否标签化（existTagInfo）

**功能**：根据info_id判断是否已经对信息进行标签化；
**处理流程**：

1. 调用RelationDBProvider根据info_id查询info_tag表是否存在数据；

#### 2.5.2. 是否压缩化（existSummaryInfo）

**功能**：根据info_id判断是否已经对信息进行压缩化；
**处理流程**：

1. 调用RelationDBProvider根据info_id查询info_summary表是否存在数据；

### 2.5.1. INFO 老化清理（delInfo）

**功能**：按照时间进行正序排序，获取大于某个时间的INFO信息，清空info内容；
**处理流程**：

1. 调用RelationDBProvider获取 info_config表中配置的 alive_max_days；
2. 根据alive_max_days计算允许存活的最早时间戳；
3. 根据时间戳调用RelationDBProvider获取过期的信息ID列表；
4. 检查信息ID列表中的信息是否已经处理过
    调用existVectorInfo、existTagInfo、existSummaryInfo
    如果已经进行了对应的处理则跳过；否则调用对应的处理接口；
5. 清空info字段的内容；

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
| info_creator_ROLE | 信息产生人角色 | VARCHAR | N | | |
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
| citing_info_id | 引用的消息ID | | N | 普通索引 | |
| cited_info_id | 被引用的消息ID | | N | 普通索引 | |

### 3.2. 信息向量表（MiniVectorDB）

- 表名：info_vecotr
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| info_id | 信息ID | UUID | N | | |
| embedding | embedding向量（1024维度） | embedding | N | | |

### 3.2. INFO标签表（SQLite）

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

### 3.2. INFO标签向量表（MiniVectorDB）

- 表名：info_tag_vecotr
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| tag_id | 信息ID | UUID | N | | |
| embedding | embedding向量（1024维度） | embedding | N | | |

### 3.3. INFO标签配置表（SQLite）

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

### 3.3. INFO摘要配置表（SQLite）

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

### 3.3. INFO配置表（SQLite）

- 表名：info_config
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| alive_max_days | 信息最大存活天数 | UUID | N | | |

### 3.3. INFO向量配置表（SQLite）

- 表名：info_vector_config
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | LLM ID | UUID | N | | |
| dimension | LLM ID | UUID | N | | 要与模型保持一致 |
| enable | 启用/禁用信息向量化 | BOOL | N | | 默认打开 |

### 3.3. INFO摘要表（SQLite）

- 表名：info_summary
- 库名：info

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| info_id | 信息ID | UUID | N | 普通索引 | |
| summary | 信息摘要 | TEXT | N | | |

### 3.4. INFO Keyword表（SQLite-FST5虚拟表）

- 表名：info_keyword
- 库名：info
- 分词器：unicode61

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| info_id | 信息ID | | N | | |
| word | 分词 | | N | | |

### 3.5. 上下文构建配置表（SQLite）

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
