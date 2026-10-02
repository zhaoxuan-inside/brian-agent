<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import {
  Brain, User, Send, Paperclip, Copy, Gauge, ChevronDown,
  MessageSquare, BookOpen, BarChart3, Clock, Settings, Wrench, Sun,
} from '@lucide/vue'
import { useOnceVisible } from '@/composables/useOnceVisible'
import { smoothEdgePath, type EdgeSide } from '@/utils/edgePath'
import { layoutChipsInCard } from '@/utils/cardChipLayout'

interface HeroChip { label: string; kind: 'blue' | 'gray' | 'eval' }

interface HeroNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  time: string
  title: string
  sub?: string
  sub2?: string
  chips: HeroChip[]
  chars: string
}

const CHECK1_ID = 'n3'
const CHECK2_ID = 'n5'
const PIN_ID = 'n6'

const mapNodes: HeroNode[] = [
  { id: 'n1', x: 36, y: 30, w: 252, h: 104, time: '2026-08-27 13:02', title: '北京天气怎么样？', chips: [{ label: '引用 0', kind: 'blue' }, { label: '被引用 2', kind: 'gray' }, { label: '思考过程', kind: 'blue' }, { label: '评估结果', kind: 'eval' }], chars: '8字' },
  { id: 'n2', x: 352, y: 30, w: 252, h: 104, time: '2026-08-27 13:05', title: '今日游玩推荐', sub: '室内首选：国博 · 科技馆 · 天文馆', chips: [{ label: '引用 1', kind: 'blue' }, { label: '被引用 0', kind: 'gray' }], chars: '508字' },
  { id: 'n3', x: 36, y: 186, w: 252, h: 140, time: '2026-08-27 13:03', title: '北京今日天气', sub: '多云转小雨 29℃/21℃ · 傍晚有雨', sub2: '风力 3 级 · 来源：中国天气网', chips: [{ label: '引用 1', kind: 'blue' }, { label: '被引用 1', kind: 'gray' }, { label: '思考过程', kind: 'blue' }], chars: '188字' },
  { id: 'n4', x: 352, y: 186, w: 252, h: 140, time: '2026-08-27 13:05', title: '穿搭建议', sub: '短袖打底 + 薄外套 + 晴雨两用伞', chips: [{ label: '引用 2', kind: 'blue' }, { label: '被引用 0', kind: 'gray' }, { label: '评估结果', kind: 'eval' }], chars: '6字' },
  { id: 'n5', x: 36, y: 378, w: 252, h: 140, time: '2026-08-27 13:03', title: '适合穿什么？', sub: '追问 · 引用了上一条天气', chips: [{ label: '引用 1', kind: 'blue' }, { label: '被引用 1', kind: 'gray' }], chars: '6字' },
  { id: 'n6', x: 352, y: 378, w: 252, h: 140, time: '2026-08-27 13:47', title: '回复的内容不要啰嗦', sub: '风格指令 · 长期有效', chips: [{ label: '引用 0', kind: 'blue' }, { label: '被引用 1', kind: 'gray' }], chars: '9字' },
]

interface HeroEdge {
  from: string
  fromSide: EdgeSide
  to: string
  toSide: EdgeSide
  alongA?: number
  alongB?: number
  solid: boolean
  delay: string
}

const mapEdges: HeroEdge[] = [
  { from: 'n1', fromSide: 'bottom', to: 'n3', toSide: 'top', solid: true, delay: '0.1s' },
  { from: 'n2', fromSide: 'bottom', to: 'n4', toSide: 'top', solid: true, delay: '0.35s' },
  { from: 'n3', fromSide: 'bottom', to: 'n5', toSide: 'top', solid: false, delay: '0.6s' },
  { from: 'n3', fromSide: 'right', to: 'n4', toSide: 'left', solid: false, delay: '0.85s' },
  { from: 'n5', fromSide: 'right', to: 'n6', toSide: 'left', solid: false, delay: '1.1s' },
]

const nodeById = new Map<string, HeroNode>(mapNodes.map((n) => [n.id, n]))

const edgePaths = computed(() => mapEdges.flatMap((e) => {
  const a = nodeById.get(e.from)
  const b = nodeById.get(e.to)
  if (!a || !b) return []
  return [{ ...e, d: smoothEdgePath(a, e.fromSide, b, e.toSide, { alongA: e.alongA, alongB: e.alongB }) }]
}))

const solidEdgePaths = computed(() => edgePaths.value.filter((e) => e.solid))

const chatCards = [
  {
    who: 'ai',
    lines: [
      '上午户外 / 下午室内策略：上午可选故宫、景山公园、颐和园；下午转室内：王府井、三里屯、国贸商圈。',
      '不推荐项目：户外爬山、露营、野餐——傍晚降雨路面湿滑，风险高。',
      '必带物品：晴雨两用伞、薄外套（夜间最低 21℃）。',
    ],
    chips: [{ label: '引用 1', kind: 'blue' }, { label: '被引用 0', kind: 'gray' }, { label: '思考过程', kind: 'blue' }, { label: '评估结果', kind: 'eval' }],
    chars: '508字',
  },
  {
    who: 'user',
    title: '结合天气和穿搭，明天去哪玩？',
    chips: [{ label: '引用 0', kind: 'blue' }, { label: '被引用 1', kind: 'gray' }],
    chars: '15字',
  },
  {
    who: 'ai',
    title: '北京明日游玩推荐',
    lines: [
      '明日多云转小雨：优先国博（免费需预约）、中国科技馆，下午转室内。',
      '按你的穿搭习惯：薄外套 + 晴雨两用伞，防滑鞋。',
    ],
    chips: [{ label: '引用 2', kind: 'blue' }, { label: '被引用 0', kind: 'gray' }, { label: '评估结果', kind: 'eval' }],
    chars: '217字',
  },
]

const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const sel1 = ref(false)
const sel2 = ref(false)
const pinned = ref(false)
const answerReady = ref(false)
const pressing = ref(false)
const cursor = ref({ x: 556, y: 572 })
const ripple = ref<{ x: number; y: number; k: number } | null>(null)

const checkedCount = computed(() => (sel1.value ? 1 : 0) + (sel2.value ? 1 : 0))

const REST = { x: 556, y: 572 }
const CHECK1_NODE = mapNodes.find((n) => n.id === CHECK1_ID) as HeroNode
const CHECK2_NODE = mapNodes.find((n) => n.id === CHECK2_ID) as HeroNode
const PIN_NODE = mapNodes.find((n) => n.id === PIN_ID) as HeroNode
const CHECK1_POINT = { x: CHECK1_NODE.x + CHECK1_NODE.w - 35, y: CHECK1_NODE.y + 10 }
const CHECK2_POINT = { x: CHECK2_NODE.x + CHECK2_NODE.w - 35, y: CHECK2_NODE.y + 10 }
const PIN_POINT = { x: PIN_NODE.x + PIN_NODE.w - 20, y: PIN_NODE.y + 10 }

const timers: ReturnType<typeof setTimeout>[] = []

function after(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms))
}

function clearTimers() {
  timers.forEach(clearTimeout)
  timers.length = 0
}

function press(apply: () => void, at: { x: number; y: number }) {
  pressing.value = true
  ripple.value = { ...at, k: (ripple.value?.k || 0) + 1 }
  after(160, () => {
    pressing.value = false
    apply()
  })
}

function runDemo() {
  clearTimers()
  sel1.value = false
  sel2.value = false
  pinned.value = false
  answerReady.value = false
  cursor.value = { ...REST }
  after(400, () => { cursor.value = { ...CHECK1_POINT } })
  after(1250, () => press(() => { sel1.value = true }, CHECK1_POINT))
  after(2450, () => { cursor.value = { ...CHECK2_POINT } })
  after(3300, () => press(() => { sel2.value = true }, CHECK2_POINT))
  after(4600, () => { cursor.value = { ...PIN_POINT } })
  after(5450, () => press(() => { pinned.value = true }, PIN_POINT))
  after(6600, () => { cursor.value = { ...REST }; answerReady.value = true })
  after(11000, runDemo)
}

const rootEl = ref<Element | null>(null)
const entered = ref(false)
useOnceVisible(rootEl, () => {
  entered.value = true
  if (reduceMotion) {
    sel1.value = true
    sel2.value = true
    pinned.value = true
    answerReady.value = true
  } else {
    runDemo()
  }
}, 0.25)

onUnmounted(clearTimers)
</script>

<template>
  <div ref="rootEl" class="hero-shot theme-chat select-none" :class="{ on: entered }" role="img" aria-label="Brian-Agent 对话页演示：左侧 ChatMap 记忆地图为整齐两列网格，假鼠标演示勾选多条消息与 Pin 钉住，右侧回答基于所选消息生成">
    <div class="hs-shell rounded-xl overflow-hidden shadow-2xl">
      <div class="flex items-center px-4 h-10 hs-topbar">
        <span class="text-sm font-bold text-chat-primary">Brian</span>
        <div class="ml-auto flex items-center gap-3 text-chat-ink-tertiary">
          <MessageSquare :size="13" class="!text-chat-primary" />
          <Brain :size="13" />
          <BookOpen :size="13" />
          <BarChart3 :size="13" />
          <Clock :size="13" />
          <Settings :size="13" />
          <Wrench :size="13" />
          <Sun :size="13" />
          <User :size="13" />
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-[1.42fr_1fr] md:divide-x divide-y md:divide-y-0 divide-chat-hairline">
        <svg viewBox="0 0 640 620" class="w-full h-auto block">
          <defs>
            <marker id="hf-arrow" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
              <path class="hf-arrow" d="M0.5,1 L7,4 L0.5,7 Z" />
            </marker>
            <pattern id="hf-dots" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle class="hf-dotcell" cx="1.4" cy="1.4" r="1.4" />
            </pattern>
          </defs>
          <rect width="640" height="620" fill="url(#hf-dots)" />
          <path
            v-for="(e, i) in edgePaths" :key="`he${i}`"
            class="hf-edge" :class="{ solid: e.solid }"
            :d="e.d" :style="{ animationDelay: e.delay }"
            marker-end="url(#hf-arrow)"
          />
          <g v-if="!reduceMotion">
            <circle v-for="(e, i) in solidEdgePaths" :key="`hp${i}`" class="hf-pulse" r="2.3">
              <animateMotion :path="e.d" dur="2.8s" repeatCount="indefinite" :begin="`${-i * 0.9}s`" />
            </circle>
          </g>
          <g v-for="(n, ni) in mapNodes" :key="n.id" class="hf-in" :style="{ animationDelay: ni * 0.1 + 's' }">
            <g class="hf-float" :style="{ animationDelay: (ni % 3) * 1.3 + 's' }">
              <rect
                class="hf-card" :x="n.x" :y="n.y" :width="n.w" :height="n.h" rx="10"
                :class="{ 'on-check': (sel1 && n.id === CHECK1_ID) || (sel2 && n.id === CHECK2_ID), 'on-pin': pinned && n.id === PIN_ID }"
              />
              <text class="hf-time" :x="n.x + 12" :y="n.y + 17">{{ n.time }}</text>

              <g
                class="hf-check"
                :class="{ on: (sel1 && n.id === CHECK1_ID) || (sel2 && n.id === CHECK2_ID) }"
                :transform="`translate(${n.x + n.w - 42}, ${n.y + 7})`"
              >
                <rect width="13" height="13" rx="3" />
                <path class="hf-check-mark" d="M2.8,6.8 L5.6,9.6 L10.4,3.6" />
              </g>

              <g
                class="hf-pinbtn" :class="{ on: pinned && n.id === PIN_ID }"
                :transform="`translate(${n.x + n.w - 19}, ${n.y + 13.5}) scale(0.46) translate(-12, -12)`"
              >
                <circle class="hf-pinbtn-bg" r="12" />
                <circle v-if="pinned && n.id === PIN_ID" class="hf-pinbtn-ring" r="11.5" />
                <path class="hf-pinbtn-glyph" d="M12 17v5" />
                <path class="hf-pinbtn-glyph" d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z" />
              </g>

              <text class="hf-title" :x="n.x + 12" :y="n.y + 40">{{ n.title }}</text>
              <text v-if="n.sub" class="hf-sub" :x="n.x + 12" :y="n.y + 58">{{ n.sub }}</text>
              <text v-if="n.sub2" class="hf-sub" :x="n.x + 12" :y="n.y + 73">{{ n.sub2 }}</text>
              <g v-for="(c, ci) in layoutChipsInCard(n.chips, n)" :key="ci">
                <rect
                  class="hf-chip" :class="[c.kind, { lit: checkedCount === 2 && n.id === 'n4' && c.kind === 'blue' }]"
                  :x="c.x" :y="c.y" :width="c.w" height="13" rx="6.5"
                />
                <text
                  class="hf-chip-txt" :class="[c.kind, { lit: checkedCount === 2 && n.id === 'n4' && c.kind === 'blue' }]"
                  :x="c.x + c.w / 2" :y="c.y + 9.5"
                >{{ c.label }}</text>
              </g>
              <text class="hf-chars" :x="n.x + n.w - 12" :y="n.y + n.h - 7" text-anchor="end">{{ n.chars }}</text>
            </g>
          </g>

          <g class="hf-status" :class="{ active: checkedCount > 0 || pinned }" transform="translate(36, 570)">
            <rect width="168" height="26" rx="13" />
            <circle cx="14" cy="13" r="3.2" class="hf-status-dot" />
            <text x="30" y="17">本轮上下文：选中 {{ checkedCount }} · 钉住 {{ pinned ? 1 : 0 }}</text>
          </g>

          <g class="hf-tip" :class="{ show: sel1 && !sel2 }" :transform="`translate(${CHECK1_NODE.x + 4}, ${CHECK1_NODE.y - 32})`">
            <rect class="hf-tip-box" width="150" height="24" rx="12" />
            <text class="hf-tip-txt" x="75" y="16">已勾选 · 还可继续多选</text>
          </g>
          <g class="hf-tip" :class="{ show: sel2 }" :transform="`translate(${CHECK2_NODE.x + 4}, ${CHECK2_NODE.y - 32})`">
            <rect class="hf-tip-box" width="150" height="24" rx="12" />
            <text class="hf-tip-txt" x="75" y="16">已选 2 条 · 一并作答</text>
          </g>
          <g class="hf-tip" :class="{ show: pinned }" :transform="`translate(${PIN_NODE.x + 62}, ${PIN_NODE.y - 32})`">
            <rect class="hf-tip-box amber" width="138" height="24" rx="12" />
            <text class="hf-tip-txt amber" x="69" y="16">已钉住 · 每轮生效</text>
          </g>

          <circle v-if="ripple" :key="ripple.k" class="hf-ripple" :cx="ripple.x" :cy="ripple.y" r="15" />

          <g v-if="entered && !reduceMotion" class="hf-cursor" :style="{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }">
            <g class="hf-cursor-inner" :class="{ pressing }">
              <path class="hf-cursor-body" d="M0,0 L0,16 L4.6,12.6 L7.2,18.4 L9.8,17.2 L7.3,11.6 L12.6,11.6 Z" />
            </g>
          </g>
        </svg>

        <div class="hs-chatcol flex flex-col min-h-0">
          <div class="flex-1 p-3 space-y-2.5">
            <template v-for="(m, mi) in chatCards" :key="mi">
              <div v-if="m.who === 'user'" class="hc-msg flex items-start gap-2" style="animation-delay: 0.5s">
                <span class="hc-avatar"><User :size="11" /></span>
                <div class="hc-card flex-1">
                  <div class="flex items-center text-[9.5px] text-chat-ink-tertiary">
                    13:48
                    <span class="ml-auto flex items-center gap-2">
                      <i class="hc-check" />
                      <span class="relative inline-flex">
                        <svg viewBox="0 0 24 24" width="12" height="12" class="text-warning-orange" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>
                        <i class="hc-ring" />
                      </span>
                    </span>
                  </div>
                  <p class="hc-fold">▸ 摘要 <span class="ml-2">▾ 原文</span></p>
                  <p class="text-2xs font-semibold text-chat-ink">{{ m.title }}</p>
                  <div class="hc-chips">
                    <span v-for="c in m.chips" :key="c.label" class="hc-chip" :class="c.kind">{{ c.label }} <ChevronDown :size="8" class="inline" /></span>
                    <span class="ml-auto text-[9px] text-chat-ink-tertiary">{{ m.chars }}</span>
                  </div>
                </div>
              </div>

              <div v-else class="hc-msg" :style="{ animationDelay: (mi === 0 ? 0.15 : 0.85) + 's' }">
                <div class="hc-card" :class="{ 'hc-answered': answerReady && mi === 2 }">
                  <span v-if="answerReady && mi === 2" class="hc-badge">✓ 基于勾选 2 条 + 钉住 1 条生成</span>
                  <p v-if="m.title" class="text-2xs font-semibold text-chat-ink mb-1">{{ m.title }}</p>
                  <p v-for="(line, li) in m.lines" :key="li" class="text-4xs leading-[1.6] text-chat-ink-subtle">{{ line }}</p>
                  <div class="hc-chips mt-1.5">
                    <span v-for="c in m.chips" :key="c.label" class="hc-chip" :class="c.kind">
                      <Brain v-if="c.label === '思考过程'" :size="8" class="inline" />
                      <Gauge v-if="c.label === '评估结果'" :size="8" class="inline" />
                      {{ c.label }} <ChevronDown v-if="c.kind !== 'eval'" :size="8" class="inline" />
                    </span>
                    <span class="ml-auto inline-flex items-center gap-1 text-[9px] text-chat-ink-tertiary"><Copy :size="8" />复制 TraceId · {{ m.chars }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div class="p-3 pt-1">
            <div class="hc-input">
              <Paperclip :size="12" class="text-chat-ink-tertiary" />
              <span class="text-2xs text-chat-ink-tertiary">输入消息...</span>
              <i class="hc-cursor" />
              <Send :size="13" class="ml-auto text-chat-primary" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 演示实例(ADR-016):根挂 theme-chat,全部取值走 chat 令牌变量,随明暗开关双模式 */
.hs-shell { background: rgb(var(--chat-canvas)); border: 1px solid rgb(var(--chat-hairline-strong)); }
.hs-topbar { background: rgb(var(--chat-surface-1)); border-bottom: 1px solid rgb(var(--chat-hairline)); }
.hs-chatcol { background: rgb(var(--chat-canvas)); }
.hf-arrow { fill: rgb(var(--chat-primary) / 0.55); stroke: none; }
.hf-dotcell { fill: rgb(var(--chat-ink) / 0.05); }
.hf-in { opacity: 0; animation: hf-in 0.6s ease forwards; }
.hf-float { animation: hf-floaty 7s ease-in-out infinite alternate; }
.hf-card { fill: rgb(var(--chat-surface-1)); stroke: rgb(var(--chat-hairline)); stroke-width: 1; transition: stroke 0.3s; }
.hf-card.on-check { stroke: rgb(var(--chat-primary) / 0.8); }
.hf-card.on-pin { stroke: rgb(var(--chat-warning) / 0.7); }
.hf-time { fill: rgb(var(--chat-ink-tertiary)); font-size: 8.5px; }
.hf-title { fill: rgb(var(--chat-ink)); font-size: 11.5px; font-weight: 600; }
.hf-sub { fill: rgb(var(--chat-ink-subtle)); font-size: 9px; }

.hf-check rect { fill: none; stroke: rgb(var(--chat-hairline-strong)); stroke-width: 1.1; transition: 0.2s; }
.hf-check.on rect { fill: rgb(var(--chat-primary)); stroke: rgb(var(--chat-primary)); }
.hf-check-mark { stroke: rgb(var(--chat-on-primary)); stroke-width: 1.8; fill: none; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transform: scale(0.4); transform-box: fill-box; transform-origin: center; transition: 0.25s 0.05s; }
.hf-check.on .hf-check-mark { opacity: 1; transform: none; }
.hf-pinbtn-bg { fill: transparent; transition: 0.2s; }
.hf-pinbtn-glyph { stroke: rgb(var(--chat-ink-tertiary)); stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; transition: 0.2s; }
.hf-pinbtn.on .hf-pinbtn-bg { fill: rgb(var(--chat-warning) / 0.16); }
.hf-pinbtn.on .hf-pinbtn-glyph { stroke: rgb(var(--chat-warning)); }
.hf-pinbtn-ring { fill: none; stroke: rgb(var(--chat-error) / 0.85); stroke-width: 1.4; animation: hf-pulse 1.6s ease-in-out infinite; }

.hf-status rect { fill: rgb(var(--chat-ink) / 0.04); stroke: rgb(var(--chat-hairline)); transition: 0.3s; }
.hf-status text { fill: rgb(var(--chat-ink-tertiary)); font-size: 10px; transition: 0.3s; }
.hf-status-dot { fill: rgb(var(--chat-hairline-strong)); transition: 0.3s; }
.hf-status.active rect { fill: rgb(var(--chat-primary) / 0.1); stroke: rgb(var(--chat-primary) / 0.4); }
.hf-status.active text { fill: rgb(var(--chat-primary-hover)); }
.hf-status.active .hf-status-dot { fill: rgb(var(--chat-primary)); }

.hf-tip { opacity: 0; transition: opacity 0.35s ease, transform 0.35s ease; }
.hf-tip.show { opacity: 1; }
.hf-tip-box { fill: rgb(var(--chat-primary) / 0.12); stroke: rgb(var(--chat-primary) / 0.45); stroke-width: 1; }
.hf-tip-box.amber { fill: rgb(var(--chat-warning) / 0.12); stroke: rgb(var(--chat-warning) / 0.45); }
.hf-tip-txt { font-size: 10.5px; text-anchor: middle; fill: rgb(var(--chat-primary-hover)); }
.hf-tip-txt.amber { fill: rgb(var(--chat-warning)); }

.hf-ripple { fill: none; stroke: rgb(var(--chat-primary) / 0.7); stroke-width: 1.6; transform-box: fill-box; transform-origin: center; animation: hf-ripple 0.55s ease-out forwards; }
.hf-cursor { transition: transform 0.65s cubic-bezier(0.35, 0, 0.25, 1); filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5)); }
.hf-cursor-inner { transition: transform 0.12s ease; transform-origin: 0 0; }
.hf-cursor-inner.pressing { transform: scale(0.82); }
.hf-cursor-body { fill: #ffffff; stroke: rgb(var(--chat-ink) / 0.9); stroke-width: 1; stroke-linejoin: round; }

.hf-chip.blue { fill: rgb(var(--chat-primary) / 0.14); }
.hf-chip.gray { fill: rgb(var(--chat-ink) / 0.06); }
.hf-chip.eval { fill: rgb(var(--chat-warning) / 0.14); }
.hf-chip.lit { fill: rgb(var(--chat-primary)); }
.hf-chip-txt { font-size: 8px; text-anchor: middle; pointer-events: none; }
.hf-chip-txt.blue { fill: rgb(var(--chat-primary-hover)); }
.hf-chip-txt.gray { fill: rgb(var(--chat-ink-subtle)); }
.hf-chip-txt.eval { fill: rgb(var(--chat-warning)); }
.hf-chip-txt.lit { fill: rgb(var(--chat-on-primary)); font-weight: 600; }
.hf-chars { fill: rgb(var(--chat-ink-tertiary)); font-size: 8.5px; }

.hf-edge { fill: none; stroke: rgb(var(--chat-primary) / 0.4); stroke-width: 1.3; stroke-linecap: round; stroke-dasharray: 0.1 6.9; opacity: 0; }
.hf-edge.solid { stroke: rgb(var(--chat-primary) / 0.55); stroke-width: 1.4; stroke-dasharray: 600; stroke-dashoffset: 600; }
.hf-pulse { fill: rgb(var(--chat-primary)); filter: drop-shadow(0 0 3px rgba(204, 120, 92, 0.6)); }
.on .hf-edge.solid { animation: hf-draw 1.3s ease forwards; }
.on .hf-edge:not(.solid) { animation: hf-fadein 0.8s ease forwards, hf-flow 1.8s linear infinite; }

.hc-msg { opacity: 0; }
.on .hc-msg { animation: hc-up 0.6s ease forwards; }
.hc-avatar { flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%; background: rgb(var(--chat-primary) / 0.16); color: rgb(var(--chat-primary-hover)); display: grid; place-items: center; margin-top: 2px; }
.hc-card { background: rgb(var(--chat-surface-1)); border: 1px solid rgb(var(--chat-hairline)); border-radius: 10px; padding: 8px 10px; transition: border-color 0.4s, box-shadow 0.4s; }
.hc-card.hc-answered { border-color: rgb(var(--chat-primary) / 0.55); box-shadow: 0 0 14px rgba(204, 120, 92, 0.2); }
.hc-badge { display: inline-block; margin-bottom: 5px; padding: 2px 8px; border-radius: 999px; font-size: 9px; background: rgb(var(--chat-primary) / 0.12); color: rgb(var(--chat-primary-hover)); border: 1px solid rgb(var(--chat-primary) / 0.4); animation: hc-up 0.4s ease; }
.hc-check { display: inline-block; width: 9px; height: 9px; border: 1px solid rgb(var(--chat-hairline-strong)); border-radius: 2px; }
.hc-ring { position: absolute; inset: -3px -4px; border: 1.2px solid rgb(var(--chat-error) / 0.85); border-radius: 4px; animation: hf-pulse 2s infinite; }
.hc-fold { font-size: 9px; color: rgb(var(--chat-ink-tertiary)); margin: 2px 0; }
.hc-chips { display: flex; align-items: center; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.hc-chip { display: inline-flex; align-items: center; gap: 2px; padding: 1.5px 6px; border-radius: 999px; font-size: 9px; }
.hc-chip.blue { background: rgb(var(--chat-primary) / 0.12); color: rgb(var(--chat-primary-hover)); }
.hc-chip.gray { background: rgb(var(--chat-ink) / 0.06); color: rgb(var(--chat-ink-subtle)); }
.hc-chip.eval { background: rgb(var(--chat-warning) / 0.12); color: rgb(var(--chat-warning)); }
.hc-input { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 999px; background: rgb(var(--chat-surface-1)); border: 1px solid rgb(var(--chat-hairline)); }
.hc-cursor { display: inline-block; width: 1px; height: 12px; background: rgb(var(--chat-primary)); animation: hf-blink 1s steps(1) infinite; }

@keyframes hf-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes hf-floaty { from { transform: translateY(0); } to { transform: translateY(-4px); } }
@keyframes hf-draw { to { stroke-dashoffset: 0; } }
@keyframes hf-fadein { to { opacity: 0.9; } }
@keyframes hf-flow { to { stroke-dashoffset: -14; } }
@keyframes hf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
@keyframes hf-blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
@keyframes hf-ripple { from { transform: scale(0.25); opacity: 0.8; } to { transform: scale(1.15); opacity: 0; } }
@keyframes hc-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .hf-in, .on .hf-in, .hc-msg, .on .hc-msg { opacity: 1; animation: none; }
  .hf-float, .hf-pinbtn-ring, .hc-ring, .hc-cursor, .hc-badge, .hf-tip { animation: none; transition: none; }
  .hf-edge, .on .hf-edge, .on .hf-edge.solid, .on .hf-edge:not(.solid) { opacity: 0.9; stroke-dashoffset: 0; animation: none; }
}
</style>
