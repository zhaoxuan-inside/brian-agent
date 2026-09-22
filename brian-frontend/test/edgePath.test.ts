import { describe, it, expect } from 'vitest'
import { edgeAnchor, smoothEdgePath, type EdgeRect } from '@/utils/edgePath'

const rect: EdgeRect = { x: 100, y: 200, w: 220, h: 112 }

describe('edgeAnchor', () => {
  it('anchors on the border of each side, midpoint by default', () => {
    expect(edgeAnchor(rect, 'top')).toEqual({ x: 210, y: 200 })
    expect(edgeAnchor(rect, 'bottom')).toEqual({ x: 210, y: 312 })
    expect(edgeAnchor(rect, 'left')).toEqual({ x: 100, y: 256 })
    expect(edgeAnchor(rect, 'right')).toEqual({ x: 320, y: 256 })
  })

  it('supports along-offset for S curves', () => {
    expect(edgeAnchor(rect, 'bottom', 0.4)).toEqual({ x: 188, y: 312 })
    expect(edgeAnchor(rect, 'right', 0.25)).toEqual({ x: 320, y: 228 })
  })
})

describe('smoothEdgePath', () => {
  it('starts and ends exactly on the two card edges', () => {
    const d = smoothEdgePath(rect, 'bottom', { x: 60, y: 420, w: 226, h: 112 }, 'top')
    expect(d.startsWith('M210,312')).toBe(true)
    expect(d.endsWith('173,420')).toBe(true)
  })

  it('keeps horizontal tangent on left/right anchors and vertical on top/bottom', () => {
    const h = smoothEdgePath(rect, 'right', { x: 380, y: 180, w: 220, h: 96 }, 'left')
    const hC = h.match(/C([\d.]+),([\d.]+) ([\d.]+),([\d.]+)/)!.slice(1).map(Number)
    expect(hC[1]).toBe(256) // c1.y = p1.y（右锚点切线水平）
    expect(hC[3]).toBe(228) // c2.y = p2.y（左锚点切线水平）

    const v = smoothEdgePath(rect, 'bottom', { x: 60, y: 420, w: 226, h: 112 }, 'top')
    const vC = v.match(/C([\d.]+),([\d.]+) ([\d.]+),([\d.]+)/)!.slice(1).map(Number)
    expect(vC[0]).toBe(210) // c1.x = p1.x（下锚点切线垂直）
    expect(vC[2]).toBe(173) // c2.x = p2.x（上锚点切线垂直）
  })

  it('bends with distance but clamps to [24, 96]', () => {
    const near = smoothEdgePath(rect, 'right', { x: 340, y: 200, w: 40, h: 40 }, 'left')
    const far = smoothEdgePath(rect, 'right', { x: 900, y: 200, w: 40, h: 40 }, 'left')
    const cp = (d: string) => Number(d.match(/C([\d.]+),/)![1])
    expect(cp(near)).toBe(320 + 24)
    expect(cp(far)).toBe(320 + 96)
  })
})
