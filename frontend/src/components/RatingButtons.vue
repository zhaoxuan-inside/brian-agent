<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../stores/session'
import { feedbackApi } from '../api'

const props = defineProps<{
  messageId: string
  rating?: 'good' | 'neutral' | 'bad'
}>()

const sessionStore = useSessionStore()
const selectedRating = ref(props.rating)
const showFeedback = ref(false)
const submitting = ref(false)

const ratingMap = {
  good: 'positive' as const,
  neutral: 'neutral' as const,
  bad: 'negative' as const,
}

async function handleRating(rate: 'good' | 'neutral' | 'bad') {
  selectedRating.value = rate
  sessionStore.updateMessage(props.messageId, { rating: rate })

  if (submitting.value) return
  submitting.value = true
  try {
    await feedbackApi.create({
      userId: 'default',
      messageId: props.messageId,
      rating: ratingMap[rate],
    })
    showFeedback.value = true
    setTimeout(() => {
      showFeedback.value = false
    }, 2000)
  } catch (e) {
    console.error('Failed to submit feedback:', e)
  }
  submitting.value = false
}
</script>

<template>
  <div class="flex items-center gap-3">
    <button 
      :class="[
        'rating-btn',
        selectedRating === 'good' ? 'active-good' : ''
      ]"
      @click="handleRating('good')"
      :disabled="submitting"
    >
      👍
    </button>
    
    <button 
      :class="[
        'rating-btn',
        selectedRating === 'neutral' ? 'active-neutral' : ''
      ]"
      @click="handleRating('neutral')"
      :disabled="submitting"
    >
      😐
    </button>
    
    <button 
      :class="[
        'rating-btn',
        selectedRating === 'bad' ? 'active-bad' : ''
      ]"
      @click="handleRating('bad')"
      :disabled="submitting"
    >
      👎
    </button>
    
    <Transition name="fade">
      <span 
        v-if="showFeedback" 
        class="text-xs text-apple-gray-500 dark:text-apple-gray-400 animate-slide-up"
      >
        感谢您的反馈！
      </span>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>