# Base / ChunkProvider

- 层：**Base**　模块：**ChunkProvider**
- 方法数：**12**（逻辑控制 6 · 数据处理 0 · 通用算法 6）

## 文件 `brian-backend/Base/ChunkProvider/access/ChunkAccess.ts`

### ChunkAccess

#### `chunkText`

- **类型**：逻辑控制
- **说明**：转换归并：文本（返回成功与否，接入层转发至 Service）
- **签名**：`chunkText(input: ChunkTextInput, output: ChunkTextOutput, context: ChunkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ChunkProvider/access/ChunkAccess.ts:21
- **引用次数**：4

#### `chunkFile`

- **类型**：逻辑控制
- **说明**：转换归并：文件（返回成功与否，接入层转发至 Service）
- **签名**：`chunkFile(input: ChunkFileInput, output: ChunkFileOutput, context: ChunkContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ChunkProvider/access/ChunkAccess.ts:26
- **引用次数**：3

## 文件 `brian-backend/Base/ChunkProvider/application/ChunkService.ts`

### ChunkService

#### `chunkText`

- **类型**：逻辑控制
- **说明**：转换归并：文本（返回成功与否）
- **签名**：`chunkText(input: ChunkTextInput, output: ChunkTextOutput, _context: ChunkContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ChunkProvider/application/ChunkService.ts:28
- **引用次数**：4

#### `chunkFile`

- **类型**：通用算法
- **说明**：转换归并：文件（纯计算，无外部 IO）
- **签名**：`chunkFile(input: ChunkFileInput, output: ChunkFileOutput, _context: ChunkContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/ChunkProvider/application/ChunkService.ts:40
- **引用次数**：3

### ChunkService（私有）

#### `slidingWindow`

- **类型**：通用算法
- **说明**：处理 sliding / 窗口（纯计算，无外部 IO）
- **签名**：`slidingWindow(text: string, config: ChunkConfig, baseIdx: unknown, keepLast: unknown): ChunkResult[]`
- **位置**：brian-backend/Base/ChunkProvider/application/ChunkService.ts:97
- **引用次数**：4

#### `mergeConfig`

- **类型**：逻辑控制
- **说明**：转换归并：配置
- **签名**：`mergeConfig(partial?: ChunkConfig): ChunkConfig`
- **位置**：brian-backend/Base/ChunkProvider/application/ChunkService.ts:136
- **引用次数**：3

## 文件 `brian-backend/Base/ChunkProvider/application/RecursiveTextSplitter.ts`

### RecursiveTextSplitter（静态）

#### `splitText`

- **类型**：逻辑控制
- **说明**：转换归并：文本
- **签名**：`splitText(text: string, options: RecursiveSplitOptions): string[]`
- **位置**：brian-backend/Base/ChunkProvider/application/RecursiveTextSplitter.ts:69
- **引用次数**：16

### RecursiveTextSplitter

#### `splitText`

- **类型**：逻辑控制
- **说明**：转换归并：文本
- **签名**：`splitText(text: string): string[]`
- **位置**：brian-backend/Base/ChunkProvider/application/RecursiveTextSplitter.ts:74
- **引用次数**：16

### RecursiveTextSplitter（私有）

#### `splitTextRecursive`

- **类型**：通用算法
- **说明**：转换归并：文本 / recursive（纯计算，无外部 IO）
- **签名**：`splitTextRecursive(text: string, separators: string[]): string[]`
- **位置**：brian-backend/Base/ChunkProvider/application/RecursiveTextSplitter.ts:83
- **引用次数**：3

#### `splitWithSeparator`

- **类型**：通用算法
- **说明**：转换归并：separator（纯计算，无外部 IO）
- **签名**：`splitWithSeparator(text: string, separator: string): string[]`
- **位置**：brian-backend/Base/ChunkProvider/application/RecursiveTextSplitter.ts:131
- **引用次数**：2

#### `mergeSplits`

- **类型**：通用算法
- **说明**：转换归并：splits（纯计算，无外部 IO）
- **签名**：`mergeSplits(splits: string[], separator: string): string[]`
- **位置**：brian-backend/Base/ChunkProvider/application/RecursiveTextSplitter.ts:154
- **引用次数**：3

#### `joinDocs`

- **类型**：通用算法
- **说明**：转换归并：docs（纯计算，无外部 IO）
- **签名**：`joinDocs(docs: string[], separator: string): string \| null`
- **位置**：brian-backend/Base/ChunkProvider/application/RecursiveTextSplitter.ts:189
- **引用次数**：3

