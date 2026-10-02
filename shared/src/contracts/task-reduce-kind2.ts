/**
 * 分 kind 事件归约（第二部分）：assembly / context / reasoning / reply / tool / llm / permission / eval / writer / error。
 */
import type { TaskEvent } from './task-event'
import { TaskEventType as T } from './task-event'
import type { ComponentSpec, ContextRound, ToolTrace } from './task-reducer'
import type { RunObservation } from './task-reducer'
import { arr, bool, num, pl, pushPointOf as pushPoint, str, type P } from './task-reduce-util'

const p = pl

// ── assembly ───────────────────────────────────────────────

export function reduceAssembly(obs: RunObservation, ev: TaskEvent): void {
  switch (ev.type) {
    case T.AgentSelected: reduceAgentSelected(obs, ev); break
    case T.AgentBuilt:
      pushPoint(obs, ev, { type: ev.type, kind: 'agent', title: `构建 Agent：${str(p(ev).name) || str(p(ev).agent_id)}`, detail: str(p(ev).purpose), target: 'agent-0' })
      break
    case T.AgentDisbanded:
      pushPoint(obs, ev, { type: ev.type, kind: 'lifecycle', title: `解散 Agent：${str(p(ev).agent_id)}`, detail: str(p(ev).reason), target: 'agent-0' })
      break
    case T.AgentComponents: reduceComponents(obs, ev); break
    case T.ThoughtSelected:
      obs.summary.thoughtMode = str(p(ev).thought_mode, 'CoT')
      pushPoint(obs, ev, { type: ev.type, kind: 'think', title: `选定思维模型：${obs.summary.thoughtMode}`, detail: str(p(ev).reason), target: 'agent-0' })
      break
    case T.SoulSelected:
      pushPoint(obs, ev, { type: ev.type, kind: 'agent', title: str(p(ev).soul_id) ? `Soul 选定：${str(p(ev).brief) || str(p(ev).soul_id)}` : 'Soul 未绑定', detail: '', target: 'agent-0' })
      break
    case T.PromptSelected:
    case T.LlmSelected:
      reduceComponentPicked(obs, ev)
      break
    case T.SkillSelected:
    case T.McpSelected:
      reduceComponentListPicked(obs, ev)
      break
    case T.ComponentFunnel:
      obs.funnels[str(p(ev).component)] = arr(p(ev).mechanisms) as never
      break
    default: break
  }
}

function reduceAgentSelected(obs: RunObservation, ev: TaskEvent): void {
  obs.phase = 'assembling'
  obs.summary.agentId = str(p(ev).agent_id) || obs.summary.agentId
  obs.summary.agentName = str(p(ev).agent_name) || obs.summary.agentName
  obs.agentMatch = (arr(p(ev).mechanisms) as never) || null
  pushPoint(obs, ev, {
    type: ev.type, kind: 'agent', target: 'agent-0',
    title: `选中 Agent：${str(p(ev).agent_name) || str(p(ev).agent_id)}`,
    detail: str(p(ev).matched_by) ? `匹配方式：${str(p(ev).matched_by)}` : '',
  })
}

function toComponents(pl: P): ComponentSpec {
  return {
    soul: pl.soul_id ? { id: str(pl.soul_id), name: str(pl.soul_name) || str(pl.soul_id) } : undefined,
    prompt: pl.prompt_template_id ? { id: str(pl.prompt_template_id), name: str(pl.prompt_name) || str(pl.prompt_template_id) } : undefined,
    llm: pl.llm_id ? { id: str(pl.llm_id), name: str(pl.llm_name) || str(pl.llm_id) } : undefined,
    skills: arr(pl.skills).map((s) => ({ id: str(s.id), name: str(s.brief) || str(s.id), system: s.system === true })),
    mcps: arr(pl.mcps).map((m) => ({ id: str(m.id), name: str(m.brief) || str(m.id) })),
  }
}

function reduceComponents(obs: RunObservation, ev: TaskEvent): void {
  obs.components = toComponents(p(ev))
  const c = obs.components
  const bits: string[] = []
  if (c.soul) bits.push(`Soul ${c.soul.name}`)
  if (c.skills.length) bits.push(`Skill×${c.skills.length}`)
  if (c.mcps.length) bits.push(`MCP×${c.mcps.length}`)
  if (c.llm) bits.push(`LLM ${c.llm.name}`)
  if (c.prompt) bits.push(`Prompt ${c.prompt.name}`)
  pushPoint(obs, ev, { type: ev.type, kind: 'agent', title: '组件装配完成', detail: bits.join(' · ') || '无显式绑定', target: 'agent-0' })
}

function reduceComponentPicked(obs: RunObservation, ev: TaskEvent): void {
  const isLlm = ev.type === T.LlmSelected
  const id = isLlm ? str(p(ev).llm_id) : str(p(ev).template_id)
  const name = isLlm ? str(p(ev).llm_name) : str(p(ev).prompt_name)
  if (isLlm && id) obs.summary.llmId = id
  pushPoint(obs, ev, { type: ev.type, kind: isLlm ? 'model' : 'agent', title: `${isLlm ? 'LLM' : 'Prompt'} 选定：${name || id}`, detail: '', target: 'agent-0' })
}

function reduceComponentListPicked(obs: RunObservation, ev: TaskEvent): void {
  const isSkill = ev.type === T.SkillSelected
  const list = arr(p(ev).skills)
  pushPoint(obs, ev, {
    type: ev.type, kind: 'agent', target: 'agent-0',
    title: isSkill ? `Skill 选举：${list.length} 项` : `MCP 选举：${list.length} 个`,
    detail: list.slice(0, 3).map((x) => str(x.brief) || str(x.id)).filter(Boolean).join('、'),
  })
}

// ── context ────────────────────────────────────────────────

export function reduceContext(obs: RunObservation, ev: TaskEvent): void {
  if (ev.type === T.ProfileSnapshot) {
    const pl = p(ev)
    obs.profile = { version: num(pl.version) || undefined, summary: str(pl.summary), updatedAt: num(pl.updated_at) || undefined, dimensions: arr(pl.dimensions) as never }
    return
  }
  if (ev.type !== T.ContextBuilt) return
  const pl = p(ev)
  const round = num(pl.round, obs.round + 1)
  const roundItem: ContextRound = {
    round, messageCount: num(pl.message_count, arr(pl.messages).length),
    thoughtMode: str(pl.thought_mode) || undefined, system: str(pl.system) || undefined,
    messages: arr(pl.messages).map((m) => ({ role: str(m.role), content: str(m.content), tool_calls: Array.isArray(m.tool_calls) ? m.tool_calls.map(String) : undefined })),
    sources: arr(pl.sources).map((s) => ({ source: str(s.source), label: str(s.label) || str(s.source), count: num(s.count), messageIds: arr(s.message_ids).map((x) => String(x)) })),
  }
  const idx = obs.contextRounds.findIndex((r) => r.round === round)
  if (idx >= 0) obs.contextRounds[idx] = roundItem
  else obs.contextRounds.push(roundItem)
  pushPoint(obs, ev, {
    type: ev.type, kind: 'context', target: `ctx-${round}`,
    title: `构建上下文：第 ${round} 轮 · ${roundItem.messageCount} 条消息`,
    detail: pl.system ? '含 system 提示词（模型输入侧）' : '',
  })
}

// ── reasoning / reply ──────────────────────────────────────

export function reduceReasoning(obs: RunObservation, ev: TaskEvent): void {
  if (ev.type === T.ThinkCreated) {
    obs.thinking.active = true
    return
  }
  const delta = str(p(ev).delta)
  if (!delta) return
  let cur = obs.thinking.rounds.find((r) => r.round === obs.round)
    ?? obs.thinking.rounds[obs.thinking.rounds.length - 1]
  if (!cur) {
    cur = { round: 1, text: '', startedTs: ev.ts, thoughtMode: obs.summary.thoughtMode }
    obs.thinking.rounds.push(cur)
    obs.round = Math.max(obs.round, 1)
  }
  cur.text += delta
  obs.thinking.active = true
}

export function reduceReply(obs: RunObservation, ev: TaskEvent): void {
  const pl = p(ev)
  if (ev.type === T.ReplyCreated) {
    // 只登记归属，不重置正文：正文由 delta 流驱动（replace 标记负责 Writer 接管替换）
    obs.reply.msgId = str(pl.msg_id)
    obs.reply.createdTs = ev.ts
    obs.thinking.active = false
    return
  }
  if (bool(pl.replace)) {
    obs.reply.text = str(pl.delta)
    return
  }
  obs.reply.text += str(pl.delta)
}

// ── tool / llm ─────────────────────────────────────────────

function upsertTool(obs: RunObservation, partId: string, patch: Partial<ToolTrace>): void {
  const idx = obs.tools.findIndex((t) => t.partId === partId)
  if (idx >= 0) obs.tools[idx] = { ...obs.tools[idx], ...patch }
  else obs.tools.push({ partId, toolId: '', name: '', status: 'running', startedTs: Date.now(), ...patch })
}

export function reduceTool(obs: RunObservation, ev: TaskEvent): void {
  const partId = str(p(ev).part_id) || `tool-${ev.seq}`
  if (ev.type === T.SkillStarted) {
    obs.phase = 'acting'
    const toolId = str(p(ev).tool_id) || str(p(ev).skill_id)
    upsertTool(obs, partId, { partId, toolId, name: toolId, params: p(ev).input, status: 'running', startedTs: ev.ts })
    pushPoint(obs, ev, { type: ev.type, kind: 'tool', title: `调用技能：${toolId}`, detail: JSON.stringify(p(ev).input ?? {}).slice(0, 200), target: `tool-${partId}` })
    return
  }
  const ok = str(p(ev).status, 'ok') === 'ok'
  upsertTool(obs, partId, { status: ok ? 'ok' : 'error', output: p(ev).output, elapsedMs: num(p(ev).elapsed_ms) || undefined })
  obs.summary.toolCalls += 1
  pushPoint(obs, ev, {
    type: ev.type, kind: ok ? 'tool-ok' : 'tool-fail', target: `tool-${partId}`,
    title: `技能返回：${str(p(ev).tool_id) || str(p(ev).skill_id)}（${ok ? 'ok' : 'error'}）`,
    detail: typeof p(ev).output === 'string' ? (p(ev).output as string).slice(0, 200) : '',
  })
}

export function reduceLlm(obs: RunObservation, ev: TaskEvent): void {
  const pl = p(ev)
  obs.summary.tokensIn += num(pl.input_tokens)
  obs.summary.tokensOut += num(pl.output_tokens)
  obs.summary.llmCalls += 1
  upsertUsageStage(obs, pl)
  const failed = str(pl.status, 'ok') !== 'ok'
  pushPoint(obs, ev, {
    type: ev.type, kind: failed ? 'lifecycle-fail' : 'model', target: 'agent-0',
    title: failed ? '模型调用失败' : `模型调用 ${num(pl.duration_ms)}ms`,
    detail: `首字 ${num(pl.ttft_ms)}ms · 生成 ${num(pl.stream_ms)}ms · ${num(pl.input_tokens)}→${num(pl.output_tokens)} tokens${str(pl.caller) ? ` · ${str(pl.caller).split('.').pop()}` : ''}`,
  })
}

// ── 阶段用量（llm.invoked 按 caller 归组，顺序稳定供分布条渲染） ──

const USAGE_STAGES: Array<[RegExp, string]> = [
  [/^IntentAgentService\./, '组件选举'],
  [/^AgentDefService\.matchAgentDef/, '组件选举'],
  [/^AgentLibraryService\./, '组件选举'],
  [/^AgentBuilderService\./, 'Agent 构建'],
  [/^AgentLoopService\.callLLMTurn/, '主循环问答'],
  [/^AgentExecutionService\./, '子任务执行'],
  [/^EvolutorAgent\.eval/, '执行评估'],
  [/^WriterAgent\./, '写作排版'],
  [/^SummaryAgentService\./, '会话摘要'],
]

export function usageStageLabel(caller: string): string {
  return USAGE_STAGES.find(([re]) => re.test(caller))?.[1] ?? '其他调用'
}

export function usageStageRank(label: string): number {
  const idx = USAGE_STAGES.findIndex(([, l]) => l === label)
  return idx >= 0 ? idx : USAGE_STAGES.length
}

function upsertUsageStage(obs: RunObservation, pl: P): void {
  const label = usageStageLabel(str(pl.caller))
  const stage = obs.usageStages.find((s) => s.label === label)
  if (stage) {
    stage.tokensIn += num(pl.input_tokens)
    stage.tokensOut += num(pl.output_tokens)
    stage.durationMs += num(pl.duration_ms)
    stage.calls += 1
    return
  }
  obs.usageStages.push({ label, tokensIn: num(pl.input_tokens), tokensOut: num(pl.output_tokens), durationMs: num(pl.duration_ms), calls: 1 })
}

// ── permission / eval / writer / error ─────────────────────

export function reducePermission(obs: RunObservation, ev: TaskEvent): void {
  const pl = p(ev)
  const pid = str(pl.permission_id)
  if (ev.type === T.PermissionAsked) {
    obs.summary.permissionCount += 1
    obs.permissions.push({ permissionId: pid, toolId: str(pl.tool_id) || str(pl.skill_id), input: pl.input, status: 'pending', askedTs: ev.ts })
    pushPoint(obs, ev, { type: ev.type, kind: 'permission', title: `等待授权：${str(pl.tool_id) || str(pl.skill_id)}`, detail: '', target: `perm-${pid}` })
    return
  }
  const idx = obs.permissions.findIndex((x) => x.permissionId === pid)
  if (idx >= 0) obs.permissions[idx] = { ...obs.permissions[idx], status: pl.approved === false ? 'denied' : 'allowed', answeredTs: ev.ts }
  pushPoint(obs, ev, { type: ev.type, kind: 'permission-ok', title: `授权完成：${str(pl.tool_id) || str(pl.skill_id)}`, detail: pl.approved === false ? '已拒绝' : '已允许', target: `perm-${pid}` })
}

export function reduceEvalWriter(obs: RunObservation, ev: TaskEvent): void {
  if (ev.type === T.EvaluationStarted) {
    obs.phase = 'evaluating'
    pushPoint(obs, ev, { type: ev.type, kind: 'eval', title: '评估中…', detail: str(p(ev).mode), target: 'agent-0' })
    return
  }
  if (ev.type === T.EvaluationCompleted) {
    const scores = (p(ev).scores && typeof p(ev).scores === 'object' ? p(ev).scores : {}) as P
    pushPoint(obs, ev, {
      type: ev.type, kind: 'eval', target: 'agent-0',
      title: `评估完成：overall=${num(scores.overall)}${bool(p(ev).need_optimize) ? '（需优化）' : ''}`,
      detail: str(p(ev).eval_type),
    })
    return
  }
  if (ev.type === T.WriterStarted) {
    obs.phase = 'writing'
    pushPoint(obs, ev, { type: ev.type, kind: 'writer', title: '写作排版中…', detail: '', target: 'agent-0' })
    return
  }
  pushPoint(obs, ev, {
    type: ev.type, kind: 'writer', target: 'agent-0',
    title: `写作排版：${str(p(ev).format, 'MARKDOWN')}`, detail: `字数：${num(p(ev).length)}`,
  })
}

export function reduceError(obs: RunObservation, ev: TaskEvent): void {
  obs.error = str(p(ev).error) || obs.error
  pushPoint(obs, ev, { type: ev.type, kind: 'lifecycle-fail', title: '执行出错', detail: obs.error.slice(0, 300), target: '' })
}
