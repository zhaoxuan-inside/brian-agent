<script setup lang="ts">
import { AlertTriangle, MessageSquare } from '@lucide/vue'
import type { DocAnnotation } from '@/composables/useLibraryTab'
import { renderMarkdown } from '@/utils/markdown'

defineProps<{ ann: DocAnnotation; index: number; active?: boolean; compact?: boolean }>()
defineEmits<{ (e: 'select'): void }>()
</script>

<template>
  <div
    class="rounded-xl border p-3 cursor-pointer transition-all"
    :class="active
      ? 'border-warning-orange/50 bg-warning-orange/10 shadow-sm'
      : 'border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50/60 dark:bg-apple-gray-800/40 hover:border-brian-blue/40'"
    @click="$emit('select')"
  >
    <div class="flex items-center gap-2 mb-1.5">
      <span
        class="w-5 h-5 flex-shrink-0 rounded-full text-2xs font-semibold flex items-center justify-center"
        :class="ann.stale
          ? 'bg-apple-gray-300 dark:bg-apple-gray-600 text-white'
          : active ? 'bg-warning-orange text-white' : 'bg-brian-blue text-white'"
      >{{ index }}</span>
      <span class="text-2xs font-medium text-apple-gray-500">咨询</span>
      <span v-if="ann.stale" class="ml-auto flex items-center gap-1 text-2xs text-error-red/90" title="原文已变更，无法在正文中定位">
        <AlertTriangle :size="11" /> 原文已变更
      </span>
    </div>
    <blockquote class="text-2xs text-apple-gray-500 border-l-2 border-apple-gray-300 dark:border-apple-gray-600 pl-2 mb-1.5 line-clamp-2">{{ ann.selectionText }}</blockquote>
    <p class="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-200 mb-1 flex items-start gap-1">
      <MessageSquare :size="12" class="mt-0.5 flex-shrink-0 text-apple-gray-400" /> {{ ann.question }}
    </p>
    <div class="markdown-body text-xs text-apple-gray-700 dark:text-apple-gray-300" :class="compact ? 'max-h-60 overflow-y-auto doc-margin-answer' : ''" v-html="renderMarkdown(ann.result)"></div>
  </div>
</template>
