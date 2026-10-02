# ADR-011 执行过程事件驱动落库与 Writer 去思考化(本次 R6 追加)

> 状态:accepted　日期:2026-09-28

## 背景
1. ADR-010 落地三表后,`execute` 表仍仅在极少数场景零星写入(权限确认 PERMISSION、错误 INTERNAL_ERROR、v1 AgentExecution 步骤存档),正常问答的执行过程在表中空白;执行细节主要沉睡在 AOP 文本日志(dev-server.log 的 invocation_json),无法结构化查询与回放。
2. 写入方散落多处:`InfoCoreService.saveInfo` 内嵌 execute 写入、`server/context.ts` permissionAuditBridge 直写 SQL、AgentExecutionService 步骤存档——业务代码与存储耦合。
3. WriterAgent 实测调用(会话 13c8beb3)中,润色层 deepseek-v4-flash 默认开启全量 thinking:思考 2285 字符耗时约 40 秒,正文仅 558 字符,Writer 润色占总耗时 71.3%。编辑层不需要重新推理。

## 决策
1. **上报与落库完全解耦(事件驱动/发布订阅)**:
   - **上报侧**:`AopProxy` 默认拦截链新增 `ExecuteEventInterceptor`——每个 Access 方法调用在 `afterExecute` 组装 `ExecuteEvent`(component_id=Service.method、input/output、start/end、gap=elapsed、status),经 `Report.emitExecuteEvent`(静态 sink,Report 上下文自动附带 session/work/run/trace/agent)投递;业务方法零数据库操作、零存储感知。
   - **落库侧**:新增 `Base/ExecuteEventProvider`(唯一写入方)。`ExecuteEventProcessor` 以异步串行链消费事件:统一序列化(`Metrics.safeSerialize`,单字段 16KB 截断)、按任务键(work_id||run_id||session_id)自增 `exec_no`(从 1 起)、写入 `execute` 表;permission 事件按 `permission_id` 先插行、应答事件回填 output/gap/updated。噪音治理:RelationDB/Log/Stream 管道服务与 `so*` 纯查询方法不上报;缺 session/run/work 上下文的事件丢弃。
   - **读取侧**:`InfoCoreService` 保留 execute 表全部读取(graphInfo/lastNInfo/delInfoByWork/soContextByWork 等),不再承担任何 execute 写入;`saveInfo` 收敛为 dialog 专写(仅 CORRECT 的 REQUEST/RESPONSE 落 dialog,其余类型不再落库)。
2. **execute 表增加 `status` 列**('ok'|'error',DDL + 容错 ALTER 迁移):错误语义由事件携带,读侧(handle_result_type 映射、图错误节点)统一改由 status 判定,废弃 component_type 猜测。
3. **v1 零星写入清除(Zero Legacy Code)**:删除 InfoCoreService.persistExecuteRecord、AgentExecutionService.saveStepInfo/saveExecTraceInfo 落库、dev-server 冗余评分落库;permissionAuditBridge 改为纯上报。
4. **WriterAgent 关闭思考**:`buildWriteEventsInput`(及 execLLM 回退路径)显式注入 `extra: { thinking: { type: 'disabled' } }`;Writer 提示词模板新增 step 0「直接产出」与禁止思考链规则。预期润色耗时 43.5s → 2~3s。

## 备选方案
| 方案 | 未选原因 |
|---|---|
| 业务方法内手动 pushExecute 写库 | 与现状同样污染业务代码,漏报率高,无法一步到位 |
| 复用 BusinessEvent(pushBusinessEvent)落库 | 业务事件是前端 SSE 展示通道,语义与粒度(流式 delta 等)不适合作为审计存储源;且无法覆盖未发事件的方法 |
| 仅记 LLM/Skill 等核心组件 | execute 表 ADR-010 定位即组件级全轨迹,编排层(ROUTER/RUN/STORAGE)缺失无法回放 |

## 后果
- 正面:execute 表成为可审计、可回放的权威执行记录(每问答约数十行,含次序/耗时/输入输出);业务方法零存储污染;新增组件自动纳入观测;Writer 响应大幅提速。
- 负面:每问答新增数十行 execute 写入(本地 SQLite 可忽略);历史 execute 行(仅 PERMISSION/错误)与新行语义差异通过 status 列自然分区,不保留兼容读取逻辑。
