# Runtime / SkillRuntime 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## SkillRuntimeAccess

源码：`brian-backend/Runtime/SkillRuntime/access/SkillRuntimeAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `registerSkill` | `input: RegisterSkillInput, output: RegisterSkillOutput, context: SkillRuntimeContext, m...` | `Promise<boolean>` | — |
| `registerBuiltinSkills` | `input: RegisterBuiltinSkillsInput, output: RegisterBuiltinSkillsOutput, context: SkillR...` | `Promise<boolean>` | — |
| `execSkill` | `input: ExecSkillInput, output: ExecSkillOutput, context: SkillRuntimeContext, metrics?:...` | `Promise<boolean>` | — |
| `soSkills` | `input: SoSkillsInput, output: SoSkillsOutput, context: SkillRuntimeContext, metrics?: M...` | `Promise<boolean>` | — |
| `registerRunSkills` | `input: RegisterRunSkillsInput, output: RegisterSkillsOutput, context: SkillRuntimeConte...` | `Promise<boolean>` | — |
| `clearRunSkills` | `input: ClearRunSkillsInput, context: SkillRuntimeContext, metrics?: Metrics, report?: R...` | `Promise<boolean>` | — |
| `configTool` | `input: ConfigToolInput, output: ConfigToolOutput, context: SkillRuntimeContext, metrics...` | `Promise<boolean>` | — |
