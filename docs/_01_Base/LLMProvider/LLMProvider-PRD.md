# MCP Provider

## 1. 设计目标

1. 解耦LLM 和 Agent执行框架；
2. 管理 LLM 提供商；
3. 管理 LLM 提供商的 模型；
4. 接管 LLM 调用请求；

## 2. 功能设计

### 2.1. LLM 提供商管理

#### 2.1.1. 新增 LLM 提供商（addLLMProvider）

接收 LLM 提供商的信息（URL，title，概述），并进行保存；

#### 2.1.2. LLM 提供商连接状态测试（testLLMProvider）

根据提供的 LLM 提供商ID，获取LLM提供商的信息，进行网络连通性测试；

#### 2.1.3. 删除 LLM 提供商（delLLMProvider）

根据提供的 LLM 提供商 ID， 删除指定的 LLM 提供商；

#### 2.1.4. 获取 模型 列表（listLLM）

根据提供的 LLM 提供商ID，获取 LLM 的信息列表，并进行保存

#### 2.1.5. 启用/禁用 LLM 提供商（enableLLMProvider）

根据提供的 LLM 提供商ID，启用/禁用指定的 LLM 提供商

#### 2.1.5. 搜索 LLM 提供商（soLLMProvider）

支持对 LLM 提供商的名称进行关键词搜索

#### 2.1.6. LLM 提供商限额配置（limitLLMProvider）

接收LLM提供商ID和该提供商的限额配置（每天，每周，每月）对（Token数量，调用次数）的限额进行保存；

### 2.2. LLM 管理

#### 2.2.1. 启用/禁用LLM（enableLLM）

根据提供的 LLM ID，启用/禁用指定的LLM；

#### 2.1.2. 搜索 LLM（soLLM）

支持对 LLM 的名称和摘要进行关键词搜索

#### 2.1.3. 调用 LLM（execLLM）

接收LLM ID 和prompt调用指定的LLM

#### 2.1.4. 匹配 LLM（matchLLM）

根据任务的内容，加载所有可选的LLM的ID和适用场景，调用PromptsProvider构建prompt，调用LLMProvider由模型推荐合适的LLM ID；

#### 2.1.5. 配置 LLM（updateLLM）

接收LLM ID 和要配置的内容更新llm_enable表，只允许更新llm_enable表中的信息；

## 3. 表结构设计

### 3.1. llm_provider表（SQLite）

- `表名`： llm_provider
- `库名`： llm

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_provider_url | llm提供商地址 | TEXT | N | | |
| llm_provider_title | llm提供商名称 | TEXT | N | 普通索引 | |
| llm_provider_brief | llm提供商摘要 | TEXT | Y | | |
| enable | 是否启用 | BOOL | N | | 默认启用 |

## 3.2. 可用llm表（SQLite）

- `表名`： llm_avialible
- `库名`： llm

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_provider_id | LLM 提供商 ID | TEXT | N | | |
| llm_title | llm 名称 | TEXT | N | 普通索引 | |

## 3.2. 启用llm表（SQLite）

- `表名`： llm_enable
- `库名`： llm

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_provider_id | LLM 提供商 ID | TEXT | N | | |
| llm_title | llm 名称 | TEXT | N | 普通索引 | |
| llm_usage | llm 适用范围 | TEXT | N | 普通索引 | |

## 3.3. LLM 使用表（SQLite）

- `表名`：llm_usage
- `库名`：llm

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| llm_id | llmID | UUID | N | 普通索引 | |
| usage_date | llm使用日期 | date | N | 普通索引 | |
| usage_count | 当日使用数量 | Integer | N | | 默认为0 |

**重要**：仅当 `execLLM`（执行LLM）成功调用时，当天的usage_count才会加1
