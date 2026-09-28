# Agent / AgentExecution

- 层：**Agent**　模块：**AgentExecution**
- 方法数：**86**（逻辑控制 54 · 数据处理 23 · 通用算法 9）

## 文件 `brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts`

### AgentExecutionAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts:60
- **引用次数**：272

#### `execAgent`

- **类型**：逻辑控制
- **说明**：处理执行：Agent（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`execAgent(i: ExecAgentInput, o: ExecAgentOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts:66
- **引用次数**：7

#### `execAgentAsync`

- **类型**：逻辑控制
- **说明**：处理执行：Agent / async（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`execAgentAsync(i: ExecAgentAsyncInput, o: ExecAgentAsyncOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts:74
- **引用次数**：4

#### `execThink`

- **类型**：逻辑控制
- **说明**：处理执行：think（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`execThink(i: ThinkInput, o: ThinkOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts:82
- **引用次数**：4

#### `execAct`

- **类型**：逻辑控制
- **说明**：处理执行：act（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`execAct(i: ActInput, o: ActOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts:89
- **引用次数**：4

#### `execReflect`

- **类型**：逻辑控制
- **说明**：处理执行：reflect（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`execReflect(i: ReflectInput, o: ReflectOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts:96
- **引用次数**：4

#### `execAnswer`

- **类型**：逻辑控制
- **说明**：处理执行：回答（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`execAnswer(i: AnswerInput, o: AnswerOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts:103
- **引用次数**：5

#### `soTrace`

- **类型**：逻辑控制
- **说明**：查询：执行轨迹（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soTrace(i: GetTraceInput, o: GetTraceOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts:110
- **引用次数**：12

#### `soExecQueueStatus`

- **类型**：逻辑控制
- **说明**：查询：队列 / 状态（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`soExecQueueStatus(i: GetExecQueueStatusInput, o: GetExecQueueStatusOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts:118
- **引用次数**：3

#### `configAgentExecution`

- **类型**：逻辑控制
- **说明**：处理 配置 / Agent / execution（返回成功与否，异步编排，接入层转发至 Service）
- **签名**：`configAgentExecution(i: ConfigAgentExecutionInput, o: ConfigAgentExecutionOutput, c: AgentExecutionContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/access/AgentExecutionAccess.ts:126
- **引用次数**：5

## 文件 `brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts`

### AgentExecutionService

#### `execAgent`

- **类型**：数据处理
- **说明**：处理执行：Agent
- **签名**：`execAgent(input: ExecAgentInput, output: ExecAgentOutput, ctx: AgentExecutionContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:168
- **引用次数**：7

### AgentExecutionService（私有）

#### `prepareExecRun`

- **类型**：逻辑控制
- **说明**：构建/初始化：运行（异步编排）
- **签名**：`prepareExecRun(input: ExecAgentInput, ctx: AgentExecutionContext): Promise<{ start: number; config: AgentExecutionConfigRecord \| null; traceId: string; maxIter: number; libCtx: AgentLibraryContext; }>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:194
- **引用次数**：2

#### `soEnabledAgent`

- **类型**：通用算法
- **说明**：查询：enabled / Agent（纯计算，无外部 IO）
- **签名**：`soEnabledAgent(agentId: string, libCtx: AgentLibraryContext): Promise<{ agent: AgentRecord; domain: string; agentName: string }>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:206
- **引用次数**：2

#### `buildExecContextData`

- **类型**：数据处理
- **说明**：构建/初始化：上下文
- **签名**：`buildExecContextData(input: ExecAgentInput, ctx: AgentExecutionContext, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:219
- **引用次数**：2

#### `prepareExecResources`

- **类型**：数据处理
- **说明**：构建/初始化：resources（序列化输出）
- **签名**：`prepareExecResources(input: ExecAgentInput, ctx: AgentExecutionContext, agent: AgentRecord, llmId: string): Promise<PreparedExecResources>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:249
- **引用次数**：2

#### `resolveExecRule`

- **类型**：数据处理
- **说明**：获取：rule（反序列化）
- **签名**：`resolveExecRule(stratOut: GetStrategyOutput, skillIds: string[], mcpIds: string[], maxIter: number): { rule: ExecutionRule \| null; maxFromRule: number }`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:283
- **引用次数**：2

#### `runExecRule`

- **类型**：逻辑控制
- **说明**：处理执行：rule（异步编排）
- **签名**：`runExecRule(rule: ExecutionRule \| null, env: AgentExecutionEnv, history: string, traceIterations: TraceIterations): Promise<{ history: string; finalAnswer: string; totalTokens: number; iteration: number }>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:312
- **引用次数**：2

#### `runDirectAnswer`

- **类型**：逻辑控制
- **说明**：处理执行：direct / 回答（异步编排）
- **签名**：`runDirectAnswer(env: AgentExecutionEnv, history: string, traceIterations: TraceIterations): Promise<{ finalAnswer: string; totalTokens: number }>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:333
- **引用次数**：3

#### `recordExecUsage`

- **类型**：数据处理
- **说明**：写入/新增：用量（序列化输出）
- **签名**：`recordExecUsage(input: ExecAgentInput, ctx: AgentExecutionContext, libCtx: AgentLibraryContext, traceId: string, finalAnswer: string): Promise<void>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:345
- **引用次数**：2

#### `saveExecTraceInfo`

- **类型**：数据处理
- **说明**：写入/新增：执行轨迹 / 信息（序列化输出）
- **签名**：`saveExecTraceInfo(input: ExecAgentInput, output: ExecAgentOutput, ctx: AgentExecutionContext, metrics: Metrics \| undefined, traceId: string, finalAnswer: string, totalTokens: number): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:364
- **引用次数**：2

#### `storeExecTrace`

- **类型**：数据处理
- **说明**：处理 状态仓库 / 执行轨迹
- **签名**：`storeExecTrace(input: ExecAgentInput, traceId: string, start: number, end: number, iterations: TraceIterations, totalTokens: number, answer: string, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:395
- **引用次数**：2

#### `finishExecOutput`

- **类型**：通用算法
- **说明**：结束释放：输出（纯计算，无外部 IO）
- **签名**：`finishExecOutput(output: ExecAgentOutput, finalAnswer: string, iteration: number, traceIterations: TraceIterations, traceId: string, elapsedMs: number): boolean`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:416
- **引用次数**：2

### AgentExecutionService

#### `execAgentAsync`

- **类型**：逻辑控制
- **说明**：处理执行：Agent / async（返回成功与否，含异常兜底，异步编排）
- **签名**：`execAgentAsync(input: ExecAgentAsyncInput, output: ExecAgentAsyncOutput, ctx: AgentExecutionContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:427
- **引用次数**：4

### AgentExecutionService（私有）

#### `execLLMOrThrow`

- **类型**：逻辑控制
- **说明**：处理执行：大模型 / throw（异步编排）
- **签名**：`execLLMOrThrow(llmId: string, prompt: string, stepName: string, system?: string, biz?: { session_id?: string; run_id?: string; work_id?: string }): Promise<ExecLLMOutput>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:507
- **引用次数**：4

### AgentExecutionService

#### `execThink`

- **类型**：数据处理
- **说明**：处理执行：think（序列化输出）
- **签名**：`execThink(input: ThinkInput, output: ThinkOutput, ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:535
- **引用次数**：4

#### `execAct`

- **类型**：数据处理
- **说明**：处理执行：act（序列化输出，反序列化）
- **签名**：`execAct(input: ActInput, output: ActOutput, ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:573
- **引用次数**：4

#### `execReflect`

- **类型**：数据处理
- **说明**：处理执行：reflect
- **签名**：`execReflect(input: ReflectInput, output: ReflectOutput, ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:665
- **引用次数**：4

#### `execAnswer`

- **类型**：逻辑控制
- **说明**：处理执行：回答（返回成功与否，异步编排）
- **签名**：`execAnswer(input: AnswerInput, output: AnswerOutput, _ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:709
- **引用次数**：5

#### `soTrace`

- **类型**：数据处理
- **说明**：查询：执行轨迹（操作关系数据库，反序列化）
- **签名**：`soTrace(input: GetTraceInput, output: GetTraceOutput, _ctx: AgentExecutionContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:742
- **引用次数**：12

#### `soExecQueueStatus`

- **类型**：逻辑控制
- **说明**：查询：队列 / 状态（返回成功与否，含异常兜底，异步编排）
- **签名**：`soExecQueueStatus(_input: GetExecQueueStatusInput, output: GetExecQueueStatusOutput, _ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:817
- **引用次数**：3

#### `configAgentExecution`

- **类型**：数据处理
- **说明**：处理 配置 / Agent / execution（操作关系数据库）
- **签名**：`configAgentExecution(input: ConfigAgentExecutionInput, output: ConfigAgentExecutionOutput, _ctx: AgentExecutionContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:851
- **引用次数**：5

### AgentExecutionService（私有）

#### `runSteps`

- **类型**：数据处理
- **说明**：处理执行：steps
- **签名**：`runSteps(steps: RuleStep[], env: AgentExecutionEnv, history: string, maxIter: number, traceIterations: TraceIterations): Promise<{ history: string; finalAnswer: string; totalTokens: number; iteration: number }>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:906
- **引用次数**：2

#### `runPhases`

- **类型**：通用算法
- **说明**：处理执行：phases（纯计算，无外部 IO）
- **签名**：`runPhases(rule: ExecutionRule, env: AgentExecutionEnv, history: string, maxIter: number, traceIterations: TraceIterations): Promise<{ history: string; finalAnswer: string; totalTokens: number; iteration: number }>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:960
- **引用次数**：2

#### `resolveJump`

- **类型**：数据处理
- **说明**：获取：jump
- **签名**：`resolveJump(target: string, globalSteps: Map<string, { phase: RulePhase; step: RuleStep }>, currentPhase: RulePhase): { phase: RulePhase; step: RuleStep } \| null`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1067
- **引用次数**：2

#### `executeAtomic`

- **类型**：逻辑控制
- **说明**：处理执行：atomic（含异常兜底，异步编排）
- **签名**：`executeAtomic(step: RuleStep, env: AgentExecutionEnv, history: string, iteration: number, maxIter: number): Promise<StepResult>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1081
- **引用次数**：3

#### `dispatchStep`

- **类型**：逻辑控制
- **说明**：处理执行：step
- **签名**：`dispatchStep(step: RuleStep, env: AgentExecutionEnv, history: string, iteration: number, maxIter: number): Promise<StepResult>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1095
- **引用次数**：2

#### `handleStepError`

- **类型**：逻辑控制
- **说明**：处理执行：ndle / step / 错误
- **签名**：`handleStepError(step: RuleStep, history: string, err: unknown): StepResult`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1111
- **引用次数**：2

#### `runThinkStep`

- **类型**：通用算法
- **说明**：处理执行：think / step（纯计算，无外部 IO）
- **签名**：`runThinkStep(step: RuleStep, env: AgentExecutionEnv, history: string, iteration: number): Promise<StepResult>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1118
- **引用次数**：2

#### `runActStep`

- **类型**：逻辑控制
- **说明**：处理执行：act / step（异步编排）
- **签名**：`runActStep(step: RuleStep, env: AgentExecutionEnv, history: string, iteration: number): Promise<StepResult>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1144
- **引用次数**：2

#### `runReflectStep`

- **类型**：逻辑控制
- **说明**：处理执行：reflect / step（异步编排）
- **签名**：`runReflectStep(step: RuleStep, env: AgentExecutionEnv, history: string, iteration: number, maxIter: number): Promise<StepResult>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1155
- **引用次数**：2

#### `runAnswerStep`

- **类型**：逻辑控制
- **说明**：处理执行：回答 / step（异步编排）
- **签名**：`runAnswerStep(step: RuleStep, env: AgentExecutionEnv, history: string): Promise<StepResult>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1174
- **引用次数**：2

#### `buildThinkInput`

- **类型**：逻辑控制
- **说明**：构建/初始化：think / 输入
- **签名**：`buildThinkInput(env: AgentExecutionEnv, history: string, iteration: number): ThinkInput`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1186
- **引用次数**：2

#### `buildActInput`

- **类型**：逻辑控制
- **说明**：构建/初始化：act / 输入
- **签名**：`buildActInput(env: AgentExecutionEnv, history: string): ActInput`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1195
- **引用次数**：2

#### `buildReflectInput`

- **类型**：逻辑控制
- **说明**：构建/初始化：reflect / 输入
- **签名**：`buildReflectInput(env: AgentExecutionEnv, history: string, iteration: number, maxIter: number): ReflectInput`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1203
- **引用次数**：2

#### `buildAnswerInput`

- **类型**：逻辑控制
- **说明**：构建/初始化：回答 / 输入
- **签名**：`buildAnswerInput(env: AgentExecutionEnv, history: string): AnswerInput`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1217
- **引用次数**：3

#### `thinkPromptRef`

- **类型**：逻辑控制
- **说明**：处理 think / 提示词 / ref
- **签名**：`thinkPromptRef(env: AgentExecutionEnv, iteration: number)`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1225
- **引用次数**：2

#### `reflectPromptRef`

- **类型**：逻辑控制
- **说明**：处理 reflect / 提示词 / ref
- **签名**：`reflectPromptRef(env: AgentExecutionEnv, iteration: number, maxIter: number)`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1232
- **引用次数**：2

#### `answerPromptRef`

- **类型**：逻辑控制
- **说明**：处理 回答 / 提示词 / ref
- **签名**：`answerPromptRef(env: AgentExecutionEnv)`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1239
- **引用次数**：3

#### `extractSubSteps`

- **类型**：通用算法
- **说明**：解析：sub / steps（纯计算，无外部 IO）
- **签名**：`extractSubSteps(nextAction: Record<string, unknown> \| null): string[] \| undefined`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1246
- **引用次数**：2

#### `pushThink`

- **类型**：逻辑控制
- **说明**：写入/新增：think
- **签名**：`pushThink(env: AgentExecutionEnv, nodeId: string, thinkOut: ThinkOutput, iteration: number): void`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1252
- **引用次数**：2

#### `pushAct`

- **类型**：逻辑控制
- **说明**：写入/新增：act
- **签名**：`pushAct(env: AgentExecutionEnv, nodeId: string, actOut: ActOutput, iteration: number): void`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1269
- **引用次数**：2

#### `pushReflect`

- **类型**：逻辑控制
- **说明**：写入/新增：reflect
- **签名**：`pushReflect(env: AgentExecutionEnv, nodeId: string, reflectOut: ReflectOutput, iteration: number): void`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1283
- **引用次数**：2

#### `resolveLlm`

- **类型**：逻辑控制
- **说明**：获取：大模型（异步编排）
- **签名**：`resolveLlm(agentId: string, ctx: AgentExecutionContext): Promise<string>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1303
- **引用次数**：8

#### `loadSoulSystem`

- **类型**：逻辑控制
- **说明**：获取：人设 / system（含异常兜底，异步编排）
- **签名**：`loadSoulSystem(soulId: string): Promise<string>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1320
- **引用次数**：4

#### `renderOrFallback`

- **类型**：通用算法
- **说明**：格式化/序列化：fallback（纯计算，无外部 IO）
- **签名**：`renderOrFallback(templateId: string \| undefined, fallbackTitle: string, variables: Record<string, unknown>): Promise<string>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1335
- **引用次数**：4

#### `assertPromptExists`

- **类型**：逻辑控制
- **说明**：处理 assert / 提示词 / exists（异步编排）
- **签名**：`assertPromptExists(id: string): Promise<void>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1369
- **引用次数**：4

#### `soBoundComponentIds`

- **类型**：逻辑控制
- **说明**：查询：bound / 组件 / ids（异步编排）
- **签名**：`soBoundComponentIds(agentId: string, kind: ComponentKind): Promise<string[]>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1382
- **引用次数**：3

#### `loadSkills`

- **类型**：数据处理
- **说明**：获取：skills（操作关系数据库）
- **签名**：`loadSkills(agentId: string, taskContent: string, ctx: AgentExecutionContext): Promise<{ id: string; brief: string; work: string }[]>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1398
- **引用次数**：7

#### `loadMcps`

- **类型**：数据处理
- **说明**：获取：mcps（操作关系数据库）
- **签名**：`loadMcps(agentId: string, taskContent: string, ctx: AgentExecutionContext): Promise<{ id: string; title: string; brief: string }[]>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1430
- **引用次数**：12

#### `buildBrowserToolDef`

- **类型**：逻辑控制
- **说明**：构建/初始化：浏览器 / 工具 / def
- **签名**：`buildBrowserToolDef(): Record<string, unknown>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1459
- **引用次数**：2

#### `execCdtAction`

- **类型**：通用算法
- **说明**：处理执行：CDT / action（纯计算，无外部 IO）
- **签名**：`execCdtAction(operation: string, params: Record<string, unknown>): Promise<string>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1476
- **引用次数**：2

#### `extractEvalText`

- **类型**：数据处理
- **说明**：解析：评估 / 文本（序列化输出）
- **签名**：`extractEvalText(raw: unknown): string`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1560
- **引用次数**：3

#### `saveStepInfo`

- **类型**：数据处理
- **说明**：写入/新增：step / 信息
- **签名**：`saveStepInfo(ctx: AgentExecutionContext, infoType: string, creatorRole: string, creatorId: string, info: string, handleResultType?: string): Promise<void>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1567
- **引用次数**：10

#### `errorText`

- **类型**：逻辑控制
- **说明**：处理 错误 / 文本
- **签名**：`errorText(err: unknown): string`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1599
- **引用次数**：10

#### `getConfig`

- **类型**：数据处理
- **说明**：获取：配置（操作关系数据库）
- **签名**：`getConfig(): Promise<AgentExecutionConfigRecord \| null>`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1603
- **引用次数**：69

#### `toLibCtx`

- **类型**：逻辑控制
- **说明**：格式化/序列化：lib
- **签名**：`toLibCtx(ctx: AgentExecutionContext, workId: string, runId: string): AgentLibraryContext`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1618
- **引用次数**：6

#### `extractLastNextAction`

- **类型**：通用算法
- **说明**：解析：action（纯计算，无外部 IO）
- **签名**：`extractLastNextAction(history: string): string`
- **位置**：brian-backend/Agent/AgentExecution/application/AgentExecutionService.ts:1626
- **引用次数**：2

## 文件 `brian-backend/Agent/AgentExecution/application/trace/PromptRebuilder.ts`

### PromptRebuilder

#### `rebuildPrompt`

- **类型**：逻辑控制
- **说明**：处理 rebuild / 提示词（异步编排）
- **签名**：`rebuildPrompt(ref: PromptReference, contextData: string, history: string): Promise<string>`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/PromptRebuilder.ts:16
- **引用次数**：2

#### `rebuildHistory`

- **类型**：逻辑控制
- **说明**：处理 rebuild / 历史（遍历调度）
- **签名**：`rebuildHistory(iterations: TraceIterations, beforeIndex: number): string`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/PromptRebuilder.ts:23
- **引用次数**：2

#### `formatContextText`

- **类型**：通用算法
- **说明**：格式化/序列化：上下文 / 文本（纯计算，无外部 IO）
- **签名**：`formatContextText(sourceIdsMap: Record<string, string[]>, contentMap: Record<string, string>): string`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/PromptRebuilder.ts:32
- **引用次数**：2

### PromptRebuilder（私有）

#### `appendIterationHistory`

- **类型**：逻辑控制
- **说明**：写入/新增：iteration / 历史
- **签名**：`appendIterationHistory(iter: TraceIterations[number], history: string): string`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/PromptRebuilder.ts:49
- **引用次数**：2

#### `assembleVariables`

- **类型**：逻辑控制
- **说明**：构建/初始化：variables
- **签名**：`assembleVariables(ref: PromptReference, contextData: string, history: string, soul: string): Record<string, unknown>`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/PromptRebuilder.ts:58
- **引用次数**：2

#### `loadSoul`

- **类型**：逻辑控制
- **说明**：获取：人设（含异常兜底，异步编排）
- **签名**：`loadSoul(soulId: string): Promise<string>`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/PromptRebuilder.ts:78
- **引用次数**：2

#### `render`

- **类型**：逻辑控制
- **说明**：格式化/序列化相关数据（异步编排）
- **签名**：`render(templateId: string, variables: Record<string, unknown>): Promise<string>`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/PromptRebuilder.ts:93
- **引用次数**：2

## 文件 `brian-backend/Agent/AgentExecution/application/trace/TraceCodec.ts`

### 模块级函数

#### `buildPromptRef`

- **类型**：逻辑控制
- **说明**：构建/初始化：提示词 / ref
- **签名**：`buildPromptRef(templateId: string \| undefined, fallbackId: string, variables: PromptVariables): PromptReference`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/TraceCodec.ts:15
- **引用次数**：6

#### `buildThinkStep`

- **类型**：逻辑控制
- **说明**：构建/初始化：think / step
- **签名**：`buildThinkStep(out: ThinkOutput, ref?: PromptReference): ThinkStep`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/TraceCodec.ts:23
- **引用次数**：3

#### `buildActStep`

- **类型**：逻辑控制
- **说明**：构建/初始化：act / step
- **签名**：`buildActStep(out: ActOutput): ActStep`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/TraceCodec.ts:35
- **引用次数**：3

#### `buildReflectStep`

- **类型**：逻辑控制
- **说明**：构建/初始化：reflect / step
- **签名**：`buildReflectStep(out: ReflectOutput, ref?: PromptReference): ReflectStep`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/TraceCodec.ts:39
- **引用次数**：3

#### `buildAnswerStep`

- **类型**：逻辑控制
- **说明**：构建/初始化：回答 / step
- **签名**：`buildAnswerStep(out: AnswerOutput, ref?: PromptReference): AnswerStep`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/TraceCodec.ts:51
- **引用次数**：4

#### `stringifyTrace`

- **类型**：数据处理
- **说明**：格式化/序列化：执行轨迹（序列化输出）
- **签名**：`stringifyTrace(iterations: TraceIterations): string`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/TraceCodec.ts:62
- **引用次数**：3

#### `buildSingleAnswerTrace`

- **类型**：逻辑控制
- **说明**：构建/初始化：single / 回答 / 执行轨迹
- **签名**：`buildSingleAnswerTrace(params: { answer: string; raw_response: string; input_tokens: number; output_tokens: number; elapsed_ms: number; template_id?: string; fallback_id?: string; builtin_id?: string; variables: PromptVariables; }): TraceIterations`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/TraceCodec.ts:66
- **引用次数**：5

#### `buildLightTraceRef`

- **类型**：逻辑控制
- **说明**：构建/初始化：light / 执行轨迹 / ref
- **签名**：`buildLightTraceRef(traceId: string, answer: string, totalTokens: number): LightTraceRef`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/TraceCodec.ts:92
- **引用次数**：3

## 文件 `brian-backend/Agent/AgentExecution/application/trace/TraceStore.ts`

### TraceStore

#### `save`

- **类型**：数据处理
- **说明**：写入/新增相关数据（操作关系数据库）
- **签名**：`save(input: TraceSaveInput, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/TraceStore.ts:31
- **引用次数**：17

#### `load`

- **类型**：数据处理
- **说明**：获取相关数据（操作关系数据库）
- **签名**：`load(traceId: string): Promise<TraceRecord \| null>`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/TraceStore.ts:58
- **引用次数**：16

### TraceStore（私有）

#### `toRecord`

- **类型**：逻辑控制
- **说明**：格式化/序列化：record
- **签名**：`toRecord(row: Record<string, unknown>): TraceRecord`
- **位置**：brian-backend/Agent/AgentExecution/application/trace/TraceStore.ts:66
- **引用次数**：9

## 文件 `brian-backend/Agent/AgentExecution/infrastructure/AgentExecutionSchemaInitializer.ts`

### AgentExecutionSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): Promise<void>`
- **位置**：brian-backend/Agent/AgentExecution/infrastructure/AgentExecutionSchemaInitializer.ts:8
- **引用次数**：99

