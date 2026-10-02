<script setup lang="ts">
import { useSessionStore } from '@/stores/session'
import { useChatUiStore } from '@/stores/chatUi'
import { edgeKey } from '@/utils/chatMapGeometry'
import MessageCard from './MessageCard.vue'
import { useChatMap } from '@/composables/useChatMap'

const sessionStore = useSessionStore()
const chatUi = useChatUiStore()

const {
  containerRef, scale, offset, isPanning,
  activeNodeId, hoveredNodeId,
  draggingNodeId, snapGuides,
  nodes, edges, nodeMap, worldWidth, worldHeight,
  nodeStyle, edgePath, arrowPoint,
  getEdgeStroke, getEdgeStrokeWidth, getEdgeDashArray, getArrowFill,
  onWheel, onMouseDown, onMouseMove, onMouseUp, onContainerClick,
  onNodeClick, onEdgeClick, togglePin, jumpTo, showThinking,
} = useChatMap()
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full h-full overflow-hidden select-none"
    :class="{ 'cursor-grabbing': isPanning || draggingNodeId, 'cursor-grab': !isPanning && !draggingNodeId }"
    @wheel="onWheel"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
    @click="onContainerClick"
  >
    <div
      v-if="nodes.length === 0"
      class="absolute inset-0 flex flex-col items-center justify-center text-chat-ink-tertiary text-sm"
    >
      <p>暂无 ChatMap 数据</p>
      <p class="text-xs mt-1 text-chat-ink-subtle">发送消息后将生成对话图谱</p>
    </div>

    <div
      v-else
      class="absolute top-0 left-0"
      :style="{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0', width: `${worldWidth}px`, height: `${worldHeight}px` }"
    >
      <svg :width="worldWidth" :height="worldHeight" class="absolute top-0 left-0 pointer-events-none">
        <g v-if="snapGuides.length > 0">
          <line
            v-for="(guide, i) in snapGuides"
            :key="`guide-${i}`"
            :x1="guide.type === 'vertical' ? guide.position : guide.start"
            :y1="guide.type === 'vertical' ? guide.start : guide.position"
            :x2="guide.type === 'vertical' ? guide.position : guide.end"
            :y2="guide.type === 'vertical' ? guide.end : guide.position"
            stroke="var(--brian-accent)"
            stroke-width="1"
            stroke-dasharray="4 4"
            opacity="0.6"
          />
        </g>

        <g
          v-for="e in edges"
          :key="edgeKey(e)"
          class="chat-map-edge pointer-events-auto cursor-pointer"
          @click.stop="onEdgeClick(e)"
        >
          <path
            :d="edgePath(e)"
            fill="none"
            stroke="transparent"
            stroke-width="14"
          />
          <path
            :d="edgePath(e)"
            fill="none"
            :stroke="getEdgeStroke(e)"
            :stroke-width="getEdgeStrokeWidth(e)"
            :stroke-dasharray="getEdgeDashArray(e)"
            class="transition-colors duration-200"
          />
          <polygon
            :points="arrowPoint(e)"
            :fill="getArrowFill(e)"
            class="transition-colors duration-200"
          />
        </g>
      </svg>

      <div
        v-for="n in nodes"
        :key="n.id"
        class="chat-map-node absolute"
        :data-node-id="n.id"
        :style="nodeStyle(n)"
        @mouseenter="hoveredNodeId = n.id"
        @mouseleave="hoveredNodeId = null"
      >
        <MessageCard
          :id="n.id"
          :info-id="n.infoId"
          :role="n.role || n.infoType"
          :content="n.info"
          :summary="n.summary"
          :timestamp="n.created"
          :pin="n.pin"
          :selected="sessionStore.selectedMsgIds.has(n.infoId)"
          :cited-count="n.citedCount"
          :citing-count="n.citingCount"
          :cited-info-ids="n.citedInfoIds"
          :citing-info-ids="n.citingInfoIds"
          :trace-id="n.traceId"
          :work-id="n.workId"
          mode="map"
          :active="activeNodeId === n.id"
          :node-map="nodeMap"
          @toggle-select="sessionStore.toggleMsgSelection"
          @toggle-pin="togglePin(n)"
          @click-card="onNodeClick(n)"
          @jump-to="jumpTo"
          @show-thinking="showThinking"
          @show-eval="chatUi.openEvalResult"
        />
      </div>
    </div>

    <div class="absolute bottom-2 right-2 flex items-center gap-1 z-10">
      <button class="px-2 py-1 text-xs rounded-chat-sm bg-chat-surface-1/90 border border-chat-hairline text-chat-ink-subtle hover:text-chat-ink hover:border-chat-hairline-strong transition-colors" @click="scale = Math.min(2.5, scale + 0.2)">+</button>
      <button class="px-2 py-1 text-xs rounded-chat-sm bg-chat-surface-1/90 border border-chat-hairline text-chat-ink-subtle hover:text-chat-ink hover:border-chat-hairline-strong transition-colors" @click="scale = Math.max(0.2, scale - 0.2)">-</button>
      <button class="px-2 py-1 text-xs rounded-chat-sm bg-chat-surface-1/90 border border-chat-hairline text-chat-ink-subtle hover:text-chat-ink hover:border-chat-hairline-strong transition-colors" @click="scale = 1; offset = { x: 40, y: 40 }">重置</button>
    </div>
  </div>
</template>
