import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Message, AgentNode, AgentStatus } from '@shared/types'
import { chatApi } from '../api'

export type AgentChainStore = Record<string, AgentNode[]>

export interface ExchangeGroup {
  exchangeId: string
  userMessage: {
    msgId: string
    content: string
    summary: string
    referenceCount: number
    createdAt: number
  } | null
  assistantMessage: {
    msgId: string
    content: string
    summary: string
    referenceCount: number
    createdAt: number
  } | null
  messageCount: number
  firstMessageAt: number
  lastMessageAt: number
  referencedExchangeIds: string[]
}

export interface ChatListItem {
  sessionId: string
  lastMessage: string
  lastTime: number
}

export interface DagNode {
  msgId: string
  exchangeId: string
  role: 'user' | 'assistant' | 'system'
  summary: string
  createdAt: number
  messageIndex: number
  referencesOut: number
  referencesIn: number
  isBranch: boolean
}

export interface DagEdge {
  from: string
  to: string
  type: 'sequence' | 'reference'
}

function loadSplitRatio(): number {
  try {
    const saved = localStorage.getItem('chat-split-ratio')
    if (saved) {
      const ratio = parseFloat(saved)
      if (ratio >= 30 && ratio <= 70) return ratio
    }
  } catch { /* ignore */ }
  return 65 // default 65% for ChatMap
}

function saveSplitRatio(ratio: number): void {
  try {
    localStorage.setItem('chat-split-ratio', String(ratio))
  } catch { /* ignore */ }
}

function loadSessionId(): string | null {
  try {
    return localStorage.getItem('chat-current-session-id')
  } catch {
    return null
  }
}

function saveSessionId(sessionId: string | null): void {
  try {
    if (sessionId) {
      localStorage.setItem('chat-current-session-id', sessionId)
    } else {
      localStorage.removeItem('chat-current-session-id')
    }
  } catch { /* ignore */ }
}

export const useSessionStore = defineStore('session', () => {
  const messages = ref<Message[]>([])
  const agentChain = ref<AgentNode[]>([])
  const isProcessing = ref(false)
  const inputPosition = ref<'center' | 'bottom'>('center')
  const currentAgentChainId = ref<string | null>(null)
  const agentChainHistory = ref<AgentChainStore>({})
  const agentChainByExchangeId = ref<Record<string, AgentNode[]>>({})
  const currentThinkingRecords = ref<Array<{ agentId: string; taskId: string; systemPrompt: string; instruction: string; output: string }>>([])

  // New state for dual-column layout
  const exchanges = ref<ExchangeGroup[]>([])
  const chatList = ref<ChatListItem[]>([])
  const splitRatio = ref<number>(loadSplitRatio())
  const currentSessionId = ref<string | null>(loadSessionId())
  const isLoadingExchanges = ref(false)
  const isLoadingHistory = ref(false)

  // ChatMap DAG state (message-level)
  const dagNodes = ref<DagNode[]>([])
  const dagEdges = ref<DagEdge[]>([])
  const isLoadingDag = ref(false)
  // 用户勾选的消息（自主控制上下文）
  const selectedMsgIds = ref<Set<string>>(new Set())
  // 居中信号：对话区点击消息时设置，ChatMap watch 后平移居中
  const focusedMsgId = ref<string | null>(null)
  // 引用提问缓冲区
  const citationBuffer = ref<{ text: string; sourceMsgId: string } | null>(null)

  // Computed: messages grouped by date
  const groupedMessages = computed(() => {
    const groups: { date: string; label: string; messages: Message[] }[] = []
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const yesterday = today - 86400000

    for (const msg of messages.value) {
      const msgDate = new Date(msg.timestamp)
      const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate()).getTime()

      let label: string
      if (msgDay === today) {
        label = '今天'
      } else if (msgDay === yesterday) {
        label = '昨天'
      } else {
        label = msgDate.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
      }

      const dateKey = `${msgDay}`
      let group = groups.find(g => g.date === dateKey)
      if (!group) {
        group = { date: dateKey, label, messages: [] }
        groups.push(group)
      }
      group.messages.push(msg)
    }
    return groups
  })

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
    agentChain.value = chain
    extractThinkingFromChain(chain)
  }

  function storeAgentChainByExchangeId(exchangeId: string, chain: AgentNode[]) {
    agentChainByExchangeId.value = { ...agentChainByExchangeId.value, [exchangeId]: chain }
    agentChain.value = chain
    extractThinkingFromChain(chain)
  }

  function extractThinkingFromChain(chain: AgentNode[]) {
    const records: Array<{ agentId: string; taskId: string; systemPrompt: string; instruction: string; output: string }> = []
    for (const agent of chain) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const thinking = (agent as any).thinking
      if (thinking) {
        records.push({
          agentId: agent.id,
          taskId: agent.type === 'coordinator' ? 'planner' : agent.id,
          systemPrompt: thinking.systemPrompt || '',
          instruction: thinking.instruction || '',
          output: thinking.fullOutput || '',
        })
      }
    }
    if (records.length > 0) {
      currentThinkingRecords.value = records
    }
  }

  function addThinkingRecord(record: { agentId: string; taskId: string; systemPrompt: string; instruction: string; output: string }) {
    currentThinkingRecords.value = [...currentThinkingRecords.value, record]
  }

  function clearThinkingRecords() {
    currentThinkingRecords.value = []
  }

  function loadAgentChainForMessage(messageId: string): boolean {
    const chain = agentChainHistory.value[messageId]
    if (chain) {
      agentChain.value = chain
      extractThinkingFromChain(chain)
      currentAgentChainId.value = messageId
      return true
    }
    return false
  }

  function loadAgentChainByExchangeId(exchangeId: string): boolean {
    const chain = agentChainByExchangeId.value[exchangeId]
    if (chain) {
      agentChain.value = chain
      extractThinkingFromChain(chain)
      currentAgentChainId.value = exchangeId
      return true
    }
    fetchAgentChainByExchangeId(exchangeId)
    return false
  }

  async function fetchAgentChainByExchangeId(exchangeId: string): Promise<boolean> {
    try {
      const resp = await chatApi.agentChain(exchangeId)
      const chain = resp.agentChain as AgentNode[]
      if (chain && chain.length > 0) {
        agentChainByExchangeId.value = { ...agentChainByExchangeId.value, [exchangeId]: chain }
        agentChain.value = chain
        extractThinkingFromChain(chain)
        currentAgentChainId.value = exchangeId
        return true
      }
    } catch {
      // chain not found
    }
    return false
  }

  function setSessionId(sessionId: string | null) {
    currentSessionId.value = sessionId
    saveSessionId(sessionId)
  }

  function clearMessages() {
    messages.value = []
    agentChain.value = []
    exchanges.value = []
    agentChainHistory.value = {}
    agentChainByExchangeId.value = {}
    currentAgentChainId.value = null
    dagNodes.value = []
    dagEdges.value = []
    selectedMsgIds.value = new Set()
    focusedMsgId.value = null
    setSessionId(null)
    inputPosition.value = 'center'
  }

  function startProcessing() {
    isProcessing.value = true
  }

  function stopProcessing() {
    isProcessing.value = false
  }

  // New methods for dual-column layout

  async function loadChatList(userId: string) {
    try {
      chatList.value = await chatApi.list(userId)
    } catch (e) {
      console.error('[sessionStore] loadChatList failed:', e)
    }
  }

  async function deleteSession(sessionId: string): Promise<boolean> {
    try {
      await chatApi.deleteSession(sessionId)
      chatList.value = chatList.value.filter(c => c.sessionId !== sessionId)
      if (currentSessionId.value === sessionId) {
        clearMessages()
      }
      return true
    } catch (e) {
      console.error('[sessionStore] deleteSession failed:', e)
      return false
    }
  }

  async function loadExchanges(sessionId: string, userId: string) {
    isLoadingExchanges.value = true
    try {
      const result = await chatApi.exchanges(sessionId, userId)
      exchanges.value = result.exchanges
    } catch (e) {
      console.error('[sessionStore] loadExchanges failed:', e)
    } finally {
      isLoadingExchanges.value = false
    }
  }

  async function loadDag(sessionId: string, userId: string) {
    isLoadingDag.value = true
    try {
      const result = await chatApi.dag(sessionId, userId)
      dagNodes.value = result.nodes
      dagEdges.value = result.edges
      // 清理已不存在消息的勾选状态
      const alive = new Set(result.nodes.map(n => n.msgId))
      const next = new Set([...selectedMsgIds.value].filter(id => alive.has(id)))
      if (next.size !== selectedMsgIds.value.size) selectedMsgIds.value = next
    } catch (e) {
      console.error('[sessionStore] loadDag failed:', e)
    } finally {
      isLoadingDag.value = false
    }
  }

  function setCitation(text: string, sourceMsgId: string) {
    citationBuffer.value = { text, sourceMsgId }
  }

  function clearCitation() {
    citationBuffer.value = null
  }

  function toggleMsgSelection(msgId: string) {
    const next = new Set(selectedMsgIds.value)
    if (next.has(msgId)) {
      next.delete(msgId)
    } else {
      next.add(msgId)
    }
    selectedMsgIds.value = next
  }

  function clearMsgSelection() {
    selectedMsgIds.value = new Set()
  }

  function focusMessage(msgId: string) {
    focusedMsgId.value = msgId
  }

  function setFocusedMsgId(msgId: string) {
    focusedMsgId.value = msgId
  }

  async function loadChatHistory(sessionId: string, userId: string, page: number = 1, pageSize: number = 100) {
    isLoadingHistory.value = true
    try {
      const result = await chatApi.history(sessionId, userId, page, pageSize)
      // Map API response to Message format
      messages.value = result.messages.map(msg => ({
        id: msg.id,
        userId,
        content: msg.content,
        role: msg.role as Message['role'],
        timestamp: msg.createdAt,
        sessionId: msg.sessionId,
        exchangeId: msg.exchangeId,
        msgId: msg.msgId,
        summary: msg.summary,
        referenceCount: msg.referenceCount,
      }))
      setSessionId(sessionId)
      inputPosition.value = 'bottom'

      // Restore thinking records from the last assistant message's agent chain
      const lastAssistant = [...messages.value].reverse().find(m => m.role === 'assistant')
      if (lastAssistant?.exchangeId) {
        fetch(`/api/chat/agent-chain/${lastAssistant.exchangeId}`)
          .then(r => r.json())
          .then(data => {
            if (data.agentChain?.length) {
              storeAgentChainByExchangeId(lastAssistant.exchangeId!, data.agentChain)
            }
          })
          .catch(() => {})
      }
    } catch (e) {
      console.error('[sessionStore] loadChatHistory failed:', e)
    } finally {
      isLoadingHistory.value = false
    }
  }

  function setSplitRatio(ratio: number) {
    splitRatio.value = ratio
    saveSplitRatio(ratio)
  }

  let currentExchangeId: string | null = null

  function setCurrentExchangeId(id: string) {
    currentExchangeId = id
  }

  async function cancelCurrentTask() {
    if (!currentExchangeId) return
    try {
      await fetch(`/api/chat/cancel/${currentExchangeId}`, { method: 'POST' })
    } catch { /* ignore */ }
  }

  return {
    messages,
    agentChain,
    agentChainHistory,
    agentChainByExchangeId,
    currentAgentChainId,
    isProcessing,
    inputPosition,
    exchanges,
    chatList,
    splitRatio,
    currentSessionId,
    isLoadingExchanges,
    isLoadingHistory,
    dagNodes,
    dagEdges,
    isLoadingDag,
    selectedMsgIds,
    focusedMsgId,
    groupedMessages,
    addMessage,
    updateMessage,
    addAgentFromServer,
    addAgentOutput,
    updateAgentStatus,
    storeAgentChain,
    loadAgentChainForMessage,
    storeAgentChainByExchangeId,
    loadAgentChainByExchangeId,
    fetchAgentChainByExchangeId,
    currentThinkingRecords,
    addThinkingRecord,
    clearThinkingRecords,
    clearMessages,
    startProcessing,
    stopProcessing,
    loadChatList,
    deleteSession,
    loadExchanges,
    loadDag,
    toggleMsgSelection,
    setFocusedMsgId,
    setCitation,
    clearCitation,
    citationBuffer,
    clearMsgSelection,
    focusMessage,
    loadChatHistory,
    setSessionId,
    setSplitRatio,
    cancelCurrentTask,
    setCurrentExchangeId,
  }
})