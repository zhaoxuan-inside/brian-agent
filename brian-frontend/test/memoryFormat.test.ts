import { describe, it, expect } from 'vitest'
import {
  isUserMemory,
  getMemoryRoleMeta,
  isMarkdownContent,
  blocksToMarkdown,
  analyzeMemoryContent,
  highlightJson,
} from '../src/utils/memoryFormat'

describe('memoryFormat', () => {
  describe('isUserMemory & getMemoryRoleMeta', () => {
    it('identifies user role correctly when role is user', () => {
      const mem = { role: 'user' as const, type: 'semantic' as const }
      expect(isUserMemory(mem)).toBe(true)
      const meta = getMemoryRoleMeta(mem)
      expect(meta.isUser).toBe(true)
      expect(meta.label).toBe('用户发送')
    })

    it('identifies assistant role correctly when role is assistant', () => {
      const mem = { role: 'assistant' as const, type: 'episodic' as const }
      expect(isUserMemory(mem)).toBe(false)
      const meta = getMemoryRoleMeta(mem)
      expect(meta.isUser).toBe(false)
      expect(meta.label).toBe('系统回复')
    })

    it('identifies role by creatorRole or infoType if role is missing', () => {
      expect(isUserMemory({ type: 'semantic' as const, creatorRole: 'USER' })).toBe(true)
      expect(isUserMemory({ type: 'semantic' as const, creatorRole: 'ASSISTANT' })).toBe(false)
      expect(isUserMemory({ type: 'semantic' as const, infoType: 'REQUEST' })).toBe(true)
      expect(isUserMemory({ type: 'semantic' as const, infoType: 'RESPONSE' })).toBe(false)
    })

    it('falls back to episodic as user, semantic as system', () => {
      expect(isUserMemory({ type: 'episodic' as const })).toBe(true)
      expect(isUserMemory({ type: 'semantic' as const })).toBe(false)
    })
  })

  describe('isMarkdownContent', () => {
    it('detects headings and lists', () => {
      expect(isMarkdownContent('# 标题')).toBe(true)
      expect(isMarkdownContent('## 二级标题')).toBe(true)
      expect(isMarkdownContent('- 列表条目')).toBe(true)
      expect(isMarkdownContent('1. 序号')).toBe(true)
      expect(isMarkdownContent('> 引用文本')).toBe(true)
      expect(isMarkdownContent('**粗体文字**')).toBe(true)
      expect(isMarkdownContent('[链接](http://example.com)')).toBe(true)
    })

    it('returns false for plain non-markdown text', () => {
      expect(isMarkdownContent('从本质上分析什么是记忆？')).toBe(false)
      expect(isMarkdownContent('')).toBe(false)
    })
  })

  describe('blocksToMarkdown', () => {
    it('converts diverse block elements into markdown', () => {
      const blocks = [
        { type: 'heading', content: '记忆分类', meta: { level: 2 } },
        { type: 'text_paragraph', content: '这是一段关于记忆的阐述。' },
        { type: 'list_item', content: '感觉记忆' },
        { type: 'code_block', content: 'console.log(42)', meta: { language: 'js' } },
        { type: 'blockquote', content: '引言' },
      ]
      const md = blocksToMarkdown(blocks)
      expect(md).toContain('## 记忆分类')
      expect(md).toContain('这是一段关于记忆的阐述。')
      expect(md).toContain('- 感觉记忆')
      expect(md).toContain('```js\nconsole.log(42)\n```')
      expect(md).toContain('> 引言')
    })
  })

  describe('analyzeMemoryContent', () => {
    it('handles empty content', () => {
      const res = analyzeMemoryContent('')
      expect(res.format).toBe('text')
      expect(res.formatLabel).toBe('纯文本')
    })

    it('analyzes generic JSON object', () => {
      const raw = JSON.stringify({ key: 'value', count: 10 })
      const res = analyzeMemoryContent(raw)
      expect(res.format).toBe('json')
      expect(res.formatLabel).toBe('JSON')
      expect(res.prettyJson).toContain('"key": "value"')
      expect(res.highlightedJson).toBeTruthy()
      expect(res.hasBlocks).toBe(false)
    })

    it('analyzes block array JSON and generates rich markdown', () => {
      const raw = JSON.stringify([
        { type: 'heading', content: '核心推论', meta: { level: 2 } },
        { type: 'text_paragraph', content: '记忆是动态建构的。' },
      ])
      const res = analyzeMemoryContent(raw)
      expect(res.format).toBe('blocks')
      expect(res.formatLabel).toBe('结构化内容')
      expect(res.hasBlocks).toBe(true)
      expect(res.markdownContent).toContain('## 核心推论')
      expect(res.markdownContent).toContain('记忆是动态建构的。')
    })

    it('analyzes markdown content', () => {
      const raw = '## 一、分类\n- 感觉记忆\n- 短时记忆'
      const res = analyzeMemoryContent(raw)
      expect(res.format).toBe('markdown')
      expect(res.formatLabel).toBe('Markdown')
      expect(res.markdownContent).toBe(raw)
    })

    it('analyzes plain text', () => {
      const raw = '帮我检查当前系统磁盘还有多少可用空间'
      const res = analyzeMemoryContent(raw)
      expect(res.format).toBe('text')
      expect(res.formatLabel).toBe('纯文本')
      expect(res.markdownContent).toBe(raw)
    })
  })

  describe('highlightJson', () => {
    it('produces syntax highlighted HTML for JSON string', () => {
      const json = JSON.stringify({ num: 123, str: 'abc' }, null, 2)
      const html = highlightJson(json)
      expect(html).toContain('hljs')
      expect(html).toContain('123')
      expect(html).toContain('abc')
    })
  })
})
