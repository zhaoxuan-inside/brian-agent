# Core / LLMCoreProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## LLMCoreAccess

源码：`brian-backend/Core/LLMCoreProvider/access/LLMCoreAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `matchLLM` | `input: MatchLLMInput, output: MatchLLMOutput, context: LLMCoreContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `limitLLM` | `input: LimitLLMInput, output: LimitLLMOutput, context: LLMCoreContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `checkLLMQuota` | `input: CheckLLMQuotaInput, output: CheckLLMQuotaOutput, context: LLMCoreContext, metric...` | `Promise<boolean>` | — |
| `configLLMCore` | `input: ConfigLLMCoreInput, output: ConfigLLMCoreOutput, context: LLMCoreContext, metric...` | `Promise<boolean>` | — |
| `recordLLMUsage` | `input: RecordLLMUsageInput, output: RecordLLMUsageOutput, context: LLMCoreContext, metr...` | `Promise<boolean>` | — |
