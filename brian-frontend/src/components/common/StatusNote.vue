<script setup lang="ts">
/**
 * StatusNote —— 列表/面板统一三态(loading / empty / error)
 * 替代散落的"加载中..."纯文本与各写各的空态;error 提供重试插槽。
 */
withDefaults(defineProps<{
  state: 'loading' | 'empty' | 'error'
  /** empty/error 下的说明文字 */
  message?: string
}>(), {
  message: '',
})

const emit = defineEmits<{ (e: 'retry'): void }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-10 text-center" role="status">
    <!-- loading:三点呼吸 -->
    <div v-if="state === 'loading'" class="flex items-center gap-1.5" aria-label="加载中">
      <span class="w-1.5 h-1.5 rounded-full bg-brian-blue/70 animate-pulse-soft" />
      <span class="w-1.5 h-1.5 rounded-full bg-brian-blue/50 animate-pulse-soft [animation-delay:0.2s]" />
      <span class="w-1.5 h-1.5 rounded-full bg-brian-blue/30 animate-pulse-soft [animation-delay:0.4s]" />
      <span class="sr-only">加载中…</span>
    </div>

    <template v-else>
      <svg v-if="state === 'empty'" class="w-8 h-8 text-apple-gray-300 dark:text-apple-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10" />
        <path d="M21 15h-5v5" />
        <path d="M8 9h8M8 13h5" />
      </svg>
      <svg v-else class="w-8 h-8 text-error-red/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <p class="text-2xs text-apple-gray-400 dark:text-apple-gray-500">
        {{ message || (state === 'empty' ? '暂无内容' : '加载失败') }}
      </p>
      <button
        v-if="state === 'error'"
        type="button"
        class="btn-secondary text-xs"
        @click="emit('retry')"
      >重试</button>
    </template>
  </div>
</template>
