<script setup lang="ts">
import { computed } from 'vue'
import { Brain, Check, Loader2, ShieldCheck, X } from '@lucide/vue'
import type { PermissionCardData } from '@/api/types'

const props = defineProps<{
  permission: PermissionCardData
  submitting: boolean
}>()

const emit = defineEmits<{
  confirm: [approved: boolean, remember: boolean]
}>()

const argsText = computed(() => {
  const raw = props.permission.input
  if (raw == null || raw === '') return '（无参数）'
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    return typeof obj === 'string' ? obj : JSON.stringify(obj)
  } catch {
    return String(raw)
  }
})

const statusMeta = computed(() => {
  switch (props.permission.status) {
    case 'allowed': return { text: '已允许', cls: 'text-success-green dark:text-success-green/80' }
    case 'denied': return { text: '已拒绝', cls: 'text-error-red dark:text-error-red/80' }
    default: return { text: '等待授权', cls: 'text-apple-gray-500 dark:text-apple-gray-400' }
  }
})

const interactive = computed(() => props.permission.status === 'pending' && !props.submitting)
</script>

<template>
  <div class="flex items-start gap-2 justify-end">
    <div class="max-w-[85%] min-w-0">
      <div class="rounded-2xl bg-white dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 shadow-sm overflow-hidden">
        <div class="px-4 py-3 border-b border-apple-gray-100 dark:border-apple-gray-800 flex items-center gap-2">
          <ShieldCheck :size="16" class="text-brian-blue" />
          <div class="min-w-0">
            <p class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-100">技能执行授权</p>
            <p class="text-xs text-apple-gray-400 mt-0.5">Agent 请求执行 {{ permission.toolId }}，需要你的授权</p>
          </div>
          <span class="ml-auto flex-shrink-0 text-xs font-medium" :class="statusMeta.cls">{{ statusMeta.text }}</span>
        </div>
        <div class="px-4 py-3 text-sm">
          <p class="text-xs text-apple-gray-400 mb-1">工具</p>
          <p class="text-apple-gray-700 dark:text-apple-gray-200 font-mono">{{ permission.toolId }}</p>
          <p class="text-xs text-apple-gray-400 mt-2 mb-1">参数</p>
          <p class="text-apple-gray-700 dark:text-apple-gray-200 break-all whitespace-pre-wrap font-mono text-xs max-h-24 overflow-y-auto">{{ argsText }}</p>
        </div>
        <div v-if="permission.status === 'pending'" class="px-4 py-3 border-t border-apple-gray-100 dark:border-apple-gray-800 flex items-center justify-end gap-2">
          <button
            class="px-3 py-1.5 rounded-lg text-sm text-error-red dark:text-error-red/80 hover:bg-error-red/10 dark:hover:bg-error-red/10 disabled:opacity-50 flex items-center gap-1"
            :disabled="!interactive"
            @click="emit('confirm', false, false)"
          >
            <X v-if="submitting" :size="14" class="animate-spin" />
            拒绝
          </button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm text-brian-blue hover:bg-brian-blue/10 disabled:opacity-50 flex items-center gap-1"
            title="以后执行该技能不再询问"
            :disabled="!interactive"
            @click="emit('confirm', true, true)"
          >
            始终允许
          </button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm text-white bg-brian-blue hover:bg-brian-blue/90 disabled:opacity-50 flex items-center gap-1"
            :disabled="!interactive"
            @click="emit('confirm', true, false)"
          >
            <Loader2 v-if="submitting" :size="14" class="animate-spin" />
            <Check v-else :size="14" />
            允许
          </button>
        </div>
      </div>
    </div>
    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-brian-blue/15 dark:bg-brian-blue/40 text-brian-blue dark:text-brian-blue/70 flex items-center justify-center mt-1">
      <Brain :size="16" />
    </div>
  </div>
</template>
