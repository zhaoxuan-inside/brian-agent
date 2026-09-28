import { describe, it, expect } from 'vitest'
import { buildMarkdownFileName } from '@/utils/fileSave'

const FIXED = new Date(2026, 8, 27, 9, 5, 3)

describe('buildMarkdownFileName', () => {
  it('取首个非空行作为文件名主体,追加时间戳与 .md 后缀', () => {
    const name = buildMarkdownFileName('\n  \n# 会议纪要\n正文', FIXED)
    expect(name).toBe('会议纪要-20260927-090503.md')
  })

  it('清理文件系统非法字符', () => {
    const name = buildMarkdownFileName('a/b\\c:d*e?f"g<h>i|j', FIXED)
    expect(name).toBe('a-b-c-d-e-f-g-h-i-j-20260927-090503.md')
  })

  it('去除首尾的点与横线(Windows 限制)', () => {
    const name = buildMarkdownFileName('...-.-  .笔记标题.  -...', FIXED)
    expect(name.startsWith('笔记标题-')).toBe(true)
    expect(name.endsWith('.md')).toBe(true)
  })

  it('截断到 40 字符', () => {
    const long = '非'.repeat(60)
    const name = buildMarkdownFileName(long, FIXED)
    expect(name.startsWith('非'.repeat(40) + '-20260927-090503.md')).toBe(true)
  })

  it('空文本回退为 chat 前缀', () => {
    expect(buildMarkdownFileName('', FIXED)).toBe('chat-20260927-090503.md')
    expect(buildMarkdownFileName('   \n\t ', FIXED)).toBe('chat-20260927-090503.md')
  })

  it('全非法字符的行回退为 chat 前缀', () => {
    expect(buildMarkdownFileName('///???', FIXED)).toBe('chat-20260927-090503.md')
  })
})
