<script setup lang="ts">
import { computed } from 'vue'
import type { Block } from '@/api/types'
import TextBlockView from './TextBlock.vue'
import CodeBlockView from './CodeBlock.vue'
import ThinkingBlockView from './ThinkingBlock.vue'
// ===== 原始代码（保留作为参考）：ToolInvocation 曾在对话区渲染状态圆球（ToolCallBlockView） =====
// import ToolCallBlockView from './ToolCallBlock.vue'
import ErrorBlockView from './ErrorBlock.vue'
import FallbackBlockView from './FallbackBlock.vue'
import FeedbackBlockView from './FeedbackBlock.vue'

// ===== 修改后（2026-09-24 用户反馈）：对话区不再渲染工具执行圆球 =====
// 工具执行状态统一在「思考过程」弹窗内展示（ThinkingModal 的 toolTraces/timeline 完整承载
// 工具名/参数/响应，实时与历史回放一致）；对话区仅保留文本、代码与结论本身。
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
