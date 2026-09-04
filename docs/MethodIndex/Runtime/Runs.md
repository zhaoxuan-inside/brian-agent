# Runtime / Runs 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## RunGatewayAccess

源码：`brian-backend/Runtime/Runs/access/RunGatewayAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件 |
| `submitRun` | `input: SubmitRunInput, output: SubmitRunOutput, context: RunGatewayContext, metrics?: M...` | `Promise<boolean>` | 提交运行（两段式 ack） |
| `waitRun` | `input: WaitRunInput, output: WaitRunOutput, context: RunGatewayContext, metrics?: Metri...` | `Promise<boolean>` | 等待运行结算 |
| `steerRun` | `input: SteerRunInput, output: SteerRunOutput, context: RunGatewayContext, metrics?: Met...` | `Promise<boolean>` | 注入排队消息（活动 run 边界生效） |
| `abortRun` | `input: AbortRunInput, output: AbortRunOutput, context: RunGatewayContext, metrics?: Met...` | `Promise<boolean>` | 类型化取消 |
| `soRunStatus` | `input: SoRunStatusInput, output: SoRunStatusOutput, context: RunGatewayContext, metrics...` | `Promise<boolean>` | 查询运行状态 |
| `configRuns` | `input: ConfigRunsInput, output: ConfigRunsOutput, context: RunGatewayContext, metrics?:...` | `Promise<boolean>` | 模块配置 |
| `drainSteeringFor` | `sessionKey: string` | `string[]` | Loop 队列接线：边界抽干 steering（组合根绑定，非业务方法） |
| `takeFollowupFor` | `sessionKey: string` | `string[]` | Loop 队列接线：外层 followup 取队列（组合根绑定，非业务方法） |
