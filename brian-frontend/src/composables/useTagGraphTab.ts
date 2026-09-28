import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { configApi, memoryApi } from '../api'
import type { GraphEdge, GraphNode, MemoryItem } from '../api/types'
import type { InfoTabKey } from '../api/types'
import { forceDirectedLayout, type TagLayoutNode } from '../utils/forceDirectedLayout'

export interface TagGraphTabDeps {
  activeTab: Ref<InfoTabKey>
  closeContextMenu: () => void
  loadHistory: () => void
  loadMemory: () => void
  loadAllDateCounts: () => PromiseLike<unknown> | unknown
  loadLibraries: () => void
  loadProfile: () => void
  onMemoryScroll: () => void
  startDateCountRefresh: () => void
  stopDateCountRefresh: () => void
}

const GRAPH_SIZE = 700

interface GraphStateIO {
  fetchGraph: () => Promise<{ nodes?: GraphNode[]; edges?: GraphEdge[] }>
  fetchMemories: (name: string) => Promise<MemoryItem[]>
  clearApi: () => Promise<unknown>
}

function createGraphState(kind: 'tag' | 'keyword', io: GraphStateIO) {
  const nodes = ref<GraphNode[]>([])
  const edges = ref<GraphEdge[]>([])
  const loading = ref(false)
  const selected = ref<string | null>(null)
  const selectedMemories = ref<MemoryItem[]>([])
  const layoutNodes = ref<TagLayoutNode[]>([])
  const hoveredId = ref<string | null>(null)
  const scale = ref(1)
  const tx = ref(0)
  const ty = ref(0)
  const draggingId = ref<string | null>(null)
  const panning = ref(false)
  let panStart: { x: number; y: number } | null = null
  const svgRef = ref<SVGSVGElement | null>(null)
  const search = ref('')
  const clearing = ref(false)

  const repulsion = ref(2000)
  const springStrength = ref(0.2)
  const showLabels = ref(true)
  let rerunLayoutTimer: ReturnType<typeof setTimeout> | null = null
  let saveConfigTimer: ReturnType<typeof setTimeout> | null = null

  async function loadConfig() {
    try {
      const cfg = await configApi.graphVisualization.get(kind)
      repulsion.value = cfg.graph_repulsion ?? 2000
      springStrength.value = cfg.graph_spring_strength ?? 0.2
      showLabels.value = cfg.graph_show_labels ?? true
    } catch (err) {
      console.error('[GraphPane] 加载图可视化配置失败', err)
    }
  }

  function saveConfig() {
    if (saveConfigTimer) clearTimeout(saveConfigTimer)
    saveConfigTimer = setTimeout(() => {
      configApi.graphVisualization.save(kind, {
        graph_repulsion: repulsion.value,
        graph_spring_strength: springStrength.value,
        graph_show_labels: showLabels.value,
      }).catch(() => {})
    }, 500)
  }

  function rerunLayout() {
    if (rerunLayoutTimer) clearTimeout(rerunLayoutTimer)
    rerunLayoutTimer = setTimeout(() => {
      if (nodes.value.length > 0) {
        layoutNodes.value = forceDirectedLayout(nodes.value, edges.value, GRAPH_SIZE, GRAPH_SIZE, repulsion.value, springStrength.value)
      }
    }, 80)
  }

  watch([repulsion, springStrength], () => { rerunLayout(); saveConfig() })
  watch(showLabels, saveConfig)

  const neighbors = computed(() => {
    const map = new Map<string, Set<string>>()
    for (const e of edges.value) {
      if (!map.has(e.source)) map.set(e.source, new Set())
      if (!map.has(e.target)) map.set(e.target, new Set())
      map.get(e.source)!.add(e.target)
      map.get(e.target)!.add(e.source)
    }
    return map
  })

  const nodePosMap = computed(() => {
    const map = new Map<string, TagLayoutNode>()
    for (const n of layoutNodes.value) map.set(n.id, n)
    return map
  })

  function isNodeDimmed(nodeId: string): boolean {
    if (!hoveredId.value && !selected.value) return false
    const focusId = hoveredId.value || selected.value
    if (nodeId === focusId) return false
    const ns = neighbors.value.get(focusId!)
    return !ns?.has(nodeId)
  }

  function isEdgeHighlighted(edge: GraphEdge): boolean {
    const focusId = hoveredId.value || selected.value
    if (!focusId) return false
    return edge.source === focusId || edge.target === focusId
  }

  async function load() {
    loading.value = true
    try {
      const data = await io.fetchGraph()
      nodes.value = data.nodes || []
      edges.value = data.edges || []
      layoutNodes.value = forceDirectedLayout(nodes.value, edges.value, GRAPH_SIZE, GRAPH_SIZE, repulsion.value, springStrength.value)
    } catch (err) {
      console.error(`[GraphPane:${kind}] 加载图数据失败`, err)
      nodes.value = []; edges.value = []; layoutNodes.value = []
    } finally { loading.value = false }
  }

  function svgToView(event: MouseEvent): { x: number; y: number } {
    const rect = svgRef.value ? svgRef.value.getBoundingClientRect() : null
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    const s = Math.min(rect.width / GRAPH_SIZE, rect.height / GRAPH_SIZE)
    const offsetX = (rect.width - GRAPH_SIZE * s) / 2
    const offsetY = (rect.height - GRAPH_SIZE * s) / 2
    const viewX = (event.clientX - rect.left - offsetX) / s
    const viewY = (event.clientY - rect.top - offsetY) / s
    return { x: (viewX - tx.value) / scale.value, y: (viewY - ty.value) / scale.value }
  }

  function onWheel(event: WheelEvent) {
    const delta = event.deltaY > 0 ? 0.9 : 1.1
    scale.value = Math.min(3, Math.max(0.4, scale.value * delta))
  }

  function onMouseDown(event: MouseEvent) {
    panning.value = true
    panStart = { x: event.clientX, y: event.clientY }
  }

  function onMouseMove(event: MouseEvent) {
    if (panning.value && panStart) {
      tx.value += event.clientX - panStart.x
      ty.value += event.clientY - panStart.y
      panStart = { x: event.clientX, y: event.clientY }
    }
    if (draggingId.value) {
      const p = svgToView(event)
      const node = layoutNodes.value.find(n => n.id === draggingId.value)
      if (node) { node.x = p.x; node.y = p.y }
    }
  }

  function onMouseUp() {
    panning.value = false
    panStart = null
    draggingId.value = null
  }

  function onNodeMouseDown(event: MouseEvent, nodeId: string) {
    event.stopPropagation()
    draggingId.value = nodeId
  }

  async function selectNode(nodeId: string) {
    selected.value = selected.value === nodeId ? null : nodeId
    if (selected.value) {
      try {
        const name = nodes.value.find(n => n.id === nodeId)?.name || nodeId
        selectedMemories.value = await io.fetchMemories(name)
      } catch (err) {
        console.error('[GraphPane] 加载节点关联记忆失败', err)
        selectedMemories.value = []
      }
    } else {
      selectedMemories.value = []
    }
  }

  async function clearAll() {
    if (clearing.value) return
    clearing.value = true
    try {
      await io.clearApi()
      nodes.value = []
      edges.value = []
      layoutNodes.value = []
      selected.value = null
      selectedMemories.value = []
      search.value = ''
      scale.value = 1
      tx.value = 0
      ty.value = 0
    } catch (err) {
      console.error(`[GraphPane:${kind}] 清理图失败`, err)
    }
    finally { clearing.value = false }
  }

  async function focusNode() {
    const q = search.value.trim().toLowerCase()
    if (!q) return
    const ns = layoutNodes.value
    let target = ns.find((n) => n.name.toLowerCase() === q)
    if (!target) target = ns.filter((n) => n.name.toLowerCase().includes(q)).sort((a, b) => (b.weight || 0) - (a.weight || 0))[0]
    if (!target) return
    scale.value = 1.6
    tx.value = GRAPH_SIZE / 2 - target.x * scale.value
    ty.value = GRAPH_SIZE / 2 - target.y * scale.value
    selected.value = target.id
    try {
      const name = nodes.value.find((n) => n.id === target!.id)?.name || target!.id
      selectedMemories.value = await io.fetchMemories(name)
    } catch (err) {
      console.error('[GraphPane] 加载节点关联记忆失败', err)
      selectedMemories.value = []
    }
  }

  function resetView() {
    scale.value = 1
    tx.value = 0
    ty.value = 0
  }

  return {
    nodes, edges, loading, selected, selectedMemories, layoutNodes, hoveredId,
    scale, tx, ty, draggingId, panning, svgRef, search, clearing,
    repulsion, springStrength, showLabels,
    neighbors, nodePosMap, isNodeDimmed, isEdgeHighlighted,
    load, loadConfig, selectNode, clearAll, focusNode, resetView,
    onWheel, onMouseDown, onMouseMove, onMouseUp, onNodeMouseDown,
  }
}

export type GraphState = ReturnType<typeof createGraphState>

export function useTagGraphTab({ activeTab, closeContextMenu, loadHistory, loadMemory, loadAllDateCounts, loadLibraries, loadProfile, onMemoryScroll, startDateCountRefresh, stopDateCountRefresh }: TagGraphTabDeps) {
  const tag = createGraphState('tag', {
    fetchGraph: () => memoryApi.tagGraph(),
    fetchMemories: (name) => memoryApi.byTag('default-user', name),
    clearApi: () => memoryApi.clearTagGraph(),
  })
  const keyword = createGraphState('keyword', {
    fetchGraph: () => memoryApi.keywordGraph(),
    fetchMemories: async (kw) => (await memoryApi.search('default-user', { keyword: kw, limit: 20 })).memories,
    clearApi: () => memoryApi.clearKeywordGraph(),
  })

  const loadedTabs = ref<Set<string>>(new Set())

  function loadTabData(tab: InfoTabKey) {
    if (loadedTabs.value.has(tab)) return
    loadedTabs.value = new Set([...loadedTabs.value, tab])
    switch (tab) {
      case 'history':
        loadHistory()
        break
      case 'memory':
        loadMemory()
        Promise.resolve(loadAllDateCounts()).then(() => startDateCountRefresh())
        break
      case 'library':
        loadLibraries()
        break
      case 'tagGraph':
        tag.loadConfig().then(() => tag.load())
        break
      case 'keywordGraph':
        keyword.loadConfig().then(() => keyword.load())
        break
      case 'profile':
        loadProfile()
        break
    }
  }

  onMounted(() => {
    loadTabData(activeTab.value)
    window.addEventListener('scroll', onMemoryScroll, { passive: true })
    document.addEventListener('click', closeContextMenu)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onMemoryScroll)
    document.removeEventListener('click', closeContextMenu)
    stopDateCountRefresh()
  })

  watch(activeTab, (val) => {
    localStorage.setItem('brian-info-active-tab', val)
    loadTabData(val)
  })

  return { tag, keyword }
}
