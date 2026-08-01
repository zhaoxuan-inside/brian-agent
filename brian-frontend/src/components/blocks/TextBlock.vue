<script setup lang="ts">
import { computed } from 'vue'
import type { TextBlock, HeadingBlock } from '@/api/types'

const props = defineProps<{ block: TextBlock | HeadingBlock }>()

const isStreaming = computed(() => props.block.meta.status === 'streaming')
const isHeading = computed(() => props.block.type === 'Heading')
const headingLevel = computed(() => isHeading.value ? (props.block as HeadingBlock).level || 2 : null)

const headingClasses = computed(() => {
  const lvl = headingLevel.value
  if (lvl === 1) return 'text-xl font-bold mb-3 mt-4'
  if (lvl === 2) return 'text-lg font-semibold mb-2 mt-3'
  if (lvl === 3) return 'text-base font-semibold mb-2 mt-3'
  return 'text-sm font-medium mb-1 mt-2'
})
</script>

<template>
  <div class="py-1">
    <div
      class="block-card px-4 py-2.5"
      :class="[
        isHeading ? headingClasses : 'text-sm leading-relaxed',
        block.meta.status === 'error' ? 'border-error-red/30 bg-error-red/5' : ''
      ]"
      :aria-live="isStreaming ? 'polite' : undefined"
    >
      <!-- Citing tags -->
      <div v-if="'citingIds' in block && block.citingIds?.length" class="flex flex-wrap gap-1 mb-1.5">
        <span
          v-for="cid in block.citingIds"
          :key="cid"
          class="px-1.5 py-0.5 text-xs rounded bg-brian-blue/10 text-brian-blue cursor-pointer hover:bg-brian-blue/20"
        >{{ cid.slice(-8) }}</span>
      </div>

      <!-- Content -->
      <p class="whitespace-pre-wrap" :class="block.meta.status === 'error' ? 'text-error-red/70' : ''">
        {{ 'content' in block ? block.content : '' }}
        <span v-if="isStreaming" class="inline-block w-1.5 h-4 bg-brian-blue animate-cursor-blink align-middle ml-0.5" />
      </p>

      <!-- Cited count badge -->
      <div v-if="'citedCount' in block && block.citedCount && block.citedCount > 0" class="mt-2 flex items-center">
        <span class="text-xs text-apple-gray-400">{{ block.citedCount }} 次引用</span>
      </div>
    </div>
  </div>
</template>
