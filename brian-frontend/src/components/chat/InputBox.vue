<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { Send, Square, Quote } from '@lucide/vue'

const props = defineProps<{
  disabled?: boolean
  citingMode?: boolean
}>()

const emit = defineEmits<{
  send: [content: string, citingIds: string[]]
  toggleCiting: []
  stop: []
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
    <div class="flex items-end gap-2 max-w-3xl mx-auto bg-apple-gray-50 dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 px-4 py-2">
      <button
        class="p-1.5 rounded-lg transition-colors flex-shrink-0"
        :class="citingMode ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-400 hover:text-brian-blue'"
        title="引用模式"
        @click="emit('toggleCiting')"
      >
        <Quote :size="18" />
      </button>

      <textarea
        ref="textareaRef"
        v-model="text"
        class="flex-1 bg-transparent resize-none text-sm text-apple-gray-900 dark:text-apple-gray-50 placeholder-apple-gray-400 focus:outline-none py-2 min-h-[36px] max-h-[200px]"
        :disabled="disabled"
        placeholder="输入消息..."
        rows="1"
        @input="autoResize"
        @keydown="onKeydown"
      />

      <button
        v-if="disabled"
        class="p-1.5 rounded-lg text-warning-orange hover:bg-warning-orange/10 transition-colors flex-shrink-0"
        title="停止生成"
        @click="emit('stop')"
      >
        <Square :size="18" fill="currentColor" />
      </button>
      <button
        v-else
        class="p-1.5 rounded-lg transition-colors flex-shrink-0"
        :class="text.trim() ? 'text-brian-blue hover:bg-brian-blue/10' : 'text-apple-gray-300'"
        :disabled="!text.trim()"
        @click="handleSend"
      >
        <Send :size="18" />
      </button>
    </div>
  </div>
</template>
