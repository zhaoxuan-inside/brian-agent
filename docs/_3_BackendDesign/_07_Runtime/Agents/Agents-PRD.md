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
| `matchAgentDef` | 组件匹配复用（四层：exact → 向量召回（余弦≥`match_vector_threshold` 直接采纳）→ LLM 打分 → new；**无随机重建**；向量置信度不足回退 LLM 裁判） | `handleMatchAgentDef` + `soSignatureCandidates` + `soVectorRankedDef` + `soLLMRankedCandidate` |
| `soAgentSnapshot` | 会话级快照（进程内 LRU 缓存 + TTL；组件解析：model/tools/permissions/soul 组装） | `handleSoAgentSnapshot` + `prepareSnapshotComponents` + `resolveDefaultModel` |
| `configAgentDef` | 配置 | `handleConfigAgentDef` |

## 6. 内部流程要点

1. **快照组装顺序**：`prepareSnapshotComponents`（数据，≤40 行）：解析 model（空串→`resolveDefaultModel` 经 `LLMCore.matchLLM`）→ 组装 tools（`soTools`，Wildcard 末条匹配）→ 组装 permissions → soul/system（`prompt_template_id` 空串→内置模板回退渲染）→ budget。任一组件解析失败 **fail-loud**。
2. **分层 system prompt**（prompt 缓存边界）：`stable`（persona/工作区说明）| `context`（会话上下文/工具清单）| `volatile`（时序上下文/本轮说明）——组装由 `prepareLayeredSystem` 完成，切界固定。
3. **匹配打分**：`soLLMRankedCandidate` 复用旧 `builtin.agent_match` 提示（PromptCatalog）；阈值 `match_similarity_threshold`（默认 0.7）。**2026-09-14 新增向量召回层**：`soVectorRankedDef` 对任务内容与 def 用途/签名代理文本分别向量化（`LLMAccess.embedLLM`，def 向量惰性缓存随 active def 缓存失效清空），余弦相似度 ≥ `match_vector_threshold`（`runtime_agents_config.match_vector_threshold`，默认 0.85）→ 直接采纳（`matched_by=vector`，上报 `intent.analyzed` 带 `matched_via: 'vector'`），**跳过一次 5-20s 的意图打分 LLM**；置信度不足或 embedding 不可用时回退 `soLLMRankedDef`（LLM 裁判 payload 补 `matched_via: 'llm'`）。
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

### [2026-09-12] AgentDefService 资产同步修复 + 全量 ID UUID 规范化

**变更原因**：
1. `AgentBuilder.buildAgent` 构建新 Agent 时已正确匹配/生成了 `soul_id`、`prompt_template_id`、`skill_ids`、`mcp_ids` 并落账到 `agent` 表，但在 `AgentDefService.insertDefFromAgent` 插入 `runtime_agent_def` 时被硬编码写入了空串，导致运行时快照丢失 Soul 与工具注入；
2. 全系统 Prompt 模板与各组件 ID 统一收敛为标准 UUID 格式，废弃 `builtin.*` 字符串硬编码。

**修改的方法**：
- `Runtime/Agents/application/AgentDefService.insertDefFromAgent` — 从 `agent` 资产中同步读取 `soul_id`、`prompt_template_id`、`skill_ids / mcp_ids`，持久化到 `runtime_agent_def` 表的对应字段中；
- `Runtime/Agents/application/AgentDefService.soAgentSnapshot` — 读取 `def.soul_id` 并从 `agent` 表中兜底回填，将 Soul 内容注入 `{{soul}}` 占位符，上报真实模板 UUID；
- `Runtime/Agents/application/AgentDefService.prepareSystemPrompt` — 在统一身份声明（Brian 智能个人助理）骨架下，将针对任务特质匹配/生成的专属 Soul 与工具清单注入到 Prompt 模板中。

**影响的端点**：
- `POST /api/chat/stream` — 问答会话中的 Soul 注入与工具数正确生效并展示。

