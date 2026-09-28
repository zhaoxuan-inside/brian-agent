# Agent / EvolutorAgent

- 层：**Agent**　模块：**EvolutorAgent**
- 方法数：**41**（逻辑控制 21 · 数据处理 16 · 通用算法 4）

## 文件 `brian-backend/Agent/EvolutorAgent/access/EvolutorAgentAccess.ts`

### EvolutorAgentAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Agent/EvolutorAgent/access/EvolutorAgentAccess.ts:48
- **引用次数**：272

#### `evalWorkAgent`

- **类型**：逻辑控制
- **说明**：计算统计：work / Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`evalWorkAgent(i: EvalWorkAgentInput, o: EvalWorkAgentOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/access/EvolutorAgentAccess.ts:50
- **引用次数**：15

#### `evalWriterAgent`

- **类型**：逻辑控制
- **说明**：计算统计：写作 / Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`evalWriterAgent(i: EvalWriterAgentInput, o: EvalWriterAgentOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/access/EvolutorAgentAccess.ts:56
- **引用次数**：7

#### `startEvalSchedule`

- **类型**：逻辑控制
- **说明**：启动：评估 / schedule（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`startEvalSchedule(i: StartEvalScheduleInput, o: StartEvalScheduleOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/access/EvolutorAgentAccess.ts:62
- **引用次数**：3

#### `stopEvalSchedule`

- **类型**：逻辑控制
- **说明**：删除/清理：评估 / schedule（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`stopEvalSchedule(i: StopEvalScheduleInput, o: StopEvalScheduleOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/access/EvolutorAgentAccess.ts:68
- **引用次数**：9

#### `runEvalOnce`

- **类型**：逻辑控制
- **说明**：处理执行：评估 / once（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`runEvalOnce(i: RunEvalOnceInput, o: RunEvalOnceOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/access/EvolutorAgentAccess.ts:74
- **引用次数**：25

#### `soEvaluation`

- **类型**：逻辑控制
- **说明**：查询：evaluation（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soEvaluation(i: GetEvaluationInput, o: GetEvaluationOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/access/EvolutorAgentAccess.ts:80
- **引用次数**：7

#### `soEvolutionReport`

- **类型**：逻辑控制
- **说明**：查询：evolution / 报告（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soEvolutionReport(i: GetEvolutionReportInput, o: GetEvolutionReportOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/access/EvolutorAgentAccess.ts:86
- **引用次数**：6

#### `configEvolutorAgent`

- **类型**：逻辑控制
- **说明**：处理 配置 / evolutor / Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`configEvolutorAgent(i: ConfigEvolutorAgentInput, o: ConfigEvolutorAgentOutput, c: EvolutorAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/access/EvolutorAgentAccess.ts:92
- **引用次数**：13

## 文件 `brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts`

### 模块级函数

#### `mapEval`

- **类型**：数据处理
- **说明**：转换归并：评估
- **签名**：`mapEval(row: Record<string, unknown>): AgentEvaluationRecord`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:52
- **引用次数**：2

### EvolutorAgentService

#### `evalWorkAgent`

- **类型**：数据处理
- **说明**：计算统计：work / Agent（序列化输出）
- **签名**：`evalWorkAgent(input: EvalWorkAgentInput, output: EvalWorkAgentOutput, ctx: EvolutorAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:103
- **引用次数**：15

### EvolutorAgentService（私有）

#### `resolveEvalContext`

- **类型**：逻辑控制
- **说明**：获取：评估 / 上下文（异步编排）
- **签名**：`resolveEvalContext(ctx: EvolutorAgentContext, input: { work_id: string; run_id: string }, metrics?: Metrics): Promise<EvalContext>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:133
- **引用次数**：3

#### `loadTraceContext`

- **类型**：逻辑控制
- **说明**：获取：执行轨迹 / 上下文（含异常兜底，异步编排）
- **签名**：`loadTraceContext(input: EvalWorkAgentInput, ctx: EvolutorAgentContext, metrics?: Metrics): Promise<unknown>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:159
- **引用次数**：2

#### `execEvalLlm`

- **类型**：逻辑控制
- **说明**：处理执行：评估 / 大模型（含异常兜底，异步编排）
- **签名**：`execEvalLlm(ctx: EvolutorAgentContext, input: EvalWorkAgentInput, targetLlmId: string, prompt: string, metrics?: Metrics, report?: Report): Promise<string>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:178
- **引用次数**：2

#### `saveWorkEvaluation`

- **类型**：数据处理
- **说明**：写入/新增：work / evaluation（操作关系数据库，序列化输出）
- **签名**：`saveWorkEvaluation(input: EvalWorkAgentInput, scores: EvalScores, suggestions: string[], needOptimize: boolean): Promise<string>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:201
- **引用次数**：2

#### `dispatchOptimizeMessage`

- **类型**：通用算法
- **说明**：处理执行：optimize / 消息（纯计算，无外部 IO）
- **签名**：`dispatchOptimizeMessage(input: EvalWorkAgentInput, suggestions: string[]): Promise<void>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:220
- **引用次数**：2

#### `submitEvalFeedback`

- **类型**：逻辑控制
- **说明**：处理 submit / 评估 / 反馈（异步编排）
- **签名**：`submitEvalFeedback(input: EvalWorkAgentInput, scores: EvalScores, suggestions: string[]): Promise<void>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:237
- **引用次数**：2

#### `writeEvalOutput`

- **类型**：逻辑控制
- **说明**：写入/新增：评估 / 输出
- **签名**：`writeEvalOutput(output: EvalWorkAgentOutput, input: EvalWorkAgentInput, evolutorId: string, evalId: string, scores: EvalScores, suggestions: string[], needOptimize: boolean, report?: Report): void`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:253
- **引用次数**：2

#### `disbandBadAgent`

- **类型**：数据处理
- **说明**：处理 disband / bad / Agent（操作关系数据库）
- **签名**：`disbandBadAgent(agentBizId: string, report?: Report, metrics?: Metrics): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:276
- **引用次数**：2

#### `disableRuntimeDefs`

- **类型**：数据处理
- **说明**：界面控制：runtime / defs（操作关系数据库）
- **签名**：`disableRuntimeDefs(agentBizId: string, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:294
- **引用次数**：3

### EvolutorAgentService

#### `evalWriterAgent`

- **类型**：数据处理
- **说明**：计算统计：写作 / Agent（序列化输出）
- **签名**：`evalWriterAgent(input: EvalWriterAgentInput, output: EvalWriterAgentOutput, ctx: EvolutorAgentContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:309
- **引用次数**：7

### EvolutorAgentService（私有）

#### `execWriterEvalLlm`

- **类型**：逻辑控制
- **说明**：处理执行：写作 / 评估 / 大模型（含异常兜底，异步编排）
- **签名**：`execWriterEvalLlm(input: EvalWriterAgentInput, ctx: EvolutorAgentContext, targetLlmId: string, prompt: string, metrics?: Metrics, report?: Report): Promise<WriterEvalLlmResult>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:345
- **引用次数**：2

#### `parseWriterEvalScores`

- **类型**：通用算法
- **说明**：解析：写作 / 评估 / scores（纯计算，无外部 IO）
- **签名**：`parseWriterEvalScores(rawResponse: string): { scores: WriterEvalScores; suggestions: string[] } \| null`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:380
- **引用次数**：2

#### `saveWriterEvaluation`

- **类型**：数据处理
- **说明**：写入/新增：写作 / evaluation（操作关系数据库，序列化输出）
- **签名**：`saveWriterEvaluation(input: EvalWriterAgentInput, scores: WriterEvalScores, suggestions: string[], needOptimize: boolean): Promise<string>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:401
- **引用次数**：2

#### `dispatchWriterOptimize`

- **类型**：逻辑控制
- **说明**：处理执行：写作 / optimize（异步编排）
- **签名**：`dispatchWriterOptimize(input: EvalWriterAgentInput): Promise<void>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:420
- **引用次数**：2

#### `writeWriterEvalOutput`

- **类型**：数据处理
- **说明**：写入/新增：写作 / 评估 / 输出
- **签名**：`writeWriterEvalOutput(output: EvalWriterAgentOutput, input: EvalWriterAgentInput, evalCtx: EvalContext, evalId: string, scores: WriterEvalScores, suggestions: string[], needOptimize: boolean, startedAt: number, llmResult: WriterEvalLlmResult, _metrics?: Metrics, report?: Report): Promise<void>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:433
- **引用次数**：2

#### `recordTrace`

- **类型**：数据处理
- **说明**：写入/新增：执行轨迹（序列化输出）
- **签名**：`recordTrace(output: EvalWriterAgentOutput, params: { agentId: string; agentName: string; taskContent: string; scores: unknown; suggestions: string[]; inputTokens: number; outputTokens: number; rawResponse: string; elapsedMs: number; templateId: string \| undefined; }, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:476
- **引用次数**：7

### EvolutorAgentService

#### `startEvalSchedule`

- **类型**：逻辑控制
- **说明**：启动：评估 / schedule（返回成功与否，含异常兜底，异步编排）
- **签名**：`startEvalSchedule(input: StartEvalScheduleInput, output: StartEvalScheduleOutput, ctx: EvolutorAgentContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:532
- **引用次数**：3

#### `runEvalOnce`

- **类型**：逻辑控制
- **说明**：处理执行：评估 / once（返回成功与否，异步编排）
- **签名**：`runEvalOnce(input: RunEvalOnceInput, output: RunEvalOnceOutput, ctx: EvolutorAgentContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:610
- **引用次数**：25

### EvolutorAgentService（私有）

#### `runEvaluationCycle`

- **类型**：数据处理
- **说明**：处理执行：evaluation / cycle（操作关系数据库）
- **签名**：`runEvaluationCycle(ctx: EvolutorAgentContext, opts: { dispatchViaMq: boolean; cutoffMs?: number; threshold?: number; batchSize?: number }, metrics?: Metrics): Promise<{ scannedAgents: number; evaluatedCount: number; skippedCount: number }>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:624
- **引用次数**：4

### EvolutorAgentService

#### `stopEvalSchedule`

- **类型**：逻辑控制
- **说明**：删除/清理：评估 / schedule（返回成功与否，异步编排）
- **签名**：`stopEvalSchedule(input: StopEvalScheduleInput, _output: StopEvalScheduleOutput, _ctx: EvolutorAgentContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:740
- **引用次数**：9

#### `soEvaluation`

- **类型**：数据处理
- **说明**：查询：evaluation（操作关系数据库）
- **签名**：`soEvaluation(input: GetEvaluationInput, output: GetEvaluationOutput, _ctx: EvolutorAgentContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:752
- **引用次数**：7

#### `soEvolutionReport`

- **类型**：数据处理
- **说明**：查询：evolution / 报告（操作关系数据库，反序列化）
- **签名**：`soEvolutionReport(input: GetEvolutionReportInput, output: GetEvolutionReportOutput, _ctx: EvolutorAgentContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:770
- **引用次数**：6

#### `configEvolutorAgent`

- **类型**：数据处理
- **说明**：处理 配置 / evolutor / Agent（操作关系数据库）
- **签名**：`configEvolutorAgent(input: ConfigEvolutorAgentInput, output: ConfigEvolutorAgentOutput, _ctx: EvolutorAgentContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:836
- **引用次数**：13

### EvolutorAgentService（私有）

#### `resolveLlm`

- **类型**：逻辑控制
- **说明**：获取：大模型
- **签名**：`resolveLlm(agentId: string, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:932
- **引用次数**：8

#### `renderPrompt`

- **类型**：逻辑控制
- **说明**：格式化/序列化：提示词
- **签名**：`renderPrompt(templateId: string \| undefined, builtinId: string, variables: Record<string, unknown>, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:936
- **引用次数**：11

#### `getConfig`

- **类型**：数据处理
- **说明**：获取：配置（操作关系数据库）
- **签名**：`getConfig(): Promise<EvolutorAgentConfigRecord \| null>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:945
- **引用次数**：69

#### `refreshEvalScore`

- **类型**：数据处理
- **说明**：处理 refresh / 评估 / score（操作关系数据库）
- **签名**：`refreshEvalScore(agentId: string, overall: number): Promise<void>`
- **位置**：brian-backend/Agent/EvolutorAgent/application/EvolutorAgentService.ts:963
- **引用次数**：2

## 文件 `brian-backend/Agent/EvolutorAgent/domain/services/EvalScoreDomainService.ts`

### 模块级函数

#### `parseWorkAgentScores`

- **类型**：通用算法
- **说明**：解析：work / Agent / scores（纯计算，无外部 IO）
- **签名**：`parseWorkAgentScores(raw: string): WorkScoreParseResult`
- **位置**：brian-backend/Agent/EvolutorAgent/domain/services/EvalScoreDomainService.ts:13
- **引用次数**：3

#### `applyTraceEfficiency`

- **类型**：通用算法
- **说明**：更新：执行轨迹 / efficiency（纯计算，无外部 IO）
- **签名**：`applyTraceEfficiency(scores: EvalScores, traceData: unknown): EvalScores`
- **位置**：brian-backend/Agent/EvolutorAgent/domain/services/EvalScoreDomainService.ts:34
- **引用次数**：3

## 文件 `brian-backend/Agent/EvolutorAgent/infrastructure/EvolutorAgentSchemaInitializer.ts`

### EvolutorAgentSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): Promise<void>`
- **位置**：brian-backend/Agent/EvolutorAgent/infrastructure/EvolutorAgentSchemaInitializer.ts:8
- **引用次数**：99

