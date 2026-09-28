# Base / MCPProvider

- 层：**Base**　模块：**MCPProvider**
- 方法数：**70**（逻辑控制 28 · 数据处理 39 · 通用算法 3）

## 文件 `brian-backend/Base/MCPProvider/access/MCPAccess.ts`

### MCPAccess

#### `syncInstallStatus`

- **类型**：逻辑控制
- **说明**：处理 install / 状态（接入层转发至 Service）
- **签名**：`syncInstallStatus(): Promise<number>`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:59
- **引用次数**：9

#### `stopAllMcp`

- **类型**：逻辑控制
- **说明**：删除/清理：MCP 通道（接入层转发至 Service）
- **签名**：`stopAllMcp(): Promise<number>`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:64
- **引用次数**：5

#### `addMcpProvider`

- **类型**：逻辑控制
- **说明**：写入/新增：MCP 通道 / Provider（接入层转发至 Service）
- **签名**：`addMcpProvider(i: AddMcpProviderInput, o: AddMcpProviderOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:69
- **引用次数**：27

#### `delMcpProvider`

- **类型**：逻辑控制
- **说明**：删除/清理：MCP 通道 / Provider（接入层转发至 Service）
- **签名**：`delMcpProvider(i: DelMcpProviderInput, o: DelMcpProviderOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:72
- **引用次数**：15

#### `updateMcpProvider`

- **类型**：逻辑控制
- **说明**：更新：MCP 通道 / Provider（接入层转发至 Service）
- **签名**：`updateMcpProvider(i: UpdateMcpProviderInput, o: UpdateMcpProviderOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:75
- **引用次数**：14

#### `soMcpProvider`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道 / Provider（接入层转发至 Service）
- **签名**：`soMcpProvider(i: SoMcpProviderInput, o: SoMcpProviderOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:78
- **引用次数**：19

#### `testMcpProvider`

- **类型**：逻辑控制
- **说明**：判断校验：MCP 通道 / Provider（接入层转发至 Service）
- **签名**：`testMcpProvider(i: TestMcpProviderInput, o: TestMcpProviderOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:81
- **引用次数**：12

#### `listMcp`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道（接入层转发至 Service）
- **签名**：`listMcp(i: ListMcpInput, o: ListMcpOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:84
- **引用次数**：22

#### `installMcp`

- **类型**：逻辑控制
- **说明**：构建/初始化：MCP 通道（接入层转发至 Service）
- **签名**：`installMcp(i: InstallMcpInput, o: InstallMcpOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:89
- **引用次数**：22

#### `startMcp`

- **类型**：逻辑控制
- **说明**：启动：MCP 通道（接入层转发至 Service）
- **签名**：`startMcp(i: StartMcpInput, o: StartMcpOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:92
- **引用次数**：23

#### `stopMcp`

- **类型**：逻辑控制
- **说明**：删除/清理：MCP 通道（接入层转发至 Service）
- **签名**：`stopMcp(i: StopMcpInput, o: StopMcpOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:95
- **引用次数**：16

#### `startMcps`

- **类型**：逻辑控制
- **说明**：启动：mcps（接入层转发至 Service）
- **签名**：`startMcps(i: StartMcpsInput, o: StartMcpsOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:98
- **引用次数**：4

#### `refreshMcpStatus`

- **类型**：逻辑控制
- **说明**：处理 refresh / MCP 通道 / 状态（接入层转发至 Service）
- **签名**：`refreshMcpStatus(i: RefreshMcpStatusInput, o: RefreshMcpStatusOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:101
- **引用次数**：4

#### `uninstallMcp`

- **类型**：逻辑控制
- **说明**：处理 uninstall / MCP 通道（接入层转发至 Service）
- **签名**：`uninstallMcp(i: UninstallMcpInput, o: UninstallMcpOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:104
- **引用次数**：15

#### `updateMcp`

- **类型**：逻辑控制
- **说明**：更新：MCP 通道（接入层转发至 Service）
- **签名**：`updateMcp(i: UpdateMcpInput, o: UpdateMcpOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:107
- **引用次数**：15

#### `upgradeMcp`

- **类型**：逻辑控制
- **说明**：处理 upgrade / MCP 通道（接入层转发至 Service）
- **签名**：`upgradeMcp(i: UpgradeMcpInput, o: UpgradeMcpOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:110
- **引用次数**：5

#### `soMcpById`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道 / 标识（接入层转发至 Service）
- **签名**：`soMcpById(i: GetMcpInput, o: GetMcpOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:113
- **引用次数**：17

#### `soMcp`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道（接入层转发至 Service）
- **签名**：`soMcp(i: SoMcpInput, o: SoMcpOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:116
- **引用次数**：20

#### `execMcp`

- **类型**：逻辑控制
- **说明**：处理执行：MCP 通道（接入层转发至 Service）
- **签名**：`execMcp(i: ExecMcpInput, o: ExecMcpOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:121
- **引用次数**：17

#### `enableMCP`

- **类型**：逻辑控制
- **说明**：界面控制：MCP 通道（接入层转发至 Service）
- **签名**：`enableMCP(i: EnableMCPInput, o: EnableMCPOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:126
- **引用次数**：9

#### `soMcpUsage`

- **类型**：逻辑控制
- **说明**：查询：MCP 通道 / 用量（接入层转发至 Service）
- **签名**：`soMcpUsage(i: GetMcpUsageInput, o: GetMcpUsageOutput, c: McpContext, metrics?: Metrics, report?: Report)`
- **位置**：brian-backend/Base/MCPProvider/access/MCPAccess.ts:129
- **引用次数**：4

## 文件 `brian-backend/Base/MCPProvider/application/MCPService.ts`

### MCPService（私有）

#### `ensureEnabled`

- **类型**：逻辑控制
- **说明**：确保就绪：enabled
- **签名**：`ensureEnabled(): void`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:34
- **引用次数**：118

#### `extractPackageName`

- **类型**：通用算法
- **说明**：解析：package / name（纯计算，无外部 IO）
- **签名**：`extractPackageName(installCmd: string): string`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:40
- **引用次数**：3

#### `getTransportType`

- **类型**：逻辑控制
- **说明**：获取：transport / type
- **签名**：`getTransportType(mcp: Record<string, unknown>): string`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:46
- **引用次数**：3

#### `parseTransportConfig`

- **类型**：数据处理
- **说明**：解析：transport / 配置（反序列化）
- **签名**：`parseTransportConfig(mcp: Record<string, unknown>): McpTransportConfig`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:50
- **引用次数**：3

#### `resolveStdioCommand`

- **类型**：通用算法
- **说明**：获取：stdio / command（纯计算，无外部 IO）
- **签名**：`resolveStdioCommand(mcp: Record<string, unknown>): { command: string; args: string[] }`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:60
- **引用次数**：2

### MCPService

#### `syncInstallStatus`

- **类型**：数据处理
- **说明**：处理 install / 状态（操作关系数据库，反序列化）
- **签名**：`syncInstallStatus(): Promise<number>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:69
- **引用次数**：9

### MCPService（私有）

#### `generateCommands`

- **类型**：数据处理
- **说明**：构建/初始化：commands
- **签名**：`generateCommands(installCmd: string): { start: string; stop: string; uninstall: string; }`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:123
- **引用次数**：2

#### `upsertUsage`

- **类型**：数据处理
- **说明**：处理 upsert / 用量（操作关系数据库）
- **签名**：`upsertUsage(mcpInstallId: string): Promise<void>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:136
- **引用次数**：8

### MCPService

#### `addMcpProvider`

- **类型**：数据处理
- **说明**：写入/新增：MCP 通道 / Provider（操作关系数据库）
- **签名**：`addMcpProvider(input: AddMcpProviderInput, output: AddMcpProviderOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:166
- **引用次数**：27

#### `delMcpProvider`

- **类型**：数据处理
- **说明**：删除/清理：MCP 通道 / Provider（操作关系数据库）
- **签名**：`delMcpProvider(input: DelMcpProviderInput, output: DelMcpProviderOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:186
- **引用次数**：15

#### `updateMcpProvider`

- **类型**：数据处理
- **说明**：更新：MCP 通道 / Provider（操作关系数据库）
- **签名**：`updateMcpProvider(input: UpdateMcpProviderInput, _output: UpdateMcpProviderOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:217
- **引用次数**：14

#### `soMcpProvider`

- **类型**：数据处理
- **说明**：查询：MCP 通道 / Provider（操作关系数据库）
- **签名**：`soMcpProvider(input: SoMcpProviderInput, output: SoMcpProviderOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:242
- **引用次数**：19

#### `testMcpProvider`

- **类型**：数据处理
- **说明**：判断校验：MCP 通道 / Provider（操作关系数据库，网络请求）
- **签名**：`testMcpProvider(input: TestMcpProviderInput, output: TestMcpProviderOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:269
- **引用次数**：12

#### `listMcp`

- **类型**：数据处理
- **说明**：查询：MCP 通道（操作关系数据库，网络请求，反序列化）
- **签名**：`listMcp(input: ListMcpInput, output: ListMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:289
- **引用次数**：22

### MCPService（私有）

#### `fetchJson`

- **类型**：数据处理
- **说明**：获取：JSON（网络请求，反序列化）
- **签名**：`fetchJson(url: string): Promise<T \| null>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:376
- **引用次数**：3

#### `fetchNpmMarketList`

- **类型**：数据处理
- **说明**：获取：npm / market / 列表（网络请求）
- **签名**：`fetchNpmMarketList(): Promise<Array<{ title: string; brief: string; installCmd: string }>>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:392
- **引用次数**：2

### MCPService

#### `installMcp`

- **类型**：数据处理
- **说明**：构建/初始化：MCP 通道（操作关系数据库）
- **签名**：`installMcp(input: InstallMcpInput, output: InstallMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:414
- **引用次数**：22

### MCPService（私有）

#### `resolveTransport`

- **类型**：数据处理
- **说明**：获取：transport（网络请求，序列化输出）
- **签名**：`resolveTransport(providerCode: string, startCmd: string): { transportType: string; transportConfig: string }`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:479
- **引用次数**：2

### MCPService

#### `startMcp`

- **类型**：数据处理
- **说明**：启动：MCP 通道（操作关系数据库）
- **签名**：`startMcp(input: StartMcpInput, _output: StartMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:497
- **引用次数**：23

#### `stopMcp`

- **类型**：数据处理
- **说明**：删除/清理：MCP 通道（操作关系数据库）
- **签名**：`stopMcp(input: StopMcpInput, _output: StopMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:538
- **引用次数**：16

### MCPService（私有）

#### `killRunningMcp`

- **类型**：数据处理
- **说明**：处理 kill / running / MCP 通道
- **签名**：`killRunningMcp(id: string): void`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:571
- **引用次数**：5

#### `isMcpRunning`

- **类型**：数据处理
- **说明**：判断校验：MCP 通道 / running
- **签名**：`isMcpRunning(id: string, transportType?: string): boolean`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:579
- **引用次数**：4

### MCPService

#### `stopAllMcp`

- **类型**：数据处理
- **说明**：删除/清理：MCP 通道（操作关系数据库）
- **签名**：`stopAllMcp(): Promise<number>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:586
- **引用次数**：5

#### `startMcps`

- **类型**：逻辑控制
- **说明**：启动：mcps（返回成功与否，遍历调度，异步编排）
- **签名**：`startMcps(input: StartMcpsInput, output: StartMcpsOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:607
- **引用次数**：4

### MCPService（私有）

#### `refreshRunningStatus`

- **类型**：数据处理
- **说明**：处理 refresh / running / 状态（操作关系数据库）
- **签名**：`refreshRunningStatus(): Promise<void>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:618
- **引用次数**：2

### MCPService

#### `refreshMcpStatus`

- **类型**：数据处理
- **说明**：处理 refresh / MCP 通道 / 状态（操作关系数据库）
- **签名**：`refreshMcpStatus(_input: RefreshMcpStatusInput, output: RefreshMcpStatusOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:633
- **引用次数**：4

#### `uninstallMcp`

- **类型**：数据处理
- **说明**：处理 uninstall / MCP 通道（操作关系数据库）
- **签名**：`uninstallMcp(input: UninstallMcpInput, _output: UninstallMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:653
- **引用次数**：15

#### `updateMcp`

- **类型**：数据处理
- **说明**：更新：MCP 通道（操作关系数据库）
- **签名**：`updateMcp(input: UpdateMcpInput, _output: UpdateMcpOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:682
- **引用次数**：15

#### `upgradeMcp`

- **类型**：数据处理
- **说明**：处理 upgrade / MCP 通道（操作关系数据库）
- **签名**：`upgradeMcp(input: UpgradeMcpInput, output: UpgradeMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:725
- **引用次数**：5

#### `soMcpById`

- **类型**：数据处理
- **说明**：查询：MCP 通道 / 标识（操作关系数据库）
- **签名**：`soMcpById(input: GetMcpInput, output: GetMcpOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:755
- **引用次数**：17

#### `soMcp`

- **类型**：数据处理
- **说明**：查询：MCP 通道（操作关系数据库）
- **签名**：`soMcp(input: SoMcpInput, output: SoMcpOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:769
- **引用次数**：20

#### `execMcp`

- **类型**：数据处理
- **说明**：处理执行：MCP 通道（操作关系数据库，网络请求）
- **签名**：`execMcp(input: ExecMcpInput, output: ExecMcpOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:807
- **引用次数**：17

#### `enableMCP`

- **类型**：逻辑控制
- **说明**：界面控制：MCP 通道（返回成功与否，异步编排）
- **签名**：`enableMCP(input: EnableMCPInput, _output: EnableMCPOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:859
- **引用次数**：9

#### `soMcpUsage`

- **类型**：数据处理
- **说明**：查询：MCP 通道 / 用量（操作关系数据库）
- **签名**：`soMcpUsage(input: GetMcpUsageInput, output: GetMcpUsageOutput, _context: McpContext, _metrics?: Metrics, _report?: Report): Promise<boolean>`
- **位置**：brian-backend/Base/MCPProvider/application/MCPService.ts:871
- **引用次数**：4

## 文件 `brian-backend/Base/MCPProvider/application/McpTransport.ts`

### 模块级函数

#### `parseJsonObject`

- **类型**：数据处理
- **说明**：解析：JSON / object（反序列化）
- **签名**：`parseJsonObject(line: string): Record<string, unknown> \| null`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:30
- **引用次数**：41

#### `parseSseResponse`

- **类型**：数据处理
- **说明**：解析：sse / response（反序列化）
- **签名**：`parseSseResponse(text: string): unknown`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:40
- **引用次数**：2

#### `unwrapRpcResult`

- **类型**：数据处理
- **说明**：处理 unwrap / rpc / result（序列化输出）
- **签名**：`unwrapRpcResult(response: unknown): unknown`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:63
- **引用次数**：3

### StdioMcpClient

#### `spawn`

- **类型**：数据处理
- **说明**：处理 spawn
- **签名**：`spawn(command: string, args: string[]): void`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:87
- **引用次数**：8

### StdioMcpClient（私有）

#### `onData`

- **类型**：数据处理
- **说明**：处理执行相关数据（序列化输出）
- **签名**：`onData(text: string): void`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:94
- **引用次数**：4

#### `onExit`

- **类型**：通用算法
- **说明**：处理执行：exit（纯计算，无外部 IO）
- **签名**：`onExit(code: number \| null, signal: string \| null): void`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:118
- **引用次数**：2

### StdioMcpClient

#### `isAlive`

- **类型**：数据处理
- **说明**：判断校验：alive
- **签名**：`isAlive(): boolean`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:127
- **引用次数**：5

#### `request`

- **类型**：数据处理
- **说明**：处理 request（序列化输出）
- **签名**：`request(method: string, params: Record<string, unknown>, timeoutMs: unknown): Promise<unknown>`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:139
- **引用次数**：210

#### `initialize`

- **类型**：逻辑控制
- **说明**：构建/初始化相关数据
- **签名**：`initialize(): Promise<unknown>`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:156
- **引用次数**：272

#### `callTool`

- **类型**：逻辑控制
- **说明**：处理 call / 工具
- **签名**：`callTool(name: string, args: Record<string, unknown>, timeoutMs: unknown): Promise<unknown>`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:168
- **引用次数**：2

#### `kill`

- **类型**：数据处理
- **说明**：处理 kill
- **签名**：`kill(): void`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:172
- **引用次数**：10

### 模块级函数

#### `callToolOverHttp`

- **类型**：数据处理
- **说明**：处理 call / 工具 / over / http（网络请求，序列化输出，反序列化）
- **签名**：`callToolOverHttp(config: McpTransportConfig, toolName: string, args: Record<string, unknown>, timeoutMs: unknown): Promise<{ raw: string; result: unknown }>`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:190
- **引用次数**：3

#### `callToolOverRest`

- **类型**：数据处理
- **说明**：处理 call / 工具 / over / rest（网络请求，序列化输出，反序列化）
- **签名**：`callToolOverRest(config: McpTransportConfig, toolName: string, args: Record<string, unknown>, timeoutMs: unknown): Promise<{ raw: string; result: unknown }>`
- **位置**：brian-backend/Base/MCPProvider/application/McpTransport.ts:231
- **引用次数**：3

## 文件 `brian-backend/Base/MCPProvider/infrastructure/MCPSchemaInitializer.ts`

### MCPSchemaInitializer

#### `init`

- **类型**：数据处理
- **说明**：构建/初始化相关数据（操作关系数据库）
- **签名**：`init(): void`
- **位置**：brian-backend/Base/MCPProvider/infrastructure/MCPSchemaInitializer.ts:114
- **引用次数**：99

## 文件 `brian-backend/Base/MCPProvider/tests/MCPService.test.ts`

### 模块级函数

#### `ctx`

- **类型**：逻辑控制
- **说明**：执行 ctx 逻辑
- **签名**：`ctx()`
- **位置**：brian-backend/Base/MCPProvider/tests/MCPService.test.ts:82
- **引用次数**：1764

