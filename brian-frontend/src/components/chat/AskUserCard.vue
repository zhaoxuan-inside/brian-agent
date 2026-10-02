<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Loader2, MessageCircleQuestion } from '@lucide/vue'
import type { AskUserCardData } from '@/api/types'

const props = defineProps<{
  askUser: AskUserCardData
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
  <div class="flex items-start gap-2 justify-end">
    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-chat-primary/15 text-chat-primary-hover flex items-center justify-center mt-1">
      <Brain :size="16" />
    </div>
    <div class="max-w-[85%] min-w-0">
      <div class="chat-card overflow-hidden">
        <div class="px-4 py-3 border-b border-chat-hairline flex items-center gap-2">
          <MessageCircleQuestion :size="16" class="text-chat-primary-hover" />
          <div class="min-w-0">
            <p class="text-sm font-semibold text-chat-ink">Agent 请求{{ kindLabel }}</p>
            <p class="text-xs text-chat-ink-tertiary mt-0.5">答复将作为对话下一条消息发送给 Agent</p>
          </div>
          <span class="ml-auto flex-shrink-0 text-xs font-medium" :class="askUser.status === 'answered' ? 'text-chat-success' : 'text-chat-ink-subtle'">
            {{ statusLabel }}
          </span>
        </div>
        <div class="px-4 py-3 text-sm">
          <p class="text-chat-ink-muted whitespace-pre-wrap break-words">{{ askUser.question }}</p>
          <div v-if="askUser.status === 'pending'" class="mt-3 flex items-center gap-2">
            <input
              v-model="draft"
              type="text"
              class="flex-1 min-w-0 rounded-chat-md border border-chat-hairline bg-chat-canvas px-3 py-2 text-sm text-chat-ink placeholder-chat-ink-tertiary outline-none focus:border-chat-primary-hover disabled:opacity-50"
              placeholder="输入你的答复…"
              :disabled="!interactive"
              @keydown.enter="submit"
            />
            <button
              class="flex-shrink-0 px-3 py-2 rounded-chat-md text-sm text-chat-on-primary bg-chat-primary hover:bg-chat-primary-hover disabled:opacity-50 flex items-center gap-1 transition-colors"
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
