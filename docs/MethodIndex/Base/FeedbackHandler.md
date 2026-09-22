# Base / FeedbackHandler 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## FeedbackAccess

源码：`brian-backend/Base/FeedbackHandler/access/FeedbackAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `submitFeedback` | `i: SubmitFeedbackInput, o: SubmitFeedbackOutput, c: FeedbackContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `submitAgentFeedback` | `i: SubmitAgentFeedbackInput, o: SubmitAgentFeedbackOutput, c: FeedbackContext, metrics?...` | `Promise<boolean>` | — |
| `soFeedback` | `i: QueryFeedbackInput, o: QueryFeedbackOutput, c: FeedbackContext, metrics?: Metrics, r...` | `Promise<boolean>` | — |
| `analyzeFeedback` | `i: AnalyzeFeedbackInput, o: AnalyzeFeedbackOutput, c: FeedbackContext, metrics?: Metric...` | `Promise<boolean>` | — |
| `recordProcessLog` | `i: RecordProcessLogInput, o: RecordProcessLogOutput, c: FeedbackContext, metrics?: Metr...` | `Promise<boolean>` | — |
| `getProcessLogs` | `i: QueryProcessLogsInput, o: QueryProcessLogsOutput, c: FeedbackContext, metrics?: Metr...` | `Promise<boolean>` | — |
| `getProcessLogDetail` | `i: GetProcessLogDetailInput, o: GetProcessLogDetailOutput, c: FeedbackContext, metrics?...` | `Promise<boolean>` | — |
| `deleteFeedbackByRefs` | `i: DeleteFeedbackByRefsInput, o: DeleteFeedbackByRefsOutput, c: FeedbackContext, metric...` | `Promise<boolean>` | — |
| `purgeOrphanFeedback` | `i: PurgeOrphanFeedbackInput, o: PurgeOrphanFeedbackOutput, c: FeedbackContext, metrics?...` | `Promise<boolean>` | — |
| `getFeedbackConfig` | `i: GetFeedbackConfigInput, o: GetFeedbackConfigOutput, c: FeedbackContext, metrics?: Me...` | `Promise<boolean>` | — |
| `updateFeedbackConfig` | `i: UpdateFeedbackConfigInput, o: UpdateFeedbackConfigOutput, c: FeedbackContext, metric...` | `Promise<boolean>` | — |
