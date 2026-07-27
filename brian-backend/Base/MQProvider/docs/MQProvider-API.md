# MQProvider API 文档

> 解耦具体的消息队列（MQ）与系统，通过 Repository 设计模式为上层提供统一的消息队列操作接口。
> 基于 RelationDBProvider（SQLite）实现，无需引入外部消息队列中间件。

## 依赖

```typescript
import { RelationDBAccess } from '@brian-agent/base/RelationDBProvider';
import { MQAccess } from '@brian-agent/base/MQProvider';

const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
await relationDb.initialize();

const mq = new MQAccess(relationDb);
await mq.initialize();
```

## 方法签名

统一签名：`Promise<boolean> method(Input input, Context context, Output output)`

### sendMQ - 发送消息

向消息队列发送一条消息。priority 未指定时取配置 `default_priority`（默认 5）；max_retries 从配置 `default_max_retries`（默认 3）读取。

```typescript
const output = new SendMQOutput();
await mq.sendMQ(
  {
    data: {
      queue: 'task',
      payload: { action: 'sync', target: 'db' },
      priority: 8,
    },
  },
  new MQContext(),
  output,
);
console.log(output.id); // 消息 ID
```

### consumeMQ - 消费消息

从消息队列消费一条消息。按优先级降序、创建时间升序获取一条 PENDING 状态的消息，将状态更新为 PROCESSING，返回消息内容。无可用消息时 `output.message` 为 null。

```typescript
const output = new ConsumeMQOutput();
await mq.consumeMQ({ queue: 'task' }, new MQContext(), output);
if (output.message) {
  console.log(output.message.id);       // 消息 ID（用于 ack/nack）
  console.log(output.message.payload);  // 消息内容（已解析）
  console.log(output.message.priority); // 优先级
}
```

### ackMQ - 确认消息

确认消息已处理完成，将状态更新为 COMPLETED 并记录处理完成时间。

```typescript
await mq.ackMQ(
  { message_id: '消息ID' },
  new MQContext(),
  new AckMQOutput(),
);
```

### nackMQ - 否认消息

否认消息处理完成。若 `retry_count < max_retries`，递增 `retry_count` 并将状态回退为 PENDING（重新入队）；否则将状态更新为 FAILED。

```typescript
const output = new NackMQOutput();
await mq.nackMQ(
  { message_id: '消息ID', reason: '处理超时' },
  new MQContext(),
  output,
);
console.log(output.status);       // PENDING（重新入队）或 FAILED（重试耗尽）
console.log(output.retry_count);  // 当前重试次数
```

### getQueueStats - 获取队列统计

统计 queue_message 表中各状态（PENDING/PROCESSING/COMPLETED/FAILED）的消息数量。queue 不指定则返回所有队列统计。

```typescript
const output = new GetQueueStatsOutput();
await mq.getQueueStats({ queue: 'task' }, new MQContext(), output);
console.log(output.stats);
// { pending: 5, processing: 2, completed: 100, failed: 1, total: 108 }

// 所有队列统计
const allOutput = new GetQueueStatsOutput();
await mq.getQueueStats({}, new MQContext(), allOutput);
console.log(allOutput.stats);
```

### enableMQ - 启用/禁用组件

运行时控制 MQ 组件可用状态，状态持久化到 mq_config。禁用时所有消息队列操作将抛出 ComponentDisabledError。

```typescript
await mq.enableMQ({ enable: false }, new MQContext(), new EnableMQOutput());
await mq.enableMQ({ enable: true }, new MQContext(), new EnableMQOutput());
```

## 表结构

### queue_message 表（消息队列表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| created | INTEGER | 创建时间（毫秒时间戳） |
| updated | INTEGER | 最后更新时间（毫秒时间戳） |
| queue | TEXT | 队列名称 |
| payload | TEXT | 消息内容（JSON 字符串） |
| priority | INTEGER | 优先级（0-10，默认 5） |
| status | TEXT | 消息状态：PENDING / PROCESSING / COMPLETED / FAILED |
| retry_count | INTEGER | 重试次数（默认 0） |
| max_retries | INTEGER | 最大重试次数（默认 3） |
| processed_at | INTEGER | 处理完成时间（毫秒时间戳，可空） |

### mq_config 表（配置表）

| config_key | config_value | value_type | description |
|------------|-------------|------------|-------------|
| enabled | true | BOOLEAN | MQ组件是否启用（enableMQ 读写） |
| message_ttl | 86400 | INT | 消息默认保留时间（秒，默认1天） |
| default_max_retries | 3 | INT | 默认最大重试次数 |
| default_priority | 5 | INT | 默认消息优先级（0-10） |

## 消息生命周期

```
sendMQ → PENDING
             ↓ consumeMQ
         PROCESSING
             ↓ ackMQ              ↓ nackMQ (retry_count < max_retries)
         COMPLETED              PENDING (retry_count++)
                                    ↓ consumeMQ
                                PROCESSING
                                    ↓ nackMQ (retry_count >= max_retries)
                                FAILED
```

- 消息按优先级降序消费，同优先级按创建时间升序消费；
- 消费失败的消息按最大重试次数自动重试；
- 消息保留时间由配置项 `message_ttl` 控制（默认 86400 秒，即 1 天），超期消息由定时任务清理。
