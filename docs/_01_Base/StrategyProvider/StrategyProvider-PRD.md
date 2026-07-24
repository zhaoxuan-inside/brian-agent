# Strategy Provider

## 1. 设计目标

1. 解耦策略 和 策略执行框架；
2. 基于关系数据库（SQLite）提供接口供策略执行框架使用；

## 2. 功能设计

### 2.1. 新增(addStrategy)

接收JSON格式策略，策略简述，策略应用场景，策略层级（Agent编排|Agent执行）并进行保存；

- 新增时自动将当前时间作为 created 和 updated 字段时间

### 2.2. 删除(delStrategy)

支持按照 `id` 进行删除

### 2.3. 查询(soStrategy)

支持关键词搜索策略；
支持排序，排序规则：1. 时间（最后更新时间）；2. 按照使用频率进行排序（今日，最近7天，最近30天）

### 2.4. Strategy动态获取接口(matchStrategy)

根据任务的内容以及策略加载层级加载所有可选的Strategy场景，调用PromptsProvider构建prompt，调用LLMProvider由模型推荐合适的Strategy；
如果只有一个策略则直接返回该策略；

## 3. 表结构设计

### 3.1. 策略表（SQLite）

- `表名`: strategy
- `库名`：strategy

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| strategy_content | 策略内容 | JSON | N | 普通索引 | |
| strategy_brief | 策略功能摘要 | TEXT | N | | |
| strategy_layer | 策略应用层级 | ENUM（1：Agent编排；2：Agent执行） | Y | | |
| enable | 是否启用 | BOOL | N | | 默认启用 |

### 3.2. 策略使用表（SQLite）

- `表名`：strategy_usage
- `库名`：strategy

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| strategy_id | 策略ID | UUID | N | 普通索引 | |
| usage_date | 策略使用日期 | date | N | 普通索引 | |
| usage_count | 当日使用数量 | Integer | N | | 默认为0 |

**重要**：仅当 `matchStrategy`（匹配Strategy）成功调用时，当天的usage_count才会加1
