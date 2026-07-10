<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Cpu, HardDrive, Timer, Activity, Sparkles, Zap, Database, Wifi, BarChart3, PhoneCall } from '@lucide/vue'
import ContributionMatrix from './ContributionMatrix.vue'

interface MatrixEntry {
  date: string
  tokens: number
  calls: number
  avgLatency: number
}

interface SystemStats {
  cpu: number
  memory: { total: number; used: number; percentage: number }
  uptime: number
  processCount: number
}

interface ModelStats {
  totalTokens: number
  totalCalls: number
  avgLatency: number
  activeSessions: number
  cacheHitRate: number
}

interface StorageStatus { sqlite: boolean; vectorDb: boolean; graphDb: boolean }
interface RateLimits { daily: number; weekly: number; monthly: number; usedDaily: number; usedWeekly: number; usedMonthly: number }
interface WindowSummary { totalTokens: number; totalCalls: number; avgLatency: number }

const systemStats = ref<SystemStats>({ cpu: 0, memory: { total: 0, used: 0, percentage: 0 }, uptime: 0, processCount: 0 })
const modelStats = ref<ModelStats>({ totalTokens: 0, totalCalls: 0, avgLatency: 0, activeSessions: 0, cacheHitRate: 0 })
const storageStatus = ref<StorageStatus>({ sqlite: false, vectorDb: false, graphDb: false })
const rateLimits = ref<RateLimits>({ daily: 0, weekly: 0, monthly: 0, usedDaily: 0, usedWeekly: 0, usedMonthly: 0 })

const activeTab = ref<'realtime' | 'tokens'>('realtime')
const tokenMatrix = ref<MatrixEntry[]>([])
const latencyMatrix = ref<MatrixEntry[]>([])
const tokenYear = ref(new Date().getFullYear())
const latencyYear = ref(new Date().getFullYear())
const availableYears = ref<number[]>([new Date().getFullYear()])
const windows = ref<Record<string, WindowSummary>>({
  today: { totalTokens: 0, totalCalls: 0, avgLatency: 0 },
  '7d': { totalTokens: 0, totalCalls: 0, avgLatency: 0 },
  '31d': { totalTokens: 0, totalCalls: 0, avgLatency: 0 },
})

let timer: ReturnType<typeof setInterval> | null = null

// --- Donut helpers ---
function donutArc(pct: number): string {
  if (pct >= 100) pct = 99.99
  if (pct <= 0) return ''
  const rad = (pct / 100) * 360 * Math.PI / 180
  const x = 50 + 38 * Math.cos(rad - Math.PI / 2)
  const y = 50 + 38 * Math.sin(rad - Math.PI / 2)
  const la = pct > 50 ? 1 : 0
  return `M 50 12 A 38 38 0 ${la} 1 ${x} ${y}`
}

function formatHuman(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

const donutTodayPct = computed(() => {
  if (!rateLimits.value.daily) return 0
  return Math.min(100, Math.round(rateLimits.value.usedDaily / rateLimits.value.daily * 100))
})
const donut7dPct = computed(() => {
  if (!rateLimits.value.weekly) return 0
  return Math.min(100, Math.round(rateLimits.value.usedWeekly / rateLimits.value.weekly * 100))
})
const donut31dPct = computed(() => {
  if (!rateLimits.value.monthly) return 0
  return Math.min(100, Math.round(rateLimits.value.usedMonthly / rateLimits.value.monthly * 100))
})
const donutColor = (p: number) => p > 80 ? '#ef4444' : p > 50 ? '#f59e0b' : '#3b82f6'

const DONUT_ITEMS = computed(() => [
  { label: '今日', pct: donutTodayPct.value, used: rateLimits.value.usedDaily, limit: rateLimits.value.daily, calls: windows.value.today.totalCalls },
  { label: '7天', pct: donut7dPct.value, used: rateLimits.value.usedWeekly, limit: rateLimits.value.weekly, calls: windows.value['7d'].totalCalls },
  { label: '30天', pct: donut31dPct.value, used: rateLimits.value.usedMonthly, limit: rateLimits.value.monthly, calls: windows.value['31d'].totalCalls },
])

onMounted(() => { fetchStats(); timer = setInterval(fetchStats, 5000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

async function fetchStats() {
  try {
    const u = `http://127.0.0.1:8000/api/stats?tokenYear=${tokenYear.value}&latencyYear=${latencyYear.value}`
    const r = await fetch(u)
    if (!r.ok) return
    const d = await r.json()
    systemStats.value = d.system || systemStats.value
    modelStats.value = d.models || modelStats.value
    if (d.storage) storageStatus.value = d.storage
    if (d.rateLimits) rateLimits.value = d.rateLimits
    if (d.tokenMatrix) tokenMatrix.value = d.tokenMatrix
    if (d.tokenMatrixYear) tokenYear.value = d.tokenMatrixYear
    if (d.latencyMatrix) latencyMatrix.value = d.latencyMatrix
    if (d.latencyMatrixYear) latencyYear.value = d.latencyMatrixYear
    if (d.availableYears?.length) availableYears.value = d.availableYears
    if (d.windows) windows.value = d.windows
  } catch { /* ignore */ }
}

function formatBytes(mb: number) { return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB` }
function formatUptime(s: number) { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h > 0 ? `${h}h ${m}m` : `${m}m` }
function formatTokens(n: number) { return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n) }
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-white dark:bg-apple-gray-950 border-b border-apple-gray-200 dark:border-apple-gray-700 p-5">
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
    <div class="sticky top-[88px] z-10 bg-white dark:bg-apple-gray-950 px-4 py-2 border-b border-apple-gray-200 dark:border-apple-gray-700">
      <div class="flex items-center gap-1 p-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg">
        <button :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors', activeTab === 'realtime' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']" @click="activeTab = 'realtime'">
          <Activity :size="12" class="inline mr-1" />实时统计
        </button>
        <button :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors', activeTab === 'tokens' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']" @click="activeTab = 'tokens'">
          <BarChart3 :size="12" class="inline mr-1" />Token统计
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-5">

    <!-- ===== Realtime Tab ===== -->
    <template v-if="activeTab === 'realtime'">
      <section>
        <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">系统资源</h3>
        <div class="grid grid-cols-3 gap-3">
          <div class="glass-panel rounded-xl p-4">
            <div class="flex items-center gap-2 mb-3">
              <div class="p-1.5 bg-brian-blue/10 rounded-md"><Cpu :size="16" class="text-brian-blue" /></div>
              <span class="text-xs text-apple-gray-400">CPU</span>
            </div>
            <div class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 mb-2">{{ systemStats.cpu }}<span class="text-sm font-normal text-apple-gray-400">%</span></div>
            <div class="h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-500" :class="systemStats.cpu > 80 ? 'bg-error-red' : 'bg-brian-blue'" :style="{ width: Math.min(100, systemStats.cpu) + '%' }" />
            </div>
          </div>
          <div class="glass-panel rounded-xl p-4">
            <div class="flex items-center gap-2 mb-3">
              <div class="p-1.5 bg-success-green/10 rounded-md"><HardDrive :size="16" class="text-success-green" /></div>
              <span class="text-xs text-apple-gray-400">内存</span>
            </div>
            <div class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 mb-2">{{ systemStats.memory.percentage }}<span class="text-sm font-normal text-apple-gray-400">%</span></div>
            <div class="h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
              <div class="h-full bg-success-green rounded-full transition-all duration-500" :style="{ width: systemStats.memory.percentage + '%' }" />
            </div>
            <p class="text-[10px] text-apple-gray-400 mt-1.5">{{ formatBytes(systemStats.memory.used) }} / {{ formatBytes(systemStats.memory.total) }}</p>
          </div>
          <div class="glass-panel rounded-xl p-4">
            <div class="flex items-center gap-2 mb-3">
              <div class="p-1.5 bg-warning-orange/10 rounded-md"><Timer :size="16" class="text-warning-orange" /></div>
              <span class="text-xs text-apple-gray-400">运行时间</span>
            </div>
            <div class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 mb-2">{{ formatUptime(systemStats.uptime) }}</div>
            <p class="text-[10px] text-apple-gray-400">{{ systemStats.processCount }} 进程</p>
          </div>
        </div>
      </section>

      <section>
        <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">累计总计</h3>
        <div class="glass-panel rounded-xl p-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center gap-3">
              <Sparkles :size="18" class="text-brian-blue" />
              <div>
                <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ formatTokens(modelStats.totalTokens) }}</div>
                <div class="text-[10px] text-apple-gray-400">累计 Token</div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <Zap :size="18" class="text-warning-orange" />
              <div>
                <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ modelStats.totalCalls.toLocaleString() }}</div>
                <div class="text-[10px] text-apple-gray-400">累计调用</div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <Activity :size="18" class="text-success-green" />
              <div>
                <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ modelStats.activeSessions }}</div>
                <div class="text-[10px] text-apple-gray-400">活跃会话</div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <Database :size="18" class="text-brian-blue" />
              <div>
                <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ modelStats.cacheHitRate }}%</div>
                <div class="text-[10px] text-apple-gray-400">缓存命中</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">存储引擎</h3>
        <div class="grid grid-cols-3 gap-3">
          <div v-for="e in [
            { key: 'sqlite', label: 'SQLite', desc: '关系数据', icon: Database },
            { key: 'vectorDb', label: 'Vector DB', desc: '向量检索', icon: Wifi },
            { key: 'graphDb', label: 'Graph DB', desc: '知识图谱', icon: Activity },
          ]" :key="e.key" class="glass-panel rounded-xl p-3 text-center">
            <div class="relative mx-auto mb-1 w-fit">
              <component :is="e.icon" :size="18" :class="storageStatus[e.key as keyof StorageStatus] ? 'text-brian-blue' : 'text-apple-gray-400'" />
              <div :class="['w-2.5 h-2.5 rounded-full border-2 border-white dark:border-apple-gray-800 absolute -top-0.5 -right-0.5', storageStatus[e.key as keyof StorageStatus] ? 'bg-success-green' : 'bg-apple-gray-300']" />
            </div>
            <div class="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300">{{ e.label }}</div>
            <div class="text-[10px] text-apple-gray-400">{{ e.desc }}</div>
            <div :class="['text-[10px] mt-0.5', storageStatus[e.key as keyof StorageStatus] ? 'text-success-green' : 'text-apple-gray-400']">{{ storageStatus[e.key as keyof StorageStatus] ? '活跃' : '未激活' }}</div>
          </div>
        </div>
      </section>
    </template>

    <!-- ===== Token统计 Tab ===== -->
    <template v-if="activeTab === 'tokens'">
      <!-- Donut charts -->
      <section>
        <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">周期用量</h3>
        <div class="grid grid-cols-3 gap-3">
          <div v-for="item in DONUT_ITEMS" :key="item.label" class="glass-panel rounded-xl p-3 flex flex-col items-center">
            <span class="text-[10px] text-apple-gray-400 mb-2">{{ item.label }}</span>
            <div class="relative w-20 h-20">
              <svg viewBox="0 0 100 100" class="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" class="text-apple-gray-200 dark:text-apple-gray-700" stroke-width="8" />
                <path v-if="item.pct > 0" :d="donutArc(item.pct)" fill="none" :stroke="donutColor(item.pct)" stroke-width="8" stroke-linecap="round" />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-sm font-bold text-apple-gray-900 dark:text-apple-gray-50 leading-tight">{{ formatHuman(item.used) }}</span>
                <span v-if="item.limit > 0" class="text-[9px] text-apple-gray-400">{{ item.pct }}%</span>
              </div>
            </div>
            <div class="mt-2 text-center">
              <span class="text-[10px] text-apple-gray-500"><PhoneCall :size="10" class="inline mr-0.5" />{{ formatHuman(item.calls) }}次</span>
            </div>
          </div>
        </div>
      </section>

      <ContributionMatrix
        title="Token用量" :subtitle="`${tokenYear} 年 · 颜色越深用量越高`"
        color-fn="token" :entries="tokenMatrix" :year="tokenYear" :available-years="availableYears"
        @update:year="tokenYear = $event" />

      <ContributionMatrix
        title="首Token时延" :subtitle="`${latencyYear} 年 · 0-3s 绿色 · 3-10s 黄色 · >10s 红色`"
        color-fn="latency" :entries="latencyMatrix" :year="latencyYear" :available-years="availableYears"
        @update:year="latencyYear = $event" />
    </template>

    </div>
  </div>
</template>
