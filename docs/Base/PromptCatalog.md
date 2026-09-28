# Base / PromptCatalog

- 层：**Base**　模块：**PromptCatalog**
- 方法数：**11**（逻辑控制 3 · 数据处理 5 · 通用算法 3）

## 文件 `brian-backend/Base/PromptCatalog/access/PromptCatalogAccess.ts`

### PromptCatalogAccess

#### `seed`

- **类型**：逻辑控制
- **说明**：处理 seed（遍历调度，异步编排）
- **签名**：`seed(): Promise<void>`
- **位置**：brian-backend/Base/PromptCatalog/access/PromptCatalogAccess.ts:14
- **引用次数**：33

### PromptCatalogAccess（私有）

#### `seedOne`

- **类型**：数据处理
- **说明**：处理 seed / one（操作关系数据库）
- **签名**：`seedOne(def: BuiltinPromptDef, now: number): Promise<void>`
- **位置**：brian-backend/Base/PromptCatalog/access/PromptCatalogAccess.ts:42
- **引用次数**：2

#### `refreshUnchanged`

- **类型**：数据处理
- **说明**：处理 refresh / unchanged（操作关系数据库）
- **签名**：`refreshUnchanged(existing: Record<string, unknown>, def: BuiltinPromptDef, canonicalHash: string): Promise<void>`
- **位置**：brian-backend/Base/PromptCatalog/access/PromptCatalogAccess.ts:68
- **引用次数**：3

#### `toInsertFields`

- **类型**：数据处理
- **说明**：格式化/序列化：insert / fields
- **签名**：`toInsertFields(def: BuiltinPromptDef, now: number, canonicalHash: string): Array<{ field: string; value: unknown }>`
- **位置**：brian-backend/Base/PromptCatalog/access/PromptCatalogAccess.ts:88
- **引用次数**：2

### 模块级函数

#### `md5`

- **类型**：数据处理
- **说明**：处理 md5（接入层转发至 Service）
- **签名**：`md5(text: string): string`
- **位置**：brian-backend/Base/PromptCatalog/access/PromptCatalogAccess.ts:103
- **引用次数**：5

## 文件 `brian-backend/Base/PromptCatalog/catalog.ts`

### 模块级函数

#### `getBuiltinPrompt`

- **类型**：逻辑控制
- **说明**：获取：builtin / 提示词
- **签名**：`getBuiltinPrompt(id: string): BuiltinPromptDef \| undefined`
- **位置**：brian-backend/Base/PromptCatalog/catalog.ts:527
- **引用次数**：3

#### `getBuiltinTemplate`

- **类型**：逻辑控制
- **说明**：获取：builtin / template
- **签名**：`getBuiltinTemplate(id: string): string \| undefined`
- **位置**：brian-backend/Base/PromptCatalog/catalog.ts:531
- **引用次数**：5

#### `stripEmptyConditionalBlocks`

- **类型**：通用算法
- **说明**：处理 strip / empty / conditional / blocks（纯计算，无外部 IO）
- **签名**：`stripEmptyConditionalBlocks(template: string, variables: Record<string, unknown>): string`
- **位置**：brian-backend/Base/PromptCatalog/catalog.ts:535
- **引用次数**：4

#### `renderTemplate`

- **类型**：通用算法
- **说明**：格式化/序列化：template（纯计算，无外部 IO）
- **签名**：`renderTemplate(template: string, variables: Record<string, unknown>): string`
- **位置**：brian-backend/Base/PromptCatalog/catalog.ts:549
- **引用次数**：7

## 文件 `brian-backend/Base/PromptCatalog/contextFormatter.ts`

### 模块级函数

#### `formatContextCategories`

- **类型**：数据处理
- **说明**：格式化/序列化：上下文 / categories
- **签名**：`formatContextCategories(ctxOut?: ContextOutputLike): string`
- **位置**：brian-backend/Base/PromptCatalog/contextFormatter.ts:80
- **引用次数**：19

#### `formatDynamicContext`

- **类型**：通用算法
- **说明**：格式化/序列化：dynamic / 上下文（纯计算，无外部 IO）
- **签名**：`formatDynamicContext(purpose: string, items?: string[]): string`
- **位置**：brian-backend/Base/PromptCatalog/contextFormatter.ts:137
- **引用次数**：11

