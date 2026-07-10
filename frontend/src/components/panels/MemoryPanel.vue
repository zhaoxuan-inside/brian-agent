<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Brain, Sparkles, Folder, ChevronDown, ChevronUp, User, Bot, Hash } from '@lucide/vue'

const API_BASE = 'http://127.0.0.1:8000/api/memory'

const activeTab = ref<'recent' | 'tags' | 'groups'>('recent')

interface MemoryItem {
  id: string
  content: string
  summary: string
  type: string
  tags: string[]
  role: 'user' | 'assistant' | 'system'
  strength: number
  createdAt: number
}

interface GroupItem {
  name: string
  count: number
  degree: number
}

interface TagGraphNode {
  id: string
  name: string
  weight: number
  degree: number
}

interface TagGraphEdge {
  source: string
  target: string
  weight: number
  label: string
}

interface TagGraphData {
  nodes: TagGraphNode[]
  edges: TagGraphEdge[]
}

const recentMemories = ref<MemoryItem[]>([])
const tags = ref<string[]>([])
const groups = ref<GroupItem[]>([])
const tagGraph = ref<TagGraphData>({ nodes: [], edges: [] })
const loading = ref(false)
const expandedMemoryId = ref<string | null>(null)
const selectedTag = ref<string | null>(null)
const tagMemories = ref<MemoryItem[]>([])

// Tag graph state
const graphSvg = ref<SVGSVGElement | null>(null)
const hoveredEdge = ref<{ source: string; target: string; weight: number } | null>(null)
const graphNodes = ref<{ id: string; name: string; x: number; y: number; vx: number; vy: number; degree: number; weight: number }[]>([])
const graphEdges = ref<TagGraphEdge[]>([])
const graphAnimFrame = ref<number>(0)
const graphTransform = ref({ x: 400, y: 300, scale: 1 })
const isDragging = ref(false)
const dragNode = ref<string | null>(null)
const dragStart = ref({ x: 0, y: 0 })

async function fetchMemories() {
  loading.value = true
  try {
    const resp = await fetch(API_BASE)
    const json = await resp.json()
    if (json.ok) {
      recentMemories.value = (json.data || []).sort((a: MemoryItem, b: MemoryItem) => b.createdAt - a.createdAt)
    }
  } catch (e) {
    console.error('Failed to fetch memories:', e)
  }

  try {
    const resp = await fetch(`${API_BASE}/tags`)
    const json = await resp.json()
    if (json.ok) {
      tags.value = json.data || []
    }
  } catch (e) {
    console.error('Failed to fetch tags:', e)
  }

  try {
    const resp = await fetch(`${API_BASE}/groups`)
    const json = await resp.json()
    if (json.ok) {
      groups.value = json.data || []
    }
  } catch (e) {
    console.error('Failed to fetch groups:', e)
  }

  try {
    const resp = await fetch(`${API_BASE}/tag-graph`)
    const json = await resp.json()
    if (json.ok) {
      tagGraph.value = json.data || { nodes: [], edges: [] }
      initGraphSimulation()
    }
  } catch (e) {
    console.error('Failed to fetch tag graph:', e)
  }
  loading.value = false
}

async function fetchTagMemories(tag: string) {
  selectedTag.value = tag
  try {
    const resp = await fetch(`${API_BASE}/by-tag/${encodeURIComponent(tag)}`)
    const json = await resp.json()
    if (json.ok) {
      tagMemories.value = (json.data || []).sort((a: MemoryItem, b: MemoryItem) => b.createdAt - a.createdAt)
    }
  } catch (e) {
    console.error('Failed to fetch tag memories:', e)
  }
}

onMounted(() => {
  fetchMemories()
})

function toggleExpand(id: string) {
  expandedMemoryId.value = expandedMemoryId.value === id ? null : id
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return `${Math.floor(diff / 86400000)}天前`
}

// Tag graph simulation
function initGraphSimulation() {
  cancelAnimationFrame(graphAnimFrame.value)
  const nodes = tagGraph.value.nodes
  const edges = tagGraph.value.edges

  if (nodes.length === 0) return

  // Initialize node positions in a circle
  const centerX = 400, centerY = 300
  const radius = Math.min(350, nodes.length * 30)
  const simNodes = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length
    return {
      id: n.id,
      name: n.name,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
      degree: n.degree,
      weight: n.weight,
    }
  })

  graphNodes.value = simNodes
  graphEdges.value = edges

  // Simple force simulation
  let iteration = 0
  const maxIterations = 200
  function simulate() {
    if (iteration >= maxIterations) return
    iteration++

    const nodes = graphNodes.value
    const edges = graphEdges.value

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x
        const dy = nodes[j].y - nodes[i].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = 800 / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        nodes[i].vx -= fx
        nodes[i].vy -= fy
        nodes[j].vx += fx
        nodes[j].vy += fy
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const src = nodes.find(n => n.id === edge.source)
      const tgt = nodes.find(n => n.id === edge.target)
      if (!src || !tgt) continue
      const dx = tgt.x - src.x
      const dy = tgt.y - src.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = (dist - 80) * 0.01 * edge.weight
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      src.vx += fx
      src.vy += fy
      tgt.vx -= fx
      tgt.vy -= fy
    }

    // Center gravity
    for (const node of nodes) {
      node.vx += (centerX - node.x) * 0.01
      node.vy += (centerY - node.y) * 0.01
    }

    // Apply velocity with damping
    for (const node of nodes) {
      node.x += node.vx * 0.5
      node.y += node.vy * 0.5
      node.vx *= 0.85
      node.vy *= 0.85
    }

    graphAnimFrame.value = requestAnimationFrame(simulate)
  }

  graphAnimFrame.value = requestAnimationFrame(simulate)
}

function getNodeRadius(degree: number): number {
  return Math.max(12, Math.min(30, 12 + degree * 3))
}

function getNodeColor(degree: number): string {
  if (degree >= 5) return '#3B82F6'
  if (degree >= 3) return '#6366F1'
  if (degree >= 2) return '#8B5CF6'
  return '#A78BFA'
}

function onGraphMouseDown(e: MouseEvent) {
  const target = e.target as SVGElement
  const nodeEl = target.closest('[data-node-id]')
  if (nodeEl) {
    dragNode.value = nodeEl.getAttribute('data-node-id')
    isDragging.value = true
    dragStart.value = { x: e.clientX, y: e.clientY }
  }
}

function onGraphMouseMove(e: MouseEvent) {
  if (isDragging.value && dragNode.value) {
    const scale = graphTransform.value.scale
    const dx = (e.clientX - dragStart.value.x) / scale
    const dy = (e.clientY - dragStart.value.y) / scale
    const node = graphNodes.value.find(n => n.id === dragNode.value)
    if (node) {
      node.x += dx
      node.y += dy
    }
    dragStart.value = { x: e.clientX, y: e.clientY }
    return
  }

  // Check edge hover
  const svg = graphSvg.value
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  const scale = graphTransform.value.scale
  const mx = (e.clientX - rect.left - graphTransform.value.x) / scale + graphTransform.value.x
  const my = (e.clientY - rect.top - graphTransform.value.y) / scale + graphTransform.value.y

  hoveredEdge.value = null
  for (const edge of graphEdges.value) {
    const src = graphNodes.value.find(n => n.id === edge.source)
    const tgt = graphNodes.value.find(n => n.id === edge.target)
    if (!src || !tgt) continue

    const dist = pointToSegmentDist(mx, my, src.x, src.y, tgt.x, tgt.y)
    if (dist < 8) {
      hoveredEdge.value = { source: src.name, target: tgt.name, weight: edge.weight }
      break
    }
  }
}

function onGraphMouseUp() {
  isDragging.value = false
  dragNode.value = null
}

function onGraphWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  graphTransform.value.scale = Math.max(0.3, Math.min(3, graphTransform.value.scale * delta))
}

function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const nearestX = x1 + t * dx
  const nearestY = y1 + t * dy
  return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2)
}

onUnmounted(() => {
  cancelAnimationFrame(graphAnimFrame.value)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between p-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-950">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-brian-blue/10 rounded-lg">
          <Brain :size="20" class="text-brian-blue" />
        </div>
        <div>
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">记忆</h2>
          <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">智能记忆系统</p>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex items-center gap-2 p-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
      <button
        :class="[
          'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
          activeTab === 'recent' ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
        ]"
        @click="activeTab = 'recent'; selectedTag = null"
      >
        最近
      </button>
      <button
        :class="[
          'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
          activeTab === 'tags' ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
        ]"
        @click="activeTab = 'tags'"
      >
        标签
      </button>
      <button
        :class="[
          'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
          activeTab === 'groups' ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
        ]"
        @click="activeTab = 'groups'"
      >
        标签组
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4">

      <!-- Recent Tab -->
      <div v-if="activeTab === 'recent'" class="space-y-2">
        <div v-if="recentMemories.length === 0" class="text-center py-12">
          <Sparkles :size="48" class="mx-auto text-apple-gray-300 dark:text-apple-gray-600 mb-3" />
          <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400">暂无记忆数据，开始对话后将自动记录</p>
        </div>

        <div
          v-for="memory in recentMemories"
          :key="memory.id"
          class="glass-panel rounded-xl overflow-hidden hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors cursor-pointer"
          @click="toggleExpand(memory.id)"
        >
          <!-- Summary row -->
          <div class="p-3">
            <div class="flex items-start gap-2">
              <div class="mt-0.5 flex-shrink-0">
                <User v-if="memory.role === 'user'" :size="14" class="text-brian-blue" />
                <Bot v-else-if="memory.role === 'assistant'" :size="14" class="text-emerald-500" />
                <Hash v-else :size="14" class="text-apple-gray-400" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 line-clamp-2">
                  {{ memory.summary }}
                </p>
                <div class="flex items-center gap-2 mt-1.5">
                  <span
                    v-for="tag in memory.tags"
                    :key="tag"
                    class="text-xs px-1.5 py-0.5 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-full text-apple-gray-500 dark:text-apple-gray-400"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>
              <span class="text-xs text-apple-gray-400 flex-shrink-0 mt-0.5">{{ formatTime(memory.createdAt) }}</span>
              <div class="flex-shrink-0 text-apple-gray-400 mt-0.5">
                <ChevronDown v-if="expandedMemoryId !== memory.id" :size="16" />
                <ChevronUp v-else :size="16" />
              </div>
            </div>
          </div>

          <!-- Expanded content -->
          <div
            v-if="expandedMemoryId === memory.id"
            class="px-3 pb-3 border-t border-apple-gray-200 dark:border-apple-gray-700 pt-3"
          >
            <p class="text-sm text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap leading-relaxed">
              {{ memory.content }}
            </p>
          </div>
        </div>
      </div>

      <!-- Tags Tab - Graph Visualization -->
      <div v-if="activeTab === 'tags'" class="h-full">
        <div v-if="tagGraph.nodes.length === 0" class="text-center py-12">
          <Sparkles :size="48" class="mx-auto text-apple-gray-300 dark:text-apple-gray-600 mb-3" />
          <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400">暂无标签数据</p>
        </div>

        <div v-else class="h-full flex flex-col">
          <!-- Graph info -->
          <div class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-2 flex items-center gap-3">
            <span>{{ tagGraph.nodes.length }} 个标签</span>
            <span>{{ tagGraph.edges.length }} 条关联</span>
            <span class="ml-auto">滚轮缩放 | 拖拽节点</span>
          </div>

          <!-- SVG Graph container -->
          <div class="flex-1 min-h-[400px] relative bg-apple-gray-50 dark:bg-apple-gray-900/50 rounded-xl overflow-hidden border border-apple-gray-200 dark:border-apple-gray-700">

            <!-- Edge hover tooltip — absolute overlay -->
            <div
              v-if="hoveredEdge"
              class="absolute top-3 left-3 z-10 text-xs px-3 py-1.5 bg-apple-gray-900/90 dark:bg-apple-gray-100/90 text-white dark:text-apple-gray-900 rounded-lg inline-flex items-center gap-2 pointer-events-none backdrop-blur-sm"
            >
              <span>{{ hoveredEdge.source }}</span>
              <span class="opacity-50">—</span>
              <span>{{ hoveredEdge.target }}</span>
              <span class="text-brian-blue font-medium">权重: {{ hoveredEdge.weight }}</span>
            </div>

            <svg
              ref="graphSvg"
              viewBox="0 0 800 600"
              preserveAspectRatio="xMidYMid meet"
              @mousedown="onGraphMouseDown"
              @mousemove="onGraphMouseMove"
              @mouseup="onGraphMouseUp"
              @mouseleave="onGraphMouseUp; hoveredEdge = null"
              @wheel.prevent="onGraphWheel"
            >
              <g :transform="`translate(${graphTransform.x}, ${graphTransform.y}) scale(${graphTransform.scale}) translate(${-400}, ${-300})`">
                <!-- Edges -->
                <line
                  v-for="edge in graphEdges"
                  :key="`${edge.source}-${edge.target}`"
                  :x1="(graphNodes.find(n => n.id === edge.source)?.x || 0)"
                  :y1="(graphNodes.find(n => n.id === edge.source)?.y || 0)"
                  :x2="(graphNodes.find(n => n.id === edge.target)?.x || 0)"
                  :y2="(graphNodes.find(n => n.id === edge.target)?.y || 0)"
                  :stroke="hoveredEdge && hoveredEdge.source === (graphNodes.find(n => n.id === edge.source)?.name || '') && hoveredEdge.target === (graphNodes.find(n => n.id === edge.target)?.name || '') ? '#3B82F6' : '#D1D5DB'"
                  :stroke-opacity="hoveredEdge ? 0.6 : 0.3"
                  :stroke-width="Math.max(1, edge.weight * 2)"
                  class="dark:stroke-apple-gray-600 transition-colors"
                />

                <!-- Nodes -->
                <g
                  v-for="node in graphNodes"
                  :key="node.id"
                  :data-node-id="node.id"
                  class="cursor-pointer"
                  @click.stop="fetchTagMemories(node.name); activeTab = 'groups'"
                >
                  <circle
                    :cx="node.x"
                    :cy="node.y"
                    :r="getNodeRadius(node.degree)"
                    :fill="getNodeColor(node.degree)"
                    fill-opacity="0.85"
                    stroke="#fff"
                    :stroke-width="2"
                    class="transition-all hover:fill-opacity-100"
                  />
                  <text
                    :x="node.x"
                    :y="node.y"
                    text-anchor="middle"
                    dominant-baseline="central"
                    :font-size="Math.max(9, Math.min(12, 9 + node.degree))"
                    fill="#fff"
                    font-weight="600"
                    class="pointer-events-none select-none"
                  >
                    {{ node.name.length > 6 ? node.name.slice(0, 6) + '…' : node.name }}
                  </text>
                </g>
              </g>
            </svg>
          </div>

          <!-- Tag list below graph -->
          <div class="mt-3 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            <button
              v-for="node in graphNodes"
              :key="node.id"
              class="text-xs px-2 py-1 rounded-full transition-colors cursor-pointer flex items-center gap-1"
              :style="{ backgroundColor: getNodeColor(node.degree) + '20', color: getNodeColor(node.degree), border: '1px solid ' + getNodeColor(node.degree) + '40' }"
              @click="fetchTagMemories(node.name); activeTab = 'groups'"
            >
              {{ node.name }}
              <span class="opacity-60">({{ node.degree }})</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 标签组 Tab (formerly 分组) -->
      <div v-if="activeTab === 'groups'" class="space-y-4">
        <div v-if="selectedTag" class="flex items-center gap-2 mb-2">
          <button
            class="text-xs text-brian-blue hover:underline flex items-center gap-1"
            @click="selectedTag = null; tagMemories = []"
          >
            ← 返回全部标签组
          </button>
          <span class="text-xs text-apple-gray-400">|</span>
          <span class="text-xs text-apple-gray-600 dark:text-apple-gray-400">{{ selectedTag }} ({{ tagMemories.length }})</span>
        </div>

        <!-- Selected tag memories view -->
        <div v-if="selectedTag">
          <div v-if="tagMemories.length === 0" class="text-center py-8">
            <p class="text-sm text-apple-gray-400">该标签下暂无记忆</p>
          </div>

          <div
            v-for="memory in tagMemories"
            :key="memory.id"
            class="glass-panel rounded-xl overflow-hidden hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors cursor-pointer mb-2"
            @click="toggleExpand(memory.id)"
          >
            <div class="p-3">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-start gap-2 min-w-0 flex-1">
                  <div class="mt-0.5 flex-shrink-0">
                    <User v-if="memory.role === 'user'" :size="14" class="text-brian-blue" />
                    <Bot v-else-if="memory.role === 'assistant'" :size="14" class="text-emerald-500" />
                    <Hash v-else :size="14" class="text-apple-gray-400" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 line-clamp-2">
                      {{ memory.summary }}
                    </p>
                    <div class="flex items-center gap-2 mt-1.5">
                      <span
                        v-for="tag in memory.tags"
                        :key="tag"
                        class="text-xs px-1.5 py-0.5 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-full text-apple-gray-500 dark:text-apple-gray-400"
                      >
                        {{ tag }}
                      </span>
                      <span class="text-xs text-apple-gray-400 ml-auto flex-shrink-0">{{ formatTime(memory.createdAt) }}</span>
                    </div>
                  </div>
                </div>
                <div class="flex-shrink-0 text-apple-gray-400 mt-1">
                  <ChevronDown v-if="expandedMemoryId !== memory.id" :size="16" />
                  <ChevronUp v-else :size="16" />
                </div>
              </div>
            </div>

            <div
              v-if="expandedMemoryId === memory.id"
              class="px-3 pb-3 border-t border-apple-gray-200 dark:border-apple-gray-700 pt-3"
            >
              <p class="text-sm text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap leading-relaxed">
                {{ memory.content }}
              </p>
            </div>
          </div>
        </div>

        <!-- Groups overview -->
        <div v-else>
          <div v-if="groups.length === 0" class="text-center py-12">
            <Sparkles :size="48" class="mx-auto text-apple-gray-300 dark:text-apple-gray-600 mb-3" />
            <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400">暂无标签组，开始对话后将自动生成</p>
          </div>

          <div
            v-for="group in groups"
            :key="group.name"
            class="glass-panel rounded-xl p-4 flex items-center gap-4 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors cursor-pointer"
            @click="fetchTagMemories(group.name)"
          >
            <div class="p-3 rounded-lg flex-shrink-0" :style="{ backgroundColor: getNodeColor(group.degree) + '20' }">
              <Folder :size="20" :style="{ color: getNodeColor(group.degree) }" />
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ group.name }}</span>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-xs text-apple-gray-400">{{ group.count }} 条记忆</span>
                <span class="text-xs px-1.5 py-0.5 rounded-full" :style="{ backgroundColor: getNodeColor(group.degree) + '20', color: getNodeColor(group.degree) }">
                  度数 {{ group.degree }}
                </span>
              </div>
            </div>
            <ChevronDown :size="16" class="text-apple-gray-400 -rotate-90 flex-shrink-0" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
