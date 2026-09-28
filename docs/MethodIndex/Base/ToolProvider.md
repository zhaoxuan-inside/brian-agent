# Base / ToolProvider 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## HttpAccess

源码：`brian-backend/Base/ToolProvider/access/HttpAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `execRequest` | `input: ExecRequestInput, output: ExecRequestOutput, _context: HttpContext, _metrics?: M...` | `Promise<boolean>` | — |

## SystemMonitorAccess

源码：`brian-backend/Base/ToolProvider/access/SystemMonitorAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `soCpuUsage` | `_input: SoCpuUsageInput, output: SoCpuUsageOutput, _context: SystemMonitorContext, _met...` | `Promise<boolean>` | — |
| `soMemoryUsage` | `_input: SoMemoryUsageInput, output: SoMemoryUsageOutput, _context: SystemMonitorContext...` | `Promise<boolean>` | — |
| `soDiskUsage` | `input: SoDiskUsageInput, output: SoDiskUsageOutput, _context: SystemMonitorContext, _me...` | `Promise<boolean>` | — |
| `soResource` | `input: SoResourceInput, output: SoResourceOutput, _context: SystemMonitorContext, _metr...` | `Promise<boolean>` | — |

## ToolAccess

源码：`brian-backend/Base/ToolProvider/access/ToolAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `generateId` | `_input: GenerateIdInput, output: GenerateIdOutput, _context: ToolContext, _metrics?: Me...` | `Promise<boolean>` | — |
| `generateIds` | `input: GenerateIdsInput, output: GenerateIdsOutput, _context: ToolContext, _metrics?: M...` | `Promise<boolean>` | — |
| `now` | `_input: NowInput, output: NowOutput, _context: ToolContext, _metrics?: Metrics, _report...` | `Promise<boolean>` | — |
| `today` | `_input: TodayInput, output: TodayOutput, _context: ToolContext, _metrics?: Metrics, _re...` | `Promise<boolean>` | — |
| `jsonCheck` | `input: JsonCheckInput, output: JsonCheckOutput, _context: ToolContext, _metrics?: Metri...` | `Promise<boolean>` | — |
| `jsonFormat` | `input: JsonFormatInput, output: JsonFormatOutput, _context: ToolContext, _metrics?: Met...` | `Promise<boolean>` | — |
| `jsonMinify` | `input: JsonMinifyInput, output: JsonMinifyOutput, _context: ToolContext, _metrics?: Met...` | `Promise<boolean>` | — |
| `xmlCheck` | `input: XmlCheckInput, output: XmlCheckOutput, _context: ToolContext, _metrics?: Metrics...` | `Promise<boolean>` | — |
| `xmlFormat` | `input: XmlFormatInput, output: XmlFormatOutput, _context: ToolContext, _metrics?: Metri...` | `Promise<boolean>` | — |
| `xmlMinify` | `input: XmlMinifyInput, output: XmlMinifyOutput, _context: ToolContext, _metrics?: Metri...` | `Promise<boolean>` | — |
| `regexMatch` | `input: RegexMatchInput, output: RegexMatchOutput, _context: ToolContext, _metrics?: Met...` | `Promise<boolean>` | — |
| `cronCheck` | `input: CronCheckInput, output: CronCheckOutput, _context: ToolContext, _metrics?: Metri...` | `Promise<boolean>` | — |
| `cronGenerate` | `input: CronGenerateInput, output: CronGenerateOutput, _context: ToolContext, _metrics?:...` | `Promise<boolean>` | — |
| `cronParse` | `input: CronParseInput, output: CronParseOutput, _context: ToolContext, _metrics?: Metri...` | `Promise<boolean>` | — |
| `cronNext` | `input: CronNextInput, output: CronNextOutput, _context: ToolContext, _metrics?: Metrics...` | `Promise<boolean>` | — |
