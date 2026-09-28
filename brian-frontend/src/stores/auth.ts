import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchApi } from '@/api'

interface AuthStatus {
  has_password: boolean
  authenticated: boolean
}

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false)
  // authReady：checkSession 完成前置 false，App 据此避免登录页闪烁
  const authReady = ref(false)
  const hasPassword = ref(false)
  const sessionToken = ref(localStorage.getItem('brian-auth-session') || '')

  function persistToken(token: string) {
    sessionToken.value = token
    localStorage.setItem('brian-auth-session', token)
  }

  function clearToken() {
    sessionToken.value = ''
    localStorage.removeItem('brian-auth-session')
  }

  // 先用本地 token 快速放行避免闪烁，再向后端 /api/auth/status 核实（是否已设密码、token 是否有效）
  async function checkSession() {
    if (!sessionToken.value) {
      try {
        const status = await fetchApi<AuthStatus>('/auth/status')
        hasPassword.value = status.has_password
        // 未设置密码 = 开放模式（与首次使用体验一致）；已设密码则需要登录
        isLoggedIn.value = !status.has_password
      } catch {
        isLoggedIn.value = false
      }
      authReady.value = true
      return
    }
    isLoggedIn.value = true
    authReady.value = true
    try {
      const status = await fetchApi<AuthStatus>('/auth/status')
      hasPassword.value = status.has_password
      isLoggedIn.value = !status.has_password || status.authenticated
      if (!isLoggedIn.value) clearToken()
    } catch {
      // 后端暂不可达时保留本地会话（离线容错）
    }
  }

  async function login(password: string) {
    const res = await fetchApi<{ token: string }>(
      hasPassword.value ? '/auth/login' : '/auth/setup',
      { method: 'POST', body: JSON.stringify({ password }) },
    )
    hasPassword.value = true
    persistToken(res.token)
    isLoggedIn.value = true
  }

  function lock() {
    if (sessionToken.value) {
      fetchApi('/auth/logout', { method: 'POST' }).catch(() => { /* 本地锁定优先，服务端注销失败可忽略 */ })
    }
    clearToken()
    isLoggedIn.value = false
  }

  function unlock(password: string) {
    return login(password)
  }

  return { isLoggedIn, authReady, sessionToken, checkSession, login, lock, unlock, hasPassword }
})
