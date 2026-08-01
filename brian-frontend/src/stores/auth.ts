import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false)
  const userPassword = ref(localStorage.getItem('brian-auth-hash') || '')
  const sessionToken = ref(localStorage.getItem('brian-auth-session'))

  function checkSession() {
    const token = sessionToken.value
    if (!token) {
      if (userPassword.value) {
        isLoggedIn.value = false
        return
      }
      isLoggedIn.value = true
      return
    }
    try {
      const data = JSON.parse(atob(token))
      const now = Date.now()
      if (now - data.created < 7 * 24 * 60 * 60 * 1000) {
        isLoggedIn.value = true
      }
    } catch {
      isLoggedIn.value = false
    }
  }

  function hashPassword(pwd: string): string {
    const salt = 'brian-v2-salt'
    let hash = 0
    const str = pwd + salt
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return Math.abs(hash).toString(16)
  }

  function login(password: string) {
    const hashed = hashPassword(password)
    if (!userPassword.value) {
      userPassword.value = hashed
      localStorage.setItem('brian-auth-hash', hashed)
    } else if (userPassword.value !== hashed) {
      throw new Error('密码错误')
    }
    const token = btoa(JSON.stringify({ created: Date.now() }))
    sessionToken.value = token
    localStorage.setItem('brian-auth-session', token)
    isLoggedIn.value = true
  }

  function logout() {
    sessionToken.value = null
    localStorage.removeItem('brian-auth-session')
    isLoggedIn.value = false
  }

  function lock() {
    sessionToken.value = null
    localStorage.removeItem('brian-auth-session')
    isLoggedIn.value = false
  }

  function unlock(password: string) {
    return login(password)
  }

  const hasPassword = computed(() => !!userPassword.value)

  return { isLoggedIn, userPassword, sessionToken, checkSession, login, logout, lock, unlock, hasPassword }
})
