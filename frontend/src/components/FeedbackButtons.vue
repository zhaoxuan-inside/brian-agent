<script setup lang="ts">
import { ref } from 'vue'
import { ThumbsUp, ThumbsDown, Minus, Loader2 } from '@lucide/vue'
import { feedbackApi } from '../api'

const props = defineProps<{ messageId: string; userId?: string }>()
const emit = defineEmits(['submitted'])

const rating = ref<'positive' | 'negative' | 'neutral' | null>(null)
const comment = ref('')
const showForm = ref(false)
const submitting = ref(false)

async function submitFeedback(r: 'positive' | 'negative' | 'neutral') {
  rating.value = r
  showForm.value = true
}

async function handleSubmit() {
  submitting.value = true
  try {
    await feedbackApi.create({
      userId: props.userId || 'default',
      messageId: props.messageId,
      rating: rating.value || 'neutral',
      comment: comment.value || undefined,
    })
    emit('submitted')
    showForm.value = false
  } catch (e) {
    console.error('Failed to submit feedback:', e)
  }
  submitting.value = false
}
</script>

<template>
  <div class="flex items-center gap-1">
    <button
      v-for="btn in [
        { r: 'positive' as const, icon: ThumbsUp, color: 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' },
        { r: 'neutral' as const, icon: Minus, color: 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20' },
        { r: 'negative' as const, icon: ThumbsDown, color: 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' },
      ]" :key="btn.r"
      :class="[
        'p-1 rounded transition-colors',
        rating === btn.r ? btn.color + ' bg-opacity-10' : 'text-apple-gray-400 hover:' + btn.color,
      ]"
      @click="submitFeedback(btn.r)"
      :title="btn.r === 'positive' ? '好评' : btn.r === 'negative' ? '差评' : '中性'"
    >
      <component :is="btn.icon" :size="14" />
    </button>
    <div v-if="showForm" class="absolute bottom-full mb-2 p-3 rounded-xl bg-white dark:bg-apple-gray-800 shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 z-10 min-w-[200px]">
      <textarea v-model="comment" placeholder="补充说明（可选）..."
        class="w-full px-3 py-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-sm text-apple-gray-900 dark:text-apple-gray-50 resize-none mb-2"
        rows="2" />
      <div class="flex justify-end gap-2">
        <button @click="showForm = false"
          class="px-3 py-1 rounded-lg text-xs text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors">
          取消
        </button>
        <button @click="handleSubmit" :disabled="submitting"
          class="px-3 py-1 rounded-lg text-xs bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-50">
          <Loader2 v-if="submitting" :size="12" class="animate-spin inline mr-1" />
          提交
        </button>
      </div>
    </div>
  </div>
</template>