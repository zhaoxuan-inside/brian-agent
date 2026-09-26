export type ChatMapEdgeType = 'QUESTION_ANSWER' | 'CITATION' | 'FOLLOW_UP'

export interface ChatMapLayoutNode {
  id: string
  infoType: string
  created: number
  x: number
  y: number
}

export interface ChatMapLayoutEdge {
  source: string
  target: string
  edgeType: ChatMapEdgeType
}

export const CHAT_MAP_ROW_H = 320
export const CHAT_MAP_COL_W = 440
export const CHAT_MAP_BASE_Y = 180

const CITATION_EXTRA_COL_GAP = 60

export const NODE_W = 330
export const NODE_H = 162

const RESPONSE_TYPE = 'RESPONSE'

export function layoutChatMap(nodes: ChatMapLayoutNode[], edges: ChatMapLayoutEdge[]): void {
  const ordered = [...nodes].sort((a, b) => a.created - b.created)
  const incoming = buildIncoming(edges)
  const col = new Map<string, number>()
  const row = new Map<string, number>()
  const citationCols = new Set<number>()
  const occupied = new Set<string>()
  let maxRow = -1

  for (const node of ordered) {
    if (!tryPlace(node, incoming, col, row, citationCols, occupied)) {
      assignCell(node.id, 0, maxRow + 1, col, row, occupied)
    }
    maxRow = Math.max(maxRow, row.get(node.id) ?? 0)
  }

  applyCoordinates(nodes, col, row, citationCols)
  resolveOverlaps(nodes)
}

function cellKey(c: number, r: number): string {
  return `${c},${r}`
}

function assignCell(
  nodeId: string,
  targetCol: number,
  targetRow: number,
  col: Map<string, number>,
  row: Map<string, number>,
  occupied: Set<string>,
): void {
  let c = targetCol
  const r = targetRow
  while (occupied.has(cellKey(c, r))) {
    c++
  }
  col.set(nodeId, c)
  row.set(nodeId, r)
  occupied.add(cellKey(c, r))
}

function buildIncoming(edges: ChatMapLayoutEdge[]): Map<string, ChatMapLayoutEdge[]> {
  const map = new Map<string, ChatMapLayoutEdge[]>()
  for (const e of edges) {
    if (!map.has(e.target)) map.set(e.target, [])
    map.get(e.target)!.push(e)
  }
  return map
}

function tryPlace(
  node: ChatMapLayoutNode,
  incoming: Map<string, ChatMapLayoutEdge[]>,
  col: Map<string, number>,
  row: Map<string, number>,
  citationCols: Set<number>,
  occupied: Set<string>,
): boolean {
  if (node.infoType === RESPONSE_TYPE) {
    return placeResponse(node, incoming, col, row, occupied)
  }
  return placeRequest(node, incoming, col, row, citationCols, occupied)
}

function placeResponse(
  node: ChatMapLayoutNode,
  incoming: Map<string, ChatMapLayoutEdge[]>,
  col: Map<string, number>,
  row: Map<string, number>,
  occupied: Set<string>,
): boolean {
  const qa = incoming.get(node.id)?.find((e) => e.edgeType === 'QUESTION_ANSWER')
  if (!qa) return false
  const srcCol = col.get(qa.source) ?? 0
  const srcRow = row.get(qa.source) ?? 0
  assignCell(node.id, srcCol, srcRow + 1, col, row, occupied)
  return true
}

function placeRequest(
  node: ChatMapLayoutNode,
  incoming: Map<string, ChatMapLayoutEdge[]>,
  col: Map<string, number>,
  row: Map<string, number>,
  citationCols: Set<number>,
  occupied: Set<string>,
): boolean {
  const ins = incoming.get(node.id) ?? []
  const citations = ins.filter((e) => e.edgeType === 'CITATION')
  if (citations.length > 0) {
    return placeCited(node, citations, col, row, citationCols, occupied)
  }
  const followup = ins.find((e) => e.edgeType === 'FOLLOW_UP')
  if (followup) {
    const srcCol = col.get(followup.source) ?? 0
    const srcRow = row.get(followup.source) ?? 0
    assignCell(node.id, srcCol, srcRow + 1, col, row, occupied)
    return true
  }
  return false
}

function placeCited(
  node: ChatMapLayoutNode,
  citations: ChatMapLayoutEdge[],
  col: Map<string, number>,
  row: Map<string, number>,
  citationCols: Set<number>,
  occupied: Set<string>,
): boolean {
  const citedRows = citations.map((e) => row.get(e.source) ?? 0)
  const citedCols = citations.map((e) => col.get(e.source) ?? 0)
  const targetCol = Math.max(...citedCols) + 1
  const targetRow = Math.max(...citedRows)
  assignCell(node.id, targetCol, targetRow, col, row, occupied)
  citationCols.add(col.get(node.id)!)
  return true
}

function applyCoordinates(
  nodes: ChatMapLayoutNode[],
  col: Map<string, number>,
  row: Map<string, number>,
  citationCols: Set<number>,
): void {
  for (const node of nodes) {
    const c = col.get(node.id) ?? 0
    node.x = c * CHAT_MAP_COL_W + (citationCols.has(c) ? CITATION_EXTRA_COL_GAP : 0)
    node.y = (row.get(node.id) ?? 0) * CHAT_MAP_ROW_H + CHAT_MAP_BASE_Y
  }
}

export function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function resolveOverlaps(nodes: ChatMapLayoutNode[]): void {
  const MIN_GAP = 8
  let hasOverlap = true
  let iterations = 0
  const maxIterations = 50

  while (hasOverlap && iterations < maxIterations) {
    hasOverlap = false
    iterations++
    const sorted = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x)

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]
        const b = sorted[j]
        if (!rectsOverlap(a.x, a.y, NODE_W, NODE_H, b.x, b.y, NODE_W, NODE_H)) continue
        hasOverlap = true

        const overlapRight = (a.x + NODE_W) - b.x
        const overlapLeft = (b.x + NODE_W) - a.x
        const overlapBottom = (a.y + NODE_H) - b.y
        const overlapTop = (b.y + NODE_H) - a.y
        const minOverlap = Math.min(overlapRight, overlapLeft, overlapBottom, overlapTop)

        const push = minOverlap + MIN_GAP

        if (minOverlap === overlapRight) {
          a.x -= push / 2
          b.x += push / 2
        } else if (minOverlap === overlapLeft) {
          a.x += push / 2
          b.x -= push / 2
        } else if (minOverlap === overlapBottom) {
          a.y -= push / 2
          b.y += push / 2
        } else {
          a.y += push / 2
          b.y -= push / 2
        }
      }
    }
  }
}
