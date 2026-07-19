<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  Cpu, HardDrive, Database, Timer, Activity, Sparkles, Zap,
  PhoneCall, Network, GitBranch, Boxes, MessageSquare, Server,
  ChevronDown
} from '@lucide/vue'
import { analyticsApi, systemApi } from '../../api'

// ── Types ──
interface SystemStats {
  uptime: number
  cpu: number
  memory: { total: number; used: number; percentage: number; heapUsed: number; heapTotal: number; rss: number }
  disk: { total: number; used: number; percentage: number }
  nodeVersion: string
  platform: string
}

interface StorageEngines {
  relationalDb: { type: string; path: string; status: string }
  vectorDb: { type: string; path: string; status: string }
  graphDb: { type: string; path: string; status: string }
}

interface RingEntry {
  today: { used: number; limit: number }
  week: { used: number; limit: number }
  month: { used: number; limit: number }
}

interface ContributionEntry {
  date: string
  count: number
}

interface PerModelEntry {
  modelId: string
  modelName: string
  calls: number
  tokens: number
  avgTTFT: number
}

interface DayCell { date: string; count: number; dayOfWeek: number; inMonth: boolean }
interface WeekCol { days: DayCell[] }
interface MonthBlock { year: number; month: number; label: string; weeks: WeekCol[] }

// ── State ──
const activeTab = ref<'realtime' | 'tokens' | 'models'>('realtime')
const systemStats = ref<SystemStats>({
  uptime: 0, cpu: 0,
  memory: { total: 0, used: 0, percentage: 0, heapUsed: 0, heapTotal: 0, rss: 0 },
  disk: { total: 0, used: 0, percentage: 0 },
  nodeVersion: '', platform: '',
})
const tokenStats = ref({ totalTokens: 0, totalCalls: 0, avgLatency: 0 })
const memoryNodeCount = ref(0)
const sessionCount = ref(0)
const storageEngines = ref<StorageEngines>({
  relationalDb: { type: 'SQLite', path: '', status: 'active' },
  vectorDb: { type: 'Local File System', path: '', status: 'active' },
  graphDb: { type: 'TinyGraphDB', path: '', status: 'active' },
})
const vectorDbStatus = ref<{ status: string; type: string; latency: number }>({ status: 'connected', type: 'SQLite', latency: 0 })
const ringData = ref<RingEntry>({
  today: { used: 0, limit: 100000 },
  week: { used: 0, limit: 500000 },
  month: { used: 0, limit: 2000000 },
})
const contributionEntries = ref<ContributionEntry[]>([])
const modelContributionEntries = ref<ContributionEntry[]>([])
const perModelList = ref<PerModelEntry[]>([])
const selectedModelId = ref<string>('')

// Uptime live counter
const uptimeBase = ref(0)
const uptimeFetchedAt = ref(0)
const liveUptime = ref(0)
let uptimeInterval: ReturnType<typeof setInterval> | null = null

// Timers
let cpuMemTimer: ReturnType<typeof setInterval> | null = null
let diskTimer: ReturnType<typeof setInterval> | null = null
let summaryTimer: ReturnType<typeof setInterval> | null = null
let vectorDbTimer: ReturnType<typeof setInterval> | null = null
let lastDiskFetch = Date.now()

// ── Helpers ──
function formatBytes(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

// ── Fetch functions ──
async function fetchSystemStats() {
  try {
    const d = await systemApi.system()
    const sys = d.system as SystemStats | undefined
    if (sys) {
      systemStats.value = { ...systemStats.value, cpu: sys.cpu, memory: sys.memory, nodeVersion: sys.nodeVersion, platform: sys.platform }
      if (!uptimeBase.value) {
        uptimeBase.value = sys.uptime
        uptimeFetchedAt.value = Date.now()
        liveUptime.value = sys.uptime
      }
    }
    const storage = d.storage as StorageEngines | undefined
    if (storage) storageEngines.value = storage
  } catch { /* ignore */ }
}

async function fetchDiskStats() {
  try {
    const d = await systemApi.system()
    const sys = d.system as SystemStats | undefined
    if (sys?.disk) {
      systemStats.value = { ...systemStats.value, disk: sys.disk }
    }
  } catch { /* ignore */ }
}

async function fetchTokenStats() {
  try {
    const d = await analyticsApi.tokenUsage()
    tokenStats.value = {
      totalTokens: (d.totalTokens as number) ?? 0,
      totalCalls: (d.totalCalls as number) ?? 0,
      avgLatency: (d.avgLatency as number) ?? 0,
    }
  } catch { /* ignore */ }
}

async function fetchSummary() {
  try {
    const d = await analyticsApi.summary()
    memoryNodeCount.value = (d.memoryNodeCount as number) ?? 0
    sessionCount.value = (d.sessionCount as number) ?? 0
  } catch { /* ignore */ }
}

async function fetchVectorDb() {
  try {
    const d = await analyticsApi.vectorDb()
    vectorDbStatus.value = {
      status: (d.status as string) ?? 'connected',
      type: (d.type as string) ?? 'SQLite',
      latency: (d.latency as number) ?? 0,
    }
  } catch { /* ignore */ }
}

async function fetchRingData() {
  try {
    const d = await analyticsApi.ring() as Record<string, { used: number; limit: number }>
    if (d.today) ringData.value.today = d.today
    if (d.week) ringData.value.week = d.week
    if (d.month) ringData.value.month = d.month
  } catch { /* ignore */ }
}

async function fetchContribution() {
  try {
    const rows = await analyticsApi.contribution(new Date().getFullYear()) as unknown as ContributionEntry[]
    contributionEntries.value = rows ?? []
  } catch { /* ignore */ }
}

async function fetchModelContribution(modelId: string) {
  if (!modelId) { modelContributionEntries.value = []; return }
  try {
    const rows = await analyticsApi.contribution(new Date().getFullYear(), modelId) as unknown as ContributionEntry[]
    modelContributionEntries.value = rows ?? []
  } catch { /* ignore */ }
}

async function fetchPerModel() {
  try {
    const d = await analyticsApi.perModel() as { models: PerModelEntry[] }
    perModelList.value = d.models ?? []
    if (perModelList.value.length && !selectedModelId.value) {
      selectedModelId.value = perModelList.value[0].modelId
    }
  } catch { /* ignore */ }
}

// ── Ring chart helpers ──
const ringTodayPct = computed(() => {
  if (!ringData.value.today.limit) return 0
  return Math.min(100, ringData.value.today.used / ringData.value.today.limit * 100)
})
const ringWeekPct = computed(() => {
  if (!ringData.value.week.limit) return 0
  return Math.min(100, ringData.value.week.used / ringData.value.week.limit * 100)
})
const ringMonthPct = computed(() => {
  if (!ringData.value.month.limit) return 0
  return Math.min(100, ringData.value.month.used / ringData.value.month.limit * 100)
})

function ringArc(radius: number, pct: number): string {
  if (pct <= 0) return ''
  if (pct >= 100) pct = 99.99
  const circumference = 2 * Math.PI * radius
  const filled = (pct / 100) * circumference
  return `${circumference} ${circumference - filled}`
}

// ── Contribution matrix helpers ──
const CELL = 14
const GAP = 3
const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const now = new Date()
const currentYear = now.getFullYear()
const currentMonth = now.getMonth()

function buildDataMap(entries: ContributionEntry[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) {
    if (e.count >= 0) m.set(e.date, e.count)
  }
  return m
}

function buildMonthBlocks(dataMap: Map<string, number>, year: number): MonthBlock[] {
  const blocks: MonthBlock[] = []
  const lastMonth = year === currentYear ? currentMonth : 11
  for (let month = 0; month <= lastMonth; month++) {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const weeks: WeekCol[] = []
    let day = 1
    let d = firstDay

    while (day <= daysInMonth) {
      const row: DayCell[] = []
      for (let w = 0; w < 7; w++) {
        if (d === w && day <= daysInMonth) {
          const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          row.push({ date, count: dataMap.get(date) ?? 0, dayOfWeek: w, inMonth: true })
          day++
          d++
        } else {
          row.push({ date: '', count: -1, dayOfWeek: w, inMonth: false })
        }
      }
      d = 0
      weeks.push({ days: row })
    }
    blocks.push({ year, month, label: MONTH_NAMES[month], weeks })
  }
  return blocks
}

const globalMonths = computed(() => buildMonthBlocks(buildDataMap(contributionEntries.value), currentYear))
const modelMonths = computed(() => buildMonthBlocks(buildDataMap(modelContributionEntries.value), currentYear))

function maxCount(entries: ContributionEntry[]): number {
  return Math.max(...entries.map(e => e.count), 1)
}

const globalMaxCount = computed(() => maxCount(contributionEntries.value))
const modelMaxCount = computed(() => maxCount(modelContributionEntries.value))

function cellColor(count: number, max: number): string {
  if (count < 0) return 'transparent'
  if (count === 0) return '#e5e7eb'
  const r = Math.min(count / max, 1)
  if (r <= 0.2) return '#bbf7d0'
  if (r <= 0.4) return '#86efac'
  if (r <= 0.6) return '#4ade80'
  if (r <= 0.8) return '#22c55e'
  return '#16a34a'
}

// ── Per-model helpers ──
const selectedModel = computed(() => perModelList.value.find(m => m.modelId === selectedModelId.value))

watch(selectedModelId, (newId) => {
  if (newId) fetchModelContribution(newId)
})

// ── Lifecycle ──
onMounted(async () => {
  // Fetch once on mount
  await Promise.all([
    fetchSystemStats(),
    fetchTokenStats(),
    fetchSummary(),
    fetchVectorDb(),
    fetchRingData(),
    fetchContribution(),
    fetchPerModel(),
  ])

  // Start timers
  cpuMemTimer = setInterval(() => { fetchSystemStats(); fetchTokenStats() }, 10_000)
  diskTimer = setInterval(() => {
    const now = Date.now()
    if (now - lastDiskFetch >= 600_000) {
      lastDiskFetch = now
      fetchDiskStats()
    }
  }, 60_000) // check every minute, but only fetch if 10min elapsed
  summaryTimer = setInterval(fetchSummary, 10_000)
  vectorDbTimer = setInterval(fetchVectorDb, 10_000)

  // Live uptime counter
  uptimeInterval = setInterval(() => {
    if (uptimeFetchedAt.value) {
      liveUptime.value = uptimeBase.value + Math.floor((Date.now() - uptimeFetchedAt.value) / 1000)
    }
  }, 1000)
})

onUnmounted(() => {
  if (cpuMemTimer) clearInterval(cpuMemTimer)
  if (diskTimer) clearInterval(diskTimer)
  if (summaryTimer) clearInterval(summaryTimer)
  if (vectorDbTimer) clearInterval(vectorDbTimer)
  if (uptimeInterval) clearInterval(uptimeInterval)
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-white dark:bg-apple-gray-950 border-b border-apple-gray-200 dark:border-apple-gray-700 px-5 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">系统监控</h2>
          <p class="text-xs text-apple-gray-400 mt-0.5">实时性能与用量统计</p>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-success-green animate-pulse-soft" />
          <span class="text-xs text-apple-gray-400">实时监控中</span>
        </div>
      </div>
    </div>

    <!-- Sub-tabs -->
    <div class="sticky top-[80px] z-50 bg-white dark:bg-apple-gray-950 px-4 py-2 border-b border-apple-gray-200 dark:border-apple-gray-700">
      <div class="flex items-center gap-1 p-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg">
        <button
          :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors', activeTab === 'realtime' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
          @click="activeTab = 'realtime'"
        >
          <Activity :size="12" class="inline mr-1" />实时统计
        </button>
        <button
          :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors', activeTab === 'tokens' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
          @click="activeTab = 'tokens'"
        >
          <Sparkles :size="12" class="inline mr-1" />Token统计
        </button>
        <button
          :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors', activeTab === 'models' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
          @click="activeTab = 'models'"
        >
          <Cpu :size="12" class="inline mr-1" />按模型
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-5">

      <!-- ===== Tab 1: Real-time ===== -->
      <template v-if="activeTab === 'realtime'">
        <!-- System Resources -->
        <section>
          <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">系统资源</h3>
          <div class="grid grid-cols-4 gap-3">
            <!-- CPU -->
            <div class="glass-panel rounded-xl p-4">
              <div class="flex items-center gap-2 mb-3">
                <div class="p-1.5 bg-brian-blue/10 rounded-md"><Cpu :size="16" class="text-brian-blue" /></div>
                <span class="text-xs text-apple-gray-400">CPU</span>
              </div>
              <div class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 mb-2">
                {{ systemStats.cpu.toFixed(1) }}<span class="text-sm font-normal text-apple-gray-400">%</span>
              </div>
              <div class="h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="systemStats.cpu > 80 ? 'bg-error-red' : 'bg-brian-blue'"
                  :style="{ width: Math.min(100, systemStats.cpu) + '%' }"
                />
              </div>
            </div>
            <!-- Memory -->
            <div class="glass-panel rounded-xl p-4">
              <div class="flex items-center gap-2 mb-3">
                <div class="p-1.5 bg-success-green/10 rounded-md"><HardDrive :size="16" class="text-success-green" /></div>
                <span class="text-xs text-apple-gray-400">内存</span>
              </div>
              <div class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 mb-2">
                {{ systemStats.memory.percentage }}<span class="text-sm font-normal text-apple-gray-400">%</span>
              </div>
              <div class="h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                <div class="h-full bg-success-green rounded-full transition-all duration-500" :style="{ width: systemStats.memory.percentage + '%' }" />
              </div>
              <p class="text-[10px] text-apple-gray-400 mt-1.5">{{ formatBytes(systemStats.memory.used) }} / {{ formatBytes(systemStats.memory.total) }}</p>
            </div>
            <!-- Disk -->
            <div class="glass-panel rounded-xl p-4">
              <div class="flex items-center gap-2 mb-3">
                <div class="p-1.5 bg-warning-orange/10 rounded-md"><Database :size="16" class="text-warning-orange" /></div>
                <span class="text-xs text-apple-gray-400">磁盘</span>
              </div>
              <div class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 mb-2">
                {{ systemStats.disk.percentage.toFixed(1) }}<span class="text-sm font-normal text-apple-gray-400">%</span>
              </div>
              <div class="h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                <div class="h-full bg-warning-orange rounded-full transition-all duration-500" :style="{ width: Math.min(100, systemStats.disk.percentage) + '%' }" />
              </div>
              <p class="text-[10px] text-apple-gray-400 mt-1.5">{{ formatBytes(systemStats.disk.used) }} / {{ formatBytes(systemStats.disk.total) }}</p>
            </div>
            <!-- Uptime -->
            <div class="glass-panel rounded-xl p-4">
              <div class="flex items-center gap-2 mb-3">
                <div class="p-1.5 bg-brian-blue/10 rounded-md"><Timer :size="16" class="text-brian-blue" /></div>
                <span class="text-xs text-apple-gray-400">运行时间</span>
              </div>
              <div class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 mb-2">{{ formatUptime(liveUptime) }}</div>
              <p class="text-[10px] text-apple-gray-400">{{ systemStats.nodeVersion }} · {{ systemStats.platform }}</p>
            </div>
          </div>
        </section>

        <!-- Cumulative Totals -->
        <section>
          <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">累计总计</h3>
          <div class="glass-panel rounded-xl p-4">
            <div class="grid grid-cols-3 gap-4">
              <div class="flex items-center gap-3">
                <Sparkles :size="18" class="text-brian-blue" />
                <div>
                  <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ formatTokens(tokenStats.totalTokens) }}</div>
                  <div class="text-[10px] text-apple-gray-400">累计 Token</div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <PhoneCall :size="18" class="text-warning-orange" />
                <div>
                  <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ tokenStats.totalCalls.toLocaleString() }}</div>
                  <div class="text-[10px] text-apple-gray-400">累计调用</div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <Activity :size="18" class="text-success-green" />
                <div>
                  <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ tokenStats.avgLatency }}ms</div>
                  <div class="text-[10px] text-apple-gray-400">平均时延</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Storage Stats -->
        <section>
          <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">存储统计</h3>
          <div class="grid grid-cols-2 gap-3">
            <div class="glass-panel rounded-xl p-3 text-center">
              <div class="relative mx-auto mb-1 w-fit">
                <Network :size="18" class="text-brian-blue" />
                <div class="w-2.5 h-2.5 rounded-full border-2 border-white dark:border-apple-gray-800 absolute -top-0.5 -right-0.5 bg-success-green" />
              </div>
              <div class="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300">记忆节点</div>
              <div class="text-[10px] text-apple-gray-400">知识图谱</div>
              <div class="text-lg font-bold text-brian-blue mt-1">{{ memoryNodeCount }}</div>
            </div>
            <div class="glass-panel rounded-xl p-3 text-center">
              <div class="relative mx-auto mb-1 w-fit">
                <MessageSquare :size="18" class="text-brian-blue" />
                <div class="w-2.5 h-2.5 rounded-full border-2 border-white dark:border-apple-gray-800 absolute -top-0.5 -right-0.5 bg-success-green" />
              </div>
              <div class="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300">会话记录</div>
              <div class="text-[10px] text-apple-gray-400">历史会话</div>
              <div class="text-lg font-bold text-brian-blue mt-1">{{ sessionCount }}</div>
            </div>
          </div>
        </section>

        <!-- Storage Engines -->
        <section>
          <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">存储引擎</h3>
          <div class="grid grid-cols-3 gap-3">
            <!-- SQLite -->
            <div class="glass-panel rounded-xl p-3">
              <div class="flex items-center gap-2 mb-2">
                <div class="p-1.5 bg-brian-blue/10 rounded-md"><Database :size="14" class="text-brian-blue" /></div>
                <span class="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300">关系数据库</span>
              </div>
              <div class="text-sm font-bold text-apple-gray-900 dark:text-apple-gray-50 mb-1">{{ storageEngines.relationalDb.type }}</div>
              <div class="text-[10px] text-apple-gray-400 truncate">{{ storageEngines.relationalDb.path.split('/').pop() || storageEngines.relationalDb.path }}</div>
              <div :class="['text-[10px] mt-1.5', storageEngines.relationalDb.status === 'active' ? 'text-success-green' : 'text-error-red']">
                {{ storageEngines.relationalDb.status === 'active' ? '运行中' : '未连接' }}
              </div>
            </div>
            <!-- VectorDB -->
            <div class="glass-panel rounded-xl p-3">
              <div class="flex items-center gap-2 mb-2">
                <div class="p-1.5 bg-warning-orange/10 rounded-md"><Boxes :size="14" class="text-warning-orange" /></div>
                <span class="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300">向量数据库</span>
              </div>
              <div class="text-sm font-bold text-apple-gray-900 dark:text-apple-gray-50 mb-1">{{ vectorDbStatus.type }}</div>
              <div class="text-[10px] text-apple-gray-400">{{ vectorDbStatus.latency }}ms</div>
              <div :class="['text-[10px] mt-1.5', vectorDbStatus.status === 'connected' ? 'text-success-green' : 'text-error-red']">
                {{ vectorDbStatus.status === 'connected' ? '运行中' : '未连接' }}
              </div>
            </div>
            <!-- GraphDB -->
            <div class="glass-panel rounded-xl p-3">
              <div class="flex items-center gap-2 mb-2">
                <div class="p-1.5 bg-success-green/10 rounded-md"><GitBranch :size="14" class="text-success-green" /></div>
                <span class="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300">图数据库</span>
              </div>
              <div class="text-sm font-bold text-apple-gray-900 dark:text-apple-gray-50 mb-1">{{ storageEngines.graphDb.type }}</div>
              <div class="text-[10px] text-apple-gray-400 truncate">{{ storageEngines.graphDb.path.split('/').pop() || storageEngines.graphDb.path }}</div>
              <div :class="['text-[10px] mt-1.5', storageEngines.graphDb.status === 'active' ? 'text-success-green' : 'text-error-red']">
                {{ storageEngines.graphDb.status === 'active' ? '运行中' : '未连接' }}
              </div>
            </div>
          </div>
        </section>
      </template>

      <!-- ===== Tab 2: Tokens ===== -->
      <template v-if="activeTab === 'tokens'">
        <!-- Multi-layer Ring Chart -->
        <section>
          <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">周期用量</h3>
          <div class="glass-panel rounded-xl p-4 flex flex-col items-center">
            <div class="relative w-72 h-72">
              <svg viewBox="0 0 280 280" class="w-full h-full -rotate-90">
                <!-- Outer ring: This Month (yellow) -->
                <circle cx="140" cy="140" r="120" fill="none" stroke="currentColor" class="text-apple-gray-200 dark:text-apple-gray-700" stroke-width="20" />
                <circle
                  v-if="ringMonthPct > 0"
                  cx="140" cy="140" r="120" fill="none" stroke="#f59e0b" stroke-width="20" stroke-linecap="round"
                  :stroke-dasharray="ringArc(120, ringMonthPct)"
                />
                <!-- Middle ring: This Week (green) -->
                <circle cx="140" cy="140" r="95" fill="none" stroke="currentColor" class="text-apple-gray-200 dark:text-apple-gray-700" stroke-width="20" />
                <circle
                  v-if="ringWeekPct > 0"
                  cx="140" cy="140" r="95" fill="none" stroke="#10b981" stroke-width="20" stroke-linecap="round"
                  :stroke-dasharray="ringArc(95, ringWeekPct)"
                />
                <!-- Inner ring: Today (red) -->
                <circle cx="140" cy="140" r="70" fill="none" stroke="currentColor" class="text-apple-gray-200 dark:text-apple-gray-700" stroke-width="20" />
                <circle
                  v-if="ringTodayPct > 0"
                  cx="140" cy="140" r="70" fill="none" stroke="#ef4444" stroke-width="20" stroke-linecap="round"
                  :stroke-dasharray="ringArc(70, ringTodayPct)"
                />
              </svg>
              <!-- Center text -->
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">
                  {{ formatTokens(ringData.today.used) }} / {{ formatTokens(ringData.week.used) }} / {{ formatTokens(ringData.month.used) }}
                </span>
                <span class="text-[10px] text-apple-gray-400 mt-1">日 / 周 / 月</span>
              </div>
            </div>
            <!-- Legend -->
            <div class="flex items-center gap-4 mt-2">
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded-full" style="background:#ef4444" />
                <span class="text-[10px] text-apple-gray-400">今日</span>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded-full" style="background:#10b981" />
                <span class="text-[10px] text-apple-gray-400">本周</span>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded-full" style="background:#f59e0b" />
                <span class="text-[10px] text-apple-gray-400">本月</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Contribution Matrix -->
        <section>
          <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">{{ currentYear }} 年 Token 用量热力图</h3>
          <div class="glass-panel rounded-xl p-4 overflow-x-auto">
            <div class="flex gap-[12px] min-w-fit">
              <div v-for="block in globalMonths" :key="'m-' + block.month" class="flex-shrink-0">
                <div class="text-[11px] font-medium text-apple-gray-500 dark:text-apple-gray-350 mb-1 pl-0.5">{{ block.year }}年{{ block.label }}</div>
                <!-- Day labels -->
                <div class="flex mb-0.5" :style="{ gap: GAP + 'px' }">
                  <span
                    v-for="d in DAY_LABELS" :key="d"
                    class="text-[9px] text-apple-gray-400 text-center flex-shrink-0"
                    :style="{ width: CELL + 'px' }"
                  >{{ d }}</span>
                </div>
                <!-- Week rows -->
                <div v-for="(week, wi) in block.weeks" :key="'w-' + wi" class="flex mb-0.5 last:mb-0" :style="{ gap: GAP + 'px' }">
                  <div
                    v-for="(day, di) in week.days" :key="'d-' + di"
                    class="rounded-[3px] relative group flex-shrink-0"
                    :style="{ width: CELL + 'px', height: CELL + 'px', backgroundColor: cellColor(day.count, globalMaxCount) }"
                    :title="day.inMonth && day.date ? `${day.date} · ${formatTokens(day.count)} tokens` : ''"
                  />
                </div>
              </div>
            </div>
            <!-- Legend -->
            <div class="flex items-center justify-center gap-1 mt-3 pt-2 border-t border-apple-gray-100 dark:border-apple-gray-800">
              <span class="text-[10px] text-apple-gray-400 mr-1">少</span>
              <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#e5e7eb" />
              <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#bbf7d0" />
              <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#86efac" />
              <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#4ade80" />
              <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#22c55e" />
              <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#16a34a" />
              <span class="text-[10px] text-apple-gray-400 ml-1">多</span>
            </div>
          </div>
        </section>
      </template>

      <!-- ===== Tab 3: By Model ===== -->
      <template v-if="activeTab === 'models'">
        <section>
          <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">按模型统计</h3>

          <!-- Model Selector -->
          <div class="glass-panel rounded-xl p-4 mb-4">
            <div class="relative">
              <select
                v-model="selectedModelId"
                class="w-full appearance-none bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg px-4 py-2.5 text-sm text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue/50"
              >
                <option v-for="m in perModelList" :key="m.modelId" :value="m.modelId">{{ m.modelName }}</option>
              </select>
              <ChevronDown :size="16" class="absolute right-3 top-1/2 -translate-y-1/2 text-apple-gray-400 pointer-events-none" />
            </div>
          </div>

          <!-- Per-model stat cards -->
          <div v-if="selectedModel" class="grid grid-cols-3 gap-3 mb-4">
            <div class="glass-panel rounded-xl p-3 text-center">
              <PhoneCall :size="16" class="text-brian-blue mx-auto mb-1" />
              <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ selectedModel.calls.toLocaleString() }}</div>
              <div class="text-[10px] text-apple-gray-400">调用次数</div>
            </div>
            <div class="glass-panel rounded-xl p-3 text-center">
              <Sparkles :size="16" class="text-warning-orange mx-auto mb-1" />
              <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ formatTokens(selectedModel.tokens) }}</div>
              <div class="text-[10px] text-apple-gray-400">Token 用量</div>
            </div>
            <div class="glass-panel rounded-xl p-3 text-center">
              <Zap :size="16" class="text-success-green mx-auto mb-1" />
              <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ selectedModel.avgTTFT }}ms</div>
              <div class="text-[10px] text-apple-gray-400">TTFT</div>
            </div>
          </div>

          <!-- Per-model Contribution Matrix -->
          <div v-if="selectedModelId">
            <h4 class="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-2">{{ currentYear }} 年 Token 用量热力图</h4>
            <div class="glass-panel rounded-xl p-4 overflow-x-auto">
              <div class="flex gap-[12px] min-w-fit">
                <div v-for="block in modelMonths" :key="'mm-' + block.month" class="flex-shrink-0">
                  <div class="text-[11px] font-medium text-apple-gray-500 dark:text-apple-gray-350 mb-1 pl-0.5">{{ block.year }}年{{ block.label }}</div>
                  <div class="flex mb-0.5" :style="{ gap: GAP + 'px' }">
                    <span
                      v-for="d in DAY_LABELS" :key="d"
                      class="text-[9px] text-apple-gray-400 text-center flex-shrink-0"
                      :style="{ width: CELL + 'px' }"
                    >{{ d }}</span>
                  </div>
                  <div v-for="(week, wi) in block.weeks" :key="'mw-' + wi" class="flex mb-0.5 last:mb-0" :style="{ gap: GAP + 'px' }">
                    <div
                      v-for="(day, di) in week.days" :key="'md-' + di"
                      class="rounded-[3px] relative group flex-shrink-0"
                      :style="{ width: CELL + 'px', height: CELL + 'px', backgroundColor: cellColor(day.count, modelMaxCount) }"
                      :title="day.inMonth && day.date ? `${day.date} · ${formatTokens(day.count)} tokens` : ''"
                    />
                  </div>
                </div>
              </div>
              <div class="flex items-center justify-center gap-1 mt-3 pt-2 border-t border-apple-gray-100 dark:border-apple-gray-800">
                <span class="text-[10px] text-apple-gray-400 mr-1">少</span>
                <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#e5e7eb" />
                <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#bbf7d0" />
                <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#86efac" />
                <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#4ade80" />
                <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#22c55e" />
                <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#16a34a" />
                <span class="text-[10px] text-apple-gray-400 ml-1">多</span>
              </div>
            </div>
          </div>
          <div v-else-if="perModelList.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">
            <Server :size="24" class="mx-auto mb-2 text-apple-gray-300" />
            暂无模型统计数据
          </div>
        </section>
      </template>

    </div>
  </div>
</template>