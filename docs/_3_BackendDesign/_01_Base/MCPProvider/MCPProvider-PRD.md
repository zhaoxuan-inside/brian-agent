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
3. 管理四个内置 MCP 市场（阿里云百炼、ModelScope、Smithery、GitHub），市场数据存于 SQLite，通过接口 CRUD，支持启用/禁用；
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
| transport_type | ENUM | Y | 通信方式：stdio / streamable-http / http-sse / rest |
| transport_config | JSON | Y | 通信配置（stdio: { command, args } / http: { url, headers } / rest: { url, method, headers, auth_token }） |
| connected | BOOLEAN | N | 是否已连接 |
| enable | BOOLEAN | N | 是否启用，默认 true |

## 3. 功能设计

### 3.1. MCP 市场管理（内置市场，存于 SQLite，支持接口 CRUD）

四个内置市场（阿里云百炼、ModelScope、Smithery、GitHub）数据保存在 SQLite `mcp_provider` 表中。系统不再在启动时通过硬编码种子常量自动写入市场数据，市场数据通过接口进行增删改查：

- `addMcpProvider`（新增市场，`id` 为 UUID，`provider_code` 为语义编码）
- `updateMcpProvider`（更新市场，如修改 url/title/brief/enable）
- `delMcpProvider`（删除市场，级联清理 `mcp_cache` / `mcp_install`）
- `soMcpProvider`（查询市场）
- `testMcpProvider`（测试连通性）

对应 HTTP 路由：`POST /api/config/mcp/provider`、`PUT /api/config/mcp/provider/:id`、`DELETE /api/config/mcp/provider/:id`、`GET /api/config/mcp/market`（前端一次拉取全部市场）。

> 注：原 PRD 中「四个市场不可新增/删除」已调整为「支持接口 CRUD」；市场数据由 SQLite 作为唯一数据源。

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
2. 校验不能重复安装：按 `mcp_provider_id + mcp_title` 查 `mcp_install` 表，已存在则抛 ValidationError（HTTP 409）；
3. 根据 install_type 执行安装：
   - `npm`：执行 `npm install -g {package_name}`，生成 stdio transport 配置（command: npx, args: [package_name]）；
   - `http`：验证 HTTP endpoint 可达性，生成 http transport 配置；
4. 安装成功后写入 `mcp_install` 表，`status = 'stopped'`（默认不启动，由用户手动启动），保存版本号；
5. 安装完成后触发安装状态同步（`syncInstallStatus`），通过 `npm list -g` 校验 npm 包是否真实安装成功并同步版本号；

> 注：npm 安装超时 120s；安装后默认不启动，需用户手动调用 `startMcp`。

**返回**：Boolean，安装的 MCP ID 通过 output 参数返回

#### 3.2.0. 安装状态同步（syncInstallStatus）

**功能**：通过 `npm list -g` 命令同步 `mcp_install` 表的安装状态，清理全局已卸载的 npm 记录。

**方法签名**：`async syncInstallStatus(): Promise<number>`（返回移除的记录数）

**处理流程**：

1. 执行 `npm list -g --depth=0 --json` 获取全局已安装的 npm 包名及版本集合；
2. 遍历 `mcp_install` 表中 `mcp_install_cmd` 以 `npm install` / `npm i` 开头**且为全局安装（含 `-g`/`--global`）**的记录；
3. 用 `extractPackageName` 提取包名：
   - 若全局已不再存在该包，则删除该记录；
   - 若仍存在，则同步更新其 `version` 字段；

**触发时机（由后端自动执行，前端不直接触发）**：

- 系统启动时（`buildContext` 中调用一次）
- 每 5 分钟定时（`setInterval`）
- 每次安装完成后（`installMcp` 内 + `/api/config/mcp/install` 的 github 分支）

> 注：市场工具列表接口只从 `mcp_install` 表读取安装状态（`installed`），不再每次请求执行 npm 命令，保证检查效率。

#### 3.2.2. 启动 MCP（startMcp）

**功能**：启动指定的 MCP 工具

**方法签名**：`Boolean startMcp(StartMcpInput input, McpContext context, StartMcpOutput output)`

**入参**：`id`（STRING，必选，mcp_install 表的 ID）

**处理流程**：

1. 终止该 MCP 已有的托管进程（若存在）；
2. 仅 `stdio` 传输启动本地进程：`spawn(command, args, { stdio: ['pipe','pipe','pipe'] })`（无 shell，保证 stdout 为纯净 JSON-RPC 流），存入内存 `runningMcps` Map，并异步执行 MCP `initialize` 握手；`http`/`rest` 为远程服务，无需本地进程；
3. 将 `mcp_install.status` 置为 `running`；

**返回**：Boolean

#### 3.2.3. 停止 MCP（stopMcp）

**功能**：停止指定的 MCP 工具

**方法签名**：`Boolean stopMcp(StopMcpInput input, McpContext context, StopMcpOutput output)`

**入参**：`id`（STRING，必选）

**处理流程**：

1. 按进程组 `process.kill(-pid)` 终止托管进程（并执行 `mcp_stop_cmd` 兜底）；
2. 从 `runningMcps` 移除；
3. 将 `mcp_install.status` 置为 `stopped`；

#### 3.2.4. 卸载 MCP（uninstallMcp）

**功能**：卸载指定的 MCP 工具

**方法签名**：`Boolean uninstallMcp(UninstallMcpInput input, McpContext context, UninstallMcpOutput output)`

**入参**：`id`（STRING，必选）

**处理流程**：

1. 若处于运行状态，先终止托管进程；
2. 根据 install_type 执行卸载（npm uninstall 或清理 HTTP 配置）；
3. 从 mcp_install 表删除记录；

#### 3.2.5. 升级 MCP（upgradeMcp）

**功能**：将已安装的 MCP 更新到最新版本（仅 npm 安装支持）

**方法签名**：`Boolean upgradeMcp(UpgradeMcpInput input, McpContext context, UpgradeMcpOutput output)`

**处理流程**：

1. 重新执行 `mcp_install_cmd`（`npm install -g`）；
2. 调用 `syncInstallStatus()` 同步最新版本号；
3. output 返回更新后的 `version`；

#### 3.2.6. 批量启动 MCP（startMcps）

**功能**：批量启动多个 MCP

**方法签名**：`Boolean startMcps(StartMcpsInput input, McpContext context, StartMcpsOutput output)`

**入参**：`ids`（STRING[]，必选）；output 返回 `started_count`

#### 3.2.7. 刷新 MCP 状态（refreshMcpStatus）

**功能**：刷新本机所有已安装 MCP 的安装状态与运行状态

**方法签名**：`Boolean refreshMcpStatus(RefreshMcpStatusInput input, McpContext context, RefreshMcpStatusOutput output)`

**处理流程**：

1. `syncInstallStatus()` 同步 npm 安装状态与版本；
2. 遍历 `runningMcps`，用 `process.kill(pid, 0)` 检测进程存活，已退出则重置 `status = 'stopped'`；
3. output 返回 `removed` / `running` / `stopped` / `total` 统计；

#### 3.2.8. 停止所有 MCP（stopAllMcp）

**功能**：后端关闭时停止所有运行中的 MCP，并将状态重置为 `stopped`（含崩溃遗留）

**方法签名**：`async stopAllMcp(): Promise<number>`（返回停止数量）

**触发时机**：后端优雅关闭（SIGINT/SIGTERM）时调用；启动时也调用一次以重置崩溃遗留的 `running` 状态。

#### 3.2.9. 搜索已安装 MCP（soMcp）

**功能**：搜索已安装的 MCP，支持关键词、条件过滤、排序、分页

**方法签名**：`Boolean soMcp(SoMcpInput input, McpContext context, SoMcpOutput output)`

> 说明：`soMcp` 返回的 `status` 字段为**实时进程状态**（通过 `runningMcps` Map + PID 探测判断进程是否真实存活），而非直接返回数据库 `status` 字段；数据库 `status` 仅作持久化兜底，进程崩溃后即使 DB 残留 `running` 也会被实时覆盖为 `stopped`。

#### 3.2.10. 获取已安装 MCP 详情（getMcp）

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
2. **校验调用前提：`enable=1`**；对 stdio 传输额外校验**实时运行状态为 running（进程真实存活）**，任一不满足即抛错（「已禁用，无法调用」/「未启动，请先启动后再调用」）；
3. 校验 params 与工具 schema 匹配；
4. 根据 `transport_type` 选择调用方式（四种传输方式均支持）：
   - `stdio`：通过本地进程 stdin/stdout 发送 JSON-RPC 2.0 `tools/call`（换行分隔 JSON），从 stdout 读取响应；
   - `streamable-http`：POST JSON-RPC 2.0 `tools/call` 到单个 HTTP 端点（`Accept: application/json, text/event-stream`），响应为 JSON 或 SSE 流；
   - `http-sse`：旧版 HTTP 传输，POST JSON-RPC 2.0 + SSE 响应（与 streamable-http 共用解析逻辑）；
   - `rest`：平台托管的原生 REST API，POST 到 endpoint 携带认证 token，解析 JSON 响应；
5. 成功后更新 mcp_usage 表当天计数 +1；
6. 输出结果包含：原始响应 + 按 output_schema 解析后的结构化结果；

**返回**：Boolean，调用结果（原始 + 结构化）通过 output 参数返回

### 3.4. 可视化与运维

#### 3.4.1. 启用/禁用 MCP 组件（enableMCP）

功能同前，控制整个 MCP 组件的可用状态。

#### 3.4.2. MCP 使用统计（getMcpUsage）

**功能**：获取 MCP 调用统计数据

**方法签名**：`Boolean getMcpUsage(GetMcpUsageInput input, McpContext context, GetMcpUsageOutput output)`

**入参**：`mcp_install_id`（STRING，可选，不传返回所有）、`start_date`（STRING，可选，YYYY-MM-DD）、`end_date`（STRING，可选，YYYY-MM-DD）

**处理流程**：

1. 按 `mcp_install_id` + 日期范围（`usage_date >= start_date`、`usage_date <= end_date`）查询 `mcp_usage` 表；
2. 关联 `mcp_install` 表获取 `mcp_title`；
3. 按 `usage_date` 倒序返回，并汇总 `total`（总调用次数）。

**返回**：`list`（各 MCP 的日调用次数记录：`mcp_install_id / mcp_title / usage_date / usage_count`）+ `total`（总调用次数）

> 注：`execMcp` 仅在调用**成功**时通过 `upsertUsage` 累计调用次数（失败调用不计数）。

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

**内置市场数据（存于 SQLite，不再由代码硬编码种子写入）**：

> 内置 MCP 市场数据直接保存在 SQLite 表 `mcp_provider` 中，通过接口进行增删改（不再在启动时由代码硬编码的种子常量 `MCP_DEFAULT_PROVIDERS` 自动写入）。每个市场的 `id` 为 UUID，`provider_code` 为语义编码（aliyun_bailian / modelscope / smithery / github）。

| provider_code | mcp_provider_title | mcp_provider_url | 说明 |
|-----------|------------|-----------|-------------|
| `aliyun_bailian` | 阿里云百炼 | https://bailian.aliyun.com | 阿里云百炼官网 |
| `modelscope` | ModelScope | https://modelscope.cn | 魔搭社区 |
| `smithery` | Smithery | https://smithery.ai | Smithery 官网 |
| `github` | GitHub | https://registry.npmjs.org | npm registry |

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

> **注（实际实现字段）**：当前实现 `mcp_install` 表实际字段为：`id / created / updated / mcp_provider_id / mcp_title / mcp_brief / mcp_install_cmd / mcp_start_cmd / mcp_stop_cmd / mcp_uninstall_cmd / version / status / enable`。其中：
> - `version`：已安装版本号（TEXT，由 `syncInstallStatus` 通过 `npm list -g` 同步）；
> - `status`：运行状态（TEXT，`running` / `stopped`，默认 `stopped`），由 `startMcp` / `stopMcp` 更新；
> - 唯一约束：`(mcp_provider_id, mcp_title)` — 同一工具不可重复安装。

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

> 注：配置默认值不再由代码硬编码常量（`MCP_DEFAULT_CONFIGS`）+ `initDefaults` 启动时自动写入，改由 SQLite 直接保存、运行时按需读取（读取时带默认回退值）。

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
2. 四个 MCP 市场数据存于 SQLite，通过接口 CRUD，支持启用/禁用；不再由代码硬编码种子自动写入；
3. 从市场刷新工具列表时使用各市场对应的 API 搜索，结果缓存到 `mcp_tool` 表；
4. 安装 MCP 时根据 `install_type` 使用不同策略：npm 通过 `npm install` + stdio transport，http 通过 REST 连接；
5. 调用 MCP 时根据 `transport_type` 使用 MCP SDK 或直接 HTTP 调用，调用前校验参数与 tool_schema；
6. 返回结果包含原始响应和按 tool_output_schema 解析后的结构化数据；
7. 所有写操作推荐使用 `transactionDB` 保证原子性；
8. 所有配置项统一存储于 `mcp_config` 表，运行时按需读取；
9. 所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；
10. 市场 API Key 从 mcp_config 表读取，由用户在运行时配置；

## 6. 变更记录

### [2026-08-15] MCP 市场数据由硬编码种子改为 SQLite + 接口 CRUD

**变更原因**：内置 MCP 市场数据原先硬编码于代码（`MCP_DEFAULT_PROVIDERS`），每次启动时由 `seedDefaultProviders()` 写入 SQLite，修改数据需改代码并重启；且前端存在硬编码兜底数据，数据源不唯一。

**修改的方法**：
- `MCPService.seedDefaultProviders()` — 原始代码：启动时按 `MCP_DEFAULT_PROVIDERS` 清理 + upsert 写入内置市场；改为：删除该方法，市场数据不再由代码写入。
- `MCPAccess.initialize()` — 原始代码：调用 `seedDefaultProviders()`；改为：删除该方法。
- `addMcpProvider` / `updateMcpProvider` / `delMcpProvider` — 已在 Service 层存在，本次新增对应 HTTP 路由 `POST/PUT/DELETE /api/config/mcp/provider[/:id]`，使数据可通过接口修改。
- `mcp_provider` 表新增 `provider_code` 字段（语义编码：github / smithery / aliyun_bailian / modelscope），`id` 为 UUID；`/api/config/mcp/market` 返回 `provider_code`。
- 移除配置默认值常量 `MCP_DEFAULT_CONFIGS` 及 `MCP_DEFAULT_PROVIDERS`。

**影响的端点**：
- `GET /api/config/mcp/market` — 从 SQLite 读取，返回 `id`（UUID）+ `provider_code` + 标题/URL/描述/enable。
- `POST /api/config/mcp/provider` — 新增市场。
- `PUT /api/config/mcp/provider/:id` — 更新市场（url/title/brief/enable）。
- `DELETE /api/config/mcp/provider/:id` — 删除市场（级联清理 cache/install）。
- 前端 `/api/config/mcp/market` 一次拉取全部市场，不再有硬编码兜底数据。

**市场 URL 修正**：`aliyun_bailian` → `https://bailian.aliyun.com`，`smithery` → `https://smithery.ai`（原 `dashscope.aliyuncs.com`、`api.smithery.ai` 为 API 网关，根路径 404，改为可正常访问的官网）。

**可能存在的问题**：
- 全新安装（空库）不再自动生成内置市场数据，需通过接口手动创建或由部署流程预置数据。
- 原 PRD 中 `mcp_market` 表设计（market_key/market_name/auth_type 等）与实现中的 `mcp_provider` 表（provider_code/mcp_provider_title 等）存在差异，本 PRD 仅同步了本次变更，未整体重写表结构定义。

### [2026-08-15] MCP 安装状态改为 npm list -g 同步 mcp_install 表

**变更原因**：安装状态原先仅按 `mcp_install` 表记录名称匹配，与真实 npm 安装状态可能不一致（如用户手动 `npm uninstall -g` 后记录仍残留）；且最初实现在每次市场列表请求时执行 `npm list -g`，效率低。

**修改的方法**：
- `MCPService.syncInstallStatus()` — 新增：执行 `npm list -g --depth=0 --json`，遍历 `mcp_install` 中 `mcp_install_cmd` 以 `npm install`/`npm i` 开头的记录，用 `extractPackageName` 提取包名，全局已不存在则删除记录，返回移除数。
- `MCPAccess.syncInstallStatus()` — 新增：暴露同步方法。
- `installMcp`（Service）与 `/api/config/mcp/install` 的 github 分支 — 安装完成后调用 `syncInstallStatus()` 校验真实安装状态。
- `dev-server.ts` — 启动时同步一次 + `setInterval` 每 5 分钟定时同步；市场列表路由恢复为从 `mcp_install` 表读取 `installed`（不再每次请求跑 npm）。
- 前端 — 移除「检查」按钮（同步由后端自动完成，前端不直接触发）；MCP 市场工具卡片尺寸与市场卡片统一（`grid` + `aspect-[3/2]`）。

**影响的端点**：
- `GET /api/mcp` — 返回 `mcp_install` 表中同步后的已安装列表。
- `POST /api/config/mcp/provider/{id}/list` — `installed` 字段来自同步后的 `mcp_install` 表。
- `POST /api/config/mcp/install`（github）— 安装后触发同步。

**可能存在的问题**：
- `smithery` 为 HTTP 连接型安装（`mcp_install_cmd = 'smithery connect'`），不参与 npm 同步，其「已安装」仍按 `mcp_install` 表记录判断。
- 周期性同步每 5 分钟执行一次 `npm list -g`，若全局包数量巨大可能有一定开销（当前超时 20s，失败自动忽略）。

### [2026-08-15] MCP 实例管理增强：去重/版本/更新/运行状态/优雅关闭/批量操作

**变更原因**：MCP 实例管理能力不完整——缺少重复安装校验、版本号记录、更新能力、运行状态持久化；`startMcp` 用 `execSync` 阻塞启动导致进程无法真正后台运行；后端关闭时未停止运行中的 MCP；前端缺少批量操作与状态刷新。

**修改的方法**：
- `mcp_install` 表新增 `version`、`status` 字段（SchemaInitializer CREATE TABLE + ALTER TABLE 迁移）。
- `installMcp` — 新增按 `mcp_provider_id + mcp_title` 去重校验（重复抛 ValidationError / HTTP 409）；插入 `status='stopped'`、保存版本号。
- `syncInstallStatus` — 增强：仅校验全局安装（含 `-g`/`--global`），同步更新 `version`。
- `startMcp` — 由 `execSync` 改为 `spawn`（`detached:true, stdio:'ignore'`）后台启动并托管进程（`runningMcps: Map<id, ChildProcess>`），置 `status='running'`。
- `stopMcp` / `uninstallMcp` — 终止托管进程（`process.kill(-pid)` + `mcp_stop_cmd` 兜底），置 `status='stopped'`。
- 新增 `upgradeMcp`（更新到最新版并同步版本）、`startMcps`（批量启动）、`refreshMcpStatus`（刷新安装+运行状态）、`stopAllMcp`（后端关闭时全部停止并重置状态）。
- `dev-server` 优雅关闭（SIGINT/SIGTERM）调用 `stopAllMcp()`；启动时也调用一次重置崩溃遗留 `running` 状态。
- 新增路由：`POST /api/mcp/batch-start`、`POST /api/mcp/refresh`；`/api/mcp` 返回 `version`/`status`/`running`。
- 前端 MCP 实例页：卡片复选框、批量启动按钮、刷新按钮；展示真实版本号与运行/停止状态（启动/停止按钮合并为条件切换）。

**影响的端点**：
- `POST /api/config/mcp/install` — 去重校验（409）。
- `POST /api/mcp/{id}/start|stop|upgrade`、`POST /api/mcp/batch-start`、`POST /api/mcp/refresh` — 实例生命周期与批量操作。
- `GET /api/mcp` — 返回 `version`/`status`/`running`/`enabled`。

**可能存在的问题**：
- `spawn` + `detached` 启动的进程为进程组 leader，靠 `process.kill(-pid)` 杀组；`npx` 内部再起的子进程在极端情况下可能残留（已加 `mcp_stop_cmd` 的 `pkill -f` 兜底）。
- `stopAllMcp` 依赖内存 `runningMcps` Map，后端崩溃（SIGKILL）无法执行，故启动时额外重置 `running` 记录兜底。

### [2026-08-15] MCP 调用统计实现 + execMcp 失败不计数

**变更原因**：「调用统计」页面原先只展示安装/启用数量，缺少真实的调用次数统计；`getMcpUsage` 在 PRD 中已定义但未实现；`execMcp` 调用失败也会累计调用次数。

**修改的方法**：
- 新增 `GetMcpUsageInput/Output`、`McpUsageRecord` 类型。
- 新增 `MCPService.getMcpUsage()`：按 `mcp_install_id` + 日期范围查询 `mcp_usage`，关联 `mcp_install` 取 `mcp_title`，返回 `list` + `total`。
- `MCPService.execMcp()` — 原始代码：无论调用成功或失败都执行 `upsertUsage` 计数；改为：仅调用成功（`success` 标志）时计数。
- 新增 HTTP 路由 `GET /api/mcp/usage`（支持 `mcp_install_id` / `start_date` / `end_date` 查询参数）。
- 前端：新增 `mcpApi.usage()` 与 `McpUsageRecord` 类型；「调用统计」页新增「总调用次数」「今日调用次数」卡片与「MCP 调用统计」列表（按 MCP 聚合）。

**影响的端点**：
- `GET /api/mcp/usage` — 返回各 MCP 日调用次数 + 总量。
- `execMcp`（调用 MCP）— 仅成功调用累计 `mcp_usage`。

**可能存在的问题**：
- 调用统计依赖 `mcp_usage` 表按天累计，历史数据需真实调用 `execMcp` 才能产生；当前无调用记录时展示为空属正常。

### [2026-09-22] MCPSchemaInitializer DDL 收敛为数据驱动表

**变更原因**：`init` 以 DDL 字符串堆砌达 156 行，超出方法长度约束（10–30 行）；按 DDDStandards §2「纯声明式内容允许通过数据驱动表收敛长度」执行重构。

**修改的方法**：
  - `MCPSchemaInitializer.init` — 33 条 DDL（5 CREATE TABLE + 23 CREATE INDEX + 5 幂等容忍 ALTER）逐字提取到类内私有数据表 `ddlStatements`（`string | { sql, ignoreReason }`）；`init` 仅循环执行，普通语句失败即抛出，带 `ignoreReason` 的迁移语句保持原 try/catch 幂等容忍语义，执行顺序不变。

**影响的端点**：无（逻辑零变更：SQL 序列经转译执行比对逐字一致；`MCPAccess.initialize` 行为不变）。

**可能存在的问题**：
  - 无。新增迁移列时按表内既有格式追加即可。
