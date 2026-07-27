# SelfLearning Application

## 1. 设计目标

1. 支持配置资料库目录；
2. 每一个资料库支持开启自学习（目前只支持 markdown 格式）；
3. tag 相关性维护（老化没用的连接，增加新的连接）；
4. 从用户对话中提取知识，写入记忆系统；
5. 从文档中提取知识，丰富系统记忆；

## 2. 功能设计

### 2.1. 搜索资料库（searchLibrary）

**功能**：搜索已配置的资料库

**入参**：
- keyword：搜索关键词
- context：查询上下文

**处理流程**：

1. 通过 RelationDBProvider 关键词搜索 `library` 表的 `library_title` 和 `library_brief`；

**返回**：Boolean，表示搜索是否完成；资料库列表通过 output 参数返回

### 2.2. 删除资料库（deleteLibrary）

**功能**：删除资料库配置

**入参**：
- library_id：资料库ID
- context：操作上下文

**处理流程**：

1. 通过 RelationDBProvider 删除 `library` 表中指定 `library_id` 的记录；

**返回**：Boolean，表示删除是否完成

### 2.3. 新增资料库（addLibrary）

**功能**：新增资料库配置

**入参**：
- library_title：资料库名
- library_brief：资料库摘要
- library_path：资料库路径
- context：操作上下文

**处理流程**：

1. 通过 RelationDBProvider 向 `library` 表插入新记录；

**返回**：Boolean，表示新增是否完成

### 2.4. 从对话学习（learnFromChat）

**功能**：从用户对话中提取知识，写入记忆系统

**入参**：
- msg_id：消息ID
- interact_id：交互ID
- context：会话上下文

**处理流程**：

1. 根据 `msg_id` 和 `interact_id` 加载对话内容（用户提问和 Agent 回答）；
2. 调用 LLMProvider 从对话内容中提取有价值的知识点；
3. 调用 InfoProvider 的 saveInfo 接口将知识点写入记忆系统（memory_nodes）；

**返回**：Boolean，表示学习是否完成

### 2.5. 从文档学习（learnFromDocument）

**功能**：从资料库文档中提取知识

**入参**：
- library_id：资料库ID
- document_path：文档路径
- context：学习上下文

**处理流程**：

1. 根据 `library_id` 获取资料库路径；
2. 读取指定文档内容（目前支持 markdown 格式）；
3. 调用 LLMProvider 从文档内容中提取知识点；
4. 调用 InfoProvider 的 saveInfo 接口将知识点写入记忆系统；

**返回**：Boolean，表示学习是否完成

## 3. 表设计

### 3.1. 资料库表

- 表名：`library`
- 库名：`selflearning`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| library_title | 资料库名 | VARCHAR | N | | |
| library_brief | 资料库摘要 | VARCHAR | N | | |
| library_path | 资料库路径 | VARCHAR | N | | |

### 3.2. 自学习任务控制表

- 表名：`selflearning_task_control`
- 库名：`selflearning`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| task_title | 任务名 | VARCHAR | N | | |
| task_brief | 任务摘要 | VARCHAR | N | | |
| task_exec_cron | 任务执行周期配置（cron） | VARCHAR | N | | crontab 格式 |

### 3.3. 自学习任务进度表

- 表名：`selflearning_task_progress`
- 库名：`selflearning`

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| task_id | 任务ID | UUID | N | 外键 | 关联 selflearning_task_control 表 |
| task_progress | 任务进度 | INT | N | | 0-100 |
| task_status | 任务状态 | VARCHAR | N | | RUNNING / FINISH / FAILURE |

## 4. 内置自学习内容

### 4.1. 信息标签图相似性维护

**功能**：维护信息标签图中 tag 之间的相似性权重；

**处理流程**：

1. 定期扫描信息标签图中的 tag 连接；
2. 根据连接的使用频率和最近使用时间计算相似性权重；
3. 更新 tag 连接的权重值；

### 4.2. 信息标签图相似性连接建立

**功能**：在信息标签图中建立新的 tag 相似性连接；

**处理流程**：

1. 分析新写入的信息中的 tag；
2. 通过 LLMProvider 计算新 tag 与已有 tag 的语义相似度；
3. 当相似度超过阈值时，在标签图中建立新的连接；

### 4.3. 信息标签图不常用连接老化

**功能**：老化信息标签图中不常用的连接；

**处理流程**：

1. 扫描信息标签图中所有连接；
2. 根据最后使用时间和使用频率判断是否需要老化；
3. 对长期未使用的连接降低权重或删除；

### 4.4. 用户画像建立

**功能**：随机获取用户的消息，分析用户喜好，建立用户画像；

**处理流程**：

1. 随机获取用户的对话消息；
2. 调用 LLMProvider 分析用户消息中的兴趣关键词和偏好；
3. 将分析结果写入用户画像（UserProfile）；

---

## 5. 重要内容

1. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
