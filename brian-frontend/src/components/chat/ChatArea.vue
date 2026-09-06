<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  MessageCircle,
  Loader2,
  Brain,
  UserRound,
} from '@lucide/vue'
import { useSessionStore } from '@/stores/session'
import { useChatUiStore } from '@/stores/chatUi'
import { chatApi } from '@/api'
import type { ChatMessage, Block } from '@/api/types'
import ChatMap from './ChatMap.vue'
import InputBox from './InputBox.vue'
import MessageCard from './MessageCard.vue'
import BlockRenderer from '@/components/blocks/BlockRenderer.vue'
import ThinkingModal from './ThinkingModal.vue'
import EvalResultModal from './EvalResultModal.vue'
import IntentConfirmCard from './IntentConfirmCard.vue'
import { useChatStream } from '@/composables/useChatStream'

const sessionStore = useSessionStore()
const chatUi = useChatUiStore()
const {
  confirmingIntent,
  handleSend,
  handleIntentConfirm,
} = useChatStream()

const leftWidth = computed(() => `${sessionStore.splitRatio * 100}%`)
const rightWidth = computed(() => `${(1 - sessionStore.splitRatio) * 100}%`)
const isDragging = ref(false)
const listRef = ref<HTMLDivElement | null>(null)

// ===== 引用计数辅助：优先取 ChatMap 节点上的计数/引用清单，缺失时回退消息自身字段 =====
const nodeMap = computed(() => {
  const m = new Map<string, { summary: string; pin: boolean; citingCount: number; citedCount: number; citingInfoIds: string[]; citedInfoIds: string[] }>()
  for (const n of sessionStore.chatMapNodes) {
    m.set(n.infoId, { summary: n.summary, pin: n.pin, citingCount: n.citingCount, citedCount: n.citedCount, citingInfoIds: n.citingInfoIds, citedInfoIds: n.citedInfoIds })
  }
  return m
})

function nodeOf(msg: ChatMessage) {
  return nodeMap.value.get(msg.id)
}

function getCitedCount(msg: ChatMessage): number {
  const fromNode = nodeOf(msg)?.citedCount
  if (fromNode !== undefined && fromNode > 0) return fromNode
  return getCitedIds(msg).length
}

function getCitingCount(msg: ChatMessage): number {
  const fromNode = nodeOf(msg)?.citingCount
  if (fromNode !== undefined && fromNode > 0) return fromNode
  return msg.citingCount ?? 0
}

function getCitedIds(msg: ChatMessage): string[] {
  const nodeIds = nodeOf(msg)?.citedInfoIds
  if (nodeIds && nodeIds.length > 0) return nodeIds
  if (msg.citedInfoIds && msg.citedInfoIds.length > 0) return msg.citedInfoIds
  if (msg.citingIds && msg.citingIds.length > 0) return msg.citingIds
  return []
}

function getCitingIds(msg: ChatMessage): string[] {
  const nodeIds = nodeOf(msg)?.citingInfoIds
  if (nodeIds && nodeIds.length > 0) return nodeIds
  if (msg.citingInfoIds && msg.citingInfoIds.length > 0) return msg.citingInfoIds
  return []
}

// ChatMap 点击节点 -> 滚动列表使该消息居中
watch(() => sessionStore.focusInfoId, async (id) => {
  if (!id) return
  await nextTick()
  const el = listRef.value?.querySelector(`[data-info-id="${id}"]`) as HTMLElement | null
  if (!el || !listRef.value) return
  const listRect = listRef.value.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  listRef.value.scrollTop += elRect.top - listRect.top - listRect.height / 2 + elRect.height / 2
})

// 需求确认 / 需求补充卡片出现时滚动到底部，确保表单可见可交互
watch(
  () => [chatUi.intentConfirmation, chatUi.clarificationRequest],
  async ([intent, clarify]) => {
    if (!intent && !clarify) return
    await nextTick()
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  },
)

function scrollListTo(id: string) {
  sessionStore.triggerFocus(id)
}

function centerMapOn(id: string) {
  sessionStore.triggerCenter(id)
}

function togglePin(id: string) {
  sessionStore.togglePin(id)
}

function jumpTo(id: string) {
  scrollListTo(id)
}

// 思考过程独立按模块并发加载（DAG 与 ThinkingBlocks 独立请求并渐进式展示）
async function showThinking(id: string) {
  // 1. 立即打开弹窗并展示"正在加载思考过程..."动态加载态，避免静态空白卡顿
  chatUi.startThinkingLoading(id)

  // 2. 模块独立加载：DAG 图与思考块独立请求并回调更新
  const dagPromise = chatApi.thinking(id, 'dag')
    .then(res => chatUi.setThinkingDag(res.dag ?? null))
    .catch(() => chatUi.setThinkingDag(null))

  const blocksPromise = chatApi.thinking(id, 'blocks')
    .then(res => chatUi.setThinkingBlocks(res.blocks ?? []))
    .catch(() => chatUi.setThinkingBlocks([]))

  await Promise.allSettled([dagPromise, blocksPromise])
}

type TimelineEntry =
  | { kind: 'message'; key: string; sort: number; message: ChatMessage }
  | { kind: 'block'; key: string; sort: number; block: Block }

// timeline 实现：确保思考 Blocks 严格按创建/执行先后顺序在用户提问之后、最终回复之前正确排列
const timeline = computed<TimelineEntry[]>(() => {
  const entries: TimelineEntry[] = []
  for (const m of sessionStore.messages) {
    entries.push({ kind: 'message', key: `m-${m.id}`, sort: m.timestamp, message: m })
  }
  for (const b of sessionStore.blocks) {
    entries.push({ kind: 'block', key: `b-${b.id}`, sort: b.meta.createdAt || Date.now(), block: b })
  }
  entries.sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort
    // 同一时间戳内：用户消息(USER) < 思考Block(Thinking) < 最终回复消息(ASSISTANT)
    if (a.kind !== b.kind) {
      if (a.kind === 'message' && a.message.role === 'user') return -1
      if (b.kind === 'message' && b.message.role === 'user') return 1
      if (a.kind === 'block') return -1
      if (b.kind === 'block') return 1
    }
    return a.key.localeCompare(b.key)
  })
  return entries
})

function startResize(e: MouseEvent) {
  e.preventDefault()
  isDragging.value = true
  const onMove = (ev: MouseEvent) => {
    const container = (e.target as HTMLElement).closest('.chat-area') as HTMLElement
    if (!container) return
    const rect = container.getBoundingClientRect()
    const ratio = (ev.clientX - rect.left) / rect.width
    sessionStore.setSplitRatio(ratio)
  }
  const onUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<template>
  <div class="chat-area flex flex-1 overflow-hidden" :class="{ 'select-none': isDragging }">
    <!-- Left: ChatMap -->
    <div class="flex-shrink-0 h-full overflow-hidden" :style="{ width: leftWidth }">
      <ChatMap />
    </div>

    <!-- Resizable Divider -->
    <div
      class="w-1.5 cursor-col-resize bg-apple-gray-100 dark:bg-apple-gray-800 hover:bg-brian-blue/50 transition-colors relative group flex-shrink-0"
      @mousedown="startResize"
    >
      <div class="absolute inset-y-0 -left-1 -right-1" />
    </div>

    <!-- Right: Conversation Panel -->
    <div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden" :style="{ width: rightWidth }">
      <div ref="listRef" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div v-if="!sessionStore.currentSessionId && sessionStore.messages.length === 0" class="flex flex-col items-center justify-center h-full text-apple-gray-400">
          <MessageCircle :size="48" class="mb-4 text-apple-gray-300" />
          <p class="text-lg font-medium">Brian Agent</p>
          <p class="text-sm mt-1">开始一段对话</p>
        </div>

        <template v-for="entry in timeline" :key="entry.key">
          <div
            v-if="entry.kind === 'message'"
            class="flex items-start gap-2"
            :class="entry.message.role === 'user' ? 'justify-start' : 'justify-end'"
            :data-info-id="entry.message.id"
          >
            <!-- 用户消息：靠左，头像在消息框左侧 -->
            <div v-if="entry.message.role === 'user'" class="flex-shrink-0 w-8 h-8 rounded-full bg-brian-blue/15 text-brian-blue flex items-center justify-center mt-1">
              <UserRound :size="16" />
            </div>

            <div class="max-w-[85%] min-w-0">
              <!-- ===== 原始展示（保留参考）：对话区消息上方渲染长程多 Agent 协同依赖 DAG 网络（Planning 策略拆解卡片） =====
              <AgentDagFlow v-if="entry.message.agentDag" :dag="entry.message.agentDag" />
              -->

              <!-- ===== 修改后：对话区不展示 Planning 策略拆解（AgentDagFlow），拆解仅在"思考过程"弹窗内展示 ===== -->

              <MessageCard
                :id="entry.message.id"
                :info-id="entry.message.id"
                :role="entry.message.role"
                :content="entry.message.content"
                :summary="nodeOf(entry.message)?.summary || ''"
                :timestamp="entry.message.timestamp"
                :pin="nodeOf(entry.message)?.pin ?? entry.message.pin"
                :selected="sessionStore.selectedMsgIds.has(entry.message.id)"
                :cited-count="getCitedCount(entry.message)"
                :citing-count="getCitingCount(entry.message)"
                :cited-info-ids="getCitedIds(entry.message)"
                :citing-info-ids="getCitingIds(entry.message)"
                :trace-id="entry.message.traceId"
                :work-id="entry.message.workId"
                mode="timeline"
                :node-map="nodeMap"
                :is-streaming="sessionStore.isStreaming && entry.message.role !== 'user'"
                @toggle-select="sessionStore.toggleMsgSelection"
                @toggle-pin="togglePin"
                @click-card="centerMapOn"
                @jump-to="jumpTo"
                @show-thinking="showThinking"
                @show-eval="chatUi.openEvalResult"
              />
            </div>

            <!-- 系统回复：靠右，大脑头像在消息框右侧 -->
            <div v-if="entry.message.role !== 'user'" class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center mt-1">
              <Brain :size="16" />
            </div>
          </div>

          <!-- 思考过程不展示在对话区（以弹窗形式展示），其余块正常渲染 -->
          <div v-else-if="entry.block.type !== 'ThinkingChain'" class="max-w-[85%]" :class="entry.block.role === 'user' ? 'ml-auto' : 'mr-auto'">
            <BlockRenderer :block="entry.block" />
          </div>
        </template>

        <!-- Streaming cursor -->
        <div v-if="sessionStore.isStreaming" class="flex items-center gap-2 text-apple-gray-400 text-sm">
          <Loader2 :size="14" class="animate-spin" />
          <span>思考中...</span>
        </div>

        <!-- 需求理解确认卡片（对话区内联） -->
        <IntentConfirmCard
          v-if="chatUi.intentConfirmation"
          :confirmation="chatUi.intentConfirmation"
          :submitting="confirmingIntent"
          @confirm="handleIntentConfirm"
        />

      </div>

      <div class="flex-shrink-0 border-t border-apple-gray-100 dark:border-apple-gray-800">
        <InputBox
          :disabled="sessionStore.isStreaming"
          :citing-mode="sessionStore.citingMode"
          :selected-count="sessionStore.selectedMsgIds.size"
          @send="handleSend"
          @toggle-citing="sessionStore.toggleCitingMode()"
          @clear-selected="sessionStore.clearSelection()"
          @stop="sessionStore.cancelCurrentTask()"
        />
      </div>
    </div>

    <!-- 思考过程弹窗 -->
    <ThinkingModal />

    <!-- 评估结果弹窗 -->
    <EvalResultModal />
  </div>
</template>
