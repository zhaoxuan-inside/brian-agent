/**
 * @fileoverview ChatMap（对话图谱画布）业务逻辑组合式函数。
 *
 * 从 ChatMap.vue 分离：画布缩放/平移、节点拖拽（碰撞推离 + 对齐吸附）、
 * 节点/连线选中与联动（列表↔图谱双向定位）、连线配色、思考过程加载。
 * 纯几何与吸附算法见 utils/chatMapGeometry / utils/chatMapLayout。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useChatUiStore } from '@/stores/chatUi'
import { chatApi } from '@/api'
import type { ChatMapNode } from '@/api/types'
import { NODE_H, NODE_W } from '@/utils/chatMapLayout'
import {
  arrowPoint as calcArrowPoint, edgeKey as calcEdgeKey, edgePath as calcEdgePath,
  pushOutOfOverlap, snapPosition, type EdgeRef, type SnapGuide,
} from '@/utils/chatMapGeometry'

export function useChatMap() {
  const sessionStore = useSessionStore()
  const chatUi = useChatUiStore()

  const containerRef = ref<HTMLDivElement | null>(null)
  const scale = ref(1)
  const offset = ref({ x: 40, y: 40 })
  const isPanning = ref(false)
  const panStart = ref({ x: 0, y: 0 })

  // 选中状态：activeNodeId 选中消息展示框，activeEdgeId 选中单条连线
  const activeNodeId = ref<string | null>(null)
  const activeEdgeId = ref<string | null>(null)
  const hoveredNodeId = ref<string | null>(null)

  // 拖动状态
  const draggingNodeId = ref<string | null>(null)
  const dragOffset = ref({ x: 0, y: 0 })
  const dragStartPos = ref({ x: 0, y: 0 })
  const snapGuides = ref<SnapGuide[]>([])

  const nodes = computed(() => sessionStore.chatMapNodes)
  const edges = computed(() => sessionStore.chatMapEdges)

  const nodeMap = computed(() => {
    const m = new Map<string, ChatMapNode>()
    for (const n of nodes.value) m.set(n.id, n)
    return m
  })

  const worldWidth = computed(() => {
    let maxX = 0
    for (const n of nodes.value) maxX = Math.max(maxX, n.x)
    return maxX + NODE_W + 200
  })

  const worldHeight = computed(() => {
    let maxY = 0
    for (const n of nodes.value) maxY = Math.max(maxY, n.y)
    return maxY + NODE_H + 200
  })

  // ===== 基于位置和状态的 z-index 分层，避免遮挡 =====
  function nodeStyle(n: ChatMapNode) {
    let z = 1
    if (draggingNodeId.value === n.id) {
      z = 100
    } else if (hoveredNodeId.value === n.id || activeNodeId.value === n.id) {
      z = 50
    } else {
      // 右下方的节点 z-index 更高，避免重叠时上方节点遮挡下方
      z = Math.round(n.y / 100) * 10 + Math.round(n.x / 100)
    }
    return {
      left: `${n.x}px`,
      top: `${n.y}px`,
      width: `${NODE_W}px`,
      minHeight: `${NODE_H}px`,
      zIndex: z,
    }
  }

  // ===== 连线路径与箭头（从 nodeMap 解析端点后委托纯函数） =====
  function edgePath(e: EdgeRef): string {
    const s = nodeMap.value.get(e.source)
    const t = nodeMap.value.get(e.target)
    if (!s || !t) return ''
    return calcEdgePath(e, s, t)
  }

  function arrowPoint(e: EdgeRef): string {
    const t = nodeMap.value.get(e.target)
    if (!t) return ''
    return calcArrowPoint(e, t)
  }

  function isEdgeSelected(e: EdgeRef) {
    return activeEdgeId.value === calcEdgeKey(e)
  }

  function isEdgeHighlightedByNode(e: EdgeRef) {
    if (!activeNodeId.value) return false
    return e.source === activeNodeId.value || e.target === activeNodeId.value
  }

  function getEdgeStroke(e: EdgeRef) {
    if (isEdgeSelected(e)) {
      return '#2563eb'
    }
    if (activeNodeId.value) {
      if (e.source === activeNodeId.value) {
        return '#8b5cf6'
      }
      if (e.target === activeNodeId.value) {
        return '#0284c7'
      }
      return 'rgba(160, 175, 195, 0.2)'
    }
    if (e.edgeType === 'CITATION' || e.edgeType === 'FOLLOW_UP') {
      return '#3b82f6'
    }
    return 'rgba(120, 130, 150, 0.45)'
  }

  function getEdgeStrokeWidth(e: EdgeRef) {
    if (isEdgeSelected(e)) return 3
    if (isEdgeHighlightedByNode(e)) return 2.5
    return 1.5
  }

  function getEdgeDashArray(e: EdgeRef) {
    if (e.edgeType === 'CITATION' || e.edgeType === 'FOLLOW_UP') {
      return isEdgeSelected(e) || isEdgeHighlightedByNode(e) ? 'none' : '5 3'
    }
    return 'none'
  }

  function getArrowFill(e: EdgeRef) {
    return getEdgeStroke(e)
  }

  // ===== 缩放 / 平移 / 拖拽 =====
  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    scale.value = Math.max(0.2, Math.min(2.5, scale.value * delta))
  }

  // 坐标转换：屏幕坐标 → 世界坐标（考虑缩放和偏移）
  function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    if (!containerRef.value) return { x: 0, y: 0 }
    const rect = containerRef.value.getBoundingClientRect()
    const sx = (clientX - rect.left - offset.value.x) / scale.value
    const sy = (clientY - rect.top - offset.value.y) / scale.value
    return { x: sx, y: sy }
  }

  function onMouseDown(e: MouseEvent) {
    const nodeEl = (e.target as HTMLElement).closest('.chat-map-node') as HTMLElement | null
    if (nodeEl) {
      const nodeId = nodeEl.dataset.nodeId
      if (nodeId) {
        startDrag(nodeId, e)
      }
      return
    }
    if ((e.target as HTMLElement).closest('.chat-map-edge')) return
    isPanning.value = true
    panStart.value = { x: e.clientX - offset.value.x, y: e.clientY - offset.value.y }
  }

  function startDrag(nodeId: string, e: MouseEvent) {
    const node = nodeMap.value.get(nodeId)
    if (!node) return
    draggingNodeId.value = nodeId
    const world = screenToWorld(e.clientX, e.clientY)
    dragOffset.value = { x: world.x - node.x, y: world.y - node.y }
    dragStartPos.value = { x: node.x, y: node.y }
    isPanning.value = false
  }

  function onMouseMove(e: MouseEvent) {
    if (draggingNodeId.value) {
      handleDrag(e)
      return
    }
    if (!isPanning.value) return
    offset.value = { x: e.clientX - panStart.value.x, y: e.clientY - panStart.value.y }
  }

  /** 拖拽：碰撞推离 → 对齐吸附 → 再次碰撞推离（确保吸附没有导致重叠） */
  function handleDrag(e: MouseEvent) {
    const nodeId = draggingNodeId.value
    if (!nodeId) return
    const node = nodeMap.value.get(nodeId)
    if (!node) return

    const world = screenToWorld(e.clientX, e.clientY)
    const newX = world.x - dragOffset.value.x
    const newY = world.y - dragOffset.value.y

    const otherNodes = nodes.value.filter((n) => n.id !== nodeId)

    const pushed = pushOutOfOverlap(newX, newY, NODE_W, NODE_H, otherNodes, nodeId)
    const snapped = snapPosition(pushed.x, pushed.y, otherNodes)
    const pushed2 = pushOutOfOverlap(snapped.x, snapped.y, NODE_W, NODE_H, otherNodes, nodeId)

    snapGuides.value = snapped.guides
    node.x = pushed2.x
    node.y = pushed2.y
  }

  function onMouseUp() {
    if (draggingNodeId.value) {
      snapGuides.value = []
      draggingNodeId.value = null
    }
    isPanning.value = false
  }

  // ===== 选中与联动 =====
  function onContainerClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.chat-map-node') || (e.target as HTMLElement).closest('.chat-map-edge')) return
    activeNodeId.value = null
    activeEdgeId.value = null
  }

  function onNodeClick(n: ChatMapNode) {
    activeNodeId.value = n.id
    activeEdgeId.value = null
    sessionStore.triggerFocus(n.infoId)
  }

  function onEdgeClick(e: EdgeRef) {
    activeEdgeId.value = calcEdgeKey(e)
    activeNodeId.value = null
  }

  function togglePin(n: ChatMapNode) {
    sessionStore.togglePin(n.infoId)
  }

  function jumpTo(infoId: string) {
    activeNodeId.value = infoId
    sessionStore.triggerFocus(infoId)
  }

  // 思考过程加载：请求思考块与执行轨迹并展示弹窗
  async function showThinking(infoId: string) {
    chatUi.startThinkingLoading(infoId)

    try {
      const res = await chatApi.thinking(infoId, 'blocks')
      chatUi.setThinkingBlocks(res.blocks ?? [])
      chatUi.setThinkingTrace((res as { trace?: import('@/api/types').ThinkingTrace | null }).trace ?? null)
    } catch {
      chatUi.setThinkingBlocks([])
      chatUi.setThinkingTrace(null)
    }
  }

  // 列表点击消息 -> 平移 ChatMap 使该消息居中并高亮
  watch(() => sessionStore.centerInfoId, async (id) => {
    if (!id) return
    activeNodeId.value = id
    activeEdgeId.value = null
    const node = nodeMap.value.get(id)
    if (!node || !containerRef.value) return
    await nextTick()
    const cw = containerRef.value.clientWidth
    const ch = containerRef.value.clientHeight
    offset.value = {
      x: -(node.x + NODE_W / 2) * scale.value + cw / 2,
      y: -(node.y + NODE_H / 2) * scale.value + ch / 2,
    }
  })

  return {
    containerRef, scale, offset, isPanning,
    activeNodeId, activeEdgeId, hoveredNodeId,
    draggingNodeId, snapGuides,
    nodes, edges, nodeMap, worldWidth, worldHeight,
    nodeStyle, edgePath, arrowPoint,
    getEdgeStroke, getEdgeStrokeWidth, getEdgeDashArray, getArrowFill,
    onWheel, onMouseDown, onMouseMove, onMouseUp, onContainerClick,
    onNodeClick, onEdgeClick, togglePin, jumpTo, showThinking,
  }
}
