# GraphDB Provider

## 1. 设计目标

1. 解耦图数据库和系统，通过 Repository 设计模式为上层提供统一的图数据操作接口；
2. 所有对图数据的操作都不能直接进行，都必须要通过 GraphDBProvider；
3. 负责图数据（节点 Node、边 Edge）的 CURD 操作；
4. 提供图遍历能力（邻居查询、多跳遍历）；
5. 提供图数据生命周期管理能力，包括边的激活机制与老化机制，维护图数据的有效性；
6. 提供可视化数据接口，支持图数据库健康状态监控；
7. 图数据库组件基于 SQLite + CTE 实现，通过 better-sqlite3 操作本地数据库文件；

## 2. 对象定义

> 以下对象贯穿各功能接口，统一定义如下。
> Input、Context、Output 为项目通用基类，参见 `_00_DevStandardization.md`。
> Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不再重复定义。

### 2.1. 图上下文（GraphContext）

继承 Context 基类，图数据相关操作的执行上下文。

### 2.2. 节点数据对象（GraphNodeData）

用于新增节点；更新节点时使用 `Partial<GraphNodeData>` 仅传入待更新字段。节点 `id`、`created`、`updated` 为系统字段，由 Provider 维护，不通过 Data 对象传入。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| node_type | STRING | Y | 节点类型 |
| content | JSON | Y | 节点内容 |

### 2.3. 边数据对象（GraphEdgeData）

用于新增边；更新边时使用 `Partial<GraphEdgeData>` 仅传入待更新字段。边 `id`、`created`、`updated`、`last_activation_time`、`is_active` 为系统字段，由 Provider 维护，不通过 Data 对象修改。边的激活次数不再以累计字段存储，改由按天激活统计表（见 4.4）维护，详见 3.4。

`from_node_id`、`to_node_id` 用于在新增边时指定关系的起始节点和目标节点，新增时必填。SQLite 表中 `from_node_id` / `to_node_id` 作为属性字段存储，表示关系端点。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| from_node_id | STRING | Y | 起始节点 ID（仅新增时必填，用于指定关系端点） |
| to_node_id | STRING | Y | 目标节点 ID（仅新增时必填，用于指定关系端点） |
| edge_type | STRING | Y | 边类型 |
| weight | DOUBLE | N | 权重，默认值由配置 `default_weight` 决定（默认 1.0） |
| properties | JSON | N | 边属性 |

## 3. 功能设计

### 3.1. 节点管理

#### 3.1.1. 新增节点（addGraphNode）

**功能**：向图数据库中新增一个节点

**方法签名**：`Boolean addGraphNode(AddGraphNodeInput input, GraphContext context, AddGraphNodeOutput output)`

**入参（AddGraphNodeInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | GraphNodeData | Y | 节点数据 |

**处理流程**：

1. 校验是否已存在 `content` 相同的节点；若存在则直接将其 id 通过 output 参数返回（幂等新增，不重复创建）；
2. 生成节点唯一 id；
3. 通过图数据库接口新增节点，写入 `node_type`、`content`，并初始化系统字段 `created`、`updated` 为当前时间戳；
4. 节点 id 通过 output 参数返回；

**返回**：Boolean，表示新增是否完成

#### 3.1.2. 获取节点（getGraphNode）

**功能**：获取图数据库中的指定节点

**方法签名**：`Boolean getGraphNode(GetGraphNodeInput input, GraphContext context, GetGraphNodeOutput output)`

**入参（GetGraphNodeInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | 节点 ID |

**处理流程**：

1. 通过图数据库接口获取指定节点的完整信息；
2. 若节点不存在返回空；

**返回**：Boolean，表示查询是否完成；节点信息通过 output 参数返回

#### 3.1.3. 更新节点（updateGraphNode）

**功能**：更新图数据库中的指定节点

**方法签名**：`Boolean updateGraphNode(UpdateGraphNodeInput input, GraphContext context, UpdateGraphNodeOutput output)`

**入参（UpdateGraphNodeInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | 节点 ID |
| data | Partial\<GraphNodeData\> | Y | 待更新的字段（`node_type`、`content`，系统字段不可更新） |

**处理流程**：

1. 通过图数据库接口更新指定节点的属性；
2. 更新节点的 `updated` 为当前时间戳；

**返回**：Boolean，表示更新是否完成

#### 3.1.4. 删除节点（delGraphNode）

**功能**：删除图数据库中的指定节点，支持按 ID 批量删除

**方法签名**：`Boolean delGraphNode(DelGraphNodeInput input, GraphContext context, DelGraphNodeOutput output)`

**入参（DelGraphNodeInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| ids | STRING[] | Y | 节点 ID 列表（支持批量） |

**处理流程**：

1. 通过图数据库接口删除指定节点（DETACH DELETE），级联删除与该节点关联的所有边；
2. 清理激活事件表（graph_activation_event）中引用该节点的记录（`from_node_id` 或 `to_node_id` 命中）；
3. 清理按天激活统计表（graph_edge_daily_activation）中归属于被级联删除边的记录（`graph_edge_id` 命中）；
4. 影响行数通过 output 参数返回；

**返回**：Boolean，表示删除是否完成；影响行数通过 output 参数返回

### 3.2. 边管理

#### 3.2.1. 新增边（addGraphEdge）

**功能**：向图数据库中新增一条边（关系）

**方法签名**：`Boolean addGraphEdge(AddGraphEdgeInput input, GraphContext context, AddGraphEdgeOutput output)`

**入参（AddGraphEdgeInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | GraphEdgeData | Y | 边数据 |

**处理流程**：

1. 校验起始节点（`from_node_id`）和目标节点（`to_node_id`）是否存在，不存在则失败；
2. 生成边唯一 id；
3. 通过图数据库接口在两个节点之间建立关系（Rel），写入 `edge_type`、`weight`（未指定时取配置 `default_weight`，默认 1.0）、`properties`；
4. 初始化系统字段：`created`、`updated` 为当前时间戳，`is_active` 为 true，`last_activation_time` 为空；
5. 边 id 通过 output 参数返回；

**返回**：Boolean，表示新增是否完成；边 id 通过 output 参数返回

#### 3.2.2. 获取边（getGraphEdge）

**功能**：获取图数据库中的指定边

**方法签名**：`Boolean getGraphEdge(GetGraphEdgeInput input, GraphContext context, GetGraphEdgeOutput output)`

**入参（GetGraphEdgeInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | 边 ID |

**处理流程**：

1. 通过图数据库接口获取指定边的完整信息（含属性和两端节点）；
2. 若边不存在返回空；

**返回**：Boolean，表示查询是否完成；边信息通过 output 参数返回

#### 3.2.3. 更新边（updateGraphEdge）

**功能**：更新图数据库中的指定边

**方法签名**：`Boolean updateGraphEdge(UpdateGraphEdgeInput input, GraphContext context, UpdateGraphEdgeOutput output)`

**入参（UpdateGraphEdgeInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | 边 ID |
| data | Partial\<GraphEdgeData\> | Y | 待更新的字段 |

**处理流程**：

1. 若 `data` 中包含 `from_node_id` 或 `to_node_id`，由于图数据库关系端点不可直接修改，需先删除旧关系再基于新端点重建关系；
2. 通过图数据库接口更新指定边的属性（`edge_type`、`weight`、`properties`）；
3. 更新边的 `updated` 为当前时间戳；

> 注：`last_activation_time`、`is_active` 由激活 / 老化机制维护，不可通过 updateGraphEdge 直接修改；激活次数由按天激活统计表维护（见 3.4 / 4.4）。

**返回**：Boolean，表示更新是否完成

#### 3.2.4. 删除边（delGraphEdge）

**功能**：删除图数据库中的指定边，支持按 ID 批量删除

**方法签名**：`Boolean delGraphEdge(DelGraphEdgeInput input, GraphContext context, DelGraphEdgeOutput output)`

**入参（DelGraphEdgeInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| ids | STRING[] | Y | 边 ID 列表（支持批量） |

**处理流程**：

1. 通过图数据库接口删除指定边（关系）；
2. 清理激活事件表（graph_activation_event）中 `graph_edge_id` 命中该边列表的激活事件记录；
3. 清理按天激活统计表（graph_edge_daily_activation）中 `graph_edge_id` 命中该边列表的记录；
4. 影响行数通过 output 参数返回；

**返回**：Boolean，表示删除是否完成；影响行数通过 output 参数返回

### 3.3. 图查询

#### 3.3.1. 查询图数据（selectGraph）

**功能**：查询图数据库中的节点或边

**方法签名**：`Boolean selectGraph(SelectGraphInput input, GraphContext context, SelectGraphOutput output)`

**入参（SelectGraphInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| target | ENUM | Y | 查询目标，node / edge |
| node_type | STRING | N | 按节点类型过滤（target=node 时生效） |
| edge_type | STRING | N | 按边类型过滤（target=edge 时生效） |
| conditions | Condition[] | N | 查询条件，作用于目标对象（节点 / 边）的属性字段 |
| order_by | OrderBy[] | N | 排序字段列表 |
| page | Page | N | 分页参数，不指定则不分页 |

> Condition、OrderBy、Page 为公共查询对象，定义于 `RelationDBProvider-PRD.md`。

**处理流程**：

1. 根据 `target` 确定查询对象为节点或边；
2. 由 Provider 根据 `node_type` / `edge_type`、`conditions`、`order_by`、`page` 生成图查询语句及参数；
3. 通过图数据库接口（图查询语言）执行查询；
4. 查询结果通过 output 参数返回；

**返回**：Boolean，表示查询是否完成；查询结果通过 output 参数返回

#### 3.3.2. 获取邻居节点（getGraphNeighbors）

**功能**：获取指定节点的邻居节点，支持多跳遍历

**方法签名**：`Boolean getGraphNeighbors(GetGraphNeighborsInput input, GraphContext context, GetGraphNeighborsOutput output)`

**入参（GetGraphNeighborsInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| node_id | STRING | Y | 节点 ID |
| depth | INT | N | 遍历深度，默认值由配置 `default_depth` 决定（默认 1） |
| edge_type | STRING | N | 按边类型过滤 |
| direction | ENUM | N | 遍历方向，OUT（出边）/ IN（入边）/ BOTH（双向，默认） |
| only_active | BOOLEAN | N | 是否仅遍历激活状态的边（is_active = true），默认值由配置 `default_only_active` 决定（默认 true） |

**处理流程**：

1. 通过图数据库的图遍历能力（如 `MATCH (n)-[*1..depth]-(neighbor)`）从 `node_id` 开始按 `direction` 多跳遍历；
2. 按 `edge_type` 过滤边（若指定）；
3. 若 `only_active` 为 true，过滤非激活状态的边（is_active = true）；
4. 返回 depth 范围内的所有邻居节点；

**返回**：Boolean，表示查询是否完成；邻居节点列表通过 output 参数返回

### 3.4. 边生命周期

#### 3.4.1. 激活边（activateGraphEdge）

**功能**：激活一条边，记录激活事件并按天累计激活次数，用于边的权重维护与老化判定

**方法签名**：`Boolean activateGraphEdge(ActivateGraphEdgeInput input, GraphContext context, ActivateGraphEdgeOutput output)`

**入参（ActivateGraphEdgeInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| edge_id | STRING | Y | 边 ID |
| trigger_type | STRING | N | 触发类型，未指定时取配置 `default_trigger_type`（默认 user_query） |

**处理流程**：

1. 校验指定边是否存在，不存在则失败；
2. 若 `trigger_type` 未指定，从关系数据库配置表 graphdb_config 读取 `default_trigger_type`（默认 user_query）；
3. 查询该边的起始节点 ID 和目标节点 ID（用于激活事件记录）；
4. 在激活事件表（graph_activation_event）中记录本次激活事件，写入 `graph_edge_id`、`from_node_id`、`to_node_id`、`activation_time`、`trigger_type`；
5. 在按天激活统计表（graph_edge_daily_activation）中递增当日计数：以当天日期（`stat_date`）为键，对 `(graph_edge_id, stat_date)` 做 upsert，存在则 `activation_count + 1`，不存在则新建并置为 1；
6. 更新边的 `last_activation_time` 为当前时间戳，并将 `is_active` 置为 true；

**返回**：Boolean，表示激活是否完成

> 注：激活次数不再以边上的累计字段维护，而是按天聚合存储于 graph_edge_daily_activation（见 4.4），仅保留配置 `retention_days`（默认 30）天数内的数据，超过窗口的历史激活由 ageGraphEdge 清理，从而避免老边因累计激活数天然偏高而对新边不公平。

#### 3.4.2. 老化边（ageGraphEdge）

**功能**：基于保留窗口内的激活数量老化边，将近期不活跃的边标记为非激活状态，并清理过期激活数据

**方法签名**：`Boolean ageGraphEdge(AgeGraphEdgeInput input, GraphContext context, AgeGraphEdgeOutput output)`

**入参（AgeGraphEdgeInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| 无额外参数 | - | - | 老化阈值均从关系数据库配置表 graphdb_config 读取 |

**处理流程**：

1. 从关系数据库配置表 graphdb_config 读取老化参数：`retention_days`（激活统计保留天数，默认 30）、`min_activation_count`（窗口内最小激活次数阈值）；
2. 扫描所有激活状态的边（is_active = true）；
3. 对每条边按保留窗口判定是否需要老化：
   - 统计该边在最近 `retention_days` 天内的激活总数（对 graph_edge_daily_activation 中 `stat_date` 落在窗口内的 `activation_count` 求和）；
   - 若该边创建时间（`created`）距今已超过 `retention_days`（即已度过完整保留窗口的观察期），且窗口内激活总数小于 `min_activation_count`，则老化；
   - 未满 `retention_days` 观察期的新边不参与老化，给予其积累激活的公平机会；
4. 对符合条件的边标记为非激活状态（`is_active` 置为 false）；
5. 清理过期激活数据：删除 graph_edge_daily_activation 与 graph_activation_event 中 `stat_date` / `activation_time` 早于保留窗口起点的记录；
6. 老化的边数量通过 output 参数返回；

**返回**：Boolean，表示老化是否完成；老化的边数量通过 output 参数返回

> 注：相比基于累计激活计数与最后激活时间的老化策略，按保留窗口内激活数量判定可消除“老边累计激活数天然偏高”的不公平：超过保留窗口的历史激活不再计入，新边与老边在同一时间窗口内公平比较。

### 3.5. 可视化与运维

#### 3.5.1. 可视化数据（visualizedGraph）

**功能**：获取图数据库的可视化信息

**方法签名**：`Boolean visualizedGraph(VisualizedGraphInput input, GraphContext context, VisualizedGraphOutput output)`

**入参（VisualizedGraphInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| scope | ENUM | Y | 可视化范围，health / volume / diskUsage |

**处理流程**：

1. 根据 scope 获取对应的可视化数据：
   - health：图数据库健康状态（连接状态、响应时间）；
   - volume：图数据量（节点数、边数、激活事件数）；
   - diskUsage：占用磁盘空间；

**返回**：Boolean，表示查询是否完成；可视化数据通过 output 参数返回

#### 3.5.2. 启用/禁用（enableGraphDB）

**功能**：启用或禁用图数据库，用于运行时控制图数据库的可用状态

**方法签名**：`Boolean enableGraphDB(EnableGraphDBInput input, GraphContext context, EnableGraphDBOutput output)`

**入参（EnableGraphDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| enable | BOOLEAN | Y | 是否启用 |

**处理流程**：

1. 根据 `enable` 参数启用或禁用图数据库，并将 `enabled` 状态持久化到关系数据库配置表 graphdb_config（库名 `graphdb`）；
2. 禁用时关闭图数据库连接，释放资源，将 graphdb_config 中 `enabled` 置为 false；禁用期间所有图数据操作将返回失败（图数据库未启用）；
3. 启用时重新初始化图数据库连接，恢复可用状态，将 graphdb_config 中 `enabled` 置为 true；

**返回**：Boolean，表示操作是否完成

> 注：组件初始化时从 graphdb_config 读取 `enabled` 状态以恢复上次的可用状态（如上次为禁用则保持禁用，避免状态丢失）；运行时内存中维护 `enabled` 状态供各操作快速校验，状态变更同步落库。

#### 3.5.3. 关闭连接（closeGraphDB）

**功能**：关闭图数据库连接，用于系统关闭时释放连接资源

**方法签名**：`Boolean closeGraphDB(CloseGraphDBInput input, GraphContext context, CloseGraphDBOutput output)`

**入参（CloseGraphDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| 无额外参数 | - | - | - |

**处理流程**：

1. 关闭图数据库连接，释放资源；

> 注：`closeGraphDB` 为终态操作，执行后组件不可再通过 `enableGraphDB(true)` 恢复，需重新初始化组件；`enableGraphDB(false)` 为运行时临时禁用，可通过 `enableGraphDB(true)` 恢复。

**返回**：Boolean，表示关闭是否完成

## 4. 表设计

> 图数据表（4.1 ~ 4.4）均存储在 GraphDB 对应的 SQLite 数据库文件中，逻辑库名为 `graph`；GraphDBProvider 用到的所有配置项（含图数据库启用 / 禁用状态）存储在关系数据库配置表 graphdb_config 中（库名 `graphdb`，见 4.5）。
>
> 图数据表均为 SQLite 普通表，关系端点通过 `from_node_id` / `to_node_id` 字段显式存储；图遍历能力通过 Cypher-to-SQL 翻译器（CypherTranslator）在应用层实现。

### 4.1. 图节点表（SQLite 表）

- `表名`： graph_node
- `库名`： graph

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| node_type | 节点类型 | STRING | N | 普通索引 | |
| content | 节点内容 | JSON | N | | |

### 4.2. 图边表（SQLite 表）

- `表名`： graph_edge
- `库名`： graph

> 关系的起始节点（from_node_id）和目标节点（to_node_id）作为属性字段显式存储在表中，新增边时通过 GraphEdgeData 的 `from_node_id` / `to_node_id` 指定端点。

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| from_node_id | 起始节点 ID | STRING | N | 普通索引 | 关联 graph_node.id |
| to_node_id | 目标节点 ID | STRING | N | 普通索引 | 关联 graph_node.id |
| edge_type | 边类型 | STRING | N | 普通索引 | |
| weight | 权重 | DOUBLE | N | | 默认值由配置 `default_weight` 决定（默认 1.0） |
| properties | 边属性 | JSON | Y | | |
| last_activation_time | 最后激活时间 | INT64 | Y | | 毫秒时间戳，初始为空 |
| is_active | 是否激活 | BOOLEAN | N | 普通索引 | 默认 true |

> 注：边上不再保存累计 `activation_count`，激活次数按天聚合存储于 graph_edge_daily_activation（见 4.4），由激活 / 老化机制维护。

### 4.3. 图激活事件表（SQLite 表）

- `表名`： graph_activation_event
- `库名`： graph

> `from_node_id`、`to_node_id` 在激活事件表中冗余存储，用于记录激活时刻关系端点的快照：避免边被删除或端点变更后丢失历史激活上下文，同时避免查询时回连 graph_edge 表。

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| graph_edge_id | 边 ID | STRING | N | 普通索引 | 关联 graph_edge.id |
| from_node_id | 起始节点 ID | STRING | N | | 关联 graph_node.id |
| to_node_id | 目标节点 ID | STRING | N | | 关联 graph_node.id |
| activation_time | 激活时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| trigger_type | 触发类型 | STRING | N | | 实际值由 activateGraphEdge 传入或取配置 `default_trigger_type` |

### 4.4. 按天激活统计表（SQLite 表）

- `表名`： graph_edge_daily_activation
- `库名`： graph

> 以 `(graph_edge_id, stat_date)` 为业务唯一键，记录每条边每天的激活次数；仅保留配置 `retention_days` 天数内的数据，超过窗口的记录由 ageGraphEdge 清理。激活次数不再以边上的累计字段维护，老化判定直接基于本表的窗口内求和。

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| graph_edge_id | 边 ID | STRING | N | 普通索引 | 关联 graph_edge.id |
| stat_date | 统计日期 | STRING | N | 普通索引 | 格式 YYYY-MM-DD |
| activation_count | 当日激活次数 | INT64 | N | | 当日累计，初始 1 |

> 业务唯一约束：`(graph_edge_id, stat_date)`；activateGraphEdge 对当日记录做 upsert（存在则 `activation_count + 1`，不存在则新建）。

### 4.5. GraphDBProvider 配置表（关系数据库）

- `表名`： graphdb_config
- `库名`： graphdb
- `存储`： 关系数据库（由 RelationDBProvider 管理）
- `表类型`： 关系表

> GraphDBProvider 用到的所有配置项集中存储于关系数据库（库名 `graphdb`），采用键值对结构，运行时按需读取；老化阈值等参数由 activateGraphEdge / ageGraphEdge 读取，图数据库启用 / 禁用状态由 enableGraphDB 读取并持久化，避免硬编码与状态丢失。

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
| enabled | true | BOOLEAN | 图数据库是否启用（enableGraphDB 读写） |
| retention_days | 30 | INT | 激活统计保留天数（老化观察窗口） |
| min_activation_count | 5 | INT | 窗口内最小激活次数阈值 |
| default_trigger_type | user_query | STRING | 默认触发类型 |
| default_weight | 1.0 | DOUBLE | 默认边权重 |
| default_depth | 1 | INT | 默认遍历深度 |
| default_only_active | true | BOOLEAN | 默认仅遍历激活边 |

## 5. 重要内容

1. GraphDBProvider 是图数据的唯一操作入口，上层不可直接操作图数据库；
2. 图数据库组件默认集成 GraphDB，通过 Repository 接口封装底层图数据库操作；
3. 图数据库基于 SQLite + CTE 实现，所有图数据表均为 SQLite 普通表；通过 CypherTranslator 将 Cypher 查询翻译为 SQL 执行，图遍历能力在应用层通过迭代查询实现；`graph_edge` 为 SQLite 表，`from_node_id` / `to_node_id` 作为属性字段显式存储关系端点；
4. Condition、OrderBy、Page 为项目公共查询对象，定义于 `RelationDBProvider-PRD.md`，本 Provider 直接引用，不重复定义；
5. 节点 / 边的系统字段（`id`、`created`、`updated` 及边的 `last_activation_time`、`is_active`）由 Provider 维护，不可通过 Data 对象修改；边的 `last_activation_time`、`is_active` 由激活 / 老化机制维护，不可通过 updateGraphEdge 直接修改；
6. 边的激活机制通过 `activateGraphEdge` 记录激活事件并按天累计激活次数（写入 graph_edge_daily_activation），用于维护边的权重和活跃度；激活次数不再以累计字段存储，避免老边累计值天然偏高；
7. 边的老化机制通过 `ageGraphEdge` 基于保留窗口（`retention_days`）内的激活数量判定：仅当边已度过完整观察期且窗口内激活总数低于 `min_activation_count` 时才标记为非激活，超过窗口的历史激活数据同步清理；该机制使新边与老边在同一时间窗口内公平比较；
8. 删除节点时通过 SQLite 外键约束（ON DELETE CASCADE）级联删除关联的边，并由 Provider 清理激活事件表与按天激活统计表中引用该节点（`from_node_id` / `to_node_id`）的记录；删除边时由 Provider 清理关联的激活事件记录与按天激活统计记录（`graph_edge_id`）；
9. GraphDBProvider 用到的所有配置项（含图数据库启用 / 禁用状态 `enabled`、老化阈值 `retention_days` / `min_activation_count`、各类默认值等）统一存储于关系数据库配置表 graphdb_config（库名 `graphdb`，见 4.5），运行时按需读取；enableGraphDB 的启用 / 禁用状态同步持久化，组件初始化时恢复，避免状态丢失；
10. `enableGraphDB` 为运行时启用 / 禁用（可恢复），`closeGraphDB` 为系统关闭时的终态释放（不可恢复，需重新初始化组件）；
11. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
