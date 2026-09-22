<script setup lang="ts">
import { computed } from 'vue'

/**
 * 配置值 Diff 渲染（TODO-List §2：修改前 Diff 对比视图）。
 * 原语值（INT/DOUBLE/BOOLEAN/短字符串）渲染单行 旧值→新值；
 * 多行字符串（列表/脚本类配置）渲染行级 diff（仅保留变化行 + 上下文）。
 */
const props = defineProps<{
  oldValue: unknown
  newValue: unknown
}>()

function toText(v: unknown): string {
  if (v === null || v === undefined) return '（空）'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

const oldText = computed(() => toText(props.oldValue))
const newText = computed(() => toText(props.newValue))

const isMultiLine = computed(() => oldText.value.includes('\n') || newText.value.includes('\n'))

const changed = computed(() => oldText.value !== newText.value)

/** 行级 diff（数据处理）：以旧行为基准做 LCS 最长公共子序列，标注 added/removed */
const lineDiff = computed(() => {
  const oldLines = oldText.value.split('\n')
  const newLines = newText.value.split('\n')
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const rows: Array<{ kind: 'same' | 'removed' | 'added'; text: string }> = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      rows.push({ kind: 'same', text: oldLines[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ kind: 'removed', text: oldLines[i] })
      i++
    } else {
      rows.push({ kind: 'added', text: newLines[j] })
      j++
    }
  }
  while (i < m) { rows.push({ kind: 'removed', text: oldLines[i] }); i++ }
  while (j < n) { rows.push({ kind: 'added', text: newLines[j] }); j++ }
  return rows
})
</script>

<template>
  <div v-if="!changed" class="text-xs text-apple-gray-400">值未变化</div>
  <div v-else-if="!isMultiLine" class="flex items-center gap-2 text-xs font-mono min-w-0">
    <span class="px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 line-through break-all whitespace-pre-wrap">{{ oldText }}</span>
    <span class="text-apple-gray-400">→</span>
    <span class="px-1.5 py-0.5 rounded bg-green-500/10 text-green-700 dark:text-green-400 break-all whitespace-pre-wrap">{{ newText }}</span>
  </div>
  <div v-else class="rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden text-xs font-mono max-h-56 overflow-y-auto">
    <div
      v-for="(row, idx) in lineDiff"
      :key="idx"
      class="px-2 py-0.5 whitespace-pre-wrap break-all"
      :class="row.kind === 'removed' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : row.kind === 'added' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'text-apple-gray-400'"
    >
      <span class="select-none mr-1">{{ row.kind === 'removed' ? '-' : row.kind === 'added' ? '+' : ' ' }}</span>{{ row.text || ' ' }}
    </div>
  </div>
</template>
