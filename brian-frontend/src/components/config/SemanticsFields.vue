<script setup lang="ts">
/**
 * SemanticsFields 语义规范编辑器（R7 · chg-057）
 * 编辑弹窗通用块：名称(5-10字)/描述(30-40字)实时计数、正/负范例 Tag 编辑(≤15字、3-5条)、
 * 一键「AI 规范润色」（后端 /api/config/semantics/suggest 统一生成）。
 */
import { computed, ref } from 'vue'
import { Loader2, Plus, Sparkles, X } from '@lucide/vue'
import { configApi } from '../../api'

const props = withDefaults(defineProps<{
  title: string
  brief: string
  positiveExamples: string[]
  negativeExamples: string[]
  /** 润色参考上下文（组件正文/任务意图） */
  content?: string
  extra?: string
  kind?: 'agent' | 'mcp' | 'skill' | 'soul' | 'prompt'
  titlePlaceholder?: string
  briefPlaceholder?: string
}>(), {
  content: '',
  extra: '',
  kind: 'agent',
  titlePlaceholder: '例如：电商订单追踪',
  briefPlaceholder: '输入定义 + 输出定义 + 功能定义',
})

const emit = defineEmits<{
  (e: 'update:title', v: string): void
  (e: 'update:brief', v: string): void
  (e: 'update:positiveExamples', v: string[]): void
  (e: 'update:negativeExamples', v: string[]): void
}>()

const EXAMPLE_MAX = 15
const EXAMPLES_MIN = 3
const EXAMPLES_MAX = 5
const polishing = ref(false)

const titleCount = computed(() => props.title.trim().length)
const titleClass = computed(() => {
  if (titleCount.value === 0) return 'text-apple-gray-400'
  return titleCount.value >= 5 && titleCount.value <= 10 ? 'text-success-green' : 'text-warning-orange'
})
const briefCount = computed(() => props.brief.trim().length)
const briefClass = computed(() => {
  if (briefCount.value === 0) return 'text-apple-gray-400'
  return briefCount.value >= 30 && briefCount.value <= 40 ? 'text-success-green' : 'text-warning-orange'
})

function exampleWarn(text: string): boolean {
  return text.trim().length > EXAMPLE_MAX
}

function addExample(kind: 'positive' | 'negative'): void {
  const list = kind === 'positive' ? [...props.positiveExamples] : [...props.negativeExamples]
  if (list.length >= EXAMPLES_MAX) return
  list.push('')
  if (kind === 'positive') emit('update:positiveExamples', list)
  else emit('update:negativeExamples', list)
}

function removeExample(kind: 'positive' | 'negative', index: number): void {
  const list = kind === 'positive' ? [...props.positiveExamples] : [...props.negativeExamples]
  list.splice(index, 1)
  if (kind === 'positive') emit('update:positiveExamples', list)
  else emit('update:negativeExamples', list)
}

function updateExample(kind: 'positive' | 'negative', index: number, value: string): void {
  const list = kind === 'positive' ? [...props.positiveExamples] : [...props.negativeExamples]
  list[index] = value
  if (kind === 'positive') emit('update:positiveExamples', list)
  else emit('update:negativeExamples', list)
}

async function polishWithAI(): Promise<void> {
  if (polishing.value) return
  polishing.value = true
  try {
    const r = await configApi.semanticsSuggest({
      kind: props.kind,
      title: props.title,
      brief: props.brief,
      content: props.content,
      extra: props.extra,
    })
    const sem = r?.semantics
    if (sem) {
      if (sem.title) emit('update:title', sem.title)
      if (sem.brief) emit('update:brief', sem.brief)
      if (sem.positive_examples?.length) emit('update:positiveExamples', sem.positive_examples)
      if (sem.negative_examples?.length) emit('update:negativeExamples', sem.negative_examples)
    }
  } catch { /* 润色失败保持表单原样 */ } finally {
    polishing.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end -mb-1">
      <button
        class="flex items-center gap-1 px-2 py-1 text-2xs font-medium rounded-lg bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20 transition-colors disabled:opacity-60"
        :disabled="polishing"
        title="按全站规范自动生成名称/描述/正负范例"
        @click="polishWithAI"
      >
        <Loader2 v-if="polishing" :size="12" class="animate-spin" />
        <Sparkles v-else :size="12" />
        AI 规范润色
      </button>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">
          名称 *
          <span class="ml-1 font-normal" :class="titleClass">{{ titleCount }}/10</span>
        </label>
        <input
          :value="title" type="text" maxlength="20"
          class="w-full px-3 py-2 text-sm rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-1 focus:ring-brian-blue"
          :placeholder="titlePlaceholder"
          @input="emit('update:title', ($event.target as HTMLInputElement).value)"
        />
        <p class="text-4xs text-apple-gray-400 mt-0.5">5-10 字，突出核心功能，禁用“助手/Agent”后缀</p>
      </div>
      <div>
        <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">
          描述 *
          <span class="ml-1 font-normal" :class="briefClass">{{ briefCount }}/40</span>
        </label>
        <input
          :value="brief" type="text" maxlength="80"
          class="w-full px-3 py-2 text-sm rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-1 focus:ring-brian-blue"
          :placeholder="briefPlaceholder"
          @input="emit('update:brief', ($event.target as HTMLInputElement).value)"
        />
        <p class="text-4xs text-apple-gray-400 mt-0.5">30-40 字，一段话包含输入/输出/功能定义</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label class="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">正面范例 ({{ positiveExamples.length }})</label>
          <button class="flex items-center gap-0.5 px-1.5 py-0.5 text-4xs rounded text-success-green hover:bg-success-green/10 transition-colors" :disabled="positiveExamples.length >= EXAMPLES_MAX" @click="addExample('positive')">
            <Plus :size="11" /> 添加
          </button>
        </div>
        <div v-for="(ex, i) in positiveExamples" :key="`p${i}`" class="flex items-center gap-1 mb-1.5">
          <input
            :value="ex" type="text" maxlength="20"
            class="flex-1 px-2 py-1 text-xs rounded-md border bg-white dark:bg-apple-gray-900 focus:outline-none focus:ring-1 focus:ring-brian-blue"
            :class="exampleWarn(ex) ? 'border-error-red text-error-red' : 'border-apple-gray-200 dark:border-apple-gray-700'"
            placeholder="典型用户请求 ≤15字"
            @input="updateExample('positive', i, ($event.target as HTMLInputElement).value)"
          />
          <button class="p-1 text-apple-gray-400 hover:text-error-red rounded transition-colors" @click="removeExample('positive', i)"><X :size="12" /></button>
        </div>
        <p class="text-4xs text-apple-gray-400">3-5 条精准匹配职责的用户原话</p>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label class="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">负面范例 ({{ negativeExamples.length }})</label>
          <button class="flex items-center gap-0.5 px-1.5 py-0.5 text-4xs rounded text-error-red hover:bg-error-red/10 transition-colors" :disabled="negativeExamples.length >= EXAMPLES_MAX" @click="addExample('negative')">
            <Plus :size="11" /> 添加
          </button>
        </div>
        <div v-for="(ex, i) in negativeExamples" :key="`n${i}`" class="flex items-center gap-1 mb-1.5">
          <input
            :value="ex" type="text" maxlength="20"
            class="flex-1 px-2 py-1 text-xs rounded-md border bg-white dark:bg-apple-gray-900 focus:outline-none focus:ring-1 focus:ring-brian-blue"
            :class="exampleWarn(ex) ? 'border-error-red text-error-red' : 'border-apple-gray-200 dark:border-apple-gray-700'"
            placeholder="应由其他组件处理 ≤15字"
            @input="updateExample('negative', i, ($event.target as HTMLInputElement).value)"
          />
          <button class="p-1 text-apple-gray-400 hover:text-error-red rounded transition-colors" @click="removeExample('negative', i)"><X :size="12" /></button>
        </div>
        <p class="text-4xs text-apple-gray-400">3-5 条易混淆请求，用于语义路由排除</p>
      </div>
    </div>
  </div>
</template>
