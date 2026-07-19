<script setup lang="ts">
import { ref } from 'vue'
import { Plus, History, X, PanelLeftClose, PanelLeft } from '@lucide/vue'
import NeuralBackground from '../components/NeuralBackground.vue'
import Header from '../components/Header.vue'
import ChatArea from '../components/ChatArea.vue'
import { useSessionStore } from '../stores/session'

const sessionStore = useSessionStore()
const showSidebar = ref(false)

function toggleSidebar() {
  showSidebar.value = !showSidebar.value
  if (showSidebar.value) {
    sessionStore.loadChatList('default-user')
  }
}

async function handleSelectChat(sessionId: string) {
  await Promise.all([
    sessionStore.loadChatHistory(sessionId, 'default-user'),
    sessionStore.loadExchanges(sessionId, 'default-user'),
  ])
  showSidebar.value = false
}

function handleNewChat() {
  sessionStore.clearMessages()
  showSidebar.value = false
}

function formatChatTime(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="h-screen w-screen overflow-hidden flex flex-col">
    <NeuralBackground />
    <Header />

    <button
      class="fixed left-4 top-20 z-30 p-2 rounded-lg bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-sm border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue dark:hover:text-brian-blue transition-colors shadow-sm"
      :title="showSidebar ? '收起侧边栏' : '展开侧边栏'"
      @click="toggleSidebar"
    >
      <PanelLeftClose v-if="showSidebar" :size="18" />
      <PanelLeft v-else :size="18" />
    </button>

    <Transition name="sidebar">
      <div v-if="showSidebar" class="fixed left-0 top-16 bottom-0 w-72 z-20 bg-white/95 dark:bg-apple-gray-950/95 backdrop-blur-md border-r border-apple-gray-200 dark:border-apple-gray-800 flex flex-col">
        <div class="flex items-center justify-between p-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-center gap-2">
            <History :size="18" class="text-brian-blue" />
            <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">历史会话</h3>
          </div>
          <button
            class="p-1.5 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 text-apple-gray-400 transition-colors"
            @click="showSidebar = false"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="p-3">
          <button
            class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-brian-blue text-white text-sm font-medium hover:bg-brian-blue/90 transition-colors"
            @click="handleNewChat"
          >
            <Plus :size="16" />
            新建对话
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-3 pb-3">
          <div v-if="sessionStore.chatList.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">
            暂无历史会话
          </div>
          <div v-else class="space-y-1">
            <button
              v-for="chat in sessionStore.chatList"
              :key="chat.sessionId"
              class="w-full text-left px-3 py-2 rounded-lg transition-colors"
              :class="chat.sessionId === sessionStore.currentSessionId
                ? 'bg-brian-blue/10 dark:bg-brian-blue/20'
                : 'hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'"
              @click="handleSelectChat(chat.sessionId)"
            >
              <p class="text-sm text-apple-gray-900 dark:text-apple-gray-50 truncate">
                {{ chat.lastMessage || '(空对话)' }}
              </p>
              <p class="text-xs text-apple-gray-400 mt-0.5">
                {{ formatChatTime(chat.lastTime) }}
              </p>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <ChatArea />
  </div>
</template>

<style scoped>
.sidebar-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.sidebar-leave-active {
  transition: all 0.2s ease-in;
}
.sidebar-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}
.sidebar-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}
</style>