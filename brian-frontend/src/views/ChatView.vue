<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, History, Search, Trash2, X, PanelRight, Square, CheckSquare, Edit3, Check } from '@lucide/vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import ChatArea from '@/components/chat/ChatArea.vue'
import { useSessionStore } from '@/stores/session'
import { chatApi } from '@/api'
import type { ChatSession } from '@/api/types'

const sessionStore = useSessionStore()
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
  // 从「信息 > 历史」卡片跳转进入时，优先使用 URL 中的 session 参数打开对应会话
  const querySid = route.query.session
  const sid = (typeof querySid === 'string' && querySid) ? querySid : sessionStore.currentSessionId
  if (!sid) return
  try {
    await sessionStore.loadChatHistory(sid, 'default-user')
  } catch { /* ignore */ }
  await sessionStore.loadDag(sid, 'default-user')
})

// ===== 保持 URL 的 session 参数与当前会话同步 =====
// 侧边栏切换会话、新建对话、删除当前会话、发送首条消息创建会话等场景都会改写 currentSessionId，
// 若不同步 URL 中的 session 参数，刷新后 onMounted 会优先读取到过期的 ?session=xxx，
// 导致「刷新后会话变成其他会话」。这里统一在 currentSessionId 变化时用 replace 同步 query，
// 不新增历史记录（避免返回键在会话间来回跳转）。
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

// ===== 修改前（2026-09-21）：删除无二次确认，批量删除逐个调用单条接口且无失败处理，
// 任一失败会中断循环，导致部分会话未删除、关联数据（记忆/画像/写作偏好）残留 =====
// async function handleDeleteSession(sessionId: string) {
//   await sessionStore.deleteSession(sessionId)
// }
//
// async function handleBatchDelete() {
//   for (const id of selectedSessions.value) await sessionStore.deleteSession(id)
//   selectedSessions.value = new Set()
// }

// ===== 修改后：单条/批量统一走二次确认；批量删除调用批量接口一次提交 session_ids[]，
// 后端统一级联清理关联数据，失败时保留选中项便于重试 =====
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
    <div class="pt-14 relative z-10">
      <div class="h-10 flex items-center px-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <PageBreadcrumb :path="['对话']" />
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
          <button v-if="selectedSessions.size > 0" class="flex items-center gap-1 text-xs text-error-red hover:bg-error-red/10 px-2 py-1 rounded" @click="requestBatchDelete">
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
                  <div v-if="editingSessionId === chat.sessionId" class="flex items-center gap-1 flex-1 min-w-0 mr-2" @click.stop>
                    <input
                      v-model="editingTitle"
                      class="px-2 py-0.5 text-xs rounded bg-white dark:bg-apple-gray-800 border border-brian-blue focus:outline-none w-full"
                      @keyup.enter="saveSessionTitle(chat.sessionId)"
                    />
                    <button class="p-1 rounded text-brian-blue hover:bg-brian-blue/10 flex-shrink-0" title="保存" @click="saveSessionTitle(chat.sessionId)">
                      <Check :size="12" />
                    </button>
                    <button class="p-1 rounded text-apple-gray-400 hover:bg-apple-gray-100 flex-shrink-0" title="取消" @click="editingSessionId = null">
                      <X :size="12" />
                    </button>
                  </div>
                  <div v-else class="flex items-center justify-between flex-1 min-w-0 mr-2">
                    <p class="text-sm truncate flex-1">{{ chat.sessionTitle || chat.lastMessage || '新会话' }}</p>
                    <button class="p-1 rounded text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 flex-shrink-0 ml-1" title="修改名称" @click.stop="startEditTitle(chat)">
                      <Edit3 :size="12" />
                    </button>
                  </div>
                  <button class="ml-1 p-1 rounded text-apple-gray-300 hover:text-error-red hover:bg-error-red/10 transition-colors flex-shrink-0" title="删除会话" @click.stop="requestDeleteSession(chat.sessionId)">
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

    <!-- 删除确认弹窗（单条 / 批量） -->
    <div v-if="deleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="deleteConfirm = null">
      <div class="block-card w-full max-w-sm mx-4 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">确认删除</h3>
          <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="deleteConfirm = null"><X :size="18" /></button>
        </div>
        <p class="text-sm text-apple-gray-600 dark:text-apple-gray-300">
          {{ deleteConfirm.type === 'batch' ? `确定删除选中的 ${selectedSessions.size} 个会话及其全部消息吗？` : '确定删除该会话及其全部消息吗？' }}
        </p>
        <p class="text-xs text-apple-gray-400 mt-1">此操作将同时清理关联的记忆、标签、向量与用户画像数据，且不可恢复。</p>
        <div class="flex justify-end gap-2 mt-6">
          <button class="btn-secondary" @click="deleteConfirm = null">取消</button>
          <button class="px-3 py-2 text-xs font-medium bg-error-red text-white rounded-lg hover:bg-error-red/90 transition-colors" @click="confirmDelete">确认删除</button>
        </div>
      </div>
    </div>
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
