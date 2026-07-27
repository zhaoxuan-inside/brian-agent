# RelationDB Provider

## 1. 设计目标

1. 解耦关系型数据库和系统，为上层提供统一的关系数据操作接口；
2. 所有对数据的操作都不能直接进行，都必须要通过 RelationDBProvider；
3. 通过对象封装方式传递数据与查询条件，由 Provider 内部完成对象到 SQL 的映射，上层不接触 SQL；
4. 提供通用的 CURD 操作接口（新增、删除、更新、查询）；
5. 提供事务支持，保证数据操作的原子性；
6. 提供可视化数据接口，支持数据库健康状态监控；
7. 提供启用/禁用机制，支持运行时控制数据库可用状态；
8. 集成的关系数据库为 SQLite；

## 2. 对象定义

> 以下对象贯穿各功能接口，统一定义如下。
> Input、Context、Output 为项目通用基类，参见 `_00_DevStandardization.md`。
> Condition、OrderBy、Page 对象同时作为其他 Provider 查询能力的公共定义，被 LLMProvider、MCPProvider、SkillProvider、SoulProvider、PromptsProvider 等引用。

### 2.1. 数据库上下文（DBContext）

继承 Context 基类，关系数据库相关操作的执行上下文。

### 2.2. 数据对象（DataObject）

用于新增、更新操作，以键值对形式描述字段名与字段值。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| field | STRING | Y | 字段名 |
| value | ANY | Y | 字段值 |

### 2.3. 条件对象（Condition）

用于删除、更新、查询的 WHERE 条件构造，多个条件之间通过 logic 字段组合。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| field | STRING | Y | 字段名 |
| operator | ENUM | Y | 操作符，见下方定义 |
| value | ANY | N | 比较值（IS_NULL / IS_NOT_NULL 时可为空） |
| logic | ENUM | N | 与前一条件的逻辑关系，AND（默认）/ OR |

**操作符（operator）枚举**：

| 操作符 | 含义 | value 示例 |
| ------ | ----- | ----- |
| EQ | 等于（=） | 100 |
| NE | 不等于（!=） | 100 |
| GT | 大于（>） | 100 |
| LT | 小于（<） | 100 |
| GE | 大于等于（>=） | 100 |
| LE | 小于等于（<=） | 100 |
| LIKE | 模糊匹配 | "%keyword%" |
| IN | 包含于列表 | [1, 2, 3] |
| NOT_IN | 不包含于列表 | [1, 2, 3] |
| IS_NULL | 为空 | - |
| IS_NOT_NULL | 不为空 | - |
| BETWEEN | 在区间内 | [10, 20] |

### 2.4. 排序对象（OrderBy）

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| field | STRING | Y | 字段名 |
| direction | ENUM | N | 排序方向，ASC（默认）/ DESC |

### 2.5. 分页对象（Page）

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| current | INT | Y | 当前页码，从 1 开始 |
| size | INT | Y | 每页记录数 |

### 2.6. 查询参数对象（QueryParam）

用于查询操作，封装表名、查询字段、条件、排序、分页等参数。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| table | STRING | Y | 表名 |
| fields | STRING[] | N | 查询字段列表，不指定则查询全部字段 |
| conditions | Condition[] | N | 查询条件列表 |
| order_by | OrderBy[] | N | 排序字段列表 |
| page | Page | N | 分页参数，不指定则不分页 |
| group_by | STRING[] | N | 分组字段列表 |

### 2.7. 事务操作对象（Operation）

用于事务操作，每项描述一个原子操作。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| type | ENUM | Y | 操作类型，INSERT / DELETE / UPDATE |
| table | STRING | Y | 表名 |
| data | DataObject[] | N | 数据对象列表（INSERT / UPDATE 必填） |
| conditions | Condition[] | N | 条件对象列表（DELETE / UPDATE 必填） |

## 3. 功能设计

### 3.1. 新增记录（insertDB）

**功能**：向指定表中新增一条或多条记录

**方法签名**：`Boolean insertDB(InsertDBInput input, DBContext context, InsertDBOutput output)`

**入参（InsertDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| table | STRING | Y | 表名 |
| data | DataObject[] | Y | 数据对象列表（每项为字段名与字段值的键值对） |

**处理流程**：

1. 接收表名和数据对象；
2. 由 Provider 根据 `table` 和 `data` 生成 INSERT 语句及参数；
3. 通过关系数据库接口执行写入；
4. 返回影响行数；

**返回**：Boolean，表示新增是否完成；影响行数通过 output 参数返回

### 3.2. 删除记录（deleteDB）

**功能**：删除指定表中符合条件的记录

**方法签名**：`Boolean deleteDB(DeleteDBInput input, DBContext context, DeleteDBOutput output)`

**入参（DeleteDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| table | STRING | Y | 表名 |
| conditions | Condition[] | N | 条件对象列表，不指定则删除全表记录 |

**处理流程**：

1. 接收表名和条件对象；
2. 由 Provider 根据 `table` 和 `conditions` 生成 DELETE 语句及参数；
3. 通过关系数据库接口执行删除；
4. 返回影响行数；

**返回**：Boolean，表示删除是否完成；影响行数通过 output 参数返回

### 3.3. 更新记录（updateDB）

**功能**：更新指定表中符合条件的记录

**方法签名**：`Boolean updateDB(UpdateDBInput input, DBContext context, UpdateDBOutput output)`

**入参（UpdateDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| table | STRING | Y | 表名 |
| data | DataObject[] | Y | 数据对象列表（待更新的字段名与字段值） |
| conditions | Condition[] | N | 条件对象列表，不指定则更新全表记录 |

**处理流程**：

1. 接收表名、数据对象和条件对象；
2. 由 Provider 根据 `table`、`data` 和 `conditions` 生成 UPDATE 语句及参数；
3. 通过关系数据库接口执行更新；
4. 返回影响行数；

**返回**：Boolean，表示更新是否完成；影响行数通过 output 参数返回

### 3.4. 查询记录列表（selectDB）

**功能**：查询指定表中符合条件的记录列表，支持字段过滤、排序、分页

**方法签名**：`Boolean selectDB(SelectDBInput input, DBContext context, SelectDBOutput output)`

**入参（SelectDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| query_param | QueryParam | Y | 查询参数对象 |

**处理流程**：

1. 接收查询参数对象；
2. 由 Provider 根据 `query_param` 生成 SELECT 语句及参数（含字段过滤、WHERE、ORDER BY、LIMIT/OFFSET）；
3. 通过关系数据库接口执行查询；
4. 返回查询结果列表；

**返回**：Boolean，表示查询是否完成；查询结果通过 output 参数返回

### 3.5. 查询单条记录（selectOneDB）

**功能**：查询指定表中符合条件的第一条记录

**方法签名**：`Boolean selectOneDB(SelectOneDBInput input, DBContext context, SelectOneDBOutput output)`

**入参（SelectOneDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| query_param | QueryParam | Y | 查询参数对象 |

**处理流程**：

1. 接收查询参数对象；
2. 由 Provider 根据 `query_param` 生成 SELECT 语句及参数，自动追加 LIMIT 1；
3. 通过关系数据库接口执行查询；
4. 返回第一条匹配记录，若无匹配返回空；

**返回**：Boolean，表示查询是否完成；查询结果通过 output 参数返回

### 3.6. 统计记录数（countDB）

**功能**：统计指定表中符合条件的记录总数

**方法签名**：`Boolean countDB(CountDBInput input, DBContext context, CountDBOutput output)`

**入参（CountDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| table | STRING | Y | 表名 |
| conditions | Condition[] | N | 条件对象列表，不指定则统计全表记录数 |

**处理流程**：

1. 接收表名和条件对象；
2. 由 Provider 根据 `table` 和 `conditions` 生成 COUNT 语句及参数；
3. 通过关系数据库接口执行查询；
4. 返回记录总数；

**返回**：Boolean，表示统计是否完成；记录总数通过 output 参数返回

### 3.7. 执行事务（transactionDB）

**功能**：在事务中执行多个操作（新增 / 删除 / 更新），保证原子性

**方法签名**：`Boolean transactionDB(TransactionDBInput input, DBContext context, TransactionDBOutput output)`

**入参（TransactionDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| operations | Operation[] | Y | 事务操作对象列表 |

**处理流程**：

1. 开启数据库事务；
2. 遍历 `operations`，由 Provider 根据每个 Operation 的 type 生成对应的 SQL 语句及参数并执行；
3. 如果所有操作都成功，提交事务；
4. 如果任何操作失败，回滚事务；

**返回**：Boolean，表示事务是否执行成功

### 3.8. 可视化数据（visualizedDB）

**功能**：获取关系数据库的可视化信息

**方法签名**：`Boolean visualizedDB(VisualizedDBInput input, DBContext context, VisualizedDBOutput output)`

**入参（VisualizedDBInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| scope | ENUM | Y | 可视化范围，health / volume / diskUsage |

**处理流程**：

1. 根据 scope 获取对应的可视化数据：
   - health：数据库健康状态（连接状态、响应时间）；
   - volume：数据量（各表记录数）；
   - diskUsage：占用磁盘空间；

**返回**：Boolean，表示查询是否完成；可视化数据通过 output 参数返回

## 4. 表设计

> RelationDBProvider 原本管理的是其他 Provider 的业务表（如 graphdb_config 等），自身不拥有业务表；现新增配置表 relationdb_config 用于集中存储 RelationDBProvider 的配置项（含关系数据库启用 / 禁用状态）。
>
> RelationDBProvider 的配置表是一个特殊情况——它管理关系数据库本身，所以配置表存储在关系数据库自己的 `relationdb` 库中。组件初始化时需要先确保 relationdb 库和 relationdb_config 表存在。

### 4.1. RelationDBProvider 配置表（关系数据库）

- `表名`： relationdb_config
- `库名`： relationdb
- `存储`： 关系数据库（由 RelationDBProvider 自身管理，初始化时创建）
- `表类型`： 关系表

> RelationDBProvider 用到的所有配置项集中存储于关系数据库（库名 `relationdb`），采用键值对结构，运行时按需读取；关系数据库启用 / 禁用状态由 enableDB 读取并持久化，避免硬编码与状态丢失。

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
| enabled | true | BOOLEAN | 关系数据库是否启用（enableDB 读写） |

## 5. 重要内容

1. RelationDBProvider 是关系数据的唯一操作入口，上层不可直接操作数据库；
2. 上层通过对象（DataObject / Condition / QueryParam）传递数据与查询条件，不接触 SQL，由 Provider 内部完成对象到 SQL 的映射，实现数据库方言的解耦；
3. Condition、OrderBy、Page 对象作为项目的公共查询定义，被其他 Provider（LLMProvider、MCPProvider、SkillProvider、SoulProvider、PromptsProvider 等）引用；
4. 条件对象（Condition）支持丰富的操作符（EQ / NE / GT / LT / LIKE / IN / BETWEEN / IS_NULL 等），满足常见查询需求；
5. 查询参数对象（QueryParam）支持字段过滤、排序、分页、分组，覆盖常见查询场景；
6. 所有写操作推荐使用 `transactionDB` 保证原子性；
7. RelationDBProvider 用到的所有配置项（含关系数据库启用 / 禁用状态 `enabled`）统一存储于关系数据库配置表 relationdb_config（库名 `relationdb`，见 4.1），运行时按需读取；enableDB 的启用 / 禁用状态同步持久化，组件初始化时恢复，避免状态丢失；
8. `enableDB` 为运行时启用 / 禁用（可恢复），`closeDB` 为系统关闭时的终态释放（不可恢复，需重新初始化组件）；
9. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
