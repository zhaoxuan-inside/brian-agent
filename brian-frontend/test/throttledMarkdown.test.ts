import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  renderMarkdown,
  createThrottledMarkdownRenderer,
} from '@/utils/markdown'

afterEach(() => {
  vi.useRealTimers()
})

describe('createThrottledMarkdownRenderer', () => {
  it('非流式恒立即返回最新渲染结果', () => {
    const render = createThrottledMarkdownRenderer(300)
    expect(render('**a**', false)).toBe(renderMarkdown('**a**'))
    expect(render('**b**', false)).toBe(renderMarkdown('**b**'))
  })

  it('流式窗口内返回上次结果（节流），窗口后返回最新', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const render = createThrottledMarkdownRenderer(300)
    const first = render('**a**', true)
    expect(first).toBe(renderMarkdown('**a**'))

    vi.setSystemTime(1100)
    expect(render('**ab**', true)).toBe(first)

    vi.setSystemTime(1400)
    expect(render('**ab**', true)).toBe(renderMarkdown('**ab**'))
  })

  it('相同内容直接命中缓存', () => {
    vi.useFakeTimers()
    vi.setSystemTime(2000)
    const render = createThrottledMarkdownRenderer(300)
    const first = render('hello', true)
    vi.setSystemTime(9000)
    expect(render('hello', true)).toBe(first)
  })

  it('流结束翻转时立即对齐最新全文', () => {
    vi.useFakeTimers()
    vi.setSystemTime(3000)
    const render = createThrottledMarkdownRenderer(300)
    const stale = render('**a**', true)
    vi.setSystemTime(3050)
    expect(render('**abc**', true)).toBe(stale)
    expect(render('**abc**', false)).toBe(renderMarkdown('**abc**'))
  })

  it('不同实例缓存隔离', () => {
    vi.useFakeTimers()
    vi.setSystemTime(4000)
    const r1 = createThrottledMarkdownRenderer(300)
    const r2 = createThrottledMarkdownRenderer(300)
    r1('**a**', true)
    vi.setSystemTime(4050)
    
    expect(r2('**ab**', true)).toBe(renderMarkdown('**ab**'))
    
    expect(r1('**ab**', true)).toBe(renderMarkdown('**a**'))
  })
})
