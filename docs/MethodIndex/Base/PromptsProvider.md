# Base / PromptsProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## PromptsAccess

源码：`brian-backend/Base/PromptsProvider/access/PromptsAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `addPrompt` | `input: AddPromptInput, output: AddPromptOutput, context: PromptContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `delPrompt` | `input: DelPromptInput, output: DelPromptOutput, context: PromptContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `updatePrompt` | `input: UpdatePromptInput, output: UpdatePromptOutput, context: PromptContext, metrics?:...` | `Promise<boolean>` | — |
| `soPromptById` | `input: GetPromptInput, output: GetPromptOutput, context: PromptContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `soPrompt` | `input: SoPromptInput, output: SoPromptOutput, context: PromptContext, metrics?: Metrics...` | `Promise<boolean>` | — |
| `execPrompt` | `input: ExecPromptInput, output: ExecPromptOutput, context: PromptContext, metrics?: Met...` | `Promise<boolean>` | — |
| `enablePrompts` | `input: EnablePromptsInput, output: EnablePromptsOutput, context: PromptContext, metrics...` | `Promise<boolean>` | — |
| `closePrompts` | `input: ClosePromptInput, output: ClosePromptOutput, context: PromptContext, metrics?: M...` | `Promise<boolean>` | — |
