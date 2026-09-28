# 02 模块间接口与数据模型(_06_interface_design)

> 状态:reviewed　更新:2026-09-26

## 1. 内部接口约定(全后端强制)

- **签名**:`(input: XxxInput, output: XxxOutput, context: XxxContext, metrics?: Metrics, report?: Report)`,基类 `brian-backend/Base/shared/base/`(Input/Output/Context/Metrics/Report)。
- **AOP**:Access 层统一经 `AopProxy.wrap(service, {logger})` 织入进出入计时与日志;业务内不手写埋点。
- **三分类**:方法归 orchestration(逻辑控制)/ data(数据处理)/ algorithm(通用算法),已由 `docs/method.idx.json`(2942 方法)全量归类,分片登记于 `_07/`。
- **跨模块调用**:只经对方 `access/*Access.ts`,禁止直用 Service。
- **hierarchy**:dev-server(入口豁免)→ Access → Service → domain/infra。

## 2. 关键内部接口(节选,全量见 _07 分片)

| 接口ID | 签名(缩写) | category | 层/模块 | 备注 |
|---|---|---|---|---|
| I-001 | `openChatStreamV2(input, output, context)` | orchestration | app/Chat | SSE 对话编排入口 |
| I-002 | `submitRun / waitRun / steerRun / abortRun / waitPermission / answerUserAsk` | orchestration | app/Runtime·Runs | Run 生命周期 |
| I-003 | `execAgentLoop(input, output, context)` | orchestration | app/Runtime·Loop | 两级循环 |
| I-004 | `execLLMEvents(input, output, context)` | orchestration | infra?Base/LLMProvider | 供应商事件流 |
| I-005 | `execSkill(input, output, context)` | orchestration | app/Runtime·SkillRuntime | 技能统一执行面 |
| I-006 | `matchAgentDef / matchAgent / matchSkill / matchLLM / matchMCP / matchSoul` | data | 各层匹配面 | 四层瀑布匹配 |
| I-007 | `saveInfo / vectorInfo / tagInfo / summaryInfo` | orchestration+data | Core/InfoCore | 记忆写入与召回 |
| I-008 | `execAgent / runPhases`(AgentExecution v1) | orchestration | Agent | 保留兼容 |
| I-009 | `evalWorkAgent / runEvaluationCycle` | orchestration | Agent/EvolutorAgent | 进化闭环 |
| I-010 | `execWrite / saveUserProfile` | orchestration | Agent/WriterAgent | 定稿与画像 |
| I-011 | `cleanOrphanGraphNodes(input, output, context)` | data | Core/InfoCore | 图修复学习:安全清理 0 消息关联孤立节点与边 |
| I-012 | `soSession(input, output, context)` | orchestration | Application/Chat | 会话检索与全量 Token/完整问答聚合 |


## 3. 数据模型 Schema

权威 DDL:各模块 `infrastructure/*SchemaInitializer.ts`(启动时建表);三库物理布局见 _04/02 第 3 节。约定:
- 表名小写下划线;每表含 id/时间戳;向量与全文以 Info 为中心。
- 配置类表统一带变更历史(history)与 diff。

## 4. 前端内部契约

- **路由表(页面路径即 API)**:`/`、`/chat`、`/info`、`/learning`、`/monitor`、`/config`、`/tool`、`/cron`;通配重定向 `/`;全部懒加载,`afterEach` 设置标题。登录为全局门禁(LoginPage,非路由)。
- **API 适配层**:`src/api/index.ts` 统一 `request()`(fetch + `/api` 前缀 + TRACE_ID header + 超时);**组件禁止裸 fetch**(T-F07 收敛 HomeView)。
- **SSE**:`useSSE` 解析 `data:` 帧;`chatStreamEvents` 分发 30+ 事件到 stores(session/chatUi)。
- **stores**:session(会话/消息/块)、chatUi(弹窗/意图/授权)、auth、theme(class 策略+localStorage `brian-theme`)、i18n。
- **设计令牌契约**(ADR-008):语义色/字号/z-index/遮罩/圆角/动效以 `tailwind.config.js` + `src/styles/globals.css` CSS 变量为单一事实源;组件内禁用裸 tailwind 原生色表达语义(禁 red-500/green-500/sky-* 等,应使用 error/success/info/warning 令牌);弹层一律经 ModalShell。

## 5. 接口演进规则

- 接口变更同步更新本文件与 `_07` 分片;不兼容变更走 deprecated + replaced_by。
- 前端组件 API 变更在组件 JSDoc 注明;新增页面必须登记路由表并接入令牌契约。
