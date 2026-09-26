import { ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useChatUiStore } from '@/stores/chatUi'
import { answerPermission, answerUserAsk } from '@/api'
import type { AskUserCardData, Block, ChatMessage } from '@/api/types'
import { readSSE } from './useSSE'
import { createChatStreamEventHandler } from './chatStreamEvents'
import { newTraceId, TRACE_ID_HEADER } from '@/utils/trace'

const USER_ID = 'default-user'

interface SseInteractionOptions {
  url: string
  body: Record<string, unknown>
  botMsgId: string
  errorCode: string
  retryAvailable: boolean

  autoCloseThinkingOnError?: boolean
}

export function useChatStream() {
  const sessionStore = useSessionStore()
  const chatUi = useChatUiStore()
  const streamHandler = createChatStreamEventHandler(sessionStore, chatUi)

  const confirmingIntent = ref(false)

  const permitting = ref(false)

  const answeringAsk = ref(false)

  function addErrorBlock(botMsgId: string, message: string, errorCode: string, retryAvailable: boolean) {
    const errBlock: Block = {
      id: `block-err-${Date.now()}`,
      msgId: botMsgId,
      role: 'system',
      type: 'ErrorFallback',
      message,
      errorCode,
      retryAvailable,
      meta: { status: 'error', createdAt: Date.now(), updatedAt: Date.now() },
    } as Block
    sessionStore.addBlock(errBlock)
  }

  async function runSseInteraction(opts: SseInteractionOptions) {
    sessionStore.setStreaming(true)
    chatUi.resetPlanning()
    chatUi.resetAgentStatus()
    try {
      const abortCtrl = new AbortController()
      sessionStore.setCancelController(abortCtrl)

      const res = await fetch(opts.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [TRACE_ID_HEADER]: newTraceId(),
        },
        body: JSON.stringify(opts.body),
        signal: abortCtrl.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      await readSSE(res, (rawData) => streamHandler.handle(rawData as Record<string, unknown>, opts.botMsgId))
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        addErrorBlock(opts.botMsgId, err.message, opts.errorCode, opts.retryAvailable)
        if (opts.autoCloseThinkingOnError) chatUi.requestAutoCloseThinkingModal()
      }
    } finally {
      sessionStore.finalizeBlocks(opts.botMsgId)
      sessionStore.setStreaming(false)
      sessionStore.setCancelController(null)

      const sid = sessionStore.currentSessionId
      if (sid) {
        await sessionStore.loadDag(sid, USER_ID)
        await sessionStore.loadChatHistory(sid, USER_ID)
      }

      sessionStore.cleanupTransientTextBlocks(opts.botMsgId)
      sessionStore.clearSelection()
    }
  }

  async function handleSend(content: string, citingIds: string[]) {
    if (!content.trim()) return

    let sessionId: string
    try {
      sessionId = await sessionStore.ensureSession()
    } catch (err: unknown) {
      addErrorBlock(`msg-${Date.now()}-bot`, err instanceof Error ? err.message : '创建会话失败', 'SESSION_CREATE_FAILED', true)
      return
    }

    const selectedMsgIds = Array.from(sessionStore.selectedMsgIds)
    const combinedCitingIds = Array.from(new Set([...citingIds, ...selectedMsgIds]))

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      citingIds: combinedCitingIds,
    }
    sessionStore.addMessage(userMsg)

    streamHandler.reset(true)

    await runSseInteraction({
      url: '/api/chat/stream',
      body: {
        session_id: sessionId,
        msg_content: content,
        citing_msg_ids: combinedCitingIds,
        selected_msg_ids: selectedMsgIds,
      },
      botMsgId: `msg-${Date.now()}-bot`,
      errorCode: 'STREAM_ERROR',
      retryAvailable: true,
      autoCloseThinkingOnError: true,
    })
  }

  async function handleIntentConfirm(action: 'APPROVE' | 'KEEP' | 'CANCEL') {
    const conf = chatUi.intentConfirmation
    if (!conf || confirmingIntent.value) return
    confirmingIntent.value = true

    chatUi.clearIntentConfirmation()
    streamHandler.reset()

    try {
      await runSseInteraction({
        url: '/api/chat/confirm-intent',
        body: {
          session_id: conf.session_id,
          work_id: conf.work_id,
          action,
          understood_requirement: action === 'APPROVE' ? conf.understood_requirement : undefined,
        },
        botMsgId: `msg-${Date.now()}-confirm`,
        errorCode: 'CONFIRM_INTENT_FAILED',
        retryAvailable: false,
      })

      if (action === 'CANCEL') sessionStore.removeUserMessageByContent(conf.original_query)
    } finally {
      confirmingIntent.value = false
    }
  }

  async function handlePermissionConfirm(permission: ChatMessage['permission'], approved: boolean, remember = false) {
    if (!permission || permission.status !== 'pending' || permitting.value) return
    const msgId = `perm-${permission.permissionId}`
    permitting.value = true
    try {
      await answerPermission(permission.permissionId, approved, remember)
      sessionStore.updateMessage(msgId, {
        permission: { ...permission, status: approved ? 'allowed' : 'denied', answeredAt: Date.now() },
      })
    } catch {

    } finally {
      permitting.value = false
    }
  }

  async function handleAskUserAnswer(askUser: AskUserCardData, answer: string) {
    if (!askUser || askUser.status !== 'pending' || answeringAsk.value) return
    const msgId = `ask-${askUser.askId}`
    answeringAsk.value = true
    try {
      await answerUserAsk(askUser.askId, answer)
      sessionStore.updateMessage(msgId, {
        askUser: { ...askUser, status: 'answered', answeredAt: Date.now() },
      })
    } catch {

    } finally {
      answeringAsk.value = false
    }
  }

  return {
    confirmingIntent,
    permitting,
    answeringAsk,
    handleSend,
    handleIntentConfirm,
    handlePermissionConfirm,
    handleAskUserAnswer,
  }
}
