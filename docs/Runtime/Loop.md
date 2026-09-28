# Runtime / Loop

- 层：**Runtime**　模块：**Loop**
- 方法数：**48**（逻辑控制 31 · 数据处理 11 · 通用算法 6）

## 文件 `brian-backend/Runtime/Loop/access/LoopAccess.ts`

### LoopAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/access/LoopAccess.ts:32
- **引用次数**：272

#### `execAgentLoop`

- **类型**：逻辑控制
- **说明**：处理执行：Agent / loop（返回成功与否，接入层转发至 Service）
- **签名**：`execAgentLoop(input: ExecAgentLoopInput, output: ExecAgentLoopOutput, context: LoopContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Loop/access/LoopAccess.ts:37
- **引用次数**：11

#### `abortLoopTurn`

- **类型**：逻辑控制
- **说明**：删除/清理：loop / turn（返回成功与否，接入层转发至 Service）
- **签名**：`abortLoopTurn(input: AbortLoopTurnInput, output: AbortLoopTurnOutput, context: LoopContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Loop/access/LoopAccess.ts:43
- **引用次数**：4

#### `configLoop`

- **类型**：逻辑控制
- **说明**：处理 配置 / loop（返回成功与否，接入层转发至 Service）
- **签名**：`configLoop(input: ConfigLoopInput, output: ConfigLoopOutput, context: LoopContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Loop/access/LoopAccess.ts:49
- **引用次数**：4

## 文件 `brian-backend/Runtime/Loop/application/AgentLoopService.ts`

### AgentLoopService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:148
- **引用次数**：272

### AgentLoopService（私有）

#### `ensureEnabled`

- **类型**：逻辑控制
- **说明**：确保就绪：enabled
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:152
- **引用次数**：118

### AgentLoopService

#### `execAgentLoop`

- **类型**：逻辑控制
- **说明**：处理执行：Agent / loop（返回成功与否，异步编排）
- **签名**：`execAgentLoop(input: ExecAgentLoopInput, output: ExecAgentLoopOutput, _context: LoopContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:158
- **引用次数**：11

### AgentLoopService（私有）

#### `validateLoopInput`

- **类型**：逻辑控制
- **说明**：判断校验：loop / 输入
- **签名**：`validateLoopInput(input: ExecAgentLoopInput): void`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:172
- **引用次数**：2

#### `prepareLoopContext`

- **类型**：数据处理
- **说明**：构建/初始化：loop / 上下文
- **签名**：`prepareLoopContext(input: ExecAgentLoopInput, metrics?: Metrics, report?: Report): Promise<LoopRunContext>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:178
- **引用次数**：4

#### `prepareContextFields`

- **类型**：逻辑控制
- **说明**：构建/初始化：上下文 / fields
- **签名**：`prepareContextFields(input: ExecAgentLoopInput, budget: IterationBudget, controller: AbortController, specs: SkillSpecJson[], metrics?: Metrics, report?: Report): LoopRunContext`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:196
- **引用次数**：2

#### `wireExternalSignal`

- **类型**：通用算法
- **说明**：处理 wire / external / signal（纯计算，无外部 IO）
- **签名**：`wireExternalSignal(input: ExecAgentLoopInput, controller: AbortController): void`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:232
- **引用次数**：2

#### `persistUserMessage`

- **类型**：逻辑控制
- **说明**：写入/新增：用户 / 消息（异步编排）
- **签名**：`persistUserMessage(input: ExecAgentLoopInput, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:247
- **引用次数**：2

#### `soLoopSkillSpecs`

- **类型**：逻辑控制
- **说明**：查询：loop / 技能 / specs（异步编排）
- **签名**：`soLoopSkillSpecs(skillIds: string[] \| undefined, runId: string, metrics?: Metrics): Promise<SkillSpecJson[]>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:256
- **引用次数**：2

#### `registerRunSkills`

- **类型**：通用算法
- **说明**：写入/新增：skills（纯计算，无外部 IO）
- **签名**：`registerRunSkills(input: ExecAgentLoopInput, metrics?: Metrics): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:265
- **引用次数**：11

#### `runOuterLoop`

- **类型**：数据处理
- **说明**：处理执行：outer / loop
- **签名**：`runOuterLoop(ctx: LoopRunContext): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:282
- **引用次数**：2

#### `persistInjectedMessages`

- **类型**：逻辑控制
- **说明**：写入/新增：injected / messages（遍历调度，异步编排）
- **签名**：`persistInjectedMessages(ctx: LoopRunContext, messages: string[]): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:296
- **引用次数**：3

#### `runInnerLoop`

- **类型**：逻辑控制
- **说明**：处理执行：inner / loop（遍历调度，异步编排）
- **签名**：`runInnerLoop(ctx: LoopRunContext): Promise<LoopStopReason>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:307
- **引用次数**：3

#### `consumeBudget`

- **类型**：逻辑控制
- **说明**：处理 consume / budget
- **签名**：`consumeBudget(ctx: LoopRunContext): { stop: boolean; reason?: LoopStopReason; finalTurn: boolean }`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:316
- **引用次数**：2

#### `runInnerTurn`

- **类型**：数据处理
- **说明**：处理执行：inner / turn
- **签名**：`runInnerTurn(ctx: LoopRunContext): Promise<'continue' \| LoopStopReason>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:324
- **引用次数**：2

#### `emitLoopTurnResult`

- **类型**：通用算法
- **说明**：发送通知：loop / turn / result（纯计算，无外部 IO）
- **签名**：`emitLoopTurnResult(ctx: LoopRunContext, round: number, finishReason: string, text: string, toolCalls: string[], nextAction: 'continue' \| 'stop' \| 'error' \| 'budget', reason: string): void`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:388
- **引用次数**：4

#### `callLLMTurn`

- **类型**：逻辑控制
- **说明**：处理 call / 大模型 / turn（含异常兜底，异步编排）
- **签名**：`callLLMTurn(ctx: LoopRunContext): Promise<LLMTurnResult>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:410
- **引用次数**：3

#### `fillTurnResult`

- **类型**：逻辑控制
- **说明**：处理 fill / turn / result
- **签名**：`fillTurnResult(output: ExecLLMEventsOutput): LLMTurnResult`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:439
- **引用次数**：2

#### `prepareLLMTurnInput`

- **类型**：通用算法
- **说明**：构建/初始化：大模型 / turn / 输入（纯计算，无外部 IO）
- **签名**：`prepareLLMTurnInput(ctx: LoopRunContext): Promise<ExecLLMEventsInput>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:451
- **引用次数**：2

#### `streamHandler`

- **类型**：逻辑控制
- **说明**：监听订阅：handler
- **签名**：`streamHandler(ctx: LoopRunContext, event: LLMEvent): void`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:491
- **引用次数**：6

#### `bufferDelta`

- **类型**：逻辑控制
- **说明**：处理 缓冲区 / delta
- **签名**：`bufferDelta(ctx: LoopRunContext, field: 'text' \| 'reasoning', delta: string): void`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:501
- **引用次数**：3

#### `flushDeltaBuffer`

- **类型**：逻辑控制
- **说明**：处理 delta / 缓冲区（遍历调度）
- **签名**：`flushDeltaBuffer(ctx: LoopRunContext, textAs: 'reply' \| 'think'): void`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:509
- **引用次数**：5

#### `publishPartDelta`

- **类型**：逻辑控制
- **说明**：发送通知：part / delta
- **签名**：`publishPartDelta(ctx: LoopRunContext, field: 'text' \| 'reasoning', delta: string, textAs: 'reply' \| 'think'): void`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:524
- **引用次数**：2

#### `prepareModelMessages`

- **类型**：逻辑控制
- **说明**：构建/初始化：模型 / messages（遍历调度，异步编排）
- **签名**：`prepareModelMessages(sessionId: string, metrics?: Metrics): Promise<LLMMessage[]>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:530
- **引用次数**：3

#### `assistantToWire`

- **类型**：通用算法
- **说明**：处理 assistant / wire（纯计算，无外部 IO）
- **签名**：`assistantToWire(message: MessageWithParts, wire: LLMMessage[]): void`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:547
- **引用次数**：2

#### `toWireSkillCall`

- **类型**：通用算法
- **说明**：格式化/序列化：wire / 技能 / call（纯计算，无外部 IO）
- **签名**：`toWireSkillCall(part: PartRecord): WireSkillCall \| null`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:563
- **引用次数**：2

#### `toSkillResultMessage`

- **类型**：逻辑控制
- **说明**：格式化/序列化：技能 / result / 消息
- **签名**：`toSkillResultMessage(part: PartRecord): LLMMessage`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:575
- **引用次数**：2

#### `persistAssistantTurn`

- **类型**：数据处理
- **说明**：写入/新增：assistant / turn
- **签名**：`persistAssistantTurn(ctx: LoopRunContext, turn: LLMTurnResult): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:584
- **引用次数**：2

#### `persistTurnParts`

- **类型**：逻辑控制
- **说明**：写入/新增：turn / parts（遍历调度，异步编排）
- **签名**：`persistTurnParts(ctx: LoopRunContext, messageId: string, turn: LLMTurnResult): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:600
- **引用次数**：2

#### `addTurnPart`

- **类型**：数据处理
- **说明**：写入/新增：turn / part
- **签名**：`addTurnPart(ctx: LoopRunContext, messageId: string, partType: PartType, content: string): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:612
- **引用次数**：3

#### `addSkillPart`

- **类型**：数据处理
- **说明**：写入/新增：技能 / part（序列化输出）
- **签名**：`addSkillPart(ctx: LoopRunContext, messageId: string, call: ParsedToolCall): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:627
- **引用次数**：2

#### `consumeToolCalls`

- **类型**：逻辑控制
- **说明**：处理 consume / 工具 / calls（遍历调度，异步编排）
- **签名**：`consumeToolCalls(ctx: LoopRunContext, toolCalls: ParsedToolCall[]): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:639
- **引用次数**：2

#### `askPermission`

- **类型**：逻辑控制
- **说明**：处理 ask / 授权（返回成功与否，异步编排）
- **签名**：`askPermission(ctx: LoopRunContext, call: ParsedToolCall): Promise<boolean>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:659
- **引用次数**：2

#### `soSkillPart`

- **类型**：逻辑控制
- **说明**：查询：技能 / part（异步编排）
- **签名**：`soSkillPart(ctx: LoopRunContext, call: ParsedToolCall): Promise<PartRecord \| null>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:698
- **引用次数**：2

#### `parseToolMeta`

- **类型**：数据处理
- **说明**：解析：工具 / meta（反序列化）
- **签名**：`parseToolMeta(inputJson?: string): { tool_call_id?: string; arguments?: string }`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:717
- **引用次数**：4

#### `markPartRunning`

- **类型**：数据处理
- **说明**：更新：part / running
- **签名**：`markPartRunning(ctx: LoopRunContext, partId: string, call: ParsedToolCall): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:725
- **引用次数**：2

#### `execLoopSkill`

- **类型**：逻辑控制
- **说明**：处理执行：loop / 技能（异步编排）
- **签名**：`execLoopSkill(ctx: LoopRunContext, call: ParsedToolCall): Promise<{ status: string; output: string; elapsed_ms?: number }>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:734
- **引用次数**：2

#### `completeSkillPart`

- **类型**：数据处理
- **说明**：结束释放：技能 / part
- **签名**：`completeSkillPart(ctx: LoopRunContext, partId: string, call: ParsedToolCall, result: { status: string; output: string; elapsed_ms?: number }): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:751
- **引用次数**：3

#### `publishPartCreated`

- **类型**：逻辑控制
- **说明**：发送通知：part / created
- **签名**：`publishPartCreated(ctx: LoopRunContext, messageId: string, partId: string, partType: PartType, _toolId?: string): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:762
- **引用次数**：3

#### `publishRunStatus`

- **类型**：逻辑控制
- **说明**：发送通知：状态
- **签名**：`publishRunStatus(target: { runId: string; sessionKey: string; report?: Report }, phase: RunPhase, stopReason?: LoopStopReason): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:771
- **引用次数**：3

#### `fillLoopOutput`

- **类型**：逻辑控制
- **说明**：处理 fill / loop / 输出
- **签名**：`fillLoopOutput(output: ExecAgentLoopOutput, ctx: LoopRunContext): void`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:779
- **引用次数**：2

#### `settleLoop`

- **类型**：数据处理
- **说明**：更新：loop
- **签名**：`settleLoop(ctx: LoopRunContext): Promise<void>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:789
- **引用次数**：2

### AgentLoopService

#### `abortLoopTurn`

- **类型**：数据处理
- **说明**：删除/清理：loop / turn
- **签名**：`abortLoopTurn(input: AbortLoopTurnInput, output: AbortLoopTurnOutput, _context: LoopContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:827
- **引用次数**：4

#### `configLoop`

- **类型**：逻辑控制
- **说明**：处理 配置 / loop（返回成功与否）
- **签名**：`configLoop(input: ConfigLoopInput, _output: ConfigLoopOutput, _context: LoopContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/Loop/application/AgentLoopService.ts:839
- **引用次数**：4

