export interface DagLayoutNode {
  id: string
  label: string
  domain?: string
  content?: string
  status?: string
  agentName?: string
  input?: string
  output?: string
  elapsedMs?: number
  tokenUsage?: number
  [key: string]: unknown
}

export interface DagLayoutEdge {
  source: string
  target: string
  label?: string
}

export interface DagLayoutPos {
  x: number
  y: number
  layer: number
  row: number
}

export interface DagLayoutResult {
  positions: Map<string, DagLayoutPos>
  layers: Map<string, number>
  totalWidth: number
  totalHeight: number
  nodeWidth: number
  nodeHeight: number
}

export const DAG_NODE_W = 172
export const DAG_NODE_H = 72
export const DAG_COL_GAP = 130
export const DAG_ROW_GAP = 28

export function computeLayers(
  nodes: DagLayoutNode[],
  edges: DagLayoutEdge[],
): Map<string, number> {
  const indegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of nodes) {
    indegree.set(n.id, 0)
    adj.set(n.id, [])
  }
  for (const e of edges) {
    if (!adj.has(e.source) || !adj.has(e.target) || e.source === e.target) continue
    adj.get(e.source)!.push(e.target)
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
  }

  const layers = new Map<string, number>()
  let queue = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id)
  for (const id of queue) layers.set(id, 0)

  while (queue.length > 0) {
    const next: string[] = []
    for (const id of queue) {
      const curLayer = layers.get(id) ?? 0
      for (const t of adj.get(id) ?? []) {
        const nl = curLayer + 1
        if ((layers.get(t) ?? 0) < nl) layers.set(t, nl)
        indegree.set(t, (indegree.get(t) ?? 0) - 1)
        if ((indegree.get(t) ?? 0) === 0) next.push(t)
      }
    }
    queue = next
  }

  
  const ordered = nodes.map((n) => n.id)
  let fallbackLayer = layers.size === 0 ? 0 : Math.max(0, ...layers.values()) + 1
  for (const id of ordered) {
    if (!layers.has(id)) {
      layers.set(id, fallbackLayer++)
    }
  }
  return layers
}

export function layoutDag(
  nodes: DagLayoutNode[],
  edges: DagLayoutEdge[],
): DagLayoutResult {
  const layers = computeLayers(nodes, edges)

  
  const groups = new Map<number, string[]>()
  const originalIndex = new Map<string, number>()
  nodes.forEach((n, i) => {
    originalIndex.set(n.id, i)
    const l = layers.get(n.id) ?? 0
    if (!groups.has(l)) groups.set(l, [])
    groups.get(l)!.push(n.id)
  })
  for (const ids of groups.values()) {
    ids.sort((a, b) => (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0))
  }

  const layerKeys = [...groups.keys()].sort((a, b) => a - b)
  const positions = new Map<string, DagLayoutPos>()
  let maxRows = 0

  for (const l of layerKeys) {
    const ids = groups.get(l)!
    const rows = ids.length
    if (rows > maxRows) maxRows = rows
    const blockH = rows * DAG_NODE_H + (rows - 1) * DAG_ROW_GAP
    const top = -blockH / 2
    ids.forEach((id, i) => {
      positions.set(id, {
        x: l * (DAG_NODE_W + DAG_COL_GAP),
        y: top + i * (DAG_NODE_H + DAG_ROW_GAP),
        layer: l,
        row: i,
      })
    })
  }

  const maxLayer = layerKeys.length > 0 ? layerKeys[layerKeys.length - 1] : 0
  const totalWidth = (maxLayer + 1) * (DAG_NODE_W + DAG_COL_GAP)
  const totalHeight = maxRows * DAG_NODE_H + (maxRows - 1) * DAG_ROW_GAP

  
  const halfHeight = totalHeight / 2
  for (const pos of positions.values()) {
    pos.y += halfHeight
  }

  return { positions, layers, totalWidth, totalHeight, nodeWidth: DAG_NODE_W, nodeHeight: DAG_NODE_H }
}
