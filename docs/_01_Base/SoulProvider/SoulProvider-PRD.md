# Soul Provider

## 1. 设计目标

1. 解耦Soul 和 Agent执行框架；
2. 基于关系数据库（SQLite）提供接口供Agent执行框架使用；

## 2. 功能设计

### 2.1. 新增（addSoul）

接收文本格式的Soul，Soul简述，Soul应用场景并进行保存；

- 新增时自动将当前时间作为 created 和 updated 字段时间

### 2.2. 删除(delSoul)

支持按照 `id` 进行删除

### 2.3. 查询(soSoul)

支持关键词搜索Soul；
支持排序，排序规则：1. 时间（最后更新时间）；2. 按照使用频率进行排序（今日，最近7天，最近30天）

### 2.4. Soul动态获取接口(matchSoul)

根据工作的内容，加载所有可选的Soul的ID和应用场景，调用PromptsProvider构建prompt，调用LLMProvider由模型推荐合适的Soul；
如果没有可用的Soul，则调用LLMProvider根据工作的内容生成一个合适的Soul，Soul的摘要，以及Soul的应用场景并进行保存；

### 2.6. Soul优化(optSoul)

**功能**：优化掉不常用的Soul

**优化规则**:
通过RelationDBProvider获取soul_opt_rule表中的优化规则，所有的规则之间是与关系，days是要统计的天数，usage_count是统计的条数内最少的次数，低于这些次数的Soul就会被老化

### 2.7. 查看Soul优化规则(soOptSoulRule)

**功能**：查看Soul优化的规则
**流程**：调用RelationDBProvider，获取soul_opt_rule表中的优化规则

### 2.8. 修改Soul优化配置(updateOptSoulRul)

**功能**：修改Soul优化的规则，可以删除某一条，修改某一条，以及增加一条
**流程**：调用RelationDBProvider，更新soul_opt_rule表中的优化规则

## 3. 表结构设计

### 3.1. Soul表（SQLite）

- `表名`: soul
- `库名`：soul

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| soul_content | Soul内容 | TEXT | N | 普通索引 | |
| soul_brief | Soul功能摘要 | TEXT | N | | |
| soul_usage | Soul应用场景 | TEXT | N | | |
| enable | 是否启用 | BOOL | N | | 默认启用 |

## 3.2. Soul使用表（SQLite）

- `表名`：soul_usage
- `库名`：soul

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| soul_id | SoulID | UUID | N | 普通索引 | |
| usage_date | Soul使用日期 | date | N | 普通索引 | |
| usage_count | 当日使用数量 | Integer | N | | 默认为0 |

**重要**：仅当 `matchSoul`（匹配Soul）成功调用时，当天的usage_count才会加1

## 3.3. Soul优化表（SQLite）

- 表名：soul_opt_rule
- 库名：soul

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| days | 统计天数 | INTEGER | N | 普通索引 | |
| usage_count | 统计天数内的最多使用次数 | Integer | N | | 默认为0 |
