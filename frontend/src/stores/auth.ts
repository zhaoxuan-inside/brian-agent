import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false)
  const userName = ref('')
  const userAvatar = ref('')
  const authToken = ref('')
  const isLocked = ref(false)

  const isLoggedIn = computed(() => isAuthenticated.value && !isLocked.value)

  function setPassword(password: string): boolean {
    const stored = localStorage.getItem('brian-auth-hash')
    if (stored) {
      // Password already set
      return false
    }
    localStorage.setItem('brian-auth-hash', hashPassword(password))
    return true
  }

  function login(password: string): boolean {
    const stored = localStorage.getItem('brian-auth-hash')
    if (!stored) {
      // First time: set password
      localStorage.setItem('brian-auth-hash', hashPassword(password))
      isAuthenticated.value = true
      isLocked.value = false
      saveSession()
      return true
    }

    if (stored === hashPassword(password)) {
      isAuthenticated.value = true
      isLocked.value = false
      saveSession()
      return true
    }

    return false
  }

  function lock(): void {
    isLocked.value = true
    localStorage.removeItem('brian-auth-session')
  }

  function unlock(password: string): boolean {
    const stored = localStorage.getItem('brian-auth-hash')
    if (stored === hashPassword(password)) {
      isLocked.value = false
      saveSession()
      return true
    }
    return false
  }

  function logout(): void {
    isAuthenticated.value = false
    isLocked.value = false
    authToken.value = ''
    localStorage.removeItem('brian-auth-session')
  }

  function checkSession(): boolean {
    const sessionData = localStorage.getItem('brian-auth-session')
    if (sessionData) {
      try {
        const session = JSON.parse(sessionData)
        if (session.expiresAt && Date.now() < session.expiresAt) {
          isAuthenticated.value = true
          userName.value = session.userName || 'User'
          authToken.value = session.token || ''
          return true
        }
      } catch {
        // invalid session
      }
    }
    return false
  }

  function saveSession(): void {
    const session = {
      token: generateToken(),
      userName: userName.value || 'User',
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    }
    localStorage.setItem('brian-auth-session', JSON.stringify(session))
    authToken.value = session.token
  }

  function hasPassword(): boolean {
    return !!localStorage.getItem('brian-auth-hash')
  }

  return {
    isAuthenticated,
    userName,
    userAvatar,
    authToken,
    isLocked,
    isLoggedIn,
    setPassword,
    login,
    lock,
    unlock,
    logout,
    checkSession,
    hasPassword,
  }
})

function hashPassword(password: string): string {
  let hash = 0
  const salt = 'brian-agent-salt'
  const input = password + salt
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

function generateToken(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}
