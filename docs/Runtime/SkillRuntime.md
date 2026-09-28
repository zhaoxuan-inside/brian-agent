# Runtime / SkillRuntime

- 层：**Runtime**　模块：**SkillRuntime**
- 方法数：**68**（逻辑控制 37 · 数据处理 14 · 通用算法 17）

## 文件 `brian-backend/Runtime/SkillRuntime/access/SkillRuntimeAccess.ts`

### SkillRuntimeAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Runtime/SkillRuntime/access/SkillRuntimeAccess.ts:31
- **引用次数**：272

#### `registerSkill`

- **类型**：逻辑控制
- **说明**：写入/新增：技能（返回成功与否，接入层转发至 Service）
- **签名**：`registerSkill(input: RegisterSkillInput, output: RegisterSkillOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/access/SkillRuntimeAccess.ts:36
- **引用次数**：9

#### `registerBuiltinSkills`

- **类型**：逻辑控制
- **说明**：写入/新增：builtin / skills（返回成功与否，接入层转发至 Service）
- **签名**：`registerBuiltinSkills(input: RegisterBuiltinSkillsInput, output: RegisterBuiltinSkillsOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/access/SkillRuntimeAccess.ts:42
- **引用次数**：12

#### `execSkill`

- **类型**：逻辑控制
- **说明**：处理执行：技能（返回成功与否，接入层转发至 Service）
- **签名**：`execSkill(input: ExecSkillInput, output: ExecSkillOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/access/SkillRuntimeAccess.ts:48
- **引用次数**：69

#### `soSkills`

- **类型**：逻辑控制
- **说明**：查询：skills（返回成功与否，接入层转发至 Service）
- **签名**：`soSkills(input: SoSkillsInput, output: SoSkillsOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/access/SkillRuntimeAccess.ts:54
- **引用次数**：9

#### `registerRunSkills`

- **类型**：逻辑控制
- **说明**：写入/新增：skills（返回成功与否，接入层转发至 Service）
- **签名**：`registerRunSkills(input: RegisterRunSkillsInput, output: RegisterSkillsOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/access/SkillRuntimeAccess.ts:60
- **引用次数**：11

#### `clearRunSkills`

- **类型**：逻辑控制
- **说明**：删除/清理：skills（返回成功与否，接入层转发至 Service）
- **签名**：`clearRunSkills(input: ClearRunSkillsInput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/access/SkillRuntimeAccess.ts:66
- **引用次数**：6

#### `configTool`

- **类型**：逻辑控制
- **说明**：处理 配置 / 工具（返回成功与否，接入层转发至 Service）
- **签名**：`configTool(input: ConfigToolInput, output: ConfigToolOutput, context: SkillRuntimeContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/access/SkillRuntimeAccess.ts:72
- **引用次数**：3

## 文件 `brian-backend/Runtime/SkillRuntime/application/askUserSkill.ts`

### 模块级函数

#### `askUserSkill`

- **类型**：逻辑控制
- **说明**：处理 ask / 用户 / 技能
- **签名**：`askUserSkill(deps: AskUserDeps): SkillDef<{ question: string; kind?: string }>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/askUserSkill.ts:10
- **引用次数**：13

#### `executeAskUser`

- **类型**：通用算法
- **说明**：处理执行：ask / 用户（纯计算，无外部 IO）
- **签名**：`executeAskUser(deps: AskUserDeps, args: { question: string; kind?: string }, ctx: SkillExecutionContext): Promise<{ status: SkillResultStatus; output: string }>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/askUserSkill.ts:32
- **引用次数**：2

## 文件 `brian-backend/Runtime/SkillRuntime/application/builtinSkills.ts`

### 模块级函数

#### `buildSystemSkillDefs`

- **类型**：通用算法
- **说明**：构建/初始化：system / 技能 / defs（纯计算，无外部 IO）
- **签名**：`buildSystemSkillDefs(deps: SkillRuntimeDeps): SkillDef<never>[]`
- **位置**：brian-backend/Runtime/SkillRuntime/application/builtinSkills.ts:58
- **引用次数**：3

## 文件 `brian-backend/Runtime/SkillRuntime/application/delegateSkill.ts`

### 模块级函数

#### `delegateSkill`

- **类型**：通用算法
- **说明**：删除/清理：技能（纯计算，无外部 IO）
- **签名**：`delegateSkill(deps: DelegateDeps): SkillDef<{ task_content: string; agent_ref?: string }>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/delegateSkill.ts:17
- **引用次数**：6

## 文件 `brian-backend/Runtime/SkillRuntime/application/execCommandSkill.ts`

### 模块级函数

#### `formatExecResult`

- **类型**：通用算法
- **说明**：格式化/序列化：result（纯计算，无外部 IO）
- **签名**：`formatExecResult(result: { stdout: string; stderr: string; code: number \| null; timedOut: boolean }): string`
- **位置**：brian-backend/Runtime/SkillRuntime/application/execCommandSkill.ts:10
- **引用次数**：2

#### `execCommandSkill`

- **类型**：数据处理
- **说明**：处理执行：command / 技能
- **签名**：`execCommandSkill(): SkillDef<{ command: string; timeout_s?: number }>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/execCommandSkill.ts:17
- **引用次数**：9

## 文件 `brian-backend/Runtime/SkillRuntime/application/mcpGate.ts`

### 模块级函数

#### `scopeDeniedHint`

- **类型**：通用算法
- **说明**：处理 scope / denied / hint（纯计算，无外部 IO）
- **签名**：`scopeDeniedHint(scope: ComponentScope \| undefined, kind: 'Skill' \| 'MCP'): string`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:41
- **引用次数**：3

#### `mcpExecTool`

- **类型**：通用算法
- **说明**：处理 MCP 通道 / 工具（纯计算，无外部 IO）
- **签名**：`mcpExecTool(deps: SkillRuntimeDeps): SkillDef<{ mcp_id: string; tool_name?: string; params?: Record<string, unknown> }>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:49
- **引用次数**：7

#### `browserSkill`

- **类型**：逻辑控制
- **说明**：处理 浏览器 / 技能
- **签名**：`browserSkill(deps: SkillRuntimeDeps): SkillDef<{ operation: string; url?: string; selector?: string; text?: string; pixels?: number; to_bottom?: boolean; expression?: string; wait_for_load?: boolean }>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:84
- **引用次数**：4

#### `execCdtOperation`

- **类型**：通用算法
- **说明**：处理执行：CDT / operation（纯计算，无外部 IO）
- **签名**：`execCdtOperation(cdt: CDTCoreAccess, args: { operation: string; url?: string; selector?: string; text?: string; pixels?: number; to_bottom?: boolean; expression?: string; wait_for_load?: boolean }, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:108
- **引用次数**：2

#### `cdtNavigate`

- **类型**：逻辑控制
- **说明**：处理 CDT / navigate（异步编排）
- **签名**：`cdtNavigate(cdt: CDTCoreAccess, args: { url?: string; wait_for_load?: boolean }, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:133
- **引用次数**：6

#### `cdtGetContent`

- **类型**：通用算法
- **说明**：处理 CDT / content（纯计算，无外部 IO）
- **签名**：`cdtGetContent(cdt: CDTCoreAccess, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:151
- **引用次数**：2

#### `cdtTypeText`

- **类型**：逻辑控制
- **说明**：处理 CDT / type / 文本（异步编排）
- **签名**：`cdtTypeText(cdt: CDTCoreAccess, args: { selector?: string; text?: string }, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:166
- **引用次数**：2

#### `cdtClick`

- **类型**：逻辑控制
- **说明**：处理 CDT / 点击（异步编排）
- **签名**：`cdtClick(cdt: CDTCoreAccess, args: { selector?: string }, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:184
- **引用次数**：2

#### `cdtScroll`

- **类型**：逻辑控制
- **说明**：处理 CDT / 滚动（异步编排）
- **签名**：`cdtScroll(cdt: CDTCoreAccess, args: { pixels?: number; to_bottom?: boolean }, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:202
- **引用次数**：2

#### `cdtEvaluate`

- **类型**：通用算法
- **说明**：处理 CDT / evaluate（纯计算，无外部 IO）
- **签名**：`cdtEvaluate(cdt: CDTCoreAccess, args: { expression?: string }, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:217
- **引用次数**：2

#### `extractCdpText`

- **类型**：数据处理
- **说明**：解析：cdp / 文本（序列化输出）
- **签名**：`extractCdpText(result: unknown): string`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:235
- **引用次数**：3

#### `stringifySkillOutput`

- **类型**：数据处理
- **说明**：格式化/序列化：技能 / 输出（序列化输出）
- **签名**：`stringifySkillOutput(result: unknown): string`
- **位置**：brian-backend/Runtime/SkillRuntime/application/mcpGate.ts:245
- **引用次数**：2

## 文件 `brian-backend/Runtime/SkillRuntime/application/skillDefs.ts`

### 模块级函数

#### `skillWireId`

- **类型**：逻辑控制
- **说明**：处理 技能 / wire / 标识
- **签名**：`skillWireId(skillId: string): string`
- **位置**：brian-backend/Runtime/SkillRuntime/application/skillDefs.ts:21
- **引用次数**：2

#### `mdHintOf`

- **类型**：通用算法
- **说明**：处理 md / hint（纯计算，无外部 IO）
- **签名**：`mdHintOf(md?: string): string`
- **位置**：brian-backend/Runtime/SkillRuntime/application/skillDefs.ts:25
- **引用次数**：2

#### `toBoundSkillDef`

- **类型**：数据处理
- **说明**：格式化/序列化：bound / 技能 / def（序列化输出）
- **签名**：`toBoundSkillDef(skillId: string, skill: SkillRecordLike, skillAccess: SkillAccessLike): AnySkillDef`
- **位置**：brian-backend/Runtime/SkillRuntime/application/skillDefs.ts:33
- **引用次数**：2

#### `buildBoundSkillDefs`

- **类型**：通用算法
- **说明**：构建/初始化：bound / 技能 / defs（纯计算，无外部 IO）
- **签名**：`buildBoundSkillDefs(skillIds: string[], skillAccess: SkillAccessLike): Promise<AnySkillDef[]>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/skillDefs.ts:61
- **引用次数**：3

## 文件 `brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts`

### SkillRuntimeService（私有）

#### `soRunDef`

- **类型**：数据处理
- **说明**：查询：def
- **签名**：`soRunDef(runId: string, toolId: string): AnySkillDef \| undefined`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:45
- **引用次数**：2

### SkillRuntimeService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:55
- **引用次数**：272

### SkillRuntimeService（私有）

#### `warmSpecCache`

- **类型**：数据处理
- **说明**：处理 warm / spec / 缓存
- **签名**：`warmSpecCache(): void`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:62
- **引用次数**：3

### SkillRuntimeService

#### `registerSkill`

- **类型**：数据处理
- **说明**：写入/新增：技能
- **签名**：`registerSkill(input: RegisterSkillInput, _output: RegisterSkillOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:76
- **引用次数**：9

#### `registerBuiltinSkills`

- **类型**：通用算法
- **说明**：写入/新增：builtin / skills（纯计算，无外部 IO）
- **签名**：`registerBuiltinSkills(input: RegisterBuiltinSkillsInput, output: RegisterBuiltinSkillsOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:97
- **引用次数**：12

### SkillRuntimeService（私有）

#### `prepareBuiltinCandidates`

- **类型**：逻辑控制
- **说明**：构建/初始化：builtin / candidates
- **签名**：`prepareBuiltinCandidates(): AnySkillDef[]`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:115
- **引用次数**：2

#### `prepareRegisterInput`

- **类型**：逻辑控制
- **说明**：构建/初始化：register / 输入
- **签名**：`prepareRegisterInput(def: AnySkillDef): RegisterSkillInput`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:120
- **引用次数**：2

### SkillRuntimeService

#### `execSkill`

- **类型**：数据处理
- **说明**：处理执行：技能
- **签名**：`execSkill(input: ExecSkillInput, output: ExecSkillOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:131
- **引用次数**：69

### SkillRuntimeService（私有）

#### `prepareSkillContext`

- **类型**：逻辑控制
- **说明**：构建/初始化：技能 / 上下文
- **签名**：`prepareSkillContext(input: ExecSkillInput, metrics?: Metrics, report?: Report): SkillExecutionContext`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:149
- **引用次数**：2

#### `prepareSkillArgs`

- **类型**：数据处理
- **说明**：构建/初始化：技能（反序列化）
- **签名**：`prepareSkillArgs(def: AnySkillDef, rawArgs: string): { ok: true; args: unknown } \| { ok: false; error: string }`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:162
- **引用次数**：2

#### `executeSkillSafely`

- **类型**：逻辑控制
- **说明**：处理执行：技能 / safely（含异常兜底，异步编排）
- **签名**：`executeSkillSafely(def: AnySkillDef, args: unknown, ctx: SkillExecutionContext): Promise<SkillResult>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:180
- **引用次数**：2

#### `truncateResult`

- **类型**：通用算法
- **说明**：处理 truncate / result（纯计算，无外部 IO）
- **签名**：`truncateResult(result: SkillResult, maxOutput: number): SkillResult`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:199
- **引用次数**：2

#### `toFeedbackError`

- **类型**：通用算法
- **说明**：格式化/序列化：反馈 / 错误（纯计算，无外部 IO）
- **签名**：`toFeedbackError(toolId: string, error: string): SkillResult`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:208
- **引用次数**：2

### SkillRuntimeService

#### `soSkills`

- **类型**：数据处理
- **说明**：查询：skills
- **签名**：`soSkills(input: SoSkillsInput, output: SoSkillsOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:221
- **引用次数**：9

#### `registerRunSkills`

- **类型**：数据处理
- **说明**：写入/新增：skills（文件系统）
- **签名**：`registerRunSkills(input: RegisterRunSkillsInput, output: RegisterSkillsOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:244
- **引用次数**：11

#### `clearRunSkills`

- **类型**：数据处理
- **说明**：删除/清理：skills
- **签名**：`clearRunSkills(input: { run_id: string }, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:270
- **引用次数**：6

### SkillRuntimeService（私有）

#### `soCachedSpec`

- **类型**：数据处理
- **说明**：查询：cached / spec
- **签名**：`soCachedSpec(id: string): SkillSpecJson \| undefined`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:277
- **引用次数**：2

#### `toSpecJson`

- **类型**：逻辑控制
- **说明**：格式化/序列化：spec / JSON
- **签名**：`toSpecJson(def: AnySkillDef): SkillSpecJson`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:292
- **引用次数**：4

### SkillRuntimeService

#### `configTool`

- **类型**：逻辑控制
- **说明**：处理 配置 / 工具（返回成功与否）
- **签名**：`configTool(input: ConfigToolInput, _output: ConfigToolOutput, _context: SkillRuntimeContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/SkillRuntimeService.ts:301
- **引用次数**：3

## 文件 `brian-backend/Runtime/SkillRuntime/application/updatePlanSkill.ts`

### 模块级函数

#### `preparePlanSteps`

- **类型**：通用算法
- **说明**：构建/初始化：规划 / steps（纯计算，无外部 IO）
- **签名**：`preparePlanSteps(steps: Array<{ step: string; status?: string }>): PlanStep[]`
- **位置**：brian-backend/Runtime/SkillRuntime/application/updatePlanSkill.ts:21
- **引用次数**：3

#### `renderPlanText`

- **类型**：通用算法
- **说明**：格式化/序列化：规划 / 文本（纯计算，无外部 IO）
- **签名**：`renderPlanText(steps: PlanStep[]): string`
- **位置**：brian-backend/Runtime/SkillRuntime/application/updatePlanSkill.ts:39
- **引用次数**：2

#### `updatePlanSkill`

- **类型**：数据处理
- **说明**：更新：规划 / 技能
- **签名**：`updatePlanSkill(): SkillDef<{ plan: Array<{ step: string; status?: string }> }>`
- **位置**：brian-backend/Runtime/SkillRuntime/application/updatePlanSkill.ts:45
- **引用次数**：9

## 文件 `brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts`

### 模块级函数

#### `zodDef`

- **类型**：逻辑控制
- **说明**：处理 zod / def
- **签名**：`zodDef(schema: z.ZodType<unknown>): { typeName?: string; checks?: Array<{ kind?: string; value?: unknown }>; value?: unknown; values?: unknown[]; type?: z.ZodType<unknown>; valueType?: z.ZodType<unknown>; innerType?: z.ZodType<unknown>; options?: z.ZodType<unknown>[] }`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:4
- **引用次数**：12

#### `zodShape`

- **类型**：逻辑控制
- **说明**：处理 zod / shape
- **签名**：`zodShape(schema: z.ZodType<unknown>): Record<string, z.ZodType<unknown>>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:8
- **引用次数**：2

#### `typeName`

- **类型**：逻辑控制
- **说明**：处理 type / name
- **签名**：`typeName(schema: z.ZodType<unknown>): string`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:12
- **引用次数**：5

#### `zodToJSONSchema`

- **类型**：逻辑控制
- **说明**：处理 zod / JSON / 表结构
- **签名**：`zodToJSONSchema(schema: z.ZodType<unknown>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:16
- **引用次数**：18

#### `stringSchema`

- **类型**：逻辑控制
- **说明**：处理 string / 表结构（遍历调度）
- **签名**：`stringSchema(schema: z.ZodType<unknown>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:43
- **引用次数**：2

#### `numberSchema`

- **类型**：逻辑控制
- **说明**：处理 数值 / 表结构（遍历调度）
- **签名**：`numberSchema(schema: z.ZodType<unknown>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:56
- **引用次数**：2

#### `enumSchema`

- **类型**：逻辑控制
- **说明**：处理 enum / 表结构
- **签名**：`enumSchema(schema: z.ZodType<unknown>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:69
- **引用次数**：2

#### `literalSchema`

- **类型**：逻辑控制
- **说明**：处理 literal / 表结构
- **签名**：`literalSchema(schema: z.ZodType<unknown>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:73
- **引用次数**：2

#### `arraySchema`

- **类型**：逻辑控制
- **说明**：处理 array / 表结构
- **签名**：`arraySchema(schema: z.ZodType<unknown>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:80
- **引用次数**：2

#### `objectSchema`

- **类型**：逻辑控制
- **说明**：处理 object / 表结构
- **签名**：`objectSchema(schema: z.ZodType<unknown>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:85
- **引用次数**：2

#### `recordSchema`

- **类型**：逻辑控制
- **说明**：写入/新增：表结构
- **签名**：`recordSchema(schema: z.ZodType<unknown>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:89
- **引用次数**：2

#### `optionalSchema`

- **类型**：逻辑控制
- **说明**：处理 optional / 表结构
- **签名**：`optionalSchema(schema: z.ZodType<unknown>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:94
- **引用次数**：2

#### `nullableSchema`

- **类型**：逻辑控制
- **说明**：处理 nullable / 表结构
- **签名**：`nullableSchema(schema: z.ZodType<unknown>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:99
- **引用次数**：2

#### `defaultSchema`

- **类型**：逻辑控制
- **说明**：处理 default / 表结构
- **签名**：`defaultSchema(schema: z.ZodType<unknown>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:106
- **引用次数**：2

#### `unionSchema`

- **类型**：通用算法
- **说明**：处理 union / 表结构（纯计算，无外部 IO）
- **签名**：`unionSchema(schema: z.ZodType<unknown>, keyword: 'anyOf' \| 'oneOf'): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:111
- **引用次数**：3

#### `objectFromShape`

- **类型**：逻辑控制
- **说明**：处理 object / shape（遍历调度）
- **签名**：`objectFromShape(shape: Record<string, z.ZodType<unknown>>): Record<string, unknown>`
- **位置**：brian-backend/Runtime/SkillRuntime/domain/zodToJsonSchema.ts:118
- **引用次数**：2

