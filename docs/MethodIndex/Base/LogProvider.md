# Base / LogProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## LogAccess

源码：`brian-backend/Base/LogProvider/access/LogAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `getRelationDb` | `` | `RelationDBAccess` | — |
| `initialize` | `` | `Promise<void>` | — |
| `getRawService` | `` | `LogService` | — |
| `addLog` | `i: AddLogInput, o: AddLogOutput, c: LogContext, metrics?: Metrics, report?: Report` | `void` | — |
| `soLogById` | `i: GetLogInput, o: GetLogOutput, c: LogContext, metrics?: Metrics, report?: Report` | `void` | — |
| `soLog` | `i: SoLogInput, o: SoLogOutput, c: LogContext, metrics?: Metrics, report?: Report` | `void` | — |
| `delLog` | `i: DelLogInput, o: DelLogOutput, c: LogContext, metrics?: Metrics, report?: Report` | `void` | — |
| `countLog` | `i: CountLogInput, o: CountLogOutput, c: LogContext, metrics?: Metrics, report?: Report` | `void` | — |
| `visualizedLog` | `i: VisualizedLogInput, o: VisualizedLogOutput, c: LogContext, metrics?: Metrics, report...` | `void` | — |
| `enableLog` | `i: EnableLogInput, o: EnableLogOutput, c: LogContext, metrics?: Metrics, report?: Report` | `void` | — |
| `configLog` | `i: ConfigLogInput, o: ConfigLogOutput, c: LogContext, metrics?: Metrics, report?: Report` | `void` | — |
| `queryLogs` | `options: { level?: string; source?: string; keyword?: string; trace_id?: string; work_i...` | `void` | — |
| `soLogStats` | `options?: { start_time?: number; end_time?: number }` | `void` | — |
| `listSources` | `` | `void` | — |
