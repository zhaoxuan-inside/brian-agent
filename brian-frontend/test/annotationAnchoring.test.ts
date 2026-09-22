import { describe, it, expect } from 'vitest'
import { fuzzyLocate, normalizeForFuzzy, FUZZY_MATCH_THRESHOLD } from '@/composables/useLibraryTab'

/** 字符重合度（顺序无关计数交集），与实现评分口径一致 */
function similarity(a: string, b: string): number {
  const x = normalizeForFuzzy(a).text
  const y = normalizeForFuzzy(b).text
  const counts = new Map<string, number>()
  for (const ch of x) counts.set(ch, (counts.get(ch) || 0) + 1)
  let hit = 0
  for (const ch of y) {
    const left = counts.get(ch) || 0
    if (left > 0) { counts.set(ch, left - 1); hit++ }
  }
  return hit / Math.max(x.length, 1)
}

describe('normalizeForFuzzy', () => {
  it('strips whitespace, punctuation and lowercases, mapping back to raw indices', () => {
    const { text, map } = normalizeForFuzzy('前缀。 Hello, World!')
    expect(text).toBe('前缀helloworld')
    expect(map[0]).toBe(0)
    expect(map[1]).toBe(1)
    expect(map[2]).toBe(4)
    expect(map[map.length - 1]).toBe(15)
  })
})

describe('fuzzyLocate（编辑后咨询标注重锚定）', () => {
  it('locates verbatim text and maps back to raw offsets', () => {
    const full = '前缀。 This is the annotated sentence, which we expect to find.'
    const res = fuzzyLocate(full, 'This is the annotated sentence')
    expect(res).not.toBeNull()
    expect(full.slice(res!.start, res!.end)).toBe('This is the annotated sentence')
  })

  it('re-anchors after a typo fix inside the selection (CJK)', () => {
    const full = '机器学习是人工智能的重要分支，它使计算机能够从数据中学习。'
    const selection = '机器学习是人工智能的一个分支'
    const res = fuzzyLocate(full, selection)
    expect(res).not.toBeNull()
    expect(similarity(full.slice(res!.start, res!.end), selection))
      .toBeGreaterThanOrEqual(FUZZY_MATCH_THRESHOLD)
  })

  it('re-anchors after words are added inside the selection', () => {
    const full = '本章第二节介绍主流开源向量数据库的基本概念与选型。'
    const selection = '本节介绍向量数据库的基本概念'
    const res = fuzzyLocate(full, selection)
    expect(res).not.toBeNull()
    expect(similarity(full.slice(res!.start, res!.end), selection))
      .toBeGreaterThanOrEqual(FUZZY_MATCH_THRESHOLD)
  })

  it('re-anchors when punctuation/whitespace changed inside the selection', () => {
    const full = '第一段结束。\n\n梯度下降法, 学习率决定了收敛速度，以及最终精度!!!'
    const selection = '梯度下降法：学习率决定了收敛速度，以及最终精度'
    const res = fuzzyLocate(full, selection)
    expect(res).not.toBeNull()
    // 标点差异被归一化抹平，命中区域应与选中文本高度重合
    expect(similarity(full.slice(res!.start, res!.end), selection))
      .toBeGreaterThanOrEqual(FUZZY_MATCH_THRESHOLD)
    expect(normalizeForFuzzy(full.slice(res!.start, res!.end)).text)
      .toBe(normalizeForFuzzy('梯度下降法 学习率决定了收敛速度 以及最终精度').text)
  })

  it('prefers the best candidate among similar paragraphs', () => {
    const full = 'alpha beta gamma tail. alpha beta delta tail.'
    const res = fuzzyLocate(full, 'alpha beta gamma tail')
    expect(res).not.toBeNull()
    expect(normalizeForFuzzy(full.slice(res!.start, res!.end)).text).toBe(normalizeForFuzzy('alpha beta gamma tail').text)
  })

  it('returns null for unrelated content', () => {
    const full = '本节讨论排序算法的时间复杂度与稳定性分析。'
    expect(fuzzyLocate(full, '完全无关的量子力学波函数坍缩解释')).toBeNull()
  })

  it('returns null when similarity is below threshold', () => {
    const full = '这段讲的是动量法的物理直觉与实现细节。'
    const selection = '这段讲的是梯度下降法的收敛性证明过程'
    expect(fuzzyLocate(full, selection)).toBeNull()
  })

  it('returns null for too-short selections to avoid false anchors', () => {
    const full = '一个很短的句子，包含五个字。'
    expect(fuzzyLocate(full, '五个字')).toBeNull()
  })
})
