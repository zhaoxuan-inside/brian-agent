<script setup lang="ts">
/**
 * 对话内联思考轨迹：默认对用户开放，类似 Cursor 的思考/执行过程。
 * 主视觉是「当前做到哪一步 + 每步耗时」；Prompt / DAG / Token 等细节走详情弹窗。
 */
import { computed, ref, watch } from 'vue'
import { ChevronRight, Loader2, Clock } from '@lucide/vue'
import type { ThinkingBlock, PlanningData, TaskDagNode } from '@/api/types'
import { useChatUiStore } from '@/stores/chatUi'
import { useNowTick } from '@/composables/useNowTick'
import { formatDuration } from '@/utils/format'
import { HIDDEN_PIPELINE_NODES, pipelineNodeLabel } from '@/utils/orchestrationLabels'

export interface TraceStep {
  id: string
  label: string
  detail?: string
  status: 'pending' | 'running' | 'done' | 'error'
  elapsedMs?: number
  startedAt?: number
}

const props = defineProps<{
  blocks: ThinkingBlock[]
  planning?: PlanningData | null
  live?: boolean
  totalStartedAt?: number
}>()

const emit = defineEmits<{
  details: []
}>()

const chatUi = useChatUiStore()
const live = computed(() => Boolean(props.live))
const nowMs = useNowTick(live)

const expanded = ref(Boolean(props.live))
watch(live, (on) => {
  expanded.value = on
})

function stepElapsed(step: TraceStep): number {
  if (step.status === 'running' && step.startedAt) {
    return Math.max(0, nowMs.value - step.startedAt)
  }
  return step.elapsedMs ?? 0
}

const steps = computed<TraceStep[]>(() => {
  const result: TraceStep[] = []
  const seen = new Set<string>()

  const push = (step: TraceStep) => {
    if (seen.has(step.id)) return
    seen.add(step.id)
    result.push(step)
  }

  const intentBlocks: ThinkingBlock[] = []
  const workBlocks: ThinkingBlock[] = []
  for (const block of props.blocks) {
    const type = (block.agentInfo?.type || 'WORKER').toUpperCase()
    const name = block.agentInfo?.name || ''
    if (type === 'INTENT') {
      intentBlocks.push(block)
      continue
    }
    if (type === 'EVOLUTOR') continue
    if (name.startsWith('构建中') || name === '复用已有 Agent') continue
    workBlocks.push(block)
  }

  const addBlock = (block: ThinkingBlock) => {
    const type = (block.agentInfo?.type || 'WORKER').toUpperCase()
    const id = block.agentInfo?.id || block.id
    const rt = id ? chatUi.agentExecutions[id] : undefined
    const running = block.meta.status === 'streaming' || rt?.status === 'RUNNING'
    const error = rt?.status === 'ERROR'
    const rawName = block.agentInfo?.name || ''
    const noisyName = !rawName || /^(general-|系统-)/.test(rawName) || /^[0-9a-f-]{8,}$/i.test(rawName)
    const label = type === 'INTENT'
      ? '理解需求'
      : type === 'WRITER'
        ? '整理回复'
        : type === 'PLANNER'
          ? '拆解任务'
          : (noisyName ? '回答问题' : rawName)
    const detail = typeof block.input === 'string' && block.input.trim()
      ? block.input.trim().slice(0, 72)
      : undefined
    push({
      id: `agent-${id}`,
      label,
      detail,
      status: error ? 'error' : running ? 'running' : 'done',
      elapsedMs: block.durationMs || rt?.elapsedMs,
      startedAt: rt?.startedAt || (running ? block.meta.createdAt : undefined),
    })
  }

  for (const block of intentBlocks) addBlock(block)

  const pipeline = (props.planning?.executionSteps ?? []).filter(
    (s) => !HIDDEN_PIPELINE_NODES.has(s.node_type) && !['EXEC_AGENT', 'EXEC_DAG'].includes(s.node_type),
  )
  for (const s of pipeline) {
    const status = s.status === 'SUCCESS' ? 'done' : s.status === 'ERROR' ? 'error' : s.status === 'RUNNING' ? 'running' : 'pending'
    push({
      id: `pipe-${s.node_id}-${s.node_type}`,
      label: pipelineNodeLabel(s.node_type),
      status,
      elapsedMs: s.elapsed_ms,
      startedAt: s.startedAt,
    })
  }

  for (const block of workBlocks) addBlock(block)

  if (result.length === 0 && props.live) {
    result.push({
      id: 'pending-start',
      label: '理解需求',
      status: 'running',
      startedAt: props.totalStartedAt || Date.now(),
    })
  }

  return result
})

const taskNodes = computed<TaskDagNode[]>(() => {
  const nodes = props.planning?.taskDag?.nodes ?? []
  return nodes.length > 6 ? nodes.slice(0, 6) : nodes
})
const hiddenTaskCount = computed(() => Math.max(0, (props.planning?.taskDag?.nodes.length ?? 0) - taskNodes.value.length))

const runningStep = computed(() => steps.value.find((s) => s.status === 'running'))
const doneCount = computed(() => steps.value.filter((s) => s.status === 'done' || s.status === 'error').length)

const totalMs = computed(() => {
  if (live.value && props.totalStartedAt) return Math.max(0, nowMs.value - props.totalStartedAt)
  const fromBlocks = props.blocks.reduce((sum, b) => sum + (b.durationMs || 0), 0)
  const fromSteps = steps.value.reduce((sum, s) => sum + (s.elapsedMs || 0), 0)
  return Math.max(fromBlocks, fromSteps, props.totalStartedAt ? Date.now() - props.totalStartedAt : 0)
})

const headerText = computed(() => {
  if (live.value) {
    const current = runningStep.value?.label
    return current ? `正在${current}` : '思考中'
  }
  return '已思考'
})
</script>

<template>
  <div v-if="steps.length > 0 || live" class="thinking-trace select-text">
    <div class="flex items-center gap-2 py-1">
      <button
        class="flex items-center gap-2 min-w-0 text-left group"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <ChevronRight
          :size="14"
          class="text-apple-gray-400 flex-shrink-0 transition-transform duration-150"
          :class="{ 'rotate-90': expanded }"
        />
        <Loader2 v-if="live" :size="13" class="animate-spin text-apple-gray-500 flex-shrink-0" />
        <span class="text-[13px] text-apple-gray-600 dark:text-apple-gray-300">
          {{ headerText }}
        </span>
        <span class="inline-flex items-center gap-1 text-[12px] font-mono text-apple-gray-400">
          <Clock :size="11" />
          {{ formatDuration(totalMs, live) }}
        </span>
        <span v-if="!live && steps.length > 0" class="text-[12px] text-apple-gray-400">
          · {{ doneCount }} 步
        </span>
      </button>
      <button
        class="ml-auto text-[12px] text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200"
        @click="emit('details')"
      >
        详情
      </button>
    </div>

    <div v-if="expanded" class="ml-[7px] pl-3.5 border-l border-apple-gray-200 dark:border-apple-gray-700 space-y-1 pb-1">
      <div
        v-for="step in steps"
        :key="step.id"
        class="flex items-start gap-2 py-0.5"
      >
        <span
          class="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
          :class="{
            'bg-brian-blue animate-pulse': step.status === 'running',
            'bg-apple-gray-300 dark:bg-apple-gray-600': step.status === 'pending' || step.status === 'done',
            'bg-error-red': step.status === 'error',
          }"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2 min-w-0">
            <span
              class="text-[13px] min-w-0 truncate"
              :class="step.status === 'running'
                ? 'text-apple-gray-900 dark:text-apple-gray-100 font-medium'
                : 'text-apple-gray-500 dark:text-apple-gray-400'"
            >
              {{ step.label }}
            </span>
            <span
              class="flex-shrink-0 text-[11px] font-mono tabular-nums"
              :class="step.status === 'running' ? 'text-apple-gray-700 dark:text-apple-gray-200' : 'text-apple-gray-400'"
            >
              {{ formatDuration(stepElapsed(step), step.status === 'running') }}
            </span>
          </div>
          <p v-if="step.detail && step.status === 'running'" class="text-[12px] text-apple-gray-400 truncate mt-0.5">
            {{ step.detail }}
          </p>
        </div>
      </div>

      <div v-if="taskNodes.length > 0" class="pt-1.5 mt-1 border-t border-apple-gray-100 dark:border-apple-gray-800">
        <p class="text-[11px] text-apple-gray-400 mb-1">任务拆解</p>
        <ol class="space-y-0.5">
          <li
            v-for="(task, idx) in taskNodes"
            :key="task.id"
            class="flex items-start gap-1.5 text-[12px] text-apple-gray-500 dark:text-apple-gray-400"
          >
            <span class="font-mono text-apple-gray-300 w-4 flex-shrink-0">{{ idx + 1 }}.</span>
            <span class="min-w-0 truncate">{{ task.content || task.label }}</span>
          </li>
        </ol>
        <p v-if="hiddenTaskCount > 0" class="text-[11px] text-apple-gray-400 mt-0.5">另有 {{ hiddenTaskCount }} 个子任务</p>
      </div>
    </div>
  </div>
</template>
