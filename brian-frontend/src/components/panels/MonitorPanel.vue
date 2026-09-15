<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watchEffect } from 'vue'
import { Activity, Cpu, HardDrive, Database, TrendingUp, Layers, RefreshCw, Eye, Copy, Check, CheckSquare, Square, Search, Trash2, MessageSquare, X, Loader2 } from '@lucide/vue'
import { monitorApi, feedbackApi } from '@/api'
import type { SystemHealth, FeedbackProcessLogRecord, FeedbackProcessLogDetail } from '@/api/types'
import { copyToClipboard } from '@/utils/clipboard'

const health = ref<SystemHealth>({ status: 'healthy', components: [], uptime: 0 })
const resources = ref({ cpu: 0, memory: 0, disk: 0 })
const tokenTrend = ref<{ date: string; tokens: number }[]>([])
const modelDist = ref<{ model: string; tokens: number; input_tokens: number; output_tokens: number; deleted?: boolean; type?: string }[]>([])
const logs = ref<{ id: string; timestamp: number; level: string; source: string; message: string; trace_id?: string; caller?: string }[]>([])
const logLevel = ref('')
const logKeyword = ref('')
const logTraceId = ref('')
const logSourceFilter = ref('')
const logSourceType = ref('')
const logSources = ref<string[]>([])
const logStartTime = ref('')
const logEndTime = ref('')
const selectedLogs = ref<Set<string>>(new Set())
const copiedLogId = ref('')
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)
const _loading = ref(false)
const calendarBox = ref<HTMLElement | null>(null)
const calendarBoxWidth = ref(0)
let resizeObserver: ResizeObserver | null = null
const healthCard = ref<HTMLElement | null>(null)
const healthCardHeight = ref(0)
let healthResizeObserver: ResizeObserver | null = null

const LOG_SOURCE_OPTIONS = [
  { value: '', label: '全部来源' },
  { value: 'AOP', label: 'AOP' },
  { value: 'SYSTEM', label: 'SYSTEM' },
  { value: 'MANUAL', label: 'MANUAL' },
]

const fbRecords = ref<FeedbackProcessLogRecord[]>([])
const fbLoading = ref(false)
const fbDetailOpen = ref(false)
const fbDetail = ref<FeedbackProcessLogDetail | null>(null)
const fbDetailLoading = ref(false)

async function fetchFeedbackRecords() {
  fbLoading.value = true
  try { fbRecords.value = (await feedbackApi.records(50)).logs } catch { fbRecords.value = [] }
  fbLoading.value = false
}

async function openFeedbackDetail(processId: string) {
  fbDetailOpen.value = true
  fbDetailLoading.value = true
  fbDetail.value = null
  try { fbDetail.value = await feedbackApi.recordDetail(processId) } catch { /* */ }
  fbDetailLoading.value = false
}

function closeFeedbackDetail() {
  fbDetailOpen.value = false
  fbDetail.value = null
}

const actionLabels: Record<string, string> = {
  submitted: '已提交',
  disbanded: '已解散',
  skipped: '已跳过',
}

const actionColors: Record<string, string> = {
  submitted: 'text-brian-blue bg-brian-blue/10',
  disbanded: 'text-error-red bg-error-red/10',
  skipped: 'text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-800',
}

function buildLogQuery() {
  const startTs = logStartTime.value ? new Date(logStartTime.value).getTime() : undefined
  const endTs = logEndTime.value ? new Date(logEndTime.value).getTime() : undefined
  return {
    level: logLevel.value || undefined,
    keyword: logKeyword.value.trim() || undefined,
    trace_id: logTraceId.value.trim() || undefined,
    source: logSourceFilter.value.trim() || undefined,
    log_source: logSourceType.value || undefined,
    start_time: startTs,
    end_time: endTs,
  }
}

// ===== 原始方法（保留作为参考）=====
// async function fetchAll() {
//   try { health.value = await monitorApi.health() } catch { /* */ }
//   try { resources.value = await monitorApi.resources() } catch { /* */ }
//   try { tokenTrend.value = await monitorApi.tokenTrend() } catch { /* */ }
//   try { modelDist.value = await monitorApi.modelDistribution() } catch { /* */ }
//   try { logs.value = await monitorApi.logs(buildLogQuery()) } catch { /* */ }
// }

// ===== 修改后的方法：并行请求，减少加载时间 =====
// 日志查询在大库上是重操作（COUNT 全表扫描同步阻塞事件循环），
// 仅页面进入与手动搜索/刷新时执行，绝不参与 10 秒轮询。
async function fetchAll(includeLogs = false) {
  const logsTask = includeLogs ? monitorApi.logs(buildLogQuery()) : undefined
  const all = await Promise.allSettled([
    monitorApi.health(),
    monitorApi.resources(),
    monitorApi.tokenTrend(),
    monitorApi.modelDistribution(),
    ...(logsTask ? [logsTask] : []),
  ])
  if (all[0].status === 'fulfilled') health.value = all[0].value
  if (all[1].status === 'fulfilled') resources.value = all[1].value
  if (all[2].status === 'fulfilled') tokenTrend.value = all[2].value
  if (all[3].status === 'fulfilled') modelDist.value = all[3].value
  if (logsTask && all[4] && all[4].status === 'fulfilled') logs.value = all[4].value as Awaited<typeof logsTask>
}

async function loadLogSources() {
  try { logSources.value = await monitorApi.logSources() } catch { logSources.value = [] }
}

function resetLogFilters() {
  logLevel.value = ''
  logKeyword.value = ''
  logTraceId.value = ''
  logSourceFilter.value = ''
  logSourceType.value = ''
  logStartTime.value = ''
  logEndTime.value = ''
  selectedLogs.value = new Set()
  fetchAll(true)
}

function toggleLogSelect(id: string) {
  const next = new Set(selectedLogs.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedLogs.value = next
}

const allLogsSelected = computed(() => logs.value.length > 0 && logs.value.every(l => selectedLogs.value.has(l.id)))

function toggleSelectAllLogs() {
  if (allLogsSelected.value) selectedLogs.value = new Set()
  else selectedLogs.value = new Set(logs.value.map(l => l.id))
}

function formatLogEntry(l: { timestamp: number; level: string; source: string; message: string; trace_id?: string; caller?: string }): string {
  const time = new Date(l.timestamp).toLocaleString('zh-CN')
  const parts = [`[${time}]`, `[${l.level.toUpperCase()}]`, `[${l.source}]`]
  if (l.trace_id) parts.push(`[trace:${l.trace_id}]`)
  if (l.caller) parts.push(`[caller:${l.caller}]`)
  parts.push(l.message)
  return parts.join(' ')
}

async function copyLog(id: string) {
  const l = logs.value.find(x => x.id === id)
  if (!l) return
  const success = await copyToClipboard(formatLogEntry(l))
  if (success) {
    copiedLogId.value = id
    setTimeout(() => { if (copiedLogId.value === id) copiedLogId.value = '' }, 1500)
  }
}

async function copySelectedLogs() {
  const selected = logs.value.filter(l => selectedLogs.value.has(l.id))
  if (selected.length === 0) return
  const text = selected.map(formatLogEntry).join('\n')
  await copyToClipboard(text)
}

async function deleteLog(id: string) {
  try {
    await monitorApi.deleteLogs([id])
    if (selectedLogs.value.has(id)) {
      const next = new Set(selectedLogs.value)
      next.delete(id)
      selectedLogs.value = next
    }
    await fetchAll(true)
  } catch { /* */ }
}

async function deleteSelectedLogs() {
  const ids = [...selectedLogs.value]
  if (ids.length === 0) return
  try {
    await monitorApi.deleteLogs(ids)
    selectedLogs.value = new Set()
    await fetchAll(true)
  } catch { /* */ }
}

async function clearAllLogs() {
  if (!window.confirm('确定要清空全部日志吗？此操作不可恢复。')) return
  try {
    await monitorApi.clearLogs()
    selectedLogs.value = new Set()
    await fetchAll(true)
  } catch { /* */ }
}

onMounted(() => {
  fetchAll(true)
  loadLogSources()
  fetchFeedbackRecords()
  pollTimer.value = setInterval(() => { fetchAll(false); fetchFeedbackRecords() }, 10000)
})
onUnmounted(() => {
  if (pollTimer.value) clearInterval(pollTimer.value)
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  if (healthResizeObserver) { healthResizeObserver.disconnect(); healthResizeObserver = null }
})

// 步骤1/2/3：当日历容器渲染后（tokenTrend 为空时该容器不渲染），监听其宽度变化，
// 按「格子宽度(10px) + 间距(3px)」计算可容纳的周数，从而确定日期范围。
watchEffect(() => {
  const el = calendarBox.value
  if (!el || resizeObserver) return
  resizeObserver = new ResizeObserver((entries) => {
    for (const e of entries) calendarBoxWidth.value = e.contentRect.width
  })
  resizeObserver.observe(el)
})

// 监听「系统健康」卡片高度，将其作为 Token 趋势 / 模型分布卡片锁定的固定高度
watchEffect(() => {
  const el = healthCard.value
  if (!el || healthResizeObserver) return
  healthResizeObserver = new ResizeObserver((entries) => {
    for (const e of entries) {
      healthCardHeight.value = e.borderBoxSize?.[0]?.blockSize ?? (e.target as HTMLElement).offsetHeight
    }
  })
  healthResizeObserver.observe(el)
})

const statusColor = (s: string) =>
  s === 'healthy' ? 'text-success-green' : s === 'degraded' ? 'text-warning-orange' : 'text-error-red'

const statusIcon = (s: string) =>
  s === 'healthy' ? 'bg-success-green' : s === 'degraded' ? 'bg-warning-orange' : 'bg-error-red'

const logLevelColors: Record<string, string> = {
  error: 'text-error-red bg-error-red/10',
  warn: 'text-warning-orange bg-warning-orange/10',
  info: 'text-brian-blue bg-brian-blue/10',
  debug: 'text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-800',
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${d}d ${h}h ${m}m`
}

// Token 使用趋势：GitHub 贡献图风格的日历热力图
const DAY_LABELS = ['一', '', '三', '', '五', '', '日']

// 根据容器宽度动态计算可容纳的周数，填充宽度、避免过多留白
// 容器宽度 ≈ 标签列(12px) + 间距(3px) + N个格子(10px) + (N-1)个间距(3px) = 12 + 13N
const calendarWeeks = computed(() => {
  const w = calendarBoxWidth.value
  if (!w) return 53
  return Math.max(26, Math.min(156, Math.floor((w - 12) / 13)))
})

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const tokenMap = computed(() => {
  const m = new Map<string, number>()
  for (const p of tokenTrend.value) m.set(p.date, p.tokens)
  return m
})

const maxDailyTokens = computed(() => Math.max(0, ...tokenTrend.value.map(p => p.tokens)))

const tokenCalendar = computed(() => {
  const weeks: Array<Array<{ date: string; tokens: number; future: boolean }>> = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const mondayOffset = (today.getDay() + 6) % 7
  const currentMonday = new Date(today)
  currentMonday.setDate(today.getDate() - mondayOffset)
  const totalWeeks = calendarWeeks.value
  const start = new Date(currentMonday)
  start.setDate(start.getDate() - (totalWeeks - 1) * 7)
  for (let w = 0; w < totalWeeks; w++) {
    const days: Array<{ date: string; tokens: number; future: boolean }> = []
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start)
      dt.setDate(start.getDate() + w * 7 + d)
      const dateStr = formatDate(dt)
      days.push({ date: dateStr, tokens: tokenMap.value.get(dateStr) ?? 0, future: dt > today })
    }
    weeks.push(days)
  }
  return weeks
})

// 展平为一维数组（周优先 → 天优先），供 grid-flow-col 按列填充
const flatCalendar = computed(() => tokenCalendar.value.flat())

function tokenCellColor(tokens: number, future: boolean): string {
  if (future) return 'bg-transparent border border-transparent'
  const base = 'border border-apple-gray-200 dark:border-apple-gray-600'
  if (tokens <= 0) return `${base} bg-apple-gray-100 dark:bg-apple-gray-700`
  const max = maxDailyTokens.value || 1
  const r = tokens / max
  if (r < 0.25) return `${base} bg-brian-blue/20`
  if (r < 0.5) return `${base} bg-brian-blue/40`
  if (r < 0.75) return `${base} bg-brian-blue/70`
  return `${base} bg-brian-blue`
}

// 模型分布：按类型分 tab 展示，总 token、占比、显示名
const MODEL_TYPE_LABELS: Record<string, string> = {
  text: '文本生成',
  vision: '多模态',
  embedding: '向量化',
}
const MODEL_TYPE_ORDER = ['text', 'vision', 'embedding']

const modelTypeTab = ref('text')

const MODEL_SORT_OPTIONS: { value: 'tokens' | 'input' | 'output'; label: string }[] = [
  { value: 'tokens', label: '总量' },
  { value: 'input', label: '输入' },
  { value: 'output', label: '输出' },
]
const modelSort = ref<'tokens' | 'input' | 'output'>('tokens')

function modelSortValue(m: { tokens: number; input_tokens: number; output_tokens: number }): number {
  if (modelSort.value === 'input') return m.input_tokens || 0
  if (modelSort.value === 'output') return m.output_tokens || 0
  return m.tokens || 0
}

const groupedModels = computed(() => {
  const groups: Record<string, { model: string; tokens: number; input_tokens: number; output_tokens: number; deleted?: boolean }[]> = {}
  for (const m of modelDist.value) {
    const t = m.type || 'deleted'
    if (!groups[t]) groups[t] = []
    groups[t].push(m)
  }
  return groups
})

const modelTabs = computed(() => MODEL_TYPE_ORDER.filter(t => (groupedModels.value[t]?.length ?? 0) > 0))

const activeModels = computed(() => {
  const list = [...(groupedModels.value[modelTypeTab.value] || [])]
  list.sort((a, b) => modelSortValue(b) - modelSortValue(a))
  return list
})

const activeTotalInputTokens = computed(() => activeModels.value.reduce((s, m) => s + (m.input_tokens || 0), 0))

const activeTotalOutputTokens = computed(() => activeModels.value.reduce((s, m) => s + (m.output_tokens || 0), 0))

const activeTotalTokens = computed(() => activeTotalInputTokens.value + activeTotalOutputTokens.value)

function modelInputPercent(m: { input_tokens: number }): number {
  const total = activeTotalTokens.value || 1
  return ((m.input_tokens || 0) / total) * 100
}

function modelOutputPercent(m: { output_tokens: number }): number {
  const total = activeTotalTokens.value || 1
  return ((m.output_tokens || 0) / total) * 100
}

function displayModelName(m: { model: string; deleted?: boolean }): string {
  return m.deleted ? '已删除模型' : m.model
}
</script>

<template>
  <div class="space-y-6">
    <!-- Health status -->
    <div ref="healthCard" class="block-card rounded-2xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Activity :size="20" class="text-brian-blue" /> 系统健康
        </h2>
        <span class="flex items-center gap-1.5 text-sm font-medium" :class="statusColor(health.status)">
          <span class="w-2.5 h-2.5 rounded-full" :class="statusIcon(health.status)" />
          {{ health.status === 'healthy' ? '健康' : health.status === 'degraded' ? '降级' : '异常' }}
        </span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div v-for="comp in health.components" :key="comp.name" class="flex flex-col p-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
          <div class="flex items-center justify-between gap-2 mb-2">
            <p class="text-xs font-medium truncate">{{ comp.name }}</p>
            <span class="w-2 h-2 rounded-full flex-shrink-0" :class="statusIcon(comp.status)" />
          </div>
          <div class="flex-1 space-y-1">
            <div v-for="(val, key) in comp.details" :key="key" class="flex items-center justify-between gap-1 text-[11px]">
              <span class="text-apple-gray-400">{{ key }}</span>
              <span class="text-apple-gray-700 dark:text-apple-gray-200 font-medium">{{ val }}</span>
            </div>
          </div>
          <p class="mt-2 pt-1.5 text-[10px] text-apple-gray-400 border-t border-apple-gray-100 dark:border-apple-gray-700/60 truncate">{{ comp.message }}</p>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap gap-4 text-sm">
        <span class="flex items-center gap-1.5 text-apple-gray-500">
          <Cpu :size="14" /> CPU: {{ resources.cpu }}%
        </span>
        <span class="flex items-center gap-1.5 text-apple-gray-500">
          <HardDrive :size="14" /> 内存: {{ resources.memory }}%
        </span>
        <span class="flex items-center gap-1.5 text-apple-gray-500">
          <Database :size="14" /> 磁盘: {{ resources.disk }}%
        </span>
        <span class="flex items-center gap-1.5 text-apple-gray-500 ml-auto">
          <Activity :size="14" /> 运行时间: {{ formatUptime(health.uptime) }}
        </span>
      </div>
    </div>

    <!-- Token usage -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="block-card rounded-2xl p-6 flex flex-col" :style="healthCardHeight ? { height: `${healthCardHeight}px` } : undefined">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp :size="16" class="text-brian-blue" /> Token 使用趋势
        </h3>
        <div v-if="tokenTrend.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无数据</div>
        <div v-else ref="calendarBox" class="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center">
          <div class="flex gap-[3px]">
            <div class="grid grid-rows-7 gap-[3px] w-3 shrink-0">
              <span v-for="(label, i) in DAY_LABELS" :key="i" class="flex items-center h-2.5 text-[10px] leading-none text-apple-gray-400">{{ label }}</span>
            </div>
            <div class="grid grid-rows-7 grid-flow-col gap-[3px]">
              <div
                v-for="(day, idx) in flatCalendar"
                :key="idx"
                class="w-2.5 h-2.5 rounded-sm"
                :class="tokenCellColor(day.tokens, day.future)"
                :title="day.future ? day.date : `${day.date}: ${day.tokens.toLocaleString()} tokens`"
              />
            </div>
          </div>
          <div class="flex items-center justify-end gap-1 mt-2 text-[10px] text-apple-gray-400">
            <span>少</span>
            <span class="w-2.5 h-2.5 rounded-sm border border-apple-gray-200 dark:border-apple-gray-600 bg-apple-gray-100 dark:bg-apple-gray-700" />
            <span class="w-2.5 h-2.5 rounded-sm border border-apple-gray-200 dark:border-apple-gray-600 bg-brian-blue/20" />
            <span class="w-2.5 h-2.5 rounded-sm border border-apple-gray-200 dark:border-apple-gray-600 bg-brian-blue/40" />
            <span class="w-2.5 h-2.5 rounded-sm border border-apple-gray-200 dark:border-apple-gray-600 bg-brian-blue/70" />
            <span class="w-2.5 h-2.5 rounded-sm border border-apple-gray-200 dark:border-apple-gray-600 bg-brian-blue" />
            <span>多</span>
          </div>
        </div>
      </div>

      <div class="block-card rounded-2xl p-6 flex flex-col" :style="healthCardHeight ? { height: `${healthCardHeight}px` } : undefined">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <Layers :size="16" class="text-success-green" /> 模型分布
        </h3>
        <div v-if="modelDist.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无数据</div>
        <div v-else class="flex-1 min-h-0 flex flex-col">
          <div class="flex items-center gap-1 mb-3">
            <button
              v-for="t in modelTabs"
              :key="t"
              class="px-2.5 py-1 text-xs rounded-lg transition-colors"
              :class="modelTypeTab === t ? 'bg-brian-blue text-white' : 'text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'"
              @click="modelTypeTab = t"
            >
              {{ MODEL_TYPE_LABELS[t] || t }}
            </button>
            <div class="ml-auto flex items-center gap-0.5 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg p-0.5">
              <button
                v-for="o in MODEL_SORT_OPTIONS"
                :key="o.value"
                class="px-2 py-0.5 text-[11px] rounded-md transition-colors"
                :class="modelSort === o.value ? 'bg-white dark:bg-apple-gray-600 text-apple-gray-900 dark:text-white shadow-sm' : 'text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'"
                @click="modelSort = o.value"
              >
                {{ o.label }}
              </button>
            </div>
          </div>
          <div v-if="activeModels.length === 0" class="text-center py-4 text-apple-gray-400 text-sm">暂无数据</div>
          <div v-else class="space-y-2.5 flex-1 min-h-0 overflow-y-auto pr-1">
            <div class="flex items-center justify-between pb-1 text-[11px] border-b border-apple-gray-100 dark:border-apple-gray-700">
              <span class="text-apple-gray-400">合计</span>
              <span class="flex items-center gap-3">
                <span class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-error-red" />
                  <span class="text-error-red">输入 {{ activeTotalInputTokens.toLocaleString() }}</span>
                </span>
                <span class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-success-green" />
                  <span class="text-success-green">输出 {{ activeTotalOutputTokens.toLocaleString() }}</span>
                </span>
              </span>
            </div>
            <div v-for="m in activeModels" :key="m.model" class="flex items-center gap-2" :title="`${displayModelName(m)} — 输入 ${modelInputPercent(m).toFixed(1)}% · 输出 ${modelOutputPercent(m).toFixed(1)}%`">
              <span class="text-xs truncate w-36 flex-shrink-0 text-apple-gray-700 dark:text-apple-gray-300" :title="displayModelName(m)">{{ displayModelName(m) }}</span>
              <div class="flex-1 h-2 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 overflow-hidden flex">
                <div class="h-full bg-error-red" :style="{ width: `${modelInputPercent(m)}%` }" />
                <div class="h-full bg-success-green" :style="{ width: `${modelOutputPercent(m)}%` }" />
              </div>
              <span class="text-xs flex-shrink-0 whitespace-nowrap font-medium">
                <span class="text-error-red">{{ (m.input_tokens || 0).toLocaleString() }}</span>
                <span class="text-apple-gray-400 px-1">/</span>
                <span class="text-success-green">{{ (m.output_tokens || 0).toLocaleString() }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Logs -->
    <div class="block-card rounded-2xl p-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold flex items-center gap-2">
          <Eye :size="16" class="text-brian-blue" /> 最近日志
        </h3>
        <button class="p-1.5 rounded-lg text-apple-gray-400 hover:text-brian-blue hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="fetchAll(true)">
          <RefreshCw :size="14" />
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2 mb-3">
        <div class="relative">
          <Search :size="13" class="absolute left-2 top-1/2 -translate-y-1/2 text-apple-gray-400" />
          <input v-model="logKeyword" class="pl-7 pr-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none w-40" placeholder="内容搜索" @keyup.enter="fetchAll(true)" />
        </div>
        <input v-model="logTraceId" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none w-32" placeholder="traceId" @keyup.enter="fetchAll(true)" />
        <select v-model="logSourceFilter" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none" @change="fetchAll(true)">
          <option value="">全部模块</option>
          <option v-for="s in logSources" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="logSourceType" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none" @change="fetchAll(true)">
          <option v-for="o in LOG_SOURCE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select v-model="logLevel" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none">
          <option value="">全部级别</option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="info">info</option>
          <option value="debug">debug</option>
        </select>
        <input v-model="logStartTime" type="datetime-local" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none" />
        <span class="text-xs text-apple-gray-400">至</span>
        <input v-model="logEndTime" type="datetime-local" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none" />
        <button class="px-2.5 py-1 text-xs rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90" @click="fetchAll(true)">搜索</button>
        <button class="px-2.5 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300" @click="resetLogFilters()">重置</button>
      </div>

      <div class="flex items-center justify-between mb-2 text-xs">
        <span class="text-apple-gray-400">{{ logs.length }} 条日志{{ selectedLogs.size > 0 ? `（已选 ${selectedLogs.size} 条）` : '' }}</span>
        <div class="flex items-center gap-2">
          <button v-if="selectedLogs.size > 0" class="flex items-center gap-1 px-2 py-1 rounded-lg text-brian-blue hover:bg-brian-blue/10" @click="copySelectedLogs">
            <Copy :size="12" /> 批量复制({{ selectedLogs.size }})
          </button>
          <button v-if="selectedLogs.size > 0" class="flex items-center gap-1 px-2 py-1 rounded-lg text-error-red hover:bg-error-red/10" @click="deleteSelectedLogs">
            <Trash2 :size="12" /> 批量删除({{ selectedLogs.size }})
          </button>
          <button class="flex items-center gap-1 text-apple-gray-500 hover:text-brian-blue" @click="toggleSelectAllLogs">
            <component :is="allLogsSelected ? CheckSquare : Square" :size="14" />
            {{ allLogsSelected ? '取消全选' : '全选' }}
          </button>
          <button class="flex items-center gap-1 px-2 py-1 rounded-lg text-error-red hover:bg-error-red/10" @click="clearAllLogs">
            <Trash2 :size="12" /> 清空
          </button>
        </div>
      </div>

      <div v-if="logs.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无日志</div>
      <div v-else class="max-h-80 overflow-y-auto rounded-lg border border-apple-gray-100 dark:border-apple-gray-700">
        <table class="w-full table-fixed text-xs font-mono">
          <colgroup>
            <col class="w-8" />
            <col class="w-24" />
            <col class="w-16" />
            <col class="w-28" />
            <col class="w-24" />
            <col />
            <col class="w-20" />
          </colgroup>
          <thead class="sticky top-0 bg-apple-gray-50 dark:bg-apple-gray-800 z-10">
            <tr class="text-left text-apple-gray-400 border-b border-apple-gray-100 dark:border-apple-gray-700">
              <th class="py-2 px-2">
                <input type="checkbox" class="rounded" :checked="allLogsSelected" @change="toggleSelectAllLogs" />
              </th>
              <th class="py-2 px-2 font-medium">时间</th>
              <th class="py-2 px-2 font-medium">级别</th>
              <th class="py-2 px-2 font-medium">来源</th>
              <th class="py-2 px-2 font-medium">TraceId</th>
              <th class="py-2 px-2 font-medium">消息</th>
              <th class="py-2 px-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-apple-gray-50 dark:divide-apple-gray-800/50">
            <tr v-for="entry in logs" :key="entry.id" class="hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50">
              <td class="py-1.5 px-2">
                <input type="checkbox" class="rounded" :checked="selectedLogs.has(entry.id)" @change="toggleLogSelect(entry.id)" />
              </td>
              <td class="py-1.5 px-2 text-apple-gray-400 whitespace-nowrap">{{ new Date(entry.timestamp).toLocaleTimeString('zh-CN') }}</td>
              <td class="py-1.5 px-2"><span class="px-1 rounded font-medium" :class="logLevelColors[entry.level] || ''">{{ entry.level }}</span></td>
              <td class="py-1.5 px-2 text-apple-gray-500 truncate" :title="entry.source">{{ entry.source }}</td>
              <td class="py-1.5 px-2 text-brian-blue/70 truncate" :title="entry.trace_id ? `traceId: ${entry.trace_id}` : ''">{{ entry.trace_id ? entry.trace_id.slice(0, 8) : '' }}</td>
              <td class="py-1.5 px-2 truncate" :title="entry.message">{{ entry.message }}</td>
              <td class="py-1.5 px-2 text-right whitespace-nowrap">
                <button class="p-1 rounded text-apple-gray-400 hover:text-brian-blue" title="复制" @click="copyLog(entry.id)">
                  <Check v-if="copiedLogId === entry.id" :size="13" class="text-success-green" />
                  <Copy v-else :size="13" />
                </button>
                <button class="p-1 rounded text-apple-gray-400 hover:text-error-red" title="删除" @click="deleteLog(entry.id)">
                  <Trash2 :size="13" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 反馈处理记录 -->
    <div class="block-card rounded-2xl p-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold flex items-center gap-2">
          <MessageSquare :size="16" class="text-warning-orange" /> 反馈处理记录
        </h3>
        <button class="p-1.5 rounded-lg text-apple-gray-400 hover:text-brian-blue hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="fetchFeedbackRecords">
          <RefreshCw :size="14" />
        </button>
      </div>
      <div v-if="fbLoading" class="text-center py-4 text-apple-gray-400 text-sm">加载中...</div>
      <div v-else-if="fbRecords.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无反馈处理记录</div>
      <div v-else class="max-h-80 overflow-y-auto rounded-lg border border-apple-gray-100 dark:border-apple-gray-700">
        <table class="w-full table-fixed text-xs">
          <colgroup>
            <col class="w-24" /><col class="w-36" /><col class="w-14" /><col class="w-14" /><col class="w-20" /><col />
          </colgroup>
          <thead class="sticky top-0 bg-apple-gray-50 dark:bg-apple-gray-800 z-10">
            <tr class="text-left text-apple-gray-400 border-b border-apple-gray-100 dark:border-apple-gray-700">
              <th class="py-2 px-2 font-medium">时间</th>
              <th class="py-2 px-2 font-medium">Process ID</th>
              <th class="py-2 px-2 font-medium">评分</th>
              <th class="py-2 px-2 font-medium">动作</th>
              <th class="py-2 px-2 font-medium">Agent ID</th>
              <th class="py-2 px-2 font-medium">Run ID</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-apple-gray-50 dark:divide-apple-gray-800/50">
            <tr v-for="r in fbRecords" :key="r.id" class="hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50">
              <td class="py-1.5 px-2 text-apple-gray-400 whitespace-nowrap">{{ new Date(r.created).toLocaleString('zh-CN') }}</td>
              <td class="py-1.5 px-2">
                <button
                  class="text-brian-blue hover:underline font-mono text-[11px]"
                  @click="openFeedbackDetail(r.process_id)"
                >{{ r.process_id.slice(0, 12) }}...</button>
              </td>
              <td class="py-1.5 px-2">{{ r.rating }}</td>
              <td class="py-1.5 px-2">
                <span class="px-1 rounded text-[10px] font-medium" :class="actionColors[r.action] || ''">{{ actionLabels[r.action] || r.action }}</span>
              </td>
              <td class="py-1.5 px-2 text-apple-gray-500 truncate font-mono text-[11px]" :title="r.agent_id">{{ r.agent_id ? r.agent_id.slice(0, 12) + '...' : '-' }}</td>
              <td class="py-1.5 px-2 text-apple-gray-500 truncate font-mono text-[11px]" :title="r.run_id">{{ r.run_id ? r.run_id.slice(0, 12) + '...' : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 反馈详情弹窗 -->
    <Teleport to="body">
      <div
        v-if="fbDetailOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        @click.self="closeFeedbackDetail"
      >
        <div class="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
          <div class="flex items-center justify-between px-6 py-4 border-b border-apple-gray-100 dark:border-apple-gray-700">
            <h3 class="text-base font-semibold">反馈处理详情</h3>
            <button class="p-1 rounded-lg text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200" @click="closeFeedbackDetail">
              <X :size="18" />
            </button>
          </div>
          <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div v-if="fbDetailLoading" class="flex items-center justify-center py-8">
              <Loader2 :size="20" class="animate-spin text-brian-blue" />
            </div>
            <template v-else-if="fbDetail">
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div><span class="text-apple-gray-400">Process ID:</span> <span class="font-mono text-xs">{{ fbDetail.log?.process_id }}</span></div>
                <div><span class="text-apple-gray-400">反馈 ID:</span> <span class="font-mono text-xs">{{ fbDetail.log?.feedback_id?.slice(0, 16) }}...</span></div>
                <div><span class="text-apple-gray-400">动作:</span> <span class="px-1 rounded text-xs font-medium" :class="actionColors[fbDetail.log?.action || '']">{{ actionLabels[fbDetail.log?.action || ''] }}</span></div>
                <div><span class="text-apple-gray-400">评分:</span> {{ fbDetail.log?.rating }}</div>
                <div><span class="text-apple-gray-400">Run ID:</span> <span class="font-mono text-xs">{{ fbDetail.log?.run_id || '-' }}</span></div>
                <div><span class="text-apple-gray-400">Agent ID:</span> <span class="font-mono text-xs">{{ fbDetail.log?.agent_id || '-' }}</span></div>
              </div>
              <div v-if="fbDetail.user_question" class="border-t border-apple-gray-100 dark:border-apple-gray-700 pt-3">
                <h4 class="text-xs font-medium text-apple-gray-400 mb-1">用户提问</h4>
                <div class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900 text-sm whitespace-pre-wrap">{{ fbDetail.user_question }}</div>
              </div>
              <div v-if="fbDetail.system_answer" class="border-t border-apple-gray-100 dark:border-apple-gray-700 pt-3">
                <h4 class="text-xs font-medium text-apple-gray-400 mb-1">系统回答</h4>
                <div class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900 text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">{{ fbDetail.system_answer }}</div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
