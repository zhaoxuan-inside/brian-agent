# VectorDBProvider API 文档

> 解耦向量数据库和系统，通过 Repository 设计模式为上层提供统一的向量数据操作接口。
> 基于 RelationDBProvider（SQLite）实现，向量数据以 JSON 字符串形式存储于 TEXT 字段。
> 相似度搜索采用暴力扫描 + 余弦相似度计算。

## 依赖

```typescript
import { RelationDBAccess } from '@brian-agent/base/RelationDBProvider';
import { VectorDBAccess } from '@brian-agent/base/VectorDBProvider';

const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
await relationDb.initialize();

const vectorDb = new VectorDBAccess(relationDb);
await vectorDb.initialize();
```

## 方法签名

统一签名：`Promise<boolean> method(Input input, Context context, Output output)`

Boolean 返回值表示方法是否执行完成；实际数据通过 output 参数（引用传递）回传。

---

## addVector - 新增/更新向量

upsert 语义：id 已存在则更新，否则新增（不指定 id 时自动生成）。

```typescript
import { AddVectorInput, AddVectorOutput, VectorContext } from '@brian-agent/base/VectorDBProvider';

const output = new AddVectorOutput();
await vectorDb.addVector(
  {
    vectors: [
      {
        content: '你好世界',
        embedding: [0.1, 0.2, 0.3, 0.4],
        user_id: 'user_001',
        metadata: { source: 'doc', tag: 1 },
      },
      {
        id: 'custom-id-001',
        content: '第二条',
        embedding: [0.5, 0.6, 0.7, 0.8],
      },
    ],
  },
  new VectorContext(),
  output,
);
console.log(output.ids); // ['uuid-1', 'custom-id-001']
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| vectors | VectorObject[] | Y | 向量数据对象列表 |

VectorObject：

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | N | 向量 ID，不指定则自动生成 |
| content | string | Y | 原始文本内容 |
| embedding | number[] | Y | 向量数据（浮点数组） |
| user_id | string | N | 用户 ID |
| metadata | Record<string, unknown> | N | 元数据 |

返回：output.ids 为新增/更新的向量 ID 列表（顺序与入参一致）。

---

## delVector - 删除向量

按 ID 批量删除。

```typescript
await vectorDb.delVector(
  { ids: ['uuid-1', 'uuid-2'] },
  new VectorContext(),
  new DelVectorOutput(),
);
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ids | string[] | Y | 向量 ID 列表 |

返回：output.affected_rows 为影响行数。

---

## delVectorByFilter - 按条件删除向量

按元数据条件批量删除。

```typescript
await vectorDb.delVectorByFilter(
  {
    filters: [
      { field: 'source', operator: 'EQ', value: 'doc' },
      { field: 'tag', operator: 'LT', value: 5 },
    ],
  },
  new VectorContext(),
  new DelVectorByFilterOutput(),
);
```

VectorFilter：

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| field | string | Y | 元数据字段名（或 'user_id'） |
| operator | string | Y | EQ/NE/GT/LT/GE/LE/IN/NOT_IN/IS_NULL/IS_NOT_NULL |
| value | any | N | 比较值（IS_NULL/IS_NOT_NULL 时可为空） |
| logic | string | N | 与前一条件的逻辑关系，AND（默认）/ OR |

返回：output.affected_rows 为删除的向量数量。

---

## soVector - 搜索向量

基于余弦相似度搜索最相似的向量，支持元数据条件过滤。

```typescript
const output = new SoVectorOutput();
await vectorDb.soVector(
  {
    query_param: {
      embedding: [0.1, 0.2, 0.3, 0.4],
      top_k: 5,
      similarity_threshold: 0.5,
      user_id: 'user_001',
      filters: [
        { field: 'source', operator: 'EQ', value: 'doc' },
      ],
    },
  },
  new VectorContext(),
  output,
);
console.log(output.list); // [{ id, content, score, user_id, metadata }]
```

VectorQueryParam：

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| embedding | number[] | Y | 查询向量 |
| top_k | number | N | 返回数量，默认取配置 default_top_k（10） |
| similarity_threshold | number | N | 相似度阈值，默认取配置 default_similarity_threshold（0.0） |
| filters | VectorFilter[] | N | 元数据过滤条件 |
| user_id | string | N | 按用户过滤 |

处理流程：

1. 未指定 top_k / similarity_threshold 时从 vectordb_config 读取默认值；
2. 加载全部向量，应用 user_id 与 metadata 过滤（先过滤再计算相似度）；
3. 计算余弦相似度，过滤低于阈值的结果；
4. 按相似度降序排序，取前 top_k 条。

返回：output.list 为搜索结果列表（按相似度降序），每项含 id、content、score、user_id、metadata。

---

## getVector - 获取向量

按 ID 获取向量完整信息。

```typescript
const output = new GetVectorOutput();
await vectorDb.getVector({ id: 'uuid-1' }, new VectorContext(), output);
if (output.vector) {
  console.log(output.vector.content, output.vector.embedding);
}
```

返回：output.vector 为向量记录（含 content、embedding、user_id、metadata、created、updated），不存在为 null。

---

## countVector - 统计向量数量

按元数据条件统计，不指定 filters 则统计全部。

```typescript
const output = new CountVectorOutput();
await vectorDb.countVector(
  { filters: [{ field: 'source', operator: 'EQ', value: 'doc' }] },
  new VectorContext(),
  output,
);
console.log(output.count);
```

返回：output.count 为向量数量。

---

## visualizedVector - 可视化数据

获取向量数据库的可视化信息。

```typescript
// 健康状态
const health = new VisualizedVectorOutput();
await vectorDb.visualizedVector({ scope: 'health' }, new VectorContext(), health);
// { connected: true, response_time_ms: 1, enabled: true }

// 数据量
const volume = new VisualizedVectorOutput();
await vectorDb.visualizedVector({ scope: 'volume' }, new VectorContext(), volume);
// { total_vectors: 100, collection: 'vector_record', dimension: 768 }

// 磁盘占用
const disk = new VisualizedVectorOutput();
await vectorDb.visualizedVector({ scope: 'diskUsage' }, new VectorContext(), disk);
// { disk_usage_bytes: 40960, page_size: 4096, page_count: 10 }
```

| scope | 返回字段 | 说明 |
|-------|---------|------|
| health | connected, response_time_ms, enabled | 连接状态、响应时间、启用状态 |
| volume | total_vectors, collection, dimension | 向量总数、集合名、维度 |
| diskUsage | disk_usage_bytes, page_size, page_count | 磁盘占用、页大小、页数 |

---

## enableVectorDB - 启用/禁用向量数据库

运行时控制向量数据库的可用状态，状态持久化到 vectordb_config。

```typescript
// 禁用
await vectorDb.enableVectorDB(
  { enable: false },
  new VectorContext(),
  new EnableVectorDBOutput(),
);

// 启用
await vectorDb.enableVectorDB(
  { enable: true },
  new VectorContext(),
  new EnableVectorDBOutput(),
);
```

禁用期间所有向量数据操作将抛出 `ComponentDisabledError`。
注：closeVectorDB 为终态操作，执行后不可通过本方法恢复。

---

## closeVectorDB - 关闭向量数据库连接

系统关闭时释放资源，终态操作。

```typescript
await vectorDb.closeVectorDB(
  new CloseVectorDBInput(),
  new VectorContext(),
  new CloseDBOutput(),
);
```

执行后组件不可再通过 `enableVectorDB(true)` 恢复，需重新初始化组件（new VectorDBAccess + initialize）。

---

## 表结构

### vector_record 表

向量数据存储表，embedding 以 JSON 字符串形式存储于 TEXT 字段。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| content | TEXT | 原始文本内容 |
| embedding | TEXT | 向量数据（JSON 数组字符串） |
| user_id | TEXT | 用户 ID（可空） |
| metadata | TEXT | 元数据（JSON 字符串，可空） |
| created | INTEGER | 创建时间（毫秒时间戳） |
| updated | INTEGER | 最后更新时间（毫秒时间戳） |

索引：user_id、created、updated。

### vectordb_config 表

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
| enabled | true | BOOLEAN | 向量数据库是否启用 |
| default_top_k | 10 | INT | 默认返回结果数量 |
| default_similarity_threshold | 0.0 | DOUBLE | 默认相似度阈值 |
| default_distance_metric | COSINE | STRING | 默认距离度量方式 |

---

## 错误处理

| 错误 | error_code | 触发场景 |
|------|-----------|---------|
| ComponentDisabledError | COMPONENT_DISABLED | 组件未启用时执行任何操作 |
| ValidationError | VALIDATION_ERROR | 参数校验失败（如 vectors 为空） |
| DatabaseError | DATABASE_ERROR | closeVectorDB 后再执行操作 |

所有错误继承 ProviderError，携带 error_code 字段便于程序化处理。
