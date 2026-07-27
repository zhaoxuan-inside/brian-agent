# ChatDag Application

## 1. 设计目标

1. 构建消息级 DAG（ChatMap），节点为单条消息，边为顺序边（相邻消息）和引用边（消息引用关系）；
2. 支持消息引用关系的记录与查询，识别分支消息（通过引用关系发起的问答对）；
3. 支持祖先上下文回溯，沿顺序边和引用边向上传递闭包，供用户自主控制上下文；
4. 提供 LLM 语义摘要生成与回填能力，为消息节点提供简短摘要；

> 注意：ChatDag 是消息级别的 DAG（节点=单条消息），与 Orchestration 层的工作/Agent 级 DAG 不同。

## 2. 功能设计

### 2.1. 构建会话消息DAG（buildSessionDag）

**功能**：构建指定会话的消息级 DAG，包含节点（消息）和边（顺序边 + 引用边）

**入参**：
- input：BuildSessionDagInput（继承 Input），包含以下字段：
  - user_id：用户ID
  - session_id：会话ID
- context：BuildSessionDagContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：BuildSessionDagOutput（继承 Output），承载返回内容：
  - nodes：节点列表
  - edges：边列表

**处理流程**：

1. 通过 InformationService 获取会话的全部消息（排除 isLearningMemory 的学习记忆消息）；
2. 通过 InformationService 获取会话的全部引用关系（message_reference 表）；
3. 统计每条消息的引用计数（referencesOut = 该消息引用了多少条消息；referencesIn = 该消息被多少条消息引用），仅统计会话内两端都存在的引用；
4. 识别分支消息：存在 outgoing 引用的消息所在的 exchange 标记为分支 exchange，该 exchange 内的所有消息标记为分支消息（isBranch = true）；
5. 构建节点（DagNode）：含 msg_id、interact_id、role、summary（≤20字）、created、messageIndex、referencesOut、referencesIn、isBranch；
6. 构建顺序边（DagEdge，type=sequence）：
   - 主链消息（非分支）按 messageIndex 顺序连接相邻消息；
   - 分支 exchange 内部 user -> assistant 保持顺序连接；
7. 构建引用边（DagEdge，type=reference）：from = 被引用消息，to = 引用消息；
8. 返回 { nodes, edges }；

**返回**：Boolean，表示构建是否完成；DAG 结构（节点列表 + 边列表）通过 output 参数返回

### 2.2. 获取消息详情（getMessageDetail）

**功能**：获取消息完整内容及双向引用消息摘要列表（供前端徽标弹窗展示）

**入参**：
- input：GetMessageDetailInput（继承 Input），包含以下字段：
  - msg_id：消息ID
- context：GetMessageDetailContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetMessageDetailOutput（继承 Output），承载返回内容：
  - detail：消息详情

**处理流程**：

1. 通过 InformationService 按 msg_id 获取消息记录，若不存在则返回空；
2. 通过 InformationService 获取该消息所在会话的全部引用关系；
3. 从引用关系中筛选出该消息的引用列表（referencesOut）和被引用列表（referencesIn）；
4. 批量获取相关消息的摘要信息（msg_id、role、summary、created）；
5. 按创建时间排序，组装消息详情对象返回；

**返回**：Boolean，表示获取是否完成；消息详情（含 content、summary、双向引用列表）通过 output 参数返回

### 2.3. 记录消息引用（recordReference）

**功能**：记录一条消息对其他消息的引用关系（用户勾选消息复选框发送时调用）

**入参**：
- input：RecordReferenceInput（继承 Input），包含以下字段：
  - session_id：会话ID
  - msg_id：消息ID
  - referenced_msg_ids：被引用消息ID列表
- context：RecordReferenceContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：RecordReferenceOutput（继承 Output），承载返回内容（无额外输出字段）

**处理流程**：

1. 过滤 referenced_msg_ids：排除空值、非字符串、与 msg_id 相同的无效引用；
2. 若过滤后列表为空则直接返回；
3. 通过 InformationService 的 saveReferences 接口将引用关系批量写入 message_reference 表；

**返回**：Boolean，表示记录是否完成

### 2.4. 解析祖先上下文（resolveAncestorContext）

**功能**：从选中消息出发，沿顺序边和引用边向上回溯全部祖先消息（传递闭包），按时间正序返回

**入参**：
- input：ResolveAncestorContextInput（继承 Input），包含以下字段：
  - user_id：用户ID
  - session_id：会话ID
  - selected_msg_ids：选中消息ID列表
- context：ResolveAncestorContextContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：ResolveAncestorContextOutput（继承 Output），承载返回内容：
  - ancestor_messages：祖先消息列表

**处理流程**：

1. 获取会话全部消息（排除学习记忆）和全部引用关系；
2. 构建父边映射（child msg_id -> parent msg_ids）：
   - 顺序父：每条消息的前一条消息；
   - 引用父：引用关系中被引用的消息；
3. 从 selected_msg_ids 出发，通过 BFS 向上回溯，收集所有祖先消息 ID（传递闭包）；
4. 将回溯到的消息按 messageIndex 时间正序排列，转换为 ChatMessage 列表返回；
5. 选中节点以下的消息不包含在上下文中；

**返回**：Boolean，表示解析是否完成；祖先上下文消息列表通过 output 参数返回

### 2.5. 生成消息摘要（generateSummary）

**功能**：为指定消息生成 LLM 语义摘要（≤20字）并保存，失败时回退为内容截断

**入参**：
- input：GenerateSummaryInput（继承 Input），包含以下字段：
  - msg_id：消息ID
  - content：消息内容
- context：GenerateSummaryContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GenerateSummaryOutput（继承 Output），承载返回内容（无额外输出字段）

**处理流程**：

1. 若 content 长度 ≤ 20，直接将 content 作为摘要保存并返回；
2. 通过 ModelConfigService 获取默认激活的 LLM 模型配置；
3. 调用 LLMService 的 chatCompletion 接口，使用摘要提示词生成 ≤20 字的摘要：
   - system：你是摘要助手，用不超过20个字概括内容，只输出概括本身；
   - user：消息内容（截取前 2000 字）；
   - temperature: 0.3, maxTokens: 60；
4. 若 LLM 调用失败或无可用模型，回退为 content 前 20 字截断（fallbackSummary）；
5. 通过 InformationService 的 updateMessageSummary 接口保存摘要；

**返回**：Boolean，表示生成是否完成

### 2.6. 回填消息摘要（backfillSummary）

**功能**：批量回填缺失或过长的消息摘要，系统启动后后台执行

**入参**：
- input：BackfillSummaryInput（继承 Input），包含以下字段：
  - max_batches：最大处理批次数（可选）
  - batch_size：每批处理数量（可选）
- context：BackfillSummaryContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：BackfillSummaryOutput（继承 Output），承载返回内容：
  - processed_count：已处理数量

**处理流程**：

1. 循环处理 max_batches 批次：
   1. 通过 InformationService 的 getMessagesNeedingSummary 接口获取一批待处理消息（summary 为空或过长）；
   2. 若本批无待处理消息则提前终止；
   3. 对每条消息调用 generateSummary 生成并保存摘要，计数累加；
   4. 若本批数量 < batch_size 说明已处理完毕，提前终止；
2. 返回已处理的消息总数；

**返回**：Boolean，表示回填是否完成；已处理数量通过 output 参数返回

## 3. 数据结构

### 3.1. DagNode（消息节点）

| 字段名 | 含义 | 类型 | 备注 |
| ------ | ----- | ----- | ----- |
| msg_id | 消息ID | string | |
| interact_id | 交互ID | string | 一次问答对的标识 |
| role | 消息角色 | string | user / assistant / system |
| summary | 消息摘要 | string | ≤20字 |
| created | 创建时间 | number | Unix 时间戳 |
| messageIndex | 消息序号 | number | 会话内顺序 |
| referencesOut | 引用出度 | number | 该消息引用了多少条消息 |
| referencesIn | 引用入度 | number | 该消息被多少条消息引用 |
| isBranch | 是否分支消息 | boolean | 所在 exchange 有引用关系则为分支 |

### 3.2. DagEdge（DAG边）

| 字段名 | 含义 | 类型 | 备注 |
| ------ | ----- | ----- | ----- |
| from | 起点消息ID | string | |
| to | 终点消息ID | string | |
| type | 边类型 | string | sequence=顺序流（向下）；reference=引用（向右） |

## 4. 表设计

### 4.1. 消息引用表

- 表名：message_reference
- 库名：chatdag

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话ID | UUID | N | 普通索引 | 关联 session 表 |
| msg_id | 消息ID | UUID | N | 普通索引 | 引用方消息 |
| referenced_msg_id | 被引用消息ID | UUID | N | 普通索引 | 被引用方消息 |
| reference_type | 引用类型 | VARCHAR | N | | sequence / reference |

## 5. 重要内容

1. ChatDag 是消息级别的 DAG（节点=单条消息），与 Orchestration 层的工作/Agent 级 DAG 不同。Orchestration 层的 DAG 节点是子任务/工作，ChatDag 的节点是聊天消息；
2. 顺序边（sequence）表示相邻消息的时间顺序，引用边（reference）表示用户勾选历史消息发起的问答引用关系；
3. 分支消息识别：当一条消息通过引用关系发送（selectedMessageIds 非空），其所在 exchange 标记为分支 exchange，不参与主序列链，仅通过引用边关联到被选中消息；
4. 祖先上下文回溯采用传递闭包（BFS 向上），选中节点以下的消息不包含，供用户自主控制上下文范围；
5. 消息摘要生成采用 fire-and-forget 异步模式（scheduleSummary），LLM 失败时回退为内容截断；
6. 摘要回填（backfillSummary）在系统启动后后台批量执行，逐批处理 summary 为空或过长的存量消息；
7. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
8. ChatDagService 的下层依赖：InformationService（消息与引用数据访问）、LLMService（语义摘要生成）、ModelConfigService（模型配置解析），下层仅作数据访问与模型调用，业务逻辑在 application 层；
