# Base / MQProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## MQAccess

源码：`brian-backend/Base/MQProvider/access/MQAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `sendMQ` | `input: SendMQInput, output: SendMQOutput, context: MQContext, metrics?: Metrics, report...` | `Promise<boolean>` | — |
| `consumeMQ` | `input: ConsumeMQInput, output: ConsumeMQOutput, context: MQContext, metrics?: Metrics, ...` | `Promise<boolean>` | — |
| `ackMQ` | `input: AckMQInput, output: AckMQOutput, context: MQContext, metrics?: Metrics, report?:...` | `Promise<boolean>` | — |
| `nackMQ` | `input: NackMQInput, output: NackMQOutput, context: MQContext, metrics?: Metrics, report...` | `Promise<boolean>` | — |
| `soQueueStats` | `input: GetQueueStatsInput, output: GetQueueStatsOutput, context: MQContext, metrics?: M...` | `Promise<boolean>` | — |
| `enableMQ` | `input: EnableMQInput, output: EnableMQOutput, context: MQContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `closeMQ` | `input: CloseMQInput, output: CloseMQOutput, context: MQContext, metrics?: Metrics, repo...` | `Promise<boolean>` | — |
| `cleanupExpiredMessages` | `` | `Promise<number>` | — |
| `recoverStuckMessages` | `queue?: string` | `Promise<number>` | — |
| `replayMQ` | `messageId: string` | `Promise<boolean>` | — |
