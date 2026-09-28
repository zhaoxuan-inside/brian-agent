# Agent / AgentLibrary

- 层：**Agent**　模块：**AgentLibrary**
- 方法数：**42**（逻辑控制 17 · 数据处理 25 · 通用算法 0）

## 文件 `brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts`

### AgentLibraryAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:40
- **引用次数**：272

#### `addAgent`

- **类型**：逻辑控制
- **说明**：写入/新增：Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`addAgent(i: AddAgentInput, o: AddAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:44
- **引用次数**：31

#### `matchAgent`

- **类型**：逻辑控制
- **说明**：判断校验：Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`matchAgent(i: MatchAgentInput, o: MatchAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:49
- **引用次数**：15

#### `updateAgent`

- **类型**：逻辑控制
- **说明**：更新：Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`updateAgent(i: UpdateAgentInput, o: UpdateAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:54
- **引用次数**：17

#### `delAgent`

- **类型**：逻辑控制
- **说明**：删除/清理：Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`delAgent(i: DelAgentInput, o: DelAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:59
- **引用次数**：7

#### `toggleAgent`

- **类型**：逻辑控制
- **说明**：更新：Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`toggleAgent(i: ToggleAgentInput, o: ToggleAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:64
- **引用次数**：4

#### `recordAgentUsage`

- **类型**：逻辑控制
- **说明**：写入/新增：Agent / 用量（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`recordAgentUsage(i: RecordAgentUsageInput, o: RecordAgentUsageOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:69
- **引用次数**：16

#### `soAgent`

- **类型**：逻辑控制
- **说明**：查询：Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soAgent(i: GetAgentInput, o: GetAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:74
- **引用次数**：28

#### `bindAgentComponent`

- **类型**：逻辑控制
- **说明**：更新：Agent / 组件（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`bindAgentComponent(i: BindAgentComponentInput, o: BindAgentComponentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:80
- **引用次数**：12

#### `unbindAgentComponent`

- **类型**：逻辑控制
- **说明**：处理 unbind / Agent / 组件（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`unbindAgentComponent(i: UnbindAgentComponentInput, o: UnbindAgentComponentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:86
- **引用次数**：7

#### `ageAgent`

- **类型**：逻辑控制
- **说明**：处理 age / Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`ageAgent(i: AgeAgentInput, o: AgeAgentOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:91
- **引用次数**：8

#### `soAgentRule`

- **类型**：逻辑控制
- **说明**：查询：Agent / rule（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soAgentRule(i: GetAgentRuleInput, o: GetAgentRuleOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:96
- **引用次数**：4

#### `updateAgentRule`

- **类型**：逻辑控制
- **说明**：更新：Agent / rule（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`updateAgentRule(i: UpdateAgentRuleInput, o: UpdateAgentRuleOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:101
- **引用次数**：8

#### `configAgentLibrary`

- **类型**：逻辑控制
- **说明**：处理 配置 / Agent / library（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`configAgentLibrary(i: ConfigAgentLibraryInput, o: ConfigAgentLibraryOutput, c: AgentLibraryContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/access/AgentLibraryAccess.ts:106
- **引用次数**：15

## 文件 `brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts`

### 模块级函数

#### `toBool`

- **类型**：逻辑控制
- **说明**：格式化/序列化：bool
- **签名**：`toBool(v: unknown): boolean`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:39
- **引用次数**：3

#### `mapAgent`

- **类型**：数据处理
- **说明**：转换归并：Agent
- **签名**：`mapAgent(row: Record<string, unknown>): AgentRecord`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:43
- **引用次数**：7

#### `parseIdList`

- **类型**：数据处理
- **说明**：解析：标识 / 列表（反序列化）
- **签名**：`parseIdList(raw: unknown): string[]`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:65
- **引用次数**：3

### AgentLibraryService

#### `addAgent`

- **类型**：数据处理
- **说明**：写入/新增：Agent（操作关系数据库，序列化输出）
- **签名**：`addAgent(input: AddAgentInput, output: AddAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:82
- **引用次数**：31

#### `matchAgent`

- **类型**：数据处理
- **说明**：判断校验：Agent（操作关系数据库）
- **签名**：`matchAgent(input: MatchAgentInput, output: MatchAgentOutput, ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:124
- **引用次数**：15

#### `updateAgent`

- **类型**：数据处理
- **说明**：更新：Agent（操作关系数据库）
- **签名**：`updateAgent(input: UpdateAgentInput, _output: UpdateAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:216
- **引用次数**：17

#### `bindAgentComponent`

- **类型**：数据处理
- **说明**：更新：Agent / 组件（操作关系数据库）
- **签名**：`bindAgentComponent(input: BindAgentComponentInput, output: BindAgentComponentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:247
- **引用次数**：12

#### `unbindAgentComponent`

- **类型**：数据处理
- **说明**：处理 unbind / Agent / 组件（操作关系数据库）
- **签名**：`unbindAgentComponent(input: UnbindAgentComponentInput, output: UnbindAgentComponentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:259
- **引用次数**：7

### AgentLibraryService（私有）

#### `soAgentRecordForBinding`

- **类型**：数据处理
- **说明**：查询：Agent / record / binding（操作关系数据库）
- **签名**：`soAgentRecordForBinding(agentId: string): Promise<AgentRecord>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:277
- **引用次数**：3

#### `soCurrentBinding`

- **类型**：逻辑控制
- **说明**：查询：current / binding
- **签名**：`soCurrentBinding(record: AgentRecord, kind: ComponentKind): string[]`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:290
- **引用次数**：2

#### `prepareBindingPatch`

- **类型**：数据处理
- **说明**：构建/初始化：binding / patch（序列化输出）
- **签名**：`prepareBindingPatch(kind: ComponentKind, ids: string[], record: AgentRecord): Record<string, unknown>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:297
- **引用次数**：3

### AgentLibraryService

#### `delAgent`

- **类型**：数据处理
- **说明**：删除/清理：Agent（操作关系数据库）
- **签名**：`delAgent(input: DelAgentInput, output: DelAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:315
- **引用次数**：7

### AgentLibraryService（私有）

#### `assertNotUserOwned`

- **类型**：数据处理
- **说明**：处理 assert / 用户 / owned（操作关系数据库）
- **签名**：`assertNotUserOwned(internalIds: string[]): Promise<void>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:358
- **引用次数**：2

### AgentLibraryService

#### `toggleAgent`

- **类型**：数据处理
- **说明**：更新：Agent（操作关系数据库）
- **签名**：`toggleAgent(input: ToggleAgentInput, output: ToggleAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:372
- **引用次数**：4

#### `recordAgentUsage`

- **类型**：数据处理
- **说明**：写入/新增：Agent / 用量（操作关系数据库）
- **签名**：`recordAgentUsage(input: RecordAgentUsageInput, _output: RecordAgentUsageOutput, ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:394
- **引用次数**：16

#### `soAgent`

- **类型**：数据处理
- **说明**：查询：Agent（操作关系数据库）
- **签名**：`soAgent(input: GetAgentInput, output: GetAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:456
- **引用次数**：28

#### `ageAgent`

- **类型**：数据处理
- **说明**：处理 age / Agent（操作关系数据库）
- **签名**：`ageAgent(_input: AgeAgentInput, output: AgeAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:479
- **引用次数**：8

#### `soAgentRule`

- **类型**：数据处理
- **说明**：查询：Agent / rule（操作关系数据库）
- **签名**：`soAgentRule(input: GetAgentRuleInput, output: GetAgentRuleOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:537
- **引用次数**：4

#### `updateAgentRule`

- **类型**：数据处理
- **说明**：更新：Agent / rule（操作关系数据库）
- **签名**：`updateAgentRule(input: UpdateAgentRuleInput, _output: UpdateAgentRuleOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:555
- **引用次数**：8

#### `configAgentLibrary`

- **类型**：数据处理
- **说明**：处理 配置 / Agent / library（操作关系数据库）
- **签名**：`configAgentLibrary(input: ConfigAgentLibraryInput, output: ConfigAgentLibraryOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:614
- **引用次数**：15

### AgentLibraryService（私有）

#### `getConfig`

- **类型**：数据处理
- **说明**：获取：配置（操作关系数据库）
- **签名**：`getConfig(): Promise<AgentLibraryConfigRecord \| null>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:714
- **引用次数**：69

#### `resolveRankerLlm`

- **类型**：数据处理
- **说明**：获取：ranker / 大模型（向量库）
- **签名**：`resolveRankerLlm(): Promise<string>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:729
- **引用次数**：2

#### `llmMatchAgent`

- **类型**：数据处理
- **说明**：处理 大模型 / match / Agent（序列化输出）
- **签名**：`llmMatchAgent(taskContent: string, candidates: AgentRecord[], promptTemplateId?: string, biz?: { session_id?: string; run_id?: string; work_id?: string }): Promise<{ agent_id: string; score: number } \| null>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:741
- **引用次数**：2

#### `opDataToMap`

- **类型**：逻辑控制
- **说明**：处理 op / map（遍历调度）
- **签名**：`opDataToMap(data: unknown): Record<string, unknown>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:799
- **引用次数**：2

#### `soMatchPromptTemplateId`

- **类型**：数据处理
- **说明**：查询：match / 提示词 / template / 标识（操作关系数据库）
- **签名**：`soMatchPromptTemplateId(): Promise<string>`
- **位置**：brian-backend/Agent/AgentLibrary/application/AgentLibraryService.ts:814
- **引用次数**：12

## 文件 `brian-backend/Agent/AgentLibrary/infrastructure/AgentLibrarySchemaInitializer.ts`

### AgentLibrarySchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): Promise<void>`
- **位置**：brian-backend/Agent/AgentLibrary/infrastructure/AgentLibrarySchemaInitializer.ts:10
- **引用次数**：99

### AgentLibrarySchemaInitializer（私有）

#### `insertDefaultConfig`

- **类型**：数据处理
- **说明**：写入/新增：default / 配置（操作关系数据库）
- **签名**：`insertDefaultConfig(): Promise<void>`
- **位置**：brian-backend/Agent/AgentLibrary/infrastructure/AgentLibrarySchemaInitializer.ts:99
- **引用次数**：4

#### `backfillDailyUsage`

- **类型**：数据处理
- **说明**：处理 backfill / daily / 用量（操作关系数据库）
- **签名**：`backfillDailyUsage(): Promise<void>`
- **位置**：brian-backend/Agent/AgentLibrary/infrastructure/AgentLibrarySchemaInitializer.ts:114
- **引用次数**：2

