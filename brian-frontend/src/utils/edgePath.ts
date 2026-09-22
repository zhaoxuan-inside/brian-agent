/**
 * @fileoverview 首页示意图的卡片间平滑连线几何（无状态纯函数）。
 *
 * 与 ChatMap 的 chatMapGeometry.ts 的区别：那边节点尺寸固定（NODE_W/NODE_H 常量、
 * 左上角定位约定），本模块面向首页展示图「任意尺寸矩形 + 任意边锚点」的连线，
 * 供 HeroAppShot / HomeView 记忆地图共用。生成水平/垂直切线的三次贝塞尔，
 * 无折角、锚点精确落在卡片边缘。
 */

export interface EdgeRect {
  x: number
  y: number
  w: number
  h: number
}

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left'

interface Pos {
  x: number
  y: number
}

/** 各边外法线方向（控制点沿此方向伸出卡片） */
const SIDE_NORMAL: Record<EdgeSide, Pos> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

/** 锚点：卡片 side 边上 along（0~1，默认中点）比例处 */
export function edgeAnchor(r: EdgeRect, side: EdgeSide, along = 0.5): Pos {
  const mid = { top: r.x + r.w * along, right: r.y + r.h * along, bottom: r.x + r.w * along, left: r.y + r.h * along }
  switch (side) {
    case 'top': return { x: mid.top, y: r.y }
    case 'bottom': return { x: mid.bottom, y: r.y + r.h }
    case 'left': return { x: r.x, y: mid.left }
    case 'right': return { x: r.x + r.w, y: mid.right }
  }
}

/** 弯曲幅度与端点间距成正比（24~96），距离越近曲线越收敛，避免小间隙出现大弧 */
function bendFor(gap: number): number {
  return Math.min(96, Math.max(24, gap * 0.45))
}

/**
 * 平滑连线：两端控制点沿各自边的法线外伸，保证锚点处切线垂直于卡片边缘。
 * 同轴对连时沿向参数（alongA/alongB）错开可产生柔和的 S 曲线而非僵直直线。
 */
export function smoothEdgePath(
  a: EdgeRect, aSide: EdgeSide,
  b: EdgeRect, bSide: EdgeSide,
  opts: { alongA?: number; alongB?: number } = {},
): string {
  const p1 = edgeAnchor(a, aSide, opts.alongA)
  const p2 = edgeAnchor(b, bSide, opts.alongB)
  const bend = bendFor(Math.hypot(p2.x - p1.x, p2.y - p1.y))
  const n1 = SIDE_NORMAL[aSide]
  const n2 = SIDE_NORMAL[bSide]
  const c1 = { x: p1.x + n1.x * bend, y: p1.y + n1.y * bend }
  const c2 = { x: p2.x + n2.x * bend, y: p2.y + n2.y * bend }
  return `M${round1(p1.x)},${round1(p1.y)} C${round1(c1.x)},${round1(c1.y)} ${round1(c2.x)},${round1(c2.y)} ${round1(p2.x)},${round1(p2.y)}`
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}
