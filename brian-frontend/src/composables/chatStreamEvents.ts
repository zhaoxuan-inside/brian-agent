import type { Block, TextBlock, ThinkingBlock } from '@/api/types'
import type { useSessionStore } from '@/stores/session'
import type { useChatUiStore } from '@/stores/chatUi'

type ChatStore = ReturnType<typeof useSessionStore>
type ChatUiStore = ReturnType<typeof useChatUiStore>

interface StreamEventCtx {
  chat: ChatStore
  ui: ChatUiStore
  botMsgId: string
  payload: Record<string, unknown>

  serverTime: number
  agentId: string
  taskId: string
}

export interface ChatStreamEventHandler {

  handle: (data: Record<string, unknown>, botMsgId: string) => void

  reset: (clearTrace?: boolean) => void
}

import { BusinessEvent, SseTransportEvent } from './sseEventTypes'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatAgentTitle(rawName?: string, agId?: string, agType?: string): string {
  if (rawName && !UUID_RE.test(rawName)) {
    return rawName
  }
  if (agId && !UUID_RE.test(agId)) {
    return agId
  }
  const typeUpper = (agType || '').toUpperCase()
  if (typeUpper === 'WRITER') return '表达 Agent (Writer)'
  if (typeUpper === 'EVOLUTOR') return '进化 Agent (Evolutor)'
  return '执行 Agent'
}

function normalizeToolPayload(payload: Record<string, unknown>): {
  toolName: string
  params: Record<string, unknown>
  partId: string
} {
  const toolName = String(
    payload.skill_id ?? payload.tool_name ?? payload.tool_type ?? payload.tool_id ?? payload.action ?? 'Skill',
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

export function createChatStreamEventHandler(chat: ChatStore, ui: ChatUiStore): ChatStreamEventHandler {

  let textBlockId: string | null = null

  let currentTraceId = ''

  function getOrCreateThinkBlock(ctx: StreamEventCtx, agId: string, defaultName?: string, defaultType?: string): ThinkingBlock {
    const key = agId ? `block-think-${ctx.botMsgId}-${agId}` : `block-think-${ctx.botMsgId}`
    let existing = ctx.chat.blocks.find(b => b.id === key) as ThinkingBlock | undefined
    if (!existing) {

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

  function ensureLiveThinkingOpen() {
    if (ui.thinkingModalVisible) return
    resolveAutoThinkingOrigin()
    ui.ensureLiveThinking()
  }

  function hasPendingPermission(): boolean {
    return chat.messages.some((m) => m.permission?.status === 'pending')
  }

  function tryAutoCloseThinking() {
    if (hasPendingPermission()) return
    ui.requestAutoCloseThinkingModal()
  }

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

  function onConnected(ctx: StreamEventCtx) {
    const tid = typeof ctx.payload.trace_id === 'string' && ctx.payload.trace_id ? ctx.payload.trace_id : ''
    if (tid) currentTraceId = tid
  }

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

  function onAgentAction(ctx: StreamEventCtx) {
    const { payload } = ctx
    ui.setAgentStatus(ctx.agentId, 'RUNNING', undefined, ctx.taskId)
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    if (!thinkBlock.steps) thinkBlock.steps = []

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

  }

  function stampedElapsed(payload: Record<string, unknown>): number | undefined {
    const v = Number(payload.elapsed_ms)
    return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined
  }

  function onReplyDelta(ctx: StreamEventCtx) {
    onTextChunk({ ...ctx, payload: { chunk: String(ctx.payload.delta || '') } })
  }

  function onThinkDelta(ctx: StreamEventCtx) {
    onAgentThinking({ ...ctx, payload: { chunk: String(ctx.payload.delta || '') } })
  }

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

  function onAgentComponents(ctx: StreamEventCtx) {
    const soulId = String(ctx.payload.soul_id || '')
    const soulDisp = String(ctx.payload.soul_name || '') || soulId
    const promptId = String(ctx.payload.prompt_template_id || '')
    const promptDisp = String(ctx.payload.prompt_name || '') || promptId
    const llmId = String(ctx.payload.llm_id || '')
    const llmDisp = String(ctx.payload.llm_name || '') || llmId
    const lines: string[] = ['[组件选定]']
    if (soulId) lines.push(`· Soul: ${soulDisp}`)
    const skills = Array.isArray(ctx.payload.skills) ? ctx.payload.skills as Array<{ id?: string; brief?: string; system?: boolean }> : []
    for (const s of skills) {
      const id = String(s.id || '')
      const disp = String(s.brief || '') || id
      lines.push(`· Skill${s.system ? '（系统级）' : ''}: ${disp}`)
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

  function onLlmSelected(ctx: StreamEventCtx) {
    const llmId = String(ctx.payload.llm_id || '')
    if (!llmId) return
    const name = String(ctx.payload.llm_name || '') || llmId
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[LLM 选定] ${name}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
  }

  function onPromptSelected(ctx: StreamEventCtx) {
    const templateId = String(ctx.payload.template_id || 'builtin.identity')
    const name = String(ctx.payload.prompt_name || '') || templateId
    const system = String(ctx.payload.system || '')
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[Prompt 选定] ${name}\n`
    if (system) thinkBlock.prompt = system
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content, prompt: thinkBlock.prompt })
  }

  function onSkillSelected(ctx: StreamEventCtx) {
    const skills = Array.isArray(ctx.payload.skills) ? ctx.payload.skills as Array<{ id?: string; brief?: string; system?: boolean }> : []
    const systemCount = skills.filter(s => s.system).length
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[Skill 选定]${skills.length ? ` 共 ${skills.length} 项` : '（无）'}${systemCount ? ` · 系统级 ${systemCount} 项恒选中` : ''}\n`
    for (const s of skills) {
      thinkBlock.content += `· ${s.system ? '[系统级] ' : ''}${String(s.brief || '') || String(s.id || '')}\n`
    }
    if (ctx.payload.reason) thinkBlock.content += `[判定] ${String(ctx.payload.reason)}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
    ui.pushLiveTimelineItem({
      seq: 3,
      ts: ctx.serverTime,
      event: 'skill.selected',
      title: `Skill 选举：${skills.length} 项${systemCount ? `（系统级 ${systemCount}）` : ''}`,
      detail: skills.slice(0, 3).map(s => String(s.brief || s.id || '')).filter(Boolean).join('、'),
      kind: 'agent',
      target: 'agent-0',
    })
  }

  function onMcpSelected(ctx: StreamEventCtx) {
    const mcps = Array.isArray(ctx.payload.mcps) ? ctx.payload.mcps as Array<{ id?: string; brief?: string }> : []
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[MCP 选定]${mcps.length ? '' : '（无）'}\n`
    for (const m of mcps) thinkBlock.content += `· ${String(m.brief || '') || String(m.id || '')}\n`
    if (ctx.payload.reason) thinkBlock.content += `[判定] ${String(ctx.payload.reason)}\n`
    chat.updateBlock(thinkBlock.id, { content: thinkBlock.content })
    ui.pushLiveTimelineItem({
      seq: 3,
      ts: ctx.serverTime,
      event: 'mcp.selected',
      title: `MCP 选举：${mcps.length} 个`,
      detail: mcps.slice(0, 3).map(m => String(m.brief || m.id || '')).filter(Boolean).join('、'),
      kind: 'agent',
      target: 'agent-0',
    })
  }

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

  function onLoopTurnResult(ctx: StreamEventCtx) {
    const round = Number(ctx.payload.round || 1)
    const nextAction = String(ctx.payload.next_action || 'stop')
    const reason = String(ctx.payload.decision_reason || '')
    const toolCalls = Array.isArray(ctx.payload.tool_calls) ? (ctx.payload.tool_calls as unknown[]).map(String) : []
    const preview = String(ctx.payload.result_preview || '')
    const titleMap: Record<string, string> = { continue: '继续执行', stop: '执行收敛', error: '执行失败', budget: '预算耗尽' }
    const thinkBlock = getOrCreateThinkBlock(ctx, ctx.agentId)
    thinkBlock.content += `[第 ${round} 轮结果] finish_reason=${ctx.payload.finish_reason || 'none'}`
      + `${toolCalls.length ? `（技能：${toolCalls.join('、')}）` : ''}`
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

  function onToolStarted(ctx: StreamEventCtx) {
    onAgentAction(ctx)
    const { toolName, params, partId } = normalizeToolPayload(ctx.payload)
    ui.pushLiveTimelineItem({
      seq: 6,
      ts: ctx.serverTime,
      event: 'skill.started',
      title: `调用技能：${toolName}`,
      detail: JSON.stringify(params).slice(0, 200),
      kind: 'tool',
      target: partId ? `tool-${partId}` : 'agent-0',
    })
  }

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
      event: 'skill.result',
      title: `技能返回：${toolName}（${isOk ? 'ok' : 'error'}）`,
      detail: String(ctx.payload.output || '').slice(0, 200),
      kind: isOk ? 'tool-ok' : 'tool-fail',
      target: partId ? `tool-${partId}` : 'agent-0',
    })
    onAgentOutput({ ...ctx, payload: { output: ctx.payload.output, status: isOk ? 'done' : 'error' } })
  }

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

  function onPermissionAsked(ctx: StreamEventCtx) {
    const permissionId = String(ctx.payload.permission_id ?? '')
    if (!permissionId) return
    // ask_user 内置技能的 tool_id 为 skill_builtin-ask-user（历史值 ask_user 兼容保留）
    const askToolId = String(ctx.payload.tool_id ?? '')
    if (askToolId === 'ask_user' || askToolId === 'skill_builtin-ask-user') {
      const msgId = `ask-${permissionId}`
      if (ctx.chat.messages.some(m => m.id === msgId)) {
        ensureLiveThinkingOpen()
        return
      }
      ctx.chat.addMessage({
        id: msgId,
        role: 'assistant',
        content: '',
        timestamp: ctx.serverTime,
        askUser: {
          askId: permissionId,
          question: String(ctx.payload.input ?? ''),
          kind: ctx.payload.kind === 'confirm' ? 'confirm' : 'clarify',
          status: 'pending',
          askedAt: ctx.serverTime,
        },
      })
      ensureLiveThinkingOpen()
      return
    }
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
        toolId: String(ctx.payload.skill_id ?? ctx.payload.tool_id ?? 'skill'),
        input: ctx.payload.input ?? {},
        status: 'pending',
        askedAt: ctx.serverTime,
        runId: String(ctx.payload.run_id ?? ''),
      },
    })

    ensureLiveThinkingOpen()
  }

  function onPermissionAnswered(ctx: StreamEventCtx) {
    const permissionId = String(ctx.payload.permission_id ?? '')
    if (!permissionId) return

    const askMsgId = `ask-${permissionId}`
    const askMsg = ctx.chat.messages.find(m => m.id === askMsgId)
    if (askMsg?.askUser && askMsg.askUser.status === 'pending') {
      ctx.chat.updateMessage(askMsgId, {
        askUser: { ...askMsg.askUser, status: 'answered', answeredAt: ctx.serverTime },
      })
      return
    }
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

  function onDone(ctx: StreamEventCtx) {
    chat.finalizeBlocks(ctx.botMsgId)
    ui.updatePlanning({ status: 'done' })

    if (ctx.payload.paused) {
      textBlockId = null
      return
    }

    tryAutoCloseThinking()
    const feedbackBlock: Block = {
      id: `block-fb-${Date.now()}`,
      msgId: ctx.botMsgId,
      role: 'assistant',
      type: 'Feedback',
      traceId: String(ctx.payload.trace_id || currentTraceId || ''),
      runId: String(ctx.payload.run_id || chat.currentRunId || ''),
      workId: String(ctx.payload.work_id || ''),
      sessionId: chat.currentSessionId || '',
      meta: { status: 'done', createdAt: ctx.serverTime, updatedAt: ctx.serverTime },
    } as Block
    chat.addBlock(feedbackBlock)
    textBlockId = null
  }

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

  function onRunAccepted(ctx: StreamEventCtx) {
    ui.setRunActive(true)
    const runId = String(ctx.payload.run_id ?? '')
    if (runId) chat.setCurrentRunId(runId)
    ensureLiveThinkingOpen()
    ui.pushLiveTimelineItem({
      seq: 0,
      ts: ctx.serverTime,
      event: 'run.accepted',
      title: '开始受理请求',
      detail: runId ? `run ${runId.slice(0, 8)}` : '',
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

  const handlers: Record<string, (ctx: StreamEventCtx) => void> = {
    [SseTransportEvent.Connected]: onConnected,
    [SseTransportEvent.Loading]: () => {  },
    [BusinessEvent.RunAccepted]: onRunAccepted,
    [BusinessEvent.RunStarted]: onRunStartedEvent,
    [BusinessEvent.RunFinished]: onRunFinished,
    [BusinessEvent.RunFailed]: onRunFailed,
    [BusinessEvent.PartUpdated]: () => {  },
    [BusinessEvent.ReplyCreated]: () => {  },
    [BusinessEvent.ReplyDelta]: onReplyDelta,
    [BusinessEvent.ThinkCreated]: () => {  },
    [BusinessEvent.ThinkDelta]: onThinkDelta,
    [BusinessEvent.SkillStarted]: onToolStarted,
    [BusinessEvent.SkillResult]: onToolResult,

    ['tool.started']: onToolStarted,
    ['tool.result']: onToolResult,
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
    [BusinessEvent.MessageBlock]: () => {  },
    [BusinessEvent.LoopTurnStarted]: onLoopTurnStarted,
    [BusinessEvent.LoopTurnResult]: onLoopTurnResult,
    [BusinessEvent.LoopTurnCompleted]: () => {  },
    [SseTransportEvent.Done]: onDone,
  }

  return {
    handle(data, botMsgId) {

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
