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
    <div class="chat-card border-chat-error/30 bg-chat-error/5">
      <div class="px-3 py-2 flex items-start gap-2">
        <AlertCircle :size="16" class="text-chat-error flex-shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <p class="text-sm text-chat-error font-medium">{{ block.message }}</p>
          <p class="text-xs text-chat-ink-tertiary mt-1">错误码: {{ block.errorCode }}</p>
          <button
            v-if="block.traceId"
            class="mt-1 flex items-center gap-1 px-1.5 py-0.5 rounded-chat-sm text-xs text-chat-ink-tertiary hover:text-chat-primary-hover hover:bg-chat-surface-2 transition-colors"
            @click="copyTraceId"
          >
            <component :is="copied ? Check : Copy" :size="12" />
            {{ copied ? '已复制' : '复制 TraceId' }}
          </button>
        </div>
        <button
          v-if="block.retryAvailable"
          class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-chat-error hover:bg-chat-error/10 rounded-chat-md transition-colors flex-shrink-0"
          @click="emit('retry')"
        >
          <RefreshCw :size="12" />
          重试
        </button>
      </div>
    </div>
  </div>
</template>
