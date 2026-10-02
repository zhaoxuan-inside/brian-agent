<script setup lang="ts">
import type { Block } from '@/api/types'

defineProps<{ block: Block }>()
</script>

<template>
  <div class="py-1">
    <div class="chat-card border-dashed border-chat-hairline-strong px-3 py-2">
      <p class="text-xs text-chat-ink-tertiary">不支持的内容类型: {{ block.type }}</p>
    </div>
  </div>
</template>
