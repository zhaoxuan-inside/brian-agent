# Runtime / Bus 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## EventBusAccess

源码：`brian-backend/Runtime/Bus/access/EventBusAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 初始化组件 |
| `publishEvent` | `input: PublishEventInput, output: PublishEventOutput, context: EventBusContext, metrics...` | `Promise<boolean>` | 发布持久化事件（副作用唯一出口） |
| `soEventReplay` | `input: SoEventReplayInput, output: SoEventReplayOutput, context: EventBusContext, metri...` | `Promise<boolean>` | 重放查询（after_seq 之后按 seq 升序） |
| `registerProjection` | `input: RegisterProjectionInput, output: RegisterProjectionOutput, context: EventBusCont...` | `Promise<boolean>` | 注册投影（durable：重放 → 直播无缝尾随） |
| `unregisterProjection` | `input: UnregisterProjectionInput, output: UnregisterProjectionOutput, context: EventBus...` | `Promise<boolean>` | 释放投影订阅（幂等） |
| `configBus` | `input: ConfigBusInput, output: ConfigBusOutput, context: EventBusContext, metrics?: Met...` | `Promise<boolean>` | 模块配置 |
