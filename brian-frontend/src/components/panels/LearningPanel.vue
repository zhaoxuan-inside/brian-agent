<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Play, Pause, Sliders, Brain, Lightbulb, TrendingUp, Calendar, Loader2, RefreshCw } from '@lucide/vue'
import { learningApi } from '@/api'
import type { LearningStats, LearningProgress } from '@/api/types'

const isRunning = ref(false)
const randomFactor = ref(50)
const mode = ref('from-conversation')
const loading = ref(false)
const stats = ref<LearningStats>({ totalLearnCount: 0, knowledgeCount: 0, insightCount: 0, weeklyLearnCount: 0 })
const progress = ref<LearningProgress>({ mode: 'from-conversation', running: false, randomFactor: 50, queueSize: 0, completedToday: 0 })
const queue = ref<unknown[]>([])
const knowledge = ref<unknown[]>([])
const insights = ref<unknown[]>([])
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)

async function fetchAll() {
  try { stats.value = await learningApi.getStats() } catch { /* */ }
  try { progress.value = await learningApi.getProgress(); isRunning.value = progress.value.running; randomFactor.value = progress.value.randomFactor; mode.value = progress.value.mode } catch { /* */ }
  try { queue.value = await learningApi.getQueue() } catch { /* */ }
  try { knowledge.value = await learningApi.getKnowledge() } catch { /* */ }
  try { insights.value = await learningApi.getInsights() } catch { /* */ }
}

async function toggleRunning() {
  loading.value = true
  try {
    if (isRunning.value) {
      await learningApi.stop()
    } else {
      await learningApi.start()
    }
    isRunning.value = !isRunning.value
  } catch { /* */ }
  finally { loading.value = false }
  await fetchAll()
}

async function updateMode(newMode: string) {
  if (isRunning.value) {
    if (!confirm('当前有任务执行中，切换将中断当前任务，是否继续？')) return
  }
  try {
    await learningApi.setMode(newMode)
    mode.value = newMode
  } catch { /* */ }
}

let factorDebounce: ReturnType<typeof setTimeout> | null = null
function onFactorChange(val: number) {
  randomFactor.value = val
  if (factorDebounce) clearTimeout(factorDebounce)
  factorDebounce = setTimeout(async () => {
    try { await learningApi.setDriverWeights(val) } catch { /* */ }
  }, 500)
}

onMounted(() => {
  fetchAll()
  pollTimer.value = setInterval(fetchAll, 30000)
})
onUnmounted(() => {
  if (pollTimer.value) clearInterval(pollTimer.value)
})
</script>

<template>
  <div class="space-y-6">
    <!-- Learning control -->
    <div class="block-card rounded-2xl p-6">
      <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
        <Brain :size="20" class="text-brian-blue" /> 学习控制
      </h2>
      <div class="flex flex-wrap items-center gap-4">
        <button
          class="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white transition-colors"
          :class="isRunning ? 'bg-warning-orange hover:bg-warning-orange/90' : 'bg-success-green hover:bg-success-green/90'"
          :disabled="loading"
          @click="toggleRunning"
        >
          <Loader2 v-if="loading" :size="16" class="animate-spin" />
          <Pause v-else-if="isRunning" :size="16" />
          <Play v-else :size="16" />
          {{ loading ? '处理中...' : isRunning ? '暂停学习' : '开始学习' }}
        </button>

        <div class="flex items-center gap-2">
          <span class="text-sm text-apple-gray-500">学习模式</span>
          <select
            :value="mode"
            class="px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue"
            @change="updateMode(($event.target as HTMLSelectElement).value)"
          >
            <option value="from-conversation">从对话学习</option>
            <option value="from-document">从文档学习</option>
            <option value="tag-graph">Tag图维护</option>
          </select>
        </div>
      </div>

      <div class="mt-4 space-y-2">
        <div class="flex items-center gap-3">
          <Sliders :size="14" class="text-apple-gray-400" />
          <span class="text-sm text-apple-gray-500">随机因子</span>
          <span class="text-sm font-medium text-brian-blue ml-auto">{{ randomFactor }}</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="randomFactor"
          class="w-full accent-brian-blue"
          @input="onFactorChange(Number(($event.target as HTMLInputElement).value))"
        />
        <p class="text-xs text-apple-gray-400">数值越大，系统空闲时自动触发学习的频率越高</p>
      </div>
    </div>

    <!-- Statistics -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="block-card rounded-2xl p-4">
        <div class="flex items-center gap-2 mb-2">
          <TrendingUp :size="18" class="text-brian-blue" />
          <span class="text-xs text-apple-gray-500">总学习次数</span>
        </div>
        <p class="text-2xl font-bold">{{ stats.totalLearnCount }}</p>
      </div>
      <div class="block-card rounded-2xl p-4">
        <div class="flex items-center gap-2 mb-2">
          <Brain :size="18" class="text-success-green" />
          <span class="text-xs text-apple-gray-500">知识点总数</span>
        </div>
        <p class="text-2xl font-bold">{{ stats.knowledgeCount }}</p>
      </div>
      <div class="block-card rounded-2xl p-4">
        <div class="flex items-center gap-2 mb-2">
          <Lightbulb :size="18" class="text-warning-orange" />
          <span class="text-xs text-apple-gray-500">洞察总数</span>
        </div>
        <p class="text-2xl font-bold">{{ stats.insightCount }}</p>
      </div>
      <div class="block-card rounded-2xl p-4">
        <div class="flex items-center gap-2 mb-2">
          <Calendar :size="18" class="text-brian-blue" />
          <span class="text-xs text-apple-gray-500">本周学习</span>
        </div>
        <p class="text-2xl font-bold">{{ stats.weeklyLearnCount }}</p>
      </div>
    </div>

    <!-- Progress -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Queue -->
      <div class="block-card rounded-2xl p-6">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <RefreshCw :size="16" class="text-warning-orange" /> 学习队列
        </h3>
        <div v-if="queue.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">
          <RefreshCw :size="28" class="mx-auto mb-2 text-apple-gray-300" />
          <p>队列为空</p>
        </div>
        <div v-else class="space-y-2 max-h-60 overflow-y-auto">
          <div v-for="(task, i) in queue.slice(0, 10)" :key="i" class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
            <p class="text-xs truncate">{{ (task as Record<string, unknown>).name || `任务 #${i + 1}` }}</p>
            <span class="text-xs text-apple-gray-400">{{ (task as Record<string, unknown>).status || 'pending' }}</span>
          </div>
        </div>
      </div>

      <!-- Knowledge -->
      <div class="block-card rounded-2xl p-6">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <Brain :size="16" class="text-success-green" /> 知识点
        </h3>
        <div v-if="knowledge.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">
          <Brain :size="28" class="mx-auto mb-2 text-apple-gray-300" />
          <p>暂无知识点</p>
        </div>
        <div v-else class="space-y-2 max-h-60 overflow-y-auto">
          <div v-for="(item, i) in knowledge.slice(0, 10)" :key="i" class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
            <p class="text-xs font-medium truncate">{{ (item as Record<string, unknown>).content || '-' }}</p>
            <span class="text-xs text-apple-gray-400">{{ (item as Record<string, unknown>).category || '-' }}</span>
          </div>
        </div>
      </div>

      <!-- Insights -->
      <div class="block-card rounded-2xl p-6">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <Lightbulb :size="16" class="text-warning-orange" /> 洞察发现
        </h3>
        <div v-if="insights.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">
          <Lightbulb :size="28" class="mx-auto mb-2 text-apple-gray-300" />
          <p>暂无洞察</p>
        </div>
        <div v-else class="space-y-2 max-h-60 overflow-y-auto">
          <div v-for="(item, i) in insights.slice(0, 10)" :key="i" class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
            <p class="text-xs font-medium truncate">{{ (item as Record<string, unknown>).content || '-' }}</p>
            <span class="text-xs text-apple-gray-400">{{ (item as Record<string, unknown>).type || '-' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
