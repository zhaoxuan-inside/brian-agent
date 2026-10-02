# Base / MCPProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## MCPAccess

源码：`brian-backend/Base/MCPProvider/access/MCPAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `setEmbedFn` | `fn: (text: string, context?: any) => Promise<number[]>` | `void` | — |
| `setSemanticsFn` | `fn: SemanticsTaskFn` | `void` | — |
| `listMcpTools` | `input: ListMcpToolsInput, output: ListMcpToolsOutput, context: McpContext, metrics?: Me...` | `Promise<boolean>` | — |
| `syncInstallStatus` | `` | `Promise<number>` | — |
| `stopAllMcp` | `` | `Promise<number>` | — |
| `addMcpProvider` | `i: AddMcpProviderInput, o: AddMcpProviderOutput, c: McpContext, metrics?: Metrics, repo...` | `void` | — |
| `delMcpProvider` | `i: DelMcpProviderInput, o: DelMcpProviderOutput, c: McpContext, metrics?: Metrics, repo...` | `void` | — |
| `updateMcpProvider` | `i: UpdateMcpProviderInput, o: UpdateMcpProviderOutput, c: McpContext, metrics?: Metrics...` | `void` | — |
| `soMcpProvider` | `i: SoMcpProviderInput, o: SoMcpProviderOutput, c: McpContext, metrics?: Metrics, report...` | `void` | — |
| `testMcpProvider` | `i: TestMcpProviderInput, o: TestMcpProviderOutput, c: McpContext, metrics?: Metrics, re...` | `void` | — |
| `listMcp` | `i: ListMcpInput, o: ListMcpOutput, c: McpContext, metrics?: Metrics, report?: Report` | `void` | — |
| `installMcp` | `i: InstallMcpInput, o: InstallMcpOutput, c: McpContext, metrics?: Metrics, report?: Report` | `void` | — |
| `startMcp` | `i: StartMcpInput, o: StartMcpOutput, c: McpContext, metrics?: Metrics, report?: Report` | `void` | — |
| `stopMcp` | `i: StopMcpInput, o: StopMcpOutput, c: McpContext, metrics?: Metrics, report?: Report` | `void` | — |
| `startMcps` | `i: StartMcpsInput, o: StartMcpsOutput, c: McpContext, metrics?: Metrics, report?: Report` | `void` | — |
| `refreshMcpStatus` | `i: RefreshMcpStatusInput, o: RefreshMcpStatusOutput, c: McpContext, metrics?: Metrics, ...` | `void` | — |
| `uninstallMcp` | `i: UninstallMcpInput, o: UninstallMcpOutput, c: McpContext, metrics?: Metrics, report?:...` | `void` | — |
| `uninstallMcps` | `i: UninstallMcpsInput, o: UninstallMcpsOutput, c: McpContext, metrics?: Metrics, report...` | `void` | — |
| `updateMcp` | `i: UpdateMcpInput, o: UpdateMcpOutput, c: McpContext, metrics?: Metrics, report?: Report` | `void` | — |
| `upgradeMcp` | `i: UpgradeMcpInput, o: UpgradeMcpOutput, c: McpContext, metrics?: Metrics, report?: Report` | `void` | — |
| `soMcpById` | `i: GetMcpInput, o: GetMcpOutput, c: McpContext, metrics?: Metrics, report?: Report` | `void` | — |
| `soMcp` | `i: SoMcpInput, o: SoMcpOutput, c: McpContext, metrics?: Metrics, report?: Report` | `void` | — |
| `execMcp` | `i: ExecMcpInput, o: ExecMcpOutput, c: McpContext, metrics?: Metrics, report?: Report` | `void` | — |
| `enableMCP` | `i: EnableMCPInput, o: EnableMCPOutput, c: McpContext, metrics?: Metrics, report?: Report` | `void` | — |
| `soMcpUsage` | `i: GetMcpUsageInput, o: GetMcpUsageOutput, c: McpContext, metrics?: Metrics, report?: R...` | `void` | — |
