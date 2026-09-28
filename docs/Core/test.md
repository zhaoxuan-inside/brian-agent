# Core / test

- 层：**Core**　模块：**test**
- 方法数：**23**（逻辑控制 9 · 数据处理 13 · 通用算法 1）

## 文件 `brian-backend/Core/test/GitHubSkillLive.test.ts`

### 模块级函数

#### `stubLlmNeedTrue`

- **类型**：数据处理
- **说明**：处理 stub / 大模型 / need / true（向量库，序列化输出）
- **签名**：`stubLlmNeedTrue(keywords: string[]): LLMAccess`
- **位置**：brian-backend/Core/test/GitHubSkillLive.test.ts:25
- **引用次数**：2

## 文件 `brian-backend/Core/test/InfoCoreProvider.test.ts`

### 模块级函数

#### `makeSaveInput`

- **类型**：数据处理
- **说明**：构建/初始化：save / 输入
- **签名**：`makeSaveInput(overrides?: Partial<SaveInfoInput>): SaveInfoInput`
- **位置**：brian-backend/Core/test/InfoCoreProvider.test.ts:111
- **引用次数**：50

#### `makeStubLLMAccess`

- **类型**：通用算法
- **说明**：构建/初始化：stub / 大模型 / access（纯计算，无外部 IO）
- **签名**：`makeStubLLMAccess(result: string \| null, calls: Array<{ id: string }>): LLMAccess`
- **位置**：brian-backend/Core/test/InfoCoreProvider.test.ts:364
- **引用次数**：4

## 文件 `brian-backend/Core/test/MCPCoreGithubLive.test.ts`

### 模块级函数

#### `traceLlm`

- **类型**：数据处理
- **说明**：处理 执行轨迹 / 大模型（向量库）
- **签名**：`traceLlm(llm: LLMAccessType): LLMAccessType`
- **位置**：brian-backend/Core/test/MCPCoreGithubLive.test.ts:24
- **引用次数**：2

## 文件 `brian-backend/Core/test/MCPCoreWaterfall.test.ts`

### 模块级函数

#### `stubLlm`

- **类型**：数据处理
- **说明**：处理 stub / 大模型（向量库）
- **签名**：`stubLlm(responses: string[]): any`
- **位置**：brian-backend/Core/test/MCPCoreWaterfall.test.ts:42
- **引用次数**：13

#### `stubMcpAccess`

- **类型**：逻辑控制
- **说明**：处理 stub / MCP 通道 / access
- **签名**：`stubMcpAccess(opts: { installId?: string; marketEmpty?: boolean }): { access: MCPAccess; calls: Record<string, number> }`
- **位置**：brian-backend/Core/test/MCPCoreWaterfall.test.ts:56
- **引用次数**：9

#### `matchInput`

- **类型**：逻辑控制
- **说明**：判断校验：输入
- **签名**：`matchInput(taskContent: string): MatchMcpInput`
- **位置**：brian-backend/Core/test/MCPCoreWaterfall.test.ts:77
- **引用次数**：40

#### `seedTemplate`

- **类型**：逻辑控制
- **说明**：处理 seed / template（异步编排）
- **签名**：`seedTemplate(): Promise<void>`
- **位置**：brian-backend/Core/test/MCPCoreWaterfall.test.ts:126
- **引用次数**：5

## 文件 `brian-backend/Core/test/SkillCoreDiskLive.test.ts`

### 模块级函数

#### `findNumber`

- **类型**：逻辑控制
- **说明**：查询：数值（遍历调度）
- **签名**：`findNumber(node: unknown, keys: string[]): number \| null`
- **位置**：brian-backend/Core/test/SkillCoreDiskLive.test.ts:137
- **引用次数**：5

## 文件 `brian-backend/Core/test/SkillCoreProvider.test.ts`

### 模块级函数

#### `ensureCoreTables`

- **类型**：数据处理
- **说明**：确保就绪：core / tables（操作关系数据库）
- **签名**：`ensureCoreTables()`
- **位置**：brian-backend/Core/test/SkillCoreProvider.test.ts:50
- **引用次数**：2

## 文件 `brian-backend/Core/test/SkillCoreWaterfall.test.ts`

### 模块级函数

#### `stubLlm`

- **类型**：数据处理
- **说明**：处理 stub / 大模型（向量库）
- **签名**：`stubLlm(responses: string[]): LLMAccessType`
- **位置**：brian-backend/Core/test/SkillCoreWaterfall.test.ts:33
- **引用次数**：13

#### `stubGithub`

- **类型**：数据处理
- **说明**：处理 stub / github
- **签名**：`stubGithub(hits: unknown[], parsed: ParsedSkillMd \| null): GitHubSkillClient`
- **位置**：brian-backend/Core/test/SkillCoreWaterfall.test.ts:47
- **引用次数**：19

#### `buildService`

- **类型**：数据处理
- **说明**：构建/初始化：Service（操作关系数据库）
- **签名**：`buildService(llm: LLMAccessType, github?: GitHubSkillClient): SkillCoreService`
- **位置**：brian-backend/Core/test/SkillCoreWaterfall.test.ts:62
- **引用次数**：13

#### `matchInput`

- **类型**：逻辑控制
- **说明**：判断校验：输入
- **签名**：`matchInput(agentId: string, taskContent: string): MatchSkillInput`
- **位置**：brian-backend/Core/test/SkillCoreWaterfall.test.ts:66
- **引用次数**：40

#### `seedMatchTemplate`

- **类型**：数据处理
- **说明**：处理 seed / match / template（操作关系数据库）
- **签名**：`seedMatchTemplate(llmText: string): Promise<void>`
- **位置**：brian-backend/Core/test/SkillCoreWaterfall.test.ts:75
- **引用次数**：12

## 文件 `brian-backend/Core/test/SkillMcpMatchE2E.test.ts`

### 模块级函数

#### `makeLlm`

- **类型**：数据处理
- **说明**：构建/初始化：大模型（向量库）
- **签名**：`makeLlm(responses: string[]): { llm: LLMAccess; prompts: string[]; execLlm: ReturnType<typeof vi.fn> }`
- **位置**：brian-backend/Core/test/SkillMcpMatchE2E.test.ts:45
- **引用次数**：8

#### `stubGithub`

- **类型**：数据处理
- **说明**：处理 stub / github
- **签名**：`stubGithub(hits: unknown[], parsed: ParsedSkillMd \| null): GitHubSkillClient`
- **位置**：brian-backend/Core/test/SkillMcpMatchE2E.test.ts:60
- **引用次数**：19

#### `expectNoPlaceholder`

- **类型**：逻辑控制
- **说明**：处理 expect / placeholder
- **签名**：`expectNoPlaceholder(prompt: string): void`
- **位置**：brian-backend/Core/test/SkillMcpMatchE2E.test.ts:67
- **引用次数**：8

#### `matchInput`

- **类型**：逻辑控制
- **说明**：判断校验：输入
- **签名**：`matchInput(taskContent: string): MatchSkillInput`
- **位置**：brian-backend/Core/test/SkillMcpMatchE2E.test.ts:78
- **引用次数**：40

#### `stubMcpAccess`

- **类型**：数据处理
- **说明**：处理 stub / MCP 通道 / access（网络请求）
- **签名**：`stubMcpAccess(): { access: MCPAccess; calls: Record<string, number> }`
- **位置**：brian-backend/Core/test/SkillMcpMatchE2E.test.ts:243
- **引用次数**：9

#### `matchInput`

- **类型**：逻辑控制
- **说明**：判断校验：输入
- **签名**：`matchInput(taskContent: string): MatchMcpInput`
- **位置**：brian-backend/Core/test/SkillMcpMatchE2E.test.ts:262
- **引用次数**：40

## 文件 `brian-backend/Core/test/SoulCoreProvider.test.ts`

### 模块级函数

#### `insertEnabledLLM`

- **类型**：数据处理
- **说明**：写入/新增：enabled / 大模型（操作关系数据库）
- **签名**：`insertEnabledLLM(id: unknown)`
- **位置**：brian-backend/Core/test/SoulCoreProvider.test.ts:186
- **引用次数**：5

#### `buildMatchInput`

- **类型**：逻辑控制
- **说明**：构建/初始化：match / 输入
- **签名**：`buildMatchInput(agentId: string): MatchSoulInput`
- **位置**：brian-backend/Core/test/SoulCoreProvider.test.ts:198
- **引用次数**：7

