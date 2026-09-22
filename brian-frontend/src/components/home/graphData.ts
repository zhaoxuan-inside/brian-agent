// ===== 首页动态图谱示意的静态数据（涌现图 / 关键词图）=====
// 数据与编排分离：本文件只负责「画布上有什么、长什么样」——
// 节点按主题簇组织，坐标由项目同款力导向算法（utils/forceDirectedLayout，
// 与真实涌现页共用）确定性生成，GraphShot.vue 只负责渲染与漂移动画。

import { forceDirectedLayout } from '@/utils/forceDirectedLayout'
import type { GraphEdge, GraphNode } from '@/api/types'

export interface GraphShotNode {
  label: string
  x: number
  y: number
  r: number
  color: string
}

export interface GraphShotEdge {
  a: number
  b: number
}

export interface GraphShotGraph {
  nodes: GraphShotNode[]
  edges: GraphShotEdge[]
}

// 画布逻辑尺寸，与 GraphShot.vue 的 viewBox 保持一致
export const GRAPH_SHOT_W = 1000
export const GRAPH_SHOT_H = 560

interface ClusterDef {
  /** 簇内标签，首位为簇枢纽（权重最高 → 颜色偏红） */
  labels: string[]
  hubWeight: number
}

function makeNodes(defs: ClusterDef[]): GraphNode[] {
  const nodes: GraphNode[] = []
  defs.forEach(({ labels, hubWeight }) => {
    labels.forEach((label, i) => {
      // 指数衰减：枢纽突出、次级快速回落，接近真实频率分布
      const weight = Math.max(1, Math.round(hubWeight * Math.pow(0.72, i)))
      nodes.push({ id: label, name: label, weight, degree: 0 })
    })
  })
  return nodes
}

/** 簇内连边：相邻链 + 每隔 3 个的跳连，让簇内呈网状而非链状 */
function intraEdges(defs: ClusterDef[]): GraphEdge[] {
  const edges: GraphEdge[] = []
  defs.forEach(({ labels }) => {
    const n = labels.length
    for (let i = 0; i < n - 1; i++) edges.push({ source: labels[i], target: labels[i + 1], weight: 2 })
    for (let i = 0; i + 2 < n; i += 3) edges.push({ source: labels[i], target: labels[i + 2], weight: 1 })
  })
  return edges
}

function dedupe(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>()
  return edges.filter((e) => {
    const key = e.source < e.target ? `${e.source}-${e.target}` : `${e.target}-${e.source}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): GraphShotGraph {
  const laid = forceDirectedLayout(nodes, dedupe(edges), GRAPH_SHOT_W, GRAPH_SHOT_H, 2600, 0.16)
  const index = new Map(laid.map((n, i) => [n.id, i]))
  return {
    // 半径按权重（频率）：低频 5.4px，最高频枢纽 13px（对应图例「越大连接度越高」）
    nodes: laid.map((n) => ({
      label: n.name,
      x: Math.round(n.x * 10) / 10,
      y: Math.round(n.y * 10) / 10,
      r: Math.min(4.5 + n.weight * 0.85, 13),
      color: n.color,
    })),
    edges: edges.map((e) => ({ a: index.get(e.source)!, b: index.get(e.target)! })),
  }
}

// ===== 涌现图 · Tag Graph =====
// 四个主题簇（面板行业为独立孤岛，还原原图形态），簇间以少量语义桥接相连
const TAG_CLUSTERS: ClusterDef[] = [
  { labels: ['面板行业', '投资分析', '财务分析OLED', '华为oled显示', '定性研究', 'LCD', 'AMOLED'], hubWeight: 6 },
  { labels: ['旅行规划', '故宫', '颐和园', '八达岭长城', '地铁出行', '博物馆预约', '博物馆通票', '行程提醒', '天气App', '天气数据', '中国天气网', '气象预警', '穿搭建议', '穿搭提醒', '雨具清单', '室内活动'], hubWeight: 10 },
  { labels: ['餐厅推荐', '北京酒店预订', '住宿区域推荐', '王府井', '什刹海', '烧烤', '购物清单', '预算参考'], hubWeight: 8 },
  { labels: ['研究Agent', 'Agent架构', 'DeepSeek V4', '信息检索', '浏览器自动化', '工具缺失', '用户偏好', '科学冷知识'], hubWeight: 8 },
]
const TAG_BRIDGES: [string, string][] = [
  ['旅行规划', '餐厅推荐'],
  ['用户偏好', '行程提醒'],
  ['浏览器自动化', '中国天气网'],
]

const TAG_GRAPH_RAW = layoutGraph(makeNodes(TAG_CLUSTERS), [...intraEdges(TAG_CLUSTERS), ...TAG_BRIDGES.map(([s, t]) => ({ source: s, target: t, weight: 1 }))])
export const TAG_GRAPH: GraphShotGraph = TAG_GRAPH_RAW

// ===== 关键词图 · Keyword Graph =====
// 四个语义簇（API / Agent / 存储 / 通用词）+ 外围稀疏孤点 + 顶部 external/required/tool 三角
const KEYWORD_CLUSTERS: ClusterDef[] = [
  { labels: ['api', 'http', 'https', 'request', 'response', 'server', 'url', 'token', 'json', 'schema', 'query', 'param'], hubWeight: 10 },
  { labels: ['agent', 'model', 'prompt', 'llm', 'tool', 'memory', 'skill', 'mcp', 'plan', 'task', 'message', 'system'], hubWeight: 8 },
  { labels: ['data', 'db', 'cache', 'file', 'path', 'read', 'write', 'log', 'queue', 'job', 'cron', 'config'], hubWeight: 7 },
  { labels: ['name', 'string', 'object', 'type', 'description', 'value', 'item', 'text', 'key', 'id', 'date', 'code', 'list', 'format', 'user', 'time'], hubWeight: 6 },
]
const KEYWORD_FRINGE = ['vue', 'css', 'html', 'node', 'git', 'test', 'error', 'info', 'local', 'dir', 'note', 'doc']
const KEYWORD_BRIDGES: [string, string][] = [
  ['api', 'agent'],
  ['api', 'data'],
  ['agent', 'data'],
  ['name', 'api'],
]

function keywordGraph(): GraphShotGraph {
  const nodes = makeNodes(KEYWORD_CLUSTERS)
  const coreLabels = KEYWORD_CLUSTERS.flatMap((c) => c.labels)
  const edges = [...intraEdges(KEYWORD_CLUSTERS), ...KEYWORD_BRIDGES.map(([s, t]) => ({ source: s, target: t, weight: 1 }))]
  // 外围孤点：各自挂在一条核心边上，形成稀疏边缘
  KEYWORD_FRINGE.forEach((label, i) => {
    nodes.push({ id: label, name: label, weight: 1, degree: 0 })
    edges.push({ source: label, target: coreLabels[(i * 5) % coreLabels.length], weight: 1 })
  })
  // 顶部三角：external / required 挂在 tool 上
  nodes.push({ id: 'external', name: 'external', weight: 1, degree: 0 })
  nodes.push({ id: 'required', name: 'required', weight: 1, degree: 0 })
  edges.push({ source: 'external', target: 'tool', weight: 1 })
  edges.push({ source: 'required', target: 'tool', weight: 1 })
  edges.push({ source: 'external', target: 'required', weight: 1 })
  return layoutGraph(nodes, edges)
}

export const KEYWORD_GRAPH: GraphShotGraph = keywordGraph()
