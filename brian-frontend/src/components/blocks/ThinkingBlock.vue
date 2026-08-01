<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronRight, Loader2 } from '@lucide/vue'
import type { ThinkingBlock } from '@/api/types'

const props = defineProps<{ block: ThinkingBlock }>()
const isExpanded = ref(false)

const isStreaming = computed(() => props.block.meta.status === 'streaming')
</script>

<template>
  <div class="py-1">
    <div class="block-card border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10">
      <button
        class="w-full flex items-center justify-between px-3 py-2 hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-colors"
        @click="isExpanded = !isExpanded"
        :aria-expanded="isExpanded"
      >
        <div class="flex items-center gap-2">
          <ChevronRight
            :size="14"
            class="text-purple-500 transition-transform"
            :class="{ 'rotate-90': isExpanded }"
          />
          <span class="text-xs font-medium text-purple-600 dark:text-purple-400">
            {{ block.agentInfo?.name || 'Agent' }} · 思考中
          </span>
          <Loader2 v-if="isStreaming" :size="12" class="animate-spin text-purple-400" />
        </div>
        <span class="text-xs text-apple-gray-400">{{ block.durationMs ? `${block.durationMs}ms` : '' }}</span>
      </button>

      <div v-if="isExpanded" class="px-4 pb-3">
        <p class="text-sm text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap mt-2">
          {{ block.content || '思考中...' }}
          <span v-if="isStreaming" class="inline-block w-1.5 h-4 bg-purple-400 animate-cursor-blink align-middle ml-0.5" />
        </p>
      </div>
    </div>
  </div>
</template>
