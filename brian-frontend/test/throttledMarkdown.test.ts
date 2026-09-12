import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  renderMarkdown,
  createThrottledMarkdownRenderer,
} from '@/utils/markdown'

afterEach(() => {
  vi.useRealTimers()
})

// 注：vitest 环境为 node（无 DOM），DOMPurify.sanitize 会抛异常 → renderMarkdown
// 回退原文；以下断言只验证节流逻辑（与 renderMarkdown 输出逐字比对），不依赖具体 HTML。
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

    vi.setSystemTime(1100) // +100ms，窗口内
    expect(render('**ab**', true)).toBe(first)

    vi.setSystemTime(1400) // +400ms，窗口外
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
    expect(render('**abc**', true)).toBe(stale) // 流中节流
    expect(render('**abc**', false)).toBe(renderMarkdown('**abc**')) // 结束立即全量
  })

  it('不同实例缓存隔离', () => {
    vi.useFakeTimers()
    vi.setSystemTime(4000)
    const r1 = createThrottledMarkdownRenderer(300)
    const r2 = createThrottledMarkdownRenderer(300)
    r1('**a**', true)
    vi.setSystemTime(4050)
    // r2 未见过该内容，立即渲染（不受 r1 缓存影响）
    expect(r2('**ab**', true)).toBe(renderMarkdown('**ab**'))
    // r1 仍在窗口内，返回旧值
    expect(r1('**ab**', true)).toBe(renderMarkdown('**a**'))
  })
})
