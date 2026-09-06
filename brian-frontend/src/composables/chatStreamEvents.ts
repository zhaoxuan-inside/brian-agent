/**
 * @fileoverview 对话 SSE 事件 → Store 状态的适配层。
 *
 * 后端编排流（/api/chat/stream、confirm-intent、submit-clarification）逐帧推送
 * 编排事件；本模块把每类事件转换为会话数据 store（blocks）与交互 UI store（Planning /
 * Agent 状态更新。原实现内联于 ChatArea.vue（handleStreamEvent 560+ 行），
 * 现按事件拆为具名函数并以分发表分发。
 *
 * 本模块只做"协议 → 状态"映射，不发起请求；请求与生命周期编排见 useChatStream。
 */
import type { Block, TextBlock, ThinkingBlock, TaskDagNode, TaskDagEdge, DagNodeItem, DagEdgeItem, DagExecutionStep } from '@/api/types'
import type { useSessionStore } from '@/stores/session'
import type { useChatUiStore } from '@/stores/chatUi'

type ChatStore = ReturnType<typeof useSessionStore>
type ChatUiStore = ReturnType<typeof useChatUiStore>

/** 单条 SSE 帧解析出的公共字段，作为各事件处理函数的上下文 */
interface StreamEventCtx {
  chat: ChatStore
  ui: ChatUiStore
  botMsgId: string
  payload: Record<string, unknown>
  /** 服务器时间戳（结构化帧取 timestamp 字段，否则本地时钟） */
  serverTime: number
  agentId: string
  taskId: string
}

export interface ChatStreamEventHandler {
  /** 处理一条 SSE 帧（已由 readSSE 解析为 JSON 对象） */
  handle: (data: Record<string, unknown>, botMsgId: string) => void
  /**
   * 重置轮内状态，在新一轮交互开始前调用。
   * @param clearTrace 是否同时清空 trace_id 回退值（仅新发送流程需要；
   *                    确认/补充流程沿用上一轮 trace 作为 done/error 帧缺省时的回退）
   */
  reset: (clearTrace?: boolean) => void
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ============================================================
// 纯映射辅助（无状态，模块级）
// ============================================================

/** Agent 名称展示格式化：uuid 或与 agent_id 相同的原始名视为"无名称"，按类型给默认标题 */
function formatAgentTitle(rawName?: string, agId?: string, agType?: string): string {
  if (rawName && !UUID_RE.test(rawName) && rawName !== agId) {
    return rawName
  }
  const typeUpper = (agType || '').toUpperCase()
  if (typeUpper === 'PLANNER') return '规划 Agent (Planner)'
  if (typeUpper === 'WRITER') return '表达 Agent (Writer)'
  if (typeUpper === 'EVOLUTOR') return '进化 Agent (Evolutor)'
  return '执行 Agent'
}

function mapTaskNodes(taskDag: { nodes?: unknown[] }): TaskDagNode[] {
  if (!Array.isArray(taskDag.nodes)) return []
  return (taskDag.nodes as Record<string, unknown>[]).map((t, i) => {
    const content = String(t.task_content ?? '')
    const domain = String(t.task_domain ?? '')
    return {
      id: String(t.task_id ?? `task-${i}`),
      label: domain || (content ? content.slice(0, 16) : `任务 #${i + 1}`),
      domain,
      content,
      complexity: Number(t.task_complexity ?? 0),
      priority: Number(t.priority ?? 0),
      dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
    }
  })
}

function mapTaskEdges(taskDag: { edges?: unknown[] }): TaskDagEdge[] {
  if (!Array.isArray(taskDag.edges)) return []
  return (taskDag.edges as Record<string, unknown>[]).map((e) => ({
    source: String(e.from_task_id ?? ''),
    target: String(e.to_task_id ?? ''),
  }))
}

/**
 * Agent DAG 节点主键用 task_id（唯一），agent_id 仅作执行联动字段：
 * 同一 Agent 复用到多个任务时避免重复 key 导致的节点折叠与布局塌陷
 */
function mapAgentDagNodes(agentDag: Record<string, unknown>): DagNodeItem[] {
  const agentNodes = Array.isArray(agentDag.agent_nodes) ? agentDag.agent_nodes : []
  return (agentNodes as Record<string, unknown>[]).map((n, i) => {
    const domain = String(n.task_domain ?? '')
    const content = String(n.task_content ?? '')
    const title = domain || (content ? content.slice(0, 16) : `任务 #${i + 1}`)
    return {
      id: String(n.task_id ?? `task-${i}`),
      agentId: String(n.agent_id ?? ''),
      label: `任务 ${i + 1}: ${title}`,
      domain,
      content,
      status: String(n.status ?? 'PENDING'),
      taskId: String(n.task_id ?? ''),
    }
  })
}

function mapAgentDagEdges(agentDag: Record<string, unknown>): DagEdgeItem[] {
  if (!Array.isArray(agentDag.agent_edges)) return []
  return (agentDag.agent_edges as Record<string, unknown>[]).map((e) => ({
    source: String(e.from_task_id ?? ''),
    target: String(e.to_task_id ?? ''),
    label: String(e.data_dependency ?? ''),
  }))
}

/** 后端节点状态串归一为运行时三态（完成/执行中/待执行） */
function normalizeNodeStatus(raw: string): 'SUCCESS' | 'RUNNING' | 'PENDING' {
  const s = raw.toUpperCase()
  if (s.includes('COMPLET') || s.includes('SUCCESS') || s.includes('DONE')) return 'SUCCESS'
  if (s.includes('RUN') || s.includes('EXECUT') || s.includes('PROCESS')) return 'RUNNING'
  return 'PENDING'
}

/** 按 (node_id, node_type) 定位并替换/追加编排执行步骤 */
function upsertExecutionStep(steps: DagExecutionStep[], step: DagExecutionStep): DagExecutionStep[] {
  const idx = steps.findIndex((s) => s.node_id === step.node_id && s.node_type === step.node_type)
  const next = [...steps]
  if (idx >= 0) next[idx] = step
  else next.push(step)
  return next
}

// ============================================================
// 事件处理工厂（持有轮内状态：流式文本块指针 / trace_id 回退值）
// ============================================================

export function createChatStreamEventHandler(chat: ChatStore, ui: ChatUiStore): ChatStreamEventHandler {
  // 当前流式文本块 id：一轮回复只在首个文本帧创建一次 TextParagraph，后续帧追加
  let textBlockId: string | null = null
  // 后端经 ToolProvider 生成的 trace_id 由 connected 事件回传，供 Feedback/Error 块缺省引用
  let currentTraceId = ''

  /** 快捷辅助：获取或创建某 Agent 的 ThinkingBlock（按 agentId 复用，回填非 uuid 的真实名称） */
  function getOrCreateThinkBlock(ctx: StreamEventCtx, agId: string, defaultName?: string, defaultType?: string): ThinkingBlock {
    const key = agId ? `block-think-${ctx.botMsgId}-${agId}` : `block-think-${ctx.botMsgId}`
    let existing = ctx.chat.blocks.find(b => b.id === key) as ThinkingBlock | undefined
    const formattedName = formatAgentTitle(defaultName, agId, defaultType)

    if (!existing) {
      existing = {
        id: key,
        msgId: ctx.botMsgId,
        role: 'assistant',
        type: 'ThinkingChain',
        content: '',
        summary: '',
        durationMs: 0,
        agentInfo: {
          id: agId,
          name: formattedName,
          type: defaultType || 'WORKER',
        },
        context: {
          userProfile: { language: 'zh-CN', format: 'MARKDOWN', style: 'clear' },
          citingMessages: [],
        },
        steps: [],
        meta: { status: 'streaming', createdAt: ctx.serverTime, updatedAt: ctx.serverTime },
      }
      chat.addBlock(existing as Block)
    } else if (defaultName && !UUID_RE.test(defaultName) && defaultName !== agId) {
      if (!existing.agentInfo) {
        existing.agentInfo = { name: defaultName, type: defaultType || 'WORKER' }
      } else {
        existing.agentInfo.name = defaultName
      }
      chat.updateBlock(existing.id, { agentInfo: existing.agentInfo })
    }
    return existing
  }

  /** 自动弹出思考弹窗时定位动画原点：取"要展示思考过程的问题"（最近一条用户消息）对应的"思考过程"按钮 */
  function resolveAutoThinkingOrigin() {
    const msgs = chat.messages
    let lastUser
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUser = msgs[i]
        break
      }
    }
    if (lastUser) {
      const btn = document.querySelector(`[data-thinking-id="${lastUser.id}"]`) as HTMLElement | null
      if (btn) {
        const r = btn.getBoundingClientRect()
        ui.setThinkingOrigin({ left: r.left, top: r.top, width: r.width, height: r.height })
        return
      }
    }
    ui.setThinkingOrigin(null)
  }

  /** 最终回复文本：首个文本帧创建 TextParagraph 块，后续帧追加内容（agent_output 与 text_chunk 共用） */
  function appendAssistantChunk(ctx: StreamEventCtx, chunk: string) {
    if (!chunk) return
    if (!textBlockId) {
      textBlockId = `block-text-${ctx.botMsgId}`
      const textBlock: TextBlock = {
        id: textBlockId,
        msgId: ctx.botMsgId,
        role: 'assistant',
        type: 'TextParagraph',
        content: chunk,
        meta: { status: 'streaming', createdAt: ctx.serverTime, updatedAt: ctx.serverTime },
      }
      chat.addBlock(textBlock as Block)
    } else {
      chat.appendBlockContent(textBlockId, chunk)
    }
  }

  // ----- 逐事件处理函数 -----

  function onConnected(ctx: StreamEventCtx) {
    const tid = typeof ctx.payload.trace_id === 'string' && ctx.payload.trace_id ? ctx.payload.trace_id : ''
    if (tid) currentTraceId = tid
  }

  /** 上下文构建完成：填充思考块的完整分类 Context 数据与 Category ID 映射 */
  function onContextBuilt(ctx: StreamEventCtx) {
    const { payload } = ctx
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    const userProfile = (payload.user_profile as Record<string, unknown>) || undefined
    const recentWorks = (payload.recent_works as unknown[]) || undefined
    const categories = (payload.context_categories as Record<string, unknown[]>) || {}
    const categoryIds = (payload.context_category_ids as Record<string, string[]>) || undefined
    const citingMessages = categories.citing || (Array.isArray(payload.session_context) ? payload.session_context : ((payload.citations as unknown[]) || undefined))

    thinkBlock.context = {
      strategy: (payload.strategy as string) || (ui.planning?.status && ui.planning.status !== 'idle' ? 'Planning 策略 (任务分解)' : 'Simple 策略 (直接推理)'),
      userProfile,
      selectedMessages: categories.selected,
      citingMessages,
      timelineMessages: categories.timeline,
      pinnedMessages: categories.pinned,
      similarityMessages: categories.similarity,
      tagRelativeMessages: categories.tag_relative,
      keywordMessages: categories.keyword,
      randomMessages: categories.random,
      categoryIds,
      recentWorks,
      customContext: typeof payload.custom_context === 'string' ? payload.custom_context : undefined,
    }
    chat.updateBlock(thinkBlock.id, { context: thinkBlock.context })
    // 上下文构建成功后弹出思考过程弹窗（流式展示），避免过早弹出遮挡后续的「确认需求理解」弹窗
    resolveAutoThinkingOrigin()
    ui.openThinkingModal(null)
  }

  /** 需求理解 Agent (IntentAgent) 结果：填充思考块并标记该 Agent 成功 */
  function onIntentAgentResult(ctx: StreamEventCtx) {
    const { payload } = ctx
    const intentAgentId = 'intent-agent'
    const intentBlock = getOrCreateThinkBlock(ctx, intentAgentId, '需求理解 Agent (Intent)', 'INTENT')
    intentBlock.input = String(payload.understood_requirement ?? '')
    if (payload.prompt) intentBlock.prompt = payload.prompt as string
    intentBlock.content = String(payload.reasoning ?? '')
    intentBlock.output = {
      understood_requirement: payload.understood_requirement,
      match_score: payload.match_score,
      threshold_score: payload.threshold_score,
      should_modify_query: payload.should_modify_query,
    }
    if (typeof payload.input_tokens === 'number') intentBlock.inputTokens = payload.input_tokens
    if (typeof payload.output_tokens === 'number') intentBlock.outputTokens = payload.output_tokens
    if (typeof payload.elapsed_ms === 'number') intentBlock.durationMs = payload.elapsed_ms
    if (!intentBlock.steps) intentBlock.steps = []
    intentBlock.steps.push({
      phase: 'THINK',
      iteration: 1,
      content: `需求理解: ${String(payload.understood_requirement ?? '')}\n匹配度: ${payload.match_score ?? 'N/A'} / 阈值: ${payload.threshold_score ?? 'N/A'}`,
    })
    intentBlock.steps.push({
      phase: 'REFLECT',
      iteration: 2,
      reflection: `是否需要修改查询: ${payload.should_modify_query ? '是' : '否'}`,
      passed: true,
    })
    chat.updateBlock(intentBlock.id, {
      input: intentBlock.input,
      content: intentBlock.content,
      output: intentBlock.output,
      steps: intentBlock.steps,
      inputTokens: intentBlock.inputTokens,
      outputTokens: intentBlock.outputTokens,
      durationMs: intentBlock.durationMs,
      meta: { ...intentBlock.meta, status: 'done' },
    })
    ui.setAgentStatus(intentAgentId, 'SUCCESS', '需求理解 Agent (Intent)')
  }

  /** 需求理解得分低于阈值：弹出「需求确认」卡片，由用户确认按理解执行 / 按原文执行 / 取消 */
  function onIntentConfirmationRequired(ctx: StreamEventCtx) {
    ui.setIntentConfirmation({
      ...ctx.payload,
      session_id: chat.currentSessionId,
    })
  }

  /** Planner 识别出需用户补充参数才能执行的任务：在对话区弹出「需求补充」卡片 */
  function onClarificationRequired(ctx: StreamEventCtx) {
    ui.setClarificationRequest({
      ...ctx.payload,
      session_id: chat.currentSessionId,
    })
  }

  /** PlannerAgent 完成任务级拆解：记录 Task DAG 并更新弹窗 */
  function onPlanCreated(ctx: StreamEventCtx) {
    const taskDag = (ctx.payload.task_dag as { nodes?: unknown[]; edges?: unknown[] }) || {}
    const taskNodes = mapTaskNodes(taskDag)
    const taskEdges = mapTaskEdges(taskDag)
    ui.updatePlanning({
      planId: typeof ctx.payload.plan_id === 'string' ? ctx.payload.plan_id : undefined,
      taskDag: taskNodes.length > 0 ? { nodes: taskNodes, edges: taskEdges } : undefined,
      status: 'streaming',
    })
  }

  /** 任务级拆解映射为 Agent DAG：记录 Agent 级 DAG，并初始化各节点执行运行时状态（未执行 → 灰色） */
  function onAgentDagCreated(ctx: StreamEventCtx) {
    const agentDag = (ctx.payload.agent_dag as Record<string, unknown>) || {}
    const nodes = mapAgentDagNodes(agentDag)
    ui.updatePlanning({
      planId: typeof agentDag.plan_id === 'string' ? agentDag.plan_id : undefined,
      agentDag: {
        planId: typeof agentDag.plan_id === 'string' ? agentDag.plan_id : undefined,
        totalCount: Number(agentDag.total_agent_count ?? nodes.length),
        nodes,
        edges: mapAgentDagEdges(agentDag),
      },
      status: 'streaming',
    })
    // 节点主键 id 为 task_id；task 级状态按 task_id 记录，agent 级状态按 agentId 记录
    for (const n of ui.planning.agentDag?.nodes ?? []) {
      ui.setAgentStatus(n.agentId, normalizeNodeStatus(n.status ?? ''), n.agentName, n.id)
    }
  }

  /** JSONNode 编排节点开始执行：追加 RUNNING 步骤 */
  function onDagNodeStart(ctx: StreamEventCtx) {
    const step: DagExecutionStep = {
      node_id: String(ctx.payload.node_id ?? ''),
      node_type: String(ctx.payload.node_type ?? ''),
      status: 'RUNNING',
    }
    ui.updatePlanning({
      executionSteps: upsertExecutionStep(ui.planning.executionSteps || [], step),
      status: 'streaming',
    })
  }

  /** JSONNode 编排节点执行结束：更新步骤状态与耗时 */
  function onDagNodeEnd(ctx: StreamEventCtx) {
    const step: DagExecutionStep = {
      node_id: String(ctx.payload.node_id ?? ''),
      node_type: String(ctx.payload.node_type ?? ''),
      status: String(ctx.payload.status ?? 'SUCCESS'),
      elapsed_ms: Number(ctx.payload.elapsed_ms ?? 0),
      error: typeof ctx.payload.error === 'string' ? ctx.payload.error : undefined,
    }
    ui.updatePlanning({
      executionSteps: upsertExecutionStep(ui.planning.executionSteps || [], step),
      status: 'streaming',
    })
  }

  /** Agent 构建开始：创建「构建中」占位卡片，按到达顺序展示构建进度 */
  function onAgentBuilding(ctx: StreamEventCtx) {
    const taskContent = typeof ctx.payload.task_content === 'string' ? ctx.payload.task_content : ''
    const buildLabel = taskContent ? `构建中: ${taskContent.slice(0, 24)}` : '构建 Agent'
    ui.setAgentStatus(ctx.agentId, 'RUNNING', buildLabel)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId, buildLabel, 'WORKER')
    thinkBlock.agentInfo = { id: ctx.agentId, name: buildLabel, type: 'WORKER' }
    if (taskContent) thinkBlock.input = taskContent
    chat.updateBlock(thinkBlock.id, { agentInfo: thinkBlock.agentInfo, input: thinkBlock.input })
  }

  /** Agent 构建完成：回填真实 agent 名称与组件绑定 */
  function onAgentBuilt(ctx: StreamEventCtx) {
    const { payload } = ctx
    const agentName = String(payload.agent_name || payload.agent_id || ctx.agentId || 'WorkAgent')
    const agentType = String(payload.agent_type || 'WORKER')
    ui.setAgentStatus(ctx.agentId, 'RUNNING', agentName)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId, agentName, agentType)
    thinkBlock.agentInfo = {
      id: ctx.agentId,
      name: agentName,
      type: agentType,
      llmId: typeof payload.llm_id === 'string' ? payload.llm_id : undefined,
      soulId: typeof payload.soul_id === 'string' ? payload.soul_id : undefined,
      skills: Array.isArray(payload.skill_ids) ? payload.skill_ids.map(String) : undefined,
      mcps: Array.isArray(payload.mcp_ids) ? payload.mcp_ids.map(String) : undefined,
    }
    if (payload.task_content) {
      thinkBlock.input = payload.task_content as string | Record<string, unknown>
    }
    chat.updateBlock(thinkBlock.id, { agentInfo: thinkBlock.agentInfo, input: thinkBlock.input })
  }

  /** 复用既有 Agent：将「构建中」占位卡片收敛为「复用已有 Agent」 */
  function onAgentMatched(ctx: StreamEventCtx) {
    const matchedAgentId = String(ctx.payload.matched_agent_id || ctx.payload.agent_id || '')
    const key = ctx.agentId || matchedAgentId
    const thinkBlock = getOrCreateThinkBlock(ctx, key, '复用已有 Agent', 'WORKER')
    thinkBlock.agentInfo = { id: matchedAgentId || key, name: '复用已有 Agent', type: 'WORKER' }
    thinkBlock.output = { reused: true, matched_agent_id: matchedAgentId }
    ui.setAgentStatus(key, 'SUCCESS', '复用已有 Agent')
    chat.updateBlock(thinkBlock.id, { agentInfo: thinkBlock.agentInfo, output: thinkBlock.output, meta: { ...thinkBlock.meta, status: 'done' } })
  }

  /** Agent 思考推理中（RUNNING → 黄色）：追加/续写 THINK 步骤 */
  function onAgentThinking(ctx: StreamEventCtx) {
    const { payload } = ctx
    const chunk = typeof payload === 'string' ? payload : String(payload.chunk || payload.reasoning || '')
    const rawAgName = typeof payload.agent_name === 'string' ? payload.agent_name : undefined
    const rawAgType = typeof payload.agent_type === 'string' ? payload.agent_type : undefined
    const iterIdx = typeof payload.iteration === 'number' ? payload.iteration : undefined
    ui.setAgentStatus(ctx.agentId, 'RUNNING', rawAgName, ctx.taskId)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId, rawAgName, rawAgType)
    thinkBlock.content += chunk
    if (payload.prompt) thinkBlock.prompt = payload.prompt as string
    if (payload.raw_response) thinkBlock.rawResponse = payload.raw_response as string
    if (payload.input) thinkBlock.input = payload.input as string | Record<string, unknown>

    // 更新 steps：同 Agent 同迭代续写，否则新开 THINK 步骤
    if (!thinkBlock.steps) thinkBlock.steps = []
    const lastStep = thinkBlock.steps[thinkBlock.steps.length - 1]
    if (!lastStep || lastStep.phase !== 'THINK' || (iterIdx !== undefined && lastStep.iteration !== iterIdx)) {
      thinkBlock.steps.push({ phase: 'THINK', content: chunk, iteration: iterIdx ?? (thinkBlock.steps.length + 1) })
    } else {
      lastStep.content = (lastStep.content || '') + chunk
    }
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content, steps: thinkBlock.steps, input: thinkBlock.input, prompt: thinkBlock.prompt, rawResponse: thinkBlock.rawResponse })
  }

  /** Agent 工具调用：追加 ACT 步骤，并为真实外部工具生成独立 ToolInvocation 块（过滤 NONE 占位） */
  function onAgentAction(ctx: StreamEventCtx) {
    const { payload } = ctx
    ui.setAgentStatus(ctx.agentId, 'RUNNING', undefined, ctx.taskId)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    if (!thinkBlock.steps) thinkBlock.steps = []

    const toolName = String(payload.tool_name || payload.tool_type || payload.tool_id || 'Tool')
    const params = (payload.params as Record<string, unknown>) || {}
    const iterIdx = typeof payload.iteration === 'number' ? payload.iteration : undefined

    if (toolName === 'NONE') return
    thinkBlock.steps.push({
      phase: 'ACT',
      iteration: iterIdx ?? (thinkBlock.steps.length + 1),
      toolCalls: [{ toolName, toolType: String(payload.tool_type || toolName), params, result: payload.result }],
    })
    chat.updateBlock(thinkBlock.id, { steps: thinkBlock.steps })

    const toolBlock: Block = {
      id: `block-tool-${Date.now()}`,
      msgId: ctx.botMsgId,
      role: 'tool',
      type: 'ToolInvocation',
      toolName,
      params,
      result: payload.result,
      meta: { status: payload.status === 'done' ? 'done' : 'streaming', createdAt: ctx.serverTime, updatedAt: ctx.serverTime },
    } as Block
    chat.addBlock(toolBlock)
  }

  /** Agent 反思：追加 REFLECT 步骤（反思阶段仍属于思考推理中 RUNNING） */
  function onAgentReflection(ctx: StreamEventCtx) {
    const { payload } = ctx
    ui.setAgentStatus(ctx.agentId, 'RUNNING', undefined, ctx.taskId)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    if (!thinkBlock.steps) thinkBlock.steps = []
    if (payload.prompt) thinkBlock.prompt = payload.prompt as string
    if (payload.raw_response) thinkBlock.rawResponse = payload.raw_response as string
    const reflectIter = typeof payload.iteration === 'number' ? payload.iteration : undefined

    thinkBlock.steps.push({
      phase: 'REFLECT',
      iteration: reflectIter ?? (thinkBlock.steps.length + 1),
      reflection: String(payload.reflection || ''),
      passed: Boolean(payload.passed),
    })
    chat.updateBlock(thinkBlock.id, { steps: thinkBlock.steps, prompt: thinkBlock.prompt, rawResponse: thinkBlock.rawResponse })
  }

  /** Agent 产出完成（SUCCESS → 绿色）：回填输出与 Token 用量/耗时；文本产出同时流入用户可见文本块 */
  function onAgentOutput(ctx: StreamEventCtx) {
    const { payload } = ctx
    const outputVal = payload.output || payload.result || payload.chunk || payload.answer
    if (ctx.agentId) {
      ui.setAgentStatus(ctx.agentId, 'SUCCESS', undefined, ctx.taskId)
      const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
      thinkBlock.output = outputVal as string | Record<string, unknown>
      if (payload.input) thinkBlock.input = payload.input as string | Record<string, unknown>
      if (typeof payload.token_usage === 'number') thinkBlock.tokenUsage = payload.token_usage
      if (typeof payload.input_tokens === 'number') thinkBlock.inputTokens = payload.input_tokens
      if (typeof payload.output_tokens === 'number') thinkBlock.outputTokens = payload.output_tokens
      if (typeof payload.elapsed_ms === 'number') thinkBlock.durationMs = payload.elapsed_ms
      chat.updateBlock(thinkBlock.id, {
        output: thinkBlock.output,
        input: thinkBlock.input,
        tokenUsage: thinkBlock.tokenUsage,
        inputTokens: thinkBlock.inputTokens,
        outputTokens: thinkBlock.outputTokens,
        durationMs: thinkBlock.durationMs,
        meta: { ...thinkBlock.meta, status: 'done' },
      })
    }
    // 如果也是向用户展示的文本块
    appendAssistantChunk(ctx, typeof outputVal === 'string' ? outputVal : String(outputVal || ''))
  }

  /** 最终回复流式文本：开始输出即收敛思考块为 done，避免弹窗在回复已展示后仍显示「思考中...」 */
  function onTextChunk(ctx: StreamEventCtx) {
    const chunk = typeof ctx.payload === 'string' ? ctx.payload : String(ctx.payload.chunk || '')
    chat.finalizeThinkingBlocks(ctx.botMsgId)
    appendAssistantChunk(ctx, chunk)
  }

  function onCitation(ctx: StreamEventCtx) {
    if (textBlockId) {
      chat.updateBlock(textBlockId, {
        citingIds: ctx.payload.citing_ids as string[],
      } as Partial<Block>)
    }
  }

  /** 一轮回复流式输出完成：收敛全部块、标记 Planning 完成，并追加 Feedback 块 */
  function onDone(ctx: StreamEventCtx) {
    chat.finalizeBlocks(ctx.botMsgId)
    ui.updatePlanning({ status: 'done' })
    // 需求理解暂停等待确认：不关闭思考弹窗、不追加 Feedback 块，等待用户确认后重新发起
    if (ctx.payload.paused) {
      textBlockId = null
      return
    }
    // done 事件 → 自动关闭思考弹窗（满足最短展示 5 秒后关闭）
    ui.requestAutoCloseThinkingModal()
    const feedbackBlock: Block = {
      id: `block-fb-${Date.now()}`,
      msgId: ctx.botMsgId,
      role: 'assistant',
      type: 'Feedback',
      traceId: String(ctx.payload.trace_id || currentTraceId || ''),
      workId: String(ctx.payload.work_id || chat.currentWorkId || ''),
      sessionId: String(chat.currentSessionId || ''),
      meta: { status: 'done', createdAt: ctx.serverTime, updatedAt: ctx.serverTime },
    } as Block
    chat.addBlock(feedbackBlock)
    chat.setCurrentWorkId(null)
    textBlockId = null
  }

  /** 单个 Agent 执行失败（ERROR → 红色），并记录错误信息 */
  function onAgentError(ctx: StreamEventCtx) {
    const { payload } = ctx
    ui.setAgentStatus(ctx.agentId, 'ERROR', undefined, ctx.taskId)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    if (typeof payload.error_message === 'string' && payload.error_message) {
      thinkBlock.output = { error: payload.error_message } as string | Record<string, unknown>
    }
    if (payload.input) thinkBlock.input = payload.input as string | Record<string, unknown>
    if (typeof payload.elapsed_ms === 'number') thinkBlock.durationMs = payload.elapsed_ms
    chat.updateBlock(thinkBlock.id, {
      output: thinkBlock.output,
      input: thinkBlock.input,
      durationMs: thinkBlock.durationMs,
      meta: { ...thinkBlock.meta, status: 'done' },
    })
  }

  /** 整体执行失败：标记当前 Agent（无具体 Agent 时标记所有进行中的）为 ERROR，并追加错误块 */
  function onError(ctx: StreamEventCtx) {
    const { payload } = ctx
    if (ctx.agentId) {
      ui.setAgentStatus(ctx.agentId, 'ERROR')
    } else {
      for (const [aid, info] of Object.entries(ui.agentExecutions)) {
        if (info.status === 'RUNNING' || info.status === 'PENDING') {
          ui.setAgentStatus(aid, 'ERROR')
        }
      }
    }
    const errBlock: Block = {
      id: `block-err-${Date.now()}`,
      msgId: ctx.botMsgId,
      role: 'system',
      type: 'ErrorFallback',
      message: String(payload.error_message || '未知错误'),
      errorCode: String(payload.error_code || ''),
      retryAvailable: false,
      traceId: String(payload.trace_id || currentTraceId || ''),
      meta: { status: 'error', createdAt: ctx.serverTime, updatedAt: ctx.serverTime },
    } as Block
    chat.addBlock(errBlock)
    ui.requestAutoCloseThinkingModal()
  }

  /** 事件分发表：agent_thinking/thinking、agent_action/agent_status、text_chunk/text 为同义别名 */
  const handlers: Record<string, (ctx: StreamEventCtx) => void> = {
    connected: onConnected,
    loading: (ctx) => {
      const wid = String(ctx.payload.work_id || '')
      if (wid) chat.setCurrentWorkId(wid)
    },
    context_built: onContextBuilt,
    intent_agent_result: onIntentAgentResult,
    intent_confirmation_required: onIntentConfirmationRequired,
    clarification_required: onClarificationRequired,
    plan_created: onPlanCreated,
    agent_dag_created: onAgentDagCreated,
    dag_node_start: onDagNodeStart,
    dag_node_end: onDagNodeEnd,
    agent_building: onAgentBuilding,
    agent_built: onAgentBuilt,
    agent_matched: onAgentMatched,
    agent_thinking: onAgentThinking,
    thinking: onAgentThinking,
    agent_action: onAgentAction,
    agent_status: onAgentAction,
    agent_reflection: onAgentReflection,
    agent_output: onAgentOutput,
    text_chunk: onTextChunk,
    text: onTextChunk,
    citation: onCitation,
    done: onDone,
    agent_error: onAgentError,
    error: onError,
  }

  return {
    handle(data, botMsgId) {
      // 兼容两种帧结构：结构化帧（BrianSSEMessage：msg_id/event/data/timestamp/agent_id/task_id）
      // 与平铺帧（event 与业务字段同层）
      const isStructured = 'msg_id' in data && 'event' in data
      const event = String(isStructured ? data.event : (data.event || 'message'))
      const payload = (isStructured ? (data.data as Record<string, unknown> ?? {}) : data) as Record<string, unknown>
      const serverTime = Number(isStructured ? (data.timestamp || Date.now()) : Date.now())
      const agentId = String(isStructured ? (data.agent_id || '') : (payload.agent_id || ''))
      const taskId = String(isStructured ? (data.task_id || '') : (payload.task_id || ''))
      handlers[event]?.({ chat, ui, botMsgId, payload, serverTime, agentId, taskId })
    },
    reset(clearTrace = false) {
      textBlockId = null
      if (clearTrace) {
        currentTraceId = ''
        chat.setCurrentWorkId(null)
      }
    },
  }
}
