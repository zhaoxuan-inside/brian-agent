# Application / Visualization

- 层：**Application**　模块：**Visualization**
- 方法数：**55**（逻辑控制 29 · 数据处理 13 · 通用算法 13）

## 文件 `brian-backend/Application/Visualization/access/VisualizationAccess.ts`

### VisualizationAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Application/Visualization/access/VisualizationAccess.ts:82
- **引用次数**：272

#### `soVisualizedMessages`

- **类型**：逻辑控制
- **说明**：查询：visualized / messages（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soVisualizedMessages(i: GetVisualizedMessagesInput, o: GetVisualizedMessagesOutput, c: VisualizationContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/access/VisualizationAccess.ts:86
- **引用次数**：19

#### `soVisualizedMessageGraph`

- **类型**：逻辑控制
- **说明**：查询：visualized / 消息 / 图（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soVisualizedMessageGraph(i: GetVisualizedMessageGraphInput, o: GetVisualizedMessageGraphOutput, c: VisualizationContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/access/VisualizationAccess.ts:92
- **引用次数**：16

#### `soVisualizedAgentDAG`

- **类型**：逻辑控制
- **说明**：查询：visualized / Agent / DAG 流程（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soVisualizedAgentDAG(i: GetVisualizedAgentDAGInput, o: GetVisualizedAgentDAGOutput, c: VisualizationContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/access/VisualizationAccess.ts:98
- **引用次数**：14

#### `soVisualizedWorkFlow`

- **类型**：逻辑控制
- **说明**：查询：visualized / work / flow（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soVisualizedWorkFlow(i: GetVisualizedWorkFlowInput, o: GetVisualizedWorkFlowOutput, c: VisualizationContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/access/VisualizationAccess.ts:104
- **引用次数**：6

#### `soAgentTrace`

- **类型**：逻辑控制
- **说明**：查询：Agent / 执行轨迹（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soAgentTrace(i: GetAgentTraceInput, o: GetAgentTraceOutput, c: VisualizationContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/access/VisualizationAccess.ts:110
- **引用次数**：20

#### `soVisualizedMessageDAG`

- **类型**：逻辑控制
- **说明**：查询：visualized / 消息 / DAG 流程（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soVisualizedMessageDAG(i: GetVisualizedMessageDAGInput, o: GetVisualizedMessageDAGOutput, c: VisualizationContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/access/VisualizationAccess.ts:116
- **引用次数**：23

#### `soResource`

- **类型**：逻辑控制
- **说明**：查询：resource（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soResource(i: GetResourceInput, o: GetResourceOutput, c: VisualizationContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/access/VisualizationAccess.ts:122
- **引用次数**：24

#### `configVisualization`

- **类型**：逻辑控制
- **说明**：处理 配置 / visualization（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`configVisualization(i: ConfigVisualizationInput, o: ConfigVisualizationOutput, c: VisualizationContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/access/VisualizationAccess.ts:128
- **引用次数**：22

#### `soGraphVisualizationConfig`

- **类型**：逻辑控制
- **说明**：查询：图 / visualization / 配置（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soGraphVisualizationConfig(i: GraphVisualizationConfigInput, o: GraphVisualizationConfigOutput, c: VisualizationContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/access/VisualizationAccess.ts:134
- **引用次数**：4

## 文件 `brian-backend/Application/Visualization/application/VisualizationService.ts`

### VisualizationService

#### `soVisualizedMessages`

- **类型**：数据处理
- **说明**：查询：visualized / messages
- **签名**：`soVisualizedMessages(input: GetVisualizedMessagesInput, output: GetVisualizedMessagesOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:123
- **引用次数**：19

#### `soVisualizedMessageGraph`

- **类型**：数据处理
- **说明**：查询：visualized / 消息 / 图
- **签名**：`soVisualizedMessageGraph(input: GetVisualizedMessageGraphInput, output: GetVisualizedMessageGraphOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:208
- **引用次数**：16

#### `soVisualizedAgentDAG`

- **类型**：逻辑控制
- **说明**：查询：visualized / Agent / DAG 流程（返回成功与否）
- **签名**：`soVisualizedAgentDAG(input: GetVisualizedAgentDAGInput, output: GetVisualizedAgentDAGOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:287
- **引用次数**：14

#### `soVisualizedWorkFlow`

- **类型**：逻辑控制
- **说明**：查询：visualized / work / flow（返回成功与否）
- **签名**：`soVisualizedWorkFlow(input: GetVisualizedWorkFlowInput, output: GetVisualizedWorkFlowOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:294
- **引用次数**：6

#### `soAgentTrace`

- **类型**：逻辑控制
- **说明**：查询：Agent / 执行轨迹（返回成功与否，含异常兜底，遍历调度）
- **签名**：`soAgentTrace(input: GetAgentTraceInput, output: GetAgentTraceOutput, _ctx: VisualizationContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:301
- **引用次数**：20

#### `soVisualizedMessageDAG`

- **类型**：数据处理
- **说明**：查询：visualized / 消息 / DAG 流程
- **签名**：`soVisualizedMessageDAG(input: GetVisualizedMessageDAGInput, output: GetVisualizedMessageDAGOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:394
- **引用次数**：23

### VisualizationService（私有）

#### `queryMessageRows`

- **类型**：数据处理
- **说明**：查询：消息 / rows（操作关系数据库）
- **签名**：`queryMessageRows(input: GetVisualizedMessageDAGInput): Promise<Array<Record<string, unknown>> \| null>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:415
- **引用次数**：2

#### `buildMessageNodes`

- **类型**：通用算法
- **说明**：构建/初始化：消息 / nodes（纯计算，无外部 IO）
- **签名**：`buildMessageNodes(rawRows: Array<Record<string, unknown>>, maxNodes: number): Promise<Array<Record<string, unknown>>>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:435
- **引用次数**：2

#### `collectNodeRows`

- **类型**：通用算法
- **说明**：处理 collect / 节点 / rows（纯计算，无外部 IO）
- **签名**：`collectNodeRows(rawRows: Array<Record<string, unknown>>, maxNodes: number): Array<Record<string, unknown>>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:448
- **引用次数**：2

#### `buildMessageNode`

- **类型**：数据处理
- **说明**：构建/初始化：消息 / 节点
- **签名**：`buildMessageNode(row: Record<string, unknown>, summaryMap: Map<string, string>, citationMap: Map<string, CitationData>): Record<string, unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:464
- **引用次数**：2

#### `buildMessageEdges`

- **类型**：通用算法
- **说明**：构建/初始化：消息 / edges（纯计算，无外部 IO）
- **签名**：`buildMessageEdges(rawRows: Array<Record<string, unknown>>, nodes: Array<Record<string, unknown>>, input: GetVisualizedMessageDAGInput): Promise<Array<Record<string, unknown>>>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:493
- **引用次数**：2

#### `buildQuestionAnswerEdges`

- **类型**：通用算法
- **说明**：构建/初始化：提问 / 回答 / edges（纯计算，无外部 IO）
- **签名**：`buildQuestionAnswerEdges(rawRows: Array<Record<string, unknown>>): Array<Record<string, unknown>>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:509
- **引用次数**：2

#### `iterQuestionAnswerPairs`

- **类型**：通用算法
- **说明**：处理 iter / 提问 / 回答 / pairs（纯计算，无外部 IO）
- **签名**：`iterQuestionAnswerPairs(rawRows: Array<Record<string, unknown>>): Generator<[string, string, string]>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:520
- **引用次数**：2

#### `groupRowsByWork`

- **类型**：数据处理
- **说明**：转换归并：rows / work
- **签名**：`groupRowsByWork(rawRows: Array<Record<string, unknown>>): Map<string, Array<Record<string, unknown>>>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:540
- **引用次数**：2

#### `buildCitationEdges`

- **类型**：数据处理
- **说明**：构建/初始化：citation / edges（图数据库）
- **签名**：`buildCitationEdges(nodes: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:556
- **引用次数**：2

#### `appendFollowUpEdges`

- **类型**：通用算法
- **说明**：写入/新增：follow / edges（纯计算，无外部 IO）
- **签名**：`appendFollowUpEdges(nodes: Array<Record<string, unknown>>, edges: Array<Record<string, unknown>>): void`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:577
- **引用次数**：2

#### `dedupeEdges`

- **类型**：通用算法
- **说明**：转换归并：edges（纯计算，无外部 IO）
- **签名**：`dedupeEdges(edges: Array<Record<string, unknown>>): Array<Record<string, unknown>>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:610
- **引用次数**：2

#### `buildDagMetadata`

- **类型**：逻辑控制
- **说明**：构建/初始化：DAG 流程 / metadata
- **签名**：`buildDagMetadata(rawRows: Array<Record<string, unknown>>, nodes: Array<Record<string, unknown>>, edges: Array<Record<string, unknown>>, maxNodes: number, input: GetVisualizedMessageDAGInput): Record<string, unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:620
- **引用次数**：2

### VisualizationService

#### `soResource`

- **类型**：逻辑控制
- **说明**：查询：resource（返回成功与否，含异常兜底，异步编排）
- **签名**：`soResource(input: GetResourceInput, output: GetResourceOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:638
- **引用次数**：24

### VisualizationService（私有）

#### `soResourceValue`

- **类型**：通用算法
- **说明**：查询：resource / 值（纯计算，无外部 IO）
- **签名**：`soResourceValue(resourceType: string, resourceId: string): Promise<unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:650
- **引用次数**：2

#### `soAgentResource`

- **类型**：逻辑控制
- **说明**：查询：Agent / resource（异步编排）
- **签名**：`soAgentResource(resourceId: string): Promise<unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:666
- **引用次数**：2

#### `soLlmResource`

- **类型**：逻辑控制
- **说明**：查询：大模型 / resource（异步编排）
- **签名**：`soLlmResource(resourceId: string): Promise<unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:672
- **引用次数**：2

#### `soSoulResource`

- **类型**：逻辑控制
- **说明**：查询：人设 / resource（异步编排）
- **签名**：`soSoulResource(resourceId: string): Promise<unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:678
- **引用次数**：2

#### `soSkillResource`

- **类型**：逻辑控制
- **说明**：查询：技能 / resource（异步编排）
- **签名**：`soSkillResource(resourceId: string): Promise<unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:684
- **引用次数**：2

#### `soMcpResource`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道 / resource（异步编排）
- **签名**：`soMcpResource(resourceId: string): Promise<unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:690
- **引用次数**：2

#### `soPromptResource`

- **类型**：逻辑控制
- **说明**：查询：提示词 / resource（异步编排）
- **签名**：`soPromptResource(resourceId: string): Promise<unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:696
- **引用次数**：2

#### `soTraceResource`

- **类型**：逻辑控制
- **说明**：查询：执行轨迹 / resource（异步编排）
- **签名**：`soTraceResource(resourceId: string): Promise<unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:702
- **引用次数**：2

#### `soInfoResource`

- **类型**：逻辑控制
- **说明**：查询：信息 / resource（异步编排）
- **签名**：`soInfoResource(resourceId: string): Promise<unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:708
- **引用次数**：2

#### `soEvalResource`

- **类型**：逻辑控制
- **说明**：查询：评估 / resource（异步编排）
- **签名**：`soEvalResource(resourceId: string): Promise<unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:714
- **引用次数**：2

#### `soContextResource`

- **类型**：逻辑控制
- **说明**：查询：上下文 / resource（异步编排）
- **签名**：`soContextResource(resourceId: string): Promise<unknown>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:724
- **引用次数**：2

### VisualizationService

#### `configVisualization`

- **类型**：数据处理
- **说明**：处理 配置 / visualization（操作关系数据库）
- **签名**：`configVisualization(input: ConfigVisualizationInput, output: ConfigVisualizationOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:730
- **引用次数**：22

#### `soGraphVisualizationConfig`

- **类型**：逻辑控制
- **说明**：查询：图 / visualization / 配置（返回成功与否，异步编排）
- **签名**：`soGraphVisualizationConfig(input: GraphVisualizationConfigInput, output: GraphVisualizationConfigOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:801
- **引用次数**：4

### VisualizationService（私有）

#### `getConfig`

- **类型**：通用算法
- **说明**：获取：配置（纯计算，无外部 IO）
- **签名**：`getConfig(): Promise<VisualizationConfigRow>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:811
- **引用次数**：69

#### `getConfigFull`

- **类型**：数据处理
- **说明**：获取：配置 / full（操作关系数据库）
- **签名**：`getConfigFull(): Promise<VisualizationConfigRow \| null>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:827
- **引用次数**：5

#### `buildCitationMap`

- **类型**：通用算法
- **说明**：构建/初始化：citation / map（纯计算，无外部 IO）
- **签名**：`buildCitationMap(infoIds: string[], includeCiting: boolean): Promise<Map<string, CitationData>>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:845
- **引用次数**：5

#### `buildSummaryMap`

- **类型**：数据处理
- **说明**：构建/初始化：摘要 / map（操作关系数据库）
- **签名**：`buildSummaryMap(infoIds: string[]): Promise<Map<string, string>>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:883
- **引用次数**：4

#### `buildParentInfoIds`

- **类型**：通用算法
- **说明**：构建/初始化：parent / 信息 / ids（纯计算，无外部 IO）
- **签名**：`buildParentInfoIds(infoId: string): Promise<string[]>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:904
- **引用次数**：2

#### `resolveContextSourceInfo`

- **类型**：数据处理
- **说明**：获取：上下文 / source / 信息（操作关系数据库）
- **签名**：`resolveContextSourceInfo(infoId: string): Promise<Record<string, unknown>>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:914
- **引用次数**：2

#### `resolveToolCalls`

- **类型**：通用算法
- **说明**：获取：工具 / calls（纯计算，无外部 IO）
- **签名**：`resolveToolCalls(toolCalls: Array<Record<string, unknown>>, metrics?: Metrics): Promise<Array<Record<string, unknown>>>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:925
- **引用次数**：3

#### `resolveToolName`

- **类型**：逻辑控制
- **说明**：获取：工具 / name（含异常兜底，异步编排）
- **签名**：`resolveToolName(toolType: string, id: string, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:954
- **引用次数**：4

#### `extractFinalAnswer`

- **类型**：逻辑控制
- **说明**：解析：final / 回答（遍历调度）
- **签名**：`extractFinalAnswer(rawTrace: Record<string, unknown>): string`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:986
- **引用次数**：2

#### `truncate`

- **类型**：通用算法
- **说明**：处理 truncate（纯计算，无外部 IO）
- **签名**：`truncate(text: string, maxLen: number): string`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:999
- **引用次数**：98

#### `logWarn`

- **类型**：逻辑控制
- **说明**：写入/新增：warn
- **签名**：`logWarn(msg: string, err: unknown): void`
- **位置**：brian-backend/Application/Visualization/application/VisualizationService.ts:1005
- **引用次数**：10

## 文件 `brian-backend/Application/Visualization/infrastructure/VisualizationSchemaInitializer.ts`

### VisualizationSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): Promise<void>`
- **位置**：brian-backend/Application/Visualization/infrastructure/VisualizationSchemaInitializer.ts:15
- **引用次数**：99

### VisualizationSchemaInitializer（私有）

#### `insertDefaultConfig`

- **类型**：数据处理
- **说明**：写入/新增：default / 配置（操作关系数据库）
- **签名**：`insertDefaultConfig(): Promise<void>`
- **位置**：brian-backend/Application/Visualization/infrastructure/VisualizationSchemaInitializer.ts:36
- **引用次数**：4

