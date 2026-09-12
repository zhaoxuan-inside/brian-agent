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
      class="group flex items-center gap-2 max-w-[85%] pl-2.5 pr-1.5 py-1 rounded-full border text-xs transition-all
        bg-apple-gray-50 dark:bg-apple-gray-800/60 border-apple-gray-200 dark:border-apple-gray-700
        hover:border-brian-blue/40 hover:bg-brian-blue/5"
      title="点击查看思考过程"
      @click="emit('view')"
    >
      <component
        :is="isAllowed ? ShieldCheck : ShieldX"
        :size="13"
        class="flex-shrink-0"
        :class="isAllowed ? 'text-success-green' : 'text-error-red'"
      />
      <span class="text-apple-gray-500 dark:text-apple-gray-400 truncate">
        {{ permission.toolId }}
      </span>
      <span
        class="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
        :class="isAllowed
          ? 'bg-success-green/10 text-success-green'
          : 'bg-error-red/10 text-error-red'"
      >
        {{ isAllowed ? '已允许' : '已拒绝' }}
      </span>
      <span v-if="formatTime(permission.answeredAt || permission.askedAt)" class="flex-shrink-0 text-[10px] text-apple-gray-300 hidden sm:inline">
        {{ formatTime(permission.answeredAt || permission.askedAt) }}
      </span>
      <span class="flex-shrink-0 flex items-center gap-0.5 text-[10px] text-brian-blue opacity-70 group-hover:opacity-100">
        思考过程
        <ChevronRight :size="11" />
      </span>
    </button>
  </div>
</template>
