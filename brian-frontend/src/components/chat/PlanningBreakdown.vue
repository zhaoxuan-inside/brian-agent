<script setup lang="ts">
import { ref, computed } from 'vue'
import { GitBranch, Layers, ArrowDown, Loader2, Network } from '@lucide/vue'
import type { PlanningData, TaskDagNode } from '@/api/types'
import AgentDagFlow from './AgentDagFlow.vue'
import { formatDuration } from '@/utils/format'

const props = defineProps<{
  planning: PlanningData | null
}>()

const expanded = ref(true)

const hasTaskDag = computed(() => Boolean(props.planning?.taskDag && props.planning.taskDag!.nodes.length > 0))
const hasAgentDag = computed(() => Boolean(props.planning?.agentDag && props.planning.agentDag!.nodes.length > 0))
const hasSteps = computed(() => Boolean(props.planning?.executionSteps && props.planning.executionSteps!.length > 0))
const isStreaming = computed(() => props.planning?.status === 'streaming')

const taskCount = computed(() => props.planning?.taskDag?.nodes.length ?? 0)
const agentCount = computed(() => props.planning?.agentDag?.nodes.length ?? 0)

function dependencyIndex(depId: string): number {
  const nodes = props.planning?.taskDag?.nodes ?? []
  const idx = nodes.findIndex((n) => n.id === depId)
  return idx >= 0 ? idx : -1
}

const shownTasks = computed<TaskDagNode[]>(() => {
  const nodes = props.planning?.taskDag?.nodes ?? []
  // 串行链路默认展示全部；任务过多时折叠展示前 8 个 + 提示
  return nodes.length > 8 ? nodes.slice(0, 8) : nodes
})

const hasMoreTasks = computed(() => (props.planning?.taskDag?.nodes.length ?? 0) > 8)
const showAllTasks = ref(false)

const taskNodes = computed(() => showAllTasks.value ? (props.planning?.taskDag?.nodes ?? []) : shownTasks.value)

const nodeStatusClass = (status: string): string => {
  switch (status) {
    case 'SUCCESS': return 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
    case 'ERROR': return 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
    case 'RUNNING': return 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
    default: return 'bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300'
  }
}

const nodeTypeLabel = (nodeType: string): string => {
  switch (nodeType) {
    case 'PLAN_WORK': return '任务拆解'
    case 'BUILD_AGENT_DAG': return '构建 Agent DAG'
    case 'BUILD_WORK_AGENT': return '构建执行 Agent'
    case 'EXEC_AGENT': return '执行 Agent'
    case 'EXEC_DAG': return '执行 DAG'
    case 'BUILD_WORK_CONTEXT': return '构建上下文'
    case 'SAVE_USER_INPUT': return '保存用户输入'
    case 'CONDITION': return '条件判断'
    case 'SUMMARY': return '结果汇总'
    case 'EVALUATE': return '结果评估'
    case 'WRITE_RESULT': return '汇总回复'
    case 'SAVE_RESPONSE': return '保存回复'
    case 'EVAL_RESULT': return '结果评估'
    case 'HANDLE_ERROR': return '错误处理'
    default: return nodeType
  }
}
</script>

<template>
  <div v-if="planning && (hasTaskDag || hasAgentDag || hasSteps)" class="space-y-2.5 select-text">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5 text-xs font-bold text-purple-900 dark:text-purple-200">
        <GitBranch :size="14" class="text-purple-600 dark:text-purple-400" />
        <span>Planning 策略拆解 (任务分解)</span>
        <Loader2 v-if="isStreaming" :size="12" class="animate-spin text-purple-500" />
      </div>
      <div class="flex items-center gap-1.5 text-[10px] text-apple-gray-400">
        <span v-if="hasTaskDag" class="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">{{ taskCount }} 个子任务</span>
        <span v-if="hasAgentDag" class="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">{{ agentCount }} 个工作节点</span>
        <button
          class="p-1 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
          :title="expanded ? '收起' : '展开'"
          @click="expanded = !expanded"
        >
          <ArrowDown :size="13" class="transition-transform" :class="{ 'rotate-180': !expanded }" />
        </button>
      </div>
    </div>

    <div v-if="expanded" class="space-y-2.5">
      <!-- 1. 任务级拆解 (Task DAG) -->
      <div v-if="hasTaskDag" class="p-2.5 rounded-lg border border-purple-200/70 dark:border-purple-800/50 bg-white/70 dark:bg-apple-gray-900/50">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold text-purple-800 dark:text-purple-300 mb-1.5">
          <Layers :size="12" class="text-purple-600 dark:text-purple-400" />
          <span>任务拆解 (Task DAG)</span>
        </div>

        <div class="space-y-1">
          <div
            v-for="(task, idx) in taskNodes"
            :key="task.id"
            class="flex items-start gap-2 p-1.5 rounded border bg-white dark:bg-apple-gray-800/70 border-apple-gray-200/60 dark:border-apple-gray-700/60"
          >
            <span
              class="flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-[10px] font-bold flex items-center justify-center mt-0.5"
            >
              {{ idx + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span v-if="task.domain" class="px-1 py-0.5 rounded text-[10px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-900/40">
                  {{ task.domain }}
                </span>
                <span v-if="task.complexity" class="px-1 py-0.5 rounded text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                  复杂度 {{ task.complexity }}
                </span>
                <span v-if="task.priority" class="px-1 py-0.5 rounded text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                  优先级 {{ task.priority }}
                </span>
              </div>
              <p class="text-[11px] text-apple-gray-700 dark:text-apple-gray-200 mt-0.5 break-words" :title="task.content">
                {{ task.content || task.label }}
              </p>
              <p v-if="task.dependencies && task.dependencies.length > 0" class="text-[10px] text-apple-gray-400 mt-0.5">
                依赖: {{ task.dependencies.map((d) => dependencyIndex(d) >= 0 ? `任务 #${dependencyIndex(d) + 1}` : d).join(', ') }}
              </p>
            </div>
          </div>

          <button
            v-if="hasMoreTasks && !showAllTasks"
            class="w-full py-1 text-[10px] text-purple-600 dark:text-purple-400 hover:underline"
            @click="showAllTasks = true"
          >
            展开全部 {{ taskCount }} 个子任务
          </button>
        </div>
      </div>

      <!-- 2. Agent 级 DAG 网络 -->
      <div v-if="hasAgentDag" class="p-2.5 rounded-lg border border-blue-200/70 dark:border-blue-800/50 bg-white/70 dark:bg-apple-gray-900/50">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold text-blue-800 dark:text-blue-300 mb-1.5">
          <Network :size="12" class="text-blue-600 dark:text-blue-400" />
          <span>任务 → Agent 映射 (Agent DAG)</span>
        </div>
        <AgentDagFlow :dag="planning.agentDag!" />
      </div>

      <!-- 3. 编排执行步骤 -->
      <div v-if="hasSteps" class="p-2.5 rounded-lg border border-emerald-200/70 dark:border-emerald-800/50 bg-white/70 dark:bg-apple-gray-900/50">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 mb-1.5">
          <Layers :size="12" class="text-emerald-600 dark:text-emerald-400" />
          <span>编排执行步骤 (Orchestration)</span>
        </div>
        <div class="space-y-1">
          <div
            v-for="(step, idx) in planning.executionSteps"
            :key="`${step.node_id}-${step.node_type}-${idx}`"
            class="flex items-center gap-2 p-1.5 rounded border bg-white dark:bg-apple-gray-800/70 border-apple-gray-200/60 dark:border-apple-gray-700/60"
          >
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold" :class="nodeStatusClass(step.status)">
              {{ step.status === 'RUNNING' ? '执行中' : step.status === 'SUCCESS' ? '完成' : step.status === 'ERROR' ? '失败' : step.status }}
            </span>
            <span class="text-[11px] text-apple-gray-700 dark:text-apple-gray-200 font-medium flex-1 min-w-0 truncate">
              {{ nodeTypeLabel(step.node_type) }}
            </span>
            <span v-if="step.elapsed_ms" class="text-[10px] text-apple-gray-400 flex-shrink-0">{{ formatDuration(step.elapsed_ms) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
