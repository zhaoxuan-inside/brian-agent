<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  MessageCircle,
  UserRound,
  Brain,
} from '@lucide/vue'
import { useSessionStore } from '@/stores/session'
import { useChatUiStore } from '@/stores/chatUi'
import { chatApi } from '@/api'
import type { ChatMessage } from '@/api/types'
import ChatMap from './ChatMap.vue'
import InputBox from './InputBox.vue'
import MessageCard from './MessageCard.vue'
import BlockRenderer from '@/components/blocks/BlockRenderer.vue'
import ThinkingModal from './ThinkingModal.vue'
import ThinkingTrace from './ThinkingTrace.vue'
import EvalResultModal from './EvalResultModal.vue'
import IntentConfirmCard from './IntentConfirmCard.vue'
import ClarificationCard from './ClarificationCard.vue'
import { useChatStream } from '@/composables/useChatStream'
import { groupConversationTurns, type ConversationTurn } from '@/utils/conversationTurns'

const sessionStore = useSessionStore()
const chatUi = useChatUiStore()
const {
  confirmingIntent,
  submittingClarification,
  handleSend,
  handleIntentConfirm,
  handleClarificationSubmit,
} = useChatStream()

const leftWidth = computed(() => `${sessionStore.splitRatio * 100}%`)
const rightWidth = computed(() => `${(1 - sessionStore.splitRatio) * 100}%`)
const isDragging = ref(false)
const listRef = ref<HTMLDivElement | null>(null)

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

watch(() => sessionStore.focusInfoId, async (id) => {
  if (!id) return
  await nextTick()
  const el = listRef.value?.querySelector(`[data-info-id="${id}"]`) as HTMLElement | null
  if (!el || !listRef.value) return
  const listRect = listRef.value.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  listRef.value.scrollTop += elRect.top - listRect.top - listRect.height / 2 + elRect.height / 2
})

watch(
  () => [chatUi.intentConfirmation, chatUi.clarificationRequest, sessionStore.isStreaming, sessionStore.blocks.length],
  async () => {
    await nextTick()
    if (listRef.value && sessionStore.isStreaming) {
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

async function showThinking(id: string | null) {
  if (!id) {
    chatUi.openThinkingModal(null)
    return
  }
  chatUi.startThinkingLoading(id)
  const dagPromise = chatApi.thinking(id, 'dag')
    .then(res => chatUi.setThinkingDag(res.dag ?? null))
    .catch(() => chatUi.setThinkingDag(null))
  const blocksPromise = chatApi.thinking(id, 'blocks')
    .then(res => chatUi.setThinkingBlocks(res.blocks ?? []))
    .catch(() => chatUi.setThinkingBlocks([]))
  await Promise.allSettled([dagPromise, blocksPromise])
}

const turns = computed(() =>
  groupConversationTurns(sessionStore.messages, sessionStore.blocks, sessionStore.isStreaming),
)

function openTurnDetails(turn: ConversationTurn) {
  if (turn.live) {
    chatUi.openThinkingModal(null)
    return
  }
  showThinking(turn.assistant?.id || turn.user.id)
}

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
    <div class="flex-shrink-0 h-full overflow-hidden" :style="{ width: leftWidth }">
      <ChatMap />
    </div>

    <div
      class="w-1.5 cursor-col-resize bg-apple-gray-100 dark:bg-apple-gray-800 hover:bg-brian-blue/50 transition-colors relative group flex-shrink-0"
      @mousedown="startResize"
    >
      <div class="absolute inset-y-0 -left-1 -right-1" />
    </div>

    <div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden" :style="{ width: rightWidth }">
      <div ref="listRef" class="flex-1 overflow-y-auto px-5 py-5">
        <div v-if="!sessionStore.currentSessionId && sessionStore.messages.length === 0" class="flex flex-col items-center justify-center h-full text-apple-gray-400">
          <MessageCircle :size="40" class="mb-3 text-apple-gray-300" />
          <p class="text-base font-medium text-apple-gray-600 dark:text-apple-gray-300">Brian Agent</p>
          <p class="text-sm mt-1">开始一段对话</p>
        </div>

        <div v-else class="max-w-3xl mx-auto w-full space-y-8">
          <section v-for="turn in turns" :key="turn.key" class="space-y-3">
            <div class="flex items-start gap-3" :data-info-id="turn.user.id">
              <div class="flex-shrink-0 w-7 h-7 rounded-full bg-brian-blue/15 text-brian-blue flex items-center justify-center mt-0.5">
                <UserRound :size="14" />
              </div>
              <div class="min-w-0 flex-1">
                <MessageCard
                  :id="turn.user.id"
                  :info-id="turn.user.id"
                  :role="turn.user.role"
                  :content="turn.user.content"
                  :summary="nodeOf(turn.user)?.summary || ''"
                  :timestamp="turn.user.timestamp"
                  :pin="nodeOf(turn.user)?.pin ?? turn.user.pin"
                  :selected="sessionStore.selectedMsgIds.has(turn.user.id)"
                  :cited-count="getCitedCount(turn.user)"
                  :citing-count="getCitingCount(turn.user)"
                  :cited-info-ids="getCitedIds(turn.user)"
                  :citing-info-ids="getCitingIds(turn.user)"
                  :trace-id="turn.user.traceId"
                  :work-id="turn.user.workId"
                  mode="timeline"
                  :citing-mode="sessionStore.citingMode"
                  :show-thinking-action="false"
                  :show-eval-action="false"
                  :node-map="nodeMap"
                  @toggle-select="sessionStore.toggleMsgSelection"
                  @toggle-pin="togglePin"
                  @click-card="centerMapOn"
                  @jump-to="jumpTo"
                />
              </div>
            </div>

            <div
              v-if="turn.thinking.length > 0 || turn.live"
              class="pl-10"
            >
              <ThinkingTrace
                :blocks="turn.thinking"
                :planning="turn.live ? chatUi.planning : null"
                :live="turn.live"
                :total-started-at="turn.live ? chatUi.thinkingStartedAt : 0"
                @details="openTurnDetails(turn)"
              />
            </div>

            <div
              v-for="block in turn.extras"
              :key="block.id"
              class="pl-10"
            >
              <BlockRenderer :block="block" />
            </div>

            <div
              v-if="turn.assistant"
              class="flex items-start gap-3"
              :data-info-id="turn.assistant.id"
            >
              <div class="flex-shrink-0 w-7 h-7 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 flex items-center justify-center mt-0.5">
                <Brain :size="14" />
              </div>
              <div class="min-w-0 flex-1">
                <MessageCard
                  :id="turn.assistant.id"
                  :info-id="turn.assistant.id"
                  :role="turn.assistant.role"
                  :content="turn.assistant.content"
                  :summary="nodeOf(turn.assistant)?.summary || ''"
                  :timestamp="turn.assistant.timestamp"
                  :pin="nodeOf(turn.assistant)?.pin ?? turn.assistant.pin"
                  :selected="sessionStore.selectedMsgIds.has(turn.assistant.id)"
                  :cited-count="getCitedCount(turn.assistant)"
                  :citing-count="getCitingCount(turn.assistant)"
                  :cited-info-ids="getCitedIds(turn.assistant)"
                  :citing-info-ids="getCitingIds(turn.assistant)"
                  :trace-id="turn.assistant.traceId"
                  :work-id="turn.assistant.workId"
                  mode="timeline"
                  :citing-mode="sessionStore.citingMode"
                  :show-thinking-action="turn.thinking.length === 0"
                  :is-streaming="sessionStore.isStreaming && turn.live"
                  :node-map="nodeMap"
                  @toggle-select="sessionStore.toggleMsgSelection"
                  @toggle-pin="togglePin"
                  @click-card="centerMapOn"
                  @jump-to="jumpTo"
                  @show-thinking="showThinking"
                  @show-eval="chatUi.openEvalResult"
                />
              </div>
            </div>
          </section>

          <IntentConfirmCard
            v-if="chatUi.intentConfirmation"
            :confirmation="chatUi.intentConfirmation"
            :submitting="confirmingIntent"
            @confirm="handleIntentConfirm"
          />

          <ClarificationCard
            v-if="chatUi.clarificationRequest"
            :request="chatUi.clarificationRequest"
            :submitting="submittingClarification"
            @submit="handleClarificationSubmit"
            @cancel="chatUi.clearClarificationRequest()"
          />
        </div>
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

    <ThinkingModal />
    <EvalResultModal />
  </div>
</template>
