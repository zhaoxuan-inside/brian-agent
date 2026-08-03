<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Cpu, Bot, Workflow, AppWindow, Server, Database, Boxes, Table2,
  Heart, Wand2, GitBranch, Brain, GraduationCap, HardDrive,
  Lightbulb, Library, RefreshCw, ClipboardList, Briefcase, PenLine,
  Settings, FileText, Network, User, MessageCircle, Sparkles,
  ChevronRight, Trash2, Loader2, Check, AlertCircle,
  Star, FlaskConical, X, Save, Layers,
  Globe, Key, Plus, Pencil, Download,
  Eye, EyeOff,
  Search, Monitor, Terminal, MessageSquare,
  BarChart3, Zap, Plug, Radio,
} from '@lucide/vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import { configApi, agentApi, skillApi, mcpApi, fetchApi } from '@/api'
import type { ConfigTreeLayer, ConfigTreeCategory, ConfigTreeItem } from '@/api/types'

// ============================================================
// 导航定义（PRD §11）
// ============================================================

interface NavSubSection {
  key: string
  label: string
  icon: typeof Cpu
  type: 'entity' | 'params'
  entityType?: string
  configModule?: string
  configCategories?: string[]
}
interface NavSection {
  key: string
  label: string
  icon: typeof Cpu
  desc: string
  subsections: NavSubSection[]
}

const navSections: NavSection[] = [
  {
    key: 'llm', label: 'LLM 配置', icon: Cpu,
    desc: 'LLM 提供商、模型管理与运行参数',
    subsections: [
      { key: 'llm-provider', label: '模型提供商管理', icon: Globe, type: 'entity', entityType: 'provider' },
      { key: 'llm-model', label: 'Model 管理', icon: Boxes, type: 'entity', entityType: 'model' },
      { key: 'llm-params', label: '运行参数', icon: Settings, type: 'params', configModule: 'llm_core', configCategories: ['basic'] },
    ],
  },
  {
    key: 'agent', label: 'Agent 配置', icon: Bot,
    desc: 'Agent 实例、策略、构建、执行与进化',
    subsections: [
      { key: 'agent-instance', label: 'Agent 实例', icon: Library, type: 'entity', entityType: 'agent' },
      { key: 'agent-strategy', label: '执行策略', icon: GitBranch, type: 'entity', entityType: 'strategy' },
      { key: 'agent-builder', label: '构建参数', icon: Briefcase, type: 'params', configModule: 'agent_builder', configCategories: ['basic'] },
      { key: 'agent-execution', label: '执行参数', icon: Zap, type: 'params', configModule: 'agent_execution', configCategories: ['basic'] },
      { key: 'agent-context', label: '上下文参数', icon: Brain, type: 'params', configModule: 'agent_context', configCategories: ['basic'] },
      { key: 'agent-planner', label: 'Planner 参数', icon: ClipboardList, type: 'params', configModule: 'writer_agent', configCategories: ['basic'] },
      { key: 'agent-writer', label: 'Writer 参数', icon: PenLine, type: 'params', configModule: 'writer_agent', configCategories: ['basic'] },
      { key: 'agent-evolutor', label: 'Evolutor 参数', icon: Sparkles, type: 'params', configModule: 'evolutor_agent', configCategories: ['basic'] },
    ],
  },
  {
    key: 'memory', label: '记忆与信息', icon: Brain,
    desc: '信息存储、标签、摘要、向量化与上下文构建',
    subsections: [
      { key: 'memory-storage', label: '存储参数', icon: HardDrive, type: 'params', configModule: 'info_core', configCategories: ['config'] },
      { key: 'memory-tag', label: '标签生成', icon: Lightbulb, type: 'params', configModule: 'info_core', configCategories: ['tag_config'] },
      { key: 'memory-summary', label: '摘要生成', icon: FileText, type: 'params', configModule: 'info_core', configCategories: ['summary_config'] },
      { key: 'memory-vector', label: '向量化', icon: Layers, type: 'params', configModule: 'info_core', configCategories: ['vector_config'] },
      { key: 'memory-context', label: '上下文构建', icon: Network, type: 'params', configModule: 'info_core', configCategories: ['context_config'] },
    ],
  },
  {
    key: 'tools', label: '工具与技能', icon: Wand2,
    desc: 'Skill 管理、MCP 管理与匹配优化',
    subsections: [
      { key: 'tools-skill', label: 'Skill 管理', icon: Wand2, type: 'entity', entityType: 'skill' },
      { key: 'tools-mcp', label: 'MCP 管理', icon: Plug, type: 'entity', entityType: 'mcp' },
      { key: 'tools-match', label: '匹配与优化', icon: Zap, type: 'params', configModule: 'skill_core', configCategories: ['basic', 'opt_rule'] },
    ],
  },
  {
    key: 'roles', label: '角色与提示词', icon: Heart,
    desc: 'Soul 人格管理与 Prompt 模板',
    subsections: [
      { key: 'roles-soul', label: 'Soul 管理', icon: Heart, type: 'entity', entityType: 'soul' },
      { key: 'roles-prompt', label: 'Prompt 模板', icon: MessageSquare, type: 'entity', entityType: 'prompt' },
    ],
  },
  {
    key: 'orchestration', label: '编排配置', icon: Workflow,
    desc: '任务编排的策略、执行与可视化',
    subsections: [
      { key: 'orch-strategy', label: '策略管理', icon: GitBranch, type: 'entity', entityType: 'orch-strategy' },
      { key: 'orch-execution', label: '执行参数', icon: Zap, type: 'params', configModule: 'execution', configCategories: ['basic'] },
      { key: 'orch-visual', label: '可视化', icon: Monitor, type: 'params', configModule: 'visualization', configCategories: ['basic'] },
    ],
  },
  {
    key: 'infra', label: '基础设施', icon: Server,
    desc: '底层运行时参数：日志、消息队列、存储后端',
    subsections: [
      { key: 'infra-log', label: '日志', icon: Terminal, type: 'params', configModule: 'log_provider', configCategories: ['basic'] },
      { key: 'infra-mq', label: '消息队列', icon: Radio, type: 'params', configModule: 'mq_provider', configCategories: ['basic'] },
      { key: 'infra-graphdb', label: '图数据库', icon: Database, type: 'params', configModule: 'graphdb_provider', configCategories: ['basic', 'aging'] },
      { key: 'infra-vectordb', label: '向量数据库', icon: Table2, type: 'params', configModule: 'vectordb_provider', configCategories: ['basic'] },
    ],
  },
  {
    key: 'application', label: '应用配置', icon: AppWindow,
    desc: '对话、自学习、用户画像、可视化',
    subsections: [
      { key: 'app-chat', label: '对话', icon: MessageCircle, type: 'params', configModule: 'chat', configCategories: ['basic'] },
      { key: 'app-selflearning', label: '自学习', icon: GraduationCap, type: 'params', configModule: 'self_learning', configCategories: ['basic', 'weight', 'interval'] },
      { key: 'app-profile', label: '用户画像', icon: User, type: 'params', configModule: 'user_profile', configCategories: ['basic'] },
      { key: 'app-visualization', label: '可视化', icon: BarChart3, type: 'params', configModule: 'visualization', configCategories: ['basic'] },
    ],
  },
]

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
const currentEntityType = computed(() => currentSub.value?.entityType)

const breadcrumb = computed(() => {
  const items: { label: string }[] = []
  if (currentSection.value) items.push({ label: currentSection.value.label })
  if (currentSub.value) items.push({ label: currentSub.value.label })
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
  const { configModule, configCategories } = currentSub.value
  const items: ParamItem[] = []
  for (const layer of configLayers.value) {
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
  for (const layer of configLayers.value) {
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

const editingParam = ref<ParamItem | null>(null)
const editingParamValue = ref<string>('')
const paramSaving = ref(false)

const prompts = ref<{ id: string; title: string; brief: string; enabled: boolean }[]>([])

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

const toolsSchemaPlaceholder = `{
  "name": "get_weather",
  "description": "获取指定城市的天气信息",
  "parameters": {
    "type": "object",
    "properties": {
      "city": { "type": "string", "description": "城市名称" }
    },
    "required": ["city"]
  }
}`

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
  if (val !== undefined && val !== null) return String(val)
  return '—'
}

function startEditParam(item: ParamItem) {
  editingParam.value = item
  const val = getConfigPrimitiveValue(item)
  editingParamValue.value = val !== undefined && val !== null ? String(val) : ''
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
    editingParam.value.config_value = value
    showToast('配置已保存', 'success')
    cancelEditParam()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    paramSaving.value = false
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
const fetchedModels = ref<Array<{ id: string; name: string; brief: string; features?: Record<string, unknown> }>>([])
interface FetchedModel { id: string; name: string; brief: string; features?: Record<string, unknown>; enabled?: boolean }

const cachedModels = ref<FetchedModel[]>([])
const modelSearchQuery = ref('')
const selectedModelIds = ref<Set<string>>(new Set())

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
      body: JSON.stringify({ modelIds: [...selectedModelIds.value] }),
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
  try {
    const res = await fetchApi<{ models: FetchedModel[] }>(`/config/provider/${providerId}/models`)
    cachedModels.value = res.models || []
  } catch {
    cachedModels.value = []
  }
}

async function handleFetchModels(providerId: string) {
  fetchingModels.value = true
  fetchedModels.value = []
  try {
    const res = await fetchApi<{ models: FetchedModel[]; total: number; cached: boolean }>(
      `/config/provider/${providerId}/fetch-models`, { method: 'POST' },
    )
    fetchedModels.value = res.models || []
    cachedModels.value = res.models || []
    showToast(`获取到 ${fetchedModels.value.length} 个模型`, 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '获取模型列表失败')
  } finally {
    fetchingModels.value = false
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
  status?: string
  isDefault?: boolean
}

const models = ref<BackendModel[]>([])
const modelsLoading = ref(false)
const modelSearch = ref('')
const modelModalVisible = ref(false)

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
  title: '', usage: 'text', providerId: '', maxTokens: 0, usageDesc: '',
  providerMaxTokens: 0,
})
const modelSubmitting = ref(false)

async function loadModels() {
  modelsLoading.value = true
  try {
    const raw = await configApi.model.list()
    const list = (Array.isArray(raw) ? raw : []) as BackendModel[]
    for (const m of list) {
      m.id = m.modelName || m.id
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
      usage: 'text',
      providerId: model.providerId || '',
      maxTokens: model.maxTokens || 0,
      usageDesc: '',
      providerMaxTokens: model.maxTokens || 0,
    }
  } else {
    editingModel.value = null
    modelForm.value = {
      title: '', usage: 'text', providerId: providers.value[0]?.id || '',
      maxTokens: 0, usageDesc: '', providerMaxTokens: 0,
    }
  }
  modelModalVisible.value = true
}

function closeModelModal() { modelModalVisible.value = false; editingModel.value = null }

async function submitModelForm() {
  modelSubmitting.value = true
  try {
    const tokens = modelForm.value.providerMaxTokens
      ? Math.min(modelForm.value.maxTokens, modelForm.value.providerMaxTokens)
      : modelForm.value.maxTokens
    const data: Record<string, unknown> = {
      llm_title: modelForm.value.title,
      llm_usage: modelForm.value.usage,
      maxTokens: tokens,
      model_usage: modelForm.value.usageDesc,
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

async function handleTestModel(modelId: string) {
  try {
    const res = await configApi.model.test(modelId)
    showToast(res.success ? `连接成功 · ${res.latency}ms` : res.message, res.success ? 'success' : 'error')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '测试失败')
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

async function submitSkillForm() {
  skillSubmitting.value = true
  try {
    const data: Record<string, unknown> = {
      name: skillForm.value.name.trim(),
      skill_brief: skillForm.value.skillBrief.trim() || skillForm.value.name.trim(),
      skill_md: skillForm.value.skillMd,
      scripts: skillForm.value.scripts.length > 0 ? skillForm.value.scripts : undefined,
      references: skillForm.value.references.length > 0 ? skillForm.value.references : undefined,
      assets: skillForm.value.assets.length > 0 ? skillForm.value.assets : undefined,
    }
    if (editingSkill.value) {
      await skillApi.update(editingSkill.value.id, data)
    } else {
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

// ============================================================
// MCP 数据
// ============================================================

interface BackendMcp {
  id: string
  displayName?: string
  name?: string
  description?: string
  version?: string
  enabled?: boolean
}

const mcps = ref<BackendMcp[]>([])
const mcpsLoading = ref(false)

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

async function handleDeleteMcp(mcpId: string) {
  try {
    await fetchApi(`/mcp/${mcpId}`, { method: 'DELETE' })
    mcps.value = mcps.value.filter(m => m.id !== mcpId)
    showToast('已卸载', 'success')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '卸载失败')
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
// Agent 数据
// ============================================================

interface BackendAgent {
  id: string
  agent_name?: string
  name?: string
  agent_type?: string
  type?: string
  description?: string
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

function openAgentModal(agent?: BackendAgent) {
  if (agent) {
    editingAgent.value = agent
    agentForm.value = {
      name: agent.agent_name || agent.name || '',
      type: agent.agent_type || agent.type || 'WORKER',
      description: agent.description || '',
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
const expandedOrchStrategy = ref<string | null>(null)

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
// 初始化
// ============================================================

onMounted(() => {
  loadConfigTree()
  loadPrompts()
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
      case 'agent': await loadAgents(); break
      case 'prompt': await loadPrompts(); break
      case 'orch-strategy': await loadOrchStrategies(); break
    }
  } else if (sub?.type === 'params') {
    await loadConfigTree()
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
      <main class="flex-1 overflow-y-auto bg-apple-gray-50 dark:bg-apple-gray-900">
        <div class="flex items-center gap-1.5 px-5 py-2.5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
          <Layers :size="15" class="text-brian-blue flex-shrink-0" />
          <template v-for="(crumb, idx) in breadcrumb" :key="idx">
            <ChevronRight v-if="idx > 0" :size="12" class="text-apple-gray-400 flex-shrink-0" />
            <span class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ crumb.label }}</span>
          </template>
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
            <div v-for="group in currentParamsByCat" :key="group.cat" class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800">
              <div class="px-4 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
                <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ group.label }}</h3>
              </div>
              <div class="divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
                <div
                  v-for="item in group.items"
                  :key="item.config_key"
                  class="px-4 py-3 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors"
                >
                  <div class="flex items-start justify-between gap-4">
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
                      <p v-if="item.config_description" class="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-0.5">{{ item.config_description }}</p>
                      <p class="text-[10px] font-mono text-apple-gray-400 dark:text-apple-gray-500 mt-0.5">{{ item.config_key }}</p>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <template v-if="editingParam?.config_key === item.config_key">
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
                          <select v-model="editingParamValue" :class="inputClass + ' !w-32 !py-1.5'">
                            <option v-for="v in item.config_enum_values" :key="String(v)" :value="String(v)">{{ v }}</option>
                          </select>
                        </template>
                        <template v-else-if="item.config_key.endsWith('prompt_template_id')">
                          <select v-model="editingParamValue" :class="inputClass + ' !w-44 !py-1.5'">
                            <option value="">prompt选择</option>
                            <option v-for="p in prompts" :key="p.id" :value="p.id">{{ p.title }}</option>
                          </select>
                        </template>
                        <template v-else>
                          <input
                            v-model="editingParamValue"
                            :type="item.config_type === 'STRING' ? 'text' : 'number'"
                            :class="inputClass + ' !w-32 !py-1.5'"
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
                              :class="item.config_value === true || item.config_value === 'true' ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                            />
                            <span class="text-sm font-mono text-apple-gray-600 dark:text-apple-gray-300">
                              {{ item.config_value === true || item.config_value === 'true' ? 'true' : 'false' }}
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
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="p in providers" :key="p.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md transition-shadow p-4"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Globe :size="18" /></div>
                  <div class="min-w-0">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ p._displayName || p.id }}</h3>
                    <p class="text-[11px] text-apple-gray-400 truncate">{{ p.llm_provider_brief || '' }}</p>
                  </div>
                </div>
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" :class="(p.api_key as string) ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" :title="(p.api_key as string) ? '已配置密钥' : '未配置密钥'" />
              </div>
              <p class="text-[11px] text-apple-gray-600 dark:text-apple-gray-300 font-mono bg-apple-gray-100 dark:bg-apple-gray-900/60 rounded px-2 py-1 truncate mb-3">
                {{ p._displayUrl || '' }}
              </p>
              <div class="flex items-center justify-end gap-1.5 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20 transition-colors" @click="openProviderModal(p)"><Pencil :size="11" /> 编辑</button>
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="handleTestProvider(p.id)"><FlaskConical :size="11" /> 测试</button>
                <button
                  class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0"
                  :class="p.enable ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                  title="启用/停用"
                  @click="handleToggleProvider(p.id)"
                >
                  <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="p.enable ? 'translate-x-4' : ''" />
                </button>
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click="handleDeleteProvider(p.id)"><Trash2 :size="11" /> 删除</button>
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
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="m in filteredModels" :key="m.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md transition-shadow p-4"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Boxes :size="18" /></div>
                  <div class="min-w-0">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ m.modelName || '' }}</h3>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-[11px] text-apple-gray-400">{{ m.providerName || m.providerId || '' }}</span>
                      <span class="text-[10px] font-mono text-apple-gray-400">{{ (m.maxTokens || 0) >= 1000000 ? ((m.maxTokens || 0) / 1000000).toFixed(1) + 'M' : (m.maxTokens || 0) >= 1000 ? ((m.maxTokens || 0) / 1000).toFixed(0) + 'K' : (m.maxTokens || 0) }} tokens</span>
                      <span class="w-1.5 h-1.5 rounded-full" :class="m.status === 'active' ? 'bg-success-green' : 'bg-apple-gray-300'" />
                    </div>
                  </div>
                </div>
                <span v-if="m.isDefault" class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-brian-blue/10 text-brian-blue flex-shrink-0"><Star :size="11" /> 默认</span>
              </div>
              <div class="flex items-center justify-end gap-1.5 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <button
                  class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors"
                  :class="m.isDefault ? 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400 cursor-not-allowed' : 'bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20'"
                  :disabled="!!m.isDefault"
                  @click="handleSetDefault(m.id)"
                >
                  <Star :size="12" /> {{ m.isDefault ? '已是默认' : '设为默认' }}
                </button>
                <button class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="openModelModal(m)">
                  <Pencil :size="12" /> 编辑
                </button>
                <button class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg text-error-red hover:bg-error-red/10 transition-colors" @click="handleDeleteModel(m.id)"><Trash2 :size="12" /> 删除</button>
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
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="s in souls" :key="s.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md transition-shadow p-4"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Heart :size="18" /></div>
                  <div class="min-w-0">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ s.soul_brief || s.id }}</h3>
                    <p class="text-[11px] text-apple-gray-400">{{ s.soul_usage || '' }}</p>
                  </div>
                </div>
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" :class="(s.enabled ?? true) ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" />
              </div>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-3 min-h-[32px] line-clamp-2">
                {{ (s.soul_content || '').slice(0, 120) || '暂无内容' }}
              </p>
              <div class="flex items-center justify-end gap-1.5 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20 transition-colors" @click="openSoulModal(s)"><Pencil :size="11" /> 编辑</button>
                <button class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0" :class="(s.enabled ?? true) ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click="handleToggleSoul(s.id)">
                  <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="(s.enabled ?? true) ? 'translate-x-4' : ''" />
                </button>
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click="handleDeleteSoul(s.id)"><Trash2 :size="11" /> 删除</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 实体管理视图 - Skill ========================== -->
        <div v-if="isEntityView && currentEntityType === 'skill'" class="px-5 pb-6">
          <div class="flex justify-between items-center mb-4">
            <span class="text-xs text-apple-gray-400">{{ skills.length }} 个技能</span>
            <button class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors" @click="openSkillModal()">
              <Plus :size="13" /> 添加 Skill
            </button>
          </div>
          <div v-if="skillsLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="skills.length === 0" class="flex flex-col items-center justify-center py-16">
            <Wand2 :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无 Skill 配置</p>
          </div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="sk in skills" :key="sk.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md transition-shadow p-4"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Wand2 :size="18" /></div>
                  <div class="min-w-0">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ sk.name || sk.id }}</h3>
                    <p class="text-[11px] text-apple-gray-400">{{ sk.enabled ?? true ? '启用' : '停用' }}</p>
                  </div>
                </div>
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" :class="(sk.enabled ?? true) ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" />
              </div>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-3 min-h-[32px] line-clamp-2">{{ sk.skill_brief || sk.name || '暂无描述' }}</p>
              <div class="flex items-center justify-end gap-1.5 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20 transition-colors" @click="openSkillModal(sk)"><Pencil :size="11" /> 编辑</button>
                <button class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0" :class="(sk.enabled ?? true) ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click="handleToggleSkill(sk.id)">
                  <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="(sk.enabled ?? true) ? 'translate-x-4' : ''" />
                </button>
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click="handleDeleteSkill(sk.id)"><Trash2 :size="11" /> 删除</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 实体管理视图 - MCP ========================== -->
        <div v-if="isEntityView && currentEntityType === 'mcp'" class="px-5 pb-6">
          <div class="flex justify-between items-center mb-4">
            <span class="text-xs text-apple-gray-400">{{ mcps.length }} 个 MCP 服务</span>
          </div>
          <div v-if="mcpsLoading" class="flex justify-center py-16"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="mcps.length === 0" class="flex flex-col items-center justify-center py-16">
            <Plug :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无已安装的 MCP 服务</p>
          </div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="item in mcps" :key="item.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md transition-shadow p-4"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><Plug :size="18" /></div>
                  <div class="min-w-0">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ item.displayName || item.name || item.id }}</h3>
                    <p class="text-[11px] text-apple-gray-400">{{ item.enabled ?? true ? '启用' : '停用' }} · v{{ item.version || '1.0' }}</p>
                  </div>
                </div>
              </div>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-3 min-h-[32px] line-clamp-2">{{ item.description || '暂无描述' }}</p>
              <div class="flex items-center justify-end gap-1.5 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <button class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0" :class="(item.enabled ?? true) ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click="handleToggleMcp(item.id)">
                  <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="(item.enabled ?? true) ? 'translate-x-4' : ''" />
                </button>
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click="handleDeleteMcp(item.id)"><Trash2 :size="11" /> 卸载</button>
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
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="a in agents" :key="a.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md transition-shadow p-4"
            >
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
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-2 min-h-[32px] line-clamp-2">{{ a.description || a.task_signature || '暂无描述' }}</p>
              <div class="flex items-center gap-2 text-[10px] text-apple-gray-400 mb-3">
                <span v-if="a.strategy_id">策略: {{ a.strategy_id }}</span>
                <span v-if="a.eval_score !== undefined">评分: {{ a.eval_score }}</span>
                <span v-if="a.usage_count !== undefined">使用: {{ a.usage_count }}次</span>
              </div>
              <div class="flex items-center justify-end gap-1.5 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20 transition-colors" @click="openAgentModal(a)"><Pencil :size="11" /> 编辑</button>
                <button class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0" :class="(a.enable ?? a.enabled ?? true) ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click="handleToggleAgent(a.id)">
                  <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="(a.enable ?? a.enabled ?? true) ? 'translate-x-4' : ''" />
                </button>
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click="handleDeleteAgent(a.id)"><Trash2 :size="11" /> 删除</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================== 占位视图：未实现的实体类型 ========================== -->
        <!-- ========================== 实体管理视图 - Prompt 模板 ========================== -->
        <div v-if="isEntityView && currentEntityType === 'prompt'" class="px-5 pb-6">
          <div class="mb-5 rounded-xl border border-brian-blue/20 bg-brian-blue/[0.02] dark:bg-brian-blue/5 p-4">
            <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mb-2 flex items-center gap-1.5">
              <Lightbulb :size="15" class="text-brian-blue" />
              Prompt 模板编写说明
            </h4>
            <div class="text-xs text-apple-gray-600 dark:text-apple-gray-300 space-y-1.5 leading-relaxed">
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

          <div class="flex justify-between items-center mb-4">
            <span class="text-xs text-apple-gray-400">{{ prompts.length }} 个模板</span>
            <button class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors" @click="openPromptModal()">
              <Plus :size="13" /> 添加模板
            </button>
          </div>
          <div v-if="prompts.length === 0" class="flex flex-col items-center justify-center py-16">
            <MessageSquare :size="28" class="text-apple-gray-400 mb-3" />
            <p class="text-sm text-apple-gray-500">暂无 Prompt 模板</p>
          </div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="p in prompts" :key="p.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md transition-shadow p-4"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-brian-blue/10 text-brian-blue"><MessageSquare :size="18" /></div>
                  <div class="min-w-0">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ p.title }}</h3>
                    <p class="text-[11px] text-apple-gray-400">{{ p.brief || '暂无简介' }}</p>
                  </div>
                </div>
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" :class="p.enabled ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" />
              </div>
              <div class="flex items-center justify-end gap-1.5 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20 transition-colors" @click="openPromptModal(p)"><Pencil :size="11" /> 编辑</button>
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors" @click="handleDeletePrompt(p.id)"><Trash2 :size="11" /> 删除</button>
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
            <h4 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50 mb-2 flex items-center gap-1.5">
              <Lightbulb :size="15" class="text-brian-blue" />
              编排策略说明
            </h4>
            <div class="text-xs text-apple-gray-600 dark:text-apple-gray-300 space-y-2 leading-relaxed">
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
          <div v-else class="space-y-4">
            <div
              v-for="s in orchStrategies" :key="s.id"
              class="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:shadow-md transition-shadow overflow-hidden"
            >
              <!-- 策略头部 -->
              <div class="p-4 cursor-pointer" @click="expandedOrchStrategy = expandedOrchStrategy === s.id ? null : s.id">
                <div class="flex items-start justify-between mb-2">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" :class="s.label === 'SIMPLE' ? 'bg-success-green/10 text-success-green' : 'bg-brian-blue/10 text-brian-blue'">
                      <component :is="s.label === 'SIMPLE' ? Zap : Network" :size="18" />
                    </div>
                    <div class="min-w-0">
                      <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ s.label }}</h3>
                      <p class="text-[11px] text-apple-gray-400">{{ s.enabled ? '启用' : '停用' }} · {{ s.nodeCount }} 个节点</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full" :class="s.enabled ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" />
                    <ChevronRight :size="14" class="text-apple-gray-400 transition-transform" :class="expandedOrchStrategy === s.id ? 'rotate-90' : ''" />
                  </div>
                </div>
                <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">{{ s.description }}</p>
              </div>

              <!-- 展开：JSONNode 内容 -->
              <div v-if="expandedOrchStrategy === s.id" class="border-t border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50/50 dark:bg-apple-gray-900/30">

                <!-- DAG 流程图 -->
                <div class="px-4 py-3 border-b border-apple-gray-100 dark:border-apple-gray-800">
                  <p class="text-[10px] text-apple-gray-400 uppercase tracking-wider mb-2">执行流 · {{ s.nodes.length }} 个节点 · 起始节点 {{ s.startNode }}</p>
                  <div class="flex flex-wrap items-center gap-1">
                    <template v-for="(node, ni) in s.nodes" :key="node.id">
                      <span
                        class="px-1.5 py-0.5 rounded text-[10px] font-mono border"
                        :class="nodeColor(node.type)"
                        :title="node.id + ': ' + JSON.stringify(node.params)"
                      >{{ node.type.replace(/_/g, ' ') }}</span>
                      <span v-if="ni < s.nodes.length - 1 && node.next" class="text-[9px] text-apple-gray-300">→</span>
                    </template>
                  </div>
                </div>

                <!-- 节点详情表 -->
                <div class="px-4 py-3">
                  <p class="text-[10px] text-apple-gray-400 uppercase tracking-wider mb-2">节点详情</p>
                  <div class="overflow-x-auto">
                    <table class="w-full text-[11px]">
                      <thead>
                        <tr class="text-left text-apple-gray-400 border-b border-apple-gray-200 dark:border-apple-gray-700">
                          <th class="py-1.5 pr-3 font-medium">#</th>
                          <th class="py-1.5 pr-3 font-medium">节点 ID</th>
                          <th class="py-1.5 pr-3 font-medium">节点类型</th>
                          <th class="py-1.5 pr-3 font-medium">参数</th>
                          <th class="py-1.5 pr-3 font-medium">下一节点</th>
                          <th class="py-1.5 font-medium">错误处理</th>
                        </tr>
                      </thead>
                      <tbody class="text-apple-gray-600 dark:text-apple-gray-300">
                        <tr
                          v-for="(node, ni) in s.nodes" :key="node.id"
                          class="border-b border-apple-gray-100 dark:border-apple-gray-800"
                        >
                          <td class="py-1.5 pr-3 font-mono text-apple-gray-400">{{ ni + 1 }}</td>
                          <td class="py-1.5 pr-3 font-mono text-apple-gray-500">{{ node.id }}</td>
                          <td class="py-1.5 pr-3">
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono border" :class="nodeColor(node.type)">
                              {{ node.type.replace(/_/g, ' ') }}
                            </span>
                          </td>
                          <td class="py-1.5 pr-3 font-mono text-[10px] max-w-[200px] truncate">
                            <code v-if="Object.keys(node.params).length > 0" class="text-apple-gray-500">{{ JSON.stringify(node.params) }}</code>
                            <span v-else class="text-apple-gray-300">—</span>
                          </td>
                          <td class="py-1.5 pr-3 font-mono text-[10px]" :class="node.next ? 'text-apple-gray-500' : 'text-apple-gray-300'">
                            {{ node.next || '终止' }}
                          </td>
                          <td class="py-1.5 font-mono text-[10px]" :class="node.onError ? 'text-error-red/70' : 'text-apple-gray-300'">
                            {{ node.onError || '—' }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- 配置提示 -->
                <div class="px-4 py-2 border-t border-apple-gray-200 dark:border-apple-gray-700">
                  <p class="text-[10px] text-apple-gray-400">
                    配置: 编排配置 → <span class="text-brian-blue">编排入口</span> (complexity_decompose_threshold 控制 SIMPLE/PLANNING 选择) | 
                    <span class="text-brian-blue">执行参数</span> (max_plan_retries, plan_prompt_template_id)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="isEntityView && !['provider', 'model', 'soul', 'skill', 'mcp', 'agent', 'prompt', 'orch-strategy'].includes(currentEntityType || '')" class="px-5 pb-6">
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
                  <div v-if="selectedModelIds.size > 0" class="flex justify-end pt-2">
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
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">模型用途</label>
              <textarea v-model="modelForm.usageDesc" :class="inputClass" rows="3" placeholder="描述模型的典型用途，用于模型动态选择（如：代码生成、长文本写作、数学推理）" />
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors" @click="closeModelModal">取消</button>
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
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">描述</label>
              <textarea v-model="agentForm.description" :class="inputClass" rows="2" placeholder="Agent 描述" />
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">策略 ID</label>
                <input v-model="agentForm.strategyId" type="text" :class="inputClass" />
              </div>
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">LLM ID</label>
                <input v-model="agentForm.llmId" type="text" :class="inputClass" />
              </div>
              <div>
                <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">Soul ID</label>
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
</style>
