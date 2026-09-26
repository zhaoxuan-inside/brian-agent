<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X, Check, Loader2, Wand2, CalendarClock, AlertCircle } from '@lucide/vue'
import { cronToolApi } from '@/api'
import type { CronFields } from '@/api'

const props = defineProps<{
  visible: boolean
  title?: string
  expression: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', cron: string): void
}>()

const FIELD_DEFS: Array<{ key: keyof CronFields; label: string; placeholder: string }> = [
  { key: 'second', label: '秒', placeholder: '0-59，* 表示任意' },
  { key: 'minute', label: '分', placeholder: '0-59' },
  { key: 'hour', label: '时', placeholder: '0-23' },
  { key: 'day', label: '日', placeholder: '1-31' },
  { key: 'month', label: '月', placeholder: '1-12' },
  { key: 'week', label: '周', placeholder: '0-6（0=周日）' },
]

const manual = ref('')
const fields = ref<CronFields>({ second: '*', minute: '*', hour: '*', day: '*', month: '*', week: '*' })
const checkResult = ref<{ valid: boolean; error: string; normalized: string }>({ valid: true, error: '', normalized: '' })
const nextTime = ref<number | null>(null)
const checking = ref(false)
const error = ref('')

const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-apple-gray-200 dark:border-apple-gray-600 bg-transparent text-apple-gray-800 dark:text-apple-gray-200 focus:outline-none focus:ring-1 focus:ring-brian-blue'

watch(() => props.visible, (v) => {
  if (v) {
    manual.value = props.expression || ''
    error.value = ''
    void parseToFields()
    void validate()
  }
})

async function validate() {
  checking.value = true
  error.value = ''
  try {
    const r = await cronToolApi.check(manual.value)
    checkResult.value = r
    if (r.valid) {
      nextTime.value = (await cronToolApi.next(r.normalized)).next_time
    } else {
      nextTime.value = null
      error.value = r.error
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '校验失败'
  } finally {
    checking.value = false
  }
}

async function parseToFields() {
  try {
    const r = await cronToolApi.parse(manual.value)
    if (r.valid && r.fields) {
      fields.value = r.fields
    }
  } catch { /* ignore */ }
}

async function generateFromFields() {
  error.value = ''
  try {
    const r = await cronToolApi.generate(fields.value)
    if (r.valid) {
      manual.value = r.expression
      await validate()
    } else {
      error.value = r.error
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '生成失败'
  }
}

function onManualInput() {
  void validate()
}

function formatTime(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

const canSave = computed(() => checkResult.value.valid && manual.value.trim() !== '')

function save() {
  if (!canSave.value) return
  emit('save', checkResult.value.normalized || manual.value.trim())
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-modal flex items-center justify-center bg-black/50 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div class="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 w-full max-w-lg mx-4 overflow-hidden">
        <div class="px-5 py-3.5 border-b border-apple-gray-200 dark:border-apple-gray-700 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <CalendarClock :size="16" class="text-brian-blue" />
            <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ title || '定时时间配置' }}</h3>
          </div>
          <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <div class="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label class="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 block mb-1.5">Cron 表达式（秒 分 时 日 月 周）</label>
            <input
              v-model="manual"
              type="text"
              placeholder="0 0 2 * * *"
              :class="inputClass + ' font-mono'"
              @input="onManualInput"
            />
            <div v-if="error" class="flex items-center gap-1.5 mt-1.5 text-xs text-error-red">
              <AlertCircle :size="12" /> {{ error }}
            </div>
            <div v-else-if="checkResult.valid && manual.trim()" class="mt-1.5 text-xs text-apple-gray-400">
              下次执行：{{ formatTime(nextTime) }}
            </div>
          </div>

          <div class="rounded-xl border border-apple-gray-100 dark:border-apple-gray-700 p-3">
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">通过时间字段生成</label>
              <button
                class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors"
                @click="generateFromFields"
              >
                <Wand2 :size="13" /> 生成表达式
              </button>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div v-for="f in FIELD_DEFS" :key="f.key" class="space-y-1">
                <label class="text-2xs text-apple-gray-400 block">{{ f.label }}</label>
                <input
                  v-model="fields[f.key]"
                  type="text"
                  :placeholder="f.placeholder"
                  class="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-apple-gray-200 dark:border-apple-gray-600 bg-transparent text-apple-gray-700 dark:text-apple-gray-300 focus:outline-none focus:ring-1 focus:ring-brian-blue"
                />
              </div>
            </div>
            <p class="text-4xs text-apple-gray-400 mt-2">支持 *（任意）、单值、列表（1,15,30）、区间（10-20）、步长（*/5）</p>
          </div>
        </div>

        <div class="px-5 py-3 border-t border-apple-gray-200 dark:border-apple-gray-700 flex items-center justify-end gap-2">
          <button class="px-4 py-2 text-sm rounded-lg text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="emit('close')">
            取消
          </button>
          <button
            class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50 transition-colors"
            :disabled="!canSave || checking"
            @click="save"
          >
            <Loader2 v-if="checking" :size="14" class="animate-spin" />
            <Check v-else :size="14" />
            确定
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
