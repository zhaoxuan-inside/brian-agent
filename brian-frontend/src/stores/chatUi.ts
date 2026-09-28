import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Block, PlanningData, AgentDagData, AgentExecutionStatus, AgentRuntimeInfo, ThinkingTrace, ThinkingTimelineItem, ThinkingContextRound } from '@/api/types'
import { chatApi } from '@/api'

export const useChatUiStore = defineStore('chatUi', () => {
  
  const thinkingModalVisible = ref(false)
  const thinkingTargetMsgId = ref<string | null>(null)
  const thinkingBlocks = ref<Block[]>([])
  
  const liveTimeline = ref<ThinkingTimelineItem[]>([])
  
  
  const liveContextRounds = ref<ThinkingContextRound[]>([])
  
  const thinkingLoading = ref(false)
  const dagLoading = ref(false)
  const blocksLoading = ref(false)
  
  const planning = ref<PlanningData>({ status: 'idle' })
  const thinkingDag = ref<AgentDagData | null>(null)
  
  const thinkingTrace = ref<ThinkingTrace | null>(null)
  
  const thinkingOrigin = ref<{ left: number; top: number; width: number; height: number } | null>(null)
  
  const thinkingOpenedAt = ref(0)
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null
  
  const runActive = ref(false)

  /** 当前问答作用域：本次问答（含意图确认等延续交互）涉及的所有 botMsgId，用于思考弹窗按问答隔离 */
  const activeRunMsgIds = ref<Set<string>>(new Set())

  const agentExecutions = ref<Record<string, AgentRuntimeInfo>>({})
  
  const taskExecutions = ref<Record<string, AgentRuntimeInfo>>({})
  
  const evalResultVisible = ref(false)
  const evalResultLoading = ref(false)
  const evalResult = ref<{ answer: string; created: number; elapsed_ms: number; agent_name: string } | null>(null)
  const evalResultError = ref('')
  const evalTraceId = ref('')


  function setThinkingOrigin(rect: { left: number; top: number; width: number; height: number } | null) {
    thinkingOrigin.value = rect
  }

  function clearThinkingOrigin() {
    thinkingOrigin.value = null
  }

  function startThinkingLoading(msgId: string | null = null) {
    thinkingTargetMsgId.value = msgId
    thinkingBlocks.value = []
    thinkingDag.value = null
    thinkingTrace.value = null
    thinkingLoading.value = true
    dagLoading.value = false
    blocksLoading.value = true
    thinkingOpenedAt.value = Date.now()
    thinkingModalVisible.value = true
  }

  
  function ensureLiveThinking() {
    if (thinkingModalVisible.value) return
    thinkingTargetMsgId.value = null
    thinkingBlocks.value = []
    thinkingDag.value = null
    thinkingTrace.value = null
    thinkingLoading.value = false
    dagLoading.value = false
    blocksLoading.value = false
    thinkingOpenedAt.value = Date.now()
    thinkingModalVisible.value = true
  }

  function setThinkingDag(dag: AgentDagData | null) {
    thinkingDag.value = dag
    dagLoading.value = false
    if (!blocksLoading.value) {
      thinkingLoading.value = false
    }
  }

  function setThinkingBlocks(blocks: Block[]) {
    thinkingBlocks.value = blocks
    blocksLoading.value = false
    thinkingLoading.value = false
  }

  function setThinkingTrace(trace: ThinkingTrace | null) {
    thinkingTrace.value = trace
  }

  function openThinkingModal(msgId: string | null = null, blocks: Block[] = [], dag: AgentDagData | null = null, trace: ThinkingTrace | null = null) {
    thinkingTargetMsgId.value = msgId
    thinkingBlocks.value = blocks
    thinkingDag.value = dag
    thinkingTrace.value = trace
    thinkingLoading.value = false
    dagLoading.value = false
    blocksLoading.value = false
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
    thinkingBlocks.value = []
    thinkingDag.value = null
    thinkingTrace.value = null
    thinkingLoading.value = false
    dagLoading.value = false
    blocksLoading.value = false
    resetPlanning()
    resetAgentStatus()
    thinkingOrigin.value = null
  }

  
  function requestAutoCloseThinkingModal() {
    if (!thinkingModalVisible.value) return
    const MIN_OPEN_MS = 3500
    const elapsed = Date.now() - thinkingOpenedAt.value
    const remaining = MIN_OPEN_MS - elapsed
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
    evalResultError.value = ''
    evalResultLoading.value = false
    evalTraceId.value = ''
  }

  
  function resetPlanning() {
    planning.value = { status: 'idle' }
  }

  function updatePlanning(patch: Partial<PlanningData>) {
    planning.value = { ...planning.value, ...patch } as PlanningData
  }

  
  const NODE_STATUS_MAP: Record<AgentExecutionStatus, string> = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    SUCCESS: 'COMPLETED',
    ERROR: 'EXEC_FAILED',
  }

  
  
  const STATUS_ORDER: Record<AgentExecutionStatus, number> = {
    PENDING: 0,
    RUNNING: 1,
    SUCCESS: 2,
    ERROR: 2,
  }

  function setAgentStatus(agentId: string | undefined, status: AgentExecutionStatus, agentName?: string, taskId?: string) {
    if (!agentId && !taskId) return

    
    if (agentId) {
      const prev = agentExecutions.value[agentId]
      const prevOrder = prev ? (STATUS_ORDER[prev.status] ?? 0) : -1
      const newOrder = STATUS_ORDER[status] ?? 0
      if (!prev || newOrder >= prevOrder) {
        agentExecutions.value = {
          ...agentExecutions.value,
          [agentId]: {
            status,
            agentName: agentName ?? prev?.agentName,
            updatedAt: Date.now(),
          },
        }
      }
    }

    
    const taskKey = taskId || ''
    if (taskKey) {
      const tPrev = taskExecutions.value[taskKey]
      const tPrevOrder = tPrev ? (STATUS_ORDER[tPrev.status] ?? 0) : -1
      const tNewOrder = STATUS_ORDER[status] ?? 0
      if (!tPrev || tNewOrder >= tPrevOrder) {
        taskExecutions.value = {
          ...taskExecutions.value,
          [taskKey]: { status, agentName: agentName ?? tPrev?.agentName, updatedAt: Date.now() },
        }
      }
    }

    
    const dag = planning.value.agentDag
    if (dag && dag.nodes.length > 0) {
      const matched = taskKey
        ? dag.nodes.filter((n) => n.taskId === taskKey || n.id === taskKey)
        : dag.nodes.filter((n) => n.agentId === agentId)
      if (matched.length > 0) {
        for (const node of matched) {
          if (agentName) {
            node.agentName = agentName
            if (!node.label || node.label.startsWith('任务 ') || node.label.startsWith('Task ')) {
              node.label = agentName
            }
          }
          node.status = NODE_STATUS_MAP[status]
        }
        planning.value = { ...planning.value, agentDag: { ...dag, nodes: [...dag.nodes] } }
      }
    }
  }

  function resetLiveTimeline() {
    liveTimeline.value = []
    liveContextRounds.value = []
  }

  function pushLiveTimelineItem(item: ThinkingTimelineItem) {
    liveTimeline.value.push(item)
  }

  function pushLiveContextRound(round: ThinkingContextRound) {
    const idx = liveContextRounds.value.findIndex((r) => r.round === round.round)
    if (idx >= 0) liveContextRounds.value[idx] = round
    else liveContextRounds.value.push(round)
  }

  function updateOrPushLiveTimelineItem(eventKey: string, item: ThinkingTimelineItem) {
    const idx = liveTimeline.value.findIndex(i => i.event === eventKey)
    if (idx >= 0) {
      liveTimeline.value[idx] = item
    } else {
      liveTimeline.value.push(item)
    }
  }

  function resetAgentStatus() {
    agentExecutions.value = {}
    taskExecutions.value = {}
  }

  function setRunActive(active: boolean) {
    runActive.value = active
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

  
  function resetWorkflowState() {
    planning.value = { status: 'idle' }
    thinkingDag.value = null
    thinkingTrace.value = null
    agentExecutions.value = {}
    taskExecutions.value = {}
    runActive.value = false
    liveTimeline.value = []
    liveContextRounds.value = []
    activeRunMsgIds.value = new Set()
  }

  return {
    thinkingModalVisible, thinkingTargetMsgId, thinkingBlocks,
    thinkingLoading, dagLoading, blocksLoading,
    planning, thinkingDag, thinkingTrace, agentExecutions, taskExecutions, thinkingOrigin, runActive,
    activeRunMsgIds, beginRunScope, resetRunScope,
    liveTimeline, resetLiveTimeline, pushLiveTimelineItem, updateOrPushLiveTimelineItem,
    liveContextRounds, pushLiveContextRound,
    setThinkingOrigin, clearThinkingOrigin,
    startThinkingLoading, ensureLiveThinking, setThinkingDag, setThinkingBlocks, setThinkingTrace,
    openThinkingModal, closeThinkingModal, cleanupThinkingModal, requestAutoCloseThinkingModal,
    resetPlanning, updatePlanning,
    setAgentStatus, setRunActive, resetAgentStatus, resetWorkflowState,
    evalResultVisible, evalResultLoading, evalResult, evalResultError, evalTraceId,
    openEvalResult, closeEvalResult,
  }
})
