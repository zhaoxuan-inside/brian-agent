# Tools · 工具框架与内置工具

> 父文档：`docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md` §4/§6/§9。

## 1. 设计目标

1. **工具即代码 + schema**：弃用"prompt 里要求 LLM 输出 JSON next_action"的模拟工具调用；每个工具 = `id + description + zod schema + execute`，参数强类型校验（新增依赖 zod，用户决策 2026-09-04）。
2. **校验错误回流**：schema 校验失败、权限拒绝等错误以**配对工具结果**回流模型，模型可自纠（OpenCode invalid-args 模式）；禁止静默吞错（fail-loud）。
3. **编排原语工具化**：`update_plan` / `delegate` / `ask_user` 为循环内工具——计划、并行、人类介入不再是编排引擎语义，而是模型可调用的能力。
4. **接入点唯一性**：skill/mcp/cdt 执行经对应 Provider 链路（DevStandards §8）；**CDT 浏览器操作不再硬编码在执行器内**（旧 `buildBrowserToolDef/execCdtAction` 退役）。
5. **5 参签名 + ≤40 行**：`execTool` 5 参；`handleXxx` 逻辑与 `prepareXxx` 数据拆分。

## 2. 工具定义契约

```typescript
export interface ToolDef<P> {
  id: string;
  description: string;
  parameters: z.ZodType<P>;            // zod schema → JSON Schema 传入 LLM
  permission?: PermissionRule;         // 可选权限门（经 ask_user/审批挂起）
  max_output?: number;                 // 结果截断上限（默认 8000 字符）
  execute(args: P, ctx: ToolContext): Promise<ToolResult>;
}
export interface ToolContext { run_id: string; session_key: string; signal: AbortSignal; bus: EventBus; runs: RunGateway; budget?: IterationBudget; child?: Report; }
export interface ToolResult { status: 'ok' | 'error' | 'denied'; output: string; elapsed_ms?: number; usage?: TokenUsage; }
```

## 3. 领域类型（5 参基类）

```typescript
export class RegisterToolInput extends Input { def!: ToolDef<never>; }
export class ExecToolInput extends Input { run_id!: string; tool_id!: string; raw_args!: string; }
export class ExecToolOutput extends Output { result!: ToolResult; }
export class SoToolsInput extends Input { agent_def_id!: string; model_id?: string; }
export class SoToolsOutput extends Output { defs!: ToolSpecJson[]; }   // {id, description, parameters}
export class ConfigToolInput extends Input { default_max_output?: number; parallel_batches?: boolean; }
```

## 4. 公开方法（5 参签名）

| 方法 | 签名要点 | 拆分（≤40 行） |
|------|---------|---------------|
| `registerTool` | 注册工具（幂等；拒绝覆盖内置 id） | `handleRegisterTool` |
| `execTool` | 执行单工具调用 | `handleExecTool` + `prepareToolArgs` + `toPairedResult`（数据） |
| `soTools` | 按 AgentDef/模型解析本轮工具集（组装 per-turn toolset） | `handleSoTools` + `soBuiltinTools` + `soAgentTools` |
| `configTool` | 工具参数配置 | `handleConfigTool` |

## 5. 内置工具（6 个）

| 工具 | 职责 | 关键行为 | 取代 |
|------|------|---------|------|
| `skill_exec` | 执行 Skill | `params: {skill_id, params}` → `SkillAccess.execSkill`；结果截断回流 | 旧 Act 的 SKILL 分支 |
| `mcp_exec` | 执行 MCP | `params: {mcp_id, params}` → `MCPAccess.execMcp` | 旧 Act 的 MCP 分支 |
| `cdt_browser` | CDT 浏览器 | `params: {operation, url?, selector?, text?, script?}`（zod discriminated union）→ `CDTProvider` 六操作 | 旧硬编码 `execCdtAction` switch |
| `update_plan` | 过程性计划卡 | `params: {steps:[{id, description, status:'pending'|'in_progress'|'completed'}]}`；不变量：同时至多一个 `in_progress` → `plan.updated` 事件 | PlannerAgent TaskDAG 输出 |
| `delegate` | 并行子代理 | `params: {agent, task, fork?}` → spawn 子 run（subagent lane、独立预算）；返回 `{status:'accepted', run_id}`；**push 式回传**：子结果经 steering 队列注入父循环，父上下文只见摘要 | buildAgentDAG + DagScheduler |
| `ask_user` | 澄清/确认 | `params: {question, kind:'clarify'|'confirm'}` → `permission.asked` 事件 + Deferred 挂起；答复经 HTTP 恢复为**下一条 user 消息**（非状态机分支） | IntentAgent 暂停 + confirmIntent/submitClarification |

## 6. 内部流程要点（阶段2 已落地）

1. **`handleExecTool` 顺序**（逻辑控制，≤40 行）：
   `prepareToolArgs(raw_args, def)`（JSON.parse → zod `safeParse`）→ 失败 → `toFeedbackError`（**错误即结果**，`The ${id} tool was called with invalid arguments: …` 回流模型，不抛错）→ `def.execute(args, ctx)`（**execute 抛错同样归一为配对 error 结果**）→ `truncate(output, def.max_output ?? 8000)` → 配对结果。
2. **权限拒绝配对**：denied 返回 `pairedDenyResult(reason)`，保 append-only 配对不变量，不打断消息流（**阶段3 权限门接入**，ask_user 同构 Deferred 挂起）。
3. **delegate 子代理**：阶段3 落地（spawn 子 run → subagent lane → push 回传 steering 队列，不轮询）。
4. **update_plan 不变量**：阶段3 落地（至多一个 in_progress，由 `preparePlanSteps` 校验）。
5. **zodToJSONSchema（阶段2 决策）**：仅依赖 zod，不引入 zod-to-json-schema 派生依赖；内置紧凑转换器覆盖受限子集（object/string/number/boolean/enum/array/record/optional/nullable/default/union/discriminatedUnion/literal/unknown/any），未覆盖类型 fail-loud（`ProcessingError`）。
6. **cdt_browser（阶段2 落地）**：经 Core `CDTCoreAccess` 六操作；`get_content` = evaluate(`document.body.innerText`) 截断 8000 字符（与旧 `AgentExecution.execCdtAction` 语义一致）；zod enum + optional 字段表达操作分支（阶段2 用 enum+optional，非 discriminatedUnion —— 对 LLM 兼容性更稳）。
7. **内置注册**：`registerBuiltinTools`（幂等；enabled 缺省全部）；内置 id 不可被自定义工具覆盖（`VALIDATION_ERROR`）；Provider 未注入时 execute fail-loud（配对 error：`Skill Provider 未注入`）。

## 7. 与旧模型的关系

| 旧 | 新 |
|----|----|
| Think prompt 中 `tools_json` 文本注入 + `next_action` JSON 决策 | per-turn toolset（`soTools`）+ 原生 tool_calls |
| Act 代码分支 skill/mcp/cdt switch | 3 个独立工具 |
| CDT 6 操作硬编码在 AgentExecutionService | `cdt_browser` zod discriminated union |
| PlannerAgent.planHierarchical → TaskDAG | `update_plan` 过程性计划卡 |
| buildAgentDAG + DagScheduler（**退役，不保留**） | `delegate` + subagent lane |
| IntentAgent 暂停语义 | `ask_user` Deferred 挂起 |

## 8. 验收

- 单测：schema 错误回流文本；denied 配对；update_plan 不变量；delegate accepted 语义与子 run lane/预算；ask_user 挂起-恢复（答复=下条消息）。
- 集成：mock LLM 调 skill_exec → 结果回流 → stop；并行 tool_calls 配对完整；截断生效。

## 7. 落地差异（2026-09-05）

1. **ToolResultStatus 枚举**：`ok/error/denied` 以 Enum 注册（有限值域唯一注册点）。
2. **signal 贯穿边界（阶段4）**：`ToolExecutionContext.signal` 已随 execTool 入参传递，但 `ExecSkillInput/ExecMcpInput/CDTCore*Input` 暂无 signal 字段，内置工具执行中不支持中途取消（仅取消检查点在 LLM 流侧）；待 Base/Core Input 契约补 signal 后贯穿。
3. **max_output**：skill_exec/mcp_exec 不再显式设置（走 ToolService 默认 8000）；`CDT_CONTENT_MAX` 仅用于 CDT 内容截断。
4. **zod 内省收敛**：zod v3 `_def` 访问收敛至 `zodDef/zodShape` 辅助函数（单一逃逸口）。
