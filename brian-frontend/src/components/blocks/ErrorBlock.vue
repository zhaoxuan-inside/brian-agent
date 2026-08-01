<script setup lang="ts">
import { AlertCircle, RefreshCw } from '@lucide/vue'
import type { ErrorBlock } from '@/api/types'

defineProps<{ block: ErrorBlock }>()
</script>

<template>
  <div class="py-1" role="alert">
    <div class="block-card border-error-red/30 bg-error-red/5">
      <div class="px-3 py-2 flex items-start gap-2">
        <AlertCircle :size="16" class="text-error-red flex-shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <p class="text-sm text-error-red font-medium">{{ block.message }}</p>
          <p class="text-xs text-apple-gray-400 mt-1">错误码: {{ block.errorCode }}</p>
        </div>
        <button
          v-if="block.retryAvailable"
          class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-error-red hover:bg-error-red/10 rounded-lg transition-colors flex-shrink-0"
        >
          <RefreshCw :size="12" />
          重试
        </button>
      </div>
    </div>
  </div>
</template>
