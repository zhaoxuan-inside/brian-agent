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

// ===== 原始方法（保留作为参考）：formatAgentTitle =====
// function formatAgentTitle(rawName?: string, agId?: string, agType?: string): string {
//   if (rawName && !UUID_RE.test(rawName) && rawName !== agId) {
//     return rawName
//   }
//   const typeUpper = (agType || '').toUpperCase()
//   if (typeUpper === 'PLANNER') return '规划 Agent (Planner)'
//   if (typeUpper === 'WRITER') return '表达 Agent (Writer)'
//   if (typeUpper === 'EVOLUTOR') return '进化 Agent (Evolutor)'
//   return '执行 Agent'
// }

// ===== 修改后的方法（2026-09-13）：仅纯 UUID 视为无名称，真实名称或有意义的 ID 均完整展示 =====
/** Agent 名称展示格式化：仅纯 uuid 视为"无名称"，按类型给默认标题 */
function formatAgentTitle(rawName?: string, agId?: string, agType?: string): string {
  if (rawName && !UUID_RE.test(rawName)) {
    return rawName
  }
  if (agId && !UUID_RE.test(agId)) {
    return agId
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

/**
 * 后端 tool.* 事件载荷归一化（数据处理；纯函数）：
 * 后端实际下发 {part_id, tool_id, input}（input 多为 JSON 字符串），旧前端只认
 * {tool_name/tool_type/params}。归一后三端统一：toolName / params 对象 / partId 关联键。
 */
function normalizeToolPayload(payload: Record<string, unknown>): {
  toolName: string
  params: Record<string, unknown>
  partId: string
} {
  const toolName = String(
    payload.tool_name ?? payload.tool_type ?? payload.tool_id ?? payload.action ?? 'Tool',
  )
  const raw = payload.params ?? payload.input ?? payload.arguments
  let params: Record<string, unknown> = {}
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw)
      params = (parsed && typeof parsed === 'object' ? parsed : { _raw: raw }) as Record<string, unknown>
    } catch {
      params = { _raw: raw }
    }
  } else if (raw && typeof raw === 'object') {
    params = raw as Record<string, unknown>
  }
  const partId = typeof payload.part_id === 'string' ? payload.part_id : ''
  return { toolName, params, partId }
}

// ============================================================
// 事件处理工厂（持有轮内状态：流式文本块指针 / trace_id 回退值）
// ============================================================

export function createChatStreamEventHandler(chat: ChatStore, ui: ChatUiStore): ChatStreamEventHandler {
  // 当前流式文本块 id：一轮回复只在首个文本帧创建一次 TextParagraph，后续帧追加
  let textBlockId: string | null = null
  // 后端经 ToolProvider 生成的 trace_id 由 connected 事件回传，供 Feedback/Error 块缺省引用
  let currentTraceId = ''

  // ===== 修改后的方法（2026-09-13）：复用并升级轮次思考块，避免意图/选定阶段创建多个割裂块 =====
  /** 快捷辅助：获取或创建某 Agent 的 ThinkingBlock（同轮次优先复用未绑定块，回填非 uuid 真实名称） */
  function getOrCreateThinkBlock(ctx: StreamEventCtx, agId: string, defaultName?: string, defaultType?: string): ThinkingBlock {
    const key = agId ? `block-think-${ctx.botMsgId}-${agId}` : `block-think-${ctx.botMsgId}`
    let existing = ctx.chat.blocks.find(b => b.id === key) as ThinkingBlock | undefined
    if (!existing) {
      // 优先复用当前消息已有的思考块（如 intent.analyzed 早期创建的单思考块）
      const sameMsgBlocks = ctx.chat.blocks.filter(
        b => b.msgId === ctx.botMsgId && b.type === 'ThinkingChain',
      ) as ThinkingBlock[]
      if (sameMsgBlocks.length === 1) {
        existing = sameMsgBlocks[0]
      } else if (agId) {
        existing = sameMsgBlocks.find(b => !b.agentInfo?.id || b.agentInfo.id === agId)
      }
    }
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
    } else {
      const patch: Partial<ThinkingBlock> = {}
      if (defaultName && !UUID_RE.test(defaultName)) {
        if (!existing.agentInfo) {
          existing.agentInfo = { id: agId || '', name: formattedName, type: defaultType || 'WORKER' }
        } else {
          existing.agentInfo.name = formattedName
          if (agId) existing.agentInfo.id = agId
          if (defaultType) existing.agentInfo.type = defaultType
        }
        patch.agentInfo = existing.agentInfo
      } else if (agId && (!existing.agentInfo?.id || existing.agentInfo.id === '')) {
        if (!existing.agentInfo) {
          existing.agentInfo = { id: agId, name: formattedName, type: defaultType || 'WORKER' }
        } else {
          existing.agentInfo.id = agId
        }
        patch.agentInfo = existing.agentInfo
      }
      if (Object.keys(patch).length > 0) {
        chat.updateBlock(existing.id, patch)
      }
    }
    return existing
  }

  /** 自动弹出思考弹窗时定位动画原点：取最近一条用户消息对应的"思考过程"按钮 */
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

  /** 问答任务进行中自动弹出思考过程：定位动画原点后以实时模式打开，已打开时为幂等 */
  function ensureLiveThinkingOpen() {
    if (ui.thinkingModalVisible) return
    resolveAutoThinkingOrigin()
    ui.ensureLiveThinking()
  }

  function hasPendingPermission(): boolean {
    return chat.messages.some((m) => m.permission?.status === 'pending')
  }

  /** 任务结束时尝试自动关闭：仍有待授权则保持打开，等待用户在弹窗内完成授权 */
  function tryAutoCloseThinking() {
    if (hasPendingPermission()) return
    ui.requestAutoCloseThinkingModal()
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

  /** Agent 思考推理中：追加/续写 THINK 步骤 */
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

    const charCount = (thinkBlock.content || '').length
    const agTitle = rawAgName || (thinkBlock.agentInfo?.name && thinkBlock.agentInfo.name !== '执行 Agent' ? thinkBlock.agentInfo.name : '')
    ui.updateOrPushLiveTimelineItem('think.live', {
      seq: 5,
      ts: ctx.serverTime,
      event: 'think.live',
      title: charCount > 0 ? `Agent 深度推理思考（${charCount} 字）` : 'Agent 深度推理思考中…',
      detail: agTitle ? `Agent：${agTitle}` : '推理见「深度思考」卡片',
      kind: 'think',
      target: 'agent-0',
    })
  }

  /** Agent 工具调用：追加 ACT 步骤，并为真实外部工具生成独立 ToolInvocation 块（过滤 NONE 占位） */
  function onAgentAction(ctx: StreamEventCtx) {
    const { payload } = ctx
    ui.setAgentStatus(ctx.agentId, 'RUNNING', undefined, ctx.taskId)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    if (!thinkBlock.steps) thinkBlock.steps = []

    // ===== 修改后的方法（2026-09-12）：后端 tool.started/tool.launch 载荷归一化 =====
    // 原实现只读 payload.tool_name/tool_type/tool_id/params，而后端实际下发
    // {part_id, tool_id, input}（AgentLoopService.markPartRunning），input 为 JSON 字符串；
    // 字段对不上 → 工具块恒为 toolName='Tool'、params={} 的空盒，且 result 从未回填。
    // 现归一化：tool_id→toolName；input/params/arguments（对象或 JSON 串）→params；
    // part_id→块 id，保证 started/launch/result 命中同一块、可更新不重复。
    const { toolName, params, partId } = normalizeToolPayload(payload)
    const iterIdx = typeof payload.iteration === 'number' ? payload.iteration : undefined

    if (toolName === 'NONE') return
    thinkBlock.steps.push({
      phase: 'ACT',
      iteration: iterIdx ?? (thinkBlock.steps.length + 1),
      toolCalls: [{ toolName, toolType: String(payload.tool_type || toolName), params, result: payload.result }],
    })
    chat.updateBlock(thinkBlock.id, { steps: thinkBlock.steps })

    const toolBlockId = partId ? `block-tool-${ctx.botMsgId}-${partId}` : `block-tool-${Date.now()}`
    const existed = chat.blocks.find(b => b.id === toolBlockId)
    if (existed) {
      chat.updateBlock(toolBlockId, {
        toolName,
        params,
        result: payload.result ?? (existed as { result?: unknown }).result,
        meta: { ...existed.meta, status: 'streaming', updatedAt: ctx.serverTime },
      })
      return
    }
    const toolBlock: Block = {
      id: toolBlockId,
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

  /**
   * ===== 修改后的方法（2026-09-12）：tool.result 不再写入用户可见文本块 =====
   * 原实现把工具输出 appendAssistantChunk 追加进用户可见 TextParagraph，与随后的
   * reply.delta 最终回复同块拼接 → 一次提问在同一个气泡里出现"工具结果 + 最终回复"
   * 两段回答（interact 307bee46 复盘）。现改为：Agent 输出只回填思考块，用户可见
   * 最终回复仅由 reply.delta / text_chunk 提供。
   */
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
    // ===== 原始代码（保留作为参考）：工具输出曾直接流入用户可见文本块，造成"一次提问两个回答" =====
    // appendAssistantChunk(ctx, typeof outputVal === 'string' ? outputVal : String(outputVal || ''))
    // 修改后：用户可见最终回复仅由 reply.delta / text_chunk 提供，工具输出只进思考块。
  }

  // ===== 修改后（2026-09-14）：实时时间线环节耗时直读事件 payload 自带的 elapsed_ms
  // （后端在真实执行点测量并随事件下发，实时/历史口径一致）；无计时的事件不伪造耗时 =====
  function stampedElapsed(payload: Record<string, unknown>): number | undefined {
    const v = Number(payload.elapsed_ms)
    return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined
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
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
    ui.pushLiveTimelineItem({
      seq: 4,
      ts: ctx.serverTime,
      event: 'context.built',
      title: `构建上下文：第 ${round} 轮 · ${count} 条消息`,
      detail: ctx.payload.system ? '含 system 提示词（模型输入侧）' : '',
      kind: 'context',
      target: `ctx-${round}`,
      elapsedMs: stampedElapsed(ctx.payload),
    })
    // 实时上下文轮次落库：与后端 trace.contextRounds 同构（round/targetKey/messageCount/messages），
    // 供思考面板「基础上下文」轮次卡片定位（data-anchor=ctx-N），否则时间线点击无跳转目标
    const msgs = Array.isArray(ctx.payload.messages)
      ? (ctx.payload.messages as Array<Record<string, unknown>>)
          .map((m) => ({ role: String(m.role ?? ''), content: String(m.content ?? '').slice(0, 2000) }))
          .filter((m) => m.role || m.content)
      : []
    ui.pushLiveContextRound({
      round,
      targetKey: `ctx-${round}`,
      messageCount: count,
      messages: msgs,
    })
  }

  /** agent.selected：Agent 选择完成 → 思考面板标注命中信息 */
  function onAgentSelected(ctx: StreamEventCtx) {
    const name = String(ctx.payload.agent_name || 'agent')
    const matchedBy = String(ctx.payload.matched_by || '')
    ui.setAgentStatus(ctx.agentId || name, 'RUNNING', name)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId || name, name)
    thinkBlock.content += `[Agent 匹配] ${name}（${matchedBy}）\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
    ui.pushLiveTimelineItem({
      seq: 2,
      ts: ctx.serverTime,
      event: 'agent.selected',
      title: `选中 Agent：${name}`,
      detail: matchedBy ? `匹配方式：${matchedBy}` : '',
      kind: 'agent',
      target: 'agent-0',
      elapsedMs: stampedElapsed(ctx.payload),
    })
  }

  /** agent.components：组件选定清单 → 思考面板友好展示（Soul/Skill/MCP/Prompt/LLM 展示名称、悬浮可见 ID） */
  function onAgentComponents(ctx: StreamEventCtx) {
    const soulId = String(ctx.payload.soul_id || '')
    const soulDisp = String(ctx.payload.soul_name || '') || soulId
    const promptId = String(ctx.payload.prompt_template_id || '')
    const promptDisp = String(ctx.payload.prompt_name || '') || promptId
    const llmId = String(ctx.payload.llm_id || '')
    const llmDisp = String(ctx.payload.llm_name || '') || llmId
    const lines: string[] = ['[组件选定]']
    if (soulId) lines.push(`· Soul: ${soulDisp}`)
    const skills = Array.isArray(ctx.payload.skills) ? ctx.payload.skills as Array<{ id?: string; brief?: string }> : []
    for (const s of skills) {
      const id = String(s.id || '')
      const disp = String(s.brief || '') || id
      lines.push(`· Skill: ${disp}`)
    }
    const mcps = Array.isArray(ctx.payload.mcps) ? ctx.payload.mcps as Array<{ id?: string; brief?: string }> : []
    for (const mcp of mcps) {
      const id = String(mcp.id || '')
      const disp = String(mcp.brief || '') || id
      lines.push(`· MCP: ${disp}`)
    }
    if (promptId) lines.push(`· Prompt: ${promptDisp}`)
    if (llmId) lines.push(`· LLM: ${llmDisp}`)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += lines.join('\n') + '\n'
    // 组件信息同步进思考块 agentInfo（深度思考「构建组件」胶囊实时可见：名称显示、ID 悬浮、点击查详情）
    const compInfo: NonNullable<ThinkingBlock['agentInfo']> = { ...(thinkBlock.agentInfo ?? { name: '' }) }
    if (soulId) compInfo.soul = { id: soulId, name: soulDisp }
    if (promptId) compInfo.prompt = { id: promptId, name: promptDisp }
    if (llmId) compInfo.llm = { id: llmId, name: llmDisp }
    compInfo.skills = skills.map((s) => { const id = String(s.id || ''); return { id, name: String(s.brief || '') || id } }).filter((x) => x.id || x.name)
    compInfo.mcps = mcps.map((m) => { const id = String(m.id || ''); return { id, name: String(m.brief || '') || id } }).filter((x) => x.id || x.name)
    thinkBlock.agentInfo = compInfo
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content, agentInfo: thinkBlock.agentInfo })

    const bits: string[] = []
    if (soulId) bits.push(`Soul ${soulDisp}`)
    if (skills.length) bits.push(`Skill×${skills.length}`)
    if (mcps.length) bits.push(`MCP×${mcps.length}`)
    if (llmId) bits.push(`LLM ${llmDisp}`)
    if (promptId) bits.push(`Prompt ${promptDisp}`)
    const tooltipBits: string[] = []
    if (soulId) tooltipBits.push(`Soul: ${soulId}`)
    if (promptId) tooltipBits.push(`Prompt: ${promptId}`)
    if (llmId) tooltipBits.push(`LLM: ${llmId}`)
    if (skills.length) tooltipBits.push(`Skill: ${skills.map((s) => String(s.id || '')).filter(Boolean).join(', ')}`)
    if (mcps.length) tooltipBits.push(`MCP: ${mcps.map((m) => String(m.id || '')).filter(Boolean).join(', ')}`)
    ui.pushLiveTimelineItem({
      seq: 3,
      ts: ctx.serverTime,
      event: 'agent.components',
      title: '组件装配完成',
      detail: bits.join(' · ') || '无 Soul/Prompt/LLM/Skill/MCP 显式绑定',
      tooltip: tooltipBits.join('\n') || undefined,
      kind: 'agent',
      target: 'agent-0',
      elapsedMs: stampedElapsed(ctx.payload),
    })
  }

  /** intent.analyzed：意图识别结果 → 思考面板（命中 Agent 展示名称，ID 悬浮可见） */
  function onIntentAnalyzed(ctx: StreamEventCtx) {
    const score = Number(ctx.payload.score ?? 0)
    const reason = String(ctx.payload.reason || '')
    const agentId = String(ctx.payload.agent_id || '')
    const agentDisp = String(ctx.payload.agent_name || '') || agentId
    const adopted = Boolean(ctx.payload.adopted)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[意图分析] 打分 ${score}（${adopted ? '采纳' : '未达阈值'}）${agentDisp ? ' → ' + agentDisp : ''}\n`
    if (reason) thinkBlock.content += `· ${reason}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
    ui.pushLiveTimelineItem({
      seq: 1,
      ts: ctx.serverTime,
      event: 'intent.analyzed',
      title: `需求确认 / 意图分析：打分 ${score}（${adopted ? '采纳' : '未达阈值'}）`,
      detail: reason ? reason.slice(0, 200) : (agentDisp ? `目标 Agent: ${agentDisp}` : ''),
      tooltip: agentId || undefined,
      kind: 'intent',
      target: 'agent-0',
      elapsedMs: stampedElapsed(ctx.payload),
    })
  }

  /** agent.built：Agent 构建完成 → 思考面板 */
  function onAgentBuilt(ctx: StreamEventCtx) {
    const name = String(ctx.payload.name || ctx.payload.agent_id || 'agent')
    const purpose = String(ctx.payload.purpose || '')
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[Agent 构建] ${name}${purpose ? ' — ' + purpose : ''}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
    ui.pushLiveTimelineItem({
      seq: 2,
      ts: ctx.serverTime,
      event: 'agent.built',
      title: `构建 Agent：${name}`,
      detail: purpose,
      kind: 'agent',
      target: 'agent-0',
      elapsedMs: stampedElapsed(ctx.payload),
    })
  }

  /** llm.selected：LLM 选定 → 思考面板（展示模型名称，ID 保留于内容） */
  function onLlmSelected(ctx: StreamEventCtx) {
    const llmId = String(ctx.payload.llm_id || '')
    if (!llmId) return
    const name = String(ctx.payload.llm_name || '') || llmId
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[LLM 选定] ${name}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
  }

  /** prompt.selected：Prompt 选定（模板渲染出 system prompt）→ 思考面板（展示模板名称） */
  function onPromptSelected(ctx: StreamEventCtx) {
    const templateId = String(ctx.payload.template_id || 'builtin.identity')
    const name = String(ctx.payload.prompt_name || '') || templateId
    const system = String(ctx.payload.system || '')
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[Prompt 选定] ${name}\n`
    if (system) thinkBlock.prompt = system
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content, prompt: thinkBlock.prompt })
  }

  /** skill.selected：Skill 选定 → 思考面板（展示技能名称） */
  function onSkillSelected(ctx: StreamEventCtx) {
    const skills = Array.isArray(ctx.payload.skills) ? ctx.payload.skills as Array<{ id?: string; brief?: string }> : []
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[Skill 选定]${skills.length ? '' : '（无）'}\n`
    for (const s of skills) thinkBlock.content += `· ${String(s.brief || '') || String(s.id || '')}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
  }

  /** mcp.selected：MCP 选定 → 思考面板（展示 MCP 名称） */
  function onMcpSelected(ctx: StreamEventCtx) {
    const mcps = Array.isArray(ctx.payload.mcps) ? ctx.payload.mcps as Array<{ id?: string; brief?: string }> : []
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[MCP 选定]${mcps.length ? '' : '（无）'}\n`
    for (const m of mcps) thinkBlock.content += `· ${String(m.brief || '') || String(m.id || '')}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
  }

  // ===== 新增（2026-09-19）：构建阶段 Soul 选定/生成体现（组件装配明细见 agent.components） =====
  function onSoulSelected(ctx: StreamEventCtx) {
    const soulId = String(ctx.payload.soul_id || '')
    const brief = String(ctx.payload.brief || '') || soulId
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[Soul 选定] ${soulId ? brief : '（未绑定）'}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
    ui.pushLiveTimelineItem({
      seq: 3,
      ts: ctx.serverTime,
      event: 'soul.selected',
      title: soulId ? `Soul 选定：${brief}` : 'Soul 未绑定',
      kind: 'agent',
      target: 'agent-0',
    })
  }

  // ===== 新增（2026-09-19）：思维模型选定（CoT/ReAct）→ 时间线与思考面板 =====
  function onThoughtSelected(ctx: StreamEventCtx) {
    const mode = String(ctx.payload.thought_mode || 'CoT')
    const reason = String(ctx.payload.reason || '')
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[思维模型] ${mode}${reason ? `：${reason}` : ''}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
    ui.pushLiveTimelineItem({
      seq: 3,
      ts: ctx.serverTime,
      event: 'thought.selected',
      title: `选定思维模型：${mode}`,
      detail: reason,
      kind: 'think',
      target: 'agent-0',
    })
  }

  // ===== 新增（2026-09-19）：loop.turn.started：第 N 轮执行开始（体现思维模型） =====
  function onLoopTurnStarted(ctx: StreamEventCtx) {
    const round = Number(ctx.payload.round || 1)
    const mode = String(ctx.payload.thought_mode || '')
    ui.pushLiveTimelineItem({
      seq: 5,
      ts: ctx.serverTime,
      event: 'loop.turn.started',
      title: `第 ${round} 轮 Agent 执行开始`,
      detail: mode ? `思维模型：${mode}${ctx.payload.final_turn ? '（收尾轮）' : ''}` : '',
      kind: 'think',
      target: `agent-0`,
    })
  }

  // ===== 新增（2026-09-19）：loop.turn.result：本轮执行结果 + 是否继续执行的决策 =====
  function onLoopTurnResult(ctx: StreamEventCtx) {
    const round = Number(ctx.payload.round || 1)
    const nextAction = String(ctx.payload.next_action || 'stop')
    const reason = String(ctx.payload.decision_reason || '')
    const toolCalls = Array.isArray(ctx.payload.tool_calls) ? (ctx.payload.tool_calls as unknown[]).map(String) : []
    const preview = String(ctx.payload.result_preview || '')
    const titleMap: Record<string, string> = { continue: '继续执行', stop: '执行收敛', error: '执行失败', budget: '预算耗尽' }
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[第 ${round} 轮结果] finish_reason=${ctx.payload.finish_reason || 'none'}`
      + `${toolCalls.length ? `（工具：${toolCalls.join('、')}）` : ''}`
      + `${preview ? `\n产出：${preview.slice(0, 200)}` : ''}`
      + `\n[继续执行] ${titleMap[nextAction] ?? nextAction}${reason ? `：${reason}` : ''}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
    ui.pushLiveTimelineItem({
      seq: 5,
      ts: ctx.serverTime,
      event: 'loop.turn.result',
      title: `第 ${round} 轮完成：${titleMap[nextAction] ?? nextAction}`,
      detail: reason || (preview ? preview.slice(0, 80) : ''),
      kind: nextAction === 'error' ? 'lifecycle-fail' : nextAction === 'continue' ? 'think' : 'lifecycle-ok',
      target: 'agent-0',
    })
  }

  /** evaluation.completed：Evolutor 评估结论 → 思考面板 */
  function onEvaluationCompleted(ctx: StreamEventCtx) {
    const evalType = String(ctx.payload.eval_type || '')
    const scores = (ctx.payload.scores && typeof ctx.payload.scores === 'object') ? ctx.payload.scores as Record<string, unknown> : {}
    const overall = Number(scores.overall ?? 0)
    const suggestions = Array.isArray(ctx.payload.suggestions) ? (ctx.payload.suggestions as unknown[]).map(String) : []
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[评估] ${evalType} overall=${overall}${ctx.payload.need_optimize ? '（需优化）' : ''}\n`
    for (const s of suggestions) thinkBlock.content += `· ${s}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
    ui.pushLiveTimelineItem({
      seq: 8,
      ts: ctx.serverTime,
      event: 'evaluation.completed',
      title: `评估完成：overall=${overall}${ctx.payload.need_optimize ? '（需优化）' : ''}`,
      detail: evalType,
      kind: 'eval',
      target: 'agent-0',
      elapsedMs: stampedElapsed(ctx.payload),
    })
  }

  /** writer.completed：表达/排版 Agent 完成 → 记录时间线 */
  function onWriterCompleted(ctx: StreamEventCtx) {
    const fmt = String(ctx.payload.format || 'MARKDOWN')
    const len = Number(ctx.payload.length || 0)
    ui.pushLiveTimelineItem({
      seq: 9,
      ts: ctx.serverTime,
      event: 'writer.completed',
      title: `写作排版：${fmt}`,
      detail: `字数：${len}`,
      kind: 'writer',
      target: 'agent-0',
      elapsedMs: stampedElapsed(ctx.payload),
    })
  }

  /** tool.started：工具开始执行 → 动作轨迹（载荷 {part_id, tool_id, input}，归一化后建块） */
  function onToolStarted(ctx: StreamEventCtx) {
    onAgentAction(ctx)
    const { toolName, params, partId } = normalizeToolPayload(ctx.payload)
    ui.pushLiveTimelineItem({
      seq: 6,
      ts: ctx.serverTime,
      event: 'tool.started',
      title: `调用工具：${toolName}`,
      detail: JSON.stringify(params).slice(0, 200),
      kind: 'tool',
      target: partId ? `tool-${partId}` : 'agent-0',
    })
  }

  /** tool.launch（v2 协议）→ 动作轨迹（同 started；同 part_id 命中同一块做更新，不重复建块） */
  function onToolLaunch(ctx: StreamEventCtx) {
    onAgentAction(ctx)
  }

  // ===== 修改后的方法（2026-09-12）：tool.result 回填 ToolInvocation 块 =====
  // 原实现只调 onAgentOutput（自 09-12 起仅回填思考块）→ 工具块 result 恒空、状态恒 streaming。
  // 现按 part_id 定位同一块回填 result 并收敛状态；思考块回填保留（onAgentOutput）。
  /** tool.result（v2 协议）→ 输出面板（工具块回填 + 思考块回填） */
  function onToolResult(ctx: StreamEventCtx) {
    const { toolName, partId } = normalizeToolPayload(ctx.payload)
    if (partId) {
      const toolBlockId = `block-tool-${ctx.botMsgId}-${partId}`
      const existed = ctx.chat.blocks.find(b => b.id === toolBlockId)
      if (existed) {
        const done = ctx.payload.status === 'ok'
        ctx.chat.updateBlock(toolBlockId, {
          result: ctx.payload.output,
          meta: { ...existed.meta, status: done ? 'done' : 'error', updatedAt: ctx.serverTime },
        })
      }
    }
    const isOk = ctx.payload.status === 'ok'
    ui.pushLiveTimelineItem({
      seq: 7,
      ts: ctx.serverTime,
      event: 'tool.result',
      title: `工具返回：${toolName}（${isOk ? 'ok' : 'error'}）`,
      detail: String(ctx.payload.output || '').slice(0, 200),
      kind: isOk ? 'tool-ok' : 'tool-fail',
      target: partId ? `tool-${partId}` : 'agent-0',
    })
    onAgentOutput({ ...ctx, payload: { output: ctx.payload.output, status: isOk ? 'done' : 'error' } })
  }

  /** plan.updated：过程性计划 → 规划面板 */
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

  // ===== 原始方法（保留作为参考）=====
  // /** permission.asked（v2 协议）：复用需求理解确认弹窗（IntentConfirmCard）展示权限询问 */
  // function onPermissionAsked(ctx: StreamEventCtx) {
  //   ui.setIntentConfirmation({
  //     session_id: String(ctx.payload.session_key ?? ''),
  //     original_query: String(ctx.payload.tool_id ?? 'tool'),
  //     understood_requirement: '允许执行工具 ' + String(ctx.payload.tool_id ?? '') + ' ？',
  //     reasoning: '该工具需要你的授权后才能执行',
  //     kind: 'permission',
  //     permission_id: String(ctx.payload.permission_id ?? ''),
  //     tool_id: String(ctx.payload.tool_id ?? ''),
  //   })
  // }

  // ===== 修改后的方法（2026-09-11）：权限卡独立组件，直接插入对话区消息时间线 =====
  // 事故复盘（interact 2109c9a5）：复用 IntentConfirmCard 导致"按原文执行"按钮被映射为拒绝
  // （answerPermission(approved = action === 'APPROVE')），用户想授权反而拒绝。
  // 现改为：permission.asked 在对话区插入独立 PermissionConfirmCard（允许/拒绝双按钮），
  // 同一记录由后端落库（info_raw: PERMISSION），历史回放同款卡片；ChatMap 因
  // buildMessageGraph 仅收 REQUEST/RESPONSE 天然不展示。卡 id 用许可 id 保证幂等。
  /** permission.asked：授权确认统一在思考过程弹窗内完成，对话区不再展示 */
  function onPermissionAsked(ctx: StreamEventCtx) {
    const permissionId = String(ctx.payload.permission_id ?? '')
    if (!permissionId) return
    const msgId = `perm-${permissionId}`
    if (ctx.chat.messages.some(m => m.id === msgId)) {
      ensureLiveThinkingOpen()
      return
    }
    ctx.chat.addMessage({
      id: msgId,
      role: 'assistant',
      content: '',
      timestamp: ctx.serverTime,
      permission: {
        permissionId,
        toolId: String(ctx.payload.tool_id ?? 'tool'),
        input: ctx.payload.input ?? {},
        status: 'pending',
        askedAt: ctx.serverTime,
        runId: String(ctx.payload.run_id ?? ''),
      },
    })
    // 有新的授权请求时确保思考过程已弹出，方便用户直接在弹窗内完成授权
    ensureLiveThinkingOpen()
  }

  // ===== 新增的方法（2026-09-12）：permission.answered 回执翻卡 =====
  // 后端 askPermission 应答后必下发 answered（含信任表自动放行 auto_approved）；
  // 自动放行无用户点击，卡片靠此事件由 pending 翻为 allowed/denied，避免悬挂。
  // 手动应答本地已即时翻卡，此处幂等（仅 pending 卡才更新）。
  /** permission.answered：权限应答回执 → 更新对话区权限卡状态 */
  function onPermissionAnswered(ctx: StreamEventCtx) {
    const permissionId = String(ctx.payload.permission_id ?? '')
    if (!permissionId) return
    const msgId = `perm-${permissionId}`
    const msg = ctx.chat.messages.find(m => m.id === msgId)
    if (!msg?.permission || msg.permission.status !== 'pending') return
    ctx.chat.updateMessage(msgId, {
      permission: {
        ...msg.permission,
        status: ctx.payload.approved === false ? 'denied' : 'allowed',
        answeredAt: ctx.serverTime,
      },
    })
  }

  /** run.finished：正常收敛 → 收尾 */
  function onRunFinished(ctx: StreamEventCtx) {
    ui.setRunActive(false)
    chat.finalizeBlocks(ctx.botMsgId)
    ui.updatePlanning({ status: 'done' })
    ui.pushLiveTimelineItem({
      seq: 10,
      ts: ctx.serverTime,
      event: 'run.finished',
      title: '执行完成',
      detail: String(ctx.payload.stop_reason || 'stop'),
      kind: 'lifecycle-ok',
    })
    tryAutoCloseThinking()
    textBlockId = null
  }

  /** run.failed：异常/取消收敛 → 错误块 */
  function onRunFailed(ctx: StreamEventCtx) {
    ui.setRunActive(false)
    ui.pushLiveTimelineItem({
      seq: 10,
      ts: ctx.serverTime,
      event: 'run.failed',
      title: '执行失败',
      detail: String(ctx.payload.stop_reason || ctx.payload.error || 'run failed'),
      kind: 'lifecycle-fail',
    })
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
    // done 事件 → 自动关闭思考弹窗（有待授权时保持打开）
    tryAutoCloseThinking()
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
    tryAutoCloseThinking()
  }

  // ===== 修改后（2026-09-14）：run.started 直发不再复用受理分支 —— 此前 run.accepted 与 run.started
  // 都走 onRunStarted，实时时间线会推入两条「开始受理请求」节点；现在 run.started 推「开始执行」 =====
  function onRunAccepted(ctx: StreamEventCtx) {
    ui.setRunActive(true)
    ensureLiveThinkingOpen()
    ui.pushLiveTimelineItem({
      seq: 0,
      ts: ctx.serverTime,
      event: 'run.accepted',
      title: '开始受理请求',
      detail: ctx.payload.run_id ? `run ${String(ctx.payload.run_id).slice(0, 8)}` : '',
      kind: 'lifecycle',
    })
  }

  function onRunStartedEvent(ctx: StreamEventCtx) {
    ui.setRunActive(true)
    ensureLiveThinkingOpen()
    const agentLabel = String(ctx.payload.agent_name ?? ctx.payload.agent_id ?? '')
    ui.pushLiveTimelineItem({
      seq: 0,
      ts: ctx.serverTime,
      event: 'run.started',
      title: '开始执行',
      detail: agentLabel,
      kind: 'lifecycle',
    })
  }

  /** intent.started：意图打分 LLM 开始（实测 19s+）→ 时间线立刻推进到「意图分析中」 */
  function onIntentStarted(ctx: StreamEventCtx) {
    ui.pushLiveTimelineItem({
      seq: 1,
      ts: ctx.serverTime,
      event: 'intent.started',
      title: '需求确认 / 意图分析中…',
      detail: ctx.payload.candidates_count ? `候选 ${ctx.payload.candidates_count} 个 Agent` : '',
      kind: 'intent',
      target: 'agent-0',
    })
  }

  /** evaluation.started：评估 LLM 开始（实测 18s+）→ 时间线推进到「评估中」 */
  function onEvaluationStarted(ctx: StreamEventCtx) {
    ui.pushLiveTimelineItem({
      seq: 8,
      ts: ctx.serverTime,
      event: 'evaluation.started',
      title: '评估中…',
      kind: 'eval',
      target: 'agent-0',
    })
  }

  /** writer.started：写作 LLM 开始（实测 7s+）→ 时间线推进到「写作排版中」 */
  function onWriterStarted(ctx: StreamEventCtx) {
    ui.pushLiveTimelineItem({
      seq: 9,
      ts: ctx.serverTime,
      event: 'writer.started',
      title: '写作排版中…',
      kind: 'writer',
      target: 'agent-0',
    })
  }

  /** 事件分发表（键 = sseEventTypes 的线上事件全集；样式映射见 EVENT_UI_STYLE） */
  const handlers: Record<string, (ctx: StreamEventCtx) => void> = {
    [SseTransportEvent.Connected]: onConnected,
    [SseTransportEvent.Loading]: () => { /* 心跳占位帧 */ },
    [BusinessEvent.RunAccepted]: onRunAccepted,
    [BusinessEvent.RunStarted]: onRunStartedEvent,
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
    [BusinessEvent.PermissionAnswered]: onPermissionAnswered,
    [BusinessEvent.ContextBuilt]: onContextBuilt,
    [BusinessEvent.AgentSelected]: onAgentSelected,
    [BusinessEvent.AgentComponents]: onAgentComponents,
    [BusinessEvent.IntentAnalyzed]: onIntentAnalyzed,
    [BusinessEvent.IntentStarted]: onIntentStarted,
    [BusinessEvent.AgentBuilt]: onAgentBuilt,
    [BusinessEvent.LlmSelected]: onLlmSelected,
    [BusinessEvent.SoulSelected]: onSoulSelected,
    [BusinessEvent.ThoughtModeSelected]: onThoughtSelected,
    [BusinessEvent.PromptSelected]: onPromptSelected,
    [BusinessEvent.SkillSelected]: onSkillSelected,
    [BusinessEvent.McpSelected]: onMcpSelected,
    [BusinessEvent.EvaluationCompleted]: onEvaluationCompleted,
    [BusinessEvent.EvaluationStarted]: onEvaluationStarted,
    [BusinessEvent.WriterCompleted]: onWriterCompleted,
    [BusinessEvent.WriterStarted]: onWriterStarted,
    [BusinessEvent.ErrorOccurred]: onError,
    [BusinessEvent.MessageBlock]: () => { /* 阶段4 块流 */ },
    [BusinessEvent.LoopTurnStarted]: onLoopTurnStarted,
    [BusinessEvent.LoopTurnResult]: onLoopTurnResult,
    [BusinessEvent.LoopTurnCompleted]: () => { /* 轮耗时经历史 trace 聚合，实时不需要处理 */ },
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
      ui.resetLiveTimeline()
      if (clearTrace) currentTraceId = ''
    },
  }
}
