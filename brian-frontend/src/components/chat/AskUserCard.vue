<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Loader2, MessageCircleQuestion } from '@lucide/vue'
import type { AskUserCardData } from '@/api/types'

const props = defineProps<{
  askUser: AskUserCardData
  /** 应答提交中（禁用输入与按钮） */
  submitting: boolean
}>()

const emit = defineEmits<{
  answer: [askUser: AskUserCardData, answer: string]
}>()

const draft = ref('')

const interactive = computed(() => props.askUser.status === 'pending' && !props.submitting)
const canSubmit = computed(() => interactive.value && draft.value.trim().length > 0)

const kindLabel = computed(() => (props.askUser.kind === 'confirm' ? '确认' : '澄清'))
const statusLabel = computed(() => (props.askUser.status === 'answered' ? '已答复' : '等待你的答复'))

function submit() {
  if (!canSubmit.value) return
  const answer = draft.value.trim()
  emit('answer', props.askUser, answer)
  draft.value = ''
}
</script>

<template>
  <!-- ask_user 提问卡（对话区内联）：问题 + 文本答复；答复恢复为会话下一条 user 消息 -->
  <div class="flex items-start gap-2 justify-end">
    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-brian-blue/10 text-brian-blue flex items-center justify-center mt-1">
      <Brain :size="16" />
    </div>
    <div class="max-w-[85%] min-w-0">
      <div class="rounded-2xl bg-white dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 shadow-sm overflow-hidden">
        <div class="px-4 py-3 border-b border-apple-gray-100 dark:border-apple-gray-800 flex items-center gap-2">
          <MessageCircleQuestion :size="16" class="text-brian-blue" />
          <div class="min-w-0">
            <p class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-100">Agent 请求{{ kindLabel }}</p>
            <p class="text-xs text-apple-gray-400 mt-0.5">答复将作为对话下一条消息发送给 Agent</p>
          </div>
          <span class="ml-auto flex-shrink-0 text-xs font-medium" :class="askUser.status === 'answered' ? 'text-green-600 dark:text-green-400' : 'text-apple-gray-500 dark:text-apple-gray-400'">
            {{ statusLabel }}
          </span>
        </div>
        <div class="px-4 py-3 text-sm">
          <p class="text-apple-gray-700 dark:text-apple-gray-200 whitespace-pre-wrap break-words">{{ askUser.question }}</p>
          <div v-if="askUser.status === 'pending'" class="mt-3 flex items-center gap-2">
            <input
              v-model="draft"
              type="text"
              class="flex-1 min-w-0 rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 px-3 py-2 text-sm text-apple-gray-800 dark:text-apple-gray-100 outline-none focus:border-brian-blue disabled:opacity-50"
              placeholder="输入你的答复…"
              :disabled="!interactive"
              @keydown.enter="submit"
            />
            <button
              class="flex-shrink-0 px-3 py-2 rounded-lg text-sm text-white bg-brian-blue hover:bg-brian-blue/90 disabled:opacity-50 flex items-center gap-1"
              :disabled="!canSubmit"
              @click="submit"
            >
              <Loader2 v-if="submitting" :size="14" class="animate-spin" />
              <Check v-else :size="14" />
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
