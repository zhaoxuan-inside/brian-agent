<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../stores/session'

const props = defineProps<{
  messageId: string
  rating?: 'good' | 'neutral' | 'bad'
}>()

const sessionStore = useSessionStore()
const selectedRating = ref(props.rating)
const showFeedback = ref(false)

function handleRating(rate: 'good' | 'neutral' | 'bad') {
  selectedRating.value = rate
  sessionStore.updateMessage(props.messageId, { rating: rate })
  
  showFeedback.value = true
  setTimeout(() => {
    showFeedback.value = false
  }, 2000)
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
    >
      👍
    </button>
    
    <button 
      :class="[
        'rating-btn',
        selectedRating === 'neutral' ? 'active-neutral' : ''
      ]"
      @click="handleRating('neutral')"
    >
      😐
    </button>
    
    <button 
      :class="[
        'rating-btn',
        selectedRating === 'bad' ? 'active-bad' : ''
      ]"
      @click="handleRating('bad')"
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
