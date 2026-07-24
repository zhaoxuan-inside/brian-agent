# VectorDB Provider

## 1. 设计目标

1. 解耦向量数据库 和 系统；
2. 所有对图数据的操作都不能直接进行都必须要通过VectorDBProvider；
3. 本模块负责Repository对象的执行，调用方负责Repository对象的构建；
4. 提供接口支持接收Repository对象并进行执行目标数据的CURD操作；

- 默认集成的向量数据库为 MiniVectorDB

## 2. 功能设计

### 2.1. 新增（addXxx）

### 2.2. 删除(delXxx)

### 2.3. 查询(soXxx)

### 2.4. 修改（updateXxx）

### 2.5. 可视化数据（visualized）

根据参数指定可视化数据的范围

1. VectorDB 健康状态；
2. VectorDB 数据量；
3. VectorDB 占用磁盘空间；

### 2.6. 启用/禁用（enable）

启用/禁用向量数据库，禁用向量数据库会关闭内嵌的向量数据库
