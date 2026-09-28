# Base / VectorDBProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## VectorDBAccess

源码：`brian-backend/Base/VectorDBProvider/access/VectorDBAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `dimension?: number` | `Promise<void>` | — |
| `soVectorCount` | `` | `Promise<number>` | — |
| `getMetric` | `` | `string` | — |
| `getDimension` | `` | `number` | — |
| `applyDimension` | `dimension: number` | `Promise<void>` | — |
| `applyMetric` | `metric: string` | `Promise<void>` | — |
| `addVector` | `input: AddVectorInput, output: AddVectorOutput, context: VectorContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `delVector` | `input: DelVectorInput, output: DelVectorOutput, context: VectorContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `delVectorByFilter` | `input: DelVectorByFilterInput, output: DelVectorByFilterOutput, context: VectorContext,...` | `Promise<boolean>` | — |
| `soVector` | `input: SoVectorInput, output: SoVectorOutput, context: VectorContext, metrics?: Metrics...` | `Promise<boolean>` | — |
| `soVectorById` | `input: GetVectorInput, output: GetVectorOutput, context: VectorContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `countVector` | `input: CountVectorInput, output: CountVectorOutput, context: VectorContext, metrics?: M...` | `Promise<boolean>` | — |
| `visualizedVector` | `input: VisualizedVectorInput, output: VisualizedVectorOutput, context: VectorContext, m...` | `Promise<boolean>` | — |
| `enableVectorDB` | `input: EnableVectorDBInput, output: EnableVectorDBOutput, context: VectorContext, metri...` | `Promise<boolean>` | — |
| `closeVectorDB` | `input: CloseVectorDBInput, output: CloseVectorDBOutput, context: VectorContext, metrics...` | `Promise<boolean>` | — |
