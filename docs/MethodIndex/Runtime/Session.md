# Runtime / Session 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## SessionAccess

源码：`brian-backend/Runtime/Session/access/SessionAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `addSession` | `input: AddSessionInput, output: AddSessionOutput, context: SessionContext, metrics?: Me...` | `Promise<boolean>` | — |
| `addMessage` | `input: AddMessageInput, output: AddMessageOutput, context: SessionContext, metrics?: Me...` | `Promise<boolean>` | — |
| `addPart` | `input: AddPartInput, output: AddPartOutput, context: SessionContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `updatePart` | `input: UpdatePartInput, output: UpdatePartOutput, context: SessionContext, metrics?: Me...` | `Promise<boolean>` | — |
| `soMessages` | `input: SoMessagesInput, output: SoMessagesOutput, context: SessionContext, metrics?: Me...` | `Promise<boolean>` | — |
| `configSession` | `input: ConfigSessionInput, output: ConfigSessionOutput, context: SessionContext, metric...` | `Promise<boolean>` | — |
