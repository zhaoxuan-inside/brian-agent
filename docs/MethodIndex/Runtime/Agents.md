# Runtime / Agents 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## AgentDefAccess

源码：`brian-backend/Runtime/Agents/access/AgentDefAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `matchAgentDef` | `input: MatchAgentDefInput, output: MatchAgentDefOutput, context: AgentDefContext, metri...` | `Promise<boolean>` | — |
| `soAgentSnapshot` | `input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, context: AgentDefContext, m...` | `Promise<boolean>` | — |
| `declareAgent` | `input: DeclareAgentInput, output: DeclareAgentOutput, context: AgentDefContext, metrics...` | `Promise<boolean>` | — |
| `soAgentDefs` | `input: SoAgentDefsInput, output: SoAgentDefsOutput, context: AgentDefContext, metrics?:...` | `Promise<boolean>` | — |
| `configAgentDef` | `input: ConfigAgentDefInput, output: ConfigAgentDefOutput, context: AgentDefContext, met...` | `Promise<boolean>` | — |
| `killErroredAgent` | `input: KillErroredAgentInput, output: KillErroredAgentOutput, context: AgentDefContext,...` | `Promise<boolean>` | — |
| `invalidateAgentBindingCache` | `` | `void` | — |
