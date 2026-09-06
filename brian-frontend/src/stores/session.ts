import { defineStore } from 'pinia'
import { ref, shallowRef, triggerRef } from 'vue'
import type { ChatMessage, ChatSession, ChatMapNode, ChatMapEdge, Block } from '@/api/types'
import { chatApi, visualizationApi } from '@/api'
import { layoutChatMap } from '@/utils/chatMapLayout'
import { buildMessageGraph } from '@/utils/messageGraph'
import { useChatUiStore } from './chatUi'

/**
 * 会话数据 store：会话/消息/块/图谱数据与流式任务生命周期。
 * 交互 UI 状态（思考弹窗/Planning/Agent 运行时/评估与确认弹窗）见 stores/chatUi.ts。
 */
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
  const currentWorkId = ref<string | null>(null)
  const selectedMsgIds = ref<Set<string>>(new Set())
  const citingMode = ref(false)
  // ChatMap 与对话列表双向定位：focusInfoId 由 ChatMap 触发滚动列表，centerInfoId 由列表触发平移 ChatMap
  const focusInfoId = ref<string | null>(null)
  const centerInfoId = ref<string | null>(null)
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
      // 校验本地缓存的会话是否真实存在于后端，避免使用失效/本地伪造的 session_id
      try {
        await chatApi.getSessionDetail(currentSessionId.value)
        return currentSessionId.value
      } catch {
        /* 会话已不存在，落入下方创建新会话 */
      }
    }
    const created = await chatApi.createSession()
    currentSessionId.value = created.session_id
    localStorage.setItem('chat-current-session-id', created.session_id)
    return created.session_id
  }

  // ===== loadChatHistory：加载历史消息并提取恢复各 Agent 的 ThinkingBlocks =====
  async function loadChatHistory(sessionId: string, userId: string) {
    currentSessionId.value = sessionId
    localStorage.setItem('chat-current-session-id', sessionId)
    const historyMsgs = await chatApi.history(sessionId, userId)
    messages.value = historyMsgs

    // 从消息记录的 blocks 数组中恢复 ThinkingBlocks
    const loadedBlocks: Block[] = []
    for (const msg of historyMsgs) {
      if (Array.isArray(msg.blocks) && msg.blocks.length > 0) {
        for (const b of msg.blocks) {
          loadedBlocks.push(b)
        }
      }
    }
    blocks.value = loadedBlocks
    triggerRef(blocks)
  }

  async function loadDag(sessionId: string, _userId: string) {
    try {
      // ChatMap 展示消息关系图谱（一问一答 + 引用），而非 Agent 执行 DAG；
      // 原始图 → 展示模型装配见 utils/messageGraph（纯函数）。
      const result = await visualizationApi.messageDAG({
        session_id: sessionId,
        include_question_answer_edges: true,
        include_citation_edges: true,
      })
      const { nodes, edges } = buildMessageGraph(
        (result.graph?.nodes ?? []) as Array<Record<string, unknown>>,
        (result.graph?.edges ?? []) as Array<Record<string, unknown>>,
      )

      // ===== 布局：顺序问答纵向排布、引用问答横向展开 =====
      // 布局算法抽离至 @/utils/chatMapLayout（纯函数，便于单元测试）：
      // - QUESTION_ANSWER / FOLLOW_UP：纵向排布（回答/追问在提问正下方）
      // - CITATION：引用方放在被引用方右边，且与被引用消息中最靠下的一个顶部对齐
      layoutChatMap(nodes, edges)

      chatMapNodes.value = nodes
      chatMapEdges.value = edges
    } catch { /* ignore */ }
  }

  async function togglePin(infoId: string) {
    try {
      const res = await chatApi.pinMessage(infoId)
      const node = chatMapNodes.value.find(n => n.infoId === infoId)
      if (node) node.pin = res.pin
      return res.pin
    } catch { return false }
  }

  async function deleteSession(sessionId: string) {
    await chatApi.deleteSession(sessionId)
    chatList.value = chatList.value.filter(c => c.sessionId !== sessionId)
    if (sessionId === currentSessionId.value) {
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
    citingMode.value = false
    useChatUiStore().resetWorkflowState()
    localStorage.removeItem('chat-current-session-id')
  }

  function addMessage(msg: ChatMessage) {
    messages.value = [...messages.value, msg]
  }

  // 按内容（从后往前）定位最近一条用户消息并移除（取消需求理解时丢弃用户原始输入）
  function removeUserMessageByContent(originalContent: string) {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i]
      if (m.role === 'user' && m.content === originalContent) {
        messages.value = [...messages.value.slice(0, i), ...messages.value.slice(i + 1)]
        return
      }
    }
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

  // ===== 最终回复开始流式输出时，将仍处于 streaming 的思考块收敛为 done =====
  // 思考块（ThinkingChain）此前仅在 done 事件才被 finalizeBlocks 置为 done，
  // 但最终回复（text_chunk）在 done 之前就开始流式输出，导致「思考过程」弹窗
  // 在系统回复已展示时仍因残留 streaming 状态而显示「思考中...」。
  function finalizeThinkingBlocks(msgId: string) {
    let changed = false
    for (let i = 0; i < blocks.value.length; i++) {
      const b = blocks.value[i]
      if (b.msgId === msgId && b.type === 'ThinkingChain' && b.meta?.status === 'streaming') {
        blocks.value[i] = { ...b, meta: { ...b.meta, status: 'done' as const } } as Block
        changed = true
      }
    }
    if (changed) triggerRef(blocks)
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

  function setStreaming(streaming: boolean) {
    isStreaming.value = streaming
  }

  function setCancelController(ctrl: AbortController | null) {
    cancelToken.value = ctrl
  }

  function setCurrentWorkId(workId: string | null) {
    currentWorkId.value = workId
  }

  async function cancelCurrentTask() {
    cancelToken.value?.abort()
    cancelToken.value = null
    isStreaming.value = false
    const workId = currentWorkId.value
    if (workId) {
      try {
        await chatApi.cancelTask(workId)
      } catch { /* best-effort */ }
      currentWorkId.value = null
    }
  }

  return {
    currentSessionId, currentWorkId, messages, blocks, chatList, chatMapNodes, chatMapEdges,
    splitRatio, isStreaming, selectedMsgIds, citingMode,
    focusInfoId, centerInfoId,
    setSplitRatio, loadChatList, ensureSession, loadChatHistory, loadDag,
    deleteSession, clearMessages, addMessage, removeUserMessageByContent, addBlock,
    updateBlock, appendBlockContent, finalizeBlocks, finalizeThinkingBlocks, cleanupTransientTextBlocks, toggleMsgSelection,
    toggleCitingMode, clearSelection, togglePin, triggerFocus, triggerCenter,
    setStreaming, setCancelController, setCurrentWorkId, cancelCurrentTask,
  }
})
