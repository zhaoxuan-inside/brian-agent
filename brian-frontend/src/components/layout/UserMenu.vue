<script setup lang="ts">
/**
 * 顶栏「我」菜单：本机身份、Brian 对你的理解（画像快照）、回复偏好、锁屏。
 * 画像详情仍在信息页；此处只做一眼能懂的入口，避免再做一个空图标。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronRight, Lock, RefreshCw, Save, Sparkles, UserRound, KeyRound, Loader2,
} from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useIdentityStore, type ReplyDepth, type ReplyStyle } from '@/stores/identity'
import { useI18nStore } from '@/stores/i18n'
import { formatTime } from '@/utils/format'

const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const auth = useAuthStore()
const identity = useIdentityStore()
const i18n = useI18nStore()

const nameDraft = ref(identity.displayName)
const prefsSaved = ref(false)
const showPassword = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const passwordError = ref('')
const passwordOk = ref('')

const styleOptions: Array<{ id: ReplyStyle; label: string }> = [
  { id: 'clear', label: '清晰' },
  { id: 'concise', label: '简洁' },
  { id: 'detailed', label: '详尽' },
  { id: 'creative', label: '有创意' },
]
const depthOptions: Array<{ id: ReplyDepth; label: string }> = [
  { id: 'shallow', label: '浅层' },
  { id: 'medium', label: '适中' },
  { id: 'deep', label: '深入' },
]

function formatDimValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map((x) => formatDimValue(x)).filter(Boolean).join('、')
  if (typeof v === 'object') {
    return Object.values(v as Record<string, unknown>)
      .map((x) => formatDimValue(x))
      .filter(Boolean)
      .slice(0, 3)
      .join('、')
  }
  return String(v)
}

const portraitSummary = computed(() => {
  const profile = identity.snapshot
  if (!profile) return ''
  const dims = profile.dimensions || {}
  const fromDims = Object.values(dims)
    .slice(0, 3)
    .map((d) => {
      const name = d.direction_name || d.direction_key || ''
      const val = formatDimValue(d.value)
      if (name && val) return `${name}：${val}`
      return val || name
    })
    .filter(Boolean)
  const text = (fromDims.length ? fromDims.join('；') : (profile.profile_summary || '').trim())
    .replace(/\s+/g, ' ')
  if (!text) return ''
  return text.length > 140 ? `${text.slice(0, 140)}…` : text
})

onMounted(async () => {
  nameDraft.value = identity.displayName
  await identity.loadSnapshot()
})

function persistName() {
  identity.setDisplayName(nameDraft.value)
}

async function savePrefs() {
  persistName()
  prefsSaved.value = false
  try {
    await identity.savePreferences()
    prefsSaved.value = true
    window.setTimeout(() => { prefsSaved.value = false }, 1800)
  } catch { /* lastError 已写入 store */ }
}

async function refreshPortrait() {
  try {
    await identity.generatePortrait()
  } catch { /* lastError 已写入 store */ }
}

function openFullPortrait() {
  emit('close')
  router.push({ path: '/info', query: { tab: 'profile' } })
}

function lockNow() {
  emit('close')
  auth.lock()
}

function submitPassword() {
  passwordError.value = ''
  passwordOk.value = ''
  try {
    auth.changePassword(oldPassword.value, newPassword.value)
    oldPassword.value = ''
    newPassword.value = ''
    passwordOk.value = auth.hasPassword ? '密码已更新' : '已设置锁屏密码'
    window.setTimeout(() => { passwordOk.value = '' }, 1800)
  } catch (err) {
    passwordError.value = err instanceof Error ? err.message : '修改失败'
  }
}

const inputClass = 'w-full px-2.5 py-1.5 text-xs rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue/40'
</script>

<template>
  <div
    class="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1.25rem)] max-h-[min(36rem,calc(100vh-4.5rem))] overflow-y-auto glass-panel rounded-2xl shadow-lg p-3 z-[60]"
    role="menu"
  >
    <!-- 身份 -->
    <div class="flex items-center gap-3 px-1 py-2">
      <div class="w-10 h-10 rounded-full bg-brian-blue/15 text-brian-blue flex items-center justify-center text-sm font-semibold flex-shrink-0">
        {{ identity.initials }}
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold truncate">{{ identity.greetingName || i18n.t('user.unnamed') }}</p>
        <p class="text-[11px] text-apple-gray-400">{{ i18n.t('user.localDevice') }} · {{ auth.hasPassword ? i18n.t('user.protected') : i18n.t('user.unprotected') }}</p>
      </div>
    </div>

    <div class="h-px bg-apple-gray-100 dark:bg-apple-gray-700 my-2" />

    <!-- 画像快照 -->
    <div class="px-1 pb-2">
      <div class="flex items-center justify-between mb-1.5">
        <p class="text-[11px] font-medium text-apple-gray-500 flex items-center gap-1">
          <Sparkles :size="12" class="text-brian-blue" />
          {{ i18n.t('user.portrait') }}
        </p>
        <span v-if="identity.hasPortrait" class="text-[10px] text-apple-gray-400">v{{ identity.snapshot?.profile_version }}</span>
      </div>
      <div v-if="identity.loadingSnapshot" class="py-4 text-center text-apple-gray-400">
        <Loader2 :size="16" class="animate-spin mx-auto" />
      </div>
      <p v-else-if="portraitSummary" class="text-xs leading-relaxed text-apple-gray-700 dark:text-apple-gray-300 break-words">
        {{ portraitSummary }}
      </p>
      <p v-else class="text-xs text-apple-gray-400">{{ i18n.t('user.portraitEmpty') }}</p>
      <p v-if="identity.snapshot?.generated_at" class="text-[10px] text-apple-gray-400 mt-1">
        {{ formatTime(identity.snapshot.generated_at) }}
      </p>
      <div class="flex gap-2 mt-2">
        <button
          class="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800"
          @click="openFullPortrait"
        >
          {{ i18n.t('user.viewPortrait') }}
          <ChevronRight :size="12" />
        </button>
        <button
          class="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 disabled:opacity-60"
          :disabled="identity.generating"
          @click="refreshPortrait"
        >
          <RefreshCw :size="12" :class="{ 'animate-spin': identity.generating }" />
          {{ identity.generating ? i18n.t('user.generating') : i18n.t('user.updatePortrait') }}
        </button>
      </div>
    </div>

    <div class="h-px bg-apple-gray-100 dark:bg-apple-gray-700 my-2" />

    <!-- 偏好：Brian 怎么回你 -->
    <div class="px-1 space-y-2">
      <p class="text-[11px] font-medium text-apple-gray-500 flex items-center gap-1">
        <UserRound :size="12" />
        {{ i18n.t('user.howToAddress') }}
      </p>
      <input
        v-model="nameDraft"
        :class="inputClass"
        :placeholder="i18n.t('user.namePlaceholder')"
        maxlength="32"
        @blur="persistName"
        @keyup.enter="persistName"
      />
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="text-[10px] text-apple-gray-400">{{ i18n.t('user.replyStyle') }}</span>
          <select v-model="identity.preferences.style" :class="inputClass + ' mt-0.5'">
            <option v-for="opt in styleOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] text-apple-gray-400">{{ i18n.t('user.replyDepth') }}</span>
          <select v-model="identity.preferences.depth" :class="inputClass + ' mt-0.5'">
            <option v-for="opt in depthOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
          </select>
        </label>
      </div>
      <label class="block">
        <span class="text-[10px] text-apple-gray-400">{{ i18n.t('user.replyLanguage') }}</span>
        <select v-model="identity.preferences.language" :class="inputClass + ' mt-0.5'">
          <option value="zh-CN">中文</option>
          <option value="en-US">English</option>
        </select>
      </label>
      <textarea
        v-model="identity.preferences.additional"
        :class="inputClass"
        rows="2"
        :placeholder="i18n.t('user.additionalPlaceholder')"
      />
      <button
        class="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-60"
        :disabled="identity.savingPrefs"
        @click="savePrefs"
      >
        <Save :size="12" />
        {{ identity.savingPrefs ? i18n.t('common.save') + '...' : (prefsSaved ? i18n.t('user.saved') : i18n.t('user.savePrefs')) }}
      </button>
    </div>

    <p v-if="identity.lastError" class="px-1 mt-2 text-[11px] text-error-red">{{ identity.lastError }}</p>

    <div class="h-px bg-apple-gray-100 dark:bg-apple-gray-700 my-2" />

    <!-- 锁屏 -->
    <div class="px-1 space-y-1.5">
      <button
        class="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800"
        @click="showPassword = !showPassword"
      >
        <KeyRound :size="14" class="text-apple-gray-400" />
        <span class="flex-1 text-left">{{ auth.hasPassword ? i18n.t('user.changePassword') : i18n.t('user.setPassword') }}</span>
      </button>
      <div v-if="showPassword" class="space-y-1.5 pl-1">
        <input
          v-if="auth.hasPassword"
          v-model="oldPassword"
          type="password"
          :class="inputClass"
          :placeholder="i18n.t('user.currentPassword')"
        />
        <input
          v-model="newPassword"
          type="password"
          :class="inputClass"
          :placeholder="i18n.t('user.newPassword')"
          @keyup.enter="submitPassword"
        />
        <p v-if="passwordError" class="text-[11px] text-error-red">{{ passwordError }}</p>
        <p v-else-if="passwordOk" class="text-[11px] text-success-green">{{ passwordOk }}</p>
        <button class="w-full btn-primary !py-1.5 !text-xs" @click="submitPassword">{{ i18n.t('common.confirm') }}</button>
      </div>
      <button
        class="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800"
        @click="lockNow"
      >
        <Lock :size="14" class="text-apple-gray-400" />
        <span>{{ i18n.t('user.lockNow') }}</span>
      </button>
    </div>
  </div>
</template>
