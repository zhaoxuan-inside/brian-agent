/**
 * 将扁平消息列表收成「一轮提问 + 思考 + 回答」。
 *
 * 必须按消息数组顺序配对，不能用时间窗口：
 * - 历史接口 lastN 按 created DESC 返回（新→旧）；时间窗 [T_i, T_{i+1}) 在倒序下会变成空区间
 * - 同一秒内的问答 timestamp 相同，[T, T) 永远匹配不到回答，只剩最后一轮能挂上回复
 */

import type { Block, ChatMessage, ThinkingBlock } from '@/api/types'

export interface ConversationTurn {
  key: string
  user: ChatMessage
  assistant?: ChatMessage
  thinking: ThinkingBlock[]
  extras: Block[]
  live: boolean
}

function isUserMessage(m: ChatMessage): boolean {
  return m.role === 'user'
}

function isThinkingBlock(b: Block): b is ThinkingBlock {
  return b.type === 'ThinkingChain'
}

/** 历史若是新→旧，翻成旧→新，保证列表从上到下是对话时间线。 */
export function toChronologicalMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length < 2) return messages
  const first = Number(messages[0].timestamp) || 0
  const last = Number(messages[messages.length - 1].timestamp) || 0
  if (first > last) return [...messages].reverse()
  // timestamp 相同（同一秒）时无法靠大小判断；lastN DESC 典型形态是助手消息在前、用户消息在后
  if (
    first === last
    && !isUserMessage(messages[0])
    && isUserMessage(messages[messages.length - 1])
  ) {
    return [...messages].reverse()
  }
  return messages
}

export function groupConversationTurns(
  messages: ChatMessage[],
  blocks: Block[],
  isStreaming: boolean,
): ConversationTurn[] {
  const ordered = toChronologicalMessages(messages)
  const result: ConversationTurn[] = []
  let current: ConversationTurn | null = null

  for (const m of ordered) {
    if (isUserMessage(m)) {
      current = {
        key: m.id,
        user: m,
        thinking: [],
        extras: [],
        live: false,
      }
      result.push(current)
      continue
    }
    if (current && !current.assistant) {
      current.assistant = m
    }
  }

  if (result.length === 0) return result

  const used = new Set<string>()
  for (const turn of result) {
    const ids = new Set<string>([turn.user.id])
    if (turn.assistant) ids.add(turn.assistant.id)
    for (const b of blocks) {
      if (used.has(b.id) || !b.msgId || !ids.has(b.msgId)) continue
      used.add(b.id)
      if (isThinkingBlock(b)) turn.thinking.push(b)
      else turn.extras.push(b)
    }
  }

  const last = result[result.length - 1]
  last.live = isStreaming
  for (const b of blocks) {
    if (used.has(b.id)) continue
    used.add(b.id)
    if (isThinkingBlock(b)) last.thinking.push(b)
    else last.extras.push(b)
  }

  return result
}
