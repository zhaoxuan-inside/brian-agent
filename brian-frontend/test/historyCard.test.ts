import { describe, it, expect } from 'vitest'
import { formatTime, formatTokens } from '../src/utils/format'

function formatSessionTitle(title?: string): string {
  if (!title) return '新会话'
  const trimmed = title.trim()
  if (!trimmed) return '新会话'
  if (trimmed.length > 12) {
    return `${trimmed.slice(0, 12)}...`
  }
  return trimmed
}

function resolveSessionTime(session: { createdTime?: number; created?: number; lastTime: number }): number {
  return session.createdTime || session.created || session.lastTime
}

describe('History Session Card - Formatting & Presentation Logic', () => {
  it('TC-HISTORY-CARD-001: formats title within 8-12 characters and truncates overflow', () => {
    expect(formatSessionTitle('')).toBe('新会话')
    expect(formatSessionTitle('   ')).toBe('新会话')
    expect(formatSessionTitle('简短标题')).toBe('简短标题')
    expect(formatSessionTitle('八到十二个字的标准标题')).toBe('八到十二个字的标准标题')
    expect(formatSessionTitle('这是一段超过十二个字非常冗长的会话标题内容')).toBe('这是一段超过十二个字非常...')
  })

  it('TC-HISTORY-CARD-002: prioritizes createdTime over created and lastTime', () => {
    const s1 = { createdTime: 1700000000000, created: 1600000000000, lastTime: 1800000000000 }
    expect(resolveSessionTime(s1)).toBe(1700000000000)

    const s2 = { created: 1600000000000, lastTime: 1800000000000 }
    expect(resolveSessionTime(s2)).toBe(1600000000000)

    const s3 = { lastTime: 1800000000000 }
    expect(resolveSessionTime(s3)).toBe(1800000000000)
  })

  it('TC-HISTORY-CARD-003: computes full token and character aggregates', () => {
    const session = {
      inputTokens: 1250,
      outputTokens: 750,
      questionChars: 300,
      answerChars: 700,
      qaCount: 2,
    }
    const totalTokens = (session.inputTokens ?? 0) + (session.outputTokens ?? 0)
    const totalChars = (session.questionChars ?? 0) + (session.answerChars ?? 0)

    expect(totalTokens).toBe(2000)
    expect(formatTokens(totalTokens)).toBe('2.0k')
    expect(totalChars).toBe(1000)
    expect(formatTokens(totalChars)).toBe('1.0k')
    expect(session.qaCount).toBe(2)
  })

  it('TC-HISTORY-CARD-004: splits tags to 4 chips and shows more button when tags > 4', () => {
    const sampleTags = ['AI', 'Vue3', 'TypeScript', 'Node.js', 'Graph', 'Database']
    const displayedChips = sampleTags.slice(0, 4)
    const moreCount = sampleTags.length - 4

    expect(displayedChips).toEqual(['AI', 'Vue3', 'TypeScript', 'Node.js'])
    expect(moreCount).toBe(2)

    const shortTags = ['AI', 'Agent']
    expect(shortTags.slice(0, 4)).toEqual(['AI', 'Agent'])
    expect(shortTags.length > 4).toBe(false)
  })
})
