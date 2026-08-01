<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const password = ref('')
const error = ref('')
const isLoading = ref(false)

async function handleLogin() {
  if (!password.value) return
  isLoading.value = true
  error.value = ''
  try {
    authStore.login(password.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-apple-gray-50 dark:bg-apple-dark-bg px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-brian-blue mb-2">Brian</h1>
        <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400">
          {{ authStore.hasPassword ? '请输入密码解锁' : '请设置初始密码' }}
        </p>
      </div>

      <div class="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-glass dark:shadow-glass-dark p-6 space-y-4">
        <input
          v-model="password"
          type="password"
          :placeholder="authStore.hasPassword ? '输入密码...' : '设置密码...'"
          class="w-full px-4 py-3 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue transition-shadow"
          @keyup.enter="handleLogin"
        />

        <p v-if="error" class="text-sm text-error-red">{{ error }}</p>

        <button
          class="w-full btn-primary py-3"
          :disabled="!password || isLoading"
          @click="handleLogin"
        >
          {{ isLoading ? '验证中...' : (authStore.hasPassword ? '解锁' : '设置密码') }}
        </button>
      </div>
    </div>
  </div>
</template>
