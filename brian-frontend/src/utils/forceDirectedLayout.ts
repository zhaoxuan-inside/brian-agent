import type { GraphNode } from '../api/types'

export interface TagLayoutNode extends GraphNode { x: number; y: number; r: number; color: string; hue: number }

interface LayoutEdge { source: string; target: string; weight: number }

export function forceDirectedLayout(
  nodes: GraphNode[], edges: LayoutEdge[], width: number, height: number,
  repulsion = 2000, springStrength = 0.2,
): TagLayoutNode[] {
  const cx = width / 2
  const cy = height / 2
  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>()
  const degree = new Map<string, number>()

  for (let i = 0; i < nodes.length; i++) {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
    const r = Math.min(width, height) * 0.38
    positions.set(nodes[i].id, {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      vx: 0, vy: 0,
    })
    degree.set(nodes[i].id, 0)
  }
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1)
    degree.set(e.target, (degree.get(e.target) || 0) + 1)
  }

  const iterations = 400
  const springLength = 60
  const repulsionCutoff = 300
  const centerStrength = 0.004
  const damping = 0.88
  const margin = 40
  const boundaryStrength = 0.1
  const maxVelocity = 50

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = positions.get(nodes[i].id)!
      for (let j = i + 1; j < nodes.length; j++) {
        const b = positions.get(nodes[j].id)!
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distSq = dx * dx + dy * dy
        if (distSq > repulsionCutoff * repulsionCutoff) continue
        const dist = Math.sqrt(distSq) || 1
        const force = repulsion / Math.max(distSq, 100)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx; a.vy += fy
        b.vx -= fx; b.vy -= fy
      }
    }
    for (const e of edges) {
      const a = positions.get(e.source)
      const b = positions.get(e.target)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = (dist - springLength) * springStrength * Math.min(e.weight, 3)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    }
    for (const n of nodes) {
      const p = positions.get(n.id)!
      p.vx += (cx - p.x) * centerStrength
      p.vy += (cy - p.y) * centerStrength
      if (p.x < margin) p.vx += boundaryStrength * (margin - p.x)
      if (p.x > width - margin) p.vx -= boundaryStrength * (p.x - (width - margin))
      if (p.y < margin) p.vy += boundaryStrength * (margin - p.y)
      if (p.y > height - margin) p.vy -= boundaryStrength * (p.y - (height - margin))
    }
    for (const n of nodes) {
      const p = positions.get(n.id)!
      if (Math.abs(p.vx) > maxVelocity) p.vx = Math.sign(p.vx) * maxVelocity
      if (Math.abs(p.vy) > maxVelocity) p.vy = Math.sign(p.vy) * maxVelocity
      p.x += p.vx
      p.y += p.vy
      p.vx *= damping
      p.vy *= damping
    }
  }

  const maxWeight = Math.max(1, ...nodes.map((n) => n.weight || 0))
  const maxDegree = Math.max(1, ...degree.values())
  return nodes.map((n) => {
    const p = positions.get(n.id)!
    const d = degree.get(n.id) || 0
    const wRatio = Math.min((n.weight || 0) / maxWeight, 1)
    // Claude 暖色带(ADR-016):青=低频 → 珊瑚=高频,低饱和
    const hue = 168 - 150 * wRatio
    // 半径随连接度 sqrt 缩放(4–12),枢纽节点显著更大但不失真
    const r = Math.min(4 + Math.sqrt(d / maxDegree) * 8, 12)
    return {
      ...n,
      x: p.x,
      y: p.y,
      r,
      hue,
      color: `hsl(${hue}, 58%, 52%)`,
    }
  })
}
