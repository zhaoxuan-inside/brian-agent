# Application / Chat 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## ChatAccess

源码：`brian-backend/Application/Chat/access/ChatAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `createSession` | `i: CreateSessionInput, o: CreateSessionOutput, c: ChatContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `deleteSession` | `i: DeleteSessionInput, o: DeleteSessionOutput, c: ChatContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `purgeOrphanSessions` | `i: PurgeOrphanSessionsInput, o: PurgeOrphanSessionsOutput, c: ChatContext, metrics?: Me...` | `Promise<boolean>` | — |
| `soSession` | `i: SearchSessionInput, o: SearchSessionOutput, c: ChatContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `soSessionDetail` | `i: GetSessionDetailInput, o: GetSessionDetailOutput, c: ChatContext, metrics?: Metrics,...` | `Promise<boolean>` | — |
| `updateSessionTitle` | `i: UpdateSessionTitleInput, o: UpdateSessionTitleOutput, c: ChatContext, metrics?: Metr...` | `Promise<boolean>` | — |
| `checkSessionOverflow` | `i: CheckSessionOverflowInput, o: CheckSessionOverflowOutput, c: ChatContext, metrics?: ...` | `Promise<boolean>` | — |
| `soChatHistory` | `i: GetChatHistoryInput, o: GetChatHistoryOutput, c: ChatContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `soMessage` | `i: SearchMessageInput, o: SearchMessageOutput, c: ChatContext, metrics?: Metrics, repor...` | `Promise<boolean>` | — |
| `pinMessage` | `i: PinMessageInput, o: PinMessageOutput, c: ChatContext, metrics?: Metrics, report?: Re...` | `Promise<boolean>` | — |
| `soMessageGraph` | `i: GetMessageGraphInput, o: GetMessageGraphOutput, c: ChatContext, metrics?: Metrics, r...` | `Promise<boolean>` | — |
| `openChatStream` | `i: OpenChatStreamInput, o: OpenChatStreamOutput, c: ChatContext, metrics?: Metrics, rep...` | `Promise<boolean>` | — |
| `configChat` | `i: ConfigChatInput, o: ConfigChatOutput, c: ChatContext, metrics?: Metrics, report?: Re...` | `Promise<boolean>` | — |
