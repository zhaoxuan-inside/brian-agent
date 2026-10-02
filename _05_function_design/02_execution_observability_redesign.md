# 02 任务执行全景分析与思考过程重构设计 (_05_function_design)

> 状态: superseded（已被 ADR-013 取代：无服务端分析产物，改为 shared 契约 + 唯一 reducer + task_event_record 重放；本文仅留设计史）　更新: 2026-09-30

## 1. 重构背景与核心目标

原有的「思考过程」主要为底层数据库事件的简单流水账转储，存在三个严重缺陷：
1. **可信度低**：堆砌碎片化的底层事件（如“选定提示词”、“组件装配完成”、“选定Skill×5”），缺乏业务推演逻辑与决策依据；
2. **资源消耗不透明**：仅有一个粗糙的总 Token 数字，未按阶段、按模型、按上下文构成拆解；
3. **缺乏优化指导**：只有毫秒数字，无法定位延迟瓶颈与长上下文膨胀，无法指导用户调优。

### 三大设计目标
1. **可信度追踪 (Trust Observability)**：结构化呈现“意图路由 → 上下文构建 → 技能调用 → 推理推演 → 定稿交付”高阶业务阶段，突出决策依据与输入输出因果关系，让用户充分信赖 Agent 的执行逻辑。
2. **资源消耗剖析 (Token Accounting)**：按阶段、按模型、按上下文构成（Prompt/历史消息/工具返回）精准分解 Token 消耗与成本。
3. **性能诊断与优化指导 (Optimization Advisor)**：提供耗时分解（TTFT / 生成 / 工具延迟）、自动化性能瓶颈检测与具体的调优建议（如上下文压缩、小模型路由建议）。

---

## 2. 后端数据模型设计 (`TaskExecutionAnalysis`)

后端由专门的分析引擎从 `stream_event`、`llm_call_log`、`runtime_message`、`runtime_message_part` 聚合生成以下标准结构：

```ts
export interface TaskExecutionAnalysis {
  runId: string
  sessionId: string
  status: 'running' | 'finished' | 'failed'
  
  // 运行总体概览与健康度
  summary: {
    totalDurationMs: number
    totalTokens: number
    inputTokens: number
    outputTokens: number
    tokensPerSecond: number
    agentName: string
    modelName: string
    toolCallCount: number
    permissionCount: number
    efficiencyScore: number // 0~100 综合健康评分
  }

  // 目标 1: 业务执行流程与可信度追踪 (Trust Trace Stages)
  stages: Array<{
    id: string
    name: string                    // 如 "意图识别与路由"、"上下文构建"、"工具与技能执行"、"模型推理思考"、"定稿排版"
    category: 'intent' | 'context' | 'tool' | 'reasoning' | 'writer' | 'eval'
    status: 'ok' | 'fail' | 'running'
    durationMs: number
    tokens: { input: number; output: number; total: number }
    decisionSummary: string         // 核心决策/输出说明
    details: {
      rationale?: string            // 决策依据
      agentMatch?: { candidateCount: number; selectedAgent: string; score: number }
      toolCalls?: Array<{ toolName: string; input: unknown; output: unknown; durationMs: number; status: string }>
      contextStats?: { round: number; messageCount: number; memorySources?: string[] }
      thinkingContent?: string      // 思考推理全文
      replyContent?: string         // 最终回复
    }
  }>

  // 目标 2: Token 资源深度剖析 (Resource Breakdown)
  resourceBreakdown: {
    byStage: Array<{
      stageName: string
      inputTokens: number
      outputTokens: number
      totalTokens: number
      percentage: number
    }>
    byModel: Array<{
      modelTitle: string
      callCount: number
      inputTokens: number
      outputTokens: number
      totalTokens: number
      durationMs: number
    }>
    contextComposition: {
      systemPromptTokens: number
      historyMessagesTokens: number
      toolResultsTokens: number
      generationTokens: number
    }
  }

  // 目标 3: 性能诊断与优化指导 (Optimization Insights)
  optimization: {
    latencyBreakdown: {
      modelInferenceMs: number      // 模型推理总耗时
      toolExecutionMs: number       // 工具执行耗时
      frameworkOverheadMs: number   // 编排检索开销
    }
    bottlenecks: Array<{
      type: 'context_bloat' | 'high_latency' | 'tool_overhead' | 'low_tps' | 'model_redundancy'
      severity: 'warning' | 'info' | 'critical'
      title: string
      description: string
      impact: string
      recommendation: string
    }>
  }
}
```

---

## 3. 前端交互与统一管道透视设计 (Integrated Pipeline Architecture)

弹窗顶部常驻任务摘要指标栏（耗时、Token总量及分布比、生成速率、效率评分、调优诊断入口）：
- **核心模块：执行流程 (Execution Flow)**：
  - **第一步：获取记忆 (InfoCoreService.context)**：根据用户会话和工作区提取历史多维记忆与用户画像（user_profile、timeline、current、similarity、tag_relative、keyword 等各信息源统计），提供「查看记忆」按钮按需拉取具体记忆切片与画像维度详情。
  - **第二步：目标理解与 Agent 路由 (AgentDefService.matchAgent)**：展示意图分类、置信度分数及候选 Agent 评分，并完整透视命中 Agent 的架构组件（思维模型 CoT/ReACT、基础 LLM、Prompt 模板、Soul 人设、挂载 Skill 及 MCP）。
  - **第三步：动态技能与工具调用 (SkillCoreService.runSkill / executeTool)**：展示入参详情与实际工具执行产出结果（支持长文本按需异步获取）。
  - **第四步：深度思维推理与决策推导 (AgentExecutionService.executeRun)**：按多轮（Round 1, Round 2...）分别独立展示，每轮清晰隔离【基础记忆内容 (Base Context)】与【Agent 多轮增量 Context】以及推导结果，按需异步拉取。
  - **第五步：定稿交付与格式编排 (WriterAgentService.compose)**：透视写作 Agent 及其组件，展示格式化组装结果。
  - **第六步：自省评估与质量诊断 (EvolutorAgentService.evaluate)**：透视自省 Agent 组件与评分维度。
- **悬浮分析：Token 消耗画像**：顶栏贯穿条以不同色彩展示各步骤 Token 占比，鼠标悬浮即时显示各阶段 Token 明细与占比。
- **调优诊断看板（顶栏问号入口）**：将性能瓶颈预警、耗时分解瀑布与全流程调优指引收纳至独立诊断看板中，点击问号 icon 浮层弹出，不污染执行时序主通道。
