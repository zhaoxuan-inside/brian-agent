<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, History, Search, Trash2, X, PanelRight, Square, CheckSquare, Edit3, Check } from '@lucide/vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import ChatArea from '@/components/chat/ChatArea.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { useSessionStore } from '@/stores/session'
import { chatApi } from '@/api'
import { formatTime } from '@/utils/format'
import { useI18nStore } from '@/stores/i18n'
import type { ChatSession } from '@/api/types'

const sessionStore = useSessionStore()
const i18nStore = useI18nStore()
const route = useRoute()
const router = useRouter()
const showSidebar = ref(false)
const showSearch = ref(false)
const searchQuery = ref('')
const selectedSessions = ref<Set<string>>(new Set())
const overflowWarning = ref(false)
const editingSessionId = ref<string | null>(null)
const editingTitle = ref('')

function startEditTitle(chat: ChatSession) {
  editingSessionId.value = chat.sessionId
  editingTitle.value = chat.sessionTitle || chat.lastMessage || '新会话'
}

async function saveSessionTitle(sessionId: string) {
  const newTitle = editingTitle.value.trim()
  if (!newTitle) return
  try {
    const res = await chatApi.updateTitle(sessionId, newTitle)
    const found = sessionStore.chatList.find(c => c.sessionId === sessionId)
    if (found) {
      found.sessionTitle = res.session_title
    }
  } catch { /* ignore */ }
  finally {
    editingSessionId.value = null
  }
}

onMounted(async () => {
  const querySid = route.query.session
  const sid = (typeof querySid === 'string' && querySid) ? querySid : sessionStore.currentSessionId
  if (!sid) return
  try {
    await sessionStore.loadChatHistory(sid, 'default-user')
  } catch { /* ignore */ }
  await sessionStore.loadDag(sid, 'default-user')
})

watch(() => sessionStore.currentSessionId, (sid) => {
  const currentQuery = typeof route.query.session === 'string' ? route.query.session : ''
  if (sid && sid !== currentQuery) {
    router.replace({ query: { session: sid } })
  } else if (!sid && currentQuery) {
    router.replace({ query: {} })
  }
})

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
    (c.sessionTitle || '').toLowerCase().includes(q) ||
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
  await sessionStore.loadDag(sessionId, 'default-user')
  showSidebar.value = false
}

function handleNewChat() {
  sessionStore.clearMessages()
  showSidebar.value = false
}

const deleteConfirm = ref<{ type: 'single' | 'batch'; sessionId?: string } | null>(null)

function requestDeleteSession(sessionId: string) {
  deleteConfirm.value = { type: 'single', sessionId }
}

function requestBatchDelete() {
  deleteConfirm.value = { type: 'batch' }
}

async function confirmDelete() {
  if (!deleteConfirm.value) return
  const { type, sessionId } = deleteConfirm.value
  deleteConfirm.value = null
  try {
    if (type === 'single' && sessionId) {
      await sessionStore.deleteSession(sessionId)
    } else if (type === 'batch') {
      await sessionStore.deleteSessions([...selectedSessions.value])
      selectedSessions.value = new Set()
    }
  } catch { /* 删除失败保留列表与选中项，便于重试 */ }
}
</script>

<template>
  <div class="h-screen w-screen overflow-hidden flex flex-col">
    <NeuralBackground />
    <Header />
    <div class="pt-14 relative z-10">
      <div class="sticky top-14 h-10 flex items-center px-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <PageBreadcrumb :path="[i18nStore.t('nav.chat')]" />
      </div>
    </div>

    <button
      v-if="!showSidebar"
      class="fixed right-0 top-20 z-30 p-2 rounded-l-lg glass-panel border border-r-0 text-apple-gray-400 hover:text-brian-blue transition-all shadow-sm hover:pr-3"
      @click="toggleSidebar"
    >
      <PanelRight :size="18" />
    </button>

    <Transition name="fade">
      <div v-if="overflowWarning" class="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-warning-orange/10 border border-warning-orange/30 text-warning-orange text-sm font-medium shadow-lg">
        {{ i18nStore.t('chat.overflow') }}
      </div>
    </Transition>

    <Transition name="sidebar">
      <div v-if="showSidebar" class="fixed right-0 top-14 bottom-0 w-72 z-20 glass-panel border-l flex flex-col">
        <div class="p-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <History :size="18" class="text-brian-blue" />
              <h3 class="text-sm font-semibold">{{ i18nStore.t('chat.history') }}</h3>
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
              <Plus :size="16" /> {{ i18nStore.t('chat.new') }}
            </button>
          </div>
          <div v-if="showSearch" class="mt-2">
            <input v-model="searchQuery" :placeholder="i18nStore.t('chat.search')" class="w-full px-3 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
          </div>
        </div>

        <div v-if="filteredChatList.length > 0" class="flex items-center justify-between px-3 py-2 border-b border-apple-gray-100 dark:border-apple-gray-800">
          <button class="flex items-center gap-1.5 text-xs text-apple-gray-500 hover:text-brian-blue" @click="toggleSelectAll">
            <component :is="allSelected ? CheckSquare : Square" :size="14" />
            {{ allSelected ? i18nStore.t('common.deselectAll') : i18nStore.t('common.selectAll') }}
          </button>
          <button v-if="selectedSessions.size > 0" class="flex items-center gap-1 text-xs text-error-red hover:bg-error-red/10 px-2 py-1 rounded" @click="requestBatchDelete">
            <Trash2 :size="12" /> {{ i18nStore.t('chat.deleteSelected', { n: selectedSessions.size }) }}
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-3 pb-3">
          <div v-if="filteredChatList.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">
            {{ searchQuery ? i18nStore.t('chat.noMatch') : i18nStore.t('chat.noSessions') }}
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
                  <button class="text-apple-gray-400 hover:text-brian-blue" :aria-label="i18nStore.t('chat.selectSession')" @click.stop="toggleSelect(chat.sessionId)">
                    <component :is="selectedSessions.has(chat.sessionId) ? CheckSquare : Square" :size="14" />
                  </button>
                </div>
                <div class="flex items-center justify-between">
                  <div v-if="editingSessionId === chat.sessionId" class="flex items-center gap-1 flex-1 min-w-0 mr-2" @click.stop>
                    <input
                      v-model="editingTitle"
                      class="px-2 py-0.5 text-xs rounded bg-white dark:bg-apple-gray-800 border border-brian-blue focus:outline-none w-full"
                      @keyup.enter="saveSessionTitle(chat.sessionId)"
                    />
                    <button class="p-1 rounded text-brian-blue hover:bg-brian-blue/10 flex-shrink-0" :title="i18nStore.t('chat.saveTitle')" @click="saveSessionTitle(chat.sessionId)">
                      <Check :size="12" />
                    </button>
                    <button class="p-1 rounded text-apple-gray-400 hover:bg-apple-gray-100 flex-shrink-0" :title="i18nStore.t('common.cancel')" @click="editingSessionId = null">
                      <X :size="12" />
                    </button>
                  </div>
                  <div v-else class="flex items-center justify-between flex-1 min-w-0 mr-2">
                    <p class="text-sm truncate flex-1">{{ chat.sessionTitle || chat.lastMessage || '新会话' }}</p>
                    <button class="p-1 rounded text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 flex-shrink-0 ml-1" :title="i18nStore.t('chat.rename')" @click.stop="startEditTitle(chat)">
                      <Edit3 :size="12" />
                    </button>
                  </div>
                  <button class="ml-1 p-1 rounded text-apple-gray-400 hover:text-error-red hover:bg-error-red/10 transition-colors flex-shrink-0" title="删除会话" :aria-label="i18nStore.t('chat.deleteSession')" @click.stop="requestDeleteSession(chat.sessionId)">
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

    <ConfirmDialog
      :open="deleteConfirm !== null"
      :title="i18nStore.t('chat.confirmDeleteTitle')"
      :message="deleteConfirm?.type === 'batch'
        ? i18nStore.t('chat.confirmDeleteBatch', { n: selectedSessions.size })
        : i18nStore.t('chat.confirmDeleteSingle')"
      :confirm-text="i18nStore.t('chat.confirmDeleteBtn')"
      intent="danger"
      @confirm="confirmDelete"
      @cancel="deleteConfirm = null"
    >
      <p class="text-xs text-apple-gray-400 mt-1">{{ i18nStore.t('chat.deleteWarning') }}</p>
    </ConfirmDialog>
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
