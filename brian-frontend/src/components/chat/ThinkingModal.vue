<script setup lang="ts">
import { computed, ref, nextTick, watch, onUnmounted } from 'vue'
import { X, Brain, Loader2, Clock, Layers } from '@lucide/vue'
import { useSessionStore } from '@/stores/session'
import { useChatUiStore } from '@/stores/chatUi'
import type { ThinkingBlock, PlanningData, DagExecutionStep } from '@/api/types'
import ThinkingContext from './ThinkingContext.vue'
import TaskDagFlow from './TaskDagFlow.vue'
import AgentDagFlow from './AgentDagFlow.vue'
import ThinkingBlockView from '@/components/blocks/ThinkingBlock.vue'
import { formatDuration } from '@/utils/format'
const sessionStore = useSessionStore()
const chatUi = useChatUiStore()

const visible = computed(() => chatUi.thinkingModalVisible)
const targetMsgId = computed(() => chatUi.thinkingTargetMsgId)
const thinkingLoading = computed(() => chatUi.thinkingLoading)
const dagLoading = computed(() => chatUi.dagLoading)
const blocksLoading = computed(() => chatUi.blocksLoading)

const nowMs = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null
watch(visible, (v) => {
  if (v) {
    nowMs.value = Date.now()
    tickTimer = setInterval(() => { nowMs.value = Date.now() }, 250)
  } else if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}, { immediate: true })
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
})

const totalElapsedMs = computed(() => {
  const started = targetMsgId.value ? chatUi.thinkingOpenedAt : (chatUi.thinkingStartedAt || chatUi.thinkingOpenedAt)
  if (!started) return 0
  return Math.max(0, nowMs.value - started)
})

const orchestrationSteps = computed<DagExecutionStep[]>(() => planning.value?.executionSteps ?? [])

function nodeTypeLabel(nodeType: string): string {
  switch (nodeType) {
    case 'PLAN_WORK': return '任务拆解'
    case 'BUILD_AGENT_DAG': return '构建 Agent DAG'
    case 'BUILD_WORK_AGENT': return '构建执行 Agent'
    case 'EXEC_AGENT': return '执行 Agent'
    case 'EXEC_DAG': return '执行 DAG'
    case 'BUILD_WORK_CONTEXT': return '构建上下文'
    case 'SAVE_USER_INPUT': return '保存用户输入'
    case 'WRITE_RESULT': return '汇总回复'
    case 'SAVE_RESPONSE': return '保存回复'
    case 'EVAL_RESULT': return '结果评估'
    case 'HANDLE_ERROR': return '错误处理'
    case 'CONDITION': return '条件判断'
    default: return nodeType
  }
}

function nodeStatusClass(status: string): string {
  switch (status) {
    case 'SUCCESS': return 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
    case 'ERROR': return 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
    case 'RUNNING': return 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
    default: return 'bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300'
  }
}

// 指定消息（思考过程按钮）→ 展示后端接口采集的思考块；未指定（流式期间自动弹出）→ 本轮全部思考块（含已完成）
const thinkingBlocks = computed<ThinkingBlock[]>(() => {
  if (targetMsgId.value) {
    return chatUi.thinkingBlocks as ThinkingBlock[]
  }
  const liveMsgIds = new Set(
    sessionStore.blocks.filter((b) => b.meta.status === 'streaming').map((b) => b.msgId),
  )
  if (liveMsgIds.size === 0 && sessionStore.isStreaming) {
    const last = [...sessionStore.blocks].reverse().find((b) => b.type === 'ThinkingChain')
    if (last) liveMsgIds.add(last.msgId)
  }
  return sessionStore.blocks.filter(
    (b): b is ThinkingBlock => b.type === 'ThinkingChain' && liveMsgIds.has(b.msgId),
  )
})

// Planning 策略拆解：指定消息 → 接口采集的 Task/Agent DAG；流式期间 → 实时拆解数据
const planning = computed<PlanningData | null>(() => {
  if (targetMsgId.value) {
    const dag = chatUi.thinkingDag
    if (!dag || (!dag.nodes.length && !dag.taskDag)) return null
    return {
      planId: dag.planId,
      taskDag: dag.taskDag,
      agentDag: { planId: dag.planId, totalCount: dag.totalCount, nodes: dag.nodes, edges: dag.edges },
      status: 'done',
    }
  }
  const p = chatUi.planning
  if (!p.taskDag && !p.agentDag && !(p.executionSteps && p.executionSteps.length > 0)) return null
  return p
})

const taskDag = computed(() => planning.value?.taskDag ?? null)
const agentDag = computed(() => planning.value?.agentDag ?? null)

// ===== 修改后：执行过程列表，按 Agent 执行顺序聚合所有 Agent（Intent / Planner / Worker / Writer / Evolutor） =====
// thinkingBlocks 已按执行顺序返回（Intent 优先，其余按 orchestration_agent_execution.created ASC）
const executionAgents = computed<ThinkingBlock[]>(() => thinkingBlocks.value)

// 整体的"思考中"状态：任一 Agent 处于思考中（RUNNING）即整体显示"思考中"
const overallStreaming = computed(() => {
  if (thinkingBlocks.value.some((b) => b.meta.status === 'streaming')) return true
  return Object.values(chatUi.agentExecutions).some((i) => i.status === 'RUNNING')
})

// AgentDAG 与下方 Agent 执行区联动：点击 AgentDAG 节点 → 定位并高亮对应 Agent 卡片
const focusedAgentId = ref<string | null>(null)
async function focusAgent(agentId: string) {
  focusedAgentId.value = agentId
  await nextTick()
  const el = document.querySelector(`[data-agent-id="${agentId}"]`) as HTMLElement | null
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('agent-focus-ring')
    setTimeout(() => el.classList.remove('agent-focus-ring'), 1800)
  }
}

function close() {
  chatUi.closeThinkingModal()
}

// ===== 弹窗入场/退场动画：从"思考过程"按钮位置按曲线速率弹出，回收也按曲线速率缩回该按钮 =====
const overlayRef = ref<HTMLElement | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const DURATION_MS = 360
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

let startRect: Rect | null = null
let endRect: Rect | null = null

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

function fallbackRect(end: Rect): Rect {
  const cx = end.left + end.width / 2
  const cy = end.top + end.height / 2
  return { left: cx, top: cy, width: 0, height: 0 }
}

function flipDelta(from: Rect, to: Rect) {
  return {
    dx: from.left - to.left,
    dy: from.top - to.top,
    sx: to.width > 0 ? from.width / to.width : 1,
    sy: to.height > 0 ? from.height / to.height : 1,
  }
}

// before-enter 触发时元素尚未插入 DOM，getBoundingClientRect 返回全 0；
// 故在此仅记录动画起点（"思考过程"按钮矩形），并将遮罩置于透明待入场。
function onBeforeEnter() {
  const origin = chatUi.thinkingOrigin
  startRect = origin && origin.width > 0 && origin.height > 0 ? { ...origin } : null
  if (overlayRef.value) overlayRef.value.style.opacity = '0'
}

// enter 触发时元素已插入 DOM，此时才能取到卡片最终（居中）位置作为 FLIP 终点。
function onEnter(_el: Element, done: () => void) {
  const el = cardRef.value
  endRect = el ? rectOf(el) : null
  if (el && endRect && startRect) {
    const d = flipDelta(startRect, endRect)
    el.style.transformOrigin = '0 0'
    el.style.transform = `translate(${d.dx}px, ${d.dy}px) scale(${d.sx}, ${d.sy})`
    void el.offsetWidth
    el.style.transition = `transform ${DURATION_MS}ms ${EASE}`
    el.style.transform = 'translate(0px, 0px) scale(1, 1)'
  }
  if (overlayRef.value) {
    overlayRef.value.style.transition = `opacity ${DURATION_MS}ms ease`
    overlayRef.value.style.opacity = '1'
  }
  setTimeout(done, DURATION_MS)
}

function onAfterEnter() {
  if (cardRef.value) {
    cardRef.value.style.transition = ''
    cardRef.value.style.transform = ''
    cardRef.value.style.transformOrigin = ''
  }
  if (overlayRef.value) {
    overlayRef.value.style.transition = ''
    overlayRef.value.style.opacity = ''
  }
}

function onBeforeLeave() {
  if (overlayRef.value) {
    overlayRef.value.style.transition = 'none'
    overlayRef.value.style.opacity = '1'
  }
  if (cardRef.value) {
    cardRef.value.style.transition = 'none'
    cardRef.value.style.transformOrigin = '0 0'
    cardRef.value.style.transform = 'translate(0px, 0px) scale(1, 1)'
  }
}

function onLeave(_el: Element, done: () => void) {
  const el = cardRef.value
  const end = endRect
  if (el && end && end.width > 0) {
    const origin = chatUi.thinkingOrigin
    const to = origin && origin.width > 0 && origin.height > 0 ? origin : fallbackRect(end)
    void el.offsetWidth
    el.style.transformOrigin = '0 0'
    el.style.transition = `transform ${DURATION_MS}ms ${EASE}`
    const d = flipDelta(to, end)
    el.style.transform = `translate(${d.dx}px, ${d.dy}px) scale(${d.sx}, ${d.sy})`
  }
  if (overlayRef.value) {
    overlayRef.value.style.transition = `opacity ${DURATION_MS}ms ease`
    overlayRef.value.style.opacity = '0'
  }
  setTimeout(done, DURATION_MS)
}

function onAfterLeave() {
  startRect = null
  endRect = null
  chatUi.clearThinkingOrigin()
}
</script>

<template>
  <Teleport to="body">
    <Transition
      :css="false"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @after-enter="onAfterEnter"
      @enter-cancelled="onAfterEnter"
      @before-leave="onBeforeLeave"
      @leave="onLeave"
      @after-leave="onAfterLeave"
      @leave-cancelled="onAfterLeave"
    >
      <div
        v-if="visible"
        ref="overlayRef"
        class="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm"
        @click.self="close"
      >
        <div ref="cardRef" class="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 w-full max-w-4xl mx-4 overflow-hidden flex flex-col max-h-[85vh]">
        <div class="px-5 py-3.5 border-b border-apple-gray-200 dark:border-apple-gray-700 flex items-center justify-between flex-shrink-0">
          <div class="flex items-center gap-2">
            <Brain :size="16" class="text-purple-600 dark:text-purple-400" />
            <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">思考过程</h3>
            <Loader2 v-if="thinkingLoading || overallStreaming" :size="13" class="animate-spin text-purple-500" />
            <span v-if="thinkingLoading" class="text-xs text-purple-600 dark:text-purple-400 font-medium">正在加载思考过程...</span>
            <span v-else-if="overallStreaming" class="text-xs text-purple-600 dark:text-purple-400">思考中...</span>
            <span
              v-if="totalElapsedMs > 0"
              class="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300"
              title="本轮思考总耗时"
            >
              <Clock :size="11" /> {{ formatDuration(totalElapsedMs) }}
            </span>
          </div>
          <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="close">
            <X :size="18" />
          </button>
        </div>

        <div class="px-5 py-4 flex-1 overflow-y-auto space-y-2">
          <!-- 正在加载整卡思考过程的全屏/居中动画 -->
          <div v-if="thinkingLoading && thinkingBlocks.length === 0 && !taskDag && !agentDag" class="flex flex-col items-center justify-center py-16 text-purple-600 dark:text-purple-400 space-y-3">
            <Loader2 :size="32" class="animate-spin text-purple-600 dark:text-purple-400" />
            <p class="text-sm font-medium animate-pulse">正在加载思考过程...</p>
            <p class="text-xs text-apple-gray-400">正在按模块独立读取 Agent 链路与上下文数据...</p>
          </div>

          <!-- 1. 上下文（聚合所有类型的信息） -->
          <ThinkingContext v-if="thinkingBlocks.length > 0 || !blocksLoading" :blocks="thinkingBlocks" />

          <!-- 2. TaskDAG 模块（独立加载指示与 Canvas 图） -->
          <div v-if="dagLoading && !taskDag && !agentDag && thinkingBlocks.length > 0" class="p-3 rounded-xl border border-purple-200/60 dark:border-purple-800/40 bg-purple-50/30 dark:bg-purple-950/20 flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300">
            <Loader2 :size="14" class="animate-spin text-purple-500" />
            <span>正在加载任务拆解与编排 DAG 图...</span>
          </div>
          <TaskDagFlow v-if="taskDag" :dag="taskDag" />

          <!-- 3. AgentDAG 模块（Agent 名称 Canvas 图） -->
          <AgentDagFlow v-if="agentDag" :dag="agentDag" @select="focusAgent" />

          <section v-if="orchestrationSteps.length > 0" class="mt-1 p-2.5 rounded-lg border border-emerald-200/70 dark:border-emerald-800/50 bg-white/70 dark:bg-apple-gray-900/50">
            <div class="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 mb-1.5">
              <Layers :size="12" class="text-emerald-600 dark:text-emerald-400" />
              <span>编排步骤耗时</span>
            </div>
            <div class="space-y-1">
              <div
                v-for="(step, idx) in orchestrationSteps"
                :key="`${step.node_id}-${step.node_type}-${idx}`"
                class="flex items-center gap-2 p-1.5 rounded border bg-white dark:bg-apple-gray-800/70 border-apple-gray-200/60 dark:border-apple-gray-700/60"
              >
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold" :class="nodeStatusClass(step.status)">
                  {{ step.status === 'RUNNING' ? '执行中' : step.status === 'SUCCESS' ? '完成' : step.status === 'ERROR' ? '失败' : step.status }}
                </span>
                <span class="text-[11px] text-apple-gray-700 dark:text-apple-gray-200 font-medium flex-1 min-w-0 truncate">
                  {{ nodeTypeLabel(step.node_type) }}
                </span>
                <span class="text-[10px] font-mono text-apple-gray-500 dark:text-apple-gray-400 flex-shrink-0">
                  {{ step.status === 'RUNNING' ? formatDuration(step.startedAt ? nowMs - step.startedAt : 0, true) : (formatDuration(step.elapsed_ms) || '—') }}
                </span>
              </div>
            </div>
          </section>

          <!-- 各 Agent 节点的独立加载指示 -->
          <div v-if="blocksLoading && thinkingBlocks.length === 0 && (taskDag || agentDag)" class="p-3.5 rounded-xl border border-purple-200/60 dark:border-purple-800/40 bg-purple-50/30 dark:bg-purple-950/20 flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300">
            <Loader2 :size="14" class="animate-spin text-purple-500" />
            <span>正在独立读取各 Agent 节点的思考输出...</span>
          </div>

          <!-- 4. 执行过程（按 Agent 执行顺序聚合所有 Agent 的执行过程列表） -->
          <section v-if="executionAgents.length > 0" class="mt-2.5">
            <div class="flex items-center gap-1.5 text-xs font-bold text-purple-900 dark:text-purple-200 mb-1 px-1">
              <Brain :size="13" class="text-purple-600 dark:text-purple-400" />
              <span>执行过程 (Execution Process)</span>
              <span class="text-[10px] font-normal text-apple-gray-400">共 {{ executionAgents.length }} 个 Agent，按执行顺序排列</span>
            </div>
            <div
              v-for="(block, idx) in executionAgents"
              :key="block.id"
              :data-agent-id="block.agentInfo?.id"
              class="rounded-xl transition-shadow"
            >
              <div class="flex items-center gap-1 px-1 pb-0.5">
                <span class="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-100/80 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                  {{ idx + 1 }}
                </span>
                <span class="text-[10px] text-apple-gray-400">{{ block.agentInfo?.name || 'Agent' }}</span>
              </div>
              <ThinkingBlockView
                :block="block"
                hide-context
                default-tab="io"
                :start-expanded="focusedAgentId === block.agentInfo?.id || executionAgents.length <= 2"
              />
            </div>
          </section>

          <!-- ===== 原始暂无思考过程占位（保留参考） ===== -->
          <!--
          <div v-if="thinkingBlocks.length === 0 && !taskDag && !agentDag" class="flex flex-col items-center justify-center py-12 text-apple-gray-400 text-sm">
            <Brain :size="32" class="mb-3 text-apple-gray-300" />
            <p>暂无思考过程</p>
          </div>
          -->

          <!-- 修改后：在非加载状态下且无任何思考过程时展示 -->
          <div v-if="!thinkingLoading && thinkingBlocks.length === 0 && !taskDag && !agentDag" class="flex flex-col items-center justify-center py-12 text-apple-gray-400 text-sm">
            <Brain :size="32" class="mb-3 text-apple-gray-300" />
            <p>暂无思考过程</p>
          </div>
        </div>
      </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.agent-focus-ring {
  box-shadow: 0 0 0 2px #8b5cf6, 0 0 24px rgba(139, 92, 246, 0.45);
}
</style>
