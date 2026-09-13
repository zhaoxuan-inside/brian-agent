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

// 思考过程按消息加载：请求思考块与执行轨迹并展示弹窗
async function showThinking(id: string) {
  chatUi.startThinkingLoading(id)

  try {
    const res = await chatApi.thinking(id, 'blocks')
    chatUi.setThinkingBlocks(res.blocks ?? [])
    chatUi.setThinkingTrace((res as { trace?: import('@/api/types').ThinkingTrace | null }).trace ?? null)
  } catch {
    chatUi.setThinkingBlocks([])
    chatUi.setThinkingTrace(null)
  }
}

type TimelineEntry =
  | { kind: 'message'; key: string; sort: number; message: ChatMessage }
  | { kind: 'block'; key: string; sort: number; block: Block }

// timeline：对话区仅展示用户提问与最终回复；授权确认不在对话区展示，统一在思考过程弹窗内完成
const timeline = computed<TimelineEntry[]>(() => {
  const entries: TimelineEntry[] = []
  for (const m of sessionStore.messages) {
    if (m.permission) continue
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
    // ===== 修改后（2026-09-09）：同 kind 消息按角色稳定排序（user < assistant） =====
    // 原代码：直接落入 key（UUID）字符串比较——历史同步时 user/assistant 落库同一时间戳，
    // 排序结果由 UUID 随机决定，出现"用户消息显示在系统回复下面"的顺序颠倒。
    // 现按角色 tie-break（提问在前、回复在后），与时间线语义一致。
    if (a.kind === 'message' && b.kind === 'message' && a.message.role !== b.message.role) {
      return a.message.role === 'user' ? -1 : 1
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
                :interact-id="entry.message.interactId"
                :session-id="sessionStore.currentSessionId"
                mode="timeline"
                :node-map="nodeMap"
                :is-streaming="false"
                @toggle-select="sessionStore.toggleMsgSelection"
                @toggle-pin="togglePin"
                @click-card="centerMapOn"
                @jump-to="jumpTo"
                @show-thinking="showThinking"
                @show-eval="chatUi.openEvalResult"
              />
            </div>

            <!-- 系统回复：靠右，主题蓝头像在消息框右侧 -->
            <div v-if="entry.message.role !== 'user'" class="flex-shrink-0 w-8 h-8 rounded-full bg-brian-blue/10 text-brian-blue flex items-center justify-center mt-1">
              <Brain :size="16" />
            </div>
          </div>

          <!-- ===== 修改后（2026-09-12）：ToolInvocation 执行卡靠右（与系统回复消息一致）；其余块维持原布局 ===== -->
          <!-- ===== 原始代码（保留作为参考）：所有非 Thinking 块按 block.role 分左右，role==='tool' 的 -->
          <!-- ToolInvocation 落到 mr-auto 靠左、与用户消息同侧，视觉上误读为用户输入 -->
          <!-- <div v-else-if="entry.block.type !== 'ThinkingChain'" class="max-w-[85%]" -->
          <!--   :class="entry.block.role === 'user' ? 'ml-auto' : 'mr-auto'"> -->
          <!--   <BlockRenderer :block="entry.block" /> -->
          <!-- </div> -->
          <!-- ===== 修改后（2026-09-12）：所有 Block 按 role 对齐——仅 user 靠左（与用户消息一致）， ===== -->
          <!-- assistant/tool/system 靠右（与系统回复一致）；TextParagraph 流式文本不再落在用户同侧 -->
          <!-- ===== 原始代码（保留作为参考）：仅 ToolInvocation 靠右，其余（含 assistant 的 TextParagraph）靠左 ===== -->
          <!-- <div v-else-if="entry.block.type !== 'ThinkingChain'" class="max-w-[85%]" -->
          <!--   :class="entry.block.type === 'ToolInvocation' ? 'ml-auto' : 'mr-auto'"> -->
          <!--   <BlockRenderer :block="entry.block" /> -->
          <!-- </div> -->
          <div
            v-else-if="entry.block.type !== 'ThinkingChain'"
            class="max-w-[85%]"
            :class="entry.block.role === 'user' ? 'mr-auto' : 'ml-auto'"
          >
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
