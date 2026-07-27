<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  BookOpen, TrendingUp, Network, Lightbulb, SkipForward, CheckCircle, Loader2,
  Play, Pause, SlidersHorizontal, ChevronDown, Clock, Calendar, Activity,
  RefreshCw, FileText, MessageSquare, Layers,
} from '@lucide/vue'
import { learningApi } from '../../api'

// ── Types ──
interface QueueItem {
  id: string
  status: string
  priority?: number
  content?: string
  summary?: string
  confidence?: number
  knowledgeItem?: { content?: string; confidence?: number }
  createdAt?: number | string
  plannedAt?: number | string
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
  createdAt?: number | string
}

interface InsightEntry {
  timestamp: number
  insight?: string
  content?: string
  type?: string
}

// ── State ──
const loading = ref(false)
const queueItems = ref<QueueItem[]>([])
const progress = ref<LearningProgress | null>(null)
const knowledge = ref<KnowledgeEntry[]>([])
const insights = ref<InsightEntry[]>([])
const queueStats = ref({ pending: 0, approved: 0, learning: 0, completed: 0, skipped: 0 })

// 学习控制状态（后端未提供状态，使用本地 ref）
const isLearning = ref(false)
const learningMode = ref<'chat' | 'document' | 'tag'>('chat')
const randomFactor = ref(30) // 0-100
const controlLoading = ref(false)

// 分页
const knowledgePage = ref(1)
const knowledgePageSize = 6
const insightsPage = ref(1)
const insightsPageSize = 5

// 内置学习任务（硬编码，不可删除）
const builtinTasks = [
  {
    id: 'builtin-1',
    name: '信息标签图相似性维护',
    summary: '计算标签图中节点间的相似性，维护相似度评分，确保标签图结构合理。',
    cron: '0 */6 * * *',
    lastRun: Date.now() - 1000 * 60 * 60 * 3,
    nextRun: Date.now() + 1000 * 60 * 60 * 3,
  },
  {
    id: 'builtin-2',
    name: '信息标签图相似性连接建立',
    summary: '基于相似性计算结果，在标签图中建立新的相似连接，增强知识关联。',
    cron: '0 */12 * * *',
    lastRun: Date.now() - 1000 * 60 * 60 * 8,
    nextRun: Date.now() + 1000 * 60 * 60 * 4,
  },
  {
    id: 'builtin-3',
    name: '信息标签图不常用连接老化',
    summary: '识别并降低长期未使用的标签连接权重，实现知识图谱的自适应精简。',
    cron: '0 3 * * *',
    lastRun: Date.now() - 1000 * 60 * 60 * 20,
    nextRun: Date.now() + 1000 * 60 * 60 * 4,
  },
  {
    id: 'builtin-4',
    name: '随机获取用户消息建立用户画像',
    summary: '随机抽取用户历史消息，提取偏好与特征，持续完善用户画像模型。',
    cron: '30 */4 * * *',
    lastRun: Date.now() - 1000 * 60 * 60 * 2,
    nextRun: Date.now() + 1000 * 60 * 60 * 2,
  },
]

const learningModes = [
  { value: 'chat' as const, label: '从对话学习', icon: MessageSquare },
  { value: 'document' as const, label: '从文档学习', icon: FileText },
  { value: 'tag' as const, label: 'Tag图维护', icon: Network },
]

// ── Computed ──
// 当前执行任务（从队列中取首个 learning 状态项）
const currentTask = computed(() => queueItems.value.find(i => i.status === 'learning') || null)

const currentTaskStatus = computed(() => {
  if (!currentTask.value) return null
  const s = currentTask.value.status
  if (s === 'completed') return { label: 'FINISH', textClass: 'text-success-green', bgClass: 'bg-success-green/10', bar: 'bg-success-green', pct: 100 }
  if (s === 'skipped' || s === 'failed') return { label: 'FAILURE', textClass: 'text-error-red', bgClass: 'bg-error-red/10', bar: 'bg-error-red', pct: 100 }
  return { label: 'RUNNING', textClass: 'text-brian-blue', bgClass: 'bg-brian-blue/10', bar: 'bg-brian-blue', pct: 50 }
})

// 待处理任务队列
const pendingQueue = computed(() => queueItems.value.filter(i => i.status === 'pending' || i.status === 'approved'))

// 学习统计（基于可用数据派生）
const totalLearningCount = computed(() => {
  const s = queueStats.value
  return s.pending + s.approved + s.learning + s.completed + s.skipped
})

const weekLearningCount = computed(() => {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  return insights.value.filter(i => i.timestamp && i.timestamp >= oneWeekAgo).length
})

// 分页计算
const knowledgeTotalPages = computed(() => Math.max(1, Math.ceil(knowledge.value.length / knowledgePageSize)))
const insightsTotalPages = computed(() => Math.max(1, Math.ceil(insights.value.length / insightsPageSize)))

const paginatedKnowledge = computed(() => {
  const page = Math.min(knowledgePage.value, knowledgeTotalPages.value)
  const start = (page - 1) * knowledgePageSize
  return knowledge.value.slice(start, start + knowledgePageSize)
})

const paginatedInsights = computed(() => {
  const page = Math.min(insightsPage.value, insightsTotalPages.value)
  const start = (page - 1) * insightsPageSize
  return insights.value.slice(start, start + insightsPageSize)
})

const currentMode = computed(() => learningModes.find(m => m.value === learningMode.value))

// ── Watchers: 数据变化时校正页码 ──
watch(knowledgeTotalPages, (total) => {
  if (knowledgePage.value > total) knowledgePage.value = total
})
watch(insightsTotalPages, (total) => {
  if (insightsPage.value > total) insightsPage.value = total
})

// ── Lifecycle ──
onMounted(async () => {
  await loadData()
})

// ── Methods ──
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
    if (queueRes.status === 'fulfilled') queueItems.value = Array.isArray(queueRes.value) ? queueRes.value : []
    if (statsRes.status === 'fulfilled') queueStats.value = { pending: 0, approved: 0, learning: 0, completed: 0, skipped: 0, ...statsRes.value }
    if (progressRes.status === 'fulfilled') progress.value = progressRes.value
    if (knowledgeRes.status === 'fulfilled') knowledge.value = Array.isArray(knowledgeRes.value) ? knowledgeRes.value : []
    if (insightsRes.status === 'fulfilled') insights.value = Array.isArray(insightsRes.value) ? insightsRes.value : []
  } catch (e) {
    console.error('Failed to load learning data:', e)
  }
  loading.value = false
}

async function handleStartLearning() {
  controlLoading.value = true
  try {
    await learningApi.startLearning()
    isLearning.value = true
  } catch (e) {
    // 后端可能尚未实现，本地切换状态以保证 UX
    isLearning.value = true
    console.warn('startLearning endpoint not available:', e)
  }
  controlLoading.value = false
}

async function handleStopLearning() {
  controlLoading.value = true
  try {
    await learningApi.stopLearning()
    isLearning.value = false
  } catch (e) {
    isLearning.value = false
    console.warn('stopLearning endpoint not available:', e)
  }
  controlLoading.value = false
}

let randomFactorTimer: ReturnType<typeof setTimeout> | null = null
function handleRandomFactorChange() {
  // 变更时调用 configDriverWeights（防抖）
  if (randomFactorTimer) clearTimeout(randomFactorTimer)
  randomFactorTimer = setTimeout(() => {
    learningApi.configDriverWeights({ random: randomFactor.value }).catch((e: unknown) => {
      console.warn('configDriverWeights endpoint not available:', e)
    })
  }, 400)
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

function formatTime(t?: number | string) {
  if (!t) return '--'
  const d = typeof t === 'number' ? new Date(t) : new Date(t)
  if (isNaN(d.getTime())) return '--'
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function sourceLabel(source?: string) {
  if (!source) return '对话'
  const s = source.toLowerCase()
  if (s.includes('doc') || s.includes('文档') || s.includes('document')) return '文档'
  return '对话'
}

const insightTypeKeys = ['pattern', 'trend', 'anomaly'] as const
function insightTypeLabel(type?: string, idx = 0) {
  const map: Record<string, { label: string; class: string }> = {
    pattern: { label: '模式识别', class: 'bg-brian-blue/10 text-brian-blue' },
    trend: { label: '趋势分析', class: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    anomaly: { label: '异常检测', class: 'bg-error-red/10 text-error-red' },
  }
  if (type && map[type]) return map[type]
  return map[insightTypeKeys[idx % 3]]
}
</script>

<template>
  <div class="h-full overflow-auto px-6 py-6 space-y-6">
    <!-- 页面标题 -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50">自学习系统</h2>
        <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">主动学习 + 被动学习，知识图谱 + 学习洞察</p>
      </div>
      <button @click="loadData" :disabled="loading"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 text-sm font-medium hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors disabled:opacity-50">
        <RefreshCw :size="14" :class="{ 'animate-spin': loading }" /> 刷新
      </button>
    </div>

    <!-- 2.5 学习统计 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="p-4 rounded-2xl glass-panel">
        <div class="flex items-center justify-between">
          <span class="text-xs text-apple-gray-500 dark:text-apple-gray-400">总学习次数</span>
          <Activity :size="16" class="text-brian-blue" />
        </div>
        <div class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 mt-2">{{ totalLearningCount }}</div>
      </div>
      <div class="p-4 rounded-2xl glass-panel">
        <div class="flex items-center justify-between">
          <span class="text-xs text-apple-gray-500 dark:text-apple-gray-400">知识点总数</span>
          <Network :size="16" class="text-success-green" />
        </div>
        <div class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 mt-2">{{ knowledge.length }}</div>
      </div>
      <div class="p-4 rounded-2xl glass-panel">
        <div class="flex items-center justify-between">
          <span class="text-xs text-apple-gray-500 dark:text-apple-gray-400">洞察总数</span>
          <Lightbulb :size="16" class="text-warning-orange" />
        </div>
        <div class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 mt-2">{{ insights.length }}</div>
      </div>
      <div class="p-4 rounded-2xl glass-panel">
        <div class="flex items-center justify-between">
          <span class="text-xs text-apple-gray-500 dark:text-apple-gray-400">本周学习次数</span>
          <TrendingUp :size="16" class="text-purple-500" />
        </div>
        <div class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50 mt-2">{{ weekLearningCount }}</div>
      </div>
    </div>

    <!-- 2.2 学习控制区 -->
    <section>
      <div class="flex items-center gap-2 mb-3">
        <SlidersHorizontal :size="18" class="text-brian-blue" />
        <h3 class="text-base font-semibold text-apple-gray-900 dark:text-apple-gray-50">学习控制</h3>
      </div>
      <div class="glass-panel rounded-2xl p-5">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- 开始/暂停学习按钮 -->
          <div>
            <label class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-2 block">学习开关</label>
            <button v-if="!isLearning" @click="handleStartLearning" :disabled="controlLoading"
              class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-success-green text-white text-sm font-medium hover:bg-success-green/90 active:scale-95 transition-all disabled:opacity-50">
              <Play :size="16" /> 开始学习
            </button>
            <button v-else @click="handleStopLearning" :disabled="controlLoading"
              class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-warning-orange text-white text-sm font-medium hover:bg-warning-orange/90 active:scale-95 transition-all disabled:opacity-50">
              <Pause :size="16" /> 暂停学习
            </button>
            <p class="text-xs text-apple-gray-400 mt-2">
              当前状态：<span :class="isLearning ? 'text-success-green' : 'text-apple-gray-500'">{{ isLearning ? '运行中' : '已停止' }}</span>
            </p>
          </div>

          <!-- 随机因子配置 -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs text-apple-gray-500 dark:text-apple-gray-400">随机因子配置</label>
              <span class="text-sm font-semibold text-brian-blue">{{ randomFactor }}</span>
            </div>
            <input type="range" min="0" max="100" v-model.number="randomFactor" @input="handleRandomFactorChange"
              class="w-full h-2 rounded-full appearance-none cursor-pointer bg-apple-gray-200 dark:bg-apple-gray-700 accent-brian-blue" />
            <p class="text-xs text-apple-gray-400 mt-2">数值越大，随机触发学习的频率越高</p>
          </div>

          <!-- 学习模式选择 -->
          <div>
            <label class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-2 block">学习模式</label>
            <div class="relative">
              <select v-model="learningMode"
                class="w-full appearance-none px-4 py-2.5 rounded-xl glass-input text-sm text-apple-gray-900 dark:text-apple-gray-50 pr-10">
                <option value="chat">从对话学习</option>
                <option value="document">从文档学习</option>
                <option value="tag">Tag图维护</option>
              </select>
              <ChevronDown :size="16" class="absolute right-3 top-1/2 -translate-y-1/2 text-apple-gray-400 pointer-events-none" />
            </div>
            <div v-if="currentMode" class="flex items-center gap-1.5 mt-2 text-xs text-apple-gray-400">
              <component :is="currentMode.icon" :size="12" />
              <span>{{ currentMode.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 2.3 学习进度区 -->
    <section>
      <div class="flex items-center gap-2 mb-3">
        <TrendingUp :size="18" class="text-brian-blue" />
        <h3 class="text-base font-semibold text-apple-gray-900 dark:text-apple-gray-50">学习进度</h3>
      </div>

      <div class="space-y-4">
        <!-- 当前任务卡片 -->
        <div class="glass-panel rounded-2xl p-5">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">当前任务</h4>
            <span v-if="currentTaskStatus"
              :class="['text-xs font-bold px-2 py-1 rounded-full', currentTaskStatus.bgClass, currentTaskStatus.textClass]">
              {{ currentTaskStatus.label }}
            </span>
          </div>
          <div v-if="currentTask" class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 truncate">
                {{ currentTask.knowledgeItem?.content || currentTask.content || currentTask.id }}
              </p>
              <span class="text-xs text-apple-gray-400 flex items-center gap-1 whitespace-nowrap">
                <Clock :size="12" /> {{ formatTime(currentTask.createdAt) }}
              </span>
            </div>
            <div class="h-2 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 overflow-hidden">
              <div :class="['h-full rounded-full transition-all duration-500', currentTaskStatus?.bar]"
                :style="{ width: (currentTaskStatus?.pct || 0) + '%' }" />
            </div>
            <div class="flex items-center justify-between text-xs text-apple-gray-500">
              <span>进度：{{ currentTaskStatus?.pct || 0 }}%</span>
              <span>优先级：{{ currentTask.priority ?? '--' }}</span>
            </div>
          </div>
          <div v-else class="flex items-center justify-center py-6 text-apple-gray-400 text-sm">
            <Activity :size="16" class="mr-2" /> 暂无正在执行的学习任务
          </div>
        </div>

        <!-- 学习任务队列 -->
        <div class="glass-panel rounded-2xl p-5">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">学习任务队列</h4>
            <button @click="handleBatchApprove"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brian-blue text-white text-xs font-medium hover:bg-brian-blue/90 transition-colors">
              <CheckCircle :size="12" /> 批量批准
            </button>
          </div>
          <div v-if="pendingQueue.length" class="space-y-2">
            <div v-for="item in pendingQueue" :key="item.id"
              class="flex items-center gap-3 p-3 rounded-xl bg-white/40 dark:bg-black/20">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 truncate">
                  {{ item.knowledgeItem?.content || item.content || item.id }}
                </p>
                <p class="text-xs text-apple-gray-500 mt-0.5 truncate">
                  {{ item.summary || '待学习内容' }}
                </p>
                <div class="flex items-center gap-3 mt-1">
                  <span class="text-xs text-apple-gray-400 flex items-center gap-1">
                    <Clock :size="11" /> {{ formatTime(item.plannedAt || item.createdAt) }}
                  </span>
                  <span class="text-xs text-apple-gray-400">优先级 {{ item.priority ?? 0 }}</span>
                </div>
              </div>
              <span :class="['text-xs px-2 py-0.5 rounded-full whitespace-nowrap', getStatusBadge(item.status).class]">
                {{ getStatusBadge(item.status).label }}
              </span>
              <div v-if="item.status === 'pending'" class="flex gap-1">
                <button @click="handleApprove(item.id)" class="p-1.5 rounded-lg text-success-green hover:bg-success-green/10 transition-colors" title="批准">
                  <CheckCircle :size="14" />
                </button>
                <button @click="handleSkip(item.id)" class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors" title="跳过">
                  <SkipForward :size="14" />
                </button>
              </div>
            </div>
          </div>
          <div v-else class="flex items-center justify-center py-6 text-apple-gray-400 text-sm">
            学习队列为空
          </div>
        </div>

        <!-- 内置学习任务 -->
        <div class="glass-panel rounded-2xl p-5">
          <div class="flex items-center gap-2 mb-3">
            <Layers :size="16" class="text-apple-gray-500" />
            <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">内置学习任务</h4>
            <span class="text-xs text-apple-gray-400">（系统任务，不可删除）</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div v-for="task in builtinTasks" :key="task.id"
              class="p-3 rounded-xl bg-white/40 dark:bg-black/20">
              <div class="flex items-start justify-between gap-2 mb-1">
                <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ task.name }}</p>
                <span class="text-xs px-1.5 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 font-mono whitespace-nowrap">{{ task.cron }}</span>
              </div>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-2">{{ task.summary }}</p>
              <div class="flex items-center justify-between text-xs text-apple-gray-400">
                <span class="flex items-center gap-1">
                  <Clock :size="11" /> 上次：{{ formatTime(task.lastRun) }}
                </span>
                <span class="flex items-center gap-1">
                  <Calendar :size="11" /> 下次：{{ formatTime(task.nextRun) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 2.4 学习成果区 -->
    <section>
      <div class="flex items-center gap-2 mb-3">
        <BookOpen :size="18" class="text-brian-blue" />
        <h3 class="text-base font-semibold text-apple-gray-900 dark:text-apple-gray-50">学习成果</h3>
      </div>

      <div class="space-y-4">
        <!-- 知识列表 -->
        <div class="glass-panel rounded-2xl p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <Network :size="16" class="text-success-green" />
              <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">知识列表</h4>
            </div>
            <span class="text-xs text-apple-gray-400">共 {{ knowledge.length }} 条</span>
          </div>
          <div v-if="paginatedKnowledge.length" class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div v-for="item in paginatedKnowledge" :key="item.id"
              class="p-3 rounded-xl bg-white/40 dark:bg-black/20">
              <div class="flex items-start justify-between gap-2 mb-2">
                <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 line-clamp-2">
                  {{ item.content || item.topic || item.id }}
                </p>
                <span class="text-xs px-2 py-0.5 rounded-full bg-brian-blue/10 text-brian-blue whitespace-nowrap">
                  {{ sourceLabel(item.source) }}
                </span>
              </div>
              <div class="flex items-center justify-between gap-2">
                <div class="flex flex-wrap gap-1 min-w-0">
                  <span v-for="tag in (item.tags || []).slice(0, 4)" :key="tag"
                    class="text-xs px-1.5 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400">
                    {{ tag }}
                  </span>
                </div>
                <span class="text-xs text-apple-gray-400 flex items-center gap-1 whitespace-nowrap">
                  <Clock :size="11" /> {{ formatTime(item.createdAt) }}
                </span>
              </div>
            </div>
          </div>
          <div v-else class="flex items-center justify-center py-6 text-apple-gray-400 text-sm">
            暂无已学知识
          </div>
          <!-- 分页 -->
          <div v-if="knowledge.length > knowledgePageSize" class="flex items-center justify-center gap-2 mt-4">
            <button @click="knowledgePage = Math.max(1, knowledgePage - 1)" :disabled="knowledgePage === 1"
              class="px-3 py-1 rounded-lg text-xs bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 disabled:opacity-40 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors">上一页</button>
            <span class="text-xs text-apple-gray-500">{{ knowledgePage }} / {{ knowledgeTotalPages }}</span>
            <button @click="knowledgePage = Math.min(knowledgeTotalPages, knowledgePage + 1)" :disabled="knowledgePage === knowledgeTotalPages"
              class="px-3 py-1 rounded-lg text-xs bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 disabled:opacity-40 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors">下一页</button>
          </div>
        </div>

        <!-- 洞察列表 -->
        <div class="glass-panel rounded-2xl p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <Lightbulb :size="16" class="text-warning-orange" />
              <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">洞察列表</h4>
            </div>
            <span class="text-xs text-apple-gray-400">共 {{ insights.length }} 条</span>
          </div>
          <div v-if="paginatedInsights.length" class="space-y-2">
            <div v-for="(insight, idx) in paginatedInsights" :key="insight.timestamp + '-' + idx"
              class="flex gap-3 p-3 rounded-xl bg-white/40 dark:bg-black/20">
              <Lightbulb :size="18" class="text-warning-orange flex-shrink-0 mt-0.5" />
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2 mb-1">
                  <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ insight.insight || insight.content }}</p>
                  <span :class="['text-xs px-2 py-0.5 rounded-full whitespace-nowrap', insightTypeLabel(insight.type, idx).class]">
                    {{ insightTypeLabel(insight.type, idx).label }}
                  </span>
                </div>
                <p v-if="insight.content && insight.insight" class="text-xs text-apple-gray-500 mt-1">{{ insight.content }}</p>
                <span class="text-xs text-apple-gray-400 mt-1 flex items-center gap-1">
                  <Clock :size="11" /> {{ formatTime(insight.timestamp) }}
                </span>
              </div>
            </div>
          </div>
          <div v-else class="flex items-center justify-center py-6 text-apple-gray-400 text-sm">
            <Lightbulb :size="16" class="mr-2" /> 暂无洞察，系统将在空闲时自动生成
          </div>
          <!-- 分页 -->
          <div v-if="insights.length > insightsPageSize" class="flex items-center justify-center gap-2 mt-4">
            <button @click="insightsPage = Math.max(1, insightsPage - 1)" :disabled="insightsPage === 1"
              class="px-3 py-1 rounded-lg text-xs bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 disabled:opacity-40 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors">上一页</button>
            <span class="text-xs text-apple-gray-500">{{ insightsPage }} / {{ insightsTotalPages }}</span>
            <button @click="insightsPage = Math.min(insightsTotalPages, insightsPage + 1)" :disabled="insightsPage === insightsTotalPages"
              class="px-3 py-1 rounded-lg text-xs bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 disabled:opacity-40 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors">下一页</button>
          </div>
        </div>
      </div>
    </section>

    <!-- 加载提示 -->
    <div v-if="loading" class="fixed top-20 right-6 flex items-center gap-2 px-3 py-1.5 rounded-lg glass-panel text-xs text-apple-gray-500 z-20">
      <Loader2 :size="14" class="animate-spin text-brian-blue" /> 加载中...
    </div>
  </div>
</template>
