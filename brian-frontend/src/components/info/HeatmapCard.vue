<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

const props = defineProps<{
  cells: { day: number | null; count: number }[]
  year: number
  month: number
  unit: string
  activeDay?: number | null
  canGoNext?: boolean
}>()

const emit = defineEmits<{
  select: [day: number | null]
  prev: []
  next: []
}>()

const maxCount = computed(() => Math.max(0, ...props.cells.map(c => c.count)))

function cellColor(count: number): string {
  if (count <= 0) return 'bg-apple-gray-100 dark:bg-apple-gray-800'
  const r = count / (maxCount.value || 1)
  if (r < 0.25) return 'bg-brian-blue/20'
  if (r < 0.5) return 'bg-brian-blue/40'
  if (r < 0.75) return 'bg-brian-blue/70'
  return 'bg-brian-blue'
}
</script>

<template>
  <div class="fixed bottom-6 left-6 z-20 w-32 bg-white/80 dark:bg-apple-gray-900/80 backdrop-blur-sm rounded-xl p-1.5 shadow-sm">
    <div class="grid grid-cols-7 gap-1">
      <div
        v-for="(cell, i) in cells"
        :key="i"
        :title="cell.day ? `${cell.day}日: ${cell.count} ${unit}` : ''"
        class="aspect-square rounded-[3px]"
        :class="[
          cell.day ? cellColor(cell.count) : 'bg-transparent',
          cell.day ? 'cursor-pointer hover:ring-2 hover:ring-brian-blue/60' : '',
          cell.day && activeDay === cell.day ? 'ring-2 ring-brian-blue' : '',
        ]"
        @click="emit('select', cell.day)"
      />
    </div>
    <div class="flex items-center justify-between mt-2">
      <button
        class="p-0.5 rounded text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 transition-colors"
        @click="emit('prev')"
      >
        <ChevronLeft :size="14" />
      </button>
      <span class="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">{{ year }}/{{ String(month).padStart(2, '0') }}</span>
      <button
        class="p-0.5 rounded transition-colors"
        :class="canGoNext ? 'text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10' : 'text-apple-gray-300 cursor-not-allowed'"
        :disabled="!canGoNext"
        @click="emit('next')"
      >
        <ChevronRight :size="14" />
      </button>
    </div>
  </div>
</template>
