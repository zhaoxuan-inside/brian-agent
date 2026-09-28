<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  User, Bot, CheckSquare, Square, Trash2, Copy, Check,
  ChevronDown, ChevronUp, Code2, FileText, MessageCircle,
} from '@lucide/vue'
import type { MemoryItem } from '@/api/types'
import { renderMarkdown } from '@/utils/markdown'
import { copyToClipboard } from '@/utils/clipboard'
import { getMemoryRoleMeta, analyzeMemoryContent } from '@/utils/memoryFormat'

const props = defineProps<{
  memory: MemoryItem
  selected: boolean
  expanded: boolean
  typeColors: Record<string, string>
  typeLabels: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'toggleSelect', id: string): void
  (e: 'toggleExpand', id: string): void
  (e: 'delete', id: string): void
  (e: 'jump', memory: MemoryItem): void
}>()

// 点击卡片即跳转到对应对话；命中卡片内可交互元素（复选框/按钮/链接等）或文本选择时不跳转
function handleCardClick(e: MouseEvent) {
  if (!props.memory.sessionId) return
  const target = e.target as HTMLElement | null
  if (target?.closest('button, a, input, [data-no-jump]')) return
  if ((window.getSelection()?.toString() || '').length > 0) return
  emit('jump', props.memory)
}

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null
const activeBlockTab = ref<'rich' | 'raw'>('rich')

const roleMeta = computed(() => getMemoryRoleMeta(props.memory))
const analysis = computed(() => analyzeMemoryContent(props.memory.content))

const renderedMarkdown = computed(() => {
  if (analysis.value.format === 'blocks' && activeBlockTab.value === 'rich') {
    return renderMarkdown(analysis.value.markdownContent)
  }
  if (analysis.value.format === 'markdown' || analysis.value.format === 'text') {
    return renderMarkdown(analysis.value.markdownContent)
  }
  return ''
})

const isContentLong = computed(() => {
  const content = props.memory.content || ''
  if (analysis.value.format === 'json' || analysis.value.format === 'blocks') {
    return content.length > 120 || content.includes('\n')
  }
  return content.length > 140 || (content.match(/\n/g) || []).length > 2
})

async function handleCopy() {
  const text = props.memory.content || ''
  if (!text) return
  const ok = await copyToClipboard(text)
  if (ok) {
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
      copyTimer = null
    }, 1500)
  }
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatFullTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN')
}
</script>

<template>
  <div
    class="block-card rounded-2xl overflow-hidden transition-all duration-200 border border-apple-gray-200/80 dark:border-apple-gray-700/80"
    :class="[
      selected
        ? 'ring-2 ring-brian-blue/40 border-brian-blue/50 bg-brian-blue/[0.02] shadow-sm'
        : 'hover:border-apple-gray-300 dark:hover:border-apple-gray-600 hover:shadow-subtle',
      memory.sessionId ? 'cursor-pointer' : ''
    ]"
    :title="memory.sessionId ? '点击跳转到对应对话' : ''"
    data-testid="memory-card"
    @click="handleCardClick"
  >
    <!-- 头部区域：角色标识、类型标签、格式标签、时间、操作按钮 -->
    <div
      class="px-4 py-3 border-b border-apple-gray-100 dark:border-apple-gray-700/40 bg-apple-gray-50/60 dark:bg-apple-gray-900/30 flex items-center gap-2.5 select-none"
    >
      <button
        class="text-apple-gray-300 hover:text-brian-blue flex-shrink-0 transition-colors"
        :aria-label="selected ? '取消选中' : '选中'"
        @click.stop="emit('toggleSelect', memory.id)"
      >
        <component :is="selected ? CheckSquare : Square" :size="16" />
      </button>

      <!-- 角色标识 (用户发送 / 系统回复) -->
      <span
        class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 transition-colors"
        :class="roleMeta.badgeClass"
        data-testid="memory-role-badge"
      >
        <component :is="roleMeta.isUser ? User : Bot" :size="12" class="flex-shrink-0" />
        <span>{{ roleMeta.label }}</span>
      </span>

      <!-- 记忆类型标签 -->
      <span
        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-black/5 dark:border-white/10 flex-shrink-0"
        :class="typeColors[memory.type] || 'bg-apple-gray-100 text-apple-gray-700 dark:bg-apple-gray-800 dark:text-apple-gray-300'"
      >
        {{ typeLabels[memory.type] || memory.type }}
      </span>

      <!-- 数据格式标识 (Markdown / JSON / 结构化内容 / 纯文本) -->
      <span
        class="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
        :class="[
          analysis.format === 'json' ? 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 border border-apple-gray-200/80 dark:border-apple-gray-700/80 font-mono' : '',
          analysis.format === 'blocks' ? 'bg-brian-blue/10 dark:bg-brian-blue/15 text-brian-blue dark:text-blue-300 border border-brian-blue/20' : '',
          analysis.format === 'markdown' ? 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 border border-apple-gray-200/80 dark:border-apple-gray-700/80' : '',
          analysis.format === 'text' ? 'bg-apple-gray-100/60 dark:bg-apple-gray-800/50 text-apple-gray-500 dark:text-apple-gray-400 border border-apple-gray-200/50 dark:border-apple-gray-700/50' : ''
        ]"
        data-testid="memory-format-badge"
      >
        {{ analysis.formatLabel }}
      </span>

      <!-- 时间与短 ID -->
      <div class="ml-auto flex items-center gap-2 text-xs flex-shrink-0">
        <span class="text-apple-gray-400" :title="formatFullTime(memory.createdAt)">
          {{ formatTime(memory.createdAt) }}
        </span>
        <span class="text-apple-gray-300 dark:text-apple-gray-600 font-mono text-3xs">
          #{{ memory.id.slice(-8) }}
        </span>
      </div>

      <!-- 操作按钮：展开收起、跳转对话、复制与删除 -->
      <div class="flex items-center gap-1 flex-shrink-0" @click.stop>
        <button
          v-if="isContentLong"
          class="p-1 rounded-md text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 transition-colors"
          :title="expanded ? '收起内容' : '展开全文'"
          :aria-label="expanded ? '收起内容' : '展开全文'"
          @click="emit('toggleExpand', memory.id)"
        >
          <component :is="expanded ? ChevronUp : ChevronDown" :size="14" />
        </button>
        <button
          v-if="memory.sessionId"
          class="p-1 rounded-md text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 transition-colors"
          title="跳转到对应对话"
          data-testid="memory-jump-btn"
          @click="emit('jump', memory)"
        >
          <MessageCircle :size="14" />
        </button>
        <button
          class="p-1 rounded-md transition-colors"
          :class="copied ? 'text-success-green bg-success-green/10' : 'text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10'"
          :title="copied ? '已复制' : '复制内容'"
          @click="handleCopy"
        >
          <component :is="copied ? Check : Copy" :size="14" />
        </button>
        <button
          class="p-1 rounded-md text-apple-gray-400 hover:text-error-red hover:bg-error-red/10 transition-colors"
          title="删除记忆"
          @click="emit('delete', memory.id)"
        >
          <Trash2 :size="14" />
        </button>
      </div>
    </div>

    <!-- 卡片内容区域：支持根据不同格式渲染 -->
    <div class="p-4">
      <!-- 结构化块切换标签 (图文视图 vs JSON 源码) -->
      <div v-if="analysis.hasBlocks" class="flex items-center gap-2 mb-2">
        <div class="inline-flex rounded-lg p-0.5 bg-apple-gray-100 dark:bg-apple-gray-800 text-xs">
          <button
            class="flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition-colors"
            :class="activeBlockTab === 'rich' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-xs' : 'text-apple-gray-500 hover:text-apple-gray-900 dark:hover:text-apple-gray-200'"
            @click.stop="activeBlockTab = 'rich'"
          >
            <FileText :size="12" /> 图文视图
          </button>
          <button
            class="flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition-colors"
            :class="activeBlockTab === 'raw' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-xs' : 'text-apple-gray-500 hover:text-apple-gray-900 dark:hover:text-apple-gray-200'"
            @click.stop="activeBlockTab = 'raw'"
          >
            <Code2 :size="12" /> JSON 源码
          </button>
        </div>
      </div>

      <!-- 内容渲染容器 (含折叠/展开效果) -->
      <div
        class="relative transition-all"
        :class="[!expanded && isContentLong ? 'max-h-28 overflow-hidden' : '']"
      >
        <!-- 1. JSON 渲染 (通用 JSON 或 结构化块切至源码) -->
        <div
          v-if="analysis.format === 'json' || (analysis.hasBlocks && activeBlockTab === 'raw')"
          class="rounded-xl overflow-hidden border border-apple-gray-200/80 dark:border-apple-gray-700/80 bg-apple-gray-50/70 dark:bg-apple-gray-900/60"
        >
          <div class="flex items-center justify-between px-3 py-1.5 bg-apple-gray-100/60 dark:bg-apple-gray-800/60 border-b border-apple-gray-200/60 dark:border-apple-gray-700/60 text-3xs font-mono text-apple-gray-500 dark:text-apple-gray-400">
            <span>JSON</span>
            <span>{{ analysis.prettyJson ? `${analysis.prettyJson.split('\n').length} 行` : '' }}</span>
          </div>
          <pre class="p-3 text-xs font-mono text-apple-gray-800 dark:text-apple-gray-200 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed"><code class="hljs language-json" v-html="analysis.highlightedJson || analysis.prettyJson" /></pre>
        </div>

        <!-- 2. Markdown 及普通文本渲染 -->
        <div
          v-else
          class="markdown-body text-sm leading-relaxed text-apple-gray-800 dark:text-apple-gray-100 break-words select-text"
          v-html="renderedMarkdown"
        />

        <!-- 折叠时的底部渐变半透明遮罩 -->
        <div
          v-if="!expanded && isContentLong"
          class="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white dark:from-apple-gray-800 to-transparent pointer-events-none"
        />
      </div>

      <!-- 展开 / 收起 切换按钮 -->
      <div v-if="isContentLong" class="mt-2 flex justify-start">
        <button
          class="inline-flex items-center gap-1 text-xs font-medium text-brian-blue hover:underline cursor-pointer"
          @click.stop="emit('toggleExpand', memory.id)"
        >
          <span>{{ expanded ? '收起内容' : '展开全文' }}</span>
          <component :is="expanded ? ChevronUp : ChevronDown" :size="13" />
        </button>
      </div>

      <!-- 卡片底部：标签列表与置信度 -->
      <div class="flex items-center gap-3 mt-3 pt-2 border-t border-apple-gray-100 dark:border-apple-gray-700/40 text-xs">
        <div v-if="memory.tags?.length" class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="tag in memory.tags"
            :key="tag"
            class="px-2 py-0.5 rounded-full text-2xs bg-apple-gray-100/80 text-apple-gray-600 dark:bg-apple-gray-800 dark:text-apple-gray-300 border border-apple-gray-200/60 dark:border-apple-gray-700/60"
          >
            #{{ tag }}
          </span>
        </div>
        <span v-else class="text-3xs text-apple-gray-300 dark:text-apple-gray-600">无标签</span>

        <span class="text-xs text-apple-gray-400 ml-auto flex-shrink-0">
          置信度: <strong class="font-medium text-apple-gray-600 dark:text-apple-gray-300">{{ Math.round((memory.confidence ?? 0) * 100) }}%</strong>
        </span>
      </div>
    </div>
  </div>
</template>
