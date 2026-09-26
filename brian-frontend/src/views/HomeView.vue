<script setup lang="ts">
import { computed, ref, markRaw, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ExternalLink, MessageCircle, Copy, Check,
  Network, Compass, Sparkles, FolderOpen, BookOpen, Target, Lightbulb,
  SlidersHorizontal, User, Lock, KeyRound, Package, Puzzle,
} from '@lucide/vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import { vReveal } from '@/composables/useRevealOnScroll'
import { useCountUp } from '@/composables/useCountUp'
import { useTypewriter } from '@/composables/useTypewriter'
import { useOnceVisible } from '@/composables/useOnceVisible'
import { monitorApi } from '@/api'
import { smoothEdgePath, type EdgeSide } from '@/utils/edgePath'
import { layoutChipsInCard } from '@/utils/cardChipLayout'

import qrQq from '@/assets/home/qr-qq.jpg'
import qrWechat from '@/assets/home/qr-wechat.jpg'
import HeroAppShot from '@/components/home/HeroAppShot.vue'
import MemoryPinShot from '@/components/home/MemoryPinShot.vue'
import GraphShot from '@/components/home/GraphShot.vue'
import { TAG_GRAPH, KEYWORD_GRAPH } from '@/components/home/graphData'

const GITHUB_URL = 'https://github.com/zhaoxuan-inside/brian-agent'
const QQ_GROUP = '942758906'

const router = useRouter()
const anchors = [
  { id: 'memory', label: '记忆地图' },
  { id: 'grow', label: '越长越懂你' },
  { id: 'trust', label: '可见的思考' },
  { id: 'brain', label: '第二大脑' },
  { id: 'privacy', label: '数据归属' },
  { id: 'compare', label: '对比' },
  { id: 'community', label: '交流群' },
]

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

const growCards = [
  { icon: markRaw(Network), title: '发现你从没意识到的联系', text: '节点越大关联越多，颜色越红出现越频繁。有时你会盯着图愣一下：「原来我最近一直在纠结这件事。」' },
  { icon: markRaw(Compass), title: '顺着网找记忆', text: '除了字面相似，它还沿标签和关键词的关系去捞旧事，常能想起靠搜索根本找不到的过去。' },
  { icon: markRaw(Sparkles), title: '恰到好处地「走神」', text: '检索时掺入极少量看似无关的记忆，避免每次只盯着眼前那点上下文。最好的灵感，常来自意料之外。' },
]
const brainCards = [
  { icon: markRaw(FolderOpen), title: '一个路径就接进来', text: '资料库支持直接添加本地目录，自动扫描成目录树，内容完全留在本机。' },
  { icon: markRaw(BookOpen), title: '开启自学习，让它替你读书', text: '系统空闲时自动阅读文档，把长文切块、提炼成知识点，沉淀进记忆网络。下次提问自然参与回答。' },
  { icon: markRaw(Target), title: '选中一段，当场就问', text: '框选看不懂的段落 → 右键「解释选中内容」→ 答案固定成卡片贴在文档旁，下次打开还在。' },
  { icon: markRaw(Lightbulb), title: '不止积累，还给洞察', text: '模式识别 / 趋势分析 / 异常检测 / 关联发现——比如发现一个反复出现却一直被你忽略的主题。' },
  { icon: markRaw(SlidersHorizontal), title: '学不学、多主动，你说了算', text: '随机因子调高，它空闲时更爱自发学习；想安静，随时暂停。' },
  { icon: markRaw(User), title: '它会慢慢形成「你」的画像', text: '行业、知识领域、文风、学习倾向持续更新，并保留历史版本，能看到「它眼中的我」的变化。' },
]
const privacyCards = [
  { icon: markRaw(Lock), title: '对话、记忆、资料、画像，全在本机', text: '不上传，不经过任何第三方服务器。' },
  { icon: markRaw(KeyRound), title: 'API Key 自己保管', text: '内置 OpenAI / Anthropic / DeepSeek / 智谱 / 通义 / 火山引擎等目录，用哪家、花多少你说了算，还能设每日/每月用量上限。' },
  { icon: markRaw(Package), title: '解压即用', text: '发行包内含运行环境，Linux / macOS / Windows 全覆盖，目标机器无需安装任何依赖；支持离线安装、程序与数据分离，升级重装都不丢数据。' },
  { icon: markRaw(Puzzle), title: '开源，可自建', text: 'Apache 2.0，代码全开放。个人用是本地 Agent，想给团队用也能改造成服务。' },
]
const lastRunOverview = ref<{ duration: string; tokens: string; skills: string; confirms: string }>({
  duration: '—', tokens: '—', skills: '—', confirms: '—',
})
async function loadLastRunOverview() {
  try {
    const res = await monitorApi.lastRunOverview()
    if (!res?.available) return
    lastRunOverview.value = {
      duration: `${res.duration_s ?? 0}s`,
      tokens: String(res.input_tokens ?? 0),
      skills: String(res.skill_calls ?? 0),
      confirms: String(res.permission_asks ?? 0),
    }
  } catch {  }
}
void loadLastRunOverview()

const timelineOverview = computed(() => [
  { value: lastRunOverview.value.duration, label: '最近问答总耗时' },
  { value: lastRunOverview.value.tokens, label: '最近问答输入 Token' },
  { value: lastRunOverview.value.skills, label: '最近问答技能调用' },
  { value: lastRunOverview.value.confirms, label: '最近问答需求确认' },
])
interface MapCardChip { label: string; kind: 'blue' | 'gray' | 'eval' }

interface MapCard {
  id: string
  x: number
  y: number
  w: number
  h: number
  time: string
  title: string
  sub: string
  chips: MapCardChip[]
  chars: string
  pinned?: boolean
}

const mapNodes: MapCard[] = [
  { id: 'n1', x: 40, y: 50, w: 250, h: 140, time: '13:02', title: '北京今天天气怎么样？', sub: '提问 · 开启话题', chips: [{ label: '引用 0', kind: 'blue' }, { label: '被引用 2', kind: 'gray' }], chars: '8字' },
  { id: 'n2', x: 340, y: 50, w: 250, h: 140, time: '13:02', title: '多云转小雨 29/21℃', sub: '风力 3 级 · 傍晚有雨', chips: [{ label: '引用 1', kind: 'blue' }, { label: '被引用 2', kind: 'gray' }, { label: '思考过程', kind: 'blue' }], chars: '188字', pinned: true },
  { id: 'n5', x: 640, y: 50, w: 250, h: 140, time: '13:03', title: '下午去博物馆还是商场？', sub: '勾选了「天气」作为依据', chips: [{ label: '引用 1', kind: 'blue' }, { label: '被引用 0', kind: 'gray' }], chars: '10字' },
  { id: 'n3', x: 40, y: 250, w: 250, h: 140, time: '13:03', title: '追问：适合穿什么？', sub: '引用了上一条天气', chips: [{ label: '引用 1', kind: 'blue' }, { label: '被引用 1', kind: 'gray' }], chars: '6字' },
  { id: 'n4', x: 340, y: 250, w: 250, h: 140, time: '13:03', title: '短袖 + 薄外套 + 雨伞', sub: '按天气与场合生成', chips: [{ label: '引用 1', kind: 'blue' }, { label: '被引用 0', kind: 'gray' }, { label: '评估结果', kind: 'eval' }], chars: '28字' },
  { id: 'n6', x: 640, y: 250, w: 250, h: 140, time: '13:04', title: '建议上午户外，下午室内', sub: '点节点可跳回原文', chips: [{ label: '引用 2', kind: 'blue' }, { label: '被引用 0', kind: 'gray' }], chars: '302字', pinned: true },
]

const statItems = [
  { target: 4, suffix: '', label: '种记忆检索维度' },
  { target: 13, suffix: '+', label: '家模型提供商' },
  { target: 100, suffix: '%', label: '数据留在本机' },
  { target: 0, suffix: '', label: '依赖安装' },
]
const statDisplays = statItems.map((s) => useCountUp(s.target, s.suffix))
const statsEl = ref<Element | null>(null)
useOnceVisible(statsEl, () => statDisplays.forEach((s) => s.start()), 0.6)

const mapEl = ref<Element | null>(null)
const mapDrawn = ref(false)
useOnceVisible(mapEl, () => { mapDrawn.value = true }, 0.3)

interface MapEdge {
  from: string
  fromSide: EdgeSide
  to: string
  toSide: EdgeSide
  alongA?: number
  alongB?: number
  solid: boolean
  delay: string
}

const mapEdges: MapEdge[] = [
  { from: 'n1', fromSide: 'right', to: 'n2', toSide: 'left', solid: true, delay: '0.15s' },
  { from: 'n2', fromSide: 'right', to: 'n5', toSide: 'left', solid: false, delay: '0.4s' },
  { from: 'n2', fromSide: 'bottom', to: 'n3', toSide: 'top', solid: false, delay: '0.65s' },
  { from: 'n3', fromSide: 'right', to: 'n4', toSide: 'left', solid: true, delay: '0.9s' },
  { from: 'n5', fromSide: 'bottom', to: 'n6', toSide: 'top', solid: true, delay: '1.15s' },
]

const nodeById = new Map<string, typeof mapNodes[number]>(mapNodes.map((n) => [n.id, n]))

const mapEdgePaths = computed(() => mapEdges.flatMap((e) => {
  const a = nodeById.get(e.from)
  const b = nodeById.get(e.to)
  if (!a || !b) return []
  return [{ ...e, d: smoothEdgePath(a, e.fromSide, b, e.toSide, { alongA: e.alongA, alongB: e.alongB }) }]
}))

const solidMapEdgePaths = computed(() => mapEdgePaths.value.filter((e) => e.solid))

const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const hoveredNode = ref<string | null>(null)

function isEdgeHot(edge: { from: string; to: string }) {
  return hoveredNode.value === edge.from || hoveredNode.value === edge.to
}

const timelineSteps = [
  { label: '需求理解 Agent' },
  { label: '选择 Agent 与模型' },
  { label: '组件装配 · Skill / MCP' },
  { label: '多轮思考与技能执行' },
  { label: '评估 Agent 质量打分' },
  { label: '写作 Agent 美化排版' },
]
const timelineEl = ref<Element | null>(null)
const timelineActive = ref(0)
const timers: ReturnType<typeof setTimeout>[] = []

function runTimeline(idx: number) {
  if (idx < timelineSteps.length) {
    timelineActive.value = idx + 1
    timers.push(setTimeout(() => runTimeline(idx + 1), 620))
  } else {
    timers.push(setTimeout(() => {
      timelineActive.value = 0
      runTimeline(0)
    }, 2200))
  }
}

useOnceVisible(timelineEl, () => runTimeline(0), 0.4)

const terminalEl = ref<Element | null>(null)
const { rendered, start: startTyping, stop: stopTyping } = useTypewriter([
  { t: '$ npm i -g brian-agent', c: 'cmd' },
  { t: '$ brian start', c: 'cmd' },
  { t: '  ▲ Brian-Agent 运行中  →  http://127.0.0.1:8000' },
  { t: '  · 打开 /config 填入你的 API Key，开始对话' },
])
useOnceVisible(terminalEl, startTyping, 0.4)

const compareRows = [
  { concern: '长对话记忆', others: '自动塞最近 N 轮，容易断片', brian: '勾选引用 + Pin，你说了算' },
  { concern: '记忆长什么样', others: '一堆散乱历史', brian: '一张可拖可点、能看见关系的记忆地图' },
  { concern: '越用越懂你', others: '基本不变', brian: '主动学习、知识沉淀、画像持续更新' },
  { concern: '本地资料', others: '通常不支持', brian: '本地 Markdown 资料库 + 自学习 + 选中即问' },
  { concern: '思考透明', others: '黑盒', brian: '需求确认、技能调用、耗时与评分全可见' },
  { concern: '数据归属', others: '在平台服务器', brian: '全在本机，API Key 自己保管' },
  { concern: '模型选择', others: '平台指定', brian: '主流提供商任选，含用量限额' },
  { concern: '部署形态', others: '只能用云', brian: '本地运行，也能自建为服务' },
]

const qqCopied = ref(false)

async function copyQqGroup() {
  try {
    await navigator.clipboard.writeText(QQ_GROUP)
    qqCopied.value = true
    setTimeout(() => { qqCopied.value = false }, 2000)
  } catch { /* 剪贴板不可用时忽略，群号仍可直接阅读 */ }
}

function goChat() {
  router.push('/chat')
}

onUnmounted(() => {
  stopTyping()
  timers.forEach(clearTimeout)
})
</script>

<template>
  <div class="home">
    <NeuralBackground />
    <Header />

    <div class="sticky top-14 z-40 glass-panel border-b">
      <div class="home-wrap flex items-center gap-1 overflow-x-auto scrollbar-hide">
        <button
          v-for="a in anchors" :key="a.id"
          class="shrink-0 px-3 py-2.5 text-xs text-apple-gray-500 dark:text-apple-gray-400 hover:text-brian-blue transition-colors"
          @click="scrollToSection(a.id)"
        >{{ a.label }}</button>
        <button class="shrink-0 ml-auto px-3.5 py-1.5 my-1.5 rounded-lg bg-brian-blue text-white text-xs font-medium hover:bg-brian-blue/90 transition-colors" @click="goChat">
          立即体验
        </button>
      </div>
    </div>

    <header class="home-wrap pt-16 pb-10 text-center relative z-10">
      <div v-reveal class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel text-xs text-apple-gray-600 dark:text-apple-gray-300">
        <span class="w-2 h-2 rounded-full bg-success-green motion-safe:animate-pulse-soft"></span>
        本地运行 · 开源 · 解压即用
      </div>
      <h1 v-reveal="'90ms'" class="mt-6 text-4xl md:text-6xl font-bold leading-tight tracking-tight">
        AI 的记忆，不该是黑盒<br />
        而该是一张你能<span class="home-grad">亲手改的地图</span>
      </h1>
      <p v-reveal="'180ms'" class="mt-6 max-w-2xl mx-auto text-apple-gray-500 dark:text-apple-gray-400 text-base md:text-lg">
        这不是又一个聊天框。它把你的对话、资料和想法，慢慢养成一个<b class="text-apple-gray-800 dark:text-apple-gray-100">记得住你、也会自己长大</b>的个人 Agent。数据全在自己机器上，模型自己选。
      </p>
      <div v-reveal="'270ms'" class="mt-8 flex items-center justify-center gap-3 flex-wrap">
        <button class="btn-primary !px-6 !py-3 text-base inline-flex items-center gap-1.5" @click="goChat">
          ▸ 现在就试，60 秒
        </button>
        <button class="btn-secondary !px-6 !py-3 text-base" @click="scrollToSection('memory')">
          看看它长什么样
        </button>
      </div>
      <p v-reveal="'360ms'" class="mt-5 text-xs text-apple-gray-400">
        Apache 2.0 · OpenAI / Anthropic / DeepSeek / 智谱 / 通义 / 火山引擎 等任选
      </p>

      <div v-reveal class="home-shot mt-12 text-left">
        <p class="px-4 py-2.5 text-xs text-apple-gray-400 border-b border-apple-gray-200/60 dark:border-apple-gray-700/60">
          左边，是你和 AI 的全部记忆画成的一张可操作地图；右边，是正常的对话问答。
        </p>
        <HeroAppShot />
      </div>
    </header>

    <div ref="statsEl" class="home-wrap relative z-10">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div v-for="(s, i) in statItems" :key="s.label" v-reveal="i * 60 + 'ms'" class="block-card !rounded-2xl py-7 text-center">
          <div class="text-3xl md:text-4xl font-bold text-brian-blue tabular-nums">{{ statDisplays[i].display.value }}</div>
          <div class="mt-1 text-xs text-apple-gray-400">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <section class="py-24 relative z-10">
      <div class="home-wrap text-center">
        <p v-reveal class="home-eyebrow">你一定经历过</p>
        <h2 v-reveal="'80ms'" class="home-h2">第 50 轮，它忘了第 3 轮</h2>
        <div v-reveal="'160ms'" class="max-w-2xl mx-auto mt-10 glass-panel rounded-2xl shadow-xl p-7 text-left space-y-3.5">
          <div class="flex justify-end">
            <p class="home-bubble home-bubble-me"><span class="block text-2xs opacity-70 mb-0.5">你</span>我们不是说好只看周末吗？</p>
          </div>
          <div>
            <p class="home-bubble home-bubble-ai"><span class="block text-2xs opacity-60 mb-0.5">AI</span>抱歉，我没有看到相关信息。</p>
          </div>
          <div>
            <p class="home-bubble home-bubble-ai"><span class="block text-2xs opacity-60 mb-0.5">你（第 17 次）</span>于是又把三天前那两段对话翻出来，重新贴了一遍。</p>
          </div>
        </div>
        <p v-reveal class="mt-10 max-w-3xl mx-auto text-lg md:text-2xl font-semibold leading-relaxed">
          问题不在模型不够聪明，而在<em class="text-error-red not-italic">「记忆方式」错了</em>。<br />
          <span class="text-apple-gray-500 dark:text-apple-gray-400 text-base md:text-lg font-normal">现在几乎所有 AI 的记忆，都只有一招：把最近 N 轮硬塞进上下文。</span>
        </p>
      </div>
    </section>

    <section id="memory" class="scroll-mt-28 py-20 relative z-10">
      <div class="home-wrap">
        <p v-reveal class="home-eyebrow">01 · 记忆地图</p>
        <h2 v-reveal="'80ms'" class="home-h2">你终于能「看见」<em class="home-em">AI 记住了什么</em></h2>
        <p v-reveal="'160ms'" class="home-sub max-w-3xl">
          打开对话页，左边不是滚动的气泡，而是一张关系网。每条消息是一个节点，连线是它引用过的关系。更关键的是——这张图可以操作。
        </p>

        <div class="grid lg:grid-cols-2 gap-10 mt-10 items-start">
          <div ref="mapEl" v-reveal class="block-card relative overflow-hidden" :class="{ 'home-map-drawn': mapDrawn }">
            <svg viewBox="0 0 900 450" class="w-full h-auto block" @mouseleave="hoveredNode = null">
              <path
                v-for="(e, i) in mapEdgePaths" :key="e.from + e.to"
                class="home-mline" :class="{ solid: e.solid, hot: isEdgeHot(e) }"
                :d="e.d" :style="{ animationDelay: e.delay }"
              />
              <g v-if="!reduceMotion">
                <circle v-for="(e, i) in solidMapEdgePaths" :key="`mp${i}`" class="home-pulse" r="2.3">
                  <animateMotion :path="e.d" dur="3s" repeatCount="indefinite" :begin="`${-i}s`" />
                </circle>
              </g>
              <g v-for="n in mapNodes" :key="n.id" class="cursor-pointer" @mouseenter="hoveredNode = n.id" @click="hoveredNode = n.id">
                <rect class="home-mnode" :class="{ hot: hoveredNode === n.id }" :x="n.x" :y="n.y" :width="n.w" :height="n.h" rx="12" />
                <text class="home-mtime" :x="n.x + 14" :y="n.y + 19">{{ n.time }}</text>
                <circle v-if="n.pinned" class="home-pin" :cx="n.x + n.w - 18" :cy="n.y + 16" r="4.2" />
                <text class="home-mtxt" :x="n.x + 14" :y="n.y + 42">{{ n.title }}</text>
                <text v-if="n.sub" class="home-mtxt dim" :x="n.x + 14" :y="n.y + 60">{{ n.sub }}</text>
                <g v-for="(c, ci) in layoutChipsInCard(n.chips, n)" :key="ci">
                  <rect class="home-mchip" :class="c.kind" :x="c.x" :y="c.y" :width="c.w" height="14" rx="7" />
                  <text class="home-mchip-txt" :class="c.kind" :x="c.x + c.w / 2" :y="c.y + 10">{{ c.label }}</text>
                </g>
                <text class="home-mchars" :x="n.x + n.w - 12" :y="n.y + n.h - 7" text-anchor="end">{{ n.chars }}</text>
              </g>
            </svg>
            <div class="flex flex-wrap items-center justify-center gap-x-7 gap-y-1 px-4 py-3 border-t border-apple-gray-200/60 dark:border-apple-gray-700/60 text-2xs text-apple-gray-500 dark:text-apple-gray-400">
              <span><i class="home-legend-dot" style="border-color:#007AFF"></i>提问 / 回答</span>
              <span><i class="home-legend-dot" style="border-color:#AF52DE"></i>引用关系（可勾选）</span>
              <span><i class="home-legend-dot" style="border-color:#FF9500"></i>Pin（永久生效）</span>
            </div>
          </div>

          <div>
            <ul v-reveal class="space-y-5">
              <li class="home-check">
                <b>想让 AI 参考哪段旧对话，就勾选哪段。</b>本轮回答只读取「你勾选的消息 + 你钉住的消息」，其余一律不进上下文。记忆不再靠它猜，而是你说了算。
              </li>
              <li class="home-check">
                <b>关键信息，Pin 一次永久生效。</b>「我在戒烟，别再推荐酒吧」「代码统一用 TypeScript」——钉住后每轮都在场，不用反复叮嘱。
              </li>
              <li class="home-check">
                <b>点一下节点，就跳回原文。</b>想复盘两周前那次决策怎么来的？直接点过去。
              </li>
            </ul>
            <div v-reveal class="home-shot mt-6 relative">
              <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full text-2xs bg-brian-blue/10 text-brian-blue border border-brian-blue/30">Memory Pin</span>
              <MemoryPinShot class="pt-11" />
            </div>
            <p v-reveal class="home-sub mt-5">
              <b class="text-apple-gray-800 dark:text-apple-gray-100">结果很直接：</b>上下文更短、回答更准、Token 更省——而且你第一次确切知道，AI 这一轮到底「记得」了什么。
            </p>
          </div>
        </div>
      </div>
    </section>

    <section id="grow" class="scroll-mt-28 py-20 relative z-10 bg-apple-gray-50/60 dark:bg-white/[.02]">
      <div class="home-wrap">
        <p v-reveal class="home-eyebrow">02 · 越长越懂你</p>
        <h2 v-reveal="'80ms'" class="home-h2">它不只是记住，它<em class="home-em">会长</em></h2>
        <p v-reveal="'160ms'" class="home-sub max-w-3xl">
          你说过的每句话、AI 回过的每段内容，都会在后台被悄悄加工：生成摘要、抽取标签、算出语义向量、提取关键词。时间一长，这些零散信息自己长出了关系。
        </p>

        <div v-reveal class="home-shot mt-10 motion-safe:home-floaty">
          <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full text-2xs bg-violet-500/10 text-violet-500 border border-violet-500/30">涌现图 · Tag Graph</span>
          <GraphShot
            class="pt-11" :nodes="TAG_GRAPH.nodes" :edges="TAG_GRAPH.edges"
            breadcrumb="涌现" active-tab="涌现"
            search-placeholder="搜索标签并定位..."
            label="涌现图：标签之间自动涌现的关联网络"
          />
        </div>
        <p v-reveal class="home-sub mt-5 max-w-3xl">
          <b class="text-apple-gray-800 dark:text-apple-gray-100">聊了两个月后打开它，</b>你会发现「旅行规划、天气、地铁出行、博物馆」竟然连成了一整片——这是你自己的知识结构，第一次被真实地画了出来。
        </p>

        <div v-reveal class="home-shot mt-9 motion-safe:home-floaty" style="animation-delay:1.5s">
          <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full text-2xs bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">关键词图 · Keyword Graph</span>
          <GraphShot
            class="pt-11" :nodes="KEYWORD_GRAPH.nodes" :edges="KEYWORD_GRAPH.edges"
            breadcrumb="关键词图" active-tab="关键词图"
            search-placeholder="搜索关键词并定位..."
            label="关键词图：被一个词激活的联想网络"
          />
        </div>
        <p v-reveal class="home-sub mt-5 max-w-3xl">
          <b class="text-apple-gray-800 dark:text-apple-gray-100">「灵光一闪」也可以被复现，</b>大脑里的联想往往是被某一个词激活的。点一个词，牵出一整片相关记忆。
        </p>

        <div class="grid md:grid-cols-3 gap-5 mt-12">
          <div v-for="(c, i) in growCards" :key="c.title" v-reveal="i * 80 + 'ms'" class="block-card p-6 hover:-translate-y-1.5 hover:shadow-lg transition-all duration-300">
            <div class="w-10 h-10 rounded-xl bg-brian-blue/10 grid place-items-center mb-4">
              <component :is="c.icon" :size="20" class="text-brian-blue" />
            </div>
            <h3 class="text-lg font-semibold mb-2">{{ c.title }}</h3>
            <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400 leading-relaxed">{{ c.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <section id="trust" class="scroll-mt-28 py-20 relative z-10">
      <div class="home-wrap">
        <p v-reveal class="home-eyebrow">03 · 可见的思考</p>
        <h2 v-reveal="'80ms'" class="home-h2">它会主动停下来问：<em class="home-em">「你是这个意思吗？」</em></h2>
        <p v-reveal="'160ms'" class="home-sub max-w-3xl">
          AI 最让人不安的，是你永远不知道它「以为」你要什么。Brian-Agent 把这一层彻底摊开。
        </p>

        <div class="grid lg:grid-cols-2 gap-10 mt-10 items-start">
          <div v-reveal class="glass-panel rounded-2xl shadow-xl overflow-hidden">
            <div class="flex items-center gap-2 px-4 py-3 border-b border-apple-gray-200/60 dark:border-apple-gray-700/60">
              <span class="w-2.5 h-2.5 rounded-full bg-error-red/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-warning-orange/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-success-green/80"></span>
              <span class="ml-2 text-xs text-apple-gray-400">需求理解确认</span>
            </div>
            <div class="p-6">
              <p class="text-base leading-relaxed">你好像想说的是：为一个「周末两天的北京行程」做规划，且只考虑室内外兼顾。是这个意思吗？</p>
              <div class="flex gap-2.5 mt-5 flex-wrap">
                <span class="px-3.5 py-1.5 rounded-lg bg-brian-blue text-white text-xs font-medium">按理解执行</span>
                <span class="px-3.5 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-xs">按原文执行</span>
                <span class="px-3.5 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-xs">取消</span>
              </div>
              <p class="mt-5 text-xs text-apple-gray-400">匹配度 0.62 / 阈值 0.75 · 判断依据：问题过于宽泛，缺少时间与范围约束</p>
            </div>
          </div>

          <div>
            <ul v-reveal class="space-y-5">
              <li class="home-check">
                <b>理解没把握时，它先问你，而不是硬答。</b>把「它理解成的需求」「匹配度」「判断依据」摆给你看，再让你决定。
              </li>
              <li class="home-check">
                <b>每次回答都有评分和优化建议。</b>点「评估结果」，就能看到这次回答被打了多少分、哪里还能更好。
              </li>
            </ul>
            <p v-reveal class="mt-6 text-base font-semibold leading-relaxed">
              一个愿意承认「我可能理解错了」的 AI，比一个永远自信地答错的 AI，可信太多。
            </p>
          </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-10 mt-14 items-start">
          <div v-reveal class="glass-panel rounded-2xl shadow-xl overflow-hidden">
            <div class="flex items-center gap-2 px-4 py-3 border-b border-apple-gray-200/60 dark:border-apple-gray-700/60">
              <span class="w-2.5 h-2.5 rounded-full bg-error-red/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-warning-orange/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-success-green/80"></span>
              <span class="ml-2 text-xs text-apple-gray-400">思考过程 · 执行时间线</span>
            </div>
            <div class="p-6">
              <div class="grid grid-cols-4 gap-3 mb-6">
                <div v-for="o in timelineOverview" :key="o.label" class="text-center py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/70">
                  <b class="block text-lg tabular-nums">{{ o.value }}</b>
                  <span class="text-2xs text-apple-gray-400">{{ o.label }}</span>
                </div>
              </div>
              <div ref="timelineEl" class="space-y-2.5">
                <div
                  v-for="(s, i) in timelineSteps" :key="s.label"
                  class="home-step" :class="{ on: i < timelineActive }"
                >
                  {{ s.label }}
                </div>
              </div>
            </div>
          </div>

          <div>
            <ul v-reveal class="space-y-5">
              <li class="home-check">
                <b>整条链路可见。</b>它怎么理解需求、选了哪个模型、调了哪些工具、每一步花了多久、烧了多少 Token——清清楚楚，没有一个黑盒。
              </li>
              <li class="home-check">
                <b>所有名称都查得到、点得开。</b>Agent、模型、提示词、技能、外部工具，鼠标悬浮可见标识，点击进详情。
              </li>
              <li class="home-check">
                <b>失败也能复盘。</b>错误回复会完整保留并标注，附带可复制的 TraceID，定位问题不求人。
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section id="brain" class="scroll-mt-28 py-20 relative z-10 bg-apple-gray-50/60 dark:bg-white/[.02]">
      <div class="home-wrap">
        <p v-reveal class="home-eyebrow">04 · 第二大脑</p>
        <h2 v-reveal="'80ms'" class="home-h2">把你的 100 篇笔记，喂成一个<em class="home-em">会回答的第二大脑</em></h2>
        <p v-reveal="'160ms'" class="home-sub max-w-3xl">你电脑里一定躺着几百篇 Markdown 笔记，写了就再也没打开过。</p>

        <div class="grid md:grid-cols-3 gap-5 mt-10">
          <div v-for="(c, i) in brainCards" :key="c.title" v-reveal="i * 60 + 'ms'" class="block-card p-6 hover:-translate-y-1.5 hover:shadow-lg transition-all duration-300">
            <div class="w-10 h-10 rounded-xl bg-brian-blue/10 grid place-items-center mb-4">
              <component :is="c.icon" :size="20" class="text-brian-blue" />
            </div>
            <h3 class="text-lg font-semibold mb-2">{{ c.title }}</h3>
            <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400 leading-relaxed">{{ c.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <section id="privacy" class="scroll-mt-28 py-20 relative z-10">
      <div class="home-wrap">
        <p v-reveal class="home-eyebrow">05 · 数据归属</p>
        <h2 v-reveal="'80ms'" class="home-h2">也是最硬的一点：<em class="home-em">你的数据，从头到尾都在你手里</em></h2>

        <div class="grid md:grid-cols-2 gap-5 mt-10">
          <div v-for="(c, i) in privacyCards" :key="c.title" v-reveal="i * 60 + 'ms'" class="block-card p-6 hover:-translate-y-1.5 hover:shadow-lg transition-all duration-300">
            <div class="w-10 h-10 rounded-xl bg-success-green/10 grid place-items-center mb-4">
              <component :is="c.icon" :size="20" class="text-success-green" />
            </div>
            <h3 class="text-lg font-semibold mb-2">{{ c.title }}</h3>
            <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400 leading-relaxed">{{ c.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <section id="start" class="scroll-mt-28 py-20 relative z-10">
      <div class="home-wrap">
        <div v-reveal class="block-card !rounded-3xl text-center px-6 py-14 relative overflow-hidden">
          <div class="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-brian-blue/10 to-transparent pointer-events-none"></div>
          <h2 class="text-3xl md:text-4xl font-bold">现在就试，<em class="home-em">60 秒</em></h2>
          <p class="mt-4 text-apple-gray-500 dark:text-apple-gray-400 max-w-xl mx-auto">
            首次打开进入 <b class="text-apple-gray-800 dark:text-apple-gray-100">/config</b>，选一家模型提供商、填入自己的 Key，就能开始聊了。
          </p>

          <div ref="terminalEl" class="home-term max-w-2xl mx-auto mt-8 text-left">
            <div class="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <span class="w-2.5 h-2.5 rounded-full" style="background:#ff5f57"></span>
              <span class="w-2.5 h-2.5 rounded-full" style="background:#febc2e"></span>
              <span class="w-2.5 h-2.5 rounded-full" style="background:#28c840"></span>
              <span class="ml-2 text-xs text-apple-gray-400">bash</span>
            </div>
            <pre class="px-6 py-6 font-mono text-xs leading-[1.9] whitespace-pre-wrap min-h-[150px]" v-html="rendered"></pre>
          </div>

          <div class="mt-8 flex items-center justify-center gap-3 flex-wrap relative z-10">
            <a class="btn-primary !px-6 !py-3 text-base inline-flex items-center gap-2" :href="GITHUB_URL" target="_blank" rel="noopener">
              去 GitHub 看看 <ExternalLink :size="17" />
            </a>
            <button class="btn-secondary !px-6 !py-3 text-base" @click="scrollToSection('memory')">再读一遍亮点</button>
          </div>
        </div>
      </div>
    </section>

    <section id="compare" class="scroll-mt-28 pt-4 pb-20 relative z-10">
      <div class="home-wrap">
        <p v-reveal class="home-eyebrow">一张表看懂</p>
        <h2 v-reveal="'80ms'" class="home-h2">它和「套壳聊天」的差距</h2>
        <div v-reveal="'160ms'" class="block-card mt-10 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left border-b border-apple-gray-200 dark:border-apple-gray-700">
                <th class="px-5 py-3.5 font-semibold text-apple-gray-500 dark:text-apple-gray-400">你在意的事</th>
                <th class="px-5 py-3.5 font-semibold text-apple-gray-500 dark:text-apple-gray-400">常见聊天产品</th>
                <th class="px-5 py-3.5 font-semibold text-brian-blue">Brian-Agent</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in compareRows" :key="r.concern" class="border-b border-apple-gray-100 dark:border-apple-gray-800 last:border-0">
                <td class="px-5 py-3.5 font-medium whitespace-nowrap">{{ r.concern }}</td>
                <td class="px-5 py-3.5 text-apple-gray-400">{{ r.others }}</td>
                <td class="px-5 py-3.5 bg-brian-blue/[.04]">{{ r.brian }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section id="community" class="scroll-mt-28 pb-24 relative z-10">
      <div class="home-wrap text-center">
        <p v-reveal class="home-eyebrow">加入我们</p>
        <h2 v-reveal="'80ms'" class="home-h2">别一个人闷头折腾，<em class="home-em">来群里聊聊</em></h2>
        <p v-reveal="'160ms'" class="home-sub mx-auto text-center">使用技巧、问题反馈、更新预告都在群里。扫下面的二维码，或直接搜索群号加入。</p>

        <div class="grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto mt-10">
          <div v-reveal class="block-card p-7 hover:-translate-y-1.5 hover:shadow-lg transition-all duration-300">
            <div class="w-52 h-52 mx-auto p-2.5 rounded-2xl bg-white border border-apple-gray-200 shadow-md">
              <img :src="qrQq" alt="QQ 群二维码：Brian Agent（群号 942758906）" class="w-full h-full object-contain rounded-lg" loading="lazy" />
            </div>
            <h3 class="mt-5 text-lg font-semibold">QQ 群</h3>
            <button
              class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-sm hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
              :title="qqCopied ? '已复制' : '点击复制群号'"
              @click="copyQqGroup"
            >
              群号 <b class="font-mono text-base tracking-wider text-brian-blue">{{ QQ_GROUP }}</b>
              <Check v-if="qqCopied" :size="14" class="text-success-green" />
              <Copy v-else :size="14" class="text-apple-gray-400" />
            </button>
            <p class="mt-2.5 text-xs text-apple-gray-400">扫码加入，或 QQ 搜索群号</p>
          </div>

          <div v-reveal="'90ms'" class="block-card p-7 hover:-translate-y-1.5 hover:shadow-lg transition-all duration-300">
            <div class="w-52 h-52 mx-auto p-2.5 rounded-2xl bg-white border border-apple-gray-200 shadow-md">
              <img :src="qrWechat" alt="微信群二维码：Brian Agent" class="w-full h-full object-contain rounded-lg" loading="lazy" />
            </div>
            <h3 class="mt-5 text-lg font-semibold">微信群</h3>
            <p class="mt-2 text-sm inline-flex items-center gap-1.5 text-apple-gray-500 dark:text-apple-gray-400">
              <MessageCircle :size="15" /> 微信扫一扫，直接进群
            </p>
            <p class="mt-2.5 text-xs text-apple-gray-400">群满时可先加 QQ 群备用</p>
          </div>
        </div>
      </div>
    </section>

    <footer class="border-t border-apple-gray-200 dark:border-apple-gray-700 py-12 text-center text-xs text-apple-gray-400 relative z-10">
      <p>Brian-Agent · 一个会记住你、也会自己长大的本地个人 Agent</p>
      <div class="mt-3 flex items-center justify-center gap-5 flex-wrap">
        <a :href="GITHUB_URL" target="_blank" rel="noopener" class="hover:text-brian-blue transition-colors">GitHub</a>
        <span>TypeScript</span><span>Vue 3</span><span>Apache 2.0</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.home-wrap { max-width: 1140px; margin-left: auto; margin-right: auto; padding-left: 24px; padding-right: 24px; }

.home-grad { background: linear-gradient(90deg, #007AFF, #AF52DE, #32ADE6); -webkit-background-clip: text; background-clip: text; color: transparent; }
.home-eyebrow { font-size: 13px; font-weight: 600; letter-spacing: 0.18em; color: #007AFF; }
.home-h2 { margin-top: 10px; font-size: clamp(24px, 3.2vw, 36px); font-weight: 700; letter-spacing: -0.01em; line-height: 1.3; }
.home-em { font-style: normal; color: #007AFF; }
.home-sub { margin-top: 14px; color: #8E8E93; font-size: 15.5px; line-height: 1.85; }
.dark .home-sub { color: #98989D; }
.dark .home-eyebrow, .dark .home-em { color: #4DA3FF; }

.home-shot { border: 1px solid rgba(209, 209, 214, 0.8); border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.08); }
.dark .home-shot { border-color: rgba(58, 58, 60, 0.9); background: #1C1C1E; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5); }

.home-bubble { display: inline-block; max-width: 88%; padding: 11px 16px; border-radius: 14px; font-size: 15px; line-height: 1.6; }
.home-bubble-me { background: rgba(0, 122, 255, 0.12); border: 1px solid rgba(0, 122, 255, 0.3); }
.home-bubble-ai { background: rgba(0, 0, 0, 0.04); border: 1px solid rgba(209, 209, 214, 0.6); }
.dark .home-bubble-ai { background: rgba(255, 255, 255, 0.06); border-color: rgba(58, 58, 60, 0.9); }

.home-check { position: relative; padding-left: 26px; line-height: 1.8; color: #8E8E93; font-size: 15px; }
.dark .home-check { color: #98989D; }
.home-check b { color: inherit; }
.dark .home-check b { color: #E5E5EA; }
.home-check::before { content: '✓'; position: absolute; left: 0; top: 0; width: 18px; height: 18px; border-radius: 50%; background: rgba(0, 122, 255, 0.12); color: #007AFF; font-size: 11px; display: grid; place-items: center; margin-top: 5px; }

.home-mline { fill: none; stroke: rgba(0, 122, 255, 0.42); stroke-width: 1.4; stroke-linecap: round; stroke-dasharray: 0.1 6.9; opacity: 0; transition: 0.3s; }
.home-mline.solid { stroke: rgba(0, 122, 255, 0.62); stroke-dasharray: none; }
.home-map-drawn .home-mline:not(.solid) { opacity: 1; transition: opacity 0.8s ease; animation: home-flow 1.8s linear infinite; }
.home-map-drawn .home-mline.solid { opacity: 1; stroke-dasharray: 600; stroke-dashoffset: 600; animation: home-draw 1.4s ease forwards; }
.home-pulse { fill: #4DA3FF; }
.home-mnode { fill: #F5F5F7; stroke: #D1D1D6; stroke-width: 1.2; transition: 0.3s; }
.dark .home-mnode { fill: #2C2C2E; stroke: #3A3A3C; }
.home-mnode.hot { stroke: #007AFF; fill: rgba(0, 122, 255, 0.08); filter: drop-shadow(0 0 10px rgba(0, 122, 255, 0.45)); }
.home-mtime { fill: #8E8E93; font-size: 9.5px; font-family: inherit; pointer-events: none; }
.dark .home-mtime { fill: #98989D; }
.home-mchip.blue { fill: rgba(0, 122, 255, 0.14); }
.home-mchip.gray { fill: rgba(120, 120, 128, 0.16); }
.home-mchip.eval { fill: rgba(255, 149, 0, 0.16); }
.home-mchip-txt { font-size: 8.5px; text-anchor: middle; font-family: inherit; pointer-events: none; }
.home-mchip-txt.blue { fill: #007AFF; }
.home-mchip-txt.gray { fill: #8E8E93; }
.home-mchip-txt.eval { fill: #FF9500; }
.home-mchars { fill: #8E8E93; font-size: 8.5px; pointer-events: none; }
.dark .home-mchars { fill: #6E6E73; }
.dark .home-mchip.gray { fill: rgba(255, 255, 255, 0.08); }
.dark .home-mchip-txt.blue { fill: #4DA3FF; }
.dark .home-mchip-txt.gray { fill: #98989D; }
.dark .home-mchip-txt.eval { fill: #FF9F0A; }
.home-mline.hot { stroke: #AF52DE; stroke-width: 2.2; stroke-dasharray: none; filter: drop-shadow(0 0 5px rgba(175, 82, 222, 0.7)); }
.home-mtxt { fill: #3A3A3C; font-size: 12.5px; font-family: inherit; pointer-events: none; }
.dark .home-mtxt { fill: #C7C7CC; }
.home-mtxt.dim { fill: #8E8E93; font-size: 11px; }
.home-pin { fill: #FF9500; animation: home-pulse 2s infinite; }
.home-legend-dot { display: inline-block; width: 16px; height: 0; border-top: 2px solid; vertical-align: middle; margin-right: 6px; }

.home-step { display: flex; align-items: center; padding: 10px 14px; border-radius: 10px; border: 1px solid transparent; font-size: 14px; opacity: 0.35; transition: 0.4s; }
.home-step.on { opacity: 1; border-color: rgba(0, 122, 255, 0.35); background: rgba(0, 122, 255, 0.06); }

.home-term { border-radius: 16px; overflow: hidden; border: 1px solid #3A3A3C; background: #060910; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45); }
.home-term pre { margin: 0; color: #CFE0FF; }
.home-term :deep(.cmd) { color: #34C759; }
.home-term :deep(.cur) { display: inline-block; width: 8px; height: 15px; background: #32ADE6; vertical-align: -3px; animation: home-blink 1s steps(1) infinite; }

.reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.7s ease, transform 0.7s ease; }
.reveal.is-visible { opacity: 1; transform: none; }

.motion-safe\:home-floaty { animation: home-floaty 6s ease-in-out infinite; }

@keyframes home-draw { to { stroke-dashoffset: 0; } }
@keyframes home-flow { to { stroke-dashoffset: -14; } }
@keyframes home-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes home-blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
@keyframes home-floaty { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }

@media (prefers-reduced-motion: reduce) {
  .reveal { opacity: 1; transform: none; transition: none; }
  .home-map-drawn .home-mline, .home-map-drawn .home-mline.solid, .home-map-drawn .home-mline:not(.solid) { animation: none; stroke-dashoffset: 0; opacity: 1; }
  .motion-safe\:home-floaty { animation: none; }
  .home-pin { animation: none; }
}
</style>
