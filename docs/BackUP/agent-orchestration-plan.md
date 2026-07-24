# Agent 管理系统 + 编排框架 改造方案

> 状态：等待确认

## 一、现状分析总结

### 1.1 两套并行 Agent 体系（现状瓶颈）

```
src/strategy/                 ← 运行时编排，硬编码四个固定角色
├─ AgentOrchestrator
│   ├─ PlannerAgent    (只返回 "Plan generated"，无实际任务拆解)
│   ├─ WorkerAgent     (单次 LLM 调用，无 DAG 分派)
│   ├─ SynthesizerAgent (合并结果)
│   └─ EvaluatorAgent  (5维启发式评分，但评分结果从不回写 AgentLibrary)

src/agent/                    ← Agent 生命周期管理
├─ MetaAgent          (analyze → buildAgent/reuseAgent → submit)
├─ AgentBuilder       (CRUD API)
├─ AgentLibrary       (已有 strength/reliability/useCount/feedbackHistory，死数据)
├─ GraphExecutor      (已有拓扑排序 + BSP 并行执行，但输入的 DAG 是 MetaAgent 随手建的)
```

**核心问题**：两套体系断层。strategy 层的 planner 不会真的拆解任务；agent 层的 evaluation 数据不回写 AgentLibrary → 无法自优化。

### 1.2 前端现状

- 页面标题：`'Agent'`（Header/路由）
- `role` 字段：普通文本输入框（自由文本），非枚举类型
- 表单字段 15 个，其中 `mcpIds` UI 缺失、`webSearch` 和 `sources.knowledgeBase` 未渲染、`stopConditions` 为空数组

---

## 二、需求串联 —— 目标架构

### 三层 Agent 角色闭环

```
┌────────────────────────────────────────────────────────────────┐
│  用户消息                                                       │
│    │                                                            │
│    ▼                                                            │
│  ┌──────────────────────┐                                       │
│  │   任务规划者 (Planner) │  ← 从编排框架获取上下文               │
│  │   逐步分解用户问题     │     taskFeatures: intent/complexity/  │
│  │   → 不可拆分的子任务  │     domain + ChatMap selectedContext  │
│  │   为每个子任务选择/构建 │     + memoryContext                  │
│  │   一个工作Agent        │                                      │
│  │   → 输出 任务 DAG      │                                      │
│  └────────┬─────────────┘                                       │
│           │ taskGraph (topological DAG)                          │
│           ▼                                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  工作Agent 们 (Worker × N)                                 │   │
│  │  每个工作Agent 绑定:  LLM + Soul + Skill + Work + (MCP)    │   │
│  │  执行顺序：最底层先执行 → 上层依赖下层结果                   │   │
│  │  GraphExecutor 拓扑排序 + BSP 并行层层推进                  │   │
│  └────────┬─────────────────────────────────────────────────┘   │
│           │ subTaskResults (每个工作Agent的输出)                  │
│           ▼                                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  评估Agent (Evaluator)                                     │   │
│  │  从编排框架获取上下文 + 工作Agent的回复 → 多维评估           │   │
│  │  评估结果回写 AgentLibrary:                                  │   │
│  │    reliability ↑↓  →  影响激活度                             │   │
│  │    strength ↑↓    →  决定老化 vs 强化                       │   │
│  │    feedbackHistory ←  评分 + 评语                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [定时维护] AgentLibrary.maintenance():                          │
│    低 reliability + 长时间未使用 → strength 衰减 → 老化          │
│    高 reliability + 高频使用    → strength 增强 → 强化复用        │
│    过低 strength 的 Agent/Skill/Work/Soul/MCP → 标记 deprecated  │
└────────────────────────────────────────────────────────────────┘
```

### LangChain 对照

| LangChain 概念 | 对应本系统 |
|---|---|
| Agent Executor | AgentOrchestrator（统一入口）|
| Task Planner | **任务规划者** — LLM 驱动的任务 DAG 生成 |
| Tool | **MCP**（预留）|
| Agent (worker) | **工作Agent** — LLM + Soul(角色人格) + Skill(领域能力) + Work(任务模板) |
| Chain | 工作Agent 内部 strategy 驱动的 multi-step 执行 |
| Evaluator / Critic | **评估Agent** — 打分 + 反馈回写 |

---

## 三、改动清单

### 3.1 前端（Agent管理页面）

#### 3.1.1 页面改名
| 位置 | 改动 |
|---|---|
| `router/index.ts:67-69` | 路由 `path: '/agent'` + 组件名注释 |
| `Header.vue:22` | 标签 `'Agent'` → `'Agent管理'` |

#### 3.1.2 角色字段改造
| 现状 | 改为 |
|---|---|
| `<input>` 自由文本 `role` | `<select>` 下拉框，3 个选项 |
| 标签：`角色/用途` | 标签：`角色` |
| 无 | 根据选中角色动态显示不同的配置区域 |

**三个角色**：

| 角色值 | 显示名 | 描述 |
|---|---|---|
| `planner` | 任务规划者 | 接收上下文，分解用户问题为目标 DAG，为子任务选择和构建工作Agent |
| `worker` | 工作Agent | 接收执行上下文，使用 Soul+Skill+Work+MCP 通过 LLM 完成指定工作 |
| `evaluator` | 评估Agent | 接收上下文和工作Agent回复，多维评估，回写可靠性/强度 |

#### 3.1.3 表单字段按角色分级

**所有角色通用**：
- name（名称）
- role（角色，下拉选择）
- description（描述）
- enabled（启用开关）

**planner 专用**：
- strategyType（编排策略：react/plan-execute/cot/hybrid）
- maxIterations（最大分解轮次）
- llm 配置（temperature, maxTokens）
- systemPrompt（任务分解的 system prompt）

**worker 专用**：
- strategyType
- maxIterations
- llm 配置
- **Soul 绑定**（角色人格，影响回复风格）
- **Skill 绑定**（领域能力，如代码生成、搜索、分析）
- **Work 绑定**（任务模板，如 debug、写代码、翻译）
- **MCP 绑定**（工具，预留 UI 补全）
- systemPrompt
- instruction（任务指令模板）

**evaluator 专用**：
- llm 配置（低 temperature，追求一致性）
- systemPrompt（评估标准 prompt）
- 评分维度权重（可扩：relevance/accuracy/completeness/coherence/helpfulness）

#### 3.1.4 其他表单优化
- 补全 `mcpIds` 双栏选择器 UI（数据逻辑已存在）
- `webSearch` 和 `sources.knowledgeBase` 移除或放到 worker 专属区（当前无真实用途可考虑移除）
- `stopConditions` 移除（始终为空）

---

### 3.2 后端（编排框架 + 自优化闭环）

#### 3.2.1 类型统一（src/shared/types.ts）
```typescript
// Agent 角色枚举（替换当前自由文本 + 两套不兼容的 AgentType）
export const AgentRole = {
  Planner: 'planner',
  Worker: 'worker',  
  Evaluator: 'evaluator',
} as const;
export type AgentRole = (typeof AgentRole)[keyof typeof AgentRole];
```

#### 3.2.2 ChatService 改造（编排入口）

**现状**：sendMessage/streamMessage → `MetaAgent.analyze` → `MetaAgent.buildAgent` (一个 WorkAgent) → `GraphExecutor.execute` (单任务)

**改为**：

```
ChatService.sendMessage() / streamMessage()
  │
  ├─ buildContext(userId, sessionId, selectedMessageIds) → context
  │
  ├─ 找到 register 的 planner CustomAgent
  │   │  plannerAgent.execute(context + userMessage)
  │   │  → taskDag: [{ id, description, agentType, requiredCapabilities, dependencies[] }]
  │   │     (LLM 驱动的任务分解，参考 LangChain Plan-and-Execute)
  │   │
  ├─ 为 taskDag 中每个子任务选择/构建 WorkAgent:
  │   │  MetaAgent.buildAgent(taskFeatures = { intent, requiredCapabilities, ... })
  │   │  → { agent, soulConfig, skills, workTemplate, mcps }
  │   │
  ├─ GraphExecutor.execute(taskDag, agents, state)
  │   │  topologicalSort → 底层先执行，结果注入上层 state → 层层推进
  │   │  每个任务: agent.strategy.execute(messages, state.taskContext)
  │   │
  │   → subTaskResults: Map<taskId, { output, agentId }>
  │
  ├─ 找到 register 的 evaluator CustomAgent
  │   │  evaluatorAgent.execute(context + subTaskResults)
  │   │  → evaluations: { agentId, scores: QualityScore, feedback }
  │   │
  ├─ AgentLibrary 回写:
  │   │  for each evaluation:
  │   │    agentLibrary.updateReliability(agentId, scores.overall)
  │   │    agentLibrary.addFeedback(agentId, scores, feedback)
  │   │
  └─ Synthesizer 合并 → finalResult
```

#### 3.2.3 AgentOrchestrator 重写

**现状**：planner/worker/synthesizer/evaluator 四步骤严格串行，由 app.ts 注入。

**改为**：统一的编排框架入口，接收：
- CustomAgent planner（用户配置的任务规划者）
- CustomAgent evaluator（用户配置的评估者）
- 根据 planner 产出的 taskDag 调用图执行器分派工作Agent

```typescript
class AgentOrchestrator {
  orchestrate(request: OrchestrateRequest): OrchestrationResult {
    // 1. Planner: LLM 驱动任务分解 → taskDag
    const taskDag = await this.executePlanner(planner, context, userMessage);
    
    // 2. Worker: 为每个子任务匹配/构建 WorkAgent，图执行
    const workers = taskDag.tasks.map(t => this.resolveWorker(t));
    const results = await this.graphExecutor.execute(taskDag, workers, state);
    
    // 3. Evaluator: 评估每个工作Agent的输出
    const evaluations = await this.executeEvaluator(evaluator, results, context);
    
    // 4. 回写 AgentLibrary（自优化）
    for (const ev of evaluations) {
      this.agentLibrary.updateReliability(ev.agentId, ev.scores.overall);
      this.agentLibrary.addFeedback(ev.agentId, ev.scores, ev.feedback);
    }
    
    // 5. Synthesizer: 合并所有结果
    return this.synthesize(results, context);
  }
}
```

#### 3.2.4 自优化闭环

**当前缺失**：
- `EvaluateAgent.execute()` 返回 `calculateQualityScore()` → 评分结果**直接被丢弃**
- `AgentLibrary` 有 `strength/reliability/useCount/feedbackHistory` 字段 → 但**无人更新**

**新增**：

1. **AgentLibrary.updateReliability(agentId, score)**：指数移动平均 `reliability = reliability * 0.8 + score * 0.2`

2. **AgentLibrary.addFeedback(agentId, scores, feedback)**：push 进 feedbackHistory，每次评估后调用

3. **AgentLibrary.updateStrength(agentId, result)**：
   - 成功（reliability >= threshold）→ `strength = min(1, strength + 0.05)`
   - 失败（reliability < threshold）→ `strength = max(0.1, strength - 0.1)`

4. **AgentLibrary.maintenance()**：启动后定时执行（或按需）：
   - 扫描 `lastUsedAt > 7天 AND strength < 0.3` → deprecated 标记
   - 扫描 `useCount > 10 AND strength > 0.7` → 强化为 primary 模板
   - 清理 feedbackHistory 到最近 100 条

5. **级联影响**：
   - Skill 活跃度 = 使用该 Skill 的所有工作Agent 的平均 reliability
   - Work 活跃度 = 同上
   - Soul 活跃度 = 同上
   - MCP 活跃度 = 同上
   - 低活跃度的资源 → 建议废弃/替换

#### 3.2.5 图执行增强（已有基础）

GraphExecutor 已支持：
- `topologicalSort` ✓
- BSP 并行层执行 ✓
- `reflect()` 质量检查 + 自动重试/策略切换 ✓

**增强**：
- 任务 DAG 格式标准化（planner 输出 → executor 输入）
- 子任务间上下文传递（上层任务可读取下层任务的 output）
- executeReACT/executePlanExecute/executeCoT 中注入 Soul config + Skill definitions + Work instructions

---

### 3.3 实施路线

| 阶段 | 内容 | 预估重心 |
|---|---|---|
| **Phase A: 前端重命名 + 角色下拉** | 页面改名、role 改为下拉选择、按角色动态表单 | 前端 |
| **Phase B: 类型统一 + AgentBuilder 改造** | shared/types 统一 AgentRole、AgentBuilder CRUD 适配新类型 | 前端+后端 |
| **Phase C: Planner 任务分解** | LLM 驱动的 Plan-and-Execute 式任务 DAG 生成 | 后端核心 |
| **Phase D: 工作Agent 匹配与执行** | MetaAgent 按子任务匹配 WorkAgent、图执行器接 DAG | 后端核心 |
| **Phase E: 评估 + 自优化闭环** | Evaluator 评分回写 AgentLibrary、maintenance 任务 | 后端核心 |
| **Phase F: 级联活跃度** | Skill/Work/Soul/MCP 的活跃度计算与老化标记 | 后端 |

---

## 四、确认决策点

| # | 问题 | 建议 |
|---|---|---|
| 1 | 前端改造幅度：仅改角色下拉 + 动态表单？还是连同 Agent 列表/执行可视化一起改？ | 建议分阶段：先 Phase A+B，验证后再 Phase C+ |
| 2 | Planner 的任务分解使用哪个 LLM（用户配置的某个 Planner Agent 的模型？还是默认聊天模型？） | Planner Agent 绑定的 LLM |
| 3 | Evaluator 评估使用 LLM 打分还是纯启发式？（当前 EvaluatorAgent.calculateQualityScore 是启发式） | 升级为 LLM 打分 + 启发式 fallback |
| 4 | 现有 4 个策略层 agent（app.ts 注册 planner/worker/synthesizer/evaluator）是否保留？ | 替换为以 CustomAgent 驱动的动态编排 |
| 5 | Phase F 级联活跃度是否需要独立的管理页面（如"资源健康度"视图）？ | 可选：在现有 Agent/Skill/Soul/Work 列表页增加活跃度指标 |
