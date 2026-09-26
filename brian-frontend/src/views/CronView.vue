<script setup lang="ts">
import { useI18nStore } from '@/stores/i18n'
import { ref, onMounted, computed } from 'vue'
import { RefreshCw, Play, CalendarClock, Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from '@lucide/vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import ModalShell from '@/components/common/ModalShell.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import StatusNote from '@/components/common/StatusNote.vue'
import CronConfigModal from '@/components/CronConfigModal.vue'
import { cronApi } from '@/api'
import type { CronTask, CronTaskRun } from '@/api'

const i18nStore = useI18nStore()
const tasks = ref<CronTask[]>([])
const loading = ref(false)
const error = ref('')

const runsMap = ref<Record<string, CronTaskRun[]>>({})
const runsVisible = ref(false)
const runsTask = ref<CronTask | null>(null)

const editModalVisible = ref(false)
const editingTask = ref<CronTask | null>(null)
const triggering = ref<Record<string, boolean>>({})

async function loadTasks() {
  loading.value = true
  error.value = ''
  try {
    tasks.value = await cronApi.tasks()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function toggleEnabled(task: CronTask) {
  try {
    const updated = await cronApi.setEnabled(task.name, task.enabled !== 1)
    if (updated) {
      const idx = tasks.value.findIndex(t => t.name === task.name)
      if (idx >= 0) tasks.value[idx] = updated
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

function openEdit(task: CronTask) {
  editingTask.value = task
  editModalVisible.value = true
}

async function saveCron(cron: string) {
  if (!editingTask.value) return
  try {
    const updated = await cronApi.setCron(editingTask.value.name, cron)
    if (updated) {
      const idx = tasks.value.findIndex(t => t.name === editingTask.value!.name)
      if (idx >= 0) tasks.value[idx] = updated
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    editModalVisible.value = false
    editingTask.value = null
  }
}

async function triggerTask(task: CronTask) {
  triggering.value[task.name] = true
  try {
    await cronApi.trigger(task.name)
    await loadRuns(task.name)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '触发失败'
  } finally {
    triggering.value[task.name] = false
  }
}

async function loadRuns(name: string) {
  try {
    runsMap.value[name] = await cronApi.runs(name, 20)
  } catch { /* ignore */ }
}

async function openRuns(task: CronTask) {
  runsTask.value = task
  runsVisible.value = true
  await loadRuns(task.name)
}

function closeRuns() {
  runsVisible.value = false
  runsTask.value = null
}

function formatTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(run: CronTaskRun): string {
  if (!run.finished_at) return '—'
  const ms = run.finished_at - run.started_at
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

const runningCount = computed(() => tasks.value.filter(t => t.enabled === 1).length)

onMounted(loadTasks)
</script>

<template>
  <div class="min-h-screen relative">
    <NeuralBackground />
    <Header />
    <div class="pt-14 relative z-10">
      <div class="sticky top-14 z-30 h-10 flex items-center justify-between px-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <PageBreadcrumb :path="[i18nStore.t('nav.cron')]" />
        <div class="flex items-center gap-3">
          <span class="text-xs text-apple-gray-400">{{ i18nStore.t('cron.enabledStat', { n: runningCount, m: tasks.length }) }}</span>
          <button class="icon-btn" :title="i18nStore.t('cron.refresh')" @click="loadTasks">
            <RefreshCw :size="16" :class="loading ? 'animate-spin' : ''" />
          </button>
        </div>
      </div>
    </div>

    <div class="px-6 pb-6 relative z-10">
      <div v-if="error" class="mt-4 flex items-center gap-2 text-xs text-error-red bg-error-red/5 border border-error-red/20 rounded-lg px-3 py-2">
        <AlertCircle :size="14" /> {{ error }}
      </div>

      <StatusNote v-if="loading" state="loading" />

      <div v-else-if="tasks.length === 0" class="flex flex-col items-center justify-center py-20 text-apple-gray-400">
        <CalendarClock :size="40" class="mb-3" />
        <p class="text-sm">{{ i18nStore.t('cron.empty') }}</p>
      </div>

      <div v-else class="mt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 p-3">
        <div
          v-for="task in tasks"
          :key="task.name"
          class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md hover:border-brian-blue/30 transition-shadow p-4 min-h-[8.5rem] flex flex-col cursor-pointer"
          @click="openRuns(task)"
        >
          <div class="mb-2">
            <div class="flex items-center gap-2.5 mb-2">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><CalendarClock :size="18" /></div>
              <div class="min-w-0 flex-1">
                <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate text-sm">{{ task.name }}</h3>
              </div>
              <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :class="task.enabled === 1 ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" :title="task.enabled === 1 ? '启用' : '禁用'" />
            </div>
            <p class="text-2xs text-apple-gray-400 line-clamp-2">{{ task.description || '暂无描述' }}</p>
          </div>

          <div class="space-y-1 text-2xs flex-1 min-h-0">
            <p class="font-mono text-brian-blue truncate" :title="task.cron">{{ task.cron }}</p>
            <p class="text-apple-gray-400 truncate">上次: {{ formatTime(task.last_run) }}</p>
            <p class="text-apple-gray-400 truncate">下次: {{ formatTime(task.next_run) }}</p>
          </div>

          <div class="flex items-center justify-end pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto">
            <div class="flex items-center gap-1">
              <ToggleSwitch
                :model-value="task.enabled === 1"
                :label="`${i18nStore.t('cron.toggle')} ${task.name}`"
                @click.stop
                @update:model-value="toggleEnabled(task)"
              />
              <button
                class="flex items-center gap-1 px-1.5 py-1 text-4xs font-medium rounded text-brian-blue hover:bg-brian-blue/10 transition-colors"
                :disabled="triggering[task.name]"
                @click.stop="triggerTask(task)"
              >
                <Loader2 v-if="triggering[task.name]" :size="11" class="animate-spin" />
                <Play v-else :size="11" />
                {{ i18nStore.t('cron.trigger') }}
              </button>
              <button
                class="flex items-center gap-1 px-1.5 py-1 text-4xs font-medium rounded text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
                @click.stop="openRuns(task)"
              >
                {{ i18nStore.t('cron.runs') }}
              </button>
              <button
                class="p-1 rounded text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 transition-colors"
                :title="i18nStore.t('cron.edit')"
                @click.stop="openEdit(task)"
              >
                <Clock :size="12" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ModalShell :open="runsVisible" :title="`执行情况 · ${runsTask?.name ?? ''}`" panel-class="max-w-lg" label="执行情况" @close="closeRuns">
            <div class="max-h-[60vh] flex flex-col">
            <div v-if="!runsTask || !runsMap[runsTask.name] || runsMap[runsTask.name].length === 0" class="text-xs text-apple-gray-400 py-8 text-center">暂无执行记录</div>
            <div v-else class="space-y-1.5 overflow-y-auto flex-1">
              <div v-for="run in runsMap[runsTask.name]" :key="run.id" class="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
                <CheckCircle2 v-if="run.status === 'SUCCESS'" :size="14" class="text-success-green shrink-0 mt-0.5" />
                <XCircle v-else :size="14" class="text-error-red shrink-0 mt-0.5" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 text-2xs text-apple-gray-500 dark:text-apple-gray-400">
                    <span>{{ formatTime(run.started_at) }}</span>
                    <span class="text-apple-gray-300">·</span>
                    <span>{{ formatDuration(run) }}</span>
                    <span class="px-1.5 py-0.5 rounded-full text-4xs" :class="run.status === 'SUCCESS' ? 'bg-success-green/10 text-success-green' : 'bg-error-red/10 text-error-red'">{{ run.result || run.status }}</span>
                  </div>
                  <p v-if="run.error" class="text-2xs text-error-red mt-1 whitespace-pre-wrap break-words">{{ run.error }}</p>
                </div>
              </div>
            </div>
            </div>
      </ModalShell>
    </div>

    <CronConfigModal
      :visible="editModalVisible"
      title="定时时间配置"
      :expression="editingTask?.cron || ''"
      @close="editModalVisible = false; editingTask = null"
      @save="saveCron"
    />
  </div>
</template>
