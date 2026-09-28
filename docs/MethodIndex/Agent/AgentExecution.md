# Agent / AgentExecution 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## AgentExecutionAccess

源码：`brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `execAgent` | `i: ExecAgentInput, o: ExecAgentOutput, c: AgentExecutionContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `execAgentAsync` | `i: ExecAgentAsyncInput, o: ExecAgentAsyncOutput, c: AgentExecutionContext, metrics?: Me...` | `Promise<boolean>` | — |
| `execThink` | `i: ThinkInput, o: ThinkOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Re...` | `Promise<boolean>` | — |
| `execAct` | `i: ActInput, o: ActOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report` | `Promise<boolean>` | — |
| `execReflect` | `i: ReflectInput, o: ReflectOutput, c: AgentExecutionContext, metrics?: Metrics, report?...` | `Promise<boolean>` | — |
| `execAnswer` | `i: AnswerInput, o: AnswerOutput, c: AgentExecutionContext, metrics?: Metrics, report?: ...` | `Promise<boolean>` | — |
| `soTrace` | `i: GetTraceInput, o: GetTraceOutput, c: AgentExecutionContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `soExecQueueStatus` | `i: GetExecQueueStatusInput, o: GetExecQueueStatusOutput, c: AgentExecutionContext, metr...` | `Promise<boolean>` | — |
| `configAgentExecution` | `i: ConfigAgentExecutionInput, o: ConfigAgentExecutionOutput, c: AgentExecutionContext, ...` | `Promise<boolean>` | — |
