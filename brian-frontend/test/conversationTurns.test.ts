import { describe, it, expect } from 'vitest'
import type { Block, ChatMessage, ThinkingBlock } from '@/api/types'
import { groupConversationTurns, toChronologicalMessages } from '@/utils/conversationTurns'

function msg(id: string, role: ChatMessage['role'], timestamp: number, content = id): ChatMessage {
  return { id, role, content, timestamp }
}

function thinking(id: string, msgId: string, createdAt = 0): ThinkingBlock {
  return {
    id,
    msgId,
    role: 'assistant',
    type: 'ThinkingChain',
    content: '',
    summary: id,
    durationMs: 0,
    steps: [],
    meta: { status: 'done', createdAt, updatedAt: createdAt },
  }
}

describe('toChronologicalMessages', () => {
  it('把 lastN 的新→旧翻成旧→新', () => {
    const newestFirst = [msg('a2', 'assistant', 201), msg('u2', 'user', 200), msg('a1', 'assistant', 101), msg('u1', 'user', 100)]
    expect(toChronologicalMessages(newestFirst).map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2'])
  })
})

describe('groupConversationTurns', () => {
  it('按数组顺序保留全部问答轮次', () => {
    const messages = [
      msg('u1', 'user', 100, '问1'),
      msg('a1', 'assistant', 110, '答1'),
      msg('u2', 'user', 200, '问2'),
      msg('a2', 'assistant', 210, '答2'),
      msg('u3', 'user', 300, '问3'),
      msg('a3', 'assistant', 310, '答3'),
    ]
    const turns = groupConversationTurns(messages, [], false)
    expect(turns).toHaveLength(3)
    expect(turns.map((t) => t.user.content)).toEqual(['问1', '问2', '问3'])
    expect(turns.map((t) => t.assistant?.content)).toEqual(['答1', '答2', '答3'])
  })

  it('历史新→旧时仍按提问配对对应回复，不会只剩最后一轮', () => {
    const newestFirst = [
      msg('a3', 'assistant', 310, '答3'),
      msg('u3', 'user', 300, '问3'),
      msg('a2', 'assistant', 210, '答2'),
      msg('u2', 'user', 200, '问2'),
      msg('a1', 'assistant', 110, '答1'),
      msg('u1', 'user', 100, '问1'),
    ]
    const turns = groupConversationTurns(newestFirst, [], false)
    expect(turns).toHaveLength(3)
    expect(turns.map((t) => t.user.content)).toEqual(['问1', '问2', '问3'])
    expect(turns.map((t) => t.assistant?.content)).toEqual(['答1', '答2', '答3'])
  })

  it('timestamp 全部相同（同一秒）时仍按顺序一对一配对', () => {
    const newestFirst = [
      msg('a2', 'assistant', 1000, '答2'),
      msg('u2', 'user', 1000, '问2'),
      msg('a1', 'assistant', 1000, '答1'),
      msg('u1', 'user', 1000, '问1'),
    ]
    const turns = groupConversationTurns(newestFirst, [], false)
    expect(turns).toHaveLength(2)
    expect(turns[0].user.content).toBe('问1')
    expect(turns[0].assistant?.content).toBe('答1')
    expect(turns[1].user.content).toBe('问2')
    expect(turns[1].assistant?.content).toBe('答2')
  })

  it('思考块按 msgId 挂到对应轮次，不按 createdAt 时间窗', () => {
    const messages = [
      msg('u1', 'user', 100),
      msg('a1', 'assistant', 110),
      msg('u2', 'user', 200),
      msg('a2', 'assistant', 210),
    ]
    const blocks: Block[] = [
      thinking('t1', 'a1', 9999),
      thinking('t2', 'a2', 1),
    ]
    const turns = groupConversationTurns(messages, blocks, false)
    expect(turns[0].thinking.map((b) => b.id)).toEqual(['t1'])
    expect(turns[1].thinking.map((b) => b.id)).toEqual(['t2'])
  })

  it('流式中尚未落库的思考块挂到最后一轮', () => {
    const messages = [msg('u1', 'user', 100, '问1')]
    const blocks: Block[] = [thinking('live', 'msg-bot-temp', Date.now())]
    const turns = groupConversationTurns(messages, blocks, true)
    expect(turns).toHaveLength(1)
    expect(turns[0].live).toBe(true)
    expect(turns[0].thinking.map((b) => b.id)).toEqual(['live'])
  })
})
