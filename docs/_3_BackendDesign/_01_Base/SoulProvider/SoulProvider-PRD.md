# Soul Provider

## 1. 设计目标

1. 解耦 Soul 和系统，通过 Repository 设计模式为上层提供统一的 Soul 操作接口；
2. 所有对 Soul 的操作都不能直接进行，都必须要通过 SoulProvider；
3. 负责 Soul 数据的 CURD 操作；
4. 提供可视化数据接口，支持 Soul 健康状态监控；
5. SoulProvider 用到的所有配置项统一存储于关系数据库配置表，避免硬编码；
6. Soul 组件默认基于关系数据库（SQLite）实现；

## 2. 对象定义

> 以下对象贯穿各功能接口，统一定义如下。
> Input、Context、Output 为项目通用基类，参见 `_00_DevStandardization.md`。
> Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不再重复定义。

### 2.1. Soul 上下文（SoulContext）

继承 Context 基类，Soul 相关操作的执行上下文。

### 2.2. Soul 数据对象（SoulData）

用于新增 Soul；更新 Soul 时使用 `Partial<SoulData>` 仅传入待更新字段。Soul `id`、`created`、`updated` 为系统字段，由 Provider 维护，不通过 Data 对象传入。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| soul_content | STRING | Y | Soul 内容 |
| soul_brief | STRING | Y | Soul 功能摘要 |
| soul_usage | STRING | Y | Soul 应用场景 |
| enable | BOOLEAN | N | 是否启用，默认 true；资源级启用 / 禁用通过 updateSoul 修改该字段实现 |

## 3. 功能设计

### 3.1. Soul 管理

#### 3.1.1. 新增 Soul（addSoul）

**功能**：新增一个 Soul

**方法签名**：`Boolean addSoul(AddSoulInput input, SoulContext context, AddSoulOutput output)`

**入参（AddSoulInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | SoulData | Y | Soul 数据 |

**处理流程**：

1. 通过 RelationDBProvider 向 `soul` 表写入 Soul 数据（内容、摘要、应用场景）；
2. 初始化系统字段 `created`、`updated` 为当前时间戳；
3. Soul ID 通过 output 参数返回；

**返回**：Boolean，表示新增是否完成；Soul ID 通过 output 参数返回

#### 3.1.2. 删除 Soul（delSoul）

**功能**：删除指定的 Soul，支持按 ID 批量删除或按条件删除

**方法签名**：`Boolean delSoul(DelSoulInput input, SoulContext context, DelSoulOutput output)`

**入参（DelSoulInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| ids | STRING[] | N | 按 ID 删除（支持批量） |
| conditions | Condition[] | N | 按条件删除 |

> ids 与 conditions 至少传一个

**处理流程**：

1. 根据 ids 或 conditions，通过 RelationDBProvider 从 `soul` 表中删除记录；
2. 影响行数通过 output 参数返回；

**返回**：Boolean，表示删除是否完成；影响行数通过 output 参数返回

#### 3.1.3. 更新 Soul（updateSoul）

**功能**：更新指定的 Soul，支持按 ID 或按条件更新

**方法签名**：`Boolean updateSoul(UpdateSoulInput input, SoulContext context, UpdateSoulOutput output)`

**入参（UpdateSoulInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 按 ID 更新 |
| conditions | Condition[] | N | 按条件更新 |
| data | Partial\<SoulData\> | Y | 待更新的字段（含 `enable` 字段，资源级启用 / 禁用通过更新该字段实现） |

> id 与 conditions 至少传一个

**处理流程**：

1. 根据 id 或 conditions，通过 RelationDBProvider 更新 `soul` 表；
2. 更新 `updated` 为当前时间戳；
3. 影响行数通过 output 参数返回；

**返回**：Boolean，表示更新是否完成；影响行数通过 output 参数返回

> 注：资源级 Soul 的启用 / 禁用通过 updateSoul 修改 `enable` 字段实现，不再单独提供资源级 enable 方法。

#### 3.1.4. 获取 Soul（getSoul）

**功能**：获取指定的 Soul，支持按 ID 或按条件获取第一条

**方法签名**：`Boolean getSoul(GetSoulInput input, SoulContext context, GetSoulOutput output)`

**入参（GetSoulInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 按 ID 获取 |
| conditions | Condition[] | N | 按条件获取第一条 |

> id 与 conditions 至少传一个

**处理流程**：

1. 根据 id 或 conditions，通过 RelationDBProvider 查询 `soul` 表；
2. 返回第一条匹配记录，若无匹配返回空；

**返回**：Boolean，表示查询是否完成；Soul 信息通过 output 参数返回

#### 3.1.5. 搜索 Soul（soSoul）

**功能**：搜索 Soul，支持关键词、条件过滤、排序、分页

**方法签名**：`Boolean soSoul(SoSoulInput input, SoulContext context, SoSoulOutput output)`

**入参（SoSoulInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| keyword | STRING | N | 关键词搜索（匹配 soul_content、soul_brief） |
| conditions | Condition[] | N | 条件过滤 |
| order_by | OrderBy[] | N | 排序规则（支持按时间、按使用频率排序，使用频率需联表查询 `soul_usage`） |
| page | Page | N | 分页参数 |

> Condition、OrderBy、Page 为公共查询对象，定义于 `RelationDBProvider-PRD.md`。

**处理流程**：

1. 根据 keyword、conditions 构造查询，通过 RelationDBProvider 查询 `soul` 表；
2. 若按使用频率排序，联表查询 `soul_usage` 统计表（今日使用次数、最近 7 天使用次数、最近 30 天使用次数）；
3. 按 order_by 排序，按 page 分页返回结果；

**返回**：Boolean，表示查询是否完成；Soul 列表及总数通过 output 参数返回

### 3.2. 可视化与运维

#### 3.2.1. 启用/禁用（enableSoul）

**功能**：启用或禁用 Soul 组件，用于运行时控制 Soul 组件的可用状态

**方法签名**：`Boolean enableSoul(EnableSoulInput input, SoulContext context, EnableSoulOutput output)`

**入参（EnableSoulInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| enable | BOOLEAN | Y | 是否启用 |

**处理流程**：

1. 根据 `enable` 参数启用或禁用 Soul 组件，并将 `enabled` 状态持久化到关系数据库配置表 soul_config（库名 `soul`）；
2. 禁用时关闭数据库连接，释放资源，将 soul_config 中 `enabled` 置为 false；禁用期间所有 Soul 操作将返回失败（Soul 组件未启用）；
3. 启用时重新初始化数据库连接，恢复可用状态，将 soul_config 中 `enabled` 置为 true；

**返回**：Boolean，表示操作是否完成

> 注：组件初始化时从 soul_config 读取 `enabled` 状态以恢复上次的可用状态（如上次为禁用则保持禁用，避免状态丢失）；运行时内存中维护 `enabled` 状态供各操作快速校验，状态变更同步落库。

## 4. 表设计

> Soul 数据表（4.1 ~ 4.2）均存储在关系数据库（SQLite）中，逻辑库名为 `soul`；SoulProvider 用到的所有配置项（含 Soul 组件启用 / 禁用状态）统一存储于关系数据库配置表 soul_config 中（库名 `soul`，见 4.3），由 RelationDBProvider 管理。

### 4.1. soul 表（SQLite）

- `表名`： soul
- `库名`： soul
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| soul_content | Soul 内容 | TEXT | N | 普通索引 | |
| soul_brief | Soul 功能摘要 | TEXT | N | | |
| soul_usage | Soul 应用场景 | TEXT | N | | |
| enable | 是否启用 | BOOLEAN | N | | 默认 true |

### 4.2. soul_usage 表（SQLite）

- `表名`： soul_usage
- `库名`： soul
- `表类型`： 关系表

> 以 `(soul_id, usage_date)` 为业务唯一键，记录每个 Soul 每天的使用次数；供 soSoul 联表查询以支持按使用频率排序。

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| soul_id | Soul ID | STRING | N | 普通索引 | 关联 soul.id |
| usage_date | 使用日期 | STRING | N | 普通索引 | 格式：YYYY-MM-DD |
| usage_count | 当日使用次数 | INT | N | | 默认 0 |

### 4.3. SoulProvider 配置表（关系数据库）

- `表名`： soul_config
- `库名`： soul
- `存储`： 关系数据库（由 RelationDBProvider 管理）
- `表类型`： 关系表

> SoulProvider 用到的所有配置项集中存储于关系数据库（库名 `soul`），采用键值对结构，运行时按需读取；Soul 组件启用 / 禁用状态由 enableSoul 读取并持久化，避免硬编码与状态丢失。

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
| enabled | true | BOOLEAN | Soul 组件是否启用（enableSoul 读写） |

## 5. 重要内容

1. SoulProvider 是 Soul 的唯一操作入口，上层不可直接操作数据库；
2. SoulProvider 通过 Repository 模式封装 Soul 操作，Soul 组件默认基于关系数据库（SQLite）实现；
3. Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不重复定义；
4. Soul 的系统字段（`id`、`created`、`updated`）由 Provider 维护，不可通过 Data 对象修改；资源级 Soul 的启用 / 禁用通过 updateSoul 修改 `enable` 字段实现，不再单独提供资源级 enable 方法；
5. SoulProvider 用到的所有配置项（含 Soul 组件启用 / 禁用状态 `enabled`）统一存储于关系数据库配置表 soul_config（库名 `soul`，见 4.3），运行时按需读取；enableSoul 的启用 / 禁用状态同步持久化，组件初始化时恢复，避免状态丢失；
6. `enableSoul` 为运行时启用 / 禁用（可恢复），`closeSoul` 为系统关闭时的终态释放（不可恢复，需重新初始化组件）；
7. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
