<script setup lang="ts">
import { ref } from 'vue'
import { ChevronRight, Loader2, Wrench, CheckCircle, XCircle } from '@lucide/vue'
import type { ToolCallBlock } from '@/api/types'

const _props = defineProps<{ block: ToolCallBlock }>()
const isExpanded = ref(false)
</script>

<template>
  <div class="py-1">
    <div class="block-card border-warning-orange/20 overflow-hidden">
      <button
        class="w-full flex items-center justify-between px-3 py-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors"
        @click="isExpanded = !isExpanded"
        :aria-expanded="isExpanded"
      >
        <div class="flex items-center gap-2">
          <Wrench :size="14" class="text-warning-orange" />
          <span class="text-xs font-medium">{{ block.toolName }}</span>
          <Loader2 v-if="block.meta.status === 'streaming'" :size="12" class="animate-spin text-warning-orange" />
          <CheckCircle v-else-if="block.meta.status === 'done'" :size="12" class="text-success-green" />
          <XCircle v-else-if="block.meta.status === 'error'" :size="12" class="text-error-red" />
        </div>
        <ChevronRight :size="14" class="text-apple-gray-400 transition-transform" :class="{ 'rotate-90': isExpanded }" />
      </button>

      <div v-if="isExpanded" class="px-4 pb-3 space-y-2">
        <div v-if="block.params && Object.keys(block.params).length > 0">
          <p class="text-xs font-medium text-apple-gray-500 mb-1">参数</p>
          <pre class="text-xs bg-apple-gray-100 dark:bg-apple-gray-900 rounded-lg p-2 overflow-x-auto">{{ JSON.stringify(block.params, null, 2) }}</pre>
        </div>
        <div v-if="block.result !== undefined">
          <p class="text-xs font-medium text-apple-gray-500 mb-1">结果</p>
          <pre class="text-xs bg-apple-gray-100 dark:bg-apple-gray-900 rounded-lg p-2 overflow-x-auto max-h-48 overflow-y-auto">{{ typeof block.result === 'string' ? block.result : JSON.stringify(block.result, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
