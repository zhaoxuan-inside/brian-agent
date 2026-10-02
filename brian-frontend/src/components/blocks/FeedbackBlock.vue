<script setup lang="ts">
import { ref } from 'vue'
import { ThumbsUp, ThumbsDown, Star, Copy, Check } from '@lucide/vue'
import { feedbackApi } from '@/api'
import type { FeedbackBlock } from '@/api/types'
import { copyToClipboard } from '@/utils/clipboard'

const props = defineProps<{ block: FeedbackBlock }>()
const rating = ref(0)
const hoveredRating = ref(0)
const submitted = ref(false)
const copied = ref(false)

async function submitRating(score: number) {
  if (submitted.value) return
  rating.value = score
  try {
    await feedbackApi.submit({
      rating: score,
      run_id: props.block.runId || undefined,
      work_id: props.block.workId || undefined,
      session_id: props.block.sessionId || undefined,
    })
    submitted.value = true
  } catch { /* ignore */ }
}

async function submitLike(type: 'like' | 'dislike') {
  if (submitted.value) return
  try {
    await feedbackApi.submit({
      rating: type === 'like' ? 5 : 1,
      run_id: props.block.runId || undefined,
      work_id: props.block.workId || undefined,
      session_id: props.block.sessionId || undefined,
    })
    submitted.value = true
  } catch { /* ignore */ }
}

async function copyTraceId() {
  const traceId = props.block.traceId
  if (!traceId) return
  const success = await copyToClipboard(traceId)
  if (success) {
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  }
}
</script>

<template>
  <div class="py-1">
    <div class="flex items-center gap-2 px-2 flex-wrap">
      <template v-if="submitted">
        <span class="text-xs text-chat-ink-tertiary">感谢反馈</span>
      </template>
      <template v-else>
        <div class="flex items-center gap-1">
          <button
            v-for="i in 5"
            :key="i"
            class="p-0.5 transition-colors"
            :class="(hoveredRating || rating) >= i ? 'text-chat-warning' : 'text-chat-ink-tertiary'"
            @click="submitRating(i)"
            @mouseenter="hoveredRating = i"
            @mouseleave="hoveredRating = 0"
          >
            <Star :size="14" :fill="(hoveredRating || rating) >= i ? 'currentColor' : 'none'" />
          </button>
        </div>
        <div class="w-px h-4 bg-chat-hairline-strong" />
        <button class="p-1 rounded-chat-sm text-chat-ink-tertiary hover:text-chat-primary-hover hover:bg-chat-surface-2 transition-colors" @click="submitLike('like')">
          <ThumbsUp :size="14" />
        </button>
        <button class="p-1 rounded-chat-sm text-chat-ink-tertiary hover:text-chat-error hover:bg-chat-surface-2 transition-colors" @click="submitLike('dislike')">
          <ThumbsDown :size="14" />
        </button>
      </template>

      <button
        v-if="block.traceId"
        class="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-chat-sm text-xs text-chat-ink-tertiary hover:text-chat-primary-hover hover:bg-chat-surface-2 transition-colors"
        @click="copyTraceId"
      >
        <component :is="copied ? Check : Copy" :size="12" />
        {{ copied ? '已复制' : '复制 TraceId' }}
      </button>
    </div>
  </div>
</template>
