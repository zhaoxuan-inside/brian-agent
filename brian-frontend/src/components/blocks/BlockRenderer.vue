<script setup lang="ts">
import { computed } from 'vue'
import type { Block } from '@/api/types'
import TextBlockView from './TextBlock.vue'
import CodeBlockView from './CodeBlock.vue'
import ThinkingBlockView from './ThinkingBlock.vue'
import ErrorBlockView from './ErrorBlock.vue'
import FallbackBlockView from './FallbackBlock.vue'
import FeedbackBlockView from './FeedbackBlock.vue'

const _props = defineProps<{ block: Block }>()
const isToolBlock = computed(() => _props.block.type === 'ToolInvocation')
</script>

<template>
  <component
    v-if="!isToolBlock"
    :is="
      block.type === 'TextParagraph' || block.type === 'Heading' ? TextBlockView :
      block.type === 'CodeBlock' ? CodeBlockView :
      block.type === 'ThinkingChain' ? ThinkingBlockView :
      block.type === 'ErrorFallback' ? ErrorBlockView :
      block.type === 'Feedback' ? FeedbackBlockView :
      FallbackBlockView
    "
    :block="block"
  />
  <template v-else />
</template>
