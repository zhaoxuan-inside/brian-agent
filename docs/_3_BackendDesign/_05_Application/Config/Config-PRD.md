# Config Application

## 1. 设计目标

1. 为整个系统提供统一的配置管理机制：本层及以下所有层所有模块的配置项元数据由**内存静态定义**（`configRegistrations.ts` 的 `ALL_CONFIG_REGISTRATIONS`）统一声明，配置页面**直接收集各层配置**，无需注册到数据库表；
2. 管理所有配置项的可见性（readable）和可修改性（writable）权限，**采用三级层级继承控制模型**（层级 → 模块 → 功能/分类），上层权限约束下层，支持运行时动态调整；
3. 提供统一的配置查询入口，支持按分层（Base/Core/Agent/Orchestration/Application）→ 模块 → 配置分类 → 配置项的层级结构浏览；
4. 封装下层各模块的 config* 接口，Application 层之上的 HTTP 路由统一通过 Config Application 访问配置，不直接调用下层 config* 方法；
5. 所有带 `_config` 后缀的表为模块可配置的项目，Config Application 需要能发现并管理这些配置；
6. **Application 层其他模块（Chat、UserProfile、SelfLearning、Visualization）不得对外暴露独立 HTTP 配置端点**（如 `/api/chat/config`、`/api/profile/config` 等），其配置通过 Config Application 的 `/api/config/update` 统一修改。

## 2. 模块职责

Config Application 是系统配置的统一管理入口，采用"静态定义 + 代理"模式：
- **静态定义**：各层模块的配置元数据（配置项名称、描述、类型、默认值、读写权限等）在 `configRegistrations.ts` 中集中静态声明，配置页面直接遍历静态定义收集各层配置；
- **代理**：前端/API 请求配置读写时，Config Application 根据权限检查后，代理调用下层模块的 config* 方法（读取经 getCurrentValue、修改经 routeUpdateConfig 路由）。

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
| Base | ToolProvider | http_timeout_ms（写 tool_config 表） | 代理管理 HTTP 超时配置 |
| Base | MQProvider | enableMQ / closeMQ / getQueueStats | 代理管理 MQ |
| Base | LogProvider | - | 日志记录 |

### 配置元数据静态定义

各模块的配置项元数据在 `configRegistrations.ts` 中集中静态声明（`ALL_CONFIG_REGISTRATIONS`），每个配置项需提供以下元数据：

| 字段 | 类型 | 说明 |
|------|------|------|
| layer | ENUM | 所属分层：BASE / CORE / AGENT / ORCHESTRATION / APPLICATION |
| module | STRING | 模块名称（如 "llm_core"、"agent_builder"、"writer_agent"） |
| category | STRING | 配置分类（如 "basic"、"quota"、"aging"） |
| config_key | STRING | 配置项唯一标识（如 "agent_builder.auto_optimize"） |
| config_name | STRING | 配置项显示名称 |
| config_description | STRING | 配置项描述 |
| config_type | ENUM | 配置值类型：STRING / INT / DOUBLE / BOOLEAN / JSON / ENUM |
| config_default | ANY | 默认值 |
| config_enum_values | ANY[] | 枚举值列表（config_type=ENUM 时必填） |
| readable | BOOLEAN | 是否可查看，默认 true |
| writable | BOOLEAN | 是否可修改，默认 true |

> 配置项列表直接来自静态定义（内存），不再写入 `config_registry` 数据库表。

### 2.1. 三级层级继承权限模型

配置的可见性和可配置性采用三级层级继承控制：**层级（Layer）→ 模块（Module）→ 功能/分类（Category）**。上层权限约束下层，下级权限不能突破上级限制。

**核心规则**：

| 上级权限状态 | 下级权限约束 |
|------------|------------|
| 上级 readable=false | 下级所有节点强制 readable=false（不可见） |
| 上级 readable=true, writable=false | 下级 writable 强制=false（不可修改），readable 可自由设置 |
| 上级 readable=true, writable=true | 下级 readable 和 writable 可自由设置，但受自身上级约束 |

**示例**：

| 场景 | 层级 | 模块 | 功能 | 结果 |
|------|------|------|------|------|
| 整层不可见 | Base: readable=false | — | — | Base 层所有模块、功能均不可见 |
| 层可见但不可改 | Core: readable=true, writable=false | LLMCore: readable=true, writable=true | regen_rate: readable=true, writable=true | LLMCore 可见但不可修改（模块 writable 被层级强制为 false） |
| 模块不可见 | Agent: readable=true, writable=true | WriterAgent: readable=false | — | WriterAgent 所有配置不可见 |
| 模块可见但不可改 | Agent: readable=true, writable=true | EvolutorAgent: readable=true, writable=false | optimize_threshold: readable=true, writable=true | optimize_threshold 可见但不可修改（功能 writable 被模块强制为 false） |

**有效权限计算**（递推规则）：

```
effective_readable(node) = parent.effective_readable AND node.readable
effective_writable(node) = parent.effective_writable AND node.writable
```

其中 `parent` 对于功能/分类节点是其所属模块，对于模块节点是其所属层级，对于层级节点 parent 视为 `{ readable: true, writable: true }`（层级本身无上级约束）。

**权限修改约束**：修改下级节点的 readable/writable 时，若修改后的值超过了上级约束，操作被拒绝。

例如：层级 Base 的 writable=false，尝试设置 LLMProvider 模块的 writable=true → 拒绝（上级 writable 已为 false）。

### 2.2. 层级权限元数据

配置项元数据由静态定义提供，层级和模块的默认权限通过权限管理接口调整。

**层级权限（config_layer_privilege 表）**：每个层级一行，记录该层的默认 readable/writable。

**模块权限（config_module_privilege 表）**：每个模块一行，记录该模块的默认 readable/writable。

**功能/配置项权限**：沿用静态定义中每个配置项的 readable/writable 字段（默认 true，不支持运行时动态修改）。

## 3. 功能设计

### 3.1. 配置元数据管理

#### 3.1.1. 配置项元数据静态定义

**功能**：配置项元数据由 `configRegistrations.ts` 中的 `ALL_CONFIG_REGISTRATIONS` 静态声明；ConfigService 启动时据此构建内存注册表 `registryMap`（Map<config_key, ConfigRegistration>），配置页直接遍历静态定义收集各层配置，不再向数据库写入/读取 `config_registry` 表。

**处理流程**：

1. ConfigService 构造时遍历 `ALL_CONFIG_REGISTRATIONS` 构建 `registryMap`；
2. `getConfigDetail`/`getConfigItem`/`updateConfig` 均从 `registryMap` 查配置项元数据；
3. 配置项当前值经 `getCurrentValue` 路由到各模块 config* 方法获取；修改经 `routeUpdateConfig` 路由到各模块 config* 方法写入。

#### 3.1.2. 层级与模块权限管理

##### 3.1.2.1. 设置层级权限（updateLayerPrivilege）

**功能**：设置指定层级的可见性和可修改性，影响该层下所有模块和配置项

**URL**：`POST /api/config/privilege/layer`

**入参（UpdateLayerPrivilegeInput extends Input）**：
- layer（ENUM，必选）：分层标识（BASE / CORE / AGENT / ORCHESTRATION / APPLICATION）
- readable（BOOLEAN，可选）：是否可查看
- writable（BOOLEAN，可选）：是否可修改

**处理流程**：

1. 校验 layer 合法；
2. 调用 RelationDBProvider.insertDB 向 `config_layer_privilege` 表（库名=config）写入/更新层级权限（upsert 语义）；
3. 若 readable 从 true 变为 false：该层下所有模块和配置项在前端展示时自动隐藏（effective_readable=false）；
4. 若 writable 从 true 变为 false：该层下所有模块和配置项的 effective_writable 强制为 false，前端表单控件变为只读；
5. 返回更新后的层级权限；

##### 3.1.2.2. 设置模块权限（updateModulePrivilege）

**功能**：设置指定模块的可见性和可修改性，影响该模块下所有配置项

**URL**：`POST /api/config/privilege/module`

**入参（UpdateModulePrivilegeInput extends Input）**：
- module（STRING，必选）：模块名称
- readable（BOOLEAN，可选）：是否可查看
- writable（BOOLEAN，可选）：是否可修改

**权限修改约束**：

1. 调用 RelationDBProvider.selectOneDB 查询 `config_layer_privilege` 表获取该模块所属层级的权限；
2. 若层级 readable=false，则模块 readable 不可设置为 true（拒绝操作）；
3. 若层级 writable=false，则模块 writable 不可设置为 true（拒绝操作）；
4. 权限修改合法后，调用 RelationDBProvider.insertDB 向 `config_module_privilege` 表写入/更新（upsert 语义）；
5. 返回更新后的模块权限（含 effective_readable 和 effective_writable）；

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
          "effective_readable": true,
          "effective_writable": true,
          "categories": [
            {
              "category": "llm_provider",
              "category_name": "LLM 提供商",
              "readable": true,
              "writable": true,
              "effective_readable": true,
              "effective_writable": true,
              "configs": [
                {
                  "config_key": "llm_provider.default_enable",
                  "config_name": "默认启用状态",
                  "config_description": "新增 LLM 提供商时的默认启用状态",
                  "config_type": "BOOLEAN",
                  "config_default": true,
                  "current_value": true,
                  "readable": true,
                  "writable": true,
                  "effective_readable": true,
                  "effective_writable": true
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

1. 调用 RelationDBProvider.selectDB 查询 `config_layer_privilege` 表获取所有层级权限；
2. 调用 RelationDBProvider.selectDB 查询 `config_module_privilege` 表获取所有模块权限；
3. 遍历内存静态定义 `ALL_CONFIG_REGISTRATIONS`（按 layer/module/category 可选过滤）收集配置项；
4. 按 layer → module → category 层级分组；
5. 对每个节点（层级、模块、分类、配置项），按递推规则计算 effective_readable 和 effective_writable：
   - 层级的 effective = 原始值（层级无上级）；
   - 模块的 effective_readable = 层级 effective_readable AND 模块 readable；
   - 模块的 effective_writable = 层级 effective_writable AND 模块 writable；
   - 分类的 effective = 模块 effective AND 分类原始值；
   - 配置项的 effective = 分类 effective AND 配置项原始值（配置项 readable/writable 来自静态定义）；
6. 对每个配置项，调用对应的下层 config*/get* 接口获取当前值（current_value）；模块级 config 表（如 agent_builder_config）返回的 current_value 可能是整条记录对象，前端按 config_key 最后一段提取对应字段值；
7. 若 readable_only=true，过滤掉 effective_readable=false 的节点（整个子树不可见时一并过滤）；
8. 返回层级结构数据（含 effective_readable 和 effective_writable）；

#### 3.2.2. 获取单个配置项详情（getConfigItem）

**功能**：获取单个配置项的元数据和当前值

**URL**：`GET /api/config/detail/:config_key`

**入参**：
- config_key（Path Param，必选）

**输出**：
- 配置项的完整元数据 + 当前值

**处理流程**：

1. 从内存静态定义 `registryMap` 查询 config_key 获取元数据；不存在则返回 404；
2. 根据 config_key 定位所属模块和层级，查询 `config_module_privilege` 和 `config_layer_privilege` 表计算 effective_readable；
3. 校验 effective_readable 权限，若不可查看则返回 403；
4. 调用对应下层模块的 config*/get* 接口获取当前值；
5. 返回完整配置项数据（含 effective_readable 和 effective_writable）；

### 3.3. 配置修改

#### 3.3.1. 修改配置项（updateConfig）

**功能**：修改指定配置项的值（带权限校验）

**URL**：`POST /api/config/update`

**入参（UpdateConfigInput extends Input）**：
- config_key（STRING，必选）：配置项唯一标识
- value（ANY，必选）：配置新值

**处理流程**：

1. 从内存静态定义 `registryMap` 查询 config_key 获取元数据；不存在则返回 404；
2. 根据 config_key 定位所属模块和层级，查询 `config_module_privilege` 和 `config_layer_privilege` 表计算 effective_writable；
3. 校验 effective_writable 权限，若不可修改则返回 403；
4. 校验 value 类型与 config_type 匹配；
5. 若 config_type=ENUM，校验 value 在 config_enum_values 中；
6. 根据 config_key 路由到对应的下层模块 config* 方法，传入新值；
7. 调用下层方法执行配置更新；
8. 返回更新结果；

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
| BASE | LLMProvider | llm_provider.enabled | enableLLM | enable |
| BASE | LLMProvider | llm_provider.default_quota_* | 写 llm_config 表（addLLMProvider 时读取） | 对应限额字段 |
| BASE | SoulProvider | soul_provider.enabled | enableSoul | enable |
| BASE | SkillProvider | skill_provider.enabled | enableSkill | enable |
| BASE | MCPProvider | mcp_provider.enabled | enableMCP | enable |
| BASE | MCPProvider | mcp_provider.cache_ttl | 写 mcp_config 表 | cache_ttl |
| BASE | PromptsProvider | prompts_provider.enabled | enablePrompts | enable |
| BASE | MQProvider | mq_provider.enabled | enableMQ | enable |
| BASE | MQProvider | mq_provider.message_ttl / default_max_retries / default_priority / retry_base_delay / processing_timeout | 写 mq_config 表 | 对应字段 |
| BASE | GraphDBProvider | graphdb_provider.enabled | enableGraphDB | enable |
| BASE | GraphDBProvider | graphdb_provider.retention_days / min_activation_count / default_trigger_type / default_weight / default_depth / default_only_active / decay_slope / total_bonus / hop_decay_factor / fan_out_threshold | 写 graphdb_config 表 | 对应字段 |
| BASE | VectorDBProvider | vectordb_provider.enabled | enableVectorDB | enable |
| BASE | VectorDBProvider | vectordb_provider.default_top_k / default_similarity_threshold / default_distance_metric | 写 vectordb_config 表 | 对应字段 |
| BASE | RelationDBProvider | relationdb_provider.enabled | enableDB | enable |
| BASE | ToolProvider | tool_provider.http_timeout_ms | 写 tool_config 表 | http_timeout_ms |
| BASE | LLMProvider | llm_provider.* | addLLMProvider / updateLLMProvider / delLLMProvider 等 | 根据操作类型 |
| BASE | SoulProvider | soul.* | addSoul / updateSoul / delSoul 等 | 根据操作类型 |
| BASE | SkillProvider | skill.* | addSkill / updateSkill / delSkill 等 | 根据操作类型 |
| BASE | MCPProvider | mcp.* | installMcp / startMcp / stopMcp 等 | 根据操作类型 |
| BASE | PromptsProvider | prompt.* | addPrompt / updatePrompt / delPrompt 等 | 根据操作类型 |

> 注：Base 层 Provider 的配置项统一经 `BASE_PROVIDER_CONFIG_TABLES` 映射路由——`enabled` 走各 Provider 的 enable 方法（同步运行时内存状态），其余参数直接读写各 Provider 的 `xxx_config` 表（这些参数均为运行时实时读取，写表即时生效）。

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

> **模型启用状态约定**：模型的启用/停用统一以**布尔字段 `enable`**（`true`/`false`）表达，接口层不再使用 `'active'/'inactive'` 字符串。`PUT` 更新模型时采用**部分更新语义**——仅当请求体显式携带 `enable`（或 `enabled`）时才更新启用状态，否则保持 `llm_available.enable` 原值，避免编辑其它字段时误将默认模型禁用。

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
3. **Application 层其他模块的 config* 方法为内部接口**，仅供 Config Application 代理调用，不对前端暴露独立 HTTP 端点。违规示例：`/api/chat/config`、`/api/profile/config`、`/api/learning/config`、`/api/visualization/config`；
4. 配置权限控制采用**三级层级继承模型**（层级 → 模块 → 功能/分类），上层权限约束下层，下级权限不能突破上级限制。权限校验以 effective_readable 和 effective_writable 为准，而非原始值；
5. 权限修改约束：修改下级节点的 readable/writable 时，若修改后的值超过了上级约束，操作被拒绝（如层级 writable=false 时，不可将模块 writable 设为 true）；
6. 配置类型校验：修改配置时校验 value 类型与 config_type 匹配，ENUM 类型校验枚举值范围；
7. 配置元数据来源：各模块配置项元数据在 `configRegistrations.ts` 中静态声明（`ALL_CONFIG_REGISTRATIONS`），ConfigService 构造时构建内存 `registryMap`，配置页直接收集，无运行时注册步骤；
8. 配置路由：updateConfig 根据 config_key 的前缀（如 "llm_core."、"writer_agent."）路由到对应下层模块的 config* 方法；
9. 所有日志通过 LogProvider 记录，禁止 console.log；
10. 所有 ID 通过 IdGenerator.generate() 生成；

## 5. 表设计

### 5.1. 配置项元数据（内存静态定义）

配置项元数据不再使用 `config_registry` 数据库表，改由 `configRegistrations.ts` 的 `ALL_CONFIG_REGISTRATIONS` 静态声明，ConfigService 构造时据此构建内存注册表 `registryMap`。字段结构同「配置元数据静态定义」一节（layer / module / category / config_key / config_name / config_description / config_type / config_default / config_enum_values / readable / writable）。

### 5.2. 层级权限表（SQLite）

- 表名：config_layer_privilege
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| layer | 分层标识 | ENUM | N | 唯一索引 | BASE / CORE / AGENT / ORCHESTRATION / APPLICATION |
| readable | 是否可查看 | BOOLEAN | N | | 默认 true |
| writable | 是否可修改 | BOOLEAN | N | | 默认 true |

### 5.3. 模块权限表（SQLite）

- 表名：config_module_privilege
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| module | 模块名称 | VARCHAR | N | 唯一索引 | 如 "LLMCore"、"WriterAgent" |
| layer | 所属分层 | ENUM | N | 普通索引 | 关联 config_layer_privilege.layer |
| readable | 是否可查看 | BOOLEAN | N | | 默认 true |
| writable | 是否可修改 | BOOLEAN | N | | 默认 true |

### 5.4. Config 自身配置表（SQLite）

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
| 第五层：配置读写区 | getConfigItem / updateConfig | 查看/修改具体配置项（修改成功后前端重新拉取配置树以反映新值） |
| 面包屑导航 | 基于 getConfigDetail 层级数据 | 前端自行构建面包屑 |
| 颜色状态（绿色/灰色） | getConfigDetail（返回 effective_readable/effective_writable） | 前端根据有效权限渲染颜色 |
| 层级权限控制 | updateLayerPrivilege | 控制整层的可见性和可修改性 |
| 模块权限控制 | updateModulePrivilege | 控制模块的可见性和可修改性 |
| Soul 管理 | Soul 管理代理接口 | 增删改查 Soul |
| Skill 管理 | Skill 管理代理接口 | 增删改查 Skill |
| MCP 管理 | MCP 管理代理接口 | 安装/启停/卸载 MCP |
| Prompt 模板管理 | Prompt 模板管理代理接口 | 增删改查 Prompt 模板 |

## 7. 变更记录

### [2026-08-19] 修复「Agent 重新评估概率」配置归属（agent_builder → agent_library）

**变更原因**：配置中心「Agent 配置 > 构建参数」中的 `agent_builder.regen_rate` 是无效配置——`agent_builder_config` 表无 `regen_rate` 列、`configAgentBuilder` 与 `routeUpdateConfig` 均不处理该字段（保存被静默丢弃），且 AgentBuilder 业务层从不读取。实际生效的"直接复用概率"由 `AgentLibraryService.matchAgent` 读取 `agent_library_config` 表的 `regen_rate`。

**修改的方法**：
- `configRegistrations.ts` — 删除 `agent_builder.regen_rate` 注册；新增 `agent_library.regen_rate` / `agent_library.similarity_threshold` / `agent_library.prompt_template_id` / `agent_library.max_agent_count` 注册。
- `ConfigService.routeUpdateConfig()` — 原始代码：`agent_library.` 分支透传 `{ config_key, value }`，与 `configAgentLibrary` 的字段（`regen_rate` 等）不匹配导致更新无效；改为：按前缀将 `config_key` 映射为对应 input 字段后调用 `configAgentLibrary`。

**影响的端点**：
- `PUT /api/config`（`agent_library.regen_rate` 等）— 之前静默无效，现在可正常持久化并校验 0-100。
- `GET /api/config` 配置树 — `agent_builder.regen_rate` 条目移除，新增 `agent_library.*` 条目。

**可能存在的问题**：
- 已存在的 `config_registry` 历史数据不受影响（注册表为内存静态定义，不写表）。
- 前端新增「Agent 库参数」页承载 `agent_library.*`（`ConfigView.vue` 导航）。

## 配置变更历史记录（2026-09-22 · TODO-List §2 落地）

**变更原因**：配置页面 PRD 需求——配置项修改可追溯（变更历史 + 修改前 Diff 对比），此前 updateConfig 无任何历史记录。

**修改的方法**：
  - `ConfigSchemaInitializer` — 新建 `config_history` 表（id/created/updated/config_key/old_value/new_value/change_time/operator，old/new 值 JSON 序列化存储）。
  - `ConfigService.updateConfig` — 原实现路由写入后直接返回（原始代码已注释保留于方法上方）；修改后：写入前 `getCurrentValue` 取当前真值，写入成功后 `recordConfigHistory` 落历史（best-effort：失败经 metrics.warn 可见，不阻断配置写入——权限审计同款容忍语义）。
  - `ConfigService.soConfigHistory` — 新增查询（config_key 缺省查全局；start_time/end_time 时间范围过滤；change_time 降序；limit 缺省 100）；`ConfigAccess`/`Config/index.ts` 透传。
  - 前端 `api/index.ts configApi.history` — `forKey`/`list` 两个消费端；`api/types.ts ConfigHistoryRecord`。
  - 前端新组件 `components/config/ConfigValueDiff.vue` — 原语值单行 旧→新 Diff；多行字符串 LCS 行级 diff（+/- 行标注）。
  - 前端新组件 `components/config/ConfigHistoryModal.vue` — 单配置项变更历史弹窗（每条记录渲染 Diff）。
  - 前端 `views/ConfigView.vue` — 参数行新增「变更历史」入口；保存流改为「保存 → Diff 确认弹窗（旧值 vs 新值）→ 确认后写入」（`saveParam` → `confirmSaveParam` → `executeConfirmedSave`）。

**影响的端点**：
  - `GET /api/config/history` — 新增：全局变更历史（query: start_time/end_time/limit）。
  - `GET /api/config/history/:config_key` — 新增：单配置项变更历史。
  - `PUT /api/config` — 每次成功写入落一条变更历史。

**可能存在的问题**：
  - old_value 取自 getCurrentValue（各模块配置真值读取），个别只写不读的配置路径 old 值可能为默认值回退；
  - 历史表无清理策略（配置变更低频，暂不做保留期；后续可挂 configBus 同款按天清理）。
