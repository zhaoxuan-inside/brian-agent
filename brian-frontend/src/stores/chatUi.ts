import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PlanningData } from '@/api/types'
import { chatApi } from '@/api'
import {
  reduceObservation, replayObservation, parsePayload, kindOf,
  type RunObservation, type TaskEvent,
} from '@brian-agent/shared'

/**
 * chatUi：思考弹窗与运行状态（ADR-013）。
 * 唯一状态源 observation（shared reducer 产出）：实时=SSE 叠加，历史=observation 接口重放。
 */
export const useChatUiStore = defineStore('chatUi', () => {
  const observation = ref<RunObservation | null>(null)

  const thinkingModalVisible = ref(false)
  const thinkingTargetMsgId = ref<string | null>(null)
  const thinkingLoading = ref(false)
  const thinkingOrigin = ref<{ left: number; top: number; width: number; height: number } | null>(null)
  const thinkingOpenedAt = ref(0)
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null

  const planning = ref<PlanningData>({ status: 'idle' })
  const runActive = ref(false)

  /** 当前问答作用域：本次问答涉及的所有 botMsgId（弹窗按问答隔离） */
  const activeRunMsgIds = ref<Set<string>>(new Set())
  const evalResultVisible = ref(false)
  const evalResultLoading = ref(false)
  const evalResult = ref<{ answer: string; created: number; elapsed_ms: number; agent_name: string } | null>(null)
  const evalResultError = ref('')
  const evalTraceId = ref('')

  const isLive = computed(() => !thinkingTargetMsgId.value && runActive.value)
  const overallStreaming = computed(() =>
    !!observation.value && ['accepted', 'assembling', 'reasoning', 'acting', 'writing', 'evaluating'].includes(observation.value.phase),
  )

  /** SSE 事件 → reducer（seq 幂等，历史拉取与实时叠加天然合流） */
  function applyEvent(raw: Record<string, unknown>): void {
    const ev = toTaskEvent(raw)
    if (!ev) return
    observation.value = reduceObservation(observation.value, ev)
  }

  function toTaskEvent(raw: Record<string, unknown>): TaskEvent | null {
    const type = String(raw.type ?? '')
    if (!type) return null
    return {
      v: 1, seq: Number(raw.seq ?? 0), ts: Number(raw.ts ?? Date.now()),
      session_id: String(raw.session_id ?? ''), run_id: String(raw.run_id ?? ''),
      work_id: String(raw.work_id ?? ''), agent_id: raw.agent_id ? String(raw.agent_id) : undefined,
      round: typeof raw.round === 'number' ? raw.round : undefined,
      kind: String(raw.kind ?? kindOf(type)), type,
      payload: parsePayload(type, raw.payload),
    }
  }

  /** 历史重放（弹窗打开/断线补齐）：先拉历史，SSE 增量随后叠加 */
  async function loadObservation(opts: { infoId?: string; runId?: string } = {}): Promise<void> {
    try {
      const res = await chatApi.observation(opts)
      if (!res.run_id) return
      const events = (res.events ?? []) as Array<Record<string, unknown>>
      observation.value = replayObservation(events.map((e) => toTaskEvent(e)).filter((e): e is TaskEvent => !!e))
    } catch {
      observation.value = observation.value ?? null
    }
  }

  function resetObservation(): void {
    observation.value = null
  }

  function setThinkingOrigin(rect: { left: number; top: number; width: number; height: number } | null) {
    thinkingOrigin.value = rect
  }

  function startThinkingLoading(msgId: string | null = null) {
    thinkingTargetMsgId.value = msgId
    thinkingLoading.value = true
    thinkingOpenedAt.value = Date.now()
    thinkingModalVisible.value = true
    void loadObservation(msgId ? { infoId: msgId } : {})
  }

  /** 运行开始时自动打开实时弹窗 */
  function ensureLiveThinking() {
    if (thinkingModalVisible.value) return
    thinkingTargetMsgId.value = null
    thinkingLoading.value = false
    thinkingOpenedAt.value = Date.now()
    thinkingModalVisible.value = true
  }

  function closeThinkingModal() {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer)
      autoCloseTimer = null
    }
    thinkingModalVisible.value = false
  }

  function cleanupThinkingModal() {
    if (thinkingModalVisible.value) return
    thinkingTargetMsgId.value = null
    thinkingLoading.value = false
    thinkingOrigin.value = null
    planning.value = { status: 'idle' }
  }

  function requestAutoCloseThinkingModal() {
    if (!thinkingModalVisible.value) return
    const MIN_OPEN_MS = 3500
    const remaining = MIN_OPEN_MS - (Date.now() - thinkingOpenedAt.value)
    if (remaining <= 0) {
      closeThinkingModal()
      return
    }
    if (autoCloseTimer) clearTimeout(autoCloseTimer)
    autoCloseTimer = setTimeout(() => {
      autoCloseTimer = null
      closeThinkingModal()
    }, remaining)
  }

  async function openEvalResult(infoId: string) {
    evalResultVisible.value = true
    evalResultLoading.value = true
    evalResult.value = null
    evalResultError.value = ''
    evalTraceId.value = ''
    try {
      const res = await chatApi.evalResult(infoId)
      evalTraceId.value = res.trace_id || ''
      if (res.found && res.evaluation) {
        evalResult.value = res.evaluation
      } else {
        evalResultError.value = '暂无评估结果（评估可能尚未完成，稍后重试）'
      }
    } catch (e) {
      evalResultError.value = e instanceof Error ? e.message : '加载评估结果失败'
    } finally {
      evalResultLoading.value = false
    }
  }

  function closeEvalResult() {
    evalResultVisible.value = false
    evalResult.value = null
    evalResultLoading.value = false
    evalTraceId.value = ''
  }

  function resetPlanning() {
    planning.value = { status: 'idle' }
  }

  function setRunActive(active: boolean) {
    runActive.value = active
  }

  function updatePlanning(patch: Partial<PlanningData>) {
    planning.value = { ...planning.value, ...patch } as PlanningData
  }

  function beginRunScope(msgId: string) {
    if (!msgId || activeRunMsgIds.value.has(msgId)) return
    const next = new Set(activeRunMsgIds.value)
    next.add(msgId)
    activeRunMsgIds.value = next
  }

  function resetRunScope() {
    activeRunMsgIds.value = new Set()
  }

  return {
    observation, applyEvent, loadObservation, resetObservation, toTaskEvent,
    thinkingModalVisible, thinkingTargetMsgId, thinkingLoading, thinkingOrigin, runActive,
    isLive, overallStreaming,
    planning, activeRunMsgIds, beginRunScope, resetRunScope,
    setThinkingOrigin, startThinkingLoading, ensureLiveThinking,
    closeThinkingModal, cleanupThinkingModal, requestAutoCloseThinkingModal, setRunActive, resetPlanning,
    updatePlanning,
    evalResultVisible, evalResultLoading, evalResult, evalResultError, evalTraceId,
    openEvalResult, closeEvalResult,
  }
})
