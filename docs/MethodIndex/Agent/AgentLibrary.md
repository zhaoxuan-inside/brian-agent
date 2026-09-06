# Agent / AgentLibrary 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## AgentLibraryAccess

源码：`brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `addAgent` | `i: AddAgentInput, o: AddAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?...` | `Promise<boolean>` | — |
| `matchAgent` | `i: MatchAgentInput, o: MatchAgentOutput, c: AgentLibraryContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `updateAgent` | `i: UpdateAgentInput, o: UpdateAgentOutput, c: AgentLibraryContext, metrics?: Metrics, r...` | `Promise<boolean>` | — |
| `delAgent` | `i: DelAgentInput, o: DelAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?...` | `Promise<boolean>` | — |
| `toggleAgent` | `i: ToggleAgentInput, o: ToggleAgentOutput, c: AgentLibraryContext, metrics?: Metrics, r...` | `Promise<boolean>` | — |
| `recordAgentUsage` | `i: RecordAgentUsageInput, o: RecordAgentUsageOutput, c: AgentLibraryContext, metrics?: ...` | `Promise<boolean>` | — |
| `soAgent` | `i: GetAgentInput, o: GetAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?...` | `Promise<boolean>` | — |
| `bindAgentComponent` | `i: BindAgentComponentInput, o: BindAgentComponentOutput, c: AgentLibraryContext, metric...` | `Promise<boolean>` | 绑定组件到 Agent（绑定唯一事实源：agent 表；评估链路调用） |
| `unbindAgentComponent` | `i: UnbindAgentComponentInput, o: UnbindAgentComponentOutput, c: AgentLibraryContext, me...` | `Promise<boolean>` | 解绑 Agent 组件（幂等；评估链路调用） |
| `ageAgent` | `i: AgeAgentInput, o: AgeAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?...` | `Promise<boolean>` | — |
| `soAgentRule` | `i: GetAgentRuleInput, o: GetAgentRuleOutput, c: AgentLibraryContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `updateAgentRule` | `i: UpdateAgentRuleInput, o: UpdateAgentRuleOutput, c: AgentLibraryContext, metrics?: Me...` | `Promise<boolean>` | — |
| `configAgentLibrary` | `i: ConfigAgentLibraryInput, o: ConfigAgentLibraryOutput, c: AgentLibraryContext, metric...` | `Promise<boolean>` | — |
