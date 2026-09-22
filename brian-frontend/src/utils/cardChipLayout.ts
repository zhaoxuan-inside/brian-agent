/**
 * @fileoverview 卡片内引用/状态胶囊的布局纯函数（HeroAppShot 与 HomeView 记忆地图共用）。
 *
 * 胶囊按卡片宽度自动换行，行底对齐（先算行再从底部向上排），
 * 坐标为画布绝对坐标，直接用于 SVG rect/text 定位。
 */

export interface ChipLike {
  label: string
  kind: 'blue' | 'gray' | 'eval'
}

export interface LaidChip {
  label: string
  kind: 'blue' | 'gray' | 'eval'
  x: number
  y: number
  w: number
}

/** 胶囊宽度：内边距 12 + 逐字符累计（CJK 8.4px，其余 4.9px，8px 字号经验值） */
export function chipWidthOf(label: string): number {
  let w = 12
  for (const ch of label) w += ch.charCodeAt(0) > 0x2e80 ? 8.4 : 4.9
  return w
}

const CHIP_GAP = 4
const CARD_PADDING = 24
const ROW_HEIGHT = 17
const BOTTOM_PADDING = 20

/** 卡片内胶囊布局：超出卡片内宽自动换行，行整体底对齐 */
export function layoutChipsInCard(chips: ChipLike[], card: { x: number; y: number; w: number; h: number }): LaidChip[] {
  const rows: LaidChip[][] = [[]]
  let rowW = 0
  chips.forEach((c) => {
    const w = chipWidthOf(c.label)
    if (rowW > 0 && rowW + w + CHIP_GAP > card.w - CARD_PADDING) {
      rows.push([])
      rowW = 0
    }
    rows[rows.length - 1].push({ ...c, x: 0, y: 0, w })
    rowW += w + CHIP_GAP
  })
  const out: LaidChip[] = []
  rows.forEach((row, r) => {
    let cx = card.x + 12
    const cy = card.y + card.h - BOTTOM_PADDING - (rows.length - 1 - r) * ROW_HEIGHT
    row.forEach((c) => {
      out.push({ ...c, x: cx, y: cy })
      cx += c.w + CHIP_GAP
    })
  })
  return out
}
