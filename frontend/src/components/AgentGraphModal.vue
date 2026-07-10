<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSessionStore } from '../stores/session'
import { Circle, CheckCircle, XCircle, Loader2, ArrowDown } from '@lucide/vue'

const sessionStore = useSessionStore()
const selectedAgentId = ref<string | null>(null)

const selectedAgent = computed(() =>
  sessionStore.agentChain.find(a => a.id === selectedAgentId.value)
)

function getStatusColor(status: string): string {
  switch (status) {
    case 'running': return '#007AFF'
    case 'completed': return '#34C759'
    case 'failed': return '#FF3B30'
    default: return '#AEAEB2'
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'running': return Loader2
    case 'completed': return CheckCircle
    case 'failed': return XCircle
    default: return Circle
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'running': return '运行中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    default: return '空闲'
  }
}

// Build DAG layers by topological sort (approximate by type)
const layers = computed(() => {
  const roots = sessionStore.agentChain.filter(a => a.type === 'root')
  const subs = sessionStore.agentChain.filter(a => a.type === 'sub')
  const workers = sessionStore.agentChain.filter(a => a.type === 'work')
  
  return {
    roots,
    subs: subs.length > 0 ? subs : workers,
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-apple-gray-50 dark:bg-apple-gray-900">
    <div class="flex items-center justify-between p-5 border-b border-apple-gray-200 dark:border-apple-gray-700">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-brian-blue/10 rounded-lg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-brian-blue"><circle cx="6" cy="4" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="6" cy="18" r="2"/><path d="M8 6l4 4M14 10l-2 2M12 14l-4 4"/></svg>
        </div>
        <div>
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">Agent 调度链</h2>
          <p class="text-xs text-apple-gray-400">有向无环图 · {{ sessionStore.agentChain.length }} 个 Agent</p>
        </div>
      </div>
    </div>

    <div class="flex-1 flex">
      <!-- DAG Visualization -->
      <div class="flex-1 overflow-y-auto p-6">
        <div v-if="sessionStore.agentChain.length === 0" class="text-center py-20 text-apple-gray-400">
          <p class="text-sm">暂无 Agent 调度数据</p>
          <p class="text-xs mt-1">发送消息后自动生成</p>
        </div>

        <div v-else class="space-y-10">
          <!-- Root layer -->
          <div>
            <p class="text-xs font-semibold text-apple-gray-400 mb-3 uppercase tracking-wider">Coordinator</p>
            <div class="flex justify-center">
              <div v-for="agent in layers.roots" :key="agent.id"
                :class="['relative p-4 rounded-xl cursor-pointer transition-all border-2 min-w-[180px]',
                  selectedAgentId === agent.id ? 'border-brian-blue bg-brian-blue/5 shadow-lg' : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800']"
                @click="selectedAgentId = agent.id">
                <div class="flex items-center gap-2 mb-1">
                  <component :is="getStatusIcon(agent.status)" :size="18" :color="getStatusColor(agent.status)"
                    :class="agent.status === 'running' ? 'animate-spin' : ''" />
                  <span class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ agent.name }}</span>
                </div>
                <p class="text-xs text-apple-gray-400">{{ agent.type }}</p>
                <span :class="['absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full',
                  agent.status === 'completed' ? 'bg-success-green/10 text-success-green' : '',
                  agent.status === 'running' ? 'bg-brian-blue/10 text-brian-blue' : '',
                  agent.status === 'failed' ? 'bg-error-red/10 text-error-red' : '',
                  agent.status === 'idle' ? 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400' : '']">
                  {{ getStatusLabel(agent.status) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Arrows down -->
          <div class="flex justify-center" v-if="layers.subs.length > 0">
            <ArrowDown :size="28" class="text-apple-gray-300 dark:text-apple-gray-600" />
          </div>

          <!-- Sub agents layer -->
          <div v-if="layers.subs.length > 0">
            <p class="text-xs font-semibold text-apple-gray-400 mb-3 uppercase tracking-wider text-center">Sub Agents</p>
            <div class="flex flex-wrap justify-center gap-4">
              <div v-for="agent in layers.subs" :key="agent.id"
                :class="['relative p-3 rounded-xl cursor-pointer transition-all border min-w-[160px]',
                  selectedAgentId === agent.id ? 'border-brian-blue bg-brian-blue/5 shadow-lg' : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800']"
                @click="selectedAgentId = agent.id">
                <div class="flex items-center gap-2">
                  <component :is="getStatusIcon(agent.status)" :size="16" :color="getStatusColor(agent.status)"
                    :class="agent.status === 'running' ? 'animate-spin' : ''" />
                  <div>
                    <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ agent.name }}</p>
                    <p :class="['text-[10px]',
                      agent.status === 'completed' ? 'text-success-green' : '',
                      agent.status === 'running' ? 'text-brian-blue' : '',
                      agent.status === 'failed' ? 'text-error-red' : '',
                      agent.status === 'idle' ? 'text-apple-gray-400' : '']">
                      {{ getStatusLabel(agent.status) }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Legend -->
          <div class="flex items-center justify-center gap-6 pt-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <div class="flex items-center gap-1.5">
              <div class="w-3 h-3 rounded-full bg-brian-blue" /><span class="text-[10px] text-apple-gray-400">运行中</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="w-3 h-3 rounded-full bg-success-green" /><span class="text-[10px] text-apple-gray-400">已完成</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="w-3 h-3 rounded-full bg-error-red" /><span class="text-[10px] text-apple-gray-400">失败</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Sidecar: Agent Output -->
      <div v-if="selectedAgent" class="w-72 border-l border-apple-gray-200 dark:border-apple-gray-700 flex flex-col overflow-hidden">
        <div class="p-3 border-b flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ selectedAgent.name }}</p>
            <p class="text-[10px] text-apple-gray-400">{{ selectedAgent.type }} · {{ getStatusLabel(selectedAgent.status) }}</p>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-3 space-y-1">
          <div v-if="selectedAgent.output.length === 0" class="text-xs text-apple-gray-400 py-8 text-center">
            {{ selectedAgent.status === 'running' ? '等待输出...' : '无输出' }}
          </div>
          <div v-for="(line, i) in selectedAgent.output" :key="i"
            :class="['text-xs p-2 rounded-lg',
              line.type === 'stderr' ? 'bg-error-red/5 text-error-red' :
              line.type === 'system' ? 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500' :
              'bg-success-green/5 text-apple-gray-700 dark:text-apple-gray-300']">
            {{ line.content }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
