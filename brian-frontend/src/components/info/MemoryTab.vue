<script setup lang="ts">
import { inject } from 'vue'
import {
  Search, Trash2, CheckSquare, Square, ChevronRight, X,
} from '@lucide/vue'
import { INFO_TABS_KEY } from '@/composables/useInfoTabs'
import HeatmapCard from '@/components/info/HeatmapCard.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import StatusNote from '@/components/common/StatusNote.vue'

const {
  activeMemoryDate,
  allMemoriesSelected,
  clickDateNav,
  clickHeatmapDay,
  confirmMemoryDelete,
  dateNavTimeline,
  expandedMemory,
  getDateCount,
  hasMoreMemory,
  heatmapCells,
  heatmapActiveDay,
  heatmapMonth,
  heatmapYear,
  isCurrentHeatmapMonth,
  loadingMemory,
  loadingMoreMemory,
  memories,
  memoryDateFilter,
  memoryDeleteConfirm,
  memoryEndTime,
  memorySearch,
  memorySentinel,
  memoryStartTime,
  memoryTag,
  memoryTimeline,
  nextHeatmapMonth,
  prevHeatmapMonth,
  requestMemoryDelete,
  searchMemoryByEnter,
  selectedMemories,
  toggleMemorySelect,
  toggleSelectAllMemory,
  typeColors, typeLabels,
} = inject(INFO_TABS_KEY)!.memory
</script>

<template>
  <div class="px-6 pb-8 space-y-4">
    <StatusNote v-if="loadingMemory && memoryTimeline.length === 0" state="loading" />
    <div v-else-if="!loadingMemory && dateNavTimeline.length === 0" class="text-center py-8 text-apple-gray-400">暂无记忆</div>
    <div v-else class="flex gap-6">
      <div class="w-40 flex-shrink-0">
        <div class="sticky top-[160px] space-y-1 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
          <button
            v-for="item in dateNavTimeline"
            :key="item.dateKey"
            :id="`memory-nav-${item.dateKey}`"
            class="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
            :class="activeMemoryDate === item.dateKey ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'"
            @click="clickDateNav(item.dateKey)"
          >
            <span class="w-2 h-2 rounded-full flex-shrink-0" :class="activeMemoryDate === item.dateKey ? 'bg-brian-blue' : 'bg-apple-gray-300'" />
            <span>{{ item.label }}</span>
            <span class="ml-auto text-apple-gray-300">{{ item.count }}</span>
          </button>
        </div>
      </div>
      <div class="flex-1 min-w-0 space-y-4">
        <div v-if="memoryDateFilter" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-brian-blue/5 text-sm text-brian-blue">
          <span>已筛选: {{ dateNavTimeline.find(i => i.dateKey === memoryDateFilter)?.label || memoryDateFilter }}</span>
          <button class="ml-auto px-2 py-0.5 text-xs rounded bg-brian-blue/10 hover:bg-brian-blue/20 transition-colors" @click="clickDateNav(memoryDateFilter)">清除筛选</button>
        </div>
        <div class="sticky top-[160px] z-20 flex items-center gap-3 flex-wrap bg-white dark:bg-apple-dark-bg py-2 -mx-1 px-1 border-b border-apple-gray-200/60 dark:border-apple-gray-700/60">
          <div class="relative flex-1 max-w-md">
            <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
            <input v-model="memorySearch" placeholder="搜索记忆内容..." class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" @keyup.enter="searchMemoryByEnter" />
          </div>
          <input v-model="memoryTag" placeholder="按标签搜索..." class="px-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" @keyup.enter="searchMemoryByEnter" />
          <div class="flex items-center gap-2 text-xs text-apple-gray-500">
            <input v-model="memoryStartTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            <span>至</span>
            <input v-model="memoryEndTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
          </div>
          <button
            v-if="memories.length > 0"
            class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-brian-blue hover:bg-brian-blue/10 rounded-lg"
            @click="toggleSelectAllMemory"
          >
            <component :is="allMemoriesSelected ? CheckSquare : Square" :size="14" /> {{ allMemoriesSelected ? '取消全选' : '全选' }}
          </button>
          <button
            class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-error-red hover:bg-error-red/10 rounded-lg"
            :class="selectedMemories.size > 0 ? '' : 'opacity-40 cursor-not-allowed'"
            :disabled="selectedMemories.size === 0"
            @click="requestMemoryDelete()"
          >
            <Trash2 :size="14" /> 删除所选{{ selectedMemories.size > 0 ? `(${selectedMemories.size})` : '' }}
          </button>
        </div>
        <div class="space-y-3 relative">
          <Transition name="list-loading">
            <div v-if="loadingMemory" class="absolute top-0 left-0 right-0 z-10 flex justify-center pointer-events-none">
              <span class="px-4 py-1.5 rounded-full bg-white/90 dark:bg-apple-gray-800/90 text-xs text-brian-blue shadow-sm backdrop-blur-sm">加载中...</span>
            </div>
          </Transition>
          <TransitionGroup name="list-fade" tag="div" class="space-y-3">
          <template v-for="group in memoryTimeline" :key="group.dateKey">
            <div :id="`memory-group-${group.dateKey}`" :data-memory-date="group.dateKey" class="flex items-center gap-2 pt-1 scroll-mt-[210px]">
              <span class="text-sm font-semibold">{{ group.label }}</span>
              <span class="text-xs text-apple-gray-400">({{ getDateCount(group.dateKey) }})</span>
            </div>
            <div
              v-for="mem in group.items"
              :key="mem.id"
              class="block-card rounded-xl overflow-hidden cursor-pointer"
              :class="selectedMemories.has(mem.id) ? 'border-brian-blue/40 bg-brian-blue/5' : 'hover:border-brian-blue/30'"
              @click="expandedMemory = expandedMemory === mem.id ? null : mem.id"
            >
              <div class="p-4 flex items-start gap-3">
                <button class="mt-0.5 text-apple-gray-300 hover:text-brian-blue flex-shrink-0" @click.stop="toggleMemorySelect(mem.id)">
                  <component :is="selectedMemories.has(mem.id) ? CheckSquare : Square" :size="16" />
                </button>
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-apple-gray-400">{{ new Date(mem.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
                      <span class="text-xs text-apple-gray-300">#{{ mem.id.slice(-8) }}</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span :class="['px-2 py-0.5 rounded text-xs font-medium', typeColors[mem.type] || 'bg-gray-100 text-gray-600']">{{ typeLabels[mem.type] || mem.type }}</span>
                      <button class="p-1 rounded-lg text-apple-gray-400 hover:text-error-red hover:bg-error-red/10 flex-shrink-0" title="删除" @click.stop="requestMemoryDelete(mem.id)">
                        <Trash2 :size="14" />
                      </button>
                    </div>
                  </div>
                  <p class="text-sm" :class="expandedMemory === mem.id ? '' : 'line-clamp-2'">{{ mem.content }}</p>
                  <div class="flex items-center gap-3 mt-2">
                    <div v-if="mem.tags?.length" class="flex flex-wrap gap-1">
                      <span v-for="tag in mem.tags" :key="tag" class="px-1.5 py-0.5 rounded text-xs bg-brian-blue/10 text-brian-blue">#{{ tag }}</span>
                    </div>
                    <span class="text-xs text-apple-gray-400 ml-auto">置信度: {{ Math.round((mem.confidence ?? 0) * 100) }}%</span>
                    <ChevronRight :size="14" class="text-apple-gray-400 transition-transform" :class="expandedMemory === mem.id ? 'rotate-90' : ''" />
                  </div>
                </div>
              </div>
            </div>
          </template>
          </TransitionGroup>
          <div v-if="memoryDateFilter && memoryTimeline.length === 0 && !loadingMemory" class="text-center py-8 text-apple-gray-400">该日期暂无记忆</div>
          <div ref="memorySentinel" v-if="!memoryDateFilter && (hasMoreMemory || loadingMoreMemory)" class="text-center py-4 text-xs text-apple-gray-400">
            {{ loadingMoreMemory ? '加载中...' : '继续上滑加载更多' }}
          </div>
        </div>
      </div>
    </div>
    <HeatmapCard
      v-if="dateNavTimeline.length > 0"
      :cells="heatmapCells"
      :year="heatmapYear"
      :month="heatmapMonth"
      unit="条记忆"
      :active-day="heatmapActiveDay"
      :can-go-next="!isCurrentHeatmapMonth()"
      @select="clickHeatmapDay"
      @prev="prevHeatmapMonth"
      @next="nextHeatmapMonth"
    />
    <ConfirmDialog
      :open="memoryDeleteConfirm !== null"
      title="确认删除"
      :message="memoryDeleteConfirm?.type === 'batch'
        ? `确定删除选中的 ${selectedMemories.size} 条记忆吗？`
        : '确定删除该条记忆吗？'"
      confirm-text="确认删除"
      intent="danger"
      @confirm="confirmMemoryDelete"
      @cancel="memoryDeleteConfirm = null"
    >
      <p class="text-xs text-apple-gray-400 mt-1">此操作将同时清理关联的标签、摘要、关键词与向量数据，且不可恢复。</p>
    </ConfirmDialog>
  </div>
</template>
