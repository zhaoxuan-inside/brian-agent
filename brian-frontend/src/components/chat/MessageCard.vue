<script setup lang="ts">
import { ref, computed } from 'vue'
import { Pin, PinOff, ChevronDown, CornerUpRight, AlertCircle, Copy, Check, Brain, Gauge, Star } from '@lucide/vue'
import { copyToClipboard } from '@/utils/clipboard'
import { renderMarkdown } from '@/utils/markdown'
import { useChatUiStore } from '@/stores/chatUi'
import { formatTime as sharedFormatTime } from '../../utils/format'
import { feedbackApi } from '@/api'

const props = withDefaults(
  defineProps<{
    id: string
    infoId?: string
    role?: string
    content: string
    summary?: string
    timestamp: number
    pin?: boolean
    selected?: boolean
    citedCount?: number
    citingCount?: number
    citedInfoIds?: string[]
    citingInfoIds?: string[]
    traceId?: string
    workId?: string
    runId?: string
    sessionId?: string
    mode?: 'map' | 'timeline'
    active?: boolean
    nodeMap?: Map<string, { summary?: string; info?: string }>
    isStreaming?: boolean
  }>(),
  {
    infoId: '',
    role: 'assistant',
    summary: '',
    pin: false,
    selected: false,
    citedCount: 0,
    citingCount: 0,
    citedInfoIds: () => [],
    citingInfoIds: () => [],
    traceId: '',
    workId: '',
    runId: '',
    sessionId: '',
    mode: 'timeline',
    active: false,
    nodeMap: undefined,
    isStreaming: false,
  },
)

const emit = defineEmits<{
  (e: 'toggleSelect', id: string): void
  (e: 'togglePin', id: string): void
  (e: 'clickCard', id: string): void
  (e: 'jumpTo', id: string): void
  (e: 'showThinking', id: string): void
  (e: 'showEval', id: string): void
}>()

const chatUi = useChatUiStore()

const expandedCiting = ref(false)
const expandedCited = ref(false)
const copied = ref(false)

const feedbackRating = ref(0)
const feedbackHovered = ref(0)
const feedbackSubmitted = ref(false)

async function submitRating(score: number) {
  if (feedbackSubmitted.value) return
  feedbackRating.value = score
  try {
    await feedbackApi.submit({
      rating: score,
      run_id: props.runId || undefined,
      work_id: props.workId || undefined,
      session_id: props.sessionId || undefined,
    })
    feedbackSubmitted.value = true
  } catch { feedbackRating.value = 0 }
}

// 摘要/原文折叠状态：默认态由 mode 决定（Map 展开摘要折叠原文，Timeline 展开原文折叠摘要），用户可手动切换
const summaryOpen = ref(props.mode === 'map')
const contentOpen = ref(props.mode === 'timeline')

function onSummaryToggle(e: Event) {
  summaryOpen.value = (e.target as HTMLDetailsElement).open
}

function onContentToggle(e: Event) {
  contentOpen.value = (e.target as HTMLDetailsElement).open
}

const targetId = computed(() => props.infoId || props.id)

const isUser = computed(() => props.role === 'user' || props.role === 'USER' || props.role === 'REQUEST')
const isError = computed(() => props.content.startsWith('[错误]') || props.summary.startsWith('[错误]'))

// 消息内容按 Markdown 渲染（流式期间使用纯文本渲染以避免 O(n²) 解析成本）
const renderedContent = computed(() => {
  if (props.isStreaming) {
    return props.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  }
  return renderMarkdown(props.content)
})

// 摘要按 Markdown 渲染（无摘要时回退原文）
const renderedSummary = computed(() => {
  const raw = props.summary || props.content || ''
  return raw.trim() ? renderMarkdown(raw) : '(无内容)'
})

const effectiveTraceId = computed(() => props.traceId || '')

const textLength = computed(() => props.content ? props.content.length : 0)

const effectiveCitedCount = computed(() => {
  if (props.citedCount && props.citedCount > 0) return props.citedCount
  return props.citedInfoIds?.length ?? 0
})

const effectiveCitingCount = computed(() => {
  return props.citingCount ?? props.citingInfoIds?.length ?? 0
})

function formatTime(ts: number) {
  if (props.mode === 'map') return sharedFormatTime(ts)
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getSummary(cid: string): string {
  if (props.nodeMap?.has(cid)) {
    const n = props.nodeMap.get(cid)
    if (n?.summary) return n.summary
    if (n?.info) return n.info.slice(0, 24)
  }
  return cid.slice(0, 8)
}

function handleSelect() {
  emit('toggleSelect', targetId.value)
}

function handlePin() {
  emit('togglePin', targetId.value)
}

function handleCardClick() {
  emit('clickCard', targetId.value)
}

function handleJump(cid: string) {
  expandedCiting.value = false
  expandedCited.value = false
  emit('jumpTo', cid)
}

function handleShowThinking(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement | null
  if (el) {
    const r = el.getBoundingClientRect()
    chatUi.setThinkingOrigin({ left: r.left, top: r.top, width: r.width, height: r.height })
  }
  emit('showThinking', targetId.value)
}

function handleShowEval() {
  emit('showEval', targetId.value)
}

async function copyTraceId() {
  const tid = effectiveTraceId.value
  if (!tid) return
  const success = await copyToClipboard(tid)
  if (success) {
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  }
}
</script>

<template>
  <div
    class="message-card transition-all duration-200 cursor-pointer select-text"
    :class="[
      mode === 'map' ? 'rounded-lg border bg-white/95 dark:bg-apple-gray-800/95 shadow-sm text-xs' : 'rounded-2xl px-3 py-2.5',
      mode === 'map'
        ? (isError
            ? 'border-error-red/50 bg-red-50/50 dark:bg-red-950/30'
            : (isUser ? 'border-brian-blue/40' : 'border-apple-gray-200 dark:border-apple-gray-700'))
        : (isError ? 'block-card border-error-red/40 bg-error-red/5 text-error-red' : 'block-card'),
      active ? 'ring-2 ring-brian-blue shadow-lg border-brian-blue' : (mode === 'map' ? 'hover:border-brian-blue/60' : '')
    ]"
    @click="handleCardClick"
  >
    <!-- 顶部栏：时间居左，错误标识 + 复选框 + 钉住按钮居右 -->
    <div
      class="flex items-center justify-between mb-1 text-[10px]"
      :class="mode === 'map' ? 'px-2 pt-1.5' : ''"
    >
      <span class="text-apple-gray-400">
        {{ formatTime(timestamp) }}
      </span>

      <div class="flex items-center gap-1.5">
        <AlertCircle v-if="isError" :size="12" class="text-error-red flex-shrink-0" title="执行出错" />

        <label class="flex items-center cursor-pointer" title="勾选以指定本次问答上下文" @click.stop>
          <input
            type="checkbox"
            class="rounded cursor-pointer h-3.5 w-3.5 accent-brian-blue"
            :checked="selected"
            @change="handleSelect"
          />
        </label>

        <button
          class="p-0.5 rounded transition-colors text-apple-gray-400 hover:text-brian-blue"
          :class="pin ? 'text-warning-orange' : ''"
          :title="pin ? '取消钉住' : '钉住'"
          @click.stop="handlePin"
        >
          <component :is="pin ? Pin : PinOff" :size="12" />
        </button>
      </div>
    </div>

    <!-- 内容展示：摘要 + 原文双区（结构统一，均支持折叠/展开，均渲染 Markdown）。
         Map 模式：默认展开摘要、折叠原文；Timeline 模式：默认展开原文、折叠摘要。差异仅由 mode 样式覆盖区分。 -->
    <div class="space-y-0.5">
      <!-- 摘要区 -->
      <details
        class="px-2 py-0.5"
        :class="isError ? 'text-error-red' : 'text-apple-gray-500 dark:text-apple-gray-400'"
        :open="summaryOpen"
        @toggle="onSummaryToggle"
        @click.stop
      >
        <summary class="cursor-pointer text-[10px] font-medium select-none">
          <span class="inline-block transition-transform duration-150" :class="summaryOpen ? 'rotate-90' : ''">▸</span>
          摘要
        </summary>
        <div
          class="markdown-body break-words max-h-[120px] overflow-y-auto"
          :class="mode === 'map'
            ? 'text-xs text-apple-gray-700 dark:text-apple-gray-200'
            : 'text-[11px] text-apple-gray-600 dark:text-apple-gray-300'"
          v-html="renderedSummary"
        />
      </details>

      <!-- 原文区 -->
      <details
        class="px-2 py-0.5"
        :open="contentOpen"
        @toggle="onContentToggle"
        @click.stop
      >
        <summary class="cursor-pointer text-[10px] font-medium select-none">
          <span class="inline-block transition-transform duration-150" :class="contentOpen ? 'rotate-90' : ''">▸</span>
          原文
        </summary>
        <div
          class="markdown-body break-words overflow-y-auto"
            :class="mode === 'map' ? 'text-[11px] max-h-[120px]' : 'text-sm'"
          v-html="renderedContent"
        />
      </details>
    </div>

    <!-- 底部栏：引用/被引用胶囊、复制TraceId与字数统计 -->
    <div
      class="flex items-center gap-1.5 mt-1.5 flex-wrap"
      :class="mode === 'map' ? 'px-2 pb-1.5' : ''"
    >
      <button
        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-colors bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20"
        @click.stop="expandedCited = !expandedCited; if (expandedCited) expandedCiting = false"
      >
        引用 {{ effectiveCitedCount }}
        <ChevronDown :size="10" :class="expandedCited ? 'rotate-180' : ''" />
      </button>

      <button
        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-colors bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-300 hover:bg-apple-gray-200"
        @click.stop="expandedCiting = !expandedCiting; if (expandedCiting) expandedCited = false"
      >
        被引用 {{ effectiveCitingCount }}
        <ChevronDown :size="10" :class="expandedCiting ? 'rotate-180' : ''" />
      </button>

      <button
        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-colors bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20"
        title="查看思考过程"
        :data-thinking-id="targetId"
        @click.stop="handleShowThinking"
      >
        <Brain :size="10" />
        思考过程
      </button>

      <button
        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] transition-colors bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/60"
        title="查看评估结果"
        @click.stop="handleShowEval"
      >
        <Gauge :size="10" />
        评估结果
      </button>

      <!-- 反馈评分星星（仅系统回复显示） -->
      <template v-if="!isUser">
        <div v-if="feedbackSubmitted" class="flex items-center gap-0.5">
          <span
            v-for="i in 5"
            :key="i"
            :class="feedbackRating >= i ? 'text-warning-orange' : 'text-apple-gray-300'"
          >
            <Star :size="11" :fill="feedbackRating >= i ? 'currentColor' : 'none'" />
          </span>
        </div>
        <div v-else class="flex items-center gap-0.5">
          <button
            v-for="i in 5"
            :key="i"
            class="p-0 transition-colors"
            :class="(feedbackHovered || feedbackRating) >= i ? 'text-warning-orange' : 'text-apple-gray-300'"
            :title="`${i} 星`"
            @click.stop="submitRating(i)"
            @mouseenter="feedbackHovered = i"
            @mouseleave="feedbackHovered = 0"
          >
            <Star :size="11" :fill="(feedbackHovered || feedbackRating) >= i ? 'currentColor' : 'none'" />
          </button>
        </div>
      </template>

      <button
        class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors text-apple-gray-400 hover:text-brian-blue hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700"
        :title="effectiveTraceId ? `复制 TraceId: ${effectiveTraceId}` : '复制 TraceId'"
        @click.stop="copyTraceId"
      >
        <component :is="copied ? Check : Copy" :size="10" />
        {{ copied ? '已复制' : '复制 TraceId' }}
      </button>

      <span class="ml-auto text-[10px] text-apple-gray-300">
        {{ textLength }}字
      </span>
    </div>

    <!-- 展开：引用列表 -->
    <div
      v-if="expandedCited"
      class="mt-1.5 space-y-0.5 border-t pt-1"
      :class="[
        mode === 'map' ? 'px-2 pb-1.5 border-apple-gray-100 dark:border-apple-gray-700' : 'border-current/10',
      ]"
      @click.stop
    >
      <p class="text-[10px] font-medium text-apple-gray-400">引用以下消息：</p>
      <button
        v-for="cid in citedInfoIds"
        :key="cid"
        class="flex items-center gap-1 w-full text-left text-[11px] truncate py-0.5 rounded px-1 hover:bg-brian-blue/5 text-brian-blue"
        @click.stop="handleJump(cid)"
      >
        <CornerUpRight :size="10" class="flex-shrink-0" />
        <span class="truncate">{{ getSummary(cid) }}</span>
      </button>
      <p v-if="!citedInfoIds?.length" class="text-[10px] opacity-60">无引用消息</p>
    </div>

    <!-- 展开：被引用列表 -->
    <div
      v-if="expandedCiting"
      class="mt-1.5 space-y-0.5 border-t pt-1"
      :class="[
        mode === 'map' ? 'px-2 pb-1.5 border-apple-gray-100 dark:border-apple-gray-700' : 'border-current/10',
      ]"
      @click.stop
    >
      <p class="text-[10px] font-medium text-apple-gray-400">被以下消息引用：</p>
      <button
        v-for="cid in citingInfoIds"
        :key="cid"
        class="flex items-center gap-1 w-full text-left text-[11px] truncate py-0.5 rounded px-1 hover:bg-brian-blue/5 text-brian-blue"
        @click.stop="handleJump(cid)"
      >
        <CornerUpRight :size="10" class="flex-shrink-0" />
        <span class="truncate">{{ getSummary(cid) }}</span>
      </button>
      <p v-if="!citingInfoIds?.length" class="text-[10px] opacity-60">无被引用记录</p>
    </div>

    <!-- ===== 原始代码（保留作为参考）：Timeline 模式下的引用消息胶囊快捷展示（与上方"引用"折叠按钮重复，已移除）=====
    <div v-if="mode === 'timeline' && citedInfoIds?.length" class="mt-1.5 flex flex-wrap gap-1" @click.stop>
      <span
        v-for="cid in citedInfoIds"
        :key="cid"
        class="px-2 py-0.5 text-[10px] rounded-full cursor-pointer transition-colors bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20"
        title="点击在对话列表中定位被引用的消息"
        @click.stop="handleJump(cid)"
      >
        引用: {{ getSummary(cid) }}
      </span>
    </div>
    -->
  </div>
</template>

<style scoped>
details summary::-webkit-details-marker { display: none; }
details summary::marker { content: ''; }
</style>
