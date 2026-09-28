# Base / RelationDBProvider

- 层：**Base**　模块：**RelationDBProvider**
- 方法数：**53**（逻辑控制 16 · 数据处理 26 · 通用算法 11）

## 文件 `brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts`

### RelationDBAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:51
- **引用次数**：272

#### `insertDB`

- **类型**：逻辑控制
- **说明**：写入/新增：db（返回成功与否，接入层转发至 Service）
- **签名**：`insertDB(input: InsertDBInput, output: InsertDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:60
- **引用次数**：35

#### `deleteDB`

- **类型**：逻辑控制
- **说明**：删除/清理：db（返回成功与否，接入层转发至 Service）
- **签名**：`deleteDB(input: DeleteDBInput, output: DeleteDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:66
- **引用次数**：12

#### `updateDB`

- **类型**：逻辑控制
- **说明**：更新：db（返回成功与否，接入层转发至 Service）
- **签名**：`updateDB(input: UpdateDBInput, output: UpdateDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:72
- **引用次数**：17

#### `selectDB`

- **类型**：逻辑控制
- **说明**：界面控制：db（返回成功与否，接入层转发至 Service）
- **签名**：`selectDB(input: SelectDBInput, output: SelectDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:78
- **引用次数**：45

#### `selectOneDB`

- **类型**：逻辑控制
- **说明**：界面控制：one / db（返回成功与否，接入层转发至 Service）
- **签名**：`selectOneDB(input: SelectOneDBInput, output: SelectOneDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:84
- **引用次数**：36

#### `countDB`

- **类型**：逻辑控制
- **说明**：计算统计：db（返回成功与否，接入层转发至 Service）
- **签名**：`countDB(input: CountDBInput, output: CountDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:90
- **引用次数**：20

#### `transactionDB`

- **类型**：逻辑控制
- **说明**：处理 事务 / db（返回成功与否，接入层转发至 Service）
- **签名**：`transactionDB(input: TransactionDBInput, output: TransactionDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:96
- **引用次数**：13

#### `visualizedDB`

- **类型**：逻辑控制
- **说明**：处理 visualized / db（返回成功与否，接入层转发至 Service）
- **签名**：`visualizedDB(input: VisualizedDBInput, output: VisualizedDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:106
- **引用次数**：9

#### `enableDB`

- **类型**：逻辑控制
- **说明**：界面控制：db（返回成功与否，接入层转发至 Service）
- **签名**：`enableDB(input: EnableDBInput, output: EnableDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:112
- **引用次数**：13

#### `closeDB`

- **类型**：逻辑控制
- **说明**：删除/清理：db（返回成功与否，接入层转发至 Service）
- **签名**：`closeDB(input: CloseDBInput, output: CloseDBOutput, context: DBContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:118
- **引用次数**：36

#### `selectOne`

- **类型**：数据处理
- **说明**：界面控制：one
- **签名**：`selectOne(table: string, conditions: Condition[]): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:128
- **引用次数**：173

#### `select`

- **类型**：数据处理
- **说明**：界面控制相关数据
- **签名**：`select(table: string, options?: { conditions?: Condition[]; order_by?: import('../../shared/query').OrderBy[]; page?: import('../../shared/query').Page; fields?: string[]; }): Promise<Array<Record<string, unknown>>>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:142
- **引用次数**：289

#### `insert`

- **类型**：数据处理
- **说明**：写入/新增相关数据
- **签名**：`insert(table: string, data: Array<{ field: string; value: unknown }>): Promise<number>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:168
- **引用次数**：221

#### `update`

- **类型**：数据处理
- **说明**：更新相关数据
- **签名**：`update(table: string, data: Array<{ field: string; value: unknown }>, conditions: Condition[]): Promise<number>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:178
- **引用次数**：205

#### `delete`

- **类型**：数据处理
- **说明**：删除/清理相关数据
- **签名**：`delete(table: string, conditions?: Condition[]): Promise<number>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:193
- **引用次数**：186

#### `count`

- **类型**：通用算法
- **说明**：计算统计相关数据（纯计算，无外部 IO）
- **签名**：`count(table: string, conditions?: Condition[]): Promise<number>`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:203
- **引用次数**：366

#### `executeRaw`

- **类型**：数据处理
- **说明**：处理执行：raw（操作关系数据库，接入层转发至 Service）
- **签名**：`executeRaw(sql: string, params?: unknown[]): number`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:211
- **引用次数**：344

#### `queryRaw`

- **类型**：数据处理
- **说明**：查询：raw（操作关系数据库，接入层转发至 Service）
- **签名**：`queryRaw(sql: string, params?: unknown[]): T[]`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:217
- **引用次数**：247

#### `transactionRaw`

- **类型**：逻辑控制
- **说明**：处理 事务 / raw（接入层转发至 Service）
- **签名**：`transactionRaw(operations: import('../../shared/query').Operation[]): boolean`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:226
- **引用次数**：5

#### `walCheckpoint`

- **类型**：逻辑控制
- **说明**：处理 wal / checkpoint（接入层转发至 Service）
- **签名**：`walCheckpoint(mode: 'PASSIVE' \| 'FULL' \| 'RESTART' \| 'TRUNCATE'): { busy: boolean; log: number; checkpointed: number }`
- **位置**：brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts:232
- **引用次数**：6

## 文件 `brian-backend/Base/RelationDBProvider/application/RelationDBService.ts`

### RelationDBService

#### `initialize`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:50
- **引用次数**：272

### RelationDBService（私有）

#### `ensureEnabled`

- **类型**：逻辑控制
- **说明**：确保就绪：enabled
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:80
- **引用次数**：118

### RelationDBService

#### `insertDB`

- **类型**：数据处理
- **说明**：写入/新增：db
- **签名**：`insertDB(input: InsertDBInput, output: InsertDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:95
- **引用次数**：35

#### `deleteDB`

- **类型**：数据处理
- **说明**：删除/清理：db
- **签名**：`deleteDB(input: DeleteDBInput, output: DeleteDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:104
- **引用次数**：12

#### `updateDB`

- **类型**：数据处理
- **说明**：更新：db
- **签名**：`updateDB(input: UpdateDBInput, output: UpdateDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:113
- **引用次数**：17

#### `selectDB`

- **类型**：数据处理
- **说明**：界面控制：db
- **签名**：`selectDB(input: SelectDBInput, output: SelectDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:126
- **引用次数**：45

#### `selectOneDB`

- **类型**：数据处理
- **说明**：界面控制：one / db
- **签名**：`selectOneDB(input: SelectOneDBInput, output: SelectOneDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:140
- **引用次数**：36

#### `countDB`

- **类型**：通用算法
- **说明**：计算统计：db（纯计算，无外部 IO）
- **签名**：`countDB(input: CountDBInput, output: CountDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:149
- **引用次数**：20

#### `transactionDB`

- **类型**：逻辑控制
- **说明**：处理 事务 / db（返回成功与否）
- **签名**：`transactionDB(input: TransactionDBInput, output: TransactionDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:158
- **引用次数**：13

#### `visualizedDB`

- **类型**：数据处理
- **说明**：处理 visualized / db（操作关系数据库）
- **签名**：`visualizedDB(input: VisualizedDBInput, output: VisualizedDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:175
- **引用次数**：9

#### `enableDB`

- **类型**：数据处理
- **说明**：界面控制：db（操作关系数据库）
- **签名**：`enableDB(input: EnableDBInput, _output: EnableDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:210
- **引用次数**：13

#### `closeDB`

- **类型**：逻辑控制
- **说明**：删除/清理：db（返回成功与否）
- **签名**：`closeDB(_input: CloseDBInput, _output: CloseDBOutput, _context: DBContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/RelationDBProvider/application/RelationDBService.ts:231
- **引用次数**：36

## 文件 `brian-backend/Base/RelationDBProvider/infrastructure/SqlBuilder.ts`

### SqlBuilder（静态）

#### `buildWhere`

- **类型**：通用算法
- **说明**：构建/初始化：where（纯计算，无外部 IO）
- **签名**：`buildWhere(conditions?: Condition[]): WhereClause`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SqlBuilder.ts:19
- **引用次数**：20

### SqlBuilder（静态）（私有）

#### `buildConditionFragment`

- **类型**：通用算法
- **说明**：构建/初始化：condition / fragment（纯计算，无外部 IO）
- **签名**：`buildConditionFragment(cond: Condition): WhereClause`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SqlBuilder.ts:42
- **引用次数**：2

### SqlBuilder（静态）

#### `buildOrderBy`

- **类型**：通用算法
- **说明**：构建/初始化：order（纯计算，无外部 IO）
- **签名**：`buildOrderBy(order_by?: OrderBy[]): string`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SqlBuilder.ts:100
- **引用次数**：10

#### `buildLimit`

- **类型**：通用算法
- **说明**：构建/初始化：限额（纯计算，无外部 IO）
- **签名**：`buildLimit(page?: Page): { sql: string; params: number[] }`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SqlBuilder.ts:116
- **引用次数**：5

#### `buildInsert`

- **类型**：数据处理
- **说明**：构建/初始化：insert
- **签名**：`buildInsert(table: string, data: DataObject[]): { sql: string; params: unknown[] }`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SqlBuilder.ts:126
- **引用次数**：4

#### `buildSet`

- **类型**：通用算法
- **说明**：构建/初始化：set（纯计算，无外部 IO）
- **签名**：`buildSet(data: DataObject[]): { sql: string; params: unknown[] }`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SqlBuilder.ts:140
- **引用次数**：4

#### `buildFields`

- **类型**：通用算法
- **说明**：构建/初始化：fields（纯计算，无外部 IO）
- **签名**：`buildFields(fields?: string[]): string`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SqlBuilder.ts:148
- **引用次数**：6

#### `buildGroupBy`

- **类型**：通用算法
- **说明**：构建/初始化：group（纯计算，无外部 IO）
- **签名**：`buildGroupBy(group_by?: string[]): string`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SqlBuilder.ts:157
- **引用次数**：5

### SqlBuilder（静态）（私有）

#### `quoteIdentifier`

- **类型**：通用算法
- **说明**：处理 quote / identifier（纯计算，无外部 IO）
- **签名**：`quoteIdentifier(name: string): string`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SqlBuilder.ts:166
- **引用次数**：9

## 文件 `brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts`

### SQLiteRelationDBRepository（私有）

#### `ensureConfigTable`

- **类型**：数据处理
- **说明**：确保就绪：配置 / 数据表（操作关系数据库）
- **签名**：`ensureConfigTable(): void`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts:40
- **引用次数**：2

### SQLiteRelationDBRepository

#### `insert`

- **类型**：数据处理
- **说明**：写入/新增相关数据
- **签名**：`insert(table: string, data: DataObject[]): number`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts:52
- **引用次数**：221

#### `delete`

- **类型**：数据处理
- **说明**：删除/清理相关数据
- **签名**：`delete(table: string, conditions?: Condition[]): number`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts:61
- **引用次数**：186

#### `update`

- **类型**：数据处理
- **说明**：更新相关数据
- **签名**：`update(table: string, data: DataObject[], conditions?: Condition[]): number`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts:68
- **引用次数**：205

#### `select`

- **类型**：数据处理
- **说明**：界面控制相关数据
- **签名**：`select(queryParam: QueryParam): Array<Record<string, unknown>>`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts:82
- **引用次数**：289

#### `selectOne`

- **类型**：数据处理
- **说明**：界面控制：one
- **签名**：`selectOne(queryParam: QueryParam): Record<string, unknown> \| null`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts:109
- **引用次数**：173

#### `count`

- **类型**：数据处理
- **说明**：计算统计相关数据
- **签名**：`count(table: string, conditions?: Condition[]): number`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts:118
- **引用次数**：366

#### `transaction`

- **类型**：数据处理
- **说明**：处理 事务
- **签名**：`transaction(operations: Operation[]): boolean`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts:129
- **引用次数**：8

#### `executeRaw`

- **类型**：数据处理
- **说明**：处理执行：raw
- **签名**：`executeRaw(sql: string, params?: unknown[]): number`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts:174
- **引用次数**：344

#### `queryRaw`

- **类型**：数据处理
- **说明**：查询：raw
- **签名**：`queryRaw(sql: string, params?: unknown[]): T[]`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts:179
- **引用次数**：247

### SQLiteRelationDBRepository（私有）

#### `quote`

- **类型**：通用算法
- **说明**：处理 quote（纯计算，无外部 IO）
- **签名**：`quote(name: string): string`
- **位置**：brian-backend/Base/RelationDBProvider/infrastructure/SQLiteRelationDBRepository.ts:187
- **引用次数**：13

