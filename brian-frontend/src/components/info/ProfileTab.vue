<script setup lang="ts">
import { inject } from 'vue'
import {
  UserRound, Trash2, RefreshCw, Loader2, Sparkles, Brain, History, X,
} from '@lucide/vue'
import { INFO_TABS_KEY } from '@/composables/useInfoTabs'
import { formatTime as formatProfileTime } from '@/utils/format'

const {
  confirmResetProfile,
  dimensionDisplayValue,
  formatEvidence,
  generatingProfile,
  handleGenerateProfile,
  handleResetProfile,
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
} = inject(INFO_TABS_KEY)!.profile
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
    <div v-else-if="!profile || profile.profile_version === 0" class="text-center py-16">
      <Sparkles :size="32" class="text-apple-gray-300 mx-auto mb-3" />
      <p class="text-sm text-apple-gray-500">暂无画像数据</p>
      <p class="text-xs text-apple-gray-400 mt-1">点击右上角「生成画像」基于用户对话生成第一版画像</p>
    </div>
    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 space-y-4">
        <div class="block-card rounded-xl p-5">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles :size="15" class="text-brian-blue" /> 画像总结
            </h4>
            <span class="text-xs text-apple-gray-400">版本 v{{ profile.profile_version }}</span>
          </div>
          <p class="text-sm leading-relaxed text-apple-gray-700 dark:text-apple-gray-300">{{ profile.profile_summary || '暂无总结' }}</p>
          <p class="text-xs text-apple-gray-400 mt-3">生成时间: {{ formatProfileTime(profile.generated_at) }}</p>
        </div>

        <div class="block-card rounded-xl p-5">
          <h4 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Brain :size="15" class="text-brian-blue" /> 画像维度
          </h4>
          <div v-if="Object.keys(profile.dimensions).length === 0" class="text-center py-8 text-apple-gray-400 text-sm">
            暂无维度数据
          </div>
          <div v-else class="space-y-3">
            <div v-for="(dim, key) in profile.dimensions" :key="key" class="p-4 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium">{{ dim.direction_name || key }}</span>
                <div class="flex items-center gap-2">
                  <span v-if="dim.stability" :class="['px-2 py-0.5 rounded text-xs font-medium', stabilityClass(dim.stability)]">{{ stabilityLabel(dim.stability) }}</span>
                  <span class="text-xs text-apple-gray-400">置信度: {{ Math.round((dim.confidence || 0) * 100) }}%</span>
                </div>
              </div>
              <p class="text-sm text-apple-gray-700 dark:text-apple-gray-300">{{ dimensionDisplayValue(dim.value) }}</p>
              <div v-if="dim.evidence && dim.evidence.length" class="mt-2 space-y-1">
                <p v-for="(ev, i) in dim.evidence" :key="i" class="text-xs text-apple-gray-400">
                  · {{ formatEvidence(ev) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <div class="block-card rounded-xl p-5">
          <h4 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <History :size="15" class="text-brian-blue" /> 历史版本
          </h4>
          <div v-if="profileHistory.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">
            暂无历史版本
          </div>
          <div v-else class="space-y-2 max-h-[480px] overflow-y-auto">
            <button
              v-for="item in profileHistory"
              :key="item.id"
              class="w-full text-left p-3 rounded-lg border border-transparent hover:border-brian-blue/30 hover:bg-brian-blue/5 transition-colors"
              @click="openVersion(item.version)"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">v{{ item.version }}</span>
                <span class="text-xs text-apple-gray-400">{{ formatProfileTime(item.generated_at) }}</span>
              </div>
              <p class="text-xs text-apple-gray-400 mt-1 line-clamp-2">{{ item.change_summary || item.profile_summary || '—' }}</p>
            </button>
          </div>
        </div>

        <div v-if="selectedVersion || loadingVersion" class="block-card rounded-xl p-5">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold">版本详情</h4>
            <button class="p-1 text-apple-gray-400 hover:text-apple-gray-600" @click="selectedVersion = null"><X :size="14" /></button>
          </div>
          <div v-if="loadingVersion" class="text-center py-6 text-apple-gray-400 text-sm">加载中...</div>
          <div v-else-if="selectedVersion" class="space-y-3">
            <p class="text-xs text-apple-gray-400">版本 v{{ selectedVersion.version }} · {{ formatProfileTime(selectedVersion.generated_at) }}</p>
            <p class="text-sm">{{ selectedVersion.profile_summary || '暂无总结' }}</p>
            <div v-if="Object.keys(selectedVersion.dimensions).length" class="space-y-2">
              <div v-for="(dim, key) in selectedVersion.dimensions" :key="key" class="p-2.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50">
                <span class="text-xs font-medium block">{{ dim.direction_name || key }}</span>
                <span class="text-xs text-apple-gray-500 block mt-0.5">{{ dimensionDisplayValue(dim.value) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="resetProfileConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="resetProfileConfirm = false">
      <div class="block-card w-full max-w-sm mx-4 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">确认重置画像</h3>
          <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="resetProfileConfirm = false"><X :size="18" /></button>
        </div>
        <p class="text-sm text-apple-gray-600 dark:text-apple-gray-300">
          确定要重置画像吗？将清空画像内容（总结、维度数据与历史版本）。
        </p>
        <p class="text-xs text-apple-gray-400 mt-1">画像维度配置将保留，此操作不可恢复。</p>
        <div class="flex justify-end gap-2 mt-6">
          <button class="btn-secondary" @click="resetProfileConfirm = false">取消</button>
          <button class="px-3 py-2 text-xs font-medium bg-error-red text-white rounded-lg hover:bg-error-red/90 transition-colors" @click="confirmResetProfile">确认重置</button>
        </div>
      </div>
    </div>
  </div>
</template>
