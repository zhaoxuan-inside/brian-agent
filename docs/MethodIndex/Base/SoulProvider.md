# Base / SoulProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## SoulAccess

源码：`brian-backend/Base/SoulProvider/access/SoulAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `addSoul` | `input: AddSoulInput, output: AddSoulOutput, context: SoulContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `delSoul` | `input: DelSoulInput, output: DelSoulOutput, context: SoulContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `updateSoul` | `input: UpdateSoulInput, output: UpdateSoulOutput, context: SoulContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `soSoulById` | `input: GetSoulInput, output: GetSoulOutput, context: SoulContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `soSoul` | `input: SoSoulInput, output: SoSoulOutput, context: SoulContext, metrics?: Metrics, repo...` | `Promise<boolean>` | — |
| `enableSoul` | `input: EnableSoulInput, output: EnableSoulOutput, context: SoulContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `closeSoul` | `input: CloseSoulInput, output: CloseSoulOutput, context: SoulContext, metrics?: Metrics...` | `Promise<boolean>` | — |
| `recordSoulUsage` | `input: RecordSoulUsageInput, output: RecordSoulUsageOutput, context: SoulContext, metri...` | `Promise<boolean>` | — |
