<script setup lang="ts">
import { computed, ref } from 'vue'
import { Loader2, Wrench, X } from '@lucide/vue'
import type { ToolCallBlock } from '@/api/types'
import { renderMarkdown } from '@/utils/markdown'

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
    case 'streaming': return 'border-chat-primary'
    case 'done': return 'border-chat-success/60'
    case 'error': return 'border-chat-error/60'
    default: return 'border-chat-hairline'
  }
})

const iconColor = computed(() => {
  switch (_props.block.meta.status) {
    case 'streaming': return 'text-chat-primary-hover'
    case 'done': return 'text-chat-success'
    case 'error': return 'text-chat-error'
    default: return 'text-chat-ink-subtle'
  }
})

const dotColor = computed(() => {
  switch (_props.block.meta.status) {
    case 'streaming': return 'bg-chat-primary animate-pulse'
    case 'done': return 'bg-chat-success'
    case 'error': return 'bg-chat-error'
    default: return 'bg-chat-ink-tertiary'
  }
})

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

const paramsText = computed(() => {
  const p = _props.block.params
  if (!p || (typeof p === 'object' && Object.keys(p).length === 0)) return ''
  return typeof p === 'string' ? p : safeStringify(p)
})

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
    <div class="flex items-center gap-1.5">
      <span class="text-4xs text-chat-ink-tertiary max-w-[160px] truncate" :title="ballTitle">
        {{ block.toolName || 'Tool' }}
      </span>
      <button
        class="relative flex-shrink-0 w-9 h-9 rounded-full bg-chat-surface-2 border-2 flex items-center justify-center transition-colors"
        :class="ballRing"
        :title="ballTitle"
        @click="isExpanded = !isExpanded"
        :aria-expanded="isExpanded"
        :aria-label="ballTitle"
      >
        <Loader2 v-if="block.meta.status === 'streaming'" :size="15" class="animate-spin text-chat-primary-hover" />
        <Wrench v-else :size="15" :class="iconColor" />
        <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-chat-surface-2" :class="dotColor" />
      </button>
    </div>

    <div v-if="isExpanded" class="w-full min-w-[260px] chat-card overflow-hidden text-left">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-chat-hairline">
        <Wrench :size="13" :class="iconColor" class="flex-shrink-0" />
        <span class="text-xs font-medium truncate text-chat-ink">{{ block.toolName || 'Tool' }}</span>
        <span class="text-2xs text-chat-ink-tertiary flex-shrink-0">{{ statusText }}</span>
        <button
          class="ml-auto p-1 rounded-chat-sm text-chat-ink-tertiary hover:text-chat-ink transition-colors"
          title="收起"
          @click="isExpanded = false"
        >
          <X :size="13" />
        </button>
      </div>
      <div class="px-3 py-2.5 space-y-2.5 max-h-96 overflow-y-auto">
        <div>
          <p class="text-2xs font-medium text-chat-ink-subtle mb-1">参数</p>
          <pre v-if="paramsText" class="text-xs bg-chat-canvas border border-chat-hairline rounded-chat-sm p-2 overflow-x-auto whitespace-pre-wrap break-all text-chat-ink-muted">{{ paramsText }}</pre>
          <p v-else class="text-2xs text-chat-ink-tertiary">（无参数）</p>
        </div>
        <div>
          <p class="text-2xs font-medium text-chat-ink-subtle mb-1">响应</p>
          <p v-if="block.meta.status === 'streaming'" class="text-2xs text-chat-ink-tertiary">执行中…</p>
          <pre v-else-if="resultView.kind === 'json' && resultView.text" class="text-xs bg-chat-canvas border border-chat-hairline rounded-chat-sm p-2 overflow-x-auto whitespace-pre-wrap break-all text-chat-ink-muted">{{ resultView.text }}</pre>
          <div v-else-if="resultView.kind === 'markdown' && resultView.text" class="markdown-body text-xs break-words" v-html="resultHtml" />
          <p v-else class="text-2xs text-chat-ink-tertiary">（无返回）</p>
        </div>
      </div>
    </div>
  </div>
</template>
