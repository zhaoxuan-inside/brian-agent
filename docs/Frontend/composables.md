# Frontend / composables

- 层：**Frontend**　模块：**composables**
- 方法数：**19**（逻辑控制 1 · 数据处理 13 · 通用算法 5）

## 文件 `brian-frontend/src/composables/chatStreamEvents.ts`

### 模块级函数

#### `formatAgentTitle`

- **类型**：通用算法
- **说明**：格式化/序列化：Agent / title（纯计算，无外部 IO）
- **签名**：`formatAgentTitle(rawName?: string, agId?: string, agType?: string): string`
- **位置**：brian-frontend/src/composables/chatStreamEvents.ts:30
- **引用次数**：2

#### `normalizeToolPayload`

- **类型**：数据处理
- **说明**：转换归并：工具 / payload（反序列化）
- **签名**：`normalizeToolPayload(payload: Record<string, unknown>): { toolName: string params: Record<string, unknown> partId: string }`
- **位置**：brian-frontend/src/composables/chatStreamEvents.ts:43
- **引用次数**：4

#### `createChatStreamEventHandler`

- **类型**：数据处理
- **说明**：写入/新增：chat / 流 / 事件 / handler（序列化输出）
- **签名**：`createChatStreamEventHandler(chat: ChatStore, ui: ChatUiStore): ChatStreamEventHandler`
- **位置**：brian-frontend/src/composables/chatStreamEvents.ts:67
- **引用次数**：3

## 文件 `brian-frontend/src/composables/useChatMap.ts`

### 模块级函数

#### `useChatMap`

- **类型**：数据处理
- **说明**：处理 chat / map
- **签名**：`useChatMap()`
- **位置**：brian-frontend/src/composables/useChatMap.ts:12
- **引用次数**：4

## 文件 `brian-frontend/src/composables/useChatStream.ts`

### 模块级函数

#### `useChatStream`

- **类型**：数据处理
- **说明**：处理 chat / 流（网络请求，序列化输出）
- **签名**：`useChatStream()`
- **位置**：brian-frontend/src/composables/useChatStream.ts:22
- **引用次数**：4

## 文件 `brian-frontend/src/composables/useCountUp.ts`

### 模块级函数

#### `useCountUp`

- **类型**：通用算法
- **说明**：处理 数量 / up（纯计算，无外部 IO）
- **签名**：`useCountUp(target: number, suffix: unknown, durationMs: unknown)`
- **位置**：brian-frontend/src/composables/useCountUp.ts:3
- **引用次数**：4

## 文件 `brian-frontend/src/composables/useHistoryTab.ts`

### 模块级函数

#### `useHistoryTab`

- **类型**：数据处理
- **说明**：处理 历史 / 标签页
- **签名**：`useHistoryTab()`
- **位置**：brian-frontend/src/composables/useHistoryTab.ts:11
- **引用次数**：8

## 文件 `brian-frontend/src/composables/useLibraryTab.ts`

### 模块级函数

#### `normalizeForFuzzy`

- **类型**：通用算法
- **说明**：转换归并：fuzzy（纯计算，无外部 IO）
- **签名**：`normalizeForFuzzy(s: string): { text: string; map: number[] }`
- **位置**：brian-frontend/src/composables/useLibraryTab.ts:18
- **引用次数**：3

#### `fuzzyLocate`

- **类型**：数据处理
- **说明**：处理 fuzzy / locate
- **签名**：`fuzzyLocate(full: string, needle: string): { start: number; end: number } \| null`
- **位置**：brian-frontend/src/composables/useLibraryTab.ts:31
- **引用次数**：2

#### `useLibraryTab`

- **类型**：数据处理
- **说明**：处理 library / 标签页
- **签名**：`useLibraryTab()`
- **位置**：brian-frontend/src/composables/useLibraryTab.ts:80
- **引用次数**：9

## 文件 `brian-frontend/src/composables/useMemoryTab.ts`

### 模块级函数

#### `useMemoryTab`

- **类型**：数据处理
- **说明**：处理 记忆 / 标签页
- **签名**：`useMemoryTab()`
- **位置**：brian-frontend/src/composables/useMemoryTab.ts:8
- **引用次数**：8

## 文件 `brian-frontend/src/composables/useOnceVisible.ts`

### 模块级函数

#### `useOnceVisible`

- **类型**：通用算法
- **说明**：处理 once / visible（纯计算，无外部 IO）
- **签名**：`useOnceVisible(target: Ref<Element \| null>, cb: () => void, threshold: unknown)`
- **位置**：brian-frontend/src/composables/useOnceVisible.ts:3
- **引用次数**：16

## 文件 `brian-frontend/src/composables/useProfileTab.ts`

### 模块级函数

#### `useProfileTab`

- **类型**：数据处理
- **说明**：处理 画像 / 标签页（序列化输出）
- **签名**：`useProfileTab()`
- **位置**：brian-frontend/src/composables/useProfileTab.ts:5
- **引用次数**：8

## 文件 `brian-frontend/src/composables/useRevealOnScroll.ts`

### vReveal

#### `vReveal.mounted`

- **类型**：逻辑控制
- **说明**：处理 v / reveal.mounted（遍历调度）
- **签名**：`vReveal.mounted(el: unknown, binding: unknown)`
- **位置**：brian-frontend/src/composables/useRevealOnScroll.ts:8
- **引用次数**：0

#### `vReveal.unmounted`

- **类型**：数据处理
- **说明**：处理 v / reveal.unmounted
- **签名**：`vReveal.unmounted(el: unknown)`
- **位置**：brian-frontend/src/composables/useRevealOnScroll.ts:28
- **引用次数**：0

## 文件 `brian-frontend/src/composables/useSSE.ts`

### 模块级函数

#### `readSSE`

- **类型**：数据处理
- **说明**：获取：sse（反序列化）
- **签名**：`readSSE(res: Response, onData: (data: unknown) => void): Promise<void>`
- **位置**：brian-frontend/src/composables/useSSE.ts:1
- **引用次数**：3

## 文件 `brian-frontend/src/composables/useTagGraphTab.ts`

### 模块级函数

#### `createGraphState`

- **类型**：数据处理
- **说明**：写入/新增：图 / state
- **签名**：`createGraphState(kind: 'tag' \| 'keyword', io: GraphStateIO)`
- **位置**：brian-frontend/src/composables/useTagGraphTab.ts:28
- **引用次数**：4

#### `useTagGraphTab`

- **类型**：数据处理
- **说明**：处理 标签 / 图 / 标签页（浏览器本地存储）
- **签名**：`useTagGraphTab({ activeTab, closeContextMenu, loadHistory, loadMemory, loadAllDateCounts, loadLibraries, loadProfile, onMemoryScroll, startDateCountRefresh, stopDateCountRefresh }: TagGraphTabDeps)`
- **位置**：brian-frontend/src/composables/useTagGraphTab.ts:237
- **引用次数**：8

## 文件 `brian-frontend/src/composables/useTypewriter.ts`

### 模块级函数

#### `useTypewriter`

- **类型**：通用算法
- **说明**：处理 typewriter（纯计算，无外部 IO）
- **签名**：`useTypewriter(lines: TypeLine[], holdMs: unknown)`
- **位置**：brian-frontend/src/composables/useTypewriter.ts:8
- **引用次数**：4

