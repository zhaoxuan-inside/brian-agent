# Core / SkillCoreProvider

- 层：**Core**　模块：**SkillCoreProvider**
- 方法数：**45**（逻辑控制 17 · 数据处理 20 · 通用算法 8）

## 文件 `brian-backend/Core/SkillCoreProvider/access/SkillCoreAccess.ts`

### SkillCoreAccess

#### `matchSkill`

- **类型**：逻辑控制
- **说明**：判断校验：技能（返回成功与否，接入层转发至 Service）
- **签名**：`matchSkill(input: MatchSkillInput, output: MatchSkillOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/access/SkillCoreAccess.ts:52
- **引用次数**：38

#### `optSkill`

- **类型**：逻辑控制
- **说明**：处理 opt / 技能（返回成功与否，接入层转发至 Service）
- **签名**：`optSkill(input: OptSkillInput, output: OptSkillOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/access/SkillCoreAccess.ts:58
- **引用次数**：11

#### `ageSkill`

- **类型**：逻辑控制
- **说明**：处理 age / 技能（返回成功与否，接入层转发至 Service）
- **签名**：`ageSkill(input: AgeSkillInput, output: AgeSkillOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/access/SkillCoreAccess.ts:64
- **引用次数**：9

#### `soSkillRule`

- **类型**：逻辑控制
- **说明**：查询：技能 / rule（返回成功与否，接入层转发至 Service）
- **签名**：`soSkillRule(input: SoSkillRuleInput, output: SoSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/access/SkillCoreAccess.ts:70
- **引用次数**：18

#### `updateSkillRule`

- **类型**：逻辑控制
- **说明**：更新：技能 / rule（返回成功与否，接入层转发至 Service）
- **签名**：`updateSkillRule(input: UpdateSkillRuleInput, output: UpdateSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/access/SkillCoreAccess.ts:76
- **引用次数**：16

#### `configSkillCore`

- **类型**：逻辑控制
- **说明**：处理 配置 / 技能 / core（返回成功与否，接入层转发至 Service）
- **签名**：`configSkillCore(input: ConfigSkillCoreInput, output: ConfigSkillCoreOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/access/SkillCoreAccess.ts:82
- **引用次数**：16

## 文件 `brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts`

### SkillCoreService

#### `matchSkill`

- **类型**：数据处理
- **说明**：判断校验：技能（向量库）
- **签名**：`matchSkill(input: MatchSkillInput, output: MatchSkillOutput, context: SkillCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:62
- **引用次数**：38

#### `optSkill`

- **类型**：数据处理
- **说明**：处理 opt / 技能
- **签名**：`optSkill(input: OptSkillInput, output: OptSkillOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:182
- **引用次数**：11

#### `ageSkill`

- **类型**：逻辑控制
- **说明**：处理 age / 技能（返回成功与否，异步编排）
- **签名**：`ageSkill(_input: AgeSkillInput, output: AgeSkillOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:199
- **引用次数**：9

### SkillCoreService（私有）

#### `soStaleSkillUsages`

- **类型**：数据处理
- **说明**：查询：stale / 技能 / usages（操作关系数据库）
- **签名**：`soStaleSkillUsages(): Promise<Array<{ agent_id: string; skill_id: string; usage_count: number }>>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:206
- **引用次数**：2

### SkillCoreService

#### `soSkillRule`

- **类型**：数据处理
- **说明**：查询：技能 / rule（操作关系数据库）
- **签名**：`soSkillRule(input: SoSkillRuleInput, output: SoSkillRuleOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:228
- **引用次数**：18

#### `updateSkillRule`

- **类型**：数据处理
- **说明**：更新：技能 / rule（操作关系数据库）
- **签名**：`updateSkillRule(input: UpdateSkillRuleInput, _output: UpdateSkillRuleOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:244
- **引用次数**：16

#### `configSkillCore`

- **类型**：数据处理
- **说明**：处理 配置 / 技能 / core
- **签名**：`configSkillCore(input: ConfigSkillCoreInput, output: ConfigSkillCoreOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:287
- **引用次数**：16

### SkillCoreService（私有）

#### `applyMatchCacheConfig`

- **类型**：逻辑控制
- **说明**：更新：match / 缓存 / 配置（异步编排）
- **签名**：`applyMatchCacheConfig(): Promise<void>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:363
- **引用次数**：5

#### `getConfig`

- **类型**：数据处理
- **说明**：获取：配置
- **签名**：`getConfig(): Promise<SkillCoreConfigRecord>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:373
- **引用次数**：69

#### `recordSkillUsage`

- **类型**：数据处理
- **说明**：写入/新增：技能 / 用量（操作关系数据库）
- **签名**：`recordSkillUsage(agentId: string, skillId: string): Promise<void>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:391
- **引用次数**：2

#### `renderPrompt`

- **类型**：逻辑控制
- **说明**：格式化/序列化：提示词（含异常兜底，异步编排）
- **签名**：`renderPrompt(templateId: string, variables: Record<string, unknown>): Promise<string>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:404
- **引用次数**：11

#### `soMatchPromptTemplateId`

- **类型**：数据处理
- **说明**：查询：match / 提示词 / template / 标识（操作关系数据库）
- **签名**：`soMatchPromptTemplateId(): Promise<string>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:420
- **引用次数**：12

#### `soRankLLM`

- **类型**：逻辑控制
- **说明**：查询：rank / 大模型（含异常兜底，异步编排）
- **签名**：`soRankLLM(input: ExecLLMInput, matchCtx?: Context): Promise<string>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:437
- **引用次数**：8

#### `rankSkillsByLLM`

- **类型**：数据处理
- **说明**：计算统计：skills / 大模型（序列化输出）
- **签名**：`rankSkillsByLLM(agentId: string, contextId: string, runId: string, availableSkills: Array<{ id: string; skill_brief: string; skill_md?: string; name?: string }>, config: SkillCoreConfigRecord, taskContent: string, matchCtx?: Context): Promise<NeedRankingResult \| null>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:454
- **引用次数**：2

#### `toSkillEntry`

- **类型**：通用算法
- **说明**：格式化/序列化：技能 / entry（纯计算，无外部 IO）
- **签名**：`toSkillEntry(candidate: RankedCandidate, skills: Array<{ id: string; skill_brief: string }>): MatchedSkillEntry \| null`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:490
- **引用次数**：2

#### `importSkillFromGitHub`

- **类型**：数据处理
- **说明**：处理 import / 技能 / git / hub
- **签名**：`importSkillFromGitHub(keywords: string[], config: SkillCoreConfigRecord, _matchCtx?: Context): Promise<MatchedSkillEntry \| null>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:498
- **引用次数**：2

#### `addImportedSkill`

- **类型**：逻辑控制
- **说明**：写入/新增：imported / 技能（异步编排）
- **签名**：`addImportedSkill(parsed: ParsedSkillMd): Promise<MatchedSkillEntry \| null>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:516
- **引用次数**：2

#### `generateSkill`

- **类型**：通用算法
- **说明**：构建/初始化：技能（纯计算，无外部 IO）
- **签名**：`generateSkill(agentId: string, taskContent: string, matchCtx?: Context): Promise<MatchedSkillEntry[]>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:535
- **引用次数**：2

#### `toFileEntries`

- **类型**：通用算法
- **说明**：格式化/序列化：文件 / entries（纯计算，无外部 IO）
- **签名**：`toFileEntries(raw: unknown): FileEntry[] \| undefined`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:576
- **引用次数**：3

#### `commitMatchCache`

- **类型**：数据处理
- **说明**：处理 commit / match / 缓存（向量库）
- **签名**：`commitMatchCache(taskContent: string, embedding: number[] \| null, ranked: MatchedSkillEntry[], matchCtx?: Context): Promise<void>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:587
- **引用次数**：8

#### `embedTask`

- **类型**：数据处理
- **说明**：处理 embed / 任务（向量库）
- **签名**：`embedTask(task: string, context?: Context): Promise<number[]>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:599
- **引用次数**：12

#### `hydrateSkillsOrNone`

- **类型**：逻辑控制
- **说明**：处理 hydrate / skills / none（遍历调度，异步编排）
- **签名**：`hydrateSkillsOrNone(skillIds: string[]): Promise<MatchedSkillEntry[]>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:609
- **引用次数**：2

#### `hydrateSkillOrNone`

- **类型**：逻辑控制
- **说明**：处理 hydrate / 技能 / none（异步编排）
- **签名**：`hydrateSkillOrNone(skillId: string): Promise<MatchedSkillEntry \| null>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:620
- **引用次数**：2

#### `soSystemSkills`

- **类型**：通用算法
- **说明**：查询：system / skills（纯计算，无外部 IO）
- **签名**：`soSystemSkills(): Promise<MatchedSkillEntry[]>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:632
- **引用次数**：2

#### `enrichMatchedSkills`

- **类型**：逻辑控制
- **说明**：处理 enrich / matched / skills（遍历调度，异步编排）
- **签名**：`enrichMatchedSkills(skillIds: string[]): Promise<MatchedSkillEntry[]>`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:650
- **引用次数**：2

#### `toSkillCoreConfigRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：技能 / core / 配置 / record
- **签名**：`toSkillCoreConfigRecord(row: Record<string, unknown>): SkillCoreConfigRecord`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:675
- **引用次数**：2

#### `toConfigBoolean`

- **类型**：通用算法
- **说明**：格式化/序列化：配置 / boolean（纯计算，无外部 IO）
- **签名**：`toConfigBoolean(value: unknown, defaultValue: boolean): boolean`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:693
- **引用次数**：5

#### `toSkillOptRuleRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：技能 / opt / rule / record
- **签名**：`toSkillOptRuleRecord(row: Record<string, unknown>): SkillOptRuleRecord`
- **位置**：brian-backend/Core/SkillCoreProvider/application/SkillCoreService.ts:698
- **引用次数**：2

## 文件 `brian-backend/Core/SkillCoreProvider/infrastructure/GitHubSkillClient.ts`

### GitHubSkillClient

#### `searchSkills`

- **类型**：数据处理
- **说明**：查询：skills
- **签名**：`searchSkills(keywords: string[], token: string): Promise<GitHubSkillHit[]>`
- **位置**：brian-backend/Core/SkillCoreProvider/infrastructure/GitHubSkillClient.ts:34
- **引用次数**：17

#### `fetchSkillMd`

- **类型**：逻辑控制
- **说明**：获取：技能 / md（异步编排）
- **签名**：`fetchSkillMd(hit: GitHubSkillHit, token: string): Promise<ParsedSkillMd \| null>`
- **位置**：brian-backend/Core/SkillCoreProvider/infrastructure/GitHubSkillClient.ts:46
- **引用次数**：6

### GitHubSkillClient（私有）

#### `searchByCode`

- **类型**：数据处理
- **说明**：查询：code
- **签名**：`searchByCode(query: string, token: string): Promise<GitHubSkillHit[]>`
- **位置**：brian-backend/Core/SkillCoreProvider/infrastructure/GitHubSkillClient.ts:53
- **引用次数**：2

#### `searchByRepo`

- **类型**：数据处理
- **说明**：查询：repo
- **签名**：`searchByRepo(keywords: string[], token: string): Promise<GitHubSkillHit[]>`
- **位置**：brian-backend/Core/SkillCoreProvider/infrastructure/GitHubSkillClient.ts:70
- **引用次数**：2

#### `resolveDefaultBranch`

- **类型**：逻辑控制
- **说明**：获取：default / branch（异步编排）
- **签名**：`resolveDefaultBranch(repo: string, token: string): Promise<string>`
- **位置**：brian-backend/Core/SkillCoreProvider/infrastructure/GitHubSkillClient.ts:90
- **引用次数**：2

#### `rawExists`

- **类型**：逻辑控制
- **说明**：处理 raw / exists（返回成功与否，异步编排）
- **签名**：`rawExists(repo: string, branch: string, path: string, token: string): Promise<boolean>`
- **位置**：brian-backend/Core/SkillCoreProvider/infrastructure/GitHubSkillClient.ts:96
- **引用次数**：2

#### `getJson`

- **类型**：数据处理
- **说明**：获取：JSON（反序列化）
- **签名**：`getJson(url: string, token: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Core/SkillCoreProvider/infrastructure/GitHubSkillClient.ts:101
- **引用次数**：4

#### `get`

- **类型**：通用算法
- **说明**：获取相关数据（纯计算，无外部 IO）
- **签名**：`get(url: string, token: string): Promise<string \| null>`
- **位置**：brian-backend/Core/SkillCoreProvider/infrastructure/GitHubSkillClient.ts:112
- **引用次数**：439

### 模块级函数

#### `parseSkillMd`

- **类型**：通用算法
- **说明**：解析：技能 / md（纯计算，无外部 IO）
- **签名**：`parseSkillMd(raw: string, fallbackName: string): ParsedSkillMd`
- **位置**：brian-backend/Core/SkillCoreProvider/infrastructure/GitHubSkillClient.ts:133
- **引用次数**：3

#### `firstParagraph`

- **类型**：通用算法
- **说明**：处理 paragraph（纯计算，无外部 IO）
- **签名**：`firstParagraph(text: string): string`
- **位置**：brian-backend/Core/SkillCoreProvider/infrastructure/GitHubSkillClient.ts:146
- **引用次数**：3

## 文件 `brian-backend/Core/SkillCoreProvider/infrastructure/SkillCoreSchemaInitializer.ts`

### SkillCoreSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Core/SkillCoreProvider/infrastructure/SkillCoreSchemaInitializer.ts:12
- **引用次数**：99

