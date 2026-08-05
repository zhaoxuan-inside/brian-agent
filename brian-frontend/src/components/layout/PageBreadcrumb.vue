<script setup lang="ts">
import { ref } from 'vue'
import { ChevronRight, Copy, Check } from '@lucide/vue'

const props = defineProps<{ path: string[] }>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function copyPath() {
  const text = props.path.join(' > ')
  const onSuccess = () => {
    copied.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { copied.value = false }, 2000)
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => { /* ignore */ })
  } else {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try { document.execCommand('copy'); onSuccess() } catch { /* ignore */ }
    document.body.removeChild(textarea)
  }
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <template v-for="(item, idx) in path" :key="idx">
      <ChevronRight v-if="idx > 0" :size="12" class="text-apple-gray-400 flex-shrink-0" />
      <span class="text-sm text-apple-gray-600 dark:text-apple-gray-300">{{ item }}</span>
    </template>
    <button
      class="ml-1 p-1 rounded text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 transition-colors flex-shrink-0"
      title="复制路径"
      @click="copyPath"
    >
      <Check v-if="copied" :size="13" class="text-success-green" />
      <Copy v-else :size="13" />
    </button>
  </div>
</template>
