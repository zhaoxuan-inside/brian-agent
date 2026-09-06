# Base / RelationDBProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## RelationDBAccess

源码：`brian-backend/Base/RelationDBProvider/access/RelationDBAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件：创建配置表、恢复 enabled 状态、写入默认配置。 |
| `insertDB` | `input: InsertDBInput, output: InsertDBOutput, context: DBContext, metrics?: Metrics, re...` | `Promise<boolean>` | 新增记录 |
| `deleteDB` | `input: DeleteDBInput, output: DeleteDBOutput, context: DBContext, metrics?: Metrics, re...` | `Promise<boolean>` | 删除记录 |
| `updateDB` | `input: UpdateDBInput, output: UpdateDBOutput, context: DBContext, metrics?: Metrics, re...` | `Promise<boolean>` | 更新记录 |
| `selectDB` | `input: SelectDBInput, output: SelectDBOutput, context: DBContext, metrics?: Metrics, re...` | `Promise<boolean>` | 查询记录列表 |
| `selectOneDB` | `input: SelectOneDBInput, output: SelectOneDBOutput, context: DBContext, metrics?: Metri...` | `Promise<boolean>` | 查询单条记录 |
| `countDB` | `input: CountDBInput, output: CountDBOutput, context: DBContext, metrics?: Metrics, repo...` | `Promise<boolean>` | 统计记录数 |
| `transactionDB` | `input: TransactionDBInput, output: TransactionDBOutput, context: DBContext, metrics?: M...` | `Promise<boolean>` | 执行事务 |
| `visualizedDB` | `input: VisualizedDBInput, output: VisualizedDBOutput, context: DBContext, metrics?: Met...` | `Promise<boolean>` | 可视化数据 |
| `enableDB` | `input: EnableDBInput, output: EnableDBOutput, context: DBContext, metrics?: Metrics, re...` | `Promise<boolean>` | 启用/禁用关系数据库 |
| `closeDB` | `input: CloseDBInput, output: CloseDBOutput, context: DBContext, metrics?: Metrics, repo...` | `Promise<boolean>` | 关闭数据库连接（终态操作） |
| `selectOne` | `table: string, conditions: Condition[]` | `Promise<Record<string, unknown> | null>` | {@inheritDoc} |
| `select` | `table: string, options?: { conditions?: Condition[]; order_by?: import('../../shared/qu...` | `Promise<Array<Record<string, unknown>>>` | 查询记录列表（便捷方法，供依赖 Provider 使用）。 |
| `insert` | `table: string, data: Array<{ field: string; value: unknown }>` | `Promise<number>` | {@inheritDoc} |
| `update` | `table: string, data: Array<{ field: string; value: unknown }>, conditions: Condition[]` | `Promise<number>` | {@inheritDoc} |
| `delete` | `table: string, conditions?: Condition[]` | `Promise<number>` | 删除记录（便捷方法，供依赖 Provider 使用）。 |
| `count` | `table: string, conditions?: Condition[]` | `Promise<number>` | {@inheritDoc} |
| `executeRaw` | `sql: string, params?: unknown[]` | `number` | 执行原生 DDL 语句（建表等）。 |
| `queryRaw` | `sql: string, params?: unknown[]` | `T[]` | 执行原生查询 SQL。 |
| `transactionRaw` | `operations: import('../../shared/query').Operation[]` | `boolean` | 在事务中执行多个操作。 |
| `walCheckpoint` | `mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE'` | `{ busy: boolean; log: number; checkpointed: number }` | 执行 WAL checkpoint 以回收 WAL 文件磁盘空间。 |
