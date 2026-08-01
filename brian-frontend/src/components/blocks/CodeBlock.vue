<script setup lang="ts">
import { ref, computed } from 'vue'
import { Copy, Check } from '@lucide/vue'
import type { CodeBlock } from '@/api/types'

const props = defineProps<{ block: CodeBlock }>()
const copied = ref(false)

function copyCode() {
  navigator.clipboard.writeText(props.block.content).then(() => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  })
}

const isStreaming = computed(() => props.block.meta.status === 'streaming')
</script>

<template>
  <div class="py-1">
    <div class="block-card overflow-hidden">
      <div class="flex items-center justify-between px-3 py-1.5 bg-apple-gray-100 dark:bg-apple-gray-900 border-b border-apple-gray-200 dark:border-apple-gray-700">
        <span class="text-xs text-apple-gray-500 font-medium">{{ block.language || 'code' }}</span>
        <button
          class="flex items-center gap-1 text-xs text-apple-gray-400 hover:text-brian-blue transition-colors"
          @click="copyCode"
        >
          <Check v-if="copied" :size="12" class="text-success-green" />
          <Copy v-else :size="12" />
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
      <pre class="px-4 py-3 overflow-x-auto text-sm"><code :class="block.language ? `language-${block.language}` : ''">{{ block.content }}</code></pre>
    </div>
  </div>
</template>
