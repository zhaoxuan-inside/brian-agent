import type { Block, TextBlock } from '@/api/types'
import type { useSessionStore } from '@/stores/session'
import type { useChatUiStore } from '@/stores/chatUi'
import { SseTransportEvent } from './sseEventTypes'

type ChatStore = ReturnType<typeof useSessionStore>
type ChatUiStore = ReturnType<typeof useChatUiStore>

/**
 * SSE 帧 → 观测总线（ADR-013）。
 * 业务事件 = 完整 TaskEvent：统一喂 chatUi reducer；本层只保留纯 UI 副作用
 * （弹窗开关、授权/提问卡、正文流式 block、收尾反馈卡）。
 */
export interface ChatStreamEventHandler {
  handle: (data: Record<string, unknown>, botMsgId: string) => void
  reset: (clearTrace?: boolean) => void
}

export function createChatStreamEventHandler(chat: ChatStore, ui: ChatUiStore): ChatStreamEventHandler {
  let textBlockId: string | null = null

  function ensureTextBlock(botMsgId: string): string {
    if (textBlockId) return textBlockId
    textBlockId = `block-text-${botMsgId}`
    const textBlock: TextBlock = {
      id: textBlockId,
      msgId: botMsgId,
      role: 'assistant',
      type: 'TextParagraph',
      content: '',
      meta: { status: 'streaming', createdAt: Date.now(), updatedAt: Date.now() },
    }
    chat.addBlock(textBlock as Block)
    return textBlockId
  }

  function appendReplyText(botMsgId: string, delta: string, replace = false): void {
    if (!delta) return
    const id = ensureTextBlock(botMsgId)
    if (replace) {
      chat.updateBlock(id, { content: delta, meta: { status: 'streaming', createdAt: Date.now(), updatedAt: Date.now() } } as Partial<Block>)
      return
    }
    chat.appendBlockContent(id, delta)
  }

  function handleBusinessEvent(botMsgId: string, ev: Record<string, unknown>): void {
    const type = String(ev.type)
    const payload = (ev.payload ?? {}) as Record<string, unknown>
    switch (type) {
      case 'run.accepted':
      case 'run.started':
        ui.setRunActive(true)
        ui.ensureLiveThinking()
        break
      case 'reply.created':
        break
      case 'reply.delta':
        appendReplyText(botMsgId, String(payload.delta ?? ''), payload.replace === true)
        break
      case 'permission.asked':
        addPermissionMessage(botMsgId, payload)
        ui.ensureLiveThinking()
        break
      case 'permission.answered':
        settlePermissionMessage(payload)
        break
      case 'run.finished':
      case 'run.failed':
        onRunSettled(payload)
        break
      default:
        break
    }
    ui.applyEvent(ev)
  }

  function onRunSettled(payload: Record<string, unknown>): void {
    ui.setRunActive(false)
    if (String(payload.stop_reason ?? '') === 'error') return
    // SSE 已覆盖 run 全部事件（writer.completed 先于 run.finished），observation 即最终态；按节奏自动关闭弹窗
    ui.requestAutoCloseThinkingModal()
  }

  function addPermissionMessage(botMsgId: string, payload: Record<string, unknown>): void {
    const permissionId = String(payload.permission_id ?? '')
    if (!permissionId) return
    const isAskUser = payload.kind === 'confirm' || payload.kind === 'clarify'
    const msgId = isAskUser ? `ask-${permissionId}` : `perm-${permissionId}`
    if (chat.messages.some((m) => m.id === msgId)) return
    if (isAskUser) {
      chat.addMessage({
        id: msgId, role: 'assistant', content: '', timestamp: Date.now(),
        askUser: { askId: permissionId, question: String(payload.input ?? ''), kind: payload.kind === 'confirm' ? 'confirm' : 'clarify', status: 'pending', askedAt: Date.now() },
      })
      return
    }
    chat.addMessage({
      id: msgId, role: 'assistant', content: '', timestamp: Date.now(),
      permission: {
        permissionId,
        toolId: String(payload.skill_id ?? payload.tool_id ?? 'skill'),
        input: payload.input ?? {},
        status: 'pending',
        askedAt: Date.now(),
        runId: String(payload.run_id ?? ''),
      },
    })
  }

  function settlePermissionMessage(payload: Record<string, unknown>): void {
    const permissionId = String(payload.permission_id ?? '')
    if (!permissionId) return
    const msg = chat.messages.find((m) => m.id === `perm-${permissionId}`)
    if (!msg?.permission || msg.permission.status !== 'pending') return
    chat.updateMessage(`perm-${permissionId}`, {
      permission: { ...msg.permission, status: payload.approved === false ? 'denied' : 'allowed', answeredAt: Date.now() },
    })
  }

  function addFeedbackBlock(botMsgId: string, payload: Record<string, unknown>): void {
    const feedbackBlock: Block = {
      id: `block-fb-${Date.now()}`,
      msgId: botMsgId,
      role: 'assistant',
      type: 'Feedback',
      traceId: String(payload.trace_id ?? ''),
      runId: String(payload.run_id ?? ''),
      workId: String(payload.work_id ?? ''),
      sessionId: chat.currentSessionId || '',
      meta: { status: 'done', createdAt: Date.now(), updatedAt: Date.now() },
    } as Block
    chat.addBlock(feedbackBlock)
  }

  function addErrorBlock(botMsgId: string, payload: Record<string, unknown>): void {
    const errBlock: Block = {
      id: `block-err-${Date.now()}`,
      msgId: botMsgId,
      role: 'system',
      type: 'ErrorFallback',
      message: String(payload.error_message ?? payload.error ?? '未知错误'),
      errorCode: String(payload.error_code ?? ''),
      retryAvailable: false,
      meta: { status: 'error', createdAt: Date.now(), updatedAt: Date.now() },
    } as Block
    chat.addBlock(errBlock)
    ui.setRunActive(false)
    ui.requestAutoCloseThinkingModal()
  }

  return {
    handle(data, botMsgId) {
      const isStructured = 'msg_id' in data && 'event' in data
      if (!isStructured) {
        // 传输层扁平帧（connected/loading/done/error）保持原语义
        const event = String(data.event ?? '')
        if (event === SseTransportEvent.Done) {
          chat.finalizeBlocks(botMsgId)
          if (!data.paused) addFeedbackBlock(botMsgId, data)
          textBlockId = null
        } else if (event === 'error.occurred') {
          addErrorBlock(botMsgId, data)
        }
        return
      }
      const ev = data.data as Record<string, unknown>
      handleBusinessEvent(botMsgId, ev ?? {})
    },
    reset() {
      textBlockId = null
      ui.resetObservation()
    },
  }
}
