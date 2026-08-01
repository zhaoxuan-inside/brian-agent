<script setup lang="ts">
import type { Block } from '@/api/types'

defineProps<{ block: Block }>()
</script>

<template>
  <div class="py-1">
    <div class="block-card border-dashed border-apple-gray-300 dark:border-apple-gray-600 px-3 py-2">
      <p class="text-xs text-apple-gray-400">不支持的内容类型: {{ block.type }}</p>
    </div>
  </div>
</template>
