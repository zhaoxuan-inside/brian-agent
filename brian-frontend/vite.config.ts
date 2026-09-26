import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.BRIAN_WEB_PORT) || 5173,
    strictPort: true,
    proxy: {
      '/api': { target: `http://localhost:${process.env.BRIAN_API_PORT || 8000}`, changeOrigin: true },
      '/ws': { target: `ws://localhost:${process.env.BRIAN_API_PORT || 8000}`, ws: true }
    }
  }
})
