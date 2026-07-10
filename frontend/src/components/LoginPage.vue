<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Key, Eye, EyeOff, ArrowRight, Shield, Zap } from '@lucide/vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const password = ref('')
const showPassword = ref(false)
const error = ref('')
const isFirstTime = ref(false)
const isProcessing = ref(false)

onMounted(() => {
  isFirstTime.value = !authStore.hasPassword()
})

async function handleSubmit() {
  if (!password.value || isProcessing.value) return
  isProcessing.value = true
  error.value = ''

  // Simulate a small delay for UX
  await new Promise(resolve => setTimeout(resolve, 400))

  const success = authStore.login(password.value)
  if (!success) {
    error.value = '密码错误，请重试'
  }
  
  isProcessing.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    handleSubmit()
  }
}
</script>

<template>
  <div class="h-screen w-screen flex items-center justify-center bg-white dark:bg-black">
    <div class="w-full max-w-md px-8">
      <!-- Logo -->
      <div class="text-center mb-10 animate-fade-in">
        <div class="inline-flex p-4 bg-brian-blue/10 rounded-2xl mb-5">
          <Zap :size="36" class="text-brian-blue" />
        </div>
        <h1 class="text-3xl font-bold text-apple-gray-900 dark:text-apple-gray-50 tracking-tight">
          Brian Agent
        </h1>
        <p class="text-apple-gray-500 dark:text-apple-gray-400 mt-2 text-sm">
          {{ isFirstTime ? '首次使用，请设置访问密码' : '请输入密码以继续' }}
        </p>
      </div>

      <!-- Login Form -->
      <div class="glass-panel rounded-2xl p-6 animate-slide-up">
        <div class="space-y-4">
          <!-- Password Input -->
          <div>
            <label class="block text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-2">
              {{ isFirstTime ? '设置密码' : '访问密码' }}
            </label>
            <div class="relative">
              <div class="absolute left-3 top-1/2 -translate-y-1/2">
                <Key :size="16" class="text-apple-gray-400" />
              </div>
              <input 
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                :placeholder="isFirstTime ? '请设置一个密码...' : '请输入密码...'"
                class="w-full pl-10 pr-10 py-3 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brian-blue/30 transition-shadow"
                :disabled="isProcessing"
                @keydown="handleKeydown"
                autofocus
              />
              <button 
                class="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 rounded transition-colors"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" :size="16" class="text-apple-gray-400" />
                <Eye v-else :size="16" class="text-apple-gray-400" />
              </button>
            </div>
          </div>

          <!-- Error Message -->
          <Transition name="fade">
            <div 
              v-if="error" 
              class="px-4 py-2 bg-error-red/10 border border-error-red/20 rounded-lg flex items-center gap-2"
            >
              <Shield :size="14" class="text-error-red flex-shrink-0" />
              <span class="text-sm text-error-red">{{ error }}</span>
            </div>
          </Transition>

          <!-- Submit -->
          <button 
            :disabled="!password.trim() || isProcessing"
            :class="[
              'w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all duration-150',
              password.trim() && !isProcessing
                ? 'bg-brian-blue text-white hover:bg-brian-blue/90 active:scale-[0.98]'
                : 'bg-apple-gray-200 dark:bg-apple-gray-800 text-apple-gray-400 cursor-not-allowed'
            ]"
            @click="handleSubmit"
          >
            <span>{{ isFirstTime ? '设置并进入' : '解锁进入' }}</span>
            <ArrowRight :size="16" />
          </button>
        </div>
      </div>

      <!-- Footer -->
      <p class="text-center text-xs text-apple-gray-400 mt-6">
        本地运行，数据存储在本地
      </p>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: all 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
