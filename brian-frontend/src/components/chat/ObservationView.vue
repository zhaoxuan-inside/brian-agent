<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Brain, Wrench, ShieldCheck, Clock3, Layers, Copy, Check, ChevronDown, ExternalLink,
} from '@lucide/vue'
import { useObservationPresentation, KIND_BADGE, type UsageBarSegment } from '@/composables/useObservationPresentation'
import { useChatUiStore } from '@/stores/chatUi'
import { answerPermission } from '@/api'
import { formatDuration, formatTokens, formatClock, formatStepDuration } from '@/utils/format'
import { instanceRoute, type InstanceKind } from '@/utils/instanceRoute'
import { observationToneOf, type ObservationTone } from '@/composables/observationPhase'
import type { TimelinePoint } from '@brian-agent/shared'

/**
 * 思考弹窗主体（ADR-013）：实时与历史共用本视图。
 * 数据唯一来源 = chatUi.observation（shared reducer 投影）；无任何本地合成分析。
 */
const { sections } = useObservationPresentation()
const chatUi = useChatUiStore()
const router = useRouter()

const activeTab = ref<'timeline' | 'thinking' | 'context' | 'tools' | 'trust'>('thinking')
const TABS = [
  { key: 'thinking', label: '思考流' },
  { key: 'timeline', label: '时间线' },
  { key: 'context', label: '上下文' },
  { key: 'tools', label: '技能调用' },
  { key: 'trust', label: '可信度' },
] as const

const permittingId = ref<string | null>(null)
const copiedKey = ref('')
const expandedTools = ref<Set<string>>(new Set())

const isStreaming = computed(() => chatUi.isLive || chatUi.overallStreaming)

const TONE_CHIP: Record<ObservationTone, string> = {
  live: '',
  success: 'obs-chip--ok',
  error: 'obs-chip--danger',
  warning: 'obs-chip--warn',
}
const phaseChipClass = computed(() => TONE_CHIP[observationToneOf(chatUi.observation, isStreaming.value)])
const usageLegend = computed<UsageBarSegment[]>(() =>
  (sections.value.usageBars.find((b) => b.key === 'duration') ?? sections.value.usageBars[0])?.segments ?? [])

const TAB_BADGES = computed(() => ({
  thinking: sections.value.thinkRounds.length,
  timeline: sections.value.timeline.length,
  context: sections.value.contextRounds.length,
  tools: sections.value.tools.length,
  trust: sections.value.agentMatch.length + sections.value.componentFunnels.length,
}))

async function copyText(key: string, text: string) {
  if (!text) return
  const ok = await navigator.clipboard.writeText(text).then(() => true).catch(() => false)
  if (ok) {
    copiedKey.value = key
    setTimeout(() => (copiedKey.value = ''), 1500)
  }
}

function toggleTool(partId: string) {
  const next = new Set(expandedTools.value)
  if (next.has(partId)) next.delete(partId)
  else next.add(partId)
  expandedTools.value = next
}

async function confirmPermission(permissionId: string, approved: boolean) {
  if (!permissionId || permittingId.value) return
  permittingId.value = permissionId
  try {
    await answerPermission(permissionId, approved, false)
  } catch { /* 保持待授权 */ } finally {
    permittingId.value = null
  }
}

function badgeTone(kind: string): string {
  return KIND_BADGE[kind] ?? '灰'
}

function fmtElapsed(ms?: number): string {
  return ms !== undefined ? formatDuration(ms) : ''
}

// ── 时间线明细展开 ────────────────────────────────────────────

const expandedPoints = ref<Set<number>>(new Set())
const memTabIndex = ref<Record<number, number>>({})
const assemblyTabIndex = ref<Record<number, string>>({})

/** 时间线第 0 轮记忆维度全集（无召回的维度也要展示） */
const MEMORY_DIMENSIONS: Array<{ source: string; label: string }> = [
  { source: 'SELECTED', label: '勾选消息' },
  { source: 'PINNED', label: '置顶消息' },
  { source: 'CITING', label: '引用消息' },
  { source: 'TIMELINE', label: '时间线消息' },
  { source: 'TAG_RELATIVE', label: '标签关联' },
  { source: 'SIMILARITY', label: '相似记忆' },
  { source: 'KEYWORD', label: '关键词记忆' },
  { source: 'RANDOM', label: '随机召回' },
]

function togglePoint(seq: number) {
  const next = new Set(expandedPoints.value)
  if (next.has(seq)) next.delete(seq)
  else next.add(seq)
  expandedPoints.value = next
}

function pointContextRound(point: TimelinePoint) {
  const m = /^ctx-(main|writer|eval)-(\d+)$/.exec(point.target)
  if (!m) return undefined
  const stage = m[1] === 'main' ? undefined : (m[1] as 'writer' | 'eval')
  return sections.value.contextRounds.find((r) => r.round === Number(m[2]) && r.stage === stage)
}

interface InstanceChip { kind: InstanceKind; name: string; id?: string; system?: boolean }

function chipsOf(point: TimelinePoint): InstanceChip[] {
  const chips: InstanceChip[] = []
  if (point.agentId || point.agentName) chips.push({ kind: 'agent', name: point.agentName || point.agentId || '', id: point.agentId })
  if (point.llmId || point.llmName) chips.push({ kind: 'llm', name: point.llmName || point.llmId || '', id: point.llmId })
  if (point.promptId || point.promptName) chips.push({ kind: 'prompt', name: point.promptName || point.promptId || '', id: point.promptId })
  if (point.soulId || point.soulName) chips.push({ kind: 'soul', name: point.soulName || point.soulId || '', id: point.soulId })
  for (const s of point.skills ?? []) chips.push({ kind: 'skill', name: s.name || s.id, id: s.id, system: s.system })
  for (const m of point.mcps ?? []) chips.push({ kind: 'mcp', name: m.name || m.id, id: m.id })
  return chips
}

const ASSEMBLY_TABS: Array<{ key: InstanceKind; label: string }> = [
  { key: 'llm', label: 'LLM' }, { key: 'soul', label: 'Soul' }, { key: 'prompt', label: 'Prompt' },
  { key: 'skill', label: 'Skill' }, { key: 'mcp', label: 'MCP' },
]

function assemblyChipsOf(point: TimelinePoint, key: InstanceKind): InstanceChip[] {
  return chipsOf(point).filter((c) => c.kind === key)
}

function gotoInstance(kind: InstanceKind, id?: string) {
  if (!id) return
  chatUi.closeThinkingModal()
  router.push(instanceRoute(kind, id))
}

function memTabsOf(point: TimelinePoint): Array<{ source: string; label: string; count: number }> {
  const countOf = (source: string): number =>
    (point.memorySources ?? []).find((x) => x.source === source)?.count ?? 0
  const isBaseMemoryRound = point.type === 'context.built' && point.target === 'ctx-main-0'
  const present = new Set<string>([
    ...(point.memorySources ?? []).map((s) => s.source),
    ...(point.memoryItems ?? []).map((s) => s.source),
  ])
  // 第 0 轮记忆召回恒展示全部维度（含未召回的空维度）
  return (isBaseMemoryRound ? MEMORY_DIMENSIONS.map((d) => d.source) : [...present])
    .filter((source) => isBaseMemoryRound || present.has(source))
    .map((source) => {
      const dim = MEMORY_DIMENSIONS.find((d) => d.source === source)
      return { source, label: dim?.label ?? source, count: countOf(source) }
    })
}

function memTabIndexOf(point: TimelinePoint): number {
  const idx = memTabIndex.value[point.seq] ?? 0
  return Math.min(idx, Math.max(0, memTabsOf(point).length - 1))
}

function setMemTab(point: TimelinePoint, index: number) {
  memTabIndex.value = { ...memTabIndex.value, [point.seq]: index }
}

function memEntriesOf(point: TimelinePoint, index: number): Array<{ id?: string; text: string }> {
  const tab = memTabsOf(point)[index]
  if (!tab) return []
  return (point.memoryItems ?? []).find((x) => x.source === tab.source)?.entries ?? []
}

function hasPointDetail(point: TimelinePoint): boolean {
  return Boolean(
    point.memorySources?.length || point.memoryItems?.length || point.llmDetail
    || chipsOf(point).length > 0 || (point.kind === 'context' && !!pointContextRound(point))
    || (point.type === 'context.built' && point.target === 'ctx-main-0'),
  )
}
</script>

<template>
  <div class="observation flex flex-col min-h-0 flex-1">
    <!-- 摘要 chips -->
    <div class="obs-summary flex flex-wrap items-center gap-1.5 px-5 pt-3 pb-2">
      <span class="obs-chip" :class="phaseChipClass">{{ sections.phaseLabel }}</span>
      <span v-for="chip in sections.summaryChips" :key="chip.label" class="obs-chip obs-chip--muted">
        {{ chip.label }} {{ chip.value }}
      </span>
    </div>

    <!-- 用量分布条：token / 耗时（按阶段 caller 归组，悬停看明细） -->
    <div v-if="sections.usageBars.length" class="px-5 pb-3 space-y-1.5">
      <div v-for="bar in sections.usageBars" :key="bar.key" class="flex items-center gap-2">
        <span class="w-8 text-right text-2xs text-chat-ink-tertiary flex-shrink-0">{{ bar.name }}</span>
        <div class="flex-1 h-1.5 rounded-full overflow-hidden flex bg-chat-surface-2">
          <span
            v-for="(seg, i) in bar.segments"
            :key="i"
            class="h-full"
            :style="{ width: `${seg.pct}%`, background: seg.color }"
            :title="seg.title"
          />
        </div>
      </div>
      <div v-if="usageLegend.length" class="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-10">
        <span
          v-for="item in usageLegend"
          :key="item.label"
          class="inline-flex items-center gap-1 text-2xs text-chat-ink-subtle"
          :title="item.title"
        >
          <i class="w-1.5 h-1.5 rounded-full inline-block" :style="{ background: item.color }" />{{ item.label }}
        </span>
      </div>
    </div>

    <!-- Tab 导航 -->
    <div class="obs-tabs flex items-center gap-1 px-5 pb-2 border-b border-chat-hairline">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="obs-tab"
        :class="{ 'obs-tab--active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span v-if="TAB_BADGES[tab.key]" class="obs-tab-badge">{{ TAB_BADGES[tab.key] }}</span>
      </button>
    </div>

    <div class="obs-body flex-1 overflow-y-auto px-5 py-4 space-y-3">
      <!-- 待授权常驻卡 -->
      <section v-if="sections.pendingPermissions.length" class="obs-card obs-card--accent">
        <div class="obs-card-head">
          <ShieldCheck :size="14" class="text-chat-primary-hover" />
          <span class="obs-card-title">等待授权（{{ sections.pendingPermissions.length }}）</span>
        </div>
        <div v-for="p in sections.pendingPermissions" :key="p.permissionId" class="obs-perm">
          <div class="flex items-center gap-2 min-w-0">
            <span class="obs-mono truncate">{{ p.toolId }}</span>
            <span class="obs-chip obs-chip--accent">待确认</span>
          </div>
          <pre class="obs-pre">{{ JSON.stringify(p.input ?? {}, null, 2) }}</pre>
          <div class="flex justify-end gap-2 mt-2">
            <button class="obs-btn obs-btn--danger" :disabled="permittingId === p.permissionId" @click="confirmPermission(p.permissionId, false)">拒绝</button>
            <button class="obs-btn obs-btn--primary" :disabled="permittingId === p.permissionId" @click="confirmPermission(p.permissionId, true)">允许</button>
          </div>
        </div>
      </section>

      <!-- 空态 -->
      <section v-if="sections.empty && !isStreaming" class="obs-empty">
        <Brain :size="22" class="text-chat-hairline-strong" />
        <p class="text-xs text-chat-ink-subtle">暂无过程数据</p>
      </section>

      <!-- 思考流 -->
      <template v-if="activeTab === 'thinking'">
        <section v-for="round in sections.thinkRounds" :key="round.round" class="obs-card">
          <div class="obs-card-head">
            <Brain :size="14" class="text-chat-primary-hover" />
            <span class="obs-card-title">第 {{ round.round }} 轮思考</span>
            <span class="obs-chip obs-chip--muted">{{ round.thoughtMode || 'CoT' }}</span>
            <span class="ml-auto text-2xs text-chat-ink-tertiary flex items-center gap-1">
              <Clock3 :size="11" />{{ round.durationText }}
            </span>
          </div>
          <div class="obs-markdown" v-html="round.html" />
        </section>
        <section v-if="!sections.thinkRounds.length" class="obs-empty">
          <p class="text-xs text-chat-ink-tertiary">{{ isStreaming ? '等待模型输出…' : '本次执行无思考流文本' }}</p>
        </section>
      </template>

      <!-- 时间线 -->
      <template v-if="activeTab === 'timeline'">
        <section class="obs-card">
          <div class="obs-timeline">
            <div v-for="point in sections.timeline" :key="point.seq" class="obs-timeline-item">
              <span class="obs-dot" :class="`obs-dot--${badgeTone(point.kind)}`" />
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <span class="obs-ts">{{ formatClock(point.ts) }}</span>
                  <span class="text-xs font-medium text-chat-ink">{{ point.title }}</span>
                  <span v-if="point.elapsedMs !== undefined" class="obs-dur">{{ formatStepDuration(point.elapsedMs) }}</span>
                </div>
                <p v-if="point.reason" class="obs-reason">{{ point.reason }}</p>
                <p v-if="point.detail" class="text-2xs text-chat-ink-subtle truncate">{{ point.detail }}</p>

                <template v-if="expandedPoints.has(point.seq)">
                  <!-- 第 0 轮：记忆召回维度 tab（无召回维度也展示） -->
                  <div v-if="memTabsOf(point).length" class="obs-sub">
                    <div class="obs-subtabs">
                      <button
                        v-for="(tab, i) in memTabsOf(point)" :key="tab.source" class="obs-subtab"
                        :class="{ 'obs-subtab--active': memTabIndexOf(point) === i }" @click="setMemTab(point, i)"
                      >
                        {{ tab.label }}<span class="obs-subtab-count">{{ tab.count }}</span>
                      </button>
                    </div>
                    <div class="obs-mem-list">
                      <template v-if="memEntriesOf(point, memTabIndexOf(point)).length">
                        <p v-for="(e, i) in memEntriesOf(point, memTabIndexOf(point))" :key="i" class="obs-mem-entry">{{ e.text }}</p>
                      </template>
                      <p v-else class="obs-mem-empty">该维度本轮未召回</p>
                    </div>
                  </div>

                  <!-- 组件装配完成：五类组件 tab -->
                  <div v-if="point.type === 'agent.components' && expandedPoints.has(point.seq)" class="obs-sub">
                    <div class="obs-subtabs">
                      <button
                        v-for="t in ASSEMBLY_TABS" :key="t.key" class="obs-subtab"
                        :class="{ 'obs-subtab--active': (assemblyTabIndex[point.seq] ?? 'llm') === t.key }"
                        @click="assemblyTabIndex = { ...assemblyTabIndex, [point.seq]: t.key }"
                      >
                        {{ t.label }}<span class="obs-subtab-count">{{ assemblyChipsOf(point, t.key).length }}</span>
                      </button>
                    </div>
                    <div class="obs-chips">
                      <template v-if="assemblyChipsOf(point, (assemblyTabIndex[point.seq] ?? 'llm') as InstanceKind).length">
                        <button
                          v-for="c in assemblyChipsOf(point, (assemblyTabIndex[point.seq] ?? 'llm') as InstanceKind)" :key="c.kind + c.id"
                          class="obs-chip obs-chip--link" :title="`查看${c.name}`" @click="gotoInstance(c.kind, c.id)"
                        >
                          {{ c.name }}<ExternalLink :size="10" />
                        </button>
                      </template>
                      <p v-else class="obs-mem-empty">未选中</p>
                    </div>
                  </div>

                  <!-- 单实例选举步骤：实例 chips（点击跳转） -->
                  <div v-else-if="point.type !== 'agent.components' && chipsOf(point).length" class="obs-chips">
                    <button
                      v-for="c in chipsOf(point)" :key="c.kind + c.id" class="obs-chip obs-chip--link"
                      :title="`查看${c.name}`" @click="gotoInstance(c.kind, c.id)"
                    >
                      <span v-if="c.system" class="obs-sys-badge">系统</span>{{ c.name }}<ExternalLink :size="10" />
                    </button>
                  </div>

                  <!-- 模型调用明细 -->
                  <div v-if="point.llmDetail" class="obs-sub obs-kv">
                    <span class="obs-kv-row">首Token时间 <b>{{ formatStepDuration(point.llmDetail.ttftMs) || '—' }}</b></span>
                    <span class="obs-kv-row">Thinking耗时 <b>{{ point.llmDetail.thinkingMs !== undefined ? formatStepDuration(point.llmDetail.thinkingMs) : '—' }}</b></span>
                    <span class="obs-kv-row">Response耗时 <b>{{ point.llmDetail.responseMs !== undefined ? formatStepDuration(point.llmDetail.responseMs) : '—' }}</b></span>
                    <span class="obs-kv-row">输入Token <b>{{ formatTokens(point.llmDetail.tokensIn) }}</b></span>
                    <span class="obs-kv-row">输出Token <b>{{ formatTokens(point.llmDetail.tokensOut) }}</b></span>
                    <pre v-if="point.llmDetail.output" class="obs-pre obs-pre--output">{{ point.llmDetail.output }}</pre>
                  </div>

                  <!-- 上下文构建：消息列表 -->
                  <div v-if="point.kind === 'context' && pointContextRound(point)" class="obs-sub">
                    <p v-if="pointContextRound(point)?.system" class="obs-mem-entry obs-mem-entry--sys">{{ pointContextRound(point)?.system }}</p>
                    <div class="space-y-1">
                      <div v-for="(m, i) in (pointContextRound(point)?.messages ?? []).slice(0, 12)" :key="i" class="obs-msg">
                        <span class="obs-msg-role">{{ m.role }}</span>
                        <span class="obs-msg-content">{{ m.content.slice(0, 300) }}{{ m.content.length > 300 ? '…' : '' }}</span>
                      </div>
                    </div>
                  </div>
                </template>

                <button v-if="hasPointDetail(point)" class="obs-expand" @click="togglePoint(point.seq)">
                  <ChevronDown :size="11" class="transition-transform" :class="{ 'rotate-180': expandedPoints.has(point.seq) }" />
                  {{ expandedPoints.has(point.seq) ? '收起明细' : '展开明细' }}
                </button>
              </div>
            </div>
          </div>
        </section>
      </template>

      <!-- 上下文装配 -->
      <template v-if="activeTab === 'context'">
        <section v-for="round in sections.contextRounds" :key="round.round" class="obs-card">
          <div class="obs-card-head">
            <Layers :size="14" class="text-chat-primary-hover" />
            <span class="obs-card-title">第 {{ round.round }} 轮上下文</span>
            <span class="obs-chip obs-chip--muted">{{ round.messageCount }} 条</span>
          </div>
          <p v-if="round.sourceText" class="text-2xs text-chat-ink-subtle mb-2">来源：{{ round.sourceText }}</p>
          <div class="space-y-1">
            <div v-for="(m, i) in round.messages.slice(0, 12)" :key="i" class="obs-msg">
              <span class="obs-msg-role">{{ m.role }}</span>
              <span class="obs-msg-content">{{ m.content.slice(0, 300) }}{{ m.content.length > 300 ? '…' : '' }}</span>
            </div>
          </div>
        </section>
        <section v-if="!sections.contextRounds.length" class="obs-empty">
          <p class="text-xs text-chat-ink-tertiary">暂无上下文装配记录</p>
        </section>
      </template>

      <!-- 技能调用 -->
      <template v-if="activeTab === 'tools'">
        <section v-for="tool in sections.tools" :key="tool.partId" class="obs-card">
          <div class="obs-card-head cursor-pointer" @click="toggleTool(tool.partId)">
            <Wrench :size="14" :class="tool.status === 'ok' ? 'text-chat-success' : tool.status === 'error' ? 'text-chat-error' : 'text-chat-primary-hover'" />
            <span class="obs-card-title obs-mono">{{ tool.name || tool.toolId }}</span>
            <span class="obs-chip" :class="tool.status === 'ok' ? 'obs-chip--ok' : tool.status === 'error' ? 'obs-chip--danger' : 'obs-chip--accent'">
              {{ tool.statusText }}
            </span>
            <span v-if="tool.elapsedMs" class="text-2xs text-chat-ink-tertiary">{{ fmtElapsed(tool.elapsedMs) }}</span>
            <ChevronDown :size="13" class="ml-auto text-chat-ink-tertiary transition-transform" :class="{ 'rotate-180': expandedTools.has(tool.partId) }" />
          </div>
          <template v-if="expandedTools.has(tool.partId)">
            <pre v-if="tool.paramsText" class="obs-pre">{{ tool.paramsText }}</pre>
            <pre v-if="tool.outputText" class="obs-pre obs-pre--output">{{ tool.outputText }}</pre>
          </template>
        </section>
        <section v-if="!sections.tools.length" class="obs-empty">
          <p class="text-xs text-chat-ink-tertiary">本次执行未调用技能</p>
        </section>
      </template>

      <!-- 可信度：Agent 匹配选举 + 组件选举 + 画像 + 子任务汇聚 -->
      <template v-if="activeTab === 'trust'">
        <section v-if="sections.agentMatch.length" class="obs-card">
          <div class="obs-card-head">
            <Brain :size="14" class="text-chat-primary-hover" />
            <span class="obs-card-title">Agent 匹配选举</span>
          </div>
          <div v-for="(mech, i) in sections.agentMatch" :key="i" class="obs-mech">
            <span class="obs-chip" :class="mech.adopted ? 'obs-chip--ok' : 'obs-chip--muted'">{{ mech.mechanism }}</span>
            <span v-if="mech.label" class="text-2xs text-chat-ink-tertiary">{{ mech.label }}</span>
            <span class="text-2xs text-chat-ink-subtle ml-auto">{{ mech.candidates.length }} 候选</span>
          </div>
        </section>

        <section v-for="funnel in sections.componentFunnels" :key="funnel.component" class="obs-card">
          <div class="obs-card-head">
            <Layers :size="14" class="text-chat-primary-hover" />
            <span class="obs-card-title">{{ funnel.component }} 选举明细</span>
          </div>
          <div v-for="(mech, i) in funnel.mechanisms" :key="i" class="obs-mech">
            <span class="obs-chip" :class="mech.adopted ? 'obs-chip--ok' : 'obs-chip--muted'">{{ mech.mechanism }}</span>
            <span class="text-2xs text-chat-ink-subtle truncate">{{ mech.candidates.map((c) => c.name || c.id).slice(0, 4).join('、') }}</span>
          </div>
        </section>

        <section v-if="sections.profile" class="obs-card">
          <div class="obs-card-head">
            <Brain :size="14" class="text-chat-primary-hover" />
            <span class="obs-card-title">用户画像快照</span>
            <span v-if="sections.profile.version" class="obs-chip obs-chip--muted">v{{ sections.profile.version }}</span>
          </div>
          <p class="text-2xs text-chat-ink-subtle">{{ sections.profile.summary }}</p>
        </section>

        <section v-if="sections.mergeChildren.length" class="obs-card">
          <div class="obs-card-head">
            <Layers :size="14" class="text-chat-primary-hover" />
            <span class="obs-card-title">子任务汇聚（{{ sections.mergeChildren.length }}）</span>
          </div>
          <div v-for="child in sections.mergeChildren" :key="child.subRunId" class="obs-mech">
            <span class="text-xs font-medium text-chat-ink">{{ child.agentName }}</span>
            <span class="text-2xs text-chat-ink-subtle truncate">{{ child.task.slice(0, 80) }}</span>
          </div>
        </section>

        <section v-if="!sections.agentMatch.length && !sections.componentFunnels.length && !sections.profile && !sections.mergeChildren.length" class="obs-empty">
          <p class="text-xs text-chat-ink-tertiary">暂无选举与画像数据</p>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Claude 主题调色(ADR-015):本视图仅渲染在 ThinkingModal(theme-chat 作用域)内,
   取值全部走 --chat-* 令牌变量,随明暗开关双模式切换。 */
.observation {
  min-height: 0;
}
.obs-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 500;
  background: rgb(var(--chat-primary) / 0.12);
  color: rgb(var(--chat-primary-hover));
}
.obs-chip--live { animation: obs-pulse 1.6s ease-in-out infinite; }
.obs-chip--muted { background: rgb(var(--chat-ink-subtle) / 0.12); color: rgb(var(--chat-ink-subtle)); }
.obs-chip--accent { background: rgb(var(--chat-primary) / 0.18); }
.obs-chip--ok { background: rgb(var(--chat-success) / 0.14); color: rgb(var(--chat-success)); }
.obs-chip--danger { background: rgb(var(--chat-error) / 0.14); color: rgb(var(--chat-error)); }
.obs-chip--warn { background: rgb(var(--chat-warning) / 0.14); color: rgb(var(--chat-warning)); }
@keyframes obs-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
.obs-tabs { gap: 4px; }
.obs-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 6px 6px 0 0;
  font-size: 11px;
  color: rgb(var(--chat-ink-subtle));
  border-bottom: 2px solid transparent;
}
.obs-tab--active {
  color: rgb(var(--chat-ink));
  border-bottom-color: rgb(var(--chat-primary));
}
.obs-tab-badge {
  font-size: 9px;
  padding: 0 5px;
  border-radius: 9999px;
  background: rgb(var(--chat-ink-subtle) / 0.15);
}
.obs-card {
  border-radius: 8px;
  border: 1px solid rgb(var(--chat-hairline));
  background: rgb(var(--chat-surface-2));
  padding: 12px 14px;
}
.obs-card--accent { border-color: rgb(var(--chat-primary) / 0.4); }
.obs-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.obs-card-title { font-size: 12px; font-weight: 600; color: rgb(var(--chat-ink)); }
.obs-pre {
  margin-top: 8px;
  font-size: 10px;
  line-height: 1.6;
  font-family: ui-monospace, monospace;
  background: rgb(var(--chat-canvas));
  border: 1px solid rgb(var(--chat-hairline));
  border-radius: 6px;
  padding: 10px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: rgb(var(--chat-ink-muted));
}
.obs-pre--output { max-height: 260px; overflow-y: auto; }
.obs-btn {
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 11px;
  transition: background 0.15s;
}
.obs-btn--danger { color: rgb(var(--chat-error)); }
.obs-btn--danger:hover { background: rgb(var(--chat-error) / 0.1); }
.obs-btn--primary { color: rgb(var(--chat-on-primary)); background: rgb(var(--chat-primary)); }
.obs-btn--primary:hover { background: rgb(var(--chat-primary-hover)); }
.obs-btn--primary:disabled { opacity: 0.5; }
.obs-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
}
.obs-timeline { display: flex; flex-direction: column; gap: 10px; }
.obs-timeline-item { display: flex; align-items: flex-start; gap: 10px; }
.obs-dot {
  width: 8px; height: 8px;
  border-radius: 9999px;
  margin-top: 5px;
  flex-shrink: 0;
  background: rgb(var(--chat-ink-tertiary));
}
.obs-dot--绿 { background: rgb(var(--chat-success)); }
.obs-dot--红 { background: rgb(var(--chat-error)); }
.obs-dot--蓝 { background: rgb(var(--chat-primary)); }
.obs-dot--紫 { background: rgb(var(--chat-primary-hover)); }
.obs-dot--橙 { background: rgb(var(--chat-warning)); }
.obs-mono { font-family: ui-monospace, monospace; font-size: 11px; }
.obs-msg {
  display: flex; gap: 8px;
  font-size: 10px;
  line-height: 1.5;
  padding: 4px 6px;
  border-radius: 6px;
  background: rgb(var(--chat-canvas) / 0.7);
  border: 1px solid rgb(var(--chat-hairline));
}
.obs-msg-role {
  flex-shrink: 0;
  font-family: ui-monospace, monospace;
  color: rgb(var(--chat-primary-hover));
}
.obs-msg-content { color: rgb(var(--chat-ink-subtle)); word-break: break-all; }
.obs-ts {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  color: rgb(var(--chat-ink-tertiary));
  flex-shrink: 0;
}
.obs-dur {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  color: rgb(var(--chat-ink-subtle));
  background: rgb(var(--chat-ink-subtle) / 0.08);
  border-radius: 4px;
  padding: 0 5px;
}
.obs-reason {
  font-size: 10px;
  line-height: 1.5;
  color: rgb(var(--chat-primary-hover));
  margin-top: 2px;
}
.obs-expand {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 5px;
  font-size: 10px;
  color: rgb(var(--chat-ink-tertiary));
}
.obs-expand:hover { color: rgb(var(--chat-primary-hover)); }
.obs-sub { margin-top: 8px; }
.obs-subtabs { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px; }
.obs-subtab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 10px;
  color: rgb(var(--chat-ink-subtle));
  background: rgb(var(--chat-canvas));
  border: 1px solid rgb(var(--chat-hairline));
}
.obs-subtab--active {
  color: rgb(var(--chat-on-primary));
  background: rgb(var(--chat-primary));
  border-color: rgb(var(--chat-primary));
}
.obs-subtab-count {
  font-family: ui-monospace, monospace;
  font-size: 9px;
  opacity: 0.75;
}
.obs-mem-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid rgb(var(--chat-hairline));
  border-radius: 6px;
  background: rgb(var(--chat-canvas) / 0.7);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.obs-mem-entry {
  font-size: 10px;
  line-height: 1.55;
  color: rgb(var(--chat-ink-muted));
  word-break: break-all;
  white-space: pre-wrap;
}
.obs-mem-entry--sys { color: rgb(var(--chat-ink-subtle)); }
.obs-mem-empty { font-size: 10px; color: rgb(var(--chat-ink-tertiary)); padding: 4px 0; }
.obs-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.obs-chip--link {
  cursor: pointer;
  gap: 4px;
  background: rgb(var(--chat-primary) / 0.1);
  color: rgb(var(--chat-primary-hover));
  border: 1px solid rgb(var(--chat-primary) / 0.25);
}
.obs-chip--link:hover { background: rgb(var(--chat-primary) / 0.2); }
.obs-sys-badge {
  font-size: 9px;
  padding: 0 4px;
  border-radius: 3px;
  background: rgb(var(--chat-warning) / 0.18);
  color: rgb(var(--chat-warning));
}
.obs-kv { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.obs-kv-row { font-size: 10px; color: rgb(var(--chat-ink-subtle)); }
.obs-kv-row b { color: rgb(var(--chat-ink)); font-family: ui-monospace, monospace; font-weight: 500; }
.obs-mech {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0;
}
.obs-perm {
  border: 1px solid rgb(var(--chat-hairline));
  border-radius: 8px;
  padding: 10px;
  margin-top: 8px;
}
.obs-markdown {
  font-size: 12px;
  line-height: 1.7;
  color: rgb(var(--chat-ink-muted));
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
}
</style>
