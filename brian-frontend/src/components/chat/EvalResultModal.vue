<script setup lang="ts">
import { computed, ref } from 'vue'
import { X, Gauge, Loader2, Lightbulb, CircleCheck, CircleAlert, Copy, Check } from '@lucide/vue'
import { useChatUiStore } from '@/stores/chatUi'
import { copyToClipboard } from '@/utils/clipboard'

const chatUi = useChatUiStore()

const visible = computed(() => chatUi.evalResultVisible)
const loading = computed(() => chatUi.evalResultLoading)
const error = computed(() => chatUi.evalResultError)
const evaluation = computed(() => chatUi.evalResult)
const traceId = computed(() => chatUi.evalTraceId)

const copied = ref(false)

interface EvalPayload {
  scores?: Record<string, number | string>
  suggestions?: string[]
  need_optimize?: boolean
  [key: string]: unknown
}

// 解析 answer JSON 字符串，失败时回退为 null（直接展示原始文本）
const parsed = computed<EvalPayload | null>(() => {
  const raw = evaluation.value?.answer ?? ''
  if (!raw.trim()) return null
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj as EvalPayload
  } catch { /* ignore */ }
  return null
})

const scoreEntries = computed<Array<[string, number]>>(() => {
  const scores = parsed.value?.scores
  if (!scores || typeof scores !== 'object') return []
  return Object.entries(scores)
    .filter(([, v]) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))
    .map(([k, v]) => [k, Number(v)] as [string, number])
})

const suggestions = computed<string[]>(() => {
  const s = parsed.value?.suggestions
  return Array.isArray(s) ? s.map(String) : []
})

const needOptimize = computed<boolean | null>(() => {
  const v = parsed.value?.need_optimize
  return typeof v === 'boolean' ? v : null
})

function close() {
  chatUi.closeEvalResult()
}

async function copyTraceId() {
  const tid = traceId.value
  if (!tid) return
  const success = await copyToClipboard(tid)
  if (success) {
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40'
  if (score >= 60) return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40'
  return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/40'
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      @click.self="close"
    >
      <div class="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 w-full max-w-xl mx-4 overflow-hidden flex flex-col max-h-[80vh]">
        <div class="px-5 py-3.5 border-b border-apple-gray-200 dark:border-apple-gray-700 flex items-center justify-between flex-shrink-0">
          <div class="flex items-center gap-2">
            <Gauge :size="16" class="text-amber-600 dark:text-amber-400" />
            <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">评估结果</h3>
            <Loader2 v-if="loading" :size="13" class="animate-spin text-amber-500" />
          </div>
          <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="close">
            <X :size="18" />
          </button>
        </div>

        <div class="px-5 py-4 flex-1 overflow-y-auto space-y-3">
          <div v-if="loading" class="flex flex-col items-center justify-center py-12 text-amber-600 dark:text-amber-400 space-y-3">
            <Loader2 :size="28" class="animate-spin" />
            <p class="text-sm">正在加载评估结果...</p>
          </div>

          <div v-else-if="error" class="flex flex-col items-center justify-center py-12 text-apple-gray-400 space-y-2">
            <CircleAlert :size="28" class="text-apple-gray-300" />
            <p class="text-sm">{{ error }}</p>
          </div>

          <template v-else-if="evaluation">
            <div class="flex items-center gap-2 text-xs text-apple-gray-400">
              <span>{{ evaluation.agent_name || '进化 Agent (Evolutor)' }}</span>
              <span v-if="evaluation.elapsed_ms" class="font-mono">{{ evaluation.elapsed_ms }}ms</span>
              <span v-if="evaluation.created" class="ml-auto">{{ formatTime(evaluation.created) }}</span>
            </div>
            <div v-if="traceId" class="flex items-center gap-1 text-[11px] text-apple-gray-400 font-mono">
              <span class="flex-shrink-0">TraceId:</span>
              <span class="truncate select-text">{{ traceId }}</span>
              <button
                class="flex-shrink-0 flex items-center gap-0.5 px-1 py-0.5 rounded text-xs text-apple-gray-400 hover:text-brian-blue hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
                title="复制 TraceId"
                @click="copyTraceId"
              >
                <component :is="copied ? Check : Copy" :size="12" />
                {{ copied ? '已复制' : '复制' }}
              </button>
            </div>

            <template v-if="parsed">
              <div v-if="scoreEntries.length > 0" class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden">
                <div class="px-3 py-2 bg-apple-gray-50 dark:bg-apple-gray-900/40 text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300 border-b border-apple-gray-200 dark:border-apple-gray-700">
                  评分维度
                </div>
                <div class="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/60">
                  <div v-for="[key, val] in scoreEntries" :key="key" class="flex items-center justify-between px-3 py-2 text-xs">
                    <span class="text-apple-gray-600 dark:text-apple-gray-300 capitalize">{{ key }}</span>
                    <span class="px-2 py-0.5 rounded-md font-mono font-bold" :class="scoreColor(val)">{{ val }}</span>
                  </div>
                </div>
              </div>

              <div v-if="suggestions.length > 0" class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-3 space-y-1.5">
                <div class="flex items-center gap-1.5 text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300">
                  <Lightbulb :size="13" class="text-amber-500" />
                  <span>优化建议</span>
                </div>
                <ul class="space-y-1">
                  <li v-for="(s, i) in suggestions" :key="i" class="flex gap-1.5 text-xs text-apple-gray-700 dark:text-apple-gray-200">
                    <span class="text-apple-gray-300">{{ i + 1 }}.</span>
                    <span>{{ s }}</span>
                  </li>
                </ul>
              </div>

              <div v-if="needOptimize !== null" class="flex items-center gap-1.5 text-xs font-medium" :class="needOptimize ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'">
                <component :is="needOptimize ? CircleAlert : CircleCheck" :size="14" />
                <span>{{ needOptimize ? '建议优化' : '无需优化' }}</span>
              </div>
            </template>

            <div class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-3">
              <div class="text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">原始评估结果</div>
              <pre class="text-[11px] text-apple-gray-800 dark:text-apple-gray-200 font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto leading-relaxed bg-apple-gray-50 dark:bg-apple-gray-900/50 p-2.5 rounded-lg">{{ evaluation.answer }}</pre>
            </div>
          </template>

          <div v-else class="flex flex-col items-center justify-center py-12 text-apple-gray-400 space-y-2">
            <Gauge :size="28" class="text-apple-gray-300" />
            <p class="text-sm">暂无评估结果</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
