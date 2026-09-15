/**
 * @fileoverview 消息关系图谱数据装配纯函数。
 *
 * 从 stores/session 的 loadDag 分离：可视化接口返回的原始节点/边 →
 * ChatMap 展示模型（REQUEST/RESPONSE 节点 + 一问一答/引用/追问边），
 * 布局交给 utils/chatMapLayout。
 */
import type { ChatMapNode, ChatMapEdge } from '../api/types'

function mapEdgeType(type: string): ChatMapEdge['edgeType'] {
  const upper = type.toUpperCase()
  if (upper.startsWith('QUESTION')) return 'QUESTION_ANSWER'
  if (upper === 'FOLLOW_UP') return 'FOLLOW_UP'
  return 'CITATION'
}

/**
 * 将 messageDAG 接口的原始图数据装配为 ChatMap 节点与边。
 * - 仅保留 REQUEST / RESPONSE 节点，按创建时间升序；
 * - 丢弃端点缺失或自环的边，并按 (from,to) 去重；
 * - 坐标字段初始化为 0，由 layoutChatMap 就地计算。
 */
export function buildMessageGraph(
  rawNodes: Array<Record<string, unknown>>,
  rawEdges: Array<Record<string, unknown>>,
): { nodes: ChatMapNode[]; edges: ChatMapEdge[] } {
  const msgNodes = rawNodes
    .filter((n) => n.info_type === 'REQUEST' || n.info_type === 'RESPONSE')
    .sort((a, b) => Number(a.created ?? 0) - Number(b.created ?? 0))

  const idSet = new Set(msgNodes.map((n) => String(n.info_id ?? n.id ?? '')))
  const edgePairSet = new Set<string>()
  const edges: ChatMapEdge[] = []
  for (const e of rawEdges) {
    const from = String(e.from ?? '')
    const to = String(e.to ?? '')
    if (!idSet.has(from) || !idSet.has(to) || from === to) continue
    const pairKey = `${from}->${to}`
    if (edgePairSet.has(pairKey)) continue
    edgePairSet.add(pairKey)
    edges.push({
      source: from,
      target: to,
      edgeType: mapEdgeType(String(e.edge_type ?? '')),
    })
  }

  const nodes: ChatMapNode[] = msgNodes.map((n) => ({
    id: String(n.info_id ?? n.id ?? ''),
    infoId: String(n.info_id ?? n.id ?? ''),
    infoType: String(n.info_type ?? ''),
    role: String(n.info_creator_role ?? ''),
    summary: String(n.info_summary ?? ''),
    info: String(n.info ?? ''),
    infoLength: Number(n.info_length ?? 0),
    created: Number(n.created ?? 0),
    pin: Boolean(n.pin),
    citingCount: Number(n.citing_count ?? 0),
    citedCount: Number(n.cited_count ?? 0),
    citingInfoIds: (n.citing_info_ids as string[]) ?? [],
    citedInfoIds: (n.cited_info_ids as string[]) ?? [],
    workId: n.work_id ? String(n.work_id) : undefined,
    runId: n.run_id ? String(n.run_id) : undefined,
    traceId: n.trace_id ? String(n.trace_id) : undefined,
    handleResultType: n.handle_result_type ? String(n.handle_result_type) : undefined,
    x: 0,
    y: 0,
  }))

  return { nodes, edges }
}
