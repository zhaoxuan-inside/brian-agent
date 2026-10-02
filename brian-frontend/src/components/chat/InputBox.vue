<script setup lang="ts">
import { useI18nStore } from '@/stores/i18n'
import { ref, nextTick } from 'vue'
import { Send, Square, Quote, X } from '@lucide/vue'

const i18nStore = useI18nStore()
const props = defineProps<{
  disabled?: boolean
  citingMode?: boolean
  selectedCount?: number
}>()

const emit = defineEmits<{
  (e: 'send', content: string, citingIds: string[]): void
  (e: 'toggleCiting'): void
  (e: 'clearSelected'): void
  (e: 'stop'): void
}>()

const text = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const citingIds = ref<string[]>([])

function handleSend() {
  const val = text.value.trim()
  if (!val || props.disabled) return
  emit('send', val, citingIds.value)
  text.value = ''
  citingIds.value = []
  nextTick(() => autoResize())
}

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="px-4 py-3">
    <div class="max-w-3xl mx-auto space-y-1.5">
      <div
        v-if="selectedCount && selectedCount > 0"
        class="flex items-center justify-between px-3 py-1 rounded-chat-md bg-chat-primary/10 border border-chat-primary/25 text-chat-primary-hover text-xs"
      >
        <span class="truncate">已勾选 {{ selectedCount }} 条消息作为本次问答唯一上下文（与钉住消息合并）</span>
        <button
          class="flex items-center gap-0.5 text-xs text-chat-ink-subtle hover:text-chat-ink ml-2 flex-shrink-0"
          title="清空勾选"
          @click="emit('clearSelected')"
        >
          <X :size="12" /> 清空
        </button>
      </div>

      <div class="flex items-end gap-2 bg-chat-surface-1 rounded-chat-md border border-chat-hairline focus-within:border-chat-primary-hover px-4 py-2 transition-colors">
        <button
          class="p-1.5 rounded-chat-sm transition-colors flex-shrink-0"
          :class="citingMode ? 'bg-chat-primary/15 text-chat-primary-hover' : 'text-chat-ink-tertiary hover:text-chat-ink'"
          :title="i18nStore.t('chat.citingMode')"
          @click="emit('toggleCiting')"
        >
          <Quote :size="18" />
        </button>

        <textarea
          ref="textareaRef"
          v-model="text"
          class="flex-1 bg-transparent resize-none text-sm text-chat-ink placeholder-chat-ink-tertiary focus:outline-none py-2 min-h-[36px] max-h-[200px]"
          :disabled="disabled"
          :placeholder="i18nStore.t('chat.input.placeholder')"
          rows="1"
          @input="autoResize"
          @keydown="onKeydown"
        />

        <button
          v-if="disabled"
          class="p-1.5 rounded-chat-sm text-chat-warning hover:bg-chat-warning/10 transition-colors flex-shrink-0"
          :title="i18nStore.t('chat.stop')"
          @click="emit('stop')"
        >
          <Square :size="18" fill="currentColor" />
        </button>
        <button
          v-else
          class="p-1.5 rounded-chat-sm transition-colors flex-shrink-0"
          :class="text.trim() ? 'text-chat-primary-hover hover:bg-chat-primary/10' : 'text-chat-ink-tertiary'"
          :disabled="!text.trim()"
          @click="handleSend"
        >
          <Send :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>
