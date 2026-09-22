<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bot, Boxes,
  Heart, Wand2, GitBranch,
  Lightbulb, RefreshCw, List,
  Settings, FileText, Network,
  ChevronRight, Trash2, Loader2, Check, AlertCircle,
  CheckSquare, Square,
  Star, FlaskConical, X, Save, Layers, Eraser,
  Globe, Key, Plus, Pencil, Download, ExternalLink,
  Eye, EyeOff,
  Search, Monitor, Terminal, MessageSquare, Send,
  BarChart3, Zap, Plug, Radio, Clock, GripVertical,
} from '@lucide/vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import CronConfigModal from '@/components/CronConfigModal.vue'
import { configApi, agentApi, skillApi, mcpApi, fetchApi, cdtApi, bookmarkApi, vectorDbApi, graphDbApi, mqApi } from '@/api'
import type { VectorSearchInfo } from '@/api'
import type { ConfigTreeLayer, MQMessage, MQStats, McpUsageRecord } from '@/api/types'

import { NAV_SECTIONS } from '@/utils/configDisplay'

const navSections = NAV_SECTIONS

// ============================================================
// 导航状态
// ============================================================

const route = useRoute()
const router = useRouter()

const expandedSections = ref<Record<string, boolean>>({})
const activeSection = ref((route.query.section as string) || 'llm')
const activeSubSection = ref((route.query.sub as string) || 'llm-provider')
const sidebarCollapsed = ref(false)

function syncQuery() {
  const query: Record<string, string> = {}
  if (activeSection.value !== 'llm' || activeSubSection.value !== 'llm-provider') {
    query.section = activeSection.value
    query.sub = activeSubSection.value
  }
  router.replace({ query })
}

function toggleSection(key: string) {
  expandedSections.value = { ...expandedSections.value, [key]: !expandedSections.value[key] }
  activeSection.value = key
  syncQuery()
}

function selectSub(sectionKey: string, subKey: string) {
  expandedSections.value = { ...expandedSections.value, [sectionKey]: true }
  activeSection.value = sectionKey
  activeSubSection.value = subKey
  syncQuery()
}

const currentSection = computed(() => navSections.find(s => s.key === activeSection.value))
const currentSub = computed(() => currentSection.value?.subsections.find(sub => sub.key === activeSubSection.value))
const isEntityView = computed(() => currentSub.value?.type === 'entity')
const isParamsView = computed(() => currentSub.value?.type === 'params')
const isSnapshotView = computed(() => currentSub.value?.type === 'snapshot')
const currentEntityType = computed(() => currentSub.value?.entityType)

// ===== 原始 breadcrumb（保留作为参考）=====
// const breadcrumb = computed(() => {
//   const items: { label: string }[] = []
//   if (currentSection.value) items.push({ label: currentSection.value.label })
//   if (currentSub.value) items.push({ label: currentSub.value.label })
//   return items
// })

// ===== 修改后：增加"配置中心"根路径 =====
const pagePath = computed(() => {
  const items: string[] = ['配置中心']
  if (currentSection.value) items.push(currentSection.value.label)
  if (currentSub.value) items.push(currentSub.value.label)
  return items
})

const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue/30 disabled:opacity-60 disabled:cursor-not-allowed transition-shadow'

// ============================================================
// 全局搜索
// ============================================================

const searchVisible = ref(false)
const searchQuery = ref('')

const allNavItems = computed(() => {
  const items: { sectionLabel: string; subLabel: string; sectionKey: string; subKey: string }[] = []
  for (const s of navSections) {
    for (const sub of s.subsections) {
      items.push({ sectionLabel: s.label, subLabel: sub.label, sectionKey: s.key, subKey: sub.key })
    }
  }
  return items
})

const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return []
  const q = searchQuery.value.toLowerCase()
  return allNavItems.value.filter(
    item => item.sectionLabel.toLowerCase().includes(q) || item.subLabel.toLowerCase().includes(q),
  )
})

function openSearch() { searchVisible.value = true; searchQuery.value = '' }
function closeSearch() { searchVisible.value = false }
function navigateFromSearch(sectionKey: string, subKey: string) {
  selectSub(sectionKey, subKey)
  closeSearch()
}

// ============================================================
// 配置树数据（参数配置用）
// ============================================================

interface ParamItem {
  config_key: string
  config_name: string
  config_type: string
  config_default: unknown
  config_value?: unknown
  current_value?: unknown
  config_description?: string
  config_enum_values?: unknown[] | null
  readable?: boolean
  writable?: boolean
  effective_readable?: boolean
  effective_writable?: boolean
}

const configLayers = ref<ConfigTreeLayer[]>([])
const configLoading = ref(false)
const configError = ref('')

async function loadConfigTree() {
  configLoading.value = true
  configError.value = ''
  try {
    const resp = await configApi.configTree()
    configLayers.value = resp.config?.layers || []
  } catch (e: unknown) {
    configError.value = e instanceof Error ? e.message : '加载配置失败'
  } finally {
    configLoading.value = false
  }
}

const currentParams = computed(() => {
  if (!currentSub.value || currentSub.value.type !== 'params') return [] as ParamItem[]
  const { configModule, configCategories, configLayer } = currentSub.value
  const items: ParamItem[] = []
  for (const layer of configLayers.value) {
    if (configLayer && layer.layer !== configLayer) continue
    for (const mod of layer.modules) {
      if (mod.module === configModule) {
        for (const cat of mod.categories) {
          if (configCategories && !configCategories.includes(cat.category)) continue
          for (const item of cat.items) {
            items.push({
              config_key: item.config_key,
              config_name: item.config_name,
              config_type: item.config_type,
              config_default: item.config_default,
              config_value: item.current_value,
              config_description: item.config_description,
              config_enum_values: item.config_enum_values,
              writable: item.effective_writable,
            })
          }
        }
      }
    }
  }
  return items
})

const currentParamsByCat = computed(() => {
  const groups: { cat: string; label: string; items: ParamItem[] }[] = []
  if (!currentSub.value) return groups
  const modKey = currentSub.value.configModule || ''
  const layerFilter = currentSub.value.configLayer
  for (const layer of configLayers.value) {
    if (layerFilter && layer.layer !== layerFilter) continue
    for (const mod of layer.modules) {
      if (mod.module !== modKey) continue
      for (const cat of mod.categories) {
        const catFilter = currentSub.value.configCategories
        if (catFilter && !catFilter.includes(cat.category)) continue
        const catItems = cat.items.map(item => ({
          config_key: item.config_key,
          config_name: item.config_name,
          config_type: item.config_type,
          config_default: item.config_default,
          config_value: item.current_value,
          config_description: item.config_description,
          config_enum_values: item.config_enum_values,
          writable: item.effective_writable,
        }))
        if (catItems.length > 0) {
          groups.push({ cat: cat.category, label: cat.label, items: catItems })
        }
      }
    }
  }
  return groups
})

const isCardView = computed(() => currentSub.value?.type === 'params')

// 渲染用分组：卡片视图单分组连续排布，列表视图按分类分组
const currentParamsGroups = computed(() => {
  if (isCardView.value) {
    return [{ cat: 'all', label: '', items: currentParams.value }]
  }
  return currentParamsByCat.value
})

const editingParam = ref<ParamItem | null>(null)
const editingParamValue = ref<string>('')
const paramSaving = ref(false)

// 卡片视图：每个参数卡片独立持有临时值 + 保存状态
const cardValues = ref<Record<string, string>>({})
const cardSaving = ref<Record<string, boolean>>({})

// VectorDB 语义搜索状态
const vectordbSearchText = ref('')
const vectordbSearchTopK = ref(10)
const vectordbSearchThreshold = ref(0)
const vectordbSearching = ref(false)
const vectordbSearchResults = ref<VectorSearchInfo[]>([])
const vectordbSearchError = ref('')
const vectordbModalVisible = ref(false)
const vectordbContentFilter = ref('')

const filteredVectorDbResults = computed(() => {
  const kw = vectordbContentFilter.value.trim().toLowerCase()
  if (!kw) return vectordbSearchResults.value
  return vectordbSearchResults.value.filter(r =>
    r.info.toLowerCase().includes(kw) ||
    r.info_type.toLowerCase().includes(kw) ||
    r.info_id.toLowerCase().includes(kw) ||
    r.info_creator_role.toLowerCase().includes(kw),
  )
})

const INFO_TYPE_LABELS: Record<string, string> = {
  REQUEST: '请求',
  RESPONSE: '回复',
  THINK: '思考',
  SKILL: '技能',
  MCP: 'MCP',
  CDT: '浏览器',
  ACT: '行动',
  REFLECT: '反思',
}

const INFO_CREATOR_LABELS: Record<string, string> = {
  USER: '用户',
  LEARNING: '自学习',
  AGENT: 'Agent',
  SKILL: '技能',
  MCP: 'MCP',
  CDT: '浏览器',
}

// 上下文构建维度（采集来源）
const COLLECTION_SOURCE_LABELS: Record<string, string> = {
  PINNED: '钉住消息',
  TIMELINE: '时间线消息',
  TAG_RELATIVE: '标签相关消息',
  SIMILARITY: '向量相似度消息',
  KEYWORD: '关键词相关消息',
  RANDOM: '随机关联消息',
}

const COLLECTION_SOURCE_OPTIONS = ['PINNED', 'TIMELINE', 'TAG_RELATIVE', 'SIMILARITY', 'KEYWORD', 'RANDOM']

function infoTypeLabel(t: string): string {
  return INFO_TYPE_LABELS[t] ?? t
}

function infoCreatorLabel(r: string): string {
  return INFO_CREATOR_LABELS[r] ?? r
}

function formatVectorTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function runVectorDbSearch() {
  const text = vectordbSearchText.value.trim()
  if (!text) return
  vectordbSearching.value = true
  vectordbSearchError.value = ''
  vectordbSearchResults.value = []
  vectordbContentFilter.value = ''
  try {
    const resp = await vectorDbApi.searchByText(text, vectordbSearchTopK.value, vectordbSearchThreshold.value)
    vectordbSearchResults.value = resp.results || []
    vectordbModalVisible.value = true
  } catch (e: unknown) {
    vectordbSearchError.value = e instanceof Error ? e.message : '搜索失败'
  } finally {
    vectordbSearching.value = false
  }
}

// GraphDB 标签图遍历搜索状态
const graphSearchQuery = ref('')
const graphSearchMaxDepth = ref(2)
const graphSearchOnlyActive = ref(true)
const graphSearching = ref(false)
const graphSearchError = ref('')
const graphSearchResult = ref<{ root_tags: Array<{ tag: string; info_ids: string[] }>; paths: Array<{ root_tag: string; root_id: string; nodes: Array<{ id: string; tag: string; info_ids: string[]; depth: number }>; edges: Array<{ from_id: string; to_id: string; weight: number; active: boolean; compositeWeight: number }> }> } | null>(null)

async function runGraphSearch() {
  const q = graphSearchQuery.value.trim()
  if (!q) return
  graphSearching.value = true
  graphSearchError.value = ''
  graphSearchResult.value = null
  try {
    graphSearchResult.value = await graphDbApi.search(q, graphSearchMaxDepth.value, graphSearchOnlyActive.value)
  } catch (e: unknown) {
    graphSearchError.value = e instanceof Error ? e.message : '搜索失败'
  } finally {
    graphSearching.value = false
  }
}

// MQ 消息发送/消费状态
const mqSendQueue = ref('default')
const mqSendPayload = ref('')
const mqSendPriority = ref<number | undefined>(undefined)
const mqSending = ref(false)
const mqSendError = ref('')
const mqSendResult = ref('')

const mqConsumeQueue = ref('default')
const mqConsuming = ref(false)
const mqConsumedMessage = ref<MQMessage | null>(null)
const mqConsumeError = ref('')

const mqDbQueues = ref<string[]>([])
const mqLocalQueues = ref<Set<string>>(new Set(['default']))
const mqDeletedQueues = ref<Set<string>>(new Set())
const mqSelectedQueues = ref<Set<string>>(new Set())
const mqQueues = computed(() => {
  const merged = new Set([...mqDbQueues.value, ...mqLocalQueues.value])
  for (const d of mqDeletedQueues.value) merged.delete(d)
  return Array.from(merged).sort()
})

// Cache total stats per load; individual queue stats fetched on click
const mqStatsCache = ref<Map<string, MQStats>>(new Map())
const mqStatsLoading = ref(false)
const mqSearchQuery = ref('')
const filteredMqQueues = computed(() => {
  const q = mqSearchQuery.value.trim().toLowerCase()
  if (!q) return mqQueues.value
  return mqQueues.value.filter(name => name.toLowerCase().includes(q))
})

// Modal state
const mqModalVisible = ref(false)
const activeMqQueue = ref('')
const mqTextSearch = ref('')
const mqTextLineJump = ref<number | undefined>(undefined)
const mqOutputRef = ref<HTMLTextAreaElement | null>(null)

function jumpToLine() {
  const el = mqOutputRef.value
  if (!el || mqTextLineJump.value === undefined) return
  const text = el.value
  const lines = text.split('\n')
  const line = Math.max(1, Math.min(mqTextLineJump.value, lines.length))
  let pos = 0
  for (let i = 0; i < line - 1; i++) pos += lines[i].length + 1
  el.setSelectionRange(pos, pos)
  el.focus()
}

function searchInText(direction: 'next' | 'prev') {
  const el = mqOutputRef.value
  if (!el || !mqTextSearch.value.trim()) return
  const text = el.value
  const query = mqTextSearch.value.trim()
  const start = el.selectionEnd
  const find = direction === 'next'
    ? text.indexOf(query, start)
    : text.lastIndexOf(query, start - 1)
  if (find !== -1) {
    el.setSelectionRange(find, find + query.length)
  } else if (direction === 'next') {
    // wrap around
    const wrap = text.indexOf(query, 0)
    if (wrap !== -1) el.setSelectionRange(wrap, wrap + query.length)
  } else {
    const wrap = text.lastIndexOf(query, text.length - 1)
    if (wrap !== -1) el.setSelectionRange(wrap, wrap + query.length)
  }
  el.focus()
}

const mqConsumedContent = computed(() => {
  if (!mqConsumedMessage.value) return ''
  const p = mqConsumedMessage.value.payload
  return typeof p === 'string' ? p : JSON.stringify(p, null, 2)
})

const mqContentLineCount = computed(() => {
  return mqConsumedContent.value ? mqConsumedContent.value.split('\n').length : 0
})

function toggleMqQueueSelection(queue: string) {
  const next = new Set(mqSelectedQueues.value)
  if (next.has(queue)) next.delete(queue)
  else next.add(queue)
  mqSelectedQueues.value = next
}

function toggleAllMqQueues() {
  const all = filteredMqQueues.value
  if (all.every(q => mqSelectedQueues.value.has(q))) {
    mqSelectedQueues.value = new Set()
  } else {
    mqSelectedQueues.value = new Set(all)
  }
}

async function loadMqQueues() {
  try {
    mqDbQueues.value = await mqApi.queues()
    // Preload stats for all known queues
    const allQueues = mqQueues.value
    const results = await Promise.allSettled(allQueues.map(q => mqApi.stats(q)))
    const cache = new Map<string, MQStats>()
    allQueues.forEach((q, i) => {
      const r = results[i]
      if (r.status === 'fulfilled') cache.set(q, r.value)
    })
    mqStatsCache.value = cache
  } catch { /* ignore */ }
}

async function loadMqStats() {
  mqStatsLoading.value = true
  try {
    await mqApi.stats()
    // Update cache for each queue from "all queues" perspective—best effort
    // We'll reload individual queue stats when user clicks
  } catch { /* ignore */ }
  finally { mqStatsLoading.value = false }
}

async function fetchQueueStats(queue: string): Promise<MQStats> {
  try {
    const s = await mqApi.stats(queue)
    mqStatsCache.value = new Map(mqStatsCache.value).set(queue, s)
    return s
  } catch {
    return { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 }
  }
}

function getQueueStats(queue: string): MQStats | undefined {
  return mqStatsCache.value.get(queue)
}

async function selectMqQueue(queue: string) {
  activeMqQueue.value = queue
  mqConsumeQueue.value = queue
  mqSendQueue.value = queue
  mqSendError.value = ''
  mqSendResult.value = ''
  mqConsumeError.value = ''
  mqConsumedMessage.value = null
  mqResetTime.value = ''
  await fetchQueueStats(queue)
  mqModalVisible.value = true
}

async function sendMqMessage() {
  const payload = mqSendPayload.value.trim()
  if (!payload) { mqSendError.value = '请输入消息内容'; return }
  const queue = mqSendQueue.value.trim() || 'default'
  mqSending.value = true
  mqSendError.value = ''
  mqSendResult.value = ''
  try {
    const resp = await mqApi.send(queue, payload, mqSendPriority.value)
    mqSendResult.value = `发送成功！消息 ID: ${resp.id}`
    mqSendPayload.value = ''
    mqSendPriority.value = undefined
    mqLocalQueues.value = new Set([...mqLocalQueues.value, queue])
    await loadMqQueues()
    await fetchQueueStats(queue)
  } catch (e: unknown) {
    mqSendError.value = e instanceof Error ? e.message : '发送失败'
  } finally { mqSending.value = false }
}

async function consumeMqMessage() {
  const queue = mqConsumeQueue.value.trim() || 'default'
  mqConsuming.value = true
  mqConsumeError.value = ''
  mqConsumedMessage.value = null
  try {
    const resp = await mqApi.consume(queue)
    mqConsumedMessage.value = resp.message
    await fetchQueueStats(queue)
  } catch (e: unknown) {
    mqConsumeError.value = e instanceof Error ? e.message : '消费失败'
  } finally { mqConsuming.value = false }
}

const mqNewQueue = ref('')
const mqCreating = ref(false)
const mqCreateError = ref('')
const mqCreateResult = ref('')

async function createMqQueue() {
  const name = mqNewQueue.value.trim()
  if (!name) { mqCreateError.value = '请输入队列名称'; return }
  if (mqQueues.value.includes(name)) { mqCreateError.value = `队列 "${name}" 已存在`; return }
  mqCreating.value = true
  mqCreateError.value = ''
  mqCreateResult.value = ''
  try {
    mqLocalQueues.value = new Set([...mqLocalQueues.value, name])
    mqDeletedQueues.value = new Set([...mqDeletedQueues.value].filter(d => d !== name))
    mqCreateResult.value = `队列 "${name}" 已就绪`
    mqNewQueue.value = ''
  } catch (e: unknown) {
    mqCreateError.value = e instanceof Error ? e.message : '创建失败'
  } finally { mqCreating.value = false }
}

function deleteMqQueue(queue: string) {
  mqDeletedQueues.value = new Set([...mqDeletedQueues.value, queue])
  mqLocalQueues.value = new Set([...mqLocalQueues.value].filter(q => q !== queue))
  mqSelectedQueues.value = new Set([...mqSelectedQueues.value].filter(q => q !== queue))
}

function deleteSelectedMqQueues() {
  for (const q of mqSelectedQueues.value) {
    mqDeletedQueues.value = new Set([...mqDeletedQueues.value, q])
    mqLocalQueues.value = new Set([...mqLocalQueues.value].filter(lq => lq !== q))
  }
  mqSelectedQueues.value = new Set()
}

const mqPurging = ref(false)
const mqPurgeError = ref('')
const mqPurgeResult = ref('')

async function purgeMqQueue(queue: string) {
  if (!queue) return
  mqPurging.value = true
  mqPurgeError.value = ''
  mqPurgeResult.value = ''
  try {
    const resp = await mqApi.purge(queue)
    mqPurgeResult.value = `队列 "${queue}" 已清空，删除 ${resp.deleted} 条消息`
    mqLocalQueues.value = new Set([...mqLocalQueues.value, queue])
    await fetchQueueStats(queue)
    await loadMqQueues()
  } catch (e: unknown) {
    mqPurgeError.value = e instanceof Error ? e.message : '清空失败'
  } finally { mqPurging.value = false }
}

const mqResetting = ref(false)
const mqResetTime = ref('')

async function resetMqQueue(queue: string) {
  if (!queue) return
  mqResetting.value = true
  try {
    const fromTime = mqResetTime.value.trim()
      ? new Date(mqResetTime.value.trim()).getTime()
      : undefined
    const resp = await mqApi.reset(queue, fromTime)
    if (resp.reset > 0) {
      mqConsumeError.value = ''
      mqConsumedMessage.value = null
    }
    await fetchQueueStats(queue)
    await loadMqQueues()
  } catch (e: unknown) {
    mqConsumeError.value = e instanceof Error ? e.message : '重置失败'
  } finally { mqResetting.value = false }
}

const configResetting = ref(false)
const showResetConfirm = ref(false)
const savingDefaults = ref(false)

function cancelReset() { showResetConfirm.value = false }

async function saveDefaults() {
  savingDefaults.value = true
  try {
    const resp = await fetchApi('/config/save-defaults', { method: 'POST' })
    showToast('当前配置已保存为默认: ' + (resp as {path:string}).path, 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally { savingDefaults.value = false }
}

async function executeReset() {
  showResetConfirm.value = false
  configResetting.value = true
  try {
    await fetchApi('/config/reset', { method: 'POST' })
    window.alert('配置已重置，即将刷新页面。')
    window.location.reload()
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : '重置失败')
  } finally { configResetting.value = false }
}

// ===== 快照管理 =====
interface Snapshot {
  id: string
  name: string
  created: number
}
const snapshots = ref<Snapshot[]>([])
const snapshotLoading = ref(false)
const snapshotCreating = ref(false)
const editingSnapId = ref('')
const editingSnapName = ref('')

async function loadSnapshots() {
  snapshotLoading.value = true
  try {
    const resp = await fetchApi('/config/snapshot')
    snapshots.value = (resp as { list: Snapshot[] }).list || []
  } finally { snapshotLoading.value = false }
}

async function createSnapshot() {
  snapshotCreating.value = true
  try {
    await fetchApi('/config/snapshot', { method: 'POST' })
    await loadSnapshots()
  } finally { snapshotCreating.value = false }
}

async function deleteSnapshot(id: string) {
  if (!window.confirm('确定要删除此快照吗？')) return
  await fetchApi('/config/snapshot/' + id, { method: 'DELETE' })
  await loadSnapshots()
}

async function restoreSnapshot(id: string) {
  if (!window.confirm('确定要恢复到此快照吗？当前配置将被覆盖。')) return
  await fetchApi('/config/snapshot/' + id + '/restore', { method: 'POST' })
  window.alert('配置已恢复，即将刷新页面。')
  window.location.reload()
}

function startEditName(snap: Snapshot) {
  editingSnapId.value = snap.id
  editingSnapName.value = snap.name
}

async function saveSnapName(_snap: Snapshot) {
  if (editingSnapName.value.trim()) {
    // Snapshot name is stored in DB, we need an update endpoint or we can just recreate
    // For now, display name is controlled locally
  }
  editingSnapId.value = ''
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatDurationSeconds(sec: number): string {
  if (sec < 60) return (sec % 1 === 0 ? `${sec}` : `${sec.toFixed(1)}`) + ' 秒'
  const m = sec / 60
  if (m < 60) return (m % 1 === 0 ? `${m}` : `${m.toFixed(1)}`) + ' 分钟'
  const h = m / 60
  if (h < 24) return (h % 1 === 0 ? `${h}` : `${h.toFixed(1)}`) + ' 小时'
  const d = h / 24
  return (d % 1 === 0 ? `${d}` : `${d.toFixed(1)}`) + ' 天'
}

function formatDurationMs(ms: number | string): string {
  const v = typeof ms === 'string' ? parseInt(ms, 10) : ms
  if (!v || v <= 0 || isNaN(v)) return ''
  if (v < 1000) return `${v}ms`
  return formatDurationSeconds(v / 1000)
}

// 秒单位的时长配置后缀（区别于毫秒单位的 _ms）
const SECONDS_SUFFIXES = ['_ttl', '_timeout', '_delay']

function isTimeConfig(key: string): boolean {
  return key.includes('timeout_ms') || key.includes('interval_ms') || key.includes('_ms')
    || SECONDS_SUFFIXES.some((s) => key.endsWith(s))
}

function isCronConfig(key: string): boolean {
  return key.endsWith('_cron')
}

function isInfoTypesConfig(key: string): boolean {
  return key.endsWith('.info_types')
}

function isPriorityOrderConfig(key: string): boolean {
  return key.endsWith('.priority_order')
}

function isSecondsConfig(key: string): boolean {
  return SECONDS_SUFFIXES.some((s) => key.endsWith(s))
}

function formatConfigDuration(key: string, value: string | number): string {
  const v = typeof value === 'string' ? parseInt(value, 10) : value
  if (!v || v <= 0 || isNaN(v)) return ''
  if (isSecondsConfig(key)) return formatDurationSeconds(v)
  return formatDurationMs(v)
}

watch(() => activeSubSection.value, (val) => {
  if (val === 'snapshot') loadSnapshots()
})

const prompts = ref<{ id: string; title: string; brief: string; enabled: boolean }[]>([])
const promptHelpCollapsed = ref(true)
const promptSearchQuery = ref('')
const selectedPrompts = ref<Set<string>>(new Set())

const filteredPrompts = computed(() => {
  const q = promptSearchQuery.value.toLowerCase().trim()
  if (!q) return prompts.value
  return prompts.value.filter(p =>
    (p.title || '').toLowerCase().includes(q) ||
    (p.brief || '').toLowerCase().includes(q)
  )
})

const allPromptsSelected = computed(() =>
  filteredPrompts.value.length > 0 && filteredPrompts.value.every(p => selectedPrompts.value.has(p.id))
)

function togglePromptSelect(id: string) {
  const next = new Set(selectedPrompts.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedPrompts.value = next
}

function togglePromptSelectAll() {
  if (allPromptsSelected.value) selectedPrompts.value = new Set()
  else selectedPrompts.value = new Set(filteredPrompts.value.map(p => p.id))
}

function getPromptTitle(id: string): string {
  const p = prompts.value.find(p => p.id === id)
  return p ? p.title : id || '—'
}

async function loadPrompts() {
  try {
    const list = await configApi.prompts.list()
    prompts.value = list || []
  } catch { /* ignore */ }
}

const promptPlaceholder = '请将以下内容翻译为{{target_lang}}：\n\n原文：{{source}}\n\n要求：{{requirement}}'

const promptModalVisible = ref(false)
const editingPrompt = ref<{ id: string; title: string; brief: string; enabled: boolean } | null>(null)
const promptForm = ref({ title: '', brief: '', template: '', enabled: true })
const promptSaving = ref(false)

async function openPromptModal(p?: { id: string; title: string; brief: string; enabled: boolean }) {
  editingPrompt.value = p || null
  if (p) {
    promptForm.value = { title: p.title, brief: p.brief || '', template: '', enabled: p.enabled }
    try {
      const full = await configApi.prompts.get(p.id)
      promptForm.value.template = full.template || ''
    } catch { /* keep empty */ }
  } else {
    promptForm.value = { title: '', brief: '', template: '', enabled: true }
  }
  promptModalVisible.value = true
}

function closePromptModal() {
  promptModalVisible.value = false
  editingPrompt.value = null
}

async function savePrompt() {
  if (!promptForm.value.title.trim() || !promptForm.value.template.trim()) return
  promptSaving.value = true
  try {
    const data = {
      title: promptForm.value.title.trim(),
      brief: promptForm.value.brief.trim() || undefined,
      template: promptForm.value.template,
      enabled: promptForm.value.enabled,
    }
    if (editingPrompt.value) {
      await configApi.prompts.update(editingPrompt.value.id, data)
      showToast('模板已更新', 'success')
    } else {
      await configApi.prompts.create(data)
      showToast('模板已创建', 'success')
    }
    closePromptModal()
    await loadPrompts()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    promptSaving.value = false
  }
}

async function handleDeletePrompt(id: string) {
  if (!confirm('确定删除该 Prompt 模板？')) return
  try {
    await configApi.prompts.delete(id)
    showToast('已删除', 'success')
    await loadPrompts()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

async function handleBatchDeletePrompts() {
  if (!confirm(`确定删除选中的 ${selectedPrompts.value.size} 个 Prompt 模板？`)) return
  try {
    for (const id of selectedPrompts.value) {
      await configApi.prompts.delete(id)
    }
    selectedPrompts.value = new Set()
    showToast('已批量删除', 'success')
    await loadPrompts()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '批量删除失败')
  }
}

function getConfigPrimitiveValue(item: ParamItem): unknown {
  let val = item.config_value !== undefined && item.config_value !== null
    ? item.config_value
    : item.config_default
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const segments = item.config_key.split('.')
    const lastKey = segments[segments.length - 1]
    if (lastKey in (val as Record<string, unknown>)) {
      return (val as Record<string, unknown>)[lastKey]
    }
    return null
  }
  return val
}

function getConfigDisplayValue(item: ParamItem): string {
  const val = getConfigPrimitiveValue(item)
  if (item.config_key.endsWith('prompt_template_id')) {
    return val ? getPromptTitle(String(val)) : 'prompt选择'
  }
  if (item.config_key.endsWith('strategy_id')) {
    return val ? getOrchStrategyLabel(String(val)) : '选择策略'
  }
  if (isPriorityOrderConfig(item.config_key)) {
    return formatPriorityOrderValue(val)
  }
  if (item.config_type === 'ENUM' && val !== undefined && val !== null) {
    return enumLabel(item.config_key, String(val))
  }
  if (val !== undefined && val !== null) return String(val)
  return '—'
}

function getOrchStrategyLabel(strategyId: string): string {
  const s = orchStrategies.value.find(o => o.strategyId === strategyId || o.id === strategyId)
  return s ? s.label : (strategyId || '—')
}

// 枚举值 → 中文显示名的映射（下拉与展示态共用）
const ENUM_LABELS: Record<string, Record<string, string>> = {
  'writer_agent.default_style': {
    clear: '清晰',
    concise: '简洁',
    detailed: '详细',
    creative: '创意',
  },
  'writer_agent.default_language': {
    'zh-CN': '中文',
    'en-US': '英文',
  },
  'writer_agent.default_depth': {
    shallow: '浅显',
    medium: '中等',
    deep: '深入',
  },
  'writer_agent.default_format': {
    TEXT: '纯文本',
    MARKDOWN: 'Markdown',
    JSON: 'JSON',
  },
  'graphdb_provider.default_trigger_type': {
    user_query: '用户交互触发',
    tag_maintenance: '标签维护触发',
    all: '所有触发方式',
  },
}

function enumLabel(configKey: string, value: string): string {
  return ENUM_LABELS[configKey]?.[value] ?? value
}

function startEditParam(item: ParamItem) {
  if (isCronConfig(item.config_key)) {
    editingCronItem.value = item
    cronModalVisible.value = true
    return
  }
  if (isInfoTypesConfig(item.config_key)) {
    openInfoTypesModal(item)
    return
  }
  if (isPriorityOrderConfig(item.config_key)) {
    openPriorityOrderModal(item)
    return
  }
  editingParam.value = item
  const val = getConfigPrimitiveValue(item)
  editingParamValue.value = val !== undefined && val !== null ? String(val) : ''
}

// Cron 定时时间弹窗
const cronModalVisible = ref(false)
const editingCronItem = ref<ParamItem | null>(null)

function getCronExpression(item: ParamItem): string {
  const val = getConfigPrimitiveValue(item)
  return val !== undefined && val !== null ? String(val) : ''
}

async function saveCronConfig(cron: string) {
  if (!editingCronItem.value) return
  try {
    await configApi.configItem.update(editingCronItem.value.config_key, cron)
    showToast('配置已保存', 'success')
    await loadConfigTree()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    cronModalVisible.value = false
    editingCronItem.value = null
  }
}

// ===== 摘要生成信息类型列表弹窗 =====
const infoTypesModalVisible = ref(false)
const editingInfoTypesItem = ref<ParamItem | null>(null)
const infoTypesList = ref<string[]>([])
const infoTypesSaving = ref(false)

const INFO_TYPE_OPTIONS = Object.keys(INFO_TYPE_LABELS)

function formatInfoTypesValue(value: unknown): string {
  const raw = value !== undefined && value !== null ? String(value) : ''
  const types = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (types.length === 0) return '配置信息类型'
  return types.map(t => infoTypeLabel(t)).join('、')
}

function availableInfoTypesFor(currentIndex: number): string[] {
  const selected = new Set(infoTypesList.value.filter((_, i) => i !== currentIndex))
  return INFO_TYPE_OPTIONS.filter(t => !selected.has(t))
}

function openInfoTypesModal(item: ParamItem) {
  editingInfoTypesItem.value = item
  const val = getConfigPrimitiveValue(item)
  const raw = val !== undefined && val !== null ? String(val) : ''
  const parsed = raw.split(',').map(s => s.trim()).filter(s => s && INFO_TYPE_OPTIONS.includes(s))
  infoTypesList.value = parsed.length > 0 ? parsed : ['']
  infoTypesModalVisible.value = true
}

function closeInfoTypesModal() {
  infoTypesModalVisible.value = false
  editingInfoTypesItem.value = null
  infoTypesList.value = []
}

function addInfoType() {
  if (infoTypesList.value.length >= INFO_TYPE_OPTIONS.length) return
  infoTypesList.value.push('')
}

function removeInfoType(index: number) {
  infoTypesList.value.splice(index, 1)
  if (infoTypesList.value.length === 0) infoTypesList.value = ['']
}

async function saveInfoTypes() {
  if (!editingInfoTypesItem.value) return
  const values = infoTypesList.value.map(s => s.trim()).filter(Boolean)
  infoTypesSaving.value = true
  try {
    await configApi.configItem.update(editingInfoTypesItem.value.config_key, values.join(','))
    showToast('配置已保存', 'success')
    closeInfoTypesModal()
    await loadConfigTree()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    infoTypesSaving.value = false
  }
}

// ===== 维度优先级顺序弹窗（上下文构建） =====
const priorityOrderModalVisible = ref(false)
const editingPriorityOrderItem = ref<ParamItem | null>(null)
const priorityOrderList = ref<Array<{ source: string; enabled: boolean }>>([])
const priorityOrderSaving = ref(false)
const priorityDragIndex = ref<number | null>(null)
const priorityDragOverIndex = ref<number | null>(null)

function formatPriorityOrderValue(value: unknown): string {
  const raw = value !== undefined && value !== null ? String(value) : ''
  const sources = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (sources.length === 0) return '配置采集维度'
  return sources.map(s => COLLECTION_SOURCE_LABELS[s] ?? s).join(' → ')
}

function openPriorityOrderModal(item: ParamItem) {
  editingPriorityOrderItem.value = item
  const val = getConfigPrimitiveValue(item)
  const raw = val !== undefined && val !== null ? String(val) : ''
  const enabledSet = new Set(
    raw.split(',').map(s => s.trim().toUpperCase()).filter(s => COLLECTION_SOURCE_OPTIONS.includes(s)),
  )
  priorityOrderList.value = COLLECTION_SOURCE_OPTIONS.map(source => ({
    source,
    enabled: enabledSet.has(source),
  }))
  priorityDragIndex.value = null
  priorityDragOverIndex.value = null
  priorityOrderModalVisible.value = true
}

function closePriorityOrderModal() {
  priorityOrderModalVisible.value = false
  editingPriorityOrderItem.value = null
  priorityOrderList.value = []
  priorityDragIndex.value = null
  priorityDragOverIndex.value = null
}

function togglePrioritySource(source: string) {
  const row = priorityOrderList.value.find(r => r.source === source)
  if (row) row.enabled = !row.enabled
}

function movePriorityItem(from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= priorityOrderList.value.length || to >= priorityOrderList.value.length) return
  const list = [...priorityOrderList.value]
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  priorityOrderList.value = list
}

function onPriorityDragStart(index: number) {
  priorityDragIndex.value = index
}

function onPriorityDragOver(index: number) {
  priorityDragOverIndex.value = index
}

function onPriorityDrop(index: number) {
  if (priorityDragIndex.value === null || priorityDragIndex.value === index) return
  movePriorityItem(priorityDragIndex.value, index)
  priorityDragIndex.value = null
  priorityDragOverIndex.value = null
}

function onPriorityDragEnd() {
  priorityDragIndex.value = null
  priorityDragOverIndex.value = null
}

async function savePriorityOrder() {
  if (!editingPriorityOrderItem.value) return
  const enabled = priorityOrderList.value.filter(r => r.enabled).map(r => r.source)
  priorityOrderSaving.value = true
  try {
    await configApi.configItem.update(editingPriorityOrderItem.value.config_key, enabled.join(','))
    showToast('配置已保存', 'success')
    closePriorityOrderModal()
    await loadConfigTree()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    priorityOrderSaving.value = false
  }
}

function cancelEditParam() {
  editingParam.value = null
  editingParamValue.value = ''
}

async function saveParam() {
  if (!editingParam.value) return
  paramSaving.value = true
  try {
    let value: unknown = editingParamValue.value
    const tp = editingParam.value.config_type
    if (tp === 'INT') value = parseInt(value as string, 10) || 0
    else if (tp === 'DOUBLE') value = parseFloat(value as string) || 0
    else if (tp === 'BOOLEAN') value = value === 'true' || value === true
    await configApi.configItem.update(editingParam.value.config_key, value)
    showToast('配置已保存', 'success')
    cancelEditParam()
    await loadConfigTree()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    paramSaving.value = false
  }
}

// 进入参数卡片视图时，用当前配置值初始化各卡片的临时值
watch(currentParams, (params) => {
  if (!isCardView.value) return
  const map: Record<string, string> = {}
  for (const p of params) {
    const val = getConfigPrimitiveValue(p)
    if (p.config_type === 'BOOLEAN') {
      map[p.config_key] = val === true || val === 1 || val === '1' || val === 'true' ? 'true' : 'false'
    } else {
      map[p.config_key] = val !== undefined && val !== null ? String(val) : ''
    }
  }
  cardValues.value = map
})

async function saveCard(item: ParamItem) {
  const raw = cardValues.value[item.config_key]
  if (raw === undefined) return
  cardSaving.value[item.config_key] = true
  try {
    let value: unknown = raw
    const tp = item.config_type
    if (tp === 'INT') value = parseInt(raw, 10) || 0
    else if (tp === 'DOUBLE') value = parseFloat(raw) || 0
    else if (tp === 'BOOLEAN') value = raw === 'true'
    await configApi.configItem.update(item.config_key, value)
    showToast('配置已保存', 'success')
    await loadConfigTree()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    cardSaving.value[item.config_key] = false
  }
}

// ============================================================
// Provider 数据 (LLM Providers)
// ============================================================

interface BackendProvider {
  id: string
  llm_provider_title?: string
  llm_provider_url?: string
  llm_provider_brief?: string
  api_key?: string
  enable?: boolean | number
  quota_tokens_per_day?: number
  quota_tokens_per_week?: number
  quota_tokens_per_month?: number
  quota_calls_per_day?: number
  quota_calls_per_week?: number
  quota_calls_per_month?: number
  models_path?: string | null
  chat_path?: string | null
  _displayName?: string
  _displayUrl?: string
}

const providers = ref<BackendProvider[]>([])
const providersLoading = ref(false)
const providerModalVisible = ref(false)
const editingProvider = ref<BackendProvider | null>(null)
const providerForm = ref({ name: '', url: '', apiKey: '', modelsPath: '', chatPath: '',
  quotaTokensPerDay: 0, quotaTokensPerWeek: 0, quotaTokensPerMonth: 0,
  quotaCallsPerDay: 0, quotaCallsPerWeek: 0, quotaCallsPerMonth: 0,
})
const providerSubmitting = ref(false)
const showApiKey = ref(false)
const fetchingModels = ref(false)
// 获取模型列表的请求序号：弹窗切换时自增，使进行中的旧请求结果失效，避免跨提供商串状态
let fetchModelSeq = 0
const fetchedModels = ref<Array<{ id: string; name: string; brief: string; features?: Record<string, unknown> }>>([])
interface FetchedModel { id: string; name: string; brief: string; features?: Record<string, unknown>; enabled?: boolean }

const cachedModels = ref<FetchedModel[]>([])
const modelSearchQuery = ref('')
const selectedModelIds = ref<Set<string>>(new Set())
const modelAddType = ref<'text' | 'vision' | 'embedding'>('text')

const filteredCachedModels = computed(() => {
  const q = modelSearchQuery.value.toLowerCase()
  if (!q) return cachedModels.value
  return cachedModels.value.filter(m =>
    m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || (m.brief || '').toLowerCase().includes(q),
  )
})

function toggleModelSelection(modelId: string) {
  const model = cachedModels.value.find(m => m.id === modelId)
  if (model?.enabled) return
  const s = new Set(selectedModelIds.value)
  if (s.has(modelId)) s.delete(modelId)
  else s.add(modelId)
  selectedModelIds.value = s
}

const addingModels = ref(false)
async function handleAddModels(providerId: string) {
  if (selectedModelIds.value.size === 0) return
  addingModels.value = true
  try {
    const res = await fetchApi<{ added: number }>(`/config/provider/${providerId}/models/add`, {
      method: 'POST',
      body: JSON.stringify({ modelIds: [...selectedModelIds.value], llm_type: modelAddType.value }),
    })
    showToast(`已添加 ${res.added} 个模型`, 'success')
    selectedModelIds.value = new Set()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '添加失败')
  } finally {
    addingModels.value = false
  }
}

function selectAllModels() {
  const available = filteredCachedModels.value.filter(m => !m.enabled)
  if (selectedModelIds.value.size === available.length && available.length > 0) {
    selectedModelIds.value = new Set()
  } else {
    selectedModelIds.value = new Set(available.map(m => m.id))
  }
}

async function loadCachedModels(providerId: string) {
  const seq = fetchModelSeq
  try {
    const res = await fetchApi<{ models: FetchedModel[] }>(`/config/provider/${providerId}/models`)
    if (seq !== fetchModelSeq) return
    cachedModels.value = res.models || []
  } catch {
    if (seq !== fetchModelSeq) return
    cachedModels.value = []
  }
}

async function handleFetchModels(providerId: string) {
  const seq = ++fetchModelSeq
  fetchingModels.value = true
  fetchedModels.value = []
  try {
    const res = await fetchApi<{ models: FetchedModel[]; total: number; cached: boolean }>(
      `/config/provider/${providerId}/fetch-models`, { method: 'POST' },
    )
    if (seq !== fetchModelSeq) return
    fetchedModels.value = res.models || []
    cachedModels.value = res.models || []
    showToast(`获取到 ${fetchedModels.value.length} 个模型`, 'success')
  } catch (e: unknown) {
    if (seq !== fetchModelSeq) return
    showToast(e instanceof Error ? e.message : '获取模型列表失败')
  } finally {
    if (seq === fetchModelSeq) fetchingModels.value = false
  }
}

async function loadProviders() {
  providersLoading.value = true
  try {
    const raw = await configApi.provider.list()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr = (raw as any[]) || []
    providers.value = arr.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      llm_provider_title: (r.llm_provider_title || r.providerName || '') as string,
      llm_provider_url: (r.llm_provider_url || r.baseURL || '') as string,
      llm_provider_brief: r.llm_provider_brief as string | undefined,
      api_key: r.api_key as string | undefined,
      enable: (r.enable ?? r.enabled) as boolean | number | undefined,
      _displayName: (r.llm_provider_title || r.providerName || r.id || '') as string,
      _displayUrl: (r.llm_provider_url || r.baseURL || '') as string,
      models_path: r.models_path as string | null,
      chat_path: r.chat_path as string | null,
      quota_tokens_per_day: r.quota_tokens_per_day as number | undefined,
      quota_tokens_per_week: r.quota_tokens_per_week as number | undefined,
      quota_tokens_per_month: r.quota_tokens_per_month as number | undefined,
      quota_calls_per_day: r.quota_calls_per_day as number | undefined,
      quota_calls_per_week: r.quota_calls_per_week as number | undefined,
      quota_calls_per_month: r.quota_calls_per_month as number | undefined,
    }))
  } catch {
    providers.value = []
  } finally {
    providersLoading.value = false
  }
}

function openProviderModal(provider?: BackendProvider) {
  // 切换弹窗时使进行中的旧请求失效，并重置加载状态，避免跨提供商串状态
  fetchModelSeq++
  fetchingModels.value = false
  if (provider) {
    editingProvider.value = provider
    providerForm.value = {
      name: provider.llm_provider_title || provider._displayName || '',
      url: provider.llm_provider_url || provider._displayUrl || '',
      apiKey: (provider.api_key as string) || '',
      modelsPath: provider.models_path || '',
      chatPath: provider.chat_path || '',
      quotaTokensPerDay: provider.quota_tokens_per_day || 0,
      quotaTokensPerWeek: provider.quota_tokens_per_week || 0,
      quotaTokensPerMonth: provider.quota_tokens_per_month || 0,
      quotaCallsPerDay: provider.quota_calls_per_day || 0,
      quotaCallsPerWeek: provider.quota_calls_per_week || 0,
      quotaCallsPerMonth: provider.quota_calls_per_month || 0,
    }
  } else {
    editingProvider.value = null
    providerForm.value = { name: '', url: '', apiKey: '', modelsPath: '', chatPath: '',
      quotaTokensPerDay: 0, quotaTokensPerWeek: 0, quotaTokensPerMonth: 0,
      quotaCallsPerDay: 0, quotaCallsPerWeek: 0, quotaCallsPerMonth: 0,
    }
  }
  providerModalVisible.value = true
  if (provider) {
    loadCachedModels(provider.id)
  } else {
    cachedModels.value = []
    modelSearchQuery.value = ''
    selectedModelIds.value = new Set()
  }
}

function closeProviderModal() {
  fetchModelSeq++
  fetchingModels.value = false
  providerModalVisible.value = false
  editingProvider.value = null
  showApiKey.value = false
  fetchedModels.value = []
  cachedModels.value = []
  modelSearchQuery.value = ''
  selectedModelIds.value = new Set()
}

async function submitProviderForm() {
  providerSubmitting.value = true
  try {
    const payload = { data: {
      llm_provider_title: providerForm.value.name,
      llm_provider_url: providerForm.value.url,
      llm_provider_brief: '',
      api_key: providerForm.value.apiKey || null,
      models_path: providerForm.value.modelsPath || null,
      chat_path: providerForm.value.chatPath || null,
      quota_tokens_per_day: providerForm.value.quotaTokensPerDay || 0,
      quota_tokens_per_week: providerForm.value.quotaTokensPerWeek || 0,
      quota_tokens_per_month: providerForm.value.quotaTokensPerMonth || 0,
      quota_calls_per_day: providerForm.value.quotaCallsPerDay || 0,
      quota_calls_per_week: providerForm.value.quotaCallsPerWeek || 0,
      quota_calls_per_month: providerForm.value.quotaCallsPerMonth || 0,
    }}
    if (editingProvider.value) {
      await fetchApi(`/config/provider/${editingProvider.value.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...payload, id: editingProvider.value.id }),
      })
    } else {
      await fetchApi('/config/provider', { method: 'POST', body: JSON.stringify(payload) })
    }
    showToast(editingProvider.value ? '已更新' : '已创建', 'success')
    closeProviderModal()
    await loadProviders()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    providerSubmitting.value = false
  }
}

async function handleDeleteProvider(providerId: string) {
  try {
    await configApi.provider.delete(providerId)
    providers.value = providers.value.filter(p => p.id !== providerId)
    showToast('已删除', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

async function handleToggleProvider(providerId: string) {
  const p = providers.value.find(pr => pr.id === providerId)
  if (!p) return
  const currentEnabled = !!p.enable
  const newEnabled = !currentEnabled
  try {
    await fetchApi(`/config/provider/${providerId}`, {
      method: 'PUT',
      body: JSON.stringify({ data: { enable: newEnabled }, id: providerId }),
    })
    p.enable = newEnabled
    showToast(newEnabled ? '已启用' : '已停用', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

async function handleTestProvider(providerId: string) {
  try {
    const res = await fetchApi<{ success: boolean; latency: number; message: string }>(
      `/config/provider/${providerId}/test`, { method: 'POST' },
    )
    showToast(res.success ? `连接成功 · ${res.latency}ms` : res.message, res.success ? 'success' : 'error')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '测试失败')
  }
}

// ============================================================
// Model 数据
// ============================================================

interface BackendModel {
  id: string
  modelName?: string
  providerName?: string
  providerId?: string
  maxTokens?: number
  enable?: boolean
  isDefault?: boolean
  llm_type?: string
  llm_brief?: string
  model_usage?: string
}

const models = ref<BackendModel[]>([])
const modelsLoading = ref(false)
const modelSearch = ref('')
const modelModalVisible = ref(false)

// 向量化专用：仅 embedding 类型模型
const embeddingModels = computed(() => models.value.filter(m => m.llm_type === 'embedding'))

const filteredModels = computed(() => {
  const q = modelSearch.value.toLowerCase()
  if (!q) return models.value
  return models.value.filter(m =>
    (m.modelName || '').toLowerCase().includes(q) ||
    (m.providerName || m.providerId || '').toLowerCase().includes(q),
  )
})
const editingModel = ref<BackendModel | null>(null)
const modelForm = ref({
  title: '', usage: 'text', providerId: '', maxTokens: 0, usageDesc: '', brief: '',
  providerMaxTokens: 0,
})
const modelSubmitting = ref(false)
const modelAttrLoading = ref(false)

// 模型测试（发送消息并展示原始结果）
const modelChatPrompt = ref('')
const modelChatResult = ref('')
const modelChatMeta = ref<{ input_tokens: number; output_tokens: number; duration_ms: number }>({ input_tokens: 0, output_tokens: 0, duration_ms: 0 })
const modelChatDimension = ref(0)
const modelChatError = ref('')
const modelChatLoading = ref(false)

const isEmbeddingModel = computed(() => (editingModel.value?.llm_type || modelForm.value.usage) === 'embedding')

async function sendModelChat() {
  const p = modelChatPrompt.value.trim()
  if (!p || !editingModel.value) return
  modelChatLoading.value = true
  modelChatError.value = ''
  modelChatResult.value = ''
  modelChatDimension.value = 0
  try {
    if (isEmbeddingModel.value) {
      const res = await configApi.model.embed(editingModel.value.id, p)
      if (res.error) {
        modelChatError.value = res.error
      } else {
        modelChatResult.value = res.raw_response || JSON.stringify(res.embedding || [])
        modelChatDimension.value = res.dimension || (res.embedding?.length ?? 0)
        modelChatMeta.value = { input_tokens: res.input_tokens, output_tokens: 0, duration_ms: res.duration_ms }
      }
    } else {
      const res = await configApi.model.chat(editingModel.value.id, p)
      if (res.error) {
        modelChatError.value = res.error
      } else {
        modelChatResult.value = res.raw_response || res.result || '(空回复)'
        modelChatMeta.value = { input_tokens: res.input_tokens, output_tokens: res.output_tokens, duration_ms: res.duration_ms }
      }
    }
  } catch (e: unknown) {
    modelChatError.value = e instanceof Error ? e.message : '调用失败'
  } finally {
    modelChatLoading.value = false
  }
}

// 原始响应若为 JSON 则缩进格式化展示，非 JSON 原样展示
const formattedModelResult = computed(() => {
  const raw = modelChatResult.value
  if (!raw) return ''
  const trimmed = raw.trim()
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return raw
  }
})

async function loadModels() {
  modelsLoading.value = true
  try {
    // 确保提供商列表已加载，才能把 providerId 解析为提供商名称
    if (providers.value.length === 0) await loadProviders()
    const raw = await configApi.model.list()
    const list = (Array.isArray(raw) ? raw : []) as BackendModel[]
    for (const m of list) {
      const p = providers.value.find(pr => pr.id === m.providerId)
      if (p) m.providerName = p._displayName || p.llm_provider_title || m.providerId
    }
    models.value = list
  } catch {
    models.value = []
  } finally {
    modelsLoading.value = false
  }
}

function openModelModal(model?: BackendModel) {
  if (model) {
    editingModel.value = model
    modelForm.value = {
      title: model.modelName || '',
      usage: model.llm_type || 'text',
      providerId: model.providerId || '',
      maxTokens: model.maxTokens || 0,
      usageDesc: model.model_usage || '',
      brief: model.llm_brief || '',
      providerMaxTokens: model.maxTokens || 0,
    }
  } else {
    editingModel.value = null
    modelForm.value = {
      title: '', usage: 'text', providerId: providers.value[0]?.id || '',
      maxTokens: 0, usageDesc: '', brief: '', providerMaxTokens: 0,
    }
  }
  modelModalVisible.value = true
  modelChatPrompt.value = ''
  modelChatResult.value = ''
  modelChatMeta.value = { input_tokens: 0, output_tokens: 0, duration_ms: 0 }
  modelChatDimension.value = 0
  modelChatError.value = ''
}

function closeModelModal() { modelModalVisible.value = false; editingModel.value = null }

async function autoFillModelAttr() {
  if (!editingModel.value || modelAttrLoading.value) return
  modelAttrLoading.value = true
  try {
    const res = await configApi.model.autofill(editingModel.value.id)
    if (res.error) {
      showToast(res.error, 'error')
      return
    }
    if (res.llm_brief) modelForm.value.brief = res.llm_brief
    if (res.model_usage) modelForm.value.usageDesc = res.model_usage
    showToast('已补全模型属性', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '一键补全失败')
  } finally {
    modelAttrLoading.value = false
  }
}

async function submitModelForm() {
  modelSubmitting.value = true
  try {
    const tokens = modelForm.value.providerMaxTokens
      ? Math.min(modelForm.value.maxTokens, modelForm.value.providerMaxTokens)
      : modelForm.value.maxTokens
    const data: Record<string, unknown> = {
      llm_title: modelForm.value.title,
      llm_type: modelForm.value.usage,
      llm_brief: modelForm.value.brief,
      maxTokens: tokens,
      model_usage: modelForm.value.usageDesc,
      enable: editingModel.value ? editingModel.value.enable !== false : true,
    }
    if (editingModel.value) {
      await configApi.model.update(editingModel.value.id, data)
    } else {
      await fetchApi('/config/model', { method: 'POST', body: JSON.stringify(data) })
    }
    showToast(editingModel.value ? '已更新' : '已创建', 'success')
    closeModelModal()
    await loadModels()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    modelSubmitting.value = false
  }
}

async function handleDeleteModel(modelId: string) {
  try {
    await configApi.model.delete(modelId)
    models.value = models.value.filter(m => m.id !== modelId)
    showToast('已删除', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

async function handleSetDefault(modelId: string) {
  try {
    await configApi.model.setDefault(modelId)
    showToast('已设为默认', 'success')
    await loadModels()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '设置失败')
  }
}

async function handleToggleModel(modelId: string) {
  const m = models.value.find(x => x.id === modelId)
  if (!m) return
  const newEnable = m.enable !== true
  try {
    await configApi.model.update(modelId, { enable: newEnable })
    m.enable = newEnable
    showToast(newEnable ? '已启用' : '已停用', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '切换失败')
  }
}

// ============================================================
// Soul 数据
// ============================================================

interface BackendSoul {
  id: string
  soul_brief?: string
  soul_content?: string
  soul_usage?: string
  enabled?: boolean
  enable?: boolean
}

const souls = ref<BackendSoul[]>([])
const soulsLoading = ref(false)
const soulModalVisible = ref(false)
const editingSoul = ref<BackendSoul | null>(null)
const soulForm = ref({ soulBrief: '', soulContent: '', soulUsage: '' })
const soulSubmitting = ref(false)

async function loadSouls() {
  soulsLoading.value = true
  try {
    const list = await configApi.soul.list() as unknown as BackendSoul[]
    souls.value = (list || []).map(s => ({
      ...s,
      enabled: s.enabled ?? s.enable ?? true,
    }))
  } catch {
    souls.value = []
  } finally {
    soulsLoading.value = false
  }
}

function openSoulModal(soul?: BackendSoul) {
  if (soul) {
    editingSoul.value = soul
    soulForm.value = {
      soulBrief: soul.soul_brief || '',
      soulContent: soul.soul_content || '',
      soulUsage: soul.soul_usage || '',
    }
  } else {
    editingSoul.value = null
    soulForm.value = { soulBrief: '', soulContent: '', soulUsage: '' }
  }
  soulModalVisible.value = true
}

function closeSoulModal() { soulModalVisible.value = false; editingSoul.value = null }

async function submitSoulForm() {
  soulSubmitting.value = true
  try {
    const data = {
      soul_brief: soulForm.value.soulBrief,
      soul_content: soulForm.value.soulContent,
      soul_usage: soulForm.value.soulUsage,
    }
    if (editingSoul.value) {
      await configApi.soul.update(editingSoul.value.id, data)
    } else {
      await fetchApi('/config/soul', { method: 'POST', body: JSON.stringify(data) })
    }
    showToast(editingSoul.value ? '已更新' : '已创建', 'success')
    closeSoulModal()
    await loadSouls()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    soulSubmitting.value = false
  }
}

async function handleDeleteSoul(soulId: string) {
  try {
    await configApi.soul.delete(soulId)
    souls.value = souls.value.filter(s => s.id !== soulId)
    showToast('已删除', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

async function handleToggleSoul(soulId: string) {
  const s = souls.value.find(st => st.id === soulId)
  if (!s) return
  const newVal = !(s.enabled ?? true)
  try {
    await configApi.soul.update(soulId, { enable: newVal })
    s.enabled = newVal
    showToast(newVal ? '已启用' : '已停用', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}


// ============================================================
// 画像维度 数据
// ============================================================

interface ProfileDirection {
  id: string; direction_key: string; direction_name: string; direction_description: string;
  weight: number; enable: number;
  prompt_template_id: string; llm_temperature: number; llm_max_tokens: number; llm_id: string;
}

const profileDirections = ref<ProfileDirection[]>([])
const profileDirsLoading = ref(false)
const profileDirModalVisible = ref(false)
const editingProfileDir = ref<ProfileDirection | null>(null)
const profileDirForm = ref({ direction_key: '', direction_name: '', direction_description: '', weight: 10, enable: true, prompt_template_id: '', llm_temperature: 0.3, llm_max_tokens: 512, llm_id: '' })
const profileDirSaving = ref(false)

async function loadProfileDirections() {
  profileDirsLoading.value = true
  try {
    const resp = await fetchApi<{ directions: ProfileDirection[] }>('/profile/direction')
    profileDirections.value = resp.directions || []
  } catch { profileDirections.value = [] }
  finally { profileDirsLoading.value = false }
}

function openProfileDirModal(d?: ProfileDirection) {
  if (d) {
    editingProfileDir.value = d
    profileDirForm.value = {
      direction_key: d.direction_key, direction_name: d.direction_name,
      direction_description: d.direction_description || '', weight: d.weight,
      enable: !!d.enable, prompt_template_id: d.prompt_template_id || '',
      llm_temperature: d.llm_temperature ?? 0.3, llm_max_tokens: d.llm_max_tokens ?? 512,
      llm_id: d.llm_id || '',
    }
  } else {
    editingProfileDir.value = null
    profileDirForm.value = { direction_key: '', direction_name: '', direction_description: '', weight: 10, enable: true, prompt_template_id: '', llm_temperature: 0.3, llm_max_tokens: 512, llm_id: '' }
  }
  profileDirModalVisible.value = true
}

function closeProfileDirModal() { profileDirModalVisible.value = false; editingProfileDir.value = null }

async function saveProfileDir() {
  if (!profileDirForm.value.direction_key.trim() || !profileDirForm.value.direction_name.trim()) return
  profileDirSaving.value = true
  try {
    await fetchApi('/profile/direction', {
      method: 'POST',
      body: JSON.stringify({ directions: [{
        direction_key: profileDirForm.value.direction_key.trim(),
        direction_name: profileDirForm.value.direction_name.trim(),
        direction_description: profileDirForm.value.direction_description.trim() || undefined,
        weight: profileDirForm.value.weight,
        enable: profileDirForm.value.enable,
        prompt_template_id: profileDirForm.value.prompt_template_id.trim() || undefined,
        llm_temperature: profileDirForm.value.llm_temperature,
        llm_max_tokens: profileDirForm.value.llm_max_tokens,
        llm_id: profileDirForm.value.llm_id.trim() || undefined,
      }] }),
    })
    showToast(editingProfileDir.value ? '已更新' : '已创建', 'success')
    closeProfileDirModal()
    await loadProfileDirections()
  } catch (e: unknown) { showToast(e instanceof Error ? e.message : '保存失败') }
  finally { profileDirSaving.value = false }
}

async function deleteProfileDir(dirKey: string) {
  if (!confirm('确定删除此维度？已生成的历史数据不受影响。')) return
  try {
    await fetchApi('/profile/direction', { method: 'DELETE', body: JSON.stringify({ direction_key: dirKey }) })
    showToast('已删除', 'success')
    await loadProfileDirections()
  } catch (e: unknown) { showToast(e instanceof Error ? e.message : '删除失败') }
}

async function toggleProfileDir(dir: ProfileDirection) {
  const newVal = !dir.enable
  try {
    await fetchApi('/profile/direction', {
      method: 'POST',
      body: JSON.stringify({ directions: [{ direction_key: dir.direction_key, direction_name: dir.direction_name, weight: dir.weight, enable: newVal }] }),
    })
    dir.enable = newVal ? 1 : 0
  } catch (e: unknown) { showToast(e instanceof Error ? e.message : '操作失败') }
}

// ============================================================
// Skill 数据
// ============================================================

interface BackendSkill {
  id: string
  name?: string
  skill_brief?: string
  skill_md?: string
  scripts?: { name: string; content: string }[]
  references?: { name: string; content: string }[]
  assets?: { name: string; content: string }[]
  enabled?: boolean
  enable?: boolean
}

interface SkillFileEntry {
  name: string
  content: string
}

const skills = ref<BackendSkill[]>([])
const skillsLoading = ref(false)
const skillModalVisible = ref(false)
const editingSkill = ref<BackendSkill | null>(null)
const skillForm = ref({
  name: '',
  skillBrief: '',
  skillMd: '',
  scripts: [] as SkillFileEntry[],
  references: [] as SkillFileEntry[],
  assets: [] as SkillFileEntry[],
})
const skillSubmitting = ref(false)
const skillSearchQuery = ref('')

// ===== 原始 skills（保留）=====
// const filteredSkills = computed(() => {
//   return skills.value
// })

// ===== 修改后：支持按名称搜索 =====
const filteredSkills = computed(() => {
  const q = skillSearchQuery.value.toLowerCase().trim()
  if (!q) return skills.value
  return skills.value.filter(sk =>
    (sk.name || '').toLowerCase().includes(q)
  )
})

function addFileEntry(arr: SkillFileEntry[]) {
  arr.push({ name: '', content: '' })
}
function removeFileEntry(arr: SkillFileEntry[], idx: number) {
  arr.splice(idx, 1)
}

async function loadSkills() {
  skillsLoading.value = true
  try {
    const res = await skillApi.list()
    skills.value = ((res.skills || []) as BackendSkill[]).map(s => ({
      ...s,
      name: s.name || s.skill_brief || '',
      enabled: s.enabled ?? s.enable ?? true,
    }))
  } catch {
    skills.value = []
  } finally {
    skillsLoading.value = false
  }
}

function openSkillModal(skill?: BackendSkill) {
  if (skill) {
    editingSkill.value = skill
    skillForm.value = {
      name: skill.name || '',
      skillBrief: skill.skill_brief || '',
      skillMd: skill.skill_md || '',
      scripts: (skill.scripts || []).map(f => ({ ...f })),
      references: (skill.references || []).map(f => ({ ...f })),
      assets: (skill.assets || []).map(f => ({ ...f })),
    }
  } else {
    editingSkill.value = null
    skillForm.value = { name: '', skillBrief: '', skillMd: '', scripts: [], references: [], assets: [] }
  }
  skillModalVisible.value = true
}

function closeSkillModal() { skillModalVisible.value = false; editingSkill.value = null }

// ===== 原始 submitSkillForm（保留作为参考）=====
// async function submitSkillForm() {
//   skillSubmitting.value = true
//   try {
//     const data: Record<string, unknown> = {
//       name: skillForm.value.name.trim(),
//       skill_brief: skillForm.value.skillBrief.trim() || skillForm.value.name.trim(),
//       skill_md: skillForm.value.skillMd,
//       scripts: skillForm.value.scripts.length > 0 ? skillForm.value.scripts : undefined,
//       references: skillForm.value.references.length > 0 ? skillForm.value.references : undefined,
//       assets: skillForm.value.assets.length > 0 ? skillForm.value.assets : undefined,
//     }
//     if (editingSkill.value) {
//       await skillApi.update(editingSkill.value.id, data)
//     } else {
//       await skillApi.create(data)
//     }
//     showToast(editingSkill.value ? '已更新' : '已创建', 'success')
//     closeSkillModal()
//     await loadSkills()
//   } catch (e: unknown) {
//     showToast(e instanceof Error ? e.message : '保存失败')
//   } finally {
//     skillSubmitting.value = false
//   }
// }

// ===== 修改后：新增同名检查 =====
async function submitSkillForm() {
  skillSubmitting.value = true
  try {
    const newName = skillForm.value.name.trim()
    const data: Record<string, unknown> = {
      name: newName,
      skill_brief: skillForm.value.skillBrief.trim() || newName,
      skill_md: skillForm.value.skillMd,
      scripts: skillForm.value.scripts.length > 0 ? skillForm.value.scripts : undefined,
      references: skillForm.value.references.length > 0 ? skillForm.value.references : undefined,
      assets: skillForm.value.assets.length > 0 ? skillForm.value.assets : undefined,
    }
    if (editingSkill.value) {
      await skillApi.update(editingSkill.value.id, data)
    } else {
      const duplicate = skills.value.find(s =>
        (s.name || '').toLowerCase() === newName.toLowerCase()
      )
      if (duplicate) {
        showToast(`已存在同名 Skill："${duplicate.name}"`)
        return
      }
      await skillApi.create(data)
    }
    showToast(editingSkill.value ? '已更新' : '已创建', 'success')
    closeSkillModal()
    await loadSkills()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    skillSubmitting.value = false
  }
}

async function handleDeleteSkill(skillId: string) {
  try {
    await skillApi.delete(skillId)
    skills.value = skills.value.filter(s => s.id !== skillId)
    showToast('已删除', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

async function handleToggleSkill(skillId: string) {
  try {
    await skillApi.toggle(skillId)
    await loadSkills()
    showToast('状态已切换', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

const skillTestModalVisible = ref(false)
const skillTestTarget = ref<BackendSkill | null>(null)
const skillTestParams = ref('{}')
const skillTestResult = ref('')
const skillTesting = ref(false)

function openSkillTestModal(skill: BackendSkill) {
  skillTestTarget.value = skill
  skillTestParams.value = '{}'
  skillTestResult.value = ''
  skillTestModalVisible.value = true
}

function closeSkillTestModal() {
  skillTestModalVisible.value = false
  skillTestTarget.value = null
  skillTestResult.value = ''
}

async function executeSkillTest() {
  if (!skillTestTarget.value || skillTesting.value) return
  let params: Record<string, unknown>
  try {
    params = JSON.parse(skillTestParams.value || '{}')
  } catch {
    showToast('参数必须是合法的 JSON')
    return
  }
  skillTesting.value = true
  skillTestResult.value = ''
  try {
    const res = await fetchApi<{ result?: unknown }>(`/skill/${encodeURIComponent(skillTestTarget.value.id)}/exec`, {
      method: 'POST',
      body: JSON.stringify({ params }),
    })
    const result = res.result
    skillTestResult.value = typeof result === 'string' ? result : (result != null ? JSON.stringify(result, null, 2) : '')
  } catch (e: unknown) {
    skillTestResult.value = e instanceof Error ? e.message : String(e)
  } finally {
    skillTesting.value = false
  }
}

// ============================================================
// MCP 数据
// ============================================================

interface BackendMcp {
  id: string
  displayName?: string
  name?: string
  description?: string
  version?: string
  status?: string
  running?: boolean
  enabled?: boolean
}

const mcps = ref<BackendMcp[]>([])
const mcpsLoading = ref(false)
const selectedMcpIds = ref<string[]>([])
const mcpRefreshing = ref(false)
const mcpBatchStarting = ref(false)
const mcpUsage = ref<McpUsageRecord[]>([])
const mcpUsageTotal = ref(0)
const mcpUsageLoading = ref(false)

async function loadMcps() {
  mcpsLoading.value = true
  try {
    const res = await mcpApi.installed()
    mcps.value = (res.installed || []) as BackendMcp[]
  } catch {
    mcps.value = []
  } finally {
    mcpsLoading.value = false
  }
}

async function loadMcpUsage() {
  mcpUsageLoading.value = true
  try {
    const res = await mcpApi.usage()
    mcpUsage.value = res.list || []
    mcpUsageTotal.value = res.total || 0
  } catch {
    mcpUsage.value = []
    mcpUsageTotal.value = 0
  } finally {
    mcpUsageLoading.value = false
  }
}

const mcpUsageToday = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return mcpUsage.value.filter(u => u.usage_date === today).reduce((s, u) => s + (u.usage_count || 0), 0)
})

const mcpUsageByMcp = computed(() => {
  const map = new Map<string, { title: string; count: number }>()
  for (const u of mcpUsage.value) {
    const key = u.mcp_install_id || u.mcp_title || 'unknown'
    const cur = map.get(key) || { title: u.mcp_title || key, count: 0 }
    cur.count += u.usage_count || 0
    map.set(key, cur)
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
})

async function handleBatchStartMcp() {
  if (selectedMcpIds.value.length === 0 || mcpBatchStarting.value) return
  mcpBatchStarting.value = true
  try {
    const res = await fetchApi<{ started_count?: number }>('/mcp/batch-start', {
      method: 'POST',
      body: JSON.stringify({ ids: selectedMcpIds.value }),
    })
    await loadMcps()
    selectedMcpIds.value = []
    showToast(`已启动 ${res.started_count ?? selectedMcpIds.value.length} 个 MCP`, 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '批量启动失败')
  } finally {
    mcpBatchStarting.value = false
  }
}

async function handleRefreshMcp() {
  if (mcpRefreshing.value) return
  mcpRefreshing.value = true
  try {
    const res = await fetchApi<{ removed?: number; running?: number; stopped?: number; total?: number }>('/mcp/refresh', { method: 'POST' })
    await loadMcps()
    const removed = res.removed ?? 0
    showToast(removed > 0 ? `刷新完成，清理 ${removed} 条已卸载记录` : '刷新完成', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '刷新失败')
  } finally {
    mcpRefreshing.value = false
  }
}

async function handleToggleMcp(mcpId: string) {
  try {
    await fetchApi(`/mcp/${mcpId}/toggle`, { method: 'POST' })
    await loadMcps()
    showToast('状态已切换', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

// ============================================================
// MCP Provider 数据 (MCP 市场)
// ============================================================

interface BackendMcpProvider {
  id: string
  provider_code?: string
  mcp_provider_title?: string
  mcp_provider_url?: string
  mcp_provider_brief?: string
  enable?: boolean | number
  _displayName?: string
}

interface McpMarketTool {
  id: string
  title: string
  brief: string
  install_cmd?: string
  installed?: boolean
}

const MCP_TOOL_CACHE_TTL = 24 * 60 * 60 * 1000
const mcpToolCache = new Map<string, { tools: McpMarketTool[]; timestamp: number }>()

const mcpProviders = ref<BackendMcpProvider[]>([])
const mcpProvidersLoading = ref(false)

const mcpMarketTools = ref<McpMarketTool[]>([])
const mcpMarketLoading = ref(false)
const mcpMarketLoadingMore = ref(false)
const mcpMarketPage = ref(1)
const mcpMarketHasMore = ref(true)
const mcpMarketTotal = ref(0)
const mcpMarketSelectedProvider = ref<string | null>(null)
const mcpMarketSearchQuery = ref('')
const installingMcpId = ref<string | null>(null)

const mcpMarketMessage = ref('')

// ===== MCP 市场无限滚动 =====
const mcpMarketSentinel = ref<HTMLElement | null>(null)
const mcpMarketScrollContainer = ref<HTMLElement | null>(null)
const showMcpBackToTop = ref(false)
let mcpMarketObserver: IntersectionObserver | null = null

function setupMcpMarketObserver() {
  if (mcpMarketObserver) {
    mcpMarketObserver.disconnect()
    mcpMarketObserver = null
  }
  if (!mcpMarketSentinel.value) return

  mcpMarketObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && mcpMarketHasMore.value && mcpMarketSelectedProvider.value && !mcpMarketLoadingMore.value) {
        loadMoreMcpTools()
      }
    },
    { root: mcpMarketScrollContainer.value, rootMargin: '200px' },
  )
  mcpMarketObserver.observe(mcpMarketSentinel.value)
}

function onMcpMarketScroll() {
  showMcpBackToTop.value = (mcpMarketScrollContainer.value?.scrollTop ?? 0) > 400
}

function scrollMcpMarketToTop() {
  mcpMarketScrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

// 当工具列表/分页状态/选中市场变化时，重新挂载 observer
watch(
  [() => mcpMarketTools.value.length, mcpMarketHasMore, mcpMarketSelectedProvider],
  () => { nextTick(() => setupMcpMarketObserver()) },
)

const mcpConfigModalVisible = ref(false)
const mcpConfigProviderId = ref('')
const mcpConfigApiKey = ref('')
const mcpConfigShowKey = ref(false)

const mcpConfigMeta: Record<string, { keyField: string; placeholder: string; hint: string }> = {
  'aliyun_bailian': { keyField: 'aliyun_bailian_api_key', placeholder: 'sk-...', hint: '请在阿里云百炼控制台获取 DashScope API Key' },
  'modelscope': { keyField: 'modelscope_api_key', placeholder: '输入 ModelScope API Key', hint: '请在魔搭社区个人设置中获取 API Key' },
  'smithery': { keyField: 'smithery_api_key', placeholder: 'sk-...', hint: 'API Key 可选，公开浏览无需配置' },
  'github': { keyField: 'github_api_key', placeholder: 'ghp_...', hint: '可选，用于提升 API 速率限制' },
}

const mcpConfigKeyPlaceholder = computed(() => mcpConfigMeta[mcpConfigProviderId.value]?.placeholder || '输入 API Key')
const mcpConfigKeyHint = computed(() => mcpConfigMeta[mcpConfigProviderId.value]?.hint || '')

function openMcpConfigModal(providerId: string) {
  mcpConfigProviderId.value = providerId
  mcpConfigApiKey.value = localStorage.getItem(`mcp_api_key_${providerId}`) || ''
  mcpConfigShowKey.value = false
  mcpConfigModalVisible.value = true
}

function closeMcpConfigModal() {
  mcpConfigModalVisible.value = false
}

function saveMcpConfig() {
  const providerId = mcpConfigProviderId.value
  if (mcpConfigApiKey.value.trim()) {
    localStorage.setItem(`mcp_api_key_${providerId}`, mcpConfigApiKey.value.trim())
    showToast('API Key 已保存', 'success')
  } else {
    localStorage.removeItem(`mcp_api_key_${providerId}`)
    showToast('API Key 已清除', 'success')
  }
  closeMcpConfigModal()
}

function handleClearMcpApiKey() {
  mcpConfigApiKey.value = ''
}

const filteredMcpMarketTools = computed(() => {
  const q = mcpMarketSearchQuery.value.toLowerCase().trim()
  if (!q) return mcpMarketTools.value
  return mcpMarketTools.value.filter(t =>
    (t.title || t.id || '').toLowerCase().includes(q) ||
    (t.brief || '').toLowerCase().includes(q),
  )
})

async function loadMcpProviders() {
  mcpProvidersLoading.value = true
  try {
    const list = await configApi.mcp.market()
    mcpProviders.value = ((list || []) as BackendMcpProvider[]).map(p => {
      const code = p.provider_code || p.id
      return {
        ...p,
        provider_code: code,
        _displayName: p.mcp_provider_title || code,
      }
    })
  } catch {
    mcpProviders.value = []
  } finally {
    mcpProvidersLoading.value = false
  }
}

function toggleMcpMarket(providerId: string) {
  if (mcpMarketSelectedProvider.value === providerId) {
    mcpMarketSelectedProvider.value = null
    mcpMarketSearchQuery.value = ''
    mcpMarketMessage.value = ''
    showMcpBackToTop.value = false
    return
  }
  mcpMarketSelectedProvider.value = providerId
  mcpMarketSearchQuery.value = ''
  mcpMarketMessage.value = ''
  showMcpBackToTop.value = false
  mcpMarketPage.value = 1
  mcpMarketHasMore.value = true
  mcpMarketTotal.value = 0
  loadMcpMarketTools(providerId, true)
}

async function loadMcpMarketTools(providerId: string, reset = false) {
  const page = reset ? 1 : mcpMarketPage.value + 1
  if (!reset && !mcpMarketHasMore.value) return
  if (reset) {
    mcpMarketPage.value = 1
    mcpMarketTools.value = []
    mcpMarketHasMore.value = true
  }
  const isInitial = reset && !mcpMarketSearchQuery.value
  const cached = mcpToolCache.get(providerId)
  if (isInitial && cached && (Date.now() - cached.timestamp) < MCP_TOOL_CACHE_TTL) {
    mcpMarketTools.value = cached.tools
    return
  }

  if (page === 1) { mcpMarketLoading.value = true }
  else { mcpMarketLoadingMore.value = true }

  try {
    const body: Record<string, unknown> = { pageSize: 30, page }
    if (mcpMarketSearchQuery.value.trim()) body.keyword = mcpMarketSearchQuery.value.trim()
    const res = await fetchApi<{ list?: McpMarketTool[]; total?: number; message?: string }>(
      `/config/mcp/provider/${providerId}/list`, { method: 'POST', body: JSON.stringify(body) },
    )
    const tools = res.list || []
    if (page === 1) {
      mcpMarketTools.value = tools
      if (isInitial) mcpToolCache.set(providerId, { tools, timestamp: Date.now() })
    } else {
      mcpMarketTools.value = [...mcpMarketTools.value, ...tools]
    }
    mcpMarketPage.value = page
    mcpMarketTotal.value = res.total || 0
    mcpMarketHasMore.value = tools.length >= 30
    mcpMarketMessage.value = (res.message && tools.length === 0) ? res.message : ''
    if (res.message && tools.length === 0 && page === 1) {
      showToast(res.message)
    }
  } catch (e: unknown) {
    if (page === 1) mcpMarketTools.value = []
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('not found') || msg.includes('404') || msg.includes('Route')) { /* ignore */ }
    else if (page === 1) showToast(msg || '加载失败')
  } finally {
    if (page === 1) { mcpMarketLoading.value = false }
    else { mcpMarketLoadingMore.value = false }
  }
}

function loadMoreMcpTools() {
  if (!mcpMarketSelectedProvider.value || mcpMarketLoadingMore.value) return
  loadMcpMarketTools(mcpMarketSelectedProvider.value, false)
}

const searchMcpMarketDebounced = (() => {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (providerId: string) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      mcpMarketPage.value = 1
      mcpMarketHasMore.value = true
      loadMcpMarketTools(providerId, true)
    }, 400)
  }
})()

function onMcpMarketSearchChange() {
  if (!mcpMarketSelectedProvider.value) return
  searchMcpMarketDebounced(mcpMarketSelectedProvider.value)
}

async function handleRefreshMcpList(providerId: string) {
  try {
    const res = await fetchApi<{ total?: number }>(`/config/mcp/provider/${providerId}/list`, { method: 'POST' })
    const total = res.total ?? (Array.isArray(res) ? res.length : 0)
    showToast(`获取到 ${total} 个工具`, 'success')
    mcpToolCache.delete(providerId)
    mcpMarketPage.value = 1
    mcpMarketHasMore.value = true
    await loadMcpMarketTools(providerId, true)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('not found') || msg.includes('404') || msg.includes('Route')) {
      showToast('市场 API 尚未接入，后端暂未实现该市场的工具列表接口')
    } else {
      showToast(msg || '刷新失败')
    }
  }
}

async function handleTestMcpProvider(providerId: string) {
  try {
    const res = await fetchApi<{ success?: boolean; connected?: boolean; message?: string; latency?: number }>(
      `/config/mcp/provider/${providerId}/test`, { method: 'POST' },
    )
    const ok = res.success ?? res.connected ?? false
    const latencyStr = res.latency != null ? ` · ${res.latency}ms` : ''
    showToast(`${ok ? '✓ ' : '✗ '}${res.message || '测试失败'}${latencyStr}`, ok ? 'success' : 'error')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('not found') || msg.includes('404') || msg.includes('Route')) {
      showToast('市场连通性测试后端暂未实现')
    } else {
      showToast(`✗ ${msg || '测试失败'}`)
    }
  }
}

async function handleInstallMcp(providerId: string, toolId: string) {
  installingMcpId.value = toolId
  try {
    await fetchApi('/config/mcp/install', {
      method: 'POST',
      body: JSON.stringify({ mcp_provider_id: providerId, mcp_id: toolId }),
    })
    showToast('安装成功', 'success')
    await loadMcps()
    await loadMcpMarketTools(providerId)
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '安装失败')
  } finally {
    installingMcpId.value = null
  }
}

async function handleStartMcp(mcpId: string) {
  try {
    await fetchApi('/config/mcp/start', { method: 'POST', body: JSON.stringify({ id: mcpId }) })
    showToast('已启动', 'success')
    await loadMcps()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '启动失败')
  }
}

async function handleStopMcp(mcpId: string) {
  try {
    await fetchApi('/config/mcp/stop', { method: 'POST', body: JSON.stringify({ id: mcpId }) })
    showToast('已停止', 'success')
    await loadMcps()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '停止失败')
  }
}

async function handleUpgradeMcp(mcpId: string) {
  try {
    const res = await fetchApi<{ version?: string }>(`/mcp/${mcpId}/upgrade`, { method: 'POST' })
    await loadMcps()
    showToast(res.version ? `已更新至 v${res.version}` : '已更新', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '更新失败')
  }
}

async function handleUninstallMcp(mcpId: string) {
  if (!confirm('确定卸载该 MCP？')) return
  try {
    await fetchApi('/config/mcp/uninstall', { method: 'POST', body: JSON.stringify({ id: mcpId }) })
    mcps.value = mcps.value.filter(m => m.id !== mcpId)
    showToast('已卸载', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '卸载失败')
  }
}

// ============================================================
// Agent 数据
// ============================================================

interface BackendAgent {
  id: string
  agent_name?: string
  name?: string
  agent_type?: string
  type?: string
  description?: string
  agent_purpose?: string
  strategy_id?: string
  llm_id?: string
  soul_id?: string
  task_signature?: string
  enable?: boolean
  enabled?: boolean
  eval_score?: number
  usage_count?: number
}

const agents = ref<BackendAgent[]>([])
const agentsLoading = ref(false)
const agentModalVisible = ref(false)
const editingAgent = ref<BackendAgent | null>(null)
const agentForm = ref({
  name: '', type: 'WORKER', description: '',
  strategyId: '', llmId: '', soulId: '', taskSignature: '',
})
const agentSubmitting = ref(false)

// ===== 原始：无名称查找 =====
// function getStrategyLabel(strategyId: string): string { return strategyId }
// function getModelName(modelId: string): string { return modelId }
// function getSoulName(soulId: string): string { return soulId }

// ===== 修改后：根据 ID 查找名称（Agent 执行策略来自 /api/agent/strategy）=====
function getStrategyLabel(strategyId: string): string {
  const s = agentStrategies.value.find(o => o.strategy_id === strategyId)
  return s ? `${s.strategy_label} (${parseDomains(s.suitable_domains)})` : strategyId || '—'
}
function getModelName(modelId: string): string {
  const m = models.value.find(md => md.id === modelId)
  return m ? (m.modelName || m.id) : modelId || '—'
}
function getSoulName(soulId: string): string {
  const s = souls.value.find(sl => sl.id === soulId)
  return s ? (s.soul_brief || s.id) : soulId || '—'
}

async function loadAgents() {
  agentsLoading.value = true
  try {
    const res = await agentApi.list()
    agents.value = (res.agents || []) as BackendAgent[]
  } catch {
    agents.value = []
  } finally {
    agentsLoading.value = false
  }
}

// ===== 原始 openAgentModal（保留作为参考）=====
// function openAgentModal(agent?: BackendAgent) {
//   if (agent) {
//     editingAgent.value = agent
//     agentForm.value = {
//       name: agent.agent_name || agent.name || '',
//       type: agent.agent_type || agent.type || 'WORKER',
//       description: agent.description || '',
//       strategyId: agent.strategy_id || '',
//       llmId: agent.llm_id || '',
//       soulId: agent.soul_id || '',
//       taskSignature: agent.task_signature || '',
//     }
//   } else {
//     editingAgent.value = null
//     agentForm.value = { name: '', type: 'WORKER', description: '', strategyId: '', llmId: '', soulId: '', taskSignature: '' }
//   }
//   agentModalVisible.value = true
// }

// ===== 修改后：加载下拉选项数据 =====
async function openAgentModal(agent?: BackendAgent) {
  if (orchStrategies.value.length === 0) await loadOrchStrategies()
  if (agentStrategies.value.length === 0) await loadAgentStrategies()
  if (models.value.length === 0) await loadModels()
  if (souls.value.length === 0) await loadSouls()
  if (agent) {
    editingAgent.value = agent
    agentForm.value = {
      name: agent.agent_name || agent.name || '',
      type: agent.agent_type || agent.type || 'WORKER',
      description: agent.agent_purpose || agent.description || '',
      strategyId: agent.strategy_id || '',
      llmId: agent.llm_id || '',
      soulId: agent.soul_id || '',
      taskSignature: agent.task_signature || '',
    }
  } else {
    editingAgent.value = null
    agentForm.value = { name: '', type: 'WORKER', description: '', strategyId: '', llmId: '', soulId: '', taskSignature: '' }
  }
  agentModalVisible.value = true
}

function closeAgentModal() { agentModalVisible.value = false; editingAgent.value = null }

async function submitAgentForm() {
  agentSubmitting.value = true
  try {
    const data: Record<string, unknown> = {
      agent_name: agentForm.value.name,
      agent_type: agentForm.value.type,
      description: agentForm.value.description,
      agent_purpose: agentForm.value.description,
      strategy_id: agentForm.value.strategyId,
      llm_id: agentForm.value.llmId,
      soul_id: agentForm.value.soulId,
      task_signature: agentForm.value.taskSignature,
    }
    if (editingAgent.value) {
      await agentApi.update(editingAgent.value.id, data)
    } else {
      await agentApi.create(data)
    }
    showToast(editingAgent.value ? '已更新' : '已创建', 'success')
    closeAgentModal()
    await loadAgents()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    agentSubmitting.value = false
  }
}

async function handleDeleteAgent(agentId: string) {
  try {
    await agentApi.delete(agentId)
    agents.value = agents.value.filter(a => a.id !== agentId)
    showToast('已删除', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

async function handleToggleAgent(agentId: string) {
  try {
    await agentApi.toggle(agentId)
    await loadAgents()
    showToast('状态已切换', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

// ============================================================
// 编排策略数据
// ============================================================

interface OrchStrategyNode {
  id: string
  type: string
  params: Record<string, unknown>
  next: string | null
  onError?: string
  trueNext?: string
  falseNext?: string
}

interface OrchStrategy {
  id: string
  strategyId: string
  label: string
  description: string
  enabled: boolean
  nodeCount: number
  startNode: string
  nodes: OrchStrategyNode[]
}

const orchStrategies = ref<OrchStrategy[]>([])
const orchStrategiesLoading = ref(false)
const orchStrategyHelpCollapsed = ref(true)
const orchStrategyDetailVisible = ref(false)
const selectedOrchStrategy = ref<OrchStrategy | null>(null)

function openOrchStrategyDetail(s: OrchStrategy) {
  selectedOrchStrategy.value = s
  orchStrategyDetailVisible.value = true
}

function closeOrchStrategyDetail() {
  orchStrategyDetailVisible.value = false
  selectedOrchStrategy.value = null
}

function orchNodeNumber(nodeId: string | null | undefined): string {
  if (!nodeId) return '—'
  const nodes = selectedOrchStrategy.value?.nodes ?? []
  const idx = nodes.findIndex(n => n.id === nodeId)
  return idx >= 0 ? String(idx + 1) : '—'
}

function nodeColor(type: string): string {
  if (type.includes('SAVE') || type.includes('WRITE')) return 'border-brian-blue/30 bg-brian-blue/5 text-brian-blue'
  if (type.includes('BUILD') || type.includes('CONTEXT') || type.includes('PLAN')) return 'border-success-green/30 bg-success-green/5 text-success-green'
  if (type.includes('EXEC') || type.includes('DAG')) return 'border-warning-orange/30 bg-warning-orange/5 text-warning-orange'
  if (type.includes('EVAL')) return 'border-purple-500/30 bg-purple-500/5 text-purple-500'
  if (type.includes('CONDITION')) return 'border-apple-gray-400 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-600'
  if (type.includes('ERROR')) return 'border-error-red/30 bg-error-red/5 text-error-red'
  return 'border-apple-gray-200'
}

async function loadOrchStrategies() {
  orchStrategiesLoading.value = true
  try {
    const res = await fetchApi('/orchestration/strategies')
    orchStrategies.value = (res || []) as OrchStrategy[]
  } catch {
    orchStrategies.value = []
  } finally {
    orchStrategiesLoading.value = false
  }
}

// ============================================================
// 执行策略数据（Agent 层）
// ============================================================

interface AgentStrategy {
  id: string
  strategy_id: string
  strategy_label: string
  suitable_complexity_min: number
  suitable_complexity_max: number
  suitable_domains: string
  execution_rule: string
  enable: boolean
}

const agentStrategies = ref<AgentStrategy[]>([])
const agentStrategiesLoading = ref(false)

function formatStrategyRule(rule: string): string {
  try {
    const obj = JSON.parse(rule) as Record<string, unknown>
    const steps = (obj.steps as Array<{ step: string }> | undefined)?.map(s => s.step)
    if (steps?.length) return steps.join(' → ')
    const phases = (obj.phases as Array<{ phase: string }> | undefined)?.map(p => p.phase)
    if (phases?.length) return phases.join(' → ')
  } catch { /* ignore */ }
  return rule
}

function parseDomains(domains: string): string {
  try {
    const arr = JSON.parse(domains) as string[]
    return arr.includes('*') ? '通用' : arr.join('、')
  } catch {
    return domains
  }
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

async function loadAgentStrategies() {
  agentStrategiesLoading.value = true
  try {
    const res = await fetchApi<{ strategies: AgentStrategy[] }>('/agent/strategy')
    agentStrategies.value = res.strategies || []
  } catch {
    agentStrategies.value = []
  } finally {
    agentStrategiesLoading.value = false
  }
}

interface StrategyStepInfo {
  step: string
  next?: string | null
  on_error?: string
  condition_field?: string
  true_next?: string
  false_next?: string
}

interface StrategyPhaseInfo {
  phase: string
  loop_over?: string
  steps: StrategyStepInfo[]
}

interface ParsedStrategyRule {
  version?: string
  max_iterations?: number
  steps?: StrategyStepInfo[]
  phases?: StrategyPhaseInfo[]
  raw: string
}

function parseStrategyRule(rule: string): ParsedStrategyRule {
  try {
    const obj = JSON.parse(rule) as Record<string, unknown>
    return {
      version: obj.version as string | undefined,
      max_iterations: obj.max_iterations as number | undefined,
      steps: obj.steps as StrategyStepInfo[] | undefined,
      phases: obj.phases as StrategyPhaseInfo[] | undefined,
      raw: rule,
    }
  } catch {
    return { raw: rule }
  }
}

async function toggleStrategy(s: AgentStrategy) {
  try {
    const res = await fetchApi<{ success: boolean; enable: boolean }>(`/agent/strategy/${encodeURIComponent(s.strategy_id)}/toggle`, { method: 'POST' })
    s.enable = res.enable
    showToast(res.enable ? '已启用' : '已禁用', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '切换失败')
  }
}

const strategyDetailVisible = ref(false)
const selectedStrategy = ref<AgentStrategy | null>(null)

const selectedStrategyRule = computed<ParsedStrategyRule>(() => {
  return selectedStrategy.value ? parseStrategyRule(selectedStrategy.value.execution_rule) : { raw: '' }
})

function openStrategyDetail(s: AgentStrategy) {
  selectedStrategy.value = s
  strategyDetailVisible.value = true
}

function closeStrategyDetail() {
  strategyDetailVisible.value = false
  selectedStrategy.value = null
}

// ============================================================
// Toast
// ============================================================

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(message: string, type: 'success' | 'error' = 'error') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 3000)
}

// ============================================================
// CDT / 浏览器
// ============================================================

// ---- 浏览器状态 ----
const cdtStatus = ref<{ running: boolean; pid: number; port: number; endpoint?: string }>({ running: false, pid: 0, port: 0 })
const cdtStatusLoading = ref(false)

async function loadCDTStatus() {
  cdtStatusLoading.value = true
  try { cdtStatus.value = await cdtApi.status() }
  catch { cdtStatus.value = { running: false, pid: 0, port: 0 } }
  finally { cdtStatusLoading.value = false }
}

async function startCDT() {
  try { cdtStatus.value = await cdtApi.start(); showToast('CDT 已启动', 'success') }
  catch (e: unknown) { showToast(`启动失败: ${e instanceof Error ? e.message : '未知错误'}`) }
  finally { await loadCDTStatus() }
}

async function stopCDT() {
  try { await cdtApi.stop(); showToast('CDT 已停止', 'success') }
  catch (e: unknown) { showToast(`停止失败: ${e instanceof Error ? e.message : '未知错误'}`) }
  finally { await loadCDTStatus() }
}

// ---- 网页访问（Remote Browser） ----
const cdtPageUrl = ref(localStorage.getItem('cdt_last_url') || '')
const cdtPageLoading = ref(false)
const cdtPageFrame = ref('')
const cdtFrameWidth = ref(1920)
const cdtFrameHeight = ref(1080)
const cdtFramePollTimer = ref<ReturnType<typeof setInterval> | null>(null)
const cdtBrowserRef = ref<HTMLDivElement | null>(null)
const cdtScreencastW = ref(Number(localStorage.getItem('cdt_screencast_w') || 1920))
const cdtScreencastH = ref(Number(localStorage.getItem('cdt_screencast_h') || 1080))
const cdtScreencastQ = ref(Number(localStorage.getItem('cdt_screencast_q') || 80))
const cdtScreencastSettingsOpen = ref(false)
const cdtResolutions = [
  { w: 1920, h: 1080, label: '1920×1080 (Full HD)' },
  { w: 1440, h: 900,  label: '1440×900' },
  { w: 1280, h: 720,  label: '1280×720 (HD)' },
  { w: 1024, h: 768,  label: '1024×768' },
  { w: 800,  h: 600,  label: '800×600' },
]
const cdtQualities = [30, 50, 70, 80, 100]

function applyCdtScreencastSettings(w: number, h: number, q: number) {
  cdtScreencastW.value = w; cdtScreencastH.value = h; cdtScreencastQ.value = q
  localStorage.setItem('cdt_screencast_w', String(w))
  localStorage.setItem('cdt_screencast_h', String(h))
  localStorage.setItem('cdt_screencast_q', String(q))
  cdtScreencastSettingsOpen.value = false
}

interface CDTStoredSession { cookiesJson: string; url: string; timestamp: number }
function getSavedCDTSessions(): Record<string, CDTStoredSession> {
  try { return JSON.parse(localStorage.getItem('cdt_saved_sessions') || '{}') }
  catch { return {} }
}
function saveCDTSession(domain: string, cookiesJson: string, url: string) {
  const sessions = getSavedCDTSessions()
  sessions[domain] = { cookiesJson, url, timestamp: Date.now() }
  localStorage.setItem('cdt_saved_sessions', JSON.stringify(sessions))
}
const savedCDTSessions = computed(() => {
  const sessions = getSavedCDTSessions()
  return Object.entries(sessions).map(([domain, s]) => ({ domain, ...s }))
})

async function cdtNavigate() {
  const url = cdtPageUrl.value.trim()
  if (!url) { showToast('请输入 URL'); return }
  cdtPageLoading.value = true
  try {
    await spoofBrowserEnv()
    await cdtApi.navigate(url)
    localStorage.setItem('cdt_last_url', url)
    await cdtApi.screencastStart(cdtScreencastW.value, cdtScreencastH.value, cdtScreencastQ.value)
    startFramePoll()
    showToast('已打开页面', 'success')
  } catch (e: unknown) {
    showToast(`导航失败: ${e instanceof Error ? e.message : '未知错误'}`)
  } finally { cdtPageLoading.value = false }
}

/** 检测前端浏览器环境并同步到远程 Chrome */
async function spoofBrowserEnv() {
  if (!cdtStatus.value.running) return
  const nav = navigator as Navigator & { deviceMemory?: number }
  const langStr = (nav.languages || [nav.language || 'zh-CN']).join(',')
  try {
    await cdtApi.spoofEnv({
      platform: nav.platform || 'Win32',
      userAgent: nav.userAgent,
      acceptLang: nav.language || 'zh-CN',
      acceptLangFull: (nav.languages || [nav.language || 'zh-CN']).join(',') + (langStr.includes('en') ? '' : ',en;q=0.8'),
      hardwareConcurrency: nav.hardwareConcurrency || 8,
      deviceMemory: nav.deviceMemory || 8,
      languages: nav.languages || [nav.language || 'zh-CN'],
    })
  } catch { /* 非关键操作 */ }
}

function startFramePoll() {
  stopFramePoll()
  ;(async () => {
    try {
      const r = await cdtApi.frame()
      if (r.dataUrl) { cdtPageFrame.value = r.dataUrl; if (r.width) cdtFrameWidth.value = r.width; if (r.height) cdtFrameHeight.value = r.height }
    } catch { /* */ }
  })()
  cdtFramePollTimer.value = setInterval(async () => {
    try {
      const r = await cdtApi.frame()
      if (r.dataUrl) { cdtPageFrame.value = r.dataUrl; if (r.width) cdtFrameWidth.value = r.width; if (r.height) cdtFrameHeight.value = r.height }
    } catch { /* */ }
  }, 250)
}

function stopFramePoll() {
  if (cdtFramePollTimer.value) { clearInterval(cdtFramePollTimer.value); cdtFramePollTimer.value = null }
}

function getBrowserCoords(e: MouseEvent): { x: number; y: number } | null {
  if (!cdtBrowserRef.value || !cdtPageFrame.value) return null
  const img = cdtBrowserRef.value.querySelector('img')
  if (!img) return null
  const rect = img.getBoundingClientRect()
  if (cdtFrameWidth.value <= 0 || rect.width <= 0) return null
  const scaleX = cdtFrameWidth.value / rect.width
  const scaleY = cdtFrameHeight.value / rect.height
  return {
    x: Math.round((e.clientX - rect.left) * scaleX),
    y: Math.round((e.clientY - rect.top) * scaleY),
  }
}

const isDragging = ref(false)
let lastDragX = 0
let lastDragY = 0

function mods(e: MouseEvent | KeyboardEvent) {
  return { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey }
}

async function onBrowserMouseDown(e: MouseEvent) {
  const coords = getBrowserCoords(e)
  if (!coords) return
  if (e.button === 2) {
    await cdtApi.rightclick(coords.x, coords.y)
  } else {
    const m = mods(e)
    await cdtApi.mouse('mouseMoved', coords.x, coords.y, 'left', 1, 0, 0, m.ctrl, m.alt, m.shift, m.meta)
    await cdtApi.mouse('mousePressed', coords.x, coords.y, 'left', 1, 0, 0, m.ctrl, m.alt, m.shift, m.meta)
    isDragging.value = true
    lastDragX = coords.x
    lastDragY = coords.y
  }
  cdtBrowserRef.value?.focus()
}

async function onBrowserMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  const coords = getBrowserCoords(e)
  if (!coords) return
  if (Math.abs(coords.x - lastDragX) < 1 && Math.abs(coords.y - lastDragY) < 1) return
  lastDragX = coords.x
  lastDragY = coords.y
  const m = mods(e)
  await cdtApi.mouse('mouseMoved', coords.x, coords.y, 'left', 1, 0, 0, m.ctrl, m.alt, m.shift, m.meta)
}

async function onBrowserMouseUp(_e: MouseEvent) {
  cdtBrowserRef.value?.focus()
  if (isDragging.value) {
    isDragging.value = false
    await cdtApi.mouse('mouseReleased', lastDragX, lastDragY, 'left', 1)
  }
}

async function onBrowserMouseLeave(e: MouseEvent) {
  if (isDragging.value) {
    const coords = getBrowserCoords(e)
    if (coords) {
      await cdtApi.mouse('mouseMoved', coords.x, coords.y)
      await cdtApi.mouse('mouseReleased', coords.x, coords.y)
    }
    isDragging.value = false
  }
}

async function onBrowserDblClick(e: MouseEvent) {
  e.preventDefault()
  const coords = getBrowserCoords(e)
  if (!coords) return
  const m = mods(e)
  await cdtApi.dblclick(coords.x, coords.y, m.ctrl, m.alt, m.shift, m.meta)
  cdtBrowserRef.value?.focus()
}

function onBrowserContextMenu(e: MouseEvent) {
  e.preventDefault()
  const coords = getBrowserCoords(e)
  if (!coords) return
  // 转发右击到远程 Chrome（页内 JS handler 可拦截）
  cdtApi.rightclick(coords.x, coords.y)
  // 本地弹出自定义菜单
  ctxMenuVisible.value = true
  ctxMenuX.value = e.clientX
  ctxMenuY.value = e.clientY
  cdtBrowserRef.value?.focus()
}

// ---- 自定义右击菜单 ----
const ctxMenuVisible = ref(false)
const ctxMenuX = ref(0)
const ctxMenuY = ref(0)

function hideCtxMenu() { ctxMenuVisible.value = false }

async function ctxCopy() {
  hideCtxMenu()
  cdtBrowserRef.value?.focus()
  await cdtApi.keyBatch([
    { type: 'rawKeyDown', key: 'c', ctrl: true },
    { type: 'keyUp', key: 'c', ctrl: true },
  ])
}

async function ctxPaste() {
  hideCtxMenu()
  cdtBrowserRef.value?.focus()
  await doRemotePaste()
}

async function ctxSelectAll() {
  hideCtxMenu()
  cdtBrowserRef.value?.focus()
  await cdtApi.keyBatch([
    { type: 'rawKeyDown', key: 'a', ctrl: true },
    { type: 'keyUp', key: 'a', ctrl: true },
  ])
}

/** 可靠粘贴：读本地剪贴板 → insertText 到远程 */
let pasteInProgress = false
async function doRemotePaste() {
  if (pasteInProgress) return
  pasteInProgress = true
  try {
    let text = ''
    try { text = await navigator.clipboard.readText() } catch { /* */ }
    if (!text) {
      text = await new Promise<string>((resolve) => {
        const ta = document.createElement('textarea')
        ta.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:9999'
        document.body.appendChild(ta)
        ta.focus()
        const onPaste = (ev: Event) => {
          const ce = ev as ClipboardEvent
          const val = ce.clipboardData?.getData('text') || ''
          ta.removeEventListener('paste', onPaste)
          document.body.removeChild(ta)
          cdtBrowserRef.value?.focus()
          resolve(val)
        }
        ta.addEventListener('paste', onPaste)
        document.execCommand('paste')
        setTimeout(() => {
          ta.removeEventListener('paste', onPaste)
          const val = ta.value
          document.body.removeChild(ta)
          cdtBrowserRef.value?.focus()
          if (!val) resolve('')
        }, 200)
      })
    }
    if (text) await cdtApi.insertText(text)
  } finally {
    pasteInProgress = false
  }
}

async function onBrowserKeyDown(e: KeyboardEvent) {
  const isMod = e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta'
  if (isMod) {
    e.preventDefault()
    await cdtApi.key('rawKeyDown', '', e.key)
    return
  }

  // Ctrl+V / Ctrl+Shift+V：直接读剪贴板插入，不依赖浏览器 paste 事件
  if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
    doRemotePaste()
    return
  }

  e.preventDefault()

  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'Control' || e.key === 'Meta') return
    await cdtApi.keyBatch([
      { type: 'rawKeyDown', key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey },
    ])
    return
  }

  await cdtApi.keyBatch([
    { type: 'rawKeyDown', key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey },
    ...(e.key.length === 1 ? [{ type: 'char', text: e.key, key: e.key }] : []),
  ])
}

// ---- 保底 paste 监听（也处理右键粘贴、Ctrl+C 后再 Ctrl+V 等场景） ----
let pasteCleanup: (() => void) | null = null
function setupRemotePasteListener() {
  if (pasteCleanup) return
  const handler = async (e: ClipboardEvent) => {
    if (pasteInProgress) return
    if (!cdtBrowserRef.value) return
    const active = document.activeElement
    if (active !== cdtBrowserRef.value && !cdtBrowserRef.value.contains(active as Node)) return
    let text = e.clipboardData?.getData('text') || ''
    if (!text) {
      try { text = await navigator.clipboard.readText() } catch { /* */ }
    }
    if (!text) return
    e.preventDefault()
    await cdtApi.insertText(text)
  }
  document.addEventListener('paste', handler)
  pasteCleanup = () => document.removeEventListener('paste', handler)
}

async function onBrowserKeyUp(e: KeyboardEvent) {
  e.preventDefault()
  const isMod = e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta'
  if (isMod) {
    await cdtApi.key('keyUp', '', e.key)
    return
  }

  await cdtApi.keyBatch([
    { type: 'keyUp', key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey },
  ])
}

async function onBrowserPaste(e: ClipboardEvent) {
  e.preventDefault()
  await doRemotePaste()
}

function onBrowserWheel(e: WheelEvent) {
  e.preventDefault()
  if (!cdtBrowserRef.value || !cdtPageFrame.value) return
  const img = cdtBrowserRef.value.querySelector('img')
  if (!img) return
  const rect = img.getBoundingClientRect()
  if (cdtFrameWidth.value <= 0 || rect.width <= 0) return
  const scaleX = cdtFrameWidth.value / rect.width
  const scaleY = cdtFrameHeight.value / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY
  cdtApi.mouse('mouseWheel', x, y, 'left', 0, e.deltaX, e.deltaY)
}

async function cdtSaveCredential() {
  try {
    const url = cdtPageUrl.value.trim()
    const domain = extractDomain(url)
    const res = await cdtApi.cookies()
    saveCDTSession(domain, res.cookiesJson, url)
    showToast(`已保存 ${domain} 的登录凭证`, 'success')
  } catch (e: unknown) {
    showToast(`保存失败: ${e instanceof Error ? e.message : '未知错误'}`)
  }
}

async function cdtRestoreCredential(domain: string, cookiesJson: string, url: string) {
  if (!cdtStatus.value.running) { showToast('请先启动 CDT 浏览器'); return }
  try {
    await cdtApi.navigate(url)
    const cookies: Array<{ name: string; value: string; domain: string }> = JSON.parse(cookiesJson)
    for (const c of cookies) {
      if (c.name && c.value) {
        await cdtApi.evaluate(`document.cookie = '${c.name}=${c.value}; path=/'`)
      }
    }
    await cdtApi.navigate(url)
    cdtPageUrl.value = url
    await cdtApi.screencastStart()
    startFramePoll()
    showToast(`已恢复 ${domain} 的凭证`, 'success')
  } catch (e: unknown) {
    showToast(`恢复失败: ${e instanceof Error ? e.message : '未知错误'}`)
  }
}

async function cdtDeleteCredential(domain: string) {
  const sessions = getSavedCDTSessions()
  delete sessions[domain]
  localStorage.setItem('cdt_saved_sessions', JSON.stringify(sessions))
  showToast(`已删除 ${domain} 的凭证`, 'success')
}

function extractDomain(url: string): string {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname }
  catch { return url }
}

// ---- 书签管理 ----
interface BookmarkFolder { id: string; name: string; parent_id: string; sort_order: number; children: BookmarkFolder[]; items: BookmarkItem[] }
interface BookmarkItem { id: string; folder_id: string; title: string; url: string; favicon: string; sort_order: number }
interface FlatFolder { id: string; name: string; parent_id: string; sort_order: number }

const bookmarkTree = ref<BookmarkFolder[]>([])
const bookmarkFlatFolders = ref<FlatFolder[]>([])
const bookmarkLoading = ref(false)
const bookmarkNewItemUrl = ref('')
const bookmarkNewItemTitle = ref('')
const bookmarkNewItemFolder = ref('')
const expandedFolders = ref<Set<string>>(new Set())

async function loadBookmarks() {
  bookmarkLoading.value = true
  try {
    const [tree, folders] = await Promise.all([bookmarkApi.tree(), bookmarkApi.flatFolders()])
    bookmarkTree.value = tree
    bookmarkFlatFolders.value = folders
    const allFolders = flattenFolders(tree)
    expandedFolders.value = new Set(allFolders.map((f: BookmarkFolder) => f.id))
  } catch { bookmarkTree.value = [] }
  finally { bookmarkLoading.value = false }
}

function flattenFolders(tree: BookmarkFolder[]): BookmarkFolder[] {
  return tree.flatMap(f => [f, ...flattenFolders(f.children)])
}

function toggleFolder(id: string) {
  const next = new Set(expandedFolders.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedFolders.value = next
}

async function addBookmarkItem(url?: string, title?: string) {
  const finalUrl = (url || bookmarkNewItemUrl.value).trim()
  const finalTitle = (title || bookmarkNewItemTitle.value).trim() || finalUrl
  if (!finalUrl) { showToast('请输入 URL'); return }
  let folderId = bookmarkNewItemFolder.value || bookmarkTree.value[0]?.id || ''
  if (!folderId) {
    try { const f = await bookmarkApi.createFolder('书签栏', ''); folderId = f.id; await loadBookmarks() }
    catch (e: unknown) { showToast(`自动创建文件夹失败: ${e instanceof Error ? e.message : '未知错误'}`); return }
  }
  try { await bookmarkApi.createItem(folderId, finalTitle, finalUrl); bookmarkNewItemUrl.value = ''; bookmarkNewItemTitle.value = ''; await loadBookmarks(); showToast('书签已添加', 'success') }
  catch (e: unknown) { showToast(`添加失败: ${e instanceof Error ? e.message : '未知错误'}`) }
}

async function removeFolder(id: string) {
  if (!confirm('删除文件夹将同时删除其中的所有书签和子文件夹，确认？')) return
  try { await bookmarkApi.deleteFolder(id); await loadBookmarks() }
  catch (e: unknown) { showToast(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`) }
}

async function removeBookmarkItem(id: string) {
  try { await bookmarkApi.deleteItem(id); await loadBookmarks() }
  catch (e: unknown) { showToast(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`) }
}

// ============================================================
// 初始化
// ============================================================

onMounted(() => {
  loadConfigTree()
  loadPrompts()
  loadModels()
})

function handleKeydown(e: KeyboardEvent) {
  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    openSearch()
  }
  if (e.key === 'Escape') {
    closeSearch()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (mcpMarketObserver) { mcpMarketObserver.disconnect(); mcpMarketObserver = null }
  stopFramePoll()
  pasteCleanup?.()
})

watch(activeSubSection, async (val) => {
  const sub = currentSection.value?.subsections.find(s => s.key === val)
  if (sub?.type === 'entity') {
    switch (sub.entityType) {
      case 'provider': await loadProviders(); break
      case 'model': await loadModels(); break
      case 'soul': await loadSouls(); break
      case 'skill': await loadSkills(); break
      case 'mcp': await loadMcps(); break
      case 'mcp-provider': await loadMcpProviders(); break
      case 'mcp-stats': await loadMcps(); await loadMcpUsage(); break
      case 'agent': await loadAgents(); break
      case 'prompt': await loadPrompts(); break
      case 'strategy': await loadAgentStrategies(); break
      case 'orch-strategy': await loadOrchStrategies(); break
      case 'cdt-status': await loadCDTStatus(); break
      case 'cdt-page': await loadCDTStatus(); await loadBookmarks(); setupRemotePasteListener(); break
      case 'profile-direction': await loadProfileDirections(); break
    }
  } else if (sub?.type === 'params') {
    await loadConfigTree()
    if (sub.key === 'infra-mq') {
      await loadMqQueues()
      await loadMqStats()
    }
    if (sub.configModule === 'strategy' && orchStrategies.value.length === 0) {
      await loadOrchStrategies()
    }
  }
}, { immediate: true })
</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative">
    <NeuralBackground />
    <Header />
    <div class="pt-12 h-full relative z-10 flex">

      <!-- ═══════════════ 左侧边栏导航 ═══════════════ -->
      <aside
        class="flex-shrink-0 flex flex-col border-r border-apple-gray-200 dark:border-apple-gray-700 bg-white/90 dark:bg-apple-gray-800/90 backdrop-blur-md transition-all duration-200"
        :class="sidebarCollapsed ? 'w-14' : 'w-60'"
      >
        <div class="flex items-center justify-between px-3 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <div v-if="!sidebarCollapsed" class="flex items-center gap-2">
            <Settings :size="17" class="text-brian-blue" />
            <span class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">配置中心</span>
          </div>
          <button
            class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors flex-shrink-0"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <ChevronRight :size="16" :class="{ 'rotate-180': !sidebarCollapsed }" class="transition-transform" />
          </button>
        </div>

        <button
          v-if="!sidebarCollapsed"
          class="mx-2 mt-2 mb-1 flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-900/50 text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-300 transition-colors"
          @click="openSearch"
        >
          <Search :size="13" />
          <span class="flex-1 text-left">搜索配置...</span>
          <kbd class="text-[10px] px-1.5 py-0.5 rounded border border-apple-gray-300 dark:border-apple-gray-600 text-apple-gray-400">⌘K</kbd>
        </button>

        <nav class="flex-1 overflow-y-auto py-1">
          <div v-for="section in navSections" :key="section.key">
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors"
              :class="activeSection === section.key
                ? 'bg-brian-blue/10 text-brian-blue font-medium'
                : 'text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'"
              @click="toggleSection(section.key)"
            >
              <component :is="section.icon" :size="16" class="flex-shrink-0" />
              <span v-if="!sidebarCollapsed" class="flex-1 text-left truncate">{{ section.label }}</span>
              <ChevronRight
                v-if="!sidebarCollapsed"
                :size="13"
                :class="{ 'rotate-90': expandedSections[section.key] }"
                class="flex-shrink-0 transition-transform text-apple-gray-400"
              />
            </button>

            <div v-if="expandedSections[section.key] && !sidebarCollapsed" class="ml-2 border-l border-apple-gray-200 dark:border-apple-gray-700 ml-5">
              <button
                v-for="sub in section.subsections"
                :key="sub.key"
                class="w-full flex items-center gap-2 pl-6 pr-3 py-1.5 text-[13px] transition-colors"
                :class="activeSubSection === sub.key
                  ? 'text-brian-blue font-medium bg-brian-blue/[0.06]'
                  : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'"
                @click="selectSub(section.key, sub.key)"
              >
                <component :is="sub.icon" :size="13" class="flex-shrink-0" />
                <span class="truncate">{{ sub.label }}</span>
                <span
                  class="ml-auto text-[10px] px-1 py-0.5 rounded-full flex-shrink-0"
                  :class="sub.type === 'entity' ? 'bg-brian-blue/10 text-brian-blue' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500'"
                >{{ sub.type === 'entity' ? '实体' : '参数' }}</span>
              </button>
            </div>
          </div>
        </nav>
      </aside>

      <!-- ═══════════════ 右侧内容区 ═══════════════ -->
      <main class="flex-1 bg-apple-gray-50 dark:bg-apple-gray-900" :class="mcpMarketSelectedProvider ? 'overflow-hidden' : 'overflow-y-auto'">
        <div class="sticky top-0 z-10 flex items-center gap-1.5 px-5 py-2.5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
          <Layers :size="15" class="text-brian-blue flex-shrink-0" />
          <PageBreadcrumb :path="pagePath" />
        </div>

        <div v-if="currentSection" class="px-5 py-4">
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50 flex items-center gap-2">
            <component :is="currentSub?.icon || currentSection.icon" :size="20" class="text-brian-blue" />
            {{ currentSub?.label || currentSection.label }}
          </h2>
          <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">{{ currentSection.desc }}</p>
        </div>

        <!-- ========================== 参数配置视图 ========================== -->
        <div v-if="isParamsView" class="px-5 pb-6">
          <div v-if="configLoading" class="flex items-center justify-center py-16">
            <Loader2 :size="24" class="animate-spin text-brian-blue" />
          </div>
          <div v-else-if="configError" class="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle :size="28" class="text-error-red mb-3" />
            <p class="text-sm text-apple-gray-600 dark:text-apple-gray-300 mb-3">{{ configError }}</p>
            <button class="px-4 py-2 text-sm bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors" @click="loadConfigTree">重试</button>
          </div>
          <div v-else-if="currentParams.length === 0" class="flex flex-col items-center justify-center py-16 text-center">
            <Settings :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无配置参数</p>
          </div>
          <div v-else class="space-y-5">
            <!-- MQ 消息队列操作面板（仅 mq_provider 模块展示） -->
            <div v-if="currentSub?.configModule === 'mq_provider'" class="space-y-4">
              <!-- 搜索 & 创建 -->
              <div class="flex gap-2 items-end">
                <div class="flex-1 relative">
                  <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
                  <input v-model="mqSearchQuery" type="text" :class="[inputClass, 'pl-9']" placeholder="搜索队列..." />
                </div>
                <div class="flex-1">
                  <input v-model="mqNewQueue" type="text" :class="inputClass" placeholder="输入新队列名称..." @keyup.enter="createMqQueue()" />
                </div>
                <button
                  class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50 transition-colors flex-shrink-0"
                  :disabled="mqCreating || !mqNewQueue.trim()"
                  @click="createMqQueue()"
                >
                  <Loader2 v-if="mqCreating" :size="14" class="animate-spin" />
                  <Plus v-else :size="14" />
                  {{ mqCreating ? '...' : '创建' }}
                </button>
              </div>
              <div v-if="mqCreateError" class="flex items-center gap-2 text-xs text-error-red"><AlertCircle :size="14" /> {{ mqCreateError }}</div>
              <div v-if="mqCreateResult" class="flex items-center gap-2 text-xs text-success-green"><Check :size="14" /> {{ mqCreateResult }}</div>

              <!-- 队列列表（含每队列统计 + 操作） -->
              <div class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800">
                <div class="px-4 py-2.5 border-b border-apple-gray-200 dark:border-apple-gray-700 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" class="w-3.5 h-3.5 rounded border-apple-gray-300 text-brian-blue"
                        :checked="filteredMqQueues.length > 0 && filteredMqQueues.every(q => mqSelectedQueues.has(q))"
                        @change="toggleAllMqQueues" />
                      <span class="text-xs text-apple-gray-500">全选</span>
                    </label>
                    <span class="text-xs text-apple-gray-400">{{ mqQueues.length }} 个队列</span>
                  </div>
                  <button
                    v-if="mqSelectedQueues.size > 0"
                    class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-error-red bg-error-red/5 border border-error-red/20 rounded-lg hover:bg-error-red/10 transition-colors"
                    @click="deleteSelectedMqQueues()"
                  >
                    <Trash2 :size="12" /> 删除选中 ({{ mqSelectedQueues.size }})
                  </button>
                </div>
                <div v-if="filteredMqQueues.length === 0" class="px-4 py-6 text-xs text-apple-gray-400 text-center">
                  暂无队列
                </div>
                <div v-else class="divide-y divide-apple-gray-100 dark:divide-apple-gray-700 max-h-80 overflow-y-auto">
                  <div
                    v-for="q in filteredMqQueues"
                    :key="q"
                    class="px-4 py-2.5 flex items-center gap-3 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors group"
                  >
                    <input type="checkbox" class="w-3.5 h-3.5 rounded border-apple-gray-300 text-brian-blue flex-shrink-0"
                      :checked="mqSelectedQueues.has(q)"
                      @change="toggleMqQueueSelection(q)" />
                    <Radio :size="14" class="text-brian-blue flex-shrink-0" />
                    <button
                      class="flex-1 text-left text-sm text-apple-gray-700 dark:text-apple-gray-200 truncate hover:text-brian-blue hover:underline cursor-pointer"
                      @click="selectMqQueue(q)"
                    >{{ q }}</button>
                    <!-- Inline stats -->
                    <div class="flex items-center gap-2 text-[11px] flex-shrink-0">
                      <template v-if="getQueueStats(q)">
                        <span class="flex items-center gap-1" title="待消费">
                          <span class="w-2 h-2 rounded-full bg-warning-orange"></span>
                          {{ getQueueStats(q)!.pending }}
                        </span>
                        <span class="flex items-center gap-1" title="处理中">
                          <span class="w-2 h-2 rounded-full bg-brian-blue"></span>
                          {{ getQueueStats(q)!.processing }}
                        </span>
                        <span class="flex items-center gap-1" title="已完成">
                          <span class="w-2 h-2 rounded-full bg-success-green"></span>
                          {{ getQueueStats(q)!.completed }}
                        </span>
                        <span class="flex items-center gap-1" title="已失败">
                          <span class="w-2 h-2 rounded-full bg-error-red"></span>
                          {{ getQueueStats(q)!.failed }}
                        </span>
                      </template>
                      <span v-else class="text-apple-gray-300">—</span>
                    </div>
                    <button
                      class="p-1 rounded text-apple-gray-300 hover:text-warning-orange hover:bg-warning-orange/5 opacity-0 group-hover:opacity-100 transition-all"
                      title="清空消息"
                      :disabled="mqPurging"
                      @click.stop="purgeMqQueue(q)"
                    >
                      <Loader2 v-if="mqPurging" :size="12" class="animate-spin" />
                      <Eraser v-else :size="13" />
                    </button>
                    <button
                      class="p-1 rounded text-apple-gray-300 hover:text-error-red hover:bg-error-red/5 opacity-0 group-hover:opacity-100 transition-all"
                      title="删除队列"
                      @click.stop="deleteMqQueue(q)"
                    >
                      <Trash2 :size="13" />
                    </button>
                  </div>
                </div>
                <div v-if="mqPurgeError" class="px-4 pb-2 flex items-center gap-2 text-xs text-error-red"><AlertCircle :size="14" /> {{ mqPurgeError }}</div>
                <div v-if="mqPurgeResult" class="px-4 pb-2 flex items-center gap-2 text-xs text-success-green"><Check :size="14" /> {{ mqPurgeResult }}</div>
              </div>
              <div v-if="mqStatsLoading" class="flex items-center justify-center py-4">
                <Loader2 :size="16" class="animate-spin text-brian-blue" />
              </div>
            </div>

            <!-- MQ 队列弹窗（发送 / 消费） -->
            <Teleport to="body">
              <div
                v-if="mqModalVisible"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @click.self="mqModalVisible = false"
              >
                <div class="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 w-full max-w-2xl mx-4 overflow-hidden flex flex-col" style="height: 85vh; max-height: 800px;">
                  <div class="px-5 py-3.5 border-b border-apple-gray-200 dark:border-apple-gray-700 flex items-center justify-between flex-shrink-0">
                    <div class="flex items-center gap-2">
                      <Radio :size="16" class="text-brian-blue" />
                      <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ activeMqQueue }}</h3>
                    </div>
                    <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="mqModalVisible = false">
                      <X :size="18" />
                    </button>
                  </div>
                  <div class="px-5 py-4 space-y-4 flex-1 overflow-y-auto" style="min-height: 0;">
                    <!-- 发送 -->
                    <div class="flex flex-col" style="flex: 1 1 40%; min-height: 0;">
                      <h4 class="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 mb-2 flex-shrink-0">发送消息</h4>
                      <div class="flex gap-2 mb-2 flex-shrink-0">
                        <div class="flex-1">
                          <input v-model.number="mqSendPriority" type="number" min="0" max="10" placeholder="优先级 (默认5)" :class="inputClass" style="padding-top: 4px; padding-bottom: 4px; font-size: 11px;" />
                        </div>
                        <button
                          class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50 transition-colors flex-shrink-0"
                          :disabled="mqSending || !mqSendPayload.trim()"
                          @click="sendMqMessage()"
                        >
                          <Loader2 v-if="mqSending" :size="13" class="animate-spin" />
                          <Send v-else :size="13" />
                          {{ mqSending ? '...' : '发送' }}
                        </button>
                      </div>
                      <textarea
                        v-model="mqSendPayload"
                        placeholder="输入消息内容... Ctrl+Enter 发送"
                        :class="[inputClass, 'resize-none']"
                        style="flex: 1; min-height: 80px; font-size: 12px; line-height: 1.5; font-family: ui-monospace, monospace;"
                        @keyup.ctrl.enter="sendMqMessage()"
                      ></textarea>
                      <div v-if="mqSendError" class="flex items-center gap-2 text-[11px] text-error-red mt-1 flex-shrink-0"><AlertCircle :size="13" /> {{ mqSendError }}</div>
                      <div v-if="mqSendResult" class="flex items-center gap-2 text-[11px] text-success-green mt-1 flex-shrink-0"><Check :size="13" /> {{ mqSendResult }}</div>
                    </div>

                    <!-- 消费 -->
                    <div class="flex flex-col" style="flex: 1 1 50%; min-height: 0;">
                      <div class="flex items-center justify-between mb-2 flex-shrink-0">
                        <h4 class="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400">消费消息</h4>
                        <div class="flex items-center gap-1.5" v-if="mqConsumedMessage">
                          <span class="text-[10px] text-apple-gray-400">{{ mqContentLineCount }} 行</span>
                          <input
                            v-model.number="mqTextLineJump"
                            type="number"
                            min="1"
                            placeholder="跳转行"
                            class="w-16 px-1.5 py-0.5 text-[10px] border border-apple-gray-200 dark:border-apple-gray-600 rounded bg-transparent text-apple-gray-700 dark:text-apple-gray-300"
                            @keyup.enter="jumpToLine()"
                          />
                        </div>
                      </div>
                      <div class="flex gap-2 mb-2 flex-shrink-0">
                        <button
                          class="flex items-center justify-center gap-1.5 py-2 text-xs font-medium bg-success-green text-white rounded-lg hover:bg-success-green/90 disabled:opacity-50 transition-colors flex-shrink-0"
                          style="flex: 1 1 auto;"
                          :disabled="mqConsuming"
                          @click="consumeMqMessage()"
                        >
                          <Loader2 v-if="mqConsuming" :size="13" class="animate-spin" />
                          <Download v-else :size="13" />
                          {{ mqConsuming ? '消费中...' : '消费消息' }}
                        </button>
                        <div class="flex-1">
                          <input v-model="mqResetTime" type="datetime-local" :class="inputClass" style="padding-top: 4px; padding-bottom: 4px; font-size: 11px;" />
                        </div>
                        <button
                          class="flex items-center gap-1 px-2.5 py-2 text-[11px] font-medium text-apple-gray-600 dark:text-apple-gray-300 bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-600 rounded-lg hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-50 transition-colors flex-shrink-0"
                          :disabled="mqConsuming || mqResetting"
                          @click="resetMqQueue(activeMqQueue)"
                        >
                          <Loader2 v-if="mqResetting" :size="12" class="animate-spin" />
                          <RefreshCw v-else :size="12" />
                          {{ mqResetting ? '...' : '重新消费' }}
                        </button>
                      </div>
                      <div v-if="mqConsumeError" class="flex items-center gap-2 text-[11px] text-error-red mb-2 flex-shrink-0"><AlertCircle :size="13" /> {{ mqConsumeError }}</div>
                      <div v-if="mqConsumedMessage" class="flex flex-col flex-1 min-h-0 rounded-lg border border-apple-gray-100 dark:border-apple-gray-700 overflow-hidden">
                        <div class="px-3 py-1.5 border-b border-apple-gray-100 dark:border-apple-gray-700 flex items-center gap-3 text-[10px] text-apple-gray-400 flex-shrink-0">
                          <span>ID: {{ mqConsumedMessage.id.substring(0, 8) }}...</span>
                          <span>状态: <span class="font-medium" :class="mqConsumedMessage.status === 'COMPLETED' ? 'text-success-green' : 'text-warning-orange'">{{ mqConsumedMessage.status }}</span></span>
                          <span>优先级: {{ mqConsumedMessage.priority }}</span>
                          <span class="flex-1"></span>
                          <div class="flex items-center gap-1.5" v-if="mqConsumedMessage">
                            <Search :size="10" class="text-apple-gray-400" />
                            <input
                              v-model="mqTextSearch"
                              type="text"
                              class="w-24 px-1.5 py-0.5 text-[10px] border border-apple-gray-200 dark:border-apple-gray-600 rounded bg-transparent text-apple-gray-700 dark:text-apple-gray-300"
                              placeholder="搜索内容..."
                              @keyup.enter="searchInText('next')"
                            />
                            <button class="px-1 py-0.5 text-[9px] border border-apple-gray-200 dark:border-apple-gray-600 rounded text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="searchInText('prev')" title="上一个">▲</button>
                            <button class="px-1 py-0.5 text-[9px] border border-apple-gray-200 dark:border-apple-gray-600 rounded text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="searchInText('next')" title="下一个">▼</button>
                          </div>
                        </div>
                        <textarea
                          ref="mqOutputRef"
                          :value="mqConsumedContent"
                          readonly
                          class="w-full flex-1 min-h-0 px-3 py-2 text-[11px] text-apple-gray-700 dark:text-apple-gray-200 font-mono leading-relaxed bg-transparent resize-none border-0 focus:outline-none"
                        ></textarea>
                      </div>
                      <div v-else-if="!mqConsuming && !mqConsumeError" class="flex-1 flex items-center justify-center text-[11px] text-apple-gray-300 min-h-[60px]">
                        点击上方按钮消费消息
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Teleport>

            <!-- VectorDB 语义搜索（仅 vectordb_provider 模块展示） -->
            <div v-if="currentSub?.configModule === 'vectordb_provider'" class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800">
              <div class="px-4 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
                <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">语义搜索</h3>
                <p class="text-xs text-apple-gray-400 mt-0.5">输入文本，系统将自动向量化并进行相似度搜索（当前使用 {{ (currentParams.find(p => p.config_key === 'vectordb_provider.default_distance_metric')?.config_value ?? 'COSINE')  }} 距离度量）</p>
              </div>
              <div class="px-4 py-3 space-y-3">
                <div class="flex gap-2">
                  <div class="flex-1">
                    <input
                      v-model="vectordbSearchText"
                      type="text"
                      placeholder="输入要搜索的文本..."
                      :class="inputClass"
                      @keyup.enter="runVectorDbSearch"
                    />
                  </div>
                  <button
                    class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50 transition-colors"
                    :disabled="vectordbSearching || !vectordbSearchText.trim()"
                    @click="runVectorDbSearch"
                  >
                    <Loader2 v-if="vectordbSearching" :size="14" class="animate-spin" />
                    <Search v-else :size="14" />
                    {{ vectordbSearching ? '搜索中...' : '搜索' }}
                  </button>
                </div>
                <div class="flex gap-3">
                  <div class="flex items-center gap-2">
                    <label class="text-xs text-apple-gray-500">返回数量</label>
                    <input v-model.number="vectordbSearchTopK" type="number" min="1" max="100" class="w-20 px-2 py-1 text-xs border border-apple-gray-200 dark:border-apple-gray-600 rounded bg-transparent text-apple-gray-700 dark:text-apple-gray-300" />
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="text-xs text-apple-gray-500">分数阈值 (0-100)</label>
                    <input v-model.number="vectordbSearchThreshold" type="number" min="0" max="100" step="1" class="w-20 px-2 py-1 text-xs border border-apple-gray-200 dark:border-apple-gray-600 rounded bg-transparent text-apple-gray-700 dark:text-apple-gray-300" />
                  </div>
                </div>
                <div v-if="vectordbSearchError" class="flex items-center gap-2 text-xs text-error-red">
                  <AlertCircle :size="14" /> {{ vectordbSearchError }}
                </div>
                <div v-if="vectordbSearchResults.length > 0" class="flex items-center justify-between gap-2 text-xs">
                  <span class="text-apple-gray-400">共 {{ vectordbSearchResults.length }} 条结果</span>
                  <button
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-brian-blue border border-brian-blue/30 hover:bg-brian-blue/5 transition-colors"
                    @click="vectordbModalVisible = true"
                  >
                    <Eye :size="13" /> 查看结果
                  </button>
                </div>
              </div>
            </div>

            <!-- VectorDB 语义搜索结果弹窗 -->
            <Teleport to="body">
              <div
                v-if="vectordbModalVisible"
                class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @click.self="vectordbModalVisible = false"
              >
                <div class="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 w-full max-w-3xl mx-4 overflow-hidden flex flex-col" style="height: 85vh; max-height: 800px;">
                  <div class="px-5 py-3.5 border-b border-apple-gray-200 dark:border-apple-gray-700 flex items-center justify-between flex-shrink-0">
                    <div class="flex items-center gap-2">
                      <Search :size="16" class="text-brian-blue" />
                      <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">语义搜索结果</h3>
                      <span class="text-xs text-apple-gray-400">{{ filteredVectorDbResults.length }} / {{ vectordbSearchResults.length }} 条</span>
                    </div>
                    <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="vectordbModalVisible = false">
                      <X :size="18" />
                    </button>
                  </div>
                  <div class="px-5 py-3 border-b border-apple-gray-100 dark:border-apple-gray-700 flex-shrink-0">
                    <div class="relative">
                      <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
                      <input
                        v-model="vectordbContentFilter"
                        type="text"
                        placeholder="在结果内容中搜索..."
                        :class="inputClass + ' !pl-9'"
                      />
                    </div>
                  </div>
                  <div class="flex-1 overflow-y-auto px-5 py-3 space-y-2" style="min-height: 0;">
                    <div v-if="filteredVectorDbResults.length === 0" class="flex flex-col items-center justify-center py-16 text-apple-gray-400">
                      <Search :size="24" class="mb-2" />
                      <p class="text-xs">{{ vectordbSearchResults.length === 0 ? '没有搜索到匹配的信息' : '没有匹配过滤条件的结果' }}</p>
                    </div>
                    <div
                      v-for="hit in filteredVectorDbResults"
                      :key="hit.info_id"
                      class="px-3 py-2.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800/50 border border-apple-gray-100 dark:border-apple-gray-700"
                    >
                      <div class="flex items-center gap-2 flex-wrap">
                        <span
                          class="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          :class="hit.info_type === 'REQUEST' ? 'bg-brian-blue/10 text-brian-blue' : hit.info_type === 'RESPONSE' ? 'bg-success-green/10 text-success-green' : 'bg-warning-orange/10 text-warning-orange'"
                        >{{ infoTypeLabel(hit.info_type) }}</span>
                        <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500">{{ infoCreatorLabel(hit.info_creator_role) }}</span>
                        <span class="text-[10px] font-mono text-apple-gray-400">{{ hit.info_id }}</span>
                        <span class="ml-auto flex items-center gap-3 text-[10px] text-apple-gray-400">
                          <span class="flex items-center gap-1"><Clock :size="11" /> {{ formatVectorTime(hit.created) }}</span>
                          <span>{{ hit.info_length }} 字符</span>
                          <span class="font-mono px-1.5 py-0.5 rounded-full"
                            :class="hit.score >= 80 ? 'bg-success-green/10 text-success-green' : hit.score >= 50 ? 'bg-warning-orange/10 text-warning-orange' : 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-500'"
                          >{{ hit.score }}</span>
                        </span>
                      </div>
                      <p class="text-xs text-apple-gray-700 dark:text-apple-gray-300 mt-2 whitespace-pre-wrap break-words">{{ hit.info }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </Teleport>
            <!-- GraphDB 标签图遍历搜索（仅 graphdb_provider 模块展示） -->
            <div v-if="currentSub?.configModule === 'graphdb_provider'" class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800">
              <div class="px-4 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
                <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">标签图搜索</h3>
                <p class="text-xs text-apple-gray-400 mt-0.5">输入关键词搜索标签，并从匹配的标签开始遍历 {{ (currentParams.find(p => p.config_key === 'graphdb_provider.default_depth')?.config_value ?? 1) }} 层相似标签关联图</p>
              </div>
              <div class="px-4 py-3 space-y-3">
                <div class="flex gap-2">
                  <div class="flex-1">
                    <input
                      v-model="graphSearchQuery"
                      type="text"
                      placeholder="输入标签关键词..."
                      :class="inputClass"
                      @keyup.enter="runGraphSearch"
                    />
                  </div>
                  <button
                    class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50 transition-colors"
                    :disabled="graphSearching || !graphSearchQuery.trim()"
                    @click="runGraphSearch"
                  >
                    <Loader2 v-if="graphSearching" :size="14" class="animate-spin" />
                    <Search v-else :size="14" />
                    {{ graphSearching ? '遍历中...' : '遍历' }}
                  </button>
                </div>
                <div class="flex gap-3 items-center">
                  <div class="flex items-center gap-2">
                    <label class="text-xs text-apple-gray-500">最大深度</label>
                    <select v-model.number="graphSearchMaxDepth" class="w-16 px-2 py-1 text-xs border border-apple-gray-200 dark:border-apple-gray-600 rounded bg-transparent text-apple-gray-700 dark:text-apple-gray-300">
                      <option :value="1">1</option>
                      <option :value="2">2</option>
                      <option :value="3">3</option>
                      <option :value="4">4</option>
                      <option :value="5">5</option>
                    </select>
                  </div>
                  <label class="flex items-center gap-1.5 text-xs text-apple-gray-500">
                    <input v-model="graphSearchOnlyActive" type="checkbox" class="w-3.5 h-3.5 rounded border-apple-gray-300 text-brian-blue" />
                    仅激活边
                  </label>
                </div>
                <div v-if="graphSearchError" class="flex items-center gap-2 text-xs text-error-red">
                  <AlertCircle :size="14" /> {{ graphSearchError }}
                </div>
                <div v-if="graphSearchResult && graphSearchResult.paths.length > 0" class="space-y-3 max-h-96 overflow-y-auto">
                  <p class="text-xs text-apple-gray-400">
                    匹配 {{ graphSearchResult.root_tags.length }} 个标签，{{ graphSearchResult.paths.length }} 条遍历路径
                  </p>
                  <div v-for="(path, pi) in graphSearchResult.paths" :key="path.root_id" class="rounded-lg border border-apple-gray-100 dark:border-apple-gray-700 overflow-hidden">
                    <div class="px-3 py-2 bg-apple-gray-50 dark:bg-apple-gray-800/50 border-b border-apple-gray-100 dark:border-apple-gray-700 flex items-center justify-between">
                      <span class="text-xs font-semibold text-brian-blue">路径 #{{ pi + 1 }}: {{ path.root_tag }}</span>
                      <span class="text-[10px] text-apple-gray-400">{{ path.nodes.length }} 节点 · {{ path.edges.length }} 边</span>
                    </div>
                    <!-- Nodes by depth -->
                    <div class="px-3 py-2 space-y-1.5">
                      <template v-for="depth in graphSearchMaxDepth" :key="depth">
                        <div v-if="path.nodes.filter(n => n.depth === depth).length > 0">
                          <div class="flex items-center gap-1 mb-1">
                            <span class="text-[10px] px-1 rounded bg-brian-blue/10 text-brian-blue">深度 {{ depth }}</span>
                          </div>
                          <div class="flex flex-wrap gap-1">
                            <span
                              v-for="node in path.nodes.filter(n => n.depth === depth)"
                              :key="node.id"
                              class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200"
                              :title="`关联 ${node.info_ids.length} 条原始数据`"
                            >
                              {{ node.tag }}
                              <span class="text-[9px] text-apple-gray-400">({{ node.info_ids.length }})</span>
                            </span>
                          </div>
                        </div>
                      </template>
                      <!-- Edges -->
                      <div v-if="path.edges.length > 0">
                        <span class="text-[10px] text-apple-gray-400 mb-1 block">边详情（按复合权重排序）</span>
                        <div v-for="edge in path.edges" :key="edge.from_id + '-' + edge.to_id" class="flex items-center gap-1 text-[10px] text-apple-gray-500 py-0.5">
                          <span :class="edge.active ? 'text-success-green' : 'text-apple-gray-300'">{{ edge.active ? '●' : '○' }}</span>
                          <span class="font-mono truncate max-w-[100px]">{{ edge.from_id.substring(0, 6) }} → {{ edge.to_id.substring(0, 6) }}</span>
                          <span class="text-apple-gray-400">raw:{{ edge.weight.toFixed(2) }}</span>
                          <span class="font-semibold text-brian-blue">cw:{{ edge.compositeWeight.toFixed(3) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else-if="graphSearchResult && graphSearchResult.paths.length === 0 && !graphSearching" class="text-xs text-apple-gray-400 text-center py-4">
                  未找到匹配的标签或遍历路径
                </div>
              </div>
            </div>
            <!-- 参数列表 -->
            <div v-for="group in currentParamsGroups" :key="group.cat" :class="isCardView ? '' : 'rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800'">
              <div v-if="!isCardView" class="px-4 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
                <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ group.label }}</h3>
              </div>
              <div :class="isCardView ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 p-3' : 'divide-y divide-apple-gray-100 dark:divide-apple-gray-700'">
                <div
                  v-for="item in group.items"
                  :key="item.config_key"
                  :class="isCardView ? 'rounded-lg border border-apple-gray-100 dark:border-apple-gray-700 p-4 hover:border-brian-blue/40 hover:shadow-sm transition-all bg-white dark:bg-apple-gray-800/50 aspect-[3/2]' : 'px-4 py-3 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors'"
                >
                  <div :class="isCardView ? 'flex flex-col gap-3 h-full' : 'flex items-start justify-between gap-4'">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ item.config_name }}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded-full" :class="
                          item.config_type === 'BOOLEAN' ? 'bg-brian-blue/10 text-brian-blue' :
                          item.config_type === 'INT' || item.config_type === 'DOUBLE' ? 'bg-success-green/10 text-success-green' :
                          item.config_type === 'ENUM' ? 'bg-warning-orange/10 text-warning-orange' :
                          'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500'
                        ">{{ item.config_type }}</span>
                        <span
                          v-if="item.writable === false"
                          class="text-[10px] px-1 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400"
                        >只读</span>
                      </div>
                      <p v-if="item.config_description" class="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-0.5">
                        {{ item.config_description }}
                        <template v-if="isTimeConfig(item.config_key) && getConfigPrimitiveValue(item) !== undefined">
                          · {{ formatConfigDuration(item.config_key, getConfigPrimitiveValue(item) as string | number) }}
                        </template>
                      </p>
                      <p class="text-[10px] font-mono text-apple-gray-400 dark:text-apple-gray-500 mt-0.5">{{ item.config_key }}</p>
                    </div>
                    <div :class="isCardView ? 'flex flex-col gap-2 mt-auto' : 'flex items-center gap-2 flex-shrink-0'">
                      <template v-if="isCardView">
                        <button
                          v-if="item.config_type === 'BOOLEAN'"
                          class="relative w-11 h-6 rounded-full transition-colors duration-200 disabled:opacity-50"
                          :class="cardValues[item.config_key] === 'true' ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                          :disabled="item.writable === false"
                          @click="cardValues[item.config_key] = cardValues[item.config_key] === 'true' ? 'false' : 'true'"
                        >
                          <span
                            class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                            :class="cardValues[item.config_key] === 'true' ? 'translate-x-5' : ''"
                          />
                        </button>
                        <select
                          v-else-if="item.config_key.endsWith('prompt_template_id')"
                          v-model="cardValues[item.config_key]"
                          :disabled="item.writable === false"
                          :class="inputClass + ' !w-full !py-1.5'"
                        >
                          <option value="">prompt选择</option>
                          <option v-for="p in prompts" :key="p.id" :value="p.id">{{ p.title }}</option>
                        </select>
                        <select
                          v-else-if="item.config_key.endsWith('llm_id')"
                          v-model="cardValues[item.config_key]"
                          :disabled="item.writable === false"
                          :class="inputClass + ' !w-full !py-1.5'"
                        >
                          <option value="">选择模型</option>
                          <option v-for="m in (item.config_key.includes('vector_config') ? embeddingModels : models)" :key="m.id" :value="m.id">{{ m.modelName || m.id }}</option>
                        </select>
                        <select
                          v-else-if="item.config_key.endsWith('strategy_id')"
                          v-model="cardValues[item.config_key]"
                          :disabled="item.writable === false"
                          :class="inputClass + ' !w-full !py-1.5'"
                        >
                          <option value="">选择策略</option>
                          <option v-for="s in orchStrategies" :key="s.id" :value="s.strategyId">{{ s.label }}</option>
                        </select>
                        <select
                          v-else-if="item.config_type === 'ENUM' && item.config_enum_values"
                          v-model="cardValues[item.config_key]"
                          :disabled="item.writable === false"
                          :class="inputClass + ' !w-full !py-1.5'"
                        >
                          <option v-for="v in item.config_enum_values" :key="String(v)" :value="String(v)">{{ enumLabel(item.config_key, String(v)) }}</option>
                        </select>
                        <button
                          v-else-if="isCronConfig(item.config_key)"
                          class="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-apple-gray-200 dark:border-apple-gray-600 bg-transparent font-mono text-xs text-apple-gray-700 dark:text-apple-gray-300 hover:border-brian-blue/40 transition-colors"
                          :disabled="item.writable === false"
                          @click="startEditParam(item)"
                        >
                          <span class="truncate">{{ cardValues[item.config_key] || '配置定时时间' }}</span>
                          <Clock :size="13" class="text-brian-blue shrink-0" />
                        </button>
                        <button
                          v-else-if="isInfoTypesConfig(item.config_key)"
                          class="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-apple-gray-200 dark:border-apple-gray-600 bg-transparent text-xs text-apple-gray-700 dark:text-apple-gray-300 hover:border-brian-blue/40 transition-colors"
                          :disabled="item.writable === false"
                          @click="openInfoTypesModal(item)"
                        >
                          <span class="truncate">{{ formatInfoTypesValue(getConfigPrimitiveValue(item)) }}</span>
                          <List :size="13" class="text-brian-blue shrink-0" />
                        </button>
                        <button
                          v-else-if="isPriorityOrderConfig(item.config_key)"
                          class="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-apple-gray-200 dark:border-apple-gray-600 bg-transparent text-xs text-apple-gray-700 dark:text-apple-gray-300 hover:border-brian-blue/40 transition-colors"
                          :disabled="item.writable === false"
                          @click="openPriorityOrderModal(item)"
                        >
                          <span class="truncate">{{ formatPriorityOrderValue(getConfigPrimitiveValue(item)) }}</span>
                          <GripVertical :size="13" class="text-brian-blue shrink-0" />
                        </button>
                        <input
                          v-else
                          v-model="cardValues[item.config_key]"
                          :disabled="item.writable === false"
                          :type="item.config_type === 'INT' || item.config_type === 'DOUBLE' ? 'number' : 'text'"
                          :class="inputClass + ' !w-full !py-1.5'"
                        />
                        <button
                          class="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50 transition-colors"
                          :disabled="cardSaving[item.config_key] || item.writable === false"
                          @click="saveCard(item)"
                        >
                          <Loader2 v-if="cardSaving[item.config_key]" :size="14" class="animate-spin" />
                          <span v-else>确认</span>
                        </button>
                      </template>
                      <template v-else-if="editingParam?.config_key === item.config_key">
                        <template v-if="item.config_type === 'BOOLEAN'">
                          <button
                            class="relative w-11 h-6 rounded-full transition-colors duration-200"
                            :class="editingParamValue === 'true' ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                            @click="editingParamValue = editingParamValue === 'true' ? 'false' : 'true'"
                          >
                            <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                              :class="editingParamValue === 'true' ? 'translate-x-5' : ''" />
                          </button>
                        </template>
                        <template v-else-if="item.config_type === 'ENUM' && item.config_enum_values">
                          <select v-model="editingParamValue" :class="inputClass + (isCardView ? ' !w-full !py-1.5' : ' !w-32 !py-1.5')">
                            <option v-for="v in item.config_enum_values" :key="String(v)" :value="String(v)">{{ enumLabel(item.config_key, String(v)) }}</option>
                          </select>
                        </template>
                        <template v-else-if="item.config_key.endsWith('llm_id')">
                          <select v-model="editingParamValue" :class="inputClass + (isCardView ? ' !w-full !py-1.5' : ' !w-44 !py-1.5')">
                            <option value="">选择模型</option>
                            <option v-for="m in models" :key="m.id" :value="m.id">{{ m.modelName || m.id }}</option>
                          </select>
                        </template>
                        <template v-else-if="item.config_key.endsWith('prompt_template_id')">
                          <select v-model="editingParamValue" :class="inputClass + (isCardView ? ' !w-full !py-1.5' : ' !w-44 !py-1.5')">
                            <option value="">prompt选择</option>
                            <option v-for="p in prompts" :key="p.id" :value="p.id">{{ p.title }}</option>
                          </select>
                        </template>
                        <template v-else-if="item.config_key.endsWith('strategy_id')">
                          <select v-model="editingParamValue" :class="inputClass + (isCardView ? ' !w-full !py-1.5' : ' !w-44 !py-1.5')">
                            <option value="">选择策略</option>
                            <option v-for="s in orchStrategies" :key="s.id" :value="s.strategyId">{{ s.label }}</option>
                          </select>
                        </template>
                        <template v-else>
                          <input
                            v-model="editingParamValue"
                            :type="item.config_type === 'STRING' ? 'text' : 'number'"
                            :class="inputClass + (isCardView ? ' !w-full !py-1.5' : ' !w-32 !py-1.5')"
                          />
                        </template>
                        <button
                          class="p-1.5 rounded-lg bg-success-green text-white hover:bg-success-green/90 transition-colors"
                          :disabled="paramSaving"
                          @click="saveParam"
                        >
                          <Loader2 v-if="paramSaving" :size="14" class="animate-spin" />
                          <Check v-else :size="14" />
                        </button>
                        <button
                          class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
                          @click="cancelEditParam"
                        >
                          <X :size="14" />
                        </button>
                      </template>
                      <template v-else>
                        <template v-if="item.config_type === 'BOOLEAN'">
                          <div class="flex items-center gap-1.5">
                            <span
                              class="w-2.5 h-2.5 rounded-full"
                              :class="getConfigPrimitiveValue(item) === true ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                            />
                            <span class="text-sm font-mono text-apple-gray-600 dark:text-apple-gray-300">
                              {{ getConfigPrimitiveValue(item) === true ? 'true' : 'false' }}
                            </span>
                          </div>
                        </template>
                        <span v-else class="text-sm font-mono text-apple-gray-600 dark:text-apple-gray-300">
                          {{ getConfigDisplayValue(item) }}
                        </span>
                        <button
                          v-if="item.writable !== false"
                          class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 hover:text-brian-blue transition-colors"
                          title="编辑"
                          @click="startEditParam(item)"
                        >
                          <Pencil :size="13" />
                        </button>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 快照管理视图 ========================== -->
        <div v-if="isSnapshotView" class="px-5 pb-6 max-w-2xl">
          <div class="mb-6 p-4 rounded-xl border border-warning-orange/30 bg-warning-orange/5">
            <div class="flex items-center gap-2 mb-2">
              <AlertCircle :size="16" class="text-warning-orange" />
              <span class="text-sm font-semibold text-warning-orange">配置重置</span>
            </div>
            <p class="text-xs text-apple-gray-600 dark:text-apple-gray-400 mb-3">
              清空所有 5 层共 30+ 个模块的配置数据，恢复为默认预设值。重置后页面将自动刷新。
            </p>
            <div class="flex gap-2">
              <button
                class="px-4 py-2 rounded-lg text-sm font-medium bg-brian-blue/10 text-brian-blue border border-brian-blue/20 hover:bg-brian-blue/20 transition-colors"
                @click="saveDefaults"
                :disabled="savingDefaults"
              >
                <Save :size="14" class="inline mr-1.5" />
                {{ savingDefaults ? '保存中...' : '保存当前配置为默认' }}
              </button>
              <button
                class="px-4 py-2 rounded-lg text-sm font-medium bg-error-red/10 text-error-red border border-error-red/20 hover:bg-error-red/20 transition-colors"
                :disabled="configResetting"
                @click="showResetConfirm = true"
              >
                <RefreshCw :size="14" class="inline mr-1.5" :class="{ 'animate-spin': configResetting }" />
                {{ configResetting ? '重置中...' : '重置所有配置' }}
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">配置快照</h3>
            <button
              class="px-3 py-1.5 rounded-lg text-xs font-medium bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20 transition-colors"
              :disabled="snapshotCreating"
              @click="createSnapshot"
            >
              <Plus :size="13" class="inline mr-1" />
              {{ snapshotCreating ? '创建中...' : '新建快照' }}
            </button>
          </div>

          <div v-if="snapshotLoading" class="text-center py-8 text-apple-gray-400 text-sm">加载中...</div>
          <div v-else-if="snapshots.length === 0" class="text-center py-8 text-apple-gray-400 text-sm">暂无快照</div>
          <div v-else class="space-y-2">
            <div
              v-for="snap in snapshots"
              :key="snap.id"
              class="p-3 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800/50"
            >
              <div class="flex items-center justify-between mb-1">
                <input
                  v-if="editingSnapId === snap.id"
                  v-model="editingSnapName"
                  class="flex-1 px-2 py-1 text-sm rounded border border-apple-gray-300 dark:border-apple-gray-600 bg-white dark:bg-apple-gray-900"
                  @blur="saveSnapName(snap)"
                  @keydown.enter="saveSnapName(snap)"
                />
                <span v-else class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ snap.name }}</span>
                <span class="text-[11px] text-apple-gray-400">{{ formatTime(snap.created) }}</span>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <button
                  class="px-2.5 py-1 rounded text-xs text-brian-blue hover:bg-brian-blue/10 transition-colors"
                  @click="restoreSnapshot(snap.id)"
                >恢复</button>
                <button
                  class="px-2.5 py-1 rounded text-xs text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
                  @click="startEditName(snap)"
                >重命名</button>
                <button
                  class="px-2.5 py-1 rounded text-xs text-error-red hover:bg-error-red/10 transition-colors"
                  @click="deleteSnapshot(snap.id)"
                >删除</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 实体管理视图 - Provider ========================== -->
        <div v-if="isEntityView && currentEntityType === 'provider'" class="px-5 pb-6">
          <div class="flex justify-between items-center mb-4">
            <span class="text-xs text-apple-gray-400">{{ providers.length }} 个提供商</span>
            <button class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors" @click="openProviderModal()">
              <Plus :size="13" /> 添加提供商
            </button>
          </div>
          <div v-if="providersLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="providers.length === 0" class="flex flex-col items-center justify-center py-16">
            <Globe :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无提供商配置</p>
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 p-3">
            <div
              v-for="p in providers" :key="p.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md hover:border-brian-blue/30 transition-shadow p-4 aspect-[3/2] flex flex-col cursor-pointer"
              @click="openProviderModal(p)"
            >
              <div class="mb-3">
                <div class="flex items-center gap-2.5 mb-2">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Globe :size="18" /></div>
                  <div class="min-w-0 flex-1">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ p._displayName || p.id }}</h3>
                    <p class="text-[11px] text-apple-gray-400 truncate">{{ p._displayUrl || '' }}</p>
                  </div>
                  <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :class="(p.api_key as string) ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" :title="(p.api_key as string) ? '已配置密钥' : '未配置密钥'" />
                </div>
                <p class="text-[11px] text-apple-gray-400 line-clamp-2" :title="p.llm_provider_brief || ''">
                  {{ p.llm_provider_brief || '暂无描述' }}
                </p>
              </div>
              <div class="flex items-center justify-end pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto">
                <div class="flex items-center gap-1">
                  <button class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded text-brian-blue hover:bg-brian-blue/10 transition-colors" @click.stop="handleTestProvider(p.id)"><FlaskConical :size="11" /> 测试</button>
                  <button
                    class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0"
                    :class="p.enable ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                    title="启用/停用"
                    @click.stop="handleToggleProvider(p.id)"
                  >
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="p.enable ? 'translate-x-4' : ''" />
                  </button>
                  <button class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click.stop="handleDeleteProvider(p.id)"><Trash2 :size="11" /> 删除</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 实体管理视图 - Model ========================== -->
        <div v-if="isEntityView && currentEntityType === 'model'" class="px-5 pb-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="relative flex-1 max-w-sm">
              <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-apple-gray-400" />
              <input v-model="modelSearch" type="text" :class="inputClass + ' !py-1.5 !pl-8'" placeholder="搜索模型名或提供商..." />
            </div>
            <span class="text-xs text-apple-gray-400">{{ filteredModels.length }} / {{ models.length }} 个模型</span>
          </div>
          <div v-if="modelsLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="models.length === 0" class="flex flex-col items-center justify-center py-16">
            <Boxes :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无可用模型，请在编辑提供商中获取并添加模型</p>
          </div>
          <div v-else-if="filteredModels.length === 0" class="flex flex-col items-center justify-center py-16">
            <Search :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">没有匹配的模型</p>
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 p-3">
            <div
              v-for="m in filteredModels" :key="m.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md hover:border-brian-blue/30 transition-shadow p-4 aspect-[3/2] flex flex-col cursor-pointer"
              @click="openModelModal(m)"
            >
              <div class="mb-3">
                <div class="flex items-center gap-2.5 mb-2">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Boxes :size="18" /></div>
                  <div class="min-w-0 flex-1">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ m.modelName || '' }}</h3>
                    <p class="text-[11px] text-apple-gray-400 truncate">{{ m.providerName || m.providerId || '' }}</p>
                  </div>
                  <span v-if="m.isDefault" class="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-brian-blue/10 text-brian-blue flex-shrink-0"><Star :size="10" /> 默认</span>
                  <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :class="m.enable ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" :title="m.enable ? '启用' : '停用'" />
                </div>
                <p class="text-[11px] text-apple-gray-400">
                  {{ (m.maxTokens || 0) >= 1000000 ? ((m.maxTokens || 0) / 1000000).toFixed(1) + 'M' : (m.maxTokens || 0) >= 1000 ? ((m.maxTokens || 0) / 1000).toFixed(0) + 'K' : (m.maxTokens || 0) }} tokens
                </p>
              </div>
              <div class="flex items-center justify-end pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto">
                <div class="flex items-center gap-1">
                  <button class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0" :class="m.enable ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" title="启用/停用" @click.stop="handleToggleModel(m.id)">
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="m.enable ? 'translate-x-4' : ''" />
                  </button>
                  <button
                    class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded transition-colors"
                    :class="m.isDefault ? 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400 cursor-not-allowed' : 'bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20'"
                    :disabled="!!m.isDefault"
                    @click.stop="handleSetDefault(m.id)"
                  >
                    <Star :size="11" /> {{ m.isDefault ? '默认' : '设为默认' }}
                  </button>
                  <button class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click.stop="handleDeleteModel(m.id)"><Trash2 :size="11" /> 删除</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 实体管理视图 - Soul ========================== -->
        <div v-if="isEntityView && currentEntityType === 'soul'" class="px-5 pb-6">
          <div class="flex justify-between items-center mb-4">
            <span class="text-xs text-apple-gray-400">{{ souls.length }} 个 Soul</span>
            <button class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors" @click="openSoulModal()">
              <Plus :size="13" /> 添加 Soul
            </button>
          </div>
          <div v-if="soulsLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="souls.length === 0" class="flex flex-col items-center justify-center py-16">
            <Heart :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无 Soul 配置</p>
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 p-3">
            <div
              v-for="s in souls" :key="s.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md hover:border-brian-blue/30 transition-shadow p-4 aspect-[3/2] flex flex-col cursor-pointer"
              @click="openSoulModal(s)"
            >
              <div class="mb-3">
                <div class="flex items-center gap-2.5 mb-2">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Heart :size="18" /></div>
                  <div class="min-w-0 flex-1">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ s.soul_brief || s.id }}</h3>
                    <p class="text-[11px] text-apple-gray-400">{{ s.soul_usage || '' }}</p>
                  </div>
                  <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :class="(s.enabled ?? true) ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" />
                </div>
                <p class="text-[11px] text-apple-gray-400 line-clamp-2" :title="(s.soul_content || '')">
                  {{ (s.soul_content || '').slice(0, 120) || '暂无内容' }}
                </p>
              </div>
              <div class="flex items-center justify-end pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto">
                <div class="flex items-center gap-1">
                  <button class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0" :class="(s.enabled ?? true) ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click.stop="handleToggleSoul(s.id)">
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="(s.enabled ?? true) ? 'translate-x-4' : ''" />
                  </button>
                  <button class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click.stop="handleDeleteSoul(s.id)"><Trash2 :size="11" /> 删除</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 实体管理视图 - Skill ========================== -->
        <div v-if="isEntityView && currentEntityType === 'skill'" class="px-5 pb-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="relative flex-1 max-w-sm">
              <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-apple-gray-400" />
              <input v-model="skillSearchQuery" type="text" :class="inputClass + ' !py-1.5 !pl-8'" placeholder="搜索 Skill 名称..." />
            </div>
            <span class="text-xs text-apple-gray-400">{{ filteredSkills.length }} / {{ skills.length }} 个技能</span>
            <button class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors" @click="openSkillModal()">
              <Plus :size="13" /> 添加 Skill
            </button>
          </div>
          <div v-if="skillsLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="skills.length === 0" class="flex flex-col items-center justify-center py-16">
            <Wand2 :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无 Skill 配置</p>
          </div>
          <div v-else-if="filteredSkills.length === 0" class="flex flex-col items-center justify-center py-16">
            <Search :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">没有匹配的 Skill</p>
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 p-3">
            <div
              v-for="sk in filteredSkills" :key="sk.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md hover:border-brian-blue/30 transition-shadow p-4 aspect-[3/2] flex flex-col cursor-pointer"
              @click="openSkillModal(sk)"
            >
              <div class="mb-3">
                <div class="flex items-center gap-2.5 mb-2">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Wand2 :size="18" /></div>
                  <div class="min-w-0 flex-1">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ sk.name || sk.id }}</h3>
                    <p class="text-[11px] text-apple-gray-400">{{ sk.enabled ?? true ? '启用' : '停用' }}</p>
                  </div>
                  <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :class="(sk.enabled ?? true) ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" />
                </div>
                <p class="text-[11px] text-apple-gray-400 line-clamp-2" :title="sk.skill_brief || sk.name">{{ sk.skill_brief || sk.name || '暂无描述' }}</p>
              </div>
              <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto">
                <button class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded bg-success-green/10 text-success-green hover:bg-success-green/20 transition-colors" @click.stop="openSkillTestModal(sk)">
                  <FlaskConical :size="11" />
                  测试
                </button>
                <div class="flex items-center gap-1">
                  <button class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0" :class="(sk.enabled ?? true) ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click.stop="handleToggleSkill(sk.id)">
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="(sk.enabled ?? true) ? 'translate-x-4' : ''" />
                  </button>
                  <button class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click.stop="handleDeleteSkill(sk.id)"><Trash2 :size="11" /> 删除</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 实体管理视图 - MCP 市场 ========================== -->
        <div v-if="isEntityView && currentEntityType === 'mcp-provider'" :class="mcpMarketSelectedProvider ? 'flex flex-col h-full' : 'px-5 pb-6'">
          <!-- ═══ 市场详情页：工具浏览器 ═══ -->
          <template v-if="mcpMarketSelectedProvider">
            <div class="flex-shrink-0 px-5 pt-5">
              <div class="flex items-center gap-2 mb-5">
                <button
                  class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors"
                  @click="mcpMarketSelectedProvider = null; mcpMarketSearchQuery = ''"
                >
                  <ChevronRight :size="13" class="rotate-180" />
                  返回市场列表
                </button>
                <div class="w-px h-5 bg-apple-gray-200 dark:bg-apple-gray-700" />
                <div class="flex items-center gap-2">
                  <Globe :size="16" class="text-brian-blue" />
                  <h2 class="text-base font-semibold text-apple-gray-900 dark:text-apple-gray-50">
                    {{ mcpProviders.find(p => (p.provider_code || p.id) === mcpMarketSelectedProvider)?._displayName || '' }}
                  </h2>
                </div>
                <div class="flex-1" />
                <div class="flex items-center gap-1.5">
                  <button class="p-1.5 rounded-lg text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 transition-colors" title="刷新" @click="handleRefreshMcpList(mcpMarketSelectedProvider)">
                    <RefreshCw :size="14" :class="mcpMarketLoading ? 'animate-spin' : ''" />
                  </button>
                  <div class="relative">
                    <Search :size="13" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-apple-gray-400" />
                    <input v-model="mcpMarketSearchQuery" type="text" :class="inputClass + ' !py-1.5 !pl-7 !pr-3 !w-48 !text-xs'" placeholder="搜索工具..." @input="onMcpMarketSearchChange" />
                  </div>
                </div>
              </div>
            </div>

            <div ref="mcpMarketScrollContainer" class="flex-1 overflow-y-auto px-5 pb-6 relative" @scroll="onMcpMarketScroll">
              <div v-if="mcpMarketLoading" class="flex justify-center py-20"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
              <div v-else-if="filteredMcpMarketTools.length === 0" class="flex flex-col items-center py-20 text-center">
                <component :is="mcpMarketMessage ? Key : Download" :size="32" class="mb-4" :class="mcpMarketMessage ? 'text-warning-orange' : 'text-apple-gray-400'" />
                <p class="text-sm text-apple-gray-500 mb-1" v-if="mcpMarketSearchQuery">未找到匹配的工具</p>
                <p class="text-sm mb-1" :class="mcpMarketMessage ? 'text-warning-orange' : 'text-apple-gray-500'" v-else>{{ mcpMarketMessage || '暂无可用工具' }}</p>
                <p class="text-xs text-apple-gray-400" v-if="!mcpMarketSearchQuery && !mcpMarketMessage">请点击右上角刷新按钮从市场获取工具列表</p>
              </div>
              <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 p-3">
                <div
                  v-for="tool in filteredMcpMarketTools" :key="tool.id"
                  class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:border-brian-blue/30 hover:shadow-sm transition-all p-4 aspect-[3/2] flex flex-col"
                >
                  <div class="mb-3">
                    <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 leading-snug truncate">{{ tool.title || tool.id }}</p>
                    <p v-if="tool.brief" class="text-[11px] text-apple-gray-400 mt-1.5 line-clamp-2" :title="tool.brief">{{ tool.brief }}</p>
                  </div>
                  <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto">
                    <span class="text-[10px] text-apple-gray-400">{{ mcpMarketSelectedProvider === 'github' ? 'npm' : 'http' }}</span>
                    <button
                      class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors"
                      :class="tool.installed ? 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400 cursor-not-allowed' : 'bg-brian-blue text-white hover:bg-brian-blue/90'"
                      :disabled="!!tool.installed"
                      @click="handleInstallMcp(mcpMarketSelectedProvider!, tool.id)"
                    >
                      <Loader2 v-if="installingMcpId === tool.id" :size="11" class="animate-spin" />
                      <Download v-else :size="11" />
                      {{ tool.installed ? '已安装' : '安装' }}
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="mcpMarketLoadingMore" class="flex justify-center py-4">
                <Loader2 :size="20" class="animate-spin text-brian-blue" />
                <span class="ml-2 text-sm text-apple-gray-400">加载中...</span>
              </div>
              <div ref="mcpMarketSentinel" v-if="mcpMarketHasMore && filteredMcpMarketTools.length > 0 && !mcpMarketLoadingMore" class="h-1" />
            </div>

            <Transition name="fade">
              <button
                v-if="showMcpBackToTop"
                class="absolute bottom-6 right-8 w-10 h-10 rounded-full bg-brian-blue text-white shadow-lg hover:bg-brian-blue/90 transition-all flex items-center justify-center z-10"
                @click="scrollMcpMarketToTop"
                title="返回顶部"
              >
                <ChevronRight :size="18" class="-rotate-90" />
              </button>
            </Transition>
          </template>

          <!-- ═══ 市场卡片列表 ═══ -->
          <template v-else>
            <div class="flex items-center mb-4">
              <span class="text-xs text-apple-gray-400">{{ mcpProviders.length }} 个内置 MCP 市场</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-brian-blue/10 text-brian-blue ml-2">系统内置</span>
            </div>
            <div v-if="mcpProvidersLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
            <div v-else-if="mcpProviders.length === 0" class="flex flex-col items-center justify-center py-16">
              <Globe :size="28" class="text-apple-gray-400 mb-3" />
              <p class="text-sm text-apple-gray-500">暂无 MCP 市场数据</p>
            </div>
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 p-3">
              <div
                v-for="p in mcpProviders" :key="p.id"
                class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md hover:border-brian-blue/30 transition-all cursor-pointer p-4 group aspect-[3/2] flex flex-col"
                @click="toggleMcpMarket(p.provider_code || p.id)"
              >
                <div class="mb-3">
                  <div class="flex items-center gap-2.5 mb-2">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue group-hover:bg-brian-blue/20 transition-colors"><Globe :size="18" /></div>
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate flex-1 min-w-0">{{ p._displayName || p.id }}</h3>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400 flex-shrink-0">内置</span>
                  </div>
                  <p class="text-[11px] text-apple-gray-400 line-clamp-2" :title="p.mcp_provider_brief">{{ p.mcp_provider_brief || '' }}</p>
                </div>
                <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto" @click.stop>
                  <div class="flex items-center gap-1.5">
                    <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="handleTestMcpProvider(p.provider_code || p.id)"><FlaskConical :size="11" /> 测试</button>
                    <a
                      v-if="p.mcp_provider_url"
                      :href="p.mcp_provider_url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors"
                    >
                      <ExternalLink :size="11" />
                      访问官网
                    </a>
                  </div>
                  <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20 transition-colors" @click="openMcpConfigModal(p.provider_code || p.id)"><Key :size="11" /> 配置</button>
                </div>
              </div>
            </div>

            <!-- API Key 配置弹窗 -->
            <Teleport to="body">
              <Transition name="modal">
                <div v-if="mcpConfigModalVisible" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.self="closeMcpConfigModal">
                  <div class="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
                    <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50 mb-1">
                      {{ mcpProviders.find(p => (p.provider_code || p.id) === mcpConfigProviderId)?._displayName || '' }} 配置
                    </h2>
                    <p class="text-xs text-apple-gray-400 mb-4">配置 API Key 以启用该市场的完整功能</p>
                    <div class="space-y-3">
                      <div>
                        <label class="text-xs font-medium text-apple-gray-500 mb-1 block">API Key</label>
                        <div class="relative">
                          <input
                            v-model="mcpConfigApiKey"
                            :type="mcpConfigShowKey ? 'text' : 'password'"
                            :class="inputClass"
                            :placeholder="mcpConfigKeyPlaceholder"
                          />
                          <button class="absolute right-2.5 top-1/2 -translate-y-1/2 text-apple-gray-400 hover:text-apple-gray-600 transition-colors" @click="mcpConfigShowKey = !mcpConfigShowKey">
                            <Eye v-if="!mcpConfigShowKey" :size="14" />
                            <EyeOff v-else :size="14" />
                          </button>
                        </div>
                        <p class="text-[10px] text-apple-gray-400 mt-1">{{ mcpConfigKeyHint }}</p>
                      </div>
                    </div>
                    <div class="flex justify-between gap-2 mt-6">
                      <button class="px-3 py-2 text-sm rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="handleClearMcpApiKey">清除</button>
                      <div class="flex gap-2">
                        <button class="px-4 py-2 text-sm rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="closeMcpConfigModal">取消</button>
                        <button class="px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors" @click="saveMcpConfig">保存</button>
                      </div>
                    </div>
                  </div>
                </div>
              </Transition>
            </Teleport>
          </template>
        </div>

        <!-- ========================== 实体管理视图 - MCP 实例 ========================== -->
        <div v-if="isEntityView && currentEntityType === 'mcp'" class="px-5 pb-6">
          <div class="flex justify-between items-center mb-4">
            <span class="text-xs text-apple-gray-400">{{ mcps.length }} 个已安装 MCP</span>
            <div class="flex items-center gap-2">
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="selectedMcpIds.length === 0 || mcpBatchStarting"
                @click="handleBatchStartMcp"
              >
                <Loader2 v-if="mcpBatchStarting" :size="13" class="animate-spin" />
                <Zap v-else :size="13" />
                {{ mcpBatchStarting ? '启动中...' : `批量启动${selectedMcpIds.length ? ` (${selectedMcpIds.length})` : ''}` }}
              </button>
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20 transition-colors disabled:opacity-50"
                :disabled="mcpRefreshing"
                @click="handleRefreshMcp"
              >
                <Loader2 v-if="mcpRefreshing" :size="13" class="animate-spin" />
                <RefreshCw v-else :size="13" />
                {{ mcpRefreshing ? '刷新中...' : '刷新' }}
              </button>
            </div>
          </div>
          <div v-if="mcpsLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="mcps.length === 0" class="flex flex-col items-center justify-center py-16">
            <Plug :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500 mb-2">暂无已安装的 MCP 服务</p>
            <p class="text-xs text-apple-gray-400">请在"<span class="text-brian-blue">MCP 市场</span>"中浏览并安装 MCP 工具</p>
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 p-3">
            <div
              v-for="item in mcps" :key="item.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md transition-shadow p-4 aspect-[3/2] flex flex-col"
            >
              <div class="mb-3">
                <div class="flex items-start justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Plug :size="18" /></div>
                    <div class="min-w-0">
                      <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ item.displayName || item.name || item.id }}</h3>
                      <p class="text-[11px] text-apple-gray-400">{{ item.enabled ?? true ? '启用' : '停用' }}{{ item.version ? ` · v${item.version}` : '' }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="w-2.5 h-2.5 rounded-full" :class="item.running ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" :title="item.running ? '运行中' : '已停止'" />
                    <input type="checkbox" :value="item.id" v-model="selectedMcpIds" class="w-3.5 h-3.5 rounded border-apple-gray-300 text-brian-blue focus:ring-brian-blue flex-shrink-0 cursor-pointer" />
                  </div>
                </div>
                <p class="text-[11px] text-apple-gray-400 line-clamp-2" :title="item.description">{{ item.description || '暂无描述' }}</p>
              </div>
              <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto">
                <div class="flex items-center gap-1">
                  <button v-if="!item.running" class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded bg-success-green/10 text-success-green hover:bg-success-green/20 transition-colors" @click="handleStartMcp(item.id)"><Zap :size="11" /> 启动</button>
                  <button v-else class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded bg-warning-orange/10 text-warning-orange hover:bg-warning-orange/20 transition-colors" @click="handleStopMcp(item.id)"><span class="inline-block w-1.5 h-1.5 rounded-full bg-current" /> 关闭</button>
                  <button class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20 transition-colors" @click="handleUpgradeMcp(item.id)"><RefreshCw :size="11" /> 更新</button>
                </div>
                <div class="flex items-center gap-1">
                  <button class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0" :class="(item.enabled ?? true) ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click="handleToggleMcp(item.id)">
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="(item.enabled ?? true) ? 'translate-x-4' : ''" />
                  </button>
                  <button class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click="handleUninstallMcp(item.id)"><Trash2 :size="11" /> 卸载</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 实体管理视图 - MCP 调用统计 ========================== -->
        <div v-if="isEntityView && currentEntityType === 'mcp-stats'" class="px-5 pb-6">
          <div v-if="mcpsLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="mcps.length === 0" class="flex flex-col items-center justify-center py-16">
            <BarChart3 :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无已安装的 MCP，无法统计调用数据</p>
          </div>
          <div v-else>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 p-4">
                <p class="text-xs text-apple-gray-400 mb-1">已安装 MCP</p>
                <p class="text-2xl font-bold text-apple-gray-900 dark:text-apple-gray-50">{{ mcps.length }}</p>
              </div>
              <div class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 p-4">
                <p class="text-xs text-apple-gray-400 mb-1">启用的 MCP</p>
                <p class="text-2xl font-bold text-success-green">{{ mcps.filter(m => m.enabled ?? true).length }}</p>
              </div>
              <div class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 p-4">
                <p class="text-xs text-apple-gray-400 mb-1">停用的 MCP</p>
                <p class="text-2xl font-bold text-warning-orange">{{ mcps.filter(m => !(m.enabled ?? true)).length }}</p>
              </div>
              <div class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 p-4">
                <p class="text-xs text-apple-gray-400 mb-1">总调用次数</p>
                <p class="text-2xl font-bold text-brian-blue">{{ mcpUsageTotal }}</p>
              </div>
              <div class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 p-4">
                <p class="text-xs text-apple-gray-400 mb-1">今日调用次数</p>
                <p class="text-2xl font-bold text-brian-blue">{{ mcpUsageToday }}</p>
              </div>
            </div>
            <div class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800">
              <div class="px-4 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700 flex items-center justify-between">
                <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">MCP 调用统计</h3>
                <RefreshCw :size="14" class="text-apple-gray-400 cursor-pointer hover:text-brian-blue transition-colors" @click="loadMcpUsage" />
              </div>
              <div v-if="mcpUsageLoading" class="flex justify-center py-10"><Loader2 :size="20" class="animate-spin text-brian-blue" /></div>
              <div v-else-if="mcpUsageByMcp.length === 0" class="px-4 py-10 text-center text-sm text-apple-gray-400">暂无调用记录</div>
              <div v-else class="divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
                <div
                  v-for="u in mcpUsageByMcp" :key="u.title"
                  class="px-4 py-3 flex items-center justify-between"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Plug :size="14" /></div>
                    <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ u.title || 'unknown' }}</p>
                  </div>
                  <span class="text-sm font-semibold text-brian-blue flex-shrink-0">{{ u.count }} 次</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 实体管理视图 - Agent ========================== -->
        <div v-if="isEntityView && currentEntityType === 'agent'" class="px-5 pb-6">
          <div class="flex justify-between items-center mb-4">
            <span class="text-xs text-apple-gray-400">{{ agents.length }} 个 Agent</span>
            <button class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors" @click="openAgentModal()">
              <Plus :size="13" /> 创建 Agent
            </button>
          </div>
          <div v-if="agentsLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="agents.length === 0" class="flex flex-col items-center justify-center py-16">
            <Bot :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无 Agent 实例</p>
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <div
              v-for="a in agents" :key="a.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md transition-shadow p-4 aspect-square cursor-pointer"
              @click="openAgentModal(a)"
            >
              <div class="flex flex-col h-full">
                <div class="flex items-start justify-between mb-3">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Bot :size="18" /></div>
                    <div class="min-w-0">
                      <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ a.agent_name || a.name || a.id }}</h3>
                      <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue">{{ a.agent_type || a.type || 'WORKER' }}</span>
                        <span class="text-[11px] text-apple-gray-400">{{ a.enable ?? a.enabled ?? true ? '启用' : '停用' }}</span>
                      </div>
                    </div>
                  </div>
                  <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" :class="(a.enable ?? a.enabled ?? true) ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" />
                </div>
                <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-2 min-h-[32px] line-clamp-2">{{ a.agent_purpose || a.description || a.task_signature || '暂无描述' }}</p>
                <div class="flex flex-col gap-1.5 text-[10px] mb-3">
                  <div v-if="a.strategy_id" class="flex items-center gap-1.5 min-w-0">
                    <span class="px-1.5 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-300 flex-shrink-0">策略</span>
                    <span class="px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue truncate">{{ getStrategyLabel(a.strategy_id) }}</span>
                  </div>
                  <div v-if="a.llm_id" class="flex items-center gap-1.5 min-w-0">
                    <span class="px-1.5 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-300 flex-shrink-0">模型</span>
                    <span class="px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue truncate">{{ getModelName(a.llm_id) }}</span>
                  </div>
                  <div v-if="a.soul_id" class="flex items-center gap-1.5 min-w-0">
                    <span class="px-1.5 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-300 flex-shrink-0">Soul</span>
                    <span class="px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue truncate">{{ getSoulName(a.soul_id) }}</span>
                  </div>
                  <div v-if="a.eval_score !== undefined" class="flex items-center gap-1.5 min-w-0">
                    <span class="px-1.5 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-300 flex-shrink-0">评分</span>
                    <span class="px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue">{{ a.eval_score }}</span>
                  </div>
                  <div v-if="a.usage_count !== undefined" class="flex items-center gap-1.5 min-w-0">
                    <span class="px-1.5 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-300 flex-shrink-0">使用</span>
                    <span class="px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue">{{ a.usage_count }}次</span>
                  </div>
                </div>
                <div class="flex items-center justify-end gap-1.5 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto">
                  <button class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0" :class="(a.enable ?? a.enabled ?? true) ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click.stop="handleToggleAgent(a.id)">
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="(a.enable ?? a.enabled ?? true) ? 'translate-x-4' : ''" />
                  </button>
                  <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click.stop="handleDeleteAgent(a.id)"><Trash2 :size="11" /> 删除</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 占位视图：未实现的实体类型 ========================== -->
        <!-- ========================== 实体管理视图 - Prompt 模板 ========================== -->
        <div v-if="isEntityView && currentEntityType === 'prompt'" class="px-5 pb-6">
          <div class="mb-5 rounded-xl border border-brian-blue/20 bg-brian-blue/[0.02] dark:bg-brian-blue/5 p-4">
            <button class="w-full flex items-center justify-between text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 cursor-pointer" @click="promptHelpCollapsed = !promptHelpCollapsed">
              <span class="flex items-center gap-1.5">
                <Lightbulb :size="15" class="text-brian-blue" />
                Prompt 模板编写说明
              </span>
              <ChevronRight :size="16" class="text-apple-gray-400 transition-transform" :class="{ 'rotate-90': !promptHelpCollapsed }" />
            </button>
            <div v-show="!promptHelpCollapsed" class="text-xs text-apple-gray-600 dark:text-apple-gray-300 space-y-1.5 leading-relaxed mt-2">
              <p>提示词模板使用 <code v-pre class="px-1 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-brian-blue font-mono text-[11px]">{{ 变量名 }}</code> 语法嵌入动态变量。后端执行模板时将变量替换为实际值。</p>
              <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 mt-2">
                <dt class="font-medium text-apple-gray-500">模板内容：</dt>
                <dd>支持 Markdown 格式，模板内容将原样保留结构，仅替换 <code v-pre class="px-1 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-brian-blue font-mono text-[11px]">{{变量}}</code> 占位符。</dd>
                <dt class="font-medium text-apple-gray-500">变量语法：</dt>
                <dd>使用 <code v-pre class="px-1 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-brian-blue font-mono text-[11px]">{{变量名}}</code> 形式，花括号内首尾空格可省略。同一变量可在模板中多次出现，都会被替换。</dd>
                <dt class="font-medium text-apple-gray-500">变量处理：</dt>
                <dd>所有变量值均转为字符串后替换；模板中存在的占位符若无对应变量则保留原文；调用方传入的多余变量会被忽略。</dd>
              </dl>
              <div class="mt-2 p-2.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-100 dark:border-apple-gray-700">
                <p class="text-[11px] font-medium text-apple-gray-500 mb-1.5">示例：</p>
                <pre v-pre class="text-[11px] text-apple-gray-700 dark:text-apple-gray-300 whitespace-pre-wrap">请将以下内容翻译为{{target_lang}}：

原文：{{source}}

要求：{{requirement}}</pre>
                <p class="text-[11px] text-apple-gray-400 mt-1.5">调用 <code class="text-[10px] px-1 bg-apple-gray-200 dark:bg-apple-gray-600 rounded">execPrompt</code> 传入 <code class="text-[10px] px-1 bg-apple-gray-200 dark:bg-apple-gray-600 rounded">{ target_lang: "英文", source: "你好世界", requirement: "保持原意" }</code> 即可得到渲染后的完整提示词。</p>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 mb-4">
            <div class="relative flex-1 max-w-sm">
              <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-apple-gray-400" />
              <input v-model="promptSearchQuery" type="text" :class="inputClass + ' !py-1.5 !pl-8'" placeholder="搜索 Prompt 模板..." />
            </div>
            <span class="text-xs text-apple-gray-400">{{ filteredPrompts.length }} / {{ prompts.length }} 个模板</span>
            <div class="flex items-center gap-2 ml-auto">
              <button v-if="prompts.length > 0" class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-apple-gray-500 hover:text-brian-blue" @click="togglePromptSelectAll">
                <component :is="allPromptsSelected ? CheckSquare : Square" :size="14" />
                {{ allPromptsSelected ? '取消全选' : '全选' }}
              </button>
              <button v-if="selectedPrompts.size > 0" class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-error-red hover:bg-error-red/10 rounded-lg" @click="handleBatchDeletePrompts">
                <Trash2 :size="12" /> 批量删除({{ selectedPrompts.size }})
              </button>
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 p-3">
            <button
              class="flex flex-col items-center justify-center p-4 border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-600 rounded-xl text-apple-gray-400 hover:border-brian-blue hover:text-brian-blue transition-colors aspect-[3/2]"
              @click="openPromptModal()"
            >
              <Plus :size="24" class="mb-2" />
              <span class="text-sm font-medium">添加模板</span>
            </button>
            <div
              v-for="p in filteredPrompts" :key="p.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md hover:border-brian-blue/30 transition-shadow p-4 aspect-[3/2] flex flex-col cursor-pointer"
              :class="selectedPrompts.has(p.id) ? 'border-brian-blue/40 bg-brian-blue/5' : ''"
              @click="openPromptModal(p)"
            >
              <div class="mb-3">
                <div class="flex items-center gap-2.5 mb-2">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><MessageSquare :size="18" /></div>
                  <div class="min-w-0 flex-1">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ p.title }}</h3>
                  </div>
                  <button
                    class="p-0.5 flex-shrink-0"
                    :class="selectedPrompts.has(p.id) ? 'text-brian-blue' : 'text-apple-gray-300 hover:text-brian-blue'"
                    @click.stop="togglePromptSelect(p.id)"
                  >
                    <component :is="selectedPrompts.has(p.id) ? CheckSquare : Square" :size="16" />
                  </button>
                  <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :class="p.enabled ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" />
                </div>
                <p class="text-[11px] text-apple-gray-400 line-clamp-2" :title="p.brief || ''">
                  {{ p.brief || '暂无简介' }}
                </p>
              </div>
              <div class="flex items-center justify-end pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto">
                <button class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click.stop="handleDeletePrompt(p.id)"><Trash2 :size="11" /> 删除</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 实体管理视图 - 编排策略 ========================== -->
        <div v-if="isEntityView && currentEntityType === 'orch-strategy'" class="px-5 pb-6">
          <div class="flex items-center gap-3 mb-4">
            <span class="text-xs text-apple-gray-400">{{ orchStrategies.length }} 个策略</span>
            <span v-if="orchStrategies.every(s => s.label === 'SIMPLE' || s.label === 'PLANNING')" class="text-[10px] px-1.5 py-0.5 rounded-full bg-brian-blue/10 text-brian-blue">系统内置</span>
          </div>

          <div class="mb-5 rounded-xl border border-brian-blue/20 bg-brian-blue/[0.02] dark:bg-brian-blue/5 p-4">
            <button class="w-full flex items-center justify-between text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 cursor-pointer" @click="orchStrategyHelpCollapsed = !orchStrategyHelpCollapsed">
              <span class="flex items-center gap-1.5">
                <Lightbulb :size="15" class="text-brian-blue" />
                编排策略说明
              </span>
              <ChevronRight :size="16" class="text-apple-gray-400 transition-transform" :class="{ 'rotate-90': !orchStrategyHelpCollapsed }" />
            </button>
            <div v-show="!orchStrategyHelpCollapsed" class="text-xs text-apple-gray-600 dark:text-apple-gray-300 space-y-2 leading-relaxed mt-2">
              <p>编排策略定义了 Agent 处理用户任务的<strong>执行流程</strong>。每个策略由多个 JSONNode 节点组成，按顺序执行，节点间通过 <code class="text-[10px] px-1 bg-apple-gray-100 dark:bg-apple-gray-700 rounded">next</code> 串联，通过 <code class="text-[10px] px-1 bg-apple-gray-100 dark:bg-apple-gray-700 rounded">on_error</code> 定义错误路径。</p>

              <dl class="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5 mt-2">
                <dt class="font-medium text-brian-blue">SIMPLE</dt>
                <dd>单 Agent 直行模式。构建一个 WorkAgent，直接执行任务并返回结果。适用于<strong>简单问答、单一任务</strong>。</dd>
                <dt class="font-medium text-brian-blue">PLANNING</dt>
                <dd>多 Agent 并行模式。通过 PlannerAgent 分解任务，单任务走单 Agent 路径，多任务构建 Agent DAG 并行执行。适用于<strong>复杂分析、多步骤任务</strong>。</dd>
              </dl>

              <div class="mt-2 p-2.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-100 dark:border-apple-gray-700">
                <p class="text-[11px] font-medium text-apple-gray-500 mb-1.5">策略选择机制</p>
                <p class="text-[11px]">系统根据 <code class="text-[10px] px-1 bg-apple-gray-200 dark:bg-apple-gray-600 rounded">complexity_decompose_threshold</code>（默认 50）判断任务复杂度：低于阈值走 SIMPLE，高于阈值走 PLANNING。复杂度由 LLM 分析或规则判断（查询长度 + 疑问词数 + 步骤关键词）。</p>
              </div>

              <p class="text-[11px] text-apple-gray-400">
                节点类型: <span class="text-brian-blue font-mono">SAVE_USER_INPUT</span> 保存输入 |
                <span class="text-success-green font-mono">BUILD_WORK_CONTEXT</span> 构建上下文 |
                <span class="text-success-green font-mono">PLAN_WORK</span> 任务规划 |
                <span class="text-success-green font-mono">BUILD_WORK_AGENT</span> 构建Agent |
                <span class="text-success-green font-mono">BUILD_AGENT_DAG</span> 构建DAG |
                <span class="text-warning-orange font-mono">EXEC_AGENT</span> 执行Agent |
                <span class="text-warning-orange font-mono">EXEC_DAG</span> 执行DAG |
                <span class="text-brian-blue font-mono">WRITE_RESULT</span> 写结果 |
                <span class="text-purple-500 font-mono">EVAL_RESULT</span> 评估结果 |
                <span class="text-brian-blue font-mono">SAVE_RESPONSE</span> 保存响应 |
                <span class="text-apple-gray-500 font-mono">CONDITION</span> 条件分支 |
                <span class="text-error-red font-mono">HANDLE_ERROR</span> 错误兜底
              </p>
            </div>
          </div>
          <div v-if="orchStrategiesLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <div
              v-for="s in orchStrategies" :key="s.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md hover:border-brian-blue/30 transition-shadow p-4 aspect-[3/2] flex flex-col cursor-pointer"
              @click="openOrchStrategyDetail(s)"
            >
              <div class="flex items-start justify-between mb-2">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" :class="s.label === 'SIMPLE' ? 'bg-success-green/10 text-success-green' : 'bg-brian-blue/10 text-brian-blue'">
                    <component :is="s.label === 'SIMPLE' ? Zap : Network" :size="18" />
                  </div>
                  <div class="min-w-0">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ s.label }}</h3>
                    <p class="text-[11px] text-apple-gray-400">{{ s.enabled ? '启用' : '停用' }} · {{ s.nodeCount }} 个节点</p>
                  </div>
                </div>
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :class="s.enabled ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" />
              </div>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 line-clamp-2 mt-auto">{{ s.description }}</p>
            </div>
          </div>

          <!-- 编排策略详情弹窗 -->
          <Teleport to="body">
            <Transition name="modal">
              <div v-if="orchStrategyDetailVisible" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeOrchStrategyDetail" />
                <div class="relative w-full max-w-3xl bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden max-h-[85vh] flex flex-col">
                  <div class="flex items-center justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" :class="selectedOrchStrategy?.label === 'SIMPLE' ? 'bg-success-green/10 text-success-green' : 'bg-brian-blue/10 text-brian-blue'">
                        <component :is="selectedOrchStrategy?.label === 'SIMPLE' ? Zap : Network" :size="18" />
                      </div>
                      <div class="min-w-0">
                        <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ selectedOrchStrategy?.label }}</h3>
                        <p class="text-[11px] text-apple-gray-400">{{ selectedOrchStrategy?.enabled ? '启用' : '停用' }} · {{ selectedOrchStrategy?.nodeCount }} 个节点</p>
                      </div>
                    </div>
                    <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="closeOrchStrategyDetail"><X :size="18" /></button>
                  </div>
                  <div class="flex-1 overflow-y-auto">
                    <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 px-5 pt-4">{{ selectedOrchStrategy?.description }}</p>

                    <!-- DAG 流程图 -->
                    <div class="px-5 py-3 border-b border-apple-gray-100 dark:border-apple-gray-800">
                      <p class="text-[10px] text-apple-gray-400 uppercase tracking-wider mb-2">执行流 · {{ selectedOrchStrategy?.nodes.length }} 个节点 · 起始节点 {{ orchNodeNumber(selectedOrchStrategy?.startNode) }}</p>
                      <div class="flex flex-wrap items-center gap-1">
                        <template v-for="(node, ni) in selectedOrchStrategy?.nodes" :key="node.id">
                          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono border" :class="nodeColor(node.type)" :title="(ni + 1) + ' · ' + JSON.stringify(node.params)">{{ node.type.replace(/_/g, ' ') }}</span>
                          <span v-if="ni < (selectedOrchStrategy?.nodes.length ?? 0) - 1 && node.next" class="text-[9px] text-apple-gray-300">→</span>
                        </template>
                      </div>
                    </div>

                    <!-- 节点详情表 -->
                    <div class="px-5 py-3">
                      <p class="text-[10px] text-apple-gray-400 uppercase tracking-wider mb-2">节点详情</p>
                      <div class="overflow-x-auto">
                        <table class="w-full text-[11px]">
                          <thead>
                            <tr class="text-left text-apple-gray-400 border-b border-apple-gray-200 dark:border-apple-gray-700">
                              <th class="py-1.5 pr-3 font-medium">#</th>
                              <th class="py-1.5 pr-3 font-medium">节点类型</th>
                              <th class="py-1.5 pr-3 font-medium">下一节点</th>
                              <th class="py-1.5 pr-3 font-medium">条件分支</th>
                              <th class="py-1.5 font-medium">错误处理</th>
                            </tr>
                          </thead>
                          <tbody class="text-apple-gray-600 dark:text-apple-gray-300">
                            <tr v-for="(node, ni) in selectedOrchStrategy?.nodes" :key="node.id" class="border-b border-apple-gray-100 dark:border-apple-gray-800">
                              <td class="py-1.5 pr-3 font-mono text-apple-gray-400" :title="Object.keys(node.params).length > 0 ? JSON.stringify(node.params, null, 2) : '无参数'">{{ ni + 1 }}</td>
                              <td class="py-1.5 pr-3"><span class="px-1.5 py-0.5 rounded text-[10px] font-mono border" :class="nodeColor(node.type)">{{ node.type.replace(/_/g, ' ') }}</span></td>
                              <td class="py-1.5 pr-3 font-mono text-[10px]" :class="node.next ? 'text-apple-gray-500' : 'text-apple-gray-300'">{{ node.next ? orchNodeNumber(node.next) : '终止' }}</td>
                              <td class="py-1.5 pr-3 font-mono text-[10px]" :class="(node.trueNext || node.falseNext) ? 'text-brian-blue/80' : 'text-apple-gray-300'">
                                <template v-if="node.trueNext || node.falseNext">真: {{ orchNodeNumber(node.trueNext) }} / 假: {{ orchNodeNumber(node.falseNext) }}</template>
                                <template v-else>—</template>
                              </td>
                              <td class="py-1.5 font-mono text-[10px]" :class="node.onError ? 'text-error-red/70' : 'text-apple-gray-300'">{{ orchNodeNumber(node.onError) }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <!-- 配置提示 -->
                    <div class="px-5 py-2 border-t border-apple-gray-200 dark:border-apple-gray-700">
                      <p class="text-[10px] text-apple-gray-400">
                        配置: 编排配置 → <span class="text-brian-blue">编排入口</span> (complexity_decompose_threshold 控制 SIMPLE/PLANNING 选择) | 
                        <span class="text-brian-blue">策略参数</span> (max_plan_retries 控制计划重试次数)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </Teleport>
        </div>

        <!-- ========================== 实体管理视图 - CDT 浏览器状态 ========================== -->
        <div v-if="isEntityView && currentEntityType === 'cdt-status'" class="px-5 pb-6">
          <div class="mb-4">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center bg-brian-blue/10 text-brian-blue"><Monitor :size="18" /></div>
              <div>
                <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">Chrome DevTools 浏览器</h3>
                <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">控制 Chrome 浏览器的启动、停止与状态监控</p>
              </div>
            </div>
            <div class="flex items-center gap-3 mb-4">
              <button class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors" :class="cdtStatus.running ? 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400 cursor-not-allowed' : 'bg-brian-blue text-white hover:bg-brian-blue/90'" :disabled="cdtStatus.running" @click="startCDT">
                <Zap :size="14" /> 启动浏览器
              </button>
              <button class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors" :class="!cdtStatus.running ? 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400 cursor-not-allowed' : 'bg-error-red text-white hover:bg-error-red/90'" :disabled="!cdtStatus.running" @click="stopCDT">
                <X :size="14" /> 停止浏览器
              </button>
              <button class="p-2 rounded-lg text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 transition-colors" title="刷新状态" @click="loadCDTStatus">
                <RefreshCw :size="16" :class="cdtStatusLoading ? 'animate-spin' : ''" />
              </button>
            </div>
            <div class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 p-4 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm text-apple-gray-500 dark:text-apple-gray-400">状态</span>
                <span class="flex items-center gap-1.5 text-sm font-medium" :class="cdtStatus.running ? 'text-success-green' : 'text-apple-gray-400'">
                  <span class="w-2 h-2 rounded-full" :class="cdtStatus.running ? 'bg-success-green' : 'bg-apple-gray-300'" />
                  {{ cdtStatus.running ? '运行中' : '已停止' }}
                </span>
              </div>
              <div class="flex items-center justify-between"><span class="text-sm text-apple-gray-500 dark:text-apple-gray-400">进程 PID</span><span class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ cdtStatus.pid || '-' }}</span></div>
              <div class="flex items-center justify-between"><span class="text-sm text-apple-gray-500 dark:text-apple-gray-400">调试端口</span><span class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ cdtStatus.port || '-' }}</span></div>
              <div class="flex items-center justify-between"><span class="text-sm text-apple-gray-500 dark:text-apple-gray-400">WebSocket 端点</span><span class="text-sm font-mono text-apple-gray-900 dark:text-apple-gray-50 truncate max-w-[300px]">{{ cdtStatus.endpoint || '-' }}</span></div>
            </div>
          </div>
          <p class="text-xs text-apple-gray-400">提示：启动浏览器后，Chrome 窗口将打开。请勿手动关闭——通过此页面停止会自动清理进程。</p>
        </div>

        <!-- ========================== 实体管理视图 - CDT 网页访问 ========================== -->
        <div v-if="isEntityView && currentEntityType === 'cdt-page'" class="px-5 pb-6">
          <div class="mb-4">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center bg-brian-blue/10 text-brian-blue"><Globe :size="18" /></div>
              <div>
                <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">网页访问</h3>
              </div>
            </div>

            <!-- 书签 -->
            <div class="mb-4">
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wide">书签</h4>
                <div class="flex items-center gap-1">
                  <button class="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 hover:text-brian-blue transition-colors" @click="bookmarkNewItemUrl = cdtPageUrl; addBookmarkItem()" :disabled="!cdtPageUrl.trim()" title="收藏当前页面"><Star :size="10" /> 收藏</button>
                  <button class="px-2 py-1 text-[10px] rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 hover:text-brian-blue transition-colors" @click="loadBookmarks()" title="刷新"><RefreshCw :size="10" /></button>
                </div>
              </div>
              <div v-if="bookmarkLoading" class="py-4 flex justify-center"><Loader2 :size="16" class="animate-spin text-brian-blue" /></div>
              <div v-else-if="bookmarkTree.length === 0" class="text-center py-2">
                <p class="text-xs text-apple-gray-400">暂无书签</p>
              </div>
              <div v-else class="space-y-0.5 max-h-[200px] overflow-y-auto">
                <template v-for="folder in bookmarkTree" :key="folder.id">
                  <div>
                    <div class="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors group cursor-pointer" @click="toggleFolder(folder.id)">
                      <ChevronRight :size="11" class="text-apple-gray-400 transition-transform flex-shrink-0" :class="expandedFolders.has(folder.id) ? 'rotate-90' : ''" />
                      <span class="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300 truncate">{{ folder.name }}</span>
                      <span class="text-[9px] text-apple-gray-400 flex-shrink-0">{{ folder.items.length + folder.children.length }}</span>
                      <div class="flex-1" />
                      <button class="opacity-0 group-hover:opacity-100 p-0.5 text-[9px] text-apple-gray-400 hover:text-error-red flex-shrink-0" @click.stop="removeFolder(folder.id)"><Trash2 :size="10" /></button>
                    </div>
                    <div v-if="expandedFolders.has(folder.id)" class="ml-3 pl-2 border-l border-apple-gray-200 dark:border-apple-gray-700">
                      <div v-for="item in folder.items" :key="item.id" class="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors group">
                        <span class="text-[9px] text-apple-gray-400 flex-shrink-0">🔖</span>
                        <span class="text-xs text-apple-gray-700 dark:text-apple-gray-300 truncate flex-1 cursor-pointer" @click="cdtPageUrl = item.url; cdtNavigate()" :title="item.url">{{ item.title || item.url }}</span>
                        <button class="opacity-0 group-hover:opacity-100 p-0.5 text-[9px] text-apple-gray-400 hover:text-error-red flex-shrink-0" @click.stop="removeBookmarkItem(item.id)"><Trash2 :size="10" /></button>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- URL 输入 -->
            <div class="flex items-center gap-2 mb-4">
              <div class="flex-1">
                <input v-model="cdtPageUrl" :class="inputClass + ' !py-1.5 !text-sm'" placeholder="输入网页 URL（如 https://github.com）" @keyup.enter="cdtNavigate" />
              </div>
              <div class="relative">
                <button class="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:border-brian-blue/30 transition-colors" @click="cdtScreencastSettingsOpen = !cdtScreencastSettingsOpen">
                  <Settings :size="14" />
                </button>
                <!-- 设置弹窗 -->
                <div v-if="cdtScreencastSettingsOpen" class="absolute right-0 top-full mt-1 z-20 w-64 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 shadow-lg p-3">
                  <div class="mb-3">
                    <label class="block text-[11px] font-medium text-apple-gray-500 mb-1.5">分辨率</label>
                    <div class="grid grid-cols-2 gap-1">
                      <button v-for="r in cdtResolutions" :key="r.w" class="px-2 py-1.5 text-[11px] rounded-md transition-colors text-left" :class="cdtScreencastW === r.w && cdtScreencastH === r.h ? 'bg-brian-blue/10 text-brian-blue font-medium' : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'" @click="applyCdtScreencastSettings(r.w, r.h, cdtScreencastQ)">{{ r.label }}</button>
                    </div>
                  </div>
                  <div>
                    <label class="block text-[11px] font-medium text-apple-gray-500 mb-1.5">画质</label>
                    <div class="flex items-center gap-1">
                      <button v-for="q in cdtQualities" :key="q" class="flex-1 py-1 text-[11px] rounded-md transition-colors" :class="cdtScreencastQ === q ? 'bg-brian-blue/10 text-brian-blue font-medium' : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'" @click="applyCdtScreencastSettings(cdtScreencastW, cdtScreencastH, q)">{{ q }}%</button>
                    </div>
                  </div>
                </div>
              </div>
              <button class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-60" :disabled="cdtPageLoading || !cdtStatus.running || !cdtPageUrl.trim()" @click="cdtNavigate">
                <Zap :size="14" />
                {{ cdtPageLoading ? '加载中...' : '打开页面' }}
              </button>
            </div>

            <!-- Remote Browser 内嵌视图 -->
            <div
              v-if="cdtPageFrame"
              ref="cdtBrowserRef"
              class="rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden bg-apple-gray-100 dark:bg-apple-gray-900 relative cursor-crosshair select-none mb-4"
              tabindex="0"
              @mousedown="onBrowserMouseDown"
              @mouseup="onBrowserMouseUp"
              @mousemove="onBrowserMouseMove"
              @mouseleave="onBrowserMouseLeave"
              @dblclick="onBrowserDblClick"
              @keydown="onBrowserKeyDown"
              @keyup="onBrowserKeyUp"
              @paste="onBrowserPaste"
              @wheel="onBrowserWheel"
              @contextmenu="onBrowserContextMenu"
            >
              <img :src="cdtPageFrame" alt="Remote Browser" class="w-full pointer-events-none" draggable="false" />
              <div class="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-black/40 text-white text-[10px]">
                <span class="w-1.5 h-1.5 rounded-full bg-success-green animate-pulse" />
                实时画面（250ms 刷新）
              </div>
            </div>
            <div v-else-if="cdtPageLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>

            <!-- 自定义右击菜单（headless Chrome 无原生菜单） -->
            <Teleport to="body">
              <div
                v-if="ctxMenuVisible"
                class="fixed z-[200] rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 shadow-xl py-1 min-w-[140px]"
                :style="{ left: ctxMenuX + 'px', top: ctxMenuY + 'px' }"
                @click.stop
              >
                <button class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-apple-gray-700 dark:text-apple-gray-200 hover:bg-brian-blue/10 transition-colors" @click="ctxCopy">📋 复制</button>
                <button class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-apple-gray-700 dark:text-apple-gray-200 hover:bg-brian-blue/10 transition-colors" @click="ctxPaste">📄 粘贴</button>
                <div class="border-t border-apple-gray-200 dark:border-apple-gray-700 my-1" />
                <button class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-apple-gray-700 dark:text-apple-gray-200 hover:bg-brian-blue/10 transition-colors" @click="ctxSelectAll">✅ 全选</button>
              </div>
            </Teleport>
            <!-- 点击任意位置关闭菜单 -->
            <div v-if="ctxMenuVisible" class="fixed inset-0 z-[199]" @click="hideCtxMenu" @contextmenu.prevent="hideCtxMenu" />

            <!-- 凭证操作 -->
            <div class="flex items-center gap-2 mb-4">
              <button class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-success-green/10 text-success-green hover:bg-success-green/20 transition-colors disabled:opacity-60" :disabled="!cdtStatus.running || !cdtPageUrl.trim()" @click="cdtSaveCredential">
                <Save :size="13" /> 保存凭证
              </button>
            </div>
            <span v-if="!cdtStatus.running" class="text-xs text-warning-orange">请先在"浏览器状态"中启动 CDT</span>

            <!-- 已保存凭证列表 -->
            <div v-if="savedCDTSessions.length > 0" class="mt-5">
              <h4 class="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 mb-3 uppercase tracking-wide">已保存的登录凭证</h4>
              <div class="space-y-2">
                <div v-for="s in savedCDTSessions" :key="s.domain" class="flex items-center justify-between rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 px-3 py-2">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ s.domain }}</p>
                    <p class="text-[10px] text-apple-gray-400 mt-0.5">{{ s.url }} · {{ new Date(s.timestamp).toLocaleString() }}</p>
                  </div>
                  <div class="flex items-center gap-1.5 flex-shrink-0 ml-3">
                    <button class="px-2 py-1 text-[11px] font-medium rounded bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20 transition-colors disabled:opacity-60" :disabled="!cdtStatus.running" @click="cdtRestoreCredential(s.domain, s.cookiesJson, s.url)">恢复</button>
                    <button class="px-2 py-1 text-[11px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click="cdtDeleteCredential(s.domain)"><Trash2 :size="12" /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="isEntityView && currentEntityType === 'profile-direction'" class="px-5 pb-6">
          <div class="flex justify-between items-center mb-4">
            <span class="text-xs text-apple-gray-400">{{ profileDirections.length }} 个维度</span>
            <button class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors" @click="openProfileDirModal()">
              <Plus :size="13" /> 添加维度
            </button>
          </div>
          <div v-if="profileDirsLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="profileDirections.length === 0" class="flex flex-col items-center justify-center py-16">
            <Layers :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无画像维度</p>
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 p-3">
            <div
              v-for="d in profileDirections" :key="d.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md hover:border-brian-blue/30 transition-shadow p-4 aspect-[3/2] flex flex-col cursor-pointer"
              @click="openProfileDirModal(d)"
            >
              <div class="mb-3">
                <div class="flex items-center gap-2.5 mb-2">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Layers :size="18" /></div>
                  <div class="min-w-0 flex-1">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ d.direction_name }}</h3>
                    <p class="text-[11px] text-apple-gray-400">{{ d.direction_key }}</p>
                  </div>
                  <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :class="d.enable ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" />
                </div>
                <div class="flex items-center gap-2 text-[11px] text-apple-gray-400 mb-1">
                  <span>权重 {{ d.weight }}</span>
                  <span v-if="d.prompt_template_id" class="text-brian-blue">· 自定义 Prompt</span>
                  <span v-if="d.llm_id" class="text-brian-blue">· 自定义 LLM</span>
                </div>
                <p class="text-[11px] text-apple-gray-400 line-clamp-2" :title="d.direction_description || ''">
                  {{ d.direction_description || '暂无描述' }}
                </p>
              </div>
              <div class="flex items-center justify-end pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700 mt-auto">
                <div class="flex items-center gap-1">
                  <button class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0" :class="d.enable ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click.stop="toggleProfileDir(d)">
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="d.enable ? 'translate-x-4' : ''" />
                  </button>
                  <button class="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click.stop="deleteProfileDir(d.direction_key)"><Trash2 :size="11" /> 删除</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Modal: 添加/编辑维度 -->
          <Teleport to="body">
            <div v-if="profileDirModalVisible" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.self="closeProfileDirModal">
              <div class="w-full max-w-md mx-4 rounded-2xl bg-white dark:bg-apple-gray-800 shadow-xl p-6">
                <h3 class="text-lg font-semibold mb-4">{{ editingProfileDir ? '编辑维度' : '添加维度' }}</h3>
                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-medium text-apple-gray-500 mb-1">维度标识 (Key)</label>
                    <input v-model="profileDirForm.direction_key" :class="inputClass" placeholder="如 tech_stack" :disabled="!!editingProfileDir" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-apple-gray-500 mb-1">维度名称</label>
                    <input v-model="profileDirForm.direction_name" :class="inputClass" placeholder="如 技术栈偏好" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-apple-gray-500 mb-1">描述</label>
                    <textarea v-model="profileDirForm.direction_description" :class="inputClass" rows="2" placeholder="维度描述" />
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-medium text-apple-gray-500 mb-1">权重 (0-100)</label>
                      <input v-model.number="profileDirForm.weight" type="number" min="0" max="100" :class="inputClass" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-apple-gray-500 mb-1">启用</label>
                      <select v-model="profileDirForm.enable" :class="inputClass">
                        <option :value="true">启用</option>
                        <option :value="false">禁用</option>
                      </select>
                    </div>
                  </div>
                  <div class="border-t border-apple-gray-100 dark:border-apple-gray-700 pt-3">
                    <p class="text-xs font-medium text-apple-gray-500 mb-2">LLM 配置（生成画像时使用）</p>
                    <div class="space-y-2">
                      <div>
                        <label class="block text-xs text-apple-gray-400 mb-0.5">Prompt 模板 ID</label>
                        <input v-model="profileDirForm.prompt_template_id" :class="inputClass + ' !text-xs'" placeholder="留空使用全局 Prompt" />
                      </div>
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="block text-xs text-apple-gray-400 mb-0.5">温度 (Temperature)</label>
                          <input v-model.number="profileDirForm.llm_temperature" type="number" step="0.1" min="0" max="2" :class="inputClass + ' !text-xs'" />
                        </div>
                        <div>
                          <label class="block text-xs text-apple-gray-400 mb-0.5">Max Tokens</label>
                          <input v-model.number="profileDirForm.llm_max_tokens" type="number" min="1" max="4096" :class="inputClass + ' !text-xs'" />
                        </div>
                      </div>
                      <div>
                        <label class="block text-xs text-apple-gray-400 mb-0.5">LLM 模型 ID（留空自动匹配）</label>
                        <input v-model="profileDirForm.llm_id" :class="inputClass + ' !text-xs'" placeholder="留空则自动匹配最优模型" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="flex justify-end gap-2 mt-5 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700">
                  <button class="px-4 py-2 text-sm rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors" @click="closeProfileDirModal">取消</button>
                  <button class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50 transition-colors" :disabled="profileDirSaving" @click="saveProfileDir">
                    <Loader2 v-if="profileDirSaving" :size="14" class="animate-spin" />
                    <Save v-else :size="14" />
                    {{ editingProfileDir ? '保存' : '创建' }}
                  </button>
                </div>
              </div>
            </div>
          </Teleport>
        </div>

        <!-- ========================== 实体管理视图 - 执行策略 ========================== -->
        <div v-if="isEntityView && currentEntityType === 'strategy'" class="px-5 pb-6">
          <div class="mb-5 rounded-xl border border-brian-blue/20 bg-brian-blue/[0.02] dark:bg-brian-blue/5 p-4">
            <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mb-2 flex items-center gap-1.5">
              <GitBranch :size="15" class="text-brian-blue" />
              执行策略说明
            </h4>
            <p class="text-xs text-apple-gray-600 dark:text-apple-gray-300 leading-relaxed">
              执行策略定义了 Agent 的<strong>思考推理模式</strong>（CoT / ReAct / Plan-and-Solve）。系统根据任务复杂度与领域自动匹配最合适的策略，每个策略包含适用复杂度区间、适用领域与执行规则（steps / phases 执行流）。
            </p>
          </div>

          <div v-if="agentStrategiesLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="agentStrategies.length === 0" class="flex flex-col items-center justify-center py-16">
            <GitBranch :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无执行策略</p>
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <div
              v-for="s in agentStrategies" :key="s.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md transition-shadow p-4 cursor-pointer aspect-[3/2]"
              @click="openStrategyDetail(s)"
            >
              <div class="flex flex-col h-full">
                <div class="flex items-start justify-between mb-2">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue">
                      <GitBranch :size="18" />
                    </div>
                    <div class="min-w-0">
                      <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ s.strategy_label }}</h3>
                      <p class="text-[11px] text-apple-gray-400">复杂度 {{ s.suitable_complexity_min }}-{{ s.suitable_complexity_max }} · {{ parseDomains(s.suitable_domains) }}</p>
                    </div>
                  </div>
                  <button class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0" :class="s.enable ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click.stop="toggleStrategy(s)">
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="s.enable ? 'translate-x-4' : ''" />
                  </button>
                </div>
                <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 font-mono mt-auto">{{ formatStrategyRule(s.execution_rule) }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 执行策略详情弹窗 ========================== -->
        <Teleport to="body">
          <Transition name="modal">
            <div v-if="strategyDetailVisible" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeStrategyDetail" />
              <div class="relative w-full max-w-2xl bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden max-h-[85vh] flex flex-col">
                <div class="flex items-center justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
                  <div class="flex items-center gap-2">
                    <GitBranch :size="16" class="text-brian-blue" />
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">执行策略详情</h3>
                  </div>
                  <button class="p-1 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="closeStrategyDetail"><X :size="16" class="text-apple-gray-400" /></button>
                </div>

                <div class="px-5 py-4 overflow-y-auto flex-1">
                  <template v-if="selectedStrategy">
                    <!-- 基本信息 -->
                    <div class="flex items-center gap-3 mb-4">
                      <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-brian-blue/10 text-brian-blue"><GitBranch :size="22" /></div>
                      <div class="min-w-0">
                        <h4 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ selectedStrategy.strategy_label }}</h4>
                        <p class="text-xs text-apple-gray-400 mt-0.5">
                          复杂度 {{ selectedStrategy.suitable_complexity_min }}-{{ selectedStrategy.suitable_complexity_max }} · {{ parseDomains(selectedStrategy.suitable_domains) }}
                          · <span :class="selectedStrategy.enable ? 'text-success-green' : 'text-apple-gray-400'">{{ selectedStrategy.enable ? '启用中' : '已停用' }}</span>
                        </p>
                      </div>
                    </div>

                    <!-- 元信息 -->
                    <div v-if="selectedStrategyRule.version || selectedStrategyRule.max_iterations" class="flex items-center gap-2 mb-4">
                      <span v-if="selectedStrategyRule.version" class="px-2 py-1 text-[11px] rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500">version {{ selectedStrategyRule.version }}</span>
                      <span v-if="selectedStrategyRule.max_iterations" class="px-2 py-1 text-[11px] rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500">最大迭代 {{ selectedStrategyRule.max_iterations }}</span>
                    </div>

                    <!-- 工作方式：steps 执行流 -->
                    <div v-if="selectedStrategyRule.steps">
                      <p class="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 mb-2">执行流程（steps）</p>
                      <div class="space-y-2">
                        <div v-for="(st, i) in selectedStrategyRule.steps" :key="i" class="rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 p-3">
                          <div class="flex items-center justify-between">
                            <span class="font-mono font-medium text-brian-blue">{{ st.step }}</span>
                            <span class="text-[10px] text-apple-gray-400">第 {{ i + 1 }} 步</span>
                          </div>
                          <div class="text-[11px] text-apple-gray-500 dark:text-apple-gray-400 mt-1 space-y-1">
                            <template v-if="st.condition_field">
                              <div>判断 <code class="text-[10px] px-1 bg-apple-gray-100 dark:bg-apple-gray-700 rounded">{{ st.condition_field }}</code>：是 → <span class="font-medium">{{ st.true_next || '—' }}</span>，否 → <span class="font-medium">{{ st.false_next || '—' }}</span></div>
                            </template>
                            <template v-else>
                              <div>下一步 → <span class="font-medium">{{ st.next || '结束' }}</span></div>
                            </template>
                            <div v-if="st.on_error" class="text-error-red">出错兜底 → {{ st.on_error }}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 工作方式：phases 执行阶段 -->
                    <div v-if="selectedStrategyRule.phases">
                      <p class="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 mb-2">执行阶段（phases）</p>
                      <div class="space-y-3">
                        <div v-for="(ph, i) in selectedStrategyRule.phases" :key="i" class="rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 p-3">
                          <div class="flex items-center justify-between mb-2">
                            <span class="font-semibold text-apple-gray-800 dark:text-apple-gray-100">{{ ph.phase }}</span>
                            <span v-if="ph.loop_over" class="text-[10px] text-apple-gray-400">循环 {{ ph.loop_over }}</span>
                          </div>
                          <div class="flex flex-wrap items-center gap-1">
                            <template v-for="(st, j) in ph.steps" :key="j">
                              <span class="px-2 py-0.5 rounded bg-apple-gray-100 dark:bg-apple-gray-700 font-mono text-[11px]">{{ st.step }}</span>
                              <span v-if="j < ph.steps.length - 1" class="text-apple-gray-300 text-[11px]">→</span>
                            </template>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 原始 JSON -->
                    <div class="mt-4">
                      <p class="text-[10px] text-apple-gray-400 uppercase tracking-wider mb-1.5">原始 execution_rule</p>
                      <pre class="text-[11px] text-apple-gray-600 dark:text-apple-gray-300 overflow-x-auto bg-apple-gray-50 dark:bg-apple-gray-900 rounded-lg p-3 border border-apple-gray-100 dark:border-apple-gray-700">{{ prettyJson(selectedStrategy.execution_rule) }}</pre>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>

        <div v-if="isEntityView && !['provider', 'model', 'soul', 'skill', 'mcp', 'mcp-provider', 'mcp-stats', 'agent', 'prompt', 'strategy', 'orch-strategy', 'cdt-status', 'cdt-page', 'profile-direction'].includes(currentEntityType || '')" class="px-5 pb-6">
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <Settings :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">该实体类型（{{ currentEntityType }}）的管理功能正在开发中</p>
          </div>
        </div>
      </main>
    </div>

    <!-- ═══════════════ 全局搜索模态 ═══════════════ -->
    <Transition name="modal">
      <div v-if="searchVisible" class="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeSearch" />
        <div class="relative w-full max-w-lg bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden">
          <div class="flex items-center gap-2 px-4 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <Search :size="16" class="text-apple-gray-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索功能域、实体、参数名..."
              class="flex-1 text-sm bg-transparent border-none outline-none text-apple-gray-900 dark:text-apple-gray-50 placeholder-apple-gray-400"
              autofocus
              @keydown.escape="closeSearch"
            />
            <kbd class="text-[10px] px-1.5 py-0.5 rounded border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-400">esc</kbd>
          </div>
          <div v-if="searchResults.length > 0" class="max-h-64 overflow-y-auto py-1">
            <button
              v-for="item in searchResults" :key="`${item.sectionKey}/${item.subKey}`"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors"
              @click="navigateFromSearch(item.sectionKey, item.subKey)"
            >
              <ChevronRight :size="13" class="text-apple-gray-400" />
              <div>
                <span class="text-apple-gray-900 dark:text-apple-gray-50">{{ item.subLabel }}</span>
                <span class="text-xs text-apple-gray-400 ml-2">{{ item.sectionLabel }}</span>
              </div>
            </button>
          </div>
          <div v-else-if="searchQuery.trim()" class="py-8 text-center text-sm text-apple-gray-400">
            未找到匹配项
          </div>
        </div>
      </div>
    </Transition>

    <!-- ═══════════════ Provider 模态 ═══════════════ -->
    <Transition name="modal">
      <div v-if="providerModalVisible" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeProviderModal" />
        <div class="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div>
              <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ editingProvider ? '编辑提供商' : '添加 LLM 提供商' }}</h3>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">配置 API 端点与密钥</p>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="closeProviderModal"><X :size="18" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto space-y-4">
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">名称 *</label>
              <input v-model="providerForm.name" type="text" :class="inputClass" placeholder="OpenAI / DeepSeek" />
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">API URL *</label>
              <input v-model="providerForm.url" type="text" :class="inputClass" placeholder="https://api.openai.com/v1" />
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">模型列表路径</label>
              <input v-model="providerForm.modelsPath" type="text" :class="inputClass" placeholder="models" />
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">对话 API 路径</label>
              <input v-model="providerForm.chatPath" type="text" :class="inputClass" placeholder="chat/completions" />
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">API Key</label>
              <div class="relative">
                <input v-model="providerForm.apiKey" :type="showApiKey ? 'text' : 'password'" :class="inputClass + ' pr-10'" placeholder="sk-..." />
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200 transition-colors"
                  @click="showApiKey = !showApiKey"
                >
                  <EyeOff v-if="showApiKey" :size="15" />
                  <Eye v-else :size="15" />
                </button>
              </div>
            </div>
            <fieldset class="border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg p-3">
              <legend class="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 px-1">配额设置（0 = 不限制）</legend>
              <div class="grid grid-cols-3 gap-2">
                <div><label class="block text-[11px] text-apple-gray-400 mb-1">每日 Token</label><input v-model.number="providerForm.quotaTokensPerDay" type="number" :class="inputClass + ' !py-1.5'" /></div>
                <div><label class="block text-[11px] text-apple-gray-400 mb-1">每周 Token</label><input v-model.number="providerForm.quotaTokensPerWeek" type="number" :class="inputClass + ' !py-1.5'" /></div>
                <div><label class="block text-[11px] text-apple-gray-400 mb-1">每月 Token</label><input v-model.number="providerForm.quotaTokensPerMonth" type="number" :class="inputClass + ' !py-1.5'" /></div>
              </div>
              <div class="grid grid-cols-3 gap-2 mt-2">
                <div><label class="block text-[11px] text-apple-gray-400 mb-1">每日调用</label><input v-model.number="providerForm.quotaCallsPerDay" type="number" :class="inputClass + ' !py-1.5'" /></div>
                <div><label class="block text-[11px] text-apple-gray-400 mb-1">每周调用</label><input v-model.number="providerForm.quotaCallsPerWeek" type="number" :class="inputClass + ' !py-1.5'" /></div>
                <div><label class="block text-[11px] text-apple-gray-400 mb-1">每月调用</label><input v-model.number="providerForm.quotaCallsPerMonth" type="number" :class="inputClass + ' !py-1.5'" /></div>
              </div>
            </fieldset>
            <div v-if="editingProvider" class="border-t border-apple-gray-200 dark:border-apple-gray-700 pt-3 space-y-2">
              <div class="flex items-center gap-2">
                <button
                  class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-brian-blue/30 text-brian-blue hover:bg-brian-blue/5 transition-colors disabled:opacity-60"
                  :disabled="fetchingModels"
                  @click="handleFetchModels(editingProvider.id)"
                >
                  <Loader2 v-if="fetchingModels" :size="13" class="animate-spin" />
                  <Download v-else :size="13" /> 获取模型列表
                </button>
                <span v-if="cachedModels.length > 0" class="text-[11px] text-apple-gray-400">
                  共 {{ cachedModels.length }} 个，已选 {{ selectedModelIds.size }}
                </span>
              </div>
              <div class="h-52 flex flex-col">
                <div v-if="cachedModels.length === 0 && !fetchingModels" class="flex-1 flex items-center justify-center">
                  <span class="text-[11px] text-apple-gray-400">暂无模型缓存，请点击「获取模型列表」</span>
                </div>
                <template v-else>
                  <div class="space-y-1 mb-2">
                    <div class="relative">
                      <Search :size="13" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-apple-gray-400" />
                      <input v-model="modelSearchQuery" type="text" :class="inputClass + ' !py-1.5 !pl-8'" placeholder="搜索..." />
                    </div>
                    <label class="flex items-center gap-2 px-2 text-[11px] text-apple-gray-400 hover:text-apple-gray-600 cursor-pointer select-none">
                      <input type="checkbox" :checked="filteredCachedModels.filter(m => !m.enabled).length > 0 && selectedModelIds.size === filteredCachedModels.filter(m => !m.enabled).length" @change="selectAllModels" class="rounded" />
                      全选
                    </label>
                  </div>
                  <div class="flex-1 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg divide-y divide-apple-gray-100 dark:divide-apple-gray-700 overflow-y-auto">
                    <label
                      v-for="m in filteredCachedModels"
                      :key="m.id"
                      class="flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors"
                      :class="m.enabled ? 'opacity-40 cursor-not-allowed bg-apple-gray-50 dark:bg-apple-gray-800/50' : 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50'"
                    >
                      <input type="checkbox" :checked="m.enabled || selectedModelIds.has(m.id)" :disabled="m.enabled" @change="toggleModelSelection(m.id)" class="rounded mt-0.5 flex-shrink-0" />
                      <div class="min-w-0">
                        <p class="text-xs font-medium text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ m.name }}</p>
                        <p v-if="m.id !== m.name" class="text-[10px] text-apple-gray-400 font-mono truncate">{{ m.id }}</p>
                      </div>
                    </label>
                  </div>
                  <div v-if="selectedModelIds.size > 0" class="flex items-center justify-end gap-2 pt-2">
                    <select v-model="modelAddType" class="px-2 py-1.5 text-xs rounded-lg border border-apple-gray-200 dark:border-apple-gray-600 bg-transparent text-apple-gray-700 dark:text-apple-gray-300">
                      <option value="text">文本生成 (text)</option>
                      <option value="vision">多模态 (vision)</option>
                      <option value="embedding">向量化 (embedding)</option>
                    </select>
                    <button
                      class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors disabled:opacity-60"
                      :disabled="addingModels"
                      @click="handleAddModels(editingProvider.id)"
                    >
                      <Loader2 v-if="addingModels" :size="12" class="animate-spin" />
                      <Plus v-else :size="12" /> 添加至可用模型 ({{ selectedModelIds.size }})
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="closeProviderModal">取消</button>
            <button class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-60" :disabled="providerSubmitting || !providerForm.name.trim()" @click="submitProviderForm">
              <Loader2 v-if="providerSubmitting" :size="14" class="animate-spin" />
              <Save v-else :size="14" />
              保存
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ═══════════════ Model 模态 ═══════════════ -->
    <Transition name="modal">
      <div v-if="modelModalVisible" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeModelModal" />
        <div class="relative w-full max-w-xl max-h-[85vh] flex flex-col bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div>
              <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ editingModel ? '编辑模型' : '添加模型' }}</h3>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">{{ editingModel ? '模型基本信息（名称和提供商不可修改）' : '添加新的可用模型' }}</p>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="closeModelModal"><X :size="18" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto space-y-4">
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">模型名称</label>
              <input v-model="modelForm.title" type="text" :class="inputClass" :disabled="!!editingModel" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">用途类型</label>
                <select v-model="modelForm.usage" :class="inputClass" :disabled="!!editingModel">
                  <option value="text">文本生成 (text)</option>
                  <option value="vision">多模态 (vision)</option>
                  <option value="embedding">向量化 (embedding)</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">Provider</label>
                <select v-model="modelForm.providerId" :class="inputClass" :disabled="!!editingModel">
                  <option v-for="p in providers" :key="p.id" :value="p.id">{{ p._displayName || p.id }}</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">Max Tokens<span v-if="editingModel" class="text-apple-gray-400 ml-1">(≤ {{ modelForm.providerMaxTokens.toLocaleString() }})</span></label>
              <input v-model.number="modelForm.maxTokens" type="number" :class="inputClass" :max="modelForm.providerMaxTokens || undefined" />
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">简介 (llm_brief)</label>
              <textarea v-model="modelForm.brief" :class="inputClass" rows="2" placeholder="模型简要介绍，参与模型动态选择排名（如：通用对话模型、擅长代码生成）" />
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">模型用途</label>
              <textarea v-model="modelForm.usageDesc" :class="inputClass" rows="3" placeholder="描述模型的典型用途，用于模型动态选择（如：代码生成、长文本写作、数学推理）" />
            </div>

            <!-- 模型测试：根据模型类型调用不同接口 -->
            <div v-if="editingModel" class="border-t border-apple-gray-200 dark:border-apple-gray-700 pt-3">
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">
                模型测试
                <span class="ml-1 text-[11px] font-normal text-apple-gray-400">{{ isEmbeddingModel ? '(向量化 / embedding)' : '(对话补全 / chat)' }}</span>
              </label>
              <textarea
                v-model="modelChatPrompt"
                :class="inputClass"
                rows="2"
                :placeholder="isEmbeddingModel ? '输入文本，调用模型生成向量...' : '输入消息，调用模型查看原始返回结果...'"
                :disabled="modelChatLoading"
              />
              <div class="flex items-center justify-between mt-2">
                <button
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors disabled:opacity-60"
                  :disabled="modelChatLoading || !modelChatPrompt.trim()"
                  @click="sendModelChat"
                >
                  <Loader2 v-if="modelChatLoading" :size="13" class="animate-spin" />
                  <Send v-else :size="13" />
                  {{ modelChatLoading ? '调用中...' : '发送' }}
                </button>
                <span v-if="modelChatResult || modelChatError" class="text-[11px] text-apple-gray-400">
                  <template v-if="isEmbeddingModel">
                    维度 {{ modelChatDimension }} · {{ modelChatMeta.input_tokens }} in · {{ modelChatMeta.duration_ms }}ms
                  </template>
                  <template v-else>
                    {{ modelChatMeta.input_tokens }} in / {{ modelChatMeta.output_tokens }} out · {{ modelChatMeta.duration_ms }}ms
                  </template>
                </span>
              </div>
              <div v-if="modelChatError" class="mt-2 flex items-start gap-1.5 text-xs text-error-red">
                <AlertCircle :size="13" class="shrink-0 mt-0.5" />
                <span class="whitespace-pre-wrap break-words">{{ modelChatError }}</span>
              </div>
              <div v-else-if="modelChatResult" class="mt-2 rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden">
                <div class="flex items-center justify-between px-3 py-1.5 bg-apple-gray-50 dark:bg-apple-gray-900/60 border-b border-apple-gray-200 dark:border-apple-gray-700">
                  <span class="text-[11px] font-medium text-apple-gray-500 dark:text-apple-gray-400">原始响应</span>
                </div>
                <pre class="text-xs text-apple-gray-700 dark:text-apple-gray-300 p-3 whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-mono">{{ formattedModelResult }}</pre>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="closeModelModal">取消</button>
            <button
              v-if="editingModel"
              class="flex items-center justify-center w-9 h-9 rounded-lg text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 transition-colors disabled:opacity-60"
              :disabled="modelAttrLoading || modelSubmitting"
              title="一键补全模型属性"
              @click="autoFillModelAttr"
            >
              <Loader2 v-if="modelAttrLoading" :size="16" class="animate-spin" />
              <Star v-else :size="16" />
            </button>
            <button class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-60" :disabled="modelSubmitting || !modelForm.title.trim()" @click="submitModelForm">
              <Loader2 v-if="modelSubmitting" :size="14" class="animate-spin" />
              <Save v-else :size="14" />
              保存
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ═══════════════ Soul 模态 ═══════════════ -->
    <Transition name="modal">
      <div v-if="soulModalVisible" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeSoulModal" />
        <div class="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div>
              <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ editingSoul ? '编辑 Soul' : '添加 Soul' }}</h3>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">定义 Agent 的人格角色</p>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="closeSoulModal"><X :size="18" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto space-y-4">
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">简要名称 (soul_brief) *</label>
              <input v-model="soulForm.soulBrief" type="text" :class="inputClass" placeholder="例如：严苛导师、幽默伙伴" />
              <p class="text-[10px] text-apple-gray-400 mt-0.5">简短标签，用于 Agent 匹配时的快速筛选</p>
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">人格描述 (soul_content) *</label>
              <textarea v-model="soulForm.soulContent" :class="inputClass" rows="6" placeholder="描述角色性格、语气风格、行为准则、说话方式...&#10;&#10;例如：&#10;你是一位经验丰富的编程导师，说话简洁有力，&#10;从不绕弯子。对代码质量要求严苛，&#10;但会在学生突破后不吝夸奖。" />
              <p class="text-[10px] text-apple-gray-400 mt-0.5">这是 Soul 的核心——定义 Agent 的「人格」。会被注入到 LLM 的 System Prompt 中</p>
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">应用场景 (soul_usage)</label>
              <input v-model="soulForm.soulUsage" type="text" :class="inputClass" placeholder="编程教学、代码审查、技术答疑" />
              <p class="text-[10px] text-apple-gray-400 mt-0.5">可选，描述此 Soul 最适合的应用场景</p>
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="closeSoulModal">取消</button>
            <button class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-60" :disabled="soulSubmitting || !soulForm.soulBrief.trim() || !soulForm.soulContent.trim()" @click="submitSoulForm">
              <Loader2 v-if="soulSubmitting" :size="14" class="animate-spin" />
              <Save v-else :size="14" />
              保存
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ═══════════════ Skill 模态 ═══════════════ -->
    <Transition name="modal">
      <div v-if="skillModalVisible" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeSkillModal" />
        <div class="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div>
              <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ editingSkill ? '编辑 Skill' : '添加 Skill' }}</h3>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">标准构成: name + skill_brief + SKILL.md + scripts/ + references/ + assets/</p>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="closeSkillModal"><X :size="18" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto space-y-4 flex-1">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">
                  Skill 名称 *
                  <span v-if="skillForm.name.length > 10" class="text-error-red">({{ skillForm.name.length }}/10)</span>
                </label>
                <input v-model="skillForm.name" type="text" :class="inputClass" maxlength="20" placeholder="天气预报" />
                <p class="text-[10px] text-apple-gray-400 mt-0.5">≤10 字符，前端展示用</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">简述 (skill_brief) *</label>
                <input v-model="skillForm.skillBrief" type="text" :class="inputClass" placeholder="根据城市名称获取天气信息" />
                <p class="text-[10px] text-apple-gray-400 mt-0.5">简述用途，与 SKILL.md 一起用于 LLM 匹配</p>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">SKILL.md 内容 * <span class="font-normal text-apple-gray-400">— 技能的"大脑"，LLM 筛选的核心线索</span></label>
              <textarea v-model="skillForm.skillMd" :class="[inputClass, 'font-mono text-xs resize-y']" rows="10" placeholder="# 技能名称&#10;&#10;## 何时使用&#10;当用户需要...&#10;&#10;## 如何执行&#10;1. 接收参数...&#10;2. 调用脚本...&#10;3. 返回结果..." />
              <p class="text-[10px] text-apple-gray-400 mt-0.5">Markdown 格式。智能体据此判断何时调用、如何执行此技能</p>
            </div>

            <!-- 文件目录编辑区 -->
            <template v-for="dir in [{key:'scripts',label:'scripts/',icon:'Terminal'},{key:'references',label:'references/',icon:'FileText'},{key:'assets',label:'assets/',icon:'Image'}]" :key="dir.key">
              <div class="border-t border-apple-gray-200 dark:border-apple-gray-700 pt-3">
                <div class="flex items-center justify-between mb-2">
                  <label class="text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300">
                    <component :is="dir.icon === 'Terminal' ? Terminal : dir.icon === 'FileText' ? FileText : Globe" :size="12" class="inline-block mr-1" />
                    {{ dir.label }} <span class="font-normal text-apple-gray-400">({{ (skillForm as any)[dir.key].length }} 个文件)</span>
                  </label>
                  <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-brian-blue hover:bg-brian-blue/10 transition-colors" @click="addFileEntry((skillForm as any)[dir.key])">
                    <Plus :size="11" /> 添加
                  </button>
                </div>
                <div v-if="(skillForm as any)[dir.key].length === 0" class="text-[11px] text-apple-gray-400 py-2">暂无文件</div>
                <div v-for="(file, fi) in (skillForm as any)[dir.key]" :key="fi" class="mb-2 p-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700">
                  <div class="flex items-center gap-2 mb-1.5">
                    <input v-model="file.name" type="text" :class="inputClass + ' !text-xs !py-1'" placeholder="文件名" style="flex:1" />
                    <button class="p-1 text-error-red hover:bg-error-red/10 rounded transition-colors" title="移除" @click="removeFileEntry((skillForm as any)[dir.key], fi)">
                      <Trash2 :size="12" />
                    </button>
                  </div>
                  <textarea v-model="file.content" :class="[inputClass, 'font-mono !text-xs resize-y']" rows="3" placeholder="文件内容..." />
                </div>
              </div>
            </template>
          </div>
          <div class="flex justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="closeSkillModal">取消</button>
            <button class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-60" :disabled="skillSubmitting || !skillForm.name.trim() || skillForm.name.length > 10 || !skillForm.skillMd.trim()" @click="submitSkillForm">
              <Loader2 v-if="skillSubmitting" :size="14" class="animate-spin" />
              <Save v-else :size="14" />
              保存
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ═══════════════ Skill 测试模态 ═══════════════ -->
    <Transition name="modal">
      <div v-if="skillTestModalVisible" class="fixed inset-0 z-[95] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeSkillTestModal" />
        <div class="relative w-full max-w-xl max-h-[85vh] flex flex-col bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div>
              <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">测试 Skill</h3>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">{{ skillTestTarget?.name || '' }}</p>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="closeSkillTestModal"><X :size="18" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto space-y-4 flex-1">
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">测试参数（JSON）</label>
              <textarea v-model="skillTestParams" :class="[inputClass, 'font-mono text-xs resize-y']" rows="4" placeholder='{"a": 1, "b": 2}' />
              <p class="text-[10px] text-apple-gray-400 mt-0.5">JSON 格式，如 {"a":1,"b":2}；空对象 {} 表示无参测试</p>
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">执行结果</label>
              <pre class="text-xs font-mono bg-apple-gray-50 dark:bg-apple-gray-900/50 border border-apple-gray-100 dark:border-apple-gray-700 rounded-lg p-3 min-h-[120px] max-h-[300px] overflow-auto whitespace-pre-wrap break-all text-apple-gray-700 dark:text-apple-gray-300">{{ skillTestResult || '（执行后显示结果）' }}</pre>
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="closeSkillTestModal">关闭</button>
            <button class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-60" :disabled="skillTesting" @click="executeSkillTest">
              <Loader2 v-if="skillTesting" :size="14" class="animate-spin" />
              <FlaskConical v-else :size="14" />
              {{ skillTesting ? '执行中...' : '执行' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ═══════════════ Agent 模态 ═══════════════ -->
    <Transition name="modal">
      <div v-if="agentModalVisible" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeAgentModal" />
        <div class="relative w-full max-w-xl max-h-[85vh] flex flex-col bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div>
              <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ editingAgent ? '编辑 Agent' : '创建 Agent' }}</h3>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">配置 Agent 名称、类型与绑定</p>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="closeAgentModal"><X :size="18" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">Agent 名称 *</label>
                <input v-model="agentForm.name" type="text" :class="inputClass" placeholder="代码审查Agent" />
              </div>
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">Agent 类型 *</label>
                <select v-model="agentForm.type" :class="inputClass">
                  <option value="WORKER">WORKER</option>
                  <option value="PLANNER">PLANNER</option>
                  <option value="WRITER">WRITER</option>
                  <option value="EVOLUTOR">EVOLUTOR</option>
                  <option value="SUMMARY">SUMMARY</option>
                  <option value="INTENT">INTENT</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">描述</label>
              <textarea v-model="agentForm.description" :class="inputClass" rows="2" placeholder="Agent 描述" />
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">执行策略</label>
                <select v-model="agentForm.strategyId" :class="inputClass">
                  <option value="">无</option>
                  <option v-for="s in agentStrategies" :key="s.strategy_id" :value="s.strategy_id">{{ s.strategy_label }}（复杂度 {{ s.suitable_complexity_min }}-{{ s.suitable_complexity_max }}）</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">LLM 模型</label>
                <select v-model="agentForm.llmId" :class="inputClass">
                  <option value="">无</option>
                  <option v-for="m in models" :key="m.id" :value="m.id">{{ m.modelName || m.id }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">Soul 角色</label>
                <select v-model="agentForm.soulId" :class="inputClass">
                  <option value="">无</option>
                  <option v-for="s in souls" :key="s.id" :value="s.id">{{ s.soul_brief || s.id }}</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">任务签名</label>
              <input v-model="agentForm.taskSignature" type="text" :class="inputClass" placeholder="匹配任务复用的签名" />
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="closeAgentModal">取消</button>
            <button class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-60" :disabled="agentSubmitting || !agentForm.name.trim()" @click="submitAgentForm">
              <Loader2 v-if="agentSubmitting" :size="14" class="animate-spin" />
              <Save v-else :size="14" />
              保存
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ═══════════════ Prompt 模板模态 ═══════════════ -->
    <Transition name="modal">
      <div v-if="promptModalVisible" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closePromptModal" />
        <div class="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div>
              <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ editingPrompt ? '编辑 Prompt 模板' : '创建 Prompt 模板' }}</h3>
              <p v-pre class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">使用 {{变量名}} 语法嵌入动态内容</p>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="closePromptModal"><X :size="18" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto space-y-4">
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">模板名称 *</label>
              <input v-model="promptForm.title" type="text" :class="inputClass" placeholder="翻译助手 Prompt" />
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">简介</label>
              <input v-model="promptForm.brief" type="text" :class="inputClass" placeholder="简要说明模板用途" />
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">模板内容 * <span v-pre class="font-normal text-apple-gray-400">（Markdown + {{变量}}）</span></label>
              <textarea v-model="promptForm.template" :class="inputClass" rows="8" :placeholder="promptPlaceholder" />
            </div>
            <div class="flex items-center gap-2">
              <input v-model="promptForm.enabled" type="checkbox" id="prompt-enabled" class="rounded border-apple-gray-300 text-brian-blue focus:ring-brian-blue/30" />
              <label for="prompt-enabled" class="text-xs text-apple-gray-600 dark:text-apple-gray-300">启用</label>
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="closePromptModal">取消</button>
            <button class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-60" :disabled="promptSaving || !promptForm.title.trim() || !promptForm.template.trim()" @click="savePrompt">
              <Loader2 v-if="promptSaving" :size="14" class="animate-spin" />
              <Save v-else :size="14" />
              {{ editingPrompt ? '保存' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Toast -->
    <Transition name="toast">
      <div
        v-if="toastVisible"
        class="fixed top-6 right-6 z-[100] flex items-start gap-3 px-5 py-3.5 rounded-xl shadow-xl border max-w-md"
        :class="toastType === 'error'
          ? 'bg-error-red/10 border-error-red/20 text-error-red'
          : 'bg-success-green/10 border-success-green/20 text-success-green'"
      >
        <AlertCircle v-if="toastType === 'error'" :size="18" class="flex-shrink-0 mt-0.5" />
        <Check v-else :size="18" class="flex-shrink-0 mt-0.5" />
        <span class="text-sm font-medium leading-snug">{{ toastMessage }}</span>
      </div>
    </Transition>

    <!-- ═══════════════ 重置确认弹窗 ═══════════════ -->
    <Transition name="modal">
      <div v-if="showResetConfirm" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="cancelReset" />
        <div class="relative w-full max-w-md bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden">
          <div class="px-6 pt-6 pb-2">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-full bg-error-red/10 flex items-center justify-center flex-shrink-0">
                <AlertCircle :size="22" class="text-error-red" />
              </div>
              <h3 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">确认重置所有配置</h3>
            </div>
            <div class="mb-4 p-4 rounded-xl bg-error-red/5 border border-error-red/15">
              <p class="text-sm text-apple-gray-700 dark:text-apple-gray-300 leading-relaxed">
                此操作将清空所有 5 层共 30+ 个模块的配置数据，恢复为系统默认预设值。
              </p>
              <p class="text-xs text-error-red font-medium mt-3">此操作不可恢复，建议先创建配置快照。</p>
            </div>
          </div>
          <div class="flex justify-end gap-2 px-6 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800/50">
            <button
              class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors"
              @click="cancelReset"
            >取消</button>
            <button
              class="px-4 py-2 text-sm font-medium rounded-lg bg-error-red text-white hover:bg-error-red/90 transition-colors"
              :disabled="configResetting"
              @click="executeReset"
            >
              <RefreshCw :size="14" class="inline mr-1" :class="{ 'animate-spin': configResetting }" />
              {{ configResetting ? '重置中...' : '确认重置' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <CronConfigModal
      :visible="cronModalVisible"
      :expression="editingCronItem ? getCronExpression(editingCronItem) : ''"
      @close="cronModalVisible = false; editingCronItem = null"
      @save="saveCronConfig"
    />

    <!-- ═══════════════ 摘要生成信息类型弹窗 ═══════════════ -->
    <Transition name="modal">
      <div v-if="infoTypesModalVisible" class="fixed inset-0 z-[95] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeInfoTypesModal" />
        <div class="relative w-full max-w-md max-h-[85vh] flex flex-col bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div>
              <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">摘要生成信息类型</h3>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">选择需要生成摘要的信息类型，同一类型不可重复选择</p>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="closeInfoTypesModal"><X :size="18" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto space-y-3">
            <div v-for="(_, i) in infoTypesList" :key="i" class="flex items-center gap-2">
              <select
                v-model="infoTypesList[i]"
                :class="inputClass + ' !py-1.5'"
              >
                <option value="" disabled>请选择信息类型</option>
                <option
                  v-for="t in availableInfoTypesFor(i)"
                  :key="t"
                  :value="t"
                >{{ infoTypeLabel(t) }}</option>
              </select>
              <button
                class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-error-red/10 hover:text-error-red transition-colors shrink-0"
                :disabled="infoTypesList.length <= 1"
                title="删除"
                @click="removeInfoType(i)"
              >
                <Trash2 :size="15" />
              </button>
            </div>
            <button
              class="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-sm font-medium rounded-lg border border-dashed border-apple-gray-300 dark:border-apple-gray-600 text-apple-gray-500 dark:text-apple-gray-400 hover:border-brian-blue/50 hover:text-brian-blue transition-colors"
              :disabled="infoTypesList.length >= INFO_TYPE_OPTIONS.length"
              @click="addInfoType"
            >
              <Plus :size="15" />
              添加信息类型
            </button>
          </div>
          <div class="flex justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="closeInfoTypesModal">取消</button>
            <button
              class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-60"
              :disabled="infoTypesSaving || infoTypesList.every(v => !v.trim())"
              @click="saveInfoTypes"
            >
              <Loader2 v-if="infoTypesSaving" :size="14" class="animate-spin" />
              <Save v-else :size="14" />
              保存
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ═══════════════ 维度优先级顺序弹窗 ═══════════════ -->
    <Transition name="modal">
      <div v-if="priorityOrderModalVisible" class="fixed inset-0 z-[95] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closePriorityOrderModal" />
        <div class="relative w-full max-w-md max-h-[85vh] flex flex-col bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700">
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div>
              <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">维度优先级顺序</h3>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">开关控制采集哪些维度，拖动调整维度编排顺序</p>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors" @click="closePriorityOrderModal"><X :size="18" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto space-y-2">
            <div
              v-for="(row, i) in priorityOrderList"
              :key="row.source"
              class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-colors"
              :class="[
                priorityDragOverIndex === i && priorityDragIndex !== null && priorityDragIndex !== i
                  ? 'border-brian-blue/60 bg-brian-blue/5'
                  : 'border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50/50 dark:bg-apple-gray-900/30',
                row.enabled ? '' : 'opacity-50',
              ]"
              draggable="true"
              @dragstart="onPriorityDragStart(i)"
              @dragover.prevent="onPriorityDragOver(i)"
              @drop.prevent="onPriorityDrop(i)"
              @dragend="onPriorityDragEnd"
            >
              <span class="text-apple-gray-400 dark:text-apple-gray-500 cursor-grab shrink-0">
                <GripVertical :size="16" />
              </span>
              <span class="text-xs font-mono text-apple-gray-400 dark:text-apple-gray-500 w-6 shrink-0">{{ i + 1 }}</span>
              <span class="flex-1 text-sm text-apple-gray-800 dark:text-apple-gray-100">{{ COLLECTION_SOURCE_LABELS[row.source] ?? row.source }}</span>
              <span class="text-[10px] font-mono text-apple-gray-400 dark:text-apple-gray-500">{{ row.source }}</span>
              <button
                class="relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0"
                :class="row.enabled ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                title="采集开关"
                @click="togglePrioritySource(row.source)"
              >
                <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                  :class="row.enabled ? 'translate-x-4' : ''" />
              </button>
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="closePriorityOrderModal">取消</button>
            <button
              class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-60"
              :disabled="priorityOrderSaving || !priorityOrderList.some(r => r.enabled)"
              @click="savePriorityOrder"
            >
              <Loader2 v-if="priorityOrderSaving" :size="14" class="animate-spin" />
              <Save v-else :size="14" />
              保存
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-enter-active { transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
.toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from { opacity: 0; transform: translateX(100%) scale(0.95); }
.toast-leave-to { opacity: 0; transform: translateX(20px) scale(0.95); }

.modal-enter-active { transition: opacity 0.2s ease; }
.modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
