import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function renderMarkdown(content: string): string {
  const raw = content || ''
  if (!raw.trim()) return ''
  try {
    const html = marked.parse(raw) as string
    return typeof DOMPurify?.sanitize === 'function' ? DOMPurify.sanitize(html) : html
  } catch {
    return raw
  }
}

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
