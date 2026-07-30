# UserProfile Application

## 1. 设计目标

1. 支持配置要建立用户画像的分析方向（如语言偏好、回复风格偏好、知识兴趣领域、交互习惯等），指导 EvolutorAgent 和系统学习模块建立这些方向的画像；
2. 展示系统对用户的多维度画像数据，供前端用户画像页面展示；
3. 管理用户画像的生成时机和更新策略（手动触发/定时触发/事件触发）；
4. 提供用户画像数据的历史版本追溯，展示画像随时间的演变趋势。

## 2. 模块职责

UserProfile Application 是用户画像的管理和展示层，负责：
- 定义画像维度（profile direction），指导下层 Agent 的学习方向；
- 聚合来自多个下层模块的画像数据（WriterAgent 的用户偏好、EvolutorAgent 的评估分析、InfoCore 的对话数据）；
- 提供画像可视化数据接口供前端展示。

### 依赖关系

| 依赖层级 | 模块 | 调用接口 | 用途 |
|---------|------|---------|------|
| Agent | WriterAgent | saveUserProfile | 保存用户偏好设置 |
| Agent | WriterAgent | getUserProfile | 获取用户偏好设置 |
| Agent | EvolutorAgent | getEvaluation | 获取 Agent 评估历史 |
| Agent | EvolutorAgent | getEvolutionReport | 获取 Agent 进化报告 |
| Core | InfoCore | lastNInfo | 查询用户对话历史 |
| Core | InfoCore | context | 构建会话上下文 |
| Core | InfoCore | relationKInfo | 基于 Tag 相关性分析用户兴趣 |
| Base | RelationDBProvider | insertDB / selectDB / updateDB / deleteDB | 画像维度配置和画像数据 CRUD |
| Base | LLMProvider | execLLM | 调用 LLM 分析用户画像（画像生成） |
| Base | PromptsProvider | execPrompt | 使用 Prompt 模板构建画像分析 prompt |
| Base | LogProvider | debug / info / warn / error | 日志记录 |

## 3. 功能设计

### 3.1. 画像维度管理

#### 3.1.1. 配置画像维度（configProfileDirection）

**功能**：配置要建立用户画像的分析方向及其权重

**URL**：`POST /api/profile/direction`

**入参（ConfigProfileDirectionInput extends Input）**：
- directions：画像维度列表 [{ direction_key, direction_name, direction_description, weight, enable }]

| 维度字段 | 类型 | 说明 |
|---------|------|------|
| direction_key | STRING | 维度唯一标识（如 "language_preference"、"reply_style"、"knowledge_interest"） |
| direction_name | STRING | 维度显示名称（如"语言偏好"、"回复风格偏好"、"知识兴趣领域"） |
| direction_description | STRING | 维度描述 |
| weight | INT | 维度权重（0-100），影响画像生成时该维度的分析深度 |
| enable | BOOLEAN | 是否启用该维度 |

**内置维度**：

| direction_key | direction_name | 说明 | 默认权重 |
|--------------|---------------|------|---------|
| language_preference | 语言偏好 | 用户偏好的语言（中文/英文）及语言风格 | 20 |
| reply_style | 回复风格偏好 | 用户偏好的回复风格（简洁/详细/创意/专业） | 25 |
| knowledge_interest | 知识兴趣领域 | 用户关注的知识领域和话题（基于 Tag 分析） | 30 |
| interaction_habit | 交互习惯 | 用户与系统的交互模式（提问频率、引用频率、反馈行为） | 15 |
| feedback_sensitivity | 反馈敏感度 | 用户对系统回复的满意度倾向 | 10 |

**处理流程**：

1. 遍历 directions 列表，校验每个维度元数据完整性；
2. 调用 RelationDBProvider.insertDB 向 `user_profile_direction` 表（库名=user_profile）写入/更新维度配置（upsert 语义：按 direction_key 唯一约束）；
3. 返回配置结果；

#### 3.1.2. 获取画像维度配置（getProfileDirection）

**功能**：获取当前配置的画像维度列表

**URL**：`GET /api/profile/direction`

**输出**：
- directions：画像维度列表 [{ direction_key, direction_name, direction_description, weight, enable, last_updated }]

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `user_profile_direction` 表；
2. 返回维度列表；

### 3.2. 画像数据管理

#### 3.2.1. 获取用户画像（getUserProfile）

**功能**：获取用户的完整画像数据，聚合多个来源的画像信息

**URL**：`GET /api/profile`

**入参（Query String）**：
- session_id（STRING，可选）：指定会话的用户画像，不传则返回全局画像
- version（INT，可选）：指定画像版本，不传则返回最新版本

**输出**：
```json
{
  "session_id": "session_uuid",
  "profile_version": 3,
  "generated_at": 1234567890,
  "dimensions": {
    "language_preference": {
      "direction_name": "语言偏好",
      "weight": 20,
      "value": {
        "primary_language": "zh-CN",
        "language_style": "technical",
        "confidence": 0.85
      },
      "evidence": [
        { "source": "user_preference", "detail": "用户在 WriterAgent 偏好设置中选择了 zh-CN" },
        { "source": "conversation_analysis", "detail": "最近 100 条消息中 98% 为中文" }
      ],
      "last_updated": 1234567890
    },
    "reply_style": {
      "direction_name": "回复风格偏好",
      "weight": 25,
      "value": {
        "preferred_style": "detailed",
        "preferred_depth": "deep",
        "preferred_format": "MARKDOWN",
        "confidence": 0.72
      },
      "evidence": [
        { "source": "user_preference", "detail": "用户在 WriterAgent 偏好设置中选择了 detailed/deep/MARKDOWN" }
      ],
      "last_updated": 1234567890
    },
    "knowledge_interest": {
      "direction_name": "知识兴趣领域",
      "weight": 30,
      "value": {
        "top_tags": [
          { "tag": "React", "frequency": 45, "weight": 0.9 },
          { "tag": "TypeScript", "frequency": 38, "weight": 0.85 },
          { "tag": "系统架构", "frequency": 30, "weight": 0.75 }
        ],
        "interest_distribution": {
          "前端开发": 0.45,
          "后端开发": 0.30,
          "系统设计": 0.25
        }
      },
      "evidence": [
        { "source": "tag_analysis", "detail": "基于 info_tag 表统计，最近 30 天 Tag 出现频率" }
      ],
      "last_updated": 1234567890
    },
    "interaction_habit": {
      "direction_name": "交互习惯",
      "weight": 15,
      "value": {
        "avg_question_length": 85,
        "citing_frequency": 0.3,
        "feedback_rate": 0.15,
        "active_hours": [9, 10, 14, 15, 16],
        "session_duration_avg_min": 25
      },
      "evidence": [
        { "source": "conversation_analysis", "detail": "基于最近 50 个 session 的统计" }
      ],
      "last_updated": 1234567890
    },
    "feedback_sensitivity": {
      "direction_name": "反馈敏感度",
      "weight": 10,
      "value": {
        "avg_rating": 4.2,
        "positive_rate": 0.78,
        "negative_rate": 0.05,
        "trend": "stable"
      },
      "evidence": [
        { "source": "evaluation_analysis", "detail": "基于 EvolutorAgent 评估记录和用户反馈" }
      ],
      "last_updated": 1234567890
    }
  },
  "profile_summary": "该用户是一位技术专业人士，偏好使用中文进行交流，期望获得详细且深度的技术回复。主要关注前端开发（React、TypeScript）和系统架构领域。交互习惯稳定，活跃于工作日上午和下午时段。对系统回复满意度较高。",
  "evolution_trend": [
    { "version": 1, "generated_at": 1234567890, "change_summary": "初始画像生成" },
    { "version": 2, "generated_at": 1234567890, "change_summary": "知识兴趣领域更新：新增 TypeScript 兴趣" },
    { "version": 3, "generated_at": 1234567890, "change_summary": "回复风格偏好趋于详细化" }
  ]
}
```

**处理流程**：

1. 调用 WriterAgent.getUserProfile(session_id) 获取用户偏好设置（语言、风格、深度、格式）；
2. 调用 RelationDBProvider.selectOneDB 查询 `user_profile_record` 表获取最新版本的画像记录；
3. 对每个启用的画像维度（从 `user_profile_direction` 表读取）：
   a. **language_preference**：从 WriterAgent.getUserProfile 和 InfoCore.lastNInfo 中分析语言偏好；
   b. **reply_style**：从 WriterAgent.getUserProfile 获取偏好设置；
   c. **knowledge_interest**：调用 InfoCore.relationKInfo 基于 Tag 分析用户兴趣领域，统计 info_tag 表中高频 Tag；
   d. **interaction_habit**：调用 RelationDBProvider.selectDB 统计对话行为（平均提问长度、引用频率、活跃时段）；
   e. **feedback_sensitivity**：调用 EvolutorAgent.getEvaluation 获取评估历史和用户反馈倾向；
4. 调用 PromptsProvider.execPrompt + LLMProvider.execLLM 生成 profile_summary（自然语言画像总结）；
5. 调用 RelationDBProvider.selectDB 查询 `user_profile_record` 表获取画像版本演变历史；
6. 组装完整画像数据返回；

#### 3.2.2. 生成/刷新画像（generateProfile）

**功能**：手动触发画像生成，分析用户数据并更新画像

**URL**：`POST /api/profile/generate`

**入参（GenerateProfileInput extends Input）**：
- session_id（STRING，可选）：指定会话范围，不传则分析所有会话
- directions（STRING[]，可选）：指定要生成的维度，不传则生成所有启用维度

**处理流程**：

1. 获取当前画像版本号（从 `user_profile_record` 表查询最新 version，+1）；
2. 调用 InfoCore.lastNInfo 获取用户对话历史（指定 session_id 或全部）；
3. 对每个指定维度，调用 LLM 进行分析：
   a. 调用 PromptsProvider.execPrompt 使用画像分析 prompt 模板构建 prompt；
   b. 调用 LLMProvider.execLLM 执行分析，生成维度值；
4. 汇总各维度分析结果，生成 profile_summary；
5. 调用 RelationDBProvider.insertDB 将新版本画像写入 `user_profile_record` 表；
6. 调用 RelationDBProvider.insertDB 批量写入各维度数据到 `user_profile_dimension_data` 表；
7. 若 session_id 非空，调用 WriterAgent.saveUserProfile 将画像中的偏好设置同步到 WriterAgent 的用户画像表；
8. 返回新版本画像数据；

#### 3.2.3. 保存用户偏好（saveUserPreference）

**功能**：保存用户主动设置的偏好配置

**URL**：`POST /api/profile/preference`

**入参（SaveUserPreferenceInput extends Input）**：
- session_id（STRING，必选）：会话 ID
- language（STRING，可选）：偏好语言
- style（ENUM，可选）：回复风格（clear / concise / detailed / creative）
- depth（ENUM，可选）：回复深度（shallow / medium / deep）
- format（ENUM，可选）：回复格式（TEXT / MARKDOWN / JSON）
- additional_preferences（STRING，可选）：额外偏好说明

**处理流程**：

1. 调用 WriterAgent.saveUserProfile 保存用户偏好；
2. 返回保存结果；

### 3.3. 画像历史

#### 3.3.1. 获取画像演变历史（getProfileHistory）

**功能**：获取用户画像的版本演变历史

**URL**：`GET /api/profile/history`

**入参（Query String）**：
- session_id（STRING，可选）
- limit（INT，可选）：返回最近 N 个版本，默认 10

**输出**：
- history：画像版本列表 [{ version, generated_at, change_summary, dimensions_summary }]

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `user_profile_record` 表（按 session_id 过滤，按 version DESC 排序，LIMIT limit）；
2. 返回版本列表；

#### 3.3.2. 获取指定版本画像（getProfileByVersion）

**功能**：获取指定版本的用户画像数据

**URL**：`GET /api/profile/version/:version`

**入参**：
- version（Path Param，必选）：画像版本号
- session_id（Query String，可选）

**输出**：
- 完整画像数据（同 getUserProfile 返回格式）

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `user_profile_record` 表获取指定版本记录；
2. 调用 RelationDBProvider.selectDB 查询 `user_profile_dimension_data` 表获取该版本各维度数据；
3. 组装返回；

### 3.4. 配置（configUserProfile）

**功能**：配置 UserProfile Application 的参数

**URL**：`POST /api/profile/config`

**入参**：
- input：ConfigUserProfileInput（继承 Input），包含以下字段：
  - auto_generate_interval_ms（INT，可选）：自动生成画像间隔（毫秒），默认 86400000（24 小时）
  - profile_analysis_prompt_template_id（STRING，可选）：画像分析 prompt 模板 ID
  - max_conversation_sample_count（INT，可选）：画像分析时采样的最大对话数，默认 500
  - profile_retention_versions（INT，可选）：保留的画像历史版本数，默认 20
  - min_confidence_threshold（DOUBLE，可选）：画像维度置信度最低阈值，默认 0.5
- context：ConfigUserProfileContext（继承 Context）
- output：ConfigUserProfileOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `user_profile_config` 表；
2. 校验并更新传入的非空字段；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置；

## 4. 重要内容

1. 所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；
2. 用户画像数据由多个来源聚合而成：WriterAgent 的用户偏好设置、EvolutorAgent 的评估分析、InfoCore 的对话数据和 Tag 统计；
3. 画像维度可配置：通过 configProfileDirection 增删改画像维度，EvolutorAgent 和系统学习模块根据这些维度指导学习方向；
4. 画像版本管理：每次 generateProfile 生成新版本，保留历史版本（最多 profile_retention_versions 个），支持版本追溯和趋势分析；
5. 画像生成通过 LLM 分析对话数据，需注意 Token 消耗——通过 max_conversation_sample_count 限制采样数量；
6. 所有外部资源访问必须通过对应的 Provider/Access 层，禁止绕过；
7. 所有日志通过 LogProvider 记录，禁止 console.log；
8. 所有 ID 通过 IdGenerator.generate() 生成；

## 5. 表设计

### 5.1. 画像维度配置表（SQLite）

- 表名：user_profile_direction
- 库名：user_profile

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| direction_key | 维度唯一标识 | VARCHAR | N | 唯一索引 | 如 "language_preference" |
| direction_name | 维度显示名称 | VARCHAR | N | | |
| direction_description | 维度描述 | TEXT | Y | | |
| weight | 维度权重 | INT | N | | 0-100 |
| enable | 是否启用 | BOOLEAN | N | | 默认 true |

### 5.2. 画像记录表（SQLite）

- 表名：user_profile_record
- 库名：user_profile

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_id | 会话 ID | UUID | Y | 普通索引 | 为空表示全局画像 |
| version | 画像版本号 | INT | N | | 从 1 开始递增 |
| profile_summary | 画像自然语言总结 | TEXT | Y | | LLM 生成 |
| generated_at | 生成时间 | timestamp | N | | |
| change_summary | 变更摘要 | TEXT | Y | | 与前版本的差异描述 |

### 5.3. 画像维度数据表（SQLite）

- 表名：user_profile_dimension_data
- 库名：user_profile

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| profile_record_id | 画像记录 ID | UUID | N | 普通索引 | 关联 user_profile_record.id |
| direction_key | 维度唯一标识 | VARCHAR | N | | |
| dimension_value | 维度值 | TEXT | N | | JSON 格式 |
| evidence | 证据列表 | TEXT | Y | | JSON 格式，[{ source, detail }] |
| confidence | 置信度 | DOUBLE | N | | 0.0-1.0 |

### 5.4. UserProfile 配置表（SQLite）

- 表名：user_profile_config
- 库名：user_profile

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| auto_generate_interval_ms | 自动生成间隔（ms） | INT | N | | 默认 86400000 |
| profile_analysis_prompt_template_id | 画像分析 prompt 模板 ID | UUID | Y | | |
| max_conversation_sample_count | 最大对话采样数 | INT | N | | 默认 500 |
| profile_retention_versions | 保留历史版本数 | INT | N | | 默认 20 |
| min_confidence_threshold | 最低置信度阈值 | DOUBLE | N | | 默认 0.5 |

## 6. 前端页面需求覆盖

| 前端页面需求 | 对应接口 | 说明 |
|------------|---------|------|
| 配置画像方向 | configProfileDirection | 配置要分析的画像维度 |
| 展示用户画像 | getUserProfile | 获取完整画像数据 |
| 画像维度详情 | getUserProfile（dimensions 字段） | 各维度值和证据 |
| 画像演变趋势 | getProfileHistory | 版本演变历史 |
| 历史版本查看 | getProfileByVersion | 查看指定版本画像 |
| 语言偏好设置 | saveUserPreference | 保存用户偏好 |
| 手动刷新画像 | generateProfile | 触发画像生成 |
| 画像总结 | getUserProfile（profile_summary 字段） | LLM 生成的总结 |