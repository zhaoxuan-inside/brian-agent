<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  Cpu, HardDrive, Database, Boxes, GitBranch, Network,
  Sparkles, PhoneCall, Activity, Zap, AlertTriangle, X, ChevronDown,
  RefreshCw, Server, Layers,
} from '@lucide/vue'
import { analyticsApi, systemApi, configApi, type ModelConfigItem } from '../../api'

// ── Types ──
type HealthStatus = 'HEALTHY' | 'WARNING' | 'ERROR'

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

interface HealthComponent {
  key: string
  name: string
  icon: any
  status: HealthStatus
  latency: number
  details: { label: string; value: string }[]
}

// ── State ──
const systemStats = ref<SystemStats>({
  uptime: 0, cpu: 0,
  memory: { total: 0, used: 0, percentage: 0, heapUsed: 0, heapTotal: 0, rss: 0 },
  disk: { total: 0, used: 0, percentage: 0 },
  nodeVersion: '', platform: '',
})
const storageEngines = ref<StorageEngines>({
  relationalDb: { type: 'SQLite', path: '', status: 'active' },
  vectorDb: { type: 'Local File System', path: '', status: 'active' },
  graphDb: { type: 'TinyGraphDB', path: '', status: 'active' },
})
const vectorDbStatus = ref<{ status: string; type: string; latency: number }>({ status: 'connected', type: 'SQLite', latency: 0 })
const tokenStats = ref({ totalTokens: 0, totalCalls: 0, avgLatency: 0 })
const ringData = ref<RingEntry>({
  today: { used: 0, limit: 100000 },
  week: { used: 0, limit: 500000 },
  month: { used: 0, limit: 2000000 },
})
const contributionEntries = ref<ContributionEntry[]>([])
const perModelList = ref<PerModelEntry[]>([])
const llmModels = ref<ModelConfigItem[]>([])

// UI state
const autoRefresh = ref(true)
const lastUpdated = ref<Date | null>(null)
const alertDismissed = ref(false)
const expandedComponent = ref<string | null>(null)
const trendRange = ref<7 | 30 | 90>(30)

const coreCount = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 0

// Timers
let refreshTimer: ReturnType<typeof setInterval> | null = null

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

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function statusColor(status: HealthStatus): string {
  if (status === 'HEALTHY') return '#34C759'
  if (status === 'WARNING') return '#FF9500'
  return '#FF3B30'
}

function statusText(status: HealthStatus): string {
  if (status === 'HEALTHY') return '健康'
  if (status === 'WARNING') return '警告'
  return '错误'
}

function resColor(pct: number): string {
  if (pct > 90) return '#FF3B30'
  if (pct >= 70) return '#FF9500'
  return '#34C759'
}

function ringArc(radius: number, pct: number): string {
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, pct))
  const filled = (clamped / 100) * circumference
  return `${filled} ${circumference}`
}

function toggleExpand(key: string) {
  expandedComponent.value = expandedComponent.value === key ? null : key
}

// ── Fetch functions ──
async function fetchSystemStats() {
  try {
    const d = await systemApi.system()
    const sys = d.system as SystemStats | undefined
    if (sys) {
      systemStats.value = {
        uptime: sys.uptime ?? 0,
        cpu: sys.cpu ?? 0,
        memory: sys.memory ?? { total: 0, used: 0, percentage: 0, heapUsed: 0, heapTotal: 0, rss: 0 },
        disk: sys.disk ?? { total: 0, used: 0, percentage: 0 },
        nodeVersion: sys.nodeVersion ?? '',
        platform: sys.platform ?? '',
      }
    }
    const storage = d.storage as StorageEngines | undefined
    if (storage) storageEngines.value = storage
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

async function fetchPerModel() {
  try {
    const d = await analyticsApi.perModel() as { models: PerModelEntry[] }
    perModelList.value = d.models ?? []
  } catch { /* ignore */ }
}

async function fetchLlmModels() {
  try {
    const list = await configApi.model.list()
    llmModels.value = list ?? []
  } catch { llmModels.value = [] }
}

async function refreshAll() {
  await Promise.all([
    fetchSystemStats(),
    fetchTokenStats(),
    fetchVectorDb(),
    fetchRingData(),
    fetchContribution(),
    fetchPerModel(),
    fetchLlmModels(),
  ])
  lastUpdated.value = new Date()
}

function startTimer() {
  stopTimer()
  if (autoRefresh.value) {
    refreshTimer = setInterval(refreshAll, 30_000)
  }
}

function stopTimer() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
}

// ── Derived: LLM status ──
const llmStatus = computed<HealthStatus>(() => {
  const models = llmModels.value
  if (models.length === 0) return 'WARNING'
  const allError = models.every(m => {
    const s = (m.status || '').toLowerCase()
    return s === 'error' || s === 'failed'
  })
  if (allError) return 'ERROR'
  return 'HEALTHY'
})

// ── Derived: Component health list ──
const components = computed<HealthComponent[]>(() => {
  const rdb = storageEngines.value.relationalDb
  const gdb = storageEngines.value.graphDb
  const vdb = vectorDbStatus.value
  return [
    {
      key: 'llm',
      name: 'LLM Provider',
      icon: Sparkles,
      status: llmStatus.value,
      latency: tokenStats.value.avgLatency || 0,
      details: [
        { label: '模型数', value: String(llmModels.value.length) },
        { label: '平均时延', value: `${tokenStats.value.avgLatency}ms` },
        { label: '平台', value: systemStats.value.nodeVersion || '-' },
      ],
    },
    {
      key: 'mcp',
      name: 'MCP',
      icon: Layers,
      status: 'HEALTHY',
      latency: 0,
      details: [{ label: '状态', value: '默认健康' }],
    },
    {
      key: 'relationdb',
      name: 'RelationDB',
      icon: Database,
      status: rdb.status === 'active' ? 'HEALTHY' : 'ERROR',
      latency: 0,
      details: [
        { label: '类型', value: rdb.type },
        { label: '路径', value: rdb.path || '-' },
      ],
    },
    {
      key: 'graphdb',
      name: 'GraphDB',
      icon: GitBranch,
      status: gdb.status === 'active' ? 'HEALTHY' : 'ERROR',
      latency: 0,
      details: [
        { label: '类型', value: gdb.type },
        { label: '路径', value: gdb.path || '-' },
      ],
    },
    {
      key: 'vectordb',
      name: 'VectorDB',
      icon: Boxes,
      status: vdb.status === 'connected' ? 'HEALTHY' : 'ERROR',
      latency: vdb.latency || 0,
      details: [
        { label: '类型', value: vdb.type },
        { label: '时延', value: `${vdb.latency}ms` },
      ],
    },
    {
      key: 'mq',
      name: 'MQ',
      icon: Network,
      status: 'HEALTHY',
      latency: 0,
      details: [{ label: '状态', value: '默认健康' }],
    },
  ]
})

// ── Derived: CPU load average (proxy = cpu% × cores / 100) ──
const loadAvg = computed(() => {
  if (!coreCount) return '-'
  return ((systemStats.value.cpu / 100) * coreCount).toFixed(2)
})

// ── Derived: Alert banner ──
const alertMessages = computed(() => {
  const msgs: string[] = []
  for (const c of components.value) {
    if (c.status === 'ERROR') msgs.push(`${c.name} 异常`)
  }
  if (systemStats.value.cpu > 90) msgs.push('CPU 使用率过高')
  if (systemStats.value.memory.percentage > 90) msgs.push('内存使用率过高')
  if (systemStats.value.disk.percentage > 90) msgs.push('磁盘使用率过高')
  return msgs
})

const hasAlert = computed(() => alertMessages.value.length > 0)
const showAlert = computed(() => hasAlert.value && !alertDismissed.value)

watch(hasAlert, (v) => { if (v) alertDismissed.value = false })

// ── Derived: Token trend line chart ──
const TREND_W = 640
const TREND_H = 200
const TREND_PAD = { top: 16, right: 16, bottom: 28, left: 16 }

const trendData = computed(() => {
  const sorted = [...contributionEntries.value].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.slice(-trendRange.value)
})

const trendMax = computed(() => Math.max(...trendData.value.map(e => e.count), 1))

const trendPoints = computed(() => {
  const data = trendData.value
  if (data.length === 0) return [] as { x: number; y: number; date: string; count: number }[]
  const innerW = TREND_W - TREND_PAD.left - TREND_PAD.right
  const innerH = TREND_H - TREND_PAD.top - TREND_PAD.bottom
  const max = trendMax.value
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0
  return data.map((e, i) => ({
    x: TREND_PAD.left + i * stepX,
    y: TREND_PAD.top + innerH - (e.count / max) * innerH,
    date: e.date,
    count: e.count,
  }))
})

const trendLinePath = computed(() => {
  const pts = trendPoints.value
  if (pts.length === 0) return ''
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
})

const trendAreaPath = computed(() => {
  const pts = trendPoints.value
  if (pts.length === 0) return ''
  const baseY = TREND_H - TREND_PAD.bottom
  const head = `M ${pts[0].x.toFixed(1)} ${baseY}`
  const line = pts.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const tail = `L ${pts[pts.length - 1].x.toFixed(1)} ${baseY} Z`
  return `${head} ${line} ${tail}`
})

const trendLabels = computed(() => {
  const pts = trendPoints.value
  if (pts.length === 0) return [] as { x: number; text: string }[]
  const pick = (p: { x: number; date: string }) => ({ x: p.x, text: p.date.slice(5) })
  if (pts.length <= 4) return pts.map(pick)
  return [pick(pts[0]), pick(pts[Math.floor(pts.length / 2)]), pick(pts[pts.length - 1])]
})

// ── Derived: Per-model bar chart ──
const perModelMax = computed(() => Math.max(...perModelList.value.map(m => m.tokens), 1))

function barColor(tokens: number): string {
  const r = tokens / perModelMax.value
  if (r > 0.75) return '#FF3B30'
  if (r > 0.4) return '#FF9500'
  return '#007AFF'
}

// ── Auto-refresh watcher ──
watch(autoRefresh, (v) => { if (v) startTimer(); else stopTimer() })

// ── Lifecycle ──
onMounted(async () => {
  await refreshAll()
  startTimer()
})

onUnmounted(() => {
  stopTimer()
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="sticky top-0 z-20 bg-white dark:bg-apple-gray-950 border-b border-apple-gray-200 dark:border-apple-gray-700 px-5 py-3">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">系统监控</h2>
          <p class="text-xs text-apple-gray-400 mt-0.5">组件健康 · 资源使用 · Token 用量 · 运行 {{ formatUptime(systemStats.uptime) }}</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 text-xs text-apple-gray-400">
            <RefreshCw :size="12" :class="['transition-transform', autoRefresh ? 'animate-spin' : '']" style="animation-duration: 3s" />
            <span>{{ lastUpdated ? '更新于 ' + formatTime(lastUpdated) : '未更新' }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-apple-gray-400">自动刷新</span>
            <button
              role="switch"
              :aria-checked="autoRefresh"
              @click="autoRefresh = !autoRefresh"
              :class="['relative w-9 h-5 rounded-full transition-colors', autoRefresh ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600']"
            >
              <span :class="['absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', autoRefresh ? 'translate-x-4' : 'translate-x-0.5']" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alert banner -->
    <Transition name="slide-down">
      <div
        v-if="showAlert"
        class="mx-4 mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-error-red/10 border border-error-red/30 text-error-red"
      >
        <AlertTriangle :size="16" class="flex-shrink-0" />
        <span class="text-xs font-medium flex-1">
          系统告警：{{ alertMessages.join('、') }}
        </span>
        <button class="p-0.5 hover:bg-error-red/10 rounded transition-colors" @click="alertDismissed = true">
          <X :size="14" />
        </button>
      </div>
    </Transition>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6">

      <!-- ===== Area 1: Component Health ===== -->
      <section>
        <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3 flex items-center gap-2">
          <Server :size="14" /> 组件健康状态
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div
            v-for="c in components"
            :key="c.key"
            class="glass-panel rounded-xl p-3 cursor-pointer transition-all hover:shadow-glass"
            @click="toggleExpand(c.key)"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <div class="p-1.5 rounded-md flex-shrink-0" :style="{ background: statusColor(c.status) + '20' }">
                  <component :is="c.icon" :size="14" :style="{ color: statusColor(c.status) }" />
                </div>
                <span class="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300 truncate">{{ c.name }}</span>
              </div>
              <ChevronDown :size="14" class="text-apple-gray-400 transition-transform flex-shrink-0" :class="expandedComponent === c.key ? 'rotate-180' : ''" />
            </div>
            <div class="flex items-center gap-2 mb-1">
              <div class="w-2 h-2 rounded-full flex-shrink-0" :style="{ background: statusColor(c.status) }" />
              <span class="text-xs font-medium" :style="{ color: statusColor(c.status) }">{{ statusText(c.status) }}</span>
            </div>
            <div class="text-[10px] text-apple-gray-400">响应 {{ c.latency > 0 ? c.latency + 'ms' : '-' }}</div>
            <Transition name="slide-down">
              <div v-if="expandedComponent === c.key" class="mt-2 pt-2 border-t border-apple-gray-200 dark:border-apple-gray-700 space-y-1">
                <div v-for="d in c.details" :key="d.label" class="text-[10px] flex justify-between gap-2">
                  <span class="text-apple-gray-400 flex-shrink-0">{{ d.label }}</span>
                  <span class="text-apple-gray-600 dark:text-apple-gray-300 truncate text-right">{{ d.value }}</span>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </section>

      <!-- ===== Area 2: Resource Usage ===== -->
      <section>
        <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3 flex items-center gap-2">
          <Activity :size="14" /> 资源使用
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <!-- CPU -->
          <div class="glass-panel rounded-xl p-4 flex flex-col items-center">
            <div class="flex items-center gap-2 mb-3 self-start">
              <Cpu :size="14" class="text-brian-blue" />
              <span class="text-xs text-apple-gray-400">CPU</span>
            </div>
            <div class="relative w-28 h-28">
              <svg viewBox="0 0 120 120" class="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" class="text-apple-gray-200 dark:text-apple-gray-700" stroke-width="10" />
                <circle
                  v-if="systemStats.cpu > 0"
                  cx="60" cy="60" r="50" fill="none" :stroke="resColor(systemStats.cpu)" stroke-width="10" stroke-linecap="round"
                  :stroke-dasharray="ringArc(50, systemStats.cpu)"
                />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50">
                  {{ systemStats.cpu.toFixed(0) }}<span class="text-sm font-normal text-apple-gray-400">%</span>
                </span>
              </div>
            </div>
            <div class="mt-3 text-center space-y-0.5">
              <div class="text-[10px] text-apple-gray-400">核心 {{ coreCount || '-' }}</div>
              <div class="text-[10px] text-apple-gray-400">负载 {{ loadAvg }}</div>
            </div>
          </div>

          <!-- Memory -->
          <div class="glass-panel rounded-xl p-4 flex flex-col items-center">
            <div class="flex items-center gap-2 mb-3 self-start">
              <HardDrive :size="14" class="text-brian-blue" />
              <span class="text-xs text-apple-gray-400">内存</span>
            </div>
            <div class="relative w-28 h-28">
              <svg viewBox="0 0 120 120" class="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" class="text-apple-gray-200 dark:text-apple-gray-700" stroke-width="10" />
                <circle
                  v-if="systemStats.memory.percentage > 0"
                  cx="60" cy="60" r="50" fill="none" :stroke="resColor(systemStats.memory.percentage)" stroke-width="10" stroke-linecap="round"
                  :stroke-dasharray="ringArc(50, systemStats.memory.percentage)"
                />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50">
                  {{ systemStats.memory.percentage.toFixed(0) }}<span class="text-sm font-normal text-apple-gray-400">%</span>
                </span>
              </div>
            </div>
            <div class="mt-3 text-center space-y-0.5">
              <div class="text-[10px] text-apple-gray-400">{{ formatBytes(systemStats.memory.used) }} / {{ formatBytes(systemStats.memory.total) }}</div>
            </div>
          </div>

          <!-- Disk -->
          <div class="glass-panel rounded-xl p-4 flex flex-col items-center">
            <div class="flex items-center gap-2 mb-3 self-start">
              <Database :size="14" class="text-brian-blue" />
              <span class="text-xs text-apple-gray-400">磁盘</span>
            </div>
            <div class="relative w-28 h-28">
              <svg viewBox="0 0 120 120" class="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" class="text-apple-gray-200 dark:text-apple-gray-700" stroke-width="10" />
                <circle
                  v-if="systemStats.disk.percentage > 0"
                  cx="60" cy="60" r="50" fill="none" :stroke="resColor(systemStats.disk.percentage)" stroke-width="10" stroke-linecap="round"
                  :stroke-dasharray="ringArc(50, systemStats.disk.percentage)"
                />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50">
                  {{ systemStats.disk.percentage.toFixed(0) }}<span class="text-sm font-normal text-apple-gray-400">%</span>
                </span>
              </div>
            </div>
            <div class="mt-3 text-center space-y-0.5">
              <div class="text-[10px] text-apple-gray-400">{{ formatBytes(systemStats.disk.used) }} / {{ formatBytes(systemStats.disk.total) }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== Area 3: Token Usage ===== -->
      <section>
        <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3 flex items-center gap-2">
          <Sparkles :size="14" /> Token 使用
        </h3>

        <!-- 4 stat cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="glass-panel rounded-xl p-3">
            <div class="flex items-center gap-2 mb-2">
              <Sparkles :size="14" class="text-brian-blue" />
              <span class="text-[10px] text-apple-gray-400">今日 Token</span>
            </div>
            <div class="text-xl font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ formatTokens(ringData.today.used) }}</div>
            <div class="text-[10px] text-apple-gray-400 mt-0.5">限额 {{ formatTokens(ringData.today.limit) }}</div>
          </div>
          <div class="glass-panel rounded-xl p-3">
            <div class="flex items-center gap-2 mb-2">
              <Sparkles :size="14" class="text-warning-orange" />
              <span class="text-[10px] text-apple-gray-400">本月 Token</span>
            </div>
            <div class="text-xl font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ formatTokens(ringData.month.used) }}</div>
            <div class="text-[10px] text-apple-gray-400 mt-0.5">限额 {{ formatTokens(ringData.month.limit) }}</div>
          </div>
          <div class="glass-panel rounded-xl p-3">
            <div class="flex items-center gap-2 mb-2">
              <PhoneCall :size="14" class="text-success-green" />
              <span class="text-[10px] text-apple-gray-400">今日请求</span>
            </div>
            <div class="text-xl font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ tokenStats.totalCalls.toLocaleString() }}</div>
            <div class="text-[10px] text-apple-gray-400 mt-0.5">累计调用</div>
          </div>
          <div class="glass-panel rounded-xl p-3">
            <div class="flex items-center gap-2 mb-2">
              <Zap :size="14" class="text-error-red" />
              <span class="text-[10px] text-apple-gray-400">平均响应</span>
            </div>
            <div class="text-xl font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ tokenStats.avgLatency }}<span class="text-xs font-normal text-apple-gray-400">ms</span></div>
            <div class="text-[10px] text-apple-gray-400 mt-0.5">平均时延</div>
          </div>
        </div>

        <!-- Token trend line chart -->
        <div class="glass-panel rounded-xl p-4 mb-4">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-400">Token 趋势</h4>
            <div class="flex items-center gap-1 p-0.5 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg">
              <button
                v-for="r in [7, 30, 90] as const"
                :key="r"
                :class="['px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors', trendRange === r ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
                @click="trendRange = r"
              >{{ r }}天</button>
            </div>
          </div>
          <div v-if="trendData.length > 0" class="w-full">
            <svg :viewBox="`0 0 ${TREND_W} ${TREND_H}`" class="w-full h-40" preserveAspectRatio="none">
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#007AFF" stop-opacity="0.25" />
                  <stop offset="100%" stop-color="#007AFF" stop-opacity="0" />
                </linearGradient>
              </defs>
              <!-- grid lines -->
              <line v-for="i in 3" :key="'g' + i" :x1="TREND_PAD.left" :x2="TREND_W - TREND_PAD.right"
                :y1="TREND_PAD.top + ((TREND_H - TREND_PAD.top - TREND_PAD.bottom) * i) / 4"
                :y2="TREND_PAD.top + ((TREND_H - TREND_PAD.top - TREND_PAD.bottom) * i) / 4"
                stroke="currentColor" class="text-apple-gray-200 dark:text-apple-gray-700" stroke-width="0.5" stroke-dasharray="3 3" />
              <!-- area fill -->
              <path v-if="trendAreaPath" :d="trendAreaPath" fill="url(#trendGradient)" />
              <!-- line -->
              <path v-if="trendLinePath" :d="trendLinePath" fill="none" stroke="#007AFF" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
              <!-- end dot -->
              <circle v-if="trendPoints.length" :cx="trendPoints[trendPoints.length - 1].x" :cy="trendPoints[trendPoints.length - 1].y" r="3" fill="#007AFF" />
              <!-- x labels -->
              <text v-for="(l, i) in trendLabels" :key="'l' + i" :x="l.x" :y="TREND_H - 8" text-anchor="middle" class="fill-apple-gray-400" style="font-size: 10px">{{ l.text }}</text>
            </svg>
          </div>
          <div v-else class="h-40 flex items-center justify-center text-apple-gray-400 text-xs">
            <Server :size="20" class="mr-2 text-apple-gray-300" /> 暂无趋势数据
          </div>
        </div>

        <!-- Per-model bar chart -->
        <div class="glass-panel rounded-xl p-4">
          <h4 class="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-3">按模型 Token 用量</h4>
          <div v-if="perModelList.length > 0" class="space-y-3">
            <div v-for="m in perModelList" :key="m.modelId">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-apple-gray-700 dark:text-apple-gray-300 truncate mr-2">{{ m.modelName }}</span>
                <span class="text-apple-gray-400 flex-shrink-0">{{ formatTokens(m.tokens) }} · {{ m.calls }} 次</span>
              </div>
              <div class="h-2 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :style="{ width: (m.tokens / perModelMax * 100) + '%', background: barColor(m.tokens) }"
                />
              </div>
            </div>
          </div>
          <div v-else class="h-24 flex items-center justify-center text-apple-gray-400 text-xs">
            <Server :size="20" class="mr-2 text-apple-gray-300" /> 暂无模型统计数据
          </div>
        </div>
      </section>

    </div>
  </div>
</template>
