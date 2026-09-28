# Runtime / Runs

- 层：**Runtime**　模块：**Runs**
- 方法数：**86**（逻辑控制 45 · 数据处理 35 · 通用算法 6）

## 文件 `brian-backend/Runtime/Runs/access/RunGatewayAccess.ts`

### RunGatewayAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:54
- **引用次数**：272

#### `submitRun`

- **类型**：逻辑控制
- **说明**：处理 submit / 运行（返回成功与否，接入层转发至 Service）
- **签名**：`submitRun(input: SubmitRunInput, output: SubmitRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:59
- **引用次数**：24

#### `waitRun`

- **类型**：逻辑控制
- **说明**：处理 wait / 运行（返回成功与否，接入层转发至 Service）
- **签名**：`waitRun(input: WaitRunInput, output: WaitRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:65
- **引用次数**：24

#### `steerRun`

- **类型**：逻辑控制
- **说明**：处理 steer / 运行（返回成功与否，接入层转发至 Service）
- **签名**：`steerRun(input: SteerRunInput, output: SteerRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:71
- **引用次数**：3

#### `abortRun`

- **类型**：逻辑控制
- **说明**：删除/清理：运行（返回成功与否，接入层转发至 Service）
- **签名**：`abortRun(input: AbortRunInput, output: AbortRunOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:77
- **引用次数**：5

#### `soRunStatus`

- **类型**：逻辑控制
- **说明**：查询：状态（返回成功与否，接入层转发至 Service）
- **签名**：`soRunStatus(input: SoRunStatusInput, output: SoRunStatusOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:83
- **引用次数**：3

#### `waitPermission`

- **类型**：逻辑控制
- **说明**：处理 wait / 授权（返回成功与否，接入层转发至 Service）
- **签名**：`waitPermission(i: WaitPermissionInput, o: WaitPermissionOutput, c: RunGatewayContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:89
- **引用次数**：9

#### `answerPermission`

- **类型**：逻辑控制
- **说明**：处理 回答 / 授权（返回成功与否，接入层转发至 Service）
- **签名**：`answerPermission(i: AnswerPermissionInput, o: AnswerPermissionOutput, c: RunGatewayContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:95
- **引用次数**：13

#### `waitUserAnswer`

- **类型**：逻辑控制
- **说明**：处理 wait / 用户 / 回答（返回成功与否，接入层转发至 Service）
- **签名**：`waitUserAnswer(i: WaitUserAnswerInput, o: WaitUserAnswerOutput, c: RunGatewayContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:101
- **引用次数**：7

#### `answerUserAsk`

- **类型**：逻辑控制
- **说明**：处理 回答 / 用户 / ask（返回成功与否，接入层转发至 Service）
- **签名**：`answerUserAsk(i: AnswerUserAskInput, o: AnswerUserAskOutput, c: RunGatewayContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:107
- **引用次数**：11

#### `configRuns`

- **类型**：逻辑控制
- **说明**：处理 配置 / runs（返回成功与否，接入层转发至 Service）
- **签名**：`configRuns(input: ConfigRunsInput, output: ConfigRunsOutput, context: RunGatewayContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:113
- **引用次数**：10

#### `drainSteeringFor`

- **类型**：逻辑控制
- **说明**：处理 drain / steering（接入层转发至 Service）
- **签名**：`drainSteeringFor(sessionKey: string): string[]`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:119
- **引用次数**：6

#### `takeFollowupFor`

- **类型**：逻辑控制
- **说明**：处理 take / followup（接入层转发至 Service）
- **签名**：`takeFollowupFor(sessionKey: string): string[]`
- **位置**：brian-backend/Runtime/Runs/access/RunGatewayAccess.ts:124
- **引用次数**：6

## 文件 `brian-backend/Runtime/Runs/application/RunGatewayService.ts`

### RunGatewayService（私有）

#### `buildStaticMemory`

- **类型**：通用算法
- **说明**：构建/初始化：static / 记忆（纯计算，无外部 IO）
- **签名**：`buildStaticMemory(runId: string, input: SubmitRunInput, metrics?: Metrics, report?: Report): Promise<{ memory: string; categories: string[] }>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:137
- **引用次数**：2

#### `composeSystemWithMemory`

- **类型**：逻辑控制
- **说明**：构建/初始化：system / 记忆
- **签名**：`composeSystemWithMemory(baseSystem: string, memory: string): string`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:172
- **引用次数**：2

### RunGatewayService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:177
- **引用次数**：272

### RunGatewayService（私有）

#### `convergeOrphanRuns`

- **类型**：数据处理
- **说明**：处理 converge / orphan / runs（操作关系数据库）
- **签名**：`convergeOrphanRuns(): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:184
- **引用次数**：2

#### `ensureEnabled`

- **类型**：逻辑控制
- **说明**：确保就绪：enabled
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:210
- **引用次数**：118

### RunGatewayService

#### `submitRun`

- **类型**：逻辑控制
- **说明**：处理 submit / 运行（返回成功与否，异步编排）
- **签名**：`submitRun(input: SubmitRunInput, output: SubmitRunOutput, _context: RunGatewayContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:216
- **引用次数**：24

### RunGatewayService（私有）

#### `registerDelegation`

- **类型**：数据处理
- **说明**：写入/新增：delegation
- **签名**：`registerDelegation(input: SubmitRunInput, runId: string): void`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:248
- **引用次数**：2

#### `publishRunAccepted`

- **类型**：逻辑控制
- **说明**：发送通知：accepted
- **签名**：`publishRunAccepted(sessionKey: string, runId: string, report?: Report, _metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:257
- **引用次数**：2

#### `soLaneKey`

- **类型**：逻辑控制
- **说明**：查询：lane / 键
- **签名**：`soLaneKey(input: SubmitRunInput): string`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:261
- **引用次数**：2

#### `soLane`

- **类型**：数据处理
- **说明**：查询：lane
- **签名**：`soLane(laneKey: string): SessionLane`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:265
- **引用次数**：6

#### `isLaneBusy`

- **类型**：数据处理
- **说明**：判断校验：lane / busy
- **签名**：`isLaneBusy(laneKey: string): boolean`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:274
- **引用次数**：2

#### `enqueueByQueueMode`

- **类型**：数据处理
- **说明**：处理 enqueue / 队列 / mode
- **签名**：`enqueueByQueueMode(lane: SessionLane, input: SubmitRunInput, runtimeSessionId: string, parent: { metrics?: Metrics; report?: Report }): Promise<{ runId: string; queued: boolean; steered: boolean }>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:282
- **引用次数**：2

#### `prepareAbortInput`

- **类型**：逻辑控制
- **说明**：构建/初始化：abort / 输入
- **签名**：`prepareAbortInput(runId: string): AbortRunInput`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:308
- **引用次数**：2

#### `soRunTraceId`

- **类型**：逻辑控制
- **说明**：查询：执行轨迹 / 标识
- **签名**：`soRunTraceId(_input: SubmitRunInput, parent?: { metrics?: Metrics; report?: Report }): string`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:315
- **引用次数**：3

#### `insertQueuedRun`

- **类型**：数据处理
- **说明**：写入/新增：queued / 运行（操作关系数据库）
- **签名**：`insertQueuedRun(input: SubmitRunInput, mode: QueueMode, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }): Promise<string>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:319
- **引用次数**：2

#### `startRun`

- **类型**：数据处理
- **说明**：启动：运行（操作关系数据库）
- **签名**：`startRun(input: SubmitRunInput, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }, runId?: string): Promise<string>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:334
- **引用次数**：3

#### `executeRun`

- **类型**：数据处理
- **说明**：处理执行：运行
- **签名**：`executeRun(runId: string, input: SubmitRunInput, runtimeSessionId: string, parent?: { metrics?: Metrics; report?: Report }): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:365
- **引用次数**：2

#### `soRunSessionId`

- **类型**：逻辑控制
- **说明**：查询：会话 / 标识
- **签名**：`soRunSessionId(runId: string, input: SubmitRunInput, runtimeSessionId: string): Promise<string>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:393
- **引用次数**：2

#### `soSubSessionKey`

- **类型**：逻辑控制
- **说明**：查询：sub / 会话 / 键
- **签名**：`soSubSessionKey(sessionKey: string, runId: string): string`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:400
- **引用次数**：4

#### `finishRunByLane`

- **类型**：数据处理
- **说明**：结束释放：lane
- **签名**：`finishRunByLane(runId: string, input: SubmitRunInput, runtimeSessionId: string, matchOut: MatchAgentDefOutput, loopInput: ExecAgentLoopInput, loopOutput: ExecAgentLoopOutput, parent?: { metrics?: Metrics; report?: Report }): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:404
- **引用次数**：2

#### `joinChildRuns`

- **类型**：数据处理
- **说明**：转换归并：child / runs
- **签名**：`joinChildRuns(runId: string): Promise<string[]>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:429
- **引用次数**：2

#### `collectChildResults`

- **类型**：数据处理
- **说明**：处理 collect / child / results
- **签名**：`collectChildResults(runtimeSessionId: string, runId: string, childIds: string[]): Promise<Map<string, { agent_id: string; task_content: string; result: string }>>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:447
- **引用次数**：2

#### `soChildOutcome`

- **类型**：数据处理
- **说明**：查询：child / outcome（操作关系数据库）
- **签名**：`soChildOutcome(runtimeSessionId: string, childId: string): Promise<{ agent_id: string; task_content: string; result: string } \| null>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:459
- **引用次数**：2

#### `updateDelegatePartOutputs`

- **类型**：数据处理
- **说明**：更新：delegate / part / outputs（操作关系数据库）
- **签名**：`updateDelegatePartOutputs(runId: string, collected: Map<string, { agent_id: string; task_content: string; result: string }>): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:481
- **引用次数**：2

#### `parseRunIdFromReceipt`

- **类型**：数据处理
- **说明**：解析：标识 / receipt
- **签名**：`parseRunIdFromReceipt(outputJson?: string): string \| null`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:501
- **引用次数**：2

#### `publishAgentComponents`

- **类型**：数据处理
- **说明**：发送通知：Agent / components
- **签名**：`publishAgentComponents(matchOut: MatchAgentDefOutput, snapshot: SoAgentSnapshotOutput['snapshot'], report?: Report): { systemSkillCount: number; boundSkillCount: number; mcpCount: number }`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:506
- **引用次数**：2

#### `publishThoughtModeSelected`

- **类型**：逻辑控制
- **说明**：发送通知：thought / mode / selected
- **签名**：`publishThoughtModeSelected(thoughtMode: { mode: 'CoT' \| 'ReAct'; reason: string }, skillCount: number, mcpCount: number, report?: Report): void`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:564
- **引用次数**：2

#### `prepareLoopContext`

- **类型**：数据处理
- **说明**：构建/初始化：loop / 上下文
- **签名**：`prepareLoopContext(loopInput: ExecAgentLoopInput, snapshot: SoAgentSnapshotOutput['snapshot'], memory: string, thoughtMode: 'CoT' \| 'ReAct'): void`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:578
- **引用次数**：4

#### `executeRunEvaluation`

- **类型**：逻辑控制
- **说明**：处理执行：evaluation（异步编排）
- **签名**：`executeRunEvaluation(runId: string, input: SubmitRunInput, matchOut: MatchAgentDefOutput, loopOutput: ExecAgentLoopOutput, parent?: { metrics?: Metrics; report?: Report }): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:591
- **引用次数**：2

#### `executeRunWriting`

- **类型**：数据处理
- **说明**：处理执行：writing
- **签名**：`executeRunWriting(runId: string, input: SubmitRunInput, matchOut: MatchAgentDefOutput, loopOutput: ExecAgentLoopOutput, parent?: { metrics?: Metrics; report?: Report }, childResults?: Map<string, { agent_id: string; task_content: string; result: string }>): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:616
- **引用次数**：2

#### `applyWriterResult`

- **类型**：数据处理
- **说明**：更新：写作 / result
- **签名**：`applyWriterResult(finalResult: string, writeOut: { response?: string; response_format?: string; blocks?: unknown[] }, loopOutput: ExecAgentLoopOutput, parent?: { metrics?: Metrics; report?: Report }): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:651
- **引用次数**：2

#### `recordRunOutcome`

- **类型**：逻辑控制
- **说明**：写入/新增：outcome（异步编排）
- **签名**：`recordRunOutcome(runId: string, input: SubmitRunInput, matchOut: MatchAgentDefOutput, loopOutput: ExecAgentLoopOutput, parent?: { metrics?: Metrics; report?: Report }): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:668
- **引用次数**：2

#### `settleRunFailure`

- **类型**：逻辑控制
- **说明**：更新：failure（异步编排）
- **签名**：`settleRunFailure(runId: string, input: SubmitRunInput, matchOut: MatchAgentDefOutput \| undefined, err: unknown, parent?: { metrics?: Metrics; report?: Report }): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:694
- **引用次数**：2

#### `killErroredAgent`

- **类型**：逻辑控制
- **说明**：处理 kill / errored / Agent（含异常兜底，异步编排）
- **签名**：`killErroredAgent(runId: string, matchOut: MatchAgentDefOutput, input: SubmitRunInput, metrics?: Metrics, report?: Report, errorMessage?: string): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:710
- **引用次数**：7

#### `runWorkEvaluation`

- **类型**：逻辑控制
- **说明**：处理执行：work / evaluation（含异常兜底，异步编排）
- **签名**：`runWorkEvaluation(runId: string, input: SubmitRunInput, matchOut: MatchAgentDefOutput, loopOutput: ExecAgentLoopOutput, evalWorkId: string, parent?: { metrics?: Metrics; report?: Report }): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:738
- **引用次数**：3

#### `soEvalAsync`

- **类型**：逻辑控制
- **说明**：查询：评估 / async（返回成功与否，异步编排）
- **签名**：`soEvalAsync(): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:761
- **引用次数**：3

#### `soEvalSkipLowRisk`

- **类型**：逻辑控制
- **说明**：查询：评估 / skip / low / risk（返回成功与否，异步编排）
- **签名**：`soEvalSkipLowRisk(): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:766
- **引用次数**：3

#### `updateAssistantMessageContent`

- **类型**：数据处理
- **说明**：更新：assistant / 消息 / content（操作关系数据库）
- **签名**：`updateAssistantMessageContent(messageId: string, content: string): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:771
- **引用次数**：2

#### `soRuntimeSessionId`

- **类型**：逻辑控制
- **说明**：查询：runtime / 会话 / 标识（异步编排）
- **签名**：`soRuntimeSessionId(sessionKey: string, metrics?: Metrics): Promise<string>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:789
- **引用次数**：6

#### `matchAgent`

- **类型**：逻辑控制
- **说明**：判断校验：Agent（异步编排）
- **签名**：`matchAgent(runId: string, input: SubmitRunInput, metrics?: Metrics, report?: Report): Promise<MatchAgentDefOutput>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:797
- **引用次数**：15

#### `soSnapshot`

- **类型**：数据处理
- **说明**：查询：快照
- **签名**：`soSnapshot(defId: string, runId: string, input: SubmitRunInput, metrics?: Metrics, report?: Report): Promise<SoAgentSnapshotOutput['snapshot']>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:810
- **引用次数**：2

### RunGatewayService（静态）（私有）

#### `isObservableSkill`

- **类型**：通用算法
- **说明**：判断校验：observable / 技能（纯计算，无外部 IO）
- **签名**：`isObservableSkill(skillId: string): boolean`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:831
- **引用次数**：2

### RunGatewayService（私有）

#### `decideThoughtMode`

- **类型**：通用算法
- **说明**：处理 decide / thought / mode（纯计算，无外部 IO）
- **签名**：`decideThoughtMode(skillIds: string[], _skillCount: number, mcpCount: number): { mode: 'CoT' \| 'ReAct'; reason: string }`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:838
- **引用次数**：3

#### `prepareLoopInput`

- **类型**：数据处理
- **说明**：构建/初始化：loop / 输入
- **签名**：`prepareLoopInput(runId: string, input: SubmitRunInput, runtimeSessionId: string, snapshot: SoAgentSnapshotOutput['snapshot']): ExecAgentLoopInput`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:852
- **引用次数**：2

#### `settleRun`

- **类型**：数据处理
- **说明**：更新：运行（操作关系数据库）
- **签名**：`settleRun(runId: string, stopReason: string, budgetUsed: number, agentDefId: string, agentRef?: string, _taskContent?: string, metrics?: Metrics, report?: Report, errorMessage?: string): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:890
- **引用次数**：3

#### `drainFollowups`

- **类型**：数据处理
- **说明**：处理 drain / followups
- **签名**：`drainFollowups(settledRunId: string): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:922
- **引用次数**：2

#### `maybeDrainLane`

- **类型**：逻辑控制
- **说明**：处理 maybe / drain / lane（异步编排）
- **签名**：`maybeDrainLane(laneKey: string): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:936
- **引用次数**：3

#### `soLaneKeyOf`

- **类型**：逻辑控制
- **说明**：查询：lane / 键
- **签名**：`soLaneKeyOf(row: Record<string, unknown>): string`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:949
- **引用次数**：2

#### `soRunRow`

- **类型**：数据处理
- **说明**：查询：row（操作关系数据库）
- **签名**：`soRunRow(runId: string): Promise<Record<string, unknown> \| null>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:953
- **引用次数**：8

### RunGatewayService

#### `waitRun`

- **类型**：逻辑控制
- **说明**：处理 wait / 运行（返回成功与否，异步编排）
- **签名**：`waitRun(input: WaitRunInput, output: WaitRunOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:959
- **引用次数**：24

### RunGatewayService（私有）

#### `isSettledStatus`

- **类型**：逻辑控制
- **说明**：判断校验：settled / 状态
- **签名**：`isSettledStatus(status: string): boolean`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:978
- **引用次数**：4

#### `registerWaiter`

- **类型**：数据处理
- **说明**：写入/新增：waiter
- **签名**：`registerWaiter(runId: string, timeoutMs: number): Promise<{ status: RunStatus; stop_reason?: string }>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:982
- **引用次数**：2

### RunGatewayService

#### `steerRun`

- **类型**：逻辑控制
- **说明**：处理 steer / 运行（返回成功与否）
- **签名**：`steerRun(input: SteerRunInput, output: SteerRunOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:999
- **引用次数**：3

#### `abortRun`

- **类型**：逻辑控制
- **说明**：删除/清理：运行（返回成功与否，异步编排）
- **签名**：`abortRun(input: AbortRunInput, output: AbortRunOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1009
- **引用次数**：5

#### `soRunStatus`

- **类型**：逻辑控制
- **说明**：查询：状态（返回成功与否，异步编排）
- **签名**：`soRunStatus(input: SoRunStatusInput, output: SoRunStatusOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1021
- **引用次数**：3

### RunGatewayService（私有）

#### `toRunRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：record
- **签名**：`toRunRecord(row: Record<string, unknown>): RunRecord`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1028
- **引用次数**：4

#### `soTrustedTools`

- **类型**：数据处理
- **说明**：查询：trusted / tools（反序列化）
- **签名**：`soTrustedTools(): Promise<Set<string>>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1052
- **引用次数**：4

#### `persistTrustedTools`

- **类型**：数据处理
- **说明**：写入/新增：trusted / tools（序列化输出）
- **签名**：`persistTrustedTools(): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1064
- **引用次数**：4

### RunGatewayService

#### `waitPermission`

- **类型**：数据处理
- **说明**：处理 wait / 授权
- **签名**：`waitPermission(input: WaitPermissionInput, output: WaitPermissionOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1075
- **引用次数**：9

#### `answerPermission`

- **类型**：数据处理
- **说明**：处理 回答 / 授权
- **签名**：`answerPermission(input: AnswerPermissionInput, output: AnswerPermissionOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1119
- **引用次数**：13

#### `waitUserAnswer`

- **类型**：数据处理
- **说明**：处理 wait / 用户 / 回答
- **签名**：`waitUserAnswer(input: WaitUserAnswerInput, output: WaitUserAnswerOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1145
- **引用次数**：7

#### `answerUserAsk`

- **类型**：数据处理
- **说明**：处理 回答 / 用户 / ask
- **签名**：`answerUserAsk(input: AnswerUserAskInput, output: AnswerUserAskOutput, _context: RunGatewayContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1171
- **引用次数**：11

### RunGatewayService（私有）

#### `persistUserAnswer`

- **类型**：逻辑控制
- **说明**：写入/新增：用户 / 回答（异步编排）
- **签名**：`persistUserAnswer(sessionKey: string, runId: string, answer: string, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1188
- **引用次数**：2

#### `scheduleCurator`

- **类型**：逻辑控制
- **说明**：处理 schedule / curator（异步编排）
- **签名**：`scheduleCurator(runId: string, input: SubmitRunInput, matchOut: MatchAgentDefOutput, loopOutput: ExecAgentLoopOutput, evalWorkId: string, parent?: { metrics?: Metrics; report?: Report }): void`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1203
- **引用次数**：2

### RunGatewayService

#### `configRuns`

- **类型**：数据处理
- **说明**：处理 配置 / runs
- **签名**：`configRuns(input: ConfigRunsInput, output: ConfigRunsOutput, _context: RunGatewayContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1220
- **引用次数**：10

### RunGatewayService（私有）

#### `soPermissionWaitTimeout`

- **类型**：逻辑控制
- **说明**：查询：授权 / wait / 超时（异步编排）
- **签名**：`soPermissionWaitTimeout(): Promise<number>`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1253
- **引用次数**：4

#### `soComponentName`

- **类型**：数据处理
- **说明**：查询：组件 / name（操作关系数据库）
- **签名**：`soComponentName(id: string, table: string, nameCol: string): string`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1258
- **引用次数**：15

#### `soSkillName`

- **类型**：逻辑控制
- **说明**：查询：技能 / name
- **签名**：`soSkillName(id: string): string`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1272
- **引用次数**：4

### RunGatewayService

#### `drainSteeringFor`

- **类型**：通用算法
- **说明**：处理 drain / steering（纯计算，无外部 IO）
- **签名**：`drainSteeringFor(sessionKey: string): string[]`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1276
- **引用次数**：6

#### `takeFollowupFor`

- **类型**：通用算法
- **说明**：处理 take / followup（纯计算，无外部 IO）
- **签名**：`takeFollowupFor(sessionKey: string): string[]`
- **位置**：brian-backend/Runtime/Runs/application/RunGatewayService.ts:1281
- **引用次数**：6

## 文件 `brian-backend/Runtime/Runs/infrastructure/LaneSemaphore.ts`

### LaneSemaphore

#### `acquire`

- **类型**：逻辑控制
- **说明**：处理 acquire
- **签名**：`acquire(): Promise<void>`
- **位置**：brian-backend/Runtime/Runs/infrastructure/LaneSemaphore.ts:13
- **引用次数**：3

#### `release`

- **类型**：通用算法
- **说明**：处理 release（纯计算，无外部 IO）
- **签名**：`release(): void`
- **位置**：brian-backend/Runtime/Runs/infrastructure/LaneSemaphore.ts:27
- **引用次数**：25

## 文件 `brian-backend/Runtime/Runs/infrastructure/RunsSchemaInitializer.ts`

### RunsSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Runtime/Runs/infrastructure/RunsSchemaInitializer.ts:7
- **引用次数**：99

