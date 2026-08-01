<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSessionStore } from '@/stores/session'

const sessionStore = useSessionStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const scale = ref(1)
const offset = ref({ x: 0, y: 0 })
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const selectedNodeId = ref<string | null>(null)

const nodes = computed(() => sessionStore.dagNodes)
const edges = computed(() => sessionStore.dagEdges)

const WIDTH = 800
const HEIGHT = 600

function drawMap() {
  const cvs = canvasRef.value
  if (!cvs) return
  const ctx = cvs.getContext('2d')
  if (!ctx) return

  cvs.width = cvs.offsetWidth * window.devicePixelRatio
  cvs.height = cvs.offsetHeight * window.devicePixelRatio
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

  const w = cvs.offsetWidth
  const h = cvs.offsetHeight

  ctx.clearRect(0, 0, w, h)

  ctx.save()
  ctx.translate(offset.value.x + w / 2, offset.value.y + h / 2)
  ctx.scale(scale.value, scale.value)

  const isDark = document.documentElement.classList.contains('dark')

  // Draw edges
  for (const edge of edges.value) {
    const src = nodes.value.find(n => n.id === edge.source)
    const tgt = nodes.value.find(n => n.id === edge.target)
    if (!src || !tgt) continue

    ctx.beginPath()
    ctx.moveTo(src.x, src.y)
    const cp1x = src.x + (tgt.x - src.x) * 0.5
    const cp1y = src.y
    const cp2x = tgt.x - (tgt.x - src.x) * 0.5
    const cp2y = tgt.y
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tgt.x, tgt.y)
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Arrow
    const arrowSize = 6
    const dx = tgt.x - cp2x
    const dy = tgt.y - cp2y
    const angle = Math.atan2(dy, dx)
    ctx.beginPath()
    ctx.moveTo(tgt.x, tgt.y)
    ctx.lineTo(tgt.x - arrowSize * Math.cos(angle - Math.PI / 6), tgt.y - arrowSize * Math.sin(angle - Math.PI / 6))
    ctx.moveTo(tgt.x, tgt.y)
    ctx.lineTo(tgt.x - arrowSize * Math.cos(angle + Math.PI / 6), tgt.y - arrowSize * Math.sin(angle + Math.PI / 6))
    ctx.stroke()
  }

  // Draw nodes
  for (const node of nodes.value) {
    const isSelected = selectedNodeId.value === node.id
    const statusColor = node.status === 'running' ? '#FF9500' : node.status === 'done' ? '#34C759' : node.status === 'error' ? '#FF3B30' : '#8E8E93'

    // Card
    const w2 = 80, h2 = 50
    ctx.fillStyle = isSelected ? (isDark ? '#2C2C2E' : '#FFFFFF') : (isDark ? 'rgba(44,44,46,0.8)' : 'rgba(255,255,255,0.9)')
    ctx.strokeStyle = isSelected ? '#007AFF' : (isDark ? '#48484A' : '#D1D1D6')
    ctx.lineWidth = isSelected ? 2 : 1
    ctx.beginPath()
    roundRect(ctx, node.x - w2, node.y - h2, w2 * 2, h2 * 2, 8)
    ctx.fill()
    ctx.stroke()

    // Top status bar
    ctx.fillStyle = statusColor
    ctx.beginPath()
    ctx.arc(node.x, node.y - h2 + 10, 4, 0, Math.PI * 2)
    ctx.fill()

    // Label
    ctx.fillStyle = isDark ? '#F5F5F7' : '#1D1D1F'
    ctx.font = '10px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(truncate(node.label, 12), node.x, node.y + 4)
  }

  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
}

function truncate(s: string, len: number) {
  return s.length > len ? s.slice(0, len) + '...' : s
}

function getMousePos(e: MouseEvent) {
  const cvs = canvasRef.value!
  const rect = cvs.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale.value = Math.max(0.2, Math.min(3, scale.value * delta))
  drawMap()
}

function handleMouseDown(e: MouseEvent) {
  const pos = getMousePos(e)
  const isDark = document.documentElement.classList.contains('dark')
  const ctx = canvasRef.value?.getContext('2d')
  if (!ctx) return

  // Check if clicking a node
  const w = canvasRef.value!.offsetWidth
  const h = canvasRef.value!.offsetHeight
  const mx = (pos.x - offset.value.x - w / 2) / scale.value
  const my = (pos.y - offset.value.y - h / 2) / scale.value

  let hitNode = false
  for (const node of nodes.value) {
    if (Math.abs(mx - node.x) < 80 && Math.abs(my - node.y) < 50) {
      selectedNodeId.value = selectedNodeId.value === node.id ? null : node.id
      hitNode = true
      break
    }
  }

  if (!hitNode) {
    selectedNodeId.value = null
    isPanning.value = true
    panStart.value = { x: e.clientX - offset.value.x, y: e.clientY - offset.value.y }
  }
  drawMap()
}

function handleMouseMove(e: MouseEvent) {
  if (isPanning.value) {
    offset.value = { x: e.clientX - panStart.value.x, y: e.clientY - panStart.value.y }
    drawMap()
  }
}

function handleMouseUp() {
  isPanning.value = false
}

watch([nodes, edges], () => drawMap(), { deep: true })
</script>

<template>
  <div class="relative w-full h-full">
    <div v-if="nodes.length === 0" class="flex flex-col items-center justify-center h-full text-apple-gray-400 text-sm">
      <p>暂无 ChatMap 数据</p>
      <p class="text-xs mt-1">发送消息后将生成对话图谱</p>
    </div>
    <canvas
      ref="canvasRef"
      class="w-full h-full cursor-grab"
      :class="{ 'cursor-grabbing': isPanning }"
      @wheel="handleWheel"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
    />
    <div class="absolute bottom-2 right-2 flex items-center gap-1">
      <button class="px-2 py-1 text-xs rounded bg-white/80 dark:bg-apple-gray-800/80 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue" @click="scale = Math.min(3, scale + 0.2); drawMap()">+</button>
      <button class="px-2 py-1 text-xs rounded bg-white/80 dark:bg-apple-gray-800/80 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue" @click="scale = Math.max(0.2, scale - 0.2); drawMap()">-</button>
      <button class="px-2 py-1 text-xs rounded bg-white/80 dark:bg-apple-gray-800/80 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue" @click="scale = 1; offset = { x: 0, y: 0 }; drawMap()">重置</button>
    </div>
  </div>
</template>
