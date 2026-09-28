# Base / RelationDBProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## RelationDBAccess

源码：`brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `insertDB` | `input: InsertDBInput, output: InsertDBOutput, context: DBContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `deleteDB` | `input: DeleteDBInput, output: DeleteDBOutput, context: DBContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `updateDB` | `input: UpdateDBInput, output: UpdateDBOutput, context: DBContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `selectDB` | `input: SelectDBInput, output: SelectDBOutput, context: DBContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `selectOneDB` | `input: SelectOneDBInput, output: SelectOneDBOutput, context: DBContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `countDB` | `input: CountDBInput, output: CountDBOutput, context: DBContext, metrics?: Metrics, repo...` | `Promise<boolean>` | — |
| `transactionDB` | `input: TransactionDBInput, output: TransactionDBOutput, context: DBContext, metrics?: M...` | `Promise<boolean>` | — |
| `visualizedDB` | `input: VisualizedDBInput, output: VisualizedDBOutput, context: DBContext, metrics?: Met...` | `Promise<boolean>` | — |
| `enableDB` | `input: EnableDBInput, output: EnableDBOutput, context: DBContext, metrics?: Metrics, re...` | `Promise<boolean>` | — |
| `closeDB` | `input: CloseDBInput, output: CloseDBOutput, context: DBContext, metrics?: Metrics, repo...` | `Promise<boolean>` | — |
| `selectOne` | `table: string, conditions: Condition[]` | `Promise<Record<string, unknown> | null>` | — |
| `select` | `table: string, options?: { conditions?: Condition[]; order_by?: import('../../shared/qu...` | `Promise<Array<Record<string, unknown>>>` | — |
| `insert` | `table: string, data: Array<{ field: string; value: unknown }>` | `Promise<number>` | — |
| `update` | `table: string, data: Array<{ field: string; value: unknown }>, conditions: Condition[]` | `Promise<number>` | — |
| `delete` | `table: string, conditions?: Condition[]` | `Promise<number>` | — |
| `count` | `table: string, conditions?: Condition[]` | `Promise<number>` | — |
| `executeRaw` | `sql: string, params?: unknown[]` | `number` | — |
| `queryRaw` | `sql: string, params?: unknown[]` | `T[]` | — |
| `transactionRaw` | `operations: import('../../shared/query').Operation[]` | `boolean` | — |
| `walCheckpoint` | `mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE'` | `{ busy: boolean; log: number; checkpointed: number }` | — |
