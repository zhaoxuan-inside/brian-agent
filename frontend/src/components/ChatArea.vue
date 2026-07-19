<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSessionStore } from '../stores/session'
import ChatMap from './ChatMap.vue'
import ResizableDivider from './ResizableDivider.vue'
import ConversationPanel from './ConversationPanel.vue'
import AgentChainModal from './AgentChainModal.vue'

const sessionStore = useSessionStore()
const conversationPanel = ref<InstanceType<typeof ConversationPanel> | null>(null)
const selectedExchangeId = ref<string | null>(null)
const showAgentChain = ref(false)

// Restore the previous conversation after a page refresh
onMounted(async () => {
  const sessionId = sessionStore.currentSessionId
  if (!sessionId) return
  await Promise.all([
    sessionStore.loadChatHistory(sessionId, 'default-user'),
    sessionStore.loadExchanges(sessionId, 'default-user'),
  ])
})

function selectExchange(exchangeId: string) {
  if (selectedExchangeId.value === exchangeId) {
    selectedExchangeId.value = null
    return
  }
  selectedExchangeId.value = exchangeId
  // Load the agent chain DAG for this exchange
  sessionStore.loadAgentChainByExchangeId(exchangeId)
}

function scrollToExchange(exchangeId: string) {
  selectedExchangeId.value = exchangeId
  conversationPanel.value?.scrollToExchange(exchangeId)
}

function openAgentChain(exchangeId: string) {
  sessionStore.loadAgentChainByExchangeId(exchangeId)
  showAgentChain.value = true
}

function closeAgentChain() {
  showAgentChain.value = false
}

defineExpose({ openAgentChain, closeAgentChain })
</script>

<template>
  <div class="chat-area-wrapper">
    <div class="chat-area-container">
      <!-- Left: ChatMap DAG -->
      <div class="chatmap-panel" :style="{ width: sessionStore.splitRatio + '%' }">
        <ChatMap
          :exchanges="sessionStore.exchanges"
          :selected-exchange-id="selectedExchangeId"
          @select="selectExchange"
          @scroll-to="scrollToExchange"
          @open-agent-chain="openAgentChain"
        />
      </div>

      <ResizableDivider />

      <!-- Right: Conversation -->
      <div class="conversation-panel-wrap" :style="{ width: (100 - sessionStore.splitRatio) + '%' }">
        <ConversationPanel ref="conversationPanel" @open-agent-chain="openAgentChain" />
      </div>
    </div>

    <AgentChainModal :visible="showAgentChain" @close="closeAgentChain" />
  </div>
</template>

<style scoped>
.chat-area-wrapper {
  position: fixed;
  top: 64px;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
}

.chat-area-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.chatmap-panel {
  height: 100%;
  overflow: hidden;
  flex-shrink: 0;
}

.conversation-panel-wrap {
  height: 100%;
  overflow: hidden;
  flex: 1;
  background: #FFFFFF;
}

:root.dark .conversation-panel-wrap {
  background: #1C1C1E;
}
</style>