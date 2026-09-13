import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '../src/stores/session'
import { useChatUiStore } from '../src/stores/chatUi'
import { createChatStreamEventHandler } from '../src/composables/chatStreamEvents'
import type { ThinkingBlock } from '../src/api/types'

describe('chatStreamEvents - 思考过程流式事件与时间线', () => {
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
  })

  it('应当正确复用思考块，避免意图识别与选择阶段创建多个割裂的执行Agent块', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-123'

    // 1. 意图分析事件到达（早期无 agentId）
    handler.handle(
      {
        event: 'intent.analyzed',
        score: 100,
        adopted: true,
        reason: '用户想出去溜达',
        agent_id: 'w2-general-12345678',
      },
      botMsgId,
    )

    expect(session.blocks.length).toBe(1)
    const firstBlock = session.blocks[0] as ThinkingBlock
    expect(firstBlock.type).toBe('ThinkingChain')
    expect(firstBlock.content).toContain('[意图分析] 打分 100（采纳）')

    // 2. 命中 Agent 事件到达
    handler.handle(
      {
        event: 'agent.selected',
        agent_name: 'w2-general-专业助手-fa0f8c2e',
        matched_by: 'llm',
      },
      botMsgId,
    )

    // 应复用同一个 ThinkingBlock，而不是新建一个
    expect(session.blocks.length).toBe(1)
    const updatedBlock = session.blocks[0] as ThinkingBlock
    expect(updatedBlock.agentInfo?.name).toBe('w2-general-专业助手-fa0f8c2e')
    expect(updatedBlock.content).toContain('[Agent 匹配]')

    // 3. 深度思考增量到达
    handler.handle(
      {
        event: 'think.delta',
        delta: '正在分析散步路线与场所...',
      },
      botMsgId,
    )

    expect(session.blocks.length).toBe(1)
    expect(session.blocks[0].content).toContain('正在分析散步路线与场所...')
  })

  it('实时流式期间应当保持单 ThinkingBlock，且文字增量能正确累加', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-456'

    handler.handle({ event: 'intent.analyzed', score: 95, adopted: true }, botMsgId)
    handler.handle({ event: 'agent.selected', agent_name: '研究助手' }, botMsgId)
    handler.handle({ event: 'think.delta', delta: '第一段思考。' }, botMsgId)
    handler.handle({ event: 'think.delta', delta: '第二段思考。' }, botMsgId)

    expect(session.blocks.length).toBe(1)
    const block = session.blocks[0] as ThinkingBlock
    expect(block.agentInfo?.name).toBe('研究助手')
    expect(block.content).toContain('第一段思考。第二段思考。')
  })

  it('实时流式时间线应当严格按照受理→意图→选择→装配→上下文→深度思考顺序推进', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-789'

    // 1. run.accepted 受理
    handler.handle({ event: 'run.accepted', run_id: 'run-test-123' }, botMsgId)
    expect(ui.liveTimeline.length).toBe(1)
    expect(ui.liveTimeline[0].title).toBe('开始受理请求')

    // 2. intent.analyzed 意图识别
    handler.handle({ event: 'intent.analyzed', score: 100, adopted: true, reason: '用户想散步' }, botMsgId)
    expect(ui.liveTimeline.length).toBe(2)
    expect(ui.liveTimeline[1].title).toContain('需求确认 / 意图分析')

    // 3. agent.selected 选中 Agent
    handler.handle({ event: 'agent.selected', agent_name: '散步推荐专家', matched_by: 'llm' }, botMsgId)
    expect(ui.liveTimeline.length).toBe(3)
    expect(ui.liveTimeline[2].title).toBe('选中 Agent：散步推荐专家')

    // 4. agent.components 组件装配
    handler.handle({ event: 'agent.components', soul_id: 'soul-123', llm_id: 'gpt-4' }, botMsgId)
    expect(ui.liveTimeline.length).toBe(4)
    expect(ui.liveTimeline[3].title).toBe('组件装配完成')

    // 5. context.built 构建上下文
    handler.handle({
      event: 'context.built',
      round: 1,
      message_count: 1,
      system: '你是 Brian，一个专业助手。',
      messages: [{ role: 'user', content: '推荐去哪散步？' }],
    }, botMsgId)
    expect(ui.liveTimeline.length).toBe(5)
    expect(ui.liveTimeline[4].title).toBe('构建上下文：第 1 轮 · 1 条消息')
    expect(ui.liveTimeline[4].elapsedMs).toBe(1)
    // 实时上下文轮次应落库（供「基础上下文」轮次卡片定位 data-anchor=ctx-1）
    expect(ui.liveContextRounds.length).toBe(1)
    expect(ui.liveContextRounds[0]).toMatchObject({
      round: 1,
      targetKey: 'ctx-1',
      messageCount: 1,
    })
    expect(ui.liveContextRounds[0].messages[0]).toMatchObject({ role: 'user', content: '推荐去哪散步？' })

    // 6. think.delta 深度思考
    handler.handle({ event: 'think.delta', delta: '推荐去奥林匹克森林公园散步。' }, botMsgId)
    expect(ui.liveTimeline.length).toBe(6)
    expect(ui.liveTimeline[5].title).toContain('Agent 深度推理思考')

    // 7. run.finished 完成
    handler.handle({ event: 'run.finished', stop_reason: 'stop' }, botMsgId)
    expect(ui.liveTimeline.length).toBe(7)
    expect(ui.liveTimeline[6].title).toBe('执行完成')
  })

  it('intent.analyzed 命中 Agent 应展示名称、tooltip 携带原始 ID', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-intent'

    handler.handle({
      event: 'intent.analyzed',
      score: 100,
      adopted: true,
      reason: '任务明确询问天气，候选Agent中该Agent专门负责天气领域。',
      agent_id: 'eb154464-c43a-4c22-b8f9-b7ffe74320b7',
      agent_name: '天气查询专家',
    }, botMsgId)

    const item = ui.liveTimeline[ui.liveTimeline.length - 1]
    expect(item.title).toContain('需求确认 / 意图分析')
    // 名称写入深度思考块内容；原始 ID 仅经 tooltip 悬浮可见
    const block = session.blocks[0] as ThinkingBlock
    expect(block.content).toContain('→ 天气查询专家')
    expect(block.content).not.toContain('eb154464')
    expect(item.tooltip).toContain('eb154464-c43a-4c22-b8f9-b7ffe74320b7')
  })

  it('agent.components 时间线应展示组件名称（悬浮 tooltip 携带原始 ID）', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-abc'

    handler.handle({
      event: 'agent.components',
      soul_id: 'soul-123',
      soul_name: '专业助手人格',
      prompt_template_id: 'prompt-456',
      prompt_name: 'Brian 身份模板',
      llm_id: 'llm-789',
      llm_name: 'doubao-pro',
      skills: [{ id: 'skill-a', brief: '天气查询' }],
      mcps: [{ id: 'mcp-a', brief: '股票行情' }],
    }, botMsgId)

    const item = ui.liveTimeline[ui.liveTimeline.length - 1]
    expect(item.title).toBe('组件装配完成')
    expect(item.detail).toContain('Soul 专业助手人格')
    expect(item.detail).toContain('LLM doubao-pro')
    expect(item.detail).toContain('Prompt Brian 身份模板')
    expect(item.detail).not.toContain('Soul soul-123')
    expect(item.detail).not.toContain('LLM llm-789')
    // 原始组件 ID 通过 tooltip 悬浮可见
    expect(item.tooltip).toContain('soul-123')
    expect(item.tooltip).toContain('llm-789')
    expect(item.tooltip).toContain('skill-a')
  })

  it('context.built 多轮上下文轮次应按 round 去重累积，reset 清空', () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const ui = useChatUiStore()
    const handler = createChatStreamEventHandler(session, ui)
    const botMsgId = 'msg-bot-rounds'

    handler.handle({ event: 'context.built', round: 1, message_count: 2, messages: [{ role: 'user', content: '问A' }] }, botMsgId)
    handler.handle({ event: 'context.built', round: 2, message_count: 3, messages: [{ role: 'assistant', content: '答B' }] }, botMsgId)
    // 同一轮重复事件（工具轮次重发）不重复追加，保留最新内容
    handler.handle({ event: 'context.built', round: 1, message_count: 4, messages: [{ role: 'user', content: '问A（更新）' }] }, botMsgId)

    expect(ui.liveContextRounds.length).toBe(2)
    expect(ui.liveContextRounds.map((r) => r.round)).toEqual([1, 2])
    expect(ui.liveContextRounds[0].messageCount).toBe(4)
    expect(ui.liveContextRounds[0].messages[0].content).toBe('问A（更新）')
    expect(ui.liveContextRounds[1].targetKey).toBe('ctx-2')

    handler.reset()
    expect(ui.liveContextRounds.length).toBe(0)
  })
})
