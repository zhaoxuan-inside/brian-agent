<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, Copy, Check } from '@lucide/vue'

/**
 * variant='glass' 为全局默认;variant='chat' 仅对话页(ADR-015)。
 */
const props = withDefaults(defineProps<{
  path: string[]
  variant?: 'glass' | 'chat'
}>(), {
  variant: 'glass',
})

const isChat = computed(() => props.variant === 'chat')

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function copyPath() {
  const text = props.path.join(' > ')
  const onSuccess = () => {
    copied.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { copied.value = false }, 2000)
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => { /* ignore */ })
  } else {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try { document.execCommand('copy'); onSuccess() } catch { /* ignore */ }
    document.body.removeChild(textarea)
  }
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <template v-for="(item, idx) in path" :key="idx">
      <ChevronRight v-if="idx > 0" :size="12" class="flex-shrink-0" :class="isChat ? 'text-chat-ink-tertiary' : 'text-apple-gray-400'" />
      <span class="text-sm" :class="isChat ? 'text-chat-ink-muted' : 'text-apple-gray-600 dark:text-apple-gray-300'">{{ item }}</span>
    </template>
    <button
      class="ml-1 p-1 rounded transition-colors flex-shrink-0"
      :class="isChat ? 'text-chat-ink-tertiary hover:text-chat-primary-hover' : 'text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10'"
      title="复制路径"
      @click="copyPath"
    >
      <Check v-if="copied" :size="13" :class="isChat ? 'text-chat-success' : 'text-success-green'" />
      <Copy v-else :size="13" />
    </button>
  </div>
</template>
