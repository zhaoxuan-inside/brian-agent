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
info：请求内容
citing_info_ids：引用消息ID列表
**处理流程**：

1. 调用INFOCore的saveInfo接口保存消息，和引用消息列表，得到info_id；
2. 根据info_id调用Agent编排框架;
3. 将info_id返回给前端；

### 2.3. 回调方法（callback）

**功能**：接收来自Agent编排框架的消息，并通过SSE将消息发送给前端；
**入参**：
info
