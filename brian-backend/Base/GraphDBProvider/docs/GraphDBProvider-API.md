# GraphDBProvider API 文档

> 解耦图数据库和系统，通过 Repository 设计模式为上层提供统一的图数据操作接口。
> 基于 RelationDBProvider（SQLite）实现，所有图数据表（节点、边、激活事件、按天激活统计）均存储于 SQLite。
> content / properties 字段以 JSON 字符串形式存储于 TEXT 字段，is_active 以 INTEGER（0/1）存储布尔值。

## 依赖

```typescript
import { RelationDBAccess } from '@brian-agent/base/RelationDBProvider';
import { GraphDBAccess } from '@brian-agent/base/GraphDBProvider';

const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
await relationDb.initialize();

const graphDb = new GraphDBAccess(relationDb);
await graphDb.initialize();
```

## 方法签名

统一签名：`Promise<boolean> method(Input input, Context context, Output output)`

Boolean 返回值表示方法是否执行完成；实际数据通过 output 参数（引用传递）回传。

---

## addGraphNode - 新增节点

幂等新增：校验是否已存在 content 相同的节点，若存在则直接返回其 ID，不重复创建。

```typescript
import {
  AddGraphNodeInput,
  AddGraphNodeOutput,
  GraphContext,
} from '@brian-agent/base/GraphDBProvider';

const output = new AddGraphNodeOutput();
await graphDb.addGraphNode(
  {
    data: {
      node_type: 'concept',
      content: { text: '示例节点', tags: ['tag1'] },
    },
  },
  new GraphContext(),
  output,
);
console.log(output.id);
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data | GraphNodeData | Y | 节点数据 |

GraphNodeData：

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| node_type | string | Y | 节点类型 |
| content | Record\<string, unknown\> | Y | 节点内容（JSON 对象） |

返回：output.id 为节点 ID（幂等新增时返回已存在节点的 ID）。

---

## getGraphNode - 获取节点

按 ID 获取节点完整信息，不存在返回 null。

```typescript
const output = new GetGraphNodeOutput();
await graphDb.getGraphNode({ id: 'uuid-1' }, new GraphContext(), output);
if (output.node) {
  console.log(output.node.node_type, output.node.content);
}
```

返回：output.node 为节点记录（含 id、created、updated、node_type、content），不存在为 null。

---

## updateGraphNode - 更新节点

更新指定节点的属性（node_type、content），系统字段不可更新。

```typescript
await graphDb.updateGraphNode(
  { id: 'uuid-1', data: { node_type: 'concept_v2', content: { text: '更新' } } },
  new GraphContext(),
  new UpdateGraphNodeOutput(),
);
```

返回：output.affected_rows 为影响行数。

---

## delGraphNode - 删除节点

按 ID 批量删除节点，级联删除关联的边，并清理激活事件表与按天激活统计表。

```typescript
await graphDb.delGraphNode(
  { ids: ['uuid-1', 'uuid-2'] },
  new GraphContext(),
  new DelGraphNodeOutput(),
);
```

返回：output.affected_rows 为影响行数。

---

## addGraphEdge - 新增边

在两个节点之间建立关系，校验起始节点和目标节点是否存在。

```typescript
const output = new AddGraphEdgeOutput();
await graphDb.addGraphEdge(
  {
    data: {
      from_node_id: 'node-1',
      to_node_id: 'node-2',
      edge_type: 'related',
      weight: 2.5, // 可选，默认取配置 default_weight（1.0）
      properties: { source: 'manual' }, // 可选
    },
  },
  new GraphContext(),
  output,
);
console.log(output.id);
```

GraphEdgeData：

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| from_node_id | string | Y | 起始节点 ID |
| to_node_id | string | Y | 目标节点 ID |
| edge_type | string | Y | 边类型 |
| weight | number | N | 权重，默认取配置 default_weight（1.0） |
| properties | Record\<string, unknown\> | N | 边属性 |

返回：output.id 为新增的边 ID。

---

## getGraphEdge - 获取边

按 ID 获取边完整信息，不存在返回 null。

```typescript
const output = new GetGraphEdgeOutput();
await graphDb.getGraphEdge({ id: 'edge-1' }, new GraphContext(), output);
if (output.edge) {
  console.log(output.edge.edge_type, output.edge.weight, output.edge.is_active);
}
```

返回：output.edge 为边记录（含 id、created、updated、from_node_id、to_node_id、edge_type、weight、properties、last_activation_time、is_active），不存在为 null。

---

## updateGraphEdge - 更新边

更新指定边的属性。若 from_node_id / to_node_id 变更，校验新端点节点存在。
last_activation_time、is_active 由激活 / 老化机制维护，不可通过本方法修改。

```typescript
await graphDb.updateGraphEdge(
  { id: 'edge-1', data: { weight: 3.0, edge_type: 'strong' } },
  new GraphContext(),
  new UpdateGraphEdgeOutput(),
);
```

返回：output.affected_rows 为影响行数。

---

## delGraphEdge - 删除边

按 ID 批量删除边，并清理关联的激活事件记录与按天激活统计记录。

```typescript
await graphDb.delGraphEdge(
  { ids: ['edge-1', 'edge-2'] },
  new GraphContext(),
  new DelGraphEdgeOutput(),
);
```

返回：output.affected_rows 为影响行数。

---

## selectGraph - 查询图数据

查询节点或边，支持按类型过滤、条件过滤、排序、分页。

```typescript
// 查询节点
const nodeOutput = new SelectGraphOutput();
await graphDb.selectGraph(
  {
    target: 'node',
    node_type: 'concept',
    conditions: [{ field: 'created', operator: 'GT', value: 1700000000000 }],
    order_by: [{ field: 'created', direction: 'DESC' }],
    page: { current: 1, size: 10 },
  },
  new GraphContext(),
  nodeOutput,
);
console.log(nodeOutput.list, nodeOutput.total);

// 查询边
const edgeOutput = new SelectGraphOutput();
await graphDb.selectGraph(
  {
    target: 'edge',
    edge_type: 'related',
    conditions: [{ field: 'is_active', operator: 'EQ', value: 1 }],
  },
  new GraphContext(),
  edgeOutput,
);
console.log(edgeOutput.list, edgeOutput.total);
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| target | 'node' \| 'edge' | Y | 查询目标 |
| node_type | string | N | 按节点类型过滤（target=node 时生效） |
| edge_type | string | N | 按边类型过滤（target=edge 时生效） |
| conditions | Condition[] | N | 查询条件 |
| order_by | OrderBy[] | N | 排序字段列表 |
| page | Page | N | 分页参数 |

返回：output.list 为结果列表（GraphNodeRecord 或 GraphEdgeRecord），output.total 为总记录数。

---

## getGraphNeighbors - 获取邻居节点

从指定节点开始多跳遍历，返回 depth 范围内的所有邻居节点（不含起始节点）。

```typescript
const output = new GetGraphNeighborsOutput();
await graphDb.getGraphNeighbors(
  {
    node_id: 'node-1',
    depth: 2, // 可选，默认取配置 default_depth（1）
    direction: 'BOTH', // 可选，OUT / IN / BOTH（默认 BOTH）
    edge_type: 'related', // 可选，按边类型过滤
    only_active: true, // 可选，默认取配置 default_only_active（true）
  },
  new GraphContext(),
  output,
);
console.log(output.list);
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| node_id | string | Y | 起始节点 ID |
| depth | number | N | 遍历深度，默认取配置 default_depth（1） |
| edge_type | string | N | 按边类型过滤 |
| direction | 'OUT' \| 'IN' \| 'BOTH' | N | 遍历方向，默认 BOTH |
| only_active | boolean | N | 是否仅遍历激活边，默认取配置 default_only_active（true） |

处理流程：

1. 从 node_id 开始作为初始 frontier；
2. 对每一深度层级（1 到 max_depth）：
   - 根据 direction 查询与当前 frontier 匹配的边；
   - 应用 edge_type 过滤、is_active 过滤；
   - 收集邻居节点 ID（对向端点）；
3. 返回所有唯一邻居节点（不含起始节点）。

返回：output.list 为邻居节点列表（GraphNodeRecord[]）。

---

## activateGraphEdge - 激活边

记录激活事件并按天累计激活次数，更新边的 last_activation_time 与 is_active。

```typescript
await graphDb.activateGraphEdge(
  { edge_id: 'edge-1', trigger_type: 'user_query' }, // trigger_type 可选，默认取配置 default_trigger_type
  new GraphContext(),
  new ActivateGraphEdgeOutput(),
);
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| edge_id | string | Y | 边 ID |
| trigger_type | string | N | 触发类型，默认取配置 default_trigger_type（user_query） |

处理流程：

1. 校验边是否存在；
2. 在激活事件表记录本次激活事件；
3. 在按天激活统计表递增当日计数（upsert）；
4. 更新边的 last_activation_time 为当前时间戳，is_active 置为 true。

---

## ageGraphEdge - 老化边

基于保留窗口内的激活数量老化边，将近期不活跃的边标记为非激活状态，并清理过期激活数据。

```typescript
const output = new AgeGraphEdgeOutput();
await graphDb.ageGraphEdge(
  new AgeGraphEdgeInput(),
  new GraphContext(),
  output,
);
console.log(output.aged_count);
```

处理流程：

1. 从配置表读取 retention_days（保留天数，默认 30）、min_activation_count（最小激活次数阈值，默认 5）；
2. 扫描所有激活状态的边（is_active = true）；
3. 对每条边按保留窗口判定是否需要老化：
   - 统计该边在最近 retention_days 天内的激活总数；
   - 若边已度过完整保留窗口的观察期，且窗口内激活总数小于 min_activation_count，则老化；
   - 未满 retention_days 观察期的新边不参与老化；
4. 对符合条件的边标记为非激活状态；
5. 清理过期的按天激活统计与激活事件数据。

返回：output.aged_count 为老化的边数量。

---

## visualizedGraph - 可视化数据

获取图数据库的可视化信息。

```typescript
// 健康状态
const health = new VisualizedGraphOutput();
await graphDb.visualizedGraph({ scope: 'health' }, new GraphContext(), health);
// { connected: true, response_time_ms: 1, enabled: true }

// 数据量
const volume = new VisualizedGraphOutput();
await graphDb.visualizedGraph({ scope: 'volume' }, new GraphContext(), volume);
// { total_nodes: 100, total_edges: 200, total_activation_events: 500 }

// 磁盘占用
const disk = new VisualizedGraphOutput();
await graphDb.visualizedGraph({ scope: 'diskUsage' }, new GraphContext(), disk);
// { disk_usage_bytes: 40960, page_size: 4096, page_count: 10 }
```

| scope | 返回字段 | 说明 |
|-------|---------|------|
| health | connected, response_time_ms, enabled | 连接状态、响应时间、启用状态 |
| volume | total_nodes, total_edges, total_activation_events | 节点数、边数、激活事件数 |
| diskUsage | disk_usage_bytes, page_size, page_count | 磁盘占用、页大小、页数 |

---

## enableGraphDB - 启用/禁用图数据库

运行时控制图数据库的可用状态，状态持久化到 graphdb_config。

```typescript
// 禁用
await graphDb.enableGraphDB(
  { enable: false },
  new GraphContext(),
  new EnableGraphDBOutput(),
);

// 启用
await graphDb.enableGraphDB(
  { enable: true },
  new GraphContext(),
  new EnableGraphDBOutput(),
);
```

禁用期间所有图数据操作将抛出 `ComponentDisabledError`。
注：closeGraphDB 为终态操作，执行后不可通过本方法恢复。

---

## closeGraphDB - 关闭图数据库连接

系统关闭时释放资源，终态操作。

```typescript
await graphDb.closeGraphDB(
  new CloseGraphDBInput(),
  new GraphContext(),
  new CloseGraphDBOutput(),
);
```

执行后组件不可再通过 `enableGraphDB(true)` 恢复，需重新初始化组件（new GraphDBAccess + initialize）。

---

## 表结构

### graph_node 表

图节点表，content 以 JSON 字符串形式存储于 TEXT 字段。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 创建时间（毫秒时间戳） |
| updated | INTEGER | 最后更新时间（毫秒时间戳） |
| node_type | TEXT | 节点类型 |
| content | TEXT | 节点内容（JSON 字符串） |

索引：created、updated、node_type。

### graph_edge 表

图边表，关系端点 from_node_id / to_node_id 作为属性字段存储。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 创建时间（毫秒时间戳） |
| updated | INTEGER | 最后更新时间（毫秒时间戳） |
| from_node_id | TEXT | 起始节点 ID |
| to_node_id | TEXT | 目标节点 ID |
| edge_type | TEXT | 边类型 |
| weight | REAL | 权重（默认 1.0） |
| properties | TEXT | 边属性（JSON 字符串，可空） |
| last_activation_time | INTEGER | 最后激活时间（毫秒时间戳，可空） |
| is_active | INTEGER | 是否激活（0/1，默认 1） |

索引：created、updated、from_node_id、to_node_id、edge_type、is_active。

### graph_activation_event 表

激活事件表，记录每次边激活的快照。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 创建时间（毫秒时间戳） |
| updated | INTEGER | 最后更新时间（毫秒时间戳） |
| graph_edge_id | TEXT | 关联 graph_edge.id |
| from_node_id | TEXT | 起始节点 ID（激活时刻快照） |
| to_node_id | TEXT | 目标节点 ID（激活时刻快照） |
| activation_time | INTEGER | 激活时间（毫秒时间戳） |
| trigger_type | TEXT | 触发类型 |

索引：created、updated、graph_edge_id、activation_time。

### graph_edge_daily_activation 表

按天激活统计表，以 (graph_edge_id, stat_date) 为业务唯一键。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 创建时间（毫秒时间戳） |
| updated | INTEGER | 最后更新时间（毫秒时间戳） |
| graph_edge_id | TEXT | 关联 graph_edge.id |
| stat_date | TEXT | 统计日期（YYYY-MM-DD） |
| activation_count | INTEGER | 当日激活次数（初始 1） |

索引：created、updated、graph_edge_id、stat_date、(graph_edge_id, stat_date) 唯一约束。

### graphdb_config 表

配置表，键值对结构，存储于关系数据库。

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
| enabled | true | BOOLEAN | 图数据库是否启用 |
| retention_days | 30 | INT | 激活统计保留天数 |
| min_activation_count | 5 | INT | 窗口内最小激活次数阈值 |
| default_trigger_type | user_query | STRING | 默认触发类型 |
| default_weight | 1.0 | DOUBLE | 默认边权重 |
| default_depth | 1 | INT | 默认遍历深度 |
| default_only_active | true | BOOLEAN | 默认仅遍历激活边 |

---

## 错误处理

| 错误 | error_code | 触发场景 |
|------|-----------|---------|
| ComponentDisabledError | COMPONENT_DISABLED | 组件未启用时执行任何操作 |
| ValidationError | VALIDATION_ERROR | 参数校验失败（如 ids 为空、必填字段缺失） |
| NotFoundError | NOT_FOUND | 节点 / 边不存在（addGraphEdge 端点校验、updateGraphEdge 边校验等） |
| DatabaseError | DATABASE_ERROR | closeGraphDB 后再执行操作 |

所有错误继承 ProviderError，携带 error_code 字段便于程序化处理。
