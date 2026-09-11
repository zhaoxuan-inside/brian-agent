<script setup lang="ts">
/**
 * 对话输入条。左侧不是「引用原文」，而是「选用上文」：
 * 打开后消息出现勾选框，指定本次提问主要依据哪些历史消息。
 */
import { computed, nextTick, ref } from 'vue'
import { Send, Square, ListChecks, X } from '@lucide/vue'
import { useI18nStore } from '@/stores/i18n'

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

const i18n = useI18nStore()
const text = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const citingIds = ref<string[]>([])

const selectedCount = computed(() => props.selectedCount ?? 0)

const contextButtonLabel = computed(() => {
  if (!props.citingMode) return i18n.t('chat.pickContext')
  if (selectedCount.value > 0) return i18n.t('chat.pickContextCount').replace('{n}', String(selectedCount.value))
  return i18n.t('chat.pickContextOn')
})

const placeholder = computed(() => {
  if (props.citingMode && selectedCount.value === 0) return i18n.t('chat.input.placeholderPicking')
  if (props.citingMode) return i18n.t('chat.input.placeholderPicked')
  return i18n.t('chat.input.placeholder')
})

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
        v-if="citingMode && selectedCount === 0"
        class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brian-blue/10 border border-brian-blue/20 text-xs text-apple-gray-600 dark:text-apple-gray-300"
      >
        <ListChecks :size="13" class="text-brian-blue flex-shrink-0" />
        <span>{{ i18n.t('chat.pickContextHint') }}</span>
      </div>

      <div
        v-else-if="selectedCount > 0"
        class="flex items-center justify-between px-3 py-1.5 rounded-xl bg-brian-blue/10 border border-brian-blue/20 text-brian-blue text-xs"
      >
        <span class="truncate">{{ i18n.t('chat.pickContextSelected').replace('{n}', String(selectedCount)) }}</span>
        <button
          class="flex items-center gap-0.5 text-xs text-apple-gray-500 hover:text-brian-blue ml-2 flex-shrink-0"
          :title="i18n.t('chat.pickContextClear')"
          @click="emit('clearSelected')"
        >
          <X :size="12" /> {{ i18n.t('chat.pickContextClear') }}
        </button>
      </div>

      <div
        class="flex items-end gap-2 bg-apple-gray-50 dark:bg-apple-gray-800 rounded-2xl border px-3 py-2 transition-colors"
        :class="citingMode
          ? 'border-brian-blue/40 ring-1 ring-brian-blue/20'
          : 'border-apple-gray-200 dark:border-apple-gray-700'"
      >
        <button
          class="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0"
          :class="citingMode
            ? 'bg-brian-blue text-white'
            : 'text-apple-gray-500 hover:text-brian-blue hover:bg-brian-blue/10'"
          :title="i18n.t('chat.pickContextTip')"
          :aria-pressed="citingMode"
          @click="emit('toggleCiting')"
        >
          <ListChecks :size="16" />
          <span>{{ contextButtonLabel }}</span>
        </button>

        <textarea
          ref="textareaRef"
          v-model="text"
          class="flex-1 bg-transparent resize-none text-sm text-apple-gray-900 dark:text-apple-gray-50 placeholder-apple-gray-400 focus:outline-none py-2 min-h-[36px] max-h-[200px]"
          :disabled="disabled"
          :placeholder="placeholder"
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
  </div>
</template>
