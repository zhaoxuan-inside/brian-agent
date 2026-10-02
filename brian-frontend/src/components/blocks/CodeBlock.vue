<script setup lang="ts">
import { ref, computed } from 'vue'
import { Copy, Check } from '@lucide/vue'
import type { CodeBlock } from '@/api/types'
import { copyToClipboard } from '@/utils/clipboard'

const props = defineProps<{ block: CodeBlock }>()
const copied = ref(false)

async function copyCode() {
  const success = await copyToClipboard(props.block.content)
  if (success) {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

const _isStreaming = computed(() => props.block.meta.status === 'streaming')
</script>

<template>
  <div class="py-1">
    <div class="chat-card overflow-hidden">
      <div class="flex items-center justify-between px-3 py-1.5 bg-chat-surface-2 border-b border-chat-hairline">
        <span class="text-xs text-chat-ink-subtle font-medium">{{ block.language || 'code' }}</span>
        <button
          class="flex items-center gap-1 text-xs text-chat-ink-tertiary hover:text-chat-primary-hover transition-colors"
          @click="copyCode"
        >
          <Check v-if="copied" :size="12" class="text-chat-success" />
          <Copy v-else :size="12" />
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
      <pre class="px-4 py-3 overflow-x-auto text-sm text-chat-ink"><code :class="block.language ? `language-${block.language}` : ''">{{ block.content }}</code></pre>
    </div>
  </div>
</template>
