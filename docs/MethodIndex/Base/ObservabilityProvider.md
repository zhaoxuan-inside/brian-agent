# Base / ObservabilityProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## ObservabilityAccess

源码：`brian-backend/Base/ObservabilityProvider/access/ObservabilityAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `setFrameWriter` | `writer: (sessionId: string, endpointId: string, ev: TaskEvent) => boolean` | `void` | 由 Server 组合根注入 SSE 帧写通道（StreamService 就绪后） |
| `pushFrame` | `sessionId: string, endpointId: string, ev: TaskEvent` | `boolean` | FrameTransport：经 StreamService 薄通道写帧（不落库、不分片） |
| `emit` | `meta: EmitMeta, type: string, payload: unknown` | `TaskEvent | null` | — |
| `flush` | `` | `Promise<void>` | — |
| `soEvents` | `input: SoEventsInput, output: SoEventsOutput` | `Promise<boolean>` | 历史重放读：run 内 seq ASC 事件行（after_seq 支持增量拉取） |
