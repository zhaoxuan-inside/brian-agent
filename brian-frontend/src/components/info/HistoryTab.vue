<script setup lang="ts">
import { inject } from 'vue'
import {
  Search, Trash2, CheckSquare, Square, Tag, X,
} from '@lucide/vue'
import { INFO_TABS_KEY } from '@/composables/useInfoTabs'
import HeatmapCard from '@/components/info/HeatmapCard.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import StatusNote from '@/components/common/StatusNote.vue'
import ModalShell from '@/components/common/ModalShell.vue'
import { formatTime, formatTokens } from '@/utils/format'

const {
  historySearch, historyStartTime, historyEndTime,
  loadingHistory, loadingMoreHistory, hasMoreHistory, selectedSessions,
  viewingTagsSession, openViewTags,
  filteredHistory, historyTimeline, historyDateNavTimeline, activeHistoryDate, scrollToHistoryDate,
  historyHeatmapYear, historyHeatmapMonth, historyHeatmapCells,
  historyHasDateData, historyHeatmapActiveDay,
  isCurrentHistoryHeatmapMonth, prevHistoryHeatmapMonth, nextHistoryHeatmapMonth,
  clickHistoryHeatmapDay, clickHistoryDateNav,
  historySentinel, historyDateFilter,
  allHistorySelected, toggleHistorySelectAll, toggleHistorySelect,
  deleteConfirm, requestDeleteSession, requestBatchDelete, confirmDelete,
  openSession,
} = inject(INFO_TABS_KEY)!.history

function formatSessionTitle(title?: string): string {
  if (!title) return '新会话'
  const trimmed = title.trim()
  if (!trimmed) return '新会话'
  if (trimmed.length > 12) {
    return `${trimmed.slice(0, 12)}...`
  }
  return trimmed
}
</script>

<template>
  <div class="px-6 pb-8 space-y-4">
    <StatusNote v-if="loadingHistory && historyTimeline.length === 0" state="loading" />
    <div v-else-if="!loadingHistory && historyDateNavTimeline.length === 0" class="text-center py-8 text-apple-gray-400">暂无历史会话</div>
    <div v-else class="flex gap-6">
      <div class="hidden sm:block w-40 flex-shrink-0">
        <div class="sticky top-[160px] space-y-1 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
          <button
            v-for="item in historyDateNavTimeline"
            :key="item.dateKey"
            :id="`history-nav-${item.dateKey}`"
            class="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
            :class="activeHistoryDate === item.dateKey ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'"
            @click="scrollToHistoryDate(item.dateKey); clickHistoryDateNav(item.dateKey)"
          >
            <span class="w-2 h-2 rounded-full flex-shrink-0" :class="activeHistoryDate === item.dateKey ? 'bg-brian-blue' : 'bg-apple-gray-300'" />
            <span>{{ item.label }}</span>
            <span class="ml-auto text-apple-gray-300">{{ item.count }}</span>
          </button>
        </div>
      </div>
      <div class="flex-1 min-w-0 space-y-4">
        <div v-if="historyDateFilter" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-brian-blue/5 text-sm text-brian-blue">
          <span>已筛选: {{ historyDateNavTimeline.find(i => i.dateKey === historyDateFilter)?.label || historyDateFilter }}</span>
          <button class="ml-auto px-2 py-0.5 text-xs rounded bg-brian-blue/10 hover:bg-brian-blue/20 transition-colors" @click="clickHistoryDateNav(historyDateFilter)">清除筛选</button>
        </div>
        <div class="sticky top-[160px] z-20 flex items-center gap-3 flex-wrap bg-white dark:bg-apple-dark-bg py-2 -mx-1 px-1 border-b border-apple-gray-200/60 dark:border-apple-gray-700/60">
          <div class="relative flex-1 max-w-md">
            <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
            <input v-model="historySearch" placeholder="搜索会话内容或标题..." class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
          </div>
          <div class="flex items-center gap-2 text-xs text-apple-gray-500">
            <input v-model="historyStartTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            <span>至</span>
            <input v-model="historyEndTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
          </div>
          <button
            v-if="filteredHistory.length > 0"
            class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-brian-blue hover:bg-brian-blue/10 rounded-lg"
            @click="toggleHistorySelectAll"
          >
            <component :is="allHistorySelected ? CheckSquare : Square" :size="14" /> {{ allHistorySelected ? '取消全选' : '全选' }}
          </button>
          <button
            class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-error-red hover:bg-error-red/10 rounded-lg"
            :class="selectedSessions.size > 0 ? '' : 'opacity-40 cursor-not-allowed'"
            :disabled="selectedSessions.size === 0"
            @click="requestBatchDelete()"
          >
            <Trash2 :size="14" /> 删除所选{{ selectedSessions.size > 0 ? `(${selectedSessions.size})` : '' }}
          </button>
        </div>
        <div v-if="historyTimeline.length === 0 && !loadingHistory" class="text-center py-8 text-apple-gray-400">该日期暂无会话</div>
        <div v-else class="space-y-3 relative">
          <Transition name="list-loading">
            <div v-if="loadingHistory" class="absolute top-0 left-0 right-0 z-10 flex justify-center pointer-events-none">
              <span class="px-4 py-1.5 rounded-full bg-white/90 dark:bg-apple-gray-800/90 text-xs text-brian-blue shadow-sm backdrop-blur-sm">加载中...</span>
            </div>
          </Transition>
          <TransitionGroup name="list-fade" tag="div" class="space-y-3">
          <template v-for="group in historyTimeline" :key="group.dateKey">
          <div :id="`history-group-${group.dateKey}`" class="flex items-center gap-2 pt-1 scroll-mt-[210px]">
            <span class="text-sm font-semibold">{{ group.label }}</span>
            <span class="text-xs text-apple-gray-400">({{ group.items.length }})</span>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            <div
              v-for="item in group.items"
              :key="item.sessionId"
              class="block-card rounded-xl p-3 cursor-pointer flex flex-col justify-between min-h-[188px] h-auto transition-all"
              :class="selectedSessions.has(item.sessionId) ? 'border-brian-blue/40 bg-brian-blue/5' : 'hover:border-brian-blue/30'"
              @click="openSession(item.sessionId)"
            >
              <div class="flex items-start justify-between gap-1">
                <p class="text-sm font-semibold truncate min-w-0 flex-1 text-apple-gray-900 dark:text-white" :title="item.sessionTitle || '新会话'">
                  {{ formatSessionTitle(item.sessionTitle) }}
                </p>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <button class="text-apple-gray-300 hover:text-brian-blue p-0.5 rounded transition-colors" title="选择" @click.stop="toggleHistorySelect(item.sessionId)">
                    <component :is="selectedSessions.has(item.sessionId) ? CheckSquare : Square" :size="14" />
                  </button>
                  <button class="text-apple-gray-400 hover:text-error-red p-0.5 rounded transition-colors" title="删除会话" @click.stop="requestDeleteSession(item.sessionId)">
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
              <span class="text-xs text-apple-gray-400" :title="`创建时间：${formatTime(item.createdTime || item.created || item.lastTime)}`">
                创建于 {{ formatTime(item.createdTime || item.created || item.lastTime) }}
              </span>
              <div class="grid grid-cols-3 gap-1.5 text-2xs">
                <div class="rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 px-1.5 py-1 flex flex-col justify-between" :title="`Token 消耗：总计 ${((item.inputTokens ?? 0) + (item.outputTokens ?? 0)).toLocaleString()} (输入 ${item.inputTokens ?? 0} / 输出 ${item.outputTokens ?? 0})`">
                  <p class="text-apple-gray-400 text-3xs">Token 消耗</p>
                  <p class="font-medium text-apple-gray-700 dark:text-apple-gray-200 truncate">
                    {{ formatTokens((item.inputTokens ?? 0) + (item.outputTokens ?? 0)) }}
                  </p>
                  <p class="text-3xs text-apple-gray-400 dark:text-apple-gray-500 truncate" :title="`输入: ${item.inputTokens ?? 0} · 输出: ${item.outputTokens ?? 0}`">
                    {{ formatTokens(item.inputTokens) }} / {{ formatTokens(item.outputTokens) }}
                  </p>
                </div>
                <div class="rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 px-1.5 py-1 flex flex-col justify-between" :title="`成对完整问答轮数：${item.qaCount ?? 0} 轮`">
                  <p class="text-apple-gray-400 text-3xs">完整问答</p>
                  <p class="font-medium text-apple-gray-700 dark:text-apple-gray-200">{{ item.qaCount ?? 0 }} 轮</p>
                  <p class="text-3xs text-apple-gray-400 dark:text-apple-gray-500 truncate">成对匹配</p>
                </div>
                <div class="rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 px-1.5 py-1 flex flex-col justify-between" :title="`会话总字符数：总计 ${((item.questionChars ?? 0) + (item.answerChars ?? 0)).toLocaleString()} (提问 ${item.questionChars ?? 0} / 回答 ${item.answerChars ?? 0})`">
                  <p class="text-apple-gray-400 text-3xs">字符统计</p>
                  <p class="font-medium text-apple-gray-700 dark:text-apple-gray-200 truncate">
                    {{ formatTokens((item.questionChars ?? 0) + (item.answerChars ?? 0)) }}
                  </p>
                  <p class="text-3xs text-apple-gray-400 dark:text-apple-gray-500 truncate" :title="`提问: ${item.questionChars ?? 0} · 回答: ${item.answerChars ?? 0}`">
                    {{ formatTokens(item.questionChars) }} / {{ formatTokens(item.answerChars) }}
                  </p>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-1 pt-1 border-t border-apple-gray-100 dark:border-apple-gray-800/60 min-h-[26px]">
                <template v-if="item.tags && item.tags.length > 0">
                  <span
                    v-for="tag in item.tags.slice(0, 4)"
                    :key="tag"
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs bg-brian-blue/10 text-brian-blue max-w-[80px] truncate"
                    :title="tag"
                  >
                    #{{ tag }}
                  </span>
                  <button
                    v-if="item.tags.length > 4"
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs font-medium bg-apple-gray-100 hover:bg-apple-gray-200 dark:bg-apple-gray-800 dark:hover:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 transition-colors"
                    title="查看全部标签"
                    @click.stop="openViewTags(item)"
                  >
                    +{{ item.tags.length - 4 }} 更多
                  </button>
                </template>
                <span v-else class="text-2xs text-apple-gray-400">无标签</span>
              </div>
            </div>
          </div>
        </template>
          </TransitionGroup>
          <div ref="historySentinel" v-if="!historyDateFilter && (hasMoreHistory || loadingMoreHistory)" class="text-center py-4 text-xs text-apple-gray-400">
            {{ loadingMoreHistory ? '加载中...' : '继续上滑加载更多' }}
          </div>
        </div>
      </div>
    </div>

    <HeatmapCard
      v-if="historyHasDateData"
      :cells="historyHeatmapCells"
      :year="historyHeatmapYear"
      :month="historyHeatmapMonth"
      unit="个会话"
      :active-day="historyHeatmapActiveDay"
      :can-go-next="!isCurrentHistoryHeatmapMonth()"
      @select="clickHistoryHeatmapDay"
      @prev="prevHistoryHeatmapMonth"
      @next="nextHistoryHeatmapMonth"
    />

    <ConfirmDialog
      :open="deleteConfirm !== null"
      title="确认删除"
      :message="deleteConfirm?.type === 'batch'
        ? `确定删除选中的 ${selectedSessions.size} 个会话及其全部消息吗？`
        : '确定删除该会话及其全部消息吗？'"
      confirm-text="确认删除"
      intent="danger"
      @confirm="confirmDelete"
      @cancel="deleteConfirm = null"
    >
      <p class="text-xs text-apple-gray-400 mt-1">此操作将同时清理关联的记忆、标签与向量数据，且不可恢复。</p>
    </ConfirmDialog>

    <ModalShell :open="viewingTagsSession !== null" title="会话标签" panel-class="max-w-md" @close="viewingTagsSession = null">
      <p class="text-sm text-apple-gray-500 mb-3 truncate">{{ viewingTagsSession?.sessionTitle || '新会话' }}</p>
      <div v-if="!viewingTagsSession?.tags || viewingTagsSession.tags.length === 0" class="text-sm text-apple-gray-400 py-4 text-center">无标签</div>
      <div v-else class="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
        <span v-for="tag in viewingTagsSession.tags" :key="tag" class="px-2.5 py-1 rounded-full text-sm bg-brian-blue/10 text-brian-blue">#{{ tag }}</span>
      </div>
    </ModalShell>
  </div>
</template>
