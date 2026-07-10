<script setup lang="ts">
import { onMounted } from 'vue'
import { useThemeStore } from './stores/theme'
import { useAuthStore } from './stores/auth'
import NeuralBackground from './components/NeuralBackground.vue'
import Header from './components/Header.vue'
import ChatArea from './components/ChatArea.vue'
import InputBox from './components/InputBox.vue'
import FunctionPanel from './components/FunctionPanel.vue'
import LoginPage from './components/LoginPage.vue'

const themeStore = useThemeStore()
const authStore = useAuthStore()

onMounted(() => {
  themeStore.loadTheme()
  authStore.checkSession()
})
</script>

<template>
  <LoginPage v-if="!authStore.isLoggedIn" />
  
  <div v-else class="h-screen w-screen overflow-hidden relative">
    <NeuralBackground />
    <Header />
    <ChatArea />
    <InputBox />
    <FunctionPanel />
  </div>
</template>
