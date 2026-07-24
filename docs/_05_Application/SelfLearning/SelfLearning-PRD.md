# SelfLearning Application

## 1. 设计目标

1. 支持配置资料库目录；
2. 每一个资料库支持开启自学习；（目前只支持markdown格式）；
3. tag相关性维护（老化没用的连接，增加新的连接）；

## 2. 功能设计

### 2.1. 搜索资料库（soLibrary）

### 2.2. 删除资料库（delLibrary）

### 2.3. 新增资料库（addLibrary）

## 3. 表设计

### 3.1. 资料库表

- 表名：library
- 库名：selflearning

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| library_title | 资料库名 | VARCHAR | N | | |
| library_brief | 资料库摘要 | VARCHAR | N | | |
| library_path | 资料库路径 | VARCHAR | N | | |

### 3.2. 自学习任务控制表

- 表名：selflearning_task_control
- 库名：selflearning

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| task_title | 任务名 | VARCHAR | N | | |
| task_brief | 任务摘要 | VARCHAR | N | | |
| task_exec_cron | 任务执行周期配置（cront） | VARCHAR | N | | |

### 3.2. 自学习任务进度表

- 表名：selflearning_task_control
- 库名：selflearning

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| task_id | 任务名 | VARCHAR | N | | |
| task_process | 任务进度 | INT | N | | |
| task_status | 任务状态 | VARCHAR | N | | RUNNING,FINISH,FAILURE |

## 4. 内置自学习内容

### 4.1. 信息标签图相似性维护；

### 4.2. 信息标签图相似性连接建立；

### 4.3. 信息标签图不常用连接老化；

### 4.4. 随机获取用户的消息，建立用户画像；
