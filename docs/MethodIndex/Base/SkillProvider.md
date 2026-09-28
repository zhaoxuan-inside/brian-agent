# Base / SkillProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## SkillAccess

源码：`brian-backend/Base/SkillProvider/access/SkillAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `addSkill` | `input: AddSkillInput, output: AddSkillOutput, context: SkillContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `seedSystemSkills` | `input: SeedSystemSkillsInput, output: SeedSystemSkillsOutput, context: SkillContext, me...` | `Promise<boolean>` | — |
| `soSkillById` | `input: GetSkillInput, output: GetSkillOutput, context: SkillContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `updateSkill` | `input: UpdateSkillInput, output: UpdateSkillOutput, context: SkillContext, metrics?: Me...` | `Promise<boolean>` | — |
| `delSkill` | `input: DelSkillInput, output: DelSkillOutput, context: SkillContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `soSkill` | `input: SoSkillInput, output: SoSkillOutput, context: SkillContext, metrics?: Metrics, r...` | `Promise<boolean>` | — |
| `execSkill` | `input: ExecSkillInput, output: ExecSkillOutput, context: SkillContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `enableSkill` | `input: EnableSkillInput, output: EnableSkillOutput, context: SkillContext, metrics?: Me...` | `Promise<boolean>` | — |
