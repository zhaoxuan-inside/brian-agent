# SelfLearning Application 测试用例

> 基于 [SelfLearning-PRD.md](../SelfLearning/SelfLearning-PRD.md) 生成，覆盖所有接口及 80%+ 场景。

---

## 测试约定

- 测试框架：vitest + supertest
- 独立测试环境：`beforeEach` 初始化临时 DB 及表结构
- 环境变量：`BRIAN_LOG_LEVEL=error`、`BRIAN_USE_SQLITE_GRAPH=true`
- 依赖 Mock：OrchestrationEntry（receiveWorkAsync）、EvolutorAgent（startEvalSchedule/stopEvalSchedule/getEvaluation）、WriterAgent（getUserProfile）、InfoCore（graphTag/relationKInfo/saveInfo/lastNInfo）、MQCore（startWorker/stopWorker）、LLMCore（execLLM）、GraphDBProvider、RelationDBProvider、MQProvider
- 文件系统 mock：使用临时目录模拟资料库目录

---

## 1. 资料库管理

### 1.1 添加资料库 — addLibrary

**端点**：`POST /api/learning/library`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-001 | 添加合法资料库 | library_path 指向含 .md 文件的目录 | HTTP 201，返回 library_id（UUID）和文件数量，self_learning_library + self_learning_file 表写入 |
| TC-SL-002 | 添加资料库（指定名称） | library_name="技术文档库" | library_name 为指定值（非目录名） |
| TC-SL-003 | 添加资料库（不指定名称） | 不传 library_name | library_name 取目录名 |
| TC-SL-004 | enable_self_learning=true | 显式设置 | enable_self_learning=true |
| TC-SL-005 | enable_self_learning=false | 显式设置为 false | enable_self_learning=false，后续不会自动加入学习队列 |
| TC-SL-006 | learning_rate 自定义 | learning_rate=10 | learning_rate=10 |
| TC-SL-007 | learning_rate 使用默认值 | 不传 learning_rate | learning_rate=5 |
| TC-SL-008 | 目录含多个 .md 文件 | 5 个 .md 文件 | 全部扫描，self_learning_file 表有 5 条记录，status=PENDING |
| TC-SL-009 | 目录含非 .md 文件 | 含 .txt/.js 等 | 仅 .md 文件被扫描，其他忽略 |
| TC-SL-010 | 目录无 .md 文件 | 空目录或仅有非 .md 文件 | HTTP 200，文件数量=0 |
| TC-SL-011 | library_path 不存在 | 路径不存在 | HTTP 400，提示目录不存在 |
| TC-SL-012 | library_path 不是目录 | library_path 指向文件 | HTTP 400，提示需要目录 |
| TC-SL-013 | library_path 无读取权限 | 目录权限不足 | HTTP 400，提示无法读取 |
| TC-SL-014 | 重复添加同一资料库 | library_path 与已有记录相同 | HTTP 409 或允许（以 path 判断可能允许，以 library_id 生成新记录） |

### 1.2 删除资料库 — deleteLibrary

**端点**：`DELETE /api/learning/library/:library_id`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-020 | 删除存在的资料库 | library_id 有效 | HTTP 200，self_learning_library 和相关 self_learning_file 记录全部删除 |
| TC-SL-021 | library_id 不存在 | library_id="nonexistent" | HTTP 404 |
| TC-SL-022 | 事务回滚 | 删除 file 表时 DB 异常 | 事务回滚，library 记录不被部分删除 |

### 1.3 搜索资料库 — searchLibrary

**端点**：`GET /api/learning/library`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-025 | 无参数搜索 | — | HTTP 200，返回所有资料库列表，每条含 library_id/library_name/library_path/file_count/learned_count/enable_self_learning/learning_rate/created/updated |
| TC-SL-026 | 关键词搜索 | keyword="技术" | 返回 library_name 匹配"技术"的资料库 |
| TC-SL-027 | 分页 | page_current=1, page_size=10 | 分页正确 |
| TC-SL-028 | file_count 正确 | 资料库有 5 个文件 | file_count=5 |
| TC-SL-029 | learned_count 正确 | 其中 2 个文件 COMPLETED | learned_count=2 |
| TC-SL-030 | 无匹配 | keyword="不存在" | total=0, libraries=[] |

### 1.4 获取资料库文件列表 — getLibraryFiles

**端点**：`GET /api/learning/library/:library_id/files`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-035 | 获取所有文件 | 不指定 status | HTTP 200，返回所有文件，每条含 file_id/file_name/file_path/file_size/status/learned_at/created |
| TC-SL-036 | 按 PENDING 过滤 | status=PENDING | 仅返回 PENDING 状态文件 |
| TC-SL-037 | 按 COMPLETED 过滤 | status=COMPLETED | 仅返回 COMPLETED 文件 |
| TC-SL-038 | 按 PROCESSING 过滤 | status=PROCESSING | 仅返回 PROCESSING 文件 |
| TC-SL-039 | 按 FAILED 过滤 | status=FAILED | 仅返回 FAILED 文件 |
| TC-SL-040 | 分页 | page_current=1, page_size=10 | 分页正确 |
| TC-SL-041 | library_id 不存在 | 无效 ID | HTTP 404 |
| TC-SL-042 | 空资料库 | 无文件 | files=[], total=0 |

### 1.5 获取文件内容 — getFileContent

**端点**：`GET /api/learning/library/file/:file_id/content`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-045 | 获取文件内容 | file_id 有效，文件存在 | HTTP 200，返回 file_name（STRING）、content（STRING，Markdown 原始内容）、learned_at（如有） |
| TC-SL-046 | file_id 不存在 | 无效 file_id | HTTP 404 |
| TC-SL-047 | 文件在磁盘上已删除 | DB 记录存在但磁盘文件不存在 | HTTP 404 或 file_content 为空/报错 |
| TC-SL-048 | 大文件内容（>1MB） | 文件较大 | HTTP 200，完整返回内容 |

---

## 2. 学习控制

### 2.1 启动学习 — startLearning

**端点**：`POST /api/learning/start`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-050 | 启动所有资料库学习（ALL 模式） | 多个资料库 enable_self_learning=true | HTTP 200，所有资料库的 PENDING 文件入 MQ 队列，Worker 启动 |
| TC-SL-051 | 启动指定资料库 | library_id 指定 | HTTP 200，仅该资料库文件入队 |
| TC-SL-052 | 仅文档学习 | learning_mode=DOCUMENT | HTTP 200，仅启动文档学习，不启动对话学习和 Tag 维护 |
| TC-SL-053 | 仅对话学习 | learning_mode=CONVERSATION | HTTP 200，调用 EvolutorAgent.startEvalSchedule |
| TC-SL-054 | 仅 Tag 图维护 | learning_mode=TAG_MAINTENANCE | HTTP 200，启动 Tag 连接建立 + 激活 + 老化定时任务 |
| TC-SL-055 | 全模式学习 | learning_mode=ALL | HTTP 200，三种学习模式同时启动 |
| TC-SL-056 | 临时覆盖学习速率 | learning_rate=20 | HTTP 200，本次学习按 20 的速率执行 |
| TC-SL-057 | library_id 不存在 | 不存在的资料库 | HTTP 404 |
| TC-SL-058 | 无 enable_self_learning=true 的资料库 | 所有资料库 enable_self_learning=false | HTTP 200，但无文件入队 |
| TC-SL-059 | 无 PENDING 文件 | 所有文件已学习完成 | HTTP 200，无任务创建 |
| TC-SL-060 | MQ 队列已有 Worker | 重复启动 | HTTP 200，幂等（不重复创建 Worker） |
| TC-SL-061 | learning_mode 非法值 | learning_mode="INVALID" | HTTP 400 |

### 2.2 暂停学习 — stopLearning

**端点**：`POST /api/learning/stop`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-065 | 停止所有学习 | learning_mode=ALL | HTTP 200，MQ Worker 停止，EvolutorAgent 停止，Tag 维护停止 |
| TC-SL-066 | 仅停止文档学习 | learning_mode=DOCUMENT | HTTP 200，仅 MQ Worker 停止 |
| TC-SL-067 | 仅停止对话学习 | learning_mode=CONVERSATION | HTTP 200，调用 EvolutorAgent.stopEvalSchedule |
| TC-SL-068 | 仅停止 Tag 维护 | learning_mode=TAG_MAINTENANCE | HTTP 200，Tag 维护定时任务停止 |
| TC-SL-069 | 停止指定资料库 | library_id 指定 | HTTP 200，仅该资料库的队列消费停止 |
| TC-SL-070 | 学习未启动时停止 | 从未调用 startLearning | HTTP 200（幂等，无影响） |
| TC-SL-071 | learning_mode 非法值 | learning_mode="INVALID" | HTTP 400 |

### 2.3 文档学习（内部）— handleDocumentLearning

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-080 | 小文件学习（< 阈值） | 文件字符数 < document_split_threshold（5000） | 不分块，一次提交 receiveWorkAsync，force_orchestration_strategy=SIMPLE |
| TC-SL-081 | 大文件学习（>= 阈值） | 文件字符数 >= 5000 | 按 Markdown 标题分块，分块数 ≥ 2 |
| TC-SL-082 | 文件自动分块 — 标题分块 | Markdown 含多个 ## 章节 | 按章节切分，每章一个独立 work |
| TC-SL-084 | 系统内置 session 自动创建 | 首次调用，"self_learning" session 不存在 | chat_session 记录数 +1 |
| TC-SL-085 | 系统内置 session 已存在 | "self_learning" session 已创建 | chat_session 记录数不变（复用） |
| TC-SL-086 | 学习完成后状态更新 | work 执行成功 | file 状态→COMPLETED，learned_at 记录时间 |
| TC-SL-087 | 学习失败状态更新 | receiveWorkAsync 返回失败 | file 状态→FAILED |
| TC-SL-088 | 学习结果保存 | 学习完成 | InfoCore.saveInfo 被调用 |
| TC-SL-089 | 分块学习按序执行 | 文件分 3 块 | 块 1 先处理，块 3 最后处理 |
| TC-SL-090 | 完整文件学习流程 | 小文件 < 阈值 | 学习完成后文件状态 COMPLETED |

---

## 3. Tag 图维护

### 4.1 Tag 相似性连接建立 — startTagConnectionEstablishment

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-100 | 为新 Tag 建立连接 | 24h 内有新增 Tag | 调用 InfoCore.graphTag 为每个新 Tag 建立相似性边 |
| TC-SL-101 | 无新 Tag | 24h 内无新增 Tag | 无操作，记录日志 |
| TC-SL-102 | 大量新 Tag | 100+ 新 Tag | 逐个处理，记录建立连接数量 |
| TC-SL-103 | 连接建立结果保存 | 新连接建立 | InfoCore.saveInfo 保存学习记录 |

### 4.2 Tag 连接激活 — startTagActivation

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-105 | 定时激活 | 定时执行 | 遍历最近使用的 Tag，调用 activateGraphEdge |
| TC-SL-106 | 无活跃 Tag | 系统无 Tag | 无操作 |
| TC-SL-107 | 激活记录 | 激活操作执行 | 记录激活的边数量 |

### 4.3 Tag 连接老化 — startTagAging

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-110 | 定时老化 | 每天凌晨 2:00 执行 | 调用 GraphDBProvider.ageGraphEdge，被老化边标记 is_active=false |
| TC-SL-111 | 老化后重新激活（可逆性） | 被老化边后续有关联查询 | 边恢复为 is_active=true |
| TC-SL-112 | 老化结果记录 | 老化完成 | 老化边数量记录，InfoCore.saveInfo 保存 |

### 4.4 孤立 Tag 检测 — startOrphanTagCheck

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-115 | 检测孤立 Tag | 存在无连接的 Tag | 调用 graphTag 尝试建立连接 |
| TC-SL-116 | 无孤立 Tag | 所有 Tag 有连接 | 检测到 0 个孤立 |
| TC-SL-117 | 动态可逆性 | 老化导致孤立→重新激活 | 孤立检查后可恢复 |

---

## 4. Tag 图可视化数据

### 5.1 获取 Tag 图结构 — getTagGraph

**端点**：`GET /api/learning/tag/graph`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-120 | 获取完整 Tag 图 | 系统有 Tag 数据 | HTTP 200，返回 nodes（含 tag_id/tag_name/activation_count/node_size/info_count/created）和 edges（含 edge_id/from_tag_id/to_tag_id/edge_type/weight/similarity/is_active/last_activation_time） |
| TC-SL-121 | only_active=true | 仅返回活跃边 | edges 中所有边 is_active=true |
| TC-SL-122 | only_active=false | 返回所有边 | edges 含活跃和非活跃边 |
| TC-SL-123 | min_weight 过滤 | min_weight=0.5 | 仅返回 weight >= 0.5 的边 |
| TC-SL-124 | limit 限制 | limit=100 | 最多返回 100 个节点（按 activation_count 降序取 top） |
| TC-SL-125 | node_size 计算正确 | activation_count 有高有低 | 归一化到 [0.3, 1.0] |
| TC-SL-126 | metadata 正确 | 正常 | 含 total_nodes/total_edges/active_edges/orphan_nodes |
| TC-SL-127 | 空 Tag 图 | 无 Tag | nodes=[], edges=[], metadata 全 0 |
| TC-SL-128 | 超大图场景 | Tag 超过 limit | 优先返回 activation_count 高的节点 |
| TC-SL-128-LRG | 超大图场景（超过 limit 限制） | Tag 数 > limit | 按 activation_count 降序排序后截断到 limit |

### 5.2 获取 Tag 关联信息 — getTagRelatedInfo

**端点**：`GET /api/learning/tag/:tag_id/info`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-130 | 获取关联信息 | tag_id 有效，有 info 关联 | HTTP 200，返回 infos 列表，每条含 info_id/info/summary/info_creator_role/created |
| TC-SL-131 | tag_id 不存在 | 无效 tag_id | HTTP 404 |
| TC-SL-132 | 无关联信息 | Tag 存在但无关联 info | total=0, infos=[] |
| TC-SL-133 | 分页 | page_current + page_size | 分页正确 |

---

## 5. 学习进度与成果

### 6.1 获取学习进度 — getLearningProgress

**端点**：`GET /api/learning/progress`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-140 | 获取学习进度（有运行中任务） | 任务 RUNNING | HTTP 200，current_task 含 task_id/task_name/task_type/status/progress/started_at/library_name/file_name |
| TC-SL-141 | 获取任务队列 | 有 PENDING 任务 | task_queue 按 scheduled_at 升序排列 |
| TC-SL-142 | 获取内置任务 | 系统内置任务固定 | builtin_tasks 含 TAG_MAINTENANCE_CONNECTION/ESTABLISH/AGING，每条含 task_id/task_name/task_type/cron/last_run_at/next_run_at/status |
| TC-SL-143 | 无运行中任务 | 无 RUNNING 任务 | current_task=null |
| TC-SL-144 | 无待执行任务 | task_queue 为空 | task_queue=[] |
| TC-SL-145 | 内置任务不可为空 | 系统初始化 | builtin_tasks 至少 3 条 |

### 6.2 获取学习成果 — getLearningResults

**端点**：`GET /api/learning/results`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-150 | 获取全部成果 | 不指定过滤 | HTTP 200，返回所有成果，每条含 result_id/type/source/content/summary/related_tags/learned_at |
| TC-SL-151 | 按类型过滤（KNOWLEDGE） | type=KNOWLEDGE | 仅返回 KNOWLEDGE 类型 |
| TC-SL-152 | 按类型过滤（INSIGHT） | type=INSIGHT | 仅返回 INSIGHT 类型 |
| TC-SL-153 | 按来源过滤（DOCUMENT） | source=DOCUMENT | 仅返回文档学习成果 |
| TC-SL-154 | 按来源过滤（CONVERSATION） | source=CONVERSATION | 仅返回对话学习成果 |
| TC-SL-155 | 按来源过滤（TAG_MAINTENANCE） | source=TAG_MAINTENANCE | 仅返回 Tag 维护成果 |
| TC-SL-156 | 组合过滤 | type=KNOWLEDGE, source=DOCUMENT | 取交集 |
| TC-SL-157 | 分页 | page_current + page_size | 分页正确 |
| TC-SL-158 | 无结果 | 无匹配 | total=0, results=[] |
| TC-SL-159 | 每条结果包含关联 Tag | 有相关 Tag | related_tags 数组包含 Tag 名称 |

### 6.3 获取学习统计 — getLearningStats

**端点**：`GET /api/learning/stats`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-165 | 获取完整统计 | 系统有学习数据 | HTTP 200，含 total_learning_count/total_knowledge_count/total_insight_count/this_week_learning_count/document_learning/tag_graph/learning_trend |
| TC-SL-166 | 文档学习统计正确 | 150 文件/120 已学/5 失败 | completion_rate=0.80 |
| TC-SL-167 | Tag 图统计正确 | 有 Tag 和边 | total_tags/total_edges/active_edges/orphan_tags/aged_edges_this_week/new_edges_this_week |
| TC-SL-168 | 学习趋势正确 | 有多日数据 | learning_trend 按 date 排序，count 正确 |
| TC-SL-169 | 空数据 | 无任何学习 | 各项统计值为 0 |

---

## 6. 配置（委托 Config Application）

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-SL-180 | SelfLearning 模块无独立 HTTP 配置端点 | POST /api/learning/config | HTTP 404 |
| TC-SL-181 | 配置通过 Config 代理修改 | POST /api/config/update { config_key: "self_learning.default_learning_rate", value: 10 } | 成功 |
| TC-SL-182 | 随机因子权重通过 Config 管理 | POST /api/config/update { config_key: "self_learning.random_factor", value: 20 } | 成功，不独立暴露 |

---

## 覆盖率矩阵

| 功能模块 | 接口数 | 测试用例数 | 场景覆盖 |
|---------|--------|----------|---------|
| 资料库管理 | 5 | 33 | CRUD + 扫描 + 分页 + 路径校验 + 异常 |
| 学习控制 | 2 | 16 | 启停 + 模式 + 速率 + 幂等 + 边界 |
| 文档学习（内部） | — | 10 | 分块 + session + 状态 + 失败 + 顺序 |
| Tag 图维护（内部+API） | 6 | 34 | 连接建立/激活/老化/孤立检测 + 可逆性 + 图查询 + 关联信息 |
| 学习进度与成果 | 3 | 20 | 进度/成果/统计 + 过滤 + 分页 |
| 配置委托 | — | 4 | 内部方法 + 代理 |

**总计**：12 个 HTTP 端点 + 10 个内部方法，117 个测试用例，覆盖文件管理、学习控制、Tag 图生命周期、文档分块、可视化数据、统计等完整流程。
