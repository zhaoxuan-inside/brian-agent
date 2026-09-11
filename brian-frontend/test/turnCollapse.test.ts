import { describe, it, expect } from 'vitest'
import { isLongReply, previewReply, shouldCollapseTurn } from '@/utils/turnCollapse'

describe('isLongReply', () => {
  it('短回复不折叠', () => {
    expect(isLongReply('好的，已记下。')).toBe(false)
  })

  it('超过字数阈值视为长回复', () => {
    expect(isLongReply('字'.repeat(360))).toBe(true)
  })

  it('行数多也视为长回复', () => {
    expect(isLongReply(Array.from({ length: 8 }, (_, i) => `第${i + 1}行`).join('\n'))).toBe(true)
  })
})

describe('previewReply', () => {
  it('去掉 markdown 后截断', () => {
    const preview = previewReply(`# 标题\n\n${'很长的一段说明文字，'.repeat(20)}`)
    expect(preview.endsWith('…')).toBe(true)
    expect(preview.includes('#')).toBe(false)
    expect(preview.length).toBeLessThanOrEqual(161)
  })
})

describe('shouldCollapseTurn', () => {
  const long = '回复'.repeat(200)

  it('最新一轮保持展开', () => {
    expect(shouldCollapseTurn({ isLast: true, live: false, content: long })).toBe(false)
  })

  it('生成中不折叠', () => {
    expect(shouldCollapseTurn({ isLast: false, live: true, content: long })).toBe(false)
  })

  it('历史长回复默认折叠', () => {
    expect(shouldCollapseTurn({ isLast: false, live: false, content: long })).toBe(true)
  })

  it('历史短回复保持展开', () => {
    expect(shouldCollapseTurn({ isLast: false, live: false, content: '收到' })).toBe(false)
  })

  it('用户展开后不再折叠', () => {
    expect(shouldCollapseTurn({
      isLast: false, live: false, content: long, forceExpanded: true,
    })).toBe(false)
  })

  it('用户收起后即使是短回复也可以折叠', () => {
    expect(shouldCollapseTurn({
      isLast: true, live: false, content: '短', forceCollapsed: true,
    })).toBe(true)
  })
})
