# LLMProvider API 文档

> 解耦 LLM 和系统，通过 Repository 设计模式为上层提供统一的 LLM 操作接口。
> 所有对 LLM 的操作都必须通过 LLMProvider，上层不可直接调用 LLM 提供商 API。
> 基于 RelationDBProvider（SQLite）实现，LLM 调用采用 OpenAI 兼容协议（`/v1/models`、`/v1/chat/completions`）。

## 依赖

```typescript
import { RelationDBAccess } from '@brian-agent/base/RelationDBProvider';
import { LLMAccess } from '@brian-agent/base/LLMProvider';

const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
await relationDb.initialize();

const llm = new LLMAccess(relationDb);
await llm.initialize();
```

## 方法签名

统一签名：`Promise<boolean> method(Input input, Context context, Output output)`

Boolean 返回值表示方法是否执行完成；实际数据通过 output 参数（引用传递）回传。

---

## LLM 提供商管理

### addLLMProvider - 新增 LLM 提供商

```typescript
import { AddLLMProviderInput, AddLLMProviderOutput, LLMContext } from '@brian-agent/base/LLMProvider';

const output = new AddLLMProviderOutput();
await llm.addLLMProvider(
  {
    data: {
      llm_provider_url: 'https://api.openai.com',
      llm_provider_title: 'OpenAI',
      llm_provider_brief: 'GPT 系列模型',
    },
  },
  new LLMContext(),
  output,
);
console.log(output.id);
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.llm_provider_url | string | Y | LLM 提供商地址 |
| data.llm_provider_title | string | Y | LLM 提供商名称 |
| data.llm_provider_brief | string | N | LLM 提供商摘要 |
| data.enable | boolean | N | 是否启用，默认 true |

返回：output.id 为新增的 LLM 提供商 ID。

---

### updateLLMProvider - 更新 LLM 提供商

支持按 ID 或按条件更新（id 与 conditions 至少传一个）。资源级启用/禁用通过修改 enable 字段实现。

```typescript
await llm.updateLLMProvider(
  { id: 'uuid-1', data: { llm_provider_title: 'OpenAI GPT', enable: false } },
  new LLMContext(),
  new UpdateLLMProviderOutput(),
);
```

返回：output.affected_rows 为影响行数。

---

### delLLMProvider - 删除 LLM 提供商

支持按 ID 批量删除或按条件删除（ids 与 conditions 至少传一个）。级联清理该提供商下关联的 llm_model 记录。

```typescript
await llm.delLLMProvider(
  { ids: ['uuid-1', 'uuid-2'] },
  new LLMContext(),
  new DelLLMProviderOutput(),
);
```

返回：output.affected_rows 为影响行数。

---

### soLLMProvider - 搜索 LLM 提供商

支持关键词（匹配 llm_provider_title）、条件过滤、排序、分页。

```typescript
const output = new SoLLMProviderOutput();
await llm.soLLMProvider(
  {
    keyword: 'OpenAI',
    page: { current: 1, size: 10 },
    order_by: [{ field: 'created', direction: 'DESC' }],
  },
  new LLMContext(),
  output,
);
console.log(output.list, output.total);
```

返回：output.list 为 LLM 提供商列表，output.total 为总数。

---

### testLLMProvider - 测试 LLM 提供商连接

向提供商地址发起 HTTP GET 连通性测试，返回连通状态和响应时间。只要收到 HTTP 响应即视为连通。

```typescript
const output = new TestLLMProviderOutput();
await llm.testLLMProvider(
  { id: 'uuid-1' },
  new LLMContext(),
  output,
);
console.log(output.connected, output.response_time_ms, output.status_code);
```

返回：output.connected 为是否连通，output.response_time_ms 为响应时间（毫秒），output.status_code 为 HTTP 状态码。

---

### listLLM - 获取 LLM 模型列表

从 LLM 提供商 API（GET /v1/models）获取可用的模型列表并 upsert 到 llm_model 表。

```typescript
const output = new ListLLMOutput();
await llm.listLLM(
  { llm_provider_id: 'uuid-1' },
  new LLMContext(),
  output,
);
console.log(output.list); // LLMModelRecord[]
```

返回：output.list 为该提供商下所有模型记录。

---

## LLM 模型管理

### addLLM - 新增 LLM

将一个 LLM 模型添加到启用列表（llm_enable 表）。

```typescript
const output = new AddLLMOutput();
await llm.addLLM(
  {
    data: {
      llm_provider_id: 'uuid-1',
      llm_title: 'gpt-4',
      llm_brief: 'GPT-4 通用模型',
      llm_usage: '对话',
    },
  },
  new LLMContext(),
  output,
);
console.log(output.id);
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data.llm_provider_id | string | Y | LLM 提供商 ID |
| data.llm_title | string | Y | LLM 名称 |
| data.llm_brief | string | N | LLM 摘要 |
| data.llm_usage | string | N | LLM 适用范围，默认空字符串 |
| data.enable | boolean | N | 是否启用，默认 true |

返回：output.id 为新增的 LLM ID（llm_enable.id）。

---

### delLLM - 删除 LLM

支持按 ID 批量删除或按条件删除（ids 与 conditions 至少传一个）。

```typescript
await llm.delLLM({ ids: ['uuid-1'] }, new LLMContext(), new DelLLMOutput());
```

返回：output.affected_rows 为影响行数。

---

### updateLLM - 更新 LLM

支持按 ID 或按条件更新（id 与 conditions 至少传一个）。仅允许更新 llm_enable 表中的信息，llm_provider_id 不可修改。资源级启用/禁用通过修改 enable 字段实现。

```typescript
await llm.updateLLM(
  { id: 'uuid-1', data: { llm_usage: '翻译', enable: false } },
  new LLMContext(),
  new UpdateLLMOutput(),
);
```

返回：output.affected_rows 为影响行数。

---

### getLLM - 获取 LLM

按 ID 或按条件获取第一条（id 与 conditions 至少传一个）。

```typescript
const output = new GetLLMOutput();
await llm.getLLM({ id: 'uuid-1' }, new LLMContext(), output);
console.log(output.llm);
```

返回：output.llm 为 LLM 信息（LLMEnableRecord），无匹配为 null。

---

### soLLM - 搜索 LLM

支持关键词（匹配 llm_title、llm_brief）、条件过滤、排序、分页。

```typescript
const output = new SoLLMOutput();
await llm.soLLM(
  {
    keyword: 'gpt',
    page: { current: 1, size: 10 },
    order_by: [{ field: 'created', direction: 'DESC' }],
  },
  new LLMContext(),
  output,
);
console.log(output.list, output.total);
```

返回：output.list 为 LLM 列表，output.total 为总数。

---

## LLM 调用

### execLLM - 调用 LLM

调用指定的 LLM 执行推理。采用 OpenAI 兼容协议 POST /v1/chat/completions。调用成功后自动更新 llm_usage 表当日使用次数 +1。

```typescript
const output = new ExecLLMOutput();
await llm.execLLM(
  {
    id: 'llm-enable-uuid-1',
    prompt: '你好，请介绍一下自己',
    params: {
      api_key: 'sk-xxx',
      temperature: 0.7,
      max_tokens: 1000,
      system: '你是一个友善的助手',
    },
  },
  new LLMContext(),
  output,
);
console.log(output.result);
console.log(output.usage); // { prompt_tokens, completion_tokens, total_tokens }
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | Y | LLM ID（llm_enable.id） |
| prompt | string | Y | 调用 prompt |
| params | object | N | 其他调用参数 |
| params.api_key | string | N | API 密钥（作为 Bearer Token） |
| params.model | string | N | 覆盖默认模型名（默认取 llm_enable.llm_title） |
| params.messages | array | N | 自定义消息列表（默认根据 prompt 构造单条 user 消息） |
| params.system | string | N | 系统提示词（追加为 system 消息） |
| params.temperature | number | N | 采样温度 |
| params.max_tokens | number | N | 最大生成 token 数 |

返回：output.result 为推理结果（回复内容），output.usage 为 Token 使用统计。调用失败时返回 false，output.error / output.error_code 携带错误信息。

> 重要：仅当 execLLM 调用成功时，当天的 llm_usage.usage_count 才会加 1。

---

## 可视化与运维

### visualizedLLM - 可视化数据

获取 LLM 服务的可视化信息。

```typescript
// 健康状态
const health = new VisualizedLLMOutput();
await llm.visualizedLLM({ scope: 'health' }, new LLMContext(), health);
// { connected, response_time_ms, enabled, provider_count, enabled_llm_count }

// 数据量
const volume = new VisualizedLLMOutput();
await llm.visualizedLLM({ scope: 'volume' }, new LLMContext(), volume);
// { provider_count, model_count, enabled_llm_count, usage_record_count }

// 磁盘占用
const disk = new VisualizedLLMOutput();
await llm.visualizedLLM({ scope: 'diskUsage' }, new LLMContext(), disk);
// { disk_usage_bytes, page_size, page_count }
```

| scope | 返回字段 | 说明 |
|-------|---------|------|
| health | connected, response_time_ms, enabled, provider_count, enabled_llm_count | 连接状态、响应时间、启用状态、提供商数、启用 LLM 数 |
| volume | provider_count, model_count, enabled_llm_count, usage_record_count | 提供商数、模型数、启用 LLM 数、调用记录数 |
| diskUsage | disk_usage_bytes, page_size, page_count | 磁盘占用、页大小、页数 |

---

### enableLLM - 启用/禁用 LLM 组件

运行时控制 LLM 组件的可用状态，状态持久化到 llm_config。禁用期间所有 LLM 操作将抛出 `ComponentDisabledError`。

```typescript
// 禁用
await llm.enableLLM({ enable: false }, new LLMContext(), new EnableLLMOutput());

// 启用
await llm.enableLLM({ enable: true }, new LLMContext(), new EnableLLMOutput());
```

注：closeLLM 为终态操作，执行后不可通过本方法恢复，需重新初始化组件。

---

### closeLLM - 关闭 LLM 组件连接

系统关闭时释放资源，终态操作。

```typescript
await llm.closeLLM(
  new CloseLLMInput(),
  new LLMContext(),
  new CloseLLMOutput(),
);
```

执行后组件不可再通过 `enableLLM(true)` 恢复，需重新初始化组件（new LLMAccess + initialize）。

---

## 表结构

### llm_provider 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 毫秒时间戳 |
| updated | INTEGER | 毫秒时间戳 |
| llm_provider_url | TEXT | LLM 提供商地址 |
| llm_provider_title | TEXT | LLM 提供商名称 |
| llm_provider_brief | TEXT | LLM 提供商摘要（可空） |
| enable | INTEGER | 是否启用 (0/1)，默认 1 |

索引：created、updated、llm_provider_title。

### llm_model 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 毫秒时间戳 |
| updated | INTEGER | 毫秒时间戳 |
| llm_provider_id | TEXT | 关联 llm_provider.id |
| llm_title | TEXT | LLM 名称 |
| llm_brief | TEXT | LLM 摘要（可空） |

索引：created、updated、llm_provider_id、llm_title。

### llm_enable 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 毫秒时间戳 |
| updated | INTEGER | 毫秒时间戳 |
| llm_provider_id | TEXT | 关联 llm_provider.id |
| llm_title | TEXT | LLM 名称 |
| llm_brief | TEXT | LLM 摘要（可空） |
| llm_usage | TEXT | LLM 适用范围 |
| enable | INTEGER | 是否启用 (0/1)，默认 1 |

索引：created、updated、llm_provider_id、llm_title、llm_usage。

### llm_usage 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 毫秒时间戳 |
| updated | INTEGER | 毫秒时间戳 |
| llm_enable_id | TEXT | 关联 llm_enable.id |
| usage_date | TEXT | YYYY-MM-DD |
| usage_count | INTEGER | 当日使用次数 |

索引：created、updated、llm_enable_id、usage_date。

> 仅当 `execLLM` 成功调用时，当天 usage_count 才会加 1。

### llm_config 表

配置表，键值对结构。

| 字段 | 类型 | 说明 |
|------|------|------|
| config_key | TEXT PK | 配置键 |
| config_value | TEXT | 配置值 |
| value_type | TEXT | 值类型（INT/DOUBLE/BOOLEAN/STRING） |
| description | TEXT | 说明（可空） |
| updated | INTEGER | 最后更新时间（毫秒时间戳） |

默认配置项：

| config_key | config_value | value_type | 说明 |
|------------|-------------|------------|------|
| enabled | true | BOOLEAN | LLM 组件是否启用（enableLLM 读写） |
| default_quota_tokens_per_day | 0 | INT | 默认每日 Token 限额（0 为不限制） |
| default_quota_tokens_per_week | 0 | INT | 默认每周 Token 限额 |
| default_quota_tokens_per_month | 0 | INT | 默认每月 Token 限额 |
| default_quota_calls_per_day | 0 | INT | 默认每日调用次数限额 |
| default_quota_calls_per_week | 0 | INT | 默认每周调用次数限额 |
| default_quota_calls_per_month | 0 | INT | 默认每月调用次数限额 |

---

## 错误处理

| 错误 | error_code | 触发场景 |
|------|-----------|---------|
| ComponentDisabledError | COMPONENT_DISABLED | 组件未启用时执行任何操作 |
| ValidationError | VALIDATION_ERROR | 参数校验失败（如 url 为空、id 与 conditions 均未传） |
| NotFoundError | NOT_FOUND | 指定的 LLM 提供商 / LLM 不存在 |
| DatabaseError | DATABASE_ERROR | closeLLM 后再执行操作 |

网络类错误（testLLMProvider / listLLM / execLLM）不抛出异常，而是通过 output.error / output.error_code 返回，方法返回 false：

| error_code | 触发场景 |
|-----------|---------|
| CONNECT_ERROR | 网络不可达 / DNS 解析失败 / 请求超时 |
| REMOTE_ERROR | 收到 HTTP 响应但状态码非 2xx |
| INVALID_SCOPE | visualizedLLM 传入未知的 scope |

所有错误继承 ProviderError，携带 error_code 字段便于程序化处理。
