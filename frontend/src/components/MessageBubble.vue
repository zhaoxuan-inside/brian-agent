<script setup lang="ts">
import { ref, computed } from 'vue'
import { User, Sparkles, Brain, ChevronDown, ChevronUp, GitFork } from '@lucide/vue'
import type { Message } from '@shared/types'
import RatingButtons from './RatingButtons.vue'
import { useSessionStore } from '../stores/session'
import { marked } from 'marked'

const props = defineProps<{
  message: Message
  hasNext?: boolean
  nextRole?: string | null
}>()

const emit = defineEmits<{
  'locate': [msgId: string]
  'askCitation': [text: string, msgId: string]
  'openAgentDag': []
}>()

const sessionStore = useSessionStore()
const showRating = ref(false)
const showThinking = ref(true)
const showContextMenu = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })
const selectedText = ref('')

function renderMarkdown(text: string): string {
  try {
    return marked.parse(text, { async: false }) as string
  } catch {
    return text.replace(/\n/g, '<br>')
  }
}

function onContextMenu(e: MouseEvent) {
  const sel = window.getSelection()
  const text = sel?.toString().trim()
  if (text && text.length > 0) {
    e.preventDefault()
    selectedText.value = text
    contextMenuPos.value = { x: e.clientX, y: e.clientY }
    showContextMenu.value = true
  }
}

function askCitation() {
  if (selectedText.value) {
    emit('askCitation', selectedText.value, props.message.msgId || props.message.id)
  }
  showContextMenu.value = false
}

function formatPlanOutput(output: string): string {
  try {
    const tasks = JSON.parse(output)
    if (Array.isArray(tasks)) {
      return tasks.map((t: any, i: number) => `${i + 1}. ${t.description || t.id}`).join('\n')
    }
  } catch {}
  return output.slice(0, 500)
}

const hasAgentChain = computed(() => {
  const byExchange = props.message.exchangeId && sessionStore.agentChainByExchangeId[props.message.exchangeId]
  const byMsgId = props.message.id && sessionStore.agentChainHistory[props.message.id]
  return !!(byExchange || byMsgId)
})

// 点击消息 -> ChatMap 对应节点平移居中
function handleLocate() {
  if (props.message.msgId) {
    emit('locate', props.message.msgId)
  }
}

setTimeout(() => {
  showRating.value = true
}, 500)

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div
    class="message-row"
    :class="message.role"
    :data-exchange-id="message.exchangeId"
    :data-msg-id="message.msgId"
  >
    <template v-if="message.role === 'assistant'">
      <div class="message-avatar assistant-avatar">
        <Sparkles :size="16" />
      </div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-sender">Brian</span>
          <span class="message-time">{{ formatTime(message.timestamp) }}</span>
          <button
            v-if="hasAgentChain"
            class="ml-1.5 p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors text-apple-gray-400 hover:text-brian-blue inline-flex"
            title="查看 DAG 调度图"
            @click="$emit('openAgentDag')"
          >
            <GitFork :size="12" />
          </button>
        </div>
        <!-- Agent Thinking Records (above model response) -->
        <div v-if="sessionStore.currentThinkingRecords.length > 0" class="mt-2 mb-3 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg overflow-hidden bg-apple-gray-50/50 dark:bg-apple-gray-800/30">
          <button
            class="w-full flex items-center justify-between p-2.5 hover:bg-apple-gray-100/50 dark:hover:bg-apple-gray-700/50 transition-colors text-xs font-medium text-apple-gray-600 dark:text-apple-gray-400"
            @click="showThinking = !showThinking"
          >
            <span class="flex items-center gap-1.5">
              <Brain :size="14" class="text-brian-blue" />
              Agent 思考过程 ({{ sessionStore.currentThinkingRecords.length }} 个Agent)
            </span>
            <ChevronDown v-if="!showThinking" :size="14" />
            <ChevronUp v-else :size="14" />
          </button>
          <div v-show="showThinking" class="divide-y divide-apple-gray-200 dark:divide-apple-gray-700">
            <div v-for="(record, idx) in sessionStore.currentThinkingRecords" :key="idx" class="p-3">
              <div class="flex items-center gap-2 mb-2">
                <span v-if="record.taskId === 'planner'" class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">规划者</span>
                <span v-else class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue">Worker {{ idx }}</span>
                <span class="text-[10px] text-apple-gray-400 truncate max-w-[200px]">{{ record.instruction.slice(0, 80) }}</span>
              </div>
              <div class="text-xs space-y-1.5">
                <div class="bg-white dark:bg-apple-gray-800 rounded p-2 border border-apple-gray-100 dark:border-apple-gray-700">
                  <span class="text-[10px] font-semibold text-apple-gray-400 uppercase tracking-wider">Input</span>
                  <p class="text-apple-gray-600 dark:text-apple-gray-300 mt-0.5 whitespace-pre-wrap">{{ record.instruction }}</p>
                </div>
                <div v-if="record.output" class="bg-success-green/5 rounded p-2 border border-success-green/10">
                  <span class="text-[10px] font-semibold text-success-green uppercase tracking-wider">Output</span>
                  <p v-if="record.taskId === 'planner'" class="text-apple-gray-600 dark:text-apple-gray-300 mt-0.5 whitespace-pre-wrap">{{ formatPlanOutput(record.output) }}</p>
                  <p v-else class="text-apple-gray-600 dark:text-apple-gray-300 mt-0.5 whitespace-pre-wrap">{{ record.output.slice(0, 500) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="message-content assistant-content" @contextmenu="onContextMenu">
          <p v-if="message.content === '__LOADING__'" class="message-text loading-dots">
            <span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>
          </p>
          <div v-else class="message-text markdown-body" v-html="renderMarkdown(message.content)" @click="handleLocate" title="点击在 ChatMap 中定位"></div>
        </div>
        <!-- Context Menu -->
        <Teleport to="body">
          <div v-if="showContextMenu" class="fixed z-50 bg-white dark:bg-apple-gray-800 rounded-lg shadow-xl border border-apple-gray-200 dark:border-apple-gray-700 py-1 min-w-[160px]"
            :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
            @click.stop>
            <button
              class="w-full text-left px-3 py-2 text-sm hover:bg-brian-blue/10 text-apple-gray-700 dark:text-apple-gray-200 flex items-center gap-2 transition-colors"
              @click="askCitation"
            >
              <Sparkles :size="14" class="text-brian-blue" />
              对选中内容提问
            </button>
          </div>
        </Teleport>
        <div v-if="showContextMenu" class="fixed inset-0 z-40" @click="showContextMenu = false" @contextmenu.prevent="showContextMenu = false"></div>
        <Transition name="fade">
          <RatingButtons
            v-if="showRating"
            :message-id="message.id"
            :rating="message.rating"
            class="mt-2"
          />
        </Transition>
      </div>
    </template>

    <template v-else>
      <div class="message-body user-body">
        <div class="message-header user-header">
          <button
            v-if="hasAgentChain"
            class="mr-1.5 p-0.5 rounded hover:bg-white/20 transition-colors text-white/60 hover:text-white inline-flex"
            title="查看 DAG 调度图"
            @click="$emit('openAgentDag')"
          >
            <GitFork :size="12" />
          </button>
          <span class="message-time">{{ formatTime(message.timestamp) }}</span>
          <span class="message-sender">You</span>
        </div>
        <div class="message-content user-content" title="点击在 ChatMap 中定位" @click="handleLocate">
          <p class="message-text">{{ message.content }}</p>
        </div>
      </div>
      <div class="message-avatar user-avatar">
        <User :size="16" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.message-row {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  animation: message-in 0.3s ease-out;
}

.message-row.user {
  justify-content: flex-end;
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Avatar */
.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.assistant-avatar {
  background: linear-gradient(135deg, #007AFF20, #007AFF10);
  color: #007AFF;
}

.user-avatar {
  background: linear-gradient(135deg, #34C75920, #34C75910);
  color: #34C759;
}

/* Body */
.message-body {
  max-width: 72%;
  min-width: 0;
}

.user-body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* Header */
.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.user-header {
  justify-content: flex-end;
}

.message-sender {
  font-size: 13px;
  font-weight: 600;
  color: #1D1D1F;
}

:root.dark .message-sender {
  color: #F5F5F7;
}

.message-time {
  font-size: 11px;
  color: #86868B;
}

/* Content */
.message-content {
  border-radius: 16px;
  padding: 14px 18px;
  line-height: 1.65;
  cursor: pointer;
  transition: filter 0.15s;
}

.message-content:hover {
  filter: brightness(0.97);
}

:root.dark .message-content:hover {
  filter: brightness(1.1);
}

.assistant-content {
  background: #F5F5F7;
  border-top-left-radius: 4px;
}

:root.dark .assistant-content {
  background: #2C2C2E;
}

.assistant-content .message-text {
  color: #1D1D1F;
}

:root.dark .assistant-content .message-text {
  color: #F5F5F7;
}

.user-content {
  background: #007AFF;
  border-top-right-radius: 4px;
}

.user-content .message-text {
  color: #FFFFFF;
}

.message-text {
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.loading-dots {
  display: inline-flex;
  gap: 2px;
  font-size: 24px;
  line-height: 1;
  letter-spacing: 2px;
}

.loading-dots .dot {
  animation: blink 1.4s infinite both;
  color: #007AFF;
}

.loading-dots .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.loading-dots .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  0% { opacity: 0.2; }
  20% { opacity: 1; }
  100% { opacity: 0.2; }
}

.markdown-body {
  line-height: 1.7;
}

.markdown-body :deep(p) {
  margin-bottom: 0.75em;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(code) {
  background: rgba(0, 122, 255, 0.08);
  padding: 0.15em 0.4em;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.markdown-body :deep(pre) {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 1em;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.75em 0;
  font-size: 0.85em;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: inherit;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5em;
  margin-bottom: 0.75em;
}

.markdown-body :deep(li) {
  margin-bottom: 0.25em;
}

.markdown-body :deep(strong) {
  font-weight: 600;
}

.markdown-body :deep(em) {
  font-style: italic;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  font-weight: 600;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

.markdown-body :deep(h1) { font-size: 1.4em; }
.markdown-body :deep(h2) { font-size: 1.2em; }
.markdown-body :deep(h3) { font-size: 1.05em; }

.markdown-body :deep(blockquote) {
  border-left: 3px solid #007AFF;
  padding-left: 1em;
  margin: 0.75em 0;
  color: #6b7280;
}
</style>