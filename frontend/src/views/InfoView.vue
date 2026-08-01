<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search, Trash2, FileText, Network, GitBranch, Plus, Clock,
  CheckSquare, Square, ChevronRight, ArrowLeft, Folder, X,
  Brain, Database,
} from '@lucide/vue'
import { chatApi, memoryApi, libraryApi, type MemoryItem } from '../api'
import Header from '../components/Header.vue'
import NeuralBackground from '../components/NeuralBackground.vue'

const router = useRouter()

// ============================================================
// TAB 管理
// ============================================================
const activeTab = ref<'history' | 'memory' | 'library' | 'tagGraph' | 'keywordGraph'>('history')
const tabs = [
  { key: 'history', label: '历史', icon: Clock },
  { key: 'memory', label: '记忆', icon: Brain },
  { key: 'library', label: '资料库', icon: Database },
  { key: 'tagGraph', label: 'Tag图', icon: Network },
  { key: 'keywordGraph', label: '关键词图', icon: GitBranch },
] as const

// ============================================================
// 历史 TAB
// ============================================================
interface ChatListItem { sessionId: string; lastMessage: string; lastTime: number }
const historySearch = ref('')
const chatList = ref<ChatListItem[]>([])
const loadingHistory = ref(false)
const selectedSessions = ref<Set<string>>(new Set())

async function loadHistory() {
  loadingHistory.value = true
  try {
    const data = await chatApi.list('default-user')
    chatList.value = data as unknown as ChatListItem[]
  } catch (e) { console.error(e) } finally { loadingHistory.value = false }
}

const filteredHistory = computed(() => {
  const sorted = [...chatList.value].sort((a, b) => b.lastTime - a.lastTime)
  if (!historySearch.value) return sorted
  return sorted.filter(c => (c.lastMessage || '新会话').toLowerCase().includes(historySearch.value.toLowerCase()))
})

const allHistorySelected = computed(() => {
  return filteredHistory.value.length > 0 && filteredHistory.value.every(c => selectedSessions.value.has(c.sessionId))
})

function toggleHistorySelectAll() {
  if (allHistorySelected.value) {
    selectedSessions.value = new Set()
  } else {
    selectedSessions.value = new Set(filteredHistory.value.map(c => c.sessionId))
  }
}

function toggleHistorySelect(sessionId: string) {
  const next = new Set(selectedSessions.value)
  if (next.has(sessionId)) next.delete(sessionId)
  else next.add(sessionId)
  selectedSessions.value = next
}

async function handleDeleteSession(sessionId: string) {
  try {
    await chatApi.deleteSession(sessionId)
    chatList.value = chatList.value.filter(c => c.sessionId !== sessionId)
    const next = new Set(selectedSessions.value)
    next.delete(sessionId)
    selectedSessions.value = next
  } catch (e) { console.error(e) }
}

async function handleBatchDeleteHistory() {
  const ids = Array.from(selectedSessions.value)
  for (const id of ids) {
    await handleDeleteSession(id)
  }
  selectedSessions.value = new Set()
}

function formatSessionTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

function openSession(sessionId: string) {
  router.push(`/?session=${sessionId}`)
}

// ============================================================
// 记忆 TAB - 时间轴 + work_id 节点
// ============================================================
const memories = ref<MemoryItem[]>([])
const memoryTags = ref<string[]>([])
const loadingMemory = ref(false)
const memorySearch = ref('')
const expandedMemory = ref<string | null>(null)

async function loadMemory() {
  loadingMemory.value = true
  try {
    const data = await memoryApi.list()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    memories.value = ((data as any).memories || []) as MemoryItem[]
    const tagsData = await memoryApi.tags()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    memoryTags.value = (tagsData as any).tags as string[]
  } catch (e) { console.error(e) } finally { loadingMemory.value = false }
}

// Filter memories by search
const filteredMemories = computed(() => {
  let result = [...memories.value].sort((a, b) => b.createdAt - a.createdAt)
  if (memorySearch.value) {
    const q = memorySearch.value.toLowerCase()
    result = result.filter(m =>
      (m.content || '').toLowerCase().includes(q) ||
      (m.tags || []).some(t => t.toLowerCase().includes(q))
    )
  }
  return result
})

// Group memories by date for timeline
const memoryTimeline = computed(() => {
  const groups: { dateKey: string; label: string; items: MemoryItem[] }[] = []
  for (const mem of filteredMemories.value) {
    const d = new Date(mem.createdAt)
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    let group = groups.find(g => g.dateKey === dateKey)
    if (!group) {
      const today = new Date()
      const yesterday = new Date(today.getTime() - 86400000)
      let label: string
      if (d.toDateString() === today.toDateString()) label = '今天'
      else if (d.toDateString() === yesterday.toDateString()) label = '昨天'
      else label = `${d.getMonth() + 1}月${d.getDate()}日`
      group = { dateKey, label, items: [] }
      groups.push(group)
    }
    group.items.push(mem)
  }
  return groups
})

const typeColors: Record<string, string> = {
  semantic: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  episodic: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  procedural: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  working: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
}

function formatMemoryTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ============================================================
// 资料库 TAB
// ============================================================
interface LibraryItem {
  id: string
  name: string
  path: string
  category: string
  description: string
  createdAt: number
  updatedAt: number
}
const libraries = ref<LibraryItem[]>([])
const loadingLibs = ref(false)
const showAddLibrary = ref(false)
const newLibrary = ref({ name: '', description: '', path: '' })
const pathCheckResult = ref<{ exists: boolean; isReadable: boolean; isWritable: boolean } | null>(null)
const checkingPath = ref(false)
const libraryDetail = ref<LibraryItem | null>(null)

async function loadLibraries() {
  loadingLibs.value = true
  try {
    const data = await libraryApi.paths()
    libraries.value = (data.paths || []) as unknown as LibraryItem[]
  } catch (e) { console.error(e) } finally { loadingLibs.value = false }
}

async function checkLibraryPath() {
  if (!newLibrary.value.path) return
  checkingPath.value = true
  try {
    const result = await libraryApi.checkPath(newLibrary.value.path)
    pathCheckResult.value = { exists: result.exists, isReadable: result.isReadable, isWritable: result.isWritable }
  } catch (e) {
    pathCheckResult.value = { exists: false, isReadable: false, isWritable: false }
  } finally { checkingPath.value = false }
}

async function handleAddLibrary() {
  if (!newLibrary.value.name || !newLibrary.value.path) return
  try {
    await libraryApi.addPath({
      name: newLibrary.value.name,
      path: newLibrary.value.path,
      category: 'general',
      description: newLibrary.value.description,
    })
    showAddLibrary.value = false
    newLibrary.value = { name: '', description: '', path: '' }
    pathCheckResult.value = null
    await loadLibraries()
  } catch (e) { console.error(e) }
}

async function handleDeleteLibrary(id: string) {
  try {
    await libraryApi.deletePath(id)
    libraries.value = libraries.value.filter(l => l.id !== id)
  } catch (e) { console.error(e) }
}

// ============================================================
// Tag 图 / 关键词图 TAB
// ============================================================
interface GraphNode { id: string; name: string; weight: number; degree: number }
interface GraphEdge { source: string; target: string; weight: number }
interface LayoutEdge extends GraphEdge {
  x1: number; y1: number; x2: number; y2: number;
  strokeWidth: number; highlighted?: boolean;
}
const graphNodes = ref<GraphNode[]>([])
const graphEdges = ref<GraphEdge[]>([])
const loadingGraph = ref(false)
const selectedTag = ref<string | null>(null)
const selectedTagMemories = ref<MemoryItem[]>([])
const hoveredEdge = ref<LayoutEdge | null>(null)
const hoveredKeyword = ref<GraphNode | null>(null)
const selectedKeyword = ref<string | null>(null)
const selectedKeywordMemories = ref<MemoryItem[]>([])

async function loadTagGraph() {
  loadingGraph.value = true
  try {
    const data = await memoryApi.tagGraph()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    graphNodes.value = (data as any).nodes as GraphNode[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    graphEdges.value = (data as any).edges as GraphEdge[]
  } catch (e) { console.error(e) } finally { loadingGraph.value = false }
}

async function selectTag(tagId: string) {
  selectedTag.value = selectedTag.value === tagId ? null : tagId
  if (selectedTag.value) {
    try {
      const tagName = graphNodes.value.find(n => n.id === tagId)?.name || tagId
      selectedTagMemories.value = await memoryApi.byTag('default-user', tagName)
    } catch { selectedTagMemories.value = [] }
  } else {
    selectedTagMemories.value = []
  }
}

async function selectKeyword(nodeId: string) {
  selectedKeyword.value = selectedKeyword.value === nodeId ? null : nodeId
  if (selectedKeyword.value) {
    try {
      const keyword = graphNodes.value.find(n => n.id === nodeId)?.name || nodeId
      selectedKeywordMemories.value = await memoryApi.search('default-user', keyword, undefined, 20)
    } catch { selectedKeywordMemories.value = [] }
  } else {
    selectedKeywordMemories.value = []
  }
}

// Tag graph layout - circular with sizing by weight (max 3x min)
const graphLayout = computed(() => {
  const n = graphNodes.value.length
  if (n === 0) return { nodes: [], edges: [] }
  const cx = 250, cy = 250, radius = 180
  const weights = graphNodes.value.map(nd => nd.weight)
  const maxW = Math.max(...weights, 1)
  const minW = Math.min(...weights, 1)
  const minR = 14
  const maxR = minR * 3 // max 3x min

  return {
    nodes: graphNodes.value.map((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      const ratio = maxW > minW ? (node.weight - minW) / (maxW - minW) : 0.5
      const r = minR + ratio * (maxR - minR)
      return {
        ...node,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        r,
        color: selectedTag.value === node.id ? '#0071e3' : node.degree > 3 ? '#5856d6' : '#8e8e93',
      }
    }),
    edges: graphEdges.value.map(e => {
      const fromIdx = graphNodes.value.findIndex(nd => nd.id === e.source)
      const toIdx = graphNodes.value.findIndex(nd => nd.id === e.target)
      if (fromIdx === -1 || toIdx === -1) return null
      const angleFrom = (fromIdx / n) * Math.PI * 2 - Math.PI / 2
      const angleTo = (toIdx / n) * Math.PI * 2 - Math.PI / 2
      const isHighlighted = selectedTag.value && (e.source === selectedTag.value || e.target === selectedTag.value)
      return {
        ...e,
        x1: cx + radius * Math.cos(angleFrom),
        y1: cy + radius * Math.sin(angleFrom),
        x2: cx + radius * Math.cos(angleTo),
        y2: cy + radius * Math.sin(angleTo),
        strokeWidth: 1 + e.weight,
        highlighted: isHighlighted,
      }
    }).filter(e => e !== null) as LayoutEdge[],
  }
})

// Keyword graph - top nodes by weight, force-directed-ish layout
const keywordLayout = computed(() => {
  const topNodes = [...graphNodes.value].sort((a, b) => b.weight - a.weight).slice(0, 12)
  const topIds = new Set(topNodes.map(n => n.id))
  const topEdges = graphEdges.value.filter(e => topIds.has(e.source) && topIds.has(e.target))
  const n = topNodes.length
  if (n === 0) return { nodes: [], edges: [] }
  const cx = 250, cy = 250, radius = 160
  const maxW = Math.max(...topNodes.map(nd => nd.weight), 1)
  const minR = 16
  const maxR = minR * 3

  return {
    nodes: topNodes.map((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      const ratio = maxW > 0 ? node.weight / maxW : 0.5
      const r = minR + ratio * (maxR - minR)
      const colors = ['#0071e3', '#5856d6', '#ff9500', '#34c759', '#ff3b30', '#af52de', '#5ac8fa', '#ffcc00']
      return {
        ...node,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        r,
        color: colors[i % colors.length],
      }
    }),
    edges: topEdges.map(e => {
      const fromIdx = topNodes.findIndex(nd => nd.id === e.source)
      const toIdx = topNodes.findIndex(nd => nd.id === e.target)
      if (fromIdx === -1 || toIdx === -1) return null
      const angleFrom = (fromIdx / n) * Math.PI * 2 - Math.PI / 2
      const angleTo = (toIdx / n) * Math.PI * 2 - Math.PI / 2
      return {
        ...e,
        x1: cx + radius * Math.cos(angleFrom),
        y1: cy + radius * Math.sin(angleFrom),
        x2: cx + radius * Math.cos(angleTo),
        y2: cy + radius * Math.sin(angleTo),
        strokeWidth: 2 + e.weight,
      }
    }).filter(e => e !== null) as LayoutEdge[],
  }
})

// ============================================================
// 初始化
// ============================================================
onMounted(() => {
  loadHistory()
  loadMemory()
  loadLibraries()
  loadTagGraph()
})
</script>

<template>
  <div class="min-h-screen relative">
    <NeuralBackground />
    <Header />
    <div class="pt-14 px-6 pb-6 min-h-screen">
    <!-- TAB 导航栏 -->
    <div class="flex items-center gap-1 mb-6 border-b border-apple-gray-200 dark:border-apple-gray-700 pb-2">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="[
          'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
          activeTab === tab.key
            ? 'bg-brian-blue text-white'
            : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
        ]"
        @click="activeTab = tab.key"
      >
        <component :is="tab.icon" :size="16" />
        {{ tab.label }}
      </button>
    </div>

    <!-- ==================== 历史 TAB ==================== -->
    <div v-if="activeTab === 'history'" class="space-y-3">
      <!-- 搜索栏 + 批量操作 -->
      <div class="flex items-center gap-3">
        <div class="relative flex-1 max-w-md">
          <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
          <input
            v-model="historySearch"
            placeholder="搜索会话..."
            class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue"
          />
        </div>
        <button
          v-if="filteredHistory.length > 0"
          class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-apple-gray-500 hover:text-brian-blue transition-colors"
          @click="toggleHistorySelectAll"
        >
          <component :is="allHistorySelected ? CheckSquare : Square" :size="14" />
          {{ allHistorySelected ? '取消全选' : '全选' }}
        </button>
        <button
          v-if="selectedSessions.size > 0"
          class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-error-red hover:bg-error-red/10 rounded-lg transition-colors"
          @click="handleBatchDeleteHistory"
        >
          <Trash2 :size="12" />
          批量删除({{ selectedSessions.size }})
        </button>
      </div>

      <!-- 会话列表 -->
      <div v-if="loadingHistory" class="text-center py-8 text-apple-gray-400">加载中...</div>
      <div v-else-if="filteredHistory.length === 0" class="text-center py-8 text-apple-gray-400">暂无历史会话</div>
      <div v-else class="grid gap-3 max-w-3xl">
        <div
          v-for="item in filteredHistory"
          :key="item.sessionId"
          class="flex items-start justify-between p-4 bg-white dark:bg-apple-gray-800 rounded-xl shadow-sm border transition-colors cursor-pointer"
          :class="selectedSessions.has(item.sessionId) ? 'border-brian-blue/40 bg-brian-blue/5' : 'border-apple-gray-200 dark:border-apple-gray-700 hover:border-brian-blue/30'"
          @click="openSession(item.sessionId)"
        >
          <div class="flex items-start gap-3 flex-1 min-w-0">
            <!-- 复选框 -->
            <button
              class="mt-1 text-apple-gray-300 hover:text-brian-blue transition-colors flex-shrink-0"
              @click.stop="toggleHistorySelect(item.sessionId)"
            >
              <component :is="selectedSessions.has(item.sessionId) ? CheckSquare : Square" :size="16" />
            </button>
            <div class="flex-1 min-w-0">
              <!-- 左上角: 时间 -->
              <span class="text-xs text-apple-gray-400">{{ formatSessionTime(item.lastTime) }}</span>
              <!-- 会话标题 -->
              <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 truncate mt-1">
                {{ item.lastMessage || '新会话' }}
              </p>
              <!-- 摘要 -->
              <p class="text-xs text-apple-gray-400 mt-1 truncate">
                {{ (item.lastMessage || '').slice(0, 50) }}{{ (item.lastMessage || '').length > 50 ? '...' : '' }}
              </p>
            </div>
          </div>
          <!-- 右端: 删除按钮 -->
          <button
            class="ml-3 p-1.5 rounded-lg text-apple-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
            title="删除会话"
            @click.stop="handleDeleteSession(item.sessionId)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== 记忆 TAB ==================== -->
    <div v-if="activeTab === 'memory'" class="space-y-4">
      <!-- 搜索栏 -->
      <div class="relative max-w-md">
        <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
        <input
          v-model="memorySearch"
          placeholder="搜索记忆内容或标签..."
          class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue"
        />
      </div>

      <div v-if="loadingMemory" class="text-center py-8 text-apple-gray-400">加载中...</div>
      <div v-else-if="memoryTimeline.length === 0" class="text-center py-8 text-apple-gray-400">暂无记忆</div>
      <div v-else class="flex gap-6">
        <!-- 左侧时间轴 -->
        <div class="w-32 flex-shrink-0">
          <div class="sticky top-4">
            <div
              v-for="group in memoryTimeline"
              :key="group.dateKey"
              class="flex items-center gap-2 mb-3"
            >
              <div class="w-2 h-2 rounded-full bg-brian-blue flex-shrink-0" />
              <span class="text-xs text-apple-gray-500 font-medium">{{ group.label }}</span>
            </div>
          </div>
        </div>

        <!-- 右侧内容区 -->
        <div class="flex-1 space-y-3 min-w-0">
          <template v-for="group in memoryTimeline" :key="group.dateKey">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">{{ group.label }}</span>
              <span class="text-xs text-apple-gray-400">({{ group.items.length }})</span>
            </div>
            <div
              v-for="mem in group.items"
              :key="mem.id"
              class="bg-white dark:bg-apple-gray-800 rounded-xl shadow-sm border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden"
            >
              <!-- 卡片头部 -->
              <div
                class="p-4 cursor-pointer"
                @click="expandedMemory = expandedMemory === mem.id ? null : mem.id"
              >
                <div class="flex items-start justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-apple-gray-400">{{ formatMemoryTime(mem.createdAt) }}</span>
                    <span class="text-xs text-apple-gray-300">#{{ mem.id.slice(-8) }}</span>
                  </div>
                  <span :class="['px-2 py-0.5 rounded text-xs font-medium', typeColors[mem.type] || 'bg-gray-100 text-gray-600']">
                    {{ mem.type }}
                  </span>
                </div>
                <p class="text-sm text-apple-gray-900 dark:text-apple-gray-50" :class="expandedMemory === mem.id ? '' : 'line-clamp-2'">
                  {{ mem.content }}
                </p>
                <!-- 底部信息 -->
                <div class="flex items-center gap-3 mt-2">
                  <div v-if="mem.tags?.length" class="flex flex-wrap gap-1">
                    <span
                      v-for="tag in mem.tags"
                      :key="tag"
                      class="px-1.5 py-0.5 rounded text-xs bg-brian-blue/10 text-brian-blue"
                    >#{{ tag }}</span>
                  </div>
                  <span class="text-xs text-apple-gray-400 ml-auto">置信度: {{ Math.round((mem.confidence || 0) * 100) }}%</span>
                  <ChevronRight :size="14" class="text-apple-gray-400 transition-transform" :class="expandedMemory === mem.id ? 'rotate-90' : ''" />
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ==================== 资料库 TAB ==================== -->
    <div v-if="activeTab === 'library'" class="space-y-4">
      <!-- 资料库列表视图 -->
      <div v-if="!libraryDetail">
        <div class="flex items-center gap-2 mb-4">
          <h3 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">资料库</h3>
        </div>

        <div v-if="loadingLibs" class="text-center py-8 text-apple-gray-400">加载中...</div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <!-- 添加资料库卡片 -->
          <button
            class="flex flex-col items-center justify-center p-6 border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-600 rounded-xl text-apple-gray-400 hover:border-brian-blue hover:text-brian-blue transition-colors min-h-[140px]"
            @click="showAddLibrary = true"
          >
            <Plus :size="32" class="mb-2" />
            <span class="text-sm font-medium">添加资料库</span>
          </button>

          <!-- 资料库卡片 -->
          <div
            v-for="lib in libraries"
            :key="lib.id"
            class="relative p-4 bg-white dark:bg-apple-gray-800 rounded-xl shadow-sm border border-apple-gray-200 dark:border-apple-gray-700 hover:border-brian-blue/30 cursor-pointer transition-colors"
            @click="libraryDetail = lib"
          >
            <div class="flex items-start gap-3 mb-2">
              <div class="p-2 bg-brian-blue/10 rounded-lg flex-shrink-0">
                <Folder :size="20" class="text-brian-blue" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ lib.name }}</h4>
                <p class="text-xs text-apple-gray-400 truncate mt-0.5">{{ lib.path }}</p>
              </div>
            </div>
            <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 line-clamp-2 min-h-[32px]">{{ lib.description || '暂无描述' }}</p>
            <div class="flex items-center justify-between mt-3 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
              <span class="text-xs text-apple-gray-400">{{ lib.category }}</span>
            </div>
            <!-- 删除按钮 -->
            <button
              class="absolute top-3 right-3 p-1.5 rounded-lg text-apple-gray-300 hover:text-error-red hover:bg-error-red/10 transition-colors"
              title="删除资料库"
              @click.stop="handleDeleteLibrary(lib.id)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>

      <!-- 资料库详情视图 -->
      <div v-else>
        <!-- 面包屑 -->
        <div class="flex items-center gap-2 mb-4">
          <button
            class="flex items-center gap-1 text-sm text-apple-gray-500 hover:text-brian-blue transition-colors"
            @click="libraryDetail = null"
          >
            <ArrowLeft :size="16" />
            资料库
          </button>
          <ChevronRight :size="14" class="text-apple-gray-400" />
          <span class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ libraryDetail.name }}</span>
        </div>

        <div class="p-6 bg-white dark:bg-apple-gray-800 rounded-xl shadow-sm border border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-center gap-3 mb-4">
            <div class="p-3 bg-brian-blue/10 rounded-lg">
              <Folder :size="24" class="text-brian-blue" />
            </div>
            <div>
              <h4 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ libraryDetail.name }}</h4>
              <p class="text-sm text-apple-gray-400">{{ libraryDetail.path }}</p>
            </div>
          </div>
          <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400 mb-4">{{ libraryDetail.description || '暂无描述' }}</p>

          <!-- 文件列表占位 -->
          <div class="text-center py-12 text-apple-gray-400">
            <FileText :size="32" class="mx-auto mb-2 text-apple-gray-300" />
            <p class="text-sm">该资料库暂无可浏览的文件</p>
            <p class="text-xs mt-1">路径: {{ libraryDetail.path }}</p>
          </div>
        </div>
      </div>

      <!-- 添加资料库弹窗 -->
      <div v-if="showAddLibrary" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showAddLibrary = false">
        <div class="bg-white dark:bg-apple-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">添加资料库</h3>
            <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="showAddLibrary = false">
              <X :size="18" />
            </button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="text-xs font-medium text-apple-gray-500 mb-1 block">资料库名称</label>
              <input v-model="newLibrary.name" placeholder="输入名称..." class="w-full px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            </div>
            <div>
              <label class="text-xs font-medium text-apple-gray-500 mb-1 block">资料库摘要</label>
              <input v-model="newLibrary.description" placeholder="输入摘要..." class="w-full px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            </div>
            <div>
              <label class="text-xs font-medium text-apple-gray-500 mb-1 block">资料库路径</label>
              <div class="flex gap-2">
                <input v-model="newLibrary.path" placeholder="/path/to/library" class="flex-1 px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue" />
                <button
                  class="px-3 py-2 text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 rounded-lg hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors whitespace-nowrap"
                  :disabled="checkingPath || !newLibrary.path"
                  @click="checkLibraryPath"
                >
                  {{ checkingPath ? '检查中...' : '检查路径' }}
                </button>
              </div>
              <!-- 路径检查结果 -->
              <div v-if="pathCheckResult" class="mt-2 flex items-center gap-3 text-xs">
                <span :class="pathCheckResult.exists ? 'text-success-green' : 'text-error-red'">
                  {{ pathCheckResult.exists ? '✓ 路径存在' : '✗ 路径不存在' }}
                </span>
                <span v-if="pathCheckResult.exists" :class="pathCheckResult.isReadable ? 'text-success-green' : 'text-error-red'">
                  {{ pathCheckResult.isReadable ? '✓ 可读' : '✗ 不可读' }}
                </span>
                <span v-if="pathCheckResult.exists" :class="pathCheckResult.isWritable ? 'text-success-green' : 'text-warning-orange'">
                  {{ pathCheckResult.isWritable ? '✓ 可写' : '⚠ 不可写' }}
                </span>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button class="px-4 py-2 text-sm font-medium text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 rounded-lg transition-colors" @click="showAddLibrary = false">取消</button>
            <button
              class="px-4 py-2 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors disabled:opacity-50"
              :disabled="!newLibrary.name || !newLibrary.path"
              @click="handleAddLibrary"
            >提交</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== Tag 图 TAB ==================== -->
    <div v-if="activeTab === 'tagGraph'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">Tag 关系图</h3>
        <div class="flex items-center gap-3 text-xs text-apple-gray-400">
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-indigo-500"></span> 高关联</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-gray-400"></span> 普通</span>
        </div>
      </div>

      <div class="flex gap-4">
        <!-- Canvas 区域 -->
        <div class="flex-1 bg-white dark:bg-apple-gray-800 rounded-xl shadow-sm border border-apple-gray-200 dark:border-apple-gray-700 p-4">
          <div v-if="loadingGraph" class="text-center py-8 text-apple-gray-400">加载中...</div>
          <svg v-else viewBox="0 0 500 500" class="w-full" style="aspect-ratio: 1; max-height: 600px;">
            <!-- 边 -->
            <line
              v-for="(edge, i) in graphLayout.edges"
              :key="'e-' + i"
              :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
              :stroke-width="edge.strokeWidth"
              :stroke="edge.highlighted ? '#0071e3' : '#d1d1d6'"
              :opacity="selectedTag && !edge.highlighted ? 0.2 : 0.6"
              class="cursor-pointer transition-all"
              @mouseenter="hoveredEdge = edge"
              @mouseleave="hoveredEdge = null"
            />
            <!-- 边权重提示 -->
            <text
              v-if="hoveredEdge"
              :x="(hoveredEdge.x1 + hoveredEdge.x2) / 2"
              :y="(hoveredEdge.y1 + hoveredEdge.y2) / 2 - 5"
              text-anchor="middle"
              class="text-xs font-medium pointer-events-none"
              fill="#0071e3"
            >权重: {{ hoveredEdge.weight }}</text>
            <!-- 节点 -->
            <g
              v-for="node in graphLayout.nodes"
              :key="node.id"
              class="cursor-pointer"
              @click="selectTag(node.id)"
            >
              <circle
                :cx="node.x" :cy="node.y" :r="node.r"
                :fill="node.color"
                :opacity="selectedTag && selectedTag !== node.id ? 0.3 : 0.85"
                class="transition-all"
              />
              <text
                :x="node.x" :y="node.y + 4"
                text-anchor="middle"
                class="text-xs font-medium pointer-events-none"
                fill="white"
              >{{ node.name }}</text>
            </g>
          </svg>
        </div>

        <!-- 侧边面板: 关联问答内容 -->
        <div v-if="selectedTag" class="w-80 flex-shrink-0 bg-white dark:bg-apple-gray-800 rounded-xl shadow-sm border border-apple-gray-200 dark:border-apple-gray-700 p-4 max-h-[600px] overflow-y-auto">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">
              Tag: {{ graphNodes.find(n => n.id === selectedTag)?.name }}
            </h4>
            <button class="p-1 text-apple-gray-400 hover:text-apple-gray-600" @click="selectedTag = null; selectedTagMemories = []">
              <X :size="14" />
            </button>
          </div>
          <div v-if="selectedTagMemories.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">暂无关联内容</div>
          <div v-else class="space-y-2">
            <div
              v-for="mem in selectedTagMemories"
              :key="mem.id"
              class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700"
            >
              <p class="text-xs text-apple-gray-900 dark:text-apple-gray-50 line-clamp-3">{{ mem.content }}</p>
              <span class="text-xs text-apple-gray-400 mt-1 block">{{ new Date(mem.createdAt).toLocaleString('zh-CN') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== 关键词图 TAB ==================== -->
    <div v-if="activeTab === 'keywordGraph'" class="space-y-4">
      <h3 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">关键词关联图</h3>

      <div class="flex gap-4">
        <!-- Canvas 区域 -->
        <div class="flex-1 bg-white dark:bg-apple-gray-800 rounded-xl shadow-sm border border-apple-gray-200 dark:border-apple-gray-700 p-4">
          <div v-if="loadingGraph" class="text-center py-8 text-apple-gray-400">加载中...</div>
          <svg v-else viewBox="0 0 500 500" class="w-full" style="aspect-ratio: 1; max-height: 600px;">
            <!-- 边 -->
            <line
              v-for="(edge, i) in keywordLayout.edges"
              :key="'ke-' + i"
              :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
              :stroke-width="edge.strokeWidth"
              stroke="#d1d1d6"
              opacity="0.3"
            />
            <!-- 节点 -->
            <g
              v-for="(node, i) in keywordLayout.nodes"
              :key="'kn-' + i"
              class="cursor-pointer"
              @click="selectKeyword(node.id)"
              @mouseenter="hoveredKeyword = node"
              @mouseleave="hoveredKeyword = null"
            >
              <circle
                :cx="node.x" :cy="node.y" :r="node.r"
                :fill="node.color"
                :opacity="selectedKeyword && selectedKeyword !== node.id ? 0.3 : (hoveredKeyword === node ? 1 : 0.85)"
                class="transition-all"
                :stroke="hoveredKeyword === node || selectedKeyword === node.id ? '#0071e3' : 'none'"
                :stroke-width="2"
              />
              <text
                :x="node.x" :y="node.y + 5"
                text-anchor="middle"
                class="text-sm font-semibold pointer-events-none"
                fill="white"
              >{{ node.name }}</text>
              <!-- 悬停激活次数 -->
              <text
                v-if="hoveredKeyword === node"
                :x="node.x" :y="node.y + node.r + 14"
                text-anchor="middle"
                class="text-xs pointer-events-none"
                fill="#0071e3"
              >激活: {{ node.weight }}</text>
            </g>
          </svg>
        </div>

        <!-- 侧边面板: 关联信息列表 -->
        <div v-if="selectedKeyword" class="w-80 flex-shrink-0 bg-white dark:bg-apple-gray-800 rounded-xl shadow-sm border border-apple-gray-200 dark:border-apple-gray-700 p-4 max-h-[600px] overflow-y-auto">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">
              关键词: {{ graphNodes.find(n => n.id === selectedKeyword)?.name }}
            </h4>
            <button class="p-1 text-apple-gray-400 hover:text-apple-gray-600" @click="selectedKeyword = null; selectedKeywordMemories = []">
              <X :size="14" />
            </button>
          </div>
          <div v-if="selectedKeywordMemories.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">暂无关联信息</div>
          <div v-else class="space-y-2">
            <div
              v-for="mem in selectedKeywordMemories"
              :key="mem.id"
              class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700"
            >
              <p class="text-xs text-apple-gray-900 dark:text-apple-gray-50 line-clamp-3">{{ mem.content }}</p>
              <span class="text-xs text-apple-gray-400 mt-1 block">{{ new Date(mem.createdAt).toLocaleString('zh-CN') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>
