# Agent / AgentStrategy

- 层：**Agent**　模块：**AgentStrategy**
- 方法数：**21**（逻辑控制 8 · 数据处理 12 · 通用算法 1）

## 文件 `brian-backend/Agent/AgentStrategy/access/AgentStrategyAccess.ts`

### AgentStrategyAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Agent/AgentStrategy/access/AgentStrategyAccess.ts:32
- **引用次数**：272

#### `matchStrategy`

- **类型**：逻辑控制
- **说明**：判断校验：strategy（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`matchStrategy(i: MatchStrategyInput, o: MatchStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/access/AgentStrategyAccess.ts:34
- **引用次数**：8

#### `soStrategyById`

- **类型**：逻辑控制
- **说明**：查询：strategy / 标识（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soStrategyById(i: GetStrategyInput, o: GetStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/access/AgentStrategyAccess.ts:40
- **引用次数**：21

#### `soStrategy`

- **类型**：逻辑控制
- **说明**：查询：strategy（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soStrategy(i: SoStrategyInput, o: SoStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/access/AgentStrategyAccess.ts:46
- **引用次数**：5

#### `addStrategy`

- **类型**：逻辑控制
- **说明**：写入/新增：strategy（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`addStrategy(i: AddStrategyInput, o: AddStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/access/AgentStrategyAccess.ts:52
- **引用次数**：12

#### `updateStrategy`

- **类型**：逻辑控制
- **说明**：更新：strategy（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`updateStrategy(i: UpdateStrategyInput, o: UpdateStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/access/AgentStrategyAccess.ts:58
- **引用次数**：5

#### `toggleStrategy`

- **类型**：逻辑控制
- **说明**：更新：strategy（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`toggleStrategy(i: ToggleStrategyInput, o: ToggleStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/access/AgentStrategyAccess.ts:64
- **引用次数**：6

#### `configAgentStrategy`

- **类型**：逻辑控制
- **说明**：处理 配置 / Agent / strategy（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`configAgentStrategy(i: ConfigAgentStrategyInput, o: ConfigAgentStrategyOutput, c: AgentStrategyContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/access/AgentStrategyAccess.ts:70
- **引用次数**：8

## 文件 `brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts`

### 模块级函数

#### `mapStrategy`

- **类型**：数据处理
- **说明**：转换归并：strategy
- **签名**：`mapStrategy(row: Record<string, unknown>): AgentStrategyRecord`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:23
- **引用次数**：6

#### `domainMatches`

- **类型**：数据处理
- **说明**：处理执行：matches（反序列化）
- **签名**：`domainMatches(domainsJson: string, domain: string): boolean`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:38
- **引用次数**：2

### AgentStrategyService

#### `matchStrategy`

- **类型**：数据处理
- **说明**：判断校验：strategy（操作关系数据库）
- **签名**：`matchStrategy(input: MatchStrategyInput, output: MatchStrategyOutput, _ctx: AgentStrategyContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:58
- **引用次数**：8

#### `soStrategyById`

- **类型**：数据处理
- **说明**：查询：strategy / 标识（操作关系数据库）
- **签名**：`soStrategyById(input: GetStrategyInput, output: GetStrategyOutput, _ctx: AgentStrategyContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:142
- **引用次数**：21

#### `soStrategy`

- **类型**：数据处理
- **说明**：查询：strategy（操作关系数据库）
- **签名**：`soStrategy(input: SoStrategyInput, output: SoStrategyOutput, _ctx: AgentStrategyContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:155
- **引用次数**：5

#### `addStrategy`

- **类型**：数据处理
- **说明**：写入/新增：strategy（操作关系数据库）
- **签名**：`addStrategy(input: AddStrategyInput, output: AddStrategyOutput, _ctx: AgentStrategyContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:166
- **引用次数**：12

#### `updateStrategy`

- **类型**：数据处理
- **说明**：更新：strategy（操作关系数据库）
- **签名**：`updateStrategy(input: UpdateStrategyInput, _output: UpdateStrategyOutput, _ctx: AgentStrategyContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:197
- **引用次数**：5

#### `toggleStrategy`

- **类型**：数据处理
- **说明**：更新：strategy（操作关系数据库）
- **签名**：`toggleStrategy(input: ToggleStrategyInput, output: ToggleStrategyOutput, _ctx: AgentStrategyContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:226
- **引用次数**：6

#### `configAgentStrategy`

- **类型**：数据处理
- **说明**：处理 配置 / Agent / strategy（操作关系数据库）
- **签名**：`configAgentStrategy(input: ConfigAgentStrategyInput, output: ConfigAgentStrategyOutput, _ctx: AgentStrategyContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:248
- **引用次数**：8

### AgentStrategyService（私有）

#### `assertExecutionRule`

- **类型**：数据处理
- **说明**：处理 assert / execution / rule（反序列化）
- **签名**：`assertExecutionRule(rule: string): void`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:303
- **引用次数**：3

#### `getDefaultStrategyId`

- **类型**：通用算法
- **说明**：获取：default / strategy / 标识（纯计算，无外部 IO）
- **签名**：`getDefaultStrategyId(): Promise<string>`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:316
- **引用次数**：3

#### `getConfig`

- **类型**：数据处理
- **说明**：获取：配置（操作关系数据库）
- **签名**：`getConfig(): Promise<AgentStrategyConfigRecord \| null>`
- **位置**：brian-backend/Agent/AgentStrategy/application/AgentStrategyService.ts:321
- **引用次数**：69

## 文件 `brian-backend/Agent/AgentStrategy/infrastructure/AgentStrategySchemaInitializer.ts`

### AgentStrategySchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): Promise<void>`
- **位置**：brian-backend/Agent/AgentStrategy/infrastructure/AgentStrategySchemaInitializer.ts:7
- **引用次数**：99

