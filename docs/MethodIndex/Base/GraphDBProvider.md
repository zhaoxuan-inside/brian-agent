# Base / GraphDBProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## GraphDBAccess

源码：`brian-backend/Base/GraphDBProvider/access/GraphDBAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `addGraphNode` | `input: AddGraphNodeInput, output: AddGraphNodeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | — |
| `soGraphNode` | `input: GetGraphNodeInput, output: GetGraphNodeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | — |
| `updateGraphNode` | `input: UpdateGraphNodeInput, output: UpdateGraphNodeOutput, context: GraphContext, metr...` | `Promise<boolean>` | — |
| `delGraphNode` | `input: DelGraphNodeInput, output: DelGraphNodeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | — |
| `addGraphEdge` | `input: AddGraphEdgeInput, output: AddGraphEdgeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | — |
| `soGraphEdge` | `input: GetGraphEdgeInput, output: GetGraphEdgeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | — |
| `updateGraphEdge` | `input: UpdateGraphEdgeInput, output: UpdateGraphEdgeOutput, context: GraphContext, metr...` | `Promise<boolean>` | — |
| `delGraphEdge` | `input: DelGraphEdgeInput, output: DelGraphEdgeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | — |
| `selectGraph` | `input: SelectGraphInput, output: SelectGraphOutput, context: GraphContext, metrics?: Me...` | `Promise<boolean>` | — |
| `soGraphNeighbors` | `input: GetGraphNeighborsInput, output: GetGraphNeighborsOutput, context: GraphContext, ...` | `Promise<boolean>` | — |
| `computeEdgeWeight` | `edgeId: string, hopDistance: number` | `Promise<number>` | — |
| `activateGraphEdge` | `input: ActivateGraphEdgeInput, output: ActivateGraphEdgeOutput, context: GraphContext, ...` | `Promise<boolean>` | — |
| `ageGraphEdge` | `input: AgeGraphEdgeInput, output: AgeGraphEdgeOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | — |
| `visualizedGraph` | `input: VisualizedGraphInput, output: VisualizedGraphOutput, context: GraphContext, metr...` | `Promise<boolean>` | — |
| `enableGraphDB` | `input: EnableGraphDBInput, output: EnableGraphDBOutput, context: GraphContext, metrics?...` | `Promise<boolean>` | — |
| `closeGraphDB` | `input: CloseGraphDBInput, output: CloseGraphDBOutput, context: GraphContext, metrics?: ...` | `Promise<boolean>` | — |
