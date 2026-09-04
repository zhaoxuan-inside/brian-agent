# Runtime / Tools 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## ToolAccess

源码：`brian-backend/Runtime/Tools/access/ToolAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件 |
| `registerTool` | `input: RegisterToolInput, output: RegisterToolOutput, context: ToolContext, metrics?: M...` | `Promise<boolean>` | 注册工具 |
| `registerBuiltinTools` | `input: RegisterBuiltinToolsInput, output: RegisterBuiltinToolsOutput, context: ToolCont...` | `Promise<boolean>` | 注册内置工具（幂等） |
| `execTool` | `input: ExecToolInput, output: ExecToolOutput, context: ToolContext, metrics?: Metrics, ...` | `Promise<boolean>` | 执行单工具调用（配对结果语义） |
| `soTools` | `input: SoToolsInput, output: SoToolsOutput, context: ToolContext, metrics?: Metrics, re...` | `Promise<boolean>` | 查询工具规格（zod → JSON Schema） |
| `configTool` | `input: ConfigToolInput, output: ConfigToolOutput, context: ToolContext, metrics?: Metri...` | `Promise<boolean>` | 模块配置 |
