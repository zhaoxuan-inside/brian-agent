# MCP Provider

## 0. 内置 MCP 市场

系统内置四个 MCP 市场（不可新增/删除），作为 MCP 工具的来源：

| 市场 | market_key | 接入方式 | 说明 |
|------|-----------|---------|------|
| **阿里云百炼** | `aliyun_bailian` | REST API (DashScope) | 阿里云 AI 平台的 MCP 服务市场，需配置 API Key |
| **ModelScope** | `modelscope` | REST API | 魔搭社区 MCP 广场，社区贡献的 MCP 服务器 |
| **Smithery** | `smithery` | REST API + MCP Client | 美国 MCP 注册中心，托管 HTTP/SSE 类型的 MCP 服务，自动 OAuth |
| **GitHub** | `github` | npm Registry + MCP Client | GitHub 上 npm 发布的 MCP 服务器，通过 npx/uvx stdio 运行 |

### 0.1 各市场接入详情

#### 阿里云百炼

- **搜索 MCP**：通过 DashScope API `GET /api/v1/mcp/servers` 获取可用 MCP 列表
- **安装**：调用百炼 API 创建 MCP 服务实例，获取 endpoint 和认证 token
- **调用**：普通 REST API POST，携带认证 token，解析 JSON 响应
- **认证方式**：API Key（`Authorization: Bearer <api_key>`）

#### ModelScope

- **搜索 MCP**：通过 ModelScope API 获取 MCP 广场列表
- **安装**：JSON REST 格式记录 MCP 元数据
- **调用**：通过 MCP 协议（Streamable HTTP）调用
- **认证方式**：API Key 或无需认证（公开 MCP）

#### Smithery

- **搜索 MCP**：`GET /servers` API 全文/语义搜索可用服务器
- **安装**：`POST /connect` 创建连接，自动处理 OAuth 和 token 管理
- **调用**：通过 Smithery 管理的 MCP 连接调用工具（`POST /connections/{id}/tools/{tool}/call`）
- **认证方式**：API Key（创建连接用），连接后的 OAuth 由 Smithery 自动管理

#### GitHub

- **搜索 MCP**：通过 npm registry 搜索关键词 `mcp` 或 `@modelcontextprotocol/server-*`
- **安装**：`npm install -g <package-name>` 安装到本地
- **运行**：通过 `npx <package-name>` 或 `uvx <package-name>` 作为 stdio MCP 服务启动
- **调用**：通过 MCP SDK 连接 stdio transport 获取工具列表和调用工具
- **认证方式**：部分 MCP 需环境变量配置 API Key（如 GitHub Token）

## 1. 设计目标

1. 解耦 MCP 和系统，通过 Repository 设计模式为上层提供统一的 MCP 操作接口；
2. 所有对 MCP 的操作都不能直接进行，都必须要通过 MCPProvider；
3. 管理四个内置 MCP 市场（阿里云百炼、ModelScope、Smithery、GitHub），市场不可新增/删除，仅可启用/禁用；
4. 从各市场搜索和刷新可用的 MCP 工具列表，缓存到本地数据库；
5. 管理 MCP 工具的安装/启动/停止/卸载/查询；
6. 通过统一的 MCP Client 调用已安装的工具，接管 MCP 调用请求；
7. 提供可视化数据接口，支持 MCP 使用统计；
8. MCPProvider 用到的所有配置项统一存储于关系数据库配置表 `mcp_config`；

## 2. 对象定义

> 以下对象贯穿各功能接口，统一定义如下。
> Input、Context、Output 为项目通用基类，参见 `_00_DevStandardization.md`。
> Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不再重复定义。

### 2.1. MCP 上下文（McpContext）

继承 Context 基类，MCP 相关操作的执行上下文。

### 2.2. MCP 市场数据对象（McpMarket）

四个内置市场，不可新增/删除。系统初始化时自动创建。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| market_key | STRING | Y | 市场中唯一的键：aliyun_bailian / modelscope / smithery / github |
| market_name | STRING | Y | 市场名称：阿里云百炼 / ModelScope / Smithery / GitHub |
| market_url | STRING | Y | 市场 API 端点地址 |
| market_brief | STRING | N | 市场描述 |
| auth_type | ENUM | Y | 认证类型：api_key / oauth / env_var |
| auth_config | JSON | N | 认证配置（如 api_key_field_name、env_var_names 等） |
| enable | BOOLEAN | N | 是否启用，默认 true |

### 2.3. MCP 工具数据对象（McpTool）

从市场获取并缓存的可用 MCP 工具。每个市场约有 10~200+ 个工具。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| market_id | STRING | Y | 所属市场 ID，关联 mcp_market.id |
| tool_name | STRING | Y | 工具全局唯一标识（如 @modelcontextprotocol/server-github） |
| tool_title | STRING | Y | 工具显示名称 |
| tool_brief | STRING | N | 工具描述 |
| tool_schema | JSON | N | 工具输入参数 JSON Schema（定义调用格式） |
| tool_output_schema | JSON | N | 工具输出 JSON Schema（定义返回值格式） |
| install_type | ENUM | Y | 安装类型：npm / http / custom |
| install_config | JSON | Y | 安装配置（npm: { package: "xxx" } / http: { endpoint: "xxx" }） |
| version | STRING | N | 工具版本 |

### 2.4. MCP 安装数据对象（McpInstall）

已安装到本地的 MCP 工具实例。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| market_id | STRING | Y | 来源市场 ID |
| tool_id | STRING | Y | 来源工具 ID，关联 mcp_tool.id |
| install_status | ENUM | Y | 安装状态：installing / installed / error |
| transport_type | ENUM | Y | 通信方式：stdio / http |
| transport_config | JSON | Y | 通信配置（stdio: { command, args } / http: { url, headers }） |
| connected | BOOLEAN | N | 是否已连接 |
| enable | BOOLEAN | N | 是否启用，默认 true |

## 3. 功能设计

### 3.1. MCP 市场管理（内置，不可新增/删除）

四个内置市场在系统初始化时自动创建，仅支持查询、启用/禁用、测试连接。

#### 3.1.1. 搜索 MCP 市场（soMcpMarket）

**功能**：搜索内置 MCP 市场，支持关键词、条件过滤、排序、分页

**方法签名**：`Boolean soMcpMarket(SoMcpMarketInput input, McpContext context, SoMcpMarketOutput output)`

**入参（SoMcpMarketInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| keyword | STRING | N | 关键词搜索（匹配 market_name） |
| conditions | Condition[] | N | 条件过滤 |
| order_by | OrderBy[] | N | 排序规则 |
| page | Page | N | 分页参数 |

**处理流程**：

1. 根据 keyword、conditions 构造查询，通过 RelationDBProvider 查询 `mcp_market` 表；
2. 按 order_by 排序，按 page 分页返回结果；

**返回**：Boolean，表示查询是否完成；MCP 市场列表及总数通过 output 参数返回

#### 3.1.2. 测试市场连接（testMcpMarket）

**功能**：测试 MCP 市场的网络连通性

**方法签名**：`Boolean testMcpMarket(TestMcpMarketInput input, McpContext context, TestMcpMarketOutput output)`

**入参**：`id`（STRING，必选）— 市场 ID

**处理流程**：

1. 根据 ID 获取市场信息；
2. 向市场 API 地址发起网络连通性测试；
3. 返回连通状态和响应时间；

**返回**：Boolean，连通状态和响应时间通过 output 参数返回

#### 3.1.3. 启用/禁用市场（updateMcpMarket）

**功能**：启用或禁用指定 MCP 市场（不提供新增/删除接口）

**方法签名**：`Boolean updateMcpMarket(UpdateMcpMarketInput input, McpContext context, UpdateMcpMarketOutput output)`

**入参**：`id`（STRING，必选）、`enable`（BOOLEAN，必选）

#### 3.1.4. 刷新工具列表（listMcpTools）

**功能**：从指定市场获取最新的 MCP 工具列表并缓存到本地

**方法签名**：`Boolean listMcpTools(ListMcpToolsInput input, McpContext context, ListMcpToolsOutput output)`

**入参**：`market_id`（STRING，必选）、`keyword`（STRING，可选，按工具名称搜索）、`page`（Page，可选）

**处理流程**：

1. 根据 market_id 获取市场信息，读取 auth_config 获取认证凭据；
2. 从 mcp_config 读取 `cache_ttl`（默认 86400 秒）；
3. 查询 mcp_tool 表该市场的缓存，判断是否在有效期；
4. 若缓存过期：根据市场 market_key 调用对应的搜索 API：
   - `aliyun_bailian`：GET DashScope API `/mcp/servers`
   - `modelscope`：GET ModelScope API `/mcp/registry`
   - `smithery`：GET `/servers?q={keyword}`
   - `github`：调用 npm registry search `keywords:mcp`
5. 将获取的工具列表写入 `mcp_tool` 表（upsert 语义，按 market_id + tool_name 唯一键）；
6. 若指定分页，按分页返回；

**返回**：Boolean，工具列表及总数通过 output 参数返回

### 3.2. MCP 工具安装与管理

#### 3.2.1. 安装 MCP（installMcp）

**功能**：安装指定的 MCP 工具到本地

**方法签名**：`Boolean installMcp(InstallMcpInput input, McpContext context, InstallMcpOutput output)`

**入参**：`market_id`（STRING，必选）、`tool_id`（STRING，必选，来自 mcp_tool 表）

**处理流程**：

1. 根据 market_id + tool_id 从 mcp_tool 表获取工具元数据；
2. 根据 install_type 执行安装：
   - `npm`：执行 `npm install -g {package_name}`，生成 stdio transport 配置（command: npx, args: [package_name]）；
   - `http`：验证 HTTP endpoint 可达性，生成 http transport 配置；
3. 安装成功后写入 `mcp_install` 表，状态为 `installed`；
4. 若安装失败，写入状态为 `error`，记录错误信息；

> 注：npm 安装超时 120s；处于启动状态的 MCP 不可卸载。

**返回**：Boolean，安装的 MCP ID 通过 output 参数返回

#### 3.2.2. 启动 MCP（startMcp）

**功能**：启动指定的 MCP 工具

**方法签名**：`Boolean startMcp(StartMcpInput input, McpContext context, StartMcpOutput output)`

**入参**：`id`（STRING，必选，mcp_install 表的 ID）

**处理流程**：

1. 根据 transport_type 启动连接：
   - `stdio`：child_process.exec 执行 transport_config.command + args，建立 stdio 管道；
   - `http`：建立 HTTP 长连接或 SSE 连接；
2. 记录 PID（stdio）或连接状态（http）；
3. 将 `connected` 置为 true；

**返回**：Boolean

#### 3.2.3. 停止 MCP（stopMcp）

**功能**：停止指定的 MCP 工具

**方法签名**：`Boolean stopMcp(StopMcpInput input, McpContext context, StopMcpOutput output)`

**入参**：`id`（STRING，必选）

#### 3.2.4. 卸载 MCP（uninstallMcp）

**功能**：卸载指定的 MCP 工具

**方法签名**：`Boolean uninstallMcp(UninstallMcpInput input, McpContext context, UninstallMcpOutput output)`

**入参**：`id`（STRING，必选）

**处理流程**：

1. 若处于运行状态，先执行 stopMcp；
2. 根据 install_type 执行卸载（npm uninstall 或清理 HTTP 配置）；
3. 从 mcp_install 表删除记录；

#### 3.2.5. 搜索已安装 MCP（soMcp）

**功能**：搜索已安装的 MCP，支持关键词、条件过滤、排序、分页

**方法签名**：`Boolean soMcp(SoMcpInput input, McpContext context, SoMcpOutput output)`

#### 3.2.6. 获取已安装 MCP 详情（getMcp）

**功能**：获取指定已安装 MCP 的详细信息（含工具 schema、调用方法、解析方法）

**方法签名**：`Boolean getMcp(GetMcpInput input, McpContext context, GetMcpOutput output)`

**返回信息**：

- 基本信息：名称、描述、版本、安装时间
- 工具 Schema：输入参数 JSON Schema（定义调用格式）
- 输出 Schema：返回值 JSON Schema（定义如何解析结果）
- 调用示例：如何构造请求（HTTP: method/url/headers/body；stdio: JSON-RPC 方法名+参数）
- 解析方式：如何从响应中提取结果（JSON path 或 content 字段）

### 3.3. MCP 调用

#### 3.3.1. 调用 MCP（execMcp）

**功能**：调用指定的 MCP 工具

**方法签名**：`Boolean execMcp(ExecMcpInput input, McpContext context, ExecMcpOutput output)`

**入参**：`id`（STRING，必选）、`tool_name`（STRING，可选，当 MCP 提供多工具时指定）、`params`（JSON，必选，按工具 schema 传入）

**处理流程**：

1. 根据 ID 获取安装信息和工具 schema；
2. 校验 params 与工具 schema 匹配；
3. 根据 transport_type 调用：
   - `stdio`：通过 JSON-RPC `tools/call` 方法发送参数，stdout 读取结果；
   - `http`：POST 请求到 endpoint，解析 JSON 响应；
4. 成功后更新 mcp_usage 表当天计数 +1；
5. 输出结果包含：原始响应 + 按 output_schema 解析后的结构化结果；

**返回**：Boolean，调用结果（原始 + 结构化）通过 output 参数返回

### 3.4. 可视化与运维

#### 3.4.1. 启用/禁用 MCP 组件（enableMCP）

功能同前，控制整个 MCP 组件的可用状态。

#### 3.4.2. MCP 使用统计（getMcpUsage）

**功能**：获取 MCP 调用统计数据

**方法签名**：`Boolean getMcpUsage(GetMcpUsageInput input, McpContext context, GetMcpUsageOutput output)`

**入参**：`mcp_install_id`（STRING，可选，不传返回所有）、`start_date`（STRING，可选）、`end_date`（STRING，可选）

**返回**：各 MCP 的日调用次数统计列表

## 4. 表设计

> 所有 MCP 数据表均存储在关系数据库（SQLite）中，逻辑库名为 `mcp`。所有数据表均包含 `id`、`created`、`updated` 三个标准系统字段，由 Provider 维护。

### 4.1. MCP 市场表（SQLite）

- `表名`： mcp_market
- `库名`： mcp
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | |
| updated | 最后更新时间 | INT64 | N | 普通索引 | |
| market_key | 市场唯一标识 | STRING | N | 唯一索引 | aliyun_bailian / modelscope / smithery / github |
| market_name | 市场名称 | STRING | N | 普通索引 | 阿里云百炼 / ModelScope / Smithery / GitHub |
| market_url | 市场 API 地址 | STRING | N | | |
| market_brief | 市场描述 | STRING | Y | | |
| auth_type | 认证类型 | STRING | N | | api_key / oauth / env_var |
| auth_config | 认证配置 | JSON | Y | | 如 `{"api_key_field":"DASHSCOPE_API_KEY","env_var":"DASHSCOPE_API_KEY"}` |
| enable | 是否启用 | BOOLEAN | N | | 默认 true |

**默认数据（init 时自动创建）**：

| market_key | market_name | market_url | auth_type | auth_config |
|-----------|------------|-----------|-----------|-------------|
| `aliyun_bailian` | 阿里云百炼 | https://dashscope.aliyuncs.com | api_key | `{"api_key_field":"DASHSCOPE_API_KEY"}` |
| `modelscope` | ModelScope | https://modelscope.cn | api_key | `{"api_key_field":"MODELSCOPE_API_KEY"}` |
| `smithery` | Smithery | https://smithery.ai/api | api_key | `{"api_key_field":"SMITHERY_API_KEY"}` |
| `github` | GitHub | https://registry.npmjs.org | env_var | `{"env_vars":["GITHUB_TOKEN"]}` |

### 4.2. MCP 工具缓存表（SQLite）

- `表名`： mcp_tool
- `库名`： mcp
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | |
| updated | 最后更新时间 | INT64 | N | 普通索引 | |
| market_id | 所属市场 ID | STRING | N | 普通索引 | 关联 mcp_market.id |
| tool_name | 工具唯一标识 | STRING | N | 普通索引 | 如 @modelcontextprotocol/server-github |
| tool_title | 工具标题 | STRING | N | 普通索引 | |
| tool_brief | 工具描述 | STRING | N | | |
| tool_schema | 输入参数 JSON Schema | JSON | Y | | 定义如何调用 |
| tool_output_schema | 输出 JSON Schema | JSON | Y | | 定义如何解析结果 |
| install_type | 安装方式 | STRING | N | | npm / http / custom |
| install_config | 安装配置 | JSON | N | | npm: `{package:"xxx"}` / http: `{endpoint:"xxx"}` |
| version | 版本 | STRING | Y | | |

> 唯一约束：`(market_id, tool_name)`

### 4.3. MCP 安装表（SQLite）

- `表名`： mcp_install
- `库名`： mcp
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | |
| updated | 最后更新时间 | INT64 | N | 普通索引 | |
| market_id | 来源市场 ID | STRING | N | 普通索引 | 关联 mcp_market.id |
| tool_id | 工具 ID | STRING | N | 普通索引 | 关联 mcp_tool.id |
| install_status | 安装状态 | STRING | N | | installing / installed / error |
| transport_type | 通信方式 | STRING | N | | stdio / http |
| transport_config | 通信配置 | JSON | N | | stdio: `{command, args}` / http: `{url, headers}` |
| error_message | 错误信息 | STRING | Y | | 安装失败时记录 |
| connected | 连接状态 | BOOLEAN | N | | 默认 false |
| enable | 是否启用 | BOOLEAN | N | | 默认 true |

> 唯一约束：`(market_id, tool_id)` — 同一工具不可重复安装

### 4.4. MCP 使用统计表（SQLite）

- `表名`： mcp_usage
- `库名`： mcp
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | |
| updated | 最后更新时间 | INT64 | N | 普通索引 | |
| mcp_install_id | 已安装 MCP ID | STRING | N | 普通索引 | 关联 mcp_install.id |
| usage_date | 使用日期 | STRING | N | 普通索引 | YYYY-MM-DD |
| usage_count | 当日次数 | INT | N | | 默认 0 |

> 唯一约束：`(mcp_install_id, usage_date)`

### 4.5. MCPProvider 配置表（关系数据库）

- `表名`： mcp_config
- `库名`： mcp
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| config_key | 配置键 | STRING | N | 主键 | |
| config_value | 配置值 | STRING | N | | |
| value_type | 值类型 | STRING | N | | INT / DOUBLE / BOOLEAN / STRING |
| description | 说明 | STRING | Y | | |
| updated | 最后更新时间 | INT64 | N | 普通索引 | |

默认配置项：

| config_key | config_value | value_type | description |
| ------ | ----- | ----- | ----- |
| enabled | true | BOOLEAN | MCP 组件是否启用 |
| cache_ttl | 86400 | INT | MCP 列表缓存有效期（秒，默认 1 天） |
| aliyun_bailian_api_key | — | STRING | 阿里云百炼 API Key（用户配置） |
| modelscope_api_key | — | STRING | ModelScope API Key（用户配置） |
| smithery_api_key | — | STRING | Smithery API Key（用户配置） |
| github_token | — | STRING | GitHub Personal Access Token（用户配置） |
| npm_registry | https://registry.npmjs.org | STRING | npm registry 地址 |

## 5. 重要内容

1. MCPProvider 是 MCP 的唯一操作入口，上层不可直接调用 MCP；
2. 四个 MCP 市场为系统内置，初始化时自动创建，不可新增/删除，仅可启用/禁用；
3. 从市场刷新工具列表时使用各市场对应的 API 搜索，结果缓存到 `mcp_tool` 表；
4. 安装 MCP 时根据 `install_type` 使用不同策略：npm 通过 `npm install` + stdio transport，http 通过 REST 连接；
5. 调用 MCP 时根据 `transport_type` 使用 MCP SDK 或直接 HTTP 调用，调用前校验参数与 tool_schema；
6. 返回结果包含原始响应和按 tool_output_schema 解析后的结构化数据；
7. 所有写操作推荐使用 `transactionDB` 保证原子性；
8. 所有配置项统一存储于 `mcp_config` 表，运行时按需读取；
9. 所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；
10. 市场 API Key 从 mcp_config 表读取，由用户在运行时配置；
