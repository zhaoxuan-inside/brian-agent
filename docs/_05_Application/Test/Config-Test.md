# Config Application 测试用例

> 基于 [Config-PRD.md](../Config/Config-PRD.md) 生成，覆盖所有接口及 80%+ 场景。

---

## 测试约定

- 测试框架：vitest + supertest
- 独立测试环境：`beforeEach` 初始化临时 DB 及表结构（config_registry、config_layer_privilege、config_module_privilege、config_config）
- 环境变量：`BRIAN_LOG_LEVEL=error`、`BRIAN_USE_SQLITE_GRAPH=true`
- 依赖 Mock：下层各模块的 config*/get*/add*/update*/del* 接口

---

## 1. 配置元数据管理

### 1.1 注册配置项 — registerConfig

**端点**：`POST /api/config/register`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CFG-001 | 注册单个配置项 | 合法元数据 | HTTP 200，成功数=1，config_registry 表有记录 |
| TC-CFG-002 | 批量注册多个配置项 | registrations=[{...}, {...}, {...}] | HTTP 200，成功数=3 |
| TC-CFG-003 | Upsert 语义 — 更新已有配置项 | config_key 已存在 | 更新成功，config_description/config_default 刷新 |
| TC-CFG-004 | 注册所有必要字段 | layer/module/category/config_key/config_name/config_type/config_default 均提供 | 成功 |
| TC-CFG-005 | 注册 ENUM 类型配置 | config_type=ENUM, config_enum_values=["a","b"] | 成功 |
| TC-CFG-006 | config_key 唯一性 | 同一 config_key 注册两次 | 第二次为更新（upsert） |
| TC-CFG-007 | layer 非法值 | layer="INVALID" | HTTP 400，提示 layer 必须为 BASE/CORE/AGENT/ORCHESTRATION/APPLICATION |
| TC-CFG-008 | config_type 非法值 | config_type="UNKNOWN" | HTTP 400 |
| TC-CFG-009 | 缺少必填字段 | 不含 config_key | HTTP 400 |
| TC-CFG-010 | ENUM 类型缺少 config_enum_values | config_type=ENUM 但未提供 | HTTP 400（ENUM 类型必须提供枚举值列表） |
| TC-CFG-011 | registrations 为空数组 | registrations=[] | HTTP 400（空注册列表无效） |

### 1.2 层级与模块权限管理

#### 1.2.1 设置层级权限 — updateLayerPrivilege

**端点**：`POST /api/config/privilege/layer`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CFG-020 | 设置层级不可见 | layer=BASE, readable=false | HTTP 200，config_layer_privilege 表更新，该层所有模块/配置 effective_readable=false |
| TC-CFG-021 | 设置层级不可修改 | layer=CORE, writable=false | HTTP 200，该层所有模块 effective_writable=false |
| TC-CFG-022 | 设置层级同时不可见也不可修改 | layer=AGENT, readable=false, writable=false | HTTP 200，双重限制生效 |
| TC-CFG-023 | 恢复层级可见性 | 从 readable=false 改为 readable=true | HTTP 200，子模块 effective_readable 重新计算 |
| TC-CFG-024 | layer 非法值 | layer="UNKNOWN" | HTTP 400 |
| TC-CFG-025 | Upsert 语义 | 同一 layer 重复调用 | 第二次成功更新 |
| TC-CFG-026 | 部分更新 | 只传 readable 不传 writable | HTTP 200，仅 readable 变更，writable 保持原值 |

#### 1.2.2 设置模块权限 — updateModulePrivilege

**端点**：`POST /api/config/privilege/module`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CFG-030 | 设置模块不可见 | module=LLMProvider, readable=false | HTTP 200，该模块所有配置 effective_readable=false |
| TC-CFG-031 | 设置模块不可修改 | module=LLMProvider, writable=false | HTTP 200，该模块所有配置 effective_writable=false |
| TC-CFG-032 | 层级不可见时设置模块可见 — 应拒绝 | 层级 BASE: readable=false，尝试设置模块 LLMProvider: readable=true | HTTP 400，拒绝操作 |
| TC-CFG-033 | 层级不可修改时设置模块可修改 — 应拒绝 | 层级 CORE: writable=false，尝试设置 LLMCore: writable=true | HTTP 400，拒绝操作 |
| TC-CFG-034 | 层级可见且可修改时模块自由设置 | 层级 BASE: readable=true, writable=true | 模块 readable/writable 可任意设置 |
| TC-CFG-035 | Upsert 语义 | 同一 module 重复调用 | 第二次成功更新 |
| TC-CFG-036 | module 不存在 | module="NonExistentModule" | HTTP 200（模块权限记录独立于注册，允许预设置） |

#### 1.2.3 设置配置项权限 — updateConfigPrivilege

**端点**：`POST /api/config/privilege`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CFG-040 | 设置配置项不可见 | config_key 有效, readable=false | HTTP 200 |
| TC-CFG-041 | 设置配置项不可修改 | config_key 有效, writable=false | HTTP 200 |
| TC-CFG-042 | 模块不可见时设置配置项可见 — 应拒绝 | 所属模块 effective_readable=false | HTTP 400 |
| TC-CFG-043 | 模块不可修改时设置配置项可修改 — 应拒绝 | 所属模块 effective_writable=false | HTTP 400 |
| TC-CFG-044 | 正常权限修改 | 上级权限允许 | HTTP 200，返回 effective_readable/effective_writable |
| TC-CFG-045 | config_key 不存在 | config_key="nonexistent" | HTTP 404 |
| TC-CFG-046 | 部分更新 | 只传 readable | 仅 readable 变更 |

#### 1.2.4 获取完整权限树 — getPrivilegeTree

**端点**：`GET /api/config/privilege/tree`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CFG-050 | 获取权限树 | 已有层级/模块/配置注册 | HTTP 200，返回 layers 数组，每层含 modules → categories → configs |
| TC-CFG-051 | 有效权限计算 — 层级不可见 | BASE: readable=false | 该层所有子节点 effective_readable=false |
| TC-CFG-052 | 有效权限计算 — 模块不可见 | WriterAgent: readable=false | 该模块所有配置 effective_readable=false |
| TC-CFG-053 | 有效权限计算 — 模块不可修改 | 层级 writable=true，模块 writable=false | 该模块所有配置 effective_writable=false |
| TC-CFG-054 | 有效权限计算 — 多层继承 | 层级 readable=true/writable=true, 模块 readable=true/writable=false | 配置项即使 writable=true，effective_writable=false |
| TC-CFG-055 | 空权限树 | 无任何权限/配置注册 | HTTP 200，layers=[] 或每层 modules=[] |
| TC-CFG-056 | 返回字段完整性 | 正常 | 每个节点含 readable, writable, effective_readable, effective_writable |

---

## 2. 配置查询

### 2.1 获取配置详情 — getConfigDetail

**端点**：`GET /api/config/detail`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CFG-060 | 获取完整配置层级 | 无过滤参数 | HTTP 200，返回 layers → modules → categories → configs 完整层级 |
| TC-CFG-061 | 按 layer 过滤 | layer=BASE | 仅返回 BASE 层的配置 |
| TC-CFG-062 | 按 module 过滤 | module=LLMCore | 仅返回 LLMCore 模块的配置 |
| TC-CFG-063 | 按 category 过滤 | category=llm_matching | 仅返回该分类的配置 |
| TC-CFG-064 | 多层过滤组合 | layer=CORE, module=LLMCore | 返回交集 |
| TC-CFG-065 | readable_only=true | 有层级设置 readable=false | 仅返回 effective_readable=true 的节点 |
| TC-CFG-066 | readable_only=false | — | 返回所有节点（含不可见节点） |
| TC-CFG-067 | 配置项含 current_value | 配置已初始化 | 每个 config 含 current_value（从下层接口获取） |
| TC-CFG-068 | 返回字段完整性 | 正常 | 每层含 layer/layer_name/modules；每模块含 module/module_name/description/readable/writable/effective_readable/effective_writable/categories |
| TC-CFG-069 | empty 状态 | 无任何配置注册 | HTTP 200，layers=[] |
| TC-CFG-070 | config_description 字段正确 | 配置注册时填写 description | 返回正确的 description |

### 2.2 获取单个配置项详情 — getConfigItem

**端点**：`GET /api/config/detail/:config_key`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CFG-075 | 获取存在且可读的配置项 | config_key 有效，effective_readable=true | HTTP 200，含完整元数据 + current_value |
| TC-CFG-076 | config_key 不存在 | config_key="nonexistent" | HTTP 404 |
| TC-CFG-077 | 配置项不可读 | effective_readable=false | HTTP 403（或 NotFoundError，对不可见资源隐藏存在性） |
| TC-CFG-078 | 返回含 effective 权限 | 正常 | 返回 effective_readable + effective_writable |

---

## 3. 配置修改

### 3.1 修改配置项 — updateConfig

**端点**：`POST /api/config/update`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CFG-085 | 修改 BOOLEAN 类型配置 | config_type=BOOLEAN, value=true | HTTP 200 |
| TC-CFG-086 | 修改 INT 类型配置 | config_type=INT, value=500 | HTTP 200 |
| TC-CFG-087 | 修改 DOUBLE 类型配置 | config_type=DOUBLE, value=0.5 | HTTP 200 |
| TC-CFG-088 | 修改 STRING 类型配置 | config_type=STRING, value="test" | HTTP 200 |
| TC-CFG-089 | 修改 ENUM 类型配置（合法值） | config_type=ENUM, value 在 enum_values 中 | HTTP 200 |
| TC-CFG-090 | 修改 ENUM 类型配置（非法值） | config_type=ENUM, value 不在 enum_values 中 | HTTP 400，提示枚举值无效 |
| TC-CFG-091 | config_key 不存在 | config_key="nonexistent" | HTTP 404 |
| TC-CFG-092 | 配置项不可修改 | effective_writable=false | HTTP 403 |
| TC-CFG-093 | 类型不匹配 — INT 传 STRING | config_type=INT, value="not_a_number" | HTTP 400 |
| TC-CFG-094 | 类型不匹配 — BOOLEAN 传字符串 | config_type=BOOLEAN, value="true"（字符串） | HTTP 400（类型不匹配拒绝） |
| TC-CFG-095 | 类型不匹配 — DOUBLE 传 INT | config_type=DOUBLE, value=1 | HTTP 200（自动转换为 1.0） |
| TC-CFG-096 | 修改 chat 模块配置 | config_key="chat.max_messages_per_session" | 代理调用 configChat |
| TC-CFG-097 | 修改 llm_core 配置 | config_key="llm_core.regen_rate" | 代理调用 configLLMCore |
| TC-CFG-098 | 修改 writer_agent 配置 | config_key="writer_agent.default_language" | 代理调用 configWriterAgent |
| TC-CFG-099 | 配置路由正确性 | 各前缀 config_key | 正确路由到对应下层接口 |

---

## 4. Base 层资源管理代理

> 每个代理接口测试包含三个验证维度：① 参数透传正确性（toHaveBeenCalledWith）② 返回值传播 ③ 异常传播（mock 抛出异常时代理应透传）

### 4.1 LLM 管理

| 编号 | 测试场景 | 端点 | 前置条件 | 预期结果 |
|------|---------|------|---------|---------|
| TC-CFG-100 | 新增 LLM 提供商 | `POST /api/config/llm/provider` | 合法参数 | HTTP 200，代理调用 LLMProvider.addLLMProvider |
| TC-CFG-101 | 更新 LLM 提供商 | `PUT /api/config/llm/provider` | 提供商存在 | HTTP 200 |
| TC-CFG-102 | 删除 LLM 提供商 | `DELETE /api/config/llm/provider` | 提供商存在 | HTTP 200 |
| TC-CFG-103 | 搜索 LLM 提供商 | `GET /api/config/llm/provider/search` | 有数据 | HTTP 200，返回列表 |
| TC-CFG-104 | 测试 LLM 提供商 | `POST /api/config/llm/provider/test` | 连接信息有效 | HTTP 200 |
| TC-CFG-105 | 刷新模型列表 | `POST /api/config/llm/provider/list` | 提供商有效 | HTTP 200 |
| TC-CFG-106 | 启用 LLM 模型 | `POST /api/config/llm` | 模型信息有效 | HTTP 200 |
| TC-CFG-107 | 更新 LLM 模型 | `PUT /api/config/llm` | 模型存在 | HTTP 200 |
| TC-CFG-108 | 删除 LLM 模型 | `DELETE /api/config/llm` | 模型存在 | HTTP 200 |
| TC-CFG-109 | 搜索 LLM 模型 | `GET /api/config/llm/search` | 有数据 | HTTP 200 |
| TC-CFG-110 | 获取 LLM 详情 | `GET /api/config/llm/:id` | ID 存在 | HTTP 200，返回完整信息 |
| TC-CFG-111 | 设置 LLM 配额 | `POST /api/config/llm/quota` | 合法配额 | HTTP 200 |
| TC-CFG-112 | 检查 LLM 配额 | `GET /api/config/llm/quota/check` | 已有配额 | HTTP 200，返回剩余配额 |

### 4.2 Soul 管理

| 编号 | 测试场景 | 预期结果 |
|------|---------|---------|
| TC-CFG-120 | POST /api/config/soul — 新增 | HTTP 200 |
| TC-CFG-121 | PUT /api/config/soul — 更新 | HTTP 200 |
| TC-CFG-122 | DELETE /api/config/soul — 删除 | HTTP 200 |
| TC-CFG-123 | GET /api/config/soul/search — 搜索 | HTTP 200 |
| TC-CFG-124 | GET /api/config/soul/:id — 详情 | HTTP 200 |
| TC-CFG-125 | GET /api/config/soul/rule — 查看规则 | HTTP 200 |
| TC-CFG-126 | POST /api/config/soul/rule — 修改规则 | HTTP 200 |

### 4.3 Skill 管理

| 编号 | 测试场景 | 预期结果 |
|------|---------|---------|
| TC-CFG-130 | POST /api/config/skill — 新增 | HTTP 200 |
| TC-CFG-131 | PUT /api/config/skill — 更新 | HTTP 200 |
| TC-CFG-132 | DELETE /api/config/skill — 删除 | HTTP 200 |
| TC-CFG-133 | GET /api/config/skill/search — 搜索 | HTTP 200 |
| TC-CFG-134 | GET /api/config/skill/:id — 详情 | HTTP 200 |
| TC-CFG-135 | GET /api/config/skill/rule — 查看规则 | HTTP 200 |
| TC-CFG-136 | POST /api/config/skill/rule — 修改规则 | HTTP 200 |

### 4.4 MCP 管理

| 编号 | 测试场景 | 预期结果 |
|------|---------|---------|
| TC-CFG-140 | POST /api/config/mcp/provider — 新增提供商 | HTTP 200 |
| TC-CFG-141 | PUT /api/config/mcp/provider — 更新提供商 | HTTP 200 |
| TC-CFG-142 | DELETE /api/config/mcp/provider — 删除提供商 | HTTP 200 |
| TC-CFG-143 | GET /api/config/mcp/provider/search — 搜索 | HTTP 200 |
| TC-CFG-144 | POST /api/config/mcp/provider/test — 测试连接 | HTTP 200 |
| TC-CFG-145 | POST /api/config/mcp/provider/list — 刷新列表 | HTTP 200 |
| TC-CFG-146 | POST /api/config/mcp/install — 安装 MCP | HTTP 200 |
| TC-CFG-147 | POST /api/config/mcp/start — 启动 MCP | HTTP 200 |
| TC-CFG-148 | POST /api/config/mcp/stop — 停止 MCP | HTTP 200 |
| TC-CFG-149 | POST /api/config/mcp/uninstall — 卸载 MCP | HTTP 200 |
| TC-CFG-150 | PUT /api/config/mcp — 更新 MCP | HTTP 200 |
| TC-CFG-151 | GET /api/config/mcp/:id — 详情 | HTTP 200 |
| TC-CFG-152 | GET /api/config/mcp/search — 搜索 | HTTP 200 |
| TC-CFG-153 | MCP 生命周期 — 安装→启动→停止→卸载 | 状态流转正确 |

### 4.5 Prompt 模板管理

| 编号 | 测试场景 | 预期结果 |
|------|---------|---------|
| TC-CFG-160 | POST /api/config/prompt — 新增 | HTTP 200 |
| TC-CFG-161 | PUT /api/config/prompt — 更新 | HTTP 200 |
| TC-CFG-162 | DELETE /api/config/prompt — 删除 | HTTP 200 |
| TC-CFG-163 | GET /api/config/prompt/search — 搜索 | HTTP 200 |
| TC-CFG-164 | GET /api/config/prompt/:id — 详情 | HTTP 200 |

---

## 5. Config 自身配置 — configConfig

**端点**：`POST /api/config/config`

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CFG-170 | 修改 default_readable | default_readable=false | HTTP 200，后续新注册配置默认 readable=false |
| TC-CFG-171 | 修改 default_writable | default_writable=false | HTTP 200，后续新注册配置默认 writable=false |
| TC-CFG-172 | 获取自身配置 | 不传参数 | HTTP 200，返回 default_readable + default_writable |
| TC-CFG-173 | 部分更新 | 只传 default_readable | 仅该字段变更 |

---

## 6. 跨模块约束

| 编号 | 测试场景 | 前置条件 | 预期结果 |
|------|---------|---------|---------|
| TC-CFG-180 | Chat 模块无独立配置端点 | POST /api/chat/config | HTTP 404 |
| TC-CFG-181 | UserProfile 模块无独立配置端点 | POST /api/profile/config | HTTP 404 |
| TC-CFG-182 | SelfLearning 模块无独立配置端点 | POST /api/learning/config | HTTP 404 |
| TC-CFG-183 | Visualization 模块无独立配置端点 | POST /api/visualization/config | HTTP 404 |
| TC-CFG-184 | 所有配置仅通过 Config Application 修改 | 各模块配置通过 POST /api/config/update 修改 | 成功，由 Config 代理调用下层 |

---

## 覆盖率矩阵

| 功能模块 | 子功能 | 测试用例数 |
|---------|--------|----------|
| 配置注册 | registerConfig | 12 |
| 层级权限 | updateLayerPrivilege | 7 |
| 模块权限 | updateModulePrivilege | 7 |
| 配置项权限 | updateConfigPrivilege | 7 |
| 权限树 | getPrivilegeTree | 7 |
| 配置查询 | getConfigDetail + getConfigItem | 18 |
| 配置修改 | updateConfig | 17 |
| LLM 代理 | 13 个端点（含错误传播） | 24 |
| Soul 代理 | 7 个端点（含错误传播） | 14 |
| Skill 代理 | 7 个端点（含错误传播） | 14 |
| MCP 代理 | 14 个端点（含错误传播） | 27 |
| Prompt 代理 | 5 个端点（含错误传播） | 10 |
| 自身配置 | configConfig | 4 |
| 跨模块约束 | — | 5 |

**总计**：约 40 个 HTTP 端点，159 个测试用例，覆盖 CRUD、三级继承权限模型、类型校验、路由映射、参数透传、异常传播、跨模块约束等场景。
