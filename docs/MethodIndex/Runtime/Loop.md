# Runtime / Loop 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## LoopAccess

源码：`brian-backend/Runtime/Loop/access/LoopAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `execAgentLoop` | `input: ExecAgentLoopInput, output: ExecAgentLoopOutput, context: LoopContext, metrics?:...` | `Promise<boolean>` | — |
| `abortLoopTurn` | `input: AbortLoopTurnInput, output: AbortLoopTurnOutput, context: LoopContext, metrics?:...` | `Promise<boolean>` | — |
| `configLoop` | `input: ConfigLoopInput, output: ConfigLoopOutput, context: LoopContext, metrics?: Metri...` | `Promise<boolean>` | — |
