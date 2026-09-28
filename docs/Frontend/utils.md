# Frontend / utils

- 层：**Frontend**　模块：**utils**
- 方法数：**45**（逻辑控制 13 · 数据处理 7 · 通用算法 25）

## 文件 `brian-frontend/src/utils/cardChipLayout.ts`

### 模块级函数

#### `chipWidthOf`

- **类型**：通用算法
- **说明**：处理 chip / width（纯计算，无外部 IO）
- **签名**：`chipWidthOf(label: string): number`
- **位置**：brian-frontend/src/utils/cardChipLayout.ts:14
- **引用次数**：2

#### `layoutChipsInCard`

- **类型**：逻辑控制
- **说明**：渲染绘制：chips / card（遍历调度）
- **签名**：`layoutChipsInCard(chips: ChipLike[], card: { x: number; y: number; w: number; h: number }): LaidChip[]`
- **位置**：brian-frontend/src/utils/cardChipLayout.ts:25
- **引用次数**：5

## 文件 `brian-frontend/src/utils/chatMapGeometry.ts`

### 模块级函数

#### `edgeKey`

- **类型**：逻辑控制
- **说明**：处理 连线 / 键
- **签名**：`edgeKey(e: EdgeRef): string`
- **位置**：brian-frontend/src/utils/chatMapGeometry.ts:16
- **引用次数**：7

#### `isVerticalEdge`

- **类型**：逻辑控制
- **说明**：判断校验：vertical / 连线
- **签名**：`isVerticalEdge(e: EdgeRef): boolean`
- **位置**：brian-frontend/src/utils/chatMapGeometry.ts:20
- **引用次数**：3

#### `verticalEdgePath`

- **类型**：通用算法
- **说明**：处理 vertical / 连线 / 路径（纯计算，无外部 IO）
- **签名**：`verticalEdgePath(s: Pos, t: Pos): string`
- **位置**：brian-frontend/src/utils/chatMapGeometry.ts:24
- **引用次数**：2

#### `citationEdgePath`

- **类型**：通用算法
- **说明**：处理 citation / 连线 / 路径（纯计算，无外部 IO）
- **签名**：`citationEdgePath(s: Pos, t: Pos): string`
- **位置**：brian-frontend/src/utils/chatMapGeometry.ts:41
- **引用次数**：2

#### `edgePath`

- **类型**：逻辑控制
- **说明**：处理 连线 / 路径
- **签名**：`edgePath(e: EdgeRef, s: Pos, t: Pos): string`
- **位置**：brian-frontend/src/utils/chatMapGeometry.ts:57
- **引用次数**：11

#### `verticalArrowPoint`

- **类型**：逻辑控制
- **说明**：处理 vertical / arrow / point
- **签名**：`verticalArrowPoint(t: Pos): string`
- **位置**：brian-frontend/src/utils/chatMapGeometry.ts:61
- **引用次数**：2

#### `citationArrowPoint`

- **类型**：逻辑控制
- **说明**：处理 citation / arrow / point
- **签名**：`citationArrowPoint(t: Pos): string`
- **位置**：brian-frontend/src/utils/chatMapGeometry.ts:67
- **引用次数**：2

#### `arrowPoint`

- **类型**：逻辑控制
- **说明**：处理 arrow / point
- **签名**：`arrowPoint(e: EdgeRef, t: Pos): string`
- **位置**：brian-frontend/src/utils/chatMapGeometry.ts:73
- **引用次数**：6

#### `pushOutOfOverlap`

- **类型**：通用算法
- **说明**：写入/新增：overlap（纯计算，无外部 IO）
- **签名**：`pushOutOfOverlap(dragX: number, dragY: number, dragW: number, dragH: number, otherNodes: DragTarget[], excludeId: string): { x: number; y: number }`
- **位置**：brian-frontend/src/utils/chatMapGeometry.ts:79
- **引用次数**：4

#### `snapPosition`

- **类型**：通用算法
- **说明**：处理 snap / position（纯计算，无外部 IO）
- **签名**：`snapPosition(newX: number, newY: number, otherNodes: DragTarget[]): { x: number; y: number; guides: SnapGuide[] }`
- **位置**：brian-frontend/src/utils/chatMapGeometry.ts:117
- **引用次数**：3

## 文件 `brian-frontend/src/utils/chatMapLayout.ts`

### 模块级函数

#### `layoutChatMap`

- **类型**：数据处理
- **说明**：渲染绘制：chat / map
- **签名**：`layoutChatMap(nodes: ChatMapLayoutNode[], edges: ChatMapLayoutEdge[]): void`
- **位置**：brian-frontend/src/utils/chatMapLayout.ts:28
- **引用次数**：3

#### `cellKey`

- **类型**：逻辑控制
- **说明**：处理 cell / 键
- **签名**：`cellKey(c: number, r: number): string`
- **位置**：brian-frontend/src/utils/chatMapLayout.ts:48
- **引用次数**：3

#### `assignCell`

- **类型**：逻辑控制
- **说明**：处理 assign / cell（遍历调度）
- **签名**：`assignCell(nodeId: string, targetCol: number, targetRow: number, col: Map<string, number>, row: Map<string, number>, occupied: Set<string>): void`
- **位置**：brian-frontend/src/utils/chatMapLayout.ts:52
- **引用次数**：5

#### `buildIncoming`

- **类型**：数据处理
- **说明**：构建/初始化：incoming
- **签名**：`buildIncoming(edges: ChatMapLayoutEdge[]): Map<string, ChatMapLayoutEdge[]>`
- **位置**：brian-frontend/src/utils/chatMapLayout.ts:70
- **引用次数**：2

#### `tryPlace`

- **类型**：逻辑控制
- **说明**：处理 place
- **签名**：`tryPlace(node: ChatMapLayoutNode, incoming: Map<string, ChatMapLayoutEdge[]>, col: Map<string, number>, row: Map<string, number>, citationCols: Set<number>, occupied: Set<string>): boolean`
- **位置**：brian-frontend/src/utils/chatMapLayout.ts:79
- **引用次数**：2

#### `placeResponse`

- **类型**：数据处理
- **说明**：处理 place / response
- **签名**：`placeResponse(node: ChatMapLayoutNode, incoming: Map<string, ChatMapLayoutEdge[]>, col: Map<string, number>, row: Map<string, number>, occupied: Set<string>): boolean`
- **位置**：brian-frontend/src/utils/chatMapLayout.ts:93
- **引用次数**：2

#### `placeRequest`

- **类型**：数据处理
- **说明**：处理 place / request
- **签名**：`placeRequest(node: ChatMapLayoutNode, incoming: Map<string, ChatMapLayoutEdge[]>, col: Map<string, number>, row: Map<string, number>, citationCols: Set<number>, occupied: Set<string>): boolean`
- **位置**：brian-frontend/src/utils/chatMapLayout.ts:108
- **引用次数**：2

#### `placeCited`

- **类型**：通用算法
- **说明**：处理 place / cited（纯计算，无外部 IO）
- **签名**：`placeCited(node: ChatMapLayoutNode, citations: ChatMapLayoutEdge[], col: Map<string, number>, row: Map<string, number>, citationCols: Set<number>, occupied: Set<string>): boolean`
- **位置**：brian-frontend/src/utils/chatMapLayout.ts:131
- **引用次数**：2

#### `applyCoordinates`

- **类型**：数据处理
- **说明**：更新：coordinates
- **签名**：`applyCoordinates(nodes: ChatMapLayoutNode[], col: Map<string, number>, row: Map<string, number>, citationCols: Set<number>): void`
- **位置**：brian-frontend/src/utils/chatMapLayout.ts:148
- **引用次数**：2

#### `rectsOverlap`

- **类型**：逻辑控制
- **说明**：处理 rects / overlap
- **签名**：`rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean`
- **位置**：brian-frontend/src/utils/chatMapLayout.ts:161
- **引用次数**：4

#### `resolveOverlaps`

- **类型**：通用算法
- **说明**：获取：overlaps（纯计算，无外部 IO）
- **签名**：`resolveOverlaps(nodes: ChatMapLayoutNode[]): void`
- **位置**：brian-frontend/src/utils/chatMapLayout.ts:168
- **引用次数**：2

## 文件 `brian-frontend/src/utils/clipboard.ts`

### 模块级函数

#### `copyToClipboard`

- **类型**：数据处理
- **说明**：处理 复制 / 剪贴板
- **签名**：`copyToClipboard(text: string): Promise<boolean>`
- **位置**：brian-frontend/src/utils/clipboard.ts:1
- **引用次数**：20

## 文件 `brian-frontend/src/utils/edgePath.ts`

### 模块级函数

#### `edgeAnchor`

- **类型**：逻辑控制
- **说明**：处理 连线 / anchor
- **签名**：`edgeAnchor(r: EdgeRect, side: EdgeSide, along: unknown): Pos`
- **位置**：brian-frontend/src/utils/edgePath.ts:22
- **引用次数**：3

#### `bendFor`

- **类型**：通用算法
- **说明**：处理 bend（纯计算，无外部 IO）
- **签名**：`bendFor(gap: number): number`
- **位置**：brian-frontend/src/utils/edgePath.ts:32
- **引用次数**：2

#### `smoothEdgePath`

- **类型**：通用算法
- **说明**：处理 smooth / 连线 / 路径（纯计算，无外部 IO）
- **签名**：`smoothEdgePath(a: EdgeRect, aSide: EdgeSide, b: EdgeRect, bSide: EdgeSide, opts: { alongA?: number; alongB?: number }): string`
- **位置**：brian-frontend/src/utils/edgePath.ts:36
- **引用次数**：5

#### `round1`

- **类型**：通用算法
- **说明**：处理 round1（纯计算，无外部 IO）
- **签名**：`round1(v: number): number`
- **位置**：brian-frontend/src/utils/edgePath.ts:51
- **引用次数**：9

## 文件 `brian-frontend/src/utils/forceDirectedLayout.ts`

### 模块级函数

#### `forceDirectedLayout`

- **类型**：数据处理
- **说明**：处理 force / directed / layout
- **签名**：`forceDirectedLayout(nodes: GraphNode[], edges: LayoutEdge[], width: number, height: number, repulsion: unknown, springStrength: unknown): TagLayoutNode[]`
- **位置**：brian-frontend/src/utils/forceDirectedLayout.ts:7
- **引用次数**：8

## 文件 `brian-frontend/src/utils/format.ts`

### 模块级函数

#### `pad`

- **类型**：通用算法
- **说明**：处理 pad（纯计算，无外部 IO）
- **签名**：`pad(x: number): string`
- **位置**：brian-frontend/src/utils/format.ts:1
- **引用次数**：42

#### `formatTime`

- **类型**：通用算法
- **说明**：格式化/序列化：时间（纯计算，无外部 IO）
- **签名**：`formatTime(ts: number \| undefined \| null): string`
- **位置**：brian-frontend/src/utils/format.ts:5
- **引用次数**：24

#### `formatDate`

- **类型**：通用算法
- **说明**：格式化/序列化：日期（纯计算，无外部 IO）
- **签名**：`formatDate(ts: number \| undefined \| null): string`
- **位置**：brian-frontend/src/utils/format.ts:11
- **引用次数**：3

#### `formatFileSize`

- **类型**：通用算法
- **说明**：格式化/序列化：文件 / 大小（纯计算，无外部 IO）
- **签名**：`formatFileSize(bytes: number): string`
- **位置**：brian-frontend/src/utils/format.ts:17
- **引用次数**：4

#### `formatTokens`

- **类型**：通用算法
- **说明**：格式化/序列化：tokens（纯计算，无外部 IO）
- **签名**：`formatTokens(n?: number): string`
- **位置**：brian-frontend/src/utils/format.ts:24
- **引用次数**：6

#### `formatDuration`

- **类型**：通用算法
- **说明**：格式化/序列化：耗时（纯计算，无外部 IO）
- **签名**：`formatDuration(ms?: number): string`
- **位置**：brian-frontend/src/utils/format.ts:31
- **引用次数**：13

## 文件 `brian-frontend/src/utils/heatmap.ts`

### 模块级函数

#### `dateKeyToRange`

- **类型**：通用算法
- **说明**：处理 日期 / 键 / range（纯计算，无外部 IO）
- **签名**：`dateKeyToRange(dateKey: string): { start: number; end: number }`
- **位置**：brian-frontend/src/utils/heatmap.ts:3
- **引用次数**：6

#### `compareDateKeys`

- **类型**：通用算法
- **说明**：计算统计：日期 / keys（纯计算，无外部 IO）
- **签名**：`compareDateKeys(a: string, b: string): number`
- **位置**：brian-frontend/src/utils/heatmap.ts:10
- **引用次数**：6

#### `latestDateKey`

- **类型**：逻辑控制
- **说明**：处理 latest / 日期 / 键（遍历调度）
- **签名**：`latestDateKey(cache: Record<string, number>): string \| null`
- **位置**：brian-frontend/src/utils/heatmap.ts:16
- **引用次数**：5

#### `hasDataInMonth`

- **类型**：通用算法
- **说明**：判断校验：month（纯计算，无外部 IO）
- **签名**：`hasDataInMonth(cache: Record<string, number>, year: number, month1based: number): boolean`
- **位置**：brian-frontend/src/utils/heatmap.ts:25
- **引用次数**：5

#### `toLocalInputValue`

- **类型**：通用算法
- **说明**：格式化/序列化：local / 输入 / 值（纯计算，无外部 IO）
- **签名**：`toLocalInputValue(ts: number): string`
- **位置**：brian-frontend/src/utils/heatmap.ts:33
- **引用次数**：7

## 文件 `brian-frontend/src/utils/markdown.ts`

### 模块级函数

#### `renderMarkdown`

- **类型**：通用算法
- **说明**：格式化/序列化：Markdown（纯计算，无外部 IO）
- **签名**：`renderMarkdown(content: string): string`
- **位置**：brian-frontend/src/utils/markdown.ts:4
- **引用次数**：15

#### `createThrottledMarkdownRenderer`

- **类型**：通用算法
- **说明**：写入/新增：throttled / Markdown / renderer（纯计算，无外部 IO）
- **签名**：`createThrottledMarkdownRenderer(throttleMs: unknown): (content: string, streaming: boolean) => string`
- **位置**：brian-frontend/src/utils/markdown.ts:14
- **引用次数**：3

## 文件 `brian-frontend/src/utils/messageGraph.ts`

### 模块级函数

#### `mapEdgeType`

- **类型**：通用算法
- **说明**：转换归并：连线 / type（纯计算，无外部 IO）
- **签名**：`mapEdgeType(type: string): ChatMapEdge['edgeType']`
- **位置**：brian-frontend/src/utils/messageGraph.ts:3
- **引用次数**：2

#### `buildMessageGraph`

- **类型**：通用算法
- **说明**：构建/初始化：消息 / 图（纯计算，无外部 IO）
- **签名**：`buildMessageGraph(rawNodes: Array<Record<string, unknown>>, rawEdges: Array<Record<string, unknown>>): { nodes: ChatMapNode[]; edges: ChatMapEdge[] }`
- **位置**：brian-frontend/src/utils/messageGraph.ts:10
- **引用次数**：3

## 文件 `brian-frontend/src/utils/trace.ts`

### 模块级函数

#### `newTraceId`

- **类型**：通用算法
- **说明**：处理 执行轨迹 / 标识（纯计算，无外部 IO）
- **签名**：`newTraceId(): string`
- **位置**：brian-frontend/src/utils/trace.ts:1
- **引用次数**：6

