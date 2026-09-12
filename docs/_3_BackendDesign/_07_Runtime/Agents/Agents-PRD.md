# Agents · 声明式 Agent 定义与会话级快照

> 父文档：`docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md` §4/§10。

## 1. 设计目标

1. **Agent = 纯数据**：`{name, mode, prompt, model_id, tools, permissions, temperature, budget}`——行为差异（plan/build/curator）零代码（OpenCode 模式）。
2. **弃用角色拓扑**：不再存在 hardcoded `SYSTEM_AGENT_CONFIG`（PLANNER→Plan-and-Solve 等映射）与"系统 Agent 不经循环"的旁路——**所有代理（含主回复）走同一个 agentLoop**；差异仅在声明数据。
3. **会话级原子快照**：运行时按 `runtime_agent_def` 构建快照；快照内不做随机（弃用 `shouldReuseByRegenRate` 25% 随机重建）；"失败的陈旧快照永不与新一代并存"。
4. **组件匹配复用收敛**：旧 `AgentBuilder/AgentLibrary` 两层匹配（签名相似度 + LLM 打分）收敛为 `AgentDefService.matchAgentDef` 单一入口；`Agent/AgentStrategy` 的 `execution_rule` 匹配退役（循环不再可配置）。
5. **5 参签名 + ≤40 行**。

## 2. 声明字段

| 字段 | 说明 | 旧对应 |
|------|------|--------|
| `name` | 唯一引用名（`main` / `explore` / `curator` / 用户自定义） | `agent.agent_name` |
| `mode` | `primary`（会话主代理）\| `subagent`（仅 delegate 可见）\| `all` | `execution_type` |
| `prompt_text` | 系统提示（支持分层：stable→context→volatile，保 prompt 缓存） | `soul` + 策略提示 |
| `prompt_template_id` | DB 提示模板引用（空串=运行时解析默认，DevStandards §6.1） | `strategy.prompt_template_id` |
| `model_id` | 模型引用（空串=经 `LLMCore.matchLLM` 运行时匹配） | `agent.llm_id` |
| `tools_json` | 工具可见性规则（`{"*":"allow","delegate":"deny",...}`，Wildcard 末条匹配） | `agent_built` 绑定 |
| `permissions_json` | 权限规则集（allow/ask/deny；ask → ask_user 挂起） | 无（新增） |
| `temperature` / `budget_default` | 采样与默认预算 | `max_iterations` |

## 3. 内置声明（经接口写入 `runtime_agent_def`，幂等 upsert，遵循 DevStandards §9）

| name | mode | prompt 要点 | tools | budget |
|------|------|------------|-------|--------|
| `main.build` | primary | 任务执行主代理；最终回复即 assistant 流（块 chunker 输出） | 全部工具 | 60 |
| `main.plan` | primary | 同 build，仅提示与权限不同：计划导向，`cdt_browser/skill_exec/mcp_exec` 权限 `deny`，产出走 `update_plan` | 全部工具 | 60 |
| `explore` | subagent | delegate 的检索/探索子代理；只读工具 | deny `ask_user/cdt_browser` | 30 |
| `curator` | subagent | 会话后审查代理（background lane）：评估/优化 AgentDef 与 Soul | `skill_exec/mcp_exec` + AgentDef CRUD | 30 |

> 取代：`WriterAgent`（→ main.build 的 assistant 流）、`PlannerAgent`（→ main.plan 的 update_plan）、`IntentAgent`（→ ask_user）、`EvolutorAgent`（→ curator，评估 prompt 复用）、`SummaryAgent`（→ curator 或后置投影）。

## 4. 领域类型（5 参基类）

```typescript
export type AgentMode = 'primary' | 'subagent' | 'all';
export interface AgentDefSnapshot { name: string; mode: AgentMode; system: string; model: ResolvedModel; tools: ToolSpecJson[]; permissions: PermissionRule[]; temperature: number; budget: BudgetSpec; def_id: string; }

export class DeclareAgentInput extends Input { name!: string; mode!: AgentMode; prompt_text!: string; model_id?: string; tools_json?: string; permissions_json?: string; temperature?: number; budget_default?: number; }
export class DeclareAgentOutput extends Output { def_id!: string; }
export class MatchAgentDefInput extends Input { task_content!: string; agent_ref?: string; }
export class MatchAgentDefOutput extends Output { def_id!: string; matched_by!: 'exact' | 'signature' | 'llm' | 'new'; def!: AgentDefRecord; }
export class SoAgentSnapshotInput extends Input { def_id!: string; session_key!: string; }
export class SoAgentSnapshotOutput extends Output { snapshot!: AgentDefSnapshot; }
export class ConfigAgentDefInput extends Input { snapshot_ttl_ms?: number; match_similarity_threshold?: number; }
```

## 5. 公开方法（5 参签名）

| 方法 | 签名要点 | 拆分（≤40 行） |
|------|---------|---------------|
| `declareAgent` | 声明式定义 CRUD（幂等 upsert by name；内置名仅提示改模式不可删） | `handleDeclareAgent` + `prepareAgentDefRecord` |
| `matchAgentDef` | 组件匹配复用（三层：exact → 签名相似度 → LLM 打分 → new；**无随机重建**） | `handleMatchAgentDef` + `soSignatureCandidates` + `soLLMRankedCandidate` |
| `soAgentSnapshot` | 会话级快照（进程内 LRU 缓存 + TTL；组件解析：model/tools/permissions/soul 组装） | `handleSoAgentSnapshot` + `prepareSnapshotComponents` + `resolveDefaultModel` |
| `configAgentDef` | 配置 | `handleConfigAgentDef` |

## 6. 内部流程要点

1. **快照组装顺序**：`prepareSnapshotComponents`（数据，≤40 行）：解析 model（空串→`resolveDefaultModel` 经 `LLMCore.matchLLM`）→ 组装 tools（`soTools`，Wildcard 末条匹配）→ 组装 permissions → soul/system（`prompt_template_id` 空串→内置模板回退渲染）→ budget。任一组件解析失败 **fail-loud**。
2. **分层 system prompt**（prompt 缓存边界）：`stable`（persona/工作区说明）| `context`（会话上下文/工具清单）| `volatile`（时序上下文/本轮说明）——组装由 `prepareLayeredSystem` 完成，切界固定。
3. **匹配打分**：`soLLMRankedCandidate` 复用旧 `builtin.agent_match` 提示（PromptCatalog）；阈值 `match_similarity_threshold`（默认 0.7）。
4. **快照失效**：`declareAgent` 写入时失效对应 LRU 项；活跃 run 的快照经 TTL 惰性重建（陈旧快照不中断进行中 run）。

## 7. 与旧模型的关系

| 旧 | 新 |
|----|----|
| `AgentBuilder.buildAgent`（LLM 任务分析 + 25% 随机重建 + 逐个绑定写库） | `matchAgentDef`（确定性三层）+ `soAgentSnapshot`（快照组装） |
| `AgentLibrary.shouldReuseByRegenRate`（25% 随机丢弃） | 退役（无随机） |
| `SYSTEM_AGENT_CONFIG` 硬编码拓扑 | 内置声明数据（§3，经接口 upsert） |
| `AgentStrategy.execution_rule`（循环可配置 JSON） | 退役（循环固定，差异=声明数据） |
| 系统 Agent 旁路（Writer/Evolutor/Intent/Summary 不经循环） | 全部经 agentLoop（§3 取代表） |

## 8. 验收

- 单测：upsert 幂等；三层匹配各命中路径；快照组件 fail-loud；Wildcard 末条匹配；分层 prompt 切界稳定。
- 集成：main.plan 与 main.build 行为差异仅由声明数据决定（同一循环代码）；curator 后台优化 AgentDef 后活跃 run 不中断。

### [2026-09-11] 启动期资产缓存 + 慢匹配廉价化（复盘 interact 9b68defe）

**变更原因**：interact `9b68defe`（"今天天气怎么样？"）run 全程 65.0s，其中 LLM 回答仅 3.7s，其余 61.4s 在 match → soAgentSnapshot：Soul 排序 LLM 无界时间（9.3s）叠 Skill 排序 LLM 无 max_tokens（实测 52s、流式 2840 tokens）。Agent 复用本身正常（L1 exact 命中同一 def），浪费全部发生在组件匹配放噪声上：matchSkill 的 prompt 曾把每个 Skill 的**全量 skill_md 原文** JSON 进去。

**修改的方法**：
  - `Runtime/Agents/application/AgentDefService` —— 新增启动期资产缓存：
    - `initialize()` → `warmAssetCaches()`：预热 agent 绑定事实源（agent 表全量 → 内存）与 active def 全表；
    - `soActiveDefsCached()`：匹配每轮读内存，TTL 30s 过期重读；`insertDefFromAgent()` 写侧主动失效；
    - `soAgentAsset()` 未命中 AgentLibrary 命名/用途时回退绑定行（同名/用途仍然可得）。
  - `Core/SkillCoreProvider/application/SkillCoreService.matchSkill` —— 排序 prompt 只用 `name/skill_brief`（原代码携带全量 `skill_md`，已注释保留）；`callLLM` 增加 `max_tokens: 300`（原实现未设上限，模型可流式输出数千 token）。
  - 组件语义保持不变：Soul/Skill/MCP 仍**按任务内容动态重解析**（Layer 1 绑定水合语义不启用——PRD v2 以任务内容为准，runtime 测试锁死该语义）。

**影响的端点**：
  - `POST /api/chat/stream` —— run 启动期不再触发 skill_md 全量注入的排序；排序 LLM 有了 300 token 终止上限；匹配/快照消除每轮重复全表查询。同任务复现：65s → 16s（帽内 LLM 排序 2.9s + 6.9s + 回复 5.9s）。

**可能存在的问题**：
  - 排序 LLM 尾部延迟仍受模型本身速度影响（本次满分排序计算出 2.9s/6.9s，属正常变异）。
  - 资产缓存 TTL 30s：外部（配置中心）改写 agent 表后最长 30s 内旧值仍可能命中。

### [2026-09-11] 组件绑定收敛：命中即复用绑定，删除重复的"重新生成概率"（复盘 session 27890105）

**变更原因**：interact `27890105`（"今天适合穿什么衣服"）run 全程 26s，用户质疑两点：① `applyRegenDecision`（agent_library_config.regen_rate 概率推翻 L1/L2 复用）与 Agent 层 `AgentLibraryService.matchAgent` 的 regen_rate 失效判决是**同义概念重复实现**（且两处 `shouldReuseByRegenRate` 语义相反）；② def 已命中仍走 Core `matchSoul/matchSkill/matchMCP` 按任务动态重解析——「命中即绑定，无绑定就是没有」，没有概率推翻、也没有组件层动态匹配。

**修改的方法**：
  - `Runtime/Agents/application/AgentDefService`：
    - `applyRegenDecision` —— 注释弃用（原方法保留）；Runtime 不再承载"重新生成概率"，该概念唯一实现收敛于 Agent 层 `AgentLibraryService.matchAgent`（regen_rate 失效判决 → regenerate → AgentBuilder 重构）；
    - `matchAgentDef` —— 删除 `await this.applyRegenDecision(input)` 与 `input.regenerate` 三个判定分支（原方法已注释保留）；def 命中（exact/signature/llm）即复用，无随机推翻；
    - `soAgentSnapshot` —— 只读 def 显式绑定：soul 读 `def.soul_id`（无绑定即空）、tools 读 `def.tools_json`（无绑定即无工具）（原动态 matchSoul/matchSkill/matchMCP 版本已注释保留）；
    - `soSoulContent` / `soSnapshotTools` / `appendMcpEntries` —— 删除 Core 组件匹配调用与 `bypass_cache`/`task_content` 透传（原方法已注释保留）；`skill.selected`/`mcp.selected` 仅在 `tools_json` 显式绑定时上报（source='explicit'）。
  - `Runtime/Agents/domain/types.ts` —— `MatchAgentDefInput.regenerate` / `MatchAgentDefOutput.regenerate` / `SoAgentSnapshotInput.regenerate` 注释弃用（原字段已注释保留）。
  - `Runtime/Runs/application/RunGatewayService.soSnapshot` —— 删除 regenerate 透传参（原方法已注释保留）。
  - `Runtime/test/RuntimeGateway.test.ts` —— 断言随收敛语义更新：def 无 soul 绑定时 system 无 Soul 段且 `matchSoul` **不被调用**（原断言"通用人格动态解析"已注释为语义变更说明）。

**影响的端点**：
  - `POST /api/chat/stream` —— e2e 实测（"你是谁"，def signature 命中）：run 全程 **1.4s**（run.accepted→run.finished），零路由 LLM、零组件匹配 LLM；对比修复前 26s。

**可能存在的问题**：
  - def 的 binding 为空时 system 无 Soul 段，Agent 人格完全依赖模板 identity 段；若预期有 Soul，必须先经 `declareAgent`/配置中心显式写 `soul_id`/`tools_json`。
  - skill/mcp 不能再被 LLM 侧"选"，只能由 def 显式绑定 ---- 需要绑定能力的入口只剩构建（AgentBuilder）与 declareAgent。
