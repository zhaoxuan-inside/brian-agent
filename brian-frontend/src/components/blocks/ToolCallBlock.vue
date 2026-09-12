<script setup lang="ts">
import { computed, ref } from 'vue'
import { Loader2, Wrench, X } from '@lucide/vue'
import type { ToolCallBlock } from '@/api/types'
import { renderMarkdown } from '@/utils/markdown'

// ===== 改版（2026-09-12）：长条卡片改为小圆球 + 点击展开详情 =====
// 原长条卡片纵向占位大、多工具堆叠时时间线冗长；现默认仅一个状态圆球，
// 点击展开参数/响应详情。原实现见 git 历史（2026-09-12 前版本）。
const _props = defineProps<{ block: ToolCallBlock }>()
const isExpanded = ref(false)

const statusText = computed(() => {
  switch (_props.block.meta.status) {
    case 'streaming': return '执行中'
    case 'done': return '已完成'
    case 'error': return '失败'
    default: return ''
  }
})

const ballTitle = computed(() =>
  `${_props.block.toolName || 'Tool'}（${statusText.value}）— 点击查看参数与响应`,
)

const ballRing = computed(() => {
  switch (_props.block.meta.status) {
    case 'streaming': return 'border-brian-blue'
    case 'done': return 'border-success-green/60'
    case 'error': return 'border-error-red/60'
    default: return 'border-apple-gray-200 dark:border-apple-gray-700'
  }
})

const iconColor = computed(() => {
  switch (_props.block.meta.status) {
    case 'streaming': return 'text-brian-blue'
    case 'done': return 'text-success-green'
    case 'error': return 'text-error-red'
    default: return 'text-apple-gray-400'
  }
})

const dotColor = computed(() => {
  switch (_props.block.meta.status) {
    case 'streaming': return 'bg-brian-blue animate-pulse'
    case 'done': return 'bg-success-green'
    case 'error': return 'bg-error-red'
    default: return 'bg-apple-gray-300'
  }
})

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

/** 参数：对象 → JSON 缩进展示；空 → 空串（模板展示"（无参数）"） */
const paramsText = computed(() => {
  const p = _props.block.params
  if (!p || (typeof p === 'object' && Object.keys(p).length === 0)) return ''
  return typeof p === 'string' ? p : safeStringify(p)
})

/** 结果：对象/JSON 串 → json 高亮块；其余 → markdown 渲染 */
const resultView = computed((): { kind: 'json' | 'markdown'; text: string } => {
  const r = _props.block.result
  if (r === undefined || r === null || r === '') return { kind: 'markdown', text: '' }
  if (typeof r !== 'string') return { kind: 'json', text: safeStringify(r) }
  const t = r.trim()
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return { kind: 'json', text: JSON.stringify(JSON.parse(t), null, 2) }
    } catch { /* 非 JSON，按 markdown 渲染 */ }
  }
  return { kind: 'markdown', text: r }
})

const resultHtml = computed(() => renderMarkdown(resultView.value.text))
</script>

<template>
  <div class="py-1 flex flex-col items-end gap-1">
    <!-- 工具状态圆球 -->
    <div class="flex items-center gap-1.5">
      <span class="text-[10px] text-apple-gray-400 max-w-[160px] truncate" :title="ballTitle">
        {{ block.toolName || 'Tool' }}
      </span>
      <button
        class="relative flex-shrink-0 w-9 h-9 rounded-full bg-white dark:bg-apple-gray-900 border-2 flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
        :class="ballRing"
        :title="ballTitle"
        @click="isExpanded = !isExpanded"
        :aria-expanded="isExpanded"
        :aria-label="ballTitle"
      >
        <Loader2 v-if="block.meta.status === 'streaming'" :size="15" class="animate-spin text-brian-blue" />
        <Wrench v-else :size="15" :class="iconColor" />
        <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-apple-gray-900" :class="dotColor" />
      </button>
    </div>

    <!-- 点击展开：参数与响应详情（格式化渲染） -->
    <div v-if="isExpanded" class="w-full min-w-[260px] block-card overflow-hidden text-left">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-apple-gray-100 dark:border-apple-gray-800">
        <Wrench :size="13" :class="iconColor" class="flex-shrink-0" />
        <span class="text-xs font-medium truncate">{{ block.toolName || 'Tool' }}</span>
        <span class="text-[11px] text-apple-gray-400 flex-shrink-0">{{ statusText }}</span>
        <button
          class="ml-auto p-1 rounded text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200 transition-colors"
          title="收起"
          @click="isExpanded = false"
        >
          <X :size="13" />
        </button>
      </div>
      <div class="px-3 py-2.5 space-y-2.5 max-h-96 overflow-y-auto">
        <div>
          <p class="text-[11px] font-medium text-apple-gray-500 mb-1">参数</p>
          <pre v-if="paramsText" class="text-xs bg-apple-gray-100 dark:bg-apple-gray-900 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all">{{ paramsText }}</pre>
          <p v-else class="text-[11px] text-apple-gray-400">（无参数）</p>
        </div>
        <div>
          <p class="text-[11px] font-medium text-apple-gray-500 mb-1">响应</p>
          <p v-if="block.meta.status === 'streaming'" class="text-[11px] text-apple-gray-400">执行中…</p>
          <pre v-else-if="resultView.kind === 'json' && resultView.text" class="text-xs bg-apple-gray-100 dark:bg-apple-gray-900 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all">{{ resultView.text }}</pre>
          <div v-else-if="resultView.kind === 'markdown' && resultView.text" class="markdown-body text-xs break-words" v-html="resultHtml" />
          <p v-else class="text-[11px] text-apple-gray-400">（无返回）</p>
        </div>
      </div>
    </div>
  </div>
</template>
