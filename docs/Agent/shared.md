# Agent / shared

- 层：**Agent**　模块：**shared**
- 方法数：**13**（逻辑控制 8 · 数据处理 1 · 通用算法 4）

## 文件 `brian-backend/Agent/shared/AgentKit.ts`

### 模块级函数

#### `renderPromptWithFallback`

- **类型**：通用算法
- **说明**：格式化/序列化：提示词 / fallback（纯计算，无外部 IO）
- **签名**：`renderPromptWithFallback(promptsAccess: PromptsAccess, templateId: string \| undefined, fallbackTitle: string, variables: Record<string, unknown>, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/shared/AgentKit.ts:26
- **引用次数**：7

#### `resolveAgentLlm`

- **类型**：逻辑控制
- **说明**：获取：Agent / 大模型（含异常兜底，异步编排）
- **签名**：`resolveAgentLlm(llmCore: LLMCoreAccess \| undefined, agentId: string, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/shared/AgentKit.ts:73
- **引用次数**：8

#### `assertPromptExists`

- **类型**：逻辑控制
- **说明**：处理 assert / 提示词 / exists（异步编排）
- **签名**：`assertPromptExists(promptsAccess: PromptsAccess, id: string, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Agent/shared/AgentKit.ts:93
- **引用次数**：4

#### `getSoulSystemPrompt`

- **类型**：通用算法
- **说明**：获取：人设 / system / 提示词（纯计算，无外部 IO）
- **签名**：`getSoulSystemPrompt(soulAccess: SoulAccess, soulId: string, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/shared/AgentKit.ts:106
- **引用次数**：2

#### `validateAgentSoul`

- **类型**：逻辑控制
- **说明**：判断校验：Agent / 人设（返回成功与否，含异常兜底，异步编排）
- **签名**：`validateAgentSoul(soulAccess: SoulAccess, soulId: string, metrics?: Metrics): Promise<boolean>`
- **位置**：brian-backend/Agent/shared/AgentKit.ts:141
- **引用次数**：3

#### `validateAgentPrompt`

- **类型**：逻辑控制
- **说明**：判断校验：Agent / 提示词（返回成功与否，含异常兜底，异步编排）
- **签名**：`validateAgentPrompt(promptsAccess: PromptsAccess, promptId: string, metrics?: Metrics): Promise<boolean>`
- **位置**：brian-backend/Agent/shared/AgentKit.ts:157
- **引用次数**：3

#### `validateAgentSkills`

- **类型**：逻辑控制
- **说明**：判断校验：Agent / skills（含异常兜底，遍历调度，异步编排）
- **签名**：`validateAgentSkills(skillAccess: SkillAccess, skillIds: string[], metrics?: Metrics): Promise<{ valid: string[]; invalid: string[] }>`
- **位置**：brian-backend/Agent/shared/AgentKit.ts:176
- **引用次数**：3

#### `validateAgentMcps`

- **类型**：逻辑控制
- **说明**：判断校验：Agent / mcps（含异常兜底，遍历调度，异步编排）
- **签名**：`validateAgentMcps(mcpAccess: MCPAccess, mcpIds: string[], metrics?: Metrics): Promise<{ valid: string[]; invalid: string[] }>`
- **位置**：brian-backend/Agent/shared/AgentKit.ts:201
- **引用次数**：3

#### `validateAgentLlm`

- **类型**：逻辑控制
- **说明**：判断校验：Agent / 大模型（返回成功与否，含异常兜底，异步编排）
- **签名**：`validateAgentLlm(llmAccess: LLMAccess, llmId: string, metrics?: Metrics): Promise<boolean>`
- **位置**：brian-backend/Agent/shared/AgentKit.ts:226
- **引用次数**：4

#### `validateAgentResources`

- **类型**：逻辑控制
- **说明**：判断校验：Agent / resources（遍历调度，异步编排）
- **签名**：`validateAgentResources(deps: { agentId: string; soulId?: string; promptId?: string; skillIds?: string[]; mcpIds?: string[]; soulAccess: SoulAccess; promptsAccess: PromptsAccess; skillAccess: SkillAccess; mcpAccess: MCPAccess; metrics?: Metrics; }): Promise<AgentResourceValidationResult>`
- **位置**：brian-backend/Agent/shared/AgentKit.ts:242
- **引用次数**：4

## 文件 `brian-backend/Agent/shared/signature.ts`

### 模块级函数

#### `buildTaskSignature`

- **类型**：通用算法
- **说明**：构建/初始化：任务 / signature（纯计算，无外部 IO）
- **签名**：`buildTaskSignature(taskContent: string, domain: unknown): string`
- **位置**：brian-backend/Agent/shared/signature.ts:3
- **引用次数**：22

#### `parseJsonObject`

- **类型**：通用算法
- **说明**：解析：JSON / object（纯计算，无外部 IO）
- **签名**：`parseJsonObject(text: string): Record<string, unknown> \| null`
- **位置**：brian-backend/Agent/shared/signature.ts:9
- **引用次数**：41

#### `parseTaskContentAndContext`

- **类型**：数据处理
- **说明**：解析：任务 / content / 上下文（反序列化）
- **签名**：`parseTaskContentAndContext(rawTaskContent: string): { cleanTaskContent: string; extractedWorkContext?: Record<string, unknown>; }`
- **位置**：brian-backend/Agent/shared/signature.ts:17
- **引用次数**：3

