<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  MessageCircle,
  Loader2,
} from '@lucide/vue'
import { useSessionStore } from '@/stores/session'
import type { ChatMessage, Block, TextBlock } from '@/api/types'
import ChatMap from './ChatMap.vue'
import InputBox from './InputBox.vue'
import BlockRenderer from '@/components/blocks/BlockRenderer.vue'

const sessionStore = useSessionStore()

const leftWidth = computed(() => `${sessionStore.splitRatio * 100}%`)
const rightWidth = computed(() => `${(1 - sessionStore.splitRatio) * 100}%`)
const isDragging = ref(false)

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

async function handleSend(content: string, citingIds: string[]) {
  if (!content.trim()) return

  const sessionId = sessionStore.currentSessionId || `session-${Date.now()}`
  if (!sessionStore.currentSessionId) {
    sessionStore.currentSessionId = sessionId
    localStorage.setItem('chat-current-session-id', sessionId)
  }

  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content,
    timestamp: Date.now(),
    citingIds,
  }
  sessionStore.addMessage(userMsg)

  const botMsgId = `msg-${Date.now()}-bot`
  const thinkingBlock: Block = {
    id: `block-think-${Date.now()}`,
    msgId: botMsgId,
    role: 'assistant',
    type: 'ThinkingChain',
    meta: { status: 'streaming', createdAt: Date.now(), updatedAt: Date.now() },
  } as Block
  sessionStore.addBlock(thinkingBlock)

  sessionStore.setStreaming(true)
  try {
    const abortCtrl = new AbortController()
    sessionStore.setCancelController(abortCtrl)

    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        msg_content: content,
        citing_msg_ids: citingIds,
      }),
      signal: abortCtrl.signal,
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) { // eslint-disable-line no-constant-condition
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            handleStreamEvent(data.event || 'message', data, botMsgId, thinkingBlock.id)
          } catch { /* ignore parse errors */ }
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name !== 'AbortError') {
      sessionStore.updateBlock(thinkingBlock.id, {
        meta: { ...thinkingBlock.meta, status: 'error', errorMessage: err.message }
      } as Partial<Block>)
    }
  } finally {
    sessionStore.finalizeBlocks(botMsgId)
    sessionStore.setStreaming(false)
    sessionStore.setCancelController(null)
  }
}

let textBlockId: string | null = null

function handleStreamEvent(event: string, data: Record<string, unknown>, botMsgId: string, thinkingBlockId: string) {
  switch (event) {
    case 'connected':
    case 'loading':
      break

    case 'agent_thinking':
    case 'thinking':
      sessionStore.appendBlockContent(thinkingBlockId, String(data.chunk || ''))
      break

    case 'text':
    case 'agent_output': {
      const chunk = String(data.chunk || '')
      if (!textBlockId) {
        textBlockId = `block-text-${Date.now()}`
        const textBlock: Block = {
          id: textBlockId,
          msgId: botMsgId,
          role: 'assistant',
          type: 'TextParagraph',
          content: chunk,
          meta: { status: 'streaming', createdAt: Date.now(), updatedAt: Date.now() },
        } as TextBlock
        sessionStore.addBlock(textBlock)
      } else {
        sessionStore.appendBlockContent(textBlockId, chunk)
      }
      break
    }

    case 'agent_status': {
      const toolBlock: Block = {
        id: `block-tool-${Date.now()}`,
        msgId: botMsgId,
        role: 'tool',
        type: 'ToolInvocation',
        toolName: String(data.tool_name || ''),
        params: (data.params as Record<string, unknown>) || {},
        meta: { status: data.status === 'done' ? 'done' : 'streaming', createdAt: Date.now(), updatedAt: Date.now() },
      } as Block
      sessionStore.addBlock(toolBlock)
      break
    }

    case 'citation':
      if (textBlockId) {
        sessionStore.updateBlock(textBlockId, {
          citingIds: data.citing_ids as string[],
        } as Partial<Block>)
      }
      break

    case 'done': {
      sessionStore.finalizeBlocks(botMsgId)
      const feedbackBlock: Block = {
        id: `block-fb-${Date.now()}`,
        msgId: botMsgId,
        role: 'assistant',
        type: 'Feedback',
        meta: { status: 'done', createdAt: Date.now(), updatedAt: Date.now() },
      } as Block
      sessionStore.addBlock(feedbackBlock)
      textBlockId = null
      break
    }

    case 'error': {
      const errBlock: Block = {
        id: `block-err-${Date.now()}`,
        msgId: botMsgId,
        role: 'system',
        type: 'ErrorFallback',
        message: String(data.error_message || '未知错误'),
        errorCode: String(data.error_code || ''),
        retryAvailable: false,
        meta: { status: 'error', createdAt: Date.now(), updatedAt: Date.now() },
      } as Block
      sessionStore.addBlock(errBlock)
      break
    }
  }
}
</script>

<template>
  <div class="chat-area flex flex-1 pt-14 overflow-hidden" :class="{ 'select-none': isDragging }">
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
      <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div v-if="!sessionStore.currentSessionId && sessionStore.messages.length === 0" class="flex flex-col items-center justify-center h-full text-apple-gray-400">
          <MessageCircle :size="48" class="mb-4 text-apple-gray-300" />
          <p class="text-lg font-medium">Brian Agent</p>
          <p class="text-sm mt-1">开始一段对话</p>
        </div>

        <template v-for="msg in sessionStore.messages" :key="msg.id">
          <div
            class="max-w-[85%]"
            :class="msg.role === 'user' ? 'ml-auto' : 'mr-auto'"
          >
            <div
              class="rounded-2xl px-4 py-3"
              :class="msg.role === 'user'
                ? 'bg-brian-blue text-white'
                : 'block-card'"
            >
              <p class="text-sm whitespace-pre-wrap">{{ msg.content }}</p>
            </div>

            <div v-if="msg.citingIds?.length" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="cid in msg.citingIds"
                :key="cid"
                class="px-2 py-0.5 text-xs rounded-full bg-brian-blue/10 text-brian-blue"
              >{{ cid.slice(-8) }}</span>
            </div>
          </div>
        </template>

        <!-- Block Stream -->
        <div v-for="block in sessionStore.blocks" :key="block.id" class="max-w-[85%]" :class="block.role === 'user' ? 'ml-auto' : 'mr-auto'">
          <BlockRenderer :block="block" />
        </div>

        <!-- Streaming cursor -->
        <div v-if="sessionStore.isStreaming" class="flex items-center gap-2 text-apple-gray-400 text-sm">
          <Loader2 :size="14" class="animate-spin" />
          <span>思考中...</span>
        </div>
      </div>

      <div class="flex-shrink-0 border-t border-apple-gray-100 dark:border-apple-gray-800">
        <InputBox
          :disabled="sessionStore.isStreaming"
          :citing-mode="sessionStore.citingMode"
          @send="handleSend"
          @toggle-citing="sessionStore.toggleCitingMode()"
          @stop="sessionStore.cancelCurrentTask()"
        />
      </div>
    </div>
  </div>
</template>
