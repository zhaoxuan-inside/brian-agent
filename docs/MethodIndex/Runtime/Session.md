# Runtime / Session 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## SessionAccess

源码：`brian-backend/Runtime/Session/access/SessionAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件 |
| `addSession` | `input: AddSessionInput, output: AddSessionOutput, context: SessionContext, metrics?: Me...` | `Promise<boolean>` | 新增会话（幂等） |
| `addMessage` | `input: AddMessageInput, output: AddMessageOutput, context: SessionContext, metrics?: Me...` | `Promise<boolean>` | 新增消息 |
| `addPart` | `input: AddPartInput, output: AddPartOutput, context: SessionContext, metrics?: Metrics,...` | `Promise<boolean>` | 新增 Part |
| `updatePart` | `input: UpdatePartInput, output: UpdatePartOutput, context: SessionContext, metrics?: Me...` | `Promise<boolean>` | 更新 Part |
| `appendPartContent` | `input: UpdatePartInput, output: UpdatePartOutput, context: SessionContext, metrics?: Me...` | `Promise<boolean>` | 追加 Part 内容（delta 语义） |
| `soMessages` | `input: SoMessagesInput, output: SoMessagesOutput, context: SessionContext, metrics?: Me...` | `Promise<boolean>` | 查询消息（含 Parts） |
| `ensureRunState` | `input: EnsureRunStateInput, output: EnsureRunStateOutput, context: SessionContext, metr...` | `Promise<boolean>` | 会话忙锁获取 |
| `releaseRunState` | `input: ReleaseRunStateInput, output: ReleaseRunStateOutput, context: SessionContext, me...` | `Promise<boolean>` | 会话忙锁释放（幂等） |
| `configSession` | `input: ConfigSessionInput, output: ConfigSessionOutput, context: SessionContext, metric...` | `Promise<boolean>` | 模块配置 |
