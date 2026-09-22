import { describe, it, expect } from 'vitest'
import { chipWidthOf, layoutChipsInCard } from '@/utils/cardChipLayout'

const card = { x: 40, y: 50, w: 252, h: 140 }
const chips = [
  { label: '引用 0', kind: 'blue' as const },
  { label: '被引用 2', kind: 'gray' as const },
  { label: '思考过程', kind: 'blue' as const },
  { label: '评估结果', kind: 'eval' as const },
]

describe('cardChipLayout', () => {
  it('measures CJK wider than latin', () => {
    expect(chipWidthOf('思考过程')).toBeCloseTo(45.6)
    expect(chipWidthOf('abc')).toBeCloseTo(12 + 3 * 4.9)
  })

  it('wraps chips that exceed the card inner width', () => {
    // 窄卡（内宽 156）迫使第 4 个胶囊换行：第二行排在第一行下方、更贴卡片底部
    const laid = layoutChipsInCard(chips, { ...card, w: 180 })
    expect(laid.filter((c) => c.y === laid[0].y).length).toBe(3)
    expect(laid[3].y).toBe(laid[0].y + 17)
  })

  it('bottom-aligns rows inside the card', () => {
    const laid = layoutChipsInCard(chips, card)
    const lastRow = laid.filter((c) => c.y === Math.max(...laid.map((x) => x.y)))
    expect(lastRow[0].y).toBe(card.y + card.h - 20)
    expect(lastRow[0].x).toBe(card.x + 12)
  })
})
