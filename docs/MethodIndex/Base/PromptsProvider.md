# Base / PromptsProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## PromptsAccess

源码：`brian-backend/Base/PromptsProvider/access/PromptsAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件：写入默认配置并恢复 enabled 状态。 |
| `addPrompt` | `input: AddPromptInput, output: AddPromptOutput, context: PromptContext, metrics?: Metri...` | `Promise<boolean>` | 新增 Prompt |
| `delPrompt` | `input: DelPromptInput, output: DelPromptOutput, context: PromptContext, metrics?: Metri...` | `Promise<boolean>` | 删除 Prompt |
| `updatePrompt` | `input: UpdatePromptInput, output: UpdatePromptOutput, context: PromptContext, metrics?:...` | `Promise<boolean>` | 更新 Prompt |
| `soPromptById` | `input: GetPromptInput, output: GetPromptOutput, context: PromptContext, metrics?: Metri...` | `Promise<boolean>` | 获取 Prompt |
| `soPrompt` | `input: SoPromptInput, output: SoPromptOutput, context: PromptContext, metrics?: Metrics...` | `Promise<boolean>` | 搜索 Prompt |
| `execPrompt` | `input: ExecPromptInput, output: ExecPromptOutput, context: PromptContext, metrics?: Met...` | `Promise<boolean>` | 执行/渲染 Prompt |
| `enablePrompts` | `input: EnablePromptsInput, output: EnablePromptsOutput, context: PromptContext, metrics...` | `Promise<boolean>` | 启用/禁用 Prompts 组件 |
| `closePrompts` | `input: ClosePromptInput, output: ClosePromptOutput, context: PromptContext, metrics?: M...` | `Promise<boolean>` | 关闭 Prompts 组件（终态操作） |
