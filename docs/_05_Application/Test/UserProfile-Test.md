# UserProfile Application 测试用例

> 基于 [UserProfile-PRD.md](../UserProfile/UserProfile-PRD.md) 生成，覆盖所有接口及 80%+ 场景。

---

## 测试约定

- 测试框架：vitest + supertest
- 独立测试环境：`beforeEach` 初始化临时 DB 及表结构（user_profile_direction、user_profile_record、user_profile_dimension_data、user_profile_config）
- 环境变量：`BRIAN_LOG_LEVEL=error`、`BRIAN_USE_SQLITE_GRAPH=true`
- 依赖 Mock：WriterAgent（saveUserProfile/getUserProfile）、EvolutorAgent（getEvaluation/getEvolutionReport）、InfoCore（lastNInfo/context/relationKInfo）、LLMCore（execLLM）、PromptsProvider（execPrompt）、RelationDBProvider

---

## 1. 画像维度管理

### 1.1 配置画像维度 — configProfileDirection

**端点**：`POST /api/profile/direction`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-UP-001 | 配置单个维度 | directions=[{direction_key: "custom", ...}] | HTTP 200，user_profile_direction 表写入 |
| TC-UP-002 | 批量配置多个维度 | directions=[{...}, {...}] | HTTP 200，多条记录写入 |
| TC-UP-003 | Upsert 语义 — 更新已有维度 | direction_key 已存在 | 更新 direction_name/weight/enable 等字段 |
| TC-UP-004 | 配置所有有效字段 | 含 direction_key/name/description/weight/enable | 全部正确保存 |
| TC-UP-005 | weight 设为 0 | weight=0 | HTTP 200（0 表示该维度不参与分析但可配置） |
| TC-UP-006 | weight 设为 100 | weight=100 | HTTP 200 |
| TC-UP-007 | enable=false | 禁用某维度 | enable=false，generateProfile 时不分析该维度 |
| TC-UP-008 | direction_key 为空 | direction_key="" | HTTP 400（必填字段校验） |
| TC-UP-009 | weight 超出范围（>100 或 <0） | weight=150 | HTTP 400（权重范围 0-100） |
| TC-UP-010 | directions 为空数组 | directions=[] | HTTP 200（无操作）或 HTTP 400 |
| TC-UP-011 | 缺少必填字段 | 不含 direction_key | HTTP 400 |

### 1.2 获取画像维度配置 — getProfileDirection

**端点**：`GET /api/profile/direction`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-UP-015 | 获取所有维度 | 有配置 | HTTP 200，返回 dimensions 列表，每条含 direction_key/direction_name/direction_description/weight/enable/last_updated |
| TC-UP-016 | 无配置 | 从未配置 | HTTP 200，返回内置维度默认值或空数组 |
| TC-UP-017 | 内置维度存在 | 系统初始化 | 至少含 language_preference/reply_style/knowledge_interest/interaction_habit/feedback_sensitivity 5 个 |
| TC-UP-018 | 默认权重正确 | 内置维度 | language_preference=20, reply_style=25, knowledge_interest=30, interaction_habit=15, feedback_sensitivity=10 |

---

## 2. 画像数据管理

### 2.1 获取用户画像 — getUserProfile

**端点**：`GET /api/profile`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-UP-025 | 获取全局画像（最新版本） | 不传参数 | HTTP 200，返回完整画像数据，含 session_id/profile_version/generated_at/dimensions/profile_summary/evolution_trend |
| TC-UP-026 | 获取指定会话画像 | session_id 指定 | HTTP 200，返回该会话的画像 |
| TC-UP-027 | 获取指定版本画像 | version=2 | HTTP 200，返回版本 2 的画像 |
| TC-UP-028 | dimensions 完整 — language_preference | 画像已生成 | 含 primary_language/language_style/confidence + evidence 列表 |
| TC-UP-029 | dimensions 完整 — reply_style | 画像已生成 | 含 preferred_style/preferred_depth/preferred_format/confidence + evidence |
| TC-UP-030 | dimensions 完整 — knowledge_interest | 画像已生成 | 含 top_tags（tag/frequency/weight）+ interest_distribution + evidence |
| TC-UP-031 | dimensions 完整 — interaction_habit | 画像已生成 | 含 avg_question_length/citing_frequency/feedback_rate/active_hours/session_duration_avg_min + evidence |
| TC-UP-032 | dimensions 完整 — feedback_sensitivity | 画像已生成 | 含 avg_rating/positive_rate/negative_rate/trend + evidence |
| TC-UP-033 | profile_summary 存在 | 已调用 LLM 生成 | profile_summary 为自然语言总结（STRING） |
| TC-UP-034 | evolution_trend 正确 | 多个版本 | 含 version/generated_at/change_summary，按 version DESC |
| TC-UP-035 | 画像未生成 | 无画像记录 | HTTP 200，dimensions 为启用维度的空值初始结构，profile_summary=null |
| TC-UP-036 | session_id 不存在 | 从未在该会话生成画像 | HTTP 200，返回空 dimensions（0 个维度键） |
| TC-UP-037 | version 不存在 | version=999 | HTTP 404 |
| TC-UP-038 | 数据聚合来源验证 | 画像生成 | WriterAgent.getUserProfile + EvolutorAgent.getEvaluation + InfoCore 数据正确聚合 |

### 2.2 生成/刷新画像 — generateProfile

**端点**：`POST /api/profile/generate`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-UP-045 | 手动触发全局画像生成 | 不指定 session_id | HTTP 200，version+1，user_profile_record 新记录，user_profile_dimension_data 新记录 |
| TC-UP-046 | 指定会话范围生成 | session_id 指定 | HTTP 200，仅分析该会话的数据 |
| TC-UP-047 | 指定维度生成 | directions=["language_preference","reply_style"] | HTTP 200，仅生成指定维度，其余维度不更新 |
| TC-UP-048 | 生成所有启用维度 | directions 不传 | HTTP 200，所有 enable=true 的维度均生成 |
| TC-UP-049 | 生成后偏好同步到 WriterAgent | session_id 非空 | 调用 WriterAgent.saveUserProfile 同步偏好 |
| TC-UP-050 | 版本号递增 | 已有 version=3 | 新生成 version=4 |
| TC-UP-051 | 多个来源聚合 | — | WriterAgent 偏好 + EvolutorAgent 评估 + InfoCore 对话数据 + Tag 统计 |
| TC-UP-052 | LLM 调用生成 profile_summary | 生成完成 | PromptsProvider.execPrompt + LLMCore.execLLM 被调用 |
| TC-UP-053 | 对话采样限制 | 对话数 > max_conversation_sample_count | 仅采样 max_conversation_sample_count 条（500） |
| TC-UP-054 | directions 含禁用维度 | directions=["feedback_sensitivity"]（enable=false） | 显式指定时仍允许生成 |
| TC-UP-055 | directions 含不存在维度 | directions=["nonexistent"] | HTTP 400 或忽略无效维度 |
| TC-UP-056 | LLM 调用失败 | LLMCore.execLLM 返回错误 | profile_summary 为 null 或错误提示，维度数据仍保存 |
| TC-UP-057 | 版本保留上限 | 已有 20 个版本 | 新版本生成，最旧版本被清理（保留 profile_retention_versions 个） |
| TC-UP-057-VR | 版本保留上限 | 生成 > profile_retention_versions（20）个版本 | 最旧版本被清理，保留数 ≤ 20 |

### 2.3 保存用户偏好 — saveUserPreference

**端点**：`POST /api/profile/preference`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-UP-060 | 保存完整偏好 | session_id + language + style + depth + format + additional_preferences | HTTP 200，WriterAgent.saveUserProfile 被调用 |
| TC-UP-061 | 保存部分偏好 | 仅 session_id + language | HTTP 200，仅更新指定字段 |
| TC-UP-062 | style 枚举值合法 | style="detailed" | HTTP 200 |
| TC-UP-063 | style 枚举值非法 | style="unknown_style" | HTTP 400（ValidationError） |
| TC-UP-064 | depth 枚举值合法 | depth="deep" | HTTP 200 |
| TC-UP-065 | depth 枚举值非法 | depth="unknown_depth" | HTTP 400 |
| TC-UP-066 | format 枚举值合法 | format="MARKDOWN" | HTTP 200 |
| TC-UP-067 | format 枚举值非法 | format="HTML" | HTTP 400 |
| TC-UP-068 | session_id 缺失 | 不传 session_id | HTTP 400 |
| TC-UP-069 | additional_preferences 超长 | > 10000 字符 | HTTP 400 或截断 |
| TC-UP-069-L | additional_preferences 超长 | > 10000 字符 | HTTP 400（超出长度限制） |

---

## 3. 画像历史

### 3.1 获取画像演变历史 — getProfileHistory

**端点**：`GET /api/profile/history`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-UP-075 | 获取全局画像历史 | 不指定 session_id | HTTP 200，返回 history 列表，每条含 version/generated_at/change_summary/dimensions_summary |
| TC-UP-076 | 限定会话 | session_id 指定 | HTTP 200，仅返回该会话的版本历史 |
| TC-UP-077 | 限制返回数量 | limit=5 | HTTP 200，最多 5 条 |
| TC-UP-078 | 默认返回最近 10 个版本 | 不传 limit | 返回最近 10 条 |
| TC-UP-079 | 按版本倒序 | 有多个版本 | version DESC 排序 |
| TC-UP-080 | 无画像历史 | 从未生成 | HTTP 200，history=[] |
| TC-UP-081 | session_id 不存在 | 无效 session_id | HTTP 200，history=[] |

### 3.2 获取指定版本画像 — getProfileByVersion

**端点**：`GET /api/profile/version/:version`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-UP-085 | 获取指定版本全局画像 | version 有效 | HTTP 200，返回完整画像（同 getUserProfile 格式） |
| TC-UP-086 | 指定会话 + 版本 | session_id + version | HTTP 200 |
| TC-UP-087 | version 不存在 | version=999 | HTTP 404 |
| TC-UP-088 | version 为负数或 0 | version=0 | HTTP 400 或 404 |

---

## 4. 配置（委托 Config Application）

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-UP-095 | UserProfile 配置通过内部方法可直接调用 | 直接调用 service.configUserProfile | 成功返回配置（内部方法，仅通过 Config 代理对外） |
| TC-UP-096 | 配置通过 Config 修改 | POST /api/config/update { config_key: "user_profile.auto_generate_interval_ms", value: 43200000 } | 成功 |
| TC-UP-097 | 配置通过 Config 修改 — prompt 模板 | POST /api/config/update { config_key: "user_profile.profile_analysis_prompt_template_id", value: "xxx" } | 成功 |
| TC-UP-098 | 配置通过 Config 修改 — 保留版本数 | POST /api/config/update { config_key: "user_profile.profile_retention_versions", value: 30 } | 成功 |
| TC-UP-099 | 配置通过 Config 修改 — 置信度阈值 | POST /api/config/update { config_key: "user_profile.min_confidence_threshold", value: 0.6 } | 成功 |

---

## 覆盖率矩阵

| 功能模块 | 接口数 | 测试用例数 | 场景覆盖 |
|---------|--------|----------|---------|
| 画像维度管理 | 2 | 14 | CRUD + Upsert + 校验 + 内置维度 |
| 画像数据管理 | 3 | 35 | 获取/生成/偏好保存 + 多维度 + 版本 + LLM 调用 + 采样 + 维度控制 |
| 画像历史 | 2 | 10 | 版本追溯 + 过滤 + 分页 |
| 配置委托 | — | 6 | 内部方法验证 + 代理 |

**总计**：7 个 HTTP 端点，65 个测试用例，覆盖 5 个画像维度、版本管理、LLM 分析、偏好设置、维度控制、版本保留等完整画像生命周期。
