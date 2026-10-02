<script setup lang="ts">
import { computed, markRaw, onUnmounted, ref } from 'vue'
import {
  Search, Crosshair, Eye, Trash2, Clock, Brain, BookOpen, Network,
  Tag, User, Copy,
} from '@lucide/vue'
import { useOnceVisible } from '@/composables/useOnceVisible'
import type { GraphShotEdge, GraphShotNode } from './graphData'

const props = defineProps<{
  nodes: GraphShotNode[]
  edges: GraphShotEdge[]
  breadcrumb: string
  activeTab: string
  searchPlaceholder: string
  label: string
}>()

const tabs = [
  { label: '历史', icon: markRaw(Clock) },
  { label: '记忆', icon: markRaw(Brain) },
  { label: '资料库', icon: markRaw(BookOpen) },
  { label: '涌现', icon: markRaw(Network) },
  { label: '关键词图', icon: markRaw(Tag) },
  { label: '画像', icon: markRaw(User) },
]


const edges = computed(() => props.edges)
const hovered = ref<number | null>(null)

const hotEdgeSet = computed(() => {
  if (hovered.value === null) return new Set<number>()
  return new Set(edges.value.map((e, i) => (e.a === hovered.value || e.b === hovered.value ? i : -1)).filter((i) => i >= 0))
})

const hotNodeSet = computed(() => {
  if (hovered.value === null) return new Set<number>()
  const set = new Set<number>([hovered.value])
  edges.value.forEach((e) => {
    if (e.a === hovered.value) set.add(e.b)
    if (e.b === hovered.value) set.add(e.a)
  })
  return set
})

const rootEl = ref<Element | null>(null)
const nodeEls: (SVGGElement | null)[] = []
const lineEls: (SVGLineElement | null)[] = []

function setNodeRef(el: unknown, i: number) { nodeEls[i] = el as SVGGElement | null }
function setLineRef(el: unknown, i: number) { lineEls[i] = el as SVGLineElement | null }

interface DriftParam { ax: number; ay: number; sp: number; ph: number }

const driftParams: DriftParam[] = props.nodes.map((_, i) => ({
  ax: 3 + seeded01(i * 3 + 1) * 4,
  ay: 3 + seeded01(i * 3 + 2) * 4,
  sp: 0.1 + seeded01(i * 3 + 3) * 0.12,
  ph: seeded01(i * 7 + 5) * Math.PI * 2,
}))

function seeded01(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

let rafId = 0
let running = false

function tick(now: number) {
  if (!running) return
  const t = now / 1000
  const dx: number[] = []
  const dy: number[] = []
  props.nodes.forEach((_, i) => {
    const p = driftParams[i]
    dx[i] = p.ax * Math.sin(t * p.sp + p.ph)
    dy[i] = p.ay * Math.cos(t * p.sp * 0.8 + p.ph * 1.7)
  })
  nodeEls.forEach((el, i) => {
    el?.setAttribute('transform', `translate(${dx[i].toFixed(2)} ${dy[i].toFixed(2)})`)
  })
  lineEls.forEach((el, i) => {
    if (!el) return
    const e = edges.value[i]
    el.setAttribute('x1', (props.nodes[e.a].x + dx[e.a]).toFixed(2))
    el.setAttribute('y1', (props.nodes[e.a].y + dy[e.a]).toFixed(2))
    el.setAttribute('x2', (props.nodes[e.b].x + dx[e.b]).toFixed(2))
    el.setAttribute('y2', (props.nodes[e.b].y + dy[e.b]).toFixed(2))
  })
  rafId = requestAnimationFrame(tick)
}

function startDrift() {
  if (running) return
  running = true
  rafId = requestAnimationFrame(tick)
}

function stopDrift() {
  running = false
  cancelAnimationFrame(rafId)
}

const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
useOnceVisible(rootEl, () => { if (!reduceMotion) startDrift() }, 0.25)

onUnmounted(stopDrift)
</script>

<template>
  <div ref="rootEl" class="theme-chat select-none" role="img" :aria-label="label">
    <div class="flex items-center px-4 h-9 bg-chat-surface-1 border-b border-chat-hairline">
      <span class="text-xs font-bold text-chat-primary">Brian</span>
      <span class="ml-4 text-2xs text-chat-ink-tertiary">
        信息 <span class="mx-1 opacity-50">›</span> {{ breadcrumb }}
        <Copy :size="10" class="inline ml-1 opacity-40" />
      </span>
    </div>
    <div class="flex items-center gap-1 px-3 h-10 bg-chat-surface-1 border-b border-chat-hairline text-2xs text-chat-ink-tertiary">
      <span
        v-for="t in tabs" :key="t.label"
        class="gs-tab" :class="{ on: t.label === activeTab }"
      >
        <component :is="t.icon" :size="11" />{{ t.label }}
      </span>
    </div>
    <div class="flex items-center gap-2 px-3.5 py-2 bg-chat-surface-1 border-b border-chat-hairline text-4xs text-chat-ink-tertiary">
      <span class="gs-search"><Search :size="10" />{{ searchPlaceholder }}</span>
      <span class="gs-btn gs-btn-blue"><Crosshair :size="10" />定位</span>
      <span class="gs-btn gs-btn-gray">重置视图</span>
      <span class="hidden sm:inline text-chat-ink-tertiary">共 {{ nodes.length }} 节点</span>
      <Eye :size="12" class="hidden sm:inline text-chat-ink-tertiary" />
      <span class="hidden md:inline-flex items-center gap-1">斥力<i class="gs-slider" /><i class="gs-slider-dot" /></span>
      <span class="hidden md:inline-flex items-center gap-1">引力<i class="gs-slider" /><i class="gs-slider-dot" /></span>
      <span class="ml-auto gs-clean"><Trash2 :size="10" />一键清理</span>
    </div>

    <div class="relative bg-chat-canvas">
      <svg viewBox="0 0 1000 560" class="w-full h-auto block" @mouseleave="hovered = null">
        <line
          v-for="(e, i) in edges" :key="`e${i}`"
          :ref="(el) => setLineRef(el, i)"
          class="gs-edge" :class="{ hot: hotEdgeSet.has(i), dim: hovered !== null && !hotEdgeSet.has(i) }"
          :x1="nodes[e.a].x" :y1="nodes[e.a].y" :x2="nodes[e.b].x" :y2="nodes[e.b].y"
        />
        <g
          v-for="(n, i) in nodes" :key="`n${i}`"
          :ref="(el) => setNodeRef(el, i)"
          class="gs-node" :class="{ dim: hovered !== null && !hotNodeSet.has(i) }"
          @pointerenter="hovered = i"
        >
          <circle v-if="n.r >= 9" class="gs-halo" :cx="n.x" :cy="n.y" :r="n.r * 2.1" :fill="n.color" />
          <circle class="gs-dot" :cx="n.x" :cy="n.y" :r="n.r" :fill="n.color" />
          <text v-if="n.r >= 9 || hovered === i" class="gs-label" :x="n.x" :y="n.y + n.r + 13">{{ n.label }}</text>
        </g>
      </svg>

      <div class="gs-legend absolute right-3 top-3 px-3.5 py-2.5 rounded-xl text-4xs leading-6 text-chat-ink-subtle space-y-0.5">
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1"><i class="w-2 h-2 rounded-full bg-apple-gray-300 inline-block" /><i class="w-1.5 h-1.5 rounded-full bg-apple-gray-500 inline-block" /></span>
          节点大小：越大连接度越高
        </div>
        <div class="flex items-center gap-2"><i class="gs-grad" />节点颜色：蓝=低频 → 红=高频</div>
        <div class="flex items-center gap-2"><span class="tracking-[-2px] text-chat-ink-tertiary">←→</span>连线长度：越短关联越强</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gs-legend { background: rgb(var(--chat-canvas) / 0.85); border: 1px solid rgb(var(--chat-hairline)); backdrop-filter: blur(2px); }
.gs-tab { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 8px; transition: 0.2s; }
.gs-tab:hover { color: rgb(var(--chat-ink)); background: rgb(var(--chat-ink) / 0.05); }
.gs-tab.on { color: rgb(var(--chat-on-primary)); background: rgb(var(--chat-primary)); }

.gs-search { display: inline-flex; align-items: center; gap: 5px; min-width: 150px; padding: 4px 10px; border-radius: 8px; background: rgb(var(--chat-ink) / 0.05); color: rgb(var(--chat-ink-tertiary)); }
.gs-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 8px; }
.gs-btn-blue { background: rgb(var(--chat-primary)); color: rgb(var(--chat-on-primary)); }
.gs-btn-gray { background: rgb(var(--chat-ink) / 0.07); }
.gs-clean { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 8px; border: 1px solid rgb(var(--chat-error) / 0.55); color: rgb(var(--chat-error)); }
.gs-slider { display: inline-block; width: 34px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, rgb(var(--chat-primary)) 60%, rgb(var(--chat-ink) / 0.15) 60%); }
.gs-slider-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--chat-primary)); margin-left: -22px; }

.gs-edge { stroke: rgb(var(--chat-ink-subtle) / 0.28); stroke-width: 1; transition: opacity 0.3s, stroke 0.3s; }
.gs-edge.hot { stroke: rgb(var(--chat-primary) / 0.85); stroke-width: 1.5; }
.gs-edge.dim { opacity: 0.25; }
.gs-node { cursor: pointer; }
.gs-node.dim { opacity: 0.35; }
.gs-dot { transition: filter 0.3s; }
.gs-node:hover .gs-dot { filter: drop-shadow(0 0 7px currentColor); }
.gs-halo { opacity: 0.13; }
.gs-label { fill: rgb(var(--chat-ink-subtle)); font-size: 10.5px; text-anchor: middle; pointer-events: none; paint-order: stroke; stroke: rgb(var(--chat-canvas)); stroke-width: 3px; stroke-linejoin: round; }

.gs-grad { display: inline-block; width: 30px; height: 5px; border-radius: 3px; background: linear-gradient(90deg, #5db8a6, #cc785c); }
</style>
