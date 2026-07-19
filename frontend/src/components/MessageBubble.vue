<script setup lang="ts">
import { ref, computed } from 'vue'
import { User, Sparkles, GitBranch } from '@lucide/vue'
import type { Message } from '@shared/types'
import RatingButtons from './RatingButtons.vue'
import { useSessionStore } from '../stores/session'

const props = defineProps<{
  message: Message
  hasNext?: boolean
  nextRole?: string | null
}>()

const emit = defineEmits<{
  'openAgentChain': [exchangeId: string]
}>()

const sessionStore = useSessionStore()
const showRating = ref(false)

const hasAgentChain = computed(() => {
  const byExchange = props.message.exchangeId && sessionStore.agentChainByExchangeId[props.message.exchangeId]
  const byMsgId = props.message.id && sessionStore.agentChainHistory[props.message.id]
  return !!(byExchange || byMsgId)
})

function viewAgentChain() {
  // Try exchangeId first, fallback to messageId
  if (props.message.exchangeId) {
    sessionStore.loadAgentChainByExchangeId(props.message.exchangeId)
    emit('openAgentChain', props.message.exchangeId)
    return
  }
  if (props.message.id) {
    sessionStore.loadAgentChainForMessage(props.message.id)
    emit('openAgentChain', props.message.id)
  }
}

setTimeout(() => {
  showRating.value = true
}, 500)

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div
    class="message-row"
    :class="message.role"
    :data-exchange-id="message.exchangeId"
  >
    <template v-if="message.role === 'assistant'">
      <div class="message-avatar assistant-avatar">
        <Sparkles :size="16" />
      </div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-sender">Brian</span>
          <span class="message-time">{{ formatTime(message.timestamp) }}</span>
          <button
            v-if="hasAgentChain"
            class="ml-1.5 p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors text-apple-gray-400 hover:text-brian-blue inline-flex"
            title="查看 Agent 调度链"
            @click="viewAgentChain"
          >
            <GitBranch :size="12" />
          </button>
        </div>
        <div class="message-content assistant-content">
          <p class="message-text">{{ message.content }}</p>
        </div>
        <Transition name="fade">
          <RatingButtons
            v-if="showRating"
            :message-id="message.id"
            :rating="message.rating"
            class="mt-2"
          />
        </Transition>
      </div>
    </template>

    <template v-else>
      <div class="message-body user-body">
        <div class="message-header user-header">
          <button
            v-if="hasAgentChain"
            class="mr-1.5 p-0.5 rounded hover:bg-white/20 transition-colors text-white/60 hover:text-white inline-flex"
            title="查看 Agent 调度链"
            @click="viewAgentChain"
          >
            <GitBranch :size="12" />
          </button>
          <span class="message-time">{{ formatTime(message.timestamp) }}</span>
          <span class="message-sender">You</span>
        </div>
        <div class="message-content user-content">
          <p class="message-text">{{ message.content }}</p>
        </div>
      </div>
      <div class="message-avatar user-avatar">
        <User :size="16" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.message-row {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  animation: message-in 0.3s ease-out;
}

.message-row.user {
  justify-content: flex-end;
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Avatar */
.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.assistant-avatar {
  background: linear-gradient(135deg, #007AFF20, #007AFF10);
  color: #007AFF;
}

.user-avatar {
  background: linear-gradient(135deg, #34C75920, #34C75910);
  color: #34C759;
}

/* Body */
.message-body {
  max-width: 72%;
  min-width: 0;
}

.user-body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* Header */
.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.user-header {
  justify-content: flex-end;
}

.message-sender {
  font-size: 13px;
  font-weight: 600;
  color: #1D1D1F;
}

:root.dark .message-sender {
  color: #F5F5F7;
}

.message-time {
  font-size: 11px;
  color: #86868B;
}

/* Content */
.message-content {
  border-radius: 16px;
  padding: 14px 18px;
  line-height: 1.65;
}

.assistant-content {
  background: #F5F5F7;
  border-top-left-radius: 4px;
}

:root.dark .assistant-content {
  background: #2C2C2E;
}

.assistant-content .message-text {
  color: #1D1D1F;
}

:root.dark .assistant-content .message-text {
  color: #F5F5F7;
}

.user-content {
  background: #007AFF;
  border-top-right-radius: 4px;
}

.user-content .message-text {
  color: #FFFFFF;
}

.message-text {
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>