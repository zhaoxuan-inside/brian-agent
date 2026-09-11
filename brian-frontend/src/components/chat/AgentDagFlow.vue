<!--
AgentDAG Canvas 图（Agent 名称 / 任务 → Agent 映射）：
- 以分层 DAG 画布方式展示多 Agent 协同依赖关系
- 节点状态着色与执行联动：未执行灰色 / 执行中黄色 / 成功绿色 / 失败红色
- 点击节点可将下方对应的 Work Agent 执行区联动高亮
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Network } from '@lucide/vue'
import { useChatUiStore } from '@/stores/chatUi'
import type { AgentDagData, AgentExecutionStatus } from '@/api/types'
import { layoutDag, DAG_NODE_W, DAG_NODE_H } from './dagLayout'
import { formatDuration } from '@/utils/format'

const props = defineProps<{
  dag: AgentDagData
}>()

const emit = defineEmits<{
  (e: 'select', agentId: string): void
}>()

const chatUi = useChatUiStore()

const selectedId = ref<string | null>(null)

const nodes = computed(() => props.dag?.nodes ?? [])
const edges = computed(() =>
  (props.dag?.edges ?? []).map((e) => ({ source: e.source, target: e.target, label: e.label })),
)

const layout = computed(() => layoutDag(nodes.value as Parameters<typeof layoutDag>[0], edges.value))

const containerStyle = computed(() => {
  const l = layout.value
  const h = Math.max(l.totalHeight, DAG_NODE_H) + 8
  return { width: `${l.totalWidth}px`, height: `${h}px` }
})

// 节点状态解析：优先取任务级实时执行状态（taskExecutions，key = task_id），
// 其次取 agent 级实时状态（agentExecutions），最后回退节点自带 status。
// 关键：同一 Agent 复用到多个任务时，必须按 task_id 区分，避免一个任务完成导致
// 所有复用该 Agent 的节点被误标为执行完成。
function resolveStatus(node: (typeof nodes.value)[number]): AgentExecutionStatus {
  const taskKey = node.taskId ?? node.id
  const tt = taskKey ? chatUi.taskExecutions[taskKey] : undefined
  if (tt) return tt.status
  const rt = chatUi.agentExecutions[node.agentId ?? node.id]
  if (rt) return rt.status
  const s = String(node.status ?? '').toUpperCase()
  if (s.includes('COMPLET') || s.includes('SUCCESS') || s.includes('DONE')) return 'SUCCESS'
  if (s.includes('RUN') || s.includes('EXECUT') || s.includes('PROCESS')) return 'RUNNING'
  if (s.includes('FAIL') || s.includes('ERROR')) return 'ERROR'
  return 'PENDING'
}

const STATUS_META: Record<AgentExecutionStatus, { label: string; dot: string; ring: string; chip: string }> = {
  PENDING: {
    label: '未执行',
    dot: 'bg-apple-gray-400 dark:bg-apple-gray-500',
    ring: 'border-apple-gray-200 dark:border-apple-gray-600 bg-apple-gray-50 dark:bg-apple-gray-800/80 text-apple-gray-500 dark:text-apple-gray-300',
    chip: 'bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-500 dark:text-apple-gray-300',
  },
  RUNNING: {
    label: '执行中',
    dot: 'bg-amber-400',
    ring: 'border-amber-300 dark:border-amber-500/70 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    chip: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
  },
  SUCCESS: {
    label: '执行成功',
    dot: 'bg-emerald-500',
    ring: 'border-emerald-300 dark:border-emerald-500/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
    chip: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300',
  },
  ERROR: {
    label: '执行失败',
    dot: 'bg-red-500',
    ring: 'border-red-300 dark:border-red-500/70 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300',
    chip: 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300',
  },
}

function nodeStyle(id: string) {
  const pos = layout.value.positions.get(id)
  if (!pos) return {}
  return {
    left: `${pos.x}px`,
    top: `${pos.y + 4}px`,
    width: `${DAG_NODE_W}px`,
    height: `${DAG_NODE_H - 8}px`,
    overflow: 'hidden',
  }
}

function edgePath(source: string, target: string): string {
  const p = layout.value.positions
  const s = p.get(source)
  const t = p.get(target)
  if (!s || !t) return ''
  const sy = s.y + 4 + DAG_NODE_H / 2
  const ty = t.y + 4 + DAG_NODE_H / 2
  const sx = s.x + DAG_NODE_W
  const tx = t.x
  const mx = (sx + tx) / 2
  return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`
}

function edgeColor(source: string): string {
  const s = resolveStatus(nodes.value.find((n) => n.id === source) as (typeof nodes.value)[number])
  return {
    PENDING: '#9ca3af',
    RUNNING: '#fbbf24',
    SUCCESS: '#34d399',
    ERROR: '#f87171',
  }[s] ?? '#9ca3af'
}

function handleSelect(node: (typeof nodes.value)[number]) {
  selectedId.value = selectedId.value === node.id ? null : node.id
  // 点击节点 → 联动下方 Agent 执行区：按 agent_id 定位（节点主键 id 为 task_id）
  emit('select', node.agentId || node.id)
}

const activeNode = computed(() => nodes.value.find((n) => n.id === selectedId.value) ?? null)

function formatJson(val: unknown): string {
  if (typeof val === 'string') return val
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}
</script>

<template>
  <div v-if="dag && dag.nodes && dag.nodes.length > 0" class="agent-dag-flow my-2.5 p-3 rounded-xl border border-blue-200/80 dark:border-blue-800/60 bg-gradient-to-br from-blue-50/60 to-purple-50/30 dark:from-blue-950/30 dark:to-purple-950/20 shadow-sm select-text">
    <div class="flex items-center justify-between pb-2 border-b border-blue-100 dark:border-blue-900/40 mb-2">
      <div class="flex items-center gap-2">
        <Network :size="15" class="text-blue-600 dark:text-blue-400" />
        <span class="text-xs font-bold text-blue-900 dark:text-blue-200">Agent DAG ({{ dag.nodes.length }} 个 Agent 节点)</span>
      </div>
      <div class="flex items-center gap-2 text-[10px]">
        <span class="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-500 dark:text-apple-gray-300">
          <span class="w-1.5 h-1.5 rounded-full bg-apple-gray-400" /> 未执行
        </span>
        <span class="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400" /> 执行中
        </span>
        <span class="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 成功
        </span>
        <span class="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300">
          <span class="w-1.5 h-1.5 rounded-full bg-red-500" /> 失败
        </span>
      </div>
    </div>

    <div class="overflow-x-auto">
      <div class="relative" :style="containerStyle">
        <!-- 依赖箭头 (SVG 覆盖层) -->
        <svg
          class="absolute inset-0 pointer-events-none"
          :width="layout.totalWidth"
          :height="Math.max(layout.totalHeight, DAG_NODE_H) + 8"
        >
          <path
            v-for="(e, idx) in dag.edges"
            :key="idx"
            :d="edgePath(e.source, e.target)"
            fill="none"
            :stroke="edgeColor(e.source)"
            stroke-width="1.8"
            stroke-dasharray="4 3"
            opacity="0.8"
          />
        </svg>

        <!-- Agent 节点 -->
        <button
          v-for="node in dag.nodes"
          :key="node.id"
          class="absolute rounded-lg border p-2 text-left shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col"
          :class="[
            STATUS_META[resolveStatus(node)].ring,
            selectedId === node.id ? 'ring-2 ring-blue-500 scale-[1.03] z-10' : '',
          ]"
          :style="nodeStyle(node.id)"
          :title="`${node.label || node.agentName || node.id}\n${node.content || ''}`"
          @click="handleSelect(node)"
        >
          <div class="flex items-center justify-between gap-1 w-full">
            <div class="flex items-center gap-1 min-w-0">
              <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="STATUS_META[resolveStatus(node)].dot" />
              <span class="text-[10px] font-bold truncate">{{ node.agentName || node.label || `Agent ${node.id.slice(0, 8)}` }}</span>
            </div>
            <span v-if="node.tokenUsage" class="text-[9px] opacity-70 flex-shrink-0">{{ node.tokenUsage }}t</span>
          </div>

          <p class="text-[10px] truncate w-full opacity-80 mt-0.5">{{ node.content || node.label || '' }}</p>

          <div class="flex items-center justify-between mt-auto pt-1">
            <span class="text-[9px] px-1 py-px rounded" :class="STATUS_META[resolveStatus(node)].chip">
              {{ STATUS_META[resolveStatus(node)].label }}
            </span>
            <span v-if="node.elapsedMs" class="text-[9px] opacity-70 flex-shrink-0">{{ formatDuration(node.elapsedMs) }}</span>
          </div>
        </button>
      </div>
    </div>

    <!-- 点击节点的具体输入输出与 Token 详情展示区 -->
    <div v-if="activeNode" class="mt-2 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-white/90 dark:bg-apple-gray-900/90 text-xs space-y-2">
      <div class="flex items-center justify-between font-bold text-blue-900 dark:text-blue-200 border-b pb-1">
        <span>节点详情: {{ activeNode.agentName || activeNode.label }}</span>
        <div class="flex items-center gap-3 text-[11px] font-normal text-apple-gray-500">
          <span v-if="activeNode.taskId" class="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400">任务: {{ activeNode.taskId }}</span>
          <span v-if="activeNode.elapsedMs">{{ formatDuration(activeNode.elapsedMs) }}</span>
          <span v-if="activeNode.tokenUsage">{{ activeNode.tokenUsage }} tokens</span>
        </div>
      </div>

      <div v-if="activeNode.input" class="p-2 rounded bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
        <span class="font-semibold text-blue-800 dark:text-blue-300">子任务指令 (Input):</span>
        <pre class="mt-0.5 text-[11px] text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap max-h-24 overflow-y-auto">{{ formatJson(activeNode.input) }}</pre>
      </div>

      <div v-if="activeNode.output" class="p-2 rounded bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
        <span class="font-semibold text-emerald-800 dark:text-emerald-300">子任务产出 (Output):</span>
        <pre class="mt-0.5 text-[11px] text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap max-h-36 overflow-y-auto">{{ formatJson(activeNode.output) }}</pre>
      </div>
    </div>
  </div>
</template>
