import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import type { MemoryItem } from '@/api/types'

hljs.registerLanguage('json', json)

export type MemoryContentFormat = 'json' | 'blocks' | 'markdown' | 'text'

export interface MemoryRoleMeta {
  isUser: boolean
  label: string
  shortLabel: string
  badgeClass: string
}

export interface MemoryAnalysis {
  format: MemoryContentFormat
  formatLabel: string
  rawContent: string
  prettyJson: string | null
  highlightedJson: string | null
  markdownContent: string
  hasBlocks: boolean
}

export function isUserMemory(mem: Pick<MemoryItem, 'role' | 'type'> & Partial<Pick<MemoryItem, 'creatorRole' | 'infoType'>>): boolean {
  if (mem.role) {
    return mem.role.toLowerCase() === 'user'
  }
  const creator = (mem.creatorRole || '').toLowerCase()
  if (creator === 'user') return true
  if (creator === 'system' || creator === 'assistant' || creator === 'agent') return false
  if (mem.infoType) {
    return mem.infoType.toUpperCase() === 'REQUEST'
  }
  return mem.type === 'episodic'
}

export function getMemoryRoleMeta(mem: Pick<MemoryItem, 'role' | 'type'> & Partial<Pick<MemoryItem, 'creatorRole' | 'infoType'>>): MemoryRoleMeta {
  const user = isUserMemory(mem)
  if (user) {
    return {
      isUser: true,
      label: '用户发送',
      shortLabel: '用户',
      badgeClass: 'bg-brian-blue/10 text-brian-blue dark:bg-brian-blue/20 dark:text-blue-300 border border-brian-blue/20',
    }
  }
  return {
    isUser: false,
    label: '系统回复',
    shortLabel: '系统',
    badgeClass: 'bg-apple-gray-100 text-apple-gray-700 dark:bg-apple-gray-800 dark:text-apple-gray-300 border border-apple-gray-200 dark:border-apple-gray-700',
  }
}

export function highlightJson(jsonString: string): string {
  try {
    return hljs.highlight(jsonString, { language: 'json' }).value
  } catch {
    return jsonString
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
}

export function isMarkdownContent(text: string): boolean {
  if (!text) return false
  return /(^#{1,6}\s|```|(\*\*|__).+?(\*\*|__)|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|\[.+?\]\(.+?\)|\|.+?\|)/m.test(text)
}

export function blocksToMarkdown(blocks: Array<Record<string, unknown>>): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    const type = String(block.type || '').toLowerCase()
    const content = typeof block.content === 'string' ? block.content : ''
    const meta = (block.meta && typeof block.meta === 'object' ? block.meta : {}) as Record<string, unknown>
    if (type === 'heading') {
      const level = Math.min(Math.max(Number(meta.level || block.level || 2), 1), 6)
      parts.push(`${'#'.repeat(level)} ${content}`)
    } else if (type === 'list_item' || type === 'listitem') {
      parts.push(`- ${content}`)
    } else if (type === 'code_block' || type === 'code') {
      const lang = String(meta.language || block.language || '')
      parts.push(`\`\`\`${lang}\n${content}\n\`\`\``)
    } else if (type === 'blockquote' || type === 'quote') {
      parts.push(`> ${content}`)
    } else if (content) {
      parts.push(content)
    } else if (typeof block.summary === 'string') {
      parts.push(block.summary)
    }
  }
  return parts.join('\n\n')
}

export function isBlockArray(parsed: unknown): parsed is Array<Record<string, unknown>> {
  return Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every(item => item && typeof item === 'object' && ('type' in item || 'content' in item))
}

function tryParseJsonAnalysis(raw: string, trimmed: string): MemoryAnalysis | null {
  if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
    return null
  }
  try {
    const parsed = JSON.parse(trimmed)
    const prettyJson = JSON.stringify(parsed, null, 2)
    const highlightedJson = highlightJson(prettyJson)
    if (isBlockArray(parsed)) {
      return {
        format: 'blocks',
        formatLabel: '结构化内容',
        rawContent: raw,
        prettyJson,
        highlightedJson,
        markdownContent: blocksToMarkdown(parsed),
        hasBlocks: true,
      }
    }
    return {
      format: 'json',
      formatLabel: 'JSON',
      rawContent: raw,
      prettyJson,
      highlightedJson,
      markdownContent: '',
      hasBlocks: false,
    }
  } catch {
    return null
  }
}

export function analyzeMemoryContent(raw: string): MemoryAnalysis {
  const trimmed = (raw || '').trim()
  if (!trimmed) {
    return {
      format: 'text',
      formatLabel: '纯文本',
      rawContent: '',
      prettyJson: null,
      highlightedJson: null,
      markdownContent: '',
      hasBlocks: false,
    }
  }

  const jsonAnalysis = tryParseJsonAnalysis(raw, trimmed)
  if (jsonAnalysis) return jsonAnalysis

  const isMd = isMarkdownContent(trimmed)
  return {
    format: isMd ? 'markdown' : 'text',
    formatLabel: isMd ? 'Markdown' : '纯文本',
    rawContent: raw,
    prettyJson: null,
    highlightedJson: null,
    markdownContent: raw,
    hasBlocks: false,
  }
}
