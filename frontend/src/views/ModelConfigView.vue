<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
  Cpu, Globe, Key, Eye, EyeOff, Check,
  Loader2, AlertCircle, Wifi, RefreshCw,
  Sliders, Server,
  Hash, Brain, Edit3, Plus, Trash2,
  ArrowLeft, Search, Settings, Box
} from '@lucide/vue'
import NeuralBackground from '../components/NeuralBackground.vue'
import Header from '../components/Header.vue'
import { useConfigStore } from '../stores/config'
import { configApi } from '../api'

const configStore = useConfigStore()

const modelSubTab = ref<'current' | 'providers'>('current')
const editingModelId = ref<string | null>(null)
const showKeyMap = ref<Record<string, boolean>>({})
const testingProvider = ref<string | null>(null)
const testResult = ref<{ ok: boolean; message: string } | null>(null)
const parsingLimits = ref<Record<string, boolean>>({})
const limitParseRaw = ref<Record<string, string>>({})
const newModelForm = ref({ id: '', name: '', maxTokens: 4096, supportsVision: false, supportsTools: false })
const fetchingModels = ref<Record<string, boolean>>({})
const selectedProviderForModal = ref<string | null>(null)

// Two separate modals
const showProviderModal = ref(false)
const showModelModal = ref(false)
const showDeleteConfirmModal = ref(false)
const deleteTargetProviderId = ref<string | null>(null)

const savedProviderState = ref<Record<string, string>>({})

const columnSearch = ref<Record<string, string>>({})
const activeColumnSearch = ref<string | null>(null)
const selectedOnlineModelIds = ref<Set<string>>(new Set())
const savedModelsForProvider = ref<Record<string, Set<string>>>({})

const toastMessage = ref('')
const toastVisible = ref(false)
const toastType = ref<'success' | 'error'>('success')
const toastNoAutoDismiss = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(message: string, type: 'success' | 'error' = 'error', autoDismiss = true) {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
  toastNoAutoDismiss.value = !autoDismiss
  if (toastTimer) clearTimeout(toastTimer)
  if (autoDismiss) {
    toastTimer = setTimeout(() => { toastVisible.value = false }, 6000)
  }
}

function closeToast() {
  toastVisible.value = false
  if (toastTimer) clearTimeout(toastTimer)
}

interface UserModelRow {
  id: string
  userId: string
  providerId: string
  providerName: string
  modelId: string
  modelName: string
  maxTokens: number
  supportsVision: boolean
  supportsTools: boolean
  quotaTokensPerDay: number
  quotaTokensPerWeek: number
  quotaTokensPerMonth: number
  quotaCallsPerDay: number
  quotaCallsPerWeek: number
  quotaCallsPerMonth: number
  isDefault: boolean
  status: string
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

const fetchModelsResult = ref<{ ok: boolean; message: string } | null>(null)
const userModelRows = ref<UserModelRow[]>([])
const currentConfigId = ref('')
const canFetchModels = computed(() => {
  const p = modalProvider.value
  if (!p) return false
  const apiKey = p.apiKey || ''
  return apiKey.length > 0
})
const modelEditForm = ref({ id: '', name: '', maxTokens: 4096, supportsVision: false, supportsTools: false })
const modelSearchQuery = ref('')
const showAddModelForm = ref(false)
const modelTestResult = ref<Record<string, { ok: boolean; message: string } | null>>({})

// Default rate limits loaded from GET /api/config/defaults
const defaultRateLimits = ref<RateLimits>({
  maxTokensPerDay: 100000,
  maxTokensPerWeek: 500000,
  maxTokensPerMonth: 2000000,
  maxCallsPerDay: 1000,
  maxCallsPerWeek: 5000,
  maxCallsPerMonth: 20000,
})

async function loadDefaultLimits() {
  try {
    const defaults = await fetch('/api/config/defaults').then(r => r.json())
    if (defaults) {
      defaultRateLimits.value = {
        maxTokensPerDay: defaults.dailyTokens ?? 100000,
        maxTokensPerWeek: defaults.weeklyTokens ?? 500000,
        maxTokensPerMonth: defaults.monthlyTokens ?? 2000000,
        maxCallsPerDay: defaults.dailyCalls ?? 1000,
        maxCallsPerWeek: defaults.weeklyCalls ?? 5000,
        maxCallsPerMonth: defaults.monthlyCalls ?? 20000,
      }
    }
  } catch { /* use defaults */ }
}

// Provider-level search
const providerSearchQuery = ref('')
const filteredProviders = computed(() => {
  const q = providerSearchQuery.value.toLowerCase().trim()
  const list = q
    ? configStore.providers.filter(p =>
        p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || (p.type || '').toLowerCase().includes(q)
      )
    : configStore.providers
  return [...list].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.name.localeCompare(b.name)
  })
})

// Model source tracking: IDs that came from API fetch
const fetchedModelIds = ref<Set<string>>(new Set())
const modelListTab = ref<'online' | 'manual'>('online')

const onlineModels = computed(() => {
  const provider = modalProvider.value
  if (!provider) return []
  if (fetchedModelIds.value.size === 0) return provider.models
  return provider.models.filter(m => fetchedModelIds.value.has(m.id))
})

const manualModels = computed(() => {
  const provider = modalProvider.value
  if (!provider) return []
  if (fetchedModelIds.value.size === 0) return []
  return provider.models.filter(m => !fetchedModelIds.value.has(m.id))
})

const filteredOnlineModels = computed(() => {
  if (!modelSearchQuery.value.trim()) return onlineModels.value
  const q = modelSearchQuery.value.toLowerCase().trim()
  return onlineModels.value.filter(m =>
    m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
  )
})

const filteredManualModels = computed(() => {
  if (!modelSearchQuery.value.trim()) return manualModels.value
  const q = modelSearchQuery.value.toLowerCase().trim()
  return manualModels.value.filter(m =>
    m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
  )
})

// ── "当前模型" tab: searchable/sortable table of all configured models ──
const currentModelSearch = ref('')
const currentModelSort = ref<{ key: string; dir: 'asc' | 'desc' }>({ key: 'provider', dir: 'asc' })

async function loadUserModels() {
  const models = await configApi.model.list()
  userModelRows.value = models.map(m => ({
    id: m.id,
    providerId: m.providerId,
    providerName: m.providerName,
    modelId: m.modelId,
    modelName: m.modelName,
    maxTokens: m.maxTokens,
    supportsVision: m.supportsVision,
    supportsTools: m.supportsTools,
    quotaTokensPerDay: m.quotaTokensPerDay ?? defaultRateLimits.value.maxTokensPerDay,
    quotaTokensPerWeek: m.quotaTokensPerWeek ?? defaultRateLimits.value.maxTokensPerWeek,
    quotaTokensPerMonth: m.quotaTokensPerMonth ?? defaultRateLimits.value.maxTokensPerMonth,
    quotaCallsPerDay: m.quotaCallsPerDay ?? defaultRateLimits.value.maxCallsPerDay,
    quotaCallsPerWeek: m.quotaCallsPerWeek ?? defaultRateLimits.value.maxCallsPerWeek,
    quotaCallsPerMonth: m.quotaCallsPerMonth ?? defaultRateLimits.value.maxCallsPerMonth,
    isDefault: m.isDefault,
    status: m.status,
  })) as UserModelRow[]
}

async function handleToggleDefault(row: UserModelRow) {
  if (row.isDefault) {
    try {
      await configApi.model.unsetDefault(row.id)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '解除默认失败', 'error')
      return
    }
  } else {
    try {
      await configApi.model.setDefault(row.id)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '设置默认失败', 'error')
      return
    }
  }
  await loadUserModels()
}

async function handleDeleteModel(row: UserModelRow) {
  if (row.isDefault) {
    showToast('默认模型不允许删除，请先解除默认', 'error')
    return
  }
  try {
    await configApi.model.delete(row.id)
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '删除失败', 'error')
    return
  }
  showToast('模型已删除', 'success')
  await loadUserModels()
}

const sortedModelRows = computed(() => {
  let list = userModelRows.value
  const q = currentModelSearch.value.toLowerCase().trim()
  if (q) {
    list = list.filter(r => (r.providerName || '').toLowerCase().includes(q) || (r.modelName || '').toLowerCase().includes(q) || (r.modelId || '').toLowerCase().includes(q))
  }
  for (const [key, val] of Object.entries(columnSearch.value)) {
    if (!val.trim()) continue
    const v = val.toLowerCase().trim()
    if (key === 'modelId') list = list.filter(r => (r.modelId || '').toLowerCase().includes(v))
    else if (key === 'provider') list = list.filter(r => (r.providerName || '').toLowerCase().includes(v))
    else if (key === 'modelName') list = list.filter(r => (r.modelName || '').toLowerCase().includes(v))
  }
  const { key, dir } = currentModelSort.value
  const mul = dir === 'asc' ? 1 : -1
  list = [...list].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'provider': cmp = (a.providerName || '').localeCompare(b.providerName || ''); break
      case 'modelId': cmp = (a.modelId || '').localeCompare(b.modelId || ''); break
      case 'modelName': cmp = (a.modelName || '').localeCompare(b.modelName || ''); break
      case 'maxTokens': cmp = (a.maxTokens || 0) - (b.maxTokens || 0); break
      case 'tokensPerDay': cmp = (a.quotaTokensPerDay || 0) - (b.quotaTokensPerDay || 0); break
      case 'callsPerDay': cmp = (a.quotaCallsPerDay || 0) - (b.quotaCallsPerDay || 0); break
      default: cmp = 0
    }
    return cmp * mul
  })
  return list
})

function toggleColumnSearch(key: string) {
  if (activeColumnSearch.value === key) {
    activeColumnSearch.value = null
  } else {
    activeColumnSearch.value = key
  }
}

function toggleOnlineModelSelect(modelId: string) {
  const s = new Set(selectedOnlineModelIds.value)
  if (s.has(modelId)) {
    s.delete(modelId)
  } else {
    s.add(modelId)
  }
  selectedOnlineModelIds.value = s
}

const allOnlineModelsSelected = computed(() => {
  const ids = filteredOnlineModels.value.map(m => m.id)
  return ids.length > 0 && ids.every(id => selectedOnlineModelIds.value.has(id))
})

function toggleAllOnlineModels() {
  if (allOnlineModelsSelected.value) {
    selectedOnlineModelIds.value = new Set()
  } else {
    selectedOnlineModelIds.value = new Set(filteredOnlineModels.value.map(m => m.id))
  }
}

function startEditModel(modelId: string) {
  if (editingModelId.value === modelId) {
    editingModelId.value = null
    return
  }
  const provider = configStore.providers.find(p => p.id === selectedProviderForModal.value)
  const model = provider?.models.find(m => m.id === modelId)
  if (model) {
    modelEditForm.value = {
      id: model.id,
      name: model.name,
      maxTokens: model.maxTokens,
      supportsVision: model.supportsVision,
      supportsTools: model.supportsTools,
    }
    editingModelId.value = modelId
  }
}

function cancelModelEdit() {
  editingModelId.value = null
}

async function saveModelEdit() {
  if (!editingModelId.value || !selectedProviderForModal.value) return
  const pid = selectedProviderForModal.value
  const provider = configStore.providers.find(p => p.id === pid)
  if (!provider) return
  const form = modelEditForm.value
  await configStore.updateProvider(pid, {
    models: provider.models.map(m =>
      m.id === editingModelId.value
        ? { ...m, id: form.id, name: form.name, maxTokens: form.maxTokens, supportsVision: form.supportsVision, supportsTools: form.supportsTools }
        : m
    )
  })
  if (configStore.selectedModelId === editingModelId.value) {
    configStore.selectedModelId = form.id
  }
  editingModelId.value = null
}

async function verifySingleModel(providerId: string, modelId: string) {
  modelTestResult.value[modelId] = null
  try {
    const resp = await fetch(`/api/config/verify/${providerId}?model=${encodeURIComponent(modelId)}`, { method: 'POST' })
    const result = await resp.json()
    modelTestResult.value[modelId] = result
    if (!result.ok) {
      showToast(result.message, 'error')
    }
    setTimeout(() => { modelTestResult.value[modelId] = null }, 8000)
  } catch (e: unknown) {
    const msg = (e as Error).message || '验证失败'
    modelTestResult.value[modelId] = { ok: false, message: msg }
    showToast(msg, 'error')
    setTimeout(() => { modelTestResult.value[modelId] = null }, 8000)
  }
}

onMounted(() => {
  configStore.loadFromServer().then(() => loadUserModels())
  loadDefaultLimits()
})

interface RateLimits {
  maxTokensPerDay: number
  maxTokensPerWeek: number
  maxTokensPerMonth: number
  maxCallsPerDay: number
  maxCallsPerWeek: number
  maxCallsPerMonth: number
}
const rateLimits = ref<Record<string, RateLimits>>({})

function getRateLimit(providerId: string): RateLimits {
  if (!rateLimits.value[providerId]) {
    rateLimits.value[providerId] = {
      maxTokensPerDay: defaultRateLimits.value.maxTokensPerDay,
      maxTokensPerWeek: defaultRateLimits.value.maxTokensPerWeek,
      maxTokensPerMonth: defaultRateLimits.value.maxTokensPerMonth,
      maxCallsPerDay: defaultRateLimits.value.maxCallsPerDay,
      maxCallsPerWeek: defaultRateLimits.value.maxCallsPerWeek,
      maxCallsPerMonth: defaultRateLimits.value.maxCallsPerMonth,
    }
  }
  return rateLimits.value[providerId]
}

function toggleKeyVisibility(id: string) { showKeyMap.value[id] = !showKeyMap.value[id] }
function isKeyVisible(id: string): boolean { return !!showKeyMap.value[id] }

function handleApiKeyChange(providerId: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  configStore.updateProvider(providerId, { apiKey: value })
}

function handleBaseUrlChange(providerId: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  configStore.updateProvider(providerId, { baseUrl: value })
}

async function handleTestConnection(providerId: string) {
  testingProvider.value = providerId
  testResult.value = null
  const provider = configStore.providers.find(p => p.id === providerId)
  if (!provider) { testingProvider.value = null; return }

  try {
    await configApi.provider.update(providerId, {
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      enabled: provider.enabled,
    })
  } catch (e: unknown) {
    testResult.value = { ok: false, message: e instanceof Error ? e.message : '保存配置失败' }
    showToast(e instanceof Error ? e.message : '保存配置失败', 'error')
    testingProvider.value = null
    return
  }

  let modelId: string | undefined
  if (configStore.selectedProviderId === providerId) {
    modelId = configStore.selectedModelId
  } else if (fetchedModelIds.value.size > 0) {
    const fetchedModel = provider?.models.find(m => fetchedModelIds.value.has(m.id))
    modelId = fetchedModel?.id
  }
  try {
    const result = await configStore.verifyProvider(providerId, modelId)
    testResult.value = result
    if (!result.ok) {
      showToast(result.message, 'error')
    }
  } catch (e: unknown) {
    testResult.value = { ok: false, message: (e as Error).message || '连接失败' }
    showToast((e as Error).message || '连接失败', 'error')
  }
  testingProvider.value = null
}

async function handleAiParseLimits(providerId: string) {
  const raw = limitParseRaw.value[providerId] || ''
  if (!raw.trim()) return
  parsingLimits.value[providerId] = true
  try {
    const systemPrompt = '你是一个 API 限制解析器。用户会粘贴模型厂商的速率限制说明文字。请提取其中的限制信息并以 JSON 格式返回。JSON 格式为: { "maxTokensPerDay": number, "maxTokensPerWeek": number, "maxTokensPerMonth": number, "maxCallsPerDay": number, "maxCallsPerWeek": number, "maxCallsPerMonth": number }。如果某项未提及则填 0。只返回 JSON，不要其他文字。'
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `${systemPrompt}\n\n${raw}`,
      }),
    })
    const data = await resp.json()
    const content = data.message?.content || ''
    if (content) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          const limits = getRateLimit(providerId)
          if (parsed.maxTokensPerDay !== undefined) limits.maxTokensPerDay = Number(parsed.maxTokensPerDay) || 0
          if (parsed.maxTokensPerWeek !== undefined) limits.maxTokensPerWeek = Number(parsed.maxTokensPerWeek) || 0
          if (parsed.maxTokensPerMonth !== undefined) limits.maxTokensPerMonth = Number(parsed.maxTokensPerMonth) || 0
          if (parsed.maxCallsPerDay !== undefined) limits.maxCallsPerDay = Number(parsed.maxCallsPerDay) || 0
          if (parsed.maxCallsPerWeek !== undefined) limits.maxCallsPerWeek = Number(parsed.maxCallsPerWeek) || 0
          if (parsed.maxCallsPerMonth !== undefined) limits.maxCallsPerMonth = Number(parsed.maxCallsPerMonth) || 0
        }
      } catch { /* keep manual values */ }
    }
  } catch { /* keep manual values */ }
  parsingLimits.value[providerId] = false
}

function handleLimitChange(providerId: string, field: keyof RateLimits, event: Event) {
  const limits = getRateLimit(providerId)
  limits[field] = Number((event.target as HTMLInputElement).value) || 0
}

function addCustomModel(providerId: string) {
  if (!newModelForm.value.name || !newModelForm.value.id) return
  configStore.addCustomModel(providerId, {
    id: newModelForm.value.id,
    name: newModelForm.value.name,
    maxTokens: newModelForm.value.maxTokens || 4096,
    supportsVision: newModelForm.value.supportsVision || false,
    supportsTools: newModelForm.value.supportsTools || false,
  })
  newModelForm.value = { id: '', name: '', maxTokens: 4096, supportsVision: false, supportsTools: false }
}

function removeModel(providerId: string, modelId: string) {
  configStore.removeCustomModel(providerId, modelId)
}

async function fetchModelsFromApi(providerId: string) {
  fetchingModels.value[providerId] = true
  fetchModelsResult.value = null
  try {
    const p = configStore.providers.find(x => x.id === providerId)
    if (!p) { fetchingModels.value[providerId] = false; return }

    try {
      await configApi.provider.update(providerId, {
        name: p.name,
        type: p.type,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        enabled: p.enabled,
      })
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '保存配置失败', 'error', false)
      fetchingModels.value[providerId] = false
      return
    }

    const result = await configApi.provider.fetchModels(providerId)
    fetchModelsResult.value = { ok: result.code === 200, message: result.msg }

    if (result.code === 200 && result.models) {
      const models = result.models
      const apiIds = new Set(models.map((m) => m.id))
      fetchedModelIds.value = apiIds
      if (p) {
        p.models = models.map((m) => ({
          id: m.id,
          name: m.name,
          maxTokens: m.maxTokens,
          supportsVision: m.supportsVision,
          supportsTools: m.supportsTools,
        }))
      }
      modelListTab.value = 'online'
    } else {
      showToast(`[DEBUG] code=${result.code} msg=${result.msg} content=${result.content}`, 'error', false)
    }
  } catch (e: unknown) {
    fetchModelsResult.value = { ok: false, message: '获取失败' }
    showToast((e as Error).message || '获取失败', 'error', false)
  } finally {
    fetchingModels.value[providerId] = false
  }
}

async function loadProviderModels(providerId: string) {
  const config = configStore.providers.find(p => p.id === providerId)
  if (!config?.id) return
  currentConfigId.value = config.id
  try {
    const result = await configApi.provider.models(providerId)
    const models = result.models || []
    const prov = configStore.providers.find(p => p.id === providerId)
    if (prov) {
      prov.models = models.map((m) => ({
        id: m.id,
        name: m.name,
        maxTokens: m.maxTokens,
        supportsVision: m.supportsVision,
        supportsTools: m.supportsTools,
      }))
    }
  } catch {
    // ignore
  }
}

// ── 添加模型提供商弹窗 ──
const showAddProviderModal = ref(false)
const addingProvider = ref(false)
const newProviderForm = ref({
  name: '',
  type: 'openai',
  baseUrl: '',
  apiKey: '',
  enabled: true,
})

const providerTypeOptions = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google Gemini' },
]

function closeAddProviderModal() {
  showAddProviderModal.value = false
  newProviderForm.value = { name: '', type: 'openai', baseUrl: '', apiKey: '', enabled: true }
}

async function confirmAddProvider() {
  const form = newProviderForm.value
  if (!form.name.trim()) {
    showToast('请输入提供商名称', 'error')
    return
  }
  if (!form.baseUrl.trim()) {
    showToast('请输入 API 地址', 'error')
    return
  }

  addingProvider.value = true
  const id = form.name.trim().toLowerCase().replace(/\s+/g, '-')
  try {
    await configApi.provider.create({
      id,
      name: form.name.trim(),
      type: form.type,
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
    })
    addingProvider.value = false
    showToast('提供商添加成功', 'success')
    closeAddProviderModal()
  } catch (e: unknown) {
    addingProvider.value = false
    showToast(e instanceof Error ? e.message : '添加失败', 'error')
  }
}

function resetProviderState(providerId: string) {
  const saved = savedProviderState.value[providerId]
  if (saved) {
    const parsed = JSON.parse(saved)
    configStore.updateProvider(providerId, {
      baseUrl: parsed.baseUrl,
      apiKey: parsed.apiKey,
      models: parsed.models,
    })
    if (parsed.rateLimits) {
      rateLimits.value[providerId] = { ...parsed.rateLimits }
    }
  }
}

const savingProvider = ref(false)

// ── Save provider config only (API key, base URL, enabled, rate limits) ──
async function saveProviderConfig() {
  if (savingProvider.value) return
  savingProvider.value = true
  const providerId = selectedProviderForModal.value
  if (!providerId) { savingProvider.value = false; return }
  try {
    const p = configStore.providers.find(x => x.id === providerId)
    if (!p) { savingProvider.value = false; return }

    await configApi.provider.update(providerId, {
      name: p.name,
      type: p.type,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      enabled: p.enabled,
    })

    showToast('提供商配置已保存', 'success')
    closeProviderModal()
    await loadUserModels()
  } catch (e: unknown) {
    showToast((e as Error).message || '保存失败', 'error')
  } finally {
    savingProvider.value = false
  }
}

// ── Save model config only (batch save selected models) ──
const savingModels = ref(false)

async function saveModelConfig() {
  if (savingModels.value) return
  savingModels.value = true
  const providerId = selectedProviderForModal.value
  if (!providerId) { savingModels.value = false; return }
  try {
    const selectedModels = Array.from(selectedOnlineModelIds.value)
    await configApi.model.batchSave({ providerId, modelIds: selectedModels })
    savedModelsForProvider.value[providerId] = new Set(selectedModels)
    showToast('模型配置已保存', 'success')
    closeModelModal()
    await loadUserModels()
  } catch (e: unknown) {
    showToast((e as Error).message || '保存失败', 'error')
  } finally {
    savingModels.value = false
  }
}

// ── Open provider config modal ──
async function openProviderModal(providerId: string) {
  const p = configStore.providers.find(x => x.id === providerId)
  if (p) {
    savedProviderState.value[providerId] = JSON.stringify({
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      models: p.models,
      rateLimits: getRateLimit(providerId),
    })
  }
  selectedProviderForModal.value = providerId
  showProviderModal.value = true
  testResult.value = null
}

function closeProviderModal() {
  showProviderModal.value = false
  selectedProviderForModal.value = null
  testResult.value = null
}

// ── Open model config modal ──
async function openModelModal(providerId: string) {
  const p = configStore.providers.find(x => x.id === providerId)
  if (p) {
    savedProviderState.value[providerId] = JSON.stringify({
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      models: p.models,
      rateLimits: getRateLimit(providerId),
    })
  }
  selectedProviderForModal.value = providerId
  showModelModal.value = true
  fetchModelsResult.value = null
  modelSearchQuery.value = ''
  // Load models from DB
  await loadProviderModels(providerId)
}

function closeModelModal() {
  showModelModal.value = false
  selectedProviderForModal.value = null
  fetchModelsResult.value = null
}

async function handleDeleteProvider(providerId: string) {
  deleteTargetProviderId.value = providerId
  showDeleteConfirmModal.value = true
}

async function confirmDeleteProvider() {
  if (!deleteTargetProviderId.value) return
  const providerId = deleteTargetProviderId.value
  showDeleteConfirmModal.value = false
  try {
    await configApi.provider.delete(providerId)
    closeProviderModal()
    closeModelModal()
  } catch (e: unknown) {
    showToast('删除失败: ' + (e instanceof Error ? e.message : '未知错误'), 'error')
  }
  deleteTargetProviderId.value = null
}

function closeDeleteConfirmModal() {
  showDeleteConfirmModal.value = false
  deleteTargetProviderId.value = null
}

const modalProvider = computed(() =>
  configStore.providers.find(p => p.id === selectedProviderForModal.value)
)

function isProviderConfigured(providerId: string): boolean {
  const p = configStore.providers.find(x => x.id === providerId)
  return !!(p && p.enabled && p.apiKey)
}

function hasModelsConfigured(providerId: string): boolean {
  const saved = savedModelsForProvider.value[providerId]
  if (saved && saved.size > 0) return true
  const p = configStore.providers.find(x => x.id === providerId)
  if (!p) return false
  return userModelRows.value.some(r => r.providerName === p.name)
}
</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative">
    <NeuralBackground />
    <Header />
    <div class="pt-16 h-full relative z-10">
      <div class="h-full flex flex-col">
        <div class="flex items-center gap-3 px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-950/80 backdrop-blur-md flex-shrink-0">
          <div class="p-2 bg-brian-blue/10 rounded-lg">
            <Cpu :size="20" class="text-brian-blue" />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">模型管理</h2>
            <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">管理模型提供商与配置</p>
          </div>
        </div>

        <div class="flex items-center gap-1 px-5 py-3 border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-white/50 dark:bg-apple-gray-950/50 flex-shrink-0">
          <button
            :class="['flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              modelSubTab === 'current' ? 'bg-white dark:bg-apple-gray-800 text-brian-blue shadow-sm' : 'text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300']"
            @click="modelSubTab = 'current'"
          >
            <Sliders :size="14" />当前配置
          </button>
          <button
            :class="['flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              modelSubTab === 'providers' ? 'bg-white dark:bg-apple-gray-800 text-brian-blue shadow-sm' : 'text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300']"
            @click="modelSubTab = 'providers'"
          >
            <Server :size="14" />模型列表
          </button>
        </div>

        <div v-if="!configStore.isLoaded" class="flex items-center justify-center py-20">
          <Loader2 :size="24" class="animate-spin text-brian-blue" />
        </div>

        <!-- ═══════════════ 当前配置 Tab ═══════════════ -->
        <div v-if="modelSubTab === 'current' && configStore.isLoaded" class="flex-1 flex flex-col overflow-hidden p-4">
          <div class="flex items-center gap-3 mb-4 flex-shrink-0 flex-wrap">
            <div class="flex-1 min-w-[200px] relative">
              <input v-model="currentModelSearch" placeholder="搜索模型、提供商或 ID..."
                class="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-300 dark:border-apple-gray-600 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all shadow-sm" />
              <Search :size="15" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
            </div>
            <span class="text-xs text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-800 px-2.5 py-1 rounded-full">{{ sortedModelRows.length }} 个模型</span>
            <button class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue/10 text-brian-blue rounded-lg hover:bg-brian-blue/20 transition-colors" @click="loadUserModels">
              <RefreshCw :size="12" /> 刷新
            </button>
          </div>

          <div v-if="userModelRows.length === 0" class="flex-1 flex flex-col items-center justify-center glass-panel rounded-xl p-12 text-center">
            <div class="p-4 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-full inline-flex mb-4">
              <Cpu :size="32" class="text-apple-gray-400" />
            </div>
            <h3 class="text-lg font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-2">暂无已配置的模型</h3>
            <p class="text-sm text-apple-gray-400 mb-6">请在"模型列表"中配置模型后再使用对话功能</p>
            <button class="px-6 py-2.5 bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors" @click="modelSubTab = 'providers'">
              去配置
            </button>
          </div>

          <div v-else class="glass-panel rounded-xl overflow-hidden flex-1 flex flex-col">
            <div class="overflow-y-auto overflow-x-auto flex-1">
              <table class="w-full text-sm">
                <thead class="bg-apple-gray-50 dark:bg-apple-gray-800 sticky top-0 z-10">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-apple-gray-500 whitespace-nowrap align-top">
                      <div class="flex items-center gap-1">
                        <span>模型 ID</span>
                        <div class="flex items-center">
                          <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 text-xs leading-none" :class="currentModelSort.key === 'modelId' && currentModelSort.dir === 'asc' ? 'text-brian-blue' : 'text-apple-gray-400'" @click="currentModelSort = { key: 'modelId', dir: 'asc' }">↑</button>
                          <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 text-xs leading-none" :class="currentModelSort.key === 'modelId' && currentModelSort.dir === 'desc' ? 'text-brian-blue' : 'text-apple-gray-400'" @click="currentModelSort = { key: 'modelId', dir: 'desc' }">↓</button>
                        </div>
                        <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700" @click.stop="toggleColumnSearch('modelId')">
                          <Search :size="11" class="text-apple-gray-400" />
                        </button>
                      </div>
                      <div v-if="activeColumnSearch === 'modelId'" class="mt-1" @click.stop>
                        <input v-model="columnSearch['modelId']" placeholder="搜索..."
                          class="w-full px-1.5 py-0.5 text-[10px] rounded bg-apple-gray-100 dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
                      </div>
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-apple-gray-500 whitespace-nowrap align-top">
                      <div class="flex items-center gap-1">
                        <span>提供商</span>
                        <div class="flex items-center">
                          <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 text-xs leading-none" :class="currentModelSort.key === 'provider' && currentModelSort.dir === 'asc' ? 'text-brian-blue' : 'text-apple-gray-400'" @click="currentModelSort = { key: 'provider', dir: 'asc' }">↑</button>
                          <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 text-xs leading-none" :class="currentModelSort.key === 'provider' && currentModelSort.dir === 'desc' ? 'text-brian-blue' : 'text-apple-gray-400'" @click="currentModelSort = { key: 'provider', dir: 'desc' }">↓</button>
                        </div>
                        <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700" @click.stop="toggleColumnSearch('provider')">
                          <Search :size="11" class="text-apple-gray-400" />
                        </button>
                      </div>
                      <div v-if="activeColumnSearch === 'provider'" class="mt-1" @click.stop>
                        <input v-model="columnSearch['provider']" placeholder="搜索..."
                          class="w-full px-1.5 py-0.5 text-[10px] rounded bg-apple-gray-100 dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
                      </div>
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-apple-gray-500 whitespace-nowrap align-top">
                      <div class="flex items-center gap-1">
                        <span>模型名称</span>
                        <div class="flex items-center">
                          <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 text-xs leading-none" :class="currentModelSort.key === 'modelName' && currentModelSort.dir === 'asc' ? 'text-brian-blue' : 'text-apple-gray-400'" @click="currentModelSort = { key: 'modelName', dir: 'asc' }">↑</button>
                          <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 text-xs leading-none" :class="currentModelSort.key === 'modelName' && currentModelSort.dir === 'desc' ? 'text-brian-blue' : 'text-apple-gray-400'" @click="currentModelSort = { key: 'modelName', dir: 'desc' }">↓</button>
                        </div>
                        <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700" @click.stop="toggleColumnSearch('modelName')">
                          <Search :size="11" class="text-apple-gray-400" />
                        </button>
                      </div>
                      <div v-if="activeColumnSearch === 'modelName'" class="mt-1" @click.stop>
                        <input v-model="columnSearch['modelName']" placeholder="搜索..."
                          class="w-full px-1.5 py-0.5 text-[10px] rounded bg-apple-gray-100 dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
                      </div>
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-apple-gray-500 whitespace-nowrap align-top">
                      <div class="flex items-center gap-1">
                        <span>参数</span>
                        <div class="flex items-center">
                          <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 text-xs leading-none" :class="currentModelSort.key === 'maxTokens' && currentModelSort.dir === 'asc' ? 'text-brian-blue' : 'text-apple-gray-400'" @click="currentModelSort = { key: 'maxTokens', dir: 'asc' }">↑</button>
                          <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 text-xs leading-none" :class="currentModelSort.key === 'maxTokens' && currentModelSort.dir === 'desc' ? 'text-brian-blue' : 'text-apple-gray-400'" @click="currentModelSort = { key: 'maxTokens', dir: 'desc' }">↓</button>
                        </div>
                      </div>
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-apple-gray-500 whitespace-nowrap align-top">
                      限制配额
                    </th>
                    <th class="px-4 py-3 text-right text-xs font-medium text-apple-gray-500 whitespace-nowrap align-top">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
                  <tr v-for="row in sortedModelRows" :key="row.modelId"
                    class="hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/30 transition-colors"
                    :class="configStore.selectedProviderId === row.providerId && configStore.selectedModelId === row.modelId ? 'bg-brian-blue/5' : ''">
                    <td class="px-4 py-3">
                      <code class="text-xs font-mono bg-apple-gray-100 dark:bg-apple-gray-800 px-1.5 py-0.5 rounded">{{ row.modelId }}</code>
                      <span v-if="row.isDefault" class="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-brian-blue/10 text-brian-blue">默认</span>
                    </td>
                    <td class="px-4 py-3 text-apple-gray-700 dark:text-apple-gray-300">{{ row.providerName }}</td>
                    <td class="px-4 py-3">
                      <span class="font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ row.modelName }}</span>
                      <div class="text-xs text-apple-gray-400 mt-0.5">{{ row.maxTokens?.toLocaleString() }} tokens</div>
                    </td>
                    <td class="px-4 py-3 text-xs text-apple-gray-500">{{ row.maxTokens?.toLocaleString() }} tokens</td>
                    <td class="px-4 py-3 text-xs text-apple-gray-500">
                      <div class="space-y-0.5">
                        <div>每日 {{ (row.quotaTokensPerDay || 0).toLocaleString() }} tokens / {{ (row.quotaCallsPerDay || 0).toLocaleString() }} 次</div>
                        <div>每周 {{ (row.quotaTokensPerWeek || 0).toLocaleString() }} tokens / {{ (row.quotaCallsPerWeek || 0).toLocaleString() }} 次</div>
                        <div>每月 {{ (row.quotaTokensPerMonth || 0).toLocaleString() }} tokens / {{ (row.quotaCallsPerMonth || 0).toLocaleString() }} 次</div>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-right">
                      <div class="flex items-center justify-end gap-1">
                        <button
                          class="px-2.5 py-1 text-xs rounded font-medium transition-colors"
                          :class="row.isDefault
                            ? 'bg-warning-orange/10 text-warning-orange hover:bg-warning-orange/20'
                            : 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-500 hover:bg-apple-gray-300 dark:hover:bg-apple-gray-600'"
                          @click="handleToggleDefault(row)">
                          {{ row.isDefault ? '解除默认' : '设为默认' }}
                        </button>
                        <button
                          class="px-2.5 py-1 text-xs rounded font-medium bg-red-50 dark:bg-red-900/20 text-error-red hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                          @click="handleDeleteModel(row)">
                          删除
                        </button>
                        <span v-if="configStore.selectedProviderId === row.providerId && configStore.selectedModelId === row.modelId" class="px-2.5 py-1 text-xs rounded font-medium bg-brian-blue text-white">当前</span>
                        <button class="p-1.5 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" title="管理" @click="openModelModal(row.providerId)">
                          <Edit3 :size="13" class="text-apple-gray-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ═══════════════ 模型列表 Tab ═══════════════ -->
        <div v-if="modelSubTab === 'providers' && configStore.isLoaded" class="flex-1 flex flex-col overflow-hidden p-4">
          <div class="flex items-center justify-between mb-4 flex-shrink-0 flex-wrap gap-3">
            <div class="flex-1 min-w-[200px] relative">
              <input v-model="providerSearchQuery" placeholder="搜索供应商名称或类型..."
                class="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-300 dark:border-apple-gray-600 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all shadow-sm" />
              <Search :size="15" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-apple-gray-400">{{ filteredProviders.length }} / {{ configStore.providers.length }} 个</span>
              <button
                class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors"
                @click="showAddProviderModal = true"
              >
                <Plus :size="16" /> 添加模型提供商
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto scrollbar-hide flex-1">
            <div
              v-for="provider in filteredProviders"
              :key="provider.id"
              class="glass-panel rounded-2xl p-6 hover:shadow-lg hover:shadow-brian-blue/5 hover:-translate-y-0.5 transition-all duration-300 group border border-apple-gray-200/50 dark:border-apple-gray-700/50"
            >
              <div class="flex items-start justify-between mb-4">
                <div :class="[
                  'w-14 h-14 rounded-xl flex items-center justify-center transition-colors',
                  isProviderConfigured(provider.id)
                    ? 'bg-brian-blue/10 group-hover:bg-brian-blue/20'
                    : 'bg-apple-gray-100 dark:bg-apple-gray-800 group-hover:bg-apple-gray-200 dark:group-hover:bg-apple-gray-700'
                ]">
                  <Server :size="24" :class="[
                    'transition-colors',
                    isProviderConfigured(provider.id)
                      ? 'text-brian-blue'
                      : 'text-apple-gray-500 dark:text-apple-gray-400'
                  ]" />
                </div>
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-1.5" :title="isProviderConfigured(provider.id) ? '提供商已配置且启用' : '提供商未配置或未启用'">
                    <div :class="['w-2.5 h-2.5 rounded-full transition-colors', isProviderConfigured(provider.id) ? 'bg-success-green' : 'bg-warning-orange']" />
                    <span class="text-[10px] text-apple-gray-400">提供商</span>
                  </div>
                  <div class="flex items-center gap-1.5" :title="hasModelsConfigured(provider.id) ? '模型已配置' : '模型未配置'">
                    <div :class="['w-2.5 h-2.5 rounded-full transition-colors', hasModelsConfigured(provider.id) ? 'bg-success-green' : 'bg-warning-orange']" />
                    <span class="text-[10px] text-apple-gray-400">模型</span>
                  </div>
                </div>
              </div>
              <div class="mb-3">
                <p class="text-base font-semibold text-apple-gray-900 dark:text-apple-gray-50 mb-1">{{ provider.name }}</p>
                <p class="text-xs text-apple-gray-400">{{ provider.type || 'API Provider' }}</p>
                <p class="text-xs text-apple-gray-400 mt-1 truncate" :title="provider.baseUrl">{{ provider.baseUrl }}</p>
              </div>
              <div class="flex items-center gap-3 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-800">
                <div class="flex items-center gap-3 text-xs text-apple-gray-400 flex-1">
                  <span>{{ provider.models.length }} 个模型</span>
                  <span class="w-1 h-1 rounded-full bg-apple-gray-300 dark:bg-apple-gray-600"></span>
                  <span>{{ provider.enabled ? '已启用' : '已禁用' }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                    :class="isProviderConfigured(provider.id)
                      ? 'text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
                      : 'text-brian-blue bg-brian-blue/5 hover:bg-brian-blue/10'"
                    @click.stop="openProviderModal(provider.id)"
                  >
                    <Settings :size="13" /> 提供商配置
                  </button>
                  <button
                    class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                    :class="hasModelsConfigured(provider.id)
                      ? 'text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
                      : 'text-brian-blue bg-brian-blue/5 hover:bg-brian-blue/10'"
                    @click.stop="openModelModal(provider.id)"
                  >
                    <Box :size="13" /> 模型配置
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════ 提供商配置弹窗 ═══════════════ -->
    <Transition name="fade">
      <div v-if="showProviderModal && modalProvider" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeProviderModal" />
        <div class="relative w-[640px] max-h-[560px] flex flex-col bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 mx-4 overflow-hidden">
          <!-- Header -->
          <div class="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-brian-blue/10 flex items-center justify-center">
                <Settings :size="20" class="text-brian-blue" />
              </div>
              <div>
                <h2 class="text-base font-semibold">提供商配置 - {{ modalProvider.name }}</h2>
                <p class="text-xs text-apple-gray-400">{{ modalProvider.type }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5" :title="isProviderConfigured(modalProvider.id) ? '提供商已配置且启用' : '提供商未配置或未启用'">
                <div :class="['w-2.5 h-2.5 rounded-full', isProviderConfigured(modalProvider.id) ? 'bg-success-green' : 'bg-warning-orange']" />
                <span class="text-xs text-apple-gray-400">提供商</span>
              </div>
              <button class="p-2 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="closeProviderModal">
                <ArrowLeft :size="18" class="text-apple-gray-400 rotate-180" />
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="flex-1 min-h-0 overflow-y-auto p-6 space-y-5 scrollbar-hide">
            <!-- Enable/disable toggle -->
            <div>
              <label class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2 block">启用状态</label>
              <div class="flex items-center justify-between glass-panel rounded-lg px-4 py-3">
                <span class="text-sm text-apple-gray-600 dark:text-apple-gray-400">启用此供应商</span>
                <button
                  :class="['w-12 h-7 rounded-full transition-colors relative', modalProvider.enabled ? 'bg-brian-blue' : 'bg-apple-gray-300']"
                  @click="configStore.updateProvider(modalProvider.id, { enabled: !modalProvider.enabled })"
                >
                  <div :class="['w-5 h-5 rounded-full bg-white absolute top-1 transition-transform', modalProvider.enabled ? 'translate-x-6' : 'translate-x-1']" />
                </button>
              </div>
            </div>

            <!-- API Key -->
            <div>
              <label class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2 block">API Key</label>
              <div class="flex items-center gap-3">
                <Key :size="16" class="text-apple-gray-400 flex-shrink-0" />
                <div class="flex-1 relative">
                  <input :value="modalProvider.apiKey"
                    :type="isKeyVisible(modalProvider.id) ? 'text' : 'password'" placeholder="sk-..."
                    class="w-full pl-4 pr-12 py-2.5 bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg text-sm outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all"
                    @input="handleApiKeyChange(modalProvider.id, $event)" />
                  <button class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="toggleKeyVisibility(modalProvider.id)">
                    <EyeOff v-if="isKeyVisible(modalProvider.id)" :size="16" class="text-apple-gray-400" />
                    <Eye v-else :size="16" class="text-apple-gray-400" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Base URL -->
            <div>
              <label class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2 block">API 地址</label>
              <div class="flex items-center gap-3">
                <Globe :size="16" class="text-apple-gray-400 flex-shrink-0" />
                <input :value="modalProvider.baseUrl" type="text" placeholder="https://api.example.com/v1"
                  class="flex-1 px-4 py-2.5 bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg text-sm outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all"
                  @input="handleBaseUrlChange(modalProvider.id, $event)" />
              </div>
            </div>

            <!-- Rate limit config -->
            <div>
              <div class="flex items-center gap-2 mb-2">
                <Hash :size="16" class="text-apple-gray-400" />
                <label class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300">调用额度限制</label>
              </div>
              <p class="text-xs text-apple-gray-400 mb-3">可粘贴厂商限制说明，由 AI 自动解析</p>

              <textarea v-model="limitParseRaw[modalProvider.id]"
                placeholder="粘贴厂商速率限制说明文字..."
                rows="2"
                class="w-full px-4 py-3 text-sm bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg outline-none border border-apple-gray-200 dark:border-apple-gray-700 mb-3" />
              <button
                :disabled="parsingLimits[modalProvider.id] || !limitParseRaw[modalProvider.id]"
                class="flex items-center gap-2 px-4 py-2 text-sm bg-brian-blue/10 text-brian-blue rounded-lg hover:bg-brian-blue/20 transition-colors disabled:opacity-50 mb-4"
                @click="handleAiParseLimits(modalProvider.id)"
              >
                <Brain :size="14" />
                <Loader2 v-if="parsingLimits[modalProvider.id]" :size="14" class="animate-spin" />
                <span v-else>AI 解析</span>
              </button>

              <div class="grid grid-cols-3 gap-x-4 gap-y-3">
                <div>
                  <label class="text-xs text-apple-gray-400 block mb-1">每日 Token</label>
                  <input :value="getRateLimit(modalProvider.id).maxTokensPerDay || ''" type="number" placeholder="不限"
                    class="w-full px-3 py-2 text-sm bg-apple-gray-50 dark:bg-apple-gray-800 rounded outline-none border border-apple-gray-200 dark:border-apple-gray-700"
                    @input="handleLimitChange(modalProvider.id, 'maxTokensPerDay', $event)" />
                </div>
                <div>
                  <label class="text-xs text-apple-gray-400 block mb-1">每日调用次数</label>
                  <input :value="getRateLimit(modalProvider.id).maxCallsPerDay || ''" type="number" placeholder="不限"
                    class="w-full px-3 py-2 text-sm bg-apple-gray-50 dark:bg-apple-gray-800 rounded outline-none border border-apple-gray-200 dark:border-apple-gray-700"
                    @input="handleLimitChange(modalProvider.id, 'maxCallsPerDay', $event)" />
                </div>
                <div>
                  <label class="text-xs text-apple-gray-400 block mb-1">每周 Token</label>
                  <input :value="getRateLimit(modalProvider.id).maxTokensPerWeek || ''" type="number" placeholder="不限"
                    class="w-full px-3 py-2 text-sm bg-apple-gray-50 dark:bg-apple-gray-800 rounded outline-none border border-apple-gray-200 dark:border-apple-gray-700"
                    @input="handleLimitChange(modalProvider.id, 'maxTokensPerWeek', $event)" />
                </div>
                <div>
                  <label class="text-xs text-apple-gray-400 block mb-1">每周调用次数</label>
                  <input :value="getRateLimit(modalProvider.id).maxCallsPerWeek || ''" type="number" placeholder="不限"
                    class="w-full px-3 py-2 text-sm bg-apple-gray-50 dark:bg-apple-gray-800 rounded outline-none border border-apple-gray-200 dark:border-apple-gray-700"
                    @input="handleLimitChange(modalProvider.id, 'maxCallsPerWeek', $event)" />
                </div>
                <div>
                  <label class="text-xs text-apple-gray-400 block mb-1">每月 Token</label>
                  <input :value="getRateLimit(modalProvider.id).maxTokensPerMonth || ''" type="number" placeholder="不限"
                    class="w-full px-3 py-2 text-sm bg-apple-gray-50 dark:bg-apple-gray-800 rounded outline-none border border-apple-gray-200 dark:border-apple-gray-700"
                    @input="handleLimitChange(modalProvider.id, 'maxTokensPerMonth', $event)" />
                </div>
                <div>
                  <label class="text-xs text-apple-gray-400 block mb-1">每月调用次数</label>
                  <input :value="getRateLimit(modalProvider.id).maxCallsPerMonth || ''" type="number" placeholder="不限"
                    class="w-full px-3 py-2 text-sm bg-apple-gray-50 dark:bg-apple-gray-800 rounded outline-none border border-apple-gray-200 dark:border-apple-gray-700"
                    @input="handleLimitChange(modalProvider.id, 'maxCallsPerMonth', $event)" />
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900">
            <button
              class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 rounded-lg transition-colors"
              @click="resetProviderState(modalProvider.id)"
            >
              <RefreshCw :size="16" /> 重置
            </button>
            <div class="flex items-center gap-3">
              <div v-if="testResult" :class="[
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all animate-fade-in',
                testResult.ok ? 'bg-success-green/10 text-success-green' : 'bg-error-red/10 text-error-red'
              ]">
                <Check v-if="testResult.ok" :size="14" />
                <AlertCircle v-else :size="14" />
                {{ testResult.ok ? '连接成功' : '连接失败' }}
              </div>
              <button
                :disabled="!!testingProvider"
                :class="[
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all',
                  testResult?.ok
                    ? 'bg-success-green text-white'
                    : 'bg-apple-gray-100 dark:bg-apple-gray-800 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700',
                  testingProvider && 'disabled:opacity-50'
                ]"
                @click="handleTestConnection(modalProvider.id)"
              >
                <Loader2 v-if="testingProvider === modalProvider.id" :size="16" class="animate-spin" />
                <Wifi v-else :size="16" />
                测试连接
              </button>
              <button
                class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-error-red border border-error-red/30 rounded-lg hover:bg-error-red/10 transition-all"
                @click="handleDeleteProvider(modalProvider.id)"
              >
                <Trash2 :size="16" /> 删除提供商
              </button>
              <button
                :disabled="savingProvider"
                class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50"
                @click="saveProviderConfig()"
              >
                <Loader2 v-if="savingProvider" :size="16" class="animate-spin" />
                <Check v-else :size="16" /> 保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ═══════════════ 删除确认弹窗 ═══════════════ -->
    <Transition name="fade">
      <div v-if="showDeleteConfirmModal" class="fixed inset-0 z-[60] flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeDeleteConfirmModal" />
        <div class="relative w-[400px] bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 mx-4 overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-error-red/10 flex items-center justify-center">
                <AlertCircle :size="20" class="text-error-red" />
              </div>
              <div>
                <h2 class="text-base font-semibold text-apple-gray-900 dark:text-white">删除提供商</h2>
                <p class="text-xs text-apple-gray-400">此操作不可撤销</p>
              </div>
            </div>
            <button class="p-2 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="closeDeleteConfirmModal">
              <ArrowLeft :size="18" class="text-apple-gray-400 rotate-180" />
            </button>
          </div>

          <!-- Body -->
          <div class="px-6 py-6">
            <div class="flex items-start gap-4">
              <div class="w-9 h-9 rounded-full bg-warning-orange/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertCircle :size="16" class="text-warning-orange" />
              </div>
              <div>
                <p class="text-sm text-apple-gray-700 dark:text-apple-gray-300 leading-relaxed">
                  确定删除此提供商？
                </p>
                <p class="text-xs text-apple-gray-400 mt-2 leading-relaxed">
                  默认提供商将重置为未配置状态，自定义提供商将被移除。
                </p>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900">
            <button
              class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400 bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-all"
              @click="closeDeleteConfirmModal"
            >
              取消
            </button>
            <button
              class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-error-red rounded-lg hover:bg-error-red/90 transition-all"
              @click="confirmDeleteProvider"
            >
              <Trash2 :size="16" /> 确认删除
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ═══════════════ 模型配置弹窗 ═══════════════ -->
    <Transition name="fade">
      <div v-if="showModelModal && modalProvider" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeModelModal" />
        <div class="relative w-[640px] max-h-[560px] flex flex-col bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 mx-4 overflow-hidden">
          <!-- Header -->
          <div class="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-brian-blue/10 flex items-center justify-center">
                <Box :size="20" class="text-brian-blue" />
              </div>
              <div>
                <h2 class="text-base font-semibold">模型配置 - {{ modalProvider.name }}</h2>
                <p class="text-xs text-apple-gray-400">{{ modalProvider.type }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5" :title="hasModelsConfigured(modalProvider.id) ? '模型已配置' : '模型未配置'">
                <div :class="['w-2.5 h-2.5 rounded-full', hasModelsConfigured(modalProvider.id) ? 'bg-success-green' : 'bg-warning-orange']" />
                <span class="text-xs text-apple-gray-400">模型</span>
              </div>
              <button class="p-2 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="closeModelModal">
                <ArrowLeft :size="18" class="text-apple-gray-400 rotate-180" />
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="flex-1 min-h-0 overflow-y-auto p-6 space-y-5 scrollbar-hide">
            <!-- Available models -->
            <div>
              <div class="flex items-center justify-between mb-3">
                <label class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300">可用模型</label>
                <div class="flex items-center gap-2">
                  <Transition name="fade">
                    <span v-if="fetchModelsResult" :class="[
                      'text-xs font-medium animate-fade-in',
                      fetchModelsResult.ok ? 'text-success-green' : 'text-error-red'
                    ]">
                      {{ fetchModelsResult.message }}
                    </span>
                  </Transition>
                  <button
                    class="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors"
                    :class="canFetchModels ? 'text-brian-blue hover:bg-brian-blue/10' : 'text-apple-gray-300 dark:text-apple-gray-600 cursor-not-allowed'"
                    @click="canFetchModels ? fetchModelsFromApi(modalProvider.id) : undefined"
                    :disabled="fetchingModels[modalProvider.id] || !canFetchModels"
                  >
                    <RefreshCw :size="12" :class="{ 'animate-spin': fetchingModels[modalProvider.id] }" />
                    <span>{{ fetchingModels[modalProvider.id] ? '获取中...' : '获取最新模型' }}</span>
                  </button>
                </div>
              </div>

              <div class="flex items-center gap-2 mb-3">
                <div class="flex-1 relative">
                  <input v-model="modelSearchQuery" placeholder="搜索模型名称或 ID..."
                    class="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-300 dark:border-apple-gray-600 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all shadow-sm" />
                  <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
                </div>
                <span class="text-xs text-apple-gray-400 whitespace-nowrap bg-apple-gray-100 dark:bg-apple-gray-800 px-2.5 py-1 rounded-full">
                  {{ modalProvider.models.length }} 个模型
                </span>
              </div>

              <!-- Model list tabs -->
              <div class="flex items-center gap-1 mb-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
                <button
                  :class="['px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px flex items-center gap-2',
                    modelListTab === 'online'
                      ? 'border-brian-blue text-brian-blue'
                      : 'border-transparent text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-300']"
                  @click="modelListTab = 'online'"
                >
                  在线模型 ({{ onlineModels.length }})
                  <label class="flex items-center gap-1 cursor-pointer select-none" @click.stop>
                    <input type="checkbox" :checked="allOnlineModelsSelected" @change="toggleAllOnlineModels"
                      class="w-3 h-3 rounded border-apple-gray-300 text-brian-blue" />
                    <span class="text-[10px]">全选</span>
                  </label>
                </button>
                <button
                  :class="['px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px flex items-center gap-1',
                    modelListTab === 'manual'
                      ? 'border-brian-blue text-brian-blue'
                      : 'border-transparent text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-300']"
                  @click="modelListTab = 'manual'"
                >
                  手动配置 ({{ manualModels.length }})
                  <button class="p-0.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700" @click.stop="showAddModelForm = !showAddModelForm; modelListTab = 'manual'">
                    <Plus :size="12" />
                  </button>
                </button>
              </div>

              <!-- Manual add form (collapsible) -->
              <Transition name="fade">
                <div v-if="showAddModelForm" class="mb-3 p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800/50 border border-apple-gray-200 dark:border-apple-gray-700 space-y-3">
                  <div class="flex items-center gap-2">
                    <input v-model="newModelForm.id" placeholder="模型 ID（如 gpt-4o）" class="flex-1 px-3 py-2 text-sm rounded-lg bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
                    <input v-model="newModelForm.name" placeholder="显示名称" class="flex-1 px-3 py-2 text-sm rounded-lg bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
                  </div>
                  <div class="flex items-center gap-2">
                    <input v-model.number="newModelForm.maxTokens" type="number" placeholder="Max Tokens" class="w-32 px-3 py-2 text-sm rounded-lg bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input v-model="newModelForm.supportsVision" type="checkbox" class="w-3.5 h-3.5 rounded border-apple-gray-300 text-brian-blue" />
                      <span class="text-xs text-apple-gray-500">视觉</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input v-model="newModelForm.supportsTools" type="checkbox" class="w-3.5 h-3.5 rounded border-apple-gray-300 text-brian-blue" />
                      <span class="text-xs text-apple-gray-500">工具调用</span>
                    </label>
                    <button class="flex items-center gap-1 px-4 py-2 text-sm bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 ml-auto" @click="addCustomModel(modalProvider.id); showAddModelForm = false">
                      <Plus :size="14" /> 添加
                    </button>
                  </div>
                </div>
              </Transition>

              <!-- Online models list -->
              <div v-show="modelListTab === 'online'" class="space-y-2 max-h-[260px] overflow-y-auto scrollbar-hide">
                <div v-for="model in filteredOnlineModels" :key="model.id"
                  class="flex items-center gap-3 p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700">
                  <input type="checkbox" :checked="selectedOnlineModelIds.has(model.id)"
                    @change="toggleOnlineModelSelect(model.id)"
                    class="w-4 h-4 rounded border-apple-gray-300 text-brian-blue flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <template v-if="editingModelId === model.id">
                      <div class="space-y-1">
                        <input v-model="modelEditForm.name" placeholder="显示名称"
                          class="w-full px-2 py-1 text-sm font-medium rounded bg-white dark:bg-apple-gray-700 outline-none border border-brian-blue" />
                        <input v-model="modelEditForm.id" placeholder="模型 ID"
                          class="w-full px-2 py-1 text-xs rounded bg-white dark:bg-apple-gray-700 outline-none border border-brian-blue" />
                        <div class="flex items-center gap-2">
                          <input v-model.number="modelEditForm.maxTokens" type="number" placeholder="Max Tokens"
                            class="flex-1 px-2 py-1 text-xs rounded bg-white dark:bg-apple-gray-700 outline-none border border-apple-gray-200 dark:border-apple-gray-600" />
                          <label class="flex items-center gap-1 text-xs text-apple-gray-500 cursor-pointer">
                            <input v-model="modelEditForm.supportsVision" type="checkbox" class="w-3 h-3 rounded border-apple-gray-300 text-brian-blue" /> 视觉
                          </label>
                          <label class="flex items-center gap-1 text-xs text-apple-gray-500 cursor-pointer">
                            <input v-model="modelEditForm.supportsTools" type="checkbox" class="w-3 h-3 rounded border-apple-gray-300 text-brian-blue" /> 工具
                          </label>
                        </div>
                        <div class="flex items-center gap-1">
                          <button class="px-2 py-0.5 text-xs bg-brian-blue text-white rounded" @click="saveModelEdit">保存</button>
                          <button class="px-2 py-0.5 text-xs bg-apple-gray-200 dark:bg-apple-gray-700 rounded" @click="cancelModelEdit">取消</button>
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ model.name }}</p>
                        <span v-if="modelTestResult[model.id]" class="text-xs"
                          :class="modelTestResult[model.id]?.ok ? 'text-success-green' : 'text-error-red'">
                          {{ modelTestResult[model.id]?.ok ? '✓' : '✗' }}
                        </span>
                      </div>
                      <div class="flex items-center gap-2 text-xs text-apple-gray-400">
                        <span>{{ model.id }}</span>
                        <span>·</span>
                        <span>{{ model.maxTokens.toLocaleString() }} tokens</span>
                        <span v-if="model.supportsVision" class="text-brian-blue">· 视觉</span>
                        <span v-if="model.supportsTools" class="text-success-green">· 工具</span>
                      </div>
                    </template>
                  </div>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <template v-if="editingModelId !== model.id">
                      <button class="p-1.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700" title="测试此模型" @click="verifySingleModel(modalProvider.id, model.id)">
                        <Wifi v-if="!modelTestResult[model.id]" :size="13" class="text-apple-gray-400" />
                        <Loader2 v-else :size="13" class="animate-spin text-brian-blue" />
                      </button>
                      <button class="p-1.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700" title="编辑模型" @click="startEditModel(model.id)">
                        <Edit3 :size="13" class="text-apple-gray-400" />
                      </button>
                    </template>
                  </div>
                </div>
                <div v-if="filteredOnlineModels.length === 0" class="text-center py-6 text-sm text-apple-gray-400">
                  {{ modelSearchQuery ? `未找到匹配 "${modelSearchQuery}" 的在线模型` : '暂无在线模型，点击"获取最新模型"同步' }}
                </div>
              </div>

              <!-- Manual models list -->
              <div v-show="modelListTab === 'manual'" class="space-y-2 max-h-[260px] overflow-y-auto scrollbar-hide">
                <div v-for="model in filteredManualModels" :key="model.id"
                  class="flex items-center gap-3 p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 border"
                  :class="configStore.selectedModelId === model.id && configStore.selectedProviderId === modalProvider.id
                    ? 'border-brian-blue/40 bg-brian-blue/5'
                    : 'border-apple-gray-200 dark:border-apple-gray-700'">
                  <div class="w-2 h-2 rounded-full flex-shrink-0"
                    :class="configStore.selectedModelId === model.id && configStore.selectedProviderId === modalProvider.id
                      ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" />
                  <div class="flex-1 min-w-0">
                    <template v-if="editingModelId === model.id">
                      <div class="space-y-1">
                        <input v-model="modelEditForm.name" placeholder="显示名称"
                          class="w-full px-2 py-1 text-sm font-medium rounded bg-white dark:bg-apple-gray-700 outline-none border border-brian-blue" />
                        <input v-model="modelEditForm.id" placeholder="模型 ID"
                          class="w-full px-2 py-1 text-xs rounded bg-white dark:bg-apple-gray-700 outline-none border border-brian-blue" />
                        <div class="flex items-center gap-2">
                          <input v-model.number="modelEditForm.maxTokens" type="number" placeholder="Max Tokens"
                            class="flex-1 px-2 py-1 text-xs rounded bg-white dark:bg-apple-gray-700 outline-none border border-apple-gray-200 dark:border-apple-gray-600" />
                          <label class="flex items-center gap-1 text-xs text-apple-gray-500 cursor-pointer">
                            <input v-model="modelEditForm.supportsVision" type="checkbox" class="w-3 h-3 rounded border-apple-gray-300 text-brian-blue" /> 视觉
                          </label>
                          <label class="flex items-center gap-1 text-xs text-apple-gray-500 cursor-pointer">
                            <input v-model="modelEditForm.supportsTools" type="checkbox" class="w-3 h-3 rounded border-apple-gray-300 text-brian-blue" /> 工具
                          </label>
                        </div>
                        <div class="flex items-center gap-1">
                          <button class="px-2 py-0.5 text-xs bg-brian-blue text-white rounded" @click="saveModelEdit">保存</button>
                          <button class="px-2 py-0.5 text-xs bg-apple-gray-200 dark:bg-apple-gray-700 rounded" @click="cancelModelEdit">取消</button>
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ model.name }}</p>
                        <span v-if="modelTestResult[model.id]" class="text-xs"
                          :class="modelTestResult[model.id]?.ok ? 'text-success-green' : 'text-error-red'">
                          {{ modelTestResult[model.id]?.ok ? '✓' : '✗' }}
                        </span>
                      </div>
                      <div class="flex items-center gap-2 text-xs text-apple-gray-400">
                        <span>{{ model.id }}</span>
                        <span>·</span>
                        <span>{{ model.maxTokens.toLocaleString() }} tokens</span>
                        <span v-if="model.supportsVision" class="text-brian-blue">· 视觉</span>
                        <span v-if="model.supportsTools" class="text-success-green">· 工具</span>
                      </div>
                    </template>
                  </div>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <template v-if="editingModelId !== model.id">
                      <button
                        :class="['px-2.5 py-1 text-xs rounded font-medium transition-colors',
                          configStore.selectedModelId === model.id && configStore.selectedProviderId === modalProvider.id
                            ? 'bg-brian-blue text-white' : 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-500 hover:bg-apple-gray-300 dark:hover:bg-apple-gray-600']"
                        @click="configStore.selectedProviderId = modalProvider.id; configStore.selectedModelId = model.id"
                      >
                        {{ configStore.selectedModelId === model.id && configStore.selectedProviderId === modalProvider.id ? '当前' : '设为当前' }}
                      </button>
                      <button class="p-1.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700" title="测试此模型" @click="verifySingleModel(modalProvider.id, model.id)">
                        <Wifi v-if="!modelTestResult[model.id]" :size="13" class="text-apple-gray-400" />
                        <Loader2 v-else :size="13" class="animate-spin text-brian-blue" />
                      </button>
                      <button class="p-1.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700" title="编辑模型" @click="startEditModel(model.id)">
                        <Edit3 :size="13" class="text-apple-gray-400" />
                      </button>
                      <button class="p-1.5 rounded hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700" title="删除" @click="removeModel(modalProvider.id, model.id)">
                        <Trash2 :size="13" class="text-error-red" />
                      </button>
                    </template>
                  </div>
                </div>
                <div v-if="filteredManualModels.length === 0" class="text-center py-6 text-sm text-apple-gray-400">
                  {{ modelSearchQuery ? `未找到匹配 "${modelSearchQuery}" 的手动模型` : '暂无手动模型，点击"手动配置"标签旁的 + 添加' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900">
            <button
              :disabled="savingModels"
              class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50"
              @click="saveModelConfig()"
            >
              <Loader2 v-if="savingModels" :size="16" class="animate-spin" />
              <Check v-else :size="16" /> 保存
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ═══════════════ 添加模型提供商弹窗 ═══════════════ -->
    <Transition name="fade">
      <div v-if="showAddProviderModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeAddProviderModal" />
        <div class="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 mx-4 overflow-hidden">
          <div class="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-brian-blue/10 flex items-center justify-center">
                <Plus :size="20" class="text-brian-blue" />
              </div>
              <div>
                <h2 class="text-base font-semibold">添加模型提供商</h2>
                <p class="text-xs text-apple-gray-400">配置新的模型提供商参数</p>
              </div>
            </div>
            <button class="p-2 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="closeAddProviderModal">
              <ArrowLeft :size="18" class="text-apple-gray-400 rotate-180" />
            </button>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-6 space-y-5 scrollbar-hide">
            <div>
              <label class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2 block">提供商名称</label>
              <div class="flex items-center gap-3">
                <Server :size="16" class="text-apple-gray-400 flex-shrink-0" />
                <input v-model="newProviderForm.name" type="text" placeholder="如：我的 OpenAI"
                  class="flex-1 px-4 py-2.5 bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg text-sm outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all" />
              </div>
            </div>

            <div>
              <label class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2 block">提供商类型</label>
              <div class="flex items-center gap-3">
                <Sliders :size="16" class="text-apple-gray-400 flex-shrink-0" />
                <select v-model="newProviderForm.type"
                  class="flex-1 px-4 py-2.5 bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg text-sm outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all">
                  <option v-for="opt in providerTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
            </div>

            <div>
              <label class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2 block">API 地址</label>
              <div class="flex items-center gap-3">
                <Globe :size="16" class="text-apple-gray-400 flex-shrink-0" />
                <input v-model="newProviderForm.baseUrl" type="text" placeholder="https://api.example.com/v1"
                  class="flex-1 px-4 py-2.5 bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg text-sm outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all" />
              </div>
            </div>

            <div>
              <label class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2 block">API Key</label>
              <div class="flex items-center gap-3">
                <Key :size="16" class="text-apple-gray-400 flex-shrink-0" />
                <div class="flex-1 relative">
                  <input v-model="newProviderForm.apiKey"
                    :type="newProviderForm.apiKey ? 'password' : 'text'" placeholder="sk-..."
                    class="w-full pl-4 pr-12 py-2.5 bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg text-sm outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all" />
                  <button class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="newProviderForm.apiKey = newProviderForm.apiKey ? '' : 'sk-'">
                    <EyeOff v-if="newProviderForm.apiKey" :size="16" class="text-apple-gray-400" />
                    <Eye v-else :size="16" class="text-apple-gray-400" />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2 block">启用状态</label>
              <div class="flex items-center justify-between glass-panel rounded-lg px-4 py-3">
                <span class="text-sm text-apple-gray-600 dark:text-apple-gray-400">创建后立即启用</span>
                <button
                  :class="['w-12 h-7 rounded-full transition-colors relative', newProviderForm.enabled ? 'bg-brian-blue' : 'bg-apple-gray-300']"
                  @click="newProviderForm.enabled = !newProviderForm.enabled"
                >
                  <div :class="['w-5 h-5 rounded-full bg-white absolute top-1 transition-transform', newProviderForm.enabled ? 'translate-x-6' : 'translate-x-1']" />
                </button>
              </div>
            </div>
          </div>

          <div class="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900">
            <button
              class="px-4 py-2.5 text-sm font-medium text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 rounded-lg transition-colors"
              @click="closeAddProviderModal"
            >
              取消
            </button>
            <button
              :disabled="addingProvider"
              class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50 transition-colors"
              @click="confirmAddProvider"
            >
              <Loader2 v-if="addingProvider" :size="16" class="animate-spin" />
              <Check v-else :size="16" /> 添加
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toastVisible"
        class="fixed top-6 right-6 z-[100] flex items-start gap-3 px-5 py-3.5 rounded-xl shadow-xl border pointer-events-auto max-w-md"
        :class="toastType === 'error'
          ? 'bg-error-red/10 border-error-red/20 text-error-red'
          : 'bg-success-green/10 border-success-green/20 text-success-green'">
        <AlertCircle v-if="toastType === 'error'" :size="18" class="flex-shrink-0 mt-0.5" />
        <Check v-else :size="18" class="flex-shrink-0 mt-0.5" />
        <span class="text-sm font-medium leading-snug break-words flex-1 min-w-0">{{ toastMessage }}</span>
        <button class="flex-shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5" @click="closeToast">
          <ArrowLeft :size="14" class="rotate-180" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: all 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(4px); }

.toast-enter-active { transition: all 0.35s cubic-bezier(0.32, 0.72, 0, 1); }
.toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from { opacity: 0; transform: translateX(100%) scale(0.95); }
.toast-leave-to { opacity: 0; transform: translateX(20px) scale(0.95); }
</style>