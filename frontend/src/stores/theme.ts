import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref(false)

  const theme = computed(() => isDark.value ? 'dark' : 'light')
  const themeClass = computed(() => isDark.value ? 'dark' : '')

  function toggleTheme() {
    isDark.value = !isDark.value
    updateDocumentClass()
    saveTheme()
  }

  function setTheme(dark: boolean) {
    isDark.value = dark
    updateDocumentClass()
    saveTheme()
  }

  function updateDocumentClass() {
    document.documentElement.classList.toggle('dark', isDark.value)
  }

  function saveTheme() {
    localStorage.setItem('brian-theme', isDark.value ? 'dark' : 'light')
  }

  function loadTheme() {
    const saved = localStorage.getItem('brian-theme')
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      isDark.value = true
      updateDocumentClass()
    }
  }

  return {
    isDark,
    theme,
    themeClass,
    toggleTheme,
    setTheme,
    loadTheme
  }
})
