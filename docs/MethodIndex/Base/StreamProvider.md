# Base / StreamProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## StreamAccess

源码：`brian-backend/Base/StreamProvider/access/StreamAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `registerStream` | `input: RegisterStreamInput, output: RegisterStreamOutput, _context: StreamContext, _met...` | `Promise<boolean>` | — |
| `publishEvent` | `i: PushEventToEndpointInput, o: PushEventToEndpointOutput, _c: StreamContext, _metrics?...` | `Promise<boolean>` | — |
| `replayEvents` | `i: ReplayEndpointEventsInput, o: ReplayEndpointEventsOutput, _c: StreamContext, _metric...` | `Promise<boolean>` | — |
| `pushStream` | `input: PushStreamInput<T>, _context: StreamContext, output: PushStreamOutput` | `Promise<boolean>` | — |
| `closeStream` | `input: CloseStreamInput, output: CloseStreamOutput, _context: StreamContext, _metrics?:...` | `Promise<boolean>` | — |
| `soStreamStats` | `_context: StreamContext, output: GetStreamStatsOutput` | `Promise<boolean>` | — |
| `configStream` | `input: ConfigStreamInput, output: ConfigStreamOutput, _context: StreamContext, _metrics...` | `Promise<boolean>` | — |
| `pushText` | `sessionId: string, event: string, text: string, meta?: { run_id?: string; work_id?: str...` | `Promise<boolean>` | — |
| `pushEvent` | `sessionId: string, event: string, msgType: SSEMessageType, data: T, meta?: { run_id?: s...` | `Promise<boolean>` | — |
