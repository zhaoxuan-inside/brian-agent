import { describe, it, expect } from 'vitest'
import {
  layoutChatMap,
  CHAT_MAP_ROW_H,
  CHAT_MAP_COL_W,
  CHAT_MAP_BASE_Y,
  type ChatMapLayoutNode,
  type ChatMapLayoutEdge,
} from '@/utils/chatMapLayout'

const CITATION_EXTRA_RATIO = 60 / CHAT_MAP_COL_W

function node(id: string, infoType: string, created: number): ChatMapLayoutNode {
  return { id, infoType, created, x: 0, y: 0 }
}

function qa(source: string, target: string): ChatMapLayoutEdge {
  return { source, target, edgeType: 'QUESTION_ANSWER' }
}

function cite(source: string, target: string): ChatMapLayoutEdge {
  return { source, target, edgeType: 'CITATION' }
}

function followUp(source: string, target: string): ChatMapLayoutEdge {
  return { source, target, edgeType: 'FOLLOW_UP' }
}

const byId = (nodes: ChatMapLayoutNode[], id: string) => nodes.find((n) => n.id === id)!
const rowOf = (n: ChatMapLayoutNode) => (n.y - CHAT_MAP_BASE_Y) / CHAT_MAP_ROW_H
const colOf = (n: ChatMapLayoutNode) => n.x / CHAT_MAP_COL_W

describe('chatMapLayout', () => {
  it('顺序问答：问题与回答纵向顺序排布（同列）', () => {
    const nodes = [node('q1', 'REQUEST', 100), node('a1', 'RESPONSE', 200), node('q2', 'REQUEST', 300), node('a2', 'RESPONSE', 400)]
    const edges = [qa('q1', 'a1'), qa('q2', 'a2'), followUp('a1', 'q2')]

    layoutChatMap(nodes, edges)

    expect(colOf(byId(nodes, 'q1'))).toBe(0)
    expect(colOf(byId(nodes, 'a1'))).toBe(0)
    expect(colOf(byId(nodes, 'q2'))).toBe(0)
    expect(colOf(byId(nodes, 'a2'))).toBe(0)
    expect(rowOf(byId(nodes, 'q1'))).toBe(0)
    expect(rowOf(byId(nodes, 'a1'))).toBe(1)
    expect(rowOf(byId(nodes, 'q2'))).toBe(2)
    expect(rowOf(byId(nodes, 'a2'))).toBe(3)
  })

  it('单个问答对：回答在问题正下方', () => {
    const nodes = [node('q1', 'REQUEST', 100), node('a1', 'RESPONSE', 200)]
    const edges = [qa('q1', 'a1')]

    layoutChatMap(nodes, edges)

    expect(rowOf(byId(nodes, 'q1'))).toBe(0)
    expect(rowOf(byId(nodes, 'a1'))).toBe(1)
  })

  it('引用问答：引用问题在被引用消息右边且顶部对齐，回答与提问居中对齐', () => {
    const nodes = [node('q1', 'REQUEST', 100), node('a1', 'RESPONSE', 200), node('q2', 'REQUEST', 300), node('a2', 'RESPONSE', 400)]
    const edges = [qa('q1', 'a1'), qa('q2', 'a2'), cite('a1', 'q2')]

    layoutChatMap(nodes, edges)

    expect(colOf(byId(nodes, 'q1'))).toBe(0)
    expect(colOf(byId(nodes, 'a1'))).toBe(0)
    
    expect(colOf(byId(nodes, 'q2'))).toBeCloseTo(1 + CITATION_EXTRA_RATIO, 1)
    expect(colOf(byId(nodes, 'a2'))).toBeCloseTo(1 + CITATION_EXTRA_RATIO, 1)
    expect(colOf(byId(nodes, 'q2'))).toBe(colOf(byId(nodes, 'a2')))
    expect(rowOf(byId(nodes, 'q2'))).toBe(rowOf(byId(nodes, 'a1')))
    expect(rowOf(byId(nodes, 'a2'))).toBe(rowOf(byId(nodes, 'q2')) + 1)
  })

  it('多引用：引用问题与被引用消息中最靠下的一个顶部对齐', () => {
    const nodes = [
      node('q1', 'REQUEST', 100), node('a1', 'RESPONSE', 200),
      node('q2', 'REQUEST', 300), node('a2', 'RESPONSE', 400),
      node('q3', 'REQUEST', 500), node('a3', 'RESPONSE', 600),
    ]
    const edges = [qa('q1', 'a1'), qa('q2', 'a2'), qa('q3', 'a3'), followUp('a1', 'q2'), cite('a1', 'q3'), cite('a2', 'q3')]

    layoutChatMap(nodes, edges)

    
    expect(rowOf(byId(nodes, 'q3'))).toBe(3)
    expect(colOf(byId(nodes, 'q3'))).toBeCloseTo(1 + CITATION_EXTRA_RATIO, 1)
  })

  it('链式引用：逐层向右展开，回答与提问居中对齐', () => {
    const nodes = [
      node('q1', 'REQUEST', 100), node('a1', 'RESPONSE', 200),
      node('q2', 'REQUEST', 300), node('a2', 'RESPONSE', 400),
      node('q3', 'REQUEST', 500), node('a3', 'RESPONSE', 600),
    ]
    const edges = [qa('q1', 'a1'), qa('q2', 'a2'), qa('q3', 'a3'), cite('a1', 'q2'), cite('a2', 'q3')]

    layoutChatMap(nodes, edges)

    expect(colOf(byId(nodes, 'q2'))).toBeCloseTo(1 + CITATION_EXTRA_RATIO, 1)
    expect(colOf(byId(nodes, 'a2'))).toBeCloseTo(1 + CITATION_EXTRA_RATIO, 1)
    expect(colOf(byId(nodes, 'q2'))).toBe(colOf(byId(nodes, 'a2')))
    expect(colOf(byId(nodes, 'q3'))).toBeCloseTo(2 + CITATION_EXTRA_RATIO, 1)
    expect(colOf(byId(nodes, 'a3'))).toBeCloseTo(2 + CITATION_EXTRA_RATIO, 1)
    expect(colOf(byId(nodes, 'q3'))).toBe(colOf(byId(nodes, 'a3')))
    expect(rowOf(byId(nodes, 'q3'))).toBe(rowOf(byId(nodes, 'a2')))
  })

  it('引用后追问：追问与引用问答同列纵向衔接，居中对齐', () => {
    const nodes = [
      node('q1', 'REQUEST', 100), node('a1', 'RESPONSE', 200),
      node('q2', 'REQUEST', 300), node('a2', 'RESPONSE', 400),
      node('q3', 'REQUEST', 500), node('a3', 'RESPONSE', 600),
    ]
    const edges = [qa('q1', 'a1'), qa('q2', 'a2'), qa('q3', 'a3'), cite('a1', 'q2'), followUp('a2', 'q3')]

    layoutChatMap(nodes, edges)

    
    expect(colOf(byId(nodes, 'q3'))).toBeCloseTo(1 + CITATION_EXTRA_RATIO, 1)
    expect(colOf(byId(nodes, 'q3'))).toBe(colOf(byId(nodes, 'a2')))
    expect(rowOf(byId(nodes, 'q3'))).toBe(rowOf(byId(nodes, 'a2')) + 1)
  })
})
