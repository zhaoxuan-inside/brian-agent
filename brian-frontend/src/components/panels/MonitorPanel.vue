<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Activity, Cpu, HardDrive, Database, BarChart3, TrendingUp, Layers, Loader2, Search, RefreshCw, Eye } from '@lucide/vue'
import { monitorApi } from '@/api'
import type { SystemHealth, TokenUsage } from '@/api/types'

const health = ref<SystemHealth>({ status: 'healthy', components: [], uptime: 0 })
const resources = ref({ cpu: 0, memory: 0, disk: 0 })
const tokenTrend = ref<{ date: string; tokens: number }[]>([])
const modelDist = ref<{ model: string; tokens: number }[]>([])
const logs = ref<{ timestamp: number; level: string; source: string; message: string }[]>([])
const logLevel = ref('')
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)
const loading = ref(false)

async function fetchAll() {
  try { health.value = await monitorApi.health() } catch { /* */ }
  try { resources.value = await monitorApi.resources() } catch { /* */ }
  try { tokenTrend.value = await monitorApi.tokenTrend() } catch { /* */ }
  try { modelDist.value = await monitorApi.modelDistribution() } catch { /* */ }
  try { logs.value = await monitorApi.logs(logLevel.value || undefined) } catch { /* */ }
}

onMounted(() => {
  fetchAll()
  pollTimer.value = setInterval(fetchAll, 10000)
})
onUnmounted(() => { if (pollTimer.value) clearInterval(pollTimer.value) })

const statusColor = (s: string) =>
  s === 'healthy' ? 'text-success-green' : s === 'degraded' ? 'text-warning-orange' : 'text-error-red'

const statusIcon = (s: string) =>
  s === 'healthy' ? 'bg-success-green' : s === 'degraded' ? 'bg-warning-orange' : 'bg-error-red'

const logLevelColors: Record<string, string> = {
  error: 'text-error-red bg-error-red/10',
  warn: 'text-warning-orange bg-warning-orange/10',
  info: 'text-brian-blue bg-brian-blue/10',
  debug: 'text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-800',
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${d}d ${h}h ${m}m`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Health status -->
    <div class="block-card rounded-2xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Activity :size="20" class="text-brian-blue" /> 系统健康
        </h2>
        <span class="flex items-center gap-1.5 text-sm font-medium" :class="statusColor(health.status)">
          <span class="w-2.5 h-2.5 rounded-full" :class="statusIcon(health.status)" />
          {{ health.status === 'healthy' ? '健康' : health.status === 'degraded' ? '降级' : '异常' }}
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div v-for="comp in health.components" :key="comp.name" class="flex items-center justify-between p-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
          <div>
            <p class="text-sm font-medium">{{ comp.name }}</p>
            <p v-if="comp.message" class="text-xs text-apple-gray-400">{{ comp.message }}</p>
          </div>
          <span class="w-2.5 h-2.5 rounded-full" :class="statusIcon(comp.status)" />
        </div>
      </div>

      <div class="mt-3 flex flex-wrap gap-4 text-sm">
        <span class="flex items-center gap-1.5 text-apple-gray-500">
          <Cpu :size="14" /> CPU: {{ resources.cpu }}%
        </span>
        <span class="flex items-center gap-1.5 text-apple-gray-500">
          <HardDrive :size="14" /> 内存: {{ resources.memory }}%
        </span>
        <span class="flex items-center gap-1.5 text-apple-gray-500">
          <Database :size="14" /> 磁盘: {{ resources.disk }}%
        </span>
        <span class="flex items-center gap-1.5 text-apple-gray-500 ml-auto">
          <Activity :size="14" /> 运行时间: {{ formatUptime(health.uptime) }}
        </span>
      </div>
    </div>

    <!-- Token usage -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="block-card rounded-2xl p-6">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp :size="16" class="text-brian-blue" /> Token 使用趋势
        </h3>
        <div v-if="tokenTrend.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无数据</div>
        <div v-else class="h-40 flex items-end gap-1">
          <div
            v-for="(point, i) in tokenTrend.slice(-30)"
            :key="i"
            class="flex-1 bg-brian-blue/30 dark:bg-brian-blue/50 rounded-t"
            :style="{ height: `${(point.tokens / Math.max(...tokenTrend.map(p => p.tokens))) * 100}%` }"
            :title="`${point.date}: ${point.tokens.toLocaleString()} tokens`"
          />
        </div>
      </div>

      <div class="block-card rounded-2xl p-6">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <Layers :size="16" class="text-success-green" /> 模型分布
        </h3>
        <div v-if="modelDist.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无数据</div>
        <div v-else class="space-y-2 max-h-40 overflow-y-auto">
          <div v-for="m in modelDist" :key="m.model" class="flex items-center justify-between p-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50">
            <span class="text-sm truncate">{{ m.model }}</span>
            <span class="text-xs font-medium text-apple-gray-500 ml-2 flex-shrink-0">{{ m.tokens.toLocaleString() }} tokens</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Logs -->
    <div class="block-card rounded-2xl p-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold flex items-center gap-2">
          <Eye :size="16" class="text-brian-blue" /> 最近日志
        </h3>
        <div class="flex items-center gap-2">
          <select v-model="logLevel" class="px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none" @change="fetchAll()">
            <option value="">全部级别</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
            <option value="debug">debug</option>
          </select>
          <button class="p-1.5 rounded-lg text-apple-gray-400 hover:text-brian-blue hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="fetchAll()">
            <RefreshCw :size="14" />
          </button>
        </div>
      </div>
      <div v-if="logs.length === 0" class="text-center py-6 text-apple-gray-400 text-sm">暂无日志</div>
      <div v-else class="space-y-1 max-h-80 overflow-y-auto font-mono text-xs">
        <div v-for="(entry, i) in logs" :key="i" class="flex gap-2 py-1 px-2 rounded hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50">
          <span class="text-apple-gray-400 flex-shrink-0">{{ new Date(entry.timestamp).toLocaleTimeString('zh-CN') }}</span>
          <span class="flex-shrink-0 px-1 rounded text-xs font-medium" :class="logLevelColors[entry.level] || ''">{{ entry.level }}</span>
          <span class="text-apple-gray-500 flex-shrink-0">{{ entry.source }}</span>
          <span class="truncate">{{ entry.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
