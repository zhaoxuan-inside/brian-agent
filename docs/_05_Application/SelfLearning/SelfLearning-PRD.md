# SelfLearning Application

## 1. 设计目标

1. 支持配置资料库目录，管理用户的本地知识库（Markdown 文件）；
2. 支持对资料库中的内容以可控速率通过 Orchestration 层或 Agent 层进行学习，生成结构化知识；
3. 提供 Tag 图维护能力，以一定频率检查 Tag 关联程度，对 Tag 之间的连接进行建立、激活和老化管理，推动 Tag 建立更完整的语义关联网络，避免孤立的图节点；
4. 提供学习控制能力（手动开始/暂停、随机因子触发、定时调度）；
5. 提供学习进度、学习成果、学习统计的可视化数据接口，供前端展示。

## 2. 模块职责

SelfLearning Application 是系统的自主学习引擎，负责驱动系统从外部知识源（Markdown 文档）和内部数据（用户对话、Tag 图）中持续学习和优化。它通过 MQ 进行异步任务调度，通过 Orchestration 层或 Agent 层执行具体学习任务。

### 学习类型

| 学习类型 | 说明 | 触发方式 | 执行方式 |
|---------|------|---------|---------|
| 从文档学习 | 读取资料库中的 Markdown 文件，通过 Orchestration 层调用 Agent 进行内容理解和知识提取 | 手动/定时/随机 | OrchestrationEntry.receiveWorkAsync |
| 从对话学习 | 对历史对话进行回顾分析，提取用户偏好和知识模式 | 定时/随机 | EvolutorAgent.startEvalSchedule |
| Tag 图维护 | 检查 Tag 之间的语义相似性连接，建立缺失连接、激活活跃连接、老化不活跃连接 | 定时（cron） | InfoCore.graphTag → GraphDBProvider |

### 依赖关系

| 依赖层级 | 模块 | 调用接口 | 用途 |
|---------|------|---------|------|
| Orchestration | OrchestrationEntry | receiveWorkAsync | 异步提交文档学习 work |
| Agent | EvolutorAgent | startEvalSchedule | 启动定时评估（从对话学习） |
| Agent | EvolutorAgent | stopEvalSchedule | 停止定时评估 |
| Agent | WriterAgent | getUserProfile | 获取用户画像作为学习上下文 |
| Core | InfoCore | graphTag | 为 Tag 建立语义相似性连接 |
| Core | InfoCore | relationKInfo | 查询 Tag 相关性的关联信息 |
| Core | InfoCore | saveInfo | 保存学习产生的信息 |
| Core | InfoCore | lastNInfo | 查询对话历史供学习 |
| Core | MQCore | startWorker | 启动学习任务 Worker |
| Core | MQCore | stopWorker | 停止学习任务 Worker |
| Core | LLMCore | execLLM | 调用 LLM 执行文档学习分析 |
| Base | GraphDBProvider | addGraphEdge | 建立 Tag 之间的边 |
| Base | GraphDBProvider | activateGraphEdge | 激活 Tag 边 |
| Base | GraphDBProvider | ageGraphEdge | 老化 Tag 边 |
| Base | GraphDBProvider | selectGraph / getGraphNeighbors | 查询 Tag 图结构 |
| Base | RelationDBProvider | insertDB / selectDB / updateDB / deleteDB | 资料库和学习任务 CRUD |
| Base | MQProvider | sendMQ | 发送学习任务消息 |
| Base | LogProvider | debug / info / warn / error | 日志记录 |

## 3. 功能设计

### 3.1. 资料库管理

#### 3.1.1. 添加资料库（addLibrary）

**功能**：添加一个本地目录作为资料库

**URL**：`POST /api/learning/library`

**入参（AddLibraryInput extends Input）**：
- library_path（STRING，必选）：资料库在本机的绝对路径
- library_name（STRING，可选）：资料库显示名称，不传则取目录名
- enable_self_learning（BOOLEAN，可选）：是否开启自学习，默认 true
- learning_rate（INT，可选）：学习速率（每小时处理文件数），默认 5

**处理流程**：

1. 校验 `library_path` 是否存在且具有读取权限（使用 Node.js fs.access）；
2. 校验 `library_path` 是否为目录（fs.statSync）；
3. 扫描目录下所有 `.md` 文件，记录文件列表和数量；
4. 生成 `library_id`（UUID）；
5. 调用 RelationDBProvider.insertDB 向 `self_learning_library` 表（库名=self_learning）写入资料库记录；
6. 调用 RelationDBProvider.insertDB 批量写入 `self_learning_file` 表（每个 .md 文件一条记录，状态=PENDING）；
7. 返回 library_id 和文件数量；

#### 3.1.2. 删除资料库（deleteLibrary）

**功能**：删除指定的资料库

**URL**：`DELETE /api/learning/library/:library_id`

**入参**：
- library_id（Path Param，必选）

**处理流程**：

1. 调用 RelationDBProvider.transactionDB 开启事务：
   a. 调用 RelationDBProvider.deleteDB 删除 `self_learning_file` 表中该 library_id 的所有文件记录；
   b. 调用 RelationDBProvider.deleteDB 删除 `self_learning_library` 表中该 library_id 的记录；
2. 事务提交，返回结果；

#### 3.1.3. 搜索资料库（searchLibrary）

**功能**：搜索资料库列表

**URL**：`GET /api/learning/library`

**入参（Query String）**：
- keyword（STRING，可选）：搜索关键词（匹配 library_name）
- page_current（INT，可选）
- page_size（INT，可选）

**输出**：
- libraries：资料库列表 [{ library_id, library_name, library_path, file_count, learned_count, enable_self_learning, learning_rate, created, updated }]
- total：总记录数

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `self_learning_library` 表；
2. 对每条资料库记录，调用 RelationDBProvider.countDB 统计 `self_learning_file` 表中：
   a. file_count = 总文件数；
   b. learned_count = 状态为 COMPLETED 的文件数；
3. 返回资料库列表；

#### 3.1.4. 获取资料库文件列表（getLibraryFiles）

**功能**：获取指定资料库下的所有 Markdown 文件及其学习状态

**URL**：`GET /api/learning/library/:library_id/files`

**入参**：
- library_id（Path Param，必选）
- status（ENUM，可选）：按学习状态过滤（PENDING / PROCESSING / COMPLETED / FAILED）
- page_current（INT，可选）
- page_size（INT，可选）

**输出**：
- files：文件列表 [{ file_id, file_name, file_path, file_size, status, learned_at, created }]
- total：总记录数

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `self_learning_file` 表（按 library_id + status 可选过滤）；
2. 返回文件列表；

#### 3.1.5. 获取文件内容（getFileContent）

**功能**：获取指定 Markdown 文件的原始内容（渲染后展示）

**URL**：`GET /api/learning/library/file/:file_id/content`

**入参**：
- file_id（Path Param，必选）

**输出**：
- file_name（STRING）：文件名
- content（STRING）：Markdown 原始内容
- learned_at（INT64，可选）：学习完成时间

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `self_learning_file` 表获取 file_path；
2. 使用 Node.js fs.readFile 读取文件内容；
3. 返回文件名和内容；

### 3.2. 学习控制

#### 3.2.1. 启动学习（startLearning）

**功能**：启动自学习任务，开始处理资料库文件

**URL**：`POST /api/learning/start`

**入参（StartLearningInput extends Input）**：
- library_id（STRING，可选）：指定资料库 ID，不传则启动所有开启自学习的资料库
- learning_mode（ENUM，可选）：学习模式（DOCUMENT / CONVERSATION / TAG_MAINTENANCE / ALL），默认 ALL
- learning_rate（INT，可选）：临时覆盖学习速率

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `self_learning_library` 表（按 library_id 可选过滤，enable_self_learning=true）；
2. 对每个资料库：
   a. 调用 RelationDBProvider.selectDB 查询 `self_learning_file` 表中状态为 PENDING 的文件（按 created 升序）；
   b. 将文件逐个投递到 MQ 队列 `self_learning.document`（调用 MQProvider.sendMQ）；
3. 调用 MQCore.startWorker 确保 `self_learning.document` 队列上有 Worker 消费；
4. Worker 消费逻辑：从队列取出文件消息 → 读取文件内容 → 调用 handleDocumentLearning 处理 → 更新文件状态为 COMPLETED/FAILED；
5. 若 learning_mode 含 CONVERSATION：调用 EvolutorAgent.startEvalSchedule 启动从对话学习；
6. 若 learning_mode 含 TAG_MAINTENANCE：调用 startTagMaintenance 启动 Tag 图维护；
7. 返回启动结果；

#### 3.2.2. 暂停学习（stopLearning）

**功能**：暂停自学习任务

**URL**：`POST /api/learning/stop`

**入参（StopLearningInput extends Input）**：
- library_id（STRING，可选）：指定资料库 ID
- learning_mode（ENUM，可选）：学习模式，默认 ALL

**处理流程**：

1. 若 learning_mode 含 DOCUMENT：调用 MQCore.stopWorker 停止 `self_learning.document` 队列的 Worker；
2. 若 learning_mode 含 CONVERSATION：调用 EvolutorAgent.stopEvalSchedule 停止对话学习；
3. 若 learning_mode 含 TAG_MAINTENANCE：调用 stopTagMaintenance 停止 Tag 图维护；
4. 返回停止结果；

#### 3.2.3. 随机触发学习（委托 configSelfLearning）

随机学习的触发因子和各驱动权重由 `configSelfLearning`（见 3.7 节）统一管理，不单独暴露独立的配置端点。配置项包括：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| random_factor | 随机触发因子（0-100） | 10 |
| document_weight | 文档学习权重 | 40 |
| conversation_weight | 对话学习权重 | 30 |
| tag_maintenance_weight | Tag 图维护权重 | 30 |
| learning_interval_ms | 学习检查间隔（ms） | 600000 |

**随机触发逻辑**（由定时 Worker 执行）：
1. 每隔 learning_interval_ms 生成随机数（0-100）；
2. 若随机数 < random_factor，触发一次学习；
3. 按各权重比例随机选择学习模式（文档/对话/Tag 维护）；
4. 执行对应学习任务；

### 3.3. 文档学习（handleDocumentLearning）

**功能**：处理单个 Markdown 文件的学习

**处理流程**：

1. 读取文件内容（Markdown 格式）；
2. 确保 `"self_learning"` session 存在（首次调用时自动创建）：
   a. 调用 RelationDBProvider.selectOneDB 查询 `chat_session` 表（库名=chat），session_id=`"self_learning"`；
   b. 若不存在，调用 RelationDBProvider.insertDB 创建系统内置会话记录 `{ session_id: "self_learning", session_title: "系统自主学习" }`；
3. 调用 RelationDBProvider.selectOneDB 查询 `self_learning_config` 表获取 `document_split_threshold`（默认 5000 字符）；
4. 若文件字符数 > `document_split_threshold`，执行分块策略：
   a. 按 Markdown 标题（`##` 或 `#`）分隔为多个章节块（chunk）；
   b. 每个章节块作为独立的学习单元处理；
   c. 若单个章节块仍超过阈值，按固定大小（`document_split_threshold` 字符）继续切分；
   d. 各分块按顺序依次学习，前一个分块完成后再处理下一个；
5. 将当前块内容作为用户输入，构建一个学习 work 请求：
   - session_id：使用系统内置的 `"self_learning"` session；
   - user_query：`"请学习以下文档内容并提取关键知识：\n\n{块内容}"`；
   - force_orchestration_strategy：根据块大小选择（< `document_split_threshold` → SIMPLE，≥ `document_split_threshold` → PLANNING）；
6. 调用 OrchestrationEntry.receiveWorkAsync 异步提交学习 work；
7. Work 执行完成后，Orchestration 层会通过 WriterAgent 生成学习总结，通过 EvolutorAgent 评估学习质量；
8. 调用 InfoCore.saveInfo 将学习产生的知识保存为 info（info_creator_role=AGENT，标记为学习产出）；
9. 所有分块处理完成后，更新 `self_learning_file` 表该文件状态为 COMPLETED，记录 learned_at；
10. 若任一阶段学习失败（Orchestration 返回 FAILED），记录错误信息，状态置为 FAILED；

### 3.4. Tag 图维护

Tag 图维护是系统的核心学习方向之一，目标是通过持续维护 Tag 节点的语义关联网络，确保 Tag 图连接的完整性和时效性。

#### 3.4.1. Tag 相似性连接建立（startTagConnectionEstablishment）

**功能**：为新产生的 Tag 建立与其他 Tag 的语义相似性连接

**触发时机**：
- 定时执行（cron：每 30 分钟）
- 手动触发（通过 startLearning 指定 TAG_MAINTENANCE 模式）

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `info_tag` 表，获取最近一段时间内（默认 24 小时）新增的 Tag 列表；
2. 对每个新 Tag：
   a. 调用 InfoCore.graphTag(tag_id) 为该 Tag 建立与语义最相似 top_k 个 Tag 的 `similarTo` 边（相似性连接）；
   b. graphTag 内部通过 VectorDBProvider.soVector 搜索语义最相似的 Tag，通过 GraphDBProvider.addGraphEdge 建立边；
3. 记录本次建立的新连接数量；
4. 将建立连接的 Tag 和边信息通过 InfoCore.saveInfo 保存为学习记录；

#### 3.4.2. Tag 连接激活（startTagActivation）

**功能**：对系统中被频繁使用的 Tag 连接进行激活，增加其权重和活跃度

**触发时机**：
- 每次 relationKInfo 调用时自动触发（InfoCore 内部已实现：每次 Tag 相关性计算后调用 GraphDBProvider.activateGraphEdge）
- 定时执行（cron：每小时）作为补充

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `info_tag` 表，获取最近使用的 Tag 列表；
2. 对每个 Tag，调用 GraphDBProvider.getGraphNeighbors 获取其所有邻居 Tag；
3. 对每条 `similarTo` 边，调用 GraphDBProvider.activateGraphEdge 触发激活事件；
4. 记录激活的边数量；

#### 3.4.3. Tag 连接老化（startTagAging）

**功能**：对不活跃的 Tag 连接进行老化处理，标记为非激活状态

**触发时机**：
- 定时执行（cron：每天凌晨 2:00）
- 手动触发

**处理流程**：

1. 调用 GraphDBProvider.ageGraphEdge 执行老化（内部基于保留窗口内激活数量判定）；
2. 被老化的边标记为 is_active=false，从活跃图中移除但不删除；
3. 记录老化的边数量；
4. 将老化结果通过 InfoCore.saveInfo 保存为学习记录；

**注意**：Tag 连接老化是单向操作——边被标记为非激活后，若后续又有关联查询触发了该边的激活事件，该边会重新变为激活状态。因此老化是动态可逆的。

#### 3.4.4. 孤立 Tag 检测（startOrphanTagCheck）

**功能**：检测没有连接到任何其他 Tag 的孤立 Tag 节点，尝试建立连接

**触发时机**：
- 定时执行（cron：每天凌晨 3:00）

**处理流程**：

1. 调用 GraphDBProvider.selectGraph 获取所有 Tag 节点（node_type=tag）；
2. 对每个 Tag 节点，调用 GraphDBProvider.getGraphNeighbors 检查是否有邻居（depth=1）；
3. 若邻居数为 0（孤立节点），调用 InfoCore.graphTag(tag_id) 尝试建立连接；
4. 记录检测到的孤立节点数和成功建立连接的数量；

### 3.5. Tag 图可视化数据

#### 3.5.1. 获取 Tag 图结构（getTagGraph）

**功能**：获取系统中所有 Tag 及其连接关系的图结构数据，供前端 Canvas 渲染

**URL**：`GET /api/learning/tag/graph`

**入参（Query String）**：
- only_active（BOOLEAN，可选）：仅返回激活状态的边，默认 true
- min_weight（DOUBLE，可选）：最小权重过滤，默认 0.0
- limit（INT，可选）：最大节点数，默认 500（防止超大图性能问题）

**输出**：
```json
{
  "nodes": [
    {
      "tag_id": "tag_uuid",
      "tag_name": "标签名称",
      "activation_count": 42,
      "node_size": 0.75,
      "info_count": 15,
      "created": 1234567890
    }
  ],
  "edges": [
    {
      "edge_id": "edge_uuid",
      "from_tag_id": "tag_uuid_1",
      "to_tag_id": "tag_uuid_2",
      "edge_type": "similarTo",
      "weight": 0.85,
      "similarity": 0.92,
      "is_active": true,
      "last_activation_time": 1234567890
    }
  ],
  "metadata": {
    "total_nodes": 150,
    "total_edges": 320,
    "active_edges": 280,
    "orphan_nodes": 5
  }
}
```

**处理流程**：

1. 调用 GraphDBProvider.selectGraph 获取所有 Tag 节点（node_type=tag）；
2. 对每个 Tag 节点，调用 GraphDBProvider.getGraphNeighbors 获取其所有相似性连接边；
3. 对每个 Tag 节点，调用 RelationDBProvider.countDB 统计 `info_tag` 表中该 Tag 关联的信息数量（info_count）；
4. 计算节点大小（node_size）：基于 activation_count 归一化到 [0.3, 1.0] 范围，公式为 `0.3 + 0.7 * (log(activation_count + 1) / log(max_activation_count + 1))`；
5. 按 only_active、min_weight 过滤边；
6. 按 limit 限制节点数（优先保留 activation_count 高的节点）；
7. 统计 metadata（总节点数、总边数、活跃边数、孤立节点数）；

#### 3.5.2. 获取 Tag 关联信息（getTagRelatedInfo）

**功能**：查看指定 Tag 关联的所有信息条目

**URL**：`GET /api/learning/tag/:tag_id/info`

**入参**：
- tag_id（Path Param，必选）
- page_current（INT，可选）
- page_size（INT，可选）

**输出**：
- infos：信息列表 [{ info_id, info, summary, info_creator_role, created }]
- total：总记录数

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `info_tag` 表（按 tag_id 过滤），获取关联的 info_id 列表；
2. 调用 InfoCore.lastNInfo 获取每条 info 的内容（如已老化则为 summary）；
3. 分页返回；

### 3.6. 学习进度与成果

#### 3.6.1. 获取学习进度（getLearningProgress）

**功能**：获取当前学习任务的执行进度

**URL**：`GET /api/learning/progress`

**输出**：
```json
{
  "current_task": {
    "task_id": "task_uuid",
    "task_name": "从文档学习",
    "task_type": "DOCUMENT",
    "status": "RUNNING",
    "progress": 65,
    "started_at": 1234567890,
    "library_name": "技术文档库",
    "file_name": "React设计原理.md"
  },
  "task_queue": [
    {
      "task_id": "task_uuid_2",
      "task_name": "Tag 图相似性维护",
      "task_type": "TAG_MAINTENANCE",
      "status": "PENDING",
      "scheduled_at": 1234567890
    }
  ],
  "builtin_tasks": [
    {
      "task_id": "builtin_1",
      "task_name": "信息标签图相似性维护",
      "task_type": "TAG_MAINTENANCE_CONNECTION",
      "cron": "0 */30 * * * *",
      "last_run_at": 1234567890,
      "next_run_at": 1234567890,
      "status": "ENABLED"
    },
    {
      "task_id": "builtin_2",
      "task_name": "信息标签图相似性连接建立",
      "task_type": "TAG_MAINTENANCE_ESTABLISH",
      "cron": "0 */30 * * * *",
      "last_run_at": 1234567890,
      "next_run_at": 1234567890,
      "status": "ENABLED"
    },
    {
      "task_id": "builtin_3",
      "task_name": "信息标签图不常用连接老化",
      "task_type": "TAG_MAINTENANCE_AGING",
      "cron": "0 0 2 * * *",
      "last_run_at": 1234567890,
      "next_run_at": 1234567890,
      "status": "ENABLED"
    }
  ]
}
```

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `self_learning_task` 表获取当前正在执行的任务（status=RUNNING）；
2. 调用 RelationDBProvider.selectDB 查询 `self_learning_task` 表获取待执行任务队列（status=PENDING，按 scheduled_at 升序）；
3. 调用 RelationDBProvider.selectDB 查询 `self_learning_builtin_task` 表获取内置任务列表；
4. 组装返回；

#### 3.6.2. 获取学习成果（getLearningResults）

**功能**：获取学习产生的知识和洞察

**URL**：`GET /api/learning/results`

**入参（Query String）**：
- type（ENUM，可选）：知识类型（KNOWLEDGE / INSIGHT），不传则返回全部
- source（ENUM，可选）：来源（DOCUMENT / CONVERSATION / TAG_MAINTENANCE）
- page_current（INT，可选）
- page_size（INT，可选）

**输出**：
- results：学习成果列表 [{ result_id, type, source, content, summary, related_tags, learned_at }]
- total：总记录数

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `self_learning_result` 表（按 type、source 可选过滤）；
2. 对每条结果，调用 RelationDBProvider.selectDB 查询 `self_learning_result_tag` 表获取关联的 Tag 列表；
3. 分页返回；

#### 3.6.3. 获取学习统计（getLearningStats）

**功能**：获取学习统计数据

**URL**：`GET /api/learning/stats`

**输出**：
```json
{
  "total_learning_count": 520,
  "total_knowledge_count": 340,
  "total_insight_count": 85,
  "this_week_learning_count": 12,
  "document_learning": {
    "total_files": 150,
    "learned_files": 120,
    "failed_files": 5,
    "completion_rate": 0.80
  },
  "tag_graph": {
    "total_tags": 450,
    "total_edges": 1200,
    "active_edges": 980,
    "orphan_tags": 15,
    "aged_edges_this_week": 30,
    "new_edges_this_week": 45
  },
  "learning_trend": [
    { "date": "2026-07-24", "count": 8 },
    { "date": "2026-07-25", "count": 12 }
  ]
}
```

**处理流程**：

1. 调用 RelationDBProvider.countDB 统计 `self_learning_result` 表中各类学习成果数量；
2. 调用 RelationDBProvider.countDB 统计 `self_learning_file` 表中文件学习状态分布；
3. 调用 GraphDBProvider.selectGraph 获取 Tag 图统计（节点数、边数）；
4. 调用 RelationDBProvider.selectDB 查询 `self_learning_task` 表统计本周学习次数趋势；
5. 组装返回；

### 3.7. 配置（委托 Config Application）

SelfLearning 模块的配置通过 Config Application 统一管理（`/api/config/update`，config_key 前缀 `self_learning.`）。SelfLearning 对内保留 `configSelfLearning` 方法供 Config Application 代理调用，不对外暴露独立 HTTP 配置端点。随机学习的驱动因子权重也由此方法统一管理（不再单独暴露 `configDriverWeights`）。

对内 `configSelfLearning` 方法管理的可配置项：

| 配置项 | config_key | 类型 | 默认值 | 说明 |
|--------|-----------|------|--------|------|
| random_factor | `self_learning.random_factor` | INT | 10 | 随机触发因子（0-100） |
| document_weight | `self_learning.document_weight` | INT | 40 | 文档学习权重 |
| conversation_weight | `self_learning.conversation_weight` | INT | 30 | 对话学习权重 |
| tag_maintenance_weight | `self_learning.tag_maintenance_weight` | INT | 30 | Tag 图维护权重 |
| learning_interval_ms | `self_learning.learning_interval_ms` | INT | 600000 | 学习检查间隔（ms） |
| default_learning_rate | `self_learning.default_learning_rate` | INT | 5 | 默认学习速率 |
| tag_connection_check_interval_ms | `self_learning.tag_connection_check_interval_ms` | INT | 1800000 | Tag 连接检查间隔（ms） |
| tag_aging_cron | `self_learning.tag_aging_cron` | STRING | "0 0 2 * * *" | Tag 老化 cron 表达式 |
| orphan_tag_check_cron | `self_learning.orphan_tag_check_cron` | STRING | "0 0 3 * * *" | 孤立 Tag 检测 cron |
| document_split_threshold | `self_learning.document_split_threshold` | INT | 5000 | 文档拆分阈值（字符数） |

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `self_learning_config` 表；
2. 校验并更新传入的非空字段；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置；

## 4. 重要内容

1. 所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；
2. 自学习任务通过 MQ 异步执行，不阻塞主流程；文档学习委托给 Orchestration 层（receiveWorkAsync），由 Orchestration 层负责 Agent 编排和执行；
3. 文档分块策略：超过 `document_split_threshold` 字符的文件按 Markdown 标题分隔为章节块依次学习，避免单次请求超出 LLM 上下文窗口；
4. 系统内置 `"self_learning"` session 由 SelfLearning 模块在首次使用时自动创建，用于承载文档学习的 work 上下文；
5. Tag 图维护是核心学习方向，包含三个子任务：相似性连接建立（graphTag）、连接激活（activateGraphEdge）、连接老化（ageGraphEdge），三者协同工作维持 Tag 图的动态平衡；
6. Tag 连接老化是动态可逆的——被老化的边在后续被激活后会自动恢复为活跃状态；
7. 学习速率控制：通过 MQ 消费速率和 learning_rate 配置避免短时间内大量调用 LLM 造成成本过高；
8. 内置学习任务不可删除，但可以通过配置 cron 表达式调整执行频率；
9. **用户画像生成调度归口 UserProfile Application**：SelfLearning 不维护独立的 USER_PROFILE 定时任务；
10. 配置管理委托 Config Application：SelfLearning 不对前端暴露独立配置端点，对内保留 configSelfLearning 供 Config Application 代理；
11. 所有外部资源访问必须通过对应的 Provider/Access 层，禁止绕过；
12. 所有日志通过 LogProvider 记录，禁止 console.log；
13. 所有 ID 通过 IdGenerator.generate() 生成；

## 5. 表设计

### 5.1. 资料库表（SQLite）

- 表名：self_learning_library
- 库名：self_learning

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| library_id | 资料库 ID | UUID | N | 唯一索引 | |
| library_name | 资料库名称 | VARCHAR | N | | |
| library_path | 资料库路径 | TEXT | N | | 绝对路径 |
| enable_self_learning | 是否开启自学习 | BOOLEAN | N | | 默认 true |
| learning_rate | 学习速率 | INT | N | | 每小时处理文件数，默认 5 |

### 5.2. 资料库文件表（SQLite）

- 表名：self_learning_file
- 库名：self_learning

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| library_id | 资料库 ID | UUID | N | 普通索引 | 关联 self_learning_library |
| file_id | 文件 ID | UUID | N | 唯一索引 | |
| file_name | 文件名 | VARCHAR | N | | |
| file_path | 文件路径 | TEXT | N | | 绝对路径 |
| file_size | 文件大小（字节） | INT | N | | |
| status | 学习状态 | ENUM | N | 普通索引 | PENDING / PROCESSING / COMPLETED / FAILED |
| error_message | 错误信息 | TEXT | Y | | |
| learned_at | 学习完成时间 | timestamp | Y | | |

### 5.3. 学习任务表（SQLite）

- 表名：self_learning_task
- 库名：self_learning

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| task_id | 任务 ID | UUID | N | 唯一索引 | |
| task_name | 任务名称 | VARCHAR | N | | |
| task_type | 任务类型 | ENUM | N | | DOCUMENT / CONVERSATION / TAG_MAINTENANCE |
| status | 任务状态 | ENUM | N | 普通索引 | PENDING / RUNNING / COMPLETED / FAILED |
| progress | 进度百分比 | INT | N | | 0-100 |
| scheduled_at | 计划执行时间 | timestamp | Y | | |
| started_at | 开始执行时间 | timestamp | Y | | |
| completed_at | 完成时间 | timestamp | Y | | |
| error_message | 错误信息 | TEXT | Y | | |

### 5.4. 内置学习任务表（SQLite）

- 表名：self_learning_builtin_task
- 库名：self_learning

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| task_id | 任务 ID | UUID | N | 唯一索引 | 内置任务 ID 固定 |
| task_name | 任务名称 | VARCHAR | N | | |
| task_type | 任务类型 | ENUM | N | | TAG_MAINTENANCE_CONNECTION / TAG_MAINTENANCE_ESTABLISH / TAG_MAINTENANCE_AGING |
| cron | cron 表达式 | VARCHAR | N | | |
| last_run_at | 上次执行时间 | timestamp | Y | | |
| next_run_at | 下次执行时间 | timestamp | Y | | |
| status | 状态 | ENUM | N | | ENABLED / DISABLED |

### 5.5. 学习成果表（SQLite）

- 表名：self_learning_result
- 库名：self_learning

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| result_id | 成果 ID | UUID | N | 唯一索引 | |
| type | 成果类型 | ENUM | N | 普通索引 | KNOWLEDGE / INSIGHT |
| source | 来源 | ENUM | N | | DOCUMENT / CONVERSATION / TAG_MAINTENANCE |
| content | 成果内容 | TEXT | N | | |
| summary | 成果摘要 | TEXT | Y | | |
| learned_at | 学习时间 | timestamp | N | | |

### 5.6. 学习成果关联 Tag 表（SQLite）

- 表名：self_learning_result_tag
- 库名：self_learning

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| result_id | 成果 ID | UUID | N | 普通索引 | 关联 self_learning_result |
| tag | Tag 名称 | VARCHAR | N | | |

### 5.7. SelfLearning 配置表（SQLite）

- 表名：self_learning_config
- 库名：self_learning

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| random_factor | 随机触发因子 | INT | N | | 0-100，默认 10 |
| document_weight | 文档学习权重 | INT | N | | 默认 40 |
| conversation_weight | 对话学习权重 | INT | N | | 默认 30 |
| tag_maintenance_weight | Tag 图维护权重 | INT | N | | 默认 30 |
| learning_interval_ms | 学习检查间隔（ms） | INT | N | | 默认 600000 |
| default_learning_rate | 默认学习速率 | INT | N | | 默认 5 |
| tag_connection_check_interval_ms | Tag 连接检查间隔（ms） | INT | N | | 默认 1800000 |
| tag_aging_cron | Tag 老化 cron | VARCHAR | N | | 默认 "0 0 2 * * *" |
| orphan_tag_check_cron | 孤立 Tag 检测 cron | VARCHAR | N | | 默认 "0 0 3 * * *" |
| document_split_threshold | 文档拆分阈值（字数） | INT | N | | 默认 5000 |

## 6. 前端页面需求覆盖

| 前端页面需求 | 对应接口 | 说明 |
|------------|---------|------|
| 开始/暂停学习 | startLearning / stopLearning | 控制学习启停 |
| 随机因子配置 | 委托 Config Application | `POST /api/config/update` (config_key=self_learning.*) |
| 学习模式选择 | startLearning（learning_mode） | 选择文档/对话/Tag图维护 |
| 当前任务卡片 | getLearningProgress | 展示当前执行任务 |
| 任务队列 | getLearningProgress | 待执行任务列表 |
| 内置学习任务 | getLearningProgress | 展示内置任务及 cron |
| 知识列表 | getLearningResults | 学习成果分页展示 |
| 洞察列表 | getLearningResults（type=INSIGHT） | 洞察成果展示 |
| 学习统计 | getLearningStats | 统计数据展示 |
| 资料库配置 | addLibrary / deleteLibrary | 管理资料库 |
| 资料库文件列表 | getLibraryFiles / getFileContent | 浏览文件内容 |
| 资料库路径校验 | addLibrary（自动校验） | 路径存在性和权限 |
| Tag 关系图 | getTagGraph | Canvas 图数据 |
| Tag 关联信息 | getTagRelatedInfo | 查看 Tag 关联的问答 |