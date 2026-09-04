# Runtime / Loop 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## LoopAccess

源码：`brian-backend/Runtime/Loop/access/LoopAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件 |
| `execAgentLoop` | `input: ExecAgentLoopInput, output: ExecAgentLoopOutput, context: LoopContext, metrics?:...` | `Promise<boolean>` | 执行两级 agent 循环 |
| `abortLoopTurn` | `input: AbortLoopTurnInput, output: AbortLoopTurnOutput, context: LoopContext, metrics?:...` | `Promise<boolean>` | 类型化取消活动 run |
| `configLoop` | `input: ConfigLoopInput, output: ConfigLoopOutput, context: LoopContext, metrics?: Metri...` | `Promise<boolean>` | 模块配置 |
