# GraphDB Provider

## 1. 设计目标

1. 解耦图数据库 和 系统；
2. 所有对图数据的操作都不能直接进行都必须要通过GraphDBProvider；
3. 本模块负责OGM对象的执行，调用方负责OGM对象的构建；
4. 提供接口支持接收OGM对象并进行执行目标数据的CURD操作；

- OGM 框架选择 graphdb.js，默认集成的图数据库为 GraphDB

## 2. 功能设计(根据其他模块的需求创建对应的)

### 2.1. 新增（addXxx）

### 2.2. 删除(delXxx)

### 2.3. 查询(soXxx)

### 2.4. 修改（updateXxx）

### 2.5. 可视化数据（visualized）

根据参数指定可视化数据的范围

1. GraphDB 健康状态；
2. GraphDB 数据量；
3. GraphDB 占用磁盘空间；
