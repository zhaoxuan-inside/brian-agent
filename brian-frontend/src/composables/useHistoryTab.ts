/**
 * @fileoverview 信息页「会话历史」页签的业务逻辑组合式函数。
 *
 * 从 InfoView.vue 分离的数据获取 / 过滤 / 时间线分组 / 热力图 / 勾选与删除逻辑；
 * 模板经解构引用，函数名与原先保持一致。
 *
 * 修改：
 * - 左侧日期导航从 dateCountCache 派生（与热力图一致），不再依赖已加载的会话列表
 * - 会话列表支持分页 + 无限滚动
 */

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { chatApi } from '../api'
import type { ChatSession } from '../api/types'
import {
  compareDateKeys, dateKeyToRange, hasDataInMonth, latestDateKey, toLocalInputValue,
} from '../utils/heatmap'

const HISTORY_PAGE_SIZE = 20

/**
 * 会话历史页签状态与操作。
 */
export function useHistoryTab() {
  const router = useRouter()

const historySearch = ref('')
const historyStartTime = ref('')
const historyEndTime = ref('')
const chatList = ref<ChatSession[]>([])
const loadingHistory = ref(false)
const loadingMoreHistory = ref(false)
const hasMoreHistory = ref(false)
const historyPage = ref(1)
const selectedSessions = ref<Set<string>>(new Set())


const viewingTagsSession = ref<ChatSession | null>(null)

function openViewTags(session: ChatSession) {
  viewingTagsSession.value = session
}

async function loadHistory(reset = true) {
  ensureDateCounts()
  if (reset) {
    loadingHistory.value = true
    historyPage.value = 1
  } else {
    loadingMoreHistory.value = true
  }
  try {
    const data = await chatApi.list(
      'default-user',
      historySearch.value.trim() || undefined,
      historyStartTime.value ? new Date(historyStartTime.value).getTime() : undefined,
      historyEndTime.value ? new Date(historyEndTime.value).getTime() : undefined,
      reset ? 1 : historyPage.value,
      HISTORY_PAGE_SIZE,
    )
    if (reset) {
      chatList.value = data.sessions
    } else {
      chatList.value = [...chatList.value, ...data.sessions]
    }
    hasMoreHistory.value = data.sessions.length >= HISTORY_PAGE_SIZE
  }
  catch { /* ignore */ }
  finally {
    if (reset) loadingHistory.value = false
    else loadingMoreHistory.value = false
  }
}

async function loadMoreHistory() {
  if (!hasMoreHistory.value || loadingMoreHistory.value || loadingHistory.value) return
  historyPage.value += 1
  await loadHistory(false)
}

// 搜索条件变化防抖后刷新
let historySearchTimer: ReturnType<typeof setTimeout> | null = null
watch([historySearch, historyStartTime, historyEndTime], () => {
  if (historySearchTimer) clearTimeout(historySearchTimer)
  historySearchTimer = setTimeout(() => { loadHistory() }, 300)
})

const filteredHistory = computed(() => {
  return [...chatList.value].sort((a, b) => b.lastTime - a.lastTime)
})

const historyTimeline = computed(() => {
  const groups: { dateKey: string; label: string; items: ChatSession[] }[] = []
  for (const session of filteredHistory.value) {
    const d = new Date(session.lastTime)
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
    group.items.push(session)
  }
  return groups
})

// 左侧日期导航：从 dateCountCache 派生（与热力图数据源一致），而非从已加载会话列表派生
const historyDateNavTimeline = computed(() => {
  return Object.entries(dateCountCache.value)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => compareDateKeys(b, a))
    .map(([dateKey, count]) => {
      const [y, m, d] = dateKey.split('-').map(Number)
      const date = new Date(y, m, d)
      const today = new Date()
      const yesterday = new Date(today.getTime() - 86400000)
      let label: string
      if (date.toDateString() === today.toDateString()) label = '今天'
      else if (date.toDateString() === yesterday.toDateString()) label = '昨天'
      else label = `${m + 1}月${d}日`
      return { dateKey, label, count }
    })
})

const activeHistoryDate = ref<string | null>(null)

function scrollToHistoryDate(dateKey: string) {
  activeHistoryDate.value = dateKey
  document.getElementById(`history-nav-${dateKey}`)?.scrollIntoView({ block: 'nearest' })
  document.getElementById(`history-group-${dateKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 历史页热力图：每日会话数来自 /chat/date-counts（全量会话、按客户端本地日分桶），
// 与列表加载的分页/搜索过滤解耦；历史缓存 1 分钟轮询刷新当天计数
const historyHeatmapYear = ref(new Date().getFullYear())
const historyHeatmapMonth = ref(new Date().getMonth() + 1)
const dateCountCache = ref<Record<string, number>>({})
const historyHasDateData = computed(() => Object.values(dateCountCache.value).some(c => c > 0))
const heatmapAutoJumped = ref(false)

let dateCountsInitialized = false
let dateCountRefreshTimer: ReturnType<typeof setInterval> | null = null

async function loadHistoryDateCounts() {
  try {
    const data = await chatApi.dateCounts()
    dateCountCache.value = data.dates
    if (!heatmapAutoJumped.value && Object.keys(data.dates).length > 0) {
      heatmapAutoJumped.value = true
      if (!hasDataInMonth(data.dates, historyHeatmapYear.value, historyHeatmapMonth.value)) {
        const latest = latestDateKey(data.dates)
        if (latest) {
          const [y, m] = latest.split('-').map(Number)
          historyHeatmapYear.value = y
          historyHeatmapMonth.value = m + 1
        }
      }
    }
  } catch { /* ignore */ }
}

function ensureDateCounts() {
  if (dateCountsInitialized) return
  dateCountsInitialized = true
  loadHistoryDateCounts()
  dateCountRefreshTimer = setInterval(loadHistoryDateCounts, 60_000)
}

onBeforeUnmount(() => {
  if (dateCountRefreshTimer) {
    clearInterval(dateCountRefreshTimer)
    dateCountRefreshTimer = null
  }
  if (historyObserver) {
    historyObserver.disconnect()
    historyObserver = null
  }
})

const historyHeatmapCells = computed(() => {
  const daysInMonth = new Date(historyHeatmapYear.value, historyHeatmapMonth.value, 0).getDate()
  const firstDay = new Date(historyHeatmapYear.value, historyHeatmapMonth.value - 1, 1).getDay()
  const leading = (firstDay + 6) % 7
  const cells: { day: number | null; count: number }[] = []
  for (let i = 0; i < leading; i++) cells.push({ day: null, count: 0 })
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${historyHeatmapYear.value}-${historyHeatmapMonth.value - 1}-${d}`
    cells.push({ day: d, count: dateCountCache.value[key] || 0 })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, count: 0 })
  return cells
})

function isCurrentHistoryHeatmapMonth(): boolean {
  const now = new Date()
  return historyHeatmapYear.value === now.getFullYear() && historyHeatmapMonth.value === now.getMonth() + 1
}

function prevHistoryHeatmapMonth() {
  if (historyHeatmapMonth.value === 1) { historyHeatmapMonth.value = 12; historyHeatmapYear.value -= 1 }
  else historyHeatmapMonth.value -= 1
}

function nextHistoryHeatmapMonth() {
  if (isCurrentHistoryHeatmapMonth()) return
  if (historyHeatmapMonth.value === 12) { historyHeatmapMonth.value = 1; historyHeatmapYear.value += 1 }
  else historyHeatmapMonth.value += 1
}

function historyHeatmapDateKey(day: number): string {
  return `${historyHeatmapYear.value}-${historyHeatmapMonth.value - 1}-${day}`
}

const historyHeatmapActiveDay = computed(() => {
  if (!activeHistoryDate.value) return null
  const [y, m, d] = activeHistoryDate.value.split('-').map(Number)
  return y === historyHeatmapYear.value && m === historyHeatmapMonth.value - 1 ? d : null
})

// 热力图点击的按日筛选状态
const historyDateFilter = ref<string | null>(null)

function clickHistoryHeatmapDay(day: number | null) {
  if (!day) return
  clickHistoryDateNav(historyHeatmapDateKey(day))
}

function clickHistoryDateNav(dateKey: string) {
  if (historySearchTimer) clearTimeout(historySearchTimer)
  if (historyDateFilter.value === dateKey) {
    historyDateFilter.value = null
    historyStartTime.value = ''
    historyEndTime.value = ''
    activeHistoryDate.value = null
  } else {
    historyDateFilter.value = dateKey
    const { start, end } = dateKeyToRange(dateKey)
    historyStartTime.value = toLocalInputValue(start)
    historyEndTime.value = toLocalInputValue(end)
    activeHistoryDate.value = dateKey
  }
  const [y, m] = dateKey.split('-').map(Number)
  historyHeatmapYear.value = y
  historyHeatmapMonth.value = m + 1
  loadHistory()
  nextTick(() => {
    document.getElementById(`history-group-${dateKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

// 无限滚动 sentinel
const historySentinel = ref<HTMLElement | null>(null)
let historyObserver: IntersectionObserver | null = null

watch(historySentinel, (el) => {
  historyObserver?.disconnect()
  historyObserver = null
  if (el) {
    historyObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMoreHistory()
    }, { rootMargin: '300px' })
    historyObserver.observe(el)
  }
})

const allHistorySelected = computed(() =>
  filteredHistory.value.length > 0 && filteredHistory.value.every(c => selectedSessions.value.has(c.sessionId))
)

function toggleHistorySelectAll() {
  if (allHistorySelected.value) selectedSessions.value = new Set()
  else selectedSessions.value = new Set(filteredHistory.value.map(c => c.sessionId))
}

function toggleHistorySelect(id: string) {
  const next = new Set(selectedSessions.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedSessions.value = next
}

const deleteConfirm = ref<{ type: 'single' | 'batch'; sessionId?: string } | null>(null)

function requestDeleteSession(sessionId: string) {
  deleteConfirm.value = { type: 'single', sessionId }
}

function requestBatchDelete() {
  deleteConfirm.value = { type: 'batch' }
}

async function handleDeleteSession(sessionId: string) {
  await chatApi.deleteSession(sessionId)
  chatList.value = chatList.value.filter(c => c.sessionId !== sessionId)
}

// ===== 修改前（2026-09-21）：逐条 Promise.allSettled 调用单条接口，关联数据清理分散在多次请求中 =====
// async function handleBatchDelete() {
//   const ids = [...selectedSessions.value]
//   const results = await Promise.allSettled(ids.map(id => chatApi.deleteSession(id)))
//   const okIds = ids.filter((_, i) => results[i].status === 'fulfilled')
//   chatList.value = chatList.value.filter(c => !okIds.includes(c.sessionId))
//   selectedSessions.value = new Set()
// }

// ===== 修改后：一次调用批量删除接口提交 session_ids[]，后端统一级联清理关联数据 =====
async function handleBatchDelete() {
  const ids = [...selectedSessions.value].filter(Boolean)
  if (ids.length === 0) {
    selectedSessions.value = new Set()
    return
  }
  await chatApi.deleteSessions(ids)
  const idSet = new Set(ids)
  chatList.value = chatList.value.filter(c => !idSet.has(c.sessionId))
  selectedSessions.value = new Set()
}

async function confirmDelete() {
  if (!deleteConfirm.value) return
  const { type, sessionId } = deleteConfirm.value
  deleteConfirm.value = null
  if (type === 'single' && sessionId) {
    await handleDeleteSession(sessionId)
  } else if (type === 'batch') {
    await handleBatchDelete()
  }
}

function openSession(sessionId: string) { router.push(`/?session=${sessionId}`) }

  return {
    historySearch, historyStartTime, historyEndTime,
    chatList, loadingHistory, loadingMoreHistory, hasMoreHistory, selectedSessions,
    viewingTagsSession, openViewTags, loadHistory, loadMoreHistory,
    filteredHistory, historyTimeline, historyDateNavTimeline, activeHistoryDate, scrollToHistoryDate,
    historyHeatmapYear, historyHeatmapMonth, historyHeatmapCells,
    historyHasDateData, historyHeatmapActiveDay, historyHeatmapDateKey,
    isCurrentHistoryHeatmapMonth, prevHistoryHeatmapMonth, nextHistoryHeatmapMonth,
    clickHistoryHeatmapDay, clickHistoryDateNav,
    historySentinel, historyDateFilter,
    allHistorySelected, toggleHistorySelectAll, toggleHistorySelect,
    deleteConfirm, requestDeleteSession, requestBatchDelete, confirmDelete,
    openSession,
  }
}