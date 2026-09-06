import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Block, PlanningData, AgentDagData, AgentExecutionStatus, AgentRuntimeInfo, IntentConfirmation, ClarificationRequest } from '@/api/types'
import { chatApi } from '@/api'

/**
 * 会话页交互 UI 状态：思考过程弹窗、Planning 拆解、Agent/任务执行运行时、
 * 评估结果弹窗、需求理解确认与需求补充弹窗。
 *
 * 与数据型状态（会话/消息/块/图谱，见 stores/session.ts）分离：
 * 流式事件适配层（chatStreamEvents）同时驱动两者，弹窗类组件只依赖本 store。
 */
export const useChatUiStore = defineStore('chatUi', () => {
  // 思考过程弹窗：targetMsgId 为空时展示当前流式思考，否则展示后端接口采集的指定消息思考过程
  const thinkingModalVisible = ref(false)
  const thinkingTargetMsgId = ref<string | null>(null)
  const thinkingBlocks = ref<Block[]>([])
  // 思考过程各模块独立/整体加载状态
  const thinkingLoading = ref(false)
  const dagLoading = ref(false)
  const blocksLoading = ref(false)
  // Planning 策略拆解：planning 为流式期间的实时拆解数据，thinkingDag 为指定消息接口采集的拆解数据
  const planning = ref<PlanningData>({ status: 'idle' })
  const thinkingDag = ref<AgentDagData | null>(null)
  // 思考过程弹窗动画原点（"思考过程"按钮的视口矩形），供入场/退场 FLIP 动画使用
  const thinkingOrigin = ref<{ left: number; top: number; width: number; height: number } | null>(null)
  // 弹窗打开时刻（用于自动关闭的 5 秒最小展示时长判定）
  const thinkingOpenedAt = ref(0)
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null
  // 每个 Agent 独立的执行运行时状态（思考中/成功/失败），key = agent_id
  const agentExecutions = ref<Record<string, AgentRuntimeInfo>>({})
  // 每个任务节点的执行运行时状态（同一 Agent 复用到多个任务时按 task_id 精确区分），key = task_id
  const taskExecutions = ref<Record<string, AgentRuntimeInfo>>({})
  // 评估结果弹窗：展示某消息对应 work 的 Evolutor 评估评分 JSON
  const evalResultVisible = ref(false)
  const evalResultLoading = ref(false)
  const evalResult = ref<{ answer: string; created: number; elapsed_ms: number; agent_name: string } | null>(null)
  const evalResultError = ref('')
  const evalTraceId = ref('')

  // 需求理解确认弹窗：IntentAgent 匹配得分低于阈值时，由 intent_confirmation_required 事件驱动
  const intentConfirmation = ref<IntentConfirmation | null>(null)

  function setIntentConfirmation(data: Record<string, unknown> | null) {
    if (!data) {
      intentConfirmation.value = null
      return
    }
    intentConfirmation.value = {
      session_id: String(data.session_id ?? ''),
      work_id: String(data.work_id ?? ''),
      interact_id: String(data.interact_id ?? ''),
      original_query: String(data.original_query ?? ''),
      understood_requirement: String(data.understood_requirement ?? ''),
      match_score: Number(data.match_score ?? 0),
      threshold_score: Number(data.threshold_score ?? 0),
      reasoning: String(data.reasoning ?? ''),
      kind: String(data.kind ?? 'intent'),
      permission_id: String(data.permission_id ?? ''),
      tool_id: String(data.tool_id ?? ''),
    } as IntentConfirmation
  }

  function clearIntentConfirmation() {
    intentConfirmation.value = null
  }

  // 需求补充弹窗：Planner 识别出需用户补充参数才能执行的任务时，由 clarification_required 事件驱动
  const clarificationRequest = ref<ClarificationRequest | null>(null)

  function setClarificationRequest(data: Record<string, unknown> | null) {
    if (!data) {
      clarificationRequest.value = null
      return
    }
    const raw = Array.isArray(data.clarifications) ? data.clarifications : []
    clarificationRequest.value = {
      session_id: String(data.session_id ?? ''),
      work_id: String(data.work_id ?? ''),
      interact_id: String(data.interact_id ?? ''),
      original_query: String(data.original_query ?? ''),
      clarifications: raw
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
        .map((c) => ({
          question: String((c as Record<string, unknown>).question ?? ''),
          domain: (c as Record<string, unknown>).domain
            ? String((c as Record<string, unknown>).domain)
            : undefined,
          answer: '',
        }))
        .filter((c) => c.question),
    }
  }

  function clearClarificationRequest() {
    clarificationRequest.value = null
  }

  // ===== 思考过程弹窗与独立模块加载状态管理 =====
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
    thinkingLoading.value = true
    dagLoading.value = true
    blocksLoading.value = true
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
    if (!dagLoading.value) {
      thinkingLoading.value = false
    }
  }

  function openThinkingModal(msgId: string | null = null, blocks: Block[] = [], dag: AgentDagData | null = null) {
    thinkingTargetMsgId.value = msgId
    thinkingBlocks.value = blocks
    thinkingDag.value = dag
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
    thinkingTargetMsgId.value = null
    thinkingBlocks.value = []
    thinkingDag.value = null
    thinkingLoading.value = false
    dagLoading.value = false
    blocksLoading.value = false
    resetPlanning()
    resetAgentStatus()
    // thinkingOrigin 保留至退场动画结束后由 ThinkingModal 调用 clearThinkingOrigin 清除
  }

  // ===== 自动关闭：收到关闭事件且弹窗已展示超过 5 秒才关闭；不足 5 秒则延迟到满 5 秒后关闭 =====
  function requestAutoCloseThinkingModal() {
    if (!thinkingModalVisible.value) return
    const MIN_OPEN_MS = 5000
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

  // ===== 评估结果弹窗：打开时按 info_id 拉取 Evolutor 评估结果并展示 =====
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

  // Planning 拆解状态管理（流式期间实时更新）
  function resetPlanning() {
    planning.value = { status: 'idle' }
  }

  function updatePlanning(patch: Partial<PlanningData>) {
    planning.value = { ...planning.value, ...patch } as PlanningData
  }

  // ===== Agent 执行运行时状态管理（每个 Agent 独立的"思考中"状态） =====
  const NODE_STATUS_MAP: Record<AgentExecutionStatus, string> = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    SUCCESS: 'COMPLETED',
    ERROR: 'EXEC_FAILED',
  }

  // ===== 记录某 Agent 的执行状态，并同步到 AgentDAG 节点（供"思考过程"弹窗 AgentDAG 状态着色与执行联动） =====
  // 状态只能向前推进：PENDING → RUNNING → SUCCESS/ERROR，不允许回退（如 SUCCESS → RUNNING）
  const STATUS_ORDER: Record<AgentExecutionStatus, number> = {
    PENDING: 0,
    RUNNING: 1,
    SUCCESS: 2,
    ERROR: 2,
  }

  function setAgentStatus(agentId: string | undefined, status: AgentExecutionStatus, agentName?: string, taskId?: string) {
    if (!agentId && !taskId) return

    // 1) Agent 级运行时状态（供"执行过程"卡片展示），按 agent_id 向前推进
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

    // 2) Task 级运行时状态（供 AgentDAG 节点着色），按 task_id 向前推进
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

    // 3) 同步 AgentDAG 节点状态：优先按 task_id 精确定位节点（同一 Agent 复用多任务时避免广播）
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

  function resetAgentStatus() {
    agentExecutions.value = {}
    taskExecutions.value = {}
  }

  /** 清空会话/开始新会话时重置流式期间产生的交互状态 */
  function resetWorkflowState() {
    planning.value = { status: 'idle' }
    thinkingDag.value = null
    agentExecutions.value = {}
    taskExecutions.value = {}
  }

  return {
    thinkingModalVisible, thinkingTargetMsgId, thinkingBlocks,
    thinkingLoading, dagLoading, blocksLoading,
    planning, thinkingDag, agentExecutions, taskExecutions, thinkingOrigin,
    setThinkingOrigin, clearThinkingOrigin,
    startThinkingLoading, setThinkingDag, setThinkingBlocks,
    openThinkingModal, closeThinkingModal, requestAutoCloseThinkingModal,
    resetPlanning, updatePlanning,
    setAgentStatus, resetAgentStatus, resetWorkflowState,
    evalResultVisible, evalResultLoading, evalResult, evalResultError, evalTraceId,
    openEvalResult, closeEvalResult,
    intentConfirmation, setIntentConfirmation, clearIntentConfirmation,
    clarificationRequest, setClarificationRequest, clearClarificationRequest
  }
})
