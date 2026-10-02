<script setup lang="ts">
import { computed, ref } from 'vue'
import { X, Gauge, Loader2, Lightbulb, CircleCheck, CircleAlert, Copy, Check } from '@lucide/vue'
import { useChatUiStore } from '@/stores/chatUi'
import { copyToClipboard } from '@/utils/clipboard'
import { formatDateTime as formatTime } from '@/utils/format'

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
  // Linear 语义(ADR-014):优=success,中=primary,差=danger(无警示橙)
  if (score >= 80) return 'text-chat-success bg-chat-success/10'
  if (score >= 60) return 'text-chat-primary-hover bg-chat-primary/10'
  return 'text-chat-error bg-chat-error/10'
}


</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-modal-top flex items-center justify-center bg-black/60 backdrop-blur-[2px] theme-chat"
      @click.self="close"
    >
      <div class="bg-chat-surface-1 rounded-chat-lg shadow-[0_24px_64px_rgba(0,0,0,0.55)] border border-chat-hairline-strong w-full max-w-xl mx-4 overflow-hidden flex flex-col max-h-[80vh]">
        <div class="px-5 py-3.5 border-b border-chat-hairline flex items-center justify-between flex-shrink-0">
          <div class="flex items-center gap-2">
            <Gauge :size="16" class="text-chat-warning" />
            <h3 class="text-sm font-semibold tracking-tight text-chat-ink">评估结果</h3>
            <Loader2 v-if="loading" :size="13" class="animate-spin text-chat-warning" />
          </div>
          <button class="p-1 rounded-chat-md text-chat-ink-tertiary hover:bg-chat-surface-2 transition-colors" @click="close">
            <X :size="18" />
          </button>
        </div>

        <div class="px-5 py-4 flex-1 overflow-y-auto space-y-3">
          <div v-if="loading" class="flex flex-col items-center justify-center py-12 text-chat-warning space-y-3">
            <Loader2 :size="28" class="animate-spin" />
            <p class="text-sm">{{ error || '正在加载评估结果...' }}</p>
          </div>

          <div v-else-if="error" class="flex flex-col items-center justify-center py-12 text-chat-ink-subtle space-y-2">
            <CircleAlert :size="28" class="text-chat-hairline-strong" />
            <p class="text-sm">{{ error }}</p>
          </div>

          <template v-else-if="evaluation">
            <div class="flex items-center gap-2 text-xs text-chat-ink-tertiary">
              <span>{{ evaluation.agent_name || '进化 Agent (Evolutor)' }}</span>
              <span v-if="evaluation.elapsed_ms" class="font-mono">{{ evaluation.elapsed_ms }}ms</span>
              <span v-if="evaluation.created" class="ml-auto">{{ formatTime(evaluation.created) }}</span>
            </div>
            <div v-if="traceId" class="flex items-center gap-1 text-2xs text-chat-ink-tertiary font-mono">
              <span class="flex-shrink-0">TraceId:</span>
              <span class="truncate select-text">{{ traceId }}</span>
              <button
                class="flex-shrink-0 flex items-center gap-0.5 px-1 py-0.5 rounded-chat-sm text-xs text-chat-ink-tertiary hover:text-chat-primary-hover hover:bg-chat-surface-2 transition-colors"
                title="复制 TraceId"
                @click="copyTraceId"
              >
                <component :is="copied ? Check : Copy" :size="12" />
                {{ copied ? '已复制' : '复制' }}
              </button>
            </div>

            <template v-if="parsed">
              <div v-if="scoreEntries.length > 0" class="rounded-chat-md border border-chat-hairline overflow-hidden">
                <div class="px-3 py-2 bg-chat-surface-2 text-xs font-semibold text-chat-ink-muted border-b border-chat-hairline">
                  评分维度
                </div>
                <div class="divide-y divide-chat-hairline">
                  <div v-for="[key, val] in scoreEntries" :key="key" class="flex items-center justify-between px-3 py-2 text-xs">
                    <span class="text-chat-ink-muted capitalize">{{ key }}</span>
                    <span class="px-2 py-0.5 rounded-chat-sm font-mono font-bold" :class="scoreColor(val)">{{ val }}</span>
                  </div>
                </div>
              </div>

              <div v-if="suggestions.length > 0" class="rounded-chat-md border border-chat-hairline p-3 space-y-1.5">
                <div class="flex items-center gap-1.5 text-xs font-semibold text-chat-ink-muted">
                  <Lightbulb :size="13" class="text-chat-warning" />
                  <span>优化建议</span>
                </div>
                <ul class="space-y-1">
                  <li v-for="(s, i) in suggestions" :key="i" class="flex gap-1.5 text-xs text-chat-ink-muted">
                    <span class="text-chat-ink-tertiary">{{ i + 1 }}.</span>
                    <span>{{ s }}</span>
                  </li>
                </ul>
              </div>

              <div v-if="needOptimize !== null" class="flex items-center gap-1.5 text-xs font-medium" :class="needOptimize ? 'text-chat-warning' : 'text-chat-success'">
                <component :is="needOptimize ? CircleAlert : CircleCheck" :size="14" />
                <span>{{ needOptimize ? '建议优化' : '无需优化' }}</span>
              </div>
            </template>

            <div class="rounded-chat-md border border-chat-hairline p-3">
              <div class="text-xs font-semibold text-chat-ink-muted mb-1.5">原始评估结果</div>
              <pre class="text-2xs text-chat-ink-muted font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto leading-relaxed bg-chat-canvas border border-chat-hairline p-2.5 rounded-chat-sm">{{ evaluation.answer }}</pre>
            </div>
          </template>

          <div v-else class="flex flex-col items-center justify-center py-12 text-chat-ink-subtle space-y-2">
            <Gauge :size="28" class="text-chat-hairline-strong" />
            <p class="text-sm">暂无评估结果</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
