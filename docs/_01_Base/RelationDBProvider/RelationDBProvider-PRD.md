# RelationDB Provider

## 1. 设计目标

1. 解耦关系性数据库 和 系统；
2. 所有对数据的操作都不能直接进行都必须要通过RelationDBProvider；
3. 本模块负责ORM对象的执行，调用方负责ORM对象的构建；
4. 提供接口支持接收ORM对象并进行执行目标数据的CURD操作；

- ORM 框架选择 Objection.js，集成的关系数据库为SQLite

## 2. 功能设计(根据其他模块的需求创建对应的)

### 2.1. 新增（addXxx）

### 2.2. 删除(delXxx)

### 2.3. 查询(soXxx)

### 2.4. 修改（updateXxx）

### 2.5. 可视化数据（visualized）

根据参数指定可视化数据的范围

1. RelationDB 健康状态；
2. RelationDB 数据量；
3. RelationDB 占用磁盘空间；
