import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Message, AgentNode, AgentStatus } from '@shared/types'

export type AgentChainStore = Record<string, AgentNode[]>

export const useSessionStore = defineStore('session', () => {
  const messages = ref<Message[]>([])
  const agentChain = ref<AgentNode[]>([])
  const isProcessing = ref(false)
  const inputPosition = ref<'center' | 'bottom'>('center')
  const currentAgentChainId = ref<string | null>(null)
  const agentChainHistory = ref<AgentChainStore>({})

  function addMessage(message: Omit<Message, 'id' | 'timestamp'>) {
    const newMessage: Message = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      timestamp: Date.now()
    }
    messages.value.push(newMessage)
    
    if (inputPosition.value === 'center' && message.role === 'user') {
      inputPosition.value = 'bottom'
    }

    return newMessage
  }

  function updateMessage(id: string, updates: Partial<Message>) {
    const index = messages.value.findIndex(m => m.id === id)
    if (index !== -1) {
      messages.value[index] = { ...messages.value[index], ...updates }
    }
  }

  function addAgentFromServer(agent: {
    id: string
    name: string
    type: string
    role: string
    description: string
    status: string
    startTime: number
  }) {
    const newAgent: AgentNode = {
      id: agent.id,
      name: agent.name,
      type: agent.type as AgentNode['type'],
      role: agent.role,
      description: agent.description,
      status: agent.status as AgentStatus,
      children: [],
      output: [],
      startTime: agent.startTime,
    }
    agentChain.value.push(newAgent)
    return newAgent
  }

  function addAgentOutput(agentId: string, output: string, type: 'stdout' | 'stderr' | 'system' = 'stdout') {
    const agent = agentChain.value.find(a => a.id === agentId)
    if (agent) {
      agent.output.push({ type, content: output, timestamp: Date.now() })
    }
  }

  function updateAgentStatus(agentId: string, status: AgentStatus, error?: string) {
    const agent = agentChain.value.find(a => a.id === agentId)
    if (agent) {
      agent.status = status
      agent.endTime = status === 'completed' || status === 'failed' ? Date.now() : undefined
      if (error) {
        agent.error = error
      }
    }
  }

  function storeAgentChain(messageId: string, chain: AgentNode[]) {
    agentChainHistory.value[messageId] = chain
    // Also set as current display
    agentChain.value = chain
  }

  function loadAgentChainForMessage(messageId: string): boolean {
    const chain = agentChainHistory.value[messageId]
    if (chain) {
      agentChain.value = chain
      currentAgentChainId.value = messageId
      return true
    }
    return false
  }

  function clearMessages() {
    messages.value = []
    agentChain.value = []
    agentChainHistory.value = {}
    currentAgentChainId.value = null
    inputPosition.value = 'center'
  }

  function startProcessing() {
    isProcessing.value = true
  }

  function stopProcessing() {
    isProcessing.value = false
  }

  return {
    messages,
    agentChain,
    agentChainHistory,
    currentAgentChainId,
    isProcessing,
    inputPosition,
    addMessage,
    updateMessage,
    addAgentFromServer,
    addAgentOutput,
    updateAgentStatus,
    storeAgentChain,
    loadAgentChainForMessage,
    clearMessages,
    startProcessing,
    stopProcessing
  }
})
