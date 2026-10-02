import { ref } from 'vue'
import { userProfileApi } from '../api'
import type { ProfileFullRecord } from '../api/types'

export function useProfileTab() {

const profiles = ref<ProfileFullRecord[]>([])
const loadingProfile = ref(false)
const generatingProfile = ref(false)
const resettingProfile = ref(false)
const resetProfileConfirm = ref(false)

async function loadProfile() {
  loadingProfile.value = true
  try {
    profiles.value = await userProfileApi.all()
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
    await loadProfile()
  } catch (err) {
    console.error('[ProfileTab] 重置画像失败', err)
  } finally { resettingProfile.value = false }
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
    formatEvidence,
    generatingProfile,
    handleGenerateProfile,
    handleResetProfile,
    loadProfile,
    loadingProfile,
    profiles,
    resetProfileConfirm,
    resettingProfile,
    stabilityClass,
    stabilityLabel,
  }
}
