<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import {
  UserRound, Trash2, RefreshCw, Loader2, Sparkles, Brain, History,
} from '@lucide/vue'
import { INFO_TABS_KEY } from '@/composables/useInfoTabs'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { formatTime as formatProfileTime } from '@/utils/format'
import { profileValueLines } from '@/utils/profileFormat'
import type { ProfileFullRecord } from '@/api/types'

const {
  confirmResetProfile,
  formatEvidence,
  generatingProfile,
  handleGenerateProfile,
  handleResetProfile,
  loadingProfile,
  profiles,
  resetProfileConfirm,
  resettingProfile,
  stabilityClass,
  stabilityLabel,
} = inject(INFO_TABS_KEY)!.profile

const EVIDENCE_PREVIEW_COUNT = 2

const selectedVersion = ref<number | null>(null)
const expandedEvidence = ref<Record<string, boolean>>({})

const sortedProfiles = computed(() =>
  [...profiles.value].sort((a, b) => (b.generated_at || 0) - (a.generated_at || 0)),
)

const activeIndex = computed(() => {
  if (selectedVersion.value === null) return 0
  const idx = sortedProfiles.value.findIndex((p) => p.version === selectedVersion.value)
  return idx >= 0 ? idx : 0
})

const activeProfile = computed(() => sortedProfiles.value[activeIndex.value] ?? null)
const previousProfile = computed(() => sortedProfiles.value[activeIndex.value + 1] ?? null)
const activeDimensions = computed(() => Object.entries(activeProfile.value?.dimensions ?? {}))

watch(profiles, () => {
  selectedVersion.value = sortedProfiles.value[0]?.version ?? null
  expandedEvidence.value = {}
})

watch(() => activeProfile.value?.version, () => {
  expandedEvidence.value = {}
})

function isDimensionChanged(key: string, value: unknown): boolean {
  const prev = previousProfile.value?.dimensions?.[key]
  if (!prev) return false
  return JSON.stringify(prev.value ?? null) !== JSON.stringify(value ?? null)
}

function visibleEvidence(key: string, evidence: Array<Record<string, unknown>>) {
  return expandedEvidence.value[key] ? evidence : evidence.slice(0, EVIDENCE_PREVIEW_COUNT)
}

function toggleEvidence(key: string) {
  expandedEvidence.value = { ...expandedEvidence.value, [key]: !expandedEvidence.value[key] }
}

function versionChipLabel(p: ProfileFullRecord): string {
  return `v${p.version} · ${formatProfileTime(p.generated_at).slice(5)}`
}
</script>

<template>
  <div class="px-6 pb-8 space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold flex items-center gap-2">
        <UserRound :size="20" class="text-brian-blue" /> 用户画像
      </h3>
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 rounded-lg hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800 transition-colors disabled:opacity-60"
          :disabled="resettingProfile || generatingProfile"
          @click="handleResetProfile"
        >
          <Trash2 :size="13" />
          {{ resettingProfile ? '重置中...' : '重置画像' }}
        </button>
        <button
          class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors disabled:opacity-60"
          :disabled="generatingProfile"
          @click="handleGenerateProfile"
        >
          <RefreshCw :size="13" :class="generatingProfile ? 'animate-spin' : ''" />
          {{ generatingProfile ? '生成中...' : '生成画像' }}
        </button>
      </div>
    </div>

    <div v-if="loadingProfile" class="text-center py-16 text-apple-gray-400">
      <Loader2 :size="24" class="animate-spin mx-auto mb-2" />
      <p class="text-sm">加载画像...</p>
    </div>

    <div v-else-if="profiles.length === 0" class="text-center py-16">
      <Sparkles :size="32" class="text-apple-gray-300 mx-auto mb-3" />
      <p class="text-sm text-apple-gray-500">暂无画像数据</p>
      <p class="text-xs text-apple-gray-400 mt-1">点击右上角「生成画像」基于用户对话生成第一版画像</p>
    </div>

    <template v-else-if="activeProfile">
      <!-- 版本切换条：默认选中最新版本 -->
      <div v-if="sortedProfiles.length > 1" class="flex items-center gap-2 flex-wrap">
        <span class="flex items-center gap-1 text-xs text-apple-gray-400 flex-shrink-0">
          <History :size="13" /> 历史版本 · 共 {{ sortedProfiles.length }} 版
        </span>
        <button
          v-for="p in sortedProfiles"
          :key="p.id"
          class="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors"
          :class="p.version === activeProfile.version
            ? 'bg-brian-blue text-white border-brian-blue'
            : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800'"
          @click="selectedVersion = p.version"
        >
          {{ versionChipLabel(p) }}
        </button>
      </div>

      <!-- 当前版本概览：总结 + 较上一版变化 -->
      <div class="block-card rounded-xl p-5 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-apple-gray-100 dark:border-apple-gray-800">
          <h4 class="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles :size="15" class="text-brian-blue" /> 画像 v{{ activeProfile.version }}
          </h4>
          <div class="flex items-center gap-2 text-xs text-apple-gray-400 min-w-0">
            <span class="font-mono truncate max-w-[180px]" :title="activeProfile.session_id">会话: {{ activeProfile.session_id || '—' }}</span>
            <span class="flex-shrink-0">{{ formatProfileTime(activeProfile.generated_at) }}</span>
          </div>
        </div>
        <div>
          <h5 class="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 mb-1">画像总结</h5>
          <p class="text-sm leading-relaxed text-apple-gray-700 dark:text-apple-gray-300">{{ activeProfile.profile_summary || '暂无总结' }}</p>
        </div>
        <div v-if="activeProfile.change_summary">
          <h5 class="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 mb-1">较上一版变化</h5>
          <p class="text-sm leading-relaxed text-apple-gray-700 dark:text-apple-gray-300">{{ activeProfile.change_summary }}</p>
        </div>
      </div>

      <!-- 维度卡片网格：一卡一维度 -->
      <div v-if="activeDimensions.length === 0" class="text-center py-10 text-apple-gray-400 text-xs">
        该版本暂无维度数据
      </div>
      <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div
          v-for="[key, dim] in activeDimensions"
          :key="key"
          class="block-card rounded-xl p-4 flex flex-col gap-3"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <Brain :size="15" class="text-brian-blue flex-shrink-0" />
              <h5 class="text-sm font-semibold truncate">{{ dim.direction_name || key }}</h5>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span
                v-if="isDimensionChanged(key, dim.value)"
                class="px-2 py-0.5 rounded text-xs font-medium bg-warning-orange/10 text-warning-orange"
              >较上版更新</span>
              <span
                v-if="dim.stability"
                :class="['px-2 py-0.5 rounded text-xs font-medium', stabilityClass(dim.stability)]"
              >{{ stabilityLabel(dim.stability) }}</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-xs text-apple-gray-400 flex-shrink-0">置信度</span>
            <div class="flex-1 h-1.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 overflow-hidden">
              <div
                class="h-full rounded-full bg-brian-blue transition-all duration-300"
                :style="{ width: `${Math.round((dim.confidence || 0) * 100)}%` }"
              />
            </div>
            <span class="text-xs text-apple-gray-400 tabular-nums flex-shrink-0">{{ Math.round((dim.confidence || 0) * 100) }}%</span>
          </div>

          <div class="space-y-1">
            <div
              v-for="(line, li) in profileValueLines(dim.value)"
              :key="li"
              class="text-sm leading-relaxed flex items-baseline gap-1.5 flex-wrap"
            >
              <template v-if="line.key">
                <span class="font-medium text-apple-gray-500 dark:text-apple-gray-400 break-all">{{ line.key }}:</span>
                <span class="text-apple-gray-700 dark:text-apple-gray-300 break-words">{{ line.val }}</span>
              </template>
              <span v-else class="text-apple-gray-700 dark:text-apple-gray-300 break-words">{{ line.val }}</span>
            </div>
            <p v-if="profileValueLines(dim.value).length === 0" class="text-sm text-apple-gray-400">—</p>
          </div>

          <div v-if="dim.evidence && dim.evidence.length" class="mt-auto pt-2 border-t border-apple-gray-100 dark:border-apple-gray-800">
            <p
              v-for="(ev, i) in visibleEvidence(key, dim.evidence)"
              :key="i"
              class="text-xs text-apple-gray-400 leading-relaxed"
            >· {{ formatEvidence(ev) }}</p>
            <button
              v-if="dim.evidence.length > EVIDENCE_PREVIEW_COUNT"
              class="mt-1 text-xs text-brian-blue hover:underline"
              @click="toggleEvidence(key)"
            >
              {{ expandedEvidence[key] ? '收起依据' : `展开全部 ${dim.evidence.length} 条依据` }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <ConfirmDialog
      :open="resetProfileConfirm"
      title="确认重置画像"
      message="确定要重置画像吗？将清空画像内容（总结、维度数据与历史版本）。"
      confirm-text="确认重置"
      intent="danger"
      @confirm="confirmResetProfile"
      @cancel="resetProfileConfirm = false"
    >
      <p class="text-xs text-apple-gray-400 mt-1">画像维度配置将保留，此操作不可恢复。</p>
    </ConfirmDialog>
  </div>
</template>
