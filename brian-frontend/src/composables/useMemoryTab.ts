import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { memoryApi } from '../api'
import type { MemoryItem } from '../api/types'
import {
  compareDateKeys, dateKeyToRange, hasDataInMonth, latestDateKey, toLocalInputValue,
} from '../utils/heatmap'

export function useMemoryTab() {
  const memorySearchTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const memories = ref<MemoryItem[]>([])
const loadingMemory = ref(false)
const loadingMoreMemory = ref(false)
const hasMoreMemory = ref(false)
const nextMemoryCursor = ref<string | null>(null)
const memorySearch = ref('')
const memoryTag = ref('')
const memoryStartTime = ref('')
const memoryEndTime = ref('')
const expandedMemory = ref<string | null>(null)
const selectedMemories = ref<Set<string>>(new Set())
const memoryDeleteConfirm = ref<null | { type: 'single' | 'batch'; id?: string }>(null)

function toggleMemorySelect(id: string) {
  const next = new Set(selectedMemories.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedMemories.value = next
}

const allMemoriesSelected = computed(() => memories.value.length > 0 && memories.value.every(m => selectedMemories.value.has(m.id)))

function toggleSelectAllMemory() {
  if (allMemoriesSelected.value) {
    selectedMemories.value = new Set()
  } else {
    selectedMemories.value = new Set(memories.value.map(m => m.id))
  }
}

async function deleteMemoryByIds(ids: string[]) {
  if (ids.length === 0) return
  await memoryApi.delete(ids)
  const removed = new Set(ids)
  memories.value = memories.value.filter(m => !removed.has(m.id))
  selectedMemories.value = new Set([...selectedMemories.value].filter(id => !removed.has(id)))
}

function requestMemoryDelete(id?: string) {
  memoryDeleteConfirm.value = id ? { type: 'single', id } : { type: 'batch' }
}

async function confirmMemoryDelete() {
  if (!memoryDeleteConfirm.value) return
  const { type, id } = memoryDeleteConfirm.value
  memoryDeleteConfirm.value = null
  if (type === 'single' && id) await deleteMemoryByIds([id])
  else await deleteMemoryByIds([...selectedMemories.value])
}

function buildMemorySearchOpts() {
  return {
    endTime: memoryEndTime.value ? new Date(memoryEndTime.value).getTime() : undefined,
    keyword: memorySearch.value.trim() || undefined,
    limit: 50,
    memoryObserver,
    startTime: memoryStartTime.value ? new Date(memoryStartTime.value).getTime() : undefined,
    tag: memoryTag.value.trim() || undefined,
    typeColors,
    typeLabels,
  }
}

async function loadMemory(reset = true) {
  if (reset) loadingMemory.value = true
  else loadingMoreMemory.value = true
  try {
    const data = await memoryApi.search('default-user', {
      ...buildMemorySearchOpts(),
      cursor: reset ? undefined : nextMemoryCursor.value || undefined,
    })
    if (reset) {
      memories.value = data.memories
    } else {
      memories.value = [...memories.value, ...data.memories]
    }
    hasMoreMemory.value = data.has_more
    nextMemoryCursor.value = data.next_cursor
  }
  catch {  }
  finally {
    if (reset) loadingMemory.value = false
    else loadingMoreMemory.value = false
  }
}

async function loadMoreMemory() {
  if (!hasMoreMemory.value || loadingMoreMemory.value || loadingMemory.value) return
  await loadMemory(false)
}

watch([memoryStartTime, memoryEndTime], () => {
  if (memorySearchTimer.value) clearTimeout(memorySearchTimer.value)
  memorySearchTimer.value = setTimeout(() => { loadMemory() }, 300)
})

function searchMemoryByEnter() {
  if (memorySearchTimer.value) clearTimeout(memorySearchTimer.value)
  loadMemory()
}

const memorySentinel = ref<HTMLElement | null>(null)
let memoryObserver: IntersectionObserver | null = null

watch(memorySentinel, (el) => {
  memoryObserver?.disconnect()
  memoryObserver = null
  if (el) {
    memoryObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMoreMemory()
    }, { rootMargin: '300px' })
    memoryObserver.observe(el)
  }
})

const filteredMemories = computed(() => {
  return [...memories.value].sort((a, b) => b.createdAt - a.createdAt)
})

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

const typeLabels: Record<string, string> = {
  semantic: '语义记忆',
  episodic: '情景记忆',
  procedural: '程序性记忆',
  working: '工作记忆',
}

const activeMemoryDate = ref<string | null>(null)

function scrollMemoryNavToActive(dateKey: string) {
  document.getElementById(`memory-nav-${dateKey}`)?.scrollIntoView({ block: 'nearest' })
}

function onMemoryScroll() {
  const groupEls = Array.from(document.querySelectorAll<HTMLElement>('[data-memory-date]'))
  if (groupEls.length === 0) return
  const topOffset = 205
  let current: string | null = null
  for (const el of groupEls) {
    const rect = el.getBoundingClientRect()
    if (rect.top <= topOffset) current = el.getAttribute('data-memory-date')
    else break
  }
  if (current && current !== activeMemoryDate.value) {
    activeMemoryDate.value = current
    scrollMemoryNavToActive(current)
  }
}

const dateNavTimeline = computed(() => {
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

const memoryDateFilter = ref<string | null>(null)

function clickDateNav(dateKey: string) {
  if (memoryDateFilter.value === dateKey) {
    memoryDateFilter.value = null
    memoryStartTime.value = ''
    memoryEndTime.value = ''
    if (memorySearchTimer.value) clearTimeout(memorySearchTimer.value)
    loadMemory()
  } else {
    memoryDateFilter.value = dateKey
    const { start, end } = dateKeyToRange(dateKey)
    memoryStartTime.value = toLocalInputValue(start)
    memoryEndTime.value = toLocalInputValue(end)
    if (memorySearchTimer.value) clearTimeout(memorySearchTimer.value)
    loadMemory()
  }
  activeMemoryDate.value = dateKey
  scrollMemoryNavToActive(dateKey)
  const [y, m] = dateKey.split('-').map(Number)
  heatmapYear.value = y
  heatmapMonth.value = m + 1
  nextTick(() => {
    document.getElementById(`memory-group-${dateKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

const dateCountCache = ref<Record<string, number>>({})
let dateCountRefreshTimer: ReturnType<typeof setInterval> | null = null
const heatmapAutoJumped = ref(false)

async function loadAllDateCounts() {
  try {
    const data = await memoryApi.dateCounts()
    dateCountCache.value = data.dates

    if (!heatmapAutoJumped.value && Object.keys(data.dates).length > 0) {
      heatmapAutoJumped.value = true
      if (!hasDataInMonth(data.dates, heatmapYear.value, heatmapMonth.value)) {
        const latest = latestDateKey(data.dates)
        if (latest) {
          const [y, m] = latest.split('-').map(Number)
          heatmapYear.value = y
          heatmapMonth.value = m + 1
        }
      }
    }
  } catch {  }
}

function startDateCountRefresh() {
  stopDateCountRefresh()
  dateCountRefreshTimer = setInterval(() => { loadAllDateCounts() }, 60_000)
}

function stopDateCountRefresh() {
  if (dateCountRefreshTimer) {
    clearInterval(dateCountRefreshTimer)
    dateCountRefreshTimer = null
  }
}

function getDateCount(dateKey: string): number {
  return dateCountCache.value[dateKey] ?? 0
}

const heatmapYear = ref(new Date().getFullYear())
const heatmapMonth = ref(new Date().getMonth() + 1)

const heatmapCells = computed(() => {
  const daysInMonth = new Date(heatmapYear.value, heatmapMonth.value, 0).getDate()
  const firstDay = new Date(heatmapYear.value, heatmapMonth.value - 1, 1).getDay()
  const leading = (firstDay + 6) % 7
  const cells: { day: number | null; count: number }[] = []
  for (let i = 0; i < leading; i++) cells.push({ day: null, count: 0 })
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${heatmapYear.value}-${heatmapMonth.value - 1}-${d}`
    cells.push({ day: d, count: dateCountCache.value[key] || 0 })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, count: 0 })
  return cells
})

function isCurrentHeatmapMonth(): boolean {
  const now = new Date()
  return heatmapYear.value === now.getFullYear() && heatmapMonth.value === now.getMonth() + 1
}

function prevHeatmapMonth() {
  if (heatmapMonth.value === 1) { heatmapMonth.value = 12; heatmapYear.value -= 1 }
  else heatmapMonth.value -= 1
}

function nextHeatmapMonth() {
  if (isCurrentHeatmapMonth()) return
  if (heatmapMonth.value === 12) { heatmapMonth.value = 1; heatmapYear.value += 1 }
  else heatmapMonth.value += 1
}

function heatmapDateKey(day: number): string {
  return `${heatmapYear.value}-${heatmapMonth.value - 1}-${day}`
}

const heatmapActiveDay = computed(() => {
  if (!activeMemoryDate.value) return null
  const [y, m, d] = activeMemoryDate.value.split('-').map(Number)
  return y === heatmapYear.value && m === heatmapMonth.value - 1 ? d : null
})

function clickHeatmapDay(day: number | null) {
  if (!day) return
  clickDateNav(heatmapDateKey(day))
}

  onBeforeUnmount(() => {
    memoryObserver?.disconnect()
    memoryObserver = null
    stopDateCountRefresh()
  })

  return {
    activeMemoryDate,
    allMemoriesSelected,
    buildMemorySearchOpts,
    clickDateNav,
    clickHeatmapDay,
    confirmMemoryDelete,
    dateCountCache,
    dateKeyToRange,
    dateNavTimeline,
    deleteMemoryByIds,
    expandedMemory,
    filteredMemories,
    getDateCount,
    hasMoreMemory,
    heatmapCells,
    heatmapActiveDay,
    heatmapDateKey,
    heatmapMonth,
    heatmapYear,
    isCurrentHeatmapMonth,
    loadAllDateCounts,
    loadMemory,
    loadMoreMemory,
    loadingMemory,
    loadingMoreMemory,
    memories,
    memoryDateFilter,
    memoryDeleteConfirm,
    memoryEndTime,
    memorySearch,
    memorySentinel,
    memoryStartTime,
    memoryTag,
    memoryTimeline,
    nextHeatmapMonth,
    nextMemoryCursor,
    onMemoryScroll,
    prevHeatmapMonth,
    requestMemoryDelete,
    scrollMemoryNavToActive,
    searchMemoryByEnter,
    selectedMemories,
    startDateCountRefresh,
    stopDateCountRefresh,
    toggleMemorySelect,
    toggleSelectAllMemory,
    typeColors,
    typeLabels,
  }
}
