<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Brain, Loader2, FileText, MessageCircle, Network, Zap } from '@lucide/vue'
import { learningApi } from '@/api'
import type { LearningStats, LearningProgress } from '@/api/types'

const progress = ref<LearningProgress>({ mode: 'from-conversation', running: false, randomFactor: 50, queueSize: 0, completedToday: 0 })
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)
const tasksTimer = ref<ReturnType<typeof setInterval> | null>(null)
const triggering = ref('')

const MODE_CARDS = [
  { key: 'from-document', label: '从文档学习', desc: '读取资料库中的 Markdown 文件，抽取知识点与洞察', icon: FileText },
  { key: 'from-conversation', label: '从对话学习', desc: '回顾历史对话，提取用户偏好与知识模式', icon: MessageCircle },
  { key: 'tag-graph', label: 'Tag图维护', desc: '连接标签、激活图边、老化孤立标签', icon: Network },
]
const modeKeys = MODE_CARDS.map(c => c.key)

const modeAuto = ref<Record<string, boolean>>({
  'from-document': true,
  'from-conversation': true,
  'tag-graph': true,
})
const modeRandomFactor = ref<Record<string, number>>({
  'from-document': 10,
  'from-conversation': 10,
  'tag-graph': 10,
})
const modeStats = ref<Record<string, LearningStats>>({})
const modeKnowledge = ref<Record<string, unknown[]>>({})
const modeInsights = ref<Record<string, unknown[]>>({})
const modeQueue = ref<Record<string, unknown[]>>({})

function emptyStats(): LearningStats {
  return { totalLearnCount: 0, knowledgeCount: 0, insightCount: 0, weeklyLearnCount: 0, trend: [] }
}
function statsOf(mode: string): LearningStats {
  return modeStats.value[mode] || emptyStats()
}

async function fetchModeData(mode: string) {
  try { modeStats.value[mode] = await learningApi.getStats(mode) } catch { /* */ }
  try { modeKnowledge.value[mode] = await learningApi.getKnowledge(mode) } catch { /* */ }
  try { modeInsights.value[mode] = await learningApi.getInsights(mode) } catch { /* */ }
  try { modeQueue.value[mode] = await learningApi.getQueue(mode) } catch { /* */ }
}

async function fetchAll() {
  try {
    progress.value = await learningApi.getProgress()
    if (progress.value.modes) {
      for (const [key, v] of Object.entries(progress.value.modes)) {
        modeAuto.value[key] = v.auto
        modeRandomFactor.value[key] = v.randomFactor
      }
    }
  } catch { /* */ }
  await Promise.all(modeKeys.map(m => fetchModeData(m)))
}

async function triggerMode(mode: string) {
  if (triggering.value) return
  triggering.value = mode
  try {
    await learningApi.start(mode)
  } catch { /* */ }
  finally {
    triggering.value = ''
    await fetchTasks()
    await fetchAll()
  }
}

async function toggleAuto(mode: string) {
  const next = !modeAuto.value[mode]
  modeAuto.value[mode] = next
  try {
    await learningApi.setAuto(mode, next)
  } catch { modeAuto.value[mode] = !next }
}

const factorDebounceMap: Record<string, ReturnType<typeof setTimeout> | null> = {}
function onFactorChange(mode: string, val: number) {
  modeRandomFactor.value[mode] = val
  if (factorDebounceMap[mode]) clearTimeout(factorDebounceMap[mode] as ReturnType<typeof setTimeout>)
  factorDebounceMap[mode] = setTimeout(async () => {
    try { await learningApi.setRandomFactor(mode, val) } catch { /* */ }
  }, 500)
}

// 学习热力图：按展示条宽度动态计算展示日期范围（小块 8px + 间隔 2px = 10px）
const HEATMAP_CELL = 8
const HEATMAP_GAP = 2
const HEATMAP_PITCH = HEATMAP_CELL + HEATMAP_GAP
const HEATMAP_MIN_DAYS = 7
const HEATMAP_MAX_DAYS = 365

const heatmapWidths = ref<Record<string, number>>({})
let heatmapObserver: ResizeObserver | null = null

function setHeatmapRef(mode: string, el: Element | null) {
  if (!el) return
  if (!heatmapObserver) {
    heatmapObserver = new ResizeObserver((entries) => {
      for (const e of entries) {
        const m = (e.target as HTMLElement).dataset.mode
        if (m) heatmapWidths.value = { ...heatmapWidths.value, [m]: e.contentRect.width }
      }
    })
  }
  (el as HTMLElement).dataset.mode = mode
  heatmapObserver.observe(el)
}

// 步骤 1/2/3：展示条宽度 ÷ (小块宽 + 间隔) = 展示日期范围
function trendDaysOf(mode: string): number {
  const w = heatmapWidths.value[mode] || 0
  if (!w) return 30
  return Math.max(HEATMAP_MIN_DAYS, Math.min(HEATMAP_MAX_DAYS, Math.floor(w / HEATMAP_PITCH)))
}

function visibleTrend(mode: string): { date: string; count: number }[] {
  const t = statsOf(mode).trend || []
  return t.slice(-trendDaysOf(mode))
}

function trendMax(mode: string): number {
  const t = visibleTrend(mode)
  return Math.max(1, ...t.map(p => p.count))
}
function trendColor(mode: string, count: number): string {
  if (count <= 0) return 'bg-apple-gray-100 dark:bg-apple-gray-800'
  const r = count / trendMax(mode)
  if (r < 0.25) return 'bg-brian-blue/20'
  if (r < 0.5) return 'bg-brian-blue/40'
  if (r < 0.75) return 'bg-brian-blue/70'
  return 'bg-brian-blue'
}

// 学习任务（后端 fire-and-forget 任务可视化：running 优先展示）
const tasks = ref<Array<{ task_id: string; mode: string; label: string; status: string; started_at: number; error?: string }>>([])

async function fetchTasks() {
  try { tasks.value = (await learningApi.getTasks()).tasks ?? [] } catch { /* */ }
}

onMounted(() => {
  fetchAll()
  fetchTasks()
  pollTimer.value = setInterval(fetchAll, 30000)
  tasksTimer.value = setInterval(fetchTasks, 2000)
})
onUnmounted(() => {
  if (pollTimer.value) clearInterval(pollTimer.value)
  if (tasksTimer.value) clearInterval(tasksTimer.value)
  heatmapObserver?.disconnect()
  heatmapObserver = null
})
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Learning control -->
    <div class="block-card rounded-2xl p-6 flex-1 min-h-0 flex flex-col">
      <h2 class="text-lg font-semibold mb-4 flex items-center gap-2 shrink-0">
        <Brain :size="20" class="text-brian-blue" /> 学习控制
      </h2>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        <div
          v-for="card in MODE_CARDS"
          :key="card.key"
          class="flex flex-col p-4 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-900/50 h-full min-h-0"
        >
          <!-- 头部 -->
          <div class="flex items-center gap-2 mb-2 shrink-0">
            <component :is="card.icon" :size="18" class="text-brian-blue flex-shrink-0" />
            <span class="text-sm font-medium">{{ card.label }}</span>
            <button
              class="ml-auto relative w-9 h-5 rounded-full transition-colors duration-200"
              :class="modeAuto[card.key] ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
              :title="modeAuto[card.key] ? '自动学习已开启' : '自动学习已关闭'"
              @click="toggleAuto(card.key)"
            >
              <span
                class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
                :class="modeAuto[card.key] ? 'translate-x-4' : ''"
              />
            </button>
          </div>
          <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-3 line-clamp-2 shrink-0">{{ card.desc }}</p>

          <!-- 随机因子 -->
          <div class="mb-3 shrink-0">
            <div class="flex items-center justify-between">
              <span class="text-xs text-apple-gray-500">随机因子</span>
              <span class="text-xs font-medium text-brian-blue">{{ modeRandomFactor[card.key] }}</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              :value="modeRandomFactor[card.key]"
              class="w-full accent-brian-blue"
              @input="onFactorChange(card.key, Number(($event.target as HTMLInputElement).value))"
            />
          </div>

          <!-- 统计 -->
          <div class="grid grid-cols-4 gap-1.5 mb-3 shrink-0">
            <div class="p-2 rounded-lg bg-white dark:bg-apple-gray-800 text-center">
              <p class="text-sm font-bold">{{ statsOf(card.key).totalLearnCount }}</p>
              <p class="text-[10px] text-apple-gray-400">总学习</p>
            </div>
            <div class="p-2 rounded-lg bg-white dark:bg-apple-gray-800 text-center">
              <p class="text-sm font-bold">{{ statsOf(card.key).knowledgeCount }}</p>
              <p class="text-[10px] text-apple-gray-400">知识点</p>
            </div>
            <div class="p-2 rounded-lg bg-white dark:bg-apple-gray-800 text-center">
              <p class="text-sm font-bold">{{ statsOf(card.key).insightCount }}</p>
              <p class="text-[10px] text-apple-gray-400">洞察</p>
            </div>
            <div class="p-2 rounded-lg bg-white dark:bg-apple-gray-800 text-center">
              <p class="text-sm font-bold">{{ statsOf(card.key).weeklyLearnCount }}</p>
              <p class="text-[10px] text-apple-gray-400">本周</p>
            </div>
          </div>

          <!-- 学习热力图 -->
          <div class="mb-3 shrink-0">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] text-apple-gray-500">学习记录（近 {{ visibleTrend(card.key).length }} 天）</span>
              <span class="text-[10px] text-apple-gray-400">少 → 多</span>
            </div>
            <div :ref="(el) => setHeatmapRef(card.key, el as Element | null)" class="flex gap-[2px]">
              <div
                v-for="(p, i) in visibleTrend(card.key)"
                :key="i"
                class="w-2 h-2 rounded-[2px] flex-shrink-0"
                :class="trendColor(card.key, p.count)"
                :title="`${p.date}: ${p.count} 次`"
              />
            </div>
          </div>

          <!-- 学习队列 -->
          <div class="mb-3 shrink-0">
            <span class="text-[11px] text-apple-gray-500">学习队列</span>
            <div class="mt-1 h-16 overflow-y-auto space-y-1">
              <div v-if="(modeQueue[card.key] || []).length === 0" class="text-[11px] text-apple-gray-400">队列为空</div>
              <div v-for="(t, i) in (modeQueue[card.key] || []).slice(0, 5)" :key="i" class="text-[11px] truncate text-apple-gray-600 dark:text-apple-gray-300">
                {{ (t as Record<string, unknown>).task_name || (t as Record<string, unknown>).task_id || `任务 #${i + 1}` }}
              </div>
            </div>
          </div>

          <!-- 知识点 -->
          <div class="mb-3 flex-1 min-h-0 flex flex-col">
            <span class="text-[11px] text-apple-gray-500 shrink-0">知识点（{{ (modeKnowledge[card.key] || []).length }}）</span>
            <div class="mt-1 flex-1 min-h-0 overflow-y-auto space-y-1">
              <div v-if="(modeKnowledge[card.key] || []).length === 0" class="text-[11px] text-apple-gray-400">暂无知识点</div>
              <div v-for="(item, i) in (modeKnowledge[card.key] || []).slice(0, 10)" :key="i" class="text-[11px] truncate text-apple-gray-600 dark:text-apple-gray-300" :title="(item as Record<string, unknown>).content as string">
                {{ (item as Record<string, unknown>).content || '-' }}
              </div>
            </div>
          </div>

          <!-- 洞察发现 -->
          <div class="mb-3 flex-1 min-h-0 flex flex-col">
            <span class="text-[11px] text-apple-gray-500 shrink-0">洞察发现（{{ (modeInsights[card.key] || []).length }}）</span>
            <div class="mt-1 flex-1 min-h-0 overflow-y-auto space-y-1">
              <div v-if="(modeInsights[card.key] || []).length === 0" class="text-[11px] text-apple-gray-400">暂无洞察</div>
              <div v-for="(item, i) in (modeInsights[card.key] || []).slice(0, 10)" :key="i" class="text-[11px] truncate text-apple-gray-600 dark:text-apple-gray-300" :title="(item as Record<string, unknown>).content as string">
                {{ (item as Record<string, unknown>).content || '-' }}
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <button
            class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-brian-blue hover:bg-brian-blue/90 transition-colors disabled:opacity-60 shrink-0"
            :disabled="triggering !== ''"
            @click="triggerMode(card.key)"
          >
            <Loader2 v-if="triggering === card.key" :size="14" class="animate-spin" />
            <Zap v-else :size="14" />
            {{ triggering === card.key ? '触发中...' : '手动触发' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
