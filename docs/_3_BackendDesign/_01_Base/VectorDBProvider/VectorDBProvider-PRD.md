# VectorDB Provider

## 1. 设计目标

1. 解耦向量数据库和系统，通过 Provider 模式为上层提供统一的向量数据操作接口；
2. 所有对向量数据的操作都不能直接进行，都必须要通过 VectorDBProvider；
3. 通过对象封装方式传递向量数据与查询条件，由 Provider 内部完成对象到向量数据库操作的映射，上层不接触底层接口；
4. 提供向量的存储、检索、删除能力；
5. 提供向量相似性检索能力（基于余弦相似度 / 欧氏距离 / 点积）；
6. 支持按元数据条件过滤向量；
7. 提供可视化数据接口，支持向量数据库健康状态监控；
8. 向量数据库默认集成 LanceDB（基于 Lance 列式存储格式的开源向量数据库）；

## 1.1. 架构说明

VectorDBProvider 采用 **DDD 四层架构**：

- `access/VectorDBAccess.ts`：模块对外统一入口，创建 VectorDB 组件并初始化表结构，封装 application 层 Service，通过 AOP 代理注入日志与耗时统计。
- `application/VectorDBService.ts`：应用服务层，实现所有业务逻辑（addVector / delVector / soVector / getVector / countVector / visualizedVector / enableVectorDB / closeVectorDB）。
- `domain/types.ts`：所有 Input / Output / Context 类型定义及接口（`VectorObject`, `VectorFilter`, `VectorQueryParam`, `VectorSearchResult`, `VectorRecord`）。
- `infrastructure/VectorDBSchemaInitializer.ts`：表结构初始化（SQLite 配置表 + LanceDB 向量表）。
- `components/VectorDB/VectorDBComponent.ts`：LanceDB 封装层，直接操作 LanceDB 表（connect / createTable / openTable / add / delete / query / vectorSearch / countRows）。

**依赖**：
- **LanceDB**（`@lancedb/lancedb`）：向量数据存储与检索引擎，提供原生 ANN 搜索能力。
- **RelationDBProvider**（`RelationDBAccess`）：SQLite 封装，用于存储 `vectordb_config` 配置表。

## 2. 对象定义

> 以下对象贯穿各功能接口，统一定义如下。
> Input、Context、Output 为项目通用基类，参见 `_00_DevStandardization.md`。

### 2.1. 向量上下文（VectorContext）

继承 Context 基类，向量数据相关操作的执行上下文。

### 2.2. 向量数据对象（VectorObject）

用于新增 / 更新操作，描述一条向量记录的完整信息。`id`、`created`、`updated` 为系统字段，由 Provider 维护，不通过 Data 对象传入（`id` 在新增时可选传入，不指定则自动生成）。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | N | 向量 ID，不指定则自动生成 |
| content | STRING | Y | 原始文本内容 |
| embedding | FLOAT[] | Y | 向量数据（浮点数组） |
| user_id | STRING | N | 用户 ID，用于按用户过滤 |
| metadata | JSON | N | 元数据，用于按条件过滤 |

### 2.3. 向量过滤对象（VectorFilter）

用于搜索、统计、删除操作的元数据条件过滤，多个条件之间通过 logic 字段组合。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| field | STRING | Y | 元数据字段名（或 'user_id' 表示按用户 ID 过滤） |
| operator | ENUM | Y | 操作符，见下方定义 |
| value | ANY | N | 比较值（IS_NULL / IS_NOT_NULL 时可为空） |
| logic | ENUM | N | 与前一条件的逻辑关系，AND（默认）/ OR |

**操作符（operator）枚举**：

| 操作符 | 含义 | value 示例 |
| ------ | ----- | ----- |
| EQ | 等于（=） | "user_001" |
| NE | 不等于（!=） | "user_001" |
| GT | 大于（>） | 100 |
| LT | 小于（<） | 100 |
| GE | 大于等于（>=） | 100 |
| LE | 小于等于（<=） | 100 |
| IN | 包含于列表 | ["a", "b"] |
| NOT_IN | 不包含于列表 | ["a", "b"] |
| IS_NULL | 为空 | - |
| IS_NOT_NULL | 不为空 | - |

### 2.4. 向量查询参数对象（VectorQueryParam）

用于相似性搜索操作，封装查询向量、过滤条件、返回数量、相似度阈值等参数。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| embedding | FLOAT[] | Y | 查询向量（浮点数组） |
| top_k | INT | N | 返回结果数量，未指定时取配置 `default_top_k`（默认 10） |
| similarity_threshold | FLOAT | N | 相似度阈值，未指定时取配置 `default_similarity_threshold`（默认 0.0），低于此值的结果不返回 |
| filters | VectorFilter[] | N | 元数据过滤条件列表 |
| user_id | STRING | N | 按用户过滤（等价于 filters 中 field=user_id, operator=EQ） |

## 3. 功能设计

### 3.1. 新增/更新向量（addVector）

**功能**：向向量数据库中新增或更新一条或多条向量记录（upsert 语义）

**方法签名**：`Boolean addVector(AddVectorInput input, VectorContext context, AddVectorOutput output)`

**入参（AddVectorInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| vectors | VectorObject[] | Y | 向量数据对象列表 |

**处理流程**：

1. 接收向量数据对象列表；
2. 由 Provider 将 VectorObject 映射为向量数据库的写入操作；
3. 如果向量 id 已存在则更新，否则新增（先 DELETE 旧记录，再 ADD 新记录）；
4. 返回向量 id 列表；

**出参（AddVectorOutput extends Output）**：

| 属性 | 类型 | 说明 |
| ------ | ----- | ----- |
| ids | STRING[] | 新增/更新的向量 ID 列表（顺序与入参一致） |

**返回**：Boolean，表示新增/更新是否完成；向量 id 列表通过 output.ids 返回

### 3.2. 删除向量（delVector）

**功能**：删除向量数据库中的指定向量，支持按 ID 批量删除

**方法签名**：`Boolean delVector(DelVectorInput input, VectorContext context, DelVectorOutput output)`

**入参（DelVectorInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| ids | STRING[] | Y | 向量 ID 列表（支持批量） |

**处理流程**：

1. 接收向量 ID 列表；
2. 由 Provider 将 ID 映射为向量数据库的删除操作并执行；

**出参（DelVectorOutput extends Output）**：

| 属性 | 类型 | 说明 |
| ------ | ----- | ----- |
| affected_rows | INT | 实际删除的向量数量 |

**返回**：Boolean，表示删除是否完成；影响行数通过 output.affected_rows 返回

### 3.3. 按条件删除向量（delVectorByFilter）

**功能**：按元数据条件批量删除向量

**方法签名**：`Boolean delVectorByFilter(DelVectorByFilterInput input, VectorContext context, DelVectorByFilterOutput output)`

**入参（DelVectorByFilterInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| filters | VectorFilter[] | Y | 向量过滤对象列表 |

**处理流程**：

1. 接收过滤条件对象；
2. 由 Provider 根据 filters 生成向量数据库的删除操作并执行；

**出参（DelVectorByFilterOutput extends Output）**：

| 属性 | 类型 | 说明 |
| ------ | ----- | ----- |
| affected_rows | INT | 删除的向量数量 |

**返回**：Boolean，表示删除是否完成；删除的向量数量通过 output.affected_rows 返回

### 3.4. 搜索向量（soVector）

**功能**：基于向量相似度搜索最相似的向量，支持元数据条件过滤

**方法签名**：`Boolean soVector(SoVectorInput input, VectorContext context, SoVectorOutput output)`

**入参（SoVectorInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| query_param | VectorQueryParam | Y | 向量查询参数对象 |

**处理流程**：

1. 接收查询参数对象；
2. 若 `top_k` 未指定，从 SQLite 配置表 vectordb_config 读取 `default_top_k`（默认 10）；若 `similarity_threshold` 未指定，从 vectordb_config 读取 `default_similarity_threshold`（默认 0.0）；
3. 根据是否有 metadata 过滤条件选择搜索模式：
   - **无 metadata filter**：使用 LanceDB 原生 `query().nearestTo(embedding).distanceType('cosine').limit(topK)` 执行 ANN 搜索，将 `_distance` 转换为 `similarity = 1 - _distance`；若有 user_id 过滤，通过 `where("user_id = 'xxx'")` 在 LanceDB 层完成过滤；
   - **有 metadata filter**：全表扫描（`query().toArray()`），JS 端逐条计算相似度，再在内存中应用 metadata 过滤条件；
4. 按相似度降序排序，过滤低于 `similarity_threshold` 的结果；
5. 返回前 `top_k` 条结果（含向量 id、内容、相似度分数 score、用户 ID、元数据）；

**出参（SoVectorOutput extends Output）**：

| 属性 | 类型 | 说明 |
| ------ | ----- | ----- |
| list | VectorSearchResult[] | 搜索结果列表（按相似度降序） |

> 搜索结果对象 `VectorSearchResult`：含 `id`、`content`、`user_id`、`score`（余弦相似度 [-1,1]）、`metadata`。

**返回**：Boolean，表示搜索是否完成；搜索结果通过 output.list 返回

### 3.5. 获取向量（getVector）

**功能**：获取指定向量的完整信息

**方法签名**：`Boolean getVector(GetVectorInput input, VectorContext context, GetVectorOutput output)`

**入参（GetVectorInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| id | STRING | Y | 向量 ID |

**处理流程**：

1. 接收向量 ID；
2. 由 Provider 将 ID 映射为向量数据库的查询操作并执行；
3. 若向量不存在返回空；

**出参（GetVectorOutput extends Output）**：

| 属性 | 类型 | 说明 |
| ------ | ----- | ----- |
| vector | VectorRecord \| null | 向量完整记录，不存在时为 null |

> 向量记录 `VectorRecord`：含 `id`、`content`、`embedding`（number[]）、`user_id`、`metadata`、`created`、`updated`。

**返回**：Boolean，表示查询是否完成；向量信息通过 output.vector 返回

### 3.6. 统计向量数量（countVector）

**功能**：统计向量数据库中符合条件的向量数量

**方法签名**：`Boolean countVector(CountVectorInput input, VectorContext context, CountVectorOutput output)`

**入参（CountVectorInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| filters | VectorFilter[] | N | 向量过滤对象列表，不指定则统计全部向量数量 |

**处理流程**：

1. 接收过滤条件对象；
2. 由 Provider 根据 filters 生成向量数据库的统计操作并执行；

**出参（CountVectorOutput extends Output）**：

| 属性 | 类型 | 说明 |
| ------ | ----- | ----- |
| count | INT | 符合条件的向量数量 |

**返回**：Boolean，表示统计是否完成；向量数量通过 output.count 返回

### 3.7. 可视化与运维

#### 3.7.1. 可视化数据（visualizedVector）

**功能**：获取向量数据库的可视化信息

**方法签名**：`Boolean visualizedVector(VisualizedVectorInput input, VectorContext context, VisualizedVectorOutput output)`

**入参（VisualizedVectorInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| scope | ENUM | Y | 可视化范围，health / volume / diskUsage |

**处理流程**：

1. 根据 scope 获取对应的可视化数据：
   - health：向量数据库健康状态（连接状态、响应时间、启用状态）；
   - volume：数据量（向量总数、表名、维度）；
   - diskUsage：占用磁盘空间（SQLite 配置库大小 + LanceDB 数据目录大小）；

**出参（VisualizedVectorOutput extends Output）**：

| 属性 | 类型 | 说明 |
| ------ | ----- | ----- |
| data | JSON | 可视化数据，按 scope 返回不同结构 |

**health 返回结构**：

| 字段 | 说明 |
| ------ | ----- |
| connected | LanceDB 连接是否可用 |
| response_time_ms | 响应时间（ms） |
| enabled | 当前启用状态 |

**volume 返回结构**：

| 字段 | 说明 |
| ------ | ----- |
| total_vectors | 向量总数 |
| collection | 表名（固定为 vector_record） |
| dimension | 向量维度 |

**diskUsage 返回结构**：

| 字段 | 说明 |
| ------ | ----- |
| disk_usage_bytes | SQLite 配置库磁盘占用（字节） |
| page_size | SQLite 页大小 |
| page_count | SQLite 页数 |
| vector_db_usage_bytes | LanceDB 数据目录磁盘占用（字节） |

**返回**：Boolean，表示查询是否完成；可视化数据通过 output.data 返回

#### 3.7.2. 启用/禁用（enableVectorDB）

**功能**：启用或禁用向量数据库，用于运行时控制向量数据库的可用状态

**方法签名**：`Boolean enableVectorDB(EnableVectorDBInput input, VectorContext context, EnableVectorDBOutput output)`

**入参（EnableVectorDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| enable | BOOLEAN | Y | 是否启用 |

**处理流程**：

1. 根据 `enable` 参数启用或禁用向量数据库，并将 `enabled` 状态持久化到 SQLite 配置表 vectordb_config；
2. 启用/禁用仅改变内存中的 `enabled` 标记和配置表持久化值，**不关闭或重建 LanceDB 连接**；禁用期间所有向量数据操作将抛出异常；
3. 组件初始化时从 vectordb_config 读取 `enabled` 状态以恢复上次的可用状态；

**返回**：Boolean，表示操作是否完成

> 注：`enableVectorDB` 仅控制运行时可用状态标记，不释放 LanceDB 连接资源。连接释放在 `closeVectorDB` 中执行。组件初始化时从 vectordb_config 读取 `enabled` 状态以恢复上次的可用状态；运行时内存中维护 `enabled` 标记供各操作快速校验，状态变更同步落库。

#### 3.7.3. 关闭连接（closeVectorDB）

**功能**：关闭向量数据库连接，用于系统关闭时释放连接资源

**方法签名**：`Boolean closeVectorDB(CloseVectorDBInput input, VectorContext context, CloseVectorDBOutput output)`

**入参（CloseVectorDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| 无额外参数 | - | - | - |

**处理流程**：

1. 关闭向量数据库连接，释放 LanceDB Connection 和 Table 资源；

> 注：`closeVectorDB` 为终态操作，执行后组件不可再通过 `enableVectorDB(true)` 恢复，需重新初始化组件；`enableVectorDB(false)` 为运行时临时禁用，可通过 `enableVectorDB(true)` 恢复。

**返回**：Boolean，表示关闭是否完成

## 4. 表设计

> 向量数据存储在 **LanceDB 表** `vector_record` 中（LanceDB 数据目录由构造参数 `lancePath` 指定），VectorDBProvider 用到的配置项存储在 **SQLite 配置表** `vectordb_config` 中。
>
> LanceDB 是列式向量数据库，表 schema 在首次写入数据时自动推断（auto-schema），距离度量方式在查询时通过 `.distanceType('cosine')` 指定。

### 4.1. 向量数据表（LanceDB · Table）

- `表名`： vector_record
- `存储`： LanceDB（`@lancedb/lancedb`），数据目录由 `lancePath` 指定
- `距离度量`： COSINE（余弦相似度），由 `search()` 查询时通过 `.distanceType('cosine')` 指定

| 字段名 | 含义 | 类型 | 是否可以为空 | 备注 |
| ------ | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | UUID，主键 |
| content | 原始文本内容 | STRING | N | |
| embedding | 向量数据 | FLOAT[] | N | 向量列，用于 nearestTo 向量搜索 |
| user_id | 用户 ID | STRING | Y | 用于按用户过滤，支持 LanceDB SQL WHERE |
| metadata | 元数据 | JSON(STRING) | Y | 以 JSON 字符串存储，用于按条件过滤 |
| created | 创建时间 | INT64 | N | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 毫秒时间戳 |

### 4.2. VectorDBProvider 配置表（SQLite）

- `表名`： vectordb_config
- `存储`： SQLite（通过 RelationDBProvider 管理）

> VectorDBProvider 用到的所有配置项集中存储于 SQLite 配置表 vectordb_config，采用键值对结构，运行时按需读取；搜索默认参数由 soVector 读取，向量数据库启用 / 禁用状态由 enableVectorDB 读取并持久化，避免硬编码与状态丢失。

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| config_key | 配置键 | TEXT | N | PRIMARY KEY | 唯一 |
| config_value | 配置值 | TEXT | N | | 按 value_type 解析 |
| value_type | 值类型 | TEXT | N | | INT / DOUBLE / BOOLEAN / STRING |
| description | 说明 | TEXT | Y | | |
| updated | 最后更新时间 | INTEGER | N | INDEX | 毫秒时间戳 |

默认配置项：

| config_key | config_value | value_type | description |
| ------ | ----- | ----- | ----- |
| enabled | true | BOOLEAN | 向量数据库是否启用（enableVectorDB 读写） |
| default_top_k | 10 | INT | 默认返回结果数量（soVector 读取） |
| default_similarity_threshold | 0.0 | DOUBLE | 默认相似度阈值（soVector 读取） |
| default_distance_metric | COSINE | STRING | 默认距离度量方式（COSINE / L2 / IP） |

## 5. 重要内容

1. VectorDBProvider 是向量数据的唯一操作入口，上层不可直接操作 LanceDB；
2. 向量数据库默认集成 **LanceDB**（`@lancedb/lancedb`），通过 VectorDBComponent 封装底层 LanceDB 操作（connect / createTable / openTable / add / delete / query / nearestTo / countRows 等）；
3. 上层通过对象（VectorObject / VectorFilter / VectorQueryParam）传递向量数据与查询条件，不接触底层 LanceDB API，由 Provider 内部完成对象到 LanceDB 操作的映射；
4. 向量相似度计算默认采用余弦相似度（cosine similarity），通过 LanceDB 的 `.distanceType('cosine')` 在查询时指定；LanceDB 返回的 `_distance` 转换为 `similarity = 1 - _distance`；
5. 搜索双模式：
   - **LanceDB 原生模式**（无 metadata filter）：调用 `table.query().nearestTo(embedding).distanceType('cosine').limit(topK)`，将 LanceDB 返回的 `_distance` 转换为 `similarity`，速度快；若有 user_id 过滤则通过 `where("user_id = 'xxx'")` 在 LanceDB 层完成；
   - **暴力扫描模式**（有 metadata filter）：`query().toArray()` 全表扫描，JS 端逐条计算相似度，再应用 metadata 过滤和阈值过滤，较慢但完整支持过滤；
   - 搜索默认参数（`default_top_k`、`default_similarity_threshold`）存储于 SQLite 配置表 vectordb_config，运行时按需读取；
6. VectorDBProvider 用到的所有配置项（含向量数据库启用 / 禁用状态 `enabled`、搜索默认参数 `default_top_k` / `default_similarity_threshold` / `default_distance_metric` 等）统一存储于 SQLite 配置表 vectordb_config（见 4.2），运行时按需读取；enableVectorDB 的启用 / 禁用状态同步持久化，组件初始化时恢复，避免状态丢失；
7. `enableVectorDB` 为运行时标记切换（仅改变内存 enabled 标记 + 持久化，不释放连接），`closeVectorDB` 为系统关闭时的终态释放（关闭 LanceDB Connection 和 Table + 持久化 enabled=false，不可恢复，需重新实例化组件）；
8. 所有公共方法通过 `AopProxy.wrap` 代理注入日志记录（开始/完成/错误）与耗时统计（elapsed ms）；
9. `addVector` 为 upsert 语义：先按 ID DELETE 已有记录，再 ADD 新记录（两步完成，非原子操作）；id 不指定时由 `IdGenerator.generate()` 自动生成；
10. VectorDBProvider 依赖 RelationDBProvider（SQLite）管理配置表，依赖 `@lancedb/lancedb` 管理向量数据，两者通过 `lancePath`（LanceDB 数据目录）和 `RelationDBAccess` 实例注入；