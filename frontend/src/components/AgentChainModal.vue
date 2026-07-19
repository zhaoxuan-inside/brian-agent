<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSessionStore } from '../stores/session'
import {
  Globe, Wrench, Brain, Terminal, ArrowDown, Circle
} from '@lucide/vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const sessionStore = useSessionStore()
const selectedAgentId = ref<string | null>(null)

const selectedAgent = computed(() =>
  sessionStore.agentChain.find(a => a.id === selectedAgentId.value)
)

// Group agents by layer
const layers = computed(() => {
  const all = sessionStore.agentChain
  const roots = all.filter(a => a.type === 'coordinator' || a.type === 'root')
  const subs = all.filter(a => a.type === 'searcher' || a.type === 'caller' || a.type === 'skiller' || a.type === 'generator' || a.type === 'sub' || a.type === 'work')
  return { roots, subs }
})

function getStatusColor(status: string): string {
  switch (status) {
    case 'running': return '#007AFF'
    case 'completed': return '#34C759'
    case 'failed': return '#FF3B30'
    default: return '#AEAEB2'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'running': return '运行中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    default: return '就绪'
  }
}

function getRoleIcon(type: string) {
  switch (type) {
    case 'coordinator':
    case 'root': return Brain
    case 'searcher': return Globe
    case 'caller': return Terminal
    case 'skiller': return Wrench
    case 'generator': return Brain
    default: return Circle
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function onOverlayClick() {
  emit('close')
}

function onModalClick(e: Event) {
  e.stopPropagation()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center"
        @click="onOverlayClick"
      >
        <!-- Overlay backdrop -->
        <div class="absolute inset-0 bg-black/20 backdrop-blur-sm" />

        <!-- Modal -->
        <div
          class="relative w-[480px] max-h-[80vh] bg-white dark:bg-apple-gray-950 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-800 flex flex-col overflow-hidden"
          @click="onModalClick"
        >
          <!-- Header -->
          <div class="p-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">Agent 调度链</h3>
            <p class="text-[11px] text-apple-gray-400 mt-0.5">
              {{ sessionStore.agentChain.length }} 个 Agent ·
              <template v-if="sessionStore.isProcessing">
                <span class="text-brian-blue">执行中</span>
              </template>
              <template v-else>
                已完成
              </template>
            </p>
          </div>

          <!-- DAG visualization -->
          <div class="flex-1 overflow-y-auto p-4 space-y-8">
            <div v-if="sessionStore.agentChain.length === 0" class="text-center py-12 text-apple-gray-400 text-xs">
              暂无调度数据
            </div>

            <!-- Root layer -->
            <div v-if="layers.roots.length > 0">
              <p class="text-[10px] font-semibold text-apple-gray-400 mb-2 uppercase tracking-wider">Coordinator</p>
              <div class="space-y-2">
                <div
                  v-for="agent in layers.roots" :key="agent.id"
                  :class="[
                    'p-3 rounded-xl cursor-pointer transition-all border',
                    selectedAgentId === agent.id
                      ? 'border-brian-blue bg-brian-blue/5 shadow-sm'
                      : 'border-apple-gray-100 dark:border-apple-gray-800 hover:border-apple-gray-200 dark:hover:border-apple-gray-700'
                  ]"
                  @click="selectedAgentId = agent.id"
                >
                  <div class="flex items-center gap-2">
                    <div :style="{ color: getStatusColor(agent.status) }">
                      <component :is="getRoleIcon(agent.type)" :size="16" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-medium text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ agent.name }}</p>
                      <p class="text-[10px] text-apple-gray-400">{{ agent.description }}</p>
                    </div>
                    <span :class="[
                      'text-[9px] px-1.5 py-0.5 rounded-full',
                      agent.status === 'completed' ? 'bg-success-green/10 text-success-green' :
                      agent.status === 'running' ? 'bg-brian-blue/10 text-brian-blue' :
                      agent.status === 'failed' ? 'bg-error-red/10 text-error-red' :
                      'bg-apple-gray-100 text-apple-gray-400'
                    ]">
                      {{ getStatusLabel(agent.status) }}
                    </span>
                  </div>
                  <div v-if="agent.startTime && agent.endTime" class="mt-1 text-[9px] text-apple-gray-400 ml-7">
                    {{ formatDuration(agent.endTime - agent.startTime) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Arrow -->
            <div v-if="layers.roots.length > 0 && layers.subs.length > 0" class="flex justify-center">
              <ArrowDown :size="20" class="text-apple-gray-300" />
            </div>

            <!-- Sub agents layer -->
            <div v-if="layers.subs.length > 0">
              <p class="text-[10px] font-semibold text-apple-gray-400 mb-2 uppercase tracking-wider">Sub Agents</p>
              <div class="space-y-2">
                <div
                  v-for="agent in layers.subs" :key="agent.id"
                  :class="[
                    'p-3 rounded-xl cursor-pointer transition-all border',
                    selectedAgentId === agent.id
                      ? 'border-brian-blue bg-brian-blue/5 shadow-sm'
                      : 'border-apple-gray-100 dark:border-apple-gray-800 hover:border-apple-gray-200 dark:hover:border-apple-gray-700'
                  ]"
                  @click="selectedAgentId = agent.id"
                >
                  <div class="flex items-center gap-2">
                    <div :style="{ color: getStatusColor(agent.status) }">
                      <component :is="getRoleIcon(agent.type)" :size="16" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-medium text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ agent.name }}</p>
                      <div class="flex items-center gap-1.5 mt-0.5">
                        <span class="text-[10px] text-apple-gray-400">{{ agent.role }}</span>
                      </div>
                    </div>
                    <span :class="[
                      'text-[9px] px-1.5 py-0.5 rounded-full',
                      agent.status === 'completed' ? 'bg-success-green/10 text-success-green' :
                      agent.status === 'running' ? 'bg-brian-blue/10 text-brian-blue' :
                      agent.status === 'failed' ? 'bg-error-red/10 text-error-red' :
                      'bg-apple-gray-100 text-apple-gray-400'
                    ]">
                      {{ getStatusLabel(agent.status) }}
                    </span>
                  </div>
                  <div v-if="agent.startTime && agent.endTime" class="mt-1 text-[9px] text-apple-gray-400 ml-7">
                    {{ formatDuration(agent.endTime - agent.startTime) }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Output detail panel at bottom -->
          <div v-if="selectedAgent" class="border-t border-apple-gray-200 dark:border-apple-gray-700 flex flex-col max-h-[40%]">
            <div class="flex items-center justify-between p-3 border-b border-apple-gray-100 dark:border-apple-gray-800">
              <div class="flex items-center gap-2">
                <component :is="getRoleIcon(selectedAgent.type)" :size="14" :color="getStatusColor(selectedAgent.status)" />
                <span class="text-xs font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ selectedAgent.name }}</span>
              </div>
              <span class="text-[9px] text-apple-gray-400">{{ selectedAgent.role }}</span>
            </div>
            <div class="flex-1 overflow-y-auto p-3 space-y-1.5">
              <div v-if="selectedAgent.output.length === 0" class="text-[11px] text-apple-gray-400 py-4 text-center">
                {{ selectedAgent.status === 'running' ? '等待输出...' : '无输出' }}
              </div>
              <div
                v-for="(line, i) in selectedAgent.output" :key="i"
                :class="[
                  'text-[11px] p-2 rounded-lg leading-relaxed',
                  line.type === 'stderr' ? 'bg-error-red/5 text-error-red' :
                  line.type === 'system' ? 'bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-500' :
                  'bg-success-green/5 text-apple-gray-700 dark:text-apple-gray-300'
                ]"
              >
                {{ line.content }}
              </div>
            </div>
          </div>

          <!-- Legend -->
          <div class="px-4 py-3 border-t border-apple-gray-200 dark:border-apple-gray-700 flex items-center gap-4 text-[9px] text-apple-gray-400">
            <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-brian-blue inline-block" />运行中</span>
            <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-success-green inline-block" />已完成</span>
            <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-error-red inline-block" />失败</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-active > :not(:first-child),
.modal-fade-leave-active > :not(:first-child) {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from > :not(:first-child),
.modal-fade-leave-to > :not(:first-child) {
  transform: scale(0.95);
  opacity: 0;
}
</style>