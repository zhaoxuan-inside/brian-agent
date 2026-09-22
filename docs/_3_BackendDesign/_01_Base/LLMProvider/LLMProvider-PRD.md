# LLM Provider

## 1. 设计目标

1. 解耦 LLM 和系统，通过 Repository 与策略模式（Strategy Pattern）为上层提供统一且多态的 LLM 操作接口；
2. 所有对 LLM 的操作都不能直接进行，都必须要通过 LLMProvider；
3. 管理 LLM 提供商及其模型；
4. 接管 LLM 调用请求，提供统一的推理执行接口；通过策略模式支持通用 OpenAI 兼容提供商与各异提供商（Google、Anthropic、Ollama 等）的请求构造与多态解析；
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
| llm_brief | STRING | N | LLM 摘要（用于 LLMCore 动态模型选择排名） |
| llm_type | STRING | N | LLM 类型：text / vision / embedding，默认 text |
| enable | BOOLEAN | N | 是否启用，默认 true |
| is_default | BOOLEAN | N | 是否为系统默认模型 |
| max_tokens | INT | N | 最大 Token 数 |
| model_usage | STRING | N | 模型用途描述（用于 LLMCore 动态模型选择排名） |

## 3. 功能设计

### 3.1. LLM 提供商管理

#### 3.1.1. 新增 LLM 提供商（addLLMProvider）

**功能**：向系统中新增一个 LLM 提供商

**方法签名**：`Boolean addLLMProvider(AddLLMProviderInput input, AddLLMProviderOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

**入参（AddLLMProviderInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | LLMProviderData | Y | LLM 提供商数据 |

**处理流程**：

1. 接收 LLM 提供商数据（URL、title、brief），通过 RelationDBProvider 写入 `llm_provider` 表；
2. 新增时自动写入 created、updated 字段；
3. 未显式指定配额字段时，从 llm_config 读取全局默认配额（`default_quota_tokens_per_day` / `default_quota_tokens_per_week` / `default_quota_tokens_per_month` / `default_quota_calls_per_day` / `default_quota_calls_per_week` / `default_quota_calls_per_month`，默认 0 为不限制）作为新提供商的初始配额；
4. 默认 enable = false，需手动启用后才能调用其模型；

**返回**：Boolean，表示新增是否完成；LLM 提供商 ID 通过 output 参数返回

#### 3.1.2. 更新 LLM 提供商（updateLLMProvider）

**功能**：更新指定的 LLM 提供商，支持按 ID 或按条件更新

**方法签名**：`Boolean updateLLMProvider(UpdateLLMProviderInput input, UpdateLLMProviderOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

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

**方法签名**：`Boolean delLLMProvider(DelLLMProviderInput input, DelLLMProviderOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

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

**方法签名**：`Boolean soLLMProvider(SoLLMProviderInput input, SoLLMProviderOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

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

**方法签名**：`Boolean testLLMProvider(TestLLMProviderInput input, TestLLMProviderOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

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

**方法签名**：`Boolean listLLM(ListLLMInput input, ListLLMOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

**入参（ListLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| llm_provider_id | STRING | Y | LLM 提供商 ID |
| force | BOOLEAN | N | 是否强制从远程 API 重新获取（为 true 时跳过缓存，主动拉取并刷新缓存） |

**处理流程**：

1. 根据 ID 获取 LLM 提供商信息；
2. 缓存检查：仅在未指定 `force=true` 且 `models_fetched_at` 未过期时直接返回 `llm_cache` 本地缓存列表；
3. 调用提供商 API（依据配置的 `models_path` 路径及 API Key）动态获取模型列表，通用兼容标准响应结构（如 `data` / `models` 数组，动态解析 `id`/`name`、`displayName`/`description`、`inputTokenLimit`/`max_tokens` 等）；
   - 火山方舟（Volcano Engine）策略会额外解析模型 `status` 字段，过滤掉 `Shutdown`（已下线）/ `Retiring`（即将下线）的模型，避免列表中出现无法调用的模型（其余提供商不使用该 `status` 语义，不做过滤）；
4. 将模型信息（含 `llm_param` JSON 参数）通过 RelationDBProvider 写入 `llm_cache` 表（upsert 语义）；
5. 清理缓存：删除 `llm_cache` 中本次拉取结果已不存在的模型（如同步移除已下线的模型），使缓存与提供商当前模型列表保持一致；
6. 仅在远程请求成功后更新 `models_fetched_at` 缓存时间戳（请求失败或网络异常时不更新缓存时间戳）；

**返回**：Boolean，表示获取是否完成；模型列表通过 output 参数返回

### 3.2. LLM 模型管理

#### 3.2.1. 新增 LLM（addLLM）

**功能**：将一个 LLM 模型添加到系统可用列表

**方法签名**：`Boolean addLLM(AddLLMInput input, AddLLMOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

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

**方法签名**：`Boolean delLLM(DelLLMInput input, DelLLMOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

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

**方法签名**：`Boolean updateLLM(UpdateLLMInput input, UpdateLLMOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

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

> 可更新字段：llm_title、llm_brief、llm_type、enable、max_tokens、model_usage。

> **部分更新语义**：`data` 为 `Partial<LLMData>`，仅更新 `data` 中显式提供的字段；未提供的字段（尤其是 `enable`）**必须保持原值，不得重置**。`enable` 为布尔值（`true`/`false`），持久化到 `llm_available.enable` 时以 1/0 存储。

**返回**：Boolean，表示更新是否完成；影响行数通过 output 参数返回

#### 3.2.4. 搜索可用模型（soLLM）

**功能**：搜索系统可用模型，支持关键词（按名称）、条件过滤、排序、分页

**方法签名**：`Boolean soLLM(SoLLMInput input, SoLLMOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

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

**方法签名**：`Boolean execLLM(ExecLLMInput input, ExecLLMOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

**入参（ExecLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | LLM ID，为空则使用 is_default=1 的默认模型 |
| prompt | STRING | Y | 用户消息内容 |
| system | STRING | N | 系统提示词，前置为 system 消息 |
| temperature | NUMBER | N | 采样温度 |
| max_tokens | NUMBER | N | 最大 Token 数，未指定时使用模型默认 max_tokens |
| no_fallback | BOOLEAN | N | 是否禁用模型降级回退；为 true 时仅调用指定模型（`maxAttempts = 1`），不降级到默认/其他启用模型 |
| extra | Record\<string, unknown\> | N | 其他透传参数，原样进入请求体 |

**处理流程**：

1. **候选模型解析与降级队列构建**：
   - 优先将显式指定的模型（`input.id`）加入候选队列；
   - 随后加入系统默认启用的模型（`is_default = 1` 且 `enable = 1`）；
   - 最后加入系统其余所有已启用的可用模型（`enable = 1`）；
   - 对候选队列去重，若队列为空则抛出 `ValidationError` / `NotFoundError`；
2. **循环降级推理（Failover Loop）**：
   - 按候选队列顺序依次尝试模型推理；
   - 根据当前候选模型 ID 获取 `llm_available` 记录及关联的 `llm_provider`，验证启用状态；
   - 使用提供商配置构造请求（支持 OpenAI 兼容格式、Google / Anthropic 等多态策略）；
   - 发起 HTTP 请求，若成功（HTTP 200 且返回合法数据），提取 `result`、`input_tokens`、`output_tokens`、`duration_ms`，更新 `llm_usage` 统计并返回 `true`；
   - 若遇到 HTTP 429 限流、网络超时、连接异常或服务商错误，记录调试日志并自动无缝回退至队列中的下一个候选模型；
3. **全失败收敛**：若队列中所有候选模型均尝试失败，汇总错误信息写入 `output.error` / `output.error_code` 并返回 `false`。
   - 当 `no_fallback = true` 时，仅尝试指定模型，失败后 `output.error` 直接回传该模型自身的调用错误（如 `LLM 调用失败: HTTP 404 ...`），不包装成"所有可用模型均调用失败"的降级语义。

**出参（ExecLLMOutput extends Output）**：

| 属性 | 类型 | 说明 |
| ------ | ----- | ----- |
| result | STRING | AI 回复内容 |
| input_prompt | STRING | 实际发送的 prompt |
| input_tokens | NUMBER | 输入 Token 数 |
| output_tokens | NUMBER | 输出 Token 数 |
| duration_ms | NUMBER | 调用耗时（毫秒） |
| raw_response | STRING | 模型提供商返回的原始响应正文（未经解析） |
| error | STRING? | 错误信息（HTTP / 网络错误时） |
| error_code | STRING? | 错误码（NETWORK_ERROR / HTTP_{status}） |

**返回**：Boolean，表示调用是否完成

#### 3.3.2. 调用 LLM 生成向量（embedLLM）

**功能**：调用指定的 embedding 模型生成向量

**方法签名**：`Boolean embedLLM(EmbedLLMInput input, EmbedLLMOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

**入参（EmbedLLMInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | LLM ID，为空则使用 llm_type='embedding' 且 enable=1 的模型 |
| input | STRING | Y | 待向量化的文本 |

**处理流程**：

1. 若未传 ID，自动查找 llm_type='embedding' 且 enable=1 的模型；
2. 根据 ID 获取 llm_available 记录及关联的 llm_provider；
3. 校验模型 llm_type 必须为 embedding；
4. 构造 OpenAI 兼容 `POST {base}/v1/embeddings` 请求，请求体 `{ model, input }`；
5. 从 API 响应中解析 `data[0].embedding` 作为向量结果；
6. 更新 llm_usage 表当天 usage_count 并累计 input_tokens（向量化无输出 token）；

**出参（EmbedLLMOutput extends Output）**：

| 属性 | 类型 | 说明 |
| ------ | ----- | ----- |
| embedding | NUMBER[] | 向量（浮点数组） |
| input_tokens | NUMBER | 输入 Token 数 |
| duration_ms | NUMBER | 调用耗时（毫秒） |
| raw_response | STRING | 模型提供商返回的原始响应正文（未经解析） |
| error | STRING? | 错误信息（HTTP / 网络错误时） |
| error_code | STRING? | 错误码（NETWORK_ERROR / HTTP_{status}） |

**返回**：Boolean，表示调用是否完成

#### 3.3.3. 一键补全模型属性（genLLMAttr）

**功能**：为指定模型一键生成「简介」（llm_brief）与「模型用途」（model_usage）并保存到 `llm_available` 表

**方法签名**：`Boolean genLLMAttr(GenLLMAttrInput input, GenLLMAttrOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

**入参（GenLLMAttrInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | 模型 ID（llm_available.id），为该模型生成「简介」与「模型用途」 |

**处理流程**：

1. 根据 ID 读取待补全的模型（`llm_available`）及其提供商名称（`llm_provider.llm_provider_title`）；
2. 调用 PromptsProvider 的 `execPrompt` 渲染内置 Prompt「模型属性生成」（`builtin.llm_attr_gen`），变量为 `model_name` / `llm_type` / `provider_title`；若 PromptsProvider 未注入或模板缺失，回退为内存渲染内置模板（`renderTemplate`）；
3. 调用大模型生成属性（复用 `execLLM` 的空 ID 降级逻辑，模型选择顺序：默认模型 → 启用的第一个模型）；
4. 解析大模型返回的 JSON（容忍 Markdown 代码块包裹），提取 `llm_brief` 与 `model_usage`；
5. 将结果写入 `llm_available` 表的 `llm_brief` / `model_usage` 字段并更新 `updated`；

**出参（GenLLMAttrOutput extends Output）**：

| 属性 | 类型 | 说明 |
| ------ | ----- | ----- |
| llm_brief | STRING | 生成的简介 |
| model_usage | STRING | 生成的模型用途 |
| error | STRING? | 错误信息（生成 / 解析失败时） |
| error_code | STRING? | 错误码（GEN_ATTR_FAILED / PARSE_ERROR / EMPTY_RESULT） |

**返回**：Boolean，表示生成与保存是否完成

> 注：LLMProvider 通过构造参数可选注入 `PromptsAccess`（`new LLMAccess(relationDb, logger, promptsAccess)`），在 dev-server 装配时 PromptsProvider 先于 LLMProvider 初始化。

### 3.4. 可视化与运维

#### 3.4.1. 可视化数据（visualizedLLM）

**功能**：获取 LLM 服务的可视化信息

**方法签名**：`Boolean visualizedLLM(VisualizedLLMInput input, VisualizedLLMOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

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

**方法签名**：`Boolean enableLLM(EnableLLMInput input, EnableLLMOutput output, LLMContext context, LLMMetrics metrics, LLMReport report)`

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

### 3.5. 多态策略模式架构（Strategy Pattern）

针对不同模型提供商在请求端点路径、鉴权请求头、请求体数据结构（如顶层 `system` vs `messages` 数组）、Token 约束以及响应返回结构上的差异，采用策略模式（Strategy Pattern）与策略工厂（`LLMStrategyFactory`）实现多态调用。

#### 3.5.1. 策略接口（ILLMProviderStrategy）

| 方法 | 说明 |
| :--- | :--- |
| `supports(provider)` | 判定当前策略是否适用于该提供商 |
| `buildTestRequest(provider)` | 构造连通性探测请求（URL、Method、Headers） |
| `buildListModelsRequest(provider)` | 构造模型列表拉取请求 |
| `parseListModelsResponse(json, rawText)` | 多态解析各提供商模型目录响应 |
| `buildChatRequest(provider, model, input)` | 构造对话补全 / Messages 请求 |
| `parseChatResponse(json, rawText)` | 多态解析对话回复内容与 Token 用量 |
| `buildEmbedRequest(provider, model, input)` | 构造向量化请求 |
| `parseEmbedResponse(json, rawText)` | 多态解析向量浮点数组 |

#### 3.5.2. 内置策略实现

1. **BaseLLMStrategy / OpenAIStrategy**：
   - 适用于 OpenAI、DeepSeek、Moonshot、Zhipu AI、Qwen、SiliconFlow、OpenRouter、Groq、Together 等通用 OpenAI 兼容服务商；
   - 默认路由：`v1/chat/completions`、`v1/models`、`v1/embeddings`；
   - 标准鉴权：`Authorization: Bearer <api_key>`。
2. **GoogleStrategy**：
   - 适用于 Google Gemini 系列；
   - 缺省路由：`openai/chat/completions`（OpenAI 兼容）或 `models`（模型列表）；
   - 组合鉴权：同时注入 `Authorization: Bearer <api_key>`、`x-goog-api-key` 及 URL 查询参数 `?key=`；
   - 思考模型 Token 保护：保障至少 1024 Token 空间供思维链模型（如 Gemini 3.7-Flash）完成内部思考与结果输出；
   - 兼容解析：同时支持 OpenAI `{ choices: [...] }` 与 Google 原生 `{ candidates: [...] }` 结构。
3. **AnthropicStrategy**：
   - 适用于 Anthropic Claude 系列；
   - 专用鉴权：`x-api-key: <api_key>` 与 `anthropic-version: 2023-06-01`；
   - 参数适配：将 `system` 提升为顶层独立参数，强制补齐 `max_tokens`；
   - 结构解析：解析 Anthropic `{ content: [{ type: 'text', text }] }` 结构。
4. **OllamaStrategy**：
   - 适用于本地部署的 Ollama / 本地模型；
   - 免鉴权适配，支持 Ollama 原生 `/api/tags` 列表及 details 参数解析。
5. **VolcanoEngineStrategy**（火山方舟）：
   - 适用于火山方舟 ARK（`volces.com` / `ark.cn-beijing`）；
   - 模型列表解析时优先取带版本号的完整 `id`（如 `doubao-pro-32k-241215`）而非裸族名 `name`，避免调用时触发 `InvalidEndpointOrModel.NotFound` 404；
   - 过滤 `status` 为 `Shutdown`（已下线）/ `Retiring`（即将下线）的模型，避免列表中出现无法调用的模型（该 `status` 语义为火山方舟特有，其他提供商不采用）。

#### 3.5.3. 策略工厂（LLMStrategyFactory）

通过单例注册中心根据 `llm_provider_title` 与 `llm_provider_url` 动态分发策略，未命中特殊规则时自动安全回退至通用 `OpenAIStrategy`，并支持运行时注册第三方扩展策略。

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
| llm_brief | LLM 摘要 | STRING | Y | | 用于 LLMCore 动态模型选择排名 |
| llm_type | LLM 类型 | STRING | N | 普通索引 | text / vision / embedding，默认 text |
| enable | 是否启用 | BOOLEAN | N | | 默认 true |
| is_default | 是否为默认模型 | BOOLEAN | N | | 默认 false，系统仅一个默认模型 |
| max_tokens | 最大 Token 数 | INT | Y | | 不超过 llm_cache.max_tokens |
| model_usage | 模型用途 | STRING | Y | | 描述模型典型用途（如代码生成、长文本写作），用于 LLMCore 动态模型选择排名，默认空字符串 |
| UNIQUE | 唯一约束 | - | - | (llm_provider_id, llm_title) | 同一提供商下模型名唯一 |

### 4.4. llm_usage 表（调用统计）

- `表名`： llm_usage
- `说明`： 按天统计每次成功调用的次数与 Token 用量

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| llm_available_id | 可用模型 ID | STRING | N | 普通索引 | 关联 llm_available.id |
| usage_date | 使用日期 | STRING | N | 普通索引 | 格式：YYYY-MM-DD |
| usage_count | 当日使用次数 | INT | N | | 默认 0 |
| input_tokens | 当日累计输入 Token 数 | INT | N | | 默认 0 |
| output_tokens | 当日累计输出 Token 数 | INT | N | | 默认 0 |

**重要**：仅当 `execLLM` / `embedLLM` 调用成功时，当天的 usage_count 加 1 并累计 `input_tokens` / `output_tokens`（对话补全取 `prompt_tokens`/`completion_tokens`，向量化仅累计 `prompt_tokens`）。

### 4.4b. llm_call_log 表（Token 明细账，LLMProvider 统一管理）

- `表名`： llm_call_log
- `说明`： 每次 LLM 成功调用记一条，只记模型提供商返回的 usage 真实值，不做字符数预测；支持按 session / run / work 三级分级统计

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | | 毫秒时间戳 |
| llm_available_id | 可用模型 ID | STRING | N | | 关联 llm_available.id |
| session_id | 会话标识 | STRING | N | 普通索引 | chat session_key |
| run_id | 一次问答标识 | STRING | N | 普通索引 | = runtime_run.id（2026-09-14 老 interact_id 列 RENAME 而来） |
| work_id | 一次 Agent/Tool 执行标识 | STRING | N | 普通索引 | 执行框架在执行前生成 |
| caller | 调用方来源标识 | STRING | N | | 发起调用的组件（如 EvolutorAgent.evalWorkAgent） |
| llm_title | 被调用模型名称快照 | STRING | N | | 删模型后仍可读 |
| llm_type | 被调用模型类型快照 | STRING | N | | text / vision / embedding |
| status | 调用状态 | STRING | N | | ok / error |
| error_code | 错误码 | STRING | N | | status=error 时记录 |
| input_tokens | 输入 Token 数 | INT | N | | 提供商返回 |
| output_tokens | 输出 Token 数 | INT | N | | 提供商返回 |
| duration_ms | 调用耗时 | INT | N | | 毫秒 |

### 4.4b-1. 业务维度传播（2026-09-14 业务/可观测 ID 分离）

- **两套 ID 体系正交**：业务 ID（`session_id → run_id → work_id`）用于统计聚合（2026-09-14 最终定名：原 interact_id 维度统一更名为 run_id）；`trace_id` 属可观测体系，不参与统计聚合、不与业务 ID 互代。
- **维度随 Context 传播**：`Context` 基类统一携带 `session_id / run_id / work_id / caller`；`LLMService.applyDims` 在 `execLLM / execLLMEvents / embedLLM` 入口按「Context 优先、Input 回退」解析，调用方无需逐层透传入参。
- **work_id 定位**：一次 Agent/Tool 执行（Agent 私有），由执行框架（RunGateway/Loop）在每次执行前生成并存入 Response；一次问答（run_id）下含多个 work：Agent 选择、Work Agent Loop、评估、写作、意图识别、向量化等各自一个 work_id。
- **入账覆盖（全量）**：意图识别（IntentAgent）、Agent 选择（AgentDefService L3 + AgentLibrary 二层打分）、Work Agent Loop（AgentLoopService）、评估（EvolutorAgent 两条链路）、写作（WriterAgent 主/回退路径）、LLM 组件选择（LLMCoreService.matchLLM）、Soul 比较（compareSouls）、Skill/MCP/Soul 组件选择与向量化（Core match flows）、上下文向量化与标签提取（InfoCore）均已接入维度入账；系统级后台流（UserProfile / SelfLearning / Planner / Summary / AgentBuilder / genLLMAttr / 配置端调试）落 `caller` 来源归因。
- 查询：`soTokenUsage({session_id?, run_id?, work_id?, caller?})` → `{input_tokens, output_tokens, call_count}`；HTTP：`GET /api/llm/token-usage?session_id=&run_id=&work_id=&caller=`。
- 运行概览 `trace.run` 取 `llm_call_log WHERE run_id=<runtime_run.id>` 求和得 `inputTokens/outputTokens`（覆盖该次问答全部 Agent/Tool 执行），为空时回退 `runtime_message.token_count`（输出侧真实值），仍不预测。

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
6. `execLLM` 采用显式类型字段（`prompt` 必填、`system`、`temperature`、`max_tokens` 可选）承接参数，`extra` 承接其他透传参数原样进入请求体；
7. `execLLM` 的模型解析具备统一三级兜底：当 ID 为空或指定模型不存在/未启用时，依次回退至 1) 系统默认模型（`is_default=1`） -> 2) 系统首个启用的可用模型；
8. 网络请求与代理支持：`fetchWithTimeout` 自动感知系统 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` 环境变量并通过代理 Agent 转发外部请求，本地地址（`localhost` / `127.0.0.1`）自动绕过代理直连；
9. 提供商认证适配：OpenAI 兼容协议使用 `Authorization: Bearer <API_KEY>`，Google Gemini API 自动采用 `x-goog-api-key` 头部与 URL `?key=` 参数认证（避免发送 Bearer 导致 Google 误识别为 OAuth2 报 401）；
10. Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`；
11. 节点/记录的系统字段（`id`、`created`、`updated`）由 Provider 维护，不可通过 Data 对象修改；
12. `enableLLM` 为运行时启用/禁用（可恢复），启用/禁用状态持久化到 `llm_config`；
13. 所有写操作推荐使用 `transactionDB` 保证原子性；
14. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；


## 6. 代码变更记录

### 2026-08-29 DDD 重构

- 方法签名统一为五参 `(Input, Output, Context, Metrics, Report)`。
- 补录 `soLLMById`（按 ID 精查 LLM；与列表搜索 soLLM 并存，采用 soXxxById 消歧命名）。
- 模型缓存数据处理下沉领域服务 `domain/services/LLMCacheDomainService.ts`：缓存新鲜度判定（isModelsCacheFresh / TTL 6h）、远端错误详情提取（extractRemoteErrorDetail）、llm_cache 插入/更新字段映射（toCacheInsertRecord / toCacheUpdatePatch，复用 RecordBuilder）。
- strategies/ 目录维持 Strategy + Factory + Template Method（BaseLLMStrategy.buildEndpoint/buildHeaders 钩子）。
- 应用服务瘦身为流程编排；listLLM 不再内联字段映射。

### [2026-09-11] execLLM / execLLMEvents 成功路径回填 Metrics LLM 调用统计

**变更原因**：全仓无"单次 LLM 调用"粒度的 token/耗时统计（llm_usage 仅按天聚合），复盘 interact 65f80eb3 延迟时无法精确归因。

**修改的方法**：
  - `Base/shared/base/Metrics.ts` — 新增 `LLMCallUsageMetrics` 接口与 `Metrics.llm_usage` 字段、`recordLLMUsage(usage)` / `summarizeLLMUsage()`。
  - `LLMService.execLLM` / `execLLMEvents` — 成功路径调用新增 `recordLLMCallMetrics(metrics, {...})`：Metrics.recordLLMUsage 记 token 与单次耗时，并落 INFO 日志（`LLM call: X in / Y out tokens in Zms`，含 llm_id/attempt/category/trace_id，监控页可按 TraceId 关联）。
  - 上游 Loop（`AgentLoopService.callLLMTurn`）已随后透传 `ctx.metrics`，聊天链路可与 run 关联。

**影响的端点**：
  - `POST /api/chat/stream` 及所有经 execLLM/execLLMEvents 的调用 — 每次成功调用多一条小时延遥测日志；语义：duration_ms 为最终成功候选本次耗时，attempt 给出降级序号。

**可能存在的问题**：
  - metrics.llm_usage 为内存实例字段，仅随 AOP invocation 序列化（DEBUG 级）与显式 INFO 遥测日志落库；调用方未传 run 级 metrics 时 invocation_json 不携带。

### [2026-09-22] LLMSchemaInitializer DDL 收敛为数据驱动表

**变更原因**：`init` 以 DDL 字符串堆砌达 257 行，超出方法长度约束（10–30 行）；按 DDDStandards §2「纯声明式内容允许通过数据驱动表收敛长度」执行重构。

**修改的方法**：
  - `LLMSchemaInitializer.init` — 55 条 DDL（6 CREATE TABLE + 25 CREATE INDEX/UNIQUE INDEX + 24 幂等容忍 ALTER/RENAME/DROP）逐字提取到类内私有数据表 `ddlStatements`（`string | { sql, ignoreReason }`）；`init` 仅循环执行，普通语句失败即抛出，带 `ignoreReason` 的迁移语句保持原 try/catch 幂等容忍语义，执行顺序不变。

**影响的端点**：无（逻辑零变更：SQL 序列经转译执行比对逐字一致；`LLMAccess.initialize` 行为不变）。

**可能存在的问题**：
  - 无。quota/caller 等列循环已展开为显式表项，新增迁移列时按表内既有格式追加即可。
