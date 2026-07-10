<script setup lang="ts">
import { ref, computed } from 'vue'
import { Send, Loader2 } from '@lucide/vue'
import { useSessionStore } from '../stores/session'

const sessionStore = useSessionStore()
const inputText = ref('')
const isFocused = ref(false)

const inputClass = computed(() => {
  if (sessionStore.inputPosition === 'center') {
    return 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[50%] max-w-2xl animate-slide-down'
  }
  return 'fixed bottom-8 left-1/2 transform -translate-x-1/2 w-[60%] max-w-3xl'
})

async function handleSend() {
  if (!inputText.value.trim() || sessionStore.isProcessing) return

  const content = inputText.value.trim()
  inputText.value = ''

  sessionStore.addMessage({
    userId: 'default-user',
    content,
    role: 'user'
  })

  sessionStore.startProcessing()
  sessionStore.agentChain = []
  sessionStore.currentAgentChainId = null

  // Collect conversation history
  const chatMessages = sessionStore.messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  // Add placeholder assistant message
  const assistantMsg = sessionStore.addMessage({
    userId: 'assistant',
    content: '',
    role: 'assistant'
  })

  sessionStore.currentAgentChainId = assistantMsg.id

  try {
    const resp = await fetch('http://127.0.0.1:8000/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatMessages,
        messageId: assistantMsg.id,
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
            agentChain?: any[]
            agentId?: string
            agent?: any
            output?: string
            outputType?: string
            status?: string
            error?: string
            endTime?: number
          }

          switch (event.type) {
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
            case 'text':
              if (event.text) {
                fullText += event.text
                sessionStore.updateMessage(assistantMsg.id, { content: fullText })
              }
              break
            case 'done':
              fullText = event.fullText || fullText
              sessionStore.updateMessage(assistantMsg.id, { content: fullText })
              if (event.agentChain) {
                sessionStore.storeAgentChain(assistantMsg.id, event.agentChain)
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
  <div :class="inputClass">
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
        :disabled="!inputText.trim() || sessionStore.isProcessing"
        :class="[
          'ml-3 p-2 rounded-full transition-all duration-150',
          inputText.trim() && !sessionStore.isProcessing
            ? 'bg-brian-blue text-white hover:bg-brian-blue/90 active:scale-95'
            : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-400 cursor-not-allowed'
        ]"
        @click="handleSend"
      >
        <Loader2 v-if="sessionStore.isProcessing" :size="18" class="animate-spin" />
        <Send v-else :size="18" />
      </button>
    </div>
  </div>
</template>
