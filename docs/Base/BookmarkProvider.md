# Base / BookmarkProvider

- 层：**Base**　模块：**BookmarkProvider**
- 方法数：**19**（逻辑控制 9 · 数据处理 10 · 通用算法 0）

## 文件 `brian-backend/Base/BookmarkProvider/access/BookmarkAccess.ts`

### BookmarkAccess

#### `soTree`

- **类型**：逻辑控制
- **说明**：查询：树形结构（返回成功与否，接入层转发至 Service）
- **签名**：`soTree(input: SoTreeInput, output: SoTreeOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/access/BookmarkAccess.ts:28
- **引用次数**：4

#### `soFlatFolders`

- **类型**：逻辑控制
- **说明**：查询：flat / folders（返回成功与否，接入层转发至 Service）
- **签名**：`soFlatFolders(input: SoFlatFoldersInput, output: SoFlatFoldersOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/access/BookmarkAccess.ts:32
- **引用次数**：4

#### `addFolder`

- **类型**：逻辑控制
- **说明**：写入/新增：文件夹（返回成功与否，接入层转发至 Service）
- **签名**：`addFolder(input: AddFolderInput, output: AddFolderOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/access/BookmarkAccess.ts:36
- **引用次数**：4

#### `addItem`

- **类型**：逻辑控制
- **说明**：写入/新增：条目（返回成功与否，接入层转发至 Service）
- **签名**：`addItem(input: AddItemInput, output: AddItemOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/access/BookmarkAccess.ts:40
- **引用次数**：4

#### `updateFolder`

- **类型**：逻辑控制
- **说明**：更新：文件夹（返回成功与否，接入层转发至 Service）
- **签名**：`updateFolder(input: UpdateFolderInput, output: UpdateFolderOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/access/BookmarkAccess.ts:44
- **引用次数**：5

#### `updateItem`

- **类型**：逻辑控制
- **说明**：更新：条目（返回成功与否，接入层转发至 Service）
- **签名**：`updateItem(input: UpdateItemInput, output: UpdateItemOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/access/BookmarkAccess.ts:48
- **引用次数**：5

#### `delFolder`

- **类型**：逻辑控制
- **说明**：删除/清理：文件夹（返回成功与否，接入层转发至 Service）
- **签名**：`delFolder(input: DelFolderInput, output: DelFolderOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/access/BookmarkAccess.ts:52
- **引用次数**：5

#### `delItem`

- **类型**：逻辑控制
- **说明**：删除/清理：条目（返回成功与否，接入层转发至 Service）
- **签名**：`delItem(input: DelItemInput, output: DelItemOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/access/BookmarkAccess.ts:56
- **引用次数**：4

#### `moveItem`

- **类型**：逻辑控制
- **说明**：更新：条目（返回成功与否，接入层转发至 Service）
- **签名**：`moveItem(input: MoveItemInput, output: MoveItemOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/access/BookmarkAccess.ts:60
- **引用次数**：5

## 文件 `brian-backend/Base/BookmarkProvider/application/BookmarkService.ts`

### BookmarkService

#### `soTree`

- **类型**：数据处理
- **说明**：查询：树形结构（操作关系数据库）
- **签名**：`soTree(_input: SoTreeInput, output: SoTreeOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/application/BookmarkService.ts:23
- **引用次数**：4

#### `soFlatFolders`

- **类型**：数据处理
- **说明**：查询：flat / folders（操作关系数据库）
- **签名**：`soFlatFolders(_input: SoFlatFoldersInput, output: SoFlatFoldersOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/application/BookmarkService.ts:54
- **引用次数**：4

#### `addFolder`

- **类型**：数据处理
- **说明**：写入/新增：文件夹（操作关系数据库）
- **签名**：`addFolder(input: AddFolderInput, output: AddFolderOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/application/BookmarkService.ts:62
- **引用次数**：4

#### `addItem`

- **类型**：数据处理
- **说明**：写入/新增：条目（操作关系数据库）
- **签名**：`addItem(input: AddItemInput, output: AddItemOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/application/BookmarkService.ts:84
- **引用次数**：4

#### `updateFolder`

- **类型**：数据处理
- **说明**：更新：文件夹（操作关系数据库）
- **签名**：`updateFolder(input: UpdateFolderInput, _output: UpdateFolderOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/application/BookmarkService.ts:110
- **引用次数**：5

#### `updateItem`

- **类型**：数据处理
- **说明**：更新：条目（操作关系数据库）
- **签名**：`updateItem(input: UpdateItemInput, _output: UpdateItemOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/application/BookmarkService.ts:122
- **引用次数**：5

#### `delFolder`

- **类型**：数据处理
- **说明**：删除/清理：文件夹（操作关系数据库）
- **签名**：`delFolder(input: DelFolderInput, _output: DelFolderOutput, context: BookmarkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/application/BookmarkService.ts:135
- **引用次数**：5

#### `delItem`

- **类型**：数据处理
- **说明**：删除/清理：条目（操作关系数据库）
- **签名**：`delItem(input: DelItemInput, _output: DelItemOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/application/BookmarkService.ts:157
- **引用次数**：4

#### `moveItem`

- **类型**：数据处理
- **说明**：更新：条目（操作关系数据库）
- **签名**：`moveItem(input: MoveItemInput, _output: MoveItemOutput, _context: BookmarkContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/BookmarkProvider/application/BookmarkService.ts:164
- **引用次数**：5

## 文件 `brian-backend/Base/BookmarkProvider/infrastructure/BookmarkSchemaInitializer.ts`

### BookmarkSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/BookmarkProvider/infrastructure/BookmarkSchemaInitializer.ts:7
- **引用次数**：99

