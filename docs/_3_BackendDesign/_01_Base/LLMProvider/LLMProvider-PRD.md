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
| enable | BOOLEAN | N | 是否启用，默认 false（需手动启用） |

### 2.3. LLM 数据对象（LLMData）

用于新增 LLM（模型）；更新时使用 `Partial<LLMData>` 仅传入待更新字段。`id`、`created`、`updated` 为系统字段，由 Provider 维护，不通过 Data 对象传入。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| llm_provider_id | STRING | Y | LLM 提供商 ID，关联 llm_provider.id |
| llm_title | STRING | Y | LLM 名称 |
| llm_brief | STRING | N | LLM 摘要 |
| llm_type | STRING | N | LLM 类型：text / vision / embedding，默认 text |
| enable | BOOLEAN | N | 是否启用，默认 true |
| is_default | BOOLEAN | N | 是否为系统默认模型 |
| max_tokens | INT | N | 最大 Token 数 |

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
3. 默认 enable = false，需手动启用后才能调用其模型；

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

> 注：资源级启用 / 禁用通过本方法修改 `enable` 字段实现，不单独提供资源级 enableLLMProvider 方法。

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
2. 级联删除该提供商下关联的 `llm_cache`（模型缓存）、`llm_available`（可用模型）、`llm_usage`（使用统计）记录；

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

**功能**：从 LLM 提供商获取可用的模型列表并缓存到本地

**方法签名**：`Boolean listLLM(ListLLMInput input, LLMContext context, ListLLMOutput output)`

**入参（ListLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| llm_provider_id | STRING | Y | LLM 提供商 ID |

**处理流程**：

1. 根据 ID 获取 LLM 提供商信息；
2. 调用提供商 API 获取模型列表；
3. 将模型信息（含 `llm_param` JSON 参数）通过 RelationDBProvider 写入 `llm_cache` 表（upsert 语义）；

**返回**：Boolean，表示获取是否完成；模型列表通过 output 参数返回

### 3.2. LLM 模型管理

#### 3.2.1. 新增 LLM（addLLM）

**功能**：将一个 LLM 模型添加到系统可用列表

**方法签名**：`Boolean addLLM(AddLLMInput input, LLMContext context, AddLLMOutput output)`

**入参（AddLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | LLMData | Y | LLM 数据 |

**处理流程**：

1. 接收 LLM 数据，通过 RelationDBProvider 写入 `llm_available` 表；
2. 新增时自动写入 created、updated 字段；
3. llm_type 默认为 text，max_tokens 从 llm_cache 中读取提供商上限进行校验；

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

1. 根据 ids 或 conditions，通过 RelationDBProvider 从 `llm_available` 表中删除记录；

**返回**：Boolean，表示删除是否完成；影响行数通过 output 参数返回

#### 3.2.3. 更新 LLM（updateLLM）

**功能**：更新指定的 LLM，支持按 ID 或按条件更新

**方法签名**：`Boolean updateLLM(UpdateLLMInput input, LLMContext context, UpdateLLMOutput output)`

**入参（UpdateLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 按 ID 更新 |
| conditions | Condition[] | N | 按条件更新 |
| data | Partial\<LLMData\> | Y | 待更新的字段 |

> id 与 conditions 至少传一个

**处理流程**：

1. 根据 id 或 conditions，通过 RelationDBProvider 更新 `llm_available` 表；
2. 自动更新 updated 字段；
3. max_tokens 不得超过模型提供商的 `llm_cache.max_tokens` 上限；

> 可更新字段：llm_title、llm_brief、llm_type、enable、max_tokens。

**返回**：Boolean，表示更新是否完成；影响行数通过 output 参数返回

#### 3.2.4. 搜索可用模型（soLLM）

**功能**：搜索系统可用模型，支持关键词（按名称）、条件过滤、排序、分页

**方法签名**：`Boolean soLLM(SoLLMInput input, LLMContext context, SoLLMOutput output)`

**入参（SoLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| keyword | STRING | N | 关键词搜索（匹配 llm_title） |
| conditions | Condition[] | N | 条件过滤 |
| order_by | OrderBy[] | N | 排序规则 |
| page | Page | N | 分页参数 |

**处理流程**：

1. 根据 keyword（仅匹配 llm_title）、conditions 构造查询；
2. 按 order_by 排序，按 page 分页返回结果；

**返回**：Boolean，表示查询是否完成；LLM 列表及总数通过 output 参数返回

> 注：原 `getLLM` 接口已合并到 `soLLM`，按 ID 查询使用 `soLLM({ conditions: [{ field: 'id', op: 'EQ', val: id }] })`。

### 3.3. LLM 调用

#### 3.3.1. 调用 LLM（execLLM）

**功能**：调用指定的 LLM 执行推理

**方法签名**：`Boolean execLLM(ExecLLMInput input, LLMContext context, ExecLLMOutput output)`

**入参（ExecLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | LLM ID，为空则使用 is_default=1 的默认模型 |
| params | Record\<string, unknown\> | Y | 透传参数，见下方 |

**params 支持的字段**：

| 字段 | 类型 | 必填 | 说明 |
| ------ | ----- | ----- | ----- |
| prompt | STRING | Y | 用户消息内容 |
| system | STRING | N | 系统提示词，前置为 system 消息 |
| temperature | NUMBER | N | 采样温度 |
| {其他} | any | N | 原样透传到请求体 |

**处理流程**：

1. 若未传 ID，自动查找 is_default=1 且 enable=1 的默认模型；
2. 根据 ID 获取 llm_available 记录及关联的 llm_provider；
3. 使用提供商的 api_key 进行认证，构造 OpenAI 兼容 POST 请求；
4. 从 API 响应中提取 result、input_tokens（prompt_tokens）、output_tokens（completion_tokens）、duration_ms；
5. 更新 llm_usage 表当天 usage_count；

**出参（ExecLLMOutput extends Output）**：

| 属性 | 类型 | 说明 |
| ------ | ----- | ----- |
| result | STRING | AI 回复内容 |
| input_prompt | STRING | 实际发送的 prompt |
| input_tokens | NUMBER | 输入 Token 数 |
| output_tokens | NUMBER | 输出 Token 数 |
| duration_ms | NUMBER | 调用耗时（毫秒） |
| error | STRING? | 错误信息（HTTP / 网络错误时） |
| error_code | STRING? | 错误码（NETWORK_ERROR / HTTP_{status}） |

**返回**：Boolean，表示调用是否完成

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
   - volume：数据量（提供商数、缓存模型数、可用模型数、调用记录数）；
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

1. 根据 `enable` 参数启用或禁用 LLM 组件，并将 `enabled` 状态持久化到 llm_config；
2. 禁用时 LLM 相关操作将返回失败；
3. 启用时恢复可用状态；

**返回**：Boolean，表示操作是否完成

> 注：组件初始化时从 llm_config 读取 `enabled` 状态以恢复上次的可用状态。

## 4. 表设计

> LLM 数据表均存储在关系数据库（SQLite）中，逻辑库名为 `llm`。所有表均包含 id、created、updated 三个标准字段。

### 4.1. llm_provider 表（LLM 提供商）

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| llm_provider_url | LLM 提供商地址 | STRING | N | | |
| llm_provider_title | LLM 提供商名称 | STRING | N | 普通索引 | |
| llm_provider_brief | LLM 提供商摘要 | STRING | Y | | |
| enable | 是否启用 | BOOLEAN | N | | 默认 false |
| api_key | API 密钥 | STRING | Y | | |
| quota_* | 各类配额 | INT | Y | | 0=不限 |
| models_path | 模型列表 API 路径 | STRING | Y | | |
| chat_path | 对话 API 路径 | STRING | Y | | |

### 4.2. llm_cache 表（模型缓存）

- `表名`： llm_cache
- `说明`： 从提供商 API 拉取的模型目录缓存，每个模型存储其原始参数

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| llm_provider_id | LLM 提供商 ID | STRING | N | 普通索引 | 关联 llm_provider.id |
| llm_title | LLM 名称 | STRING | N | 普通索引 | |
| llm_brief | LLM 摘要 | STRING | Y | | |
| llm_param | 模型参数（JSON） | STRING | Y | | 从 API 返回的原始模型参数 |
| max_tokens | 最大 Token 数 | INT | Y | | 提供商允许的上限 |

### 4.3. llm_available 表（系统可用模型）

- `表名`： llm_available
- `说明`： 系统中已启用、可被调用的模型列表

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| llm_provider_id | LLM 提供商 ID | STRING | N | 普通索引 | 关联 llm_provider.id |
| llm_title | LLM 名称 | STRING | N | 普通索引 | |
| llm_brief | LLM 摘要 | STRING | Y | | |
| llm_type | LLM 类型 | STRING | N | 普通索引 | text / vision / embedding，默认 text |
| enable | 是否启用 | BOOLEAN | N | | 默认 true |
| is_default | 是否为默认模型 | BOOLEAN | N | | 默认 false，系统仅一个默认模型 |
| max_tokens | 最大 Token 数 | INT | Y | | 不超过 llm_cache.max_tokens |
| UNIQUE | 唯一约束 | - | - | (llm_provider_id, llm_title) | 同一提供商下模型名唯一 |

### 4.4. llm_usage 表（调用统计）

- `表名`： llm_usage
- `说明`： 按天统计每次成功调用的次数

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| llm_available_id | 可用模型 ID | STRING | N | 普通索引 | 关联 llm_available.id |
| usage_date | 使用日期 | STRING | N | 普通索引 | 格式：YYYY-MM-DD |
| usage_count | 当日使用次数 | INT | N | | 默认 0 |

**重要**：仅当 `execLLM` 调用成功时，当天的 usage_count 才会加 1

### 4.5. llm_config 表（组件配置）

- `表名`： llm_config
- `说明`： LLMProvider 组件级配置，KV 结构

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
2. LLM 管理分为两级：LLM 提供商（`llm_provider`） -> 模型缓存（`llm_cache`） -> 可用模型（`llm_available`）；
3. `listLLM` 从提供商 API 获取模型列表并保存到 `llm_cache` 表，`addLLM` 将模型添加到 `llm_available` 表使其可被调用；
4. 新增提供商默认 enable = false，需手动启用后才可调用其模型；
5. 资源级 LLM 提供商 / LLM 模型的启用/禁用通过 `updateLLMProvider` / `updateLLM` 修改 `enable` 字段实现；
6. `execLLM` 的 `params` 采用 Record\<string, unknown\> 透传，支持 prompt（必填）、system、temperature 及其他参数透传；
7. `execLLM` 的 ID 可为空，为空时自动使用 `is_default=1` 的默认模型；
8. Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`；
9. 节点/记录的系统字段（`id`、`created`、`updated`）由 Provider 维护，不可通过 Data 对象修改；
10. `enableLLM` 为运行时启用/禁用（可恢复），启用/禁用状态持久化到 `llm_config`；
11. 所有写操作推荐使用 `transactionDB` 保证原子性；
12. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
