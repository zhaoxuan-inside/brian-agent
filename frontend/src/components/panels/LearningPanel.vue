<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { BookOpen, TrendingUp, Network, Lightbulb, SkipForward, CheckCircle, Loader2 } from '@lucide/vue'
import { learningApi } from '../../api'

interface QueueItem {
  id: string
  status: string
  priority?: number
  content?: string
  confidence?: number
  knowledgeItem?: { content?: string; confidence?: number }
}

interface LearningProgress {
  phases?: Array<{ status?: string; items?: unknown[] }>
}

interface KnowledgeEntry {
  id: string
  content?: string
  topic?: string
  source?: string
  tags: string[]
}

interface InsightEntry {
  timestamp: number
  insight?: string
  content?: string
}

const activeTab = ref<'queue' | 'progress' | 'knowledge' | 'insights'>('queue')
const queueItems = ref<QueueItem[]>([])
const progress = ref<LearningProgress | null>(null)
const knowledge = ref<KnowledgeEntry[]>([])
const insights = ref<InsightEntry[]>([])
const loading = ref(false)

const queueStats = ref({ pending: 0, approved: 0, learning: 0, completed: 0, skipped: 0 })

onMounted(async () => {
  await loadData()
})

async function loadData() {
  loading.value = true
  try {
    const [queueRes, statsRes, progressRes, knowledgeRes, insightsRes] = await Promise.allSettled([
      learningApi.getQueue().catch(() => []),
      learningApi.getQueueStats().catch(() => ({})),
      learningApi.getProgress().catch(() => null),
      learningApi.getKnowledge().catch(() => []),
      learningApi.getInsights().catch(() => []),
    ])
    if (queueRes.status === 'fulfilled') queueItems.value = queueRes.value
    if (statsRes.status === 'fulfilled') queueStats.value = { pending: 0, approved: 0, learning: 0, completed: 0, skipped: 0, ...statsRes.value }
    if (progressRes.status === 'fulfilled') progress.value = progressRes.value
    if (knowledgeRes.status === 'fulfilled') knowledge.value = Array.isArray(knowledgeRes.value) ? knowledgeRes.value : []
    if (insightsRes.status === 'fulfilled') insights.value = Array.isArray(insightsRes.value) ? insightsRes.value : []
  } catch (e) {
    console.error('Failed to load learning data:', e)
  }
  loading.value = false
}

async function handleApprove(id: string) {
  await learningApi.setPriority(id, 90)
  await loadData()
}

async function handleSkip(id: string) {
  await learningApi.skipTask(id)
  await loadData()
}

async function handleBatchApprove() {
  const ids = queueItems.value.filter(i => i.status === 'pending').map(i => i.id)
  if (ids.length === 0) return
  await learningApi.batchApprove(ids)
  await loadData()
}

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; class: string }> = {
    pending: { label: '待处理', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    approved: { label: '已批准', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    learning: { label: '学习中', class: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    completed: { label: '已完成', class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    skipped: { label: '已跳过', class: 'bg-apple-gray-100 text-apple-gray-600 dark:bg-apple-gray-800 dark:text-apple-gray-400' },
  }
  return map[status] || map.pending
}

const phaseLabels: Record<number, string> = { 1: 'Exploration 探索', 2: 'Comprehension 理解', 3: 'Application 应用', 4: 'Mastery 掌握' }
</script>

<template>
  <div class="h-full flex flex-col p-6 overflow-hidden">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50">自学习系统</h2>
        <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">被动学习 + 主动学习，知识图谱 + 学习进度</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-for="tab in [
            { id: 'queue', label: '学习队列', icon: BookOpen },
            { id: 'progress', label: '学习进度', icon: TrendingUp },
            { id: 'knowledge', label: '知识图谱', icon: Network },
            { id: 'insights', label: '洞察', icon: Lightbulb },
          ]" :key="tab.id"
          :class="[
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === tab.id
              ? 'bg-brian-blue text-white'
              : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
          ]"
          @click="activeTab = tab.id as any"
        >
          <component :is="tab.icon" :size="16" />
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <Loader2 :size="32" class="animate-spin text-brian-blue" />
    </div>

    <div v-else class="flex-1 overflow-auto">
      <!-- Queue -->
      <div v-if="activeTab === 'queue'">
        <div class="grid grid-cols-5 gap-3 mb-4">
          <div v-for="s in [
            { key: 'pending', label: '待处理', color: 'amber' },
            { key: 'approved', label: '已批准', color: 'blue' },
            { key: 'learning', label: '学习中', color: 'purple' },
            { key: 'completed', label: '已完成', color: 'emerald' },
            { key: 'skipped', label: '已跳过', color: 'gray' },
          ]" :key="s.key"
            class="p-3 rounded-xl glass-panel">
            <div class="text-2xl font-bold" :class="`text-${s.color}-500`">{{ (queueStats as any)[s.key] || 0 }}</div>
            <div class="text-xs text-apple-gray-500 mt-1">{{ s.label }}</div>
          </div>
        </div>

        <div class="flex gap-2 mb-4">
          <button @click="handleBatchApprove"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brian-blue text-white text-sm font-medium hover:bg-brian-blue/90 transition-colors">
            <CheckCircle :size="14" /> 批量批准
          </button>
          <button @click="loadData"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 text-sm font-medium hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors">
            刷新
          </button>
        </div>

        <div v-if="queueItems.length" class="space-y-2">
          <div v-for="item in queueItems" :key="item.id"
            class="flex items-center gap-4 p-3 rounded-xl glass-panel">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 truncate">
                {{ item.knowledgeItem?.content || item.content || item.id }}
              </p>
              <div class="flex items-center gap-2 mt-1">
                <span class="text-xs text-apple-gray-500">优先级: {{ item.priority }}</span>
                <span class="text-xs text-apple-gray-400">置信度: {{ (item.knowledgeItem?.confidence || item.confidence || 0).toFixed(2) }}</span>
              </div>
            </div>
            <span :class="['text-xs px-2 py-1 rounded-full', getStatusBadge(item.status).class]">
              {{ getStatusBadge(item.status).label }}
            </span>
            <div v-if="item.status === 'pending'" class="flex gap-1">
              <button @click="handleApprove(item.id)" class="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors" title="批准">
                <CheckCircle :size="16" />
              </button>
              <button @click="handleSkip(item.id)" class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors" title="跳过">
                <SkipForward :size="16" />
              </button>
            </div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-64 text-apple-gray-400">
          学习队列为空
        </div>
      </div>

      <!-- Progress -->
      <div v-if="activeTab === 'progress'" class="space-y-4">
        <div v-if="progress" class="space-y-4">
          <div class="grid grid-cols-4 gap-3">
            <div v-for="i in 4" :key="i"
              class="p-4 rounded-xl glass-panel">
              <div class="text-xs text-apple-gray-500 mb-1">Phase {{ i }}</div>
              <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ phaseLabels[i] }}</div>
              <div class="mt-2 h-2 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 overflow-hidden">
                <div class="h-full rounded-full bg-brian-blue transition-all"
                  :style="{ width: progress.phases?.[i-1]?.status === 'completed' ? '100%' : progress.phases?.[i-1]?.status === 'active' ? '50%' : '0%' }" />
              </div>
              <div class="text-xs text-apple-gray-500 mt-1">
                {{ progress.phases?.[i-1]?.items?.length || 0 }} 项
              </div>
            </div>
          </div>

          <div class="p-4 rounded-xl glass-panel">
            <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mb-3">学习来源分布</h4>
            <div class="space-y-2">
              <div v-for="source in [
                { label: '图连通性驱动', pct: 40, color: 'bg-blue-500' },
                { label: '节点激活驱动', pct: 40, color: 'bg-purple-500' },
                { label: '近期输入驱动', pct: 20, color: 'bg-emerald-500' },
              ]" :key="source.label"
                class="flex items-center gap-3">
                <span class="text-xs text-apple-gray-600 dark:text-apple-gray-400 w-28">{{ source.label }}</span>
                <div class="flex-1 h-2 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 overflow-hidden">
                  <div :class="['h-full rounded-full', source.color]" :style="{ width: source.pct + '%' }" />
                </div>
                <span class="text-xs text-apple-gray-500 w-10 text-right">{{ source.pct }}%</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-64 text-apple-gray-400">
          暂无学习进度数据
        </div>
      </div>

      <!-- Knowledge Graph -->
      <div v-if="activeTab === 'knowledge'" class="space-y-4">
        <div v-if="knowledge.length" class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div v-for="item in knowledge" :key="item.id"
            class="p-4 rounded-xl glass-panel">
            <div class="flex items-start justify-between mb-2">
              <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">
                {{ item.content || item.topic || item.id }}
              </h4>
              <span class="text-xs px-2 py-0.5 rounded-full bg-brian-blue/10 text-brian-blue">
                {{ item.source || '被动学习' }}
              </span>
            </div>
            <div v-if="item.tags?.length" class="flex flex-wrap gap-1">
              <span v-for="tag in item.tags" :key="tag"
                class="text-xs px-2 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400">
                {{ tag }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-64 text-apple-gray-400">
          暂无已学知识
        </div>
      </div>

      <!-- Insights -->
      <div v-if="activeTab === 'insights'" class="space-y-3">
        <div v-if="insights.length" class="space-y-3">
          <div v-for="insight in insights" :key="insight.timestamp"
            class="flex gap-3 p-4 rounded-xl glass-panel">
            <Lightbulb :size="20" class="text-amber-500 flex-shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ insight.insight || insight.content }}</p>
              <p class="text-xs text-apple-gray-500 mt-1">{{ insight.content }}</p>
              <span class="text-xs text-apple-gray-400 mt-2 block">
                {{ new Date(insight.timestamp).toLocaleString() }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-64 text-apple-gray-400">
          <div class="text-center">
            <Lightbulb :size="32" class="mx-auto mb-2 text-apple-gray-300" />
            <p>暂无洞察，系统将在空闲时自动生成</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>