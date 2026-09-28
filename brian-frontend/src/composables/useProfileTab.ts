import { ref } from 'vue'
import { userProfileApi } from '../api'
import type { ProfileHistoryItem, ProfileVersionData, UserProfileData } from '../api/types'

export function useProfileTab() {

const profile = ref<UserProfileData | null>(null)
const profileHistory = ref<ProfileHistoryItem[]>([])
const loadingProfile = ref(false)
const generatingProfile = ref(false)
const resettingProfile = ref(false)
const resetProfileConfirm = ref(false)
const selectedVersion = ref<ProfileVersionData | null>(null)
const loadingVersion = ref(false)

async function loadProfile() {
  loadingProfile.value = true
  try {
    profile.value = await userProfileApi.get()
    profileHistory.value = await userProfileApi.history()
  } catch (err) {
    console.error('[ProfileTab] 加载画像失败', err)
  } finally { loadingProfile.value = false }
}

async function handleGenerateProfile() {
  generatingProfile.value = true
  try {
    await userProfileApi.generate()
    await loadProfile()
  } catch (err) {
    console.error('[ProfileTab] 生成画像失败', err)
  } finally { generatingProfile.value = false }
}

function handleResetProfile() {
  resetProfileConfirm.value = true
}

async function confirmResetProfile() {
  resetProfileConfirm.value = false
  resettingProfile.value = true
  try {
    await userProfileApi.reset()
    selectedVersion.value = null
    await loadProfile()
  } catch (err) {
    console.error('[ProfileTab] 重置画像失败', err)
  } finally { resettingProfile.value = false }
}

async function openVersion(version: number) {
  loadingVersion.value = true
  selectedVersion.value = null
  try {
    selectedVersion.value = await userProfileApi.version(version)
  } catch (err) {
    console.error('[ProfileTab] 加载画像版本失败', err)
  } finally { loadingVersion.value = false }
}

function dimensionDisplayValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.join('、')
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : val}`)
      .join(' · ')
  }
  return String(v)
}

function formatEvidence(ev: unknown): string {
  if (typeof ev === 'string') return ev
  if (ev && typeof ev === 'object') {
    const o = ev as Record<string, unknown>
    if (o.source || o.detail) {
      return o.source ? `${o.source}${o.detail ? `: ${o.detail}` : ''}` : String(o.detail)
    }
    const entries = Object.entries(o)
    if (entries.length > 0) return entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
  }
  return String(ev ?? '')
}

function stabilityLabel(s?: string): string {
  if (s === 'stable') return '稳定'
  if (s === 'drifting') return '漂移中'
  if (s === 'emerging') return '新兴'
  return ''
}

function stabilityClass(s?: string): string {
  if (s === 'stable') return 'bg-success-green/10 text-success-green'
  if (s === 'drifting') return 'bg-warning-orange/10 text-warning-orange'
  if (s === 'emerging') return 'bg-brian-blue/10 text-brian-blue'
  return ''
}

  return {
    confirmResetProfile,
    dimensionDisplayValue,
    formatEvidence,
    generatingProfile,
    handleGenerateProfile,
    handleResetProfile,
    loadProfile,
    loadingProfile,
    loadingVersion,
    openVersion,
    profile,
    profileHistory,
    resetProfileConfirm,
    resettingProfile,
    selectedVersion,
    stabilityClass,
    stabilityLabel,
  }
}
