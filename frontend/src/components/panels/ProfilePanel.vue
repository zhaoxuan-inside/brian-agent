<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Star, Tag, Plus, X, TrendingUp, Loader2 } from '@lucide/vue'
import { profileApi, type ProfileData } from '../../api'

const profile = ref<ProfileData | null>(null)
const interests = ref<{ topic: string; score: number }[]>([])
const newTag = ref('')
const loading = ref(false)
const userId = ref('default')

const dimensionLabels: Record<string, string> = {
  basic: '基础属性',
  interests: '兴趣领域',
  behavior: '行为模式',
  preferences: '偏好设置',
  skills: '技能偏好',
  style: '对话风格',
}

onMounted(async () => {
  await loadData()
})

async function loadData() {
  loading.value = true
  try {
    const [profileRes, interestsRes] = await Promise.allSettled([
      profileApi.get(userId.value),
      profileApi.interests(userId.value),
    ])
    if (profileRes.status === 'fulfilled') {
      profile.value = profileRes.value
    }
    if (interestsRes.status === 'fulfilled') interests.value = interestsRes.value
  } catch (e) {
    console.error('Failed to load profile:', e)
  }
  loading.value = false
}

async function handleAddTag() {
  if (!newTag.value.trim()) return
  await profileApi.addTag(userId.value, newTag.value.trim())
  newTag.value = ''
  await loadData()
}

async function handleRemoveTag(tag: string) {
  await profileApi.removeTag(userId.value, tag)
  await loadData()
}

const maxInterestScore = computed(() => Math.max(1, ...interests.value.map(i => i.score)))
</script>

<template>
  <div class="h-full flex flex-col p-6 overflow-hidden">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50">用户画像</h2>
        <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">动态维度 EWMA 加权收敛</p>
      </div>
    </div>

    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <Loader2 :size="32" class="animate-spin text-brian-blue" />
    </div>

    <div v-else class="flex-1 overflow-auto space-y-6">
      <!-- Summary Stats -->
      <div class="p-6 rounded-xl bg-white/5 dark:bg-white/5 border border-apple-gray-200 dark:border-apple-gray-700">
        <div class="grid grid-cols-3 gap-3">
          <div class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800">
            <div class="text-xs text-apple-gray-500">兴趣标签</div>
            <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ profile?.tags?.length || 0 }}</div>
          </div>
          <div class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800">
            <div class="text-xs text-apple-gray-500">兴趣领域</div>
            <div class="text-lg font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ interests.length }}</div>
          </div>
          <div class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800">
            <div class="text-xs text-apple-gray-500">最后更新</div>
            <div class="text-sm font-bold text-apple-gray-900 dark:text-apple-gray-50">
              {{ profile?.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : '-' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Dynamic Dimensions -->
      <div class="p-6 rounded-xl bg-white/5 dark:bg-white/5 border border-apple-gray-200 dark:border-apple-gray-700">
        <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mb-4 flex items-center gap-2">
          <TrendingUp :size="16" class="text-brian-blue" /> 动态维度
        </h4>
        <div class="grid grid-cols-3 gap-3">
          <div v-for="dim in ['basic', 'interests', 'behavior', 'preferences', 'skills', 'style']" :key="dim"
            class="p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800">
            <div class="text-xs text-apple-gray-500 mb-1">{{ dimensionLabels[dim] }}</div>
            <div class="h-2 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 overflow-hidden">
              <div class="h-full rounded-full bg-brian-blue" :style="{ width: (profile?.confidence || 0.5) * 100 + '%' }" />
            </div>
            <div class="text-xs text-apple-gray-400 mt-1">置信度: {{ ((profile?.confidence || 0.5) * 100).toFixed(0) }}%</div>
          </div>
        </div>
      </div>

      <!-- Interests -->
      <div class="p-6 rounded-xl bg-white/5 dark:bg-white/5 border border-apple-gray-200 dark:border-apple-gray-700">
        <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mb-4 flex items-center gap-2">
          <Star :size="16" class="text-amber-500" /> 兴趣领域 Top 10
        </h4>
        <div v-if="interests.length" class="space-y-2">
          <div v-for="interest in interests" :key="interest.topic"
            class="flex items-center gap-3">
            <span class="text-sm text-apple-gray-700 dark:text-apple-gray-300 w-24 truncate">{{ interest.topic }}</span>
            <div class="flex-1 h-2 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 overflow-hidden">
              <div class="h-full rounded-full bg-amber-500"
                :style="{ width: (interest.score / maxInterestScore * 100) + '%' }" />
            </div>
            <span class="text-xs text-apple-gray-500 w-10 text-right">{{ interest.score.toFixed(1) }}</span>
          </div>
        </div>
        <div v-else class="text-sm text-apple-gray-400">暂无兴趣数据，发送更多消息将自动分析</div>
      </div>

      <!-- Tags -->
      <div class="p-6 rounded-xl bg-white/5 dark:bg-white/5 border border-apple-gray-200 dark:border-apple-gray-700">
        <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mb-4 flex items-center gap-2">
          <Tag :size="16" class="text-brian-blue" /> 标签管理
        </h4>
        <div class="flex items-center gap-2 mb-3">
          <input v-model="newTag" @keyup.enter="handleAddTag" placeholder="添加标签..."
            class="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-300 dark:border-apple-gray-600 text-sm text-apple-gray-900 dark:text-apple-gray-50 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all" />
          <button @click="handleAddTag"
            class="p-2 rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors">
            <Plus :size="16" />
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <span v-for="tag in profile?.tags || []" :key="tag"
            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 text-sm text-apple-gray-700 dark:text-apple-gray-300">
            {{ tag }}
            <button @click="handleRemoveTag(tag)" class="hover:text-red-500 transition-colors">
              <X :size="12" />
            </button>
          </span>
          <span v-if="!profile?.tags?.length" class="text-sm text-apple-gray-400">暂无标签</span>
        </div>
      </div>
    </div>
  </div>
</template>