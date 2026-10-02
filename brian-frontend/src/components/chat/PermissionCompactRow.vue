<script setup lang="ts">
import { computed } from 'vue'
import { ShieldCheck, ShieldX, ChevronRight } from '@lucide/vue'
import type { PermissionCardData } from '@/api/types'

const props = defineProps<{
  permission: PermissionCardData
}>()

const emit = defineEmits<{
  view: []
}>()

const isAllowed = computed(() => props.permission.status === 'allowed')

function formatTime(ts?: number) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
</script>

<template>
  <div class="flex justify-end">
    <button
      class="group flex items-center gap-2 max-w-[85%] pl-2.5 pr-1.5 py-1 rounded-chat-pill border text-xs transition-all
        bg-chat-surface-2 border-chat-hairline
        hover:border-chat-primary/40 hover:bg-chat-primary/10"
      title="点击查看思考过程"
      @click="emit('view')"
    >
      <component
        :is="isAllowed ? ShieldCheck : ShieldX"
        :size="13"
        class="flex-shrink-0"
        :class="isAllowed ? 'text-chat-success' : 'text-chat-error'"
      />
      <span class="text-chat-ink-subtle truncate">
        {{ permission.toolId }}
      </span>
      <span
        class="flex-shrink-0 px-1.5 py-0.5 rounded-chat-pill text-4xs font-medium"
        :class="isAllowed
          ? 'bg-chat-success/10 text-chat-success'
          : 'bg-chat-error/10 text-chat-error'"
      >
        {{ isAllowed ? '已允许' : '已拒绝' }}
      </span>
      <span v-if="formatTime(permission.answeredAt || permission.askedAt)" class="flex-shrink-0 text-4xs text-chat-ink-tertiary hidden sm:inline">
        {{ formatTime(permission.answeredAt || permission.askedAt) }}
      </span>
      <span class="flex-shrink-0 flex items-center gap-0.5 text-4xs text-chat-primary-hover opacity-70 group-hover:opacity-100">
        思考过程
        <ChevronRight :size="11" />
      </span>
    </button>
  </div>
</template>
