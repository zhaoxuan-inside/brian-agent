# MQ Provider

## 1. 设计目标

1. 解耦具体的消息队列（MQ）与系统，通过 Repository 设计模式为上层提供统一的消息队列操作接口；
2. 所有对消息队列的操作都不能直接进行，都必须要通过 MQProvider；
3. 负责消息的发送、消费、确认、否认操作；
4. 支持消息优先级与重试机制，消息按优先级降序消费，消费失败的消息按最大重试次数自动重试；
5. 提供可视化数据接口，支持消息队列健康状态监控；
6. 基于 RelationDBProvider 提供的关系数据库接口实现 MQ，所有配置项（含消息保留时间、默认重试次数、默认优先级等）统一存储在关系数据库配置表中；

## 2. 对象定义

> 以下对象贯穿各功能接口，统一定义如下。
> Input、Context、Output 为项目通用基类，参见 `_00_DevStandardization.md`。

### 2.1. MQ 上下文（MQContext）

继承 Context 基类，消息队列相关操作的执行上下文。

### 2.2. 消息数据对象（MessageData）

用于发送消息时描述消息内容。

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| queue | STRING | Y | 队列名称 |
| payload | JSON | Y | 消息内容（JSON 格式） |
| priority | INT | N | 消息优先级（0-10，数值越大优先级越高），未指定时取配置 `default_priority`（默认 5） |

## 3. 功能设计

### 3.1. 消息操作

#### 3.1.1. 发送消息（sendMQ）

**功能**：向消息队列发送一条消息

**方法签名**：`Boolean sendMQ(SendMQInput input, MQContext context, SendMQOutput output)`

**入参（SendMQInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| data | MessageData | Y | 消息数据 |

**处理流程**：

1. 通过 RelationDBProvider 向 `queue_message` 表插入一条消息记录，状态为 PENDING；
2. `priority` 未指定时从关系数据库配置表 mq_config 读取 `default_priority`（默认 5）；消息的 `max_retries` 从 mq_config 读取 `default_max_retries`（默认 3）；
3. 返回消息 id；

**返回**：Boolean，表示发送是否完成；消息 id 通过 output 参数返回

#### 3.1.2. 消费消息（consumeMQ）

**功能**：从消息队列消费一条消息

**方法签名**：`Boolean consumeMQ(ConsumeMQInput input, MQContext context, ConsumeMQOutput output)`

**入参（ConsumeMQInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| queue | STRING | Y | 队列名称 |

**处理流程**：

1. 通过 RelationDBProvider 从 `queue_message` 表中按优先级降序、创建时间升序获取一条 PENDING 状态的消息；
2. 将消息状态更新为 PROCESSING；
3. 返回消息内容；

**返回**：Boolean，表示消费是否完成；消息内容通过 output 参数返回

#### 3.1.3. 确认消息（ackMQ）

**功能**：确认消息已处理完成

**方法签名**：`Boolean ackMQ(AckMQInput input, MQContext context, AckMQOutput output)`

**入参（AckMQInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| message_id | STRING | Y | 消息 ID |

**处理流程**：

1. 通过 RelationDBProvider 将 `queue_message` 表中指定消息的状态更新为 COMPLETED；
2. 记录处理完成时间；

**返回**：Boolean，表示确认是否完成

#### 3.1.4. 否认消息（nackMQ）

**功能**：否认消息处理完成，消息将重新入队或进入重试

**方法签名**：`Boolean nackMQ(NackMQInput input, MQContext context, NackMQOutput output)`

**入参（NackMQInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| message_id | STRING | Y | 消息 ID |
| reason | STRING | N | 失败原因 |

**处理流程**：

1. 通过 RelationDBProvider 查询消息的 `retry_count` 和 `max_retries`；
2. 若 `max_retries` 未指定，从关系数据库配置表 mq_config 读取 `default_max_retries`（默认 3）；
3. 如果 `retry_count` < `max_retries`，则递增 `retry_count`，将状态回退为 PENDING；
4. 如果 `retry_count` >= `max_retries`，则将状态更新为 FAILED；

**返回**：Boolean，表示否认是否完成

### 3.2. 队列统计

#### 3.2.1. 获取队列统计（getQueueStats）

**功能**：获取指定队列的统计信息

**方法签名**：`Boolean getQueueStats(GetQueueStatsInput input, MQContext context, GetQueueStatsOutput output)`

**入参（GetQueueStatsInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| queue | STRING | N | 队列名称，不指定则返回所有队列统计 |

**处理流程**：

1. 通过 RelationDBProvider 统计 `queue_message` 表中各状态（PENDING/PROCESSING/COMPLETED/FAILED）的消息数量；
2. 返回统计信息；

**返回**：Boolean，表示查询是否完成；统计信息通过 output 参数返回

### 3.3. 可视化与运维

#### 3.3.2. 启用/禁用（enableMQ）

**功能**：启用或禁用 MQ 组件，用于运行时控制消息队列的可用状态

**方法签名**：`Boolean enableMQ(EnableMQInput input, MQContext context, EnableMQOutput output)`

**入参（EnableMQInput extends Input）**：

| 属性 | 类型 | 是否必填 | 说明 |
| ------ | ----- | ----- | ----- |
| enable | BOOLEAN | Y | 是否启用 |

**处理流程**：

1. 根据 `enable` 参数启用或禁用 MQ 组件，并将 `enabled` 状态持久化到关系数据库配置表 mq_config（库名 `mq`）；
2. 禁用时关闭 MQ 连接，释放资源，将 mq_config 中 `enabled` 置为 false；禁用期间所有消息队列操作将返回失败（MQ 组件未启用）；
3. 启用时重新初始化 MQ 连接，恢复可用状态，将 mq_config 中 `enabled` 置为 true；

**返回**：Boolean，表示操作是否完成

> 注：组件初始化时从 mq_config 读取 `enabled` 状态以恢复上次的可用状态（如上次为禁用则保持禁用，避免状态丢失）；运行时内存中维护 `enabled` 状态供各操作快速校验，状态变更同步落库。

## 4. 表设计

> 消息队列表（4.1）存储在关系数据库中，逻辑库名为 `mq`；MQProvider 用到的所有配置项（含 MQ 组件启用 / 禁用状态）存储在关系数据库配置表 mq_config 中（库名 `mq`，见 4.2）。所有表均包含 id、created、updated 三个标准字段。

### 4.1. 消息队列表（关系数据库）

- `表名`： queue_message
- `库名`： mq
- `存储`： 关系数据库（由 RelationDBProvider 管理）

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| id | 数据唯一标识 | STRING | N | 主键 | UUID |
| created | 创建时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |
| queue | 队列名称 | STRING | N | 普通索引 | |
| payload | 消息内容 | JSON | N | | |
| priority | 优先级 | INT | N | | 0-10，默认值由配置 `default_priority` 决定（默认 5） |
| status | 消息状态 | STRING | N | 普通索引 | PENDING / PROCESSING / COMPLETED / FAILED |
| retry_count | 重试次数 | INT | N | | 默认 0 |
| max_retries | 最大重试次数 | INT | N | | 默认值由配置 `default_max_retries` 决定（默认 3） |
| processed_at | 处理时间 | INT64 | Y | | 毫秒时间戳 |

> 注：消息保留时间由配置项 `message_ttl`（默认 86400 秒，即 1 天）控制，超期消息由定时任务清理。

### 4.2. MQProvider 配置表（关系数据库）

- `表名`： mq_config
- `库名`： mq
- `存储`： 关系数据库（由 RelationDBProvider 管理）
- `表类型`： 关系表

> MQProvider 用到的所有配置项集中存储于关系数据库（库名 `mq`），采用键值对结构，运行时按需读取；消息保留时间、默认重试次数、默认优先级等参数由 sendMQ / nackMQ 读取，MQ 组件启用 / 禁用状态由 enableMQ 读取并持久化，避免硬编码与状态丢失。

| 字段名 | 含义 | 类型 | 是否可以为空 | 索引类型 | 备注 |
| ------ | ----- | ----- | ----- | ----- | ----- |
| config_key | 配置键 | STRING | N | 主键 | 唯一 |
| config_value | 配置值 | STRING | N | | 按 value_type 解析 |
| value_type | 值类型 | STRING | N | | INT / DOUBLE / BOOLEAN / STRING |
| description | 说明 | STRING | Y | | |
| updated | 最后更新时间 | INT64 | N | 普通索引 | 毫秒时间戳 |

默认配置项：

| config_key | config_value | value_type | description |
| ------ | ----- | ----- | ----- |
| enabled | true | BOOLEAN | MQ组件是否启用（enableMQ 读写） |
| message_ttl | 86400 | INT | 消息默认保留时间（秒，默认1天） |
| default_max_retries | 3 | INT | 默认最大重试次数 |
| default_priority | 5 | INT | 默认消息优先级（0-10） |

## 5. 重要内容

1. MQProvider 是消息队列的唯一操作入口，上层不可直接操作消息队列；
2. MQ 基于 RelationDBProvider 实现，无需引入外部消息队列中间件，通过 Repository 接口封装底层消息队列操作；
3. 消息按优先级降序消费，同优先级按创建时间升序消费；
4. MQProvider 用到的所有配置项（含 MQ 组件启用 / 禁用状态 `enabled`、消息保留时间 `message_ttl`、默认重试次数 `default_max_retries`、默认优先级 `default_priority` 等）统一存储于关系数据库配置表 mq_config（库名 `mq`，见 4.2），运行时按需读取；消息保留时间、默认重试次数、默认优先级等参数从硬编码改为存储在配置表中；
5. enableMQ 的启用 / 禁用状态同步持久化到 mq_config，组件初始化时恢复，避免状态丢失；
6. 消息清理由配置项 `message_ttl` 控制，超期消息由定时任务清理；
7. `enableMQ` 为运行时启用 / 禁用（可恢复），`closeMQ` 为系统关闭时的终态释放（不可恢复，需重新初始化组件）；
8. 所有方法通过代理模式增加切面注入能力，默认记录日志和耗时；
