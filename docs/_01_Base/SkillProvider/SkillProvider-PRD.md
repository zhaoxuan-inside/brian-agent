# Skill Provider

Skill分为如下部分：

```text
custom-skill/
├── brief             # (必需) Skill的元数据，表明Skill的应用场景
├── work              # (必需) Skill的操作指南，指明这个Skill怎么完成指定应用场景的工作
├── scripts/          # (可选) 存放可执行脚本（如Python、Shell等）
├── references/       # (可选) 存放深度参考资料（如Markdown文档、决策表等）
└── assets/           # (可选) 存放静态资源（如图片、模板文件等）
```

## 1. 设计目标

1. 解耦Skill 和 Agent执行框架；
2. 基于关系数据库（SQLite）提供接口供Agent执行框架使用；
3. 接收Skill执行的请求，在沙箱中完成请求，并将结果返回；
4. 接管 Skill 调用请求；

## 2. 功能设计

### 2.1. 新增（addSkill）

接收Skill的四个部分成为一个完整的Skill；

- 新增时自动将当前时间作为 created 和 updated 字段时间

### 2.2. 删除(delSkill)

支持按照 `id` 进行删除

### 2.3. 查询(soSkill)

支持关键词搜索Skill元数据字段；
支持排序，排序规则：1. 时间（最后更新时间）；2. 按照使用频率进行排序（今日，最近7天，最近30天）

## 2.4. Skill动态获取接口(matchSkill)

根据任务的内容，加载所有可选的Skill的ID和skill_brief，调用PromptsProvider构建prompt，调用LLMProvider由模型推荐合适的Skill；

## 2.5. Skill执行（execSkill）

接收SkillId和Skill执行所需要的参数，在沙箱中完整Skill的执行，并将执行结果返回

### 2.6. Skill优化(optSkill)

**功能**：优化掉不常用的Skill

**优化规则**:
通过RelationDBProvider获取skill_opt_rule表中的优化规则，所有的规则之间是与关系，days是要统计的天数，usage_count是统计的条数内最少的次数，低于这些次数的Skill就会被老化

### 2.7. 查看Skill优化规则(soOptSkillRule)

**功能**：查看Skill优化的规则
**流程**：调用RelationDBProvider，获取skill_opt_rule表中的优化规则

### 2.8. 修改Skill优化配置(updateOptSkillRul)

**功能**：修改Skill优化的规则，可以删除某一条，修改某一条，以及增加一条
**流程**：调用RelationDBProvider，更新skill_opt_rule表中的优化规则

## 3. 表结构设计

### 3.1. Skill表（SQLite）

- `表名`： skill
- `库名`： skill

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| skill_brief | 元数据 | TEXT | N | 普通索引 | |
| work | 操作指南 | TEXT | N | | |
| scripts | 脚本存放路径 | TEXT | N | | |
| references | 深度参考资料存放路径 | TEXT | N | | |
| assets | 静态资源存放路径 | TEXT | N | | |
| enable | 是否启用 | BOOL | N | | 默认启用 |

## 3.2. Skill使用表（SQLite）

- `表名`：skill_usage
- `库名`：skill

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| skill_id | SkillID | UUID | N | 普通索引 | |
| usage_date | Skill使用日期 | date | N | 普通索引 | |
| usage_count | 当日使用数量 | Integer | N | | 默认为0 |

**重要**：仅当 `execSkill`（执行Skill）成功调用时，当天的usage_count才会加1

## 3.3. Skill优化配置表（SQLite）

- 表名：skill_opt_rule
- 库名：skill

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| days | 统计天数 | INTEGER | N | 普通索引 | |
| usage_count | 统计天数内的最多使用次数 | Integer | N | | 默认为0 |

## 4. 沙箱

提供多级沙箱工具，可以参考Hermes的源码。
目前选型为 local+node:vm 这两个沙箱