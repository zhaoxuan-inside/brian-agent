# Agent / AgentBuilder

- 层：**Agent**　模块：**AgentBuilder**
- 方法数：**50**（逻辑控制 25 · 数据处理 9 · 通用算法 16）

## 文件 `brian-backend/Agent/AgentBuilder/access/AgentBuilderAccess.ts`

### AgentBuilderAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/access/AgentBuilderAccess.ts:43
- **引用次数**：272

#### `buildAgent`

- **类型**：逻辑控制
- **说明**：构建/初始化：Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`buildAgent(i: BuildAgentInput, o: BuildAgentOutput, c: AgentBuilderContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentBuilder/access/AgentBuilderAccess.ts:45
- **引用次数**：11

#### `optimizeAgent`

- **类型**：逻辑控制
- **说明**：处理 optimize / Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`optimizeAgent(i: OptimizeAgentInput, o: OptimizeAgentOutput, c: AgentBuilderContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentBuilder/access/AgentBuilderAccess.ts:51
- **引用次数**：4

#### `buildSystemAgent`

- **类型**：逻辑控制
- **说明**：构建/初始化：system / Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`buildSystemAgent(i: BuildSystemAgentInput, o: BuildSystemAgentOutput, c: AgentBuilderContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentBuilder/access/AgentBuilderAccess.ts:57
- **引用次数**：14

#### `configAgentBuilder`

- **类型**：逻辑控制
- **说明**：处理 配置 / Agent / builder（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`configAgentBuilder(i: ConfigAgentBuilderInput, o: ConfigAgentBuilderOutput, c: AgentBuilderContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentBuilder/access/AgentBuilderAccess.ts:63
- **引用次数**：8

## 文件 `brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts`

### AgentBuilderService

#### `buildAgent`

- **类型**：数据处理
- **说明**：构建/初始化：Agent
- **签名**：`buildAgent(input: BuildAgentInput, output: BuildAgentOutput, ctx: AgentBuilderContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:86
- **引用次数**：11

#### `optimizeAgent`

- **类型**：逻辑控制
- **说明**：处理 optimize / Agent（返回成功与否，异步编排）
- **签名**：`optimizeAgent(input: OptimizeAgentInput, output: OptimizeAgentOutput, ctx: AgentBuilderContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:118
- **引用次数**：4

#### `buildSystemAgent`

- **类型**：通用算法
- **说明**：构建/初始化：system / Agent（纯计算，无外部 IO）
- **签名**：`buildSystemAgent(input: BuildSystemAgentInput, output: BuildSystemAgentOutput, ctx: AgentBuilderContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:150
- **引用次数**：14

#### `configAgentBuilder`

- **类型**：数据处理
- **说明**：处理 配置 / Agent / builder（操作关系数据库）
- **签名**：`configAgentBuilder(input: ConfigAgentBuilderInput, output: ConfigAgentBuilderOutput, _ctx: AgentBuilderContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:222
- **引用次数**：8

### AgentBuilderService（私有）

#### `emitAgentBuildingEvent`

- **类型**：逻辑控制
- **说明**：发送通知：Agent / building / 事件（异步编排）
- **签名**：`emitAgentBuildingEvent(sessionId: string, workId: string, runId: string, agentId: string, taskContent: string): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:260
- **引用次数**：2

#### `reuseMatchedAgent`

- **类型**：逻辑控制
- **说明**：处理 reuse / matched / Agent（返回成功与否，异步编排）
- **签名**：`reuseMatchedAgent(input: BuildAgentInput, output: BuildAgentOutput, libCtx: AgentLibraryContext, agentId: string, sessionId: string, workId: string, runId: string, signature: string, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:269
- **引用次数**：2

#### `recordMatchedAgentUsage`

- **类型**：逻辑控制
- **说明**：写入/新增：matched / Agent / 用量（异步编排）
- **签名**：`recordMatchedAgentUsage(agentId: string, libCtx: AgentLibraryContext, workId: string, runId: string, metrics?: Metrics, report?: Report): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:294
- **引用次数**：2

#### `emitAgentMatchedEvent`

- **类型**：逻辑控制
- **说明**：发送通知：Agent / matched / 事件（异步编排）
- **签名**：`emitAgentMatchedEvent(sessionId: string, workId: string, runId: string, agentId: string, matchOut: MatchAgentOutput): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:311
- **引用次数**：2

#### `matchStrategyForAgent`

- **类型**：逻辑控制
- **说明**：判断校验：strategy / Agent（异步编排）
- **签名**：`matchStrategyForAgent(taskContent: string, complexity: number, domain: string, metrics?: Metrics, report?: Report): Promise<string>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:321
- **引用次数**：2

#### `matchLlmForBuild`

- **类型**：逻辑控制
- **说明**：判断校验：大模型 / build（异步编排）
- **签名**：`matchLlmForBuild(ctx: AgentBuilderContext, agentId: string, runId: string, fallbackLlmId: string, metrics?: Metrics, report?: Report): Promise<string>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:340
- **引用次数**：2

#### `matchSkillForBuild`

- **类型**：通用算法
- **说明**：判断校验：技能 / build（纯计算，无外部 IO）
- **签名**：`matchSkillForBuild(ctx: AgentBuilderContext, agentId: string, runId: string, metrics?: Metrics, report?: Report): Promise<MatchSkillOutput>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:363
- **引用次数**：2

#### `soSelectedSkillEntries`

- **类型**：通用算法
- **说明**：查询：selected / 技能 / entries（纯计算，无外部 IO）
- **签名**：`soSelectedSkillEntries(skillOut: MatchSkillOutput): Array<{ id: string; brief: string; system?: boolean }>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:389
- **引用次数**：4

#### `matchMcpForBuild`

- **类型**：通用算法
- **说明**：判断校验：MCP 通道 / build（纯计算，无外部 IO）
- **签名**：`matchMcpForBuild(ctx: AgentBuilderContext, agentId: string, runId: string, metrics?: Metrics, report?: Report): Promise<MatchMcpOutput>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:403
- **引用次数**：2

#### `matchSoulForBuild`

- **类型**：通用算法
- **说明**：判断校验：人设 / build（纯计算，无外部 IO）
- **签名**：`matchSoulForBuild(ctx: AgentBuilderContext, agentId: string, runId: string, taskContent: string, taskDomain: string, metrics?: Metrics, report?: Report): Promise<MatchSoulOutput>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:426
- **引用次数**：2

#### `selectPromptForAgent`

- **类型**：逻辑控制
- **说明**：界面控制：提示词 / Agent（异步编排）
- **签名**：`selectPromptForAgent(taskText: string, domain: string, metrics?: Metrics, report?: Report): Promise<string>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:453
- **引用次数**：2

#### `assembleAgentComponents`

- **类型**：通用算法
- **说明**：构建/初始化：Agent / components（纯计算，无外部 IO）
- **签名**：`assembleAgentComponents(input: BuildAgentInput, ctx: AgentBuilderContext, agentId: string, analysis: AgentBuildAnalysis, analysisLlm: string, metrics?: Metrics, report?: Report): Promise<AgentBuildComponents>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:466
- **引用次数**：2

#### `persistBuiltAgent`

- **类型**：通用算法
- **说明**：写入/新增：built / Agent（纯计算，无外部 IO）
- **签名**：`persistBuiltAgent(libCtx: AgentLibraryContext, agentId: string, analysis: AgentBuildAnalysis, components: AgentBuildComponents): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:490
- **引用次数**：2

#### `bindCoreComponents`

- **类型**：通用算法
- **说明**：更新：core / components（纯计算，无外部 IO）
- **签名**：`bindCoreComponents(ctx: AgentBuilderContext, agentId: string, runId: string, components: AgentBuildComponents): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:514
- **引用次数**：2

#### `optSkillBindings`

- **类型**：逻辑控制
- **说明**：处理 opt / 技能 / bindings（遍历调度，异步编排）
- **签名**：`optSkillBindings(agentId: string, contextId: string, runId: string, skillIds: string[]): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:520
- **引用次数**：3

#### `optMcpBindings`

- **类型**：逻辑控制
- **说明**：处理 opt / MCP 通道 / bindings（遍历调度，异步编排）
- **签名**：`optMcpBindings(agentId: string, contextId: string, runId: string, mcpIds: string[]): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:535
- **引用次数**：3

#### `optSoulBinding`

- **类型**：逻辑控制
- **说明**：处理 opt / 人设 / binding（异步编排）
- **签名**：`optSoulBinding(agentId: string, contextId: string, runId: string, soulId: string): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:550
- **引用次数**：2

#### `buildBuildSummary`

- **类型**：逻辑控制
- **说明**：构建/初始化：摘要
- **签名**：`buildBuildSummary(agentId: string, analysis: AgentBuildAnalysis, components: AgentBuildComponents): Record<string, unknown>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:564
- **引用次数**：3

#### `archiveAgentBuild`

- **类型**：数据处理
- **说明**：处理 archive / Agent / build（序列化输出）
- **签名**：`archiveAgentBuild(sessionId: string, workId: string, runId: string, agentId: string, analysis: AgentBuildAnalysis, components: AgentBuildComponents, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:577
- **引用次数**：2

#### `emitAgentBuiltEvent`

- **类型**：逻辑控制
- **说明**：发送通知：Agent / built / 事件（异步编排）
- **签名**：`emitAgentBuiltEvent(sessionId: string, workId: string, runId: string, agentId: string, analysis: AgentBuildAnalysis, components: AgentBuildComponents): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:602
- **引用次数**：2

#### `loadOptimizeTarget`

- **类型**：逻辑控制
- **说明**：获取：optimize / target（异步编排）
- **签名**：`loadOptimizeTarget(input: OptimizeAgentInput, libCtx: AgentLibraryContext): Promise<AgentRecord>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:612
- **引用次数**：2

#### `rematchStrategy`

- **类型**：数据处理
- **说明**：处理 rematch / strategy
- **签名**：`rematchStrategy(input: OptimizeAgentInput, agent: AgentRecord, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:623
- **引用次数**：2

#### `unbindStaleSkills`

- **类型**：通用算法
- **说明**：处理 unbind / stale / skills（纯计算，无外部 IO）
- **签名**：`unbindStaleSkills(input: OptimizeAgentInput, agent: AgentRecord, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:647
- **引用次数**：2

#### `unbindStaleSouls`

- **类型**：通用算法
- **说明**：处理 unbind / stale / souls（纯计算，无外部 IO）
- **签名**：`unbindStaleSouls(input: OptimizeAgentInput, agent: AgentRecord, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:668
- **引用次数**：2

#### `rematchLlm`

- **类型**：逻辑控制
- **说明**：处理 rematch / 大模型（异步编排）
- **签名**：`rematchLlm(input: OptimizeAgentInput, ctx: AgentBuilderContext, output: OptimizeAgentOutput): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:687
- **引用次数**：2

#### `rebindSoul`

- **类型**：逻辑控制
- **说明**：处理 rebind / 人设（异步编排）
- **签名**：`rebindSoul(input: OptimizeAgentInput, agent: AgentRecord, ctx: AgentBuilderContext, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:703
- **引用次数**：2

#### `rebindSkills`

- **类型**：数据处理
- **说明**：处理 rebind / skills
- **签名**：`rebindSkills(input: OptimizeAgentInput, agent: AgentRecord, ctx: AgentBuilderContext, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<string[]>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:730
- **引用次数**：2

#### `rebindMcps`

- **类型**：数据处理
- **说明**：处理 rebind / mcps
- **签名**：`rebindMcps(input: OptimizeAgentInput, agent: AgentRecord, ctx: AgentBuilderContext, libCtx: AgentLibraryContext, output: OptimizeAgentOutput): Promise<string[]>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:759
- **引用次数**：2

#### `matchLlmForAgent`

- **类型**：逻辑控制
- **说明**：判断校验：大模型 / Agent（含异常兜底，异步编排）
- **签名**：`matchLlmForAgent(agentId: string, runId: string, metrics?: Metrics, report?: Report): Promise<string>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:788
- **引用次数**：3

#### `analyzeTask`

- **类型**：逻辑控制
- **说明**：处理 analyze / 任务（含异常兜底，异步编排）
- **签名**：`analyzeTask(input: BuildAgentInput, config: AgentBuilderConfigRecord \| null, llmId: string, metrics?: Metrics, report?: Report): Promise<{ complexity: number; domain: string; signature: string }>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:808
- **引用次数**：2

#### `getStrategyIdByLabel`

- **类型**：通用算法
- **说明**：获取：strategy / 标识 / label（纯计算，无外部 IO）
- **签名**：`getStrategyIdByLabel(label: string): Promise<string>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:865
- **引用次数**：2

#### `assertPrompt`

- **类型**：逻辑控制
- **说明**：处理 assert / 提示词（异步编排）
- **签名**：`assertPrompt(id: string): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:880
- **引用次数**：2

#### `getConfig`

- **类型**：数据处理
- **说明**：获取：配置（操作关系数据库）
- **签名**：`getConfig(): Promise<AgentBuilderConfigRecord \| null>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:892
- **引用次数**：69

#### `toLibCtx`

- **类型**：逻辑控制
- **说明**：格式化/序列化：lib
- **签名**：`toLibCtx(ctx: AgentBuilderContext, runId: string): AgentLibraryContext`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:904
- **引用次数**：6

#### `matchPromptForAgent`

- **类型**：通用算法
- **说明**：判断校验：提示词 / Agent（纯计算，无外部 IO）
- **签名**：`matchPromptForAgent(taskText: string, domain: string, metrics?: Metrics, report?: Report): Promise<string>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:912
- **引用次数**：3

#### `generateAgentPurpose`

- **类型**：通用算法
- **说明**：构建/初始化：Agent / purpose（纯计算，无外部 IO）
- **签名**：`generateAgentPurpose(taskText: string, domain: string, soulBrief: string, skillBriefs: string[], mcpIds: string[], metrics?: Metrics, report?: Report): Promise<string>`
- **位置**：brian-backend/Agent/AgentBuilder/application/AgentBuilderService.ts:964
- **引用次数**：3

## 文件 `brian-backend/Agent/AgentBuilder/domain/services/AgentBuildSummaryDomainService.ts`

### 模块级函数

#### `buildAgentBuildSummary`

- **类型**：通用算法
- **说明**：构建/初始化：Agent / 摘要（纯计算，无外部 IO）
- **签名**：`buildAgentBuildSummary(parts: { agentId: string; agentName: string; analysis: AgentBuildAnalysis; strategyId: string; llmId: string; soul: Record<string, unknown> \| null; skills: Array<{ skill_id: string; skill_brief: string }>; mcpIds: string[]; }): Record<string, unknown>`
- **位置**：brian-backend/Agent/AgentBuilder/domain/services/AgentBuildSummaryDomainService.ts:7
- **引用次数**：3

## 文件 `brian-backend/Agent/AgentBuilder/domain/services/AgentNamingDomainService.ts`

### 模块级函数

#### `cleanAgentName`

- **类型**：通用算法
- **说明**：删除/清理：Agent / name（纯计算，无外部 IO）
- **签名**：`cleanAgentName(text: string): string`
- **位置**：brian-backend/Agent/AgentBuilder/domain/services/AgentNamingDomainService.ts:17
- **引用次数**：4

#### `generateAgentName`

- **类型**：通用算法
- **说明**：构建/初始化：Agent / name（纯计算，无外部 IO）
- **签名**：`generateAgentName(soul: Record<string, unknown> \| null, skills: Array<{ skill_id: string; skill_brief: string; relevance: number }>, domain: string): string`
- **位置**：brian-backend/Agent/AgentBuilder/domain/services/AgentNamingDomainService.ts:27
- **引用次数**：3

## 文件 `brian-backend/Agent/AgentBuilder/domain/services/BindingDiffDomainService.ts`

### 模块级函数

#### `computeBindingDiff`

- **类型**：数据处理
- **说明**：计算统计：binding / diff
- **签名**：`computeBindingDiff(boundIds: string[], matchedIds: string[]): BindingDiff`
- **位置**：brian-backend/Agent/AgentBuilder/domain/services/BindingDiffDomainService.ts:6
- **引用次数**：4

## 文件 `brian-backend/Agent/AgentBuilder/infrastructure/AgentBuilderSchemaInitializer.ts`

### AgentBuilderSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): Promise<void>`
- **位置**：brian-backend/Agent/AgentBuilder/infrastructure/AgentBuilderSchemaInitializer.ts:8
- **引用次数**：99

