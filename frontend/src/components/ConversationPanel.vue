<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useSessionStore } from '../stores/session'
import MessageBubble from './MessageBubble.vue'
import InputBox from './InputBox.vue'

const emit = defineEmits<{
  'openAgentChain': [exchangeId: string]
}>()

const sessionStore = useSessionStore()
const scrollContainer = ref<HTMLElement | null>(null)

watch(
  () => ({
    len: sessionStore.messages.length,
    lastContent: sessionStore.messages[sessionStore.messages.length - 1]?.content,
  }),
  async () => {
    await nextTick()
    scrollToBottom()
  },
  { deep: false }
)

function scrollToBottom() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}

function scrollToExchange(exchangeId: string) {
  const el = document.querySelector(`[data-exchange-id="${exchangeId}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

defineExpose({ scrollToExchange })
</script>

<template>
  <div class="conversation-panel">
    <div
      ref="scrollContainer"
      class="messages-area"
    >
      <div v-if="sessionStore.messages.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#D1D1D6" stroke-width="1.5" stroke-dasharray="4 4"/>
            <path d="M18 20h12M18 26h8" stroke="#D1D1D6" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="empty-text">开始对话</div>
      </div>

      <template v-for="group in sessionStore.groupedMessages" :key="group.date">
        <div class="date-separator">
          <span class="date-label">{{ group.label }}</span>
        </div>

        <div class="message-group">
          <MessageBubble
            v-for="(message, index) in group.messages"
            :key="message.id"
            :message="message"
            :is-last="index === group.messages.length - 1"
            :has-next="index < group.messages.length - 1"
            :next-role="index < group.messages.length - 1 ? group.messages[index + 1].role : null"
            @open-agent-chain="emit('openAgentChain', $event)"
          />
        </div>
      </template>
    </div>

    <div class="input-area">
      <InputBox />
    </div>
  </div>
</template>

<style scoped>
.conversation-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 14px;
}

.empty-icon {
  opacity: 0.4;
}

.empty-text {
  font-size: 13px;
  color: #AEAEB2;
  font-weight: 400;
}

.date-separator {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 0 10px;
}

.date-separator:first-child {
  padding-top: 0;
}

.date-label {
  font-size: 11px;
  color: #AEAEB2;
  font-weight: 500;
  letter-spacing: 0.3px;
}

.message-group {
  position: relative;
}

.input-area {
  flex-shrink: 0;
  padding: 10px 28px 14px;
}
</style>