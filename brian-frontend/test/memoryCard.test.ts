import { describe, it, expect } from 'vitest'
import {
  getMemoryRoleMeta,
  analyzeMemoryContent,
  blocksToMarkdown,
} from '../src/utils/memoryFormat'
import { renderMarkdown } from '../src/utils/markdown'
import type { MemoryItem } from '../src/api/types'

function isContentLong(content: string, format: string): boolean {
  if (format === 'json' || format === 'blocks') {
    return content.length > 120 || content.includes('\n')
  }
  return content.length > 140 || (content.match(/\n/g) || []).length > 2
}

describe('MemoryCard Presentation & Rendering Logic', () => {
  const baseMemory: MemoryItem = {
    id: 'mem-test-001',
    type: 'semantic',
    content: '普通记忆内容',
    tags: ['测试', '前端'],
    confidence: 0.85,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  }

  describe('TC-MEM-CARD-001: Role distinction (User sent vs System reply)', () => {
    it('displays "用户发送" badge with brian-blue token for user messages', () => {
      const userMem: MemoryItem = {
        ...baseMemory,
        role: 'user',
        content: '从本质上分析什么是记忆？',
      }
      const roleMeta = getMemoryRoleMeta(userMem)
      expect(roleMeta.isUser).toBe(true)
      expect(roleMeta.label).toBe('用户发送')
      expect(roleMeta.badgeClass).toContain('brian-blue')
    })

    it('displays "系统回复" badge with apple-gray token for system/assistant messages', () => {
      const assistantMem: MemoryItem = {
        ...baseMemory,
        role: 'assistant',
        content: '记忆并不是一座存放过去事实的仓库，而是神经系统的主动重构。',
      }
      const roleMeta = getMemoryRoleMeta(assistantMem)
      expect(roleMeta.isUser).toBe(false)
      expect(roleMeta.label).toBe('系统回复')
      expect(roleMeta.badgeClass).toContain('apple-gray')
    })

    it('handles legacy rows with creatorRole or infoType or episodic fallback', () => {
      expect(getMemoryRoleMeta({ ...baseMemory, creatorRole: 'USER' }).isUser).toBe(true)
      expect(getMemoryRoleMeta({ ...baseMemory, creatorRole: 'ASSISTANT' }).isUser).toBe(false)
      expect(getMemoryRoleMeta({ ...baseMemory, infoType: 'REQUEST' }).isUser).toBe(true)
      expect(getMemoryRoleMeta({ ...baseMemory, infoType: 'RESPONSE' }).isUser).toBe(false)
      expect(getMemoryRoleMeta({ ...baseMemory, type: 'episodic' }).isUser).toBe(true)
      expect(getMemoryRoleMeta({ ...baseMemory, type: 'semantic' }).isUser).toBe(false)
    })
  })

  describe('TC-MEM-CARD-002: Format-aware rendering (Markdown & JSON & Blocks)', () => {
    it('correctly renders Markdown content with HTML tags from marked', () => {
      const mdContent = '## 标题\n- 列表项一\n- **粗体**项二'
      const analysis = analyzeMemoryContent(mdContent)
      expect(analysis.format).toBe('markdown')
      expect(analysis.formatLabel).toBe('Markdown')

      const html = renderMarkdown(analysis.markdownContent)
      expect(html).toContain('<h2>标题</h2>')
      expect(html).toContain('<li>列表项一</li>')
      expect(html).toContain('<strong>粗体</strong>')
    })

    it('correctly detects generic JSON and generates highlighted code', () => {
      const jsonContent = JSON.stringify({
        userId: 'u-123',
        status: 'active',
        settings: { theme: 'dark', notifications: true },
      }, null, 2)

      const analysis = analyzeMemoryContent(jsonContent)
      expect(analysis.format).toBe('json')
      expect(analysis.formatLabel).toBe('JSON')
      expect(analysis.prettyJson).toContain('"userId": "u-123"')
      expect(analysis.highlightedJson).toContain('hljs')
    })

    it('detects block-array JSON and provides both rich markdown and raw json', () => {
      const blocks = [
        { type: 'heading', content: '记忆的本质', meta: { level: 2 } },
        { type: 'text_paragraph', content: '基于当下的情境与需求，对过去经验的主动重构。' },
        { type: 'list_item', content: '外显记忆' },
        { type: 'list_item', content: '内隐记忆' },
      ]
      const raw = JSON.stringify(blocks)
      const analysis = analyzeMemoryContent(raw)
      expect(analysis.format).toBe('blocks')
      expect(analysis.formatLabel).toBe('结构化内容')
      expect(analysis.hasBlocks).toBe(true)

      const md = blocksToMarkdown(blocks)
      const html = renderMarkdown(md)
      expect(html).toContain('<h2>记忆的本质</h2>')
      expect(html).toContain('外显记忆')
      expect(html).toContain('内隐记忆')
      expect(html).toContain('<li>')
    })

    it('identifies plain text and renders safely', () => {
      const plain = '帮我检查系统磁盘空间'
      const analysis = analyzeMemoryContent(plain)
      expect(analysis.format).toBe('text')
      expect(analysis.formatLabel).toBe('纯文本')
      expect(renderMarkdown(analysis.markdownContent)).toContain('帮我检查系统磁盘空间')
    })
  })

  describe('TC-MEM-CARD-003: Content expansion & truncation threshold', () => {
    it('detects short text as not requiring expand toggle', () => {
      expect(isContentLong('简短问题', 'text')).toBe(false)
      expect(isContentLong('短内容', 'markdown')).toBe(false)
    })

    it('detects long text or multi-line content as needing expand toggle', () => {
      const longText = '这是一段非常非常长的文字内容，用于测试卡片是否会触发折叠和展开状态。'.repeat(5)
      expect(isContentLong(longText, 'text')).toBe(true)

      const multiLine = '第1行\n第2行\n第3行\n第4行'
      expect(isContentLong(multiLine, 'text')).toBe(true)
    })

    it('detects multiline or long JSON as needing expand toggle', () => {
      const json = JSON.stringify({ a: 1, b: 2, c: 3 }, null, 2)
      expect(isContentLong(json, 'json')).toBe(true)
    })
  })

  describe('TC-MEM-CARD-004: Metadata display', () => {
    it('computes confidence percentage correctly', () => {
      expect(Math.round((baseMemory.confidence ?? 0) * 100)).toBe(85)
      expect(Math.round(0.999 * 100)).toBe(100)
      expect(Math.round(0 * 100)).toBe(0)
    })

    it('formats short ID slice correctly', () => {
      expect(baseMemory.id.slice(-8)).toBe('test-001')
    })
  })
})
