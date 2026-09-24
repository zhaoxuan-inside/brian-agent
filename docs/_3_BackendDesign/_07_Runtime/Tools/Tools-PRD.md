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

## 8. CDP 命令超时（2026-09-09）

**变更原因**：事故（run `367d9572`，会话 `fb3efe8f`，interact `5f24881f`）——`cdt_browser navigate` 后 CDP 目标无响应，`CDTService.execCDP` 的命令应答 await 无超时，Promise 永不结算 → 工具 Part 恒 `running` → run 永不停 settle（25 分钟+ 仍 running）→ SSE `waitRun` 5 分钟超时向用户报"系统问答超时"，run 卡死占住 lane。

**修改的方法**：
  - `Base/CDTProvider/application/CDTService.execCDP` — 原代码：命令 Promise 仅依赖 message/error/close 事件，无超时（原结构已注释保留于方法内说明）；修改后：新增 `CDP_COMMAND_TIMEOUT_MS = 30_000` 常量，命令注册定时器，超时按失败结算（`output.error = 'CDP 命令超时（30000ms）：<method>'`）并关闭 WebSocket，run 可正常 settle，Agent 收到工具错误可自行换路重试（实测：模型答复"浏览器打开超时了，我换个方式再试一次"后再次发起导航）。
  - `Base/CDTProvider/application/CDTService.connectWebSocket` — 同步补 30s 连接超时（防浏览器进程半死时 WebSocket 停在 CONNECTING 永不结算）。

**影响的端点**：
  - 所有经 `cdt_browser` 的 run（`POST /api/chat/stream`）——单条 CDP 命令最长 30s，工具失败以 error 结果返回而非挂死。

**可能存在的问题**：
  - 30s 对极慢页面加载可能偏紧（`Page.navigate` 正常应答不受影响；`waitForLoad` 的拟人化等待在命令应答之后，不受该超时约束）；
  - 超时后该次 WebSocket 连接关闭（每命令一连，无复用损失）。


## 9. 权限确认卡独立组件 + 权限审计落库（2026-09-11）

**变更原因**：事故复盘（run `46a7be65`，会话 `58348296`，interact `2109c9a5`）——`cdt_browser navigate` 被拒，根因不是 CDP 调用失败，而是权限确认卡复用了需求理解确认卡（IntentConfirmCard），三按钮「取消 / 按原文执行 / 按理解执行」中**「按原文执行」（KEEP）也被映射为拒绝**（`answerPermission(approved = action === 'APPROVE')`），用户想授权反而触发 permission denied；且权限询问/应答无落库记录，事后不可追溯，历史对话区也看不到权限卡。

**修改的方法**：
  - `Base/shared/base/InfoEnums.ts` `InfoType` — 新增 `PERMISSION = 'PERMISSION'`（权限卡信息类型，落 info_raw；ChatMap 前端 `buildMessageGraph` 仅收 REQUEST/RESPONSE，天然排除权限卡）。
  - `Runtime/Loop/application/AgentLoopService.askPermission` — 原代码：仅 `permissionGate.wait` 挂起（已注释保留于方法上方）；修改后：挂起前回调 `permissionAudit.asked`（落 info_raw，info=JSON{permission_id, tool_id, input, status:'pending', asked_at}），应答后回调 `permissionAudit.answered`（status → 'allowed'/'denied'）。
  - `Runtime/Loop/application/AgentLoopService` 增 `PermissionAudit` 鸭子接口（ctor 可选参），`Runtime/Loop/access/LoopAccess` 构造器透传，`Runtime/index.ts` 导出类型。
  - `dev-server.ts` — 组合根实现 `permissionAuditBridge`（best-effort：asked 直插 info_raw；answered 按内存 permission_id→info_id 映射回写 info/updated；失败仅记日志不阻断 run）；`GET /api/chat/history` 过滤条件加入 PERMISSION，映射为带 `permission` 字段的对话区消息并入历史返回。

**影响的端点**：
  - `POST /api/chat/permission/answer` — 应答后权限记录状态收敛（allowed/denied），同会话历史/回放可见决策。
  - `GET /api/chat/history/{sessionId}` — 新增返回 `permission` 类型消息（对话区渲染权限卡；ChatMap 不展示）。
  - 所有经权限门的 run（`POST /api/chat/stream`）— asked/answered best-effort 落库，不改变挂起/应答时序。

**可能存在的问题**：
  - 运行中权限卡状态由前端本地翻转（SSE 无 permission.answered 事件），多端同会话场景另一端状态不同步；
  - 服务重启期间 pending 权限的内存映射丢失，answered 无法回写（记录停留 pending，历史卡只读展示）；
  - permission 记录不走 saveInfo 全链路（无向量/关键词派生与 GraphDB 节点），仅 info_raw 存档，检索不可见（预期：权限卡非知识信息）。

### [2026-09-11] 启动期预热工具规格缓存

**变更原因**：会话每轮 LLM 调用前都经 `soLoopToolSpecs → soTools` 取工具规格，原实现每次重新做 zod→JSON Schema 转换（纯 CPU 重复）；复盘 interact 65f80eb3 归因延迟后随单清清理。

**修改的方法**：
  - `ToolService` 新增 `specCache`（Map<tool_id, ToolSpecJson>）；`initialize()` 与 `registerBuiltinTools()` 启动期 `warmSpecCache()` 预热；`soTools` 改走 `soCachedSpec`（miss 重建回填，原实现已注释保留）；`registerTool` 覆盖注册时使旧缓存失效，下次查询按新 def 自动重建。

**可能存在的问题**：
  - 缓存基于"注册后 def 不变"假设：init 期以外热注册新工具首次查询有一次一次性构建成本（已保证返回正确值）。

## 10. ask_user 编排原语落地（2026-09-22 · 阶段3 三件套收尾）

**变更原因**：Runtime-PRD §9 阶段3 收尾项——编排三件套中 update_plan/delegate 已落地，ask_user（澄清/确认 Deferred 挂起原语）缺失。

**修改的方法**：
  - 新增 `Runtime/Tools/application/askUserTool.ts` — `askUserTool(deps)`：参数 zod `{question, kind?: 'clarify'|'confirm'}`；execute 生成 ask_id → `permission.asked`（复用权限卡事件通道，payload 含 question/kind）→ `deps.waitAnswer` Deferred 挂起 → 应答后 `permission.answered` → ok 结果「用户已在对话框答复，见下一条用户消息」；超时/空答复 → error 结果回流（模型自行收尾）；`askUserTool` 未接线/缺 run 上下文 fail-loud。
  - `ToolService` — `BUILTIN_TOOL_IDS` 与 `prepareBuiltinCandidates` 加入 ask_user（`BuiltinToolDeps.askUserGate` 注入，缺省 fail-loud）；`registerBuiltinTools` 缺省 enabled 清单同步。
  - `Runtime/Runs` — `waitUserAnswer`/`answerUserAsk` 挂起-应答原语（详见 Runs-PRD 同日条目：答复=下一条 user 消息）。
  - 测试 `Runtime/test/AskUser.test.ts` — 挂起-恢复事件配对、超时 error 回流、fail-loud、答复落库 user 消息、重复应答幂等、LaneSemaphore 并发上限（6 用例）。

**影响的端点**：
  - 所有 v2 run（`POST /api/chat/stream`）— ask_user 进入默认工具集，Agent 可发起澄清/确认挂起。

**可能存在的问题**：
  - 前端暂以权限卡通道呈现 ask_user（确认/拒绝按钮），文本答复入口属阶段4 前端 v2 协议改造（`POST /api/chat/ask/answer` 后端已就绪）。

## 11. CDT 状态误报修复：Chrome 启动器 re-exec（2026-09-22）

**变更原因**：日常体检发现——`/api/cdt/start` 成功后（Chrome 152 启动器 spawn 后 re-exec，原进程立即退出），`process.on('exit')` 触发 `handleUnexpectedExit` 无条件清零 pid/endpoint 并停掉 keep-alive；实际 CDP 端点存活（navigate/evaluate 均正常），但 `/api/cdt/status` 恒报 `running:false`，headless 模式下浏览器可能因失去心跳而自动退出。

**修改的方法**：
  - `Base/CDTProvider/application/CDTService.handleUnexpectedExit` — 原实现无条件清理状态（原代码已注释保留于方法内）；修改后：先经新增 `isCDPEndpointAlive()`（`/json/version` 1.5s 短超时探活）探测，端点仍存活视为 re-exec 保留会话状态，真死才清理。
  - `Base/CDTProvider/application/CDTService.isCDTRunning` — 进程句柄丢失时回退 CDP 端点探活，status 如实反映（存活时 running=true、port 可见、pid=0）。

**影响的端点**：
  - `GET /api/cdt/status` — 修复误报（实测：start 后 status running=true, port=9222）。
  - 所有经 `cdt_browser` 的 run —— re-exec 场景下 keep-alive 不再被误停，headless 沙箱生命周期稳定。

**可能存在的问题**：
  - re-exec 后 pid 归零（真实子进程 pid 无法从端口反查），需强杀时只能经 `stopCDT`（killProcess 对 pid=0 no-op）→ 依赖端点探活兜底，若浏览器真死则走正常清理路径。

## 12. delegate 委派收口：回执带 run_id + parent_run_id/agent_ref 透传（2026-09-23）

**变更原因**：事故 trace 22f3ce79 复盘（详见 Runs-PRD §[2026-09-23]）。原 delegate 为 fire-and-forget：受理回执无 run_id、不透传 parent_run_id / agent_ref（桥接层丢弃），子任务结果不回传父 run —— 模型因收不到结果语义被迫重复委派，子代理再向下递归委派（四级委派链），且 Tools-PRD §56 设计的 push 式回传从未实现。收口语义重新设计：**子任务结果不在循环内逐条回传，而是父 run 收敛后 join 全部子 run、由写作 Agent 统一汇总为唯一最终回复**（链长一级封顶，子代理无 delegate 工具）。

**修改的方法**：
  - `Tools/application/delegateTool.ts` — 重写（原版见 git 历史）：`DelegateDeps.submitRun` 返回 `{run_id}` 并透传 `agent_ref / parent_run_id`；受理回执携带 `run_id=<id>` 并注明"结果必将统一汇总、请勿重复委派同任务"；工具描述更新委派纪律。
  - `Tools/application/builtinTools.ts` — `BuiltinToolDeps.runGateway` 签名同步（返回 `{run_id}`、入参增 parent_run_id）。
  - `dev-server.ts` — delegate 桥接补全（原实现丢弃 agent_ref、返回 void）。

**影响的端点**：
  - `POST /api/chat/stream` — 委派问答：delegate 工具卡受理后，join 完成时工具结果由"已受理"回写为子任务实际结果摘要（run_id 配对）。

**可能存在的问题**：
  - 模型若仍循旧习惯在受理后追问结果，回执文本已明确告知等待统一汇总；幂等去重未做硬拦截（同任务重复 delegate 仍会受理新子 run，靠提示词纪律约束——若实测仍重复，另行加同内容在途去重）。

## 13. exec 宿主命令执行原语（2026-09-24 · OpenClaw 对齐补齐）

**变更原因**：事故 trace 95b8e237（"我现在还有多少可用的磁盘"）——Agent 唯一可得原语是 `cdt_browser`（浏览器沙箱 evaluate，无宿主权限）、Skill/MCP 通道产出技能后同样需要可运行脚本的宿主底座；OpenClaw 2.0 工具策略中 exec/process/read 为一等公民原语，本项目宿主执行长期缺位，导致"编排正确但工作不闭环"（Agent 只能给说明书）。

**修改的方法**：
  - `Runtime/Tools/application/execTool.ts`（新增）— `child_process.spawn`（shell 模式、stdin 关闭防交互挂死）、超时默认 60s 强杀、`ExecAgentLoopInput.signal` 贯通（abort 即 SIGKILL）、输出截断 8000 字（沿 CDT_CONTENT_MAX 惯例）、stderr 分段展示、exit_code 如实透出。
  - `Tools/application/ToolService.ts` — `BUILTIN_TOOL_IDS` 与 `registerBuiltinTools` 默认注册表加入 `exec`；`prepareBuiltinCandidates` 装配（无组件依赖）。
  - `RunGatewayService.prepareLoopInput` — session lane 与 subagent lane 工具清单均注入 `exec`。
  - 安全边界 — `exec` **不进信任表默认项**：首次执行必经 Loop 权限门（permission.asked 卡片），用户批准且"记住"后按既有 trust 机制自动放行。

**影响的端点**：
  - `POST /api/chat/stream` — Agent 对宿主类任务（磁盘/进程/网络）可直接取回真实数据；权限卡仅在首次出现。

**验证**：Tools.test.ts 新增 3 用例（echo/非零退出码/超时强杀）全过；Runtime 全量回归 15/15。

**可能存在的问题**：
  - shell 模式承载完整 shell 语法（管道/重定向），拦截维度依赖用户确权；后续如需白名单命令前缀另立任务；
  - 子进程 stdin 已关闭，交互式命令会在输出截断/超时后强杀（不会挂死 run）。

## 14. Tool ⊕ Skill 合并：Skill 一等工具（2026-09-24 用户裁决定版）

**裁决**：Tool 与 Skill 合并为同一工具体系；Skill 与 MCP 独立运行（MCP 通道 mcp_exec + component_scope.mcps 不动）。

**变更原因**：Tool/Skill 双体系的平行管线（匹配/绑定/注入/执行门/判据五条线各一套）造成同族缺陷反复——thought 判据漏内置原语（trace 008ca7ae）、能力档案漏内置面、dev-server 双注册事实源漂移（trace e77f0bb4）。收敛为单一工具体系后，"绑定即授权"成为唯一语义。

**修改的方法**：
  - `Tools/application/skillTool.ts`（新增）— `toSkillToolDef`/`buildSkillToolDefs`：绑定 Skill 直接构建为一等 ToolDef（id=`skill_<skill_id>`，description = 名称+简述+skill_md 首段适用性摘要，参数 `{params}`）；execute 复用 `SkillAccess.execSkill` 脚本沙箱（js/py/sh），返回 ToolResult 形状。
  - `ToolService` — 新增 run 作用域注册表 `runTools`（Map<run_id, Map<tool_id, def>>）与 `registerRunSkillTools`/`clearRunTools`；`soTools` 按 `SoToolsInput.run_id` 合并 run 级规格；`execTool` 解析 registry → runTools 兜底。全局 registry 不被会话性工具污染，Loop settle 清理。
  - `Loop/AgentLoopService` — `prepareLoopContext` 注册 run 级 Skill 工具（失败降级仅影响该 run 的 Skill 可见性）；`settleLoop` 清理（best-effort）；`soLoopToolSpecs` 携带 run_id。
  - `Runs/RunGatewayService.prepareLoopInput` — 绑定 Skill 以 `skill_<id>` 进入 wire 工具清单（不再注入 `skill_exec` 间接 gate；MCP 的 mcp_exec 保持）；`decideThoughtMode` 可观察原语判据同步（`skill_` 前缀计入）。
  - `skill_exec` 工具本体保留注册（既有调用方/测试兼容），仅从默认注入路径移除。

**影响的端点**：
  - `POST /api/chat/stream` — 绑定 Skill 的 Agent：模型直接看到 `skill_<id>` 工具（名称+适用性描述），调用即执行沙箱脚本，权限语义与内置原语一致（Loop 权限门统一询问，trust 机制可记住）；
  - `component_scope.skills` 字段保留（run 级注册数据源 + 能力档案/评估语义），`component_scope.mcps` 不变。

**验证**：Tools.test 20/20（run 级注册/直调执行/清理不污染 3 新用例）；RuntimeGateway 17/17（合并注入+端到端 skill 工具执行落库断言：tool Part completed + output 含沙箱结果）；全工作区 1700+ 用例全过；E2E 冒烟（真实 run）：thought_mode=ReAct、exec 权限链正常、run finished。

**可能存在的问题**：
  - `skill_<uuid>` 作为 wire function name 长度 42 字符（OpenAI 限制 64 内，安全）；如未来 skill id 形态变化需保前缀约定；
  - run 级注册表为内存态（服务重启即空，run 亦不在内存，语义自洽）；
  - `skill_exec` 仍可显式注册使用（兼容期），后续版本可在评估无调用方后移除。
