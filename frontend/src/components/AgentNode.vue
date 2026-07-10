<script setup lang="ts">
import { ref } from 'vue'
import { Circle, CheckCircle, XCircle } from '@lucide/vue'
import type { AgentNode } from '@shared/types'
import AgentOutput from './AgentOutput.vue'

defineProps<{
  agent: AgentNode
}>()

const isExpanded = ref(true)

function getStatusColor(status: string): string {
  switch (status) {
    case 'running': return 'text-brian-blue'
    case 'completed': return 'text-success-green'
    case 'failed': return 'text-error-red'
    default: return 'text-apple-gray-400'
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'running': return Circle
    case 'completed': return CheckCircle
    case 'failed': return XCircle
    default: return Circle
  }
}
</script>

<template>
  <div class="glass-panel rounded-xl p-3">
    <div 
      class="flex items-center justify-between cursor-pointer"
      @click="isExpanded = !isExpanded"
    >
      <div class="flex items-center gap-3">
        <div :class="[getStatusColor(agent.status), 'animate-pulse-soft']">
          <component :is="getStatusIcon(agent.status)" :size="16" />
        </div>
        
        <div>
          <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">
            {{ agent.name }}
          </p>
          <p class="text-xs text-apple-gray-400">
            {{ agent.type }}
          </p>
        </div>
      </div>
      
      <span 
        :class="[
          'text-xs px-2 py-1 rounded-full',
          agent.status === 'running' ? 'bg-brian-blue/10 text-brian-blue' : '',
          agent.status === 'completed' ? 'bg-success-green/10 text-success-green' : '',
          agent.status === 'failed' ? 'bg-error-red/10 text-error-red' : '',
          agent.status === 'idle' ? 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400' : ''
        ]"
      >
        {{ agent.status === 'running' ? '运行中' : agent.status === 'completed' ? '已完成' : agent.status === 'failed' ? '失败' : '空闲' }}
      </span>
    </div>
    
    <Transition name="expand">
      <div v-if="isExpanded && agent.output.length > 0" class="mt-3 pt-3 border-t border-apple-gray-200 dark:border-apple-gray-700">
        <AgentOutput :output="agent.output" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 200px;
}
</style>
