# Chat Application

## 1. 设计目标

1. 接收用户的HTTP Chat请求，理解响应一个SSE端点，用于处理系统给用户的流式回复内容；
2. 接收来自用户的工作请求；

## 2. 功能设计

### 2.1. 获取SSE端点（chatSSE）

**功能**：接收来自前端的SSE连接建立请求；
**入参**：
**处理流程**：

1. 完成SSE连接建立；

### 2.2. 发送工作请求（submit）

**功能**：接收来自前端的工作请求；
**入参**：
session_id:会话ID
info：请求内容
citing_info_ids：引用消息ID列表
**处理流程**：

1. 调用INFOCore的saveInfo接口保存消息，和引用消息列表，得到info_id；
2. 根据info_id调用Agent编排框架;
3. 将info_id返回给前端；
--- 异步执行
4. 根据session_id调用RelationDBProvider获取session信息；
5. 如果没有会话主题则，截取info的不超过前10个字符串作为会话的主题调用updateSession接口更新会话的主题；

### 2.3. 回调方法（callback）

**功能**：接收来自Agent编排框架的消息，并通过SSE将消息发送给前端；
**入参**：
session_id
work_id
interact_id
info_id
info
**处理流程**：
1. 将请求体保存到内存队列中，并立即进行返回；
2. 根据session_id调用RelationDBProvider获取session信息；
3. 根据info消息的长度+chart_count的已存在长度，作为新的chart_count；
4. 根据work_count的数量+1，作为新的work_count；
5. 将新的chart_count和work_count更新到表中；
6. 通过SSE将info消息发送给前端（每一次顺序发送1-4个字符（随机））直到Info发送完毕通过[end]作为一条消息发送完毕的结束标识符；

### 2.4. 会话管理
#### 2.4.1. 会话创建（genSession）

**功能**：创建一个空的会话
**入参**：无
**处理流程**：
1. 通过RelationDBProvider在session表中新增一条获得id；
2. 返回得到的session_id；

#### 2.4.2. 会话删除（delSession）

**功能**：删除一个会话（只是删除了session表数据，不会去删除底层的数据）
**入参**：
session_ids
**处理流程**：

1. 根据session_ids列表通过RelationDBProvider在session表批量删除；

#### 2.4.3. 会话搜索（soSession）

**功能**：搜索会话
**入参**：
session_title(可选)
session_id(可选)
**处理流程**：
1. 根据session_title或session_id通过RelationDBProvider在session表匹配id或者session_title字段；
2. 返回搜索到的session_id，session_title,；

#### 2.4.4. 会话标题更新（updateSession）

**功能**：更新会话标题
**入参**：
session_title
session_id
**处理流程**：
1. 根据session_title或session_id通过RelationDBProvider在session表更新session_title字段；

#### 2.4.5. 会话溢出检查（checkOverflowSession）

**功能**：检查会话是否要溢出
**入参**：
session_id
**处理流程**：
1. 根据session_id通过RelationDBProvider获取session表的work_count和chart_count字段；
2. 根据session_id通过RelationDBProvider获取session_config表的max_work_count和max_chart_count字段；
3. 判断work_count < max_work_count 并且 char_count < max_chart_count；

#### 2.4.6. 更新会话配置（updateSessionConfig）

**功能**：通过RelationDBProvider更新session_config表中支持的参数；

#### 2.4.7. 搜索会话配置（soSessionConfig）

**功能**：通过RelationDBProvider获取session_config表中支持的参数；

#### 2.4.5. 表结构

##### 2.4.5.1. 会话管理表（SQLite）

- 表名：session
- 库名：chat

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| session_title | 会话主题 | TEXT | Y | | |
| work_count | 工作数量 | INT | N | | 默认为0 |
| chart_count | 内容字符数 | BIGINT | N | 默认为0 |

##### 2.4.5.2. 会话配置表（SQLite）

- 表名：session_config
- 库名：chat

| 字段名 | 含义 | 类型 | 是否可以为空（Y可以为空/N不能为空） | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | UUID | N | 主键 | |
| created | 创建时间 | timestamp | N | 普通索引 | |
| updated | 最后更新时间 | timestamp | N | 普通索引 | |
| max_work_count | 最大工作数量 | TEXT | Y | | |
| max_chart_count | 内容字符数 | BIGINT | N | 默认为0 |
