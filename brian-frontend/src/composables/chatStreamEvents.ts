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

import { BusinessEvent, SseTransportEvent, EVENT_UI_STYLE } from './sseEventTypes'

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



/**
 * Agent DAG 节点主键用 task_id（唯一），agent_id 仅作执行联动字段：
 * 同一 Agent 复用到多个任务时避免重复 key 导致的节点折叠与布局塌陷
 */


/** 后端节点状态串归一为运行时三态（完成/执行中/待执行） */

/** 按 (node_id, node_type) 定位并替换/追加编排执行步骤 */

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

  /** 需求理解 Agent (IntentAgent) 结果：填充思考块并标记该 Agent 成功 */

  /** 需求理解得分低于阈值：弹出「需求确认」卡片，由用户确认按理解执行 / 按原文执行 / 取消 */

  /** Planner 识别出需用户补充参数才能执行的任务：在对话区弹出「需求补充」卡片 */

  /** PlannerAgent 完成任务级拆解：记录 Task DAG 并更新弹窗 */

  /** 任务级拆解映射为 Agent DAG：记录 Agent 级 DAG，并初始化各节点执行运行时状态（未执行 → 灰色） */

  /** JSONNode 编排节点开始执行：追加 RUNNING 步骤 */

  /** JSONNode 编排节点执行结束：更新步骤状态与耗时 */

  /** Agent 构建开始：创建「构建中」占位卡片，按到达顺序展示构建进度 */

  /** Agent 构建完成：回填真实 agent 名称与组件绑定 */

  /** 复用既有 Agent：将「构建中」占位卡片收敛为「复用已有 Agent」 */

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
  /** reply.delta：回复正文增量 → 打字机追加 */
  function onReplyDelta(ctx: StreamEventCtx) {
    onTextChunk({ ...ctx, payload: { chunk: String(ctx.payload.delta || '') } })
  }

  /** think.delta：思考增量 → 思考面板追加 */
  function onThinkDelta(ctx: StreamEventCtx) {
    onAgentThinking({ ...ctx, payload: { chunk: String(ctx.payload.delta || '') } })
  }

  /** context.built：当轮上下文构建完成 → 思考面板插入轮次分隔线（含消息数） */
  function onContextBuilt(ctx: StreamEventCtx) {
    const round = Number(ctx.payload.round || 0)
    const count = Number(ctx.payload.message_count || 0)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `\n[—— 第 ${round} 轮 · 上下文 ${count} 条消息 ——]\n`
  }

  /** agent.selected：Agent 选择完成 → 思考面板标注命中信息 */
  function onAgentSelected(ctx: StreamEventCtx) {
    const name = String(ctx.payload.agent_name || 'agent')
    const matchedBy = String(ctx.payload.matched_by || '')
    ui.setAgentStatus(ctx.agentId || name, 'RUNNING', name)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId || name, name)
    thinkBlock.content += `[Agent 匹配] ${name}（${matchedBy}）\n`
  }

  /** agent.components：组件选定清单 → 思考面板友好展示（Soul/Skill/MCP/Prompt/LLM） */
  function onAgentComponents(ctx: StreamEventCtx) {
    const lines: string[] = ['[组件选定]']
    if (ctx.payload.soul_id) lines.push(`· Soul: ${ctx.payload.soul_id}`)
    const skills = Array.isArray(ctx.payload.skills) ? ctx.payload.skills as Array<{ id?: string; brief?: string }> : []
    for (const s of skills) lines.push(`· Skill: ${s.id}${s.brief ? ' — ' + s.brief : ''}`)
    const mcps = Array.isArray(ctx.payload.mcps) ? ctx.payload.mcps as Array<{ id?: string }> : []
    for (const mcp of mcps) lines.push(`· MCP: ${mcp.id}`)
    if (ctx.payload.prompt_template_id) lines.push(`· Prompt: ${ctx.payload.prompt_template_id}`)
    if (ctx.payload.llm_id) lines.push(`· LLM: ${ctx.payload.llm_id}`)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += lines.join('\n') + '\n'
  }

  /** tool.started：工具开始执行 → 动作轨迹 */
  function onToolStarted(ctx: StreamEventCtx) {
    onAgentAction({ ...ctx, payload: { action: ctx.payload.tool_id, input: ctx.payload.input } })
  }

  /** tool.launch（v2 协议）→ 动作轨迹 */
  function onToolLaunch(ctx: StreamEventCtx) {
    onAgentAction({ ...ctx, payload: { action: ctx.payload.tool_id, input: ctx.payload.input } })
  }

  /** tool.result（v2 协议）→ 输出面板 */
  function onToolResult(ctx: StreamEventCtx) {
    onAgentOutput({ ...ctx, payload: { output: ctx.payload.output, status: ctx.payload.status === 'ok' ? 'done' : 'error' } })
  }

  /** plan.updated（v2 协议）：过程性计划卡 → 规划面板 */
  function onPlanUpdated(ctx: StreamEventCtx) {
    const steps = Array.isArray(ctx.payload.steps) ? (ctx.payload.steps as Array<{ step: string; status: string }>) : []
    ui.updatePlanning({
      status: 'streaming',
      steps: steps.map((s, idx) => ({
        id: `plan-${idx}`,
        title: s.step,
        status: s.status === 'completed' ? 'done' : s.status === 'in_progress' ? 'running' : 'pending',
      })),
    } as never)
  }

  /** permission.asked（v2 协议）：权限确认卡（approve/deny → answerPermission 唤醒挂起的 Loop） */
  function onPermissionAsked(ctx: StreamEventCtx) {
    ui.setIntentConfirmation({
      session_id: String(ctx.payload.session_key ?? ''),
      original_query: String(ctx.payload.tool_id ?? 'tool'),
      understood_requirement: '允许执行工具 ' + String(ctx.payload.tool_id ?? '') + ' ？',
      reasoning: '该工具需要你的授权后才能执行',
      kind: 'permission',
      permission_id: String(ctx.payload.permission_id ?? ''),
      tool_id: String(ctx.payload.tool_id ?? ''),
    })
  }

  /** run.finished：正常收敛 → 收尾 */
  function onRunFinished(ctx: StreamEventCtx) {
    chat.finalizeBlocks(ctx.botMsgId)
    ui.updatePlanning({ status: 'done' })
    ui.requestAutoCloseThinkingModal()
    textBlockId = null
  }

  /** run.failed：异常/取消收敛 → 错误块 */
  function onRunFailed(ctx: StreamEventCtx) {
    onError({ ...ctx, payload: { error_message: String(ctx.payload.stop_reason || 'run failed'), error_code: 'RUN_FAILED' } })
  }

  function onTextChunk(ctx: StreamEventCtx) {
    const chunk = typeof ctx.payload === 'string' ? ctx.payload : String(ctx.payload.chunk || '')
    chat.finalizeThinkingBlocks(ctx.botMsgId)
    appendAssistantChunk(ctx, chunk)
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
      meta: { status: 'done', createdAt: ctx.serverTime, updatedAt: ctx.serverTime },
    } as Block
    chat.addBlock(feedbackBlock)
    textBlockId = null
  }

  /** 单个 Agent 执行失败（ERROR → 红色），并记录错误信息 */

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

  /** 事件分发表（键 = sseEventTypes 的线上事件全集；样式映射见 EVENT_UI_STYLE） */
  const handlers: Record<string, (ctx: StreamEventCtx) => void> = {
    [SseTransportEvent.Connected]: onConnected,
    [SseTransportEvent.Loading]: () => { /* 心跳占位帧 */ },
    [BusinessEvent.RunAccepted]: () => { /* 受理回执：run_id 已在 done 帧承载 */ },
    [BusinessEvent.RunStarted]: () => { /* 开始执行：思考面板即将输出 */ },
    [BusinessEvent.RunFinished]: onRunFinished,
    [BusinessEvent.RunFailed]: onRunFailed,
    [BusinessEvent.PartUpdated]: () => { /* 阶段4 预留 */ },
    [BusinessEvent.ReplyCreated]: () => { /* 块由 reply.delta 惰性创建 */ },
    [BusinessEvent.ReplyDelta]: onReplyDelta,
    [BusinessEvent.ThinkCreated]: () => { /* 块由 think.delta 惰性创建 */ },
    [BusinessEvent.ThinkDelta]: onThinkDelta,
    [BusinessEvent.ToolStarted]: onToolStarted,
    [BusinessEvent.ToolResult]: onToolResult,
    [BusinessEvent.PlanUpdated]: onPlanUpdated,
    [BusinessEvent.PermissionAsked]: onPermissionAsked,
    [BusinessEvent.PermissionAnswered]: () => { /* 应答回执：确认卡已在分流时关闭 */ },
    [BusinessEvent.ContextBuilt]: onContextBuilt,
    [BusinessEvent.AgentSelected]: onAgentSelected,
    [BusinessEvent.AgentComponents]: onAgentComponents,
    [BusinessEvent.ErrorOccurred]: onError,
    [BusinessEvent.MessageBlock]: () => { /* 阶段4 块流 */ },
    [SseTransportEvent.Done]: onDone,
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
      if (clearTrace) currentTraceId = ''
    },
  }
}
