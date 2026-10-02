<script setup lang="ts">
/**
 * UniversalConfigCard 统一配置卡片（R7 · chg-057）
 * 六大组件（Agent/LLM/MCP/Skill/Soul/Prompt）共用 4 层骨架：
 * 标题行(图标+名称+状态) / 描述 / 正负范例 / 特有内容插槽 / 操作行。
 * 交互统一：点击卡片触发 edit；启停开关、测试与删除经事件上抛。
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  brief?: string
  subtitle?: string
  positiveExamples?: string[]
  negativeExamples?: string[]
  enabled?: boolean
  accentClass?: string
  heightClass?: string
  editable?: boolean
  showToggle?: boolean
  /** 覆盖状态灯配色（如 MCP 用运行态而非启用态渲染圆点） */
  statusDotClass?: string
  /** 批量选择高亮态 */
  selected?: boolean
}>(), {
  brief: '',
  subtitle: '',
  positiveExamples: () => [],
  negativeExamples: () => [],
  enabled: true,
  accentClass: 'bg-brian-blue/10 text-brian-blue',
  heightClass: 'h-[218px]',
  editable: true,
  showToggle: true,
  statusDotClass: '',
  selected: false,
})

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'toggle'): void
  (e: 'delete'): void
  (e: 'test'): void
}>()

const hasExamples = computed(() => props.positiveExamples.length > 0 || props.negativeExamples.length > 0)
</script>

<template>
  <div
    class="rounded-xl border bg-white dark:bg-apple-gray-800 hover:shadow-md hover:border-brian-blue/30 transition-shadow p-4 flex flex-col overflow-hidden"
    :class="[heightClass, selected ? 'border-brian-blue/40 bg-brian-blue/5' : 'border-apple-gray-200 dark:border-apple-gray-700', editable ? 'cursor-pointer' : '']"
    @click="editable && emit('edit')"
  >
    <div class="mb-2 min-h-0 overflow-hidden">
      <div class="flex items-start gap-2.5 mb-2">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" :class="accentClass">
          <slot name="icon" />
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ title }}</h3>
          <p class="text-2xs text-apple-gray-400 truncate">{{ subtitle }}</p>
        </div>
        <slot name="header-right" />
        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" :class="statusDotClass || (enabled ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600')" />
      </div>
      <p class="text-2xs text-apple-gray-400 line-clamp-2" :title="brief">{{ brief || '暂无描述' }}</p>
    </div>

    <div v-if="hasExamples" class="mb-2 grid grid-cols-2 gap-2 min-h-0">
      <div class="min-w-0">
        <p class="text-4xs font-medium text-success-green mb-1">✓ 正面范例</p>
        <div class="space-y-0.5 overflow-hidden" style="max-height: 44px">
          <p v-for="(ex, i) in positiveExamples.slice(0, 2)" :key="`p${i}`" class="text-4xs text-apple-gray-500 dark:text-apple-gray-400 truncate">+ {{ ex }}</p>
        </div>
      </div>
      <div class="min-w-0">
        <p class="text-4xs font-medium text-error-red mb-1">✗ 负面范例</p>
        <div class="space-y-0.5 overflow-hidden" style="max-height: 44px">
          <p v-for="(ex, i) in negativeExamples.slice(0, 2)" :key="`n${i}`" class="text-4xs text-apple-gray-500 dark:text-apple-gray-400 truncate">− {{ ex }}</p>
        </div>
      </div>
    </div>

    <div class="min-h-0 overflow-hidden">
      <slot name="body" />
    </div>

    <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto">
      <div class="flex items-center gap-1">
        <slot name="actions-left" />
      </div>
      <div class="flex items-center gap-1">
        <slot name="actions-right" />
        <button
          v-if="showToggle"
          class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0"
          :class="enabled ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
          @click.stop="emit('toggle')"
        >
          <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="enabled ? 'translate-x-4' : ''" />
        </button>
        <button v-if="editable" class="flex items-center gap-1 px-1.5 py-1 text-4xs font-medium rounded text-apple-gray-500 dark:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click.stop="emit('delete')">
          <slot name="delete-label">删除</slot>
        </button>
      </div>
    </div>
  </div>
</template>
