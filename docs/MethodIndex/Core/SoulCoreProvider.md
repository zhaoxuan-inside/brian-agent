# Core / SoulCoreProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## SoulCoreAccess

源码：`brian-backend/Core/SoulCoreProvider/access/SoulCoreAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件：写入默认配置。 |
| `matchSoul` | `input: MatchSoulInput, output: MatchSoulOutput, context: SoulCoreContext, metrics?: Met...` | `Promise<boolean>` | 为指定 Agent 匹配 Soul（含缓存与 LLM 排名）。 |
| `optSoul` | `input: OptSoulInput, output: OptSoulOutput, context: SoulCoreContext, metrics?: Metrics...` | `Promise<boolean>` | 比较优化：候选 Soul vs 当前绑定 Soul（A vs B 裁决）。 |
| `ageSoul` | `input: AgeSoulInput, output: AgeSoulOutput, context: SoulCoreContext, metrics?: Metrics...` | `Promise<boolean>` | 依据 soul_opt_rule 规则老化不活跃的 Soul（禁用）。 |
| `soSoulRule` | `input: SoSoulRuleInput, output: SoSoulRuleOutput, context: SoulCoreContext, metrics?: M...` | `Promise<boolean>` | 查询 Soul 优化规则。 |
| `updateSoulRule` | `input: UpdateSoulRuleInput, output: UpdateSoulRuleOutput, context: SoulCoreContext, met...` | `Promise<boolean>` | 批量更新 Soul 优化规则（事务）。 |
| `soSoulContent` | `input: SoSoulContentInput, output: SoSoulContentOutput, context: SoulCoreContext, metri...` | `Promise<boolean>` | 按 id 读取 Soul 内容（聚合查询；供声明式 Agent 快照等场景，替代跨模块直查 soul 表）。 |
| `configSoulCore` | `input: ConfigSoulCoreInput, output: ConfigSoulCoreOutput, context: SoulCoreContext, met...` | `Promise<boolean>` | 获取当前 SoulCore 配置。 |
