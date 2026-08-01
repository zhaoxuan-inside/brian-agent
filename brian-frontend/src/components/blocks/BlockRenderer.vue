<script setup lang="ts">
import type { Block, TextBlock, HeadingBlock, CodeBlock, ThinkingBlock, ToolCallBlock, ArtifactBlock, ErrorBlock, UnsupportedBlock, FeedbackBlock } from '@/api/types'
import TextBlockView from './TextBlock.vue'
import CodeBlockView from './CodeBlock.vue'
import ThinkingBlockView from './ThinkingBlock.vue'
import ToolCallBlockView from './ToolCallBlock.vue'
import ErrorBlockView from './ErrorBlock.vue'
import FallbackBlockView from './FallbackBlock.vue'
import FeedbackBlockView from './FeedbackBlock.vue'

const props = defineProps<{ block: Block }>()
</script>

<template>
  <component
    :is="
      block.type === 'TextParagraph' || block.type === 'Heading' ? TextBlockView :
      block.type === 'CodeBlock' ? CodeBlockView :
      block.type === 'ThinkingChain' ? ThinkingBlockView :
      block.type === 'ToolInvocation' ? ToolCallBlockView :
      block.type === 'ErrorFallback' ? ErrorBlockView :
      block.type === 'Feedback' ? FeedbackBlockView :
      FallbackBlockView
    "
    :block="block"
  />
</template>
