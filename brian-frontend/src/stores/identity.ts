import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { userProfileApi } from '@/api'
import type { UserProfileData } from '@/api/types'

export type ReplyStyle = 'clear' | 'concise' | 'detailed' | 'creative'
export type ReplyDepth = 'shallow' | 'medium' | 'deep'
export type ReplyFormat = 'TEXT' | 'MARKDOWN' | 'JSON'

export interface UserPreferences {
  language: 'zh-CN' | 'en-US'
  style: ReplyStyle
  depth: ReplyDepth
  format: ReplyFormat
  additional: string
}

const DISPLAY_KEY = 'brian-display-name'
const PREF_KEY = 'brian-user-preferences'
/** 与对话 API 使用的本机用户标识一致，偏好跨会话生效 */
export const IDENTITY_SESSION_ID = 'default-user'

const DEFAULT_PREFS: UserPreferences = {
  language: 'zh-CN',
  style: 'clear',
  depth: 'medium',
  format: 'MARKDOWN',
  additional: '',
}

function readPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<UserPreferences>
    return { ...DEFAULT_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export const useIdentityStore = defineStore('identity', () => {
  const displayName = ref(localStorage.getItem(DISPLAY_KEY) || '')
  const preferences = ref<UserPreferences>(readPrefs())
  const snapshot = ref<UserProfileData | null>(null)
  const loadingSnapshot = ref(false)
  const generating = ref(false)
  const savingPrefs = ref(false)
  const lastError = ref('')

  const greetingName = computed(() => displayName.value.trim() || '')
  const initials = computed(() => (greetingName.value || '?').slice(0, 1).toUpperCase())
  const hasPortrait = computed(() => (snapshot.value?.profile_version ?? 0) > 0)

  function setDisplayName(name: string) {
    displayName.value = name
    const trimmed = name.trim()
    if (trimmed) localStorage.setItem(DISPLAY_KEY, trimmed)
    else localStorage.removeItem(DISPLAY_KEY)
  }

  function setPreferences(next: Partial<UserPreferences>) {
    preferences.value = { ...preferences.value, ...next }
    localStorage.setItem(PREF_KEY, JSON.stringify(preferences.value))
  }

  async function savePreferences(sessionId?: string) {
    savingPrefs.value = true
    lastError.value = ''
    localStorage.setItem(PREF_KEY, JSON.stringify(preferences.value))
    try {
      await userProfileApi.savePreference({
        session_id: sessionId || IDENTITY_SESSION_ID,
        language: preferences.value.language,
        style: preferences.value.style,
        depth: preferences.value.depth,
        format: preferences.value.format,
        additional_preferences: preferences.value.additional || undefined,
      })
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : '保存偏好失败'
      throw err
    } finally {
      savingPrefs.value = false
    }
  }

  async function loadSnapshot() {
    loadingSnapshot.value = true
    lastError.value = ''
    try {
      snapshot.value = await userProfileApi.get()
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : '加载画像失败'
      snapshot.value = null
    } finally {
      loadingSnapshot.value = false
    }
  }

  async function generatePortrait() {
    generating.value = true
    lastError.value = ''
    try {
      await userProfileApi.generate()
      await loadSnapshot()
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : '生成画像失败'
      throw err
    } finally {
      generating.value = false
    }
  }

  return {
    displayName,
    greetingName,
    initials,
    preferences,
    snapshot,
    loadingSnapshot,
    generating,
    savingPrefs,
    lastError,
    hasPortrait,
    setDisplayName,
    setPreferences,
    savePreferences,
    loadSnapshot,
    generatePortrait,
  }
})
