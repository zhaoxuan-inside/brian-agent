# Application / Config

- 层：**Application**　模块：**Config**
- 方法数：**171**（逻辑控制 124 · 数据处理 39 · 通用算法 8）

## 文件 `brian-backend/Application/Config/access/ConfigAccess.ts`

### ConfigAccess

#### `updateLayerPrivilege`

- **类型**：逻辑控制
- **说明**：更新：layer / privilege（返回成功与否，接入层转发至 Service）
- **签名**：`updateLayerPrivilege(input: UpdateLayerPrivilegeInput, output: UpdateLayerPrivilegeOutput, context: ConfigContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:132
- **引用次数**：17

#### `updateModulePrivilege`

- **类型**：逻辑控制
- **说明**：更新：module / privilege（返回成功与否，接入层转发至 Service）
- **签名**：`updateModulePrivilege(input: UpdateModulePrivilegeInput, output: UpdateModulePrivilegeOutput, context: ConfigContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:137
- **引用次数**：12

#### `soConfigDetail`

- **类型**：逻辑控制
- **说明**：查询：配置 / detail（返回成功与否，接入层转发至 Service）
- **签名**：`soConfigDetail(input: GetConfigDetailInput, output: GetConfigDetailOutput, context: ConfigContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:142
- **引用次数**：16

#### `soConfigItem`

- **类型**：逻辑控制
- **说明**：查询：配置 / 条目（返回成功与否，接入层转发至 Service）
- **签名**：`soConfigItem(input: GetConfigItemInput, output: GetConfigItemOutput, context: ConfigContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:147
- **引用次数**：11

#### `updateConfig`

- **类型**：逻辑控制
- **说明**：更新：配置（返回成功与否，接入层转发至 Service）
- **签名**：`updateConfig(input: UpdateConfigInput, output: UpdateConfigOutput, context: ConfigContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:152
- **引用次数**：33

#### `soConfigHistory`

- **类型**：逻辑控制
- **说明**：查询：配置 / 历史（返回成功与否，接入层转发至 Service）
- **签名**：`soConfigHistory(input: GetConfigHistoryInput, output: GetConfigHistoryOutput, context: ConfigContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:158
- **引用次数**：10

#### `configConfig`

- **类型**：逻辑控制
- **说明**：处理 配置 / 配置（返回成功与否，接入层转发至 Service）
- **签名**：`configConfig(input: ConfigConfigInput, output: ConfigConfigOutput, context: ConfigContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:163
- **引用次数**：10

#### `addLLMProvider`

- **类型**：逻辑控制
- **说明**：写入/新增：大模型 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`addLLMProvider(input: AddLLMProviderInput, output: AddLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:172
- **引用次数**：46

#### `updateLLMProvider`

- **类型**：逻辑控制
- **说明**：更新：大模型 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`updateLLMProvider(input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:176
- **引用次数**：18

#### `delLLMProvider`

- **类型**：逻辑控制
- **说明**：删除/清理：大模型 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`delLLMProvider(input: DelLLMProviderInput, output: DelLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:180
- **引用次数**：17

#### `soLLMProvider`

- **类型**：逻辑控制
- **说明**：查询：大模型 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`soLLMProvider(input: SoLLMProviderInput, output: SoLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:184
- **引用次数**：35

#### `testLLMProvider`

- **类型**：逻辑控制
- **说明**：判断校验：大模型 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`testLLMProvider(input: TestLLMProviderInput, output: TestLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:188
- **引用次数**：16

#### `listLLM`

- **类型**：逻辑控制
- **说明**：查询：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`listLLM(input: ListLLMInput, output: ListLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:192
- **引用次数**：21

#### `addLLM`

- **类型**：逻辑控制
- **说明**：写入/新增：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`addLLM(input: AddLLMInput, output: AddLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:196
- **引用次数**：25

#### `updateLLM`

- **类型**：逻辑控制
- **说明**：更新：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`updateLLM(input: UpdateLLMInput, output: UpdateLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:200
- **引用次数**：20

#### `delLLM`

- **类型**：逻辑控制
- **说明**：删除/清理：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`delLLM(input: DelLLMInput, output: DelLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:204
- **引用次数**：14

#### `soLLM`

- **类型**：逻辑控制
- **说明**：查询：大模型（返回成功与否，接入层转发至 Service）
- **签名**：`soLLM(input: SoLLMInput, output: SoLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:208
- **引用次数**：28

#### `soLLMById`

- **类型**：逻辑控制
- **说明**：查询：大模型 / 标识（返回成功与否，接入层转发至 Service）
- **签名**：`soLLMById(input: GetLLMInput, output: GetLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:212
- **引用次数**：15

#### `addSoul`

- **类型**：逻辑控制
- **说明**：写入/新增：人设（返回成功与否，接入层转发至 Service）
- **签名**：`addSoul(input: AddSoulInput, output: AddSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:220
- **引用次数**：81

#### `updateSoul`

- **类型**：逻辑控制
- **说明**：更新：人设（返回成功与否，接入层转发至 Service）
- **签名**：`updateSoul(input: UpdateSoulInput, output: UpdateSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:224
- **引用次数**：24

#### `delSoul`

- **类型**：逻辑控制
- **说明**：删除/清理：人设（返回成功与否，接入层转发至 Service）
- **签名**：`delSoul(input: DelSoulInput, output: DelSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:228
- **引用次数**：20

#### `soSoul`

- **类型**：逻辑控制
- **说明**：查询：人设（返回成功与否，接入层转发至 Service）
- **签名**：`soSoul(input: SoSoulInput, output: SoSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:232
- **引用次数**：42

#### `soSoulById`

- **类型**：逻辑控制
- **说明**：查询：人设 / 标识（返回成功与否，接入层转发至 Service）
- **签名**：`soSoulById(input: GetSoulInput, output: GetSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:236
- **引用次数**：48

#### `updateSoulRule`

- **类型**：逻辑控制
- **说明**：更新：人设 / rule（返回成功与否，接入层转发至 Service）
- **签名**：`updateSoulRule(input: UpdateSoulRuleInput, output: UpdateSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:240
- **引用次数**：15

#### `addSkill`

- **类型**：逻辑控制
- **说明**：写入/新增：技能（返回成功与否，接入层转发至 Service）
- **签名**：`addSkill(input: AddSkillInput, output: AddSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:248
- **引用次数**：51

#### `updateSkill`

- **类型**：逻辑控制
- **说明**：更新：技能（返回成功与否，接入层转发至 Service）
- **签名**：`updateSkill(input: UpdateSkillInput, output: UpdateSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:252
- **引用次数**：27

#### `delSkill`

- **类型**：逻辑控制
- **说明**：删除/清理：技能（返回成功与否，接入层转发至 Service）
- **签名**：`delSkill(input: DelSkillInput, output: DelSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:256
- **引用次数**：22

#### `soSkill`

- **类型**：逻辑控制
- **说明**：查询：技能（返回成功与否，接入层转发至 Service）
- **签名**：`soSkill(input: SoSkillInput, output: SoSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:260
- **引用次数**：39

#### `execSkill`

- **类型**：逻辑控制
- **说明**：处理执行：技能（返回成功与否，接入层转发至 Service）
- **签名**：`execSkill(input: ExecSkillInput, output: ExecSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:264
- **引用次数**：69

#### `soSkillById`

- **类型**：逻辑控制
- **说明**：查询：技能 / 标识（返回成功与否，接入层转发至 Service）
- **签名**：`soSkillById(input: GetSkillInput, output: GetSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:268
- **引用次数**：42

#### `updateSkillRule`

- **类型**：逻辑控制
- **说明**：更新：技能 / rule（返回成功与否，接入层转发至 Service）
- **签名**：`updateSkillRule(input: UpdateSkillRuleInput, output: UpdateSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:272
- **引用次数**：16

#### `addMcpProvider`

- **类型**：逻辑控制
- **说明**：写入/新增：MCP 通道 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`addMcpProvider(input: AddMcpProviderInput, output: AddMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:280
- **引用次数**：27

#### `updateMcpProvider`

- **类型**：逻辑控制
- **说明**：更新：MCP 通道 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`updateMcpProvider(input: UpdateMcpProviderInput, output: UpdateMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:284
- **引用次数**：14

#### `delMcpProvider`

- **类型**：逻辑控制
- **说明**：删除/清理：MCP 通道 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`delMcpProvider(input: DelMcpProviderInput, output: DelMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:288
- **引用次数**：15

#### `soMcpProvider`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`soMcpProvider(input: SoMcpProviderInput, output: SoMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:292
- **引用次数**：19

#### `testMcpProvider`

- **类型**：逻辑控制
- **说明**：判断校验：MCP 通道 / Provider（返回成功与否，接入层转发至 Service）
- **签名**：`testMcpProvider(input: TestMcpProviderInput, output: TestMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:296
- **引用次数**：12

#### `listMcp`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道（返回成功与否，接入层转发至 Service）
- **签名**：`listMcp(input: ListMcpInput, output: ListMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:300
- **引用次数**：22

#### `installMcp`

- **类型**：逻辑控制
- **说明**：构建/初始化：MCP 通道（返回成功与否，接入层转发至 Service）
- **签名**：`installMcp(input: InstallMcpInput, output: InstallMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:304
- **引用次数**：22

#### `startMcp`

- **类型**：逻辑控制
- **说明**：启动：MCP 通道（返回成功与否，接入层转发至 Service）
- **签名**：`startMcp(input: StartMcpInput, output: StartMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:308
- **引用次数**：23

#### `stopMcp`

- **类型**：逻辑控制
- **说明**：删除/清理：MCP 通道（返回成功与否，接入层转发至 Service）
- **签名**：`stopMcp(input: StopMcpInput, output: StopMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:312
- **引用次数**：16

#### `uninstallMcp`

- **类型**：逻辑控制
- **说明**：处理 uninstall / MCP 通道（返回成功与否，接入层转发至 Service）
- **签名**：`uninstallMcp(input: UninstallMcpInput, output: UninstallMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:316
- **引用次数**：15

#### `updateMcp`

- **类型**：逻辑控制
- **说明**：更新：MCP 通道（返回成功与否，接入层转发至 Service）
- **签名**：`updateMcp(input: UpdateMcpInput, output: UpdateMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:320
- **引用次数**：15

#### `soMcpById`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道 / 标识（返回成功与否，接入层转发至 Service）
- **签名**：`soMcpById(input: GetMcpInput, output: GetMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:324
- **引用次数**：17

#### `soMcp`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道（返回成功与否，接入层转发至 Service）
- **签名**：`soMcp(input: SoMcpInput, output: SoMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:328
- **引用次数**：20

#### `addPrompt`

- **类型**：逻辑控制
- **说明**：写入/新增：提示词（返回成功与否，接入层转发至 Service）
- **签名**：`addPrompt(input: AddPromptInput, output: AddPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:336
- **引用次数**：43

#### `updatePrompt`

- **类型**：逻辑控制
- **说明**：更新：提示词（返回成功与否，接入层转发至 Service）
- **签名**：`updatePrompt(input: UpdatePromptInput, output: UpdatePromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:340
- **引用次数**：21

#### `delPrompt`

- **类型**：逻辑控制
- **说明**：删除/清理：提示词（返回成功与否，接入层转发至 Service）
- **签名**：`delPrompt(input: DelPromptInput, output: DelPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:344
- **引用次数**：16

#### `soPrompt`

- **类型**：逻辑控制
- **说明**：查询：提示词（返回成功与否，接入层转发至 Service）
- **签名**：`soPrompt(input: SoPromptInput, output: SoPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:348
- **引用次数**：44

#### `soPromptById`

- **类型**：逻辑控制
- **说明**：查询：提示词 / 标识（返回成功与否，接入层转发至 Service）
- **签名**：`soPromptById(input: GetPromptInput, output: GetPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/access/ConfigAccess.ts:352
- **引用次数**：33

## 文件 `brian-backend/Application/Config/application/ConfigService.ts`

### ConfigService

#### `updateLayerPrivilege`

- **类型**：数据处理
- **说明**：更新：layer / privilege（操作关系数据库）
- **签名**：`updateLayerPrivilege(input: UpdateLayerPrivilegeInput, output: UpdateLayerPrivilegeOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:275
- **引用次数**：17

#### `updateModulePrivilege`

- **类型**：数据处理
- **说明**：更新：module / privilege（操作关系数据库）
- **签名**：`updateModulePrivilege(input: UpdateModulePrivilegeInput, output: UpdateModulePrivilegeOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:317
- **引用次数**：12

#### `soConfigDetail`

- **类型**：通用算法
- **说明**：查询：配置 / detail（纯计算，无外部 IO）
- **签名**：`soConfigDetail(input: GetConfigDetailInput, output: GetConfigDetailOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:388
- **引用次数**：16

### ConfigService（私有）

#### `prepareTreeContext`

- **类型**：数据处理
- **说明**：构建/初始化：树形结构 / 上下文（操作关系数据库）
- **签名**：`prepareTreeContext(): Promise<ConfigTreeContext>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:398
- **引用次数**：2

#### `buildTreeStructure`

- **类型**：通用算法
- **说明**：构建/初始化：树形结构 / structure（纯计算，无外部 IO）
- **签名**：`buildTreeStructure(input: GetConfigDetailInput, treeCtx: ConfigTreeContext): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:410
- **引用次数**：2

#### `ensureLayerNode`

- **类型**：数据处理
- **说明**：确保就绪：layer / 节点
- **签名**：`ensureLayerNode(layerName: string, treeCtx: ConfigTreeContext): void`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:421
- **引用次数**：2

#### `ensureModuleNode`

- **类型**：数据处理
- **说明**：确保就绪：module / 节点
- **签名**：`ensureModuleNode(reg: ConfigRegistration, treeCtx: ConfigTreeContext): void`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:438
- **引用次数**：2

#### `fillTreeItems`

- **类型**：逻辑控制
- **说明**：处理 fill / 树形结构 / items（遍历调度，异步编排）
- **签名**：`fillTreeItems(input: GetConfigDetailInput, treeCtx: ConfigTreeContext): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:467
- **引用次数**：2

#### `appendConfigItem`

- **类型**：数据处理
- **说明**：写入/新增：配置 / 条目
- **签名**：`appendConfigItem(reg: ConfigRegistration, input: GetConfigDetailInput, treeCtx: ConfigTreeContext, modNode: Record<string, unknown>): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:479
- **引用次数**：2

#### `ensureCategoryNode`

- **类型**：逻辑控制
- **说明**：确保就绪：category / 节点
- **签名**：`ensureCategoryNode(modNode: Record<string, unknown>, category: string): Record<string, unknown>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:500
- **引用次数**：2

#### `soCurrentConfigValue`

- **类型**：逻辑控制
- **说明**：查询：current / 配置 / 值（含异常兜底，异步编排）
- **签名**：`soCurrentConfigValue(configKey: string): Promise<unknown>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:517
- **引用次数**：2

#### `toConfigItemRecord`

- **类型**：逻辑控制
- **说明**：格式化/序列化：配置 / 条目 / record
- **签名**：`toConfigItemRecord(reg: ConfigRegistration, currentValue: unknown, effectiveReadable: boolean, effectiveWritable: boolean): Record<string, unknown>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:526
- **引用次数**：2

### ConfigService

#### `soConfigItem`

- **类型**：数据处理
- **说明**：查询：配置 / 条目（操作关系数据库）
- **签名**：`soConfigItem(input: GetConfigItemInput, output: GetConfigItemOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:551
- **引用次数**：11

#### `updateConfig`

- **类型**：数据处理
- **说明**：更新：配置（操作关系数据库）
- **签名**：`updateConfig(input: UpdateConfigInput, _output: UpdateConfigOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:617
- **引用次数**：33

#### `soConfigHistory`

- **类型**：数据处理
- **说明**：查询：配置 / 历史（操作关系数据库）
- **签名**：`soConfigHistory(input: GetConfigHistoryInput, output: GetConfigHistoryOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:664
- **引用次数**：10

### ConfigService（私有）

#### `toHistoryRecord`

- **类型**：逻辑控制
- **说明**：格式化/序列化：历史 / record
- **签名**：`toHistoryRecord(row: Record<string, unknown>): ConfigHistoryRecord`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:686
- **引用次数**：2

#### `parseHistoryValue`

- **类型**：数据处理
- **说明**：解析：历史 / 值（反序列化）
- **签名**：`parseHistoryValue(raw: unknown): unknown`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:698
- **引用次数**：3

#### `recordConfigHistory`

- **类型**：数据处理
- **说明**：写入/新增：配置 / 历史（操作关系数据库，序列化输出）
- **签名**：`recordConfigHistory(configKey: string, oldValue: unknown, newValue: unknown, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:710
- **引用次数**：2

### ConfigService

#### `configConfig`

- **类型**：数据处理
- **说明**：处理 配置 / 配置（操作关系数据库）
- **签名**：`configConfig(input: ConfigConfigInput, output: ConfigConfigOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:735
- **引用次数**：10

### ConfigService（私有）

#### `generateId`

- **类型**：逻辑控制
- **说明**：构建/初始化：标识
- **签名**：`generateId(): string`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:772
- **引用次数**：11

#### `rowToRecord`

- **类型**：逻辑控制
- **说明**：处理 row / record（遍历调度）
- **签名**：`rowToRecord(row: Record<string, unknown>): Record<string, unknown>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:776
- **引用次数**：8

#### `computeEffectiveReadable`

- **类型**：逻辑控制
- **说明**：计算统计：effective / readable
- **签名**：`computeEffectiveReadable(registry: Record<string, unknown> \| null, layerPriv: Record<string, unknown> \| null, modulePriv: Record<string, unknown> \| null): boolean`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:788
- **引用次数**：2

#### `computeEffectiveWritable`

- **类型**：逻辑控制
- **说明**：计算统计：effective / writable
- **签名**：`computeEffectiveWritable(registry: Record<string, unknown> \| null, layerPriv: Record<string, unknown> \| null, modulePriv: Record<string, unknown> \| null): boolean`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:799
- **引用次数**：3

#### `buildModulePrivilegeWithEffective`

- **类型**：逻辑控制
- **说明**：构建/初始化：module / privilege / effective
- **签名**：`buildModulePrivilegeWithEffective(modRecord: Record<string, unknown>, layerPriv: Record<string, unknown> \| null): Record<string, unknown>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:810
- **引用次数**：2

#### `validateValueType`

- **类型**：通用算法
- **说明**：判断校验：值 / type（纯计算，无外部 IO）
- **签名**：`validateValueType(value: unknown, configType: string): void`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:825
- **引用次数**：2

#### `matchBaseProviderModule`

- **类型**：通用算法
- **说明**：判断校验：base / Provider / module（纯计算，无外部 IO）
- **签名**：`matchBaseProviderModule(configKey: string): string \| null`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:861
- **引用次数**：3

#### `readBaseProviderConfig`

- **类型**：数据处理
- **说明**：获取：base / Provider / 配置（操作关系数据库）
- **签名**：`readBaseProviderConfig(configKey: string, module: string): Promise<unknown>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:870
- **引用次数**：2

### ConfigService（静态）（私有）

#### `matched`

- **类型**：逻辑控制
- **说明**：判断校验相关数据
- **签名**：`matched(value: unknown): ConfigValueMatch`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:904
- **引用次数**：72

### ConfigService（私有）

#### `getCurrentValue`

- **类型**：数据处理
- **说明**：获取：current / 值
- **签名**：`getCurrentValue(configKey: string): Promise<unknown>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:909
- **引用次数**：4

#### `readLayeredConfigValue`

- **类型**：逻辑控制
- **说明**：获取：layered / 配置 / 值（异步编排）
- **签名**：`readLayeredConfigValue(configKey: string): Promise<ConfigValueMatch>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:926
- **引用次数**：2

#### `readLogProviderValue`

- **类型**：通用算法
- **说明**：获取：日志 / Provider / 值（纯计算，无外部 IO）
- **签名**：`readLogProviderValue(configKey: string): Promise<ConfigValueMatch>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:939
- **引用次数**：2

#### `readInfoCoreValue`

- **类型**：逻辑控制
- **说明**：获取：信息 / core / 值（异步编排）
- **签名**：`readInfoCoreValue(configKey: string): Promise<ConfigValueMatch>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:951
- **引用次数**：2

#### `readCoreProviderValue`

- **类型**：逻辑控制
- **说明**：获取：core / Provider / 值（异步编排）
- **签名**：`readCoreProviderValue(configKey: string): Promise<ConfigValueMatch>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:981
- **引用次数**：2

#### `readLlmMcpCoreValue`

- **类型**：逻辑控制
- **说明**：获取：大模型 / MCP 通道 / core / 值（异步编排）
- **签名**：`readLlmMcpCoreValue(configKey: string): Promise<ConfigValueMatch>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:990
- **引用次数**：2

#### `readSkillCoreValue`

- **类型**：数据处理
- **说明**：获取：技能 / core / 值
- **签名**：`readSkillCoreValue(configKey: string): Promise<ConfigValueMatch>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1005
- **引用次数**：2

#### `readSoulCoreValue`

- **类型**：逻辑控制
- **说明**：获取：人设 / core / 值（异步编排）
- **签名**：`readSoulCoreValue(configKey: string): Promise<ConfigValueMatch>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1025
- **引用次数**：2

#### `extractOptRuleField`

- **类型**：通用算法
- **说明**：解析：opt / rule / 字段（纯计算，无外部 IO）
- **签名**：`extractOptRuleField(configKey: string, prefix: string, out: { list?: unknown[] }): unknown`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1043
- **引用次数**：3

#### `readAgentLayerValue`

- **类型**：逻辑控制
- **说明**：获取：Agent / layer / 值（异步编排）
- **签名**：`readAgentLayerValue(configKey: string): Promise<ConfigValueMatch>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1051
- **引用次数**：2

#### `readWorkAgentValue`

- **类型**：逻辑控制
- **说明**：获取：work / Agent / 值（异步编排）
- **签名**：`readWorkAgentValue(configKey: string): Promise<ConfigValueMatch>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1058
- **引用次数**：2

#### `readAgentFrameworkValue`

- **类型**：通用算法
- **说明**：获取：Agent / framework / 值（纯计算，无外部 IO）
- **签名**：`readAgentFrameworkValue(configKey: string): Promise<ConfigValueMatch>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1075
- **引用次数**：2

#### `readApplicationLayerValue`

- **类型**：逻辑控制
- **说明**：获取：application / layer / 值（异步编排）
- **签名**：`readApplicationLayerValue(configKey: string): Promise<ConfigValueMatch>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1110
- **引用次数**：2

#### `readSelfLearningValue`

- **类型**：逻辑控制
- **说明**：获取：learning / 值（异步编排）
- **签名**：`readSelfLearningValue(configKey: string): Promise<unknown>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1133
- **引用次数**：2

#### `readVisualizationValue`

- **类型**：逻辑控制
- **说明**：获取：visualization / 值（异步编排）
- **签名**：`readVisualizationValue(configKey: string): Promise<unknown>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1147
- **引用次数**：2

#### `extractConfigValue`

- **类型**：逻辑控制
- **说明**：解析：配置 / 值
- **签名**：`extractConfigValue(out: unknown, _prefix: string, _configKey: string): unknown`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1157
- **引用次数**：11

#### `getConfigFromAccess`

- **类型**：通用算法
- **说明**：获取：配置 / access（纯计算，无外部 IO）
- **签名**：`getConfigFromAccess(_configKey: string, _prefix: string, fn: (input: I, context: C, output: O) => Promise<boolean>): Promise<unknown>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1166
- **引用次数**：10

#### `writeBaseProviderConfig`

- **类型**：数据处理
- **说明**：写入/新增：base / Provider / 配置（操作关系数据库，向量库）
- **签名**：`writeBaseProviderConfig(configKey: string, module: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1182
- **引用次数**：2

#### `setProviderEnabled`

- **类型**：数据处理
- **说明**：更新：Provider / enabled（操作关系数据库，向量库，图数据库）
- **签名**：`setProviderEnabled(module: string, enable: boolean): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1208
- **引用次数**：2

#### `routeUpdateConfig`

- **类型**：数据处理
- **说明**：处理执行：配置
- **签名**：`routeUpdateConfig(configKey: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1275
- **引用次数**：2

#### `writeLogProviderConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：日志 / Provider / 配置（异步编排）
- **签名**：`writeLogProviderConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1292
- **引用次数**：2

#### `writeLLMCoreConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：大模型 / core / 配置（异步编排）
- **签名**：`writeLLMCoreConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1306
- **引用次数**：2

#### `writeLLMCoreQuotaConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：大模型 / core / quota / 配置（异步编排）
- **签名**：`writeLLMCoreQuotaConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1318
- **引用次数**：2

#### `writeMCPCoreConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：MCP 通道 / core / 配置（异步编排）
- **签名**：`writeMCPCoreConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1328
- **引用次数**：2

#### `writeSkillCoreConfig`

- **类型**：数据处理
- **说明**：写入/新增：技能 / core / 配置
- **签名**：`writeSkillCoreConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1340
- **引用次数**：2

#### `writeSkillOptRuleConfig`

- **类型**：数据处理
- **说明**：写入/新增：技能 / opt / rule / 配置（操作关系数据库）
- **签名**：`writeSkillOptRuleConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1354
- **引用次数**：2

#### `writeSoulCoreConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：人设 / core / 配置（异步编排）
- **签名**：`writeSoulCoreConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1380
- **引用次数**：2

#### `writeSoulOptRuleConfig`

- **类型**：数据处理
- **说明**：写入/新增：人设 / opt / rule / 配置（操作关系数据库）
- **签名**：`writeSoulOptRuleConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1392
- **引用次数**：2

#### `writeInfoTagConfigConfig`

- **类型**：数据处理
- **说明**：写入/新增：信息 / 标签 / 配置 / 配置
- **签名**：`writeInfoTagConfigConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1418
- **引用次数**：2

#### `writeInfoSummaryConfigConfig`

- **类型**：数据处理
- **说明**：写入/新增：信息 / 摘要 / 配置 / 配置
- **签名**：`writeInfoSummaryConfigConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1431
- **引用次数**：2

#### `writeInfoVectorConfigConfig`

- **类型**：数据处理
- **说明**：写入/新增：信息 / 向量 / 配置 / 配置
- **签名**：`writeInfoVectorConfigConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1445
- **引用次数**：2

#### `writeInfoContextConfigConfig`

- **类型**：数据处理
- **说明**：写入/新增：信息 / 上下文 / 配置 / 配置
- **签名**：`writeInfoContextConfigConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1457
- **引用次数**：2

#### `writeInfoCoreConfigConfig`

- **类型**：数据处理
- **说明**：写入/新增：信息 / core / 配置 / 配置
- **签名**：`writeInfoCoreConfigConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1475
- **引用次数**：2

#### `writeWriterAgentConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：写作 / Agent / 配置（异步编排）
- **签名**：`writeWriterAgentConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1485
- **引用次数**：2

#### `writeEvolutorAgentConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：evolutor / Agent / 配置（异步编排）
- **签名**：`writeEvolutorAgentConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1500
- **引用次数**：2

#### `writeAgentContextConfig`

- **类型**：数据处理
- **说明**：写入/新增：Agent / 上下文 / 配置
- **签名**：`writeAgentContextConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1516
- **引用次数**：2

#### `writeAgentLibraryConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：Agent / library / 配置（异步编排）
- **签名**：`writeAgentLibraryConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1527
- **引用次数**：2

#### `writeAgentBuilderConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：Agent / builder / 配置（异步编排）
- **签名**：`writeAgentBuilderConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1540
- **引用次数**：2

#### `writeAgentExecutionConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：Agent / execution / 配置（异步编排）
- **签名**：`writeAgentExecutionConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1551
- **引用次数**：2

#### `writeAgentStrategyConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：Agent / strategy / 配置（异步编排）
- **签名**：`writeAgentStrategyConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1565
- **引用次数**：2

#### `writeChatConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：chat / 配置（异步编排）
- **签名**：`writeChatConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1585
- **引用次数**：2

#### `writeSelfLearningConfig`

- **类型**：数据处理
- **说明**：写入/新增：learning / 配置
- **签名**：`writeSelfLearningConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1596
- **引用次数**：2

#### `writeUserProfileConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：用户 / 画像 / 配置（异步编排）
- **签名**：`writeUserProfileConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1624
- **引用次数**：2

#### `writeVisualizationConfig`

- **类型**：逻辑控制
- **说明**：写入/新增：visualization / 配置（异步编排）
- **签名**：`writeVisualizationConfig(prefix: string, value: unknown): Promise<void>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1638
- **引用次数**：2

### ConfigService

#### `addLLMProviderProxy`

- **类型**：逻辑控制
- **说明**：写入/新增：大模型 / Provider / 代理（返回成功与否）
- **签名**：`addLLMProviderProxy(input: AddLLMProviderInput, output: AddLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1652
- **引用次数**：6

#### `updateLLMProviderProxy`

- **类型**：数据处理
- **说明**：更新：大模型 / Provider / 代理
- **签名**：`updateLLMProviderProxy(input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1656
- **引用次数**：6

#### `delLLMProviderProxy`

- **类型**：逻辑控制
- **说明**：删除/清理：大模型 / Provider / 代理（返回成功与否）
- **签名**：`delLLMProviderProxy(input: DelLLMProviderInput, output: DelLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1660
- **引用次数**：6

#### `soLLMProviderProxy`

- **类型**：逻辑控制
- **说明**：查询：大模型 / Provider / 代理（返回成功与否）
- **签名**：`soLLMProviderProxy(input: SoLLMProviderInput, output: SoLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1664
- **引用次数**：6

#### `testLLMProviderProxy`

- **类型**：逻辑控制
- **说明**：判断校验：大模型 / Provider / 代理（返回成功与否）
- **签名**：`testLLMProviderProxy(input: TestLLMProviderInput, output: TestLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1668
- **引用次数**：6

#### `listLLMProxy`

- **类型**：逻辑控制
- **说明**：查询：大模型 / 代理（返回成功与否）
- **签名**：`listLLMProxy(input: ListLLMInput, output: ListLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1672
- **引用次数**：6

#### `addLLMProxy`

- **类型**：逻辑控制
- **说明**：写入/新增：大模型 / 代理（返回成功与否）
- **签名**：`addLLMProxy(input: AddLLMInput, output: AddLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1676
- **引用次数**：6

#### `updateLLMProxy`

- **类型**：数据处理
- **说明**：更新：大模型 / 代理
- **签名**：`updateLLMProxy(input: UpdateLLMInput, output: UpdateLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1680
- **引用次数**：6

#### `delLLMProxy`

- **类型**：逻辑控制
- **说明**：删除/清理：大模型 / 代理（返回成功与否）
- **签名**：`delLLMProxy(input: DelLLMInput, output: DelLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1684
- **引用次数**：6

#### `soLLMProxy`

- **类型**：逻辑控制
- **说明**：查询：大模型 / 代理（返回成功与否）
- **签名**：`soLLMProxy(input: SoLLMInput, output: SoLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1688
- **引用次数**：6

#### `getLLMProxy`

- **类型**：逻辑控制
- **说明**：获取：大模型 / 代理（返回成功与否）
- **签名**：`getLLMProxy(input: GetLLMInput, output: GetLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1692
- **引用次数**：6

#### `addSoulProxy`

- **类型**：逻辑控制
- **说明**：写入/新增：人设 / 代理（返回成功与否）
- **签名**：`addSoulProxy(input: AddSoulInput, output: AddSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1700
- **引用次数**：6

#### `updateSoulProxy`

- **类型**：数据处理
- **说明**：更新：人设 / 代理
- **签名**：`updateSoulProxy(input: UpdateSoulInput, output: UpdateSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1704
- **引用次数**：6

#### `delSoulProxy`

- **类型**：逻辑控制
- **说明**：删除/清理：人设 / 代理（返回成功与否）
- **签名**：`delSoulProxy(input: DelSoulInput, output: DelSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1708
- **引用次数**：6

#### `soSoulProxy`

- **类型**：逻辑控制
- **说明**：查询：人设 / 代理（返回成功与否）
- **签名**：`soSoulProxy(input: SoSoulInput, output: SoSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1712
- **引用次数**：6

#### `getSoulProxy`

- **类型**：逻辑控制
- **说明**：获取：人设 / 代理（返回成功与否）
- **签名**：`getSoulProxy(input: GetSoulInput, output: GetSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1716
- **引用次数**：6

#### `getSoulRuleProxy`

- **类型**：逻辑控制
- **说明**：获取：人设 / rule / 代理（返回成功与否）
- **签名**：`getSoulRuleProxy(input: SoSoulRuleInput, output: SoSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1720
- **引用次数**：5

#### `updateSoulRuleProxy`

- **类型**：数据处理
- **说明**：更新：人设 / rule / 代理
- **签名**：`updateSoulRuleProxy(input: UpdateSoulRuleInput, output: UpdateSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1724
- **引用次数**：6

#### `addSkillProxy`

- **类型**：逻辑控制
- **说明**：写入/新增：技能 / 代理（返回成功与否）
- **签名**：`addSkillProxy(input: AddSkillInput, output: AddSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1732
- **引用次数**：6

#### `updateSkillProxy`

- **类型**：数据处理
- **说明**：更新：技能 / 代理
- **签名**：`updateSkillProxy(input: UpdateSkillInput, output: UpdateSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1736
- **引用次数**：6

#### `delSkillProxy`

- **类型**：逻辑控制
- **说明**：删除/清理：技能 / 代理（返回成功与否）
- **签名**：`delSkillProxy(input: DelSkillInput, output: DelSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1740
- **引用次数**：6

#### `soSkillProxy`

- **类型**：逻辑控制
- **说明**：查询：技能 / 代理（返回成功与否）
- **签名**：`soSkillProxy(input: SoSkillInput, output: SoSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1744
- **引用次数**：6

#### `execSkillProxy`

- **类型**：逻辑控制
- **说明**：处理执行：技能 / 代理（返回成功与否）
- **签名**：`execSkillProxy(input: ExecSkillInput, output: ExecSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1748
- **引用次数**：2

#### `getSkillProxy`

- **类型**：逻辑控制
- **说明**：获取：技能 / 代理（返回成功与否）
- **签名**：`getSkillProxy(input: GetSkillInput, output: GetSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1752
- **引用次数**：6

#### `getSkillRuleProxy`

- **类型**：逻辑控制
- **说明**：获取：技能 / rule / 代理（返回成功与否）
- **签名**：`getSkillRuleProxy(input: SoSkillRuleInput, output: SoSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1756
- **引用次数**：5

#### `updateSkillRuleProxy`

- **类型**：数据处理
- **说明**：更新：技能 / rule / 代理
- **签名**：`updateSkillRuleProxy(input: UpdateSkillRuleInput, output: UpdateSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1760
- **引用次数**：6

#### `addMcpProviderProxy`

- **类型**：逻辑控制
- **说明**：写入/新增：MCP 通道 / Provider / 代理（返回成功与否）
- **签名**：`addMcpProviderProxy(input: AddMcpProviderInput, output: AddMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1768
- **引用次数**：6

#### `updateMcpProviderProxy`

- **类型**：数据处理
- **说明**：更新：MCP 通道 / Provider / 代理
- **签名**：`updateMcpProviderProxy(input: UpdateMcpProviderInput, output: UpdateMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1772
- **引用次数**：6

#### `delMcpProviderProxy`

- **类型**：逻辑控制
- **说明**：删除/清理：MCP 通道 / Provider / 代理（返回成功与否）
- **签名**：`delMcpProviderProxy(input: DelMcpProviderInput, output: DelMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1776
- **引用次数**：6

#### `soMcpProviderProxy`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道 / Provider / 代理（返回成功与否）
- **签名**：`soMcpProviderProxy(input: SoMcpProviderInput, output: SoMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1780
- **引用次数**：6

#### `testMcpProviderProxy`

- **类型**：逻辑控制
- **说明**：判断校验：MCP 通道 / Provider / 代理（返回成功与否）
- **签名**：`testMcpProviderProxy(input: TestMcpProviderInput, output: TestMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1784
- **引用次数**：6

#### `listMcpProxy`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道 / 代理（返回成功与否）
- **签名**：`listMcpProxy(input: ListMcpInput, output: ListMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1788
- **引用次数**：6

#### `installMcpProxy`

- **类型**：逻辑控制
- **说明**：构建/初始化：MCP 通道 / 代理（返回成功与否）
- **签名**：`installMcpProxy(input: InstallMcpInput, output: InstallMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1792
- **引用次数**：7

#### `startMcpProxy`

- **类型**：逻辑控制
- **说明**：启动：MCP 通道 / 代理（返回成功与否）
- **签名**：`startMcpProxy(input: StartMcpInput, output: StartMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1796
- **引用次数**：7

#### `stopMcpProxy`

- **类型**：逻辑控制
- **说明**：删除/清理：MCP 通道 / 代理（返回成功与否）
- **签名**：`stopMcpProxy(input: StopMcpInput, output: StopMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1800
- **引用次数**：6

#### `uninstallMcpProxy`

- **类型**：逻辑控制
- **说明**：处理 uninstall / MCP 通道 / 代理（返回成功与否）
- **签名**：`uninstallMcpProxy(input: UninstallMcpInput, output: UninstallMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1804
- **引用次数**：6

#### `updateMcpProxy`

- **类型**：数据处理
- **说明**：更新：MCP 通道 / 代理
- **签名**：`updateMcpProxy(input: UpdateMcpInput, output: UpdateMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1808
- **引用次数**：6

#### `getMcpProxy`

- **类型**：逻辑控制
- **说明**：获取：MCP 通道 / 代理（返回成功与否）
- **签名**：`getMcpProxy(input: GetMcpInput, output: GetMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1812
- **引用次数**：6

#### `soMcpProxy`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道 / 代理（返回成功与否）
- **签名**：`soMcpProxy(input: SoMcpInput, output: SoMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1816
- **引用次数**：6

#### `addPromptProxy`

- **类型**：逻辑控制
- **说明**：写入/新增：提示词 / 代理（返回成功与否）
- **签名**：`addPromptProxy(input: AddPromptInput, output: AddPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1824
- **引用次数**：6

#### `updatePromptProxy`

- **类型**：数据处理
- **说明**：更新：提示词 / 代理
- **签名**：`updatePromptProxy(input: UpdatePromptInput, output: UpdatePromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1828
- **引用次数**：6

#### `delPromptProxy`

- **类型**：逻辑控制
- **说明**：删除/清理：提示词 / 代理（返回成功与否）
- **签名**：`delPromptProxy(input: DelPromptInput, output: DelPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1832
- **引用次数**：6

#### `soPromptProxy`

- **类型**：逻辑控制
- **说明**：查询：提示词 / 代理（返回成功与否）
- **签名**：`soPromptProxy(input: SoPromptInput, output: SoPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1836
- **引用次数**：6

#### `getPromptProxy`

- **类型**：逻辑控制
- **说明**：获取：提示词 / 代理（返回成功与否）
- **签名**：`getPromptProxy(input: GetPromptInput, output: GetPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Config/application/ConfigService.ts:1840
- **引用次数**：6

## 文件 `brian-backend/Application/Config/domain/configRegistrations.ts`

### 模块级函数

#### `base`

- **类型**：逻辑控制
- **说明**：处理 base
- **签名**：`base(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration`
- **位置**：brian-backend/Application/Config/domain/configRegistrations.ts:3
- **引用次数**：639

#### `core`

- **类型**：逻辑控制
- **说明**：处理 core
- **签名**：`core(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration`
- **位置**：brian-backend/Application/Config/domain/configRegistrations.ts:7
- **引用次数**：138

#### `app`

- **类型**：逻辑控制
- **说明**：处理 app
- **签名**：`app(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[], readable?: boolean, writable?: boolean): ConfigRegistration`
- **位置**：brian-backend/Application/Config/domain/configRegistrations.ts:11
- **引用次数**：36

#### `agent`

- **类型**：逻辑控制
- **说明**：处理 Agent
- **签名**：`agent(mod: string, cat: string, key: string, name: string, type: string, def: unknown, desc?: string, enumVals?: unknown[]): ConfigRegistration`
- **位置**：brian-backend/Application/Config/domain/configRegistrations.ts:15
- **引用次数**：973

## 文件 `brian-backend/Application/Config/infrastructure/ConfigSchemaInitializer.ts`

### ConfigSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Application/Config/infrastructure/ConfigSchemaInitializer.ts:16
- **引用次数**：99

### ConfigSchemaInitializer（私有）

#### `ensureDefaults`

- **类型**：数据处理
- **说明**：确保就绪：defaults（操作关系数据库）
- **签名**：`ensureDefaults(): void`
- **位置**：brian-backend/Application/Config/infrastructure/ConfigSchemaInitializer.ts:98
- **引用次数**：2

