<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  X, Brain, Loader2, ChevronRight, ChevronDown, Clock3, Zap, Wrench,
  ShieldCheck, MessagesSquare, ListTree, Check, Bot, Cpu, FileText, Sparkles, Layers,
  CheckCircle2, XCircle, CircleDot,
} from '@lucide/vue'
import { useSessionStore } from '@/stores/session'
import { useChatUiStore } from '@/stores/chatUi'
import { answerPermission } from '@/api'
import type { ThinkingBlock, ThinkingTrace, ThinkingTimelineItem, ThinkingToolTrace, ThinkingPermissionTrace } from '@/api/types'
import ThinkingBlockView from '@/components/blocks/ThinkingBlock.vue'
import ThinkingContext from './ThinkingContext.vue'
import { renderMarkdown } from '@/utils/markdown'
import { formatDuration } from '@/utils/format'

const sessionStore = useSessionStore()
const chatUi = useChatUiStore()

const visible = computed(() => chatUi.thinkingModalVisible)
const targetMsgId = computed(() => chatUi.thinkingTargetMsgId)
const thinkingLoading = computed(() => chatUi.thinkingLoading)

const thinkingBlocks = computed<ThinkingBlock[]>(() => {
  if (targetMsgId.value) {
    return chatUi.thinkingBlocks as ThinkingBlock[]
  }
  return sessionStore.blocks.filter(
    (b): b is ThinkingBlock => b.type === 'ThinkingChain',
  )
})

const historyTrace = computed<ThinkingTrace | null>(() => (targetMsgId.value ? chatUi.thinkingTrace : null))

const contextBlocks = computed<ThinkingBlock[]>(() => {
  if (targetMsgId.value) {
    return chatUi.thinkingBlocks as ThinkingBlock[]
  }
  return sessionStore.blocks.filter((b): b is ThinkingBlock => b.type === 'ThinkingChain')
})

const jumpTarget = ref('')
async function scrollToAnchor(target?: string) {
  if (!target) return
  const shouldExpand = (target.startsWith('ctx-') && !secContext.value)
    || (target.startsWith('tool-') && !secTools.value)
    || (target.startsWith('perm-') && !secPermissions.value)
    || (target.startsWith('node-') && !secNodes.value)
    || (target === 'agent-0' && !secAgent.value)
  if (shouldExpand) {
    if (target.startsWith('ctx-')) secContext.value = true
    else if (target.startsWith('tool-')) secTools.value = true
    else if (target.startsWith('perm-')) secPermissions.value = true
    else if (target.startsWith('node-')) secNodes.value = true
    else if (target === 'agent-0') secAgent.value = true
    await nextTick()
  }
  const el = document.querySelector(`[data-anchor="${target}"]`) as HTMLElement | null
  if (!el) return
  jumpTarget.value = target
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('thinking-jump-flash')
  window.setTimeout(() => {
    el.classList.remove('thinking-jump-flash')
    if (jumpTarget.value === target) jumpTarget.value = ''
  }, 1600)
}

interface LiveTimelineItem extends ThinkingTimelineItem {
  key: string
}

const liveTimeline = computed<LiveTimelineItem[]>(() => {
  if (targetMsgId.value) return []
  const items: LiveTimelineItem[] = []
  for (const b of sessionStore.blocks) {
    if (b.type === 'ThinkingChain') {
      const tb = b as ThinkingBlock
      const rawName = tb.agentInfo?.name
      const agName = rawName && rawName !== '执行 Agent' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawName)
        ? rawName
        : ''
      const charCount = (tb.content || '').length
      const isStreaming = b.meta.status === 'streaming'
      const title = isStreaming
        ? (charCount > 0 ? `Agent 深度推理思考（${charCount} 字）` : 'Agent 深度推理思考中…')
        : (charCount > 0 ? `Agent 深度推理思考（${charCount} 字）` : `Agent 思考完成`)

      items.push({
        key: `think-${b.id}`, seq: b.meta.createdAt, ts: b.meta.createdAt,
        event: 'think.live', title,
        detail: agName ? `Agent：${agName}` : (tb.content || '').slice(0, 220), kind: 'think', target: 'agent-0',
      })
      for (const s of tb.steps || []) {
        if (s.phase === 'ACT' && s.toolCalls?.length) {
          for (const tc of s.toolCalls) {
            items.push({
              key: `act-${b.id}-${s.iteration}-${tc.toolName}`, seq: b.meta.updatedAt, ts: b.meta.updatedAt,
              event: 'tool.live', title: `调用技能：${tc.toolName || 'Skill'}`,
              detail: JSON.stringify(tc.params ?? {}).slice(0, 200), kind: 'tool',
            })
          }
        }
      }
    } else if (b.type === 'ToolInvocation') {
      const tb = b as unknown as { toolName?: string; meta: { createdAt: number }; result?: unknown }
      const done = b.meta.status === 'done'
      const failed = b.meta.status === 'error'
      items.push({
        key: `tool-${b.id}`, seq: b.meta.createdAt, ts: b.meta.createdAt,
        event: 'tool.live-result', title: `技能${failed ? '失败' : done ? '完成' : '执行中'}：${tb.toolName || 'Skill'}`,
        detail: done ? String(JSON.stringify(tb.result ?? '')).slice(0, 220) : '执行中…',
        kind: failed ? 'tool-fail' : done ? 'tool-ok' : 'tool', target: `tool-${b.id}`,
      })
    }
  }
  for (const m of sessionStore.messages) {
    if (m.permission) {
      const p = m.permission
      const answered = p.status !== 'pending'
      items.push({
        key: `perm-${p.permissionId}`, seq: m.timestamp, ts: m.timestamp,
        event: answered ? 'permission.live-answered' : 'permission.live-asked',
        title: answered
          ? `授权${p.status === 'allowed' ? '已通过' : '已拒绝'}：${p.toolId}`
          : `等待授权：${p.toolId}`,
        detail: '', kind: answered ? (p.status === 'allowed' ? 'permission-ok' : 'permission-deny') : 'permission', target: `perm-${p.permissionId}`,
      })
    }
  }
  return items.sort((a, b) => a.ts - b.ts)
})

const timeline = computed<ThinkingTimelineItem[]>(() => {
  if (historyTrace.value?.timeline?.length) return historyTrace.value.timeline
  if (chatUi.liveTimeline && chatUi.liveTimeline.length > 0) return chatUi.liveTimeline
  return liveTimeline.value
})

const timelineWithElapsed = computed<Array<ThinkingTimelineItem & { elapsedMs: number }>>(() => {
  const list = timeline.value
  if (list.length === 0) return []
  return list.map((item) => {
    const elapsed = typeof item.elapsedMs === 'number' && item.elapsedMs > 0 ? item.elapsedMs : 0
    return { ...item, elapsedMs: elapsed }
  })
})

const REALTIME_BUILTIN_TOOL_IDS = new Set(['skill_exec', 'mcp_exec', 'cdt_browser', 'update_plan', 'delegate'])
function realtimeToolComponentOf(toolId: string, params: Record<string, unknown>): { builtin: boolean; kind: 'skill' | 'mcp' | ''; id: string; name: string; subTool: string } {
  const builtin = REALTIME_BUILTIN_TOOL_IDS.has(toolId)
  if (toolId === 'skill_exec') {
    const id = String(params?.skill_id ?? '').trim()
    return { builtin, kind: 'skill', id, name: id, subTool: '' }
  }
  if (toolId === 'mcp_exec') {
    const id = String(params?.mcp_id ?? '').trim()
    return { builtin, kind: 'mcp', id, name: id, subTool: String(params?.tool_name ?? '') }
  }
  return { builtin, kind: '', id: '', name: '', subTool: '' }
}

const toolTraces = computed<Array<ThinkingToolTrace>>(() => {
  if (historyTrace.value?.tools?.length) return historyTrace.value.tools
  return sessionStore.blocks
    .filter((b) => b.type === 'ToolInvocation')
    .map((b, i) => {
      const t = b as unknown as { toolName?: string; params?: unknown; result?: unknown; meta: { status: string } }
      const toolId = String(t.toolName || 'Tool')
      const params = (t.params ?? {}) as Record<string, unknown>
      const comp = realtimeToolComponentOf(toolId, params)
      return {
        index: i + 1, partId: b.id, targetKey: `tool-${b.id}`,
        toolId,
        params, result: t.result ?? '',
        status: String(t.meta.status), elapsedMs: 0, tokenCount: 0,
        builtin: comp.builtin,
        componentKind: comp.kind,
        componentId: comp.id,
        componentName: comp.name,
        componentSubTool: comp.subTool,
      }
    })
})

const permissionTraces = computed<Array<ThinkingPermissionTrace>>(() => {
  if (historyTrace.value?.permissions?.length) return historyTrace.value.permissions
  return sessionStore.messages
    .filter((m) => m.permission)
    .map((m) => {
      const permInput = (m.permission!.input ?? {}) as Record<string, unknown>
      const comp = realtimeToolComponentOf(m.permission!.toolId, permInput)
      return {
        permissionId: m.permission!.permissionId,
        targetKey: `perm-${m.permission!.permissionId}`,
        toolId: m.permission!.toolId,
        input: permInput,
        status: m.permission!.status,
        askedAt: m.permission!.askedAt ?? m.timestamp,
        answeredAt: m.permission!.answeredAt ?? 0,
        autoApproved: false,
        builtin: comp.builtin,
        componentKind: comp.kind,
        componentId: comp.id,
        componentName: comp.name,
        componentSubTool: comp.subTool,
      }
    })
})

const pendingPermissions = computed(() => permissionTraces.value.filter((p) => p.status === 'pending'))
const answeredPermissions = computed(() => permissionTraces.value.filter((p) => p.status !== 'pending'))

const runOverview = computed(() => historyTrace.value?.run ?? null)
const overviewComponents = computed<Array<{ kind: string; id: string; name: string; icon: unknown }>>(() => {
  const c = runOverview.value?.components
  if (!c) return []
  const list: Array<{ kind: string; id: string; name: string; icon: unknown }> = []
  if (c.agent?.id || c.agent?.name) list.push({ kind: 'Agent', id: c.agent.id, name: c.agent.name, icon: Bot })
  if (c.llm?.id || c.llm?.name) list.push({ kind: 'LLM', id: c.llm.id, name: c.llm.name, icon: Cpu })
  if (c.prompt?.id || c.prompt?.name) list.push({ kind: 'Prompt', id: c.prompt.id, name: c.prompt.name, icon: FileText })
  if (c.soul?.id || c.soul?.name) list.push({ kind: 'Soul', id: c.soul.id, name: c.soul.name, icon: Sparkles })
  for (const s of c.skills || []) list.push({ kind: 'Skill', id: s.id, name: s.name, icon: Wrench })
  for (const m of c.mcps || []) list.push({ kind: 'MCP', id: m.id, name: m.name, icon: Layers })
  return list
})
const contextRounds = computed(() => historyTrace.value?.contextRounds ?? chatUi.liveContextRounds ?? [])
const runNodes = computed(() => historyTrace.value?.nodes ?? [])

const overallStreaming = computed(() => {
  if (thinkingBlocks.value.some((b) => b.meta.status === 'streaming')) return true
  return Object.values(chatUi.agentExecutions).some((i) => i.status === 'RUNNING')
})

const isEmpty = computed(() => (
  timeline.value.length === 0
  && agentDetailBlocks.value.length === 0
  && toolTraces.value.length === 0
  && permissionTraces.value.length === 0
))

const secTools = ref(true)
const secPermissions = ref(true)
const secAgent = ref(true)
const secContext = ref(false)
const secNodes = ref(true)
const expandedTools = ref<Set<string>>(new Set())
const expandedPerms = ref<Set<string>>(new Set())
const expandedNodes = ref<Set<string>>(new Set())

function toggleTool(key: string) {
  const next = new Set(expandedTools.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedTools.value = next
}

function togglePerm(key: string) {
  const next = new Set(expandedPerms.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedPerms.value = next
}

function toggleNode(key: string) {
  const next = new Set(expandedNodes.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedNodes.value = next
}

const KIND_DOT: Record<string, string> = {
  'lifecycle': 'bg-brian-blue',
  'lifecycle-ok': 'bg-success-green',
  'lifecycle-fail': 'bg-error-red',
  'agent': 'bg-brian-blue',
  'context': 'bg-brian-blue',
  'intent': 'bg-brian-blue',
  'model': 'bg-brian-blue',
  'think': 'bg-brian-blue',
  'reply': 'bg-success-green',
  'tool': 'bg-brian-blue',
  'tool-ok': 'bg-success-green',
  'tool-fail': 'bg-error-red',
  'plan': 'bg-brian-blue',
  'permission': 'bg-brian-blue',
  'permission-ok': 'bg-success-green',
  'permission-deny': 'bg-error-red',
  'eval': 'bg-brian-blue',
  'writer': 'bg-brian-blue',
}

const KIND_ICON: Record<string, unknown> = {
  lifecycle: CircleDot, 'lifecycle-ok': CheckCircle2, 'lifecycle-fail': XCircle,
  agent: Bot, context: MessagesSquare, intent: CircleDot, model: CircleDot,
  think: Brain, reply: MessagesSquare, tool: Wrench, 'tool-ok': CheckCircle2, 'tool-fail': XCircle,
  plan: ListTree, permission: ShieldCheck, 'permission-ok': ShieldCheck, 'permission-deny': XCircle,
  eval: CircleDot, writer: MessagesSquare,
}

function kindDot(kind: string) {
  return KIND_DOT[kind] || 'bg-brian-blue'
}

function kindIcon(kind: string) {
  return KIND_ICON[kind] || CircleDot
}

function toolStatusMeta(status: unknown) {
  const s = String(status)
  if (s === 'done' || s === 'ok') return { text: '成功', cls: 'bg-success-green/10 text-success-green' }
  if (/fail|error/i.test(s)) return { text: '失败', cls: 'bg-error-red/10 text-error-red' }
  return { text: '执行中', cls: 'bg-brian-blue/10 text-brian-blue' }
}

function permStatusMeta(status: unknown) {
  const s = String(status)
  if (s === 'allowed') return { text: '已允许', cls: 'bg-success-green/10 text-success-green', iconCls: 'text-success-green' }
  if (s === 'denied') return { text: '已拒绝', cls: 'bg-error-red/10 text-error-red', iconCls: 'text-error-red' }
  return { text: '等待授权', cls: 'bg-brian-blue/10 text-brian-blue', iconCls: 'text-brian-blue' }
}

function formatTs(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function formatJson(v: unknown) {
  if (v === undefined || v === null || v === '') return ''
  if (typeof v === 'string') {
    const t = v.trim()
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return JSON.stringify(JSON.parse(t), null, 2) } catch { return v }
    }
    return v
  }
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}

const renderedToolResults = computed(() => {
  const m = new Map<string, string>()
  for (const t of toolTraces.value) {
    const raw = typeof t.result === 'string' ? t.result : formatJson(t.result)
    m.set(String(t.partId || t.index), raw ? renderMarkdown(raw) : '')
  }
  return m
})

const agentDetailBlocks = computed<ThinkingBlock[]>(() => thinkingBlocks.value)

const permittingId = ref<string | null>(null)
async function confirmPermission(permissionId: string, approved: boolean, remember = false) {
  if (!permissionId || permittingId.value) return
  permittingId.value = permissionId
  try {
    await answerPermission(permissionId, approved, remember)
    const msgId = `perm-${permissionId}`
    const msg = sessionStore.messages.find((m) => m.id === msgId)
    if (msg?.permission && msg.permission.status === 'pending') {
      sessionStore.updateMessage(msgId, {
        permission: { ...msg.permission, status: approved ? 'allowed' : 'denied', answeredAt: Date.now() },
      })
    }
  } catch {
    /* 保持待授权，允许用户重试 */
  } finally {
    permittingId.value = null
  }
}

function close() {
  chatUi.closeThinkingModal()
}

function onAfterLeave() {
  chatUi.cleanupThinkingModal()
}

interface GenieTarget { dx: number; dy: number; s: number }

function getCardEl(overlay: Element): HTMLElement | null {
  return overlay.querySelector('.thinking-card')
}

function genieTarget(cardRect: DOMRect): GenieTarget | null {
  const o = chatUi.thinkingOrigin
  if (!o || !cardRect.width || !cardRect.height) return null
  const cx = cardRect.left + cardRect.width / 2
  const cy = cardRect.top + cardRect.height / 2
  const s = Math.max(
    0.04,
    Math.min(0.22, o.width / cardRect.width, o.height / cardRect.height),
  )
  return { dx: o.left + o.width / 2 - cx, dy: o.top + o.height / 2 - cy, s }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function bounceOriginButton() {
  try {
    const id = targetMsgId.value
    if (!id) return
    const btn = document.querySelector(`[data-thinking-id="${id}"]`) as HTMLElement | null
    btn?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }],
      { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    )
  } catch { /* 查询失败就跳过，不影响主动画 */ }
}

const liveAnims = new Set<Animation>()
let animToken = 0
function trackAnim(a: Animation): Animation {
  liveAnims.add(a)
  a.finished.catch(() => undefined).finally(() => { liveAnims.delete(a) })
  return a
}
function cancelAnims() {
  liveAnims.forEach((a) => { try { a.cancel() } catch { /* ignore */ } })
  liveAnims.clear()
}
function playAnims(anims: Animation[], done: () => void, timeoutMs: number, cleanup: () => void) {
  cancelAnims()
  const token = ++animToken
  let settled = false
  const finish = () => {
    if (settled || token !== animToken) return
    settled = true
    cleanup()
    done()
  }
  anims.forEach(trackAnim)
  Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(finish)
  setTimeout(finish, timeoutMs)
}

function onGenieBeforeEnter(overlay: Element) {
  const oEl = overlay as HTMLElement
  oEl.style.opacity = '0'
  const card = getCardEl(overlay)
  if (card) card.style.opacity = '0'
}

function onGenieEnter(overlay: Element, done: () => void) {
  const oEl = overlay as HTMLElement
  const card = getCardEl(overlay)
  if (!card || prefersReducedMotion() || typeof oEl.animate !== 'function') {
    oEl.style.opacity = ''
    if (card) card.style.opacity = ''
    done()
    return
  }
  const target = genieTarget(card.getBoundingClientRect())
  const oAnim = oEl.animate(
    [
      { opacity: 0, backdropFilter: 'blur(0px)' },
      { opacity: 1, backdropFilter: 'blur(4px)' },
    ],
    { duration: 320, easing: 'ease-out', fill: 'both' },
  )
  const cAnim = target
    ? card.animate(
        [
          { opacity: 0, transform: `translate(${target.dx}px, ${target.dy}px) scale(${target.s})` },
          { opacity: 1, transform: 'translate(0px, 0px) scale(1)' },
        ],
        { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
      )
    : card.animate(
        [
          { opacity: 0, transform: 'translateY(20px) scale(0.96)', filter: 'blur(4px)' },
          { opacity: 1, transform: 'translateY(0px) scale(1)', filter: 'blur(0px)' },
        ],
        { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
      )
  bounceOriginButton()
  playAnims([oAnim, cAnim], done, 650, () => {
    cancelAnims()
    oEl.style.opacity = ''
    card.style.opacity = ''
  })
}

function onGenieLeave(overlay: Element, done: () => void) {
  const oEl = overlay as HTMLElement
  const card = getCardEl(overlay)
  if (!card || prefersReducedMotion() || typeof oEl.animate !== 'function') {
    done()
    return
  }
  const target = genieTarget(card.getBoundingClientRect())
  const oAnim = oEl.animate(
    [
      { opacity: 1, backdropFilter: 'blur(4px)' },
      { opacity: 0, backdropFilter: 'blur(0px)' },
    ],
    { duration: 240, easing: 'ease-in', fill: 'both' },
  )
  const cAnim = target
    ? card.animate(
        [
          { opacity: 1, transform: 'translate(0px, 0px) scale(1)' },
          { opacity: 0, transform: `translate(${target.dx}px, ${target.dy}px) scale(${target.s})` },
        ],
        { duration: 300, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'both' },
      )
    : card.animate(
        [
          { opacity: 1, transform: 'translateY(0px) scale(1)', filter: 'blur(0px)' },
          { opacity: 0, transform: 'translateY(12px) scale(0.97)', filter: 'blur(2px)' },
        ],
        { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' },
      )
  playAnims([oAnim, cAnim], done, 450, () => cancelAnims())
}

function onGenieCancelled() {
  animToken++
  cancelAnims()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const timelineListRef = ref<HTMLElement | null>(null)
watch(
  () => timeline.value.length,
  async (len, prev) => {
    if (targetMsgId.value) return
    if (len <= (prev ?? 0)) return
    await nextTick()
    const el = timelineListRef.value
    if (el) el.scrollTop = el.scrollHeight
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition
      :css="false"
      @before-enter="onGenieBeforeEnter"
      @enter="onGenieEnter"
      @enter-cancelled="onGenieCancelled"
      @leave="onGenieLeave"
      @leave-cancelled="onGenieCancelled"
      @after-leave="onAfterLeave"
    >
      <div
        v-if="visible"
        class="thinking-overlay fixed inset-0 z-modal flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="close"
      >
        <div
          class="thinking-card bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 w-full max-w-4xl mx-4 overflow-hidden flex flex-col max-h-[85vh]"
        >
          <div class="px-5 py-3.5 border-b border-apple-gray-200/80 dark:border-apple-gray-700/80 flex items-center justify-between flex-shrink-0">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-7 h-7 rounded-full bg-brian-blue/10 text-brian-blue flex items-center justify-center flex-shrink-0">
                <Brain :size="15" />
              </span>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">思考过程</h3>
                  <Loader2 v-if="thinkingLoading || overallStreaming" :size="13" class="animate-spin text-brian-blue" />
                  <span v-else-if="pendingPermissions.length > 0" class="px-1.5 py-0.5 rounded-md text-4xs font-medium bg-brian-blue/10 text-brian-blue">等待授权</span>
                  <span v-else-if="!targetMsgId && chatUi.runActive" class="px-1.5 py-0.5 rounded-md text-4xs font-medium bg-brian-blue/10 text-brian-blue">思考中</span>
                  <span v-else class="px-1.5 py-0.5 rounded-md text-4xs font-medium bg-success-green/10 text-success-green">已完成</span>
                </div>
                <p class="text-2xs text-apple-gray-400 truncate">
                  <span v-if="thinkingLoading">正在加载思考过程…</span>
                  <span v-else-if="overallStreaming">正在思考，内容实时更新…</span>
                  <span v-else-if="!targetMsgId && chatUi.runActive">正在思考，内容即将展现…</span>
                  <span v-else-if="timeline.length">{{ timeline.length }} 个环节 · {{ toolTraces.length }} 次技能调用 · {{ permissionTraces.length }} 次授权</span>
                  <span v-else>暂无可展示的思考内容</span>
                </p>
              </div>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 transition-colors flex-shrink-0" @click="close">
              <X :size="18" />
            </button>
          </div>

          <div class="px-5 py-4 flex-1 overflow-y-auto space-y-4">
            <div v-if="thinkingLoading && isEmpty" class="flex flex-col items-center justify-center py-14 space-y-3">
              <span class="w-11 h-11 rounded-full bg-brian-blue/10 flex items-center justify-center">
                <Loader2 :size="22" class="animate-spin text-brian-blue" />
              </span>
              <p class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 animate-pulse">正在加载思考过程…</p>
            </div>

            <template v-else>
              <section v-if="pendingPermissions.length > 0" class="rounded-2xl border border-brian-blue/25 bg-white dark:bg-apple-gray-900/40 overflow-hidden">
                <div class="px-4 py-3 flex items-center gap-2">
                  <ShieldCheck :size="14" class="text-brian-blue flex-shrink-0" />
                  <h4 class="text-xs font-semibold text-apple-gray-900 dark:text-apple-gray-50">等待授权</h4>
                  <span class="text-2xs text-apple-gray-400">{{ pendingPermissions.length }} 项需要确认</span>
                </div>
                <div class="px-4 pb-4 space-y-2">
                  <div v-for="p in pendingPermissions" :key="p.permissionId" class="rounded-xl border border-apple-gray-200/80 dark:border-apple-gray-700/70 p-3">
                    <div class="flex items-center gap-2 min-w-0">
                      <ShieldCheck :size="13" class="text-brian-blue flex-shrink-0" />
                      <span class="text-xs font-mono font-medium text-apple-gray-800 dark:text-apple-gray-100 truncate">{{ p.toolId }}</span>
                      <span class="flex-shrink-0 px-1.5 py-0.5 rounded-full text-4xs font-medium bg-brian-blue/10 text-brian-blue">等待授权</span>
                      <span class="ml-auto hidden sm:inline text-4xs tabular-nums text-apple-gray-400 flex-shrink-0">{{ formatTs(p.askedAt) }}</span>
                    </div>
                    <pre v-if="formatJson(p.input)" class="mt-2 text-2xs font-mono leading-relaxed bg-apple-gray-50 dark:bg-apple-gray-900 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all text-apple-gray-700 dark:text-apple-gray-200">{{ formatJson(p.input) }}</pre>
                    <p v-else class="mt-2 text-2xs text-apple-gray-300">（无参数）</p>
                    <div class="mt-2.5 flex items-center justify-end gap-2">
                      <button
                        class="px-3 py-1.5 rounded-lg text-xs text-error-red hover:bg-error-red/10 disabled:opacity-50 transition-colors"
                        :disabled="permittingId === p.permissionId"
                        @click="confirmPermission(p.permissionId, false, false)"
                      >
                        拒绝
                      </button>
                      <button
                        class="px-3 py-1.5 rounded-lg text-xs text-brian-blue hover:bg-brian-blue/10 disabled:opacity-50 transition-colors"
                        title="以后执行该技能不再询问"
                        :disabled="permittingId === p.permissionId"
                        @click="confirmPermission(p.permissionId, true, true)"
                      >
                        始终允许
                      </button>
                      <button
                        class="px-3 py-1.5 rounded-lg text-xs text-white bg-brian-blue hover:bg-brian-blue/90 disabled:opacity-50 transition-colors flex items-center gap-1"
                        :disabled="permittingId === p.permissionId"
                        @click="confirmPermission(p.permissionId, true, false)"
                      >
                        <Loader2 v-if="permittingId === p.permissionId" :size="12" class="animate-spin" />
                        <Check v-else :size="12" />
                        允许
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section v-if="runOverview" class="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900/40 p-4">
                <div class="flex items-center gap-2 mb-3">
                  <Bot :size="14" class="text-brian-blue" />
                  <h4 class="text-xs font-semibold text-apple-gray-900 dark:text-apple-gray-50">运行概览</h4>
                  <span
                    class="ml-auto px-2 py-0.5 rounded-full text-4xs font-medium"
                    :class="String(runOverview.status) === 'finished'
                      ? 'bg-success-green/10 text-success-green'
                      : /fail|error/i.test(String(runOverview.status)) ? 'bg-error-red/10 text-error-red' : 'bg-brian-blue/10 text-brian-blue'"
                  >
                    {{ String(runOverview.status) === 'finished' ? '执行完成' : runOverview.status }}
                  </span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div class="rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/60 border border-apple-gray-200/60 dark:border-apple-gray-700/60 px-3 py-2">
                    <p class="text-4xs text-apple-gray-400 flex items-center gap-1"><Clock3 :size="10" />耗时</p>
                    <p class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mt-0.5">{{ formatDuration(runOverview.durationMs) }}</p>
                  </div>
                  <div class="rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/60 border border-apple-gray-200/60 dark:border-apple-gray-700/60 px-3 py-2">
                    <p class="text-4xs text-apple-gray-400 flex items-center gap-1"><Zap :size="10" />Token 输入/输出</p>
                    <p class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mt-0.5">{{ runOverview.inputTokens ?? 0 }} / {{ runOverview.outputTokens ?? runOverview.tokenUsage }}</p>
                  </div>
                  <div class="rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/60 border border-apple-gray-200/60 dark:border-apple-gray-700/60 px-3 py-2">
                    <p class="text-4xs text-apple-gray-400 flex items-center gap-1"><Wrench :size="10" />技能调用</p>
                    <p class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mt-0.5">{{ runOverview.toolCount }} 次</p>
                  </div>
                  <div class="rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/60 border border-apple-gray-200/60 dark:border-apple-gray-700/60 px-3 py-2">
                    <p class="text-4xs text-apple-gray-400 flex items-center gap-1"><ShieldCheck :size="10" />授权</p>
                    <p class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mt-0.5">{{ runOverview.permissionCount }} 次</p>
                  </div>
                </div>
                <div v-if="overviewComponents" class="mt-3 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-800">
                  <p class="text-4xs font-medium text-apple-gray-400 mb-1.5">组件清单</p>
                  <div class="flex items-center gap-1.5 flex-wrap text-2xs">
                    <span
                      v-for="c in overviewComponents"
                      :key="`${c.kind}-${c.id || c.name}`"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300"
                      :title="c.id ? `${c.kind}：${c.name}（ID：${c.id}）` : c.kind"
                    >
                      <component :is="c.icon" :size="11" class="text-apple-gray-400" />
                      <span class="font-medium">{{ c.name || '（未知）' }}</span>
                    </span>
                    <span v-if="overviewComponents.length === 0" class="text-apple-gray-300">（无组件绑定）</span>
                  </div>
                </div>
              </section>

              <section class="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900/40 overflow-hidden">
                <button class="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/60 transition-colors" @click="secContext = !secContext">
                  <MessagesSquare :size="14" class="text-brian-blue flex-shrink-0" />
                  <h4 class="text-xs font-semibold text-apple-gray-900 dark:text-apple-gray-50">基础上下文</h4>
                  <span class="text-2xs text-apple-gray-400">{{ contextRounds.length }} 轮 · {{ contextBlocks.filter((b) => b.context).length }} 块</span>
                  <ChevronDown :size="14" class="ml-auto text-apple-gray-400 transition-transform" :class="{ 'rotate-180': !secContext }" />
                </button>
                <div v-if="secContext" class="px-4 pb-4 space-y-3">
                  <ThinkingContext :blocks="contextBlocks" />
                  <div v-if="contextRounds.length > 0" class="space-y-2">
                    <div
                      v-for="round in contextRounds"
                      :key="round.round"
                      :data-anchor="round.targetKey || `ctx-${round.round}`"
                      class="rounded-xl border border-apple-gray-200/70 dark:border-apple-gray-700/60 p-3"
                    >
                      <p class="text-2xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">第 {{ round.round }} 轮 · {{ round.messageCount }} 条消息</p>
                      <div class="space-y-1.5 max-h-56 overflow-y-auto">
                        <div v-for="(m, mi) in round.messages" :key="mi" class="text-2xs leading-relaxed rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900 px-2.5 py-1.5">
                          <span class="font-mono font-medium text-brian-blue mr-1.5">[{{ m.role }}]</span>
                          <span class="text-apple-gray-600 dark:text-apple-gray-300 break-words">{{ m.content }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section class="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900/40 overflow-hidden">
                <div class="w-full flex items-center gap-2 px-4 py-3">
                  <ListTree :size="14" class="text-brian-blue flex-shrink-0" />
                  <h4 class="text-xs font-semibold text-apple-gray-900 dark:text-apple-gray-50">执行时间线</h4>
                  <span class="text-2xs text-apple-gray-400">{{ timeline.length }} 个环节</span>
                  <Loader2 v-if="overallStreaming || (!targetMsgId && chatUi.runActive)" :size="12" class="animate-spin text-brian-blue" />
                </div>
                <div class="px-4 pb-4">
                  <div
                    v-if="timeline.length > 0"
                    ref="timelineListRef"
                    class="max-h-96 overflow-y-auto pr-1 py-0.5 pl-0.5"
                  >
                    <ol
                      class="relative ml-2 border-l-2 border-apple-gray-100 dark:border-apple-gray-700/80 space-y-1"
                    >
                      <li
                        v-for="(item, idx) in timelineWithElapsed"
                        :key="`${item.event}-${item.seq}-${idx}`"
                        class="group relative pl-6 pb-3 last:pb-0"
                        :class="item.target ? 'cursor-pointer' : ''"
                        @click="scrollToAnchor(item.target)"
                      >
                        <span class="absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-white dark:border-apple-gray-900 shadow-sm" :class="kindDot(item.kind)" />
                        <div class="flex items-start gap-2 min-w-0">
                          <component :is="kindIcon(item.kind)" :size="13" class="mt-0.5 flex-shrink-0 text-apple-gray-400" />
                          <div class="min-w-0 flex-1">
                            <div class="flex items-baseline gap-2 flex-wrap">
                              <p
                                class="text-xs font-medium text-apple-gray-800 dark:text-apple-gray-100 leading-relaxed"
                                :title="item.tooltip || undefined"
                              >{{ item.title }}</p>
                              <span v-if="item.ts" class="text-4xs tabular-nums text-apple-gray-300">{{ formatTs(item.ts) }}</span>
                              <span v-if="item.elapsedMs" class="text-4xs tabular-nums text-brian-blue/70 flex items-center gap-0.5"><Clock3 :size="10" />{{ formatDuration(item.elapsedMs) }}</span>
                              <span v-if="item.target" class="text-4xs text-brian-blue opacity-0 group-hover:opacity-100 transition-opacity">查看详情 →</span>
                            </div>
                            <p v-if="item.detail" class="mt-0.5 text-2xs leading-relaxed text-apple-gray-500 dark:text-apple-gray-400 break-words line-clamp-3">{{ item.detail }}</p>
                          </div>
                        </div>
                      </li>
                    </ol>
                  </div>
                  <div v-else class="flex items-center gap-2 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/60 px-3 py-3 text-2xs text-apple-gray-400">
                    <Loader2 v-if="thinkingLoading || overallStreaming || (!targetMsgId && chatUi.runActive)" :size="12" class="animate-spin text-brian-blue flex-shrink-0" />
                    <span v-if="thinkingLoading">正在加载执行时间线…</span>
                    <span v-else-if="overallStreaming">执行环节将实时追加…</span>
                    <span v-else-if="!targetMsgId && chatUi.runActive">等待执行环节…</span>
                    <span v-else>暂无执行环节</span>
                  </div>
                </div>
              </section>

              <section v-if="toolTraces.length + answeredPermissions.length + agentDetailBlocks.length + runNodes.length > 0" class="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900/40 overflow-hidden">
                <div class="flex items-center gap-2 px-4 py-3 border-b border-apple-gray-100 dark:border-apple-gray-800">
                  <Brain :size="14" class="text-brian-blue flex-shrink-0" />
                  <h4 class="text-xs font-semibold text-apple-gray-900 dark:text-apple-gray-50">执行内容</h4>
                  <span class="text-2xs text-apple-gray-400">{{ toolTraces.length }} 次工具 · {{ answeredPermissions.length }} 次授权 · {{ agentDetailBlocks.length }} 个思考 · {{ runNodes.length }} 个节点</span>
                </div>
                <div class="p-4 space-y-6">

                  <div v-if="runNodes.length > 0">
                    <button class="w-full flex items-center gap-2 pb-1.5 text-left border-b border-apple-gray-100 dark:border-apple-gray-800 hover:opacity-80 transition-opacity" @click="secNodes = !secNodes">
                      <ListTree :size="13" class="text-brian-blue flex-shrink-0" />
                      <h5 class="text-xs font-semibold text-apple-gray-900 dark:text-apple-gray-50">运行节点</h5>
                      <span class="text-2xs text-apple-gray-400">{{ runNodes.length }} 个</span>
                      <ChevronDown :size="13" class="ml-auto text-apple-gray-400 transition-transform" :class="{ 'rotate-180': !secNodes }" />
                    </button>
                    <div v-if="secNodes" class="mt-2.5 space-y-2">
                      <div
                        v-for="n in runNodes"
                        :key="n.targetKey"
                        :data-anchor="n.targetKey"
                        class="rounded-xl border border-apple-gray-200/80 dark:border-apple-gray-700/70 overflow-hidden"
                      >
                        <button class="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-apple-gray-50/70 dark:bg-apple-gray-800/50 hover:bg-brian-blue/[0.04] transition-colors" @click="toggleNode(n.targetKey)">
                          <component :is="kindIcon(n.kind)" :size="13" class="flex-shrink-0 text-apple-gray-400" />
                          <span class="text-xs font-medium text-apple-gray-800 dark:text-apple-gray-100 truncate">{{ n.title }}</span>
                          <ChevronRight :size="13" class="ml-auto text-apple-gray-300 transition-transform flex-shrink-0" :class="{ 'rotate-90': expandedNodes.has(n.targetKey) }" />
                        </button>
                        <div v-if="expandedNodes.has(n.targetKey)" class="px-3 py-2.5 space-y-1.5 border-t border-apple-gray-100 dark:border-apple-gray-800">
                          <p v-if="n.detail" class="text-2xs text-apple-gray-400 break-words">{{ n.detail }}</p>
                          <div
                            v-for="f in n.fields"
                            :key="f.label"
                            class="grid grid-cols-[96px_1fr] gap-2 text-2xs"
                          >
                            <span class="text-apple-gray-400">{{ f.label }}</span>
                            <span class="text-apple-gray-700 dark:text-apple-gray-200 break-words font-mono" :title="f.id || undefined">{{ f.value }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-if="toolTraces.length > 0">
                    <button class="w-full flex items-center gap-2 pb-1.5 text-left border-b border-apple-gray-100 dark:border-apple-gray-800 hover:opacity-80 transition-opacity" @click="secTools = !secTools">
                      <Wrench :size="13" class="text-brian-blue flex-shrink-0" />
                      <h5 class="text-xs font-semibold text-apple-gray-900 dark:text-apple-gray-50">技能调用</h5>
                      <span class="text-2xs text-apple-gray-400">{{ toolTraces.length }} 次</span>
                      <ChevronDown :size="13" class="ml-auto text-apple-gray-400 transition-transform" :class="{ 'rotate-180': !secTools }" />
                    </button>
                    <div v-if="secTools" class="mt-2.5 space-y-2">
                      <div
                        v-for="t in toolTraces"
                        :key="String(t.partId || t.index)"
                        :data-anchor="t.targetKey || `tool-${t.partId || `idx-${t.index}`}`"
                        class="rounded-xl border border-apple-gray-200/80 dark:border-apple-gray-700/70 overflow-hidden"
                      >
                        <button class="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-apple-gray-50/70 dark:bg-apple-gray-800/50 hover:bg-brian-blue/[0.04] transition-colors" @click="toggleTool(String(t.partId || t.index))">
                          <span class="w-5 h-5 rounded-md bg-brian-blue/10 text-brian-blue text-4xs font-bold flex items-center justify-center flex-shrink-0">{{ t.index }}</span>
                          <span class="text-xs font-mono font-medium text-apple-gray-800 dark:text-apple-gray-100 truncate">{{ t.toolId }}</span>
                          <span
                            v-if="t.componentName"
                            class="flex-shrink-0 px-1.5 py-0.5 rounded-full text-4xs font-medium bg-brian-blue/10 text-brian-blue max-w-44 truncate"
                            :title="`${t.componentKind === 'skill' ? 'Skill' : 'MCP'}：${t.componentName}（ID：${t.componentId}）${t.componentSubTool ? ` · 工具：${t.componentSubTool}` : ''}`"
                          >{{ t.componentName }}<template v-if="t.componentSubTool"> · {{ t.componentSubTool }}</template></span>
                          <span
                            v-else-if="t.builtin"
                            class="flex-shrink-0 px-1.5 py-0.5 rounded-full text-4xs font-medium bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-500 dark:text-apple-gray-400"
                          >内置</span>
                          <span
                            class="flex-shrink-0 px-1.5 py-0.5 rounded-full text-4xs font-medium"
                            :class="toolStatusMeta(t.status).cls"
                          >
                            {{ toolStatusMeta(t.status).text }}
                          </span>
                          <span v-if="t.elapsedMs" class="hidden sm:inline text-4xs text-apple-gray-400">{{ formatDuration(t.elapsedMs) }}</span>
                          <ChevronRight :size="13" class="ml-auto text-apple-gray-300 transition-transform flex-shrink-0" :class="{ 'rotate-90': expandedTools.has(String(t.partId || t.index)) }" />
                        </button>
                        <div v-if="expandedTools.has(String(t.partId || t.index))" class="px-3 py-2.5 space-y-2 border-t border-apple-gray-100 dark:border-apple-gray-800">
                          <div v-if="t.componentName" class="grid grid-cols-[96px_1fr] gap-2 text-2xs">
                            <span class="text-apple-gray-400">所属{{ t.componentKind === 'skill' ? 'Skill' : 'MCP' }}</span>
                            <span class="text-apple-gray-700 dark:text-apple-gray-200 break-words" :title="`ID：${t.componentId}`">
                              {{ t.componentName }}<span v-if="t.componentId" class="ml-1.5 font-mono text-4xs text-apple-gray-400">{{ t.componentId }}</span>
                            </span>
                          </div>
                          <div>
                            <p class="text-4xs font-medium text-apple-gray-400 mb-1">输入参数</p>
                            <pre v-if="formatJson(t.params)" class="text-2xs font-mono leading-relaxed bg-apple-gray-50 dark:bg-apple-gray-900 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all text-apple-gray-700 dark:text-apple-gray-200">{{ formatJson(t.params) }}</pre>
                            <p v-else class="text-2xs text-apple-gray-300">（无参数）</p>
                          </div>
                          <div>
                            <p class="text-4xs font-medium text-apple-gray-400 mb-1">返回结果</p>
                            <div v-if="renderedToolResults.get(String(t.partId || t.index))" class="markdown-body text-2xs leading-relaxed bg-apple-gray-50 dark:bg-apple-gray-900 rounded-lg p-2.5 break-words" v-html="renderedToolResults.get(String(t.partId || t.index))" />
                            <p v-else class="text-2xs text-apple-gray-300">（无返回）</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-if="answeredPermissions.length > 0">
                    <button class="w-full flex items-center gap-2 pb-1.5 text-left border-b border-apple-gray-100 dark:border-apple-gray-800 hover:opacity-80 transition-opacity" @click="secPermissions = !secPermissions">
                      <ShieldCheck :size="13" class="text-brian-blue flex-shrink-0" />
                      <h5 class="text-xs font-semibold text-apple-gray-900 dark:text-apple-gray-50">授权记录</h5>
                      <span class="text-2xs text-apple-gray-400">{{ answeredPermissions.length }} 次</span>
                      <ChevronDown :size="13" class="ml-auto text-apple-gray-400 transition-transform" :class="{ 'rotate-180': !secPermissions }" />
                    </button>
                    <div v-if="secPermissions" class="mt-2.5 space-y-2">
                      <div
                        v-for="p in answeredPermissions"
                        :key="p.permissionId || `${p.toolId}-${p.askedAt}`"
                        :data-anchor="p.targetKey || `perm-${p.permissionId || `idx-${p.toolId}-${p.askedAt}`}`"
                        class="rounded-xl border border-apple-gray-200/80 dark:border-apple-gray-700/70 overflow-hidden"
                      >
                        <button class="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-apple-gray-50/70 dark:bg-apple-gray-800/50 hover:bg-brian-blue/[0.04] transition-colors" @click="togglePerm(p.permissionId || `${p.toolId}-${p.askedAt}`)">
                          <ShieldCheck :size="13" class="flex-shrink-0" :class="permStatusMeta(p.status).iconCls" />
                          <span class="text-xs font-mono text-apple-gray-800 dark:text-apple-gray-100 truncate">{{ p.toolId }}</span>
                          <span
                            v-if="p.componentName"
                            class="flex-shrink-0 px-1.5 py-0.5 rounded-full text-4xs font-medium bg-brian-blue/10 text-brian-blue max-w-44 truncate"
                            :title="`${p.componentKind === 'skill' ? 'Skill' : 'MCP'}：${p.componentName}（ID：${p.componentId}）${p.componentSubTool ? ` · 工具：${p.componentSubTool}` : ''}`"
                          >{{ p.componentName }}<template v-if="p.componentSubTool"> · {{ p.componentSubTool }}</template></span>
                          <span
                            v-else-if="p.builtin"
                            class="flex-shrink-0 px-1.5 py-0.5 rounded-full text-4xs font-medium bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-500 dark:text-apple-gray-400"
                          >内置</span>
                          <span
                            class="flex-shrink-0 px-1.5 py-0.5 rounded-full text-4xs font-medium"
                            :class="permStatusMeta(p.status).cls"
                          >
                            {{ permStatusMeta(p.status).text }}
                          </span>
                          <span v-if="p.autoApproved" class="flex-shrink-0 px-1.5 py-0.5 rounded-full text-4xs bg-brian-blue/10 text-brian-blue">自动放行</span>
                          <span class="ml-auto hidden sm:inline text-4xs tabular-nums text-apple-gray-400 flex-shrink-0">{{ formatTs(p.answeredAt || p.askedAt) }}</span>
                          <ChevronRight :size="13" class="text-apple-gray-300 transition-transform flex-shrink-0" :class="{ 'rotate-90': expandedPerms.has(p.permissionId || `${p.toolId}-${p.askedAt}`) }" />
                        </button>
                        <div v-if="expandedPerms.has(p.permissionId || `${p.toolId}-${p.askedAt}`)" class="px-3 py-2.5 space-y-1.5 border-t border-apple-gray-100 dark:border-apple-gray-800 text-2xs">
                          <div v-if="p.componentName" class="grid grid-cols-[96px_1fr] gap-2">
                            <span class="text-apple-gray-400">所属{{ p.componentKind === 'skill' ? 'Skill' : 'MCP' }}</span>
                            <span class="text-apple-gray-700 dark:text-apple-gray-200 break-words" :title="`ID：${p.componentId}`">
                              {{ p.componentName }}<span v-if="p.componentId" class="ml-1.5 font-mono text-4xs text-apple-gray-400">{{ p.componentId }}</span>
                            </span>
                          </div>
                          <div class="flex items-center gap-3 text-apple-gray-400">
                            <span>询问：{{ formatTs(p.askedAt) || '—' }}</span>
                            <span>应答：{{ formatTs(p.answeredAt) || '—' }}</span>
                          </div>
                          <div>
                            <p class="text-4xs font-medium text-apple-gray-400 mb-1">授权参数</p>
                            <pre v-if="formatJson(p.input)" class="font-mono leading-relaxed bg-apple-gray-50 dark:bg-apple-gray-900 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all text-apple-gray-700 dark:text-apple-gray-200">{{ formatJson(p.input) }}</pre>
                            <p v-else class="text-apple-gray-300">（无参数）</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-if="agentDetailBlocks.length > 0" data-anchor="agent-0">
                    <button class="w-full flex items-center gap-2 pb-1.5 text-left border-b border-apple-gray-100 dark:border-apple-gray-800 hover:opacity-80 transition-opacity" @click="secAgent = !secAgent">
                      <Brain :size="13" class="text-brian-blue flex-shrink-0" />
                      <h5 class="text-xs font-semibold text-apple-gray-900 dark:text-apple-gray-50">深度思考</h5>
                      <span class="text-2xs text-apple-gray-400">{{ agentDetailBlocks.length }} 个</span>
                      <ChevronDown :size="13" class="ml-auto text-apple-gray-400 transition-transform" :class="{ 'rotate-180': !secAgent }" />
                    </button>
                    <div v-if="secAgent" class="mt-2.5">
                      <div
                        v-for="block in agentDetailBlocks"
                        :key="block.id"
                        class="rounded-xl transition-shadow"
                      >
                        <ThinkingBlockView
                          :block="block"
                          hide-context
                          default-tab="io"
                          :start-expanded="agentDetailBlocks.length <= 1"
                        />
                      </div>
                    </div>
                  </div>

                </div>
              </section>

            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.thinking-jump-flash {
  animation: thinking-jump-flash 1.5s ease;
  border-radius: 0.75rem;
}

@keyframes thinking-jump-flash {
  0% { box-shadow: 0 0 0 3px var(--brian-accent-ring, rgba(0, 122, 255, 0.55)); }
  60% { box-shadow: 0 0 0 3px var(--brian-accent-ring, rgba(0, 122, 255, 0.22)); }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.thinking-card {
  will-change: opacity, transform, filter;
}
</style>
