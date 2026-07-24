<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSessionStore } from '../stores/session'
import ChatMap from './ChatMap.vue'
import ResizableDivider from './ResizableDivider.vue'
import ConversationPanel from './ConversationPanel.vue'
import AgentDagModal from './AgentDagModal.vue'

const sessionStore = useSessionStore()
const conversationPanel = ref<InstanceType<typeof ConversationPanel> | null>(null)
const showAgentDag = ref(false)

// Restore the previous conversation after a page refresh
onMounted(async () => {
  const sessionId = sessionStore.currentSessionId
  if (!sessionId) return
  await Promise.all([
    sessionStore.loadChatHistory(sessionId, 'default-user'),
    sessionStore.loadExchanges(sessionId, 'default-user'),
    sessionStore.loadDag(sessionId, 'default-user'),
  ])
})

// ChatMap 节点点击 / 引用弹窗跳转 -> 对话区滚动定位到该消息
function locateMessage(msgId: string) {
  conversationPanel.value?.scrollToMessage(msgId)
}

// 对话区消息点击 -> ChatMap 对应节点平移居中
function focusDagNode(msgId: string) {
  sessionStore.focusMessage(msgId)
}

function openAgentDag() {
  showAgentDag.value = true
}

function closeAgentDag() {
  showAgentDag.value = false
}

defineExpose({ openAgentDag, closeAgentDag })
</script>

<template>
  <div class="chat-area-wrapper">
    <div class="chat-area-container">
      <!-- Left: ChatMap DAG -->
      <div class="chatmap-panel" :style="{ width: sessionStore.splitRatio + '%' }">
        <ChatMap
          @locate="locateMessage"
        />
      </div>

      <ResizableDivider />

      <!-- Right: Conversation -->
      <div class="conversation-panel-wrap" :style="{ width: (100 - sessionStore.splitRatio) + '%' }">
        <ConversationPanel ref="conversationPanel" @locate="focusDagNode" @open-agent-dag="openAgentDag" />
      </div>
    </div>

    <AgentDagModal v-if="showAgentDag" @close="closeAgentDag" />
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
