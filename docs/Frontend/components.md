# Frontend / components

- 层：**Frontend**　模块：**components**
- 方法数：**159**（逻辑控制 75 · 数据处理 37 · 通用算法 47）

## 文件 `brian-frontend/src/components/blocks/CodeBlock.vue`

### 模块级函数

#### `copyCode`

- **类型**：逻辑控制
- **说明**：处理 复制 / code（异步编排）
- **签名**：`copyCode()`
- **位置**：brian-frontend/src/components/blocks/CodeBlock.vue:10
- **引用次数**：2

## 文件 `brian-frontend/src/components/blocks/ErrorBlock.vue`

### 模块级函数

#### `copyTraceId`

- **类型**：逻辑控制
- **说明**：处理 复制 / 执行轨迹 / 标识（异步编排）
- **签名**：`copyTraceId()`
- **位置**：brian-frontend/src/components/blocks/ErrorBlock.vue:10
- **引用次数**：8

## 文件 `brian-frontend/src/components/blocks/FeedbackBlock.vue`

### 模块级函数

#### `submitRating`

- **类型**：逻辑控制
- **说明**：处理 submit / rating（含异常兜底，异步编排）
- **签名**：`submitRating(score: number)`
- **位置**：brian-frontend/src/components/blocks/FeedbackBlock.vue:14
- **引用次数**：4

#### `submitLike`

- **类型**：逻辑控制
- **说明**：处理 submit / like（含异常兜底，异步编排）
- **签名**：`submitLike(type: 'like' \| 'dislike')`
- **位置**：brian-frontend/src/components/blocks/FeedbackBlock.vue:23
- **引用次数**：3

#### `copyTraceId`

- **类型**：逻辑控制
- **说明**：处理 复制 / 执行轨迹 / 标识（异步编排）
- **签名**：`copyTraceId()`
- **位置**：brian-frontend/src/components/blocks/FeedbackBlock.vue:31
- **引用次数**：8

## 文件 `brian-frontend/src/components/blocks/ThinkingBlock.vue`

### 模块级函数

#### `openComponent`

- **类型**：逻辑控制
- **说明**：启动：组件
- **签名**：`openComponent(kind: ComponentKind, ref?: string)`
- **位置**：brian-frontend/src/components/blocks/ThinkingBlock.vue:31
- **引用次数**：2

#### `copyPromptText`

- **类型**：逻辑控制
- **说明**：处理 复制 / 提示词 / 文本（异步编排）
- **签名**：`copyPromptText()`
- **位置**：brian-frontend/src/components/blocks/ThinkingBlock.vue:127
- **引用次数**：2

#### `copyResponseText`

- **类型**：逻辑控制
- **说明**：处理 复制 / response / 文本（异步编排）
- **签名**：`copyResponseText()`
- **位置**：brian-frontend/src/components/blocks/ThinkingBlock.vue:136
- **引用次数**：2

#### `formatJson`

- **类型**：数据处理
- **说明**：格式化/序列化：JSON（序列化输出）
- **签名**：`formatJson(val: unknown): string`
- **位置**：brian-frontend/src/components/blocks/ThinkingBlock.vue:144
- **引用次数**：17

#### `msgContent`

- **类型**：逻辑控制
- **说明**：处理 msg / content
- **签名**：`msgContent(val: unknown): string`
- **位置**：brian-frontend/src/components/blocks/ThinkingBlock.vue:153
- **引用次数**：9

## 文件 `brian-frontend/src/components/blocks/ToolCallBlock.vue`

### 模块级函数

#### `safeStringify`

- **类型**：数据处理
- **说明**：处理 safe / stringify（序列化输出）
- **签名**：`safeStringify(v: unknown): string`
- **位置**：brian-frontend/src/components/blocks/ToolCallBlock.vue:50
- **引用次数**：3

## 文件 `brian-frontend/src/components/chat/AgentDagFlow.vue`

### 模块级函数

#### `resolveStatus`

- **类型**：通用算法
- **说明**：获取：状态（纯计算，无外部 IO）
- **签名**：`resolveStatus(node: (typeof nodes.value)[number]): AgentExecutionStatus`
- **位置**：brian-frontend/src/components/chat/AgentDagFlow.vue:34
- **引用次数**：6

#### `nodeStyle`

- **类型**：数据处理
- **说明**：处理 节点 / style
- **签名**：`nodeStyle(id: string)`
- **位置**：brian-frontend/src/components/chat/AgentDagFlow.vue:74
- **引用次数**：6

#### `edgePath`

- **类型**：数据处理
- **说明**：处理 连线 / 路径
- **签名**：`edgePath(source: string, target: string): string`
- **位置**：brian-frontend/src/components/chat/AgentDagFlow.vue:86
- **引用次数**：11

#### `edgeColor`

- **类型**：逻辑控制
- **说明**：处理 连线 / color
- **签名**：`edgeColor(source: string): string`
- **位置**：brian-frontend/src/components/chat/AgentDagFlow.vue:99
- **引用次数**：2

#### `handleSelect`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / select
- **签名**：`handleSelect(node: (typeof nodes.value)[number])`
- **位置**：brian-frontend/src/components/chat/AgentDagFlow.vue:109
- **引用次数**：4

#### `formatJson`

- **类型**：数据处理
- **说明**：格式化/序列化：JSON（序列化输出）
- **签名**：`formatJson(val: unknown): string`
- **位置**：brian-frontend/src/components/chat/AgentDagFlow.vue:116
- **引用次数**：17

## 文件 `brian-frontend/src/components/chat/AskUserCard.vue`

### 模块级函数

#### `submit`

- **类型**：通用算法
- **说明**：处理 submit（纯计算，无外部 IO）
- **签名**：`submit()`
- **位置**：brian-frontend/src/components/chat/AskUserCard.vue:23
- **引用次数**：21

## 文件 `brian-frontend/src/components/chat/CanvasReActFlow.vue`

### 模块级函数

#### `drawFlow`

- **类型**：通用算法
- **说明**：渲染绘制：flow（纯计算，无外部 IO）
- **签名**：`drawFlow()`
- **位置**：brian-frontend/src/components/chat/CanvasReActFlow.vue:27
- **引用次数**：3

## 文件 `brian-frontend/src/components/chat/ChatArea.vue`

### 模块级函数

#### `nodeOf`

- **类型**：数据处理
- **说明**：处理 节点
- **签名**：`nodeOf(msg: ChatMessage)`
- **位置**：brian-frontend/src/components/chat/ChatArea.vue:46
- **引用次数**：7

#### `getCitedCount`

- **类型**：通用算法
- **说明**：获取：cited / 数量（纯计算，无外部 IO）
- **签名**：`getCitedCount(msg: ChatMessage): number`
- **位置**：brian-frontend/src/components/chat/ChatArea.vue:50
- **引用次数**：2

#### `getCitingCount`

- **类型**：通用算法
- **说明**：获取：citing / 数量（纯计算，无外部 IO）
- **签名**：`getCitingCount(msg: ChatMessage): number`
- **位置**：brian-frontend/src/components/chat/ChatArea.vue:56
- **引用次数**：2

#### `getCitedIds`

- **类型**：通用算法
- **说明**：获取：cited / ids（纯计算，无外部 IO）
- **签名**：`getCitedIds(msg: ChatMessage): string[]`
- **位置**：brian-frontend/src/components/chat/ChatArea.vue:62
- **引用次数**：3

#### `getCitingIds`

- **类型**：通用算法
- **说明**：获取：citing / ids（纯计算，无外部 IO）
- **签名**：`getCitingIds(msg: ChatMessage): string[]`
- **位置**：brian-frontend/src/components/chat/ChatArea.vue:70
- **引用次数**：2

#### `scrollListTo`

- **类型**：数据处理
- **说明**：界面控制相关数据
- **签名**：`scrollListTo(id: string)`
- **位置**：brian-frontend/src/components/chat/ChatArea.vue:98
- **引用次数**：2

#### `centerMapOn`

- **类型**：数据处理
- **说明**：处理 center / map / on
- **签名**：`centerMapOn(id: string)`
- **位置**：brian-frontend/src/components/chat/ChatArea.vue:102
- **引用次数**：2

#### `togglePin`

- **类型**：数据处理
- **说明**：更新：钉住
- **签名**：`togglePin(id: string)`
- **位置**：brian-frontend/src/components/chat/ChatArea.vue:106
- **引用次数**：12

#### `jumpTo`

- **类型**：逻辑控制
- **说明**：处理 jump
- **签名**：`jumpTo(id: string)`
- **位置**：brian-frontend/src/components/chat/ChatArea.vue:110
- **引用次数**：8

#### `showThinking`

- **类型**：逻辑控制
- **说明**：界面控制：thinking（含异常兜底，异步编排）
- **签名**：`showThinking(id: string)`
- **位置**：brian-frontend/src/components/chat/ChatArea.vue:114
- **引用次数**：8

#### `startResize`

- **类型**：数据处理
- **说明**：启动：缩放
- **签名**：`startResize(e: MouseEvent)`
- **位置**：brian-frontend/src/components/chat/ChatArea.vue:156
- **引用次数**：2

## 文件 `brian-frontend/src/components/chat/ComponentInfoModal.vue`

### 模块级函数

#### `normalize`

- **类型**：数据处理
- **说明**：转换归并相关数据（反序列化）
- **签名**：`normalize(value: unknown): unknown`
- **位置**：brian-frontend/src/components/chat/ComponentInfoModal.vue:48
- **引用次数**：3

#### `displayValue`

- **类型**：数据处理
- **说明**：处理 display / 值（序列化输出）
- **签名**：`displayValue(v: unknown): string`
- **位置**：brian-frontend/src/components/chat/ComponentInfoModal.vue:60
- **引用次数**：13

#### `load`

- **类型**：数据处理
- **说明**：获取相关数据
- **签名**：`load()`
- **位置**：brian-frontend/src/components/chat/ComponentInfoModal.vue:67
- **引用次数**：16

#### `onKeydown`

- **类型**：通用算法
- **说明**：处理执行：keydown（纯计算，无外部 IO）
- **签名**：`onKeydown(e: KeyboardEvent)`
- **位置**：brian-frontend/src/components/chat/ComponentInfoModal.vue:100
- **引用次数**：8

## 文件 `brian-frontend/src/components/chat/dagLayout.ts`

### 模块级函数

#### `computeLayers`

- **类型**：数据处理
- **说明**：计算统计：layers
- **签名**：`computeLayers(nodes: DagLayoutNode[], edges: DagLayoutEdge[]): Map<string, number>`
- **位置**：brian-frontend/src/components/chat/dagLayout.ts:42
- **引用次数**：2

#### `layoutDag`

- **类型**：数据处理
- **说明**：渲染绘制：DAG 流程
- **签名**：`layoutDag(nodes: DagLayoutNode[], edges: DagLayoutEdge[]): DagLayoutResult`
- **位置**：brian-frontend/src/components/chat/dagLayout.ts:87
- **引用次数**：4

## 文件 `brian-frontend/src/components/chat/EvalResultModal.vue`

### 模块级函数

#### `close`

- **类型**：逻辑控制
- **说明**：删除/清理相关数据
- **签名**：`close()`
- **位置**：brian-frontend/src/components/chat/EvalResultModal.vue:52
- **引用次数**：71

#### `copyTraceId`

- **类型**：逻辑控制
- **说明**：处理 复制 / 执行轨迹 / 标识（异步编排）
- **签名**：`copyTraceId()`
- **位置**：brian-frontend/src/components/chat/EvalResultModal.vue:56
- **引用次数**：8

#### `scoreColor`

- **类型**：逻辑控制
- **说明**：计算统计：color
- **签名**：`scoreColor(score: number): string`
- **位置**：brian-frontend/src/components/chat/EvalResultModal.vue:66
- **引用次数**：2

#### `formatTime`

- **类型**：通用算法
- **说明**：格式化/序列化：时间（纯计算，无外部 IO）
- **签名**：`formatTime(ts: number): string`
- **位置**：brian-frontend/src/components/chat/EvalResultModal.vue:72
- **引用次数**：24

## 文件 `brian-frontend/src/components/chat/InputBox.vue`

### 模块级函数

#### `handleSend`

- **类型**：通用算法
- **说明**：处理执行：ndle / send（纯计算，无外部 IO）
- **签名**：`handleSend()`
- **位置**：brian-frontend/src/components/chat/InputBox.vue:22
- **引用次数**：7

#### `autoResize`

- **类型**：通用算法
- **说明**：处理 auto / 缩放（纯计算，无外部 IO）
- **签名**：`autoResize()`
- **位置**：brian-frontend/src/components/chat/InputBox.vue:31
- **引用次数**：3

#### `onKeydown`

- **类型**：逻辑控制
- **说明**：处理执行：keydown
- **签名**：`onKeydown(e: KeyboardEvent)`
- **位置**：brian-frontend/src/components/chat/InputBox.vue:38
- **引用次数**：8

## 文件 `brian-frontend/src/components/chat/MessageCard.vue`

### 模块级函数

#### `submitRating`

- **类型**：逻辑控制
- **说明**：处理 submit / rating（含异常兜底，异步编排）
- **签名**：`submitRating(score: number)`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:73
- **引用次数**：4

#### `onSummaryToggle`

- **类型**：逻辑控制
- **说明**：处理执行：toggle
- **签名**：`onSummaryToggle(e: Event)`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:90
- **引用次数**：2

#### `onContentToggle`

- **类型**：逻辑控制
- **说明**：处理执行：content / toggle
- **签名**：`onContentToggle(e: Event)`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:94
- **引用次数**：2

#### `formatTime`

- **类型**：通用算法
- **说明**：格式化/序列化：时间（纯计算，无外部 IO）
- **签名**：`formatTime(ts: number)`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:128
- **引用次数**：24

#### `getSummary`

- **类型**：数据处理
- **说明**：获取：摘要
- **签名**：`getSummary(cid: string): string`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:135
- **引用次数**：3

#### `handleSelect`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / select
- **签名**：`handleSelect()`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:144
- **引用次数**：4

#### `handlePin`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / 钉住
- **签名**：`handlePin()`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:148
- **引用次数**：2

#### `handleCardClick`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / card / 点击
- **签名**：`handleCardClick()`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:152
- **引用次数**：8

#### `handleJump`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / jump
- **签名**：`handleJump(cid: string)`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:156
- **引用次数**：3

#### `handleShowThinking`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / show / thinking
- **签名**：`handleShowThinking(e: MouseEvent)`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:162
- **引用次数**：2

#### `handleShowEval`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / show / 评估
- **签名**：`handleShowEval()`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:171
- **引用次数**：2

#### `copyTraceId`

- **类型**：逻辑控制
- **说明**：处理 复制 / 执行轨迹 / 标识（异步编排）
- **签名**：`copyTraceId()`
- **位置**：brian-frontend/src/components/chat/MessageCard.vue:175
- **引用次数**：8

## 文件 `brian-frontend/src/components/chat/PermissionCompactRow.vue`

### 模块级函数

#### `formatTime`

- **类型**：通用算法
- **说明**：格式化/序列化：时间（纯计算，无外部 IO）
- **签名**：`formatTime(ts?: number)`
- **位置**：brian-frontend/src/components/chat/PermissionCompactRow.vue:16
- **引用次数**：24

## 文件 `brian-frontend/src/components/chat/ThinkingContext.vue`

### 模块级函数

#### `formatJson`

- **类型**：数据处理
- **说明**：格式化/序列化：JSON（序列化输出）
- **签名**：`formatJson(val: unknown): string`
- **位置**：brian-frontend/src/components/chat/ThinkingContext.vue:153
- **引用次数**：17

#### `msgContent`

- **类型**：逻辑控制
- **说明**：处理 msg / content
- **签名**：`msgContent(val: unknown): string`
- **位置**：brian-frontend/src/components/chat/ThinkingContext.vue:162
- **引用次数**：9

## 文件 `brian-frontend/src/components/chat/ThinkingModal.vue`

### 模块级函数

#### `scrollToAnchor`

- **类型**：数据处理
- **说明**：界面控制：anchor
- **签名**：`scrollToAnchor(target?: string)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:43
- **引用次数**：2

#### `realtimeToolComponentOf`

- **类型**：通用算法
- **说明**：处理 realtime / 工具 / 组件（纯计算，无外部 IO）
- **签名**：`realtimeToolComponentOf(toolId: string, params: Record<string, unknown>): { builtin: boolean; kind: 'skill' \| 'mcp' \| ''; id: string; name: string; subTool: string }`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:150
- **引用次数**：3

#### `toggleTool`

- **类型**：数据处理
- **说明**：更新：工具
- **签名**：`toggleTool(key: string)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:251
- **引用次数**：2

#### `togglePerm`

- **类型**：数据处理
- **说明**：更新：perm
- **签名**：`togglePerm(key: string)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:258
- **引用次数**：2

#### `toggleNode`

- **类型**：数据处理
- **说明**：更新：节点
- **签名**：`toggleNode(key: string)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:265
- **引用次数**：2

#### `kindDot`

- **类型**：逻辑控制
- **说明**：处理 kind / dot
- **签名**：`kindDot(kind: string)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:301
- **引用次数**：2

#### `kindIcon`

- **类型**：逻辑控制
- **说明**：处理 kind / icon
- **签名**：`kindIcon(kind: string)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:305
- **引用次数**：3

#### `toolStatusMeta`

- **类型**：通用算法
- **说明**：格式化/序列化：状态 / meta（纯计算，无外部 IO）
- **签名**：`toolStatusMeta(status: unknown)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:309
- **引用次数**：3

#### `permStatusMeta`

- **类型**：逻辑控制
- **说明**：处理 perm / 状态 / meta
- **签名**：`permStatusMeta(status: unknown)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:316
- **引用次数**：4

#### `formatTs`

- **类型**：通用算法
- **说明**：格式化/序列化：ts（纯计算，无外部 IO）
- **签名**：`formatTs(ts: number)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:323
- **引用次数**：6

#### `formatJson`

- **类型**：数据处理
- **说明**：格式化/序列化：JSON（序列化输出，反序列化）
- **签名**：`formatJson(v: unknown)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:332
- **引用次数**：17

#### `confirmPermission`

- **类型**：数据处理
- **说明**：处理 确认 / 授权
- **签名**：`confirmPermission(permissionId: string, approved: boolean, remember: unknown)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:356
- **引用次数**：4

#### `close`

- **类型**：逻辑控制
- **说明**：删除/清理相关数据
- **签名**：`close()`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:375
- **引用次数**：71

#### `onAfterLeave`

- **类型**：逻辑控制
- **说明**：处理执行：after / leave
- **签名**：`onAfterLeave()`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:379
- **引用次数**：2

#### `getCardEl`

- **类型**：数据处理
- **说明**：获取：card
- **签名**：`getCardEl(overlay: Element): HTMLElement \| null`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:385
- **引用次数**：4

#### `genieTarget`

- **类型**：通用算法
- **说明**：处理 genie / target（纯计算，无外部 IO）
- **签名**：`genieTarget(cardRect: DOMRect): GenieTarget \| null`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:389
- **引用次数**：3

#### `prefersReducedMotion`

- **类型**：逻辑控制
- **说明**：处理 prefers / reduced / motion
- **签名**：`prefersReducedMotion(): boolean`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:401
- **引用次数**：3

#### `bounceOriginButton`

- **类型**：数据处理
- **说明**：处理 bounce / origin / button
- **签名**：`bounceOriginButton()`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:406
- **引用次数**：2

#### `trackAnim`

- **类型**：数据处理
- **说明**：处理 track / anim
- **签名**：`trackAnim(a: Animation): Animation`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:420
- **引用次数**：2

#### `cancelAnims`

- **类型**：通用算法
- **说明**：删除/清理：anims（纯计算，无外部 IO）
- **签名**：`cancelAnims()`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:425
- **引用次数**：5

#### `playAnims`

- **类型**：数据处理
- **说明**：处理 play / anims
- **签名**：`playAnims(anims: Animation[], done: () => void, timeoutMs: number, cleanup: () => void)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:429
- **引用次数**：3

#### `onGenieBeforeEnter`

- **类型**：逻辑控制
- **说明**：处理执行：genie / before / enter
- **签名**：`onGenieBeforeEnter(overlay: Element)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:444
- **引用次数**：2

#### `onGenieEnter`

- **类型**：通用算法
- **说明**：处理执行：genie / enter（纯计算，无外部 IO）
- **签名**：`onGenieEnter(overlay: Element, done: () => void)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:451
- **引用次数**：2

#### `onGenieLeave`

- **类型**：通用算法
- **说明**：处理执行：genie / leave（纯计算，无外部 IO）
- **签名**：`onGenieLeave(overlay: Element, done: () => void)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:491
- **引用次数**：2

#### `onGenieCancelled`

- **类型**：逻辑控制
- **说明**：处理执行：genie / cancelled
- **签名**：`onGenieCancelled()`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:524
- **引用次数**：3

#### `onKeydown`

- **类型**：通用算法
- **说明**：处理执行：keydown（纯计算，无外部 IO）
- **签名**：`onKeydown(e: KeyboardEvent)`
- **位置**：brian-frontend/src/components/chat/ThinkingModal.vue:529
- **引用次数**：8

## 文件 `brian-frontend/src/components/config/ConfigHistoryModal.vue`

### 模块级函数

#### `load`

- **类型**：逻辑控制
- **说明**：获取相关数据（含异常兜底，异步编排）
- **签名**：`load()`
- **位置**：brian-frontend/src/components/config/ConfigHistoryModal.vue:19
- **引用次数**：16

#### `formatTime`

- **类型**：通用算法
- **说明**：格式化/序列化：时间（纯计算，无外部 IO）
- **签名**：`formatTime(ts: number): string`
- **位置**：brian-frontend/src/components/config/ConfigHistoryModal.vue:34
- **引用次数**：24

## 文件 `brian-frontend/src/components/config/ConfigValueDiff.vue`

### 模块级函数

#### `toText`

- **类型**：数据处理
- **说明**：格式化/序列化：文本（序列化输出）
- **签名**：`toText(v: unknown): string`
- **位置**：brian-frontend/src/components/config/ConfigValueDiff.vue:9
- **引用次数**：3

## 文件 `brian-frontend/src/components/CronConfigModal.vue`

### 模块级函数

#### `validate`

- **类型**：逻辑控制
- **说明**：判断校验相关数据（含异常兜底，异步编排）
- **签名**：`validate()`
- **位置**：brian-frontend/src/components/CronConfigModal.vue:45
- **引用次数**：4

#### `parseToFields`

- **类型**：通用算法
- **说明**：解析：fields（纯计算，无外部 IO）
- **签名**：`parseToFields()`
- **位置**：brian-frontend/src/components/CronConfigModal.vue:64
- **引用次数**：2

#### `generateFromFields`

- **类型**：逻辑控制
- **说明**：构建/初始化：fields（含异常兜底，异步编排）
- **签名**：`generateFromFields()`
- **位置**：brian-frontend/src/components/CronConfigModal.vue:73
- **引用次数**：2

#### `onManualInput`

- **类型**：逻辑控制
- **说明**：处理执行：manual / 输入
- **签名**：`onManualInput()`
- **位置**：brian-frontend/src/components/CronConfigModal.vue:88
- **引用次数**：2

#### `formatTime`

- **类型**：通用算法
- **说明**：格式化/序列化：时间（纯计算，无外部 IO）
- **签名**：`formatTime(ts: number \| null): string`
- **位置**：brian-frontend/src/components/CronConfigModal.vue:92
- **引用次数**：24

#### `save`

- **类型**：数据处理
- **说明**：写入/新增相关数据
- **签名**：`save()`
- **位置**：brian-frontend/src/components/CronConfigModal.vue:99
- **引用次数**：17

## 文件 `brian-frontend/src/components/home/graphData.ts`

### 模块级函数

#### `makeNodes`

- **类型**：通用算法
- **说明**：构建/初始化：nodes（纯计算，无外部 IO）
- **签名**：`makeNodes(defs: ClusterDef[]): GraphNode[]`
- **位置**：brian-frontend/src/components/home/graphData.ts:31
- **引用次数**：3

#### `intraEdges`

- **类型**：逻辑控制
- **说明**：处理 intra / edges（遍历调度）
- **签名**：`intraEdges(defs: ClusterDef[]): GraphEdge[]`
- **位置**：brian-frontend/src/components/home/graphData.ts:43
- **引用次数**：3

#### `dedupe`

- **类型**：通用算法
- **说明**：转换归并相关数据（纯计算，无外部 IO）
- **签名**：`dedupe(edges: GraphEdge[]): GraphEdge[]`
- **位置**：brian-frontend/src/components/home/graphData.ts:53
- **引用次数**：2

#### `layoutGraph`

- **类型**：通用算法
- **说明**：渲染绘制：图（纯计算，无外部 IO）
- **签名**：`layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): GraphShotGraph`
- **位置**：brian-frontend/src/components/home/graphData.ts:63
- **引用次数**：3

#### `keywordGraph`

- **类型**：通用算法
- **说明**：处理 keyword / 图（纯计算，无外部 IO）
- **签名**：`keywordGraph(): GraphShotGraph`
- **位置**：brian-frontend/src/components/home/graphData.ts:108
- **引用次数**：11

## 文件 `brian-frontend/src/components/home/GraphShot.vue`

### 模块级函数

#### `setNodeRef`

- **类型**：逻辑控制
- **说明**：更新：节点 / ref
- **签名**：`setNodeRef(el: unknown, i: number)`
- **位置**：brian-frontend/src/components/home/GraphShot.vue:51
- **引用次数**：2

#### `setLineRef`

- **类型**：逻辑控制
- **说明**：更新：行 / ref
- **签名**：`setLineRef(el: unknown, i: number)`
- **位置**：brian-frontend/src/components/home/GraphShot.vue:52
- **引用次数**：2

#### `seeded01`

- **类型**：通用算法
- **说明**：处理 seeded01（纯计算，无外部 IO）
- **签名**：`seeded01(seed: number)`
- **位置**：brian-frontend/src/components/home/GraphShot.vue:63
- **引用次数**：5

#### `tick`

- **类型**：通用算法
- **说明**：处理 tick（纯计算，无外部 IO）
- **签名**：`tick(now: number)`
- **位置**：brian-frontend/src/components/home/GraphShot.vue:71
- **引用次数**：14

#### `startDrift`

- **类型**：逻辑控制
- **说明**：启动：drift
- **签名**：`startDrift()`
- **位置**：brian-frontend/src/components/home/GraphShot.vue:95
- **引用次数**：2

#### `stopDrift`

- **类型**：逻辑控制
- **说明**：删除/清理：drift
- **签名**：`stopDrift()`
- **位置**：brian-frontend/src/components/home/GraphShot.vue:101
- **引用次数**：2

## 文件 `brian-frontend/src/components/home/HeroAppShot.vue`

### 模块级函数

#### `after`

- **类型**：逻辑控制
- **说明**：处理 after
- **签名**：`after(ms: number, fn: () => void)`
- **位置**：brian-frontend/src/components/home/HeroAppShot.vue:121
- **引用次数**：38

#### `clearTimers`

- **类型**：逻辑控制
- **说明**：删除/清理：timers（遍历调度）
- **签名**：`clearTimers()`
- **位置**：brian-frontend/src/components/home/HeroAppShot.vue:125
- **引用次数**：3

#### `press`

- **类型**：逻辑控制
- **说明**：处理 press
- **签名**：`press(apply: () => void, at: { x: number; y: number })`
- **位置**：brian-frontend/src/components/home/HeroAppShot.vue:130
- **引用次数**：4

#### `runDemo`

- **类型**：逻辑控制
- **说明**：处理执行：demo
- **签名**：`runDemo()`
- **位置**：brian-frontend/src/components/home/HeroAppShot.vue:139
- **引用次数**：3

## 文件 `brian-frontend/src/components/info/GraphPane.vue`

### 模块级函数

#### `setSvgRef`

- **类型**：逻辑控制
- **说明**：更新：svg / ref
- **签名**：`setSvgRef(el: unknown)`
- **位置**：brian-frontend/src/components/info/GraphPane.vue:21
- **引用次数**：2

## 文件 `brian-frontend/src/components/info/HeatmapCard.vue`

### 模块级函数

#### `cellColor`

- **类型**：逻辑控制
- **说明**：处理 cell / color
- **签名**：`cellColor(count: number): string`
- **位置**：brian-frontend/src/components/info/HeatmapCard.vue:22
- **引用次数**：2

## 文件 `brian-frontend/src/components/layout/Header.vue`

### 模块级函数

#### `navigate`

- **类型**：逻辑控制
- **说明**：处理 navigate
- **签名**：`navigate(routePath: string)`
- **位置**：brian-frontend/src/components/layout/Header.vue:28
- **引用次数**：32

## 文件 `brian-frontend/src/components/layout/LoginPage.vue`

### 模块级函数

#### `handleLogin`

- **类型**：数据处理
- **说明**：处理执行：ndle / login
- **签名**：`handleLogin()`
- **位置**：brian-frontend/src/components/layout/LoginPage.vue:10
- **引用次数**：3

## 文件 `brian-frontend/src/components/layout/NeuralBackground.vue`

### 模块级函数

#### `resize`

- **类型**：逻辑控制
- **说明**：处理 缩放
- **签名**：`resize()`
- **位置**：brian-frontend/src/components/layout/NeuralBackground.vue:13
- **引用次数**：17

#### `animate`

- **类型**：通用算法
- **说明**：渲染绘制相关数据（纯计算，无外部 IO）
- **签名**：`animate()`
- **位置**：brian-frontend/src/components/layout/NeuralBackground.vue:34
- **引用次数**：98

## 文件 `brian-frontend/src/components/layout/PageBreadcrumb.vue`

### 模块级函数

#### `copyPath`

- **类型**：数据处理
- **说明**：处理 复制 / 路径
- **签名**：`copyPath()`
- **位置**：brian-frontend/src/components/layout/PageBreadcrumb.vue:10
- **引用次数**：2

## 文件 `brian-frontend/src/components/LibraryTreeItem.vue`

### 模块级函数

#### `toggle`

- **类型**：通用算法
- **说明**：更新相关数据（纯计算，无外部 IO）
- **签名**：`toggle()`
- **位置**：brian-frontend/src/components/LibraryTreeItem.vue:13
- **引用次数**：24

## 文件 `brian-frontend/src/components/panels/LearningPanel.vue`

### 模块级函数

#### `emptyStats`

- **类型**：逻辑控制
- **说明**：处理 empty / stats
- **签名**：`emptyStats(): LearningStats`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:34
- **引用次数**：2

#### `statsOf`

- **类型**：逻辑控制
- **说明**：计算统计相关数据
- **签名**：`statsOf(mode: string): LearningStats`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:37
- **引用次数**：6

#### `fetchModeData`

- **类型**：逻辑控制
- **说明**：获取：mode（含异常兜底，异步编排）
- **签名**：`fetchModeData(mode: string)`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:41
- **引用次数**：2

#### `fetchAll`

- **类型**：数据处理
- **说明**：获取相关数据
- **签名**：`fetchAll()`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:48
- **引用次数**：17

#### `triggerMode`

- **类型**：逻辑控制
- **说明**：处理执行：mode（含异常兜底，异步编排）
- **签名**：`triggerMode(mode: string)`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:61
- **引用次数**：2

#### `toggleAuto`

- **类型**：通用算法
- **说明**：更新：auto（纯计算，无外部 IO）
- **签名**：`toggleAuto(mode: string)`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:74
- **引用次数**：2

#### `onFactorChange`

- **类型**：逻辑控制
- **说明**：处理执行：factor / change（含异常兜底，异步编排）
- **签名**：`onFactorChange(mode: string, val: number)`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:83
- **引用次数**：2

#### `setHeatmapRef`

- **类型**：逻辑控制
- **说明**：更新：热力图 / ref（遍历调度）
- **签名**：`setHeatmapRef(mode: string, el: Element \| null)`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:100
- **引用次数**：2

#### `trendDaysOf`

- **类型**：通用算法
- **说明**：处理 trend / days（纯计算，无外部 IO）
- **签名**：`trendDaysOf(mode: string): number`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:114
- **引用次数**：2

#### `visibleTrend`

- **类型**：通用算法
- **说明**：处理 visible / trend（纯计算，无外部 IO）
- **签名**：`visibleTrend(mode: string): { date: string; count: number }[]`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:120
- **引用次数**：4

#### `trendMax`

- **类型**：通用算法
- **说明**：处理 trend / max（纯计算，无外部 IO）
- **签名**：`trendMax(mode: string): number`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:125
- **引用次数**：2

#### `trendColor`

- **类型**：逻辑控制
- **说明**：处理 trend / color
- **签名**：`trendColor(mode: string, count: number): string`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:129
- **引用次数**：2

#### `fetchTasks`

- **类型**：逻辑控制
- **说明**：获取：tasks（含异常兜底，异步编排）
- **签名**：`fetchTasks()`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:140
- **引用次数**：4

#### `taskTime`

- **类型**：通用算法
- **说明**：处理 任务 / 时间（纯计算，无外部 IO）
- **签名**：`taskTime(ts: number): string`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:148
- **引用次数**：2

#### `taskStatusText`

- **类型**：逻辑控制
- **说明**：处理 任务 / 状态 / 文本
- **签名**：`taskStatusText(status: string): string`
- **位置**：brian-frontend/src/components/panels/LearningPanel.vue:154
- **引用次数**：2

## 文件 `brian-frontend/src/components/panels/MonitorPanel.vue`

### 模块级函数

#### `fetchFeedbackRecords`

- **类型**：逻辑控制
- **说明**：获取：反馈 / records（含异常兜底，异步编排）
- **签名**：`fetchFeedbackRecords(manual: unknown)`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:48
- **引用次数**：4

#### `openFeedbackDetail`

- **类型**：逻辑控制
- **说明**：启动：反馈 / detail（含异常兜底，异步编排）
- **签名**：`openFeedbackDetail(processId: string)`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:62
- **引用次数**：2

#### `closeFeedbackDetail`

- **类型**：逻辑控制
- **说明**：删除/清理：反馈 / detail
- **签名**：`closeFeedbackDetail()`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:70
- **引用次数**：3

#### `copyDetailProcessId`

- **类型**：逻辑控制
- **说明**：处理 复制 / detail / 标识（异步编排）
- **签名**：`copyDetailProcessId()`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:77
- **引用次数**：2

#### `ratingBadge`

- **类型**：逻辑控制
- **说明**：处理 rating / badge
- **签名**：`ratingBadge(rating: number): { label: string; cls: string }`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:110
- **引用次数**：5

#### `feedbackSummary`

- **类型**：逻辑控制
- **说明**：处理 反馈 / 摘要
- **签名**：`feedbackSummary(r: FeedbackProcessLogListItem): string`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:117
- **引用次数**：2

#### `formatRelativeTime`

- **类型**：通用算法
- **说明**：格式化/序列化：relative / 时间（纯计算，无外部 IO）
- **签名**：`formatRelativeTime(ts: number): string`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:124
- **引用次数**：2

#### `buildLogQuery`

- **类型**：通用算法
- **说明**：构建/初始化：日志 / query（纯计算，无外部 IO）
- **签名**：`buildLogQuery()`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:133
- **引用次数**：2

#### `fetchAll`

- **类型**：数据处理
- **说明**：获取相关数据
- **签名**：`fetchAll(includeLogs: unknown)`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:147
- **引用次数**：17

#### `loadLogSources`

- **类型**：逻辑控制
- **说明**：获取：日志 / sources（含异常兜底，异步编排）
- **签名**：`loadLogSources()`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:163
- **引用次数**：2

#### `resetLogFilters`

- **类型**：通用算法
- **说明**：删除/清理：日志 / filters（纯计算，无外部 IO）
- **签名**：`resetLogFilters()`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:167
- **引用次数**：2

#### `toggleLogSelect`

- **类型**：数据处理
- **说明**：更新：日志 / select
- **签名**：`toggleLogSelect(id: string)`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:179
- **引用次数**：2

#### `toggleSelectAllLogs`

- **类型**：通用算法
- **说明**：更新：select / logs（纯计算，无外部 IO）
- **签名**：`toggleSelectAllLogs()`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:188
- **引用次数**：3

#### `formatLogEntry`

- **类型**：通用算法
- **说明**：格式化/序列化：日志 / entry（纯计算，无外部 IO）
- **签名**：`formatLogEntry(l: { timestamp: number; level: string; source: string; message: string; trace_id?: string; caller?: string }): string`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:193
- **引用次数**：3

#### `copyLog`

- **类型**：逻辑控制
- **说明**：处理 复制 / 日志（异步编排）
- **签名**：`copyLog(id: string)`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:202
- **引用次数**：2

#### `copySelectedLogs`

- **类型**：通用算法
- **说明**：处理 复制 / selected / logs（纯计算，无外部 IO）
- **签名**：`copySelectedLogs()`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:212
- **引用次数**：2

#### `deleteLog`

- **类型**：数据处理
- **说明**：删除/清理：日志
- **签名**：`deleteLog(id: string)`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:219
- **引用次数**：2

#### `deleteSelectedLogs`

- **类型**：数据处理
- **说明**：删除/清理：selected / logs
- **签名**：`deleteSelectedLogs()`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:231
- **引用次数**：2

#### `clearAllLogs`

- **类型**：通用算法
- **说明**：删除/清理：logs（纯计算，无外部 IO）
- **签名**：`clearAllLogs()`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:241
- **引用次数**：2

#### `statusColor`

- **类型**：逻辑控制
- **说明**：处理 状态 / color
- **签名**：`statusColor(s: string)`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:282
- **引用次数**：2

#### `statusIcon`

- **类型**：逻辑控制
- **说明**：处理 状态 / icon
- **签名**：`statusIcon(s: string)`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:285
- **引用次数**：3

#### `formatUptime`

- **类型**：通用算法
- **说明**：格式化/序列化：uptime（纯计算，无外部 IO）
- **签名**：`formatUptime(seconds: number)`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:295
- **引用次数**：2

#### `formatDate`

- **类型**：通用算法
- **说明**：格式化/序列化：日期（纯计算，无外部 IO）
- **签名**：`formatDate(d: Date): string`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:310
- **引用次数**：3

#### `tokenCellColor`

- **类型**：通用算法
- **说明**：格式化/序列化：cell / color（纯计算，无外部 IO）
- **签名**：`tokenCellColor(tokens: number, future: boolean): string`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:350
- **引用次数**：2

#### `modelSortValue`

- **类型**：逻辑控制
- **说明**：处理 模型 / sort / 值
- **签名**：`modelSortValue(m: { tokens: number; input_tokens: number; output_tokens: number }): number`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:378
- **引用次数**：3

#### `modelInputPercent`

- **类型**：逻辑控制
- **说明**：处理 模型 / 输入 / 百分比
- **签名**：`modelInputPercent(m: { input_tokens: number }): number`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:408
- **引用次数**：3

#### `modelOutputPercent`

- **类型**：逻辑控制
- **说明**：处理 模型 / 输出 / 百分比
- **签名**：`modelOutputPercent(m: { output_tokens: number }): number`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:413
- **引用次数**：3

#### `displayModelName`

- **类型**：数据处理
- **说明**：处理 display / 模型 / name
- **签名**：`displayModelName(m: { model: string; deleted?: boolean }): string`
- **位置**：brian-frontend/src/components/panels/MonitorPanel.vue:418
- **引用次数**：4

