# Agent / EvolutorAgent 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## EvolutorAgentAccess

源码：`brian-backend/Agent/EvolutorAgent/access/EvolutorAgentAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `evalWorkAgent` | `i: EvalWorkAgentInput, o: EvalWorkAgentOutput, c: EvolutorAgentContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `evalWriterAgent` | `i: EvalWriterAgentInput, o: EvalWriterAgentOutput, c: EvolutorAgentContext, metrics?: M...` | `Promise<boolean>` | — |
| `startEvalSchedule` | `i: StartEvalScheduleInput, o: StartEvalScheduleOutput, c: EvolutorAgentContext, metrics...` | `Promise<boolean>` | — |
| `stopEvalSchedule` | `i: StopEvalScheduleInput, o: StopEvalScheduleOutput, c: EvolutorAgentContext, metrics?:...` | `Promise<boolean>` | — |
| `runEvalOnce` | `i: RunEvalOnceInput, o: RunEvalOnceOutput, c: EvolutorAgentContext, metrics?: Metrics, ...` | `Promise<boolean>` | — |
| `soEvaluation` | `i: GetEvaluationInput, o: GetEvaluationOutput, c: EvolutorAgentContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `soEvolutionReport` | `i: GetEvolutionReportInput, o: GetEvolutionReportOutput, c: EvolutorAgentContext, metri...` | `Promise<boolean>` | — |
| `configEvolutorAgent` | `i: ConfigEvolutorAgentInput, o: ConfigEvolutorAgentOutput, c: EvolutorAgentContext, met...` | `Promise<boolean>` | — |
