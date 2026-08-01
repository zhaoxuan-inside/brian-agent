/// <reference types="vite/client" />

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/globals.css'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import App from './App.vue'
import router from './router'

// Mock 数据层 - 仅在 VITE_USE_MOCK=true 时启用
// 删除 src/mock/ 目录并移除此段代码即可完全剥离 mock 数据
async function bootstrap() {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    const { setupMock } = await import('./mock')
    setupMock()
  }

  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)
  app.mount('#app')
}

bootstrap()
