<script setup lang="ts">
import { Brain, Loader2 } from '@lucide/vue'
import type { IntentConfirmation } from '@/api/types'

defineProps<{
  confirmation: IntentConfirmation
  /** 确认请求进行中（禁用按钮并展示加载态） */
  submitting: boolean
}>()

defineEmits<{
  confirm: [action: 'APPROVE' | 'KEEP' | 'CANCEL']
}>()
</script>

<template>
  <!-- 需求理解确认卡片（对话区内联，参考 Cursor 需求补充样式） -->
  <div class="flex items-start gap-2 justify-end">
    <div class="max-w-[85%] min-w-0">
      <div class="rounded-2xl bg-white dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 shadow-sm overflow-hidden">
        <div class="px-4 py-3 border-b border-apple-gray-100 dark:border-apple-gray-800">
          <p class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-100">确认需求理解</p>
          <p class="text-xs text-apple-gray-400 mt-0.5">这次改写与原文可能不是同一件事，请确认后继续</p>
        </div>
        <div class="px-4 py-3 space-y-3 text-sm">
          <div>
            <p class="text-xs text-apple-gray-400 mb-1">原始输入</p>
            <p class="text-apple-gray-700 dark:text-apple-gray-200">{{ confirmation.original_query }}</p>
          </div>
          <div>
            <p class="text-xs text-apple-gray-400 mb-1">理解后的需求</p>
            <p class="text-apple-gray-700 dark:text-apple-gray-200">{{ confirmation.understood_requirement }}</p>
          </div>
          <div v-if="confirmation.reasoning">
            <p class="text-xs text-apple-gray-400 mb-1">判断依据</p>
            <p class="text-apple-gray-600 dark:text-apple-gray-300">{{ confirmation.reasoning }}</p>
          </div>
        </div>
        <div class="px-4 py-3 border-t border-apple-gray-100 dark:border-apple-gray-800 flex items-center justify-end gap-2">
          <button
            class="px-3 py-1.5 rounded-lg text-sm text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 disabled:opacity-50"
            :disabled="submitting"
            @click="$emit('confirm', 'CANCEL')"
          >取消</button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm text-apple-gray-600 bg-apple-gray-100 hover:bg-apple-gray-200 dark:bg-apple-gray-800 dark:text-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-50"
            :disabled="submitting"
            @click="$emit('confirm', 'KEEP')"
          >按原文执行</button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm text-white bg-brian-blue hover:bg-brian-blue/90 disabled:opacity-50 flex items-center gap-1"
            :disabled="submitting"
            @click="$emit('confirm', 'APPROVE')"
          >
            <Loader2 v-if="submitting" :size="14" class="animate-spin" />
            按理解执行
          </button>
        </div>
      </div>
    </div>
    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center mt-1">
      <Brain :size="16" />
    </div>
  </div>
</template>
