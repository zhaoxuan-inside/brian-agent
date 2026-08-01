<script setup lang="ts">
import { onMounted } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import LoginPage from '@/components/layout/LoginPage.vue'

const themeStore = useThemeStore()
const authStore = useAuthStore()

onMounted(() => {
  themeStore.loadTheme()
  authStore.checkSession()
})
</script>

<template>
  <LoginPage v-if="!authStore.isLoggedIn" />
  <router-view v-else />
</template>
