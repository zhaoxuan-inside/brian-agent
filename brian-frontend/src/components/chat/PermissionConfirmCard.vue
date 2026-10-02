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
    case 'allowed': return { text: '已允许', cls: 'text-chat-success' }
    case 'denied': return { text: '已拒绝', cls: 'text-chat-error' }
    default: return { text: '等待授权', cls: 'text-chat-ink-subtle' }
  }
})

const interactive = computed(() => props.permission.status === 'pending' && !props.submitting)
</script>

<template>
  <div class="flex items-start gap-2 justify-end">
    <div class="max-w-[85%] min-w-0">
      <div class="chat-card overflow-hidden">
        <div class="px-4 py-3 border-b border-chat-hairline flex items-center gap-2">
          <ShieldCheck :size="16" class="text-chat-primary-hover" />
          <div class="min-w-0">
            <p class="text-sm font-semibold text-chat-ink">技能执行授权</p>
            <p class="text-xs text-chat-ink-tertiary mt-0.5">Agent 请求执行 {{ permission.toolId }}，需要你的授权</p>
          </div>
          <span class="ml-auto flex-shrink-0 text-xs font-medium" :class="statusMeta.cls">{{ statusMeta.text }}</span>
        </div>
        <div class="px-4 py-3 text-sm">
          <p class="text-xs text-chat-ink-tertiary mb-1">工具</p>
          <p class="text-chat-ink-muted font-mono">{{ permission.toolId }}</p>
          <p class="text-xs text-chat-ink-tertiary mt-2 mb-1">参数</p>
          <p class="text-chat-ink-muted break-all whitespace-pre-wrap font-mono text-xs max-h-24 overflow-y-auto">{{ argsText }}</p>
        </div>
        <div v-if="permission.status === 'pending'" class="px-4 py-3 border-t border-chat-hairline flex items-center justify-end gap-2">
          <button
            class="px-3 py-1.5 rounded-chat-md text-sm text-chat-error hover:bg-chat-error/10 disabled:opacity-50 flex items-center gap-1 transition-colors"
            :disabled="!interactive"
            @click="emit('confirm', false, false)"
          >
            <X v-if="submitting" :size="14" class="animate-spin" />
            拒绝
          </button>
          <button
            class="px-3 py-1.5 rounded-chat-md text-sm text-chat-primary-hover hover:bg-chat-primary/10 disabled:opacity-50 flex items-center gap-1 transition-colors"
            title="以后执行该技能不再询问"
            :disabled="!interactive"
            @click="emit('confirm', true, true)"
          >
            始终允许
          </button>
          <button
            class="px-3 py-1.5 rounded-chat-md text-sm text-chat-on-primary bg-chat-primary hover:bg-chat-primary-hover disabled:opacity-50 flex items-center gap-1 transition-colors"
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
    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-chat-primary/15 text-chat-primary-hover flex items-center justify-center mt-1">
      <Brain :size="16" />
    </div>
  </div>
</template>
