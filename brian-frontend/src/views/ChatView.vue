<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, History, Search, Trash2, X, PanelRight, Square, CheckSquare } from '@lucide/vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import ChatArea from '@/components/chat/ChatArea.vue'
import { useSessionStore } from '@/stores/session'

const sessionStore = useSessionStore()
const showSidebar = ref(false)
const showSearch = ref(false)
const searchQuery = ref('')
const selectedSessions = ref<Set<string>>(new Set())
const overflowWarning = ref(false)

function toggleSidebar() {
  showSidebar.value = !showSidebar.value
  if (showSidebar.value) sessionStore.loadChatList('default-user')
}

const sortedChatList = computed(() =>
  [...sessionStore.chatList].sort((a, b) => b.lastTime - a.lastTime)
)

const filteredChatList = computed(() => {
  if (!searchQuery.value) return sortedChatList.value
  const q = searchQuery.value.toLowerCase()
  return sortedChatList.value.filter(c =>
    (c.lastMessage || '').toLowerCase().includes(q)
  )
})

const allSelected = computed(() =>
  filteredChatList.value.length > 0 &&
  filteredChatList.value.every(c => selectedSessions.value.has(c.sessionId))
)

function toggleSelectAll() {
  if (allSelected.value) selectedSessions.value = new Set()
  else selectedSessions.value = new Set(filteredChatList.value.map(c => c.sessionId))
}

function toggleSelect(sessionId: string) {
  const next = new Set(selectedSessions.value)
  if (next.has(sessionId)) next.delete(sessionId)
  else next.add(sessionId)
  selectedSessions.value = next
}

async function handleSelectChat(sessionId: string) {
  try {
    await sessionStore.loadChatHistory(sessionId, 'default-user')
    if (sessionStore.messages.length >= 100) {
      overflowWarning.value = true
      setTimeout(() => { overflowWarning.value = false }, 5000)
    }
  } catch { /* ignore */ }
  await Promise.all([
    sessionStore.loadExchanges(sessionId, 'default-user'),
    sessionStore.loadDag(sessionId, 'default-user'),
  ])
  showSidebar.value = false
}

function handleNewChat() {
  sessionStore.clearMessages()
  showSidebar.value = false
}

async function handleDeleteSession(sessionId: string) {
  await sessionStore.deleteSession(sessionId)
}

async function handleBatchDelete() {
  for (const id of selectedSessions.value) await sessionStore.deleteSession(id)
  selectedSessions.value = new Set()
}

function formatTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day} ${h}:${min}`
}
</script>

<template>
  <div class="h-screen w-screen overflow-hidden flex flex-col">
    <NeuralBackground />
    <Header />

    <button
      v-if="!showSidebar"
      class="fixed right-0 top-20 z-30 p-2 rounded-l-lg glass-panel border border-r-0 text-apple-gray-400 hover:text-brian-blue transition-all shadow-sm hover:pr-3"
      @click="toggleSidebar"
    >
      <PanelRight :size="18" />
    </button>

    <Transition name="fade">
      <div v-if="overflowWarning" class="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-warning-orange/10 border border-warning-orange/30 text-warning-orange text-sm font-medium shadow-lg">
        会话已达到上限，请创建新会话
      </div>
    </Transition>

    <Transition name="sidebar">
      <div v-if="showSidebar" class="fixed right-0 top-14 bottom-0 w-72 z-20 glass-panel border-l flex flex-col">
        <div class="p-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <History :size="18" class="text-brian-blue" />
              <h3 class="text-sm font-semibold">历史会话</h3>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="showSidebar = false">
              <X :size="16" />
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button class="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 text-sm hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors" @click="showSearch = !showSearch">
              <Search :size="16" />
            </button>
            <button class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brian-blue text-white text-sm font-medium hover:bg-brian-blue/90 transition-colors" @click="handleNewChat">
              <Plus :size="16" /> 新建对话
            </button>
          </div>
          <div v-if="showSearch" class="mt-2">
            <input v-model="searchQuery" placeholder="搜索会话..." class="w-full px-3 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
          </div>
        </div>

        <div v-if="filteredChatList.length > 0" class="flex items-center justify-between px-3 py-2 border-b border-apple-gray-100 dark:border-apple-gray-800">
          <button class="flex items-center gap-1.5 text-xs text-apple-gray-500 hover:text-brian-blue" @click="toggleSelectAll">
            <component :is="allSelected ? CheckSquare : Square" :size="14" />
            {{ allSelected ? '取消全选' : '全选' }}
          </button>
          <button v-if="selectedSessions.size > 0" class="flex items-center gap-1 text-xs text-error-red hover:bg-error-red/10 px-2 py-1 rounded" @click="handleBatchDelete">
            <Trash2 :size="12" /> 删除({{ selectedSessions.size }})
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-3 pb-3">
          <div v-if="filteredChatList.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">
            {{ searchQuery ? '未找到匹配的会话' : '暂无历史会话' }}
          </div>
          <div v-else class="space-y-2 pt-2">
            <div
              v-for="chat in filteredChatList"
              :key="chat.sessionId"
              class="rounded-xl border transition-colors cursor-pointer"
              :class="chat.sessionId === sessionStore.currentSessionId ? 'bg-brian-blue/5 border-brian-blue/30' : 'bg-white dark:bg-apple-gray-800/50 border-apple-gray-200 dark:border-apple-gray-700 hover:border-brian-blue/30'"
              @click="handleSelectChat(chat.sessionId)"
            >
              <div class="p-3">
                <div class="flex items-start justify-between mb-1.5">
                  <span class="text-xs text-apple-gray-400">{{ formatTime(chat.lastTime) }}</span>
                  <button class="text-apple-gray-300 hover:text-brian-blue" @click.stop="toggleSelect(chat.sessionId)">
                    <component :is="selectedSessions.has(chat.sessionId) ? CheckSquare : Square" :size="14" />
                  </button>
                </div>
                <div class="flex items-center justify-between">
                  <p class="text-sm truncate flex-1">{{ chat.lastMessage || '新会话' }}</p>
                  <button class="ml-2 p-1 rounded text-apple-gray-300 hover:text-error-red hover:bg-error-red/10 transition-colors flex-shrink-0" @click.stop="handleDeleteSession(chat.sessionId)">
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <ChatArea />
  </div>
</template>

<style scoped>
.sidebar-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.sidebar-leave-active { transition: all 0.2s ease-in; }
.sidebar-enter-from { transform: translateX(100%); opacity: 0; }
.sidebar-leave-to { transform: translateX(100%); opacity: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
