# Config Application

## 1. 设计目标

1. 管理配置的模块，负责管理那些配置可以查看和修改，那些配置可以查看，那些配置不可见也不可修改；

## 2. 功能设计

### 2.1. 获取配置权限

**功能**：获取指定配置的权限
**入参**：
config_id;
**处理流程**：

1. 根据config_id调用RelationDBProvider获取指定配置的权限；

### 2.2. 管理配置

**功能**：管理指定配置的权限
**入参**：
config_id;（必选）
readable(boolean)
writeable(boolean)

**处理流程**：

1. 根据config_id调用RelationDBProvider更新指定配置的权限；


### 2.3. 配置注册（subscribe）

**功能**：接收来自模块的配置注册功能；
**入参**：
layer_id:分层ID；
layer_title:分层名；
layer_desc:分层描述；
model_id:分层中的模块ID；
model_title：分层中的模块名；
model_desc:分层中的模块描述；
model_config_id：模块的一种配置的ID；
model_config_title:模块的一种配置名；
model_config_desc：模块的一种配置描述；
config_id:具体的一个配置ID
config_title:具体的一个配置名；
config_desc:具体的一个配置的描述；
readable：是否可读；
writeable：是否可以修改

### 2.4. 配置权限

#### 2.4.1. 获取权限配置

##### 2.4.1.1. 获取配置权限（configPrivilege）

**功能**：查询配置的权限；
**入参**：
layer_id,
model_id,
config_model_id,
config_id
**处理流程**

1. 根据入参中非空的ID作为条件通过RelationDBProvider获取配置的读写权限；
2. 如果存在可写的配置则整层为可读写层，如果存在可读的配置则整层作为可读层，否则为不可读写；

##### 2.4.1.2. 获取配置权限详情（configDetail）

**功能**：查询详细的配置的权限；
**入参**：
layer_id,
model_id,
config_model_id,
config_id
**处理流程**

1. 根据入参中的ID作为条件通过RelationDBProvider获取config_privilage表的数据包括所有的业务字段（包括id）；

## 3. 表设计

### 3.1. 配置权限表

- 表名：config_privilate
- 库名：config

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| layer_id | 分层ID | UUID | N | 普通索引 | |
| layer_title | 层名 | VARCHAR | N | | |
| layer_desc | 层名 | TEXT | N | | |
| model_id | 模块ID | UUID | N | | 普通索引 |
| model_title | 模块名 | VARCHAR | N | | |
| model_desc | 模块 | TEXT | N | | |
| model_config_id | 模块的一种类型的配置ID | UUID | N | 普通索引 | |
| model_config_title | 模块的一种类型的配置名 | VARCHAR | N | | |
| model_config_desc | 模块的一种类型的配置描述 | TEXT | N | | |
| config_id | 具体的配置的ID | UUID | N | 普通索引 | |
| config_title | 具体的配置名 | VARCHAR | N | | |
| config_desc | 具体的配置描述 | TEXT | N | | |
| readable | 是否可读 | UUID | N | | |
| writeable | 是否可写 | UUID | N | | |
