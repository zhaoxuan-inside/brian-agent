import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '../src/stores/session'
import { useChatUiStore } from '../src/stores/chatUi'
import { createChatStreamEventHandler } from '../src/composables/chatStreamEvents'
import { makeTaskEvent, type TaskEvent } from '@brian-agent/shared'

/** ADR-013：SSE 结构化帧（data=完整 TaskEvent）→ reducer；本层只做 UI 副作用 */

let seq = 0
function evOf(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  seq += 1
  const ev: TaskEvent = makeTaskEvent({
    seq, ts: Date.now(), session_id: 'sess-test', run_id: 'run-test',
    work_id: 'run-test', type, payload,
  })
  return { msg_id: `m-${seq}`, event: type, data: ev as unknown as Record<string, unknown> }
}

describe('chatStreamEvents - 观测总线（ADR-013）', () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      const store: Record<string, string> = {}
      globalThis.localStorage = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v },
        removeItem: (k: string) => { delete store[k] },
        clear: () => { Object.keys(store).forEach(k => delete store[k]) },
        key: (_i: number) => null,
        length: 0,
      } as Storage
    }
    vi.restoreAllMocks()
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as unknown as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)) as unknown as typeof cancelAnimationFrame
  })

  it('业务事件统一喂 reducer：思考流累积、时间线推进、弹窗自动打开', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-1'

    handler.handle(evOf('run.accepted', { run_id: 'run-test' }), botMsgId)
    expect(ui.thinkingModalVisible).toBe(true)
    expect(ui.observation?.phase).toBe('accepted')

    handler.handle(evOf('intent.analyzed', { score: 100, adopted: true, agent_name: '天气专家' }), botMsgId)
    handler.handle(evOf('agent.selected', { agent_id: 'a-1', agent_name: '天气专家', matched_by: 'llm' }), botMsgId)
    handler.handle(evOf('think.delta', { delta: '第一段思考。' }), botMsgId)
    handler.handle(evOf('think.delta', { delta: '第二段思考。' }), botMsgId)

    expect(ui.observation?.summary.agentName).toBe('天气专家')
    expect(ui.observation?.thinking.rounds[0]?.text).toBe('第一段思考。第二段思考。')
    const titles = ui.observation!.timeline.map((t) => t.title)
    expect(titles.some((t) => t.includes('意图分析'))).toBe(true)
    expect(titles.some((t) => t.includes('选中 Agent：天气专家'))).toBe(true)
  })

  it('seq 幂等：历史重放与实时叠加合流不产生重复', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-2'

    handler.handle(evOf('run.accepted', { run_id: 'run-test' }), botMsgId)
    const duplicated = evOf('agent.selected', { agent_name: 'A' })
    handler.handle(duplicated, botMsgId)
    handler.handle(duplicated, botMsgId)

    expect(ui.observation!.timeline.filter((t) => t.type === 'agent.selected')).toHaveLength(1)
  })

  it('reply.delta 流式写入正文 block；replace 标记重置正文（Writer 接管）', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-3'

    handler.handle(evOf('reply.delta', { delta: '原始草稿' }), botMsgId)
    handler.handle(evOf('reply.delta', { delta: '排版后正文', replace: true }), botMsgId)
    handler.handle(evOf('reply.delta', { delta: '。' }), botMsgId)

    expect(session.blocks).toHaveLength(1)
    expect(session.blocks[0].type).toBe('TextParagraph')
    expect(session.blocks[0].content).toBe('排版后正文。')
  })

  it('permission.asked 生成待授权消息卡，answered 后落定状态', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-4'

    handler.handle(evOf('permission.asked', { permission_id: 'p-1', tool_id: 'skill_exec', input: { a: 1 } }), botMsgId)
    const permMsg = session.messages.find((m) => m.id === 'perm-p-1')
    expect(permMsg?.permission?.status).toBe('pending')

    handler.handle(evOf('permission.answered', { permission_id: 'p-1', approved: true }), botMsgId)
    expect(session.messages.find((m) => m.id === 'perm-p-1')?.permission?.status).toBe('allowed')
  })

  it('run.finished 收尾：finalize blocks + 反馈卡；done 扁平帧幂等不重复', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-5'

    handler.handle(evOf('reply.delta', { delta: '正文' }), botMsgId)
    handler.handle(evOf('run.finished', { stop_reason: 'stop' }), botMsgId)
    handler.handle({ event: 'session.done', run_id: 'run-test', trace_id: 't-1', paused: false }, botMsgId)

    expect(session.blocks.some((b) => b.type === 'Feedback')).toBe(true)
    expect(ui.observation?.phase).toBe('settled')
  })

  it('error.occurred 扁平帧生成错误块并关闭运行态', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-6'

    handler.handle({ event: 'error.occurred', error_message: '模型超时', error_code: 'TIMEOUT' }, botMsgId)
    const errBlock = session.blocks.find((b) => b.type === 'ErrorFallback')
    expect(errBlock).toBeTruthy()
    expect((errBlock as unknown as { message: string }).message).toBe('模型超时')
  })

  it('reset() 清空 observation 与正文块游标', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-7'

    handler.handle(evOf('reply.delta', { delta: 'x' }), botMsgId)
    handler.reset()
    expect(ui.observation).toBeNull()

    handler.handle(evOf('reply.delta', { delta: '新正文' }), botMsgId)
    expect(session.blocks.filter((b) => b.type === 'TextParagraph')).toHaveLength(1)
  })
})
