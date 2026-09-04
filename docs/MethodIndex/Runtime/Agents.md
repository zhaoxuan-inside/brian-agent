# Runtime / Agents 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## AgentDefAccess

源码：`brian-backend/Runtime/Agents/access/AgentDefAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件 |
| `matchAgentDef` | `input: MatchAgentDefInput, output: MatchAgentDefOutput, context: AgentDefContext, metri...` | `Promise<boolean>` | 确定性匹配（exact → signature → llm → 构建） |
| `soAgentSnapshot` | `input: SoAgentSnapshotInput, output: SoAgentSnapshotOutput, context: AgentDefContext, m...` | `Promise<boolean>` | 组装会话级快照（组件按任务重解析） |
| `declareAgent` | `input: DeclareAgentInput, output: DeclareAgentOutput, context: AgentDefContext, metrics...` | `Promise<boolean>` | 声明式定义 upsert（幂等 by name） |
| `soAgentDefs` | `input: SoAgentDefsInput, output: SoAgentDefsOutput, context: AgentDefContext, metrics?:...` | `Promise<boolean>` | 查询定义列表 |
| `configAgentDef` | `input: ConfigAgentDefInput, output: ConfigAgentDefOutput, context: AgentDefContext, met...` | `Promise<boolean>` | 模块配置 |
