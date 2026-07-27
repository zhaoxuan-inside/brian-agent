# MCP Provider

## 1. 设计目标

1. 解耦 MCP 和系统，通过 Repository 设计模式为上层提供统一的 MCP 操作接口；
2. 所有对 MCP 的操作都不能直接进行，都必须要通过 MCPProvider；
3. 管理 MCP 提供商（新增、删除、更新、查询、测试连接、列表获取）；
4. 管理 MCP（安装、启动、停止、卸载、更新、查询）；
5. 接管 MCP 调用请求；
6. 提供可视化数据接口，支持 MCP 健康状态监控；
7. MCPProvider 用到的所有配置项（含 MCP 组件启用 / 禁用状态）统一存储于关系数据库配置表 mcp_config；

## 2. 对象定义

> 以下对象贯穿各功能接口，统一定义如下。
> Input、Context、Output 为项目通用基类，参见 `_00_DevStandardization.md`。
> Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不再重复定义。

### 2.1. MCP 上下文（McpContext）

继承 Context 基类，MCP 相关操作的执行上下文。

### 2.2. MCP 提供商数据对象（McpProviderData）

用于新增 MCP 提供商；更新时使用 `Partial<McpProviderData>` 仅传入待更新字段。`id`、`created`、`updated` 为系统字段，由 Provider 维护，不通过 Data 对象传入。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| mcp_provider_url | STRING | Y | MCP 提供商地址 |
| mcp_provider_title | STRING | Y | MCP 提供商名称 |
| mcp_provider_brief | STRING | N | MCP 提供商摘要 |
| enable | BOOLEAN | N | 是否启用，默认 true |

### 2.3. MCP 数据对象（McpData）

用于安装 MCP；更新时使用 `Partial<McpData>` 仅传入待更新字段。`id`、`created`、`updated` 为系统字段，由 Provider 维护，不通过 Data 对象传入。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| mcp_provider_id | STRING | Y | MCP 提供商 ID，关联 mcp_provider.id |
| mcp_title | STRING | Y | MCP 名称 |
| mcp_brief | STRING | N | MCP 摘要 |
| mcp_install_cmd | STRING | N | MCP 安装命令 |
| mcp_start_cmd | STRING | N | MCP 启动命令 |
| mcp_stop_cmd | STRING | N | MCP 停止命令 |
| mcp_uninstall_cmd | STRING | N | MCP 卸载命令 |
| enable | BOOLEAN | N | 是否启用，默认 true |

## 3. 功能设计

### 3.1. MCP 提供商管理

#### 3.1.1. 新增 MCP 提供商（addMcpProvider）

**功能**：向系统中新增一个 MCP 提供商

**方法签名**：`Boolean addMcpProvider(AddMcpProviderInput input, McpContext context, AddMcpProviderOutput output)`

**入参（AddMcpProviderInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | McpProviderData | Y | MCP 提供商数据 |

**处理流程**：

1. 通过 RelationDBProvider 向 `mcp_provider` 表新增一条 MCP 提供商记录，写入 `mcp_provider_url`、`mcp_provider_title`、`mcp_provider_brief`、`enable`（未指定时默认 true），并初始化系统字段 `created`、`updated` 为当前时间戳；
2. MCP 提供商 ID 通过 output 参数返回；

**返回**：Boolean，表示新增是否完成；MCP 提供商 ID 通过 output 参数返回

#### 3.1.2. 删除 MCP 提供商（delMcpProvider）

**功能**：删除指定的 MCP 提供商，支持按 ID 批量删除或按条件删除

**方法签名**：`Boolean delMcpProvider(DelMcpProviderInput input, McpContext context, DelMcpProviderOutput output)`

**入参（DelMcpProviderInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| ids | STRING[] | N | 按 ID 删除（支持批量） |
| conditions | Condition[] | N | 按条件删除 |

> ids 与 conditions 至少传一个

**处理流程**：

1. 根据 ids 或 conditions，通过 RelationDBProvider 从 `mcp_provider` 表中删除记录；
2. 级联清理该提供商下关联的 MCP 缓存（`mcp_cache`）和安装记录（`mcp_install`）；
3. 影响行数通过 output 参数返回；

**返回**：Boolean，表示删除是否完成；影响行数通过 output 参数返回

#### 3.1.3. 更新 MCP 提供商（updateMcpProvider）

**功能**：更新指定的 MCP 提供商

**方法签名**：`Boolean updateMcpProvider(UpdateMcpProviderInput input, McpContext context, UpdateMcpProviderOutput output)`

**入参（UpdateMcpProviderInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | MCP 提供商 ID |
| data | Partial\<McpProviderData\> | Y | 待更新的字段（`mcp_provider_url`、`mcp_provider_title`、`mcp_provider_brief`、`enable`，系统字段不可更新） |

**处理流程**：

1. 通过 RelationDBProvider 更新 `mcp_provider` 表中指定记录的属性；
2. 更新记录的 `updated` 为当前时间戳；

> 注：资源级启用 / 禁用 MCP 提供商通过 updateMcpProvider 修改 `enable` 字段实现。

**返回**：Boolean，表示更新是否完成

#### 3.1.4. 搜索 MCP 提供商（soMcpProvider）

**功能**：搜索 MCP 提供商，支持关键词、条件过滤、排序、分页

**方法签名**：`Boolean soMcpProvider(SoMcpProviderInput input, McpContext context, SoMcpProviderOutput output)`

**入参（SoMcpProviderInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| keyword | STRING | N | 关键词搜索（匹配 mcp_provider_title） |
| conditions | Condition[] | N | 条件过滤 |
| order_by | OrderBy[] | N | 排序规则 |
| page | Page | N | 分页参数 |

**处理流程**：

1. 根据 keyword、conditions 构造查询，通过 RelationDBProvider 查询 `mcp_provider` 表；
2. 按 order_by 排序，按 page 分页返回结果；

**返回**：Boolean，表示查询是否完成；MCP 提供商列表及总数通过 output 参数返回

#### 3.1.5. 测试 MCP 提供商连接（testMcpProvider）

**功能**：测试 MCP 提供商的网络连通性

**方法签名**：`Boolean testMcpProvider(TestMcpProviderInput input, McpContext context, TestMcpProviderOutput output)`

**入参（TestMcpProviderInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | MCP 提供商 ID |

**处理流程**：

1. 根据 ID 获取 MCP 提供商信息；
2. 向提供商地址发起网络连通性测试；
3. 返回连通状态和响应时间；

**返回**：Boolean，表示测试是否完成；连通状态和响应时间通过 output 参数返回

#### 3.1.6. 获取 MCP 列表（listMcp）

**功能**：获取可用的 MCP 列表，优先从本地缓存读取，缓存失效时调用提供商 API 获取并更新缓存，支持分页

**方法签名**：`Boolean listMcp(ListMcpInput input, McpContext context, ListMcpOutput output)`

**入参（ListMcpInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| mcp_provider_id | STRING | Y | MCP 提供商 ID |
| page | Page | N | 分页参数，不指定则不分页 |

> Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`。

**处理流程**：

1. 根据 ID 获取 MCP 提供商信息；
2. 从关系数据库配置表 mcp_config 读取 `cache_ttl`（默认 86400 秒，即 1 天）；
3. 通过 RelationDBProvider 查询 `mcp_cache` 表中该提供商的缓存记录，按 `updated` 降序排列；
4. 判断缓存是否有效：若缓存记录的 `updated` 距今未超过 `cache_ttl`，则缓存命中，直接跳到步骤 7；
5. 缓存未命中（无缓存记录或已过期），调用提供商 API 获取最新的 MCP 列表；
6. 将 MCP 信息通过 RelationDBProvider 写入 `mcp_cache` 表（upsert 语义），更新 `updated` 为当前时间戳；
7. 若指定了 `page` 分页参数，对结果按分页返回；否则返回全部列表；

**返回**：Boolean，表示获取是否完成；MCP 列表（及分页总数）通过 output 参数返回

### 3.2. MCP 管理

#### 3.2.1. 安装 MCP（installMcp）

**功能**：安装指定的 MCP，生成启动、关闭、卸载命令

**方法签名**：`Boolean installMcp(InstallMcpInput input, McpContext context, InstallMcpOutput output)`

**入参（InstallMcpInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| mcp_provider_id | STRING | Y | MCP 提供商 ID |
| mcp_id | STRING | Y | 要安装的 MCP ID（来自 mcp_cache） |

**处理流程**：

1. 根据 mcp_provider_id 和 mcp_id，从 `mcp_cache` 表获取 MCP 信息；
2. 通过 npm 安装指定的 MCP；
3. 生成启动、关闭、卸载命令；
4. 将安装信息通过 RelationDBProvider 写入 `mcp_install` 表，并初始化系统字段 `created`、`updated` 为当前时间戳；

> 注：只支持 npm 安装 MCP；不支持 npm 安装的 MCP 不能进行安装。

**返回**：Boolean，表示安装是否完成；安装的 MCP ID 通过 output 参数返回

#### 3.2.2. 启动 MCP（startMcp）

**功能**：启动指定的 MCP

**方法签名**：`Boolean startMcp(StartMcpInput input, McpContext context, StartMcpOutput output)`

**入参（StartMcpInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | MCP ID（mcp_install 表的 ID） |

**处理流程**：

1. 根据 ID 获取 MCP 安装信息；
2. 通过保存的 MCP 启动命令启动 MCP；

**返回**：Boolean，表示启动是否完成

#### 3.2.3. 关闭 MCP（stopMcp）

**功能**：关闭指定的 MCP

**方法签名**：`Boolean stopMcp(StopMcpInput input, McpContext context, StopMcpOutput output)`

**入参（StopMcpInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | MCP ID（mcp_install 表的 ID） |

**处理流程**：

1. 根据 ID 获取 MCP 安装信息；
2. 通过保存的 MCP 关闭命令关闭 MCP；

**返回**：Boolean，表示关闭是否完成

#### 3.2.4. 卸载 MCP（uninstallMcp）

**功能**：卸载指定的 MCP

**方法签名**：`Boolean uninstallMcp(UninstallMcpInput input, McpContext context, UninstallMcpOutput output)`

**入参（UninstallMcpInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | MCP ID（mcp_install 表的 ID） |

**处理流程**：

1. 根据 ID 获取 MCP 安装信息；
2. 通过保存的 MCP 卸载命令卸载 MCP；
3. 通过 RelationDBProvider 从 `mcp_install` 表中删除记录；

**返回**：Boolean，表示卸载是否完成

#### 3.2.5. 更新 MCP（updateMcp）

**功能**：更新指定的 MCP

**方法签名**：`Boolean updateMcp(UpdateMcpInput input, McpContext context, UpdateMcpOutput output)`

**入参（UpdateMcpInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | MCP ID（mcp_install 表的 ID） |
| data | Partial\<McpData\> | Y | 待更新的字段（`mcp_title`、`mcp_brief`、`mcp_install_cmd`、`mcp_start_cmd`、`mcp_stop_cmd`、`mcp_uninstall_cmd`、`enable`，系统字段不可更新） |

**处理流程**：

1. 通过 RelationDBProvider 更新 `mcp_install` 表中指定记录的属性；
2. 更新记录的 `updated` 为当前时间戳；

> 注：资源级启用 / 禁用 MCP 通过 updateMcp 修改 `enable` 字段实现；处于启动状态的 MCP 不能禁用。

**返回**：Boolean，表示更新是否完成

#### 3.2.6. 获取 MCP（getMcp）

**功能**：获取指定的 MCP，支持按 ID 或按条件获取第一条

**方法签名**：`Boolean getMcp(GetMcpInput input, McpContext context, GetMcpOutput output)`

**入参（GetMcpInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 按 ID 获取 |
| conditions | Condition[] | N | 按条件获取第一条 |

> id 与 conditions 至少传一个

**处理流程**：

1. 根据 id 或 conditions，通过 RelationDBProvider 查询 `mcp_install` 表；
2. 返回第一条匹配记录，若无匹配返回空；

**返回**：Boolean，表示查询是否完成；MCP 信息通过 output 参数返回

#### 3.2.7. 搜索 MCP（soMcp）

**功能**：搜索 MCP，支持关键词（名称和摘要）、条件过滤、排序、分页

**方法签名**：`Boolean soMcp(SoMcpInput input, McpContext context, SoMcpOutput output)`

**入参（SoMcpInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| keyword | STRING | N | 关键词搜索（匹配 mcp_title、mcp_brief） |
| conditions | Condition[] | N | 条件过滤 |
| order_by | OrderBy[] | N | 排序规则 |
| page | Page | N | 分页参数 |

**处理流程**：

1. 根据 keyword、conditions 构造查询，通过 RelationDBProvider 查询 `mcp_install` 表；
2. 按 order_by 排序，按 page 分页返回结果；

**返回**：Boolean，表示查询是否完成；MCP 列表及总数通过 output 参数返回

### 3.3. MCP 调用

#### 3.3.1. 调用 MCP（execMcp）

**功能**：调用指定的 MCP

**方法签名**：`Boolean execMcp(ExecMcpInput input, McpContext context, ExecMcpOutput output)`

**入参（ExecMcpInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | MCP ID（mcp_install 表的 ID） |
| params | JSON | Y | 调用参数 |

**处理流程**：

1. 根据 ID 获取 MCP 安装信息；
2. 调用指定的 MCP，传入参数；
3. 调用成功后，通过 RelationDBProvider 更新 `mcp_usage` 表当天的 usage_count + 1；

**返回**：Boolean，表示调用是否完成；调用结果通过 output 参数返回

### 3.4. 可视化与运维

#### 3.4.2. 启用/禁用（enableMCP）

**功能**：启用或禁用 MCP 组件，用于运行时控制 MCP 组件的可用状态

**方法签名**：`Boolean enableMCP(EnableMCPInput input, McpContext context, EnableMCPOutput output)`

**入参（EnableMCPInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| enable | BOOLEAN | Y | 是否启用 |

**处理流程**：

1. 根据 `enable` 参数启用或禁用 MCP 组件，并将 `enabled` 状态持久化到关系数据库配置表 mcp_config（库名 `mcp`）；
2. 禁用时关闭 MCP 相关连接，释放资源，将 mcp_config 中 `enabled` 置为 false；禁用期间所有 MCP 操作将返回失败（MCP 组件未启用）；
3. 启用时重新初始化 MCP 组件，恢复可用状态，将 mcp_config 中 `enabled` 置为 true；

**返回**：Boolean，表示操作是否完成

> 注：组件初始化时从 mcp_config 读取 `enabled` 状态以恢复上次的可用状态（如上次为禁用则保持禁用，避免状态丢失）；运行时内存中维护 `enabled` 状态供各操作快速校验，状态变更同步落库。

## 4. 表设计

> 所有 MCP 数据表（4.1 ~ 4.4）与配置表（4.5）均存储在关系数据库（SQLite）中，逻辑库名为 `mcp`；其中 mcp_config 配置表由 RelationDBProvider 管理，MCPProvider 用到的所有配置项（含 MCP 组件启用 / 禁用状态）集中存储于该表（见 4.5）。
>
> 所有数据表均包含 `id`、`created`、`updated` 三个标准系统字段，由 Provider 维护。

### 4.1. MCP 提供商表（SQLite）

- `表名`： mcp_provider
- `库名`： mcp
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| mcp_provider_url | MCP 提供商地址 | STRING | N | | |
| mcp_provider_title | MCP 提供商名称 | STRING | N | 普通索引 | |
| mcp_provider_brief | MCP 提供商摘要 | STRING | Y | | |
| enable | 是否启用 | BOOLEAN | N | | 默认 true，可通过 updateMcpProvider 修改 |

### 4.2. MCP 缓存表（SQLite）

- `表名`： mcp_cache
- `库名`： mcp
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| mcp_provider_id | MCP 提供商 ID | STRING | N | 普通索引 | 关联 mcp_provider.id |
| mcp_title | MCP 名称 | STRING | N | 普通索引 | |
| mcp_brief | MCP 摘要 | STRING | N | 普通索引 | |
| mcp_install_cmd | MCP 安装命令 | STRING | N | 普通索引 | |

### 4.3. MCP 安装表（SQLite）

- `表名`： mcp_install
- `库名`： mcp
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| mcp_provider_id | MCP 提供商 ID | STRING | N | 普通索引 | 关联 mcp_provider.id |
| mcp_title | MCP 名称 | STRING | N | 普通索引 | |
| mcp_brief | MCP 摘要 | STRING | N | 普通索引 | |
| mcp_install_cmd | MCP 安装命令 | STRING | N | 普通索引 | |
| mcp_start_cmd | MCP 启动命令 | STRING | N | 普通索引 | |
| mcp_stop_cmd | MCP 停止命令 | STRING | N | 普通索引 | |
| mcp_uninstall_cmd | MCP 卸载命令 | STRING | N | 普通索引 | |
| enable | 是否启用 | BOOLEAN | N | | 默认 true，可通过 updateMcp 修改 |

### 4.4. MCP 使用统计表（SQLite）

- `表名`： mcp_usage
- `库名`： mcp
- `表类型`： 关系表

> 以 `(mcp_install_id, usage_date)` 为业务唯一键，记录每个已安装 MCP 每天的调用次数。

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| mcp_install_id | 已安装的 MCP ID | STRING | N | 普通索引 | 关联 mcp_install.id |
| usage_date | 使用日期 | STRING | N | 普通索引 | 格式：YYYY-MM-DD |
| usage_count | 当日使用次数 | INT | N | | 默认 0 |

> 业务唯一约束：`(mcp_install_id, usage_date)`；仅当 `execMcp`（调用 MCP）成功时，当天的 usage_count 才会加 1。

### 4.5. MCPProvider 配置表（关系数据库）

- `表名`： mcp_config
- `库名`： mcp
- `存储`： 关系数据库（由 RelationDBProvider 管理）
- `表类型`： 关系表

> MCPProvider 用到的所有配置项集中存储于关系数据库（库名 `mcp`），采用键值对结构，运行时按需读取；MCP 组件启用 / 禁用状态由 enableMCP 读取并持久化，缓存有效期由 listMcp 读取，避免硬编码与状态丢失。

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| config_key | 配置键 | STRING | N | 主键 | 唯一 |
| config_value | 配置值 | STRING | N | | 按 value_type 解析 |
| value_type | 值类型 | STRING | N | | INT / DOUBLE / BOOLEAN / STRING |
| description | 说明 | STRING | Y | | |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |

默认配置项：

| config_key | config_value | value_type | description |
| ------ | ----- | ----- | ----- |
| enabled | true | BOOLEAN | MCP 组件是否启用（enableMCP 读写） |
| cache_ttl | 86400 | INT | MCP 列表缓存有效期（秒，默认 1 天） |

## 5. 重要内容

1. MCPProvider 是 MCP 的唯一操作入口，上层不可直接调用 MCP；
2. MCPProvider 通过 Repository 接口封装底层 MCP 操作，管理分为两级：MCP 提供商（`mcp_provider`） -> MCP（`mcp_cache` / `mcp_install`）；
3. MCP 提供商 / MCP 的系统字段（`id`、`created`、`updated`）由 Provider 维护，不可通过 Data 对象修改；资源级启用 / 禁用通过 updateMcpProvider / updateMcp 修改 `enable` 字段实现；
4. `listMcp` 从提供商 API 获取 MCP 列表并缓存到 `mcp_cache` 表（缓存有效期由配置 `cache_ttl` 决定，默认 86400 秒即 1 天），`installMcp` 通过 npm 安装 MCP 并记录到 `mcp_install` 表；
5. 只支持 npm 安装的 MCP，不支持 npm 安装的 MCP 不能进行安装；
6. 处于启动状态的 MCP 不能禁用；
7. 所有写操作推荐使用 `transactionDB` 保证原子性；
8. MCPProvider 用到的所有配置项（含 MCP 组件启用 / 禁用状态 `enabled`、缓存有效期 `cache_ttl` 等）统一存储于关系数据库配置表 mcp_config（库名 `mcp`，见 4.5），运行时按需读取；enableMCP 的启用 / 禁用状态同步持久化，组件初始化时恢复，避免状态丢失；
9. `enableMCP` 为运行时启用 / 禁用（可恢复），`closeMCP` 为系统关闭时的终态释放（不可恢复，需重新初始化组件）；
10. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
