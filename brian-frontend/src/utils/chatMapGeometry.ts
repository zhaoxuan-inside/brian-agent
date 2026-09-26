import { NODE_H, NODE_W, rectsOverlap, type ChatMapEdgeType } from './chatMapLayout'

export type EdgeRef = { source: string; target: string; edgeType: ChatMapEdgeType | string }

interface Pos { x: number; y: number }

export interface SnapGuide {
  type: 'vertical' | 'horizontal'
  position: number
  start: number
  end: number
}

export const SNAP_THRESHOLD = 8

export function edgeKey(e: EdgeRef): string {
  return `${e.edgeType}-${e.source}-${e.target}`
}

export function isVerticalEdge(e: EdgeRef): boolean {
  return e.edgeType === 'QUESTION_ANSWER' || e.edgeType === 'FOLLOW_UP'
}

export function verticalEdgePath(s: Pos, t: Pos): string {
  const sx = s.x + NODE_W / 2
  const sy = s.y + NODE_H
  const tx = t.x + NODE_W / 2
  const ty = t.y
  const dx = Math.abs(tx - sx)
  const dy = Math.abs(ty - sy)
  const cpOffset = Math.min(dy * 0.4, 80)
  if (dx < 5) {
    
    return `M ${sx} ${sy} C ${sx} ${sy + cpOffset}, ${tx} ${ty - cpOffset}, ${tx} ${ty}`
  }
  
  const midY = (sy + ty) / 2
  return `M ${sx} ${sy} C ${sx} ${sy + cpOffset}, ${sx} ${midY}, ${(sx + tx) / 2} ${midY} S ${tx} ${ty - cpOffset}, ${tx} ${ty}`
}

export function citationEdgePath(s: Pos, t: Pos): string {
  const sx = s.x + NODE_W
  const sy = s.y + NODE_H / 2
  const tx = t.x
  const ty = t.y + NODE_H / 2
  const dx = Math.abs(tx - sx)
  if (tx >= sx) {
    const cpOffset = Math.min(dx * 0.4, 80)
    return `M ${sx} ${sy} C ${sx + cpOffset} ${sy}, ${tx - cpOffset} ${ty}, ${tx} ${ty}`
  }
  
  const offsetSide = Math.min(40, dx * 0.3)
  const midY = (sy + ty) / 2
  return `M ${sx} ${sy} C ${sx + offsetSide} ${sy}, ${sx + offsetSide} ${midY}, ${(sx + tx) / 2} ${midY} S ${tx - offsetSide} ${ty}, ${tx} ${ty}`
}

export function edgePath(e: EdgeRef, s: Pos, t: Pos): string {
  return isVerticalEdge(e) ? verticalEdgePath(s, t) : citationEdgePath(s, t)
}

export function verticalArrowPoint(t: Pos): string {
  const tx = t.x + NODE_W / 2
  const ty = t.y
  return `${tx - 5},${ty - 8} ${tx + 5},${ty - 8} ${tx},${ty}`
}

export function citationArrowPoint(t: Pos): string {
  const tx = t.x
  const ty = t.y + NODE_H / 2
  return `${tx - 8},${ty - 4} ${tx - 8},${ty + 4} ${tx},${ty}`
}

export function arrowPoint(e: EdgeRef, t: Pos): string {
  return isVerticalEdge(e) ? verticalArrowPoint(t) : citationArrowPoint(t)
}

interface DragTarget { id: string; x: number; y: number }

export function pushOutOfOverlap(
  dragX: number, dragY: number, dragW: number, dragH: number,
  otherNodes: DragTarget[], excludeId: string,
): { x: number; y: number } {
  let x = dragX
  let y = dragY
  let hasOverlap = true
  let iterations = 0
  const maxIterations = 10

  while (hasOverlap && iterations < maxIterations) {
    hasOverlap = false
    iterations++
    for (const other of otherNodes) {
      if (other.id === excludeId) continue
      if (!rectsOverlap(x, y, dragW, dragH, other.x, other.y, NODE_W, NODE_H)) continue
      hasOverlap = true

      const overlapRight = (x + dragW) - other.x
      const overlapLeft = (other.x + NODE_W) - x
      const overlapBottom = (y + dragH) - other.y
      const overlapTop = (other.y + NODE_H) - y
      const minOverlap = Math.min(overlapRight, overlapLeft, overlapBottom, overlapTop)

      if (minOverlap === overlapRight) {
        x = other.x - dragW - 8
      } else if (minOverlap === overlapLeft) {
        x = other.x + NODE_W + 8
      } else if (minOverlap === overlapBottom) {
        y = other.y - dragH - 8
      } else {
        y = other.y + NODE_H + 8
      }
    }
  }
  return { x, y }
}

export function snapPosition(
  newX: number, newY: number, otherNodes: DragTarget[],
): { x: number; y: number; guides: SnapGuide[] } {
  const dragLeft = newX
  const dragRight = newX + NODE_W
  const dragTop = newY
  const dragBottom = newY + NODE_H
  const dragCenterX = newX + NODE_W / 2
  const dragCenterY = newY + NODE_H / 2

  const guides: SnapGuide[] = []
  let bestSnapX = newX
  let bestSnapY = newY
  let bestSnapDistX = SNAP_THRESHOLD + 1
  let bestSnapDistY = SNAP_THRESHOLD + 1

  for (const other of otherNodes) {
    const oLeft = other.x
    const oRight = other.x + NODE_W
    const oTop = other.y
    const oBottom = other.y + NODE_H
    const oCenterX = other.x + NODE_W / 2
    const oCenterY = other.y + NODE_H / 2

    const xCandidates = [
      { dragEdge: dragLeft, otherEdge: oLeft, snapX: oLeft },
      { dragEdge: dragLeft, otherEdge: oRight, snapX: oRight },
      { dragEdge: dragRight, otherEdge: oLeft, snapX: oLeft - NODE_W },
      { dragEdge: dragRight, otherEdge: oRight, snapX: oRight - NODE_W },
      { dragEdge: dragCenterX, otherEdge: oCenterX, snapX: oCenterX - NODE_W / 2 },
    ]

    for (const c of xCandidates) {
      const dist = Math.abs(c.dragEdge - c.otherEdge)
      if (dist < bestSnapDistX) {
        bestSnapDistX = dist
        bestSnapX = c.snapX
      }
    }

    const yCandidates = [
      { dragEdge: dragTop, otherEdge: oTop, snapY: oTop },
      { dragEdge: dragTop, otherEdge: oBottom, snapY: oBottom },
      { dragEdge: dragBottom, otherEdge: oTop, snapY: oTop - NODE_H },
      { dragEdge: dragBottom, otherEdge: oBottom, snapY: oBottom - NODE_H },
      { dragEdge: dragCenterY, otherEdge: oCenterY, snapY: oCenterY - NODE_H / 2 },
    ]

    for (const c of yCandidates) {
      const dist = Math.abs(c.dragEdge - c.otherEdge)
      if (dist < bestSnapDistY) {
        bestSnapDistY = dist
        bestSnapY = c.snapY
      }
    }
  }

  let snappedX = newX
  let snappedY = newY

  if (bestSnapDistX <= SNAP_THRESHOLD) {
    snappedX = bestSnapX
    const guideYStart = Math.min(newY, ...otherNodes.map((n) => n.y))
    const guideYEnd = Math.max(newY + NODE_H, ...otherNodes.map((n) => n.y + NODE_H))
    guides.push({ type: 'vertical', position: snappedX, start: guideYStart, end: guideYEnd })
    guides.push({ type: 'vertical', position: snappedX + NODE_W / 2, start: guideYStart, end: guideYEnd })
  }

  if (bestSnapDistY <= SNAP_THRESHOLD) {
    snappedY = bestSnapY
    const guideXStart = Math.min(snappedX, ...otherNodes.map((n) => n.x))
    const guideXEnd = Math.max(snappedX + NODE_W, ...otherNodes.map((n) => n.x + NODE_W))
    guides.push({ type: 'horizontal', position: snappedY, start: guideXStart, end: guideXEnd })
    guides.push({ type: 'horizontal', position: snappedY + NODE_H / 2, start: guideXStart, end: guideXEnd })
  }

  return { x: snappedX, y: snappedY, guides }
}
