# Writer Agent 模块测试用例

> 模块代码：`brian-backend/Agent/WriterAgent/`  
> 接口数量：4 个（write、saveUserProfile、getUserProfile、configWriterAgent）  
> 测试用例总数：20  
> 覆盖目标：100% 接口覆盖，≥80% 场景覆盖

---

## 1. write — 生成最终回复

### TC-WA-001: 基本写入 — 汇总多个 Agent 结果

| 项 | 内容 |
|---|------|
| **前置条件** | Writer Agent 已构建；传入 user_query 和 agent_results=[{agent_id, task_id, answer}] |
| **测试步骤** | 调用 write（user_query='生成报告'、agent_results=[{answer:'数据A'}, {answer:'数据B'}]） |
| **预期结果** | LLM 被调用生成汇总回复；output.written_content 非空；InfoCore 保存为 RESPONSE 类型信息 |
| **覆盖场景** | 基础写入流程 |

### TC-WA-002: 生成结果使用默认用户配置

| 项 | 内容 |
|---|------|
| **前置条件** | writer_agent_user_profile 表中无当前 session 的记录 |
| **测试步骤** | 调用 write（session_id='new-session'） |
| **预期结果** | 使用 writer_agent_config 中的默认值（language=zh-CN、style=clear、depth=medium、format=MARKDOWN） |
| **覆盖场景** | 默认用户配置 |

### TC-WA-003: 写入使用数据库中的用户偏好配置

| 项 | 内容 |
|---|------|
| **前置条件** | writer_agent_user_profile 表中存在 session_id='user-a' 的记录（style='detailed'、format='JSON'） |
| **测试步骤** | 调用 write（session_id='user-a'） |
| **预期结果** | LLM prompt 中包含了 detailed 风格和 JSON 格式的要求 |
| **覆盖场景** | 用户偏好应用 |

### TC-WA-004: 写入使用 Input 中指定的即时偏好（覆盖 DB 和默认值）

| 项 | 内容 |
|---|------|
| **前置条件** | DB 中有 session 记录（language=zh-CN）；Input 中指定 user_preferences={language:'en', style:'concise'} |
| **测试步骤** | 调用 write（输入中包含 user_preferences） |
| **预期结果** | LLM prompt 使用 Input 中指定的 language='en'、style='concise'，覆盖 DB 和默认值 |
| **覆盖场景** | Input 即时偏好覆盖 |

### TC-WA-005: 写入使用 Soul 人格

| 项 | 内容 |
|---|------|
| **前置条件** | Writer Agent 绑定了 soul_id |
| **测试步骤** | 调用 write |
| **预期结果** | LLM prompt 中包含了从 Soul 加载的 personality 描述 |
| **覆盖场景** | Soul 人格注入 |

### TC-WA-006: 写入结果保存到 InfoCore（RESPONSE 类型）

| 项 | 内容 |
|---|------|
| **前置条件** | write 执行成功 |
| **测试步骤** | 调用 write 后，通过 InfoCore 查询 |
| **预期结果** | InfoCore 中的一条 RESPONSE 记录（含 written_content、user_query、session_id） |
| **覆盖场景** | 结果持久化 |

### TC-WA-007: 写入后 recordAgentUsage 被调用

| 项 | 内容 |
|---|------|
| **前置条件** | write 执行成功 |
| **测试步骤** | 调用 write |
| **预期结果** | AgentLibrary.recordAgentUsage 被调用（Writer Agent 的 usage_count 自增） |
| **覆盖场景** | 使用记录 |

### TC-WA-008: Writer Agent 不存在时自动构建

| 项 | 内容 |
|---|------|
| **前置条件** | Writer Agent 尚未构建 |
| **测试步骤** | 调用 write |
| **预期结果** | write 内部自动调用 buildWriterAgent 构建 Agent，然后继续写入流程 |
| **覆盖场景** | 自动构建 Writer Agent |

### TC-WA-009: 无 agent_results 时 write 正常处理

| 项 | 内容 |
|---|------|
| **前置条件** | agent_results 为空数组 |
| **测试步骤** | 调用 write（user_query='直接对话'、agent_results=[]） |
| **预期结果** | write 正常生成直接回复（汇总上下文为空时给出通用回答） |
| **覆盖场景** | 无结果汇总 |

### TC-WA-010: LLM 返回 JSON 格式答案时的解析

| 项 | 内容 |
|---|------|
| **前置条件** | 用户偏好 format=JSON |
| **测试步骤** | 调用 write |
| **预期结果** | LLM 返回的 JSON 被正确解析；output.written_content 可以是解析后的结构化对象 |
| **覆盖场景** | JSON 格式输出 |

### TC-WA-011: LLM 调用失败时 write 的错误处理

| 项 | 内容 |
|---|------|
| **前置条件** | LLM 调用失败/抛异常 |
| **测试步骤** | 调用 write |
| **预期结果** | 不崩溃；output.error 非空；可能返回一条降级消息 |
| **覆盖场景** | LLM 失败容错 |

---

## 2. saveUserProfile — 保存用户偏好

### TC-WA-012: 首次保存用户偏好

| 项 | 内容 |
|---|------|
| **前置条件** | writer_agent_user_profile 表中无此 session_id |
| **测试步骤** | 调用 saveUserProfile（session_id='user-1'、language='en'、style='detailed'、depth='deep'、format='MARKDOWN'） |
| **预期结果** | 表中新增记录；各字段值与传入值一致 |
| **覆盖场景** | 首次保存 |

### TC-WA-013: 更新已有用户偏好（Upsert 语义）

| 项 | 内容 |
|---|------|
| **前置条件** | 表中存在 session_id='user-1' 的记录（language='zh-CN'） |
| **测试步骤** | 调用 saveUserProfile（session_id='user-1'、language='en'） |
| **预期结果** | language 更新为 'en'；其他字段保持不变 |
| **覆盖场景** | Upsert 更新 |

### TC-WA-014: format 字段为非法值（非 TEXT/MARKDOWN/JSON）时抛异常

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 saveUserProfile（format='XML'） |
| **预期结果** | 抛出 `ValidationError`，消息提示 format 不可用 |
| **覆盖场景** | format 枚举校验 |

### TC-WA-015: 所有字段可选 — 仅传 session_id 时使用已有值或默认值

| 项 | 内容 |
|---|------|
| **前置条件** | 表中存在 session_id='user-2' 的记录 |
| **测试步骤** | 调用 saveUserProfile（session_id='user-2'） |
| **预期结果** | 所有字段保持不变 |
| **覆盖场景** | 空更新保持原值 |

---

## 3. getUserProfile — 获取用户偏好

### TC-WA-016: 查询已存在的用户偏好

| 项 | 内容 |
|---|------|
| **前置条件** | 表中存在 session_id='user-3' 的记录（language='en', style='concise'） |
| **测试步骤** | 调用 getUserProfile（session_id='user-3'） |
| **预期结果** | output.profile 包含正确的 language、style 等字段 |
| **覆盖场景** | 查询已有记录 |

### TC-WA-017: 查询不存在的用户 — 返回默认配置

| 项 | 内容 |
|---|------|
| **前置条件** | 表中无此 session_id |
| **测试步骤** | 调用 getUserProfile（session_id='new-user'） |
| **预期结果** | output.profile 使用 writer_agent_config 的默认值（language=zh-CN、style=clear、depth=medium、format=MARKDOWN） |
| **覆盖场景** | 默认偏好返回 |

### TC-WA-018: additional_preferences 字段的写入和读取

| 项 | 内容 |
|---|------|
| **前置条件** | 无 |
| **测试步骤** | 调用 saveUserProfile（additional_preferences='{"tone":"friendly", "max_length":500}'）；再调用 getUserProfile |
| **预期结果** | 写入后读取到的 additional_preferences 包含原始 JSON 字符串 |
| **覆盖场景** | 附加偏好字段 |

---

## 4. configWriterAgent — 配置 Writer

### TC-WA-019: 首次配置写入默认值

| 项 | 内容 |
|---|------|
| **前置条件** | writer_agent_config 表为空 |
| **测试步骤** | 调用 configWriterAgent（不传参数） |
| **预期结果** | 配置初始化：write_prompt_template_id=''、default_language='zh-CN'、default_style='clear'、default_depth='medium'、default_format='MARKDOWN' |
| **覆盖场景** | 默认配置初始化 |

### TC-WA-020: 全量更新 Writer 配置

| 项 | 内容 |
|---|------|
| **前置条件** | 配置已初始化 |
| **测试步骤** | 调用 configWriterAgent（write_prompt_template_id='wp-1'、default_language='en'、default_style='creative'、default_depth='deep'、default_format='JSON'） |
| **预期结果** | 所有字段正确更新 |
| **覆盖场景** | 全量配置更新 |
