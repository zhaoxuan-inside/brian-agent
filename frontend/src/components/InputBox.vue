<script setup lang="ts">
import { ref, watch } from 'vue'
import { Send, OctagonX } from '@lucide/vue'
import { useSessionStore } from '../stores/session'

const sessionStore = useSessionStore()
const inputText = ref('')
const isFocused = ref(false)
const citationSourceMsgId = ref<string | null>(null)

watch(() => sessionStore.citationBuffer, (buf) => {
  if (buf) {
    inputText.value = `关于以下内容：\n> ${buf.text.split('\n').join('\n> ')}\n\n`
    citationSourceMsgId.value = buf.sourceMsgId
    sessionStore.clearCitation()
  }
}, { immediate: true })

function generateUUID(): string {
  const ts = Date.now().toString(16).padStart(12, '0')
  const rand = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${ts.slice(0, 8)}-${ts.slice(8)}-7${rand.slice(0, 3)}-${rand.slice(3, 7)}-${rand.slice(7, 19)}`
}

async function handleSend() {
  if (!inputText.value.trim() || sessionStore.isProcessing) return

  const content = inputText.value.trim()
  inputText.value = ''
  const exchangeId = generateUUID()
  sessionStore.setCurrentExchangeId(exchangeId)

  // Reuse the current session so multi-turn chat stays in one conversation
  let sessionId = sessionStore.currentSessionId
  if (!sessionId) {
    sessionId = generateUUID()
    sessionStore.setSessionId(sessionId)
  }

  sessionStore.addMessage({
    userId: 'default-user',
    content,
    role: 'user'
  })

  sessionStore.startProcessing()
  sessionStore.agentChain = []
  sessionStore.clearThinkingRecords()
  sessionStore.currentAgentChainId = null

  const chatMessages = sessionStore.messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  // 用户在 ChatMap 勾选的消息 + 引用提问的源消息 -> 自主控制上下文
  const selectedMessageIds = [...sessionStore.selectedMsgIds]
  if (citationSourceMsgId.value && !selectedMessageIds.includes(citationSourceMsgId.value)) {
    selectedMessageIds.push(citationSourceMsgId.value)
  }
  if (selectedMessageIds.length > 0) {
    sessionStore.clearMsgSelection()
  }
  citationSourceMsgId.value = null

  const assistantMsg = sessionStore.addMessage({
    userId: 'assistant',
    content: '',
    role: 'assistant'
  })

  sessionStore.currentAgentChainId = assistantMsg.id

  try {
    const resp = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'default-user',
        message: content,
        messages: chatMessages,
        messageId: assistantMsg.id,
        sessionId,
        exchangeId,
        ...(selectedMessageIds.length > 0 ? { selectedMessageIds } : {}),
      }),
    })

    if (!resp.ok) {
      const error = await resp.json()
      throw new Error(error.error || `HTTP ${resp.status}`)
    }

    if (!resp.body) throw new Error('No response body')

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''

    let done = false
    while (!done) {
      const chunk = await reader.read()
      done = chunk.done
      if (done) break
      if (!chunk.value) continue

      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        try {
          const event = JSON.parse(data) as {
            type: string
            text?: string
            fullText?: string
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            agentChain?: any[]
            agentId?: string
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            agent?: any
            output?: string
            outputType?: string
            status?: string
            error?: string
            endTime?: number
            taskId?: string
            systemPrompt?: string
            instruction?: string
            agentStatus?: { agentId: string; status: string; error?: string; endTime?: number }
          }

          switch (event.type) {
            case 'loading':
              sessionStore.updateMessage(assistantMsg.id, { content: '__LOADING__' })
              break
            case 'agent_thinking':
              if (event.agentId) {
                sessionStore.addThinkingRecord({
                  agentId: event.agentId,
                  taskId: event.taskId || event.agentId,
                  systemPrompt: event.systemPrompt || '',
                  instruction: event.instruction || '',
                  output: event.output || '',
                })
              }
              break
            case 'agent_created':
              if (event.agent) {
                sessionStore.addAgentFromServer(event.agent)
              }
              break
            case 'agent_output':
              if (event.agentId && event.output) {
                sessionStore.addAgentOutput(
                  event.agentId,
                  event.output,
                  (event.outputType as 'stdout' | 'stderr' | 'system') || 'system'
                )
              }
              break
            case 'agent_status':
              if (event.agentId && event.status) {
                sessionStore.updateAgentStatus(event.agentId, event.status as 'idle' | 'running' | 'completed' | 'failed', event.error)
              }
              break
            case 'error':
              throw new Error(event.error || 'Stream error')
            case 'text':
              if (event.text) {
                if (fullText === '__LOADING__') fullText = ''
                fullText += event.text
                sessionStore.updateMessage(assistantMsg.id, { content: fullText })
              }
              break
            case 'done':
              fullText = event.fullText || fullText
              sessionStore.updateMessage(assistantMsg.id, { content: fullText })
              if (event.agentChain) {
                sessionStore.storeAgentChain(assistantMsg.id, event.agentChain)
                sessionStore.storeAgentChainByExchangeId(exchangeId, event.agentChain)
              }
              // Refresh ChatMap DAG + exchanges with the newly persisted messages,
              // and reload history so bubbles carry real backend msgIds (for DAG 联动)
              sessionStore.loadExchanges(sessionId, 'default-user')
              sessionStore.loadDag(sessionId, 'default-user')
              sessionStore.loadChatHistory(sessionId, 'default-user')
              if (event.agentStatus) {
                sessionStore.updateAgentStatus(
                  event.agentStatus.agentId,
                  event.agentStatus.status as 'idle' | 'running' | 'completed' | 'failed',
                  event.agentStatus.error
                )
              }
              break
          }
        } catch {
          // skip parse errors
        }
      }
    }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : '未知错误'
    sessionStore.updateMessage(assistantMsg.id, { content: `调用失败: ${errMsg}` })
  } finally {
    sessionStore.stopProcessing()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div
    :class="[
      'glass-input rounded-xl flex items-center px-4 py-3',
      isFocused ? 'shadow-focus' : 'shadow-glass',
      sessionStore.isProcessing ? 'opacity-70 cursor-not-allowed' : ''
    ]"
  >
    <input
      v-model="inputText"
      type="text"
      placeholder="与Brian对话..."
      class="flex-1 bg-transparent outline-none text-apple-gray-900 dark:text-apple-gray-50 placeholder-apple-gray-400"
      :disabled="sessionStore.isProcessing"
      @focus="isFocused = true"
      @blur="isFocused = false"
      @keydown="handleKeydown"
    />

    <button
      v-if="sessionStore.isProcessing"
      class="ml-3 p-2 rounded-full bg-error-red text-white hover:bg-error-red/90 active:scale-95 transition-all duration-150 shadow-sm"
      @click="sessionStore.cancelCurrentTask()"
      title="取消任务"
    >
      <OctagonX :size="18" />
    </button>
    <button
      v-else
      :disabled="!inputText.trim()"
      :class="[
        'ml-3 p-2 rounded-full transition-all duration-150',
        inputText.trim()
          ? 'bg-brian-blue text-white hover:bg-brian-blue/90 active:scale-95'
          : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-400 cursor-not-allowed'
      ]"
      @click="handleSend"
    >
      <Send :size="18" />
    </button>
  </div>
</template>