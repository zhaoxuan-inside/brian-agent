# MCP Provider

## 1. 设计目标

1. 解耦MCP 和 Agent执行框架；
2. 管理 MCP 提供商；
3. 管理 MCP 提供商的 MCP；
4. 接管 MCP 调用请求；

## 2. 功能设计

### 2.1. MCP 提供商管理

#### 2.1.1. 新增 MCP 提供商（addMcpProvider）

接收 MCP 提供商的信息（URL，title，概述），并进行保存；

#### 2.1.2. MCP 提供商连接状态测试（testMcpProvider）

根据提供的 MCP 提供商ID，获取MCP提供商的信息，进行网络连通性测试；

#### 2.1.3. 删除 MCP 提供商（delMcpProvider）

根据提供的 MCP 提供商 ID， 删除指定的 MCP 提供商；

#### 2.1.4. 获取 MCP 列表（listMcp）

根据提供的MCP 提供商ID，以及分页信息，获取指定分页的MCP信息列表；（进行缓存，缓存在RelationProvider中，缓存一天）；

#### 2.1.5. 启用/禁用 MCP 提供商（enableMcpProvider）

根据提供的 MCP 提供商ID，启用/禁用指定的 MCP 提供商

#### 2.1.5. 搜索 MCP 提供商（soMcpProvider）

支持对MCP提供商的名称进行关键词搜索

#### 2.1.6. 检查 MCP 提供商健康状态（healthMcpProvider）

根据提供的MCP提供商ID，获取MCP提供商的信息测试MCP提供商的网络连接健康状态

### 2.2. MCP 管理

#### 2.2.1. 安装 MCP（installMcp）

根据提供的 MCP 提供商 ID，以及要安装的 MCP ID，安装指定的 MCP，并生成启动，关闭，删除MCP的相关命令；

**注意**：只支持 npm 安装 MCP；不支持 npm 安装的 mcp 不能进行安装；

### 2.2.2. 启动MCP（startMcp）
根据提供的 MCP ID，通过保存的 MCP 启动命令启动 MCP；

#### 2.2.3. 关闭MCP(stopMcp)

根据提供的 MCP ID，通过保存的 MCP 关闭命令关闭 MCP；

#### 2.2.4. 删除MCP（uninstallMcp）

通过提供的 MCP ID，通过保存的 MCP 卸载命令卸载 MCP；

#### 2.2.5. 启用/禁用 MCP （enableMcp）

根据提供的 MCP ID，启用/禁用指定的 MCP；
**注意**：处于启动状态的 MCP 不能禁用；

#### 2.1.5. 搜索 MCP（soMcp）

支持对MCP的名称和摘要进行关键词搜索

#### 2.1.6. 调用 MCP（execMcp）

接收MCP ID 和参数调用调用指定的MCP

#### 2.1.7. 匹配 MCP（matchMcp）

根据任务的内容，加载所有可选的MCP的ID和摘要，调用PromptsProvider构建prompt，调用LLMProvider由模型推荐合适的MCP ID；

#### 2.1.6. 检查 MCP 健康状态（healthMcp）

根据提供的MCP ID，获取MCP的信息测试MCP服务端的网络连接健康状态

## 3. 表结构设计

### 3.1. mcp_provider表（SQLite）

- `表名`： mcp_provider
- `库名`： mcp

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| mcp_provider_url | mcp提供商地址 | TEXT | N | | |
| mcp_provider_title | mcp提供商名称 | TEXT | N | 普通索引 | |
| mcp_provider_brief | mcp提供商摘要 | TEXT | Y | | |
| enable | 是否启用 | BOOL | N | | 默认启用 |

## 3.1. mcp缓存表（SQLite）

- `表名`： mcp_cache
- `库名`： mcp

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| mcp_provider_id | MCP 提供商 ID | TEXT | N | 普通索引 | |
| mcp_title | MCP 名称 | TEXT | N | 普通索引 | |
| mcp_brief | MCP 摘要 | TEXT | N | 普通索引 | |
| mcp_install_cmd | MCP 安装命令 | TEXT | N | 普通索引 | |

## 3.1. mcp安装表（SQLite）

- `表名`： mcp_install
- `库名`： mcp

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| mcp_provider_id | MCP 提供商 ID | TEXT | N | 普通索引 | |
| mcp_title | MCP 名称 | TEXT | N | 普通索引 | |
| mcp_brief | MCP 摘要 | TEXT | N | 普通索引 | |
| mcp_install_cmd | MCP 安装命令 | TEXT | N | 普通索引 | |
| mcp_start_cmd | MCP 启动命令 | TEXT | N | 普通索引 | |
| mcp_stop_cmd | MCP 停止命令 | TEXT | N | 普通索引 | |
| mcp_uninstall_cmd | MCP 卸载命令 | TEXT | N | 普通索引 | |
| enable | 是否启用 | BOOL | N | | 默认启用 |

## 3.2. MCP 使用表（SQLite）

- `表名`：mcp_usage
- `库名`mcp

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| mcp_id | mcpID | UUID | N | 普通索引 | |
| usage_date | mcp使用日期 | date | N | 普通索引 | |
| usage_count | 当日使用数量 | Integer | N | | 默认为0 |

**重要**：仅当 `execMcp`（执行MCP）成功调用时，当天的usage_count才会加1
