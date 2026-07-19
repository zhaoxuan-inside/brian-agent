<script setup lang="ts">
import { computed } from 'vue'
import { User, Sparkles } from '@lucide/vue'
import type { ExchangeGroup } from '../stores/session'

const props = defineProps<{
  exchanges: ExchangeGroup[]
  selectedExchangeId: string | null
}>()

const emit = defineEmits<{
  select: [exchangeId: string]
  scrollTo: [exchangeId: string]
  openAgentChain: [exchangeId: string]
}>()

const NODE_HEIGHT = 64
const NODE_GAP = 20
const NODE_WIDTH = 240
const ARROW_COLOR = '#C7C7CC'

interface NodePosition {
  exchangeId: string
  x: number
  y: number
  isBranch: boolean
  parentExchangeId?: string
}

const nodePositions = computed<NodePosition[]>(() => {
  const positions: NodePosition[] = []
  const mainFlow: string[] = []
  const branches: { exchangeId: string; parentId: string }[] = []

  // First pass: identify main flow and branches
  for (const ex of props.exchanges) {
    if (ex.referencedExchangeIds.length > 0) {
      branches.push({ exchangeId: ex.exchangeId, parentId: ex.referencedExchangeIds[0] })
    } else {
      mainFlow.push(ex.exchangeId)
    }
  }

  // Second pass: layout main flow
  let mainY = 20
  for (const id of mainFlow) {
    positions.push({
      exchangeId: id,
      x: 20,
      y: mainY,
      isBranch: false,
    })
    mainY += NODE_HEIGHT + NODE_GAP
  }

  // Third pass: layout branches
  for (const branch of branches) {
    const parentPos = positions.find(p => p.exchangeId === branch.parentId)
    const y = parentPos ? parentPos.y + NODE_HEIGHT + NODE_GAP : mainY
    positions.push({
      exchangeId: branch.exchangeId,
      x: NODE_WIDTH + 40,
      y,
      isBranch: true,
      parentExchangeId: branch.parentId,
    })
    if (!parentPos) mainY = y + NODE_HEIGHT + NODE_GAP
  }

  return positions
})

const totalHeight = computed(() => {
  if (nodePositions.value.length === 0) return 0
  const maxY = Math.max(...nodePositions.value.map(p => p.y))
  return maxY + NODE_HEIGHT + 40
})

// Build exchange lookup
const exchangeMap = computed(() => {
  const map = new Map<string, ExchangeGroup>()
  for (const ex of props.exchanges) {
    map.set(ex.exchangeId, ex)
  }
  return map
})

// Edges for SVG arrows
const edges = computed(() => {
  const result: { from: NodePosition; to: NodePosition; type: 'main' | 'branch' }[] = []

  // Main flow edges: sequential
  const mainNodes = nodePositions.value.filter(p => !p.isBranch)
  for (let i = 0; i < mainNodes.length - 1; i++) {
    result.push({ from: mainNodes[i], to: mainNodes[i + 1], type: 'main' })
  }

  // Branch edges
  const branchNodes = nodePositions.value.filter(p => p.isBranch)
  for (const bn of branchNodes) {
    const parent = nodePositions.value.find(p => p.exchangeId === bn.parentExchangeId)
    if (parent) {
      result.push({ from: parent, to: bn, type: 'branch' })
    }
  }

  return result
})

function truncate(text: string, maxLen: number = 50): string {
  if (!text) return ''
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

function svgArrowPath(from: NodePosition, to: NodePosition, type: 'main' | 'branch'): string {
  const fromX = from.x + NODE_WIDTH / 2
  const fromY = from.y + NODE_HEIGHT
  const toX = to.x + NODE_WIDTH / 2
  const toY = to.y

  if (type === 'main') {
    return `M ${fromX} ${fromY} L ${fromX} ${toY - 8}`
  } else {
    const midY = (fromY + toY) / 2
    return `M ${fromX} ${fromY + 8} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`
  }
}
</script>

<template>
  <div class="dag-container">
    <div class="dag-canvas" :style="{ height: totalHeight + 'px' }">
      <!-- SVG arrows layer -->
      <svg class="dag-svg" :width="NODE_WIDTH * 2 + 80" :height="totalHeight">
        <defs>
          <marker
            id="arrowhead-main"
            markerWidth="8"
            markerHeight="8"
            refX="4"
            refY="8"
            orient="auto"
          >
            <polygon :points="'0,0 8,0 4,8'" :fill="ARROW_COLOR" />
          </marker>
          <marker
            id="arrowhead-branch"
            markerWidth="8"
            markerHeight="8"
            refX="8"
            refY="4"
            orient="auto"
          >
            <polygon :points="'0,0 0,8 8,4'" :fill="ARROW_COLOR" />
          </marker>
        </defs>

        <g v-for="edge in edges" :key="edge.from.exchangeId + '-' + edge.to.exchangeId">
          <path
            :d="svgArrowPath(edge.from, edge.to, edge.type)"
            :stroke="edge.type === 'main' ? ARROW_COLOR : ARROW_COLOR"
            stroke-width="1.5"
            fill="none"
            :marker-end="edge.type === 'main' ? 'url(#arrowhead-main)' : 'url(#arrowhead-branch)'"
          />
        </g>
      </svg>

      <!-- Nodes layer -->
      <div
        v-for="pos in nodePositions"
        :key="pos.exchangeId"
        class="dag-node"
        :class="{
          selected: selectedExchangeId === pos.exchangeId,
          'is-branch': pos.isBranch,
        }"
        :style="{
          left: pos.x + 'px',
          top: pos.y + 'px',
          width: NODE_WIDTH + 'px',
        }"
        @click="emit('select', pos.exchangeId); emit('openAgentChain', pos.exchangeId)"
      >
        <div class="node-content">
          <div class="node-row">
            <User :size="11" class="node-icon user" />
            <span class="node-text">{{ truncate(exchangeMap.get(pos.exchangeId)?.userMessage?.summary || '') }}</span>
          </div>
          <div class="node-row">
            <Sparkles :size="11" class="node-icon assistant" />
            <span class="node-text">{{ truncate(exchangeMap.get(pos.exchangeId)?.assistantMessage?.summary || '') }}</span>
          </div>
        </div>
        <div class="node-meta">
          <span class="node-time">{{ exchangeMap.get(pos.exchangeId)?.userMessage?.createdAt ? new Date(exchangeMap.get(pos.exchangeId)!.userMessage!.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dag-container {
  height: 100%;
  overflow: auto;
  padding: 0;
}

.dag-canvas {
  position: relative;
  min-height: 100%;
}

.dag-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.dag-node {
  position: absolute;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  padding: 10px 12px;
  border: 1px solid transparent;
}

.dag-node:hover {
  background: #F5F5F7;
  border-color: #E5E5EA;
}

:root.dark .dag-node:hover {
  background: #2C2C2E;
  border-color: #3A3A3C;
}

.dag-node.selected {
  background: #FFFFFF;
  border-color: #007AFF;
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.12);
}

:root.dark .dag-node.selected {
  background: #2C2C2E;
  border-color: #007AFF;
}

.dag-node.is-branch {
  border-left: 2px solid #007AFF20;
}

.node-content {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.node-icon {
  flex-shrink: 0;
}

.node-icon.user {
  color: #34C759;
}

.node-icon.assistant {
  color: #007AFF;
}

.node-text {
  font-size: 11px;
  color: #86868B;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.node-time {
  font-size: 9px;
  color: #AEAEB2;
}
</style>