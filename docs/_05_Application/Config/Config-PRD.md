# Config Application

## 1. 设计目标

1. 为整个系统提供配置注册机制，本层及以下所有层的所有模块均可通过注册声明自己的配置项；
2. 管理所有配置项的可见性（readable）和可修改性（writable）权限，支持运行时动态调整；
3. 提供统一的配置查询入口，支持按分层（Base/Core/Agent/Orchestration/Application）→ 模块 → 配置分类 → 配置项的层级结构浏览；
4. 封装下层各模块的 config* 接口，Application 层之上的 HTTP 路由统一通过 Config Application 访问配置，不直接调用下层 config* 方法；
5. 所有带 `_config` 后缀的表为模块可配置的项目，Config Application 需要能发现并管理这些配置。

## 2. 模块职责

Config Application 是系统配置的统一管理入口，采用"注册 + 代理"模式：
- **注册**：各层模块在初始化时向 Config Application 注册自己的配置元数据（配置项名称、描述、类型、默认值、读写权限等）；
- **代理**：前端/API 请求配置读写时，Config Application 根据权限检查后，代理调用下层模块的 config* 方法。

### 依赖关系

| 依赖层级 | 模块 | 调用接口 | 用途 |
|---------|------|---------|------|
| Agent | WriterAgent | configWriterAgent | 代理配置 WriterAgent |
| Agent | EvolutorAgent | configEvolutorAgent | 代理配置 EvolutorAgent |
| Agent | AgentLibrary | configAgentLibrary | 代理配置 AgentLibrary |
| Agent | AgentBuilder | configAgentBuilder | 代理配置 AgentBuilder |
| Agent | AgentExecution | configAgentExecution | 代理配置 AgentExecution |
| Agent | AgentStrategy | configAgentStrategy | 代理配置 AgentStrategy |
| Agent | AgentContext | configAgentContext | 代理配置 AgentContext |
| Orchestration | OrchestrationEntry | configOrchestrationEntry | 代理配置 OrchestrationEntry |
| Orchestration | OrchestrationStrategy | configOrchestrationStrategy | 代理配置 OrchestrationStrategy |
| Orchestration | OrchestrationExecution | configOrchestrationExecution | 代理配置 OrchestrationExecution |
| Orchestration | OrchestrationVisualization | configOrchestrationVisualization | 代理配置 OrchestrationVisualization |
| Orchestration | JSONNode | configJSONNode | 代理配置 JSONNode |
| Core | InfoCore | getInfoTagConfig / updateInfoTagConfig / getInfoSummaryConfig / updateInfoSummaryConfig / getInfoConfig / updateInfoConfig / getInfoVectorConfig / updateInfoVectorConfig | 代理配置 InfoCore |
| Core | LLMCore | configLLMCore | 代理配置 LLMCore |
| Core | MCPCore | configMCPCore | 代理配置 MCPCore |
| Core | SkillCore | configSkillCore | 代理配置 SkillCore |
| Core | SoulCore | configSoulCore | 代理配置 SoulCore |
| Base | LLMProvider | addLLMProvider / updateLLMProvider / delLLMProvider / soLLMProvider / addLLM / updateLLM / delLLM / soLLM / getLLM / listLLM / enableLLM / closeLLM / visualizedLLM / testLLMProvider | 代理管理 LLM |
| Base | SoulProvider | addSoul / updateSoul / delSoul / soSoul / getSoul / enableSoul | 代理管理 Soul |
| Base | SkillProvider | addSkill / updateSkill / delSkill / soSkill / getSkill / enableSkill | 代理管理 Skill |
| Base | MCPProvider | addMcpProvider / updateMcpProvider / delMcpProvider / soMcpProvider / installMcp / startMcp / stopMcp / uninstallMcp / updateMcp / getMcp / soMcp / enableMCP / testMcpProvider / listMcp | 代理管理 MCP |
| Base | PromptsProvider | addPrompt / updatePrompt / delPrompt / soPrompt / getPrompt / enablePrompts | 代理管理 Prompt |
| Base | GraphDBProvider | enableGraphDB / closeGraphDB / visualizedGraph | 代理管理 GraphDB |
| Base | VectorDBProvider | enableVectorDB / closeVectorDB / visualizedVector | 代理管理 VectorDB |
| Base | RelationDBProvider | enableDB / closeDB / visualizedDB | 代理管理 RelationDB |
| Base | MQProvider | enableMQ / closeMQ / getQueueStats | 代理管理 MQ |
| Base | LogProvider | - | 日志记录 |

### 配置注册模型

各模块注册配置时需提供以下元数据：

| 字段 | 类型 | 说明 |
|------|------|------|
| layer | ENUM | 所属分层：BASE / CORE / AGENT / ORCHESTRATION / APPLICATION |
| module | STRING | 模块名称（如 "LLMCore"、"WriterAgent"、"OrchestrationEntry"） |
| category | STRING | 配置分类（如 "llm_matching"、"evaluation"、"general"） |
| config_key | STRING | 配置项唯一标识（如 "regen_rate"、"optimize_threshold"） |
| config_name | STRING | 配置项显示名称 |
| config_description | STRING | 配置项描述 |
| config_type | ENUM | 配置值类型：STRING / INT / DOUBLE / BOOLEAN / JSON / ENUM |
| config_default | ANY | 默认值 |
| config_enum_values | ANY[] | 枚举值列表（config_type=ENUM 时必填） |
| readable | BOOLEAN | 是否可查看，默认 true |
| writable | BOOLEAN | 是否可修改，默认 true |

## 3. 功能设计

### 3.1. 配置元数据管理

#### 3.1.1. 注册配置项（registerConfig）

**功能**：注册一个模块的配置项元数据

**URL**：`POST /api/config/register`

**入参（RegisterConfigInput extends Input）**：
- registrations：配置注册列表 [{ layer, module, category, config_key, config_name, config_description, config_type, config_default, config_enum_values, readable, writable }]

**处理流程**：

1. 遍历 registrations 列表，校验每个配置项的元数据完整性；
2. 调用 RelationDBProvider.insertDB 向 `config_registry` 表（库名=config）写入配置元数据（upsert 语义：按 config_key 唯一约束，存在则更新，不存在则新增）；
3. 返回注册成功的配置项数量；

#### 3.1.2. 更新配置权限（updateConfigPrivilege）

**功能**：修改配置项的可见性和可修改性

**URL**：`POST /api/config/privilege`

**入参（UpdateConfigPrivilegeInput extends Input）**：
- config_key（STRING，必选）：配置项唯一标识
- readable（BOOLEAN，可选）：是否可查看
- writable（BOOLEAN，可选）：是否可修改

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `config_registry` 表确认 config_key 存在；
2. 调用 RelationDBProvider.updateDB 更新 readable 和/或 writable 字段；
3. 返回更新后的权限状态；

### 3.2. 配置查询

#### 3.2.1. 获取配置详情（getConfigDetail）

**功能**：获取整个系统所有分层→模块→配置分类→配置项的完整层级结构，供前端分层浏览

**URL**：`GET /api/config/detail`

**入参（Query String）**：
- layer（ENUM，可选）：按分层过滤（BASE / CORE / AGENT / ORCHESTRATION / APPLICATION）
- module（STRING，可选）：按模块过滤
- category（STRING，可选）：按配置分类过滤
- readable_only（BOOLEAN，可选）：仅返回可查看的配置项，默认 true

**输出**：
```json
{
  "layers": [
    {
      "layer": "BASE",
      "layer_name": "基础层",
      "modules": [
        {
          "module": "LLMProvider",
          "module_name": "LLM Provider",
          "module_description": "LLM 提供商与模型管理",
          "readable": true,
          "writable": true,
          "categories": [
            {
              "category": "llm_provider",
              "category_name": "LLM 提供商",
              "readable": true,
              "writable": true,
              "configs": [
                {
                  "config_key": "llm_provider.default_enable",
                  "config_name": "默认启用状态",
                  "config_description": "新增 LLM 提供商时的默认启用状态",
                  "config_type": "BOOLEAN",
                  "config_default": true,
                  "current_value": true,
                  "readable": true,
                  "writable": true
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

**处理流程**：

1. 调用 RelationDBProvider.selectDB 查询 `config_registry` 表（按 layer/module/category 可选过滤）；
2. 按 layer → module → category 层级分组；
3. 对每个配置项，调用对应的下层 config* 接口获取当前值（current_value）；
4. 若 readable_only=true，过滤掉 readable=false 的配置项；
5. 返回层级结构数据；

#### 3.2.2. 获取单个配置项详情（getConfigItem）

**功能**：获取单个配置项的元数据和当前值

**URL**：`GET /api/config/detail/:config_key`

**入参**：
- config_key（Path Param，必选）

**输出**：
- 配置项的完整元数据 + 当前值

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `config_registry` 表获取元数据；
2. 校验 readable 权限，若不可查看则返回 403；
3. 调用对应下层模块的 config*/get* 接口获取当前值；
4. 返回完整配置项数据；

### 3.3. 配置修改

#### 3.3.1. 修改配置项（updateConfig）

**功能**：修改指定配置项的值（带权限校验）

**URL**：`POST /api/config/update`

**入参（UpdateConfigInput extends Input）**：
- config_key（STRING，必选）：配置项唯一标识
- value（ANY，必选）：配置新值

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `config_registry` 表获取元数据；
2. 校验 writable 权限，若不可修改则返回 403；
3. 校验 value 类型与 config_type 匹配；
4. 若 config_type=ENUM，校验 value 在 config_enum_values 中；
5. 根据 config_key 路由到对应的下层模块 config* 方法，传入新值；
6. 调用下层方法执行配置更新；
7. 返回更新结果；

**配置路由映射表**（config_key → 下层接口）：

| 分层 | 模块 | config_key | 下层接口 | 入参字段 |
|------|------|-----------|---------|---------|
| CORE | LLMCore | llm_core.regen_rate | configLLMCore | regen_rate |
| CORE | LLMCore | llm_core.prompt_template_id | configLLMCore | prompt_template_id |
| CORE | LLMCore | llm_core.quota_* | limitLLM | 对应限额字段 |
| CORE | MCPCore | mcp_core.regen_rate | configMCPCore | regen_rate |
| CORE | MCPCore | mcp_core.prompt_template_id | configMCPCore | prompt_template_id |
| CORE | SkillCore | skill_core.regen_rate | configSkillCore | regen_rate |
| CORE | SkillCore | skill_core.prompt_template_id | configSkillCore | prompt_template_id |
| CORE | SkillCore | skill_core.opt_rule | updateSkillRule | operations |
| CORE | SoulCore | soul_core.regen_rate | configSoulCore | regen_rate |
| CORE | SoulCore | soul_core.prompt_template_id | configSoulCore | prompt_template_id |
| CORE | SoulCore | soul_core.opt_rule | updateSoulRule | operations |
| CORE | InfoCore | info_core.tag_config.* | updateInfoTagConfig | llm_id / prompt_template_id / enable |
| CORE | InfoCore | info_core.summary_config.* | updateInfoSummaryConfig | llm_id / prompt_template_id / enable |
| CORE | InfoCore | info_core.config.alive_max_days | updateInfoConfig | alive_max_days |
| CORE | InfoCore | info_core.vector_config.* | updateInfoVectorConfig | llm_id / enable / dimension |
| CORE | InfoCore | info_core.context_config.* | updateInfoContextConfig | 对应字段 |
| AGENT | WriterAgent | writer_agent.write_prompt_template_id | configWriterAgent | write_prompt_template_id |
| AGENT | WriterAgent | writer_agent.default_* | configWriterAgent | default_language / default_style / default_depth / default_format |
| AGENT | EvolutorAgent | evolutor_agent.eval_work_prompt_template_id | configEvolutorAgent | eval_work_prompt_template_id |
| AGENT | EvolutorAgent | evolutor_agent.eval_write_prompt_template_id | configEvolutorAgent | eval_write_prompt_template_id |
| AGENT | EvolutorAgent | evolutor_agent.optimize_threshold | configEvolutorAgent | optimize_threshold |
| AGENT | EvolutorAgent | evolutor_agent.eval_frequency_threshold | configEvolutorAgent | eval_frequency_threshold |
| AGENT | EvolutorAgent | evolutor_agent.eval_schedule_interval_ms | configEvolutorAgent | eval_schedule_interval_ms |
| AGENT | EvolutorAgent | evolutor_agent.eval_batch_size | configEvolutorAgent | eval_batch_size |
| AGENT | AgentContext | agent_context.max_context_items | configAgentContext | max_context_items |
| AGENT | AgentContext | agent_context.enable_snapshot_persistence | configAgentContext | enable_snapshot_persistence |
| AGENT | AgentLibrary | agent_library.* | configAgentLibrary | 对应字段 |
| AGENT | AgentBuilder | agent_builder.* | configAgentBuilder | 对应字段 |
| AGENT | AgentExecution | agent_execution.* | configAgentExecution | 对应字段 |
| AGENT | AgentStrategy | agent_strategy.* | configAgentStrategy | 对应字段 |
| ORCHESTRATION | OrchestrationEntry | orchestration.complexity_decompose_threshold | configOrchestrationEntry | complexity_decompose_threshold |
| ORCHESTRATION | OrchestrationEntry | orchestration.strategy_prompt_template_id | configOrchestrationEntry | strategy_prompt_template_id |
| ORCHESTRATION | OrchestrationEntry | orchestration.default_strategy | configOrchestrationEntry | default_strategy |
| ORCHESTRATION | OrchestrationEntry | orchestration.max_recent_works | configOrchestrationEntry | max_recent_works |
| ORCHESTRATION | OrchestrationEntry | orchestration.async_worker_interval | configOrchestrationEntry | async_worker_interval |
| ORCHESTRATION | OrchestrationEntry | orchestration.* | configOrchestrationEntry | 对应字段 |
| ORCHESTRATION | OrchestrationStrategy | orchestration.* | configOrchestrationStrategy | 对应字段 |
| ORCHESTRATION | OrchestrationExecution | orchestration.* | configOrchestrationExecution | 对应字段 |
| ORCHESTRATION | OrchestrationVisualization | orchestration.max_nodes_in_graph | configOrchestrationVisualization | max_nodes_in_graph |
| ORCHESTRATION | JSONNode | orchestration.* | configJSONNode | 对应字段 |
| APPLICATION | Chat | chat.max_messages_per_session | configChat | max_messages_per_session |
| APPLICATION | Chat | chat.sse_heartbeat_interval_ms | configChat | sse_heartbeat_interval_ms |
| APPLICATION | Chat | chat.default_history_lastN | configChat | default_history_lastN |
| APPLICATION | SelfLearning | self_learning.* | configSelfLearning | 对应字段 |
| APPLICATION | UserProfile | user_profile.* | configUserProfile | 对应字段 |
| APPLICATION | Visualization | visualization.* | configVisualization | 对应字段 |
| BASE | LLMProvider | llm_provider.* | addLLMProvider / updateLLMProvider / delLLMProvider 等 | 根据操作类型 |
| BASE | SoulProvider | soul.* | addSoul / updateSoul / delSoul 等 | 根据操作类型 |
| BASE | SkillProvider | skill.* | addSkill / updateSkill / delSkill 等 | 根据操作类型 |
| BASE | MCPProvider | mcp.* | installMcp / startMcp / stopMcp 等 | 根据操作类型 |
| BASE | PromptsProvider | prompt.* | addPrompt / updatePrompt / delPrompt 等 | 根据操作类型 |

### 3.4. Base 层资源管理代理

Config Application 同时作为 Base 层资源（LLM、Soul、Skill、MCP、Prompt）的 CRUD 管理入口，前端通过 Config Application 管理这些资源，Config Application 代理调用对应 Provider 的接口。

#### 3.4.1. LLM 管理

| HTTP 接口 | 方法 | 代理调用 | 说明 |
|-----------|------|---------|------|
| `/api/config/llm/provider` | POST | LLMProvider.addLLMProvider | 新增 LLM 提供商 |
| `/api/config/llm/provider` | PUT | LLMProvider.updateLLMProvider | 更新 LLM 提供商 |
| `/api/config/llm/provider` | DELETE | LLMProvider.delLLMProvider | 删除 LLM 提供商 |
| `/api/config/llm/provider/search` | GET | LLMProvider.soLLMProvider | 搜索 LLM 提供商 |
| `/api/config/llm/provider/test` | POST | LLMProvider.testLLMProvider | 测试提供商连接 |
| `/api/config/llm/provider/list` | POST | LLMProvider.listLLM | 刷新提供商模型列表 |
| `/api/config/llm` | POST | LLMProvider.addLLM | 启用 LLM 模型 |
| `/api/config/llm` | PUT | LLMProvider.updateLLM | 更新 LLM 模型 |
| `/api/config/llm` | DELETE | LLMProvider.delLLM | 删除 LLM 模型 |
| `/api/config/llm/search` | GET | LLMProvider.soLLM | 搜索 LLM 模型 |
| `/api/config/llm/:id` | GET | LLMProvider.getLLM | 获取 LLM 详情 |
| `/api/config/llm/quota` | POST | LLMCore.limitLLM | 设置 LLM 限额 |
| `/api/config/llm/quota/check` | GET | LLMCore.checkLLMQuota | 检查限额 |

#### 3.4.2. Soul 管理

| HTTP 接口 | 方法 | 代理调用 | 说明 |
|-----------|------|---------|------|
| `/api/config/soul` | POST | SoulProvider.addSoul | 新增 Soul |
| `/api/config/soul` | PUT | SoulProvider.updateSoul | 更新 Soul |
| `/api/config/soul` | DELETE | SoulProvider.delSoul | 删除 Soul |
| `/api/config/soul/search` | GET | SoulProvider.soSoul | 搜索 Soul |
| `/api/config/soul/:id` | GET | SoulProvider.getSoul | 获取 Soul 详情 |
| `/api/config/soul/rule` | GET | SoulCore.getSoulRule | 查看老化规则 |
| `/api/config/soul/rule` | POST | SoulCore.updateSoulRule | 修改老化规则 |

#### 3.4.3. Skill 管理

| HTTP 接口 | 方法 | 代理调用 | 说明 |
|-----------|------|---------|------|
| `/api/config/skill` | POST | SkillProvider.addSkill | 新增 Skill |
| `/api/config/skill` | PUT | SkillProvider.updateSkill | 更新 Skill |
| `/api/config/skill` | DELETE | SkillProvider.delSkill | 删除 Skill |
| `/api/config/skill/search` | GET | SkillProvider.soSkill | 搜索 Skill |
| `/api/config/skill/:id` | GET | SkillProvider.getSkill | 获取 Skill 详情 |
| `/api/config/skill/rule` | GET | SkillCore.getSkillRule | 查看优化规则 |
| `/api/config/skill/rule` | POST | SkillCore.updateSkillRule | 修改优化规则 |

#### 3.4.4. MCP 管理

| HTTP 接口 | 方法 | 代理调用 | 说明 |
|-----------|------|---------|------|
| `/api/config/mcp/provider` | POST | MCPProvider.addMcpProvider | 新增 MCP 提供商 |
| `/api/config/mcp/provider` | PUT | MCPProvider.updateMcpProvider | 更新 MCP 提供商 |
| `/api/config/mcp/provider` | DELETE | MCPProvider.delMcpProvider | 删除 MCP 提供商 |
| `/api/config/mcp/provider/search` | GET | MCPProvider.soMcpProvider | 搜索 MCP 提供商 |
| `/api/config/mcp/provider/test` | POST | MCPProvider.testMcpProvider | 测试提供商连接 |
| `/api/config/mcp/provider/list` | POST | MCPProvider.listMcp | 刷新提供商 MCP 列表 |
| `/api/config/mcp/install` | POST | MCPProvider.installMcp | 安装 MCP |
| `/api/config/mcp/start` | POST | MCPProvider.startMcp | 启动 MCP |
| `/api/config/mcp/stop` | POST | MCPProvider.stopMcp | 停止 MCP |
| `/api/config/mcp/uninstall` | POST | MCPProvider.uninstallMcp | 卸载 MCP |
| `/api/config/mcp` | PUT | MCPProvider.updateMcp | 更新 MCP |
| `/api/config/mcp/:id` | GET | MCPProvider.getMcp | 获取 MCP 详情 |
| `/api/config/mcp/search` | GET | MCPProvider.soMcp | 搜索 MCP |

#### 3.4.5. Prompt 模板管理

| HTTP 接口 | 方法 | 代理调用 | 说明 |
|-----------|------|---------|------|
| `/api/config/prompt` | POST | PromptsProvider.addPrompt | 新增 Prompt 模板 |
| `/api/config/prompt` | PUT | PromptsProvider.updatePrompt | 更新 Prompt 模板 |
| `/api/config/prompt` | DELETE | PromptsProvider.delPrompt | 删除 Prompt 模板 |
| `/api/config/prompt/search` | GET | PromptsProvider.soPrompt | 搜索 Prompt 模板 |
| `/api/config/prompt/:id` | GET | PromptsProvider.getPrompt | 获取 Prompt 模板详情 |

### 3.5. 配置（configConfig）

**功能**：配置 Config Application 自身的参数

**URL**：`POST /api/config/config`

**入参**：
- input：ConfigConfigInput（继承 Input），包含以下字段：
  - default_readable（BOOLEAN，可选）：新注册配置项的默认可见性，默认 true
  - default_writable（BOOLEAN，可选）：新注册配置项的默认可修改性，默认 true
- context：ConfigConfigContext（继承 Context）
- output：ConfigConfigOutput（继承 Output），承载返回内容：
  - 当前生效的全部配置

**处理流程**：

1. 调用 RelationDBProvider.selectOneDB 查询 `config_config` 表；
2. 校验并更新传入的非空字段；
3. 调用 RelationDBProvider.updateDB 写入配置；
4. 返回更新后的配置；

## 4. 重要内容

1. 所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；
2. Config Application 是系统配置的唯一对外入口，前端只与 Config Application 交互，不直接调用下层模块的 config* 方法；
3. 配置权限控制：每次读写配置前校验 readable/writable 权限，无权限时返回 403；
4. 配置类型校验：修改配置时校验 value 类型与 config_type 匹配，ENUM 类型校验枚举值范围；
5. 配置注册时机：各模块在初始化（app.ts DI 阶段）时调用 registerConfig 注册自身配置元数据；
6. 配置路由：updateConfig 根据 config_key 的前缀（如 "llm_core."、"writer_agent."）路由到对应下层模块的 config* 方法；
7. 所有日志通过 LogProvider 记录，禁止 console.log；
8. 所有 ID 通过 IdGenerator.generate() 生成；

## 5. 表设计

### 5.1. Config 注册表（SQLite）

- 表名：config_registry
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| config_key | 配置项唯一标识 | VARCHAR | N | 唯一索引 | 如 "llm_core.regen_rate" |
| layer | 所属分层 | ENUM | N | 普通索引 | BASE / CORE / AGENT / ORCHESTRATION / APPLICATION |
| module | 模块名称 | VARCHAR | N | 普通索引 | |
| category | 配置分类 | VARCHAR | N | | |
| config_name | 配置项显示名称 | VARCHAR | N | | |
| config_description | 配置项描述 | TEXT | Y | | |
| config_type | 配置值类型 | ENUM | N | | STRING / INT / DOUBLE / BOOLEAN / JSON / ENUM |
| config_default | 默认值 | TEXT | N | | JSON 序列化存储 |
| config_enum_values | 枚举值列表 | TEXT | Y | | JSON 数组（config_type=ENUM 时） |
| readable | 是否可查看 | BOOLEAN | N | | 默认 true |
| writable | 是否可修改 | BOOLEAN | N | | 默认 true |

### 5.2. Config 自身配置表（SQLite）

- 表名：config_config
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| default_readable | 新注册配置项默认可见性 | BOOLEAN | N | | 默认 true |
| default_writable | 新注册配置项默认可修改性 | BOOLEAN | N | | 默认 true |

## 6. 前端页面需求覆盖

| 前端页面需求 | 对应接口 | 说明 |
|------------|---------|------|
| 第一层：整体框架 | getConfigDetail | 获取完整层级结构 |
| 第二层：分层区 | getConfigDetail（layer 过滤） | 按分层展示模块卡片 |
| 第三层：模块区 | getConfigDetail（module 过滤） | 展示模块的配置分类 |
| 第四层：配置区 | getConfigDetail（category 过滤） | 展示配置分类的具体配置项 |
| 第五层：配置读写区 | getConfigItem / updateConfig | 查看/修改具体配置项 |
| 面包屑导航 | 基于 getConfigDetail 层级数据 | 前端自行构建面包屑 |
| 颜色状态（绿色/灰色） | getConfigDetail（返回 readable/writable） | 前端根据权限渲染颜色 |
| LLM 模型管理 | LLM 管理代理接口 | 增删改查 LLM 提供商和模型 |
| Soul 管理 | Soul 管理代理接口 | 增删改查 Soul |
| Skill 管理 | Skill 管理代理接口 | 增删改查 Skill |
| MCP 管理 | MCP 管理代理接口 | 安装/启停/卸载 MCP |
| Prompt 模板管理 | Prompt 模板管理代理接口 | 增删改查 Prompt 模板 |
| 配置权限控制 | updateConfigPrivilege | 控制配置的可见性和可修改性 |