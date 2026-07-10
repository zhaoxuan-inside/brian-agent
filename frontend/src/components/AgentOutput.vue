<script setup lang="ts">
import type { AgentOutputItem } from '@shared/types'

defineProps<{
  output: AgentOutputItem[]
}>()

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="space-y-2 max-h-40 overflow-y-auto">
    <div 
      v-for="(item, index) in output" 
      :key="index"
      class="text-xs"
    >
      <span class="text-apple-gray-400 mr-2">{{ formatTime(item.timestamp) }}</span>
      <span 
        :class="[
          item.type === 'stdout' ? 'text-apple-gray-700 dark:text-apple-gray-300' : '',
          item.type === 'stderr' ? 'text-error-red' : '',
          item.type === 'system' ? 'text-brian-blue' : ''
        ]"
      >
        {{ item.content }}
      </span>
    </div>
  </div>
</template>
