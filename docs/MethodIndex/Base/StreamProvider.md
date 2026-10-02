# Base / StreamProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## StreamAccess

源码：`brian-backend/Base/StreamProvider/access/StreamAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `registerStream` | `input: RegisterStreamInput, output: RegisterStreamOutput, _context: StreamContext, _met...` | `Promise<boolean>` | — |
| `closeStream` | `input: CloseStreamInput, output: CloseStreamOutput, _context: StreamContext, _metrics?:...` | `Promise<boolean>` | — |
| `soStreamStats` | `_context: StreamContext, output: GetStreamStatsOutput` | `Promise<boolean>` | — |
| `configStream` | `input: ConfigStreamInput, output: ConfigStreamOutput, _context: StreamContext, _metrics...` | `Promise<boolean>` | — |
| `pushFrame` | `sessionId: string, endpointId: string, ev: TaskEvent` | `boolean` | 观测总线传输通道：endpoint → 会话定位后直写 TaskEvent 帧（不落库） |
