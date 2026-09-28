# Base / SoulProvider

- 层：**Base**　模块：**SoulProvider**
- 方法数：**29**（逻辑控制 15 · 数据处理 10 · 通用算法 4）

## 文件 `brian-backend/Base/SoulProvider/access/SoulAccess.ts`

### SoulAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/SoulProvider/access/SoulAccess.ts:42
- **引用次数**：272

#### `addSoul`

- **类型**：逻辑控制
- **说明**：写入/新增：人设（返回成功与否，接入层转发至 Service）
- **签名**：`addSoul(input: AddSoulInput, output: AddSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/access/SoulAccess.ts:47
- **引用次数**：81

#### `delSoul`

- **类型**：逻辑控制
- **说明**：删除/清理：人设（返回成功与否，接入层转发至 Service）
- **签名**：`delSoul(input: DelSoulInput, output: DelSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/access/SoulAccess.ts:53
- **引用次数**：20

#### `updateSoul`

- **类型**：逻辑控制
- **说明**：更新：人设（返回成功与否，接入层转发至 Service）
- **签名**：`updateSoul(input: UpdateSoulInput, output: UpdateSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/access/SoulAccess.ts:59
- **引用次数**：24

#### `soSoulById`

- **类型**：逻辑控制
- **说明**：查询：人设 / 标识（返回成功与否，接入层转发至 Service）
- **签名**：`soSoulById(input: GetSoulInput, output: GetSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/access/SoulAccess.ts:65
- **引用次数**：48

#### `soSoul`

- **类型**：逻辑控制
- **说明**：查询：人设（返回成功与否，接入层转发至 Service）
- **签名**：`soSoul(input: SoSoulInput, output: SoSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/access/SoulAccess.ts:71
- **引用次数**：42

#### `enableSoul`

- **类型**：逻辑控制
- **说明**：界面控制：人设（返回成功与否，接入层转发至 Service）
- **签名**：`enableSoul(input: EnableSoulInput, output: EnableSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/access/SoulAccess.ts:77
- **引用次数**：20

#### `closeSoul`

- **类型**：逻辑控制
- **说明**：删除/清理：人设（返回成功与否，接入层转发至 Service）
- **签名**：`closeSoul(input: CloseSoulInput, output: CloseSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/access/SoulAccess.ts:83
- **引用次数**：20

#### `recordSoulUsage`

- **类型**：逻辑控制
- **说明**：写入/新增：人设 / 用量（返回成功与否，接入层转发至 Service）
- **签名**：`recordSoulUsage(input: RecordSoulUsageInput, output: RecordSoulUsageOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/access/SoulAccess.ts:89
- **引用次数**：20

## 文件 `brian-backend/Base/SoulProvider/application/SoulService.ts`

### SoulService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:44
- **引用次数**：272

### SoulService（私有）

#### `ensureEnabled`

- **类型**：逻辑控制
- **说明**：确保就绪：enabled
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:50
- **引用次数**：118

### SoulService

#### `addSoul`

- **类型**：数据处理
- **说明**：写入/新增：人设（操作关系数据库）
- **签名**：`addSoul(input: AddSoulInput, output: AddSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:63
- **引用次数**：81

#### `delSoul`

- **类型**：数据处理
- **说明**：删除/清理：人设（操作关系数据库）
- **签名**：`delSoul(input: DelSoulInput, output: DelSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:84
- **引用次数**：20

#### `updateSoul`

- **类型**：数据处理
- **说明**：更新：人设（操作关系数据库）
- **签名**：`updateSoul(input: UpdateSoulInput, output: UpdateSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:105
- **引用次数**：24

#### `soSoulById`

- **类型**：数据处理
- **说明**：查询：人设 / 标识（操作关系数据库）
- **签名**：`soSoulById(input: GetSoulInput, output: GetSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:127
- **引用次数**：48

#### `soSoul`

- **类型**：数据处理
- **说明**：查询：人设（操作关系数据库）
- **签名**：`soSoul(input: SoSoulInput, output: SoSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:142
- **引用次数**：42

### SoulService（私有）

#### `soSoulWithUsageSorting`

- **类型**：数据处理
- **说明**：查询：人设 / 用量 / sorting（操作关系数据库）
- **签名**：`soSoulWithUsageSorting(conditions: Condition[] \| undefined, orderBy: OrderBy[], page: Page \| undefined, output: SoSoulOutput): Promise<void>`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:195
- **引用次数**：2

#### `daysAgo`

- **类型**：通用算法
- **说明**：处理 days / ago（纯计算，无外部 IO）
- **签名**：`daysAgo(days: number): string`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:224
- **引用次数**：6

### SoulService

#### `enableSoul`

- **类型**：逻辑控制
- **说明**：界面控制：人设（返回成功与否，异步编排）
- **签名**：`enableSoul(input: EnableSoulInput, _output: EnableSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:239
- **引用次数**：20

#### `closeSoul`

- **类型**：逻辑控制
- **说明**：删除/清理：人设（返回成功与否）
- **签名**：`closeSoul(_input: CloseSoulInput, _output: CloseSoulOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:258
- **引用次数**：20

#### `recordSoulUsage`

- **类型**：数据处理
- **说明**：写入/新增：人设 / 用量（操作关系数据库）
- **签名**：`recordSoulUsage(input: RecordSoulUsageInput, _output: RecordSoulUsageOutput, _context: SoulContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SoulProvider/application/SoulService.ts:271
- **引用次数**：20

## 文件 `brian-backend/Base/SoulProvider/domain/services/SoulDomainService.ts`

### 模块级函数

#### `resolveTargetConditions`

- **类型**：逻辑控制
- **说明**：获取：target / conditions
- **签名**：`resolveTargetConditions(params: { id?: string; ids?: string[]; conditions?: Condition[]; }): Condition[] \| null`
- **位置**：brian-backend/Base/SoulProvider/domain/services/SoulDomainService.ts:18
- **引用次数**：5

#### `buildKeywordConditions`

- **类型**：逻辑控制
- **说明**：构建/初始化：keyword / conditions
- **签名**：`buildKeywordConditions(keyword: string): Condition[]`
- **位置**：brian-backend/Base/SoulProvider/domain/services/SoulDomainService.ts:35
- **引用次数**：3

#### `aggregateUsageStats`

- **类型**：数据处理
- **说明**：计算统计：用量 / stats
- **签名**：`aggregateUsageStats(usageRows: SoulUsageRow[], today: string, sevenDaysAgo: string, thirtyDaysAgo: string): Map<string, SoulUsageStats>`
- **位置**：brian-backend/Base/SoulProvider/domain/services/SoulDomainService.ts:42
- **引用次数**：3

#### `getUsageValue`

- **类型**：数据处理
- **说明**：获取：用量 / 值
- **签名**：`getUsageValue(soul: SoulRecord, field: string, usageMap: Map<string, SoulUsageStats>): number`
- **位置**：brian-backend/Base/SoulProvider/domain/services/SoulDomainService.ts:64
- **引用次数**：6

#### `hasUsageSorting`

- **类型**：通用算法
- **说明**：判断校验：用量 / sorting（纯计算，无外部 IO）
- **签名**：`hasUsageSorting(orderBy: OrderBy[] \| undefined): boolean`
- **位置**：brian-backend/Base/SoulProvider/domain/services/SoulDomainService.ts:85
- **引用次数**：5

#### `sortByOrder`

- **类型**：通用算法
- **说明**：查询：order（纯计算，无外部 IO）
- **签名**：`sortByOrder(souls: SoulRecord[], orderBy: OrderBy[], usageMap: Map<string, SoulUsageStats>): SoulRecord[]`
- **位置**：brian-backend/Base/SoulProvider/domain/services/SoulDomainService.ts:91
- **引用次数**：3

#### `paginate`

- **类型**：通用算法
- **说明**：处理 paginate（纯计算，无外部 IO）
- **签名**：`paginate(items: T[], page: Page \| undefined): T[]`
- **位置**：brian-backend/Base/SoulProvider/domain/services/SoulDomainService.ts:124
- **引用次数**：6

## 文件 `brian-backend/Base/SoulProvider/infrastructure/SoulSchemaInitializer.ts`

### SoulSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/SoulProvider/infrastructure/SoulSchemaInitializer.ts:15
- **引用次数**：99

