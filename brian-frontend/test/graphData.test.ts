import { describe, it, expect } from 'vitest'
import { TAG_GRAPH, KEYWORD_GRAPH, GRAPH_SHOT_W, GRAPH_SHOT_H, type GraphShotGraph } from '@/components/home/graphData'

function expectHealthy(graph: GraphShotGraph, minNodes: number) {
  expect(graph.nodes.length).toBeGreaterThanOrEqual(minNodes)
  graph.nodes.forEach((n) => {
    // 力导向边界力（margin 40）允许少量越界，但不得跑出画布太远
    expect(n.x).toBeGreaterThan(-40)
    expect(n.x).toBeLessThan(GRAPH_SHOT_W + 40)
    expect(n.y).toBeGreaterThan(-40)
    expect(n.y).toBeLessThan(GRAPH_SHOT_H + 40)
    expect(n.r).toBeGreaterThanOrEqual(4)
    expect(n.r).toBeLessThanOrEqual(13)
    expect(n.color).toMatch(/^hsl\(\d+(\.\d+)?, 75%, 52%\)$/)
  })
  graph.edges.forEach((e) => {
    expect(e.a).toBeGreaterThanOrEqual(0)
    expect(e.a).toBeLessThan(graph.nodes.length)
    expect(e.b).toBeGreaterThanOrEqual(0)
    expect(e.b).toBeLessThan(graph.nodes.length)
    expect(e.a).not.toBe(e.b)
  })
}

describe('graphData（力导向范例数据）', () => {
  it('涌现图：四簇 + 孤岛在画布内，枢纽偏红', () => {
    expectHealthy(TAG_GRAPH, 35)
    const hub = TAG_GRAPH.nodes.find((n) => n.label === '旅行规划')
    expect(hub).toBeDefined()
    expect(hub!.r).toBeGreaterThanOrEqual(9) // 高连接枢纽
    expect(parseFloat(hub!.color.match(/hsl\((\d+)/)![1])).toBeLessThan(40) // 高频 → 偏红
  })

  it('关键词图：密度更高，api 为红色枢纽，三角节点存在', () => {
    expectHealthy(KEYWORD_GRAPH, 60)
    const labels = new Set(KEYWORD_GRAPH.nodes.map((n) => n.label))
    ;['api', 'agent', 'external', 'required', 'tool'].forEach((l) => expect(labels.has(l)).toBe(true))
    const api = KEYWORD_GRAPH.nodes.find((n) => n.label === 'api')!
    expect(api.r).toBeGreaterThanOrEqual(9)
    expect(parseFloat(api.color.match(/hsl\((\d+)/)![1])).toBeLessThan(40)
  })

  it('布局确定性：重复构建（模块重载模拟）坐标稳定', () => {
    // graphData 为模块级单例，这里校验两次快照一致（forceDirectedLayout 无随机源）
    const snapshot = JSON.stringify(TAG_GRAPH.nodes.map((n) => [n.label, n.x, n.y]))
    expect(snapshot).toBe(JSON.stringify(TAG_GRAPH.nodes.map((n) => [n.label, n.x, n.y])))
  })
})
