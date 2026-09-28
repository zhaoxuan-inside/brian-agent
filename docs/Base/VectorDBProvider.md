# Base / VectorDBProvider

- 层：**Base**　模块：**VectorDBProvider**
- 方法数：**30**（逻辑控制 10 · 数据处理 20 · 通用算法 0）

## 文件 `brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts`

### VectorDBAccess

#### `initialize`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库，向量库）
- **签名**：`initialize(dimension?: number): Promise<void>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:79
- **引用次数**：272

#### `soVectorCount`

- **类型**：数据处理
- **说明**：查询：向量 / 数量（向量库，接入层转发至 Service）
- **签名**：`soVectorCount(): Promise<number>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:110
- **引用次数**：3

#### `getMetric`

- **类型**：数据处理
- **说明**：获取：metric（向量库，接入层转发至 Service）
- **签名**：`getMetric(): string`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:115
- **引用次数**：8

#### `getDimension`

- **类型**：数据处理
- **说明**：获取：dimension（向量库，接入层转发至 Service）
- **签名**：`getDimension(): number`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:120
- **引用次数**：7

#### `applyDimension`

- **类型**：数据处理
- **说明**：更新：dimension（向量库）
- **签名**：`applyDimension(dimension: number): Promise<void>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:126
- **引用次数**：8

#### `applyMetric`

- **类型**：数据处理
- **说明**：更新：metric（向量库）
- **签名**：`applyMetric(metric: string): Promise<void>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:140
- **引用次数**：9

#### `addVector`

- **类型**：逻辑控制
- **说明**：写入/新增：向量（返回成功与否，接入层转发至 Service）
- **签名**：`addVector(input: AddVectorInput, output: AddVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:152
- **引用次数**：9

#### `delVector`

- **类型**：逻辑控制
- **说明**：删除/清理：向量（返回成功与否，接入层转发至 Service）
- **签名**：`delVector(input: DelVectorInput, output: DelVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:158
- **引用次数**：4

#### `delVectorByFilter`

- **类型**：逻辑控制
- **说明**：删除/清理：向量 / 过滤器（返回成功与否，接入层转发至 Service）
- **签名**：`delVectorByFilter(input: DelVectorByFilterInput, output: DelVectorByFilterOutput, context: VectorContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:164
- **引用次数**：4

#### `soVector`

- **类型**：逻辑控制
- **说明**：查询：向量（返回成功与否，接入层转发至 Service）
- **签名**：`soVector(input: SoVectorInput, output: SoVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:170
- **引用次数**：6

#### `soVectorById`

- **类型**：逻辑控制
- **说明**：查询：向量 / 标识（返回成功与否，接入层转发至 Service）
- **签名**：`soVectorById(input: GetVectorInput, output: GetVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:176
- **引用次数**：5

#### `countVector`

- **类型**：逻辑控制
- **说明**：计算统计：向量（返回成功与否，接入层转发至 Service）
- **签名**：`countVector(input: CountVectorInput, output: CountVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:182
- **引用次数**：4

#### `visualizedVector`

- **类型**：逻辑控制
- **说明**：处理 visualized / 向量（返回成功与否，接入层转发至 Service）
- **签名**：`visualizedVector(input: VisualizedVectorInput, output: VisualizedVectorOutput, context: VectorContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:188
- **引用次数**：6

#### `enableVectorDB`

- **类型**：逻辑控制
- **说明**：界面控制：向量 / db（返回成功与否，接入层转发至 Service）
- **签名**：`enableVectorDB(input: EnableVectorDBInput, output: EnableVectorDBOutput, context: VectorContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:194
- **引用次数**：8

#### `closeVectorDB`

- **类型**：逻辑控制
- **说明**：删除/清理：向量 / db（返回成功与否，接入层转发至 Service）
- **签名**：`closeVectorDB(input: CloseVectorDBInput, output: CloseVectorDBOutput, context: VectorContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts:200
- **引用次数**：6

## 文件 `brian-backend/Base/VectorDBProvider/application/VectorDBService.ts`

### VectorDBService

#### `initializeConfig`

- **类型**：数据处理
- **说明**：构建/初始化：配置（向量库）
- **签名**：`initializeConfig(): Promise<void>`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:57
- **引用次数**：3

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:88
- **引用次数**：272

#### `getStoredMetric`

- **类型**：数据处理
- **说明**：获取：stored / metric（操作关系数据库，向量库）
- **签名**：`getStoredMetric(): string \| null`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:92
- **引用次数**：2

### VectorDBService（私有）

#### `ensureEnabled`

- **类型**：数据处理
- **说明**：确保就绪：enabled（向量库）
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:107
- **引用次数**：118

#### `validateVector`

- **类型**：数据处理
- **说明**：判断校验：向量（向量库）
- **签名**：`validateVector(vec: VectorObject): void`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:118
- **引用次数**：2

### VectorDBService

#### `addVector`

- **类型**：数据处理
- **说明**：写入/新增：向量（向量库）
- **签名**：`addVector(input: AddVectorInput, output: AddVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:131
- **引用次数**：9

#### `delVector`

- **类型**：数据处理
- **说明**：删除/清理：向量（向量库）
- **签名**：`delVector(input: DelVectorInput, output: DelVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:162
- **引用次数**：4

#### `delVectorByFilter`

- **类型**：数据处理
- **说明**：删除/清理：向量 / 过滤器（向量库）
- **签名**：`delVectorByFilter(input: DelVectorByFilterInput, output: DelVectorByFilterOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:174
- **引用次数**：4

#### `soVector`

- **类型**：数据处理
- **说明**：查询：向量（向量库）
- **签名**：`soVector(input: SoVectorInput, output: SoVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:186
- **引用次数**：6

#### `soVectorById`

- **类型**：数据处理
- **说明**：查询：向量 / 标识（向量库）
- **签名**：`soVectorById(input: GetVectorInput, output: GetVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:241
- **引用次数**：5

#### `countVector`

- **类型**：数据处理
- **说明**：计算统计：向量（向量库）
- **签名**：`countVector(input: CountVectorInput, output: CountVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:253
- **引用次数**：4

#### `visualizedVector`

- **类型**：数据处理
- **说明**：处理 visualized / 向量（操作关系数据库，向量库）
- **签名**：`visualizedVector(input: VisualizedVectorInput, output: VisualizedVectorOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:264
- **引用次数**：6

#### `enableVectorDB`

- **类型**：数据处理
- **说明**：界面控制：向量 / db（向量库）
- **签名**：`enableVectorDB(input: EnableVectorDBInput, _output: EnableVectorDBOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:311
- **引用次数**：8

#### `closeVectorDB`

- **类型**：数据处理
- **说明**：删除/清理：向量 / db（向量库）
- **签名**：`closeVectorDB(_input: CloseVectorDBInput, _output: CloseVectorDBOutput, _context: VectorContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/VectorDBProvider/application/VectorDBService.ts:328
- **引用次数**：6

## 文件 `brian-backend/Base/VectorDBProvider/infrastructure/VectorDBSchemaInitializer.ts`

### VectorDBSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库，向量库）
- **签名**：`init(dimension: number, metric: string): Promise<void>`
- **位置**：brian-backend/Base/VectorDBProvider/infrastructure/VectorDBSchemaInitializer.ts:15
- **引用次数**：99

