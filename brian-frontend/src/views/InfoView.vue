<script setup lang="ts">
/**
 * @fileoverview 信息页壳：装配各页签组合式函数（每者仅实例化一次）并向
 * 页签视图子组件 provide 注入；本组件只保留页签栏 / 面包屑与页签切换。
 *
 * 页签业务逻辑见 composables/useInfoTabs 各 useXxxTab；
 * 页签视图见 components/info/（HistoryTab/MemoryTab/LibraryTab/GraphPane/ProfileTab）。
 */
import { computed, provide, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Clock, Brain, Database, Network, GitBranch, UserRound,
} from '@lucide/vue'
import type { InfoTabKey } from '@/api/types'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import HistoryTab from '@/components/info/HistoryTab.vue'
import MemoryTab from '@/components/info/MemoryTab.vue'
import LibraryTab from '@/components/info/LibraryTab.vue'
import GraphPane from '@/components/info/GraphPane.vue'
import ProfileTab from '@/components/info/ProfileTab.vue'
import { useI18nStore } from '@/stores/i18n'
import {
  INFO_TABS_KEY,
  useHistoryTab, useMemoryTab, useLibraryTab, useProfileTab, useTagGraphTab,
  type InfoTabsApi,
} from '@/composables/useInfoTabs'

// Tabs
const i18nStore = useI18nStore()
const route = useRoute()
const infoTabKeys: InfoTabKey[] = ['history', 'memory', 'library', 'tagGraph', 'keywordGraph', 'profile']

function tabFromQuery(): InfoTabKey | null {
  const q = route.query.tab
  return typeof q === 'string' && infoTabKeys.includes(q as InfoTabKey) ? (q as InfoTabKey) : null
}

const storedInfoTab = localStorage.getItem('brian-info-active-tab')
const activeTab = ref<InfoTabKey>(tabFromQuery() ?? (infoTabKeys.includes(storedInfoTab as InfoTabKey) ? (storedInfoTab as InfoTabKey) : 'history'))

watch(() => route.query.tab, () => {
  const fromQuery = tabFromQuery()
  if (fromQuery) activeTab.value = fromQuery
})
const tabs = computed(() => [
  { key: 'history' as const, label: i18nStore.t('info.history'), icon: Clock },
  { key: 'memory' as const, label: i18nStore.t('info.memory'), icon: Brain },
  { key: 'library' as const, label: i18nStore.t('info.library'), icon: Database },
  { key: 'tagGraph' as const, label: i18nStore.t('info.tagGraph'), icon: Network },
  { key: 'keywordGraph' as const, label: i18nStore.t('info.keywordGraph'), icon: GitBranch },
  { key: 'profile' as const, label: i18nStore.t('info.profile'), icon: UserRound },
])

const pagePath = computed(() => {
  const active = tabs.value.find(t => t.key === activeTab.value)
  return [i18nStore.t('nav.info'), ...(active ? [active.label] : [])]
})

// 页签业务逻辑装配：graph 兼任壳控制器（页签懒加载、全局滚动/点击监听），
// 并注入各页签的跨页签能力
const history = useHistoryTab()
const memory = useMemoryTab()
const library = useLibraryTab()
const profile = useProfileTab()
const graph = useTagGraphTab({
  activeTab,
  closeContextMenu: library.closeContextMenu,
  loadHistory: history.loadHistory,
  loadMemory: memory.loadMemory,
  loadAllDateCounts: memory.loadAllDateCounts,
  loadLibraries: library.loadLibraries,
  loadProfile: profile.loadProfile,
  onMemoryScroll: memory.onMemoryScroll,
  startDateCountRefresh: memory.startDateCountRefresh,
  stopDateCountRefresh: memory.stopDateCountRefresh,
})

provide(INFO_TABS_KEY, { activeTab, history, memory, library, profile, graph } satisfies InfoTabsApi)
</script>

<template>
  <div class="min-h-screen relative">
    <NeuralBackground />
    <Header />
    <div class="pt-14 relative z-10">
      <div class="sticky top-14 z-30 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <div class="h-10 flex items-center px-5 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <PageBreadcrumb :path="pagePath" />
        </div>
        <div class="px-6">
          <div class="flex items-center gap-1 mt-3 mb-4 border-b border-apple-gray-200 dark:border-apple-gray-700 pb-2">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              :class="[
                'flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors',
                activeTab === tab.key ? 'bg-brian-blue text-white' : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
              ]"
              @click="activeTab = tab.key"
            >
              <component :is="tab.icon" :size="15" />
              {{ tab.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- 页签视图（业务逻辑在 InfoView 装配的组合式函数中，页签切换仅重挂视图） -->
      <HistoryTab v-if="activeTab === 'history'" />
      <MemoryTab v-else-if="activeTab === 'memory'" />
      <LibraryTab v-else-if="activeTab === 'library'" />
      <GraphPane v-else-if="activeTab === 'tagGraph'" kind="tag" />
      <GraphPane v-else-if="activeTab === 'keywordGraph'" kind="keyword" />
      <ProfileTab v-else-if="activeTab === 'profile'" />
    </div>
  </div>
</template>
