<script setup lang="ts">
import { computed } from 'vue'
import { Brain, Loader2, ChevronRight } from '@lucide/vue'
import { useChatUiStore } from '@/stores/chatUi'
import { useSessionStore } from '@/stores/session'
import { useObservationSummary } from '@/composables/useObservationSummary'

/**
 * 流式期间的轻量思考入口（ADR-013）。
 * 数据只读自 chatUi.observation；本组件仅渲染与开弹窗，逻辑在 composable。
 */
const props = defineProps<{
  /** 紧凑模式（聊天区流式提示条）还是完整模式 */
  compact?: boolean
}>()

const chatUi = useChatUiStore()
const sessionStore = useSessionStore()

const summary = useObservationSummary()

const lastUser = computed(() => {
  const msgs = sessionStore.messages
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    if (msgs[i].role === 'user') return msgs[i]
  }
  return null
})

function open() {
  const target = lastUser.value
  if (target) {
    const el = document.querySelector(`[data-thinking-id="${target.id}"]`) as HTMLElement | null
    if (el) {
      const r = el.getBoundingClientRect()
      chatUi.setThinkingOrigin({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
  } else {
    chatUi.setThinkingOrigin(null)
  }
  chatUi.ensureLiveThinking()
}

defineExpose({ open })
</script>

<template>
  <button
    class="live-pill inline-flex items-center gap-2 rounded-chat-pill border border-chat-primary/30 bg-chat-primary/10 px-3 py-1.5 text-xs text-chat-primary-hover hover:bg-chat-primary/20 transition-colors"
    :class="{ 'live-pill--compact': props.compact }"
    title="查看实时思考过程"
    @click="open"
  >
    <Loader2 v-if="summary.streaming" :size="13" class="animate-spin" />
    <Brain v-else :size="13" />
    <span class="font-medium">{{ summary.pillText }}</span>
    <ChevronRight :size="12" class="opacity-60" />
  </button>
</template>

<style scoped>
.live-pill {
  height: 28px;
}
.live-pill--compact {
  height: 24px;
  padding-top: 2px;
  padding-bottom: 2px;
}
</style>
