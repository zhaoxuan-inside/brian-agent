<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Database,
  UserRound,
  MessagesSquare,
  History,
  BrainCircuit,
  ShieldCheck,
  Pin,
  Clock,
  Sparkles,
  Tag,
  Key,
  Shuffle,
  ListOrdered,
  CheckSquare,
  ChevronRight
} from '@lucide/vue'
import type { ThinkingBlock } from '@/api/types'

const props = defineProps<{
  blocks: ThinkingBlock[]
}>()

const isContextCollapsed = ref(false)

const isContextMessagesCollapsed = ref(false)

const activeCategoryTab = ref<string>('all')

interface ContextView {
  userProfile?: Record<string, unknown>
  recentWorks?: unknown[]
  selectedMessages?: unknown[]
  citingMessages?: unknown[]
  timelineMessages?: unknown[]
  pinnedMessages?: unknown[]
  similarityMessages?: unknown[]
  tagRelativeMessages?: unknown[]
  keywordMessages?: unknown[]
  randomMessages?: unknown[]
  randomMaxPercent?: number
  categoryIds?: {
    selected?: string[]
    pinned?: string[]
    timeline?: string[]
    citing?: string[]
    tag_relative?: string[]
    similarity?: string[]
    keyword?: string[]
    random?: string[]
  }
  customContext?: string
  strategy?: string
}

const agg = computed<ContextView>(() => {
  const out: ContextView = {}
  for (const b of props.blocks) {
    const ctx = b.context
    if (!ctx) continue

    if (!out.userProfile && ctx.userProfile && Object.keys(ctx.userProfile).length > 0) {
      out.userProfile = ctx.userProfile
    }
    if ((!out.selectedMessages || out.selectedMessages.length === 0) && ctx.selectedMessages && ctx.selectedMessages.length > 0) {
      out.selectedMessages = ctx.selectedMessages
    }
    if ((!out.citingMessages || out.citingMessages.length === 0) && ctx.citingMessages && ctx.citingMessages.length > 0) {
      out.citingMessages = ctx.citingMessages
    }
    if ((!out.timelineMessages || out.timelineMessages.length === 0) && ctx.timelineMessages && ctx.timelineMessages.length > 0) {
      out.timelineMessages = ctx.timelineMessages
    }
    if ((!out.pinnedMessages || out.pinnedMessages.length === 0) && ctx.pinnedMessages && ctx.pinnedMessages.length > 0) {
      out.pinnedMessages = ctx.pinnedMessages
    }
    if ((!out.similarityMessages || out.similarityMessages.length === 0) && ctx.similarityMessages && ctx.similarityMessages.length > 0) {
      out.similarityMessages = ctx.similarityMessages
    }
    if ((!out.tagRelativeMessages || out.tagRelativeMessages.length === 0) && ctx.tagRelativeMessages && ctx.tagRelativeMessages.length > 0) {
      out.tagRelativeMessages = ctx.tagRelativeMessages
    }
    if ((!out.keywordMessages || out.keywordMessages.length === 0) && ctx.keywordMessages && ctx.keywordMessages.length > 0) {
      out.keywordMessages = ctx.keywordMessages
    }
    if ((!out.randomMessages || out.randomMessages.length === 0) && ctx.randomMessages && ctx.randomMessages.length > 0) {
      out.randomMessages = ctx.randomMessages
    }
    if (ctx.randomMaxPercent !== undefined) {
      out.randomMaxPercent = ctx.randomMaxPercent
    }
    if (!out.categoryIds && ctx.categoryIds) {
      out.categoryIds = ctx.categoryIds
    }
    if ((!out.recentWorks || out.recentWorks.length === 0) && ctx.recentWorks && ctx.recentWorks.length > 0) {
      out.recentWorks = ctx.recentWorks
    }
    if (!out.customContext && ctx.customContext) out.customContext = ctx.customContext
    if (!out.strategy && ctx.strategy) out.strategy = ctx.strategy
  }
  return out
})

const selectedCount = computed(() => agg.value.selectedMessages?.length || agg.value.categoryIds?.selected?.length || 0)
const citingCount = computed(() => agg.value.citingMessages?.length || agg.value.categoryIds?.citing?.length || 0)
const timelineCount = computed(() => agg.value.timelineMessages?.length || agg.value.categoryIds?.timeline?.length || 0)
const pinnedCount = computed(() => agg.value.pinnedMessages?.length || agg.value.categoryIds?.pinned?.length || 0)
const similarityCount = computed(() => agg.value.similarityMessages?.length || agg.value.categoryIds?.similarity?.length || 0)
const tagRelativeCount = computed(() => agg.value.tagRelativeMessages?.length || agg.value.categoryIds?.tag_relative?.length || 0)
const keywordCount = computed(() => agg.value.keywordMessages?.length || agg.value.categoryIds?.keyword?.length || 0)
const randomCount = computed(() => agg.value.randomMessages?.length || agg.value.categoryIds?.random?.length || 0)

const totalCitedMessagesCount = computed(() => {
  return selectedCount.value + citingCount.value + timelineCount.value + pinnedCount.value +
    similarityCount.value + tagRelativeCount.value + keywordCount.value + randomCount.value
})

const collectionCategoryStats = computed(() => [
  { key: 'citing', name: '显式引用的消息', sourceKey: 'CITING', count: citingCount.value, icon: MessagesSquare, badgeCls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200', bgCls: 'bg-blue-50/50 dark:bg-blue-950/30', borderCls: 'border-blue-100/50 dark:border-blue-900/30', textCls: 'text-blue-800 dark:text-blue-300', msgs: agg.value.citingMessages || [] },
  { key: 'timeline', name: '基于时间线的消息', sourceKey: 'TIMELINE', count: timelineCount.value, icon: Clock, badgeCls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200', bgCls: 'bg-sky-50/40 dark:bg-sky-900/20', borderCls: 'border-sky-100/40 dark:border-sky-900/30', textCls: 'text-sky-800 dark:text-sky-300', msgs: agg.value.timelineMessages || [] },
  { key: 'pinned', name: '钉住关注的消息', sourceKey: 'PINNED', count: pinnedCount.value, icon: Pin, badgeCls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200', bgCls: 'bg-amber-50/40 dark:bg-amber-950/20', borderCls: 'border-amber-200/40', textCls: 'text-amber-800 dark:text-amber-300', msgs: agg.value.pinnedMessages || [] },
  { key: 'similarity', name: '语义相似消息', sourceKey: 'SIMILARITY', count: similarityCount.value, icon: Sparkles, badgeCls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200', bgCls: 'bg-indigo-50/40 dark:bg-indigo-950/20', borderCls: 'border-indigo-200/40', textCls: 'text-indigo-800 dark:text-indigo-300', msgs: agg.value.similarityMessages || [] },
  { key: 'tagRelative', name: '标签相关性消息', sourceKey: 'TAG_RELATIVE', count: tagRelativeCount.value, icon: Tag, badgeCls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200', bgCls: 'bg-emerald-50/40 dark:bg-emerald-950/20', borderCls: 'border-emerald-200/40', textCls: 'text-emerald-800 dark:text-emerald-300', msgs: agg.value.tagRelativeMessages || [] },
  { key: 'keyword', name: '关键词匹配消息', sourceKey: 'KEYWORD', count: keywordCount.value, icon: Key, badgeCls: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-200', bgCls: 'bg-cyan-50/40 dark:bg-cyan-950/20', borderCls: 'border-cyan-200/40', textCls: 'text-cyan-800 dark:text-cyan-300', msgs: agg.value.keywordMessages || [] },
  { key: 'random', name: '随机采样消息', sourceKey: 'RANDOM', count: randomCount.value, icon: Shuffle, badgeCls: 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200', bgCls: 'bg-teal-50/40 dark:bg-teal-950/20', borderCls: 'border-teal-200/40', textCls: 'text-teal-800 dark:text-teal-300', msgs: agg.value.randomMessages || [] },
  { key: 'selected', name: '手动勾选消息', sourceKey: 'SELECTED', count: selectedCount.value, icon: CheckSquare, badgeCls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200', bgCls: 'bg-blue-50/40 dark:bg-blue-950/20', borderCls: 'border-blue-200/40', textCls: 'text-blue-800 dark:text-blue-300', msgs: agg.value.selectedMessages || [] },
])

const activeCategoryStat = computed(() => {
  if (activeCategoryTab.value === 'all') return null
  return collectionCategoryStats.value.find((s) => s.key === activeCategoryTab.value) ?? null
})

const displayedCategoryStats = computed(() => {
  if (activeCategoryTab.value === 'all') {
    return collectionCategoryStats.value.filter((s) => s.msgs.length > 0)
  }
  const stat = activeCategoryStat.value
  return stat && stat.msgs.length > 0 ? [stat] : []
})

const hasAny = computed(() => Boolean(
  (agg.value.userProfile && Object.keys(agg.value.userProfile).length > 0) ||
  totalCitedMessagesCount.value > 0 ||
  agg.value.categoryIds ||
  (agg.value.recentWorks && agg.value.recentWorks.length > 0) ||
  agg.value.customContext ||
  agg.value.strategy,
))

function formatJson(val: unknown): string {
  if (typeof val === 'string') return val
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

function msgContent(val: unknown): string {
  if (typeof val === 'string') return val
  if (val && typeof val === 'object' && 'content' in val) {
    const c = (val as { content?: unknown }).content
    return typeof c === 'string' ? c : ''
  }
  return ''
}
</script>

<template>
  <div v-if="hasAny" class="my-2.5 p-3 rounded-xl border border-sky-200/90 dark:border-sky-800/80 bg-gradient-to-br from-sky-50/70 to-blue-50/40 dark:from-sky-950/40 dark:to-blue-950/20 shadow-sm select-text">
    <div class="flex items-center justify-between pb-2 border-b border-sky-100 dark:border-sky-900/40 mb-2">
      <button
        type="button"
        class="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
        :aria-expanded="!isContextCollapsed"
        @click="isContextCollapsed = !isContextCollapsed"
      >
        <ChevronRight :size="15" class="text-sky-500 flex-shrink-0 transition-transform duration-200" :class="{ 'rotate-90': !isContextCollapsed }" />
        <Database :size="15" class="text-sky-600 dark:text-sky-400 flex-shrink-0" />
        <span class="text-xs font-bold text-sky-900 dark:text-sky-200 truncate">运行与对话上下文环境 (Context)</span>
      </button>
      <span v-if="agg.strategy" class="px-2 py-0.5 rounded-full text-4xs bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 font-medium flex-shrink-0">
        策略: {{ agg.strategy }}
      </span>
    </div>

    <div v-if="!isContextCollapsed" class="space-y-2.5 text-xs">
      <div v-if="agg.userProfile" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-sky-100 dark:border-sky-900/40">
        <div class="flex items-center gap-1.5 font-semibold text-sky-800 dark:text-sky-300 text-2xs mb-1">
          <UserRound :size="12" class="text-sky-600 dark:text-sky-400" />
          <span>用户画像与交互偏好 (Profile)</span>
        </div>
        <pre class="text-4xs text-apple-gray-700 dark:text-apple-gray-300 overflow-x-auto">{{ formatJson(agg.userProfile) }}</pre>
      </div>

      <div class="p-2.5 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-sky-200/80 dark:border-sky-800/60 space-y-2">
        <button
          type="button"
          class="flex items-center justify-between w-full text-left font-bold text-sky-900 dark:text-sky-200 text-2xs pb-1 border-b border-sky-100 dark:border-sky-900/30 cursor-pointer"
          @click="isContextMessagesCollapsed = !isContextMessagesCollapsed"
        >
          <div class="flex items-center gap-1.5">
            <ChevronRight :size="12" class="text-sky-500 flex-shrink-0 transition-transform duration-200" :class="{ 'rotate-90': !isContextMessagesCollapsed }" />
            <MessagesSquare :size="13" class="text-sky-600 dark:text-sky-400" />
            <span>引用的消息与上下文背景 (Context Messages)</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-4xs bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 font-medium">
            引用与关联消息总计: {{ totalCitedMessagesCount }} 条
          </span>
        </button>

        <div v-if="!isContextMessagesCollapsed">
          <div class="flex flex-wrap gap-1.5 text-4xs pt-0.5">
            <button
              type="button"
              class="px-2 py-1 rounded-lg border font-medium transition-colors"
              :class="activeCategoryTab === 'all'
                ? 'bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 border-sky-300/60 dark:border-sky-700/60'
                : 'bg-white/70 dark:bg-apple-gray-900/70 text-apple-gray-600 dark:text-apple-gray-400 border-apple-gray-200/60 dark:border-apple-gray-700/60 hover:text-sky-700 dark:hover:text-sky-300'"
              @click="activeCategoryTab = 'all'"
            >
              全部 ({{ totalCitedMessagesCount }})
            </button>
            <button
              v-for="stat in collectionCategoryStats"
              :key="'tab-' + stat.key"
              type="button"
              class="px-2 py-1 rounded-lg border font-medium transition-colors flex items-center gap-1"
              :class="activeCategoryTab === stat.key
                ? 'bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 border-sky-300/60 dark:border-sky-700/60'
                : (stat.count > 0 ? 'bg-white/70 dark:bg-apple-gray-900/70 text-apple-gray-600 dark:text-apple-gray-400 border-apple-gray-200/60 dark:border-apple-gray-700/60 hover:text-sky-700 dark:hover:text-sky-300' : 'bg-apple-gray-50/50 dark:bg-apple-gray-800/30 text-apple-gray-400 border-apple-gray-100 dark:border-apple-gray-800 opacity-60')"
              @click="activeCategoryTab = stat.key"
            >
              <component :is="stat.icon" :size="11" class="flex-shrink-0" />
              <span class="truncate">{{ stat.name.split('消息')[0] }}</span>
              <span class="px-1 rounded font-mono font-bold flex-shrink-0" :class="stat.badgeCls">{{ stat.count }}</span>
            </button>
          </div>

          <div v-if="totalCitedMessagesCount > 0" class="space-y-2 pt-1">
            <template v-if="displayedCategoryStats.length > 0">
              <div v-for="stat in displayedCategoryStats" :key="'list-' + stat.key" class="p-2 rounded-lg border space-y-1" :class="[stat.bgCls, stat.borderCls]">
                <div class="flex items-center justify-between font-semibold text-2xs" :class="stat.textCls">
                  <div class="flex items-center gap-1.5">
                    <component :is="stat.icon" :size="12" />
                    <span>{{ stat.name }} ({{ stat.sourceKey }})</span>
                  </div>
                  <span class="text-4xs font-normal opacity-80">{{ stat.msgs.length }} 条消息</span>
                </div>
                <ul class="space-y-1 mt-1">
                  <li v-for="(msg, mIdx) in stat.msgs" :key="mIdx" class="text-2xs text-apple-gray-700 dark:text-apple-gray-300 bg-white/70 dark:bg-apple-gray-900/70 p-1.5 rounded border border-apple-gray-100 dark:border-apple-gray-800">
                    • {{ msgContent(msg) }}
                  </li>
                </ul>
              </div>
            </template>
            <div v-else class="text-4xs text-apple-gray-400 italic p-1">该标签下暂无引用的消息</div>
          </div>
          <div v-else class="text-4xs text-apple-gray-400 italic p-1">会话内未采集到任何关联或引用的消息</div>
        </div>
      </div>

      <div v-if="agg.categoryIds" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-sky-200/80 dark:border-sky-800/60 space-y-1">
        <div class="flex items-center gap-1.5 font-bold text-sky-900 dark:text-sky-200 text-2xs">
          <ListOrdered :size="12" class="text-sky-600 dark:text-sky-400" />
          <span>本次问答分类保存的上下文 ID 列表 (Category Message IDs)</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1 text-4xs">
          <div v-if="agg.categoryIds.timeline?.length" class="p-1.5 rounded bg-sky-50/60 dark:bg-sky-950/30">
            <span class="font-medium text-sky-800 dark:text-sky-300">🕒 时间线消息 IDs ({{ agg.categoryIds.timeline.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.timeline.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.citing?.length" class="p-1.5 rounded bg-blue-50/60 dark:bg-blue-950/30">
            <span class="font-medium text-blue-800 dark:text-blue-300">📌 引用消息 IDs ({{ agg.categoryIds.citing.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.citing.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.pinned?.length" class="p-1.5 rounded bg-amber-50/60 dark:bg-amber-950/30">
            <span class="font-medium text-amber-800 dark:text-amber-300">📌 钉住消息 IDs ({{ agg.categoryIds.pinned.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.pinned.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.similarity?.length" class="p-1.5 rounded bg-indigo-50/60 dark:bg-indigo-950/30">
            <span class="font-medium text-indigo-800 dark:text-indigo-300">🔍 语义相似 IDs ({{ agg.categoryIds.similarity.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.similarity.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.tag_relative?.length" class="p-1.5 rounded bg-emerald-50/60 dark:bg-emerald-950/30">
            <span class="font-medium text-emerald-800 dark:text-emerald-300">🏷️ 标签相关性 IDs ({{ agg.categoryIds.tag_relative.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.tag_relative.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.keyword?.length" class="p-1.5 rounded bg-cyan-50/60 dark:bg-cyan-950/30">
            <span class="font-medium text-cyan-800 dark:text-cyan-300">🔑 关键词相关 IDs ({{ agg.categoryIds.keyword.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.keyword.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.random?.length" class="p-1.5 rounded bg-teal-50/60 dark:bg-teal-950/30">
            <span class="font-medium text-teal-800 dark:text-teal-300">🎲 随机采样 IDs ({{ agg.categoryIds.random.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.random.join(', ') }}</div>
          </div>
          <div v-if="agg.categoryIds.selected?.length" class="p-1.5 rounded bg-blue-50/60 dark:bg-blue-950/30">
            <span class="font-medium text-blue-800 dark:text-blue-300">☑️ 手动勾选 IDs ({{ agg.categoryIds.selected.length }}):</span>
            <div class="truncate text-apple-gray-600 dark:text-apple-gray-400 font-mono mt-0.5">{{ agg.categoryIds.selected.join(', ') }}</div>
          </div>
        </div>
      </div>

      <div v-if="agg.recentWorks && agg.recentWorks.length > 0" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-sky-100 dark:border-sky-900/40">
        <div class="flex items-center gap-1.5 font-semibold text-sky-800 dark:text-sky-300 text-2xs mb-1">
          <History :size="12" class="text-sky-600 dark:text-sky-400" />
          <span>最近工作 (Recent Works)</span>
        </div>
        <ul class="space-y-1">
          <li v-for="(w, wIdx) in agg.recentWorks" :key="wIdx" class="text-2xs text-apple-gray-700 dark:text-apple-gray-300 bg-sky-50/40 dark:bg-sky-900/20 p-1.5 rounded">
            • {{ formatJson(w) }}
          </li>
        </ul>
      </div>

      <div v-if="agg.customContext" class="p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-sky-100 dark:border-sky-900/40">
        <div class="flex items-center gap-1.5 font-semibold text-sky-800 dark:text-sky-300 text-2xs mb-1">
          <BrainCircuit :size="12" class="text-sky-600 dark:text-sky-400" />
          <span>相关知识 / 记忆背景</span>
        </div>
        <p class="text-2xs text-apple-gray-600 dark:text-apple-gray-300 whitespace-pre-wrap">{{ agg.customContext }}</p>
      </div>

      <div v-if="agg.strategy" class="flex items-center gap-1.5 p-2 rounded-lg bg-white/80 dark:bg-apple-gray-900/80 border border-sky-100 dark:border-sky-900/40">
        <ShieldCheck :size="12" class="text-sky-600 dark:text-sky-400" />
        <span class="font-semibold text-sky-800 dark:text-sky-300 text-2xs">编排策略:</span>
        <span class="text-2xs text-apple-gray-700 dark:text-apple-gray-300">{{ agg.strategy }}</span>
      </div>
    </div>
  </div>
</template>
