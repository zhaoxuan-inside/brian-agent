<script setup lang="ts">
import { computed } from 'vue'
import type { TextBlock, HeadingBlock } from '@/api/types'
import { createThrottledMarkdownRenderer } from '@/utils/markdown'

const props = defineProps<{ block: TextBlock | HeadingBlock }>()

const isStreaming = computed(() => props.block.meta.status === 'streaming')
const isHeading = computed(() => props.block.type === 'Heading')
const headingLevel = computed(() => isHeading.value ? (props.block as HeadingBlock).level || 2 : null)

const getDisplayHtml = createThrottledMarkdownRenderer(300)

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
      class="chat-card px-4 py-2.5"
      :class="[
        isHeading ? headingClasses : 'text-sm leading-relaxed',
        block.meta.status === 'error' ? 'border-chat-error/30 bg-chat-error/5' : ''
      ]"
      :aria-live="isStreaming ? 'polite' : undefined"
    >
      <div v-if="'citingIds' in block && block.citingIds?.length" class="flex flex-wrap gap-1 mb-1.5">
        <span
          v-for="cid in block.citingIds"
          :key="cid"
          class="px-1.5 py-0.5 text-xs rounded-chat-sm bg-chat-primary/10 text-chat-primary-hover cursor-pointer hover:bg-chat-primary/20"
        >{{ cid.slice(-8) }}</span>
      </div>

      <p
        v-if="isHeading"
        class="whitespace-pre-wrap"
        :class="block.meta.status === 'error' ? 'text-chat-error/70' : ''"
      >
        {{ 'content' in block ? block.content : '' }}
      </p>
      <div
        v-else
        class="markdown-body text-sm leading-relaxed break-words"
        :class="block.meta.status === 'error' ? 'text-chat-error/70' : ''"
        v-html="getDisplayHtml('content' in block ? block.content : '', isStreaming)"
      />
      <span v-if="isStreaming" class="inline-block w-1.5 h-4 bg-chat-primary-hover animate-cursor-blink align-middle ml-0.5" />

      <div v-if="'citedCount' in block && block.citedCount && block.citedCount > 0" class="mt-2 flex items-center">
        <span class="text-xs text-chat-ink-tertiary">{{ block.citedCount }} 次引用</span>
      </div>
    </div>
  </div>
</template>
