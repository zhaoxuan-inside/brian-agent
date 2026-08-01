# MQ Core

## 1. 设计目标

1. 为上层提供后台消息消费能力；
2. 管理 Worker 的生命周期；

## 2. 功能设计

> MQCore 基于 MQProvider 提供的底层消息操作接口（sendMQ / consumeMQ / ackMQ / nackMQ / getQueueStats / enableMQ / closeMQ / visualizedMQ）实现 Worker 模式（后台轮询消费）。Provider 层仅负责消息的 CRUD 与连接管理，Worker 的生命周期（创建、停止、状态查询）等业务逻辑由 Core 层统一维护，Worker 状态在内存中维护，不落库。

### 2.1. 启动 Worker（startWorker）

**功能**：启动一个后台 Worker 轮询消费指定队列的消息

**入参**：
- input：StartWorkerInput（继承 Input），包含以下字段：
  - queue：队列名称
  - handler：消息处理函数
  - interval：轮询间隔毫秒，默认 1000（可选）
- context：StartWorkerContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：StartWorkerOutput（继承 Output），承载返回内容：
  - worker_id：Worker ID

**处理流程**：

1. 生成 `worker_id`（UUID），初始化 Worker 运行时记录 `{ worker_id, queue, handler, interval, started_at: now(), processed_count: 0, status: RUNNING }` 存入内存 Map；
2. 创建 `setInterval` 定时器，按 `interval` 毫秒间隔执行轮询循环：
   a. 调用 MQProvider.consumeMQ 获取队列中的下一条待消费消息（按 priority 降序 + created 升序）；
   b. 若获取到消息，记录消息开始处理时间，调用 `handler` 函数处理消息；
   c. handler 成功返回：调用 MQProvider.ackMQ 确认消息消费，processed_count += 1；
   d. handler 抛出异常：调用 MQProvider.nackMQ 否认消息（触发重试机制，由 MQProvider 内部控制 max_retries），将错误信息记录到 Worker 的 last_error 字段；
   e. 若未获取到消息（队列为空）：跳过本轮，等待下一个 interval；
3. Worker ID 及启动信息写入 output 返回；
4. 若创建过程中发生异常（如 handler 不是函数类型），清除定时器，返回 false 并记录错误日志；

**返回**：Boolean，表示 Worker 是否启动成功；Worker ID 通过 output 参数返回

### 2.2. 停止 Worker（stopWorker）

**功能**：停止指定队列的 Worker

**入参**：
- input：StopWorkerInput（继承 Input），包含以下字段：
  - worker_id：Worker ID（可选）
  - queue：队列名称（可选）
- context：StopWorkerContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：StopWorkerOutput（继承 Output），承载返回内容

**处理流程**：

1. 若 `worker_id` 非空：从内存 Worker 注册表中按 worker_id 查找对应的定时器，找到则清除 `clearInterval`；
2. 若 `queue` 非空：遍历 Worker 注册表，找到所有 queue 匹配的 Worker，逐一清除其定时器；
3. 若 `worker_id` 和 `queue` 均为空：返回 false，提示必须提供至少一个参数；
4. 将已停止的 Worker 从内存注册表中移除（或标记 status=STOPPED）；
5. 返回 true 表示停止操作完成；

**返回**：Boolean，表示停止是否完成

### 2.3. 查看 Worker 状态（getWorker）

**功能**：查看当前运行的 Worker 状态

**入参**：
- input：GetWorkerInput（继承 Input），包含以下字段：
  - queue：队列名称（可选）
- context：GetWorkerContext（继承 Context），会话上下文（session_id, work_id, interact_id 等）
- output：GetWorkerOutput（继承 Output），承载返回内容：
  - workers：Worker 列表

**处理流程**：

1. 若 `queue` 非空：从内存 Worker 注册表中筛选出 queue 匹配的 Worker 列表；
2. 若 `queue` 未指定：返回所有运行中（status=RUNNING）的 Worker 列表；
3. 对每个 Worker，返回以下状态信息：`{ worker_id, queue, started_at, processed_count, interval, last_error, status }`；
4. 将 Worker 状态列表写入 output 返回；

**返回**：Boolean，表示查询是否完成；Worker 列表通过 output 参数返回

## 重要内容

所有方法通过代理模式（AOP）增加切面注入能力，默认记录日志和耗时；

## 3. 表设计

不需要额外的表，Worker 状态在内存中维护。
