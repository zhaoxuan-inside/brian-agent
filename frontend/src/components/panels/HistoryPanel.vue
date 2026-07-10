<script setup lang="ts">
import { ref, computed } from 'vue'
import { History, Clock, MessageCircle, Trash2, GitBranch } from '@lucide/vue'
import { useSessionStore } from '../../stores/session'

const sessionStore = useSessionStore()
const searchQuery = ref('')

const sessions = computed(() => {
  const msgs = sessionStore.messages
  if (msgs.length === 0) return []
  
  // Group messages into conversation "sessions" — typically one session = user+assistant pair
  const userMessages = msgs.filter(m => m.role === 'user')
  return userMessages.map((msg) => {
    const hasChain = msg.id in sessionStore.agentChainHistory || 
      (msg.id === sessionStore.currentAgentChainId && sessionStore.agentChain.length > 0)
    return {
      id: msg.id,
      title: msg.content.length > 30 ? msg.content.slice(0, 30) + '...' : msg.content,
      messages: 2, // user + assistant
      lastMessage: msgs[msgs.findIndex(m => m.id === msg.id) + 1]?.content?.slice(0, 50) || '(等待回复)',
      timestamp: msg.timestamp,
      tags: hasChain ? ['Agent 调度'] : [],
    }
  })
})

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天'
  }
  
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function filteredSessions() {
  if (!searchQuery.value.trim()) return sessions.value
  const query = searchQuery.value.toLowerCase()
  return sessions.value.filter(s => 
    s.title.toLowerCase().includes(query) ||
    s.lastMessage.toLowerCase().includes(query)
  )
}

function handleDeleteMessage(id: string) {
  const idx = sessionStore.messages.findIndex(m => m.id === id)
  if (idx !== -1) {
    sessionStore.messages.splice(idx, 1)
    // Also remove the next assistant message
    if (idx < sessionStore.messages.length && sessionStore.messages[idx].role === 'assistant') {
      sessionStore.messages.splice(idx, 1)
    }
    // Remove agent chain
    delete sessionStore.agentChainHistory[id]
  }
}

function viewAgentChain(msgId: string) {
  sessionStore.loadAgentChainForMessage(msgId)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between p-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-950">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-brian-blue/10 rounded-lg">
          <History :size="20" class="text-brian-blue" />
        </div>
        <div>
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">历史会话</h2>
          <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">共 {{ filteredSessions().length }} 个会话</p>
        </div>
      </div>
    </div>
    
    <div class="p-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
      <div class="relative">
        <input 
          v-model="searchQuery"
          type="text"
          placeholder="搜索历史会话..."
          class="w-full pl-10 pr-4 py-2 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brian-blue/20"
        />
        <Clock :size="16" class="absolute left-3 top-1/2 transform -translate-y-1/2 text-apple-gray-400" />
      </div>
    </div>
    
    <div class="flex-1 overflow-y-auto p-4">
      <div class="space-y-2">
        <div 
          v-for="session in filteredSessions()" 
          :key="session.id"
          class="glass-panel rounded-lg p-4 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors cursor-pointer group"
        >
          <div class="flex items-start gap-3">
            <div class="p-2 bg-brian-blue/10 rounded-lg flex-shrink-0">
              <MessageCircle :size="16" class="text-brian-blue" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1">
                <h3 class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ session.title }}</h3>
                <span class="text-xs text-apple-gray-400 flex-shrink-0">{{ formatTime(session.timestamp) }}</span>
              </div>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 line-clamp-2">{{ session.lastMessage }}</p>
              <div class="flex items-center gap-2 mt-2">
                <span class="text-xs text-apple-gray-400">{{ session.messages }} 条消息</span>
                <span 
                  v-for="tag in session.tags" 
                  :key="tag"
                  class="text-xs px-2 py-0.5 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-full text-apple-gray-600 dark:text-apple-gray-400"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            <button 
              v-if="session.tags.includes('Agent 调度')"
              class="p-2 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 rounded-lg text-apple-gray-400 hover:text-brian-blue transition-colors"
              title="查看 Agent 调度链"
              @click.stop="viewAgentChain(session.id)"
            >
              <GitBranch :size="14" />
            </button>
            <button 
              class="p-2 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 rounded-lg text-apple-gray-400 hover:text-error-red transition-colors opacity-0 group-hover:opacity-100"
              @click.stop="handleDeleteMessage(session.id)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>
      
      <div v-if="filteredSessions().length === 0" class="text-center py-12">
        <History :size="48" class="mx-auto text-apple-gray-300 dark:text-apple-gray-600 mb-3" />
        <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400">没有找到匹配的会话</p>
      </div>
    </div>
  </div>
</template>
