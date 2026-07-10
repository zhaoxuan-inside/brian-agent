<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: number
  availableYears: number[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const currentIndex = computed(() => props.availableYears.indexOf(props.modelValue))
const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < props.availableYears.length - 1)

function changeYear(dir: number) {
  const newIndex = currentIndex.value + dir
  if (newIndex >= 0 && newIndex < props.availableYears.length) {
    emit('update:modelValue', props.availableYears[newIndex])
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <div
      class="opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
      :class="{ 'opacity-0 pointer-events-none': !hasPrev }"
      @click="changeYear(-1)"
    >
      <svg viewBox="0 0 24 24" class="w-5 h-5 text-apple-gray-500" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M15 19l-7-7 7-7"/>
      </svg>
    </div>
    <span class="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">{{ modelValue }}</span>
    <div
      class="opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
      :class="{ 'opacity-0 pointer-events-none': !hasNext }"
      @click="changeYear(1)"
    >
      <svg viewBox="0 0 24 24" class="w-5 h-5 text-apple-gray-500" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M9 5l7 7-7 7"/>
      </svg>
    </div>
  </div>
</template>