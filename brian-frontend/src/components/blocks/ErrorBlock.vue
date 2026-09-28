<script setup lang="ts">
import { ref } from 'vue'
import { AlertCircle, RefreshCw, Copy, Check } from '@lucide/vue'
import type { ErrorBlock } from '@/api/types'
import { copyToClipboard } from '@/utils/clipboard'

const props = defineProps<{ block: ErrorBlock }>()
const emit = defineEmits<{ retry: [] }>()
const copied = ref(false)

async function copyTraceId() {
  if (!props.block.traceId) return
  const success = await copyToClipboard(props.block.traceId)
  if (success) {
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  }
}
</script>

<template>
  <div class="py-1" role="alert">
    <div class="block-card border-error-red/30 bg-error-red/5">
      <div class="px-3 py-2 flex items-start gap-2">
        <AlertCircle :size="16" class="text-error-red flex-shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <p class="text-sm text-error-red font-medium">{{ block.message }}</p>
          <p class="text-xs text-apple-gray-400 mt-1">错误码: {{ block.errorCode }}</p>
          <button
            v-if="block.traceId"
            class="mt-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-apple-gray-400 hover:text-brian-blue hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors"
            @click="copyTraceId"
          >
            <component :is="copied ? Check : Copy" :size="12" />
            {{ copied ? '已复制' : '复制 TraceId' }}
          </button>
        </div>
        <button
          v-if="block.retryAvailable"
          class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-error-red hover:bg-error-red/10 rounded-lg transition-colors flex-shrink-0"
          @click="emit('retry')"
        >
          <RefreshCw :size="12" />
          重试
        </button>
      </div>
    </div>
  </div>
</template>
