# Prompts Provider

## 1. 设计目标

1. 解耦 **Prompt模板管理** 与 **Agent/LLM执行框架**，使提示词工程可独立迭代；
2. 基于关系数据库（SQLite）提供标准化接口，供上层执行框架进行增删改查与调用；
3. 接收Prompt渲染（执行）请求，在沙箱中完成变量替换、逻辑渲染及安全检查，并将最终生成的提示词字符串（或消息列表）返回；

## 2. 功能设计

### 2.1. 新增（addPrompt）

接收Prompt名称，prompt的描述以及markdown格式文本的完整Prompt模板，进行保存；

- 新增时自动将当前时间作为 `created` 和 `updated` 字段时间写入数据库；

### 2.2. 删除（delPrompt）

支持按照数据库中的 `id`（UUID）；

### 2.2. 修改（updatePrompt）

支持按照数据库中的 `id`（UUID），修改Prompt名称，prompt的描述以及markdown格式文本的完整Prompt模板，进行更新；

### 2.3. 查询（soPrompt）

支持关键词搜索Prompt描述和名称
支持排序规则（需联表查询 `prompt_usage` 统计表）：

1. 按时间排序（最后更新时间 `updated`）；
2. 按使用频率排序（今日使用次数、最近7天使用次数、最近30天使用次数）；

### 2.4. Prompt执行/渲染（execPrompt）

接收 prompt模板ID以及执行所需要的变量参数字典，生成最终的完整Prompt；

## 3. 表结构设计

### 3.1. prompt_template表（SQLite）

- `表名`： prompt_template
- `库名`： prompt_template

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| prompt_template_tiltle | prompt名称 | TEXT | N | 普通索引 | |
| prompt_template_brief | prompt摘要 | TEXT | N | | 普通索引 |
| prompt_template | prompt内容 | TEXT | N | | 这是一个大文本 |
| enable | 是否启用 | BOOL | N | | 默认启用（1） |

## 3.2. prompt_template使用表（SQLite）

- `表名`： prompt_template_usage
- `库名`： prompt_template

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| prompt_template_id | prompt_template表关联ID | UUID | N | 普通索引 | |
| usage_date | 使用日期 | date | N | 普通索引 | 格式：YYYY-MM-DD |
| usage_count | 当日使用数量 | Integer | N | | 默认为0 |

**重要**：仅当 `execPrompt`（执行渲染）成功调用时，当天的usage_count才会加1
