# Application / Chat 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## ChatAccess

源码：`brian-backend/Application/Chat/access/ChatAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `createSession` | `i: CreateSessionInput, o: CreateSessionOutput, c: ChatContext, metrics?: Metrics, repor...` | `Promise<boolean>` | 创建新会话并写入 chat_session 表。 |
| `deleteSession` | `i: DeleteSessionInput, o: DeleteSessionOutput, c: ChatContext, metrics?: Metrics, repor...` | `Promise<boolean>` | 批量删除会话并级联清理全部关联数据。 |
| `purgeOrphanSessions` | `i: PurgeOrphanSessionsInput, o: PurgeOrphanSessionsOutput, c: ChatContext, metrics?: Me...` | `Promise<boolean>` | 清理孤儿会话记忆：info_raw 中 session_id 已不存在于 chat_session 的残留记录。 |
| `soSession` | `i: SearchSessionInput, o: SearchSessionOutput, c: ChatContext, metrics?: Metrics, repor...` | `Promise<boolean>` | 检索会话列表：关键词/时间范围过滤 → 分页查询 → 批量聚合统计 → 摘要映射。 |
| `soSessionDetail` | `i: GetSessionDetailInput, o: GetSessionDetailOutput, c: ChatContext, metrics?: Metrics,...` | `Promise<boolean>` | 查询单个会话详情（含消息数量统计）。 |
| `updateSessionTitle` | `i: UpdateSessionTitleInput, o: UpdateSessionTitleOutput, c: ChatContext, metrics?: Metr...` | `Promise<boolean>` | 更新会话标题（手动修改通道；自动生成规则见 PRD §3.3.1.1）。 |
| `checkSessionOverflow` | `i: CheckSessionOverflowInput, o: CheckSessionOverflowOutput, c: ChatContext, metrics?: ...` | `Promise<boolean>` | 检查会话消息数量是否超出上限。 |
| `soChatHistory` | `i: GetChatHistoryInput, o: GetChatHistoryOutput, c: ChatContext, metrics?: Metrics, rep...` | `Promise<boolean>` | 查询会话/工作维度的消息历史，并附每条消息的引用与被引用关联。 |
| `soMessage` | `i: SearchMessageInput, o: SearchMessageOutput, c: ChatContext, metrics?: Metrics, repor...` | `Promise<boolean>` | 按关键词搜索消息（可限定会话范围），附消息摘要并分页返回。 |
| `pinMessage` | `i: PinMessageInput, o: PinMessageOutput, c: ChatContext, metrics?: Metrics, report?: Re...` | `Promise<boolean>` | 切换消息钉住状态（钉住 ↔ 取消钉住）。 |
| `soMessageGraph` | `i: GetMessageGraphInput, o: GetMessageGraphOutput, c: ChatContext, metrics?: Metrics, r...` | `Promise<boolean>` | 获取会话内消息的引用关系图结构（节点 + 引用边），供 ChatMap 可视化。 |
| `openChatStream` | `i: OpenChatStreamInput, o: OpenChatStreamOutput, c: ChatContext, metrics?: Metrics, rep...` | `Promise<boolean>` | 建立一次问答流式交互：校验后经 Runtime v2 编排内核提交问答并等待结算， |
| `configChat` | `i: ConfigChatInput, o: ConfigChatOutput, c: ChatContext, metrics?: Metrics, report?: Re...` | `Promise<boolean>` | 更新 Chat 模块配置（对内方法，由 Config Application 代理调用，无独立 HTTP 端点）。 |
