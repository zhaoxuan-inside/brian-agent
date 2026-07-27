# UserProfile Application

## 1. 设计目标

1. 对用户的使用历史进行分析，分析用户的喜好，从而优化对用户输入的理解和对输出结果的指导；
2. 维护用户画像数据，包括用户偏好、标签、兴趣等维度，为系统提供个性化能力支撑；
3. 从用户对话消息中提取关键词，分析并累积用户兴趣，驱动画像的动态演化；
4. 提供用户画像的查询与更新能力，供上层应用（如 Chat、SelfLearning）读取画像指导输入理解与输出生成；

## 2. 功能设计

### 2.1. 获取用户画像（getProfile）

**功能**：获取指定用户的画像数据，若画像不存在则自动创建空画像并持久化

**入参**：
- user_id：用户ID
- context：查询上下文

**处理流程**：

1. 优先从内存缓存中查找用户画像，命中则直接返回；
2. 缓存未命中时，通过 RelationDBProvider 查询 `user_profile` 表中指定 `user_id` 的记录；
3. 若数据库中存在记录，将其映射为画像对象并写入缓存后返回；
4. 若数据库中不存在记录，创建一个空的用户画像（空偏好、空标签、空兴趣），写入缓存并持久化到 `user_profile` 表；

**返回**：Boolean，表示获取是否完成；用户画像数据通过 output 参数返回

### 2.2. 更新用户画像（updateProfile）

**功能**：更新用户画像的偏好、标签、兴趣、名称、头像等字段

**入参**：
- user_id：用户ID
- updates：待更新的画像字段（preferences / tags / interests / name / avatar 的部分字段）
- context：操作上下文

**处理流程**：

1. 调用 getProfile 获取当前用户画像；
2. 若 updates 中包含 preferences，将其合并到现有偏好（浅合并）；
3. 若 updates 中包含 tags / interests / name / avatar，整体覆盖对应字段；
4. 更新画像的 updated 时间戳，写入缓存并持久化到 `user_profile` 表；

**返回**：Boolean，表示更新是否完成；更新后的画像通过 output 参数返回

### 2.3. 添加用户标签（addProfileTag）

**功能**：为指定用户添加一个标签，已存在则跳过

**入参**：
- user_id：用户ID
- tag：标签名
- context：操作上下文

**处理流程**：

1. 调用 getProfile 获取当前用户画像；
2. 检查 tags 列表中是否已包含该标签，若已存在则直接返回；
3. 将标签追加到 tags 列表，更新 updated 时间戳；
4. 写入缓存并持久化到 `user_profile` 表；

**返回**：Boolean，表示添加是否完成；更新后的画像通过 output 参数返回

### 2.4. 移除用户标签（removeProfileTag）

**功能**：从指定用户的标签列表中移除一个标签

**入参**：
- user_id：用户ID
- tag：标签名
- context：操作上下文

**处理流程**：

1. 调用 getProfile 获取当前用户画像；
2. 从 tags 列表中过滤掉指定的标签；
3. 更新 updated 时间戳，写入缓存并持久化到 `user_profile` 表；

**返回**：Boolean，表示移除是否完成；更新后的画像通过 output 参数返回

### 2.5. 获取用户兴趣（getInterests）

**功能**：获取指定用户的兴趣列表，按兴趣评分降序返回 Top N

**入参**：
- user_id：用户ID
- context：查询上下文

**处理流程**：

1. 调用 getProfile 获取当前用户画像；
2. 对 interests 列表按 score 降序排序；
3. 截取前 10 条返回；

**返回**：Boolean，表示获取是否完成；兴趣列表（含 topic 与 score）通过 output 参数返回

### 2.6. 分析用户画像（analyzeProfile）

**功能**：从用户的对话消息中提取关键词，分析并累积用户兴趣，驱动画像演化

**入参**：
- user_id：用户ID
- user_message：用户消息内容
- assistant_message：助手回复内容
- context：会话上下文

**处理流程**：

1. 调用 getProfile 获取当前用户画像；
2. 对 user_message 进行关键词提取，过滤停用词（the / and / is / of / to 等常见英文虚词），最多提取 10 个关键词；
3. 遍历提取到的关键词，更新兴趣列表：
   - 若关键词已存在于 interests 中，将其 score 累加 0.5；
   - 若关键词不存在，新增兴趣项 { topic: 关键词, score: 1 }；
4. 更新画像的 updated 时间戳，写入缓存并持久化到 `user_profile` 表；

**返回**：Boolean，表示分析是否完成

## 3. 表设计

### 3.1. 用户画像表

- 表名：user_profile
- 库名：userprofile

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| user_id | 用户ID | UUID | N | 唯一索引 | |
| name | 用户名 | VARCHAR | Y | | |
| avatar | 用户头像 | VARCHAR | Y | | |
| preferences | 用户偏好 | JSON | N | | 默认 {} |
| tags | 用户标签 | JSON | N | | 默认 []，字符串数组 |
| interests | 用户兴趣 | JSON | N | | 默认 []，含 topic 与 score |

## 4. 重要内容

1. 用户画像采用内存缓存 + 数据库持久化的双重存储策略，读操作优先命中缓存，写操作同步更新缓存与数据库；
2. 兴趣评分采用增量累加机制：新增兴趣初始 score 为 1，已存在兴趣每次累加 0.5；
3. 关键词提取基于英文虚词停用词表过滤，当前仅支持英文关键词提取；
4. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
5. UserProfile 是 AgentDesign 中第 5 层（应用层）的 4 个核心组件之一，与 Chat、SelfLearning、Gateway 并列；
