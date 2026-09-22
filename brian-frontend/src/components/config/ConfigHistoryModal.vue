<script setup lang="ts">
import { ref, watch } from 'vue'
import { History, Loader2, X } from '@lucide/vue'
import { configApi } from '@/api'
import type { ConfigHistoryRecord } from '@/api/types'
import ConfigValueDiff from './ConfigValueDiff.vue'

/**
 * 配置变更历史弹窗（TODO-List §2：`getConfigHistory` GET 消费端）。
 * 按配置项拉取变更记录（change_time 降序），每条渲染 old→new Diff。
 */
const props = defineProps<{
  configKey: string
  configName: string
}>()

const emit = defineEmits<{ close: [] }>()

const loading = ref(false)
const records = ref<ConfigHistoryRecord[]>([])
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await configApi.history.forKey(props.configKey)
    records.value = res.records ?? []
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载变更历史失败'
  } finally {
    loading.value = false
  }
}

watch(() => props.configKey, () => { if (props.configKey) load() }, { immediate: true })

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="emit('close')">
    <div class="bg-white dark:bg-apple-gray-900 rounded-2xl shadow-xl w-[560px] max-w-[92vw] max-h-[80vh] flex flex-col overflow-hidden">
      <div class="px-5 py-4 border-b border-apple-gray-100 dark:border-apple-gray-800 flex items-center gap-2">
        <History :size="16" class="text-brian-blue" />
        <div class="min-w-0">
          <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">变更历史</h3>
          <p class="text-xs text-apple-gray-400 truncate mt-0.5">{{ configName }}（{{ configKey }}）</p>
        </div>
        <button class="ml-auto p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="emit('close')">
          <X :size="16" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        <div v-if="loading" class="flex items-center justify-center gap-2 py-8 text-apple-gray-400">
          <Loader2 :size="16" class="animate-spin" />加载中…
        </div>
        <div v-else-if="error" class="text-sm text-red-500 py-4 text-center">{{ error }}</div>
        <div v-else-if="records.length === 0" class="text-sm text-apple-gray-400 py-8 text-center">暂无变更记录</div>
        <div
          v-for="r in records"
          :key="r.id"
          class="rounded-xl border border-apple-gray-100 dark:border-apple-gray-800 px-3 py-2.5 space-y-2"
        >
          <div class="flex items-center justify-between text-xs text-apple-gray-400">
            <span>{{ formatTime(r.change_time) }}</span>
            <span>{{ r.operator === 'user' ? '手动修改' : r.operator }}</span>
          </div>
          <ConfigValueDiff :old-value="r.old_value" :new-value="r.new_value" />
        </div>
      </div>
    </div>
  </div>
</template>
