<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import YearSelector from '../YearSelector.vue'

export interface MatrixEntry {
  date: string
  tokens: number
  calls: number
  avgLatency: number
}

const props = defineProps<{
  entries: MatrixEntry[]
  year: number
  availableYears: number[]
  title: string
  subtitle: string
  colorFn: 'token' | 'latency'
}>()

const emit = defineEmits<{ (e: 'update:year', value: number): void }>()

const CELL = 16
const GAP = 4
const MONTH_GAP = 12
const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

const containerRef = ref<HTMLDivElement | null>(null)
const containerWidth = ref(600)
const hovered = ref<string | null>(null)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (containerRef.value) {
    containerWidth.value = containerRef.value.clientWidth
    resizeObserver = new ResizeObserver((entries) => {
      for (const e of entries) containerWidth.value = e.contentRect.width
    })
    resizeObserver.observe(containerRef.value)
  }
})
onUnmounted(() => resizeObserver?.disconnect())

// ── Build data lookup ──
const dataMap = computed(() => {
  const m = new Map<string, { tokens: number; avgLatency: number }>()
  for (const e of props.entries) {
    if (e.tokens >= 0) m.set(e.date, { tokens: e.tokens, avgLatency: e.avgLatency })
  }
  return m
})

// ── Calendar generation ──

interface DayCell { date: string; dayOfWeek: number; tokens: number; avgLatency: number; inMonth: boolean }
interface WeekRow { days: DayCell[] }
interface MonthBlock {
  year: number; month: number; label: string
  weeks: WeekRow[]
}

const MONTH_WIDTH = 7 * CELL + 6 * GAP // one month column width

const fitMonths = computed(() => {
  const avail = containerWidth.value - 72 // subtract arrow buttons
  if (avail <= 0) return 2
  return Math.max(2, Math.floor(avail / (MONTH_WIDTH + MONTH_GAP)))
})

const now = new Date()
const currentYear = now.getFullYear()
const currentMonth = now.getMonth() // 0-based
const NOW_ABS = currentYear * 12 + currentMonth

// viewOffset: how many months shifted LEFT from the rightmost (current month) position
const viewOffset = ref(0)

watch([fitMonths], () => {
  viewOffset.value = 0 // reset when container resizes
})

function buildMonth(year: number, month: number): MonthBlock {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks: WeekRow[] = []
  let day = 1, d = firstDay

  while (day <= daysInMonth) {
    const row: DayCell[] = []
    for (let w = 0; w < 7; w++) {
      if (d === w && day <= daysInMonth) {
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const entry = dataMap.value.get(date)
        row.push({ date, dayOfWeek: w, tokens: entry?.tokens ?? 0, avgLatency: entry?.avgLatency ?? 0, inMonth: true })
        day++; d++
      } else {
        row.push({ date: '', dayOfWeek: w, tokens: -1, avgLatency: -1, inMonth: false })
      }
    }
    d = 0
    weeks.push({ days: row })
  }
  return { year, month, label: `${month + 1}月`, weeks }
}

const months = computed<MonthBlock[]>(() => {
  const result: MonthBlock[] = []
  const firstAbs = NOW_ABS - fitMonths.value + 1 - viewOffset.value
  for (let i = 0; i < fitMonths.value; i++) {
    const abs = firstAbs + i
    result.push(buildMonth(Math.floor(abs / 12), abs % 12))
  }
  return result
})

const hasPrev = computed(() => {
  const firstAbs = NOW_ABS - fitMonths.value + 1 - viewOffset.value
  return firstAbs > 0
})

const hasNext = computed(() => viewOffset.value > 0)

function scrollPage(dir: number) {
  if (dir < 0) viewOffset.value++
  else viewOffset.value = Math.max(0, viewOffset.value - 1)
}

// ── Colors ──
const maxTokens = computed(() => Math.max(...props.entries.map(e => e.tokens), 1))

function tokenColor(v: number): string {
  if (v < 0) return 'transparent'
  if (v === 0) return '#e5e7eb'
  const r = Math.min(v / maxTokens.value, 1)
  if (r <= 0.2) return '#bbf7d0'
  if (r <= 0.4) return '#86efac'
  if (r <= 0.6) return '#4ade80'
  if (r <= 0.8) return '#22c55e'
  return '#16a34a'
}

function latencyColor(ms: number): string {
  if (ms < 0) return 'transparent'
  if (ms === 0) return '#e5e7eb'
  if (ms <= 3000) {
    const r = ms / 3000
    return `rgb(${34 + Math.round(r * 100)},${197 - Math.round(r * 50)},${94 - Math.round(r * 30)})`
  }
  if (ms <= 10000) {
    const r = (ms - 3000) / 7000
    return `rgb(${134 + Math.round(r * 121)},${Math.max(147 - Math.round(r * 100), 30)},${Math.max(64 - Math.round(r * 34), 20)})`
  }
  return 'rgb(220,38,38)'
}

function cellColor(tokens: number, latency: number): string {
  if (tokens < 0) return 'transparent'
  if (props.colorFn === 'token') return tokenColor(tokens)
  return latencyColor(latency)
}

function formatHuman(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}
</script>

<template>
  <div ref="containerRef">
    <div class="flex items-center justify-between mb-2">
      <div>
        <h3 class="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400">{{ title }}</h3>
        <p class="text-[10px] text-apple-gray-400">{{ subtitle }}</p>
      </div>
      <YearSelector :model-value="year" :available-years="availableYears" @update:model-value="emit('update:year', $event)" />
    </div>

    <div class="glass-panel rounded-xl p-4">
      <!-- Navigation -->
      <div class="flex items-center mb-2">
        <button :disabled="!hasPrev"
          :class="hasPrev ? 'hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 text-apple-gray-500' : 'text-apple-gray-300 dark:text-apple-gray-700 cursor-not-allowed'"
          class="p-1 rounded transition-colors flex-shrink-0" @click="scrollPage(-1)">
          <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 19l-7-7 7-7"/></svg>
        </button>

        <div class="flex-1 flex justify-center gap-[12px]">
          <div v-for="(m, mi) in months" :key="'mblock-' + mi" class="flex-shrink-0">
            <!-- Month label -->
            <div class="text-[11px] font-medium text-apple-gray-500 dark:text-apple-gray-350 mb-1 pl-0.5">
              {{ m.year }}年{{ m.label }}
            </div>
            <!-- Day labels -->
            <div class="flex mb-0.5" :style="{ gap: GAP + 'px' }">
              <span v-for="d in DAY_LABELS" :key="d" class="text-[9px] text-apple-gray-400 text-center flex-shrink-0" :style="{ width: CELL + 'px' }">{{ d }}</span>
            </div>
            <!-- Week rows -->
            <div v-for="(week, wi) in m.weeks" :key="'week-' + wi" class="flex mb-0.5 last:mb-0" :style="{ gap: GAP + 'px' }">
              <div v-for="(day, di) in week.days" :key="'d-' + di"
                class="rounded-[3px] relative group flex-shrink-0"
                :style="{ width: CELL + 'px', height: CELL + 'px', backgroundColor: cellColor(day.tokens, day.avgLatency) }"
                @mouseenter="day.inMonth && day.date ? hovered = day.date : null"
                @mouseleave="hovered = null">
                <div v-if="hovered === day.date && day.tokens >= 0"
                  class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20 text-[10px] bg-apple-gray-900 dark:bg-apple-gray-200 text-white dark:text-apple-gray-800 px-2 py-1 rounded whitespace-nowrap pointer-events-none shadow-lg">
                  {{ day.date }}
                  <span v-if="colorFn === 'token'"> · {{ formatHuman(day.tokens) }} tokens</span>
                  <span v-else> · {{ day.avgLatency }}ms</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button :disabled="!hasNext"
          :class="hasNext ? 'hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 text-apple-gray-500' : 'text-apple-gray-300 dark:text-apple-gray-700 cursor-not-allowed'"
          class="p-1 rounded transition-colors flex-shrink-0" @click="scrollPage(1)">
          <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      <!-- Legend -->
      <div class="flex items-center justify-center gap-1 mt-2 pt-2 border-t border-apple-gray-100 dark:border-apple-gray-800">
        <template v-if="colorFn === 'token'">
          <span class="text-[10px] text-apple-gray-400 mr-1">少</span>
          <div class="w-3.5 h-3.5 rounded-[3px]" style="background:#e5e7eb" /><div class="w-3.5 h-3.5 rounded-[3px]" style="background:#bbf7d0" /><div class="w-3.5 h-3.5 rounded-[3px]" style="background:#86efac" /><div class="w-3.5 h-3.5 rounded-[3px]" style="background:#4ade80" /><div class="w-3.5 h-3.5 rounded-[3px]" style="background:#22c55e" /><div class="w-3.5 h-3.5 rounded-[3px]" style="background:#16a34a" />
          <span class="text-[10px] text-apple-gray-400 ml-1">多</span>
        </template>
        <template v-else>
          <span class="text-[10px] text-apple-gray-400 mr-1">快</span>
          <div class="w-3.5 h-3.5 rounded-[3px]" style="background:rgb(34,179,94)" /><div class="w-3.5 h-3.5 rounded-[3px]" style="background:rgb(84,180,140)" /><div class="w-3.5 h-3.5 rounded-[3px]" style="background:rgb(180,160,70)" /><div class="w-3.5 h-3.5 rounded-[3px]" style="background:rgb(220,100,40)" /><div class="w-3.5 h-3.5 rounded-[3px]" style="background:rgb(220,38,38)" />
          <span class="text-[10px] text-apple-gray-400 ml-1">慢</span>
        </template>
      </div>
    </div>
  </div>
</template>
