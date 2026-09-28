# Frontend / views

- 层：**Frontend**　模块：**views**
- 方法数：**254**（逻辑控制 110 · 数据处理 97 · 通用算法 47）

## 文件 `brian-frontend/src/views/ChatView.vue`

### 模块级函数

#### `startEditTitle`

- **类型**：逻辑控制
- **说明**：启动：edit / title
- **签名**：`startEditTitle(chat: ChatSession)`
- **位置**：brian-frontend/src/views/ChatView.vue:24
- **引用次数**：2

#### `saveSessionTitle`

- **类型**：数据处理
- **说明**：写入/新增：会话 / title
- **签名**：`saveSessionTitle(sessionId: string)`
- **位置**：brian-frontend/src/views/ChatView.vue:29
- **引用次数**：3

#### `toggleSidebar`

- **类型**：数据处理
- **说明**：更新：sidebar
- **签名**：`toggleSidebar()`
- **位置**：brian-frontend/src/views/ChatView.vue:63
- **引用次数**：2

#### `toggleSelectAll`

- **类型**：通用算法
- **说明**：更新：select（纯计算，无外部 IO）
- **签名**：`toggleSelectAll()`
- **位置**：brian-frontend/src/views/ChatView.vue:86
- **引用次数**：2

#### `toggleSelect`

- **类型**：数据处理
- **说明**：更新：select
- **签名**：`toggleSelect(sessionId: string)`
- **位置**：brian-frontend/src/views/ChatView.vue:91
- **引用次数**：4

#### `handleSelectChat`

- **类型**：数据处理
- **说明**：处理执行：ndle / select / chat
- **签名**：`handleSelectChat(sessionId: string)`
- **位置**：brian-frontend/src/views/ChatView.vue:98
- **引用次数**：2

#### `handleNewChat`

- **类型**：数据处理
- **说明**：处理执行：ndle / chat
- **签名**：`handleNewChat()`
- **位置**：brian-frontend/src/views/ChatView.vue:110
- **引用次数**：2

#### `requestDeleteSession`

- **类型**：数据处理
- **说明**：处理 request / delete / 会话
- **签名**：`requestDeleteSession(sessionId: string)`
- **位置**：brian-frontend/src/views/ChatView.vue:117
- **引用次数**：6

#### `requestBatchDelete`

- **类型**：数据处理
- **说明**：处理 request / batch / delete
- **签名**：`requestBatchDelete()`
- **位置**：brian-frontend/src/views/ChatView.vue:121
- **引用次数**：6

#### `confirmDelete`

- **类型**：数据处理
- **说明**：处理 确认 / delete
- **签名**：`confirmDelete()`
- **位置**：brian-frontend/src/views/ChatView.vue:125
- **引用次数**：6

#### `formatTime`

- **类型**：通用算法
- **说明**：格式化/序列化：时间（纯计算，无外部 IO）
- **签名**：`formatTime(ts: number)`
- **位置**：brian-frontend/src/views/ChatView.vue:139
- **引用次数**：24

## 文件 `brian-frontend/src/views/ConfigView.vue`

### 模块级函数

#### `syncQuery`

- **类型**：数据处理
- **说明**：处理 query
- **签名**：`syncQuery()`
- **位置**：brian-frontend/src/views/ConfigView.vue:45
- **引用次数**：3

#### `toggleSection`

- **类型**：数据处理
- **说明**：更新：section
- **签名**：`toggleSection(key: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:54
- **引用次数**：2

#### `selectSub`

- **类型**：数据处理
- **说明**：界面控制：sub
- **签名**：`selectSub(sectionKey: string, subKey: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:60
- **引用次数**：3

#### `openSearch`

- **类型**：数据处理
- **说明**：启动：search
- **签名**：`openSearch()`
- **位置**：brian-frontend/src/views/ConfigView.vue:117
- **引用次数**：3

#### `closeSearch`

- **类型**：数据处理
- **说明**：删除/清理：search
- **签名**：`closeSearch()`
- **位置**：brian-frontend/src/views/ConfigView.vue:118
- **引用次数**：5

#### `navigateFromSearch`

- **类型**：数据处理
- **说明**：处理 navigate / search
- **签名**：`navigateFromSearch(sectionKey: string, subKey: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:119
- **引用次数**：2

#### `loadConfigTree`

- **类型**：逻辑控制
- **说明**：获取：配置 / 树形结构（含异常兜底，异步编排）
- **签名**：`loadConfigTree()`
- **位置**：brian-frontend/src/views/ConfigView.vue:147
- **引用次数**：9

#### `infoTypeLabel`

- **类型**：逻辑控制
- **说明**：处理 信息 / type / label
- **签名**：`infoTypeLabel(t: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:291
- **引用次数**：4

#### `infoCreatorLabel`

- **类型**：逻辑控制
- **说明**：处理 信息 / creator / label
- **签名**：`infoCreatorLabel(r: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:295
- **引用次数**：2

#### `formatVectorTime`

- **类型**：通用算法
- **说明**：格式化/序列化：向量 / 时间（纯计算，无外部 IO）
- **签名**：`formatVectorTime(ts: number): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:299
- **引用次数**：2

#### `runVectorDbSearch`

- **类型**：数据处理
- **说明**：处理执行：向量 / db / search（向量库）
- **签名**：`runVectorDbSearch()`
- **位置**：brian-frontend/src/views/ConfigView.vue:305
- **引用次数**：3

#### `runGraphSearch`

- **类型**：数据处理
- **说明**：处理执行：图 / search（图数据库）
- **签名**：`runGraphSearch()`
- **位置**：brian-frontend/src/views/ConfigView.vue:331
- **引用次数**：3

#### `jumpToLine`

- **类型**：通用算法
- **说明**：处理 jump / 行（纯计算，无外部 IO）
- **签名**：`jumpToLine()`
- **位置**：brian-frontend/src/views/ConfigView.vue:386
- **引用次数**：2

#### `searchInText`

- **类型**：数据处理
- **说明**：查询：文本
- **签名**：`searchInText(direction: 'next' \| 'prev')`
- **位置**：brian-frontend/src/views/ConfigView.vue:398
- **引用次数**：4

#### `toggleMqQueueSelection`

- **类型**：数据处理
- **说明**：更新：mq / 队列 / selection
- **签名**：`toggleMqQueueSelection(queue: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:430
- **引用次数**：2

#### `toggleAllMqQueues`

- **类型**：通用算法
- **说明**：更新：mq / queues（纯计算，无外部 IO）
- **签名**：`toggleAllMqQueues()`
- **位置**：brian-frontend/src/views/ConfigView.vue:437
- **引用次数**：2

#### `loadMqQueues`

- **类型**：通用算法
- **说明**：获取：mq / queues（纯计算，无外部 IO）
- **签名**：`loadMqQueues()`
- **位置**：brian-frontend/src/views/ConfigView.vue:446
- **引用次数**：5

#### `loadMqStats`

- **类型**：数据处理
- **说明**：获取：mq / stats
- **签名**：`loadMqStats()`
- **位置**：brian-frontend/src/views/ConfigView.vue:461
- **引用次数**：2

#### `fetchQueueStats`

- **类型**：通用算法
- **说明**：获取：队列 / stats（纯计算，无外部 IO）
- **签名**：`fetchQueueStats(queue: string): Promise<MQStats>`
- **位置**：brian-frontend/src/views/ConfigView.vue:471
- **引用次数**：6

#### `getQueueStats`

- **类型**：数据处理
- **说明**：获取：队列 / stats
- **签名**：`getQueueStats(queue: string): MQStats \| undefined`
- **位置**：brian-frontend/src/views/ConfigView.vue:481
- **引用次数**：6

#### `selectMqQueue`

- **类型**：逻辑控制
- **说明**：界面控制：mq / 队列（异步编排）
- **签名**：`selectMqQueue(queue: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:485
- **引用次数**：2

#### `sendMqMessage`

- **类型**：通用算法
- **说明**：发送通知：mq / 消息（纯计算，无外部 IO）
- **签名**：`sendMqMessage()`
- **位置**：brian-frontend/src/views/ConfigView.vue:498
- **引用次数**：3

#### `consumeMqMessage`

- **类型**：通用算法
- **说明**：处理 consume / mq / 消息（纯计算，无外部 IO）
- **签名**：`consumeMqMessage()`
- **位置**：brian-frontend/src/views/ConfigView.vue:518
- **引用次数**：2

#### `createMqQueue`

- **类型**：数据处理
- **说明**：写入/新增：mq / 队列
- **签名**：`createMqQueue()`
- **位置**：brian-frontend/src/views/ConfigView.vue:537
- **引用次数**：3

#### `deleteMqQueue`

- **类型**：通用算法
- **说明**：删除/清理：mq / 队列（纯计算，无外部 IO）
- **签名**：`deleteMqQueue(queue: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:554
- **引用次数**：2

#### `deleteSelectedMqQueues`

- **类型**：数据处理
- **说明**：删除/清理：selected / mq / queues
- **签名**：`deleteSelectedMqQueues()`
- **位置**：brian-frontend/src/views/ConfigView.vue:560
- **引用次数**：2

#### `purgeMqQueue`

- **类型**：数据处理
- **说明**：删除/清理：mq / 队列
- **签名**：`purgeMqQueue(queue: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:572
- **引用次数**：2

#### `resetMqQueue`

- **类型**：通用算法
- **说明**：删除/清理：mq / 队列（纯计算，无外部 IO）
- **签名**：`resetMqQueue(queue: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:591
- **引用次数**：2

#### `cancelReset`

- **类型**：逻辑控制
- **说明**：删除/清理：reset
- **签名**：`cancelReset()`
- **位置**：brian-frontend/src/views/ConfigView.vue:614
- **引用次数**：3

#### `saveDefaults`

- **类型**：数据处理
- **说明**：写入/新增：defaults
- **签名**：`saveDefaults()`
- **位置**：brian-frontend/src/views/ConfigView.vue:616
- **引用次数**：2

#### `executeReset`

- **类型**：逻辑控制
- **说明**：处理执行：reset（含异常兜底，异步编排）
- **签名**：`executeReset()`
- **位置**：brian-frontend/src/views/ConfigView.vue:626
- **引用次数**：2

#### `loadSnapshots`

- **类型**：数据处理
- **说明**：获取：snapshots
- **签名**：`loadSnapshots()`
- **位置**：brian-frontend/src/views/ConfigView.vue:650
- **引用次数**：4

#### `createSnapshot`

- **类型**：数据处理
- **说明**：写入/新增：快照
- **签名**：`createSnapshot()`
- **位置**：brian-frontend/src/views/ConfigView.vue:658
- **引用次数**：2

#### `deleteSnapshot`

- **类型**：数据处理
- **说明**：删除/清理：快照
- **签名**：`deleteSnapshot(id: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:666
- **引用次数**：2

#### `restoreSnapshot`

- **类型**：数据处理
- **说明**：处理 restore / 快照
- **签名**：`restoreSnapshot(id: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:672
- **引用次数**：2

#### `startEditName`

- **类型**：逻辑控制
- **说明**：启动：edit / name
- **签名**：`startEditName(snap: Snapshot)`
- **位置**：brian-frontend/src/views/ConfigView.vue:679
- **引用次数**：2

#### `saveSnapName`

- **类型**：数据处理
- **说明**：写入/新增：snap / name
- **签名**：`saveSnapName(_snap: Snapshot)`
- **位置**：brian-frontend/src/views/ConfigView.vue:684
- **引用次数**：3

#### `formatTime`

- **类型**：通用算法
- **说明**：格式化/序列化：时间（纯计算，无外部 IO）
- **签名**：`formatTime(ts: number)`
- **位置**：brian-frontend/src/views/ConfigView.vue:692
- **引用次数**：24

#### `formatDurationSeconds`

- **类型**：通用算法
- **说明**：格式化/序列化：耗时 / seconds（纯计算，无外部 IO）
- **签名**：`formatDurationSeconds(sec: number): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:698
- **引用次数**：3

#### `formatDurationMs`

- **类型**：通用算法
- **说明**：格式化/序列化：耗时 / ms（纯计算，无外部 IO）
- **签名**：`formatDurationMs(ms: number \| string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:708
- **引用次数**：2

#### `isTimeConfig`

- **类型**：通用算法
- **说明**：判断校验：时间 / 配置（纯计算，无外部 IO）
- **签名**：`isTimeConfig(key: string): boolean`
- **位置**：brian-frontend/src/views/ConfigView.vue:718
- **引用次数**：2

#### `isCronConfig`

- **类型**：逻辑控制
- **说明**：判断校验：定时任务 / 配置
- **签名**：`isCronConfig(key: string): boolean`
- **位置**：brian-frontend/src/views/ConfigView.vue:723
- **引用次数**：3

#### `isInfoTypesConfig`

- **类型**：逻辑控制
- **说明**：判断校验：信息 / types / 配置
- **签名**：`isInfoTypesConfig(key: string): boolean`
- **位置**：brian-frontend/src/views/ConfigView.vue:727
- **引用次数**：3

#### `isPriorityOrderConfig`

- **类型**：逻辑控制
- **说明**：判断校验：priority / order / 配置
- **签名**：`isPriorityOrderConfig(key: string): boolean`
- **位置**：brian-frontend/src/views/ConfigView.vue:731
- **引用次数**：4

#### `isSecondsConfig`

- **类型**：通用算法
- **说明**：判断校验：seconds / 配置（纯计算，无外部 IO）
- **签名**：`isSecondsConfig(key: string): boolean`
- **位置**：brian-frontend/src/views/ConfigView.vue:735
- **引用次数**：2

#### `formatConfigDuration`

- **类型**：通用算法
- **说明**：格式化/序列化：配置 / 耗时（纯计算，无外部 IO）
- **签名**：`formatConfigDuration(key: string, value: string \| number): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:739
- **引用次数**：2

#### `togglePromptSelect`

- **类型**：数据处理
- **说明**：更新：提示词 / select
- **签名**：`togglePromptSelect(id: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:768
- **引用次数**：2

#### `togglePromptSelectAll`

- **类型**：通用算法
- **说明**：更新：提示词 / select（纯计算，无外部 IO）
- **签名**：`togglePromptSelectAll()`
- **位置**：brian-frontend/src/views/ConfigView.vue:775
- **引用次数**：2

#### `getPromptTitle`

- **类型**：逻辑控制
- **说明**：获取：提示词 / title
- **签名**：`getPromptTitle(id: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:780
- **引用次数**：2

#### `loadPrompts`

- **类型**：逻辑控制
- **说明**：获取：prompts（含异常兜底，异步编排）
- **签名**：`loadPrompts()`
- **位置**：brian-frontend/src/views/ConfigView.vue:785
- **引用次数**：6

#### `openPromptModal`

- **类型**：数据处理
- **说明**：启动：提示词 / modal
- **签名**：`openPromptModal(p?: { id: string; title: string; brief: string; enabled: boolean })`
- **位置**：brian-frontend/src/views/ConfigView.vue:799
- **引用次数**：3

#### `closePromptModal`

- **类型**：逻辑控制
- **说明**：删除/清理：提示词 / modal
- **签名**：`closePromptModal()`
- **位置**：brian-frontend/src/views/ConfigView.vue:813
- **引用次数**：5

#### `savePrompt`

- **类型**：数据处理
- **说明**：写入/新增：提示词
- **签名**：`savePrompt()`
- **位置**：brian-frontend/src/views/ConfigView.vue:818
- **引用次数**：2

#### `handleDeletePrompt`

- **类型**：数据处理
- **说明**：处理执行：ndle / delete / 提示词
- **签名**：`handleDeletePrompt(id: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:844
- **引用次数**：2

#### `handleBatchDeletePrompts`

- **类型**：数据处理
- **说明**：处理执行：ndle / batch / delete / prompts
- **签名**：`handleBatchDeletePrompts()`
- **位置**：brian-frontend/src/views/ConfigView.vue:855
- **引用次数**：2

#### `getConfigPrimitiveValue`

- **类型**：通用算法
- **说明**：获取：配置 / primitive / 值（纯计算，无外部 IO）
- **签名**：`getConfigPrimitiveValue(item: ParamItem): unknown`
- **位置**：brian-frontend/src/views/ConfigView.vue:869
- **引用次数**：13

#### `getConfigDisplayValue`

- **类型**：通用算法
- **说明**：获取：配置 / display / 值（纯计算，无外部 IO）
- **签名**：`getConfigDisplayValue(item: ParamItem): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:884
- **引用次数**：2

#### `getOrchStrategyLabel`

- **类型**：逻辑控制
- **说明**：获取：orch / strategy / label
- **签名**：`getOrchStrategyLabel(strategyId: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:902
- **引用次数**：2

#### `enumLabel`

- **类型**：逻辑控制
- **说明**：处理 enum / label
- **签名**：`enumLabel(configKey: string, value: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:936
- **引用次数**：4

#### `startEditParam`

- **类型**：逻辑控制
- **说明**：启动：edit / param
- **签名**：`startEditParam(item: ParamItem)`
- **位置**：brian-frontend/src/views/ConfigView.vue:940
- **引用次数**：3

#### `parseParamValue`

- **类型**：通用算法
- **说明**：解析：param / 值（纯计算，无外部 IO）
- **签名**：`parseParamValue(raw: string, configType: string): unknown`
- **位置**：brian-frontend/src/views/ConfigView.vue:969
- **引用次数**：2

#### `confirmSaveParam`

- **类型**：逻辑控制
- **说明**：处理 确认 / save / param
- **签名**：`confirmSaveParam()`
- **位置**：brian-frontend/src/views/ConfigView.vue:977
- **引用次数**：2

#### `executeConfirmedSave`

- **类型**：数据处理
- **说明**：处理执行：confirmed / save
- **签名**：`executeConfirmedSave()`
- **位置**：brian-frontend/src/views/ConfigView.vue:986
- **引用次数**：3

#### `openHistory`

- **类型**：逻辑控制
- **说明**：启动：历史
- **签名**：`openHistory(item: ParamItem)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1004
- **引用次数**：2

#### `getCronExpression`

- **类型**：逻辑控制
- **说明**：获取：定时任务 / expression
- **签名**：`getCronExpression(item: ParamItem): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:1012
- **引用次数**：2

#### `saveCronConfig`

- **类型**：数据处理
- **说明**：写入/新增：定时任务 / 配置
- **签名**：`saveCronConfig(cron: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1017
- **引用次数**：2

#### `formatInfoTypesValue`

- **类型**：通用算法
- **说明**：格式化/序列化：信息 / types / 值（纯计算，无外部 IO）
- **签名**：`formatInfoTypesValue(value: unknown): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:1039
- **引用次数**：2

#### `availableInfoTypesFor`

- **类型**：通用算法
- **说明**：处理 available / 信息 / types（纯计算，无外部 IO）
- **签名**：`availableInfoTypesFor(currentIndex: number): string[]`
- **位置**：brian-frontend/src/views/ConfigView.vue:1046
- **引用次数**：2

#### `openInfoTypesModal`

- **类型**：通用算法
- **说明**：启动：信息 / types / modal（纯计算，无外部 IO）
- **签名**：`openInfoTypesModal(item: ParamItem)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1051
- **引用次数**：3

#### `closeInfoTypesModal`

- **类型**：逻辑控制
- **说明**：删除/清理：信息 / types / modal
- **签名**：`closeInfoTypesModal()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1060
- **引用次数**：5

#### `addInfoType`

- **类型**：逻辑控制
- **说明**：写入/新增：信息 / type
- **签名**：`addInfoType()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1066
- **引用次数**：2

#### `removeInfoType`

- **类型**：通用算法
- **说明**：删除/清理：信息 / type（纯计算，无外部 IO）
- **签名**：`removeInfoType(index: number)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1071
- **引用次数**：2

#### `saveInfoTypes`

- **类型**：数据处理
- **说明**：写入/新增：信息 / types
- **签名**：`saveInfoTypes()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1076
- **引用次数**：2

#### `formatPriorityOrderValue`

- **类型**：通用算法
- **说明**：格式化/序列化：priority / order / 值（纯计算，无外部 IO）
- **签名**：`formatPriorityOrderValue(value: unknown): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:1100
- **引用次数**：3

#### `openPriorityOrderModal`

- **类型**：通用算法
- **说明**：启动：priority / order / modal（纯计算，无外部 IO）
- **签名**：`openPriorityOrderModal(item: ParamItem)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1107
- **引用次数**：3

#### `closePriorityOrderModal`

- **类型**：逻辑控制
- **说明**：删除/清理：priority / order / modal
- **签名**：`closePriorityOrderModal()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1123
- **引用次数**：5

#### `togglePrioritySource`

- **类型**：通用算法
- **说明**：更新：priority / source（纯计算，无外部 IO）
- **签名**：`togglePrioritySource(source: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1131
- **引用次数**：2

#### `movePriorityItem`

- **类型**：通用算法
- **说明**：更新：priority / 条目（纯计算，无外部 IO）
- **签名**：`movePriorityItem(from: number, to: number)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1136
- **引用次数**：2

#### `onPriorityDragStart`

- **类型**：逻辑控制
- **说明**：处理执行：priority / 拖拽 / start
- **签名**：`onPriorityDragStart(index: number)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1144
- **引用次数**：2

#### `onPriorityDragOver`

- **类型**：逻辑控制
- **说明**：处理执行：priority / 拖拽 / over
- **签名**：`onPriorityDragOver(index: number)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1148
- **引用次数**：2

#### `onPriorityDrop`

- **类型**：逻辑控制
- **说明**：处理执行：priority / drop
- **签名**：`onPriorityDrop(index: number)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1152
- **引用次数**：2

#### `onPriorityDragEnd`

- **类型**：逻辑控制
- **说明**：处理执行：priority / 拖拽 / end
- **签名**：`onPriorityDragEnd()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1159
- **引用次数**：2

#### `savePriorityOrder`

- **类型**：数据处理
- **说明**：写入/新增：priority / order
- **签名**：`savePriorityOrder()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1164
- **引用次数**：2

#### `cancelEditParam`

- **类型**：逻辑控制
- **说明**：删除/清理：edit / param
- **签名**：`cancelEditParam()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1180
- **引用次数**：3

#### `saveParam`

- **类型**：数据处理
- **说明**：写入/新增：param
- **签名**：`saveParam()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1191
- **引用次数**：2

#### `saveCard`

- **类型**：数据处理
- **说明**：写入/新增：card
- **签名**：`saveCard(item: ParamItem)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1210
- **引用次数**：2

#### `toggleModelSelection`

- **类型**：数据处理
- **说明**：更新：模型 / selection
- **签名**：`toggleModelSelection(modelId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1282
- **引用次数**：2

#### `handleAddModels`

- **类型**：数据处理
- **说明**：处理执行：ndle / models（序列化输出）
- **签名**：`handleAddModels(providerId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1292
- **引用次数**：2

#### `selectAllModels`

- **类型**：通用算法
- **说明**：界面控制：models（纯计算，无外部 IO）
- **签名**：`selectAllModels()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1309
- **引用次数**：2

#### `loadCachedModels`

- **类型**：逻辑控制
- **说明**：获取：cached / models（含异常兜底，异步编排）
- **签名**：`loadCachedModels(providerId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1318
- **引用次数**：2

#### `handleFetchModels`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / models（含异常兜底，异步编排）
- **签名**：`handleFetchModels(providerId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1330
- **引用次数**：2

#### `loadProviders`

- **类型**：通用算法
- **说明**：获取：providers（纯计算，无外部 IO）
- **签名**：`loadProviders()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1350
- **引用次数**：4

#### `openProviderModal`

- **类型**：数据处理
- **说明**：启动：Provider / modal
- **签名**：`openProviderModal(provider?: BackendProvider)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1381
- **引用次数**：3

#### `closeProviderModal`

- **类型**：数据处理
- **说明**：删除/清理：Provider / modal
- **签名**：`closeProviderModal()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1417
- **引用次数**：5

#### `submitProviderForm`

- **类型**：数据处理
- **说明**：处理 submit / Provider / form（序列化输出）
- **签名**：`submitProviderForm()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1429
- **引用次数**：2

#### `handleDeleteProvider`

- **类型**：数据处理
- **说明**：处理执行：ndle / delete / Provider
- **签名**：`handleDeleteProvider(providerId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1464
- **引用次数**：2

#### `handleToggleProvider`

- **类型**：数据处理
- **说明**：处理执行：ndle / toggle / Provider（序列化输出）
- **签名**：`handleToggleProvider(providerId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1474
- **引用次数**：2

#### `handleTestProvider`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / test / Provider（含异常兜底，异步编排）
- **签名**：`handleTestProvider(providerId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1491
- **引用次数**：2

#### `sendModelChat`

- **类型**：数据处理
- **说明**：发送通知：模型 / chat（向量库，序列化输出）
- **签名**：`sendModelChat()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1553
- **引用次数**：2

#### `loadModels`

- **类型**：逻辑控制
- **说明**：获取：models（含异常兜底，遍历调度，异步编排）
- **签名**：`loadModels()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1598
- **引用次数**：6

#### `openModelModal`

- **类型**：逻辑控制
- **说明**：启动：模型 / modal
- **签名**：`openModelModal(model?: BackendModel)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1617
- **引用次数**：2

#### `closeModelModal`

- **类型**：逻辑控制
- **说明**：删除/清理：模型 / modal
- **签名**：`closeModelModal()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1644
- **引用次数**：5

#### `autoFillModelAttr`

- **类型**：逻辑控制
- **说明**：处理 auto / fill / 模型 / attr（含异常兜底，异步编排）
- **签名**：`autoFillModelAttr()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1646
- **引用次数**：2

#### `submitModelForm`

- **类型**：数据处理
- **说明**：处理 submit / 模型 / form（序列化输出）
- **签名**：`submitModelForm()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1665
- **引用次数**：2

#### `handleDeleteModel`

- **类型**：数据处理
- **说明**：处理执行：ndle / delete / 模型
- **签名**：`handleDeleteModel(modelId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1694
- **引用次数**：2

#### `handleSetDefault`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / default（含异常兜底，异步编排）
- **签名**：`handleSetDefault(modelId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1704
- **引用次数**：2

#### `handleToggleModel`

- **类型**：数据处理
- **说明**：处理执行：ndle / toggle / 模型
- **签名**：`handleToggleModel(modelId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1714
- **引用次数**：2

#### `loadSouls`

- **类型**：通用算法
- **说明**：获取：souls（纯计算，无外部 IO）
- **签名**：`loadSouls()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1747
- **引用次数**：4

#### `openSoulModal`

- **类型**：逻辑控制
- **说明**：启动：人设 / modal
- **签名**：`openSoulModal(soul?: BackendSoul)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1762
- **引用次数**：3

#### `closeSoulModal`

- **类型**：逻辑控制
- **说明**：删除/清理：人设 / modal
- **签名**：`closeSoulModal()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1777
- **引用次数**：5

#### `submitSoulForm`

- **类型**：数据处理
- **说明**：处理 submit / 人设 / form（序列化输出）
- **签名**：`submitSoulForm()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1779
- **引用次数**：2

#### `handleDeleteSoul`

- **类型**：数据处理
- **说明**：处理执行：ndle / delete / 人设
- **签名**：`handleDeleteSoul(soulId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1802
- **引用次数**：2

#### `handleToggleSoul`

- **类型**：数据处理
- **说明**：处理执行：ndle / toggle / 人设
- **签名**：`handleToggleSoul(soulId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1812
- **引用次数**：2

#### `loadProfileDirections`

- **类型**：逻辑控制
- **说明**：获取：画像 / directions（含异常兜底，异步编排）
- **签名**：`loadProfileDirections()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1842
- **引用次数**：4

#### `openProfileDirModal`

- **类型**：逻辑控制
- **说明**：启动：画像 / 目录 / modal
- **签名**：`openProfileDirModal(d?: ProfileDirection)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1851
- **引用次数**：3

#### `closeProfileDirModal`

- **类型**：逻辑控制
- **说明**：删除/清理：画像 / 目录 / modal
- **签名**：`closeProfileDirModal()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1868
- **引用次数**：4

#### `saveProfileDir`

- **类型**：数据处理
- **说明**：写入/新增：画像 / 目录（序列化输出）
- **签名**：`saveProfileDir()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1870
- **引用次数**：2

#### `deleteProfileDir`

- **类型**：数据处理
- **说明**：删除/清理：画像 / 目录（序列化输出）
- **签名**：`deleteProfileDir(dirKey: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1895
- **引用次数**：2

#### `toggleProfileDir`

- **类型**：数据处理
- **说明**：更新：画像 / 目录（序列化输出）
- **签名**：`toggleProfileDir(dir: ProfileDirection)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1904
- **引用次数**：2

#### `addFileEntry`

- **类型**：逻辑控制
- **说明**：写入/新增：文件 / entry
- **签名**：`addFileEntry(arr: SkillFileEntry[])`
- **位置**：brian-frontend/src/views/ConfigView.vue:1966
- **引用次数**：2

#### `removeFileEntry`

- **类型**：通用算法
- **说明**：删除/清理：文件 / entry（纯计算，无外部 IO）
- **签名**：`removeFileEntry(arr: SkillFileEntry[], idx: number)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1969
- **引用次数**：2

#### `loadSkills`

- **类型**：通用算法
- **说明**：获取：skills（纯计算，无外部 IO）
- **签名**：`loadSkills()`
- **位置**：brian-frontend/src/views/ConfigView.vue:1973
- **引用次数**：7

#### `openSkillModal`

- **类型**：通用算法
- **说明**：启动：技能 / modal（纯计算，无外部 IO）
- **签名**：`openSkillModal(skill?: BackendSkill)`
- **位置**：brian-frontend/src/views/ConfigView.vue:1989
- **引用次数**：3

#### `closeSkillModal`

- **类型**：逻辑控制
- **说明**：删除/清理：技能 / modal
- **签名**：`closeSkillModal()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2011
- **引用次数**：6

#### `submitSkillForm`

- **类型**：数据处理
- **说明**：处理 submit / 技能 / form
- **签名**：`submitSkillForm()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2041
- **引用次数**：4

#### `handleDeleteSkill`

- **类型**：数据处理
- **说明**：处理执行：ndle / delete / 技能
- **签名**：`handleDeleteSkill(skillId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2075
- **引用次数**：2

#### `handleToggleSkill`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / toggle / 技能（含异常兜底，异步编排）
- **签名**：`handleToggleSkill(skillId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2090
- **引用次数**：2

#### `openSkillTestModal`

- **类型**：逻辑控制
- **说明**：启动：技能 / test / modal
- **签名**：`openSkillTestModal(skill: BackendSkill)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2111
- **引用次数**：2

#### `closeSkillTestModal`

- **类型**：逻辑控制
- **说明**：删除/清理：技能 / test / modal
- **签名**：`closeSkillTestModal()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2118
- **引用次数**：4

#### `executeSkillTest`

- **类型**：数据处理
- **说明**：处理执行：技能 / test（序列化输出，反序列化）
- **签名**：`executeSkillTest()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2124
- **引用次数**：2

#### `loadMcps`

- **类型**：逻辑控制
- **说明**：获取：mcps（含异常兜底，异步编排）
- **签名**：`loadMcps()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2173
- **引用次数**：12

#### `loadMcpUsage`

- **类型**：逻辑控制
- **说明**：获取：MCP 通道 / 用量（含异常兜底，异步编排）
- **签名**：`loadMcpUsage()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2185
- **引用次数**：3

#### `handleBatchStartMcp`

- **类型**：数据处理
- **说明**：处理执行：ndle / batch / MCP 通道（序列化输出）
- **签名**：`handleBatchStartMcp()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2215
- **引用次数**：2

#### `handleRefreshMcp`

- **类型**：数据处理
- **说明**：处理执行：ndle / refresh / MCP 通道
- **签名**：`handleRefreshMcp()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2233
- **引用次数**：2

#### `handleToggleMcp`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / toggle / MCP 通道（含异常兜底，异步编排）
- **签名**：`handleToggleMcp(mcpId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2248
- **引用次数**：2

#### `setupMcpMarketObserver`

- **类型**：逻辑控制
- **说明**：更新：MCP 通道 / market / observer
- **签名**：`setupMcpMarketObserver()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2304
- **引用次数**：2

#### `onMcpMarketScroll`

- **类型**：逻辑控制
- **说明**：处理执行：MCP 通道 / market / 滚动
- **签名**：`onMcpMarketScroll()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2322
- **引用次数**：2

#### `scrollMcpMarketToTop`

- **类型**：逻辑控制
- **说明**：界面控制：MCP 通道 / market / top
- **签名**：`scrollMcpMarketToTop()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2326
- **引用次数**：2

#### `openMcpConfigModal`

- **类型**：数据处理
- **说明**：启动：MCP 通道 / 配置 / modal（浏览器本地存储）
- **签名**：`openMcpConfigModal(providerId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2351
- **引用次数**：2

#### `closeMcpConfigModal`

- **类型**：逻辑控制
- **说明**：删除/清理：MCP 通道 / 配置 / modal
- **签名**：`closeMcpConfigModal()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2358
- **引用次数**：4

#### `saveMcpConfig`

- **类型**：数据处理
- **说明**：写入/新增：MCP 通道 / 配置（浏览器本地存储）
- **签名**：`saveMcpConfig()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2362
- **引用次数**：2

#### `handleClearMcpApiKey`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / clear / MCP 通道 / api
- **签名**：`handleClearMcpApiKey()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2374
- **引用次数**：2

#### `loadMcpProviders`

- **类型**：通用算法
- **说明**：获取：MCP 通道 / providers（纯计算，无外部 IO）
- **签名**：`loadMcpProviders()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2387
- **引用次数**：2

#### `toggleMcpMarket`

- **类型**：数据处理
- **说明**：更新：MCP 通道 / market
- **签名**：`toggleMcpMarket(providerId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2406
- **引用次数**：2

#### `loadMcpMarketTools`

- **类型**：数据处理
- **说明**：获取：MCP 通道 / market / tools（序列化输出）
- **签名**：`loadMcpMarketTools(providerId: string, reset: unknown)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2424
- **引用次数**：6

#### `loadMoreMcpTools`

- **类型**：逻辑控制
- **说明**：获取：more / MCP 通道 / tools
- **签名**：`loadMoreMcpTools()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2473
- **引用次数**：2

#### `onMcpMarketSearchChange`

- **类型**：数据处理
- **说明**：处理执行：MCP 通道 / market / change
- **签名**：`onMcpMarketSearchChange()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2490
- **引用次数**：2

#### `handleRefreshMcpList`

- **类型**：数据处理
- **说明**：处理执行：ndle / refresh / MCP 通道 / 列表
- **签名**：`handleRefreshMcpList(providerId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2495
- **引用次数**：2

#### `handleTestMcpProvider`

- **类型**：通用算法
- **说明**：处理执行：ndle / test / MCP 通道 / Provider（纯计算，无外部 IO）
- **签名**：`handleTestMcpProvider(providerId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2514
- **引用次数**：2

#### `handleInstallMcp`

- **类型**：数据处理
- **说明**：处理执行：ndle / install / MCP 通道（序列化输出）
- **签名**：`handleInstallMcp(providerId: string, toolId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2532
- **引用次数**：2

#### `handleStartMcp`

- **类型**：数据处理
- **说明**：处理执行：ndle / MCP 通道（序列化输出）
- **签名**：`handleStartMcp(mcpId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2549
- **引用次数**：2

#### `handleStopMcp`

- **类型**：数据处理
- **说明**：处理执行：ndle / MCP 通道（序列化输出）
- **签名**：`handleStopMcp(mcpId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2559
- **引用次数**：2

#### `handleUpgradeMcp`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / upgrade / MCP 通道（含异常兜底，异步编排）
- **签名**：`handleUpgradeMcp(mcpId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2569
- **引用次数**：2

#### `handleUninstallMcp`

- **类型**：数据处理
- **说明**：处理执行：ndle / uninstall / MCP 通道（序列化输出）
- **签名**：`handleUninstallMcp(mcpId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2579
- **引用次数**：2

#### `getStrategyLabel`

- **类型**：逻辑控制
- **说明**：获取：strategy / label
- **签名**：`getStrategyLabel(strategyId: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:2628
- **引用次数**：3

#### `getModelName`

- **类型**：逻辑控制
- **说明**：获取：模型 / name
- **签名**：`getModelName(modelId: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:2632
- **引用次数**：3

#### `getSoulName`

- **类型**：逻辑控制
- **说明**：获取：人设 / name
- **签名**：`getSoulName(soulId: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:2636
- **引用次数**：3

#### `loadAgents`

- **类型**：逻辑控制
- **说明**：获取：agents（含异常兜底，异步编排）
- **签名**：`loadAgents()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2641
- **引用次数**：4

#### `openAgentModal`

- **类型**：逻辑控制
- **说明**：启动：Agent / modal（异步编排）
- **签名**：`openAgentModal(agent?: BackendAgent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2674
- **引用次数**：5

#### `closeAgentModal`

- **类型**：逻辑控制
- **说明**：删除/清理：Agent / modal
- **签名**：`closeAgentModal()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2697
- **引用次数**：5

#### `submitAgentForm`

- **类型**：数据处理
- **说明**：处理 submit / Agent / form
- **签名**：`submitAgentForm()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2699
- **引用次数**：2

#### `handleDeleteAgent`

- **类型**：数据处理
- **说明**：处理执行：ndle / delete / Agent
- **签名**：`handleDeleteAgent(agentId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2727
- **引用次数**：2

#### `handleToggleAgent`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / toggle / Agent（含异常兜底，异步编排）
- **签名**：`handleToggleAgent(agentId: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2737
- **引用次数**：2

#### `openOrchStrategyDetail`

- **类型**：逻辑控制
- **说明**：启动：orch / strategy / detail
- **签名**：`openOrchStrategyDetail(s: OrchStrategy)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2777
- **引用次数**：2

#### `closeOrchStrategyDetail`

- **类型**：逻辑控制
- **说明**：删除/清理：orch / strategy / detail
- **签名**：`closeOrchStrategyDetail()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2782
- **引用次数**：3

#### `orchNodeNumber`

- **类型**：通用算法
- **说明**：处理 orch / 节点 / 数值（纯计算，无外部 IO）
- **签名**：`orchNodeNumber(nodeId: string \| null \| undefined): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:2787
- **引用次数**：6

#### `nodeColor`

- **类型**：数据处理
- **说明**：处理 节点 / color
- **签名**：`nodeColor(type: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:2794
- **引用次数**：5

#### `loadOrchStrategies`

- **类型**：逻辑控制
- **说明**：获取：orch / strategies（含异常兜底，异步编排）
- **签名**：`loadOrchStrategies()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2804
- **引用次数**：3

#### `formatStrategyRule`

- **类型**：数据处理
- **说明**：格式化/序列化：strategy / rule（反序列化）
- **签名**：`formatStrategyRule(rule: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:2834
- **引用次数**：2

#### `parseDomains`

- **类型**：数据处理
- **说明**：解析：domains（反序列化）
- **签名**：`parseDomains(domains: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:2845
- **引用次数**：4

#### `prettyJson`

- **类型**：数据处理
- **说明**：处理 pretty / JSON（序列化输出，反序列化）
- **签名**：`prettyJson(s: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:2854
- **引用次数**：2

#### `loadAgentStrategies`

- **类型**：逻辑控制
- **说明**：获取：Agent / strategies（含异常兜底，异步编排）
- **签名**：`loadAgentStrategies()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2862
- **引用次数**：3

#### `parseStrategyRule`

- **类型**：数据处理
- **说明**：解析：strategy / rule（反序列化）
- **签名**：`parseStrategyRule(rule: string): ParsedStrategyRule`
- **位置**：brian-frontend/src/views/ConfigView.vue:2897
- **引用次数**：2

#### `toggleStrategy`

- **类型**：通用算法
- **说明**：更新：strategy（纯计算，无外部 IO）
- **签名**：`toggleStrategy(s: AgentStrategy)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2912
- **引用次数**：6

#### `openStrategyDetail`

- **类型**：逻辑控制
- **说明**：启动：strategy / detail
- **签名**：`openStrategyDetail(s: AgentStrategy)`
- **位置**：brian-frontend/src/views/ConfigView.vue:2929
- **引用次数**：2

#### `closeStrategyDetail`

- **类型**：逻辑控制
- **说明**：删除/清理：strategy / detail
- **签名**：`closeStrategyDetail()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2934
- **引用次数**：3

#### `showToast`

- **类型**：逻辑控制
- **说明**：界面控制：toast
- **签名**：`showToast(message: string, type: 'success' \| 'error')`
- **位置**：brian-frontend/src/views/ConfigView.vue:2948
- **引用次数**：120

#### `loadCDTStatus`

- **类型**：逻辑控制
- **说明**：获取：CDT / 状态（含异常兜底，异步编排）
- **签名**：`loadCDTStatus()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2964
- **引用次数**：6

#### `startCDT`

- **类型**：逻辑控制
- **说明**：启动：CDT（含异常兜底，异步编排）
- **签名**：`startCDT()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2971
- **引用次数**：12

#### `stopCDT`

- **类型**：逻辑控制
- **说明**：删除/清理：CDT（含异常兜底，异步编排）
- **签名**：`stopCDT()`
- **位置**：brian-frontend/src/views/ConfigView.vue:2977
- **引用次数**：9

#### `applyCdtScreencastSettings`

- **类型**：数据处理
- **说明**：更新：CDT / screencast / settings（浏览器本地存储）
- **签名**：`applyCdtScreencastSettings(w: number, h: number, q: number)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3004
- **引用次数**：3

#### `getSavedCDTSessions`

- **类型**：数据处理
- **说明**：获取：saved / CDT / sessions（反序列化，浏览器本地存储）
- **签名**：`getSavedCDTSessions(): Record<string, CDTStoredSession>`
- **位置**：brian-frontend/src/views/ConfigView.vue:3013
- **引用次数**：4

#### `saveCDTSession`

- **类型**：数据处理
- **说明**：写入/新增：CDT / 会话（序列化输出，浏览器本地存储）
- **签名**：`saveCDTSession(domain: string, cookiesJson: string, url: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3017
- **引用次数**：2

#### `cdtNavigate`

- **类型**：数据处理
- **说明**：处理 CDT / navigate（浏览器本地存储）
- **签名**：`cdtNavigate()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3027
- **引用次数**：6

#### `spoofBrowserEnv`

- **类型**：通用算法
- **说明**：处理 spoof / 浏览器 / env（纯计算，无外部 IO）
- **签名**：`spoofBrowserEnv()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3044
- **引用次数**：2

#### `startFramePoll`

- **类型**：逻辑控制
- **说明**：启动：框架 / poll（含异常兜底，异步编排）
- **签名**：`startFramePoll()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3061
- **引用次数**：3

#### `stopFramePoll`

- **类型**：逻辑控制
- **说明**：删除/清理：框架 / poll
- **签名**：`stopFramePoll()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3077
- **引用次数**：3

#### `getBrowserCoords`

- **类型**：数据处理
- **说明**：获取：浏览器 / coords
- **签名**：`getBrowserCoords(e: MouseEvent): { x: number; y: number } \| null`
- **位置**：brian-frontend/src/views/ConfigView.vue:3081
- **引用次数**：6

#### `mods`

- **类型**：逻辑控制
- **说明**：处理 mods
- **签名**：`mods(e: MouseEvent \| KeyboardEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3099
- **引用次数**：14

#### `onBrowserMouseDown`

- **类型**：逻辑控制
- **说明**：处理执行：浏览器 / 鼠标 / down（异步编排）
- **签名**：`onBrowserMouseDown(e: MouseEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3103
- **引用次数**：2

#### `onBrowserMouseMove`

- **类型**：通用算法
- **说明**：处理执行：浏览器 / 鼠标 / move（纯计算，无外部 IO）
- **签名**：`onBrowserMouseMove(e: MouseEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3119
- **引用次数**：2

#### `onBrowserMouseUp`

- **类型**：逻辑控制
- **说明**：处理执行：浏览器 / 鼠标 / up（异步编排）
- **签名**：`onBrowserMouseUp(_e: MouseEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3130
- **引用次数**：2

#### `onBrowserMouseLeave`

- **类型**：逻辑控制
- **说明**：处理执行：浏览器 / 鼠标 / leave（异步编排）
- **签名**：`onBrowserMouseLeave(e: MouseEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3138
- **引用次数**：2

#### `onBrowserDblClick`

- **类型**：逻辑控制
- **说明**：处理执行：浏览器 / dbl / 点击（异步编排）
- **签名**：`onBrowserDblClick(e: MouseEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3149
- **引用次数**：2

#### `onBrowserContextMenu`

- **类型**：逻辑控制
- **说明**：处理执行：浏览器 / 上下文 / menu
- **签名**：`onBrowserContextMenu(e: MouseEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3158
- **引用次数**：2

#### `hideCtxMenu`

- **类型**：逻辑控制
- **说明**：界面控制：menu
- **签名**：`hideCtxMenu()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3176
- **引用次数**：6

#### `ctxCopy`

- **类型**：逻辑控制
- **说明**：处理 复制（异步编排）
- **签名**：`ctxCopy()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3178
- **引用次数**：2

#### `ctxPaste`

- **类型**：逻辑控制
- **说明**：处理 粘贴（异步编排）
- **签名**：`ctxPaste()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3187
- **引用次数**：2

#### `ctxSelectAll`

- **类型**：逻辑控制
- **说明**：处理 select（异步编排）
- **签名**：`ctxSelectAll()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3193
- **引用次数**：2

#### `doRemotePaste`

- **类型**：数据处理
- **说明**：处理执行：remote / 粘贴
- **签名**：`doRemotePaste()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3204
- **引用次数**：4

#### `onBrowserKeyDown`

- **类型**：逻辑控制
- **说明**：处理执行：浏览器 / 键 / down（异步编排）
- **签名**：`onBrowserKeyDown(e: KeyboardEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3241
- **引用次数**：2

#### `setupRemotePasteListener`

- **类型**：数据处理
- **说明**：更新：remote / 粘贴 / listener
- **签名**：`setupRemotePasteListener()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3273
- **引用次数**：2

#### `onBrowserKeyUp`

- **类型**：逻辑控制
- **说明**：处理执行：浏览器 / 键 / up（异步编排）
- **签名**：`onBrowserKeyUp(e: KeyboardEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3292
- **引用次数**：2

#### `onBrowserPaste`

- **类型**：逻辑控制
- **说明**：处理执行：浏览器 / 粘贴（异步编排）
- **签名**：`onBrowserPaste(e: ClipboardEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3305
- **引用次数**：2

#### `onBrowserWheel`

- **类型**：数据处理
- **说明**：处理执行：浏览器 / wheel
- **签名**：`onBrowserWheel(e: WheelEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3310
- **引用次数**：2

#### `cdtSaveCredential`

- **类型**：数据处理
- **说明**：处理 CDT / save / credential
- **签名**：`cdtSaveCredential()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3324
- **引用次数**：2

#### `cdtRestoreCredential`

- **类型**：数据处理
- **说明**：处理 CDT / restore / credential（反序列化）
- **签名**：`cdtRestoreCredential(domain: string, cookiesJson: string, url: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3336
- **引用次数**：2

#### `cdtDeleteCredential`

- **类型**：数据处理
- **说明**：处理 CDT / delete / credential（序列化输出，浏览器本地存储）
- **签名**：`cdtDeleteCredential(domain: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3356
- **引用次数**：2

#### `extractDomain`

- **类型**：逻辑控制
- **说明**：解析：domain（含异常兜底）
- **签名**：`extractDomain(url: string): string`
- **位置**：brian-frontend/src/views/ConfigView.vue:3363
- **引用次数**：2

#### `loadBookmarks`

- **类型**：通用算法
- **说明**：获取：bookmarks（纯计算，无外部 IO）
- **签名**：`loadBookmarks()`
- **位置**：brian-frontend/src/views/ConfigView.vue:3381
- **引用次数**：7

#### `flattenFolders`

- **类型**：通用算法
- **说明**：转换归并：folders（纯计算，无外部 IO）
- **签名**：`flattenFolders(tree: BookmarkFolder[]): BookmarkFolder[]`
- **位置**：brian-frontend/src/views/ConfigView.vue:3393
- **引用次数**：3

#### `toggleFolder`

- **类型**：数据处理
- **说明**：更新：文件夹
- **签名**：`toggleFolder(id: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3397
- **引用次数**：2

#### `addBookmarkItem`

- **类型**：通用算法
- **说明**：写入/新增：书签 / 条目（纯计算，无外部 IO）
- **签名**：`addBookmarkItem(url?: string, title?: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3404
- **引用次数**：2

#### `removeFolder`

- **类型**：数据处理
- **说明**：删除/清理：文件夹
- **签名**：`removeFolder(id: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3417
- **引用次数**：2

#### `removeBookmarkItem`

- **类型**：数据处理
- **说明**：删除/清理：书签 / 条目
- **签名**：`removeBookmarkItem(id: string)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3423
- **引用次数**：2

#### `handleKeydown`

- **类型**：数据处理
- **说明**：处理执行：ndle / keydown
- **签名**：`handleKeydown(e: KeyboardEvent)`
- **位置**：brian-frontend/src/views/ConfigView.vue:3438
- **引用次数**：3

## 文件 `brian-frontend/src/views/CronView.vue`

### 模块级函数

#### `loadTasks`

- **类型**：逻辑控制
- **说明**：获取：tasks（含异常兜底，异步编排）
- **签名**：`loadTasks()`
- **位置**：brian-frontend/src/views/CronView.vue:23
- **引用次数**：3

#### `toggleEnabled`

- **类型**：数据处理
- **说明**：更新：enabled
- **签名**：`toggleEnabled(task: CronTask)`
- **位置**：brian-frontend/src/views/CronView.vue:35
- **引用次数**：2

#### `openEdit`

- **类型**：逻辑控制
- **说明**：启动：edit
- **签名**：`openEdit(task: CronTask)`
- **位置**：brian-frontend/src/views/CronView.vue:47
- **引用次数**：2

#### `saveCron`

- **类型**：数据处理
- **说明**：写入/新增：定时任务
- **签名**：`saveCron(cron: string)`
- **位置**：brian-frontend/src/views/CronView.vue:52
- **引用次数**：2

#### `triggerTask`

- **类型**：逻辑控制
- **说明**：处理执行：任务（含异常兜底，异步编排）
- **签名**：`triggerTask(task: CronTask)`
- **位置**：brian-frontend/src/views/CronView.vue:68
- **引用次数**：2

#### `loadRuns`

- **类型**：逻辑控制
- **说明**：获取：runs（含异常兜底，异步编排）
- **签名**：`loadRuns(name: string)`
- **位置**：brian-frontend/src/views/CronView.vue:80
- **引用次数**：3

#### `openRuns`

- **类型**：逻辑控制
- **说明**：启动：runs（异步编排）
- **签名**：`openRuns(task: CronTask)`
- **位置**：brian-frontend/src/views/CronView.vue:86
- **引用次数**：3

#### `closeRuns`

- **类型**：逻辑控制
- **说明**：删除/清理：runs
- **签名**：`closeRuns()`
- **位置**：brian-frontend/src/views/CronView.vue:92
- **引用次数**：3

#### `formatTime`

- **类型**：通用算法
- **说明**：格式化/序列化：时间（纯计算，无外部 IO）
- **签名**：`formatTime(ts: number): string`
- **位置**：brian-frontend/src/views/CronView.vue:97
- **引用次数**：24

#### `formatDuration`

- **类型**：通用算法
- **说明**：格式化/序列化：耗时（纯计算，无外部 IO）
- **签名**：`formatDuration(run: CronTaskRun): string`
- **位置**：brian-frontend/src/views/CronView.vue:102
- **引用次数**：13

## 文件 `brian-frontend/src/views/HomeView.vue`

### 模块级函数

#### `scrollToSection`

- **类型**：逻辑控制
- **说明**：界面控制：section
- **签名**：`scrollToSection(id: string)`
- **位置**：brian-frontend/src/views/HomeView.vue:39
- **引用次数**：8

#### `loadLastRunOverview`

- **类型**：数据处理
- **说明**：获取：overview（网络请求）
- **签名**：`loadLastRunOverview()`
- **位置**：brian-frontend/src/views/HomeView.vue:65
- **引用次数**：2

#### `isEdgeHot`

- **类型**：逻辑控制
- **说明**：判断校验：连线 / hot
- **签名**：`isEdgeHot(edge: { from: string; to: string })`
- **位置**：brian-frontend/src/views/HomeView.vue:159
- **引用次数**：2

#### `runTimeline`

- **类型**：逻辑控制
- **说明**：处理执行：timeline
- **签名**：`runTimeline(idx: number)`
- **位置**：brian-frontend/src/views/HomeView.vue:175
- **引用次数**：4

#### `copyQqGroup`

- **类型**：逻辑控制
- **说明**：处理 复制 / QQ / group（含异常兜底，异步编排）
- **签名**：`copyQqGroup()`
- **位置**：brian-frontend/src/views/HomeView.vue:211
- **引用次数**：2

#### `goChat`

- **类型**：逻辑控制
- **说明**：处理 go / chat
- **签名**：`goChat()`
- **位置**：brian-frontend/src/views/HomeView.vue:219
- **引用次数**：3

## 文件 `brian-frontend/src/views/ToolView.vue`

### 模块级函数

#### `copyText`

- **类型**：逻辑控制
- **说明**：处理 复制 / 文本（异步编排）
- **签名**：`copyText(text: string)`
- **位置**：brian-frontend/src/views/ToolView.vue:22
- **引用次数**：4

#### `generateIds`

- **类型**：通用算法
- **说明**：构建/初始化：ids（纯计算，无外部 IO）
- **签名**：`generateIds()`
- **位置**：brian-frontend/src/views/ToolView.vue:30
- **引用次数**：9

#### `setJsonResult`

- **类型**：逻辑控制
- **说明**：更新：JSON / result
- **签名**：`setJsonResult(out: ToolCheckResult \| ToolTransformResult \| null, outputText: unknown)`
- **位置**：brian-frontend/src/views/ToolView.vue:44
- **引用次数**：4

#### `jsonCheck`

- **类型**：逻辑控制
- **说明**：处理 JSON / check（异步编排）
- **签名**：`jsonCheck()`
- **位置**：brian-frontend/src/views/ToolView.vue:57
- **引用次数**：10

#### `jsonFormat`

- **类型**：逻辑控制
- **说明**：处理 JSON / format（异步编排）
- **签名**：`jsonFormat()`
- **位置**：brian-frontend/src/views/ToolView.vue:60
- **引用次数**：10

#### `jsonMinify`

- **类型**：逻辑控制
- **说明**：处理 JSON / minify（异步编排）
- **签名**：`jsonMinify()`
- **位置**：brian-frontend/src/views/ToolView.vue:64
- **引用次数**：10

#### `setXmlResult`

- **类型**：逻辑控制
- **说明**：更新：xml / result
- **签名**：`setXmlResult(out: ToolCheckResult \| ToolTransformResult \| null, outputText: unknown)`
- **位置**：brian-frontend/src/views/ToolView.vue:75
- **引用次数**：4

#### `xmlCheck`

- **类型**：逻辑控制
- **说明**：处理 xml / check（异步编排）
- **签名**：`xmlCheck()`
- **位置**：brian-frontend/src/views/ToolView.vue:88
- **引用次数**：10

#### `xmlFormat`

- **类型**：逻辑控制
- **说明**：处理 xml / format（异步编排）
- **签名**：`xmlFormat()`
- **位置**：brian-frontend/src/views/ToolView.vue:91
- **引用次数**：10

#### `xmlMinify`

- **类型**：逻辑控制
- **说明**：处理 xml / minify（异步编排）
- **签名**：`xmlMinify()`
- **位置**：brian-frontend/src/views/ToolView.vue:95
- **引用次数**：9

#### `runRegex`

- **类型**：逻辑控制
- **说明**：处理执行：regex（含异常兜底，异步编排）
- **签名**：`runRegex()`
- **位置**：brian-frontend/src/views/ToolView.vue:106
- **引用次数**：2

