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

const SIDE_NORMAL: Record<EdgeSide, Pos> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

export function edgeAnchor(r: EdgeRect, side: EdgeSide, along = 0.5): Pos {
  const mid = { top: r.x + r.w * along, right: r.y + r.h * along, bottom: r.x + r.w * along, left: r.y + r.h * along }
  switch (side) {
    case 'top': return { x: mid.top, y: r.y }
    case 'bottom': return { x: mid.bottom, y: r.y + r.h }
    case 'left': return { x: r.x, y: mid.left }
    case 'right': return { x: r.x + r.w, y: mid.right }
  }
}

function bendFor(gap: number): number {
  return Math.min(96, Math.max(24, gap * 0.45))
}

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
