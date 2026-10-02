import { defineStore } from 'pinia'
import { ref, shallowRef, triggerRef } from 'vue'
import type { ChatMessage, ChatSession, ChatMapNode, ChatMapEdge, Block } from '@/api/types'
import { chatApi, visualizationApi } from '@/api'
import { layoutChatMap } from '@/utils/chatMapLayout'
import { buildMessageGraph } from '@/utils/messageGraph'
import { useChatUiStore } from './chatUi'

export const useSessionStore = defineStore('session', () => {
  const currentSessionId = ref(localStorage.getItem('chat-current-session-id') || '')
  const messages = shallowRef<ChatMessage[]>([])
  const blocks = shallowRef<Block[]>([])
  const chatList = ref<ChatSession[]>([])
  const chatMapNodes = ref<ChatMapNode[]>([])
  const chatMapEdges = ref<ChatMapEdge[]>([])
  const splitRatio = ref(parseFloat(localStorage.getItem('chat-split-ratio') || '0.65'))
  const isStreaming = ref(false)
  const cancelToken = ref<AbortController | null>(null)
  const currentRunId = ref('')
  const selectedMsgIds = ref<Set<string>>(new Set())
  const pinnedMsgIds = ref<Set<string>>(new Set())
  const citingMode = ref(false)

  const focusInfoId = ref<string | null>(null)
  const centerInfoId = ref<string | null>(null)
  const followInfoId = ref<string | null>(null)
  let pendingRaf: number | null = null

  function setSplitRatio(ratio: number) {
    splitRatio.value = Math.max(0.2, Math.min(0.8, ratio))
    localStorage.setItem('chat-split-ratio', String(splitRatio.value))
  }

  async function loadChatList(userId: string) {
    const data = await chatApi.list(userId)
    chatList.value = data.sessions
  }

  async function ensureSession(): Promise<string> {
    if (currentSessionId.value) {

      try {
        await chatApi.getSessionDetail(currentSessionId.value)
        return currentSessionId.value
      } catch {

      }
    }
    const created = await chatApi.createSession()
    currentSessionId.value = created.session_id
    localStorage.setItem('chat-current-session-id', created.session_id)
    return created.session_id
  }

  async function loadChatHistory(sessionId: string, userId: string, lastN?: number) {
    currentSessionId.value = sessionId
    localStorage.setItem('chat-current-session-id', sessionId)
    const historyMsgs = await chatApi.history(sessionId, userId, lastN)
    messages.value = historyMsgs
    // ADR-013：历史思考过程不再随消息下发 blocks，改为按需经 /chat/observation 重放
    blocks.value = []
    triggerRef(blocks)
  }

  async function loadDag(sessionId: string, _userId: string) {
    try {

      const result = await visualizationApi.messageDAG({
        session_id: sessionId,
        include_question_answer_edges: true,
        include_citation_edges: true,
      })
      const { nodes, edges } = buildMessageGraph(
        (result.graph?.nodes ?? []) as Array<Record<string, unknown>>,
        (result.graph?.edges ?? []) as Array<Record<string, unknown>>,
      )

      layoutChatMap(nodes, edges)

      chatMapNodes.value = nodes
      chatMapEdges.value = edges
    } catch {  }
  }

  async function togglePin(infoId: string) {
    const nextSet = new Set(pinnedMsgIds.value)
    let isPinned = false
    if (nextSet.has(infoId)) {
      nextSet.delete(infoId)
      isPinned = false
    } else {
      nextSet.add(infoId)
      isPinned = true
    }
    pinnedMsgIds.value = nextSet

    const node = chatMapNodes.value.find(n => n.infoId === infoId)
    if (node) node.pin = isPinned

    const msgIdx = messages.value.findIndex(m => m.id === infoId || (m as any).infoId === infoId)
    if (msgIdx >= 0) {
      const updated = [...messages.value]
      updated[msgIdx] = { ...updated[msgIdx], pin: isPinned }
      messages.value = updated
    }

    try {
      chatApi.pinMessage(infoId).catch(() => {})
    } catch { }

    return isPinned
  }

  async function deleteSession(sessionId: string) {
    await chatApi.deleteSession(sessionId)
    chatList.value = chatList.value.filter(c => c.sessionId !== sessionId)
    if (sessionId === currentSessionId.value) {
      clearMessages()
    }
  }

  async function deleteSessions(sessionIds: string[]) {
    const ids = sessionIds.filter(Boolean)
    if (ids.length === 0) return
    await chatApi.deleteSessions(ids)
    const idSet = new Set(ids)
    chatList.value = chatList.value.filter(c => !idSet.has(c.sessionId))
    if (currentSessionId.value && idSet.has(currentSessionId.value)) {
      clearMessages()
    }
  }

  function clearMessages() {
    messages.value = []
    blocks.value = []
    triggerRef(blocks)
    chatMapNodes.value = []
    chatMapEdges.value = []
    currentSessionId.value = ''
    selectedMsgIds.value = new Set()
    pinnedMsgIds.value = new Set()
    citingMode.value = false
    focusInfoId.value = null
    centerInfoId.value = null
    followInfoId.value = null
    useChatUiStore().resetObservation()
    localStorage.removeItem('chat-current-session-id')
  }

  function addMessage(msg: ChatMessage) {
    messages.value = [...messages.value, msg]
  }

  function updateMessage(msgId: string, updates: Partial<ChatMessage>) {
    const idx = messages.value.findIndex(m => m.id === msgId)
    if (idx < 0) return
    const next = [...messages.value]
    next[idx] = { ...next[idx], ...updates }
    messages.value = next
  }

  function addBlock(block: Block) {
    const existing = blocks.value.findIndex(b => b.id === block.id)
    if (existing >= 0) {
      blocks.value[existing] = block
    } else {
      blocks.value.push(block)
    }
    triggerRef(blocks)
  }

  function updateBlock(blockId: string, updates: Partial<Block>) {
    const idx = blocks.value.findIndex(b => b.id === blockId)
    if (idx >= 0) {
      blocks.value[idx] = { ...blocks.value[idx], ...updates } as Block
      triggerRef(blocks)
    }
  }

  function appendBlockContent(blockId: string, text: string) {
    const idx = blocks.value.findIndex(b => b.id === blockId)
    if (idx >= 0) {
      const block = blocks.value[idx]
      if ('content' in block) {
        (block as { content: string }).content += text
        if (!pendingRaf) {
          pendingRaf = requestAnimationFrame(() => {
            pendingRaf = null
            triggerRef(blocks)
          })
        }
      }
    }
  }

  function finalizeBlocks(msgId: string) {
    if (pendingRaf !== null) {
      cancelAnimationFrame(pendingRaf)
      pendingRaf = null
    }
    for (let i = 0; i < blocks.value.length; i++) {
      if (blocks.value[i].msgId === msgId) {
        blocks.value[i] = { ...blocks.value[i], meta: { ...blocks.value[i].meta, status: 'done' as const } } as Block
      }
    }
    triggerRef(blocks)
  }

  function cleanupTransientTextBlocks(msgId: string) {
    const filtered = blocks.value.filter(b => !(b.msgId === msgId && b.type === 'TextParagraph'))
    if (filtered.length !== blocks.value.length) {
      blocks.value.length = 0
      blocks.value.push(...filtered)
      triggerRef(blocks)
    }
  }

  function toggleMsgSelection(msgId: string) {
    const next = new Set(selectedMsgIds.value)
    if (next.has(msgId)) next.delete(msgId)
    else next.add(msgId)
    selectedMsgIds.value = next
  }

  function toggleCitingMode() {
    citingMode.value = !citingMode.value
  }

  function clearSelection() {
    selectedMsgIds.value = new Set()
  }

  function triggerFocus(infoId: string) {
    focusInfoId.value = infoId
  }

  function triggerCenter(infoId: string) {
    centerInfoId.value = infoId
  }

  function setFollowInfoId(infoId: string) {
    followInfoId.value = infoId
  }

  function setStreaming(streaming: boolean) {
    isStreaming.value = streaming
  }

  function setCancelController(ctrl: AbortController | null) {
    cancelToken.value = ctrl
  }

  function setCurrentRunId(runId: string) {
    currentRunId.value = runId
  }

  function cancelCurrentTask() {
    // 先通知后端中止 run（真正的取消），再断开本地 SSE 连接
    if (currentRunId.value) {
      chatApi.cancelTask(currentRunId.value).catch(() => { /* 后端中止失败不阻塞本地断开 */ })
    }
    currentRunId.value = ''
    cancelToken.value?.abort()
    cancelToken.value = null
    isStreaming.value = false
  }

  return {
    currentSessionId, messages, blocks, chatList, chatMapNodes, chatMapEdges,
    splitRatio, isStreaming, selectedMsgIds, pinnedMsgIds, citingMode,
    focusInfoId, centerInfoId, followInfoId,
    setSplitRatio, loadChatList, ensureSession, loadChatHistory, loadDag,
    deleteSession, deleteSessions, clearMessages, addMessage, updateMessage, addBlock,
    updateBlock, appendBlockContent, finalizeBlocks, cleanupTransientTextBlocks, toggleMsgSelection,
    toggleCitingMode, clearSelection, togglePin, triggerFocus, triggerCenter, setFollowInfoId,
    setStreaming, setCancelController, setCurrentRunId, cancelCurrentTask,
    currentRunId,
  }
})
