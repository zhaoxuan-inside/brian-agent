# Prompts Provider

## 1. 设计目标

1. 解耦 Prompt 模板管理与上层执行框架，通过 Repository 设计模式为上层提供统一的 Prompt 模板操作接口；
2. 所有对 Prompt 模板的操作都不能直接进行，都必须要通过 PromptsProvider；
3. 负责 Prompt 模板的 CURD 操作；
4. 提供 Prompt 模板执行能力（在沙箱中完成变量替换、逻辑渲染及安全检查）；
5. 提供可视化数据接口，支持 Prompts 服务健康状态监控；
6. PromptsProvider 用到的所有配置项统一存储在关系数据库配置表 prompts_config 中；

## 2. 对象定义

> 以下对象贯穿各功能接口，统一定义如下。
> Input、Context、Output 为项目通用基类，参见 `_00_DevStandardization.md`。
> Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不再重复定义。

### 2.1. Prompt 上下文（PromptContext）

继承 Context 基类，Prompt 相关操作的执行上下文。

### 2.2. Prompt 模板数据对象（PromptTemplateData）

用于新增 Prompt 模板；更新时使用 `Partial<PromptTemplateData>` 仅传入待更新字段。Prompt `id`、`created`、`updated` 为系统字段，由 Provider 维护，不通过 Data 对象传入。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| prompt_template_title | STRING | Y | Prompt 名称 |
| prompt_template_brief | STRING | N | Prompt 摘要 |
| prompt_template | STRING | Y | Prompt 内容（Markdown 格式模板） |
| enable | BOOLEAN | N | 是否启用，默认 true |

## 3. 功能设计

### 3.1. Prompt 管理

#### 3.1.1. 新增 Prompt（addPrompt）

**功能**：新增一个 Prompt 模板

**方法签名**：`Boolean addPrompt(AddPromptInput input, PromptContext context, AddPromptOutput output)`

**入参（AddPromptInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | PromptTemplateData | Y | Prompt 模板数据 |

**处理流程**：

1. 生成 Prompt 唯一 id；
2. 通过 RelationDBProvider 将 Prompt 模板数据写入 `prompt_template` 表，初始化系统字段 `created`、`updated` 为当前时间戳，`enable` 未指定时默认为 true；
3. Prompt id 通过 output 参数返回；

**返回**：Boolean，表示新增是否完成；Prompt id 通过 output 参数返回

#### 3.1.2. 删除 Prompt（delPrompt）

**功能**：删除指定的 Prompt，支持按 ID 批量删除或按条件删除

**方法签名**：`Boolean delPrompt(DelPromptInput input, PromptContext context, DelPromptOutput output)`

**入参（DelPromptInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| ids | STRING[] | N | 按 ID 删除（支持批量） |
| conditions | Condition[] | N | 按条件删除 |

> ids 与 conditions 至少传一个

**处理流程**：

1. 根据 ids 或 conditions，通过 RelationDBProvider 从 `prompt_template` 表中删除记录；
2. 影响行数通过 output 参数返回；

**返回**：Boolean，表示删除是否完成；影响行数通过 output 参数返回

#### 3.1.3. 更新 Prompt（updatePrompt）

**功能**：更新指定的 Prompt，支持按 ID 或按条件更新

**方法签名**：`Boolean updatePrompt(UpdatePromptInput input, PromptContext context, UpdatePromptOutput output)`

**入参（UpdatePromptInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 按 ID 更新 |
| conditions | Condition[] | N | 按条件更新 |
| data | Partial\<PromptTemplateData\> | Y | 待更新的字段（系统字段 `id`、`created` 不可更新） |

> id 与 conditions 至少传一个

**处理流程**：

1. 根据 id 或 conditions，通过 RelationDBProvider 更新 `prompt_template` 表中 `data` 指定的字段；
2. 自动更新 `updated` 字段为当前时间戳；
3. 影响行数通过 output 参数返回；

> 注：资源级启用 / 禁用通过 updatePrompt 修改 `enable` 字段实现，不提供独立的 enablePrompt 方法。

**返回**：Boolean，表示更新是否完成；影响行数通过 output 参数返回

#### 3.1.4. 获取 Prompt（getPrompt）

**功能**：获取指定的 Prompt，支持按 ID 或按条件获取第一条

**方法签名**：`Boolean getPrompt(GetPromptInput input, PromptContext context, GetPromptOutput output)`

**入参（GetPromptInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 按 ID 获取 |
| conditions | Condition[] | N | 按条件获取第一条 |

> id 与 conditions 至少传一个

**处理流程**：

1. 根据 id 或 conditions，通过 RelationDBProvider 查询 `prompt_template` 表；
2. 返回第一条匹配记录，若无匹配返回空；

**返回**：Boolean，表示查询是否完成；Prompt 信息通过 output 参数返回

#### 3.1.5. 搜索 Prompt（soPrompt）

**功能**：搜索 Prompt，支持关键词、条件过滤、排序、分页

**方法签名**：`Boolean soPrompt(SoPromptInput input, PromptContext context, SoPromptOutput output)`

**入参（SoPromptInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| keyword | STRING | N | 关键词搜索（匹配 prompt_template_title、prompt_template_brief） |
| conditions | Condition[] | N | 条件过滤 |
| order_by | OrderBy[] | N | 排序规则（支持按时间、按使用频率排序，使用频率需联表查询 `prompt_template_usage`） |
| page | Page | N | 分页参数 |

> Condition、OrderBy、Page 为公共查询对象，定义于 `RelationDBProvider-PRD.md`。

**处理流程**：

1. 根据 keyword、conditions 构造查询，通过 RelationDBProvider 查询 `prompt_template` 表；
2. 若按使用频率排序，联表查询 `prompt_template_usage` 统计表（今日使用次数、最近 7 天使用次数、最近 30 天使用次数）；
3. 按 order_by 排序，按 page 分页返回结果；

**返回**：Boolean，表示查询是否完成；Prompt 列表及总数通过 output 参数返回

### 3.2. Prompt 执行

#### 3.2.1. 执行/渲染 Prompt（execPrompt）

**功能**：接收 Prompt 模板 ID 及变量参数，生成最终的完整 Prompt

**方法签名**：`Boolean execPrompt(ExecPromptInput input, PromptContext context, ExecPromptOutput output)`

**入参（ExecPromptInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | Prompt 模板 ID |
| variables | JSON | Y | 变量参数字典 |

**处理流程**：

1. 根据 ID 获取 Prompt 模板内容；
2. 在沙箱中完成变量替换、逻辑渲染及安全检查；
3. 生成最终的完整 Prompt 字符串（或消息列表）；
4. 调用成功后，通过 RelationDBProvider 更新 `prompt_template_usage` 表当天的 usage_count + 1；

**返回**：Boolean，表示渲染是否完成；渲染后的 Prompt 通过 output 参数返回

### 3.3. 可视化与运维

#### 3.3.1. 启用/禁用（enablePrompts）

**功能**：启用或禁用 Prompts 组件，用于运行时控制 Prompts 的可用状态

**方法签名**：`Boolean enablePrompts(EnablePromptsInput input, PromptContext context, EnablePromptsOutput output)`

**入参（EnablePromptsInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| enable | BOOLEAN | Y | 是否启用 |

**处理流程**：

1. 根据 `enable` 参数启用或禁用 Prompts 组件，并将 `enabled` 状态持久化到关系数据库配置表 prompts_config（库名 `prompts`）；
2. 禁用时关闭数据库连接，释放资源，将 prompts_config 中 `enabled` 置为 false；禁用期间所有 Prompt 操作将返回失败（Prompts 组件未启用）；
3. 启用时重新初始化数据库连接，恢复可用状态，将 prompts_config 中 `enabled` 置为 true；

**返回**：Boolean，表示操作是否完成

> 注：组件初始化时从 prompts_config 读取 `enabled` 状态以恢复上次的可用状态（如上次为禁用则保持禁用，避免状态丢失）；运行时内存中维护 `enabled` 状态供各操作快速校验，状态变更同步落库。

## 4. 表设计

> Prompt 数据表（4.1 ~ 4.2）存储在关系数据库（SQLite）中，逻辑库名为 `prompts`（由 RelationDBProvider 管理），均包含 id、created、updated 三个标准字段；PromptsProvider 用到的所有配置项（含 Prompts 组件启用 / 禁用状态）统一存储在关系数据库配置表 prompts_config 中（库名 `prompts`，见 4.3）。

### 4.1. Prompt 模板表（关系数据库）

- `表名`： prompt_template
- `库名`： prompts
- `存储`： 关系数据库（由 RelationDBProvider 管理）

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| prompt_template_title | Prompt 名称 | TEXT | N | 普通索引 | |
| prompt_template_brief | Prompt 摘要 | TEXT | Y | | |
| prompt_template | Prompt 内容 | TEXT | N | | Markdown 格式模板 |
| enable | 是否启用 | BOOLEAN | N | | 默认 true |

### 4.2. Prompt 调用记录表（关系数据库）

- `表名`： prompt_template_usage
- `库名`： prompts
- `存储`： 关系数据库（由 RelationDBProvider 管理）

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| prompt_template_id | Prompt 模板 ID | STRING | N | 普通索引 | 关联 prompt_template.id |
| usage_date | 使用日期 | STRING | N | 普通索引 | 格式：YYYY-MM-DD |
| usage_count | 当日使用次数 | INT | N | | 默认 0 |

> 仅当 `execPrompt`（执行渲染）成功调用时，当天的 usage_count 才会加 1。

### 4.3. PromptsProvider 配置表（关系数据库）

- `表名`： prompts_config
- `库名`： prompts
- `存储`： 关系数据库（由 RelationDBProvider 管理）
- `表类型`： 关系表

> PromptsProvider 用到的所有配置项集中存储于关系数据库（库名 `prompts`），采用键值对结构，运行时按需读取；Prompts 组件启用 / 禁用状态由 enablePrompts 读取并持久化，避免硬编码与状态丢失。

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
| enabled | true | BOOLEAN | Prompts 组件是否启用（enablePrompts 读写） |

## 5. 重要内容

1. PromptsProvider 是 Prompt 模板的唯一操作入口，上层不可直接操作数据库；
2. PromptsProvider 通过 Repository 设计模式封装 Prompt 模板操作，所有数据通过 RelationDBProvider 读写；
3. Prompt 模板使用 Markdown 格式，支持变量替换和逻辑渲染；
4. Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不重复定义；
5. Prompt 模板的系统字段（`id`、`created`、`updated`）由 Provider 维护，不可通过 Data 对象修改；
6. 资源级启用 / 禁用通过 updatePrompt 修改 `enable` 字段实现，不提供独立的 enablePrompt 方法；
7. `execPrompt` 在沙箱中执行渲染，确保安全性；调用成功后更新 `prompt_template_usage` 表当日使用次数；
8. PromptsProvider 用到的所有配置项（含 Prompts 组件启用 / 禁用状态 `enabled`）统一存储于关系数据库配置表 prompts_config（库名 `prompts`，见 4.3），运行时按需读取；enablePrompts 的启用 / 禁用状态同步持久化，组件初始化时恢复，避免状态丢失；
9. `enablePrompts` 为运行时启用 / 禁用（可恢复），`closePrompts` 为系统关闭时的终态释放（不可恢复，需重新初始化组件）；
10. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
