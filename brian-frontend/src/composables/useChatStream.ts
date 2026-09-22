/**
 * @fileoverview 对话区用户交互流编排：发送消息 / 需求理解确认 / 需求补充。
 *
 * 三条交互共用同一套 SSE 生命周期（置流式状态 → 带中断的流式请求 → 逐帧分发
 * → 收尾刷新图谱与历史），样板收敛在 runSseInteraction；事件 → 状态的映射
 * 委托给 chatStreamEvents。组件层（ChatArea）只保留视图编排。
 */
import { ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useChatUiStore } from '@/stores/chatUi'
import { answerPermission, answerUserAsk } from '@/api'
import type { AskUserCardData, Block, ChatMessage } from '@/api/types'
import { readSSE } from './useSSE'
import { createChatStreamEventHandler } from './chatStreamEvents'
import { newTraceId, TRACE_ID_HEADER } from '@/utils/trace'

/** 历史消息与 DAG 刷新使用的固定用户标识（与后端 demo 用户一致） */
const USER_ID = 'default-user'

interface SseInteractionOptions {
  url: string
  body: Record<string, unknown>
  botMsgId: string
  errorCode: string
  retryAvailable: boolean
  /** 流式失败时是否请求自动关闭思考弹窗（仅正常发送流程需要） */
  autoCloseThinkingOnError?: boolean
}

export function useChatStream() {
  const sessionStore = useSessionStore()
  const chatUi = useChatUiStore()
  const streamHandler = createChatStreamEventHandler(sessionStore, chatUi)

  // 需求确认 / 需求补充的提交中状态（防重复提交）
  const confirmingIntent = ref(false)
  /** 权限卡应答进行中（加载态） */
  const permitting = ref(false)
  /** ask_user 提问卡答复提交中（加载态） */
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

  /**
   * SSE 交互生命周期样板：置流式 → 重置 Planning 与 Agent 状态 → 带中断的
   * 流式请求 → 逐帧分发 → 收尾（finalize / 关流式 / 刷新 ChatMap 与历史 /
   * 清理流式期间的临时文本块与消息复选）。
   */
  async function runSseInteraction(opts: SseInteractionOptions) {
    sessionStore.setStreaming(true)
    chatUi.resetPlanning()
    chatUi.resetAgentStatus()
    try {
      const abortCtrl = new AbortController()
      sessionStore.setCancelController(abortCtrl)

      // ===== 修改后（2026-09-14 trace 溯源治理）：SSE 请求同样在源头生成 X-Trace-Id =====
      // ===== 原始方法（保留作为参考）=====
      // const res = await fetch(opts.url, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(opts.body),
      //   signal: abortCtrl.signal,
      // })
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
      // 一轮交互结束后刷新 ChatMap 与历史消息，展示最新图谱与引用关联，并重置复选。
      // 后端 confirmIntent（APPROVE）已同步更新 info_raw 的 REQUEST 消息内容，加载回来即为替换后的需求。
      const sid = sessionStore.currentSessionId
      if (sid) {
        await sessionStore.loadDag(sid, USER_ID)
        await sessionStore.loadChatHistory(sid, USER_ID)
      }
      // 清理流式期间生成的临时文本段落 Block，避免与后端加载回来的 ChatMessage 重复展示
      sessionStore.cleanupTransientTextBlocks(opts.botMsgId)
      sessionStore.clearSelection()
    }
  }

  /** 发送一条用户消息并流式接收回复 */
  async function handleSend(content: string, citingIds: string[]) {
    if (!content.trim()) return

    // 先在后端创建（或校验既有）会话，再以返回的 session_id 发起流式对话
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

    // trace_id 由后端经 ToolProvider 统一生成 UUID，经 connected 事件回传；
    // 前端不再自行生成（避免非安全上下文 fallback 产生非 UUID 格式）。
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

  /**
   * 需求理解确认：APPROVE 按理解执行 / KEEP 按原文执行 / CANCEL 取消并丢弃原始输入。
   * 立即关闭确认弹窗，SSE 流式完成后实时展示思考过程与系统回答，最后刷新历史。
   *
   * ===== 修改后（2026-09-11）：permission.asked 不再复用本卡片 =====
   * 权限卡改为独立 PermissionConfirmCard 插入对话区（chatStreamEvents.onPermissionAsked），
   * 应答走 handlePermissionConfirm；避免"按原文执行"被二次映射为拒绝的事故
   * （interact 2109c9a5，answerPermission(action === 'APPROVE')）。
   */
  async function handleIntentConfirm(action: 'APPROVE' | 'KEEP' | 'CANCEL') {
    const conf = chatUi.intentConfirmation
    if (!conf || confirmingIntent.value) return
    confirmingIntent.value = true
    // 立即关闭确认弹窗，避免后端同步重入编排（APPROVE/KEEP 会重新执行完整编排、耗时较长）期间弹窗长期停留
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
      // 保留原始需求：后端已移除 rewriteRequestInfo，不再用理解后的需求替换用户原始输入；
      // 取消时丢掉用户原始输入。
      if (action === 'CANCEL') sessionStore.removeUserMessageByContent(conf.original_query)
    } finally {
      confirmingIntent.value = false
    }
  }

  /** 需求补充提交：收集各澄清项答案并发起流式执行 */
  /**
   * 工具权限确认（对话区内联卡片应答）：允许 / 拒绝 / 始终允许 → answerPermission 唤醒挂起的 Loop。
   * 同时幂等更新本地卡片状态（pending → allowed/denied），落库由后端权限审计桥完成。
   */
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
      /* 保持 pending，允许用户继续点击 */
    } finally {
      permitting.value = false
    }
  }

  /**
   * ===== 新增（2026-09-22）：ask_user 提问卡答复：文本经 /api/chat/ask/answer 提交，
   * 唤醒挂起的 ask_user 工具（答复由后端落库为下一条 user 消息）；本地乐观翻转卡片状态，
   * 失败保持 pending 允许重试。后端 permission.answered 事件幂等兜底状态一致。
   */
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
      /* 保持 pending，允许用户重试 */
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
