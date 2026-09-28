# Base / GraphDBProvider

- 层：**Base**　模块：**GraphDBProvider**
- 方法数：**45**（逻辑控制 17 · 数据处理 21 · 通用算法 7）

## 文件 `brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts`

### GraphDBAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:65
- **引用次数**：272

#### `addGraphNode`

- **类型**：逻辑控制
- **说明**：写入/新增：图 / 节点（返回成功与否，接入层转发至 Service）
- **签名**：`addGraphNode(input: AddGraphNodeInput, output: AddGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:70
- **引用次数**：75

#### `soGraphNode`

- **类型**：逻辑控制
- **说明**：查询：图 / 节点（返回成功与否，接入层转发至 Service）
- **签名**：`soGraphNode(input: GetGraphNodeInput, output: GetGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:76
- **引用次数**：20

#### `updateGraphNode`

- **类型**：逻辑控制
- **说明**：更新：图 / 节点（返回成功与否，接入层转发至 Service）
- **签名**：`updateGraphNode(input: UpdateGraphNodeInput, output: UpdateGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:82
- **引用次数**：11

#### `delGraphNode`

- **类型**：逻辑控制
- **说明**：删除/清理：图 / 节点（返回成功与否，接入层转发至 Service）
- **签名**：`delGraphNode(input: DelGraphNodeInput, output: DelGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:88
- **引用次数**：13

#### `addGraphEdge`

- **类型**：逻辑控制
- **说明**：写入/新增：图 / 连线（返回成功与否，接入层转发至 Service）
- **签名**：`addGraphEdge(input: AddGraphEdgeInput, output: AddGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:94
- **引用次数**：42

#### `soGraphEdge`

- **类型**：逻辑控制
- **说明**：查询：图 / 连线（返回成功与否，接入层转发至 Service）
- **签名**：`soGraphEdge(input: GetGraphEdgeInput, output: GetGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:100
- **引用次数**：26

#### `updateGraphEdge`

- **类型**：逻辑控制
- **说明**：更新：图 / 连线（返回成功与否，接入层转发至 Service）
- **签名**：`updateGraphEdge(input: UpdateGraphEdgeInput, output: UpdateGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:106
- **引用次数**：15

#### `delGraphEdge`

- **类型**：逻辑控制
- **说明**：删除/清理：图 / 连线（返回成功与否，接入层转发至 Service）
- **签名**：`delGraphEdge(input: DelGraphEdgeInput, output: DelGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:112
- **引用次数**：9

#### `selectGraph`

- **类型**：逻辑控制
- **说明**：界面控制：图（返回成功与否，接入层转发至 Service）
- **签名**：`selectGraph(input: SelectGraphInput, output: SelectGraphOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:118
- **引用次数**：54

#### `soGraphNeighbors`

- **类型**：逻辑控制
- **说明**：查询：图 / neighbors（返回成功与否，接入层转发至 Service）
- **签名**：`soGraphNeighbors(input: GetGraphNeighborsInput, output: GetGraphNeighborsOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:124
- **引用次数**：32

#### `computeEdgeWeight`

- **类型**：逻辑控制
- **说明**：计算统计：连线 / weight（接入层转发至 Service）
- **签名**：`computeEdgeWeight(edgeId: string, hopDistance: number): Promise<number>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:130
- **引用次数**：2

#### `activateGraphEdge`

- **类型**：逻辑控制
- **说明**：界面控制：图 / 连线（返回成功与否，接入层转发至 Service）
- **签名**：`activateGraphEdge(input: ActivateGraphEdgeInput, output: ActivateGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:135
- **引用次数**：24

#### `ageGraphEdge`

- **类型**：逻辑控制
- **说明**：处理 age / 图 / 连线（返回成功与否，接入层转发至 Service）
- **签名**：`ageGraphEdge(input: AgeGraphEdgeInput, output: AgeGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:141
- **引用次数**：15

#### `visualizedGraph`

- **类型**：逻辑控制
- **说明**：处理 visualized / 图（返回成功与否，接入层转发至 Service）
- **签名**：`visualizedGraph(input: VisualizedGraphInput, output: VisualizedGraphOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:147
- **引用次数**：18

#### `enableGraphDB`

- **类型**：逻辑控制
- **说明**：界面控制：图 / db（返回成功与否，接入层转发至 Service）
- **签名**：`enableGraphDB(input: EnableGraphDBInput, output: EnableGraphDBOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:153
- **引用次数**：17

#### `closeGraphDB`

- **类型**：逻辑控制
- **说明**：删除/清理：图 / db（返回成功与否，接入层转发至 Service）
- **签名**：`closeGraphDB(input: CloseGraphDBInput, output: CloseGraphDBOutput, context: GraphContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts:159
- **引用次数**：10

## 文件 `brian-backend/Base/GraphDBProvider/application/GraphDBService.ts`

### GraphDBService

#### `initialize`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（图数据库）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:34
- **引用次数**：272

### GraphDBService（私有）

#### `ensureEnabled`

- **类型**：数据处理
- **说明**：确保就绪：enabled（图数据库）
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:51
- **引用次数**：118

#### `escape`

- **类型**：通用算法
- **说明**：处理 escape（纯计算，无外部 IO）
- **签名**：`escape(str: string): string`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:62
- **引用次数**：41

#### `cypherValue`

- **类型**：通用算法
- **说明**：处理 cypher / 值（纯计算，无外部 IO）
- **签名**：`cypherValue(value: unknown): string`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:66
- **引用次数**：12

#### `buildInList`

- **类型**：通用算法
- **说明**：构建/初始化：列表（纯计算，无外部 IO）
- **签名**：`buildInList(values: string[]): string`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:79
- **引用次数**：6

#### `conditionToCypher`

- **类型**：通用算法
- **说明**：处理 condition / cypher（纯计算，无外部 IO）
- **签名**：`conditionToCypher(fieldRef: string, cond: Condition): string`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:83
- **引用次数**：2

#### `buildWhere`

- **类型**：通用算法
- **说明**：构建/初始化：where（纯计算，无外部 IO）
- **签名**：`buildWhere(prefix: string, conditions: Condition[]): string`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:127
- **引用次数**：20

#### `buildOrderBy`

- **类型**：通用算法
- **说明**：构建/初始化：order（纯计算，无外部 IO）
- **签名**：`buildOrderBy(prefix: string, order_by: OrderBy[] \| undefined): string`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:151
- **引用次数**：10

#### `buildSkipLimit`

- **类型**：通用算法
- **说明**：构建/初始化：skip / 限额（纯计算，无外部 IO）
- **签名**：`buildSkipLimit(page: Page \| undefined): string`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:165
- **引用次数**：3

#### `toNodeRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：节点 / record（反序列化）
- **签名**：`toNodeRecord(row: Record<string, unknown>): GraphNodeRecord`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:173
- **引用次数**：4

#### `toEdgeRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：连线 / record（反序列化）
- **签名**：`toEdgeRecord(row: Record<string, unknown>): GraphEdgeRecord`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:198
- **引用次数**：4

### GraphDBService

#### `addGraphNode`

- **类型**：数据处理
- **说明**：写入/新增：图 / 节点（图数据库，序列化输出）
- **签名**：`addGraphNode(input: AddGraphNodeInput, output: AddGraphNodeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:232
- **引用次数**：75

#### `soGraphNode`

- **类型**：数据处理
- **说明**：查询：图 / 节点（图数据库）
- **签名**：`soGraphNode(input: GetGraphNodeInput, output: GetGraphNodeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:266
- **引用次数**：20

#### `updateGraphNode`

- **类型**：数据处理
- **说明**：更新：图 / 节点（图数据库，序列化输出）
- **签名**：`updateGraphNode(input: UpdateGraphNodeInput, output: UpdateGraphNodeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:282
- **引用次数**：11

#### `delGraphNode`

- **类型**：数据处理
- **说明**：删除/清理：图 / 节点（图数据库）
- **签名**：`delGraphNode(input: DelGraphNodeInput, output: DelGraphNodeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:318
- **引用次数**：13

#### `addGraphEdge`

- **类型**：数据处理
- **说明**：写入/新增：图 / 连线（图数据库，序列化输出）
- **签名**：`addGraphEdge(input: AddGraphEdgeInput, output: AddGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:356
- **引用次数**：42

#### `soGraphEdge`

- **类型**：数据处理
- **说明**：查询：图 / 连线（图数据库）
- **签名**：`soGraphEdge(input: GetGraphEdgeInput, output: GetGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:407
- **引用次数**：26

#### `updateGraphEdge`

- **类型**：数据处理
- **说明**：更新：图 / 连线（图数据库，序列化输出）
- **签名**：`updateGraphEdge(input: UpdateGraphEdgeInput, output: UpdateGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:424
- **引用次数**：15

#### `delGraphEdge`

- **类型**：数据处理
- **说明**：删除/清理：图 / 连线（图数据库）
- **签名**：`delGraphEdge(input: DelGraphEdgeInput, output: DelGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:524
- **引用次数**：9

#### `computeEdgeCompositeWeight`

- **类型**：数据处理
- **说明**：计算统计：连线 / composite / weight（图数据库，反序列化）
- **签名**：`computeEdgeCompositeWeight(edgeId: string, hopDistance: number): Promise<number>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:552
- **引用次数**：2

#### `selectGraph`

- **类型**：数据处理
- **说明**：界面控制：图（图数据库）
- **签名**：`selectGraph(input: SelectGraphInput, output: SelectGraphOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:630
- **引用次数**：54

#### `soGraphNeighbors`

- **类型**：数据处理
- **说明**：查询：图 / neighbors（图数据库）
- **签名**：`soGraphNeighbors(input: GetGraphNeighborsInput, output: GetGraphNeighborsOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:694
- **引用次数**：32

#### `activateGraphEdge`

- **类型**：数据处理
- **说明**：界面控制：图 / 连线（图数据库）
- **签名**：`activateGraphEdge(input: ActivateGraphEdgeInput, _output: ActivateGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:743
- **引用次数**：24

#### `ageGraphEdge`

- **类型**：数据处理
- **说明**：处理 age / 图 / 连线（图数据库）
- **签名**：`ageGraphEdge(_input: AgeGraphEdgeInput, output: AgeGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:814
- **引用次数**：15

#### `visualizedGraph`

- **类型**：数据处理
- **说明**：处理 visualized / 图（图数据库）
- **签名**：`visualizedGraph(input: VisualizedGraphInput, output: VisualizedGraphOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:882
- **引用次数**：18

#### `enableGraphDB`

- **类型**：数据处理
- **说明**：界面控制：图 / db（图数据库）
- **签名**：`enableGraphDB(input: EnableGraphDBInput, _output: EnableGraphDBOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:935
- **引用次数**：17

#### `closeGraphDB`

- **类型**：数据处理
- **说明**：删除/清理：图 / db（图数据库）
- **签名**：`closeGraphDB(_input: CloseGraphDBInput, _output: CloseGraphDBOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/GraphDBProvider/application/GraphDBService.ts:957
- **引用次数**：10

## 文件 `brian-backend/Base/GraphDBProvider/infrastructure/GraphDBSchemaInitializer.ts`

### GraphDBSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库，图数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/GraphDBProvider/infrastructure/GraphDBSchemaInitializer.ts:11
- **引用次数**：99

