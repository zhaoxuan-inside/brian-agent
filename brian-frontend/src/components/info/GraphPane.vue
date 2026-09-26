<script setup lang="ts">
import { computed, inject, reactive } from 'vue'
import {
  Search, Trash2, Eye, EyeOff, X,
} from '@lucide/vue'
import { INFO_TABS_KEY } from '@/composables/useInfoTabs'

const props = defineProps<{
  kind: 'tag' | 'keyword'
}>()

const isTag = computed(() => props.kind === 'tag')

const searchPlaceholder = isTag.value ? '搜索标签并定位...' : '搜索关键词并定位...'
const emptyText = isTag.value ? '暂无标签数据' : '暂无关键词数据'
const relatedEmptyText = isTag.value ? '暂无关联内容' : '暂无关联信息'

const graph = inject(INFO_TABS_KEY)!.graph
const g = reactive(props.kind === 'tag' ? graph.tag : graph.keyword)

function setSvgRef(el: unknown) {
  g.svgRef = (el as SVGSVGElement | null) ?? null
}
</script>

<template>
  <div class="px-6 pb-8 flex flex-col" :style="{ height: 'calc(100vh - 200px)' }">
    <div class="flex items-center gap-2 mb-3 flex-wrap">
      <div class="relative">
        <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-apple-gray-400" />
        <input v-model="g.search" :placeholder="searchPlaceholder" class="pl-8 pr-3 py-1.5 w-44 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" @keyup.enter="g.focusNode" />
      </div>
      <button class="px-3 py-1.5 text-sm rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90" @click="g.focusNode">定位</button>
      <button class="px-3 py-1.5 text-sm rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600" @click="g.resetView">重置视图</button>
      <span class="text-xs text-apple-gray-400">共 {{ g.nodes.length }} 节点</span>
      <div class="h-4 w-px bg-apple-gray-200 dark:bg-apple-gray-700" />
      <button class="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600" @click="g.showLabels = !g.showLabels" :title="g.showLabels ? '隐藏名称' : '显示名称'">
        <component :is="g.showLabels ? Eye : EyeOff" :size="13" />
      </button>
      <label class="flex items-center gap-1 text-xs text-apple-gray-500" title="排斥力">
        <span class="shrink-0">斥力</span>
        <input type="range" min="10" max="10000" step="100" v-model.number="g.repulsion" class="w-16 h-1 accent-brian-blue" />
      </label>
      <label class="flex items-center gap-1 text-xs text-apple-gray-500" title="引力">
        <span class="shrink-0">引力</span>
        <input type="range" min="1" max="100" step="1" :value="Math.round(g.springStrength * 100)" @input="g.springStrength = Number(($event.target as HTMLInputElement).value) / 100" class="w-16 h-1 accent-brian-blue" />
      </label>
      <button class="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-error-red hover:bg-error-red/10 border border-error-red/30" :disabled="g.clearing" @click="g.clearAll">
        <Trash2 :size="14" /> {{ g.clearing ? '清理中...' : '一键清理' }}
      </button>
    </div>
    <div v-if="g.loading" class="text-center py-16 text-apple-gray-400 flex-1">加载中...</div>
    <div v-else-if="g.nodes.length === 0" class="text-center py-16 text-apple-gray-400 text-sm flex-1">{{ emptyText }}</div>
    <div v-else class="flex gap-4 flex-1 min-h-0">
      <div class="flex-1 overflow-hidden relative" :class="g.panning || g.draggingId ? 'cursor-grabbing' : 'cursor-grab'">
        <div class="absolute top-3 right-3 z-10 w-60 rounded-xl border border-apple-gray-200/70 dark:border-apple-gray-700 bg-white/90 dark:bg-apple-gray-900/90 backdrop-blur-sm shadow-sm p-3 text-xs text-apple-gray-600 dark:text-apple-gray-300 pointer-events-none">
          <ul class="space-y-2.5">
            <li class="flex items-center gap-2.5">
              <span class="flex items-end gap-1 shrink-0 w-9">
                <span class="inline-block rounded-full bg-apple-gray-400" style="width:7px;height:7px"></span>
                <span class="inline-block rounded-full bg-apple-gray-400" style="width:13px;height:13px"></span>
              </span>
              <span>节点大小：越大连接度越高</span>
            </li>
            <li class="flex items-center gap-2.5">
              <span class="shrink-0 w-9 h-2 rounded-full" style="background: linear-gradient(to right, hsl(210,75%,52%), hsl(0,75%,52%));"></span>
              <span>节点颜色：蓝=低频 → 红=高频</span>
            </li>
            <li class="flex items-center gap-2.5">
              <svg class="shrink-0" width="36" height="12" viewBox="0 0 36 12">
                <line x1="0" y1="6" x2="8" y2="6" stroke="#8e8e93" stroke-width="1.5" />
                <line x1="28" y1="6" x2="36" y2="6" stroke="#8e8e93" stroke-width="1.5" />
                <circle cx="0" cy="6" r="2" fill="#8e8e93" />
                <circle cx="8" cy="6" r="2" fill="#8e8e93" />
                <circle cx="28" cy="6" r="2" fill="#8e8e93" />
                <circle cx="36" cy="6" r="2" fill="#8e8e93" />
              </svg>
              <span>连线长度：越短关联越强</span>
            </li>
          </ul>
        </div>
        <svg
          :ref="setSvgRef"
          viewBox="0 0 700 700"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style="touch-action: none;"
          @wheel.prevent="g.onWheel"
          @mousedown="g.onMouseDown"
          @mousemove="g.onMouseMove"
          @mouseup="g.onMouseUp"
          @mouseleave="g.onMouseUp"
        >
          <g :transform="`translate(${g.tx},${g.ty}) scale(${g.scale})`">
            <line
              v-for="(edge, i) in g.edges" :key="'e-' + i"
              :x1="g.nodePosMap.get(edge.source)?.x ?? 0" :y1="g.nodePosMap.get(edge.source)?.y ?? 0"
              :x2="g.nodePosMap.get(edge.target)?.x ?? 0" :y2="g.nodePosMap.get(edge.target)?.y ?? 0"
              :stroke="g.isEdgeHighlighted(edge) ? '#0071e3' : '#d1d1d6'"
              :stroke-width="g.isEdgeHighlighted(edge) ? 2 : 1"
              :opacity="g.isEdgeHighlighted(edge) ? 0.9 : Math.min(0.15 + edge.weight * 0.1, 0.55)"
            />
            <g
              v-for="node in g.layoutNodes" :key="node.id"
              class="cursor-pointer"
              @click="g.selectNode(node.id)"
              @mouseenter="g.hoveredId = node.id"
              @mouseleave="g.hoveredId = null"
              @mousedown.stop="g.onNodeMouseDown($event, node.id)"
            >
              <circle
                :cx="node.x" :cy="node.y" :r="node.r"
                :fill="g.selected === node.id || g.hoveredId === node.id ? '#0071e3' : node.color"
                :opacity="g.isNodeDimmed(node.id) ? 0.12 : 0.9"
                class="transition-opacity"
              />
              <text :x="node.x" :y="node.y + node.r + 10" text-anchor="middle" class="text-[7px] font-medium pointer-events-none" fill="#6e6e73" v-if="g.showLabels">{{ node.name }}</text>
            </g>
            <g v-if="g.hoveredId" pointer-events="none">
              <template v-for="node in g.layoutNodes.filter(n => n.id === g.hoveredId)" :key="'tooltip-' + node.id">
                <rect :x="node.x - 70" :y="node.y - node.r - 46" width="140" height="38" rx="6" fill="rgba(0,0,0,0.78)" />
                <text :x="node.x" :y="node.y - node.r - 28" text-anchor="middle" class="text-2xs font-medium" fill="#ffffff">{{ node.name }}</text>
                <text :x="node.x" :y="node.y - node.r - 15" text-anchor="middle" class="text-4xs" fill="#d1d1d6">关联 {{ node.degree }} · 激活 {{ node.weight }}</text>
              </template>
            </g>
          </g>
        </svg>
      </div>
      <div v-if="g.selected" class="w-80 flex-shrink-0 block-card rounded-xl p-4 max-h-[600px] overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-semibold">{{ isTag ? 'Tag' : '关键词' }}: {{ g.nodes.find(n => n.id === g.selected)?.name }}</h4>
          <button class="p-1 text-apple-gray-400 hover:text-apple-gray-600" @click="g.selected = null; g.selectedMemories = []"><X :size="14" /></button>
        </div>
        <div v-if="g.selectedMemories.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">{{ relatedEmptyText }}</div>
        <div v-else class="space-y-2">
          <div v-for="mem in g.selectedMemories" :key="mem.id" class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
            <p class="text-xs line-clamp-3">{{ mem.content }}</p>
            <span class="text-xs text-apple-gray-400 mt-1 block">{{ new Date(mem.createdAt).toLocaleString('zh-CN') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
