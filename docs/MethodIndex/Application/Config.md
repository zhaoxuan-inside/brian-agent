# Application / Config 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## ConfigAccess

源码：`brian-backend/Application/Config/access/ConfigAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `updateLayerPrivilege` | `input: UpdateLayerPrivilegeInput, output: UpdateLayerPrivilegeOutput, context: ConfigCo...` | `Promise<boolean>` | — |
| `updateModulePrivilege` | `input: UpdateModulePrivilegeInput, output: UpdateModulePrivilegeOutput, context: Config...` | `Promise<boolean>` | — |
| `soConfigDetail` | `input: GetConfigDetailInput, output: GetConfigDetailOutput, context: ConfigContext, met...` | `Promise<boolean>` | — |
| `soConfigItem` | `input: GetConfigItemInput, output: GetConfigItemOutput, context: ConfigContext, metrics...` | `Promise<boolean>` | — |
| `updateConfig` | `input: UpdateConfigInput, output: UpdateConfigOutput, context: ConfigContext, metrics?:...` | `Promise<boolean>` | — |
| `soConfigHistory` | `input: GetConfigHistoryInput, output: GetConfigHistoryOutput, context: ConfigContext, m...` | `Promise<boolean>` | 查询配置变更历史（config_key 缺省查全局；change_time 降序） |
| `configConfig` | `input: ConfigConfigInput, output: ConfigConfigOutput, context: ConfigContext, metrics?:...` | `Promise<boolean>` | — |
| `addLLMProvider` | `input: AddLLMProviderInput, output: AddLLMProviderOutput, context: LLMContext, metrics?...` | `Promise<boolean>` | — |
| `updateLLMProvider` | `input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, context: LLMContext, me...` | `Promise<boolean>` | — |
| `delLLMProvider` | `input: DelLLMProviderInput, output: DelLLMProviderOutput, context: LLMContext, metrics?...` | `Promise<boolean>` | — |
| `soLLMProvider` | `input: SoLLMProviderInput, output: SoLLMProviderOutput, context: LLMContext, metrics?: ...` | `Promise<boolean>` | — |
| `testLLMProvider` | `input: TestLLMProviderInput, output: TestLLMProviderOutput, context: LLMContext, metric...` | `Promise<boolean>` | — |
| `listLLM` | `input: ListLLMInput, output: ListLLMOutput, context: LLMContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `addLLM` | `input: AddLLMInput, output: AddLLMOutput, context: LLMContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `updateLLM` | `input: UpdateLLMInput, output: UpdateLLMOutput, context: LLMContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `delLLM` | `input: DelLLMInput, output: DelLLMOutput, context: LLMContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `soLLM` | `input: SoLLMInput, output: SoLLMOutput, context: LLMContext, metrics?: Metrics, report?...` | `Promise<boolean>` | — |
| `soLLMById` | `input: GetLLMInput, output: GetLLMOutput, context: LLMContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `addSoul` | `input: AddSoulInput, output: AddSoulOutput, context: SoulContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `updateSoul` | `input: UpdateSoulInput, output: UpdateSoulOutput, context: SoulContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `delSoul` | `input: DelSoulInput, output: DelSoulOutput, context: SoulContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `soSoul` | `input: SoSoulInput, output: SoSoulOutput, context: SoulContext, metrics?: Metrics, repo...` | `Promise<boolean>` | — |
| `soSoulById` | `input: GetSoulInput, output: GetSoulOutput, context: SoulContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `getSoulRule` | `input: SoSoulRuleInput, output: SoSoulRuleOutput, context: SoulCoreContext, metrics?: M...` | `Promise<boolean>` | — |
| `updateSoulRule` | `input: UpdateSoulRuleInput, output: UpdateSoulRuleOutput, context: SoulCoreContext, met...` | `Promise<boolean>` | — |
| `addSkill` | `input: AddSkillInput, output: AddSkillOutput, context: SkillContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `updateSkill` | `input: UpdateSkillInput, output: UpdateSkillOutput, context: SkillContext, metrics?: Me...` | `Promise<boolean>` | — |
| `delSkill` | `input: DelSkillInput, output: DelSkillOutput, context: SkillContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `soSkill` | `input: SoSkillInput, output: SoSkillOutput, context: SkillContext, metrics?: Metrics, r...` | `Promise<boolean>` | — |
| `execSkill` | `input: ExecSkillInput, output: ExecSkillOutput, context: SkillContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `soSkillById` | `input: GetSkillInput, output: GetSkillOutput, context: SkillContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `getSkillRule` | `input: SoSkillRuleInput, output: SoSkillRuleOutput, context: SkillCoreContext, metrics?...` | `Promise<boolean>` | — |
| `updateSkillRule` | `input: UpdateSkillRuleInput, output: UpdateSkillRuleOutput, context: SkillCoreContext, ...` | `Promise<boolean>` | — |
| `addMcpProvider` | `input: AddMcpProviderInput, output: AddMcpProviderOutput, context: McpContext, metrics?...` | `Promise<boolean>` | — |
| `updateMcpProvider` | `input: UpdateMcpProviderInput, output: UpdateMcpProviderOutput, context: McpContext, me...` | `Promise<boolean>` | — |
| `delMcpProvider` | `input: DelMcpProviderInput, output: DelMcpProviderOutput, context: McpContext, metrics?...` | `Promise<boolean>` | — |
| `soMcpProvider` | `input: SoMcpProviderInput, output: SoMcpProviderOutput, context: McpContext, metrics?: ...` | `Promise<boolean>` | — |
| `testMcpProvider` | `input: TestMcpProviderInput, output: TestMcpProviderOutput, context: McpContext, metric...` | `Promise<boolean>` | — |
| `listMcp` | `input: ListMcpInput, output: ListMcpOutput, context: McpContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `installMcp` | `input: InstallMcpInput, output: InstallMcpOutput, context: McpContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `startMcp` | `input: StartMcpInput, output: StartMcpOutput, context: McpContext, metrics?: Metrics, r...` | `Promise<boolean>` | — |
| `stopMcp` | `input: StopMcpInput, output: StopMcpOutput, context: McpContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `uninstallMcp` | `input: UninstallMcpInput, output: UninstallMcpOutput, context: McpContext, metrics?: Me...` | `Promise<boolean>` | — |
| `updateMcp` | `input: UpdateMcpInput, output: UpdateMcpOutput, context: McpContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `soMcpById` | `input: GetMcpInput, output: GetMcpOutput, context: McpContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `soMcp` | `input: SoMcpInput, output: SoMcpOutput, context: McpContext, metrics?: Metrics, report?...` | `Promise<boolean>` | — |
| `addPrompt` | `input: AddPromptInput, output: AddPromptOutput, context: PromptContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `updatePrompt` | `input: UpdatePromptInput, output: UpdatePromptOutput, context: PromptContext, metrics?:...` | `Promise<boolean>` | — |
| `delPrompt` | `input: DelPromptInput, output: DelPromptOutput, context: PromptContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `soPrompt` | `input: SoPromptInput, output: SoPromptOutput, context: PromptContext, metrics?: Metrics...` | `Promise<boolean>` | — |
| `soPromptById` | `input: GetPromptInput, output: GetPromptOutput, context: PromptContext, metrics?: Metri...` | `Promise<boolean>` | — |
