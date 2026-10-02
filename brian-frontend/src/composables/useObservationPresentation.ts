import { computed } from 'vue'
import { useChatUiStore } from '@/stores/chatUi'
import { renderMarkdown } from '@/utils/markdown'
import { formatDuration, formatTokens } from '@/utils/format'
import { observationPhaseLabel } from './observationPhase'
import { usageStageRank } from '@brian-agent/shared'
import type {
  RunObservation, TimelinePoint, ThinkingRound, ContextRound, ToolTrace,
  PermissionTrace, MergeChild, FunnelMechanism, UsageStage,
} from '@brian-agent/shared'

/**
 * ObservationView 展示层加工（ADR-013）：
 * RunObservation → 分区视图模型。所有数据源于事件重放，不做任何合成。
 */
export interface ObservationSections {
  obs: RunObservation | null
  phaseLabel: string
  summaryChips: Array<{ label: string; value: string }>
  usageStages: UsageStage[]
  usageBars: UsageBar[]
  timeline: TimelinePoint[]
  thinkRounds: Array<ThinkingRound & { html: string; durationText: string }>
  contextRounds: Array<ContextRound & { sourceText: string }>
  tools: Array<ToolTrace & { paramsText: string; outputText: string; statusText: string }>
  permissions: PermissionTrace[]
  pendingPermissions: PermissionTrace[]
  mergeChildren: MergeChild[]
  agentMatch: FunnelMechanism[]
  componentFunnels: Array<{ component: string; mechanisms: FunnelMechanism[] }>
  profile: RunObservation['profile']
  empty: boolean
}

const KIND_BADGE: Record<string, string> = {
  lifecycle: '灰', 'lifecycle-ok': '绿', 'lifecycle-fail': '红',
  intent: '蓝', agent: '蓝', model: '紫', context: '灰', think: '蓝',
  reply: '绿', tool: '橙', 'tool-ok': '绿', 'tool-fail': '红',
  permission: '蓝', 'permission-ok': '绿', eval: '紫', writer: '紫',
}

export interface UsageBarSegment {
  label: string
  pct: number
  color: string
  title: string
}

export interface UsageBar {
  key: 'tokens' | 'duration'
  name: string
  segments: UsageBarSegment[]
}

/** 阶段配色（chat 令牌循环，色相交替避免相邻分段同色） */
const STAGE_COLORS = [
  'rgb(var(--chat-primary))',
  'rgb(var(--chat-success))',
  'rgb(var(--chat-warning))',
  'rgb(var(--chat-primary-hover))',
  'rgb(var(--chat-error))',
  'rgb(var(--chat-ink-tertiary))',
]
const REST_COLOR = 'rgb(var(--chat-hairline-strong))'

export function buildUsageBars(stages: UsageStage[], totalDurationMs?: number): UsageBar[] {
  const sorted = [...stages].sort((a, b) => usageStageRank(a.label) - usageStageRank(b.label) || a.label.localeCompare(b.label))
  const bars: UsageBar[] = []
  const tokensTotal = sorted.reduce((sum, s) => sum + s.tokensIn + s.tokensOut, 0)
  if (tokensTotal > 0) {
    bars.push({ key: 'tokens', name: 'Token', segments: sorted.map((s, i) => segmentOf(s, (s.tokensIn + s.tokensOut) / tokensTotal * 100, STAGE_COLORS[i % STAGE_COLORS.length])) })
  }
  const llmDuration = sorted.reduce((sum, s) => sum + s.durationMs, 0)
  if (llmDuration > 0) {
    const rest = totalDurationMs !== undefined ? Math.max(0, totalDurationMs - llmDuration) : 0
    const denom = Math.max(totalDurationMs ?? 0, llmDuration)
    const segments = sorted.map((s, i) => segmentOf(s, s.durationMs / denom * 100, STAGE_COLORS[i % STAGE_COLORS.length]))
    if (rest > 0) segments.push(restSegmentOf(rest / denom * 100, rest))
    bars.push({ key: 'duration', name: '耗时', segments })
  }
  return bars
}

function segmentOf(stage: UsageStage, pct: number, color: string): UsageBarSegment {
  return {
    label: stage.label,
    pct,
    color,
    title: `${stage.label}：输入 ${formatTokens(stage.tokensIn)} / 输出 ${formatTokens(stage.tokensOut)} · ${formatDuration(stage.durationMs)} · ${stage.calls} 次调用`,
  }
}

function restSegmentOf(pct: number, restMs: number): UsageBarSegment {
  return { label: '其他', pct, color: REST_COLOR, title: `其他：技能执行、上下文组装等非模型耗时 · ${formatDuration(restMs)}` }
}

export function useObservationPresentation() {
  const chatUi = useChatUiStore()

  const sections = computed<ObservationSections>(() => {
    const obs = chatUi.observation
    const totalDuration = obs?.summary.settledTs && obs?.summary.startedTs
      ? obs.summary.settledTs - obs.summary.startedTs
      : undefined
    return {
      obs,
      phaseLabel: observationPhaseLabel(obs),
      summaryChips: buildSummaryChips(obs),
      usageStages: obs?.usageStages ?? [],
      usageBars: buildUsageBars(obs?.usageStages ?? [], totalDuration),
      timeline: obs?.timeline ?? [],
      thinkRounds: buildThinkRounds(obs),
      contextRounds: buildContextRounds(obs),
      tools: buildTools(obs),
      permissions: obs?.permissions ?? [],
      pendingPermissions: (obs?.permissions ?? []).filter((p) => p.status === 'pending'),
      mergeChildren: obs?.merge?.children ?? [],
      agentMatch: obs?.agentMatch ?? [],
      componentFunnels: buildComponentFunnels(obs),
      profile: obs?.profile ?? null,
      empty: !!obs && obs.timeline.length === 0 && (obs.thinking.rounds.length === 0),
    }
  })

  return { sections }
}

function buildSummaryChips(obs: RunObservation | null): Array<{ label: string; value: string }> {
  if (!obs) return []
  const chips: Array<{ label: string; value: string }> = [
    { label: 'Tokens', value: `输入 ${formatTokens(obs.summary.tokensIn)} · 输出 ${formatTokens(obs.summary.tokensOut)}` },
  ]
  if (obs.summary.settledTs && obs.summary.startedTs) {
    chips.push({ label: '总耗时', value: formatDuration(obs.summary.settledTs - obs.summary.startedTs) })
  }
  return chips
}

function buildThinkRounds(obs: RunObservation | null): Array<ThinkingRound & { html: string; durationText: string }> {
  return (obs?.thinking.rounds ?? []).map((r) => ({
    ...r,
    html: renderMarkdown(r.text || '（本轮无思考文本）'),
    durationText: r.durationMs !== undefined ? formatDuration(r.durationMs) : '进行中',
  }))
}

function buildContextRounds(obs: RunObservation | null): Array<ContextRound & { sourceText: string }> {
  return (obs?.contextRounds ?? []).map((r) => ({
    ...r,
    sourceText: (r.sources ?? []).map((s) => `${s.label}×${s.count}`).join(' · '),
  }))
}

function buildTools(obs: RunObservation | null): Array<ToolTrace & { paramsText: string; outputText: string; statusText: string }> {
  return (obs?.tools ?? []).map((t) => ({
    ...t,
    paramsText: stringify(t.params),
    outputText: stringify(t.output),
    statusText: t.status === 'running' ? '运行中' : t.status === 'ok' ? '成功' : '失败',
  }))
}

function buildComponentFunnels(obs: RunObservation | null): Array<{ component: string; mechanisms: FunnelMechanism[] }> {
  const labels: Record<string, string> = { llm: 'LLM', prompt: 'Prompt', soul: 'Soul', skill: 'Skill', mcp: 'MCP' }
  return Object.entries(obs?.funnels ?? {}).map(([component, mechanisms]) => ({
    component: labels[component] ?? component,
    mechanisms,
  }))
}

function stringify(val: unknown): string {
  if (val === undefined || val === null) return ''
  if (typeof val === 'string') return val
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

export { KIND_BADGE }
