# Runtime / SkillRuntime 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## SkillRuntimeAccess

源码：`brian-backend/Runtime/SkillRuntime/access/SkillRuntimeAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件 |
| `registerSkill` | `input: RegisterSkillInput, output: RegisterSkillOutput, context: SkillRuntimeContext, m...` | `Promise<boolean>` | 注册工具 |
| `registerBuiltinSkills` | `input: RegisterBuiltinSkillsInput, output: RegisterBuiltinSkillsOutput, context: SkillR...` | `Promise<boolean>` | 注册内置工具（幂等） |
| `execSkill` | `input: ExecSkillInput, output: ExecSkillOutput, context: SkillRuntimeContext, metrics?:...` | `Promise<boolean>` | 执行单工具调用（配对结果语义） |
| `soSkills` | `input: SoSkillsInput, output: SoSkillsOutput, context: SkillRuntimeContext, metrics?: M...` | `Promise<boolean>` | 查询工具规格（zod → JSON Schema） |
| `registerRunSkills` | `input: RegisterRunSkillsInput, output: RegisterSkillsOutput, context: SkillRuntimeConte...` | `Promise<boolean>` | 注册 run 级 Skill 一等工具（2026-09-24 Tool ⊕ Skill 合并；透传） |
| `clearRunSkills` | `input: ClearRunSkillsInput, context: SkillRuntimeContext, metrics?: Metrics, report?: R...` | `Promise<boolean>` | 清理 run 级工具（透传；Loop settle 调用） |
| `configTool` | `input: ConfigToolInput, output: ConfigToolOutput, context: SkillRuntimeContext, metrics...` | `Promise<boolean>` | 模块配置 |
