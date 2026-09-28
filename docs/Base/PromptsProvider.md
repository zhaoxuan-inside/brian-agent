# Base / PromptsProvider

- 层：**Base**　模块：**PromptsProvider**
- 方法数：**32**（逻辑控制 14 · 数据处理 14 · 通用算法 4）

## 文件 `brian-backend/Base/PromptsProvider/access/PromptsAccess.ts`

### PromptsAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/PromptsProvider/access/PromptsAccess.ts:57
- **引用次数**：272

#### `addPrompt`

- **类型**：逻辑控制
- **说明**：写入/新增：提示词（返回成功与否，接入层转发至 Service）
- **签名**：`addPrompt(input: AddPromptInput, output: AddPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/access/PromptsAccess.ts:63
- **引用次数**：43

#### `delPrompt`

- **类型**：逻辑控制
- **说明**：删除/清理：提示词（返回成功与否，接入层转发至 Service）
- **签名**：`delPrompt(input: DelPromptInput, output: DelPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/access/PromptsAccess.ts:69
- **引用次数**：16

#### `updatePrompt`

- **类型**：逻辑控制
- **说明**：更新：提示词（返回成功与否，接入层转发至 Service）
- **签名**：`updatePrompt(input: UpdatePromptInput, output: UpdatePromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/access/PromptsAccess.ts:75
- **引用次数**：21

#### `soPromptById`

- **类型**：逻辑控制
- **说明**：查询：提示词 / 标识（返回成功与否，接入层转发至 Service）
- **签名**：`soPromptById(input: GetPromptInput, output: GetPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/access/PromptsAccess.ts:81
- **引用次数**：33

#### `soPrompt`

- **类型**：逻辑控制
- **说明**：查询：提示词（返回成功与否，接入层转发至 Service）
- **签名**：`soPrompt(input: SoPromptInput, output: SoPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/access/PromptsAccess.ts:87
- **引用次数**：44

#### `execPrompt`

- **类型**：逻辑控制
- **说明**：处理执行：提示词（返回成功与否，接入层转发至 Service）
- **签名**：`execPrompt(input: ExecPromptInput, output: ExecPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/access/PromptsAccess.ts:93
- **引用次数**：40

#### `enablePrompts`

- **类型**：逻辑控制
- **说明**：界面控制：prompts（返回成功与否，接入层转发至 Service）
- **签名**：`enablePrompts(input: EnablePromptsInput, output: EnablePromptsOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/access/PromptsAccess.ts:99
- **引用次数**：16

#### `closePrompts`

- **类型**：逻辑控制
- **说明**：删除/清理：prompts（返回成功与否，接入层转发至 Service）
- **签名**：`closePrompts(input: ClosePromptInput, output: ClosePromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/access/PromptsAccess.ts:105
- **引用次数**：18

## 文件 `brian-backend/Base/PromptsProvider/application/PromptsService.ts`

### PromptsService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:34
- **引用次数**：272

### PromptsService（私有）

#### `ensureEnabled`

- **类型**：逻辑控制
- **说明**：确保就绪：enabled
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:40
- **引用次数**：118

#### `escapeRegExp`

- **类型**：通用算法
- **说明**：处理 escape / reg / exp（纯计算，无外部 IO）
- **签名**：`escapeRegExp(s: string): string`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:53
- **引用次数**：8

### PromptsService

#### `addPrompt`

- **类型**：数据处理
- **说明**：写入/新增：提示词（操作关系数据库）
- **签名**：`addPrompt(input: AddPromptInput, output: AddPromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:63
- **引用次数**：43

#### `delPrompt`

- **类型**：数据处理
- **说明**：删除/清理：提示词（操作关系数据库）
- **签名**：`delPrompt(input: DelPromptInput, output: DelPromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:95
- **引用次数**：16

### PromptsService（私有）

#### `assertNotDeleteSystem`

- **类型**：数据处理
- **说明**：处理 assert / delete / system（操作关系数据库）
- **签名**：`assertNotDeleteSystem(conditions: Condition[]): Promise<void>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:122
- **引用次数**：2

#### `assertNotUnmarkSystem`

- **类型**：数据处理
- **说明**：处理 assert / unmark / system（操作关系数据库）
- **签名**：`assertNotUnmarkSystem(conditions: Condition[], patch: Partial<PromptTemplateData>): Promise<void>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:132
- **引用次数**：2

### PromptsService

#### `updatePrompt`

- **类型**：数据处理
- **说明**：更新：提示词（操作关系数据库）
- **签名**：`updatePrompt(input: UpdatePromptInput, output: UpdatePromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:145
- **引用次数**：21

#### `soPromptById`

- **类型**：数据处理
- **说明**：查询：提示词 / 标识（操作关系数据库）
- **签名**：`soPromptById(input: GetPromptInput, output: GetPromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:182
- **引用次数**：33

#### `soPrompt`

- **类型**：数据处理
- **说明**：查询：提示词（操作关系数据库）
- **签名**：`soPrompt(input: SoPromptInput, output: SoPromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:200
- **引用次数**：44

### PromptsService（私有）

#### `daysAgo`

- **类型**：通用算法
- **说明**：处理 days / ago（纯计算，无外部 IO）
- **签名**：`daysAgo(days: number): string`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:254
- **引用次数**：6

#### `soPromptWithUsageSorting`

- **类型**：数据处理
- **说明**：查询：提示词 / 用量 / sorting（操作关系数据库）
- **签名**：`soPromptWithUsageSorting(conditions: Condition[] \| undefined, orderBy: OrderBy[], page: Page \| undefined, output: SoPromptOutput): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:265
- **引用次数**：2

### PromptsService

#### `execPrompt`

- **类型**：数据处理
- **说明**：处理执行：提示词（操作关系数据库）
- **签名**：`execPrompt(input: ExecPromptInput, output: ExecPromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:376
- **引用次数**：40

### PromptsService（私有）

#### `upsertUsage`

- **类型**：数据处理
- **说明**：处理 upsert / 用量（操作关系数据库）
- **签名**：`upsertUsage(promptTemplateId: string): Promise<void>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:412
- **引用次数**：8

### PromptsService

#### `enablePrompts`

- **类型**：逻辑控制
- **说明**：界面控制：prompts（返回成功与否，异步编排）
- **签名**：`enablePrompts(input: EnablePromptsInput, _output: EnablePromptsOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:453
- **引用次数**：16

#### `closePrompts`

- **类型**：逻辑控制
- **说明**：删除/清理：prompts（返回成功与否）
- **签名**：`closePrompts(_input: ClosePromptInput, _output: ClosePromptOutput, _context: PromptContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/PromptsProvider/application/PromptsService.ts:472
- **引用次数**：18

## 文件 `brian-backend/Base/PromptsProvider/domain/services/PromptDomainService.ts`

### 模块级函数

#### `escapeRegExp`

- **类型**：通用算法
- **说明**：处理 escape / reg / exp（纯计算，无外部 IO）
- **签名**：`escapeRegExp(text: string): string`
- **位置**：brian-backend/Base/PromptsProvider/domain/services/PromptDomainService.ts:3
- **引用次数**：8

#### `renderPromptTemplate`

- **类型**：通用算法
- **说明**：格式化/序列化：提示词 / template（纯计算，无外部 IO）
- **签名**：`renderPromptTemplate(template: string, variables: Record<string, unknown>): string`
- **位置**：brian-backend/Base/PromptsProvider/domain/services/PromptDomainService.ts:7
- **引用次数**：3

## 文件 `brian-backend/Base/PromptsProvider/infrastructure/PromptsSchemaInitializer.ts`

### PromptsSchemaInitializer

#### `init`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据
- **签名**：`init(): void`
- **位置**：brian-backend/Base/PromptsProvider/infrastructure/PromptsSchemaInitializer.ts:13
- **引用次数**：99

### PromptsSchemaInitializer（私有）

#### `createTables`

- **类型**：数据处理
- **说明**：写入/新增：tables（操作关系数据库）
- **签名**：`createTables(): void`
- **位置**：brian-backend/Base/PromptsProvider/infrastructure/PromptsSchemaInitializer.ts:18
- **引用次数**：2

#### `migrateLegacyNonUuidTemplates`

- **类型**：数据处理
- **说明**：处理 migrate / legacy / non / uuid（操作关系数据库）
- **签名**：`migrateLegacyNonUuidTemplates(): void`
- **位置**：brian-backend/Base/PromptsProvider/infrastructure/PromptsSchemaInitializer.ts:72
- **引用次数**：2

#### `rebindPromptId`

- **类型**：数据处理
- **说明**：处理 rebind / 提示词 / 标识（操作关系数据库）
- **签名**：`rebindPromptId(oldId: string, newId: string): void`
- **位置**：brian-backend/Base/PromptsProvider/infrastructure/PromptsSchemaInitializer.ts:99
- **引用次数**：3

#### `addColumnIfMissing`

- **类型**：数据处理
- **说明**：写入/新增：字段 / missing（操作关系数据库）
- **签名**：`addColumnIfMissing(column: string, ddl: string): void`
- **位置**：brian-backend/Base/PromptsProvider/infrastructure/PromptsSchemaInitializer.ts:110
- **引用次数**：3

