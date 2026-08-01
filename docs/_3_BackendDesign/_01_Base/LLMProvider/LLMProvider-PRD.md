# LLM Provider

## 1. 设计目标

1. 解耦 LLM 和系统，通过 Repository 设计模式为上层提供统一的 LLM 操作接口；
2. 所有对 LLM 的操作都不能直接进行，都必须要通过 LLMProvider；
3. 管理 LLM 提供商及其模型；
4. 接管 LLM 调用请求，提供统一的推理执行接口；
5. 提供可视化数据接口，支持 LLM 服务健康状态监控；
6. LLMProvider 用到的所有配置项统一存储于关系数据库配置表，方便后续分布式部署；

## 2. 对象定义

> 以下对象贯穿各功能接口，统一定义如下。
> Input、Context、Output 为项目通用基类，参见 `_00_DevStandardization.md`；
> Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不再重复定义。

### 2.1. LLM 上下文（LLMContext）

继承 Context 基类，LLM 相关操作的执行上下文。

### 2.2. LLM 提供商数据对象（LLMProviderData）

用于新增 LLM 提供商；更新时使用 `Partial<LLMProviderData>` 仅传入待更新字段。`id`、`created`、`updated` 为系统字段，由 Provider 维护，不通过 Data 对象传入。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| llm_provider_url | STRING | Y | LLM 提供商地址 |
| llm_provider_title | STRING | Y | LLM 提供商名称 |
| llm_provider_brief | STRING | N | LLM 提供商摘要 |
| enable | BOOLEAN | N | 是否启用，默认 true |

### 2.3. LLM 数据对象（LLMData）

用于新增 LLM（模型）；更新时使用 `Partial<LLMData>` 仅传入待更新字段。`id`、`created`、`updated` 为系统字段，由 Provider 维护，不通过 Data 对象传入。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| llm_provider_id | STRING | Y | LLM 提供商 ID，关联 llm_provider.id |
| llm_title | STRING | Y | LLM 名称 |
| llm_brief | STRING | N | LLM 摘要 |
| llm_usage | STRING | N | LLM 适用范围 |
| enable | BOOLEAN | N | 是否启用，默认 true |

## 3. 功能设计

### 3.1. LLM 提供商管理

#### 3.1.1. 新增 LLM 提供商（addLLMProvider）

**功能**：向系统中新增一个 LLM 提供商

**方法签名**：`Boolean addLLMProvider(AddLLMProviderInput input, LLMContext context, AddLLMProviderOutput output)`

**入参（AddLLMProviderInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | LLMProviderData | Y | LLM 提供商数据 |

**处理流程**：

1. 接收 LLM 提供商数据（URL、title、brief），通过 RelationDBProvider 写入 `llm_provider` 表；
2. 新增时自动写入 created、updated 字段；
3. 返回新增的 LLM 提供商 ID；

**返回**：Boolean，表示新增是否完成；LLM 提供商 ID 通过 output 参数返回

#### 3.1.2. 更新 LLM 提供商（updateLLMProvider）

**功能**：更新指定的 LLM 提供商，支持按 ID 或按条件更新

**方法签名**：`Boolean updateLLMProvider(UpdateLLMProviderInput input, LLMContext context, UpdateLLMProviderOutput output)`

**入参（UpdateLLMProviderInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 按 ID 更新 |
| conditions | Condition[] | N | 按条件更新 |
| data | Partial\<LLMProviderData\> | Y | 待更新的字段 |

> id 与 conditions 至少传一个

**处理流程**：

1. 根据 id 或 conditions，通过 RelationDBProvider 更新 `llm_provider` 表；
2. 自动更新 updated 字段；

> 注：资源级启用 / 禁用通过本方法修改 `enable` 字段实现，不再单独提供资源级 enableLLMProvider 方法。

**返回**：Boolean，表示更新是否完成；影响行数通过 output 参数返回

#### 3.1.3. 删除 LLM 提供商（delLLMProvider）

**功能**：删除指定的 LLM 提供商，支持按 ID 批量删除或按条件删除

**方法签名**：`Boolean delLLMProvider(DelLLMProviderInput input, LLMContext context, DelLLMProviderOutput output)`

**入参（DelLLMProviderInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| ids | STRING[] | N | 按 ID 删除（支持批量） |
| conditions | Condition[] | N | 按条件删除 |

> ids 与 conditions 至少传一个

**处理流程**：

1. 根据 ids 或 conditions，通过 RelationDBProvider 从 `llm_provider` 表中删除记录；
2. 级联清理该提供商下关联的 LLM 模型记录；

**返回**：Boolean，表示删除是否完成；影响行数通过 output 参数返回

#### 3.1.4. 搜索 LLM 提供商（soLLMProvider）

**功能**：搜索 LLM 提供商，支持关键词、条件过滤、排序、分页

**方法签名**：`Boolean soLLMProvider(SoLLMProviderInput input, LLMContext context, SoLLMProviderOutput output)`

**入参（SoLLMProviderInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| keyword | STRING | N | 关键词搜索（匹配 llm_provider_title） |
| conditions | Condition[] | N | 条件过滤 |
| order_by | OrderBy[] | N | 排序规则 |
| page | Page | N | 分页参数 |

**处理流程**：

1. 根据 keyword、conditions 构造查询，通过 RelationDBProvider 查询 `llm_provider` 表；
2. 按 order_by 排序，按 page 分页返回结果；

**返回**：Boolean，表示查询是否完成；LLM 提供商列表及总数通过 output 参数返回

#### 3.1.5. 测试 LLM 提供商连接（testLLMProvider）

**功能**：测试 LLM 提供商的网络连通性

**方法签名**：`Boolean testLLMProvider(TestLLMProviderInput input, LLMContext context, TestLLMProviderOutput output)`

**入参（TestLLMProviderInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | LLM 提供商 ID |

**处理流程**：

1. 根据 ID 获取 LLM 提供商信息；
2. 向提供商地址发起网络连通性测试；
3. 返回连通状态和响应时间；

**返回**：Boolean，表示测试是否完成；连通状态和响应时间通过 output 参数返回

#### 3.1.6. 获取 LLM 模型列表（listLLM）

**功能**：从 LLM 提供商获取可用的模型列表并保存到本地

**方法签名**：`Boolean listLLM(ListLLMInput input, LLMContext context, ListLLMOutput output)`

**入参（ListLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| llm_provider_id | STRING | Y | LLM 提供商 ID |

**处理流程**：

1. 根据 ID 获取 LLM 提供商信息；
2. 调用提供商 API 获取模型列表；
3. 将模型信息通过 RelationDBProvider 写入 `llm_model` 表（upsert 语义）；

**返回**：Boolean，表示获取是否完成；模型列表通过 output 参数返回

### 3.2. LLM 模型管理

#### 3.2.1. 新增 LLM（addLLM）

**功能**：将一个 LLM 模型添加到启用列表

**方法签名**：`Boolean addLLM(AddLLMInput input, LLMContext context, AddLLMOutput output)`

**入参（AddLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | LLMData | Y | LLM 数据 |

**处理流程**：

1. 接收 LLM 数据，通过 RelationDBProvider 写入 `llm_enable` 表；
2. 新增时自动写入 created、updated 字段；

**返回**：Boolean，表示新增是否完成；LLM ID 通过 output 参数返回

#### 3.2.2. 删除 LLM（delLLM）

**功能**：删除指定的 LLM，支持按 ID 批量删除或按条件删除

**方法签名**：`Boolean delLLM(DelLLMInput input, LLMContext context, DelLLMOutput output)`

**入参（DelLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| ids | STRING[] | N | 按 ID 删除（支持批量） |
| conditions | Condition[] | N | 按条件删除 |

> ids 与 conditions 至少传一个

**处理流程**：

1. 根据 ids 或 conditions，通过 RelationDBProvider 从 `llm_enable` 表中删除记录；

**返回**：Boolean，表示删除是否完成；影响行数通过 output 参数返回

#### 3.2.3. 更新 LLM（updateLLM）

**功能**：更新指定的 LLM，支持按 ID 或按条件更新，仅允许更新 `llm_enable` 表中的信息

**方法签名**：`Boolean updateLLM(UpdateLLMInput input, LLMContext context, UpdateLLMOutput output)`

**入参（UpdateLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 按 ID 更新 |
| conditions | Condition[] | N | 按条件更新 |
| data | Partial\<LLMData\> | Y | 待更新的字段 |

> id 与 conditions 至少传一个

**处理流程**：

1. 根据 id 或 conditions，通过 RelationDBProvider 更新 `llm_enable` 表；
2. 自动更新 updated 字段；

> 注：资源级启用 / 禁用通过本方法修改 `enable` 字段实现，不再单独提供资源级 enableLLM 方法。

**返回**：Boolean，表示更新是否完成；影响行数通过 output 参数返回

#### 3.2.4. 获取 LLM（getLLM）

**功能**：获取指定的 LLM，支持按 ID 或按条件获取第一条

**方法签名**：`Boolean getLLM(GetLLMInput input, LLMContext context, GetLLMOutput output)`

**入参（GetLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 按 ID 获取 |
| conditions | Condition[] | N | 按条件获取第一条 |

> id 与 conditions 至少传一个

**处理流程**：

1. 根据 id 或 conditions，通过 RelationDBProvider 查询 `llm_enable` 表；
2. 返回第一条匹配记录，若无匹配返回空；

**返回**：Boolean，表示查询是否完成；LLM 信息通过 output 参数返回

#### 3.2.5. 搜索 LLM（soLLM）

**功能**：搜索 LLM，支持关键词（名称和摘要）、条件过滤、排序、分页

**方法签名**：`Boolean soLLM(SoLLMInput input, LLMContext context, SoLLMOutput output)`

**入参（SoLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| keyword | STRING | N | 关键词搜索（匹配 llm_title、llm_brief） |
| conditions | Condition[] | N | 条件过滤 |
| order_by | OrderBy[] | N | 排序规则 |
| page | Page | N | 分页参数 |

**处理流程**：

1. 根据 keyword、conditions 构造查询，通过 RelationDBProvider 查询 `llm_enable` 表；
2. 按 order_by 排序，按 page 分页返回结果；

**返回**：Boolean，表示查询是否完成；LLM 列表及总数通过 output 参数返回

### 3.3. LLM 调用

#### 3.3.1. 调用 LLM（execLLM）

**功能**：调用指定的 LLM

**方法签名**：`Boolean execLLM(ExecLLMInput input, LLMContext context, ExecLLMOutput output)`

**入参（ExecLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | LLM ID |
| prompt | STRING | Y | 调用 prompt |
| params | JSON | N | 其他调用参数（temperature、max_tokens 等） |

**处理流程**：

1. 根据 ID 获取 LLM 配置及提供商信息；
2. 调用 LLM 提供商 API 执行推理；
3. 调用成功后，通过 RelationDBProvider 更新 `llm_usage` 表当天的 usage_count + 1；

**返回**：Boolean，表示调用是否完成；推理结果通过 output 参数返回

### 3.4. 可视化与运维

#### 3.4.1. 可视化数据（visualizedLLM）

**功能**：获取 LLM 服务的可视化信息

**方法签名**：`Boolean visualizedLLM(VisualizedLLMInput input, LLMContext context, VisualizedLLMOutput output)`

**入参（VisualizedLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| scope | ENUM | Y | 可视化范围，health / volume / diskUsage |

**处理流程**：

1. 根据 scope 获取对应的可视化数据：
   - health：LLM 服务健康状态（连接状态、响应时间）；
   - volume：数据量（提供商数、模型数、调用记录数）；
   - diskUsage：占用磁盘空间；

**返回**：Boolean，表示查询是否完成；可视化数据通过 output 参数返回

#### 3.4.2. 启用/禁用（enableLLM）

**功能**：启用或禁用 LLM 组件，用于运行时控制 LLM 服务的可用状态

**方法签名**：`Boolean enableLLM(EnableLLMInput input, LLMContext context, EnableLLMOutput output)`

**入参（EnableLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| enable | BOOLEAN | Y | 是否启用 |

**处理流程**：

1. 根据 `enable` 参数启用或禁用 LLM 组件，并将 `enabled` 状态持久化到关系数据库配置表 llm_config（库名 `llm`）；
2. 禁用时释放 LLM 相关连接资源，将 llm_config 中 `enabled` 置为 false；禁用期间所有 LLM 操作将返回失败（LLM 组件未启用）；
3. 启用时重新初始化 LLM 组件，恢复可用状态，将 llm_config 中 `enabled` 置为 true；

**返回**：Boolean，表示操作是否完成

> 注：组件初始化时从 llm_config 读取 `enabled` 状态以恢复上次的可用状态（如上次为禁用则保持禁用，避免状态丢失）；运行时内存中维护 `enabled` 状态供各操作快速校验，状态变更同步落库。

#### 3.4.3. 关闭连接（closeLLM）

**功能**：关闭 LLM 组件连接，用于系统关闭时释放连接资源

**方法签名**：`Boolean closeLLM(CloseLLMInput input, LLMContext context, CloseLLMOutput output)`

**入参（CloseLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| 无额外参数 | - | - | - |

**处理流程**：

1. 关闭 LLM 组件连接，释放资源；

> 注：`closeLLM` 为终态操作，执行后组件不可再通过 `enableLLM(true)` 恢复，需重新初始化组件；`enableLLM(false)` 为运行时临时禁用，可通过 `enableLLM(true)` 恢复。

**返回**：Boolean，表示关闭是否完成

## 4. 表设计

> LLM 数据表（4.1 ~ 4.4）均存储在关系数据库（SQLite）中，逻辑库名为 `llm`；LLMProvider 用到的所有配置项（含 LLM 组件启用 / 禁用状态）存储在关系数据库配置表 llm_config 中（库名 `llm`，见 4.5）。所有表均包含 id、created、updated 三个标准字段。

### 4.1. llm_provider 表

- `表名`： llm_provider
- `库名`： llm
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| llm_provider_url | LLM 提供商地址 | STRING | N | | |
| llm_provider_title | LLM 提供商名称 | STRING | N | 普通索引 | |
| llm_provider_brief | LLM 提供商摘要 | STRING | Y | | |
| enable | 是否启用 | BOOLEAN | N | | 默认 true |

### 4.2. llm_model 表

- `表名`： llm_model
- `库名`： llm
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| llm_provider_id | LLM 提供商 ID | STRING | N | 普通索引 | 关联 llm_provider.id |
| llm_title | LLM 名称 | STRING | N | 普通索引 | |
| llm_brief | LLM 摘要 | STRING | Y | | |

### 4.3. llm_enable 表

- `表名`： llm_enable
- `库名`： llm
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| llm_provider_id | LLM 提供商 ID | STRING | N | 普通索引 | 关联 llm_provider.id |
| llm_title | LLM 名称 | STRING | N | 普通索引 | |
| llm_brief | LLM 摘要 | STRING | Y | | |
| llm_usage | LLM 适用范围 | STRING | N | 普通索引 | |
| enable | 是否启用 | BOOLEAN | N | | 默认 true |

### 4.4. llm_usage 表

- `表名`： llm_usage
- `库名`： llm
- `表类型`： 关系表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| llm_enable_id | 启用的 LLM ID | STRING | N | 普通索引 | 关联 llm_enable.id |
| usage_date | 使用日期 | STRING | N | 普通索引 | 格式：YYYY-MM-DD |
| usage_count | 当日使用次数 | INT | N | | 默认 0 |

**重要**：仅当 `execLLM`（调用 LLM）成功时，当天的 usage_count 才会加 1

### 4.5. LLMProvider 配置表（关系数据库）

- `表名`： llm_config
- `库名`： llm
- `存储`： 关系数据库（由 RelationDBProvider 管理）
- `表类型`： 关系表

> LLMProvider 用到的所有配置项集中存储于关系数据库（库名 `llm`），采用键值对结构，运行时按需读取；LLM 组件启用 / 禁用状态由 enableLLM 读取并持久化，默认限额参数由 execLLM 读取，避免硬编码与状态丢失。

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
| enabled | true | BOOLEAN | LLM 组件是否启用（enableLLM 读写） |
| default_quota_tokens_per_day | 0 | INT | 默认每日 Token 限额（0 为不限制） |
| default_quota_tokens_per_week | 0 | INT | 默认每周 Token 限额 |
| default_quota_tokens_per_month | 0 | INT | 默认每月 Token 限额 |
| default_quota_calls_per_day | 0 | INT | 默认每日调用次数限额 |
| default_quota_calls_per_week | 0 | INT | 默认每周调用次数限额 |
| default_quota_calls_per_month | 0 | INT | 默认每月调用次数限额 |

## 5. 重要内容

1. LLMProvider 是 LLM 的唯一操作入口，上层不可直接调用 LLM 提供商 API；
2. LLM 管理分为两级：LLM 提供商（`llm_provider`） -> LLM 模型（`llm_model` / `llm_enable`）；
3. `listLLM` 从提供商 API 获取模型列表并保存到 `llm_model` 表，`addLLM` 将模型添加到 `llm_enable` 启用表；
4. 资源级 LLM 提供商 / LLM 模型的启用 / 禁用通过 `updateLLMProvider` / `updateLLM` 修改 `enable` 字段实现，不再单独提供资源级 enable 方法；
5. Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不重复定义；
6. 节点 / 记录的系统字段（`id`、`created`、`updated`）由 Provider 维护，不可通过 Data 对象修改；
7. LLMProvider 用到的所有配置项（含 LLM 组件启用 / 禁用状态 `enabled`、默认限额参数 `default_quota_tokens_per_day` / `default_quota_calls_per_day` 等）统一存储于关系数据库配置表 llm_config（库名 `llm`，见 4.5），运行时按需读取；enableLLM 的启用 / 禁用状态同步持久化，组件初始化时恢复，避免状态丢失；
8. `enableLLM` 为运行时启用 / 禁用（可恢复），`closeLLM` 为系统关闭时的终态释放（不可恢复，需重新初始化组件）；
9. 所有写操作推荐使用 `transactionDB` 保证原子性；
10. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
