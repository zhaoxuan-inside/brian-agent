# Document Application

## 1. 设计目标

1. 提供文档的上传、检索、管理能力，支持从文档中提取知识；
2. 支持多种文档格式（markdown / text / pdf）的存储与检索；
3. 对接下层 InformationService 完成文档的持久化与全文检索，屏蔽底层存储细节；
4. 为 SelfLearning 等上层应用提供文档数据源，支撑从文档中提取知识点写入记忆系统；

## 2. 功能设计

### 2.1. 上传文档（uploadDocument）

**功能**：上传一个文档，生成唯一 ID 并持久化存储

**入参**：
- user_id：用户ID
- document_title：文档标题
- document_content：文档内容
- document_type：文档类型（markdown / text / pdf）
- tags：文档标签列表（可选）
- context：操作上下文

**处理流程**：

1. 生成文档唯一 ID（UUID）与当前时间戳；
2. 调用 InformationService 的 saveDocument 接口，将文档（title / content / tags）持久化；
3. 组装文档对象（含 id、user_id、name、content、type、tags、metadata、created、updated）返回；

**返回**：Boolean，表示上传是否完成；文档对象通过 output 参数返回

### 2.2. 获取文档（getDocument）

**功能**：根据文档 ID 获取单个文档详情

**入参**：
- user_id：用户ID
- document_id：文档ID
- context：查询上下文

**处理流程**：

1. 调用 InformationService 的 searchDocuments 接口获取该用户的文档列表；
2. 从结果中查找与 document_id 匹配的文档；
3. 若找到则映射为文档对象返回，否则返回空；

**返回**：Boolean，表示获取是否完成；文档对象通过 output 参数返回，未找到时为空

### 2.3. 列出文档（listDocument）

**功能**：列出指定用户的全部文档

**入参**：
- user_id：用户ID
- context：查询上下文

**处理流程**：

1. 调用 InformationService 的 searchDocuments 接口（空关键词）获取该用户的文档列表；
2. 将底层文档记录映射为统一的文档对象列表返回；

**返回**：Boolean，表示列表是否完成；文档列表通过 output 参数返回

### 2.4. 更新文档（updateDocument）

**功能**：更新指定文档的字段（标题、内容、标签等）

**入参**：
- user_id：用户ID
- document_id：文档ID
- updates：待更新字段（Partial<Document>）
- context：操作上下文

**处理流程**：

1. 调用 getDocument 获取当前文档，若不存在则返回空；
2. 将 updates 中的字段合并到当前文档对象；
3. 更新文档的 updated 时间戳；
4. 调用 InformationService 的 saveDocument 接口持久化更新后的文档；

**返回**：Boolean，表示更新是否完成；更新后的文档通过 output 参数返回，文档不存在时为空

### 2.5. 删除文档（deleteDocument）

**功能**：删除指定文档

**入参**：
- user_id：用户ID
- document_id：文档ID
- context：操作上下文

**处理流程**：

1. 调用 InformationService 的 deleteDocument 接口删除指定文档；

**返回**：Boolean，表示删除是否完成

### 2.6. 搜索文档（searchDocument）

**功能**：按关键词搜索文档内容

**入参**：
- user_id：用户ID
- keyword：搜索关键词
- limit：返回结果数量上限（可选，默认 10）
- context：查询上下文

**处理流程**：

1. 调用 InformationService 的 searchDocuments 接口，传入 user_id、keyword、limit；
2. 将底层检索结果映射为统一的文档对象列表返回；

**返回**：Boolean，表示搜索是否完成；匹配的文档列表通过 output 参数返回

## 3. 表设计

### 3.1. 文档表

- 表名：document
- 库名：document

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| document_title | 文档标题 | VARCHAR | N | 普通索引 | |
| document_type | 文档类型 | VARCHAR | N | | markdown / text / pdf |
| document_content | 文档内容 | TEXT | N | | |
| document_brief | 文档摘要 | TEXT | Y | | |

## 4. 重要内容

1. DocumentService 对接下层 InformationService 完成文档的持久化与检索，自身仅负责应用层的数据组装与格式转换；
2. 底层 InformationService 内部文档字段名为 title，应用层 DocumentService 统一对外暴露为 document_title，字段映射在服务内部完成；
3. 文档检索能力依赖 InformationService 的 searchDocuments 实现，支持按关键词全文匹配；
4. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
5. Document 服务为 SelfLearning 的 learnFromDocument 能力提供文档数据源；
