<script setup lang="ts">
import { useI18nStore } from '@/stores/i18n'
import { ref, computed } from 'vue'
import { Pin, PinOff, ChevronDown, CornerUpRight, AlertCircle, Copy, Check, Brain, Gauge, Star, BookMarked, Loader2 } from '@lucide/vue'
import { copyToClipboard } from '@/utils/clipboard'
import { saveMarkdownFile, isUserCancelled } from '@/utils/fileSave'
import { renderMarkdown } from '@/utils/markdown'
import { useChatUiStore } from '@/stores/chatUi'
import { formatTime as sharedFormatTime } from '../../utils/format'
import { feedbackApi } from '@/api'

const i18nStore = useI18nStore()
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

const renderedContent = computed(() => {
  if (props.isStreaming) {
    return props.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  }
  return renderMarkdown(props.content)
})

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
  if (props.citingCount && props.citingCount > 0) return props.citingCount
  return props.citingInfoIds?.length ?? 0
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

const saveState = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')
let saveStateTimer: ReturnType<typeof setTimeout> | null = null

async function handleSaveToLibrary() {
  if (!props.content || saveState.value === 'saving') return
  saveState.value = 'saving'
  try {
    await saveMarkdownFile(props.content)
    saveState.value = 'saved'
  } catch (err) {
    if (isUserCancelled(err)) {
      saveState.value = 'idle'
      return
    }
    console.error('[MessageCard] save to library failed:', err)
    saveState.value = 'failed'
  } finally {
    if (saveState.value === 'saved' || saveState.value === 'failed') {
      if (saveStateTimer) clearTimeout(saveStateTimer)
      saveStateTimer = setTimeout(() => {
        saveState.value = 'idle'
        saveStateTimer = null
      }, 2000)
    }
  }
}
</script>

<template>
  <div
    class="message-card transition-all duration-200 cursor-pointer select-text"
    :class="[
      mode === 'map' ? 'rounded-chat-md border bg-chat-surface-2/95 border-chat-hairline text-xs' : 'chat-card px-3 py-2.5',
      mode === 'map'
        ? (isError
            ? 'border-chat-error/50 bg-chat-error/10'
            : (isUser ? 'border-chat-primary/40' : 'border-chat-hairline'))
        : (isError ? 'chat-card border-chat-error/40 bg-chat-error/5 text-chat-error' : 'chat-card'),
      active ? 'ring-2 ring-chat-primary border-chat-primary' : (mode === 'map' ? 'hover:border-chat-primary/60' : '')
    ]"
    @click="handleCardClick"
  >
    <div
      class="flex items-center justify-between mb-1 text-4xs"
      :class="mode === 'map' ? 'px-2 pt-1.5' : ''"
    >
      <span class="text-chat-ink-tertiary">
        {{ formatTime(timestamp) }}
      </span>

      <div class="flex items-center gap-1.5">
        <AlertCircle v-if="isError" :size="12" class="text-chat-error flex-shrink-0" title="执行出错" />

        <button
          class="p-0.5 rounded-chat-sm transition-colors flex-shrink-0"
          :class="saveState === 'saved'
            ? 'text-chat-success'
            : saveState === 'failed'
              ? 'text-chat-error'
              : 'text-chat-ink-tertiary hover:text-chat-primary-hover'"
          :title="i18nStore.t('chat.saveToLibrary')"
          :disabled="saveState === 'saving'"
          @click.stop="handleSaveToLibrary"
        >
          <Loader2 v-if="saveState === 'saving'" :size="12" class="animate-spin" />
          <Check v-else-if="saveState === 'saved'" :size="12" />
          <AlertCircle v-else-if="saveState === 'failed'" :size="12" />
          <BookMarked v-else :size="12" />
        </button>

        <label class="flex items-center cursor-pointer" title="勾选以指定本次问答上下文" @click.stop>
          <input
            type="checkbox"
            class="rounded-chat-xs cursor-pointer h-3.5 w-3.5 accent-chat-primary"
            :checked="selected"
            @change="handleSelect"
          />
        </label>

        <button
          class="p-0.5 rounded-chat-sm transition-colors text-chat-ink-tertiary hover:text-chat-warning"
          :class="pin ? 'text-chat-warning' : ''"
          :title="pin ? '取消钉住' : '钉住'"
          @click.stop="handlePin"
        >
          <component :is="pin ? Pin : PinOff" :size="12" />
        </button>
      </div>
    </div>

    <div class="space-y-0.5">
      <details
        class="px-2 py-0.5"
        :class="isError ? 'text-chat-error' : 'text-chat-ink-subtle'"
        :open="summaryOpen"
        @toggle="onSummaryToggle"
        @click.stop
      >
        <summary class="cursor-pointer text-4xs font-medium select-none">
          <span class="inline-block transition-transform duration-150" :class="summaryOpen ? 'rotate-90' : ''">▸</span>
          {{ i18nStore.t('msg.summary') }}
        </summary>
        <div
          class="markdown-body break-words max-h-[120px] overflow-y-auto"
          :class="mode === 'map'
            ? 'text-xs text-chat-ink-muted'
            : 'text-2xs text-chat-ink-subtle'"
          v-html="renderedSummary"
        />
      </details>

      <details
        class="px-2 py-0.5"
        :open="contentOpen"
        @toggle="onContentToggle"
        @click.stop
      >
        <summary class="cursor-pointer text-4xs font-medium select-none">
          <span class="inline-block transition-transform duration-150" :class="contentOpen ? 'rotate-90' : ''">▸</span>
          {{ i18nStore.t('msg.original') }}
        </summary>
        <div
          class="markdown-body break-words overflow-y-auto"
            :class="mode === 'map' ? 'text-2xs max-h-[120px]' : 'text-sm'"
          v-html="renderedContent"
        />
      </details>
    </div>

    <div
      class="flex items-center gap-1.5 mt-1.5 flex-wrap"
      :class="mode === 'map' ? 'px-2 pb-1.5' : ''"
    >
      <button
        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-chat-pill text-4xs transition-colors bg-chat-primary/10 text-chat-primary-hover hover:bg-chat-primary/20"
        @click.stop="expandedCited = !expandedCited; if (expandedCited) expandedCiting = false"
      >
        {{ i18nStore.t('msg.citing', { n: effectiveCitedCount }) }}
        <ChevronDown :size="10" :class="expandedCited ? 'rotate-180' : ''" />
      </button>

      <button
        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-chat-pill text-4xs transition-colors bg-chat-surface-3 text-chat-ink-muted hover:bg-chat-hairline-tertiary"
        @click.stop="expandedCiting = !expandedCiting; if (expandedCiting) expandedCited = false"
      >
        {{ i18nStore.t('msg.cited', { n: effectiveCitingCount }) }}
        <ChevronDown :size="10" :class="expandedCiting ? 'rotate-180' : ''" />
      </button>

      <button
        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-chat-pill text-4xs transition-colors bg-chat-primary/10 text-chat-primary-hover hover:bg-chat-primary/20"
        title="查看思考过程"
        :data-thinking-id="targetId"
        @click.stop="handleShowThinking"
      >
        <Brain :size="10" />
        {{ i18nStore.t('msg.thinking') }}
      </button>

      <button
        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-chat-pill text-4xs transition-colors bg-chat-warning/10 text-chat-warning hover:bg-chat-warning/20"
        title="查看评估结果"
        @click.stop="handleShowEval"
      >
        <Gauge :size="10" />
        {{ i18nStore.t('msg.eval') }}
      </button>

      <template v-if="!isUser">
        <div v-if="feedbackSubmitted" class="flex items-center gap-0.5">
          <span
            v-for="i in 5"
            :key="i"
            :class="feedbackRating >= i ? 'text-chat-warning' : 'text-chat-ink-tertiary'"
          >
            <Star :size="11" :fill="feedbackRating >= i ? 'currentColor' : 'none'" />
          </span>
        </div>
        <div v-else class="flex items-center gap-0.5">
          <button
            v-for="i in 5"
            :key="i"
            class="p-0 transition-colors"
            :class="(feedbackHovered || feedbackRating) >= i ? 'text-chat-warning' : 'text-chat-ink-tertiary'"
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
        class="flex items-center gap-1 px-1.5 py-0.5 rounded-chat-sm text-4xs transition-colors text-chat-ink-tertiary hover:text-chat-primary-hover hover:bg-chat-surface-3"
        :title="effectiveTraceId ? `${i18nStore.t('msg.copyTrace')}: ${effectiveTraceId}` : i18nStore.t('msg.copyTrace')"
        @click.stop="copyTraceId"
      >
        <component :is="copied ? Check : Copy" :size="10" />
        <span class="grid">
          <span class="col-start-1 row-start-1 whitespace-nowrap" :class="copied ? 'invisible' : ''">{{ i18nStore.t('msg.copyTrace') }}</span>
          <span class="col-start-1 row-start-1 whitespace-nowrap" :class="copied ? '' : 'invisible'">{{ i18nStore.t('msg.copied') }}</span>
        </span>
      </button>

      <span class="ml-auto text-4xs text-chat-ink-tertiary">
        {{ textLength }}字
      </span>
    </div>

    <div
      v-if="expandedCited"
      class="mt-1.5 space-y-0.5 border-t pt-1"
      :class="[
        mode === 'map' ? 'px-2 pb-1.5 border-chat-hairline' : 'border-chat-hairline',
      ]"
      @click.stop
    >
      <p class="text-4xs font-medium text-chat-ink-tertiary">引用以下消息：</p>
      <button
        v-for="cid in citedInfoIds"
        :key="cid"
        class="flex items-center gap-1 w-full text-left text-2xs truncate py-0.5 rounded-chat-sm px-1 hover:bg-chat-primary/10 text-chat-primary-hover"
        @click.stop="handleJump(cid)"
      >
        <CornerUpRight :size="10" class="flex-shrink-0" />
        <span class="truncate">{{ getSummary(cid) }}</span>
      </button>
      <p v-if="!citedInfoIds?.length" class="text-4xs opacity-60">无引用消息</p>
    </div>

    <div
      v-if="expandedCiting"
      class="mt-1.5 space-y-0.5 border-t pt-1"
      :class="[
        mode === 'map' ? 'px-2 pb-1.5 border-chat-hairline' : 'border-chat-hairline',
      ]"
      @click.stop
    >
      <p class="text-4xs font-medium text-chat-ink-tertiary">被以下消息引用：</p>
      <button
        v-for="cid in citingInfoIds"
        :key="cid"
        class="flex items-center gap-1 w-full text-left text-2xs truncate py-0.5 rounded-chat-sm px-1 hover:bg-chat-primary/10 text-chat-primary-hover"
        @click.stop="handleJump(cid)"
      >
        <CornerUpRight :size="10" class="flex-shrink-0" />
        <span class="truncate">{{ getSummary(cid) }}</span>
      </button>
      <p v-if="!citingInfoIds?.length" class="text-4xs opacity-60">无被引用记录</p>
    </div>

  </div>
</template>

<style scoped>
details summary::-webkit-details-marker { display: none; }
details summary::marker { content: ''; }
</style>
