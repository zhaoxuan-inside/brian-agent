# Runtime / Runs 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## RunGatewayAccess

源码：`brian-backend/Runtime/Runs/access/RunGatewayAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `submitRun` | `input: SubmitRunInput, output: SubmitRunOutput, context: RunGatewayContext, metrics?: M...` | `Promise<boolean>` | — |
| `waitRun` | `input: WaitRunInput, output: WaitRunOutput, context: RunGatewayContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `steerRun` | `input: SteerRunInput, output: SteerRunOutput, context: RunGatewayContext, metrics?: Met...` | `Promise<boolean>` | — |
| `abortRun` | `input: AbortRunInput, output: AbortRunOutput, context: RunGatewayContext, metrics?: Met...` | `Promise<boolean>` | — |
| `soRunStatus` | `input: SoRunStatusInput, output: SoRunStatusOutput, context: RunGatewayContext, metrics...` | `Promise<boolean>` | — |
| `waitPermission` | `i: WaitPermissionInput, o: WaitPermissionOutput, c: RunGatewayContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `answerPermission` | `i: AnswerPermissionInput, o: AnswerPermissionOutput, c: RunGatewayContext, metrics?: Me...` | `Promise<boolean>` | — |
| `waitUserAnswer` | `i: WaitUserAnswerInput, o: WaitUserAnswerOutput, c: RunGatewayContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `answerUserAsk` | `i: AnswerUserAskInput, o: AnswerUserAskOutput, c: RunGatewayContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `configRuns` | `input: ConfigRunsInput, output: ConfigRunsOutput, context: RunGatewayContext, metrics?:...` | `Promise<boolean>` | — |
| `drainSteeringFor` | `sessionKey: string` | `string[]` | — |
| `takeFollowupFor` | `sessionKey: string` | `string[]` | — |
