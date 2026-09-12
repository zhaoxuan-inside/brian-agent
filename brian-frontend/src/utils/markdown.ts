/**
 * @fileoverview Markdown 渲染公共工具。
 *
 * marked 解析 + DOMPurify 消毒，解析失败时回退原文。
 * 消息卡片（MessageCard）、思考块（ThinkingBlock）、资料库文档阅读
 * （LibraryTab）等 v-html 场景共用；配套排版样式见 styles/globals.css
 * 的 .markdown-body。
 */
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/** 渲染 Markdown 为消毒后的 HTML（空内容返回空串，解析失败回退原文） */
export function renderMarkdown(content: string): string {
  const raw = content || ''
  if (!raw.trim()) return ''
  try {
    return DOMPurify.sanitize(marked.parse(raw) as string)
  } catch {
    return raw
  }
}

// ===== 新增（2026-09-12）：流式 Markdown 节流渲染器 =====
// 背景：流式块每追加一个增量就全量重解析一次 Markdown，总成本 O(n²)；
// 历史方案是流中降级纯文本，但会导致"流式过程中 markdown 不渲染、结束后才渲染"。
// 本工厂返回的渲染函数保证：非流式恒立即全量渲染；流式最多 throttleMs 解析一次
// （窗口内返回上次结果），流结束翻转时调用方重渲染即自动全量对齐。
export function createThrottledMarkdownRenderer(throttleMs = 300): (content: string, streaming: boolean) => string {
  const cache: { text: string | null; html: string; at: number } = { text: null, html: '', at: 0 }
  return (content: string, streaming: boolean): string => {
    const now = Date.now()
    if (cache.text === content) return cache.html
    if (!streaming || now - cache.at >= throttleMs) {
      cache.text = content
      cache.html = renderMarkdown(content)
      cache.at = now
    }
    return cache.html
  }
}
