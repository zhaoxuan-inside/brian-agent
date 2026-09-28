# Base / SkillProvider

- 层：**Base**　模块：**SkillProvider**
- 方法数：**41**（逻辑控制 17 · 数据处理 17 · 通用算法 7）

## 文件 `brian-backend/Base/SkillProvider/access/SkillAccess.ts`

### SkillAccess

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排，接入层转发至 Service）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/SkillProvider/access/SkillAccess.ts:48
- **引用次数**：272

#### `addSkill`

- **类型**：逻辑控制
- **说明**：写入/新增：技能（返回成功与否，接入层转发至 Service）
- **签名**：`addSkill(input: AddSkillInput, output: AddSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/access/SkillAccess.ts:53
- **引用次数**：51

#### `seedSystemSkills`

- **类型**：逻辑控制
- **说明**：处理 seed / system / skills（返回成功与否，接入层转发至 Service）
- **签名**：`seedSystemSkills(input: SeedSystemSkillsInput, output: SeedSystemSkillsOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/access/SkillAccess.ts:59
- **引用次数**：4

#### `soSkillById`

- **类型**：逻辑控制
- **说明**：查询：技能 / 标识（返回成功与否，接入层转发至 Service）
- **签名**：`soSkillById(input: GetSkillInput, output: GetSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/access/SkillAccess.ts:65
- **引用次数**：42

#### `updateSkill`

- **类型**：逻辑控制
- **说明**：更新：技能（返回成功与否，接入层转发至 Service）
- **签名**：`updateSkill(input: UpdateSkillInput, output: UpdateSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/access/SkillAccess.ts:71
- **引用次数**：27

#### `delSkill`

- **类型**：逻辑控制
- **说明**：删除/清理：技能（返回成功与否，接入层转发至 Service）
- **签名**：`delSkill(input: DelSkillInput, output: DelSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/access/SkillAccess.ts:77
- **引用次数**：22

#### `soSkill`

- **类型**：逻辑控制
- **说明**：查询：技能（返回成功与否，接入层转发至 Service）
- **签名**：`soSkill(input: SoSkillInput, output: SoSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/access/SkillAccess.ts:83
- **引用次数**：39

#### `execSkill`

- **类型**：逻辑控制
- **说明**：处理执行：技能（返回成功与否，接入层转发至 Service）
- **签名**：`execSkill(input: ExecSkillInput, output: ExecSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/access/SkillAccess.ts:89
- **引用次数**：69

#### `enableSkill`

- **类型**：逻辑控制
- **说明**：界面控制：技能（返回成功与否，接入层转发至 Service）
- **签名**：`enableSkill(input: EnableSkillInput, output: EnableSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/access/SkillAccess.ts:95
- **引用次数**：24

## 文件 `brian-backend/Base/SkillProvider/application/SkillService.ts`

### SkillService

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据（异步编排）
- **签名**：`initialize(): Promise<void>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:35
- **引用次数**：272

### SkillService（私有）

#### `ensureEnabled`

- **类型**：逻辑控制
- **说明**：确保就绪：enabled
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:39
- **引用次数**：118

#### `toInt`

- **类型**：逻辑控制
- **说明**：格式化/序列化：int
- **签名**：`toInt(value: boolean): number`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:45
- **引用次数**：3

#### `toBoolean`

- **类型**：通用算法
- **说明**：格式化/序列化：boolean（纯计算，无外部 IO）
- **签名**：`toBoolean(value: unknown): boolean`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:49
- **引用次数**：5

#### `parseFileEntries`

- **类型**：数据处理
- **说明**：解析：文件 / entries（反序列化）
- **签名**：`parseFileEntries(value: unknown): FileEntry[] \| undefined`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:56
- **引用次数**：4

#### `serializeFileEntries`

- **类型**：数据处理
- **说明**：格式化/序列化：文件 / entries（序列化输出）
- **签名**：`serializeFileEntries(arr: FileEntry[] \| undefined): string \| undefined`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:69
- **引用次数**：7

#### `toSkillRecord`

- **类型**：数据处理
- **说明**：格式化/序列化：技能 / record
- **签名**：`toSkillRecord(row: Record<string, unknown>): SkillRecord`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:74
- **引用次数**：4

### SkillService

#### `addSkill`

- **类型**：数据处理
- **说明**：写入/新增：技能（操作关系数据库）
- **签名**：`addSkill(input: AddSkillInput, output: AddSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:90
- **引用次数**：51

#### `seedSystemSkills`

- **类型**：数据处理
- **说明**：处理 seed / system / skills（操作关系数据库）
- **签名**：`seedSystemSkills(input: SeedSystemSkillsInput, output: SeedSystemSkillsOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:125
- **引用次数**：4

#### `soSkillById`

- **类型**：数据处理
- **说明**：查询：技能 / 标识（操作关系数据库）
- **签名**：`soSkillById(input: GetSkillInput, output: GetSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:173
- **引用次数**：42

### SkillService（私有）

#### `assertNotSystemOwned`

- **类型**：数据处理
- **说明**：处理 assert / system / owned（操作关系数据库）
- **签名**：`assertNotSystemOwned(ids: string[]): Promise<void>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:187
- **引用次数**：4

### SkillService

#### `updateSkill`

- **类型**：数据处理
- **说明**：更新：技能（操作关系数据库）
- **签名**：`updateSkill(input: UpdateSkillInput, output: UpdateSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:200
- **引用次数**：27

#### `delSkill`

- **类型**：数据处理
- **说明**：删除/清理：技能（操作关系数据库）
- **签名**：`delSkill(input: DelSkillInput, output: DelSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:231
- **引用次数**：22

#### `soSkill`

- **类型**：数据处理
- **说明**：查询：技能（操作关系数据库）
- **签名**：`soSkill(input: SoSkillInput, output: SoSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:266
- **引用次数**：39

### SkillService（私有）

#### `scriptType`

- **类型**：逻辑控制
- **说明**：处理 script / type
- **签名**：`scriptType(name: string): 'js' \| 'py' \| 'sh' \| 'unknown'`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:292
- **引用次数**：2

#### `executeScripts`

- **类型**：逻辑控制
- **说明**：处理执行：scripts（遍历调度，异步编排）
- **签名**：`executeScripts(scripts: FileEntry[], params: Record<string, unknown>): Promise<unknown>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:299
- **引用次数**：2

### SkillService

#### `execSkill`

- **类型**：数据处理
- **说明**：处理执行：技能（操作关系数据库）
- **签名**：`execSkill(input: ExecSkillInput, output: ExecSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:322
- **引用次数**：69

### SkillService（私有）

#### `upsertSkillUsage`

- **类型**：数据处理
- **说明**：处理 upsert / 技能 / 用量（操作关系数据库）
- **签名**：`upsertSkillUsage(skillId: string): Promise<void>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:349
- **引用次数**：2

### SkillService

#### `enableSkill`

- **类型**：逻辑控制
- **说明**：界面控制：技能（返回成功与否，异步编排）
- **签名**：`enableSkill(input: EnableSkillInput, _output: EnableSkillOutput, _context: SkillContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/SkillProvider/application/SkillService.ts:381
- **引用次数**：24

## 文件 `brian-backend/Base/SkillProvider/infrastructure/sandbox/IsolatedVMSandbox.ts`

### IsolatedVMSandbox

#### `execute`

- **类型**：数据处理
- **说明**：处理执行相关数据
- **签名**：`execute(code: string, params: Record<string, unknown>, timeoutMs: number): Promise<SandboxResult>`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/IsolatedVMSandbox.ts:22
- **引用次数**：60

#### `dispose`

- **类型**：逻辑控制
- **说明**：结束释放相关数据
- **签名**：`dispose(): void`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/IsolatedVMSandbox.ts:47
- **引用次数**：3

## 文件 `brian-backend/Base/SkillProvider/infrastructure/sandbox/LocalSandbox.ts`

### LocalSandbox

#### `execute`

- **类型**：数据处理
- **说明**：处理执行相关数据
- **签名**：`execute(code: string, type: 'py' \| 'sh', params: Record<string, unknown>): LocalSandboxResult`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/LocalSandbox.ts:23
- **引用次数**：60

## 文件 `brian-backend/Base/SkillProvider/infrastructure/sandbox/SandboxRuntime.ts`

### 模块级函数

#### `pythonCandidates`

- **类型**：通用算法
- **说明**：处理 python / candidates（纯计算，无外部 IO）
- **签名**：`pythonCandidates(platform: string, env: NodeJS.ProcessEnv): InterpreterCandidate[]`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/SandboxRuntime.ts:25
- **引用次数**：7

#### `bashCandidates`

- **类型**：通用算法
- **说明**：处理 bash / candidates（纯计算，无外部 IO）
- **签名**：`bashCandidates(platform: string, env: NodeJS.ProcessEnv): InterpreterCandidate[]`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/SandboxRuntime.ts:36
- **引用次数**：5

#### `isWslBashShim`

- **类型**：通用算法
- **说明**：判断校验：wsl / bash / shim（纯计算，无外部 IO）
- **签名**：`isWslBashShim(absolutePath: string): boolean`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/SandboxRuntime.ts:55
- **引用次数**：6

#### `joinAppDataGitBash`

- **类型**：通用算法
- **说明**：转换归并：app / git / bash（纯计算，无外部 IO）
- **签名**：`joinAppDataGitBash(env: NodeJS.ProcessEnv): string`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/SandboxRuntime.ts:60
- **引用次数**：2

#### `quoteIfNeeded`

- **类型**：通用算法
- **说明**：处理 quote / needed（纯计算，无外部 IO）
- **签名**：`quoteIfNeeded(cmd: string): string`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/SandboxRuntime.ts:65
- **引用次数**：4

#### `resolveSandboxRuntime`

- **类型**：逻辑控制
- **说明**：获取：沙箱 / runtime
- **签名**：`resolveSandboxRuntime(platform: string, env: NodeJS.ProcessEnv): SandboxRuntime`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/SandboxRuntime.ts:69
- **引用次数**：11

#### `validateCandidate`

- **类型**：数据处理
- **说明**：判断校验：candidate
- **签名**：`validateCandidate(candidate: InterpreterCandidate, kind: 'Python 3' \| 'Bash', platform: string): { prefix: string; version: string } \| null`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/SandboxRuntime.ts:80
- **引用次数**：2

#### `locateOnPath`

- **类型**：数据处理
- **说明**：处理 locate / 路径
- **签名**：`locateOnPath(name: string, platform: string): string`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/SandboxRuntime.ts:103
- **引用次数**：2

#### `resolveInterpreter`

- **类型**：通用算法
- **说明**：获取：interpreter（纯计算，无外部 IO）
- **签名**：`resolveInterpreter(candidates: InterpreterCandidate[], kind: 'Python 3' \| 'Bash', platform: string): { prefix: string; version: string }`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/sandbox/SandboxRuntime.ts:114
- **引用次数**：3

## 文件 `brian-backend/Base/SkillProvider/infrastructure/SkillSchemaInitializer.ts`

### SkillSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/SkillProvider/infrastructure/SkillSchemaInitializer.ts:12
- **引用次数**：99

