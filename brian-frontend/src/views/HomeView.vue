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
import { smoothEdgePath, type EdgeSide } from '@/utils/edgePath'

// ===== 原始实现（保留作为参考）：静态截图，已替换为下方动态组件 =====
// import heroMap from '@/assets/home/hero-map.png'
// import memoryPin from '@/assets/home/memory-pin.png'
// import tagGraph from '@/assets/home/tag-graph.png'
// import keywordGraph from '@/assets/home/keyword-graph.png'
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

// ===== 首页展示卡片的静态数据 =====
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
const timelineOverview = [
  { value: '12.4s', label: '总耗时' },
  { value: '3,148', label: '输入 Token' },
  { value: '5', label: '工具调用' },
  { value: '1', label: '需求确认' },
]
const mapNodes = [
  { id: 'n1', x: 45, y: 60, w: 210, h: 90, title: '北京今天天气怎么样？', sub: '提问' },
  { id: 'n2', x: 45, y: 250, w: 210, h: 115, title: '多云转小雨 29/21℃', sub: '风力 3 级 · 傍晚有雨', pinned: true },
  { id: 'n3', x: 495, y: 255, w: 210, h: 115, title: '追问：适合穿什么？', sub: '引用了上一条天气' },
  { id: 'n4', x: 495, y: 455, w: 210, h: 70, title: '短袖 + 薄外套 + 雨伞', sub: '' },
  { id: 'n5', x: 665, y: 70, w: 220, h: 120, title: '下午去博物馆还是商场？', sub: '勾选了「天气」作为依据' },
  { id: 'n6', x: 665, y: 270, w: 220, h: 120, title: '建议上午户外，下午室内', sub: '点节点可跳回原文', pinned: true },
]

// ===== 统计数字 =====
const statItems = [
  { target: 4, suffix: '', label: '种记忆检索维度' },
  { target: 13, suffix: '+', label: '家模型提供商' },
  { target: 100, suffix: '%', label: '数据留在本机' },
  { target: 0, suffix: '', label: '依赖安装' },
]
const statDisplays = statItems.map((s) => useCountUp(s.target, s.suffix))
const statsEl = ref<Element | null>(null)
useOnceVisible(statsEl, () => statDisplays.forEach((s) => s.start()), 0.6)

// ===== 记忆地图示意：节点悬浮高亮 + 连线入场 =====
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

// ===== 原始实现（保留作为参考）：手写坐标连线，直线/折角生硬且锚点脱靶 =====
// const mapEdges = [
//   { from: 'n1', to: 'n2', solid: true, d: 'M150,150 L150,250', delay: '0.2s' },
//   { from: 'n2', to: 'n3', solid: false, d: 'M150,365 L600,255', delay: '0.5s' },
//   { from: 'n3', to: 'n4', solid: true, d: 'M600,370 L600,455', delay: '0.8s' },
//   { from: 'n2', to: 'n5', solid: false, d: 'M250,300 L720,120', delay: '1.1s' },
//   { from: 'n5', to: 'n6', solid: true, d: 'M775,190 L775,270', delay: '1.4s' },
// ]
const mapEdges: MapEdge[] = [
  { from: 'n1', fromSide: 'bottom', to: 'n2', toSide: 'top', alongA: 0.42, alongB: 0.58, solid: true, delay: '0.2s' },
  { from: 'n2', fromSide: 'right', to: 'n3', toSide: 'left', solid: false, delay: '0.5s' },
  { from: 'n3', fromSide: 'bottom', to: 'n4', toSide: 'top', alongA: 0.45, alongB: 0.55, solid: true, delay: '0.8s' },
  { from: 'n2', fromSide: 'right', to: 'n5', toSide: 'left', solid: false, delay: '1.1s' },
  { from: 'n5', fromSide: 'bottom', to: 'n6', toSide: 'top', alongA: 0.45, alongB: 0.55, solid: true, delay: '1.4s' },
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

// ===== 思考时间线：进入视口后逐步点亮并循环 =====
const timelineSteps = [
  { label: '需求理解 Agent', time: '0.8s' },
  { label: '选择 Agent 与模型', time: '1.2s' },
  { label: '组件装配 · Skill / MCP', time: '2.1s' },
  { label: '多轮思考与工具执行', time: '6.4s' },
  { label: '评估 Agent 质量打分', time: '1.1s' },
  { label: '写作 Agent 美化排版', time: '0.8s' },
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

// ===== 终端打字 =====
const terminalEl = ref<Element | null>(null)
const { rendered, start: startTyping, stop: stopTyping } = useTypewriter([
  { t: '$ npm i -g brian-agent', c: 'cmd' },
  { t: '$ brian start', c: 'cmd' },
  { t: '  ▲ Brian-Agent 运行中  →  http://127.0.0.1:8000' },
  { t: '  · 打开 /config 填入你的 API Key，开始对话' },
])
useOnceVisible(terminalEl, startTyping, 0.4)

// ===== 对比表 =====
const compareRows = [
  { concern: '长对话记忆', others: '自动塞最近 N 轮，容易断片', brian: '勾选引用 + Pin，你说了算' },
  { concern: '记忆长什么样', others: '一堆散乱历史', brian: '一张可拖可点、能看见关系的记忆地图' },
  { concern: '越用越懂你', others: '基本不变', brian: '主动学习、知识沉淀、画像持续更新' },
  { concern: '本地资料', others: '通常不支持', brian: '本地 Markdown 资料库 + 自学习 + 选中即问' },
  { concern: '思考透明', others: '黑盒', brian: '需求确认、工具调用、耗时与评分全可见' },
  { concern: '数据归属', others: '在平台服务器', brian: '全在本机，API Key 自己保管' },
  { concern: '模型选择', others: '平台指定', brian: '主流提供商任选，含用量限额' },
  { concern: '部署形态', others: '只能用云', brian: '本地运行，也能自建为服务' },
]

// ===== 交流群 =====
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

    <!-- 锚点导航 -->
    <div class="sticky top-14 z-40 glass-panel border-b">
      <div class="home-wrap flex items-center gap-1 overflow-x-auto scrollbar-hide">
        <button
          v-for="a in anchors" :key="a.id"
          class="shrink-0 px-3 py-2.5 text-[13px] text-apple-gray-500 dark:text-apple-gray-400 hover:text-brian-blue transition-colors"
          @click="scrollToSection(a.id)"
        >{{ a.label }}</button>
        <button class="shrink-0 ml-auto px-3.5 py-1.5 my-1.5 rounded-lg bg-brian-blue text-white text-[13px] font-medium hover:bg-brian-blue/90 transition-colors" @click="goChat">
          立即体验
        </button>
      </div>
    </div>

    <!-- HERO -->
    <header class="home-wrap pt-16 pb-10 text-center relative z-10">
      <div v-reveal class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel text-[13px] text-apple-gray-600 dark:text-apple-gray-300">
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
        <p class="px-4 py-2.5 text-[12.5px] text-apple-gray-400 border-b border-apple-gray-200/60 dark:border-apple-gray-700/60">
          左边，是你和 AI 的全部记忆画成的一张可操作地图；右边，是正常的对话问答。
        </p>
        <!-- 原始实现（保留作为参考）：<img :src="heroMap" alt="Brian-Agent 对话页：左侧 ChatMap 记忆地图，右侧对话" class="block w-full" /> -->
        <HeroAppShot />
      </div>
    </header>

    <!-- STATS -->
    <div ref="statsEl" class="home-wrap relative z-10">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div v-for="(s, i) in statItems" :key="s.label" v-reveal="i * 60 + 'ms'" class="block-card !rounded-2xl py-7 text-center">
          <div class="text-3xl md:text-4xl font-bold text-brian-blue tabular-nums">{{ statDisplays[i].display.value }}</div>
          <div class="mt-1 text-[13px] text-apple-gray-400">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <!-- PAIN -->
    <section class="py-24 relative z-10">
      <div class="home-wrap text-center">
        <p v-reveal class="home-eyebrow">你一定经历过</p>
        <h2 v-reveal="'80ms'" class="home-h2">第 50 轮，它忘了第 3 轮</h2>
        <div v-reveal="'160ms'" class="max-w-2xl mx-auto mt-10 glass-panel rounded-2xl shadow-xl p-7 text-left space-y-3.5">
          <div class="flex justify-end">
            <p class="home-bubble home-bubble-me"><span class="block text-[11px] opacity-70 mb-0.5">你</span>我们不是说好只看周末吗？</p>
          </div>
          <div>
            <p class="home-bubble home-bubble-ai"><span class="block text-[11px] opacity-60 mb-0.5">AI</span>抱歉，我没有看到相关信息。</p>
          </div>
          <div>
            <p class="home-bubble home-bubble-ai"><span class="block text-[11px] opacity-60 mb-0.5">你（第 17 次）</span>于是又把三天前那两段对话翻出来，重新贴了一遍。</p>
          </div>
        </div>
        <p v-reveal class="mt-10 max-w-3xl mx-auto text-lg md:text-2xl font-semibold leading-relaxed">
          问题不在模型不够聪明，而在<em class="text-error-red not-italic">「记忆方式」错了</em>。<br />
          <span class="text-apple-gray-500 dark:text-apple-gray-400 text-base md:text-lg font-normal">现在几乎所有 AI 的记忆，都只有一招：把最近 N 轮硬塞进上下文。</span>
        </p>
      </div>
    </section>

    <!-- 01 记忆地图 -->
    <section id="memory" class="scroll-mt-28 py-20 relative z-10">
      <div class="home-wrap">
        <p v-reveal class="home-eyebrow">01 · 记忆地图</p>
        <h2 v-reveal="'80ms'" class="home-h2">你终于能「看见」<em class="home-em">AI 记住了什么</em></h2>
        <p v-reveal="'160ms'" class="home-sub max-w-3xl">
          打开对话页，左边不是滚动的气泡，而是一张关系网。每条消息是一个节点，连线是它引用过的关系。更关键的是——这张图可以操作。
        </p>

        <div class="grid lg:grid-cols-2 gap-10 mt-10 items-start">
          <div ref="mapEl" v-reveal class="block-card relative overflow-hidden" :class="{ 'home-map-drawn': mapDrawn }">
            <div class="absolute right-4 bottom-4 z-10 text-[11.5px] leading-7 text-right bg-white/70 dark:bg-black/40 backdrop-blur px-3 py-2 rounded-lg border border-apple-gray-200/60 dark:border-apple-gray-700/60">
              <div><i class="home-legend-dot" style="border-color:#007AFF"></i>提问 / 回答</div>
              <div><i class="home-legend-dot" style="border-color:#AF52DE"></i>引用关系（可勾选）</div>
              <div><i class="home-legend-dot" style="border-color:#FF9500"></i>Pin（永久生效）</div>
            </div>
            <svg viewBox="0 0 900 540" class="w-full h-auto block" @mouseleave="hoveredNode = null">
              <path
                v-for="(e, i) in mapEdgePaths" :key="e.from + e.to"
                class="home-mline" :class="{ solid: e.solid, hot: isEdgeHot(e) }"
                :d="e.d" :style="{ animationDelay: e.delay }"
              />
              <!-- solid 连线上的流动光点（SMIL 不响应 reduced-motion，故按需渲染） -->
              <g v-if="!reduceMotion">
                <circle v-for="(e, i) in solidMapEdgePaths" :key="`mp${i}`" class="home-pulse" r="2.3">
                  <animateMotion :path="e.d" dur="3s" repeatCount="indefinite" :begin="`${-i}s`" />
                </circle>
              </g>
              <g v-for="n in mapNodes" :key="n.id" class="cursor-pointer" @mouseenter="hoveredNode = n.id" @click="hoveredNode = n.id">
                <rect class="home-mnode" :class="{ hot: hoveredNode === n.id }" :x="n.x" :y="n.y" :width="n.w" :height="n.h" rx="12" />
                <text class="home-mtxt" :x="n.x + 15" :y="n.y + 30">{{ n.title }}</text>
                <text v-if="n.sub" class="home-mtxt dim" :x="n.x + 15" :y="n.y + 58">{{ n.sub }}</text>
                <circle v-if="n.pinned" class="home-pin" :cx="n.x + n.w - 20" :cy="n.y + 22" r="4.2" />
              </g>
            </svg>
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
              <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11.5px] bg-brian-blue/10 text-brian-blue border border-brian-blue/30">Memory Pin</span>
              <!-- 原始实现（保留作为参考）：<img :src="memoryPin" alt="Memory Pin：把关键消息钉在上下文里" class="block w-full pt-11" /> -->
              <MemoryPinShot class="pt-11" />
            </div>
            <p v-reveal class="home-sub mt-5">
              <b class="text-apple-gray-800 dark:text-apple-gray-100">结果很直接：</b>上下文更短、回答更准、Token 更省——而且你第一次确切知道，AI 这一轮到底「记得」了什么。
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 02 越长越懂你 -->
    <section id="grow" class="scroll-mt-28 py-20 relative z-10 bg-apple-gray-50/60 dark:bg-white/[.02]">
      <div class="home-wrap">
        <p v-reveal class="home-eyebrow">02 · 越长越懂你</p>
        <h2 v-reveal="'80ms'" class="home-h2">它不只是记住，它<em class="home-em">会长</em></h2>
        <p v-reveal="'160ms'" class="home-sub max-w-3xl">
          你说过的每句话、AI 回过的每段内容，都会在后台被悄悄加工：生成摘要、抽取标签、算出语义向量、提取关键词。时间一长，这些零散信息自己长出了关系。
        </p>

        <div v-reveal class="home-shot mt-10 motion-safe:home-floaty">
          <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11.5px] bg-violet-500/10 text-violet-500 border border-violet-500/30">涌现图 · Tag Graph</span>
          <!-- 原始实现（保留作为参考）：<img :src="tagGraph" alt="涌现图：标签之间自动涌现的关联网络" class="block w-full pt-11" /> -->
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
          <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11.5px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">关键词图 · Keyword Graph</span>
          <!-- 原始实现（保留作为参考）：<img :src="keywordGraph" alt="关键词图：被一个词激活的联想网络" class="block w-full pt-11" /> -->
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
            <h3 class="text-[17px] font-semibold mb-2">{{ c.title }}</h3>
            <p class="text-[14.5px] text-apple-gray-500 dark:text-apple-gray-400 leading-relaxed">{{ c.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 03 可见的思考 -->
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
              <span class="ml-2 text-[12.5px] text-apple-gray-400">需求理解确认</span>
            </div>
            <div class="p-6">
              <p class="text-[15px] leading-relaxed">你好像想说的是：为一个「周末两天的北京行程」做规划，且只考虑室内外兼顾。是这个意思吗？</p>
              <div class="flex gap-2.5 mt-5 flex-wrap">
                <span class="px-3.5 py-1.5 rounded-lg bg-brian-blue text-white text-[13px] font-medium">按理解执行</span>
                <span class="px-3.5 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-[13px]">按原文执行</span>
                <span class="px-3.5 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-[13px]">取消</span>
              </div>
              <p class="mt-5 text-[13px] text-apple-gray-400">匹配度 0.62 / 阈值 0.75 · 判断依据：问题过于宽泛，缺少时间与范围约束</p>
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
            <p v-reveal class="mt-6 text-[15.5px] font-semibold leading-relaxed">
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
              <span class="ml-2 text-[12.5px] text-apple-gray-400">思考过程 · 执行时间线</span>
            </div>
            <div class="p-6">
              <div class="grid grid-cols-4 gap-3 mb-6">
                <div v-for="o in timelineOverview" :key="o.label" class="text-center py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/70">
                  <b class="block text-[17px] tabular-nums">{{ o.value }}</b>
                  <span class="text-[11.5px] text-apple-gray-400">{{ o.label }}</span>
                </div>
              </div>
              <div ref="timelineEl" class="space-y-2.5">
                <div
                  v-for="(s, i) in timelineSteps" :key="s.label"
                  class="home-step" :class="{ on: i < timelineActive }"
                >
                  {{ s.label }}<span class="ml-auto text-[12px] tabular-nums text-apple-gray-400">{{ s.time }}</span>
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

    <!-- 04 第二大脑 -->
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
            <h3 class="text-[17px] font-semibold mb-2">{{ c.title }}</h3>
            <p class="text-[14.5px] text-apple-gray-500 dark:text-apple-gray-400 leading-relaxed">{{ c.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 05 数据归属 -->
    <section id="privacy" class="scroll-mt-28 py-20 relative z-10">
      <div class="home-wrap">
        <p v-reveal class="home-eyebrow">05 · 数据归属</p>
        <h2 v-reveal="'80ms'" class="home-h2">也是最硬的一点：<em class="home-em">你的数据，从头到尾都在你手里</em></h2>

        <div class="grid md:grid-cols-2 gap-5 mt-10">
          <div v-for="(c, i) in privacyCards" :key="c.title" v-reveal="i * 60 + 'ms'" class="block-card p-6 hover:-translate-y-1.5 hover:shadow-lg transition-all duration-300">
            <div class="w-10 h-10 rounded-xl bg-success-green/10 grid place-items-center mb-4">
              <component :is="c.icon" :size="20" class="text-success-green" />
            </div>
            <h3 class="text-[17px] font-semibold mb-2">{{ c.title }}</h3>
            <p class="text-[14.5px] text-apple-gray-500 dark:text-apple-gray-400 leading-relaxed">{{ c.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 现在就试 -->
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
              <span class="ml-2 text-[12.5px] text-apple-gray-400">bash</span>
            </div>
            <pre class="px-6 py-6 font-mono text-[13.5px] leading-[1.9] whitespace-pre-wrap min-h-[150px]" v-html="rendered"></pre>
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

    <!-- 对比 -->
    <section id="compare" class="scroll-mt-28 pt-4 pb-20 relative z-10">
      <div class="home-wrap">
        <p v-reveal class="home-eyebrow">一张表看懂</p>
        <h2 v-reveal="'80ms'" class="home-h2">它和「套壳聊天」的差距</h2>
        <div v-reveal="'160ms'" class="block-card mt-10 overflow-x-auto">
          <table class="w-full text-[14.5px]">
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

    <!-- 交流群 -->
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
            <h3 class="mt-5 text-[17px] font-semibold">QQ 群</h3>
            <button
              class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-[14px] hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
              :title="qqCopied ? '已复制' : '点击复制群号'"
              @click="copyQqGroup"
            >
              群号 <b class="font-mono text-[15px] tracking-wider text-brian-blue">{{ QQ_GROUP }}</b>
              <Check v-if="qqCopied" :size="14" class="text-success-green" />
              <Copy v-else :size="14" class="text-apple-gray-400" />
            </button>
            <p class="mt-2.5 text-[12.5px] text-apple-gray-400">扫码加入，或 QQ 搜索群号</p>
          </div>

          <div v-reveal="'90ms'" class="block-card p-7 hover:-translate-y-1.5 hover:shadow-lg transition-all duration-300">
            <div class="w-52 h-52 mx-auto p-2.5 rounded-2xl bg-white border border-apple-gray-200 shadow-md">
              <img :src="qrWechat" alt="微信群二维码：Brian Agent" class="w-full h-full object-contain rounded-lg" loading="lazy" />
            </div>
            <h3 class="mt-5 text-[17px] font-semibold">微信群</h3>
            <p class="mt-2 text-[14px] inline-flex items-center gap-1.5 text-apple-gray-500 dark:text-apple-gray-400">
              <MessageCircle :size="15" /> 微信扫一扫，直接进群
            </p>
            <p class="mt-2.5 text-[12.5px] text-apple-gray-400">群满时可先加 QQ 群备用</p>
          </div>
        </div>
      </div>
    </section>

    <footer class="border-t border-apple-gray-200 dark:border-apple-gray-700 py-12 text-center text-[13.5px] text-apple-gray-400 relative z-10">
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

/* 记忆地图示意：圆帽点状虚线（引用）+ 实线（上下文延续），锚点由 edgePath 几何生成 */
.home-mline { fill: none; stroke: rgba(0, 122, 255, 0.42); stroke-width: 1.4; stroke-linecap: round; stroke-dasharray: 0.1 6.9; opacity: 0; transition: 0.3s; }
.home-mline.solid { stroke: rgba(0, 122, 255, 0.62); stroke-dasharray: none; }
.home-map-drawn .home-mline:not(.solid) { opacity: 1; transition: opacity 0.8s ease; animation: home-flow 1.8s linear infinite; }
.home-map-drawn .home-mline.solid { opacity: 1; stroke-dasharray: 600; stroke-dashoffset: 600; animation: home-draw 1.4s ease forwards; }
.home-pulse { fill: #4DA3FF; }
.home-mnode { fill: #F5F5F7; stroke: #D1D1D6; stroke-width: 1.2; transition: 0.3s; }
.dark .home-mnode { fill: #2C2C2E; stroke: #3A3A3C; }
.home-mnode.hot { stroke: #007AFF; fill: rgba(0, 122, 255, 0.08); filter: drop-shadow(0 0 10px rgba(0, 122, 255, 0.45)); }
.home-mline.hot { stroke: #AF52DE; stroke-width: 2.2; stroke-dasharray: none; filter: drop-shadow(0 0 5px rgba(175, 82, 222, 0.7)); }
.home-mtxt { fill: #3A3A3C; font-size: 12.5px; font-family: inherit; pointer-events: none; }
.dark .home-mtxt { fill: #C7C7CC; }
.home-mtxt.dim { fill: #8E8E93; font-size: 11px; }
.home-pin { fill: #FF9500; animation: home-pulse 2s infinite; }
.home-legend-dot { display: inline-block; width: 16px; height: 0; border-top: 2px solid; vertical-align: middle; margin-right: 6px; }

/* 思考时间线 */
.home-step { display: flex; align-items: center; padding: 10px 14px; border-radius: 10px; border: 1px solid transparent; font-size: 14px; opacity: 0.35; transition: 0.4s; }
.home-step.on { opacity: 1; border-color: rgba(0, 122, 255, 0.35); background: rgba(0, 122, 255, 0.06); }

/* 终端 */
.home-term { border-radius: 16px; overflow: hidden; border: 1px solid #3A3A3C; background: #060910; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45); }
.home-term pre { margin: 0; color: #CFE0FF; }
.home-term :deep(.cmd) { color: #34C759; }
.home-term :deep(.cur) { display: inline-block; width: 8px; height: 15px; background: #32ADE6; vertical-align: -3px; animation: home-blink 1s steps(1) infinite; }

/* 渐显 */
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
