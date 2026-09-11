/**
 * 对话时间线里「历史长回复」是否默认折叠。
 *
 * 用户问题始终展开，作为定位历史轮次的目录；只有已结束的、非最新一轮、
 * 且内容足够长的助手回复才收成预览。用户手动展开/收起优先于默认规则。
 */

export const LONG_REPLY_CHARS = 360
export const LONG_REPLY_LINES = 8
export const REPLY_PREVIEW_CHARS = 160

export function isLongReply(content: string | undefined | null): boolean {
  const text = (content ?? '').trim()
  if (!text) return false
  if (text.length >= LONG_REPLY_CHARS) return true
  return text.split(/\n/).length >= LONG_REPLY_LINES
}

export function previewReply(content: string | undefined | null, max = REPLY_PREVIEW_CHARS): string {
  const plain = (content ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return ''
  if (plain.length <= max) return plain
  return `${plain.slice(0, max).trimEnd()}…`
}

export interface TurnCollapseInput {
  isLast: boolean
  live: boolean
  content: string
  extrasCount?: number
  forceExpanded?: boolean
  forceCollapsed?: boolean
}

export function shouldCollapseTurn(input: TurnCollapseInput): boolean {
  if (input.live) return false
  if (input.forceExpanded) return false
  if (input.forceCollapsed) return true
  if (input.isLast) return false
  return isLongReply(input.content) || (input.extrasCount ?? 0) >= 2
}
