export interface ProfileValueLine { key: string; val: string }

/**
 * 将用户画像维度值解析为逐行 key/value 结构：
 * - 字符串：识别以「·」「;」「，」、换行分隔的 "key: value" 多段内容（key 为字母/下划线标识符），
 *   无 key 结构的整段内容原样保留为一行；
 * - 对象：每个字段一行；
 * - 数组：每项一行；
 * - 空值：返回空数组（由调用方决定占位文案）。
 */
export function profileValueLines(value: unknown): ProfileValueLine[] {
  if (value === null || value === undefined || value === '') return []

  if (Array.isArray(value)) {
    return value.map((item) => ({ key: '', val: primitiveText(item) })).filter((l) => l.val)
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ key: k, val: primitiveText(v) }))
  }

  const text = String(value).trim()
  if (!text) return []

  // key 支持英文/数字/下划线与中文（如 "指令风格:"、"sensitivity_level:"），
  // 仅当 key 紧跟冒号且位于文本开头或分隔符（· ; ，、 换行）之后时才切分，避免误拆普通叙述文本
  const keyRe = /(^|[\n·;；,，、])\s*([\w\u4e00-\u9fff-]{1,40})\s*[:：]\s*/g
  const marks: Array<{ key: string; start: number; contentStart: number }> = []
  for (const m of text.matchAll(keyRe)) {
    marks.push({ key: m[2], start: m.index ?? 0, contentStart: (m.index ?? 0) + m[0].length })
  }

  if (marks.length === 0) return [{ key: '', val: text }]

  const lines: ProfileValueLine[] = []
  const head = text.slice(0, marks[0].start).trim()
  if (head) lines.push({ key: '', val: head })
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length
    lines.push({ key: mk.key, val: text.slice(mk.contentStart, end).trim() })
  })
  return lines
}

function primitiveText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
