# Agent / AgentExecution 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## AgentExecutionAccess

源码：`brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | 等待表结构初始化完成（agent_execution_config / agent_execution_trace）。 |
| `execAgent` | `i: ExecAgentInput, o: ExecAgentOutput, c: AgentExecutionContext, metrics?: Metrics, rep...` | `Promise<boolean>` | 同步执行一个 Agent 实例：按策略规则（CoT/ReAct/Plan-and-Solve）驱动 |
| `execAgentAsync` | `i: ExecAgentAsyncInput, o: ExecAgentAsyncOutput, c: AgentExecutionContext, metrics?: Me...` | `Promise<boolean>` | 异步执行 Agent：将任务投递到 agent.execution MQ 队列并确保 Worker 在运行后立即返回。 |
| `execThink` | `i: ThinkInput, o: ThinkOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Re...` | `Promise<boolean>` | 执行 Think 原子步：LLM 基于当前上下文推理，产出推理文本与下一步行动计划。 |
| `execAct` | `i: ActInput, o: ActOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report` | `Promise<boolean>` | 执行 Act 原子步：按 next_action 决策调用工具（SKILL/MCP 沙箱调用或内置浏览器 CDT）。 |
| `execReflect` | `i: ReflectInput, o: ReflectOutput, c: AgentExecutionContext, metrics?: Metrics, report?...` | `Promise<boolean>` | 执行 Reflect 原子步：评估当前执行进展，判定继续迭代或给出最终答案。 |
| `execAnswer` | `i: AnswerInput, o: AnswerOutput, c: AgentExecutionContext, metrics?: Metrics, report?: ...` | `Promise<boolean>` | 执行 Answer 原子步：基于完整执行历史生成最终的用户可见答案。 |
| `soTrace` | `i: GetTraceInput, o: GetTraceOutput, c: AgentExecutionContext, metrics?: Metrics, repor...` | `Promise<boolean>` | 按 trace_id 查询一次 Agent 执行的完整链路轨迹。 |
| `soExecQueueStatus` | `i: GetExecQueueStatusInput, o: GetExecQueueStatusOutput, c: AgentExecutionContext, metr...` | `Promise<boolean>` | 查看 agent.execution 队列的异步执行状态。 |
| `configAgentExecution` | `i: ConfigAgentExecutionInput, o: ConfigAgentExecutionOutput, c: AgentExecutionContext, ...` | `Promise<boolean>` | 配置 AgentExecution 执行参数：Think/Reflect/Answer prompt 模板 ID、 |
