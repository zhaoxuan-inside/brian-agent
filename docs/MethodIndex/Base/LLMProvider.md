# Base / LLMProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## LLMAccess

源码：`brian-backend/Base/LLMProvider/access/LLMAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `addLLMProvider` | `input: AddLLMProviderInput, output: AddLLMProviderOutput, context: LLMContext, metrics?...` | `Promise<boolean>` | — |
| `updateLLMProvider` | `input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, context: LLMContext, me...` | `Promise<boolean>` | — |
| `delLLMProvider` | `input: DelLLMProviderInput, output: DelLLMProviderOutput, context: LLMContext, metrics?...` | `Promise<boolean>` | — |
| `soLLMProvider` | `input: SoLLMProviderInput, output: SoLLMProviderOutput, context: LLMContext, metrics?: ...` | `Promise<boolean>` | — |
| `testLLMProvider` | `input: TestLLMProviderInput, output: TestLLMProviderOutput, context: LLMContext, metric...` | `Promise<boolean>` | — |
| `listLLM` | `input: ListLLMInput, output: ListLLMOutput, context: LLMContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `addLLM` | `input: AddLLMInput, output: AddLLMOutput, context: LLMContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `delLLM` | `input: DelLLMInput, output: DelLLMOutput, context: LLMContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `updateLLM` | `input: UpdateLLMInput, output: UpdateLLMOutput, context: LLMContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `soLLM` | `input: SoLLMInput, output: SoLLMOutput, context: LLMContext, metrics?: Metrics, report?...` | `Promise<boolean>` | — |
| `soLLMById` | `input: GetLLMInput, output: GetLLMOutput, context: LLMContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `execLLM` | `input: ExecLLMInput, output: ExecLLMOutput, context: LLMContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `execLLMEvents` | `input: ExecLLMEventsInput, output: ExecLLMEventsOutput, context: LLMContext, metrics?: ...` | `Promise<boolean>` | — |
| `embedLLM` | `input: EmbedLLMInput, output: EmbedLLMOutput, context: LLMContext, metrics?: Metrics, r...` | `Promise<boolean>` | — |
| `genLLMAttr` | `input: GenLLMAttrInput, output: GenLLMAttrOutput, context: LLMContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `visualizedLLM` | `input: VisualizedLLMInput, output: VisualizedLLMOutput, context: LLMContext, metrics?: ...` | `Promise<boolean>` | — |
| `enableLLM` | `input: EnableLLMInput, output: EnableLLMOutput, context: LLMContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `soTokenUsage` | `input: SoTokenUsageInput, output: SoTokenUsageOutput, context: LLMContext` | `Promise<boolean>` | — |
