<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Server, Cpu, Bot, Workflow, AppWindow,
  Plug, Database, Boxes, Table2, Send, MessageSquare,
  Heart, Wand2, Brain, GraduationCap, HardDrive,
  Lightbulb, Library, RefreshCw, Briefcase,
  Settings, User, MessageCircle, Sparkles,
  ChevronRight, ArrowLeft, Trash2, Loader2, AlertCircle,
  Star, FlaskConical, X, Save, Layers, FileText,
  Play, Eye, Code2, GitBranch,
} from '@lucide/vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import { configApi, agentApi, skillApi, mcpApi } from '@/api'

// ============================================================
// Types
// ============================================================

type ModuleKey = 'model' | 'soul' | 'work' | 'skill' | 'mcp' | 'agent'
type FieldType = 'text' | 'number' | 'enum' | 'boolean' | 'json'

interface RawItem { id: string; enabled?: boolean; isDefault?: boolean; [key: string]: unknown }

interface ConfigTreeItem {
  config_key: string; config_name: string; config_description: string | null
  config_type: string; config_default: unknown; config_enum_values: unknown[] | null
  readable: boolean; writable: boolean
  effective_readable: boolean; effective_writable: boolean
  current_value: unknown
}

interface ConfigTreeCategory {
  category: string; items: ConfigTreeItem[]
}

interface ConfigTreeModule {
  module: string; readable: boolean; writable: boolean
  effective_readable: boolean; effective_writable: boolean
  categories: ConfigTreeCategory[]
}

interface ConfigTreeLayer {
  layer: string; readable: boolean; writable: boolean
  modules: ConfigTreeModule[]
}

interface DisplayModule {
  key: string; name: string; desc: string
  icon: typeof Cpu; configurable: boolean
  apiModule?: ModuleKey; categoryCount: number
  categories: DisplayCategory[]
}

interface DisplayCategory {
  key: string; name: string; desc: string
  configurable: boolean; itemCount: number
  items: DisplayItem[]; isEntityCategory?: boolean
}

interface DisplayItem {
  key: string; name: string; desc: string
  valueSummary: string; configurable: boolean
  raw?: RawItem; configItem?: ConfigTreeItem
  isEntityItem?: boolean
}

interface ConfigField {
  key: string; label: string; type: FieldType
  value: string | number | boolean
  options?: { label: string; value: string | number | boolean }[]
}

// ============================================================
// Display name mappings
// ============================================================

const LAYER_NAMES: Record<string, string> = {
  BASE: '基础设施层', CORE: '核心层', AGENT: 'Agent层',
  ORCHESTRATION: '编排层', APPLICATION: '应用层',
}
const LAYER_DESCS: Record<string, string> = {
  BASE: '提供底层资源与基础配置：LLM、MCP、存储、Soul、Skill 等',
  CORE: '核心服务编排：LLM、信息、学习、MCP、技能、灵魂等核心模块',
  AGENT: 'Agent 框架：构建、库、生命周期与各类 Agent',
  ORCHESTRATION: '任务与流程编排',
  APPLICATION: '面向用户的应用入口：对话、文档、画像等',
}
const LAYER_ICONS: Record<string, typeof Server> = {
  BASE: Server, CORE: Cpu, AGENT: Bot, ORCHESTRATION: Workflow, APPLICATION: AppWindow,
}

const MODULE_NAMES: Record<string, string> = {
  llm_provider: 'LLM Provider', soul_provider: 'Soul Provider', skill_provider: 'Skill Provider',
  mcp_provider: 'MCP Provider', prompts_provider: 'Prompts Provider', log_provider: 'Log Provider',
  mq_provider: 'MQ Provider', graphdb_provider: 'GraphDB Provider', vectordb_provider: 'VectorDB Provider',
  relationdb_provider: 'RelationDB Provider',
  llm_core: 'LLM Core', info_core: 'Info Core', mcp_core: 'MCP Core',
  skill_core: 'Skill Core', soul_core: 'Soul Core',
  agent_library: 'Agent Library', agent_builder: 'Agent Builder', agent_execution: 'Agent Execution',
  agent_strategy: 'Agent Strategy', agent_context: 'Agent Context',
  entry: 'Entry', strategy: 'Strategy', execution: 'Execution',
  visualization: 'Visualization', jsonnode: 'JSON Node',
  chat: 'Chat', self_learning: 'Self Learning', user_profile: 'User Profile', config: 'Config',
}

const MODULE_ICONS: Record<string, typeof Cpu> = {
  llm_provider: Cpu, mcp_provider: Plug, soul_provider: Heart, skill_provider: Wand2,
  prompts_provider: MessageSquare, log_provider: FileText, mq_provider: Send,
  graphdb_provider: Database, vectordb_provider: Boxes, relationdb_provider: Table2,
  llm_core: Cpu, info_core: Brain, mcp_core: Plug, skill_core: Wand2, soul_core: Heart,
  agent_library: Library, agent_builder: Bot, agent_execution: Play,
  agent_strategy: GitBranch, agent_context: Layers,
  entry: Workflow, strategy: GitBranch, execution: Play, visualization: Eye, jsonnode: Code2,
  chat: MessageCircle, self_learning: GraduationCap, user_profile: User, config: Settings,
}

const CATEGORY_NAMES: Record<string, string> = {
  basic: '基础设置', quota: '配额设置', aging: '老化设置', config: '配置', tag_config: '标签配置',
  summary_config: '摘要配置', vector_config: '向量配置', context_config: '上下文配置',
  opt_rule: '优化规则', weight: '权重设置', interval: '间隔设置',
}

const ENTITY_MODULES: Record<string, { apiModule: ModuleKey; label: string }> = {
  llm_provider: { apiModule: 'model', label: '模型管理' },
  soul_provider: { apiModule: 'soul', label: 'Soul 管理' },
  skill_provider: { apiModule: 'skill', label: 'Skill 管理' },
  mcp_provider: { apiModule: 'mcp', label: 'MCP 管理' },
}

const AGENT_ENTITY_MODULE = { moduleKey: 'meta_agent', apiModule: 'agent' as ModuleKey, label: 'Agent 管理' }

// ============================================================
// State
// ============================================================

const treeLoading = ref(false)
const treeError = ref('')
const configTree = ref<ConfigTreeLayer[]>([])

const currentLevel = ref<1 | 2 | 3 | 4>(1)
const selectedLayerKey = ref('')
const selectedModuleKey = ref('')
const selectedCategory = ref<DisplayCategory | null>(null)

const selectedLayer = computed(() => displayLayers.value.find(l => l.key === selectedLayerKey.value) || null)
const currentModule = computed(() => selectedLayer.value?.modules.find(m => m.key === selectedModuleKey.value) || null)
const currentApiModule = computed(() => currentModule.value?.apiModule)

const breadcrumb = computed(() => {
  const items: { label: string; level: number }[] = [{ label: '整体框架', level: 1 }]
  if (currentLevel.value >= 2 && selectedLayer.value) items.push({ label: selectedLayer.value.name, level: 2 })
  if (currentLevel.value >= 3 && currentModule.value) items.push({ label: currentModule.value.name, level: 3 })
  if (currentLevel.value >= 4 && selectedCategory.value) items.push({ label: selectedCategory.value.name, level: 4 })
  return items
})

function goToLevel(level: number) {
  if (level <= 1) { currentLevel.value = 1; selectedLayerKey.value = ''; selectedModuleKey.value = ''; selectedCategory.value = null; closeModal(); return }
  if (level === 2) { currentLevel.value = 2; selectedModuleKey.value = ''; selectedCategory.value = null }
  else if (level === 3) { currentLevel.value = 3; selectedCategory.value = null }
  else if (level === 4) { currentLevel.value = 4 }
  closeModal()
}

function selectLayer(layer: DisplayLayer) {
  selectedLayerKey.value = layer.key; selectedModuleKey.value = ''; selectedCategory.value = null; currentLevel.value = 2
}

async function selectModule(mod: DisplayModule) {
  selectedModuleKey.value = mod.key; selectedCategory.value = null; currentLevel.value = 3
  if (mod.apiModule && !loaded.value[mod.apiModule]) await loaders[mod.apiModule]()
}

function selectCategory(cat: DisplayCategory) {
  selectedCategory.value = cat; currentLevel.value = 4
  if (cat.isEntityCategory && currentApiModule.value && !loaded.value[currentApiModule.value]) {
    loaders[currentApiModule.value]()
  }
}

// ============================================================
// Build display layers from config tree
// ============================================================

interface DisplayLayer {
  key: string; name: string; desc: string
  icon: typeof Server; hasConfigurable: boolean
  modules: DisplayModule[]
}

const displayLayers = computed<DisplayLayer[]>(() => {
  const layers: DisplayLayer[] = []

  for (const layer of configTree.value) {
    const modules: DisplayModule[] = []

    for (const mod of layer.modules) {
      const entityInfo = ENTITY_MODULES[mod.module]
      const categories: DisplayCategory[] = []

      for (const cat of mod.categories) {
        const items: DisplayItem[] = cat.items.map(item => ({
          key: item.config_key,
          name: item.config_name,
          desc: item.config_description || '',
          valueSummary: formatValueSummary(item),
          configurable: item.effective_writable,
          configItem: item,
        }))
        categories.push({
          key: cat.category,
          name: CATEGORY_NAMES[cat.category] || cat.category,
          desc: `${CATEGORY_NAMES[cat.category] || cat.category}相关配置`,
          configurable: items.some(i => i.configurable),
          itemCount: items.length,
          items,
        })
      }

      if (entityInfo) {
        categories.push({
          key: 'entity', name: entityInfo.label, desc: `管理 ${entityInfo.label} 实体`,
          configurable: true, itemCount: itemCountFor(entityInfo.apiModule),
          items: [], isEntityCategory: true,
        })
      }

      const hasConfigurable = categories.some(c => c.configurable)
      modules.push({
        key: mod.module,
        name: MODULE_NAMES[mod.module] || mod.module,
        desc: MODULE_NAMES[mod.module] ? `${MODULE_NAMES[mod.module]} 配置` : mod.module,
        icon: MODULE_ICONS[mod.module] || Settings,
        configurable: hasConfigurable,
        apiModule: entityInfo?.apiModule,
        categoryCount: categories.length,
        categories,
      })
    }

    if (layer.layer === 'AGENT' && !modules.some(m => m.key === AGENT_ENTITY_MODULE.moduleKey)) {
      modules.push({
        key: AGENT_ENTITY_MODULE.moduleKey,
        name: 'Meta Agent', desc: 'Agent 实体管理与配置',
        icon: Bot, configurable: true,
        apiModule: AGENT_ENTITY_MODULE.apiModule,
        categoryCount: 1,
        categories: [{
          key: 'entity', name: AGENT_ENTITY_MODULE.label, desc: '管理 Agent 实体',
          configurable: true, itemCount: itemCountFor('agent'),
          items: [], isEntityCategory: true,
        }],
      })
    }

    layers.push({
      key: layer.layer,
      name: LAYER_NAMES[layer.layer] || layer.layer,
      desc: LAYER_DESCS[layer.layer] || '',
      icon: LAYER_ICONS[layer.layer] || Layers,
      hasConfigurable: modules.some(m => m.configurable),
      modules,
    })
  }

  return layers
})

function formatValueSummary(item: ConfigTreeItem): string {
  const val = item.current_value ?? item.config_default
  if (val === null || val === undefined) return '未设置'
  if (typeof val === 'boolean') return val ? '启用' : '停用'
  if (typeof val === 'number') return String(val)
  return String(val)
}

// ============================================================
// Load config tree
// ============================================================

async function loadConfigTree() {
  treeLoading.value = true; treeError.value = ''
  try {
    const res = await configApi.configTree()
    configTree.value = (res.config?.layers as ConfigTreeLayer[]) || []
  } catch (e: unknown) {
    treeError.value = (e as Error).message
  } finally {
    treeLoading.value = false
  }
}

onMounted(() => { loadConfigTree() })

// ============================================================
// Entity CRUD data
// ============================================================

const loading = ref<Record<string, boolean>>({ model: false, soul: false, work: false, skill: false, mcp: false, agent: false })
const loaded = ref<Record<string, boolean>>({ model: false, soul: false, work: false, skill: false, mcp: false, agent: false })
const errorMsg = ref<Record<string, string>>({ model: '', soul: '', work: '', skill: '', mcp: '', agent: '' })
const models = ref<RawItem[]>([])
const souls = ref<RawItem[]>([])
const works = ref<RawItem[]>([])
const skills = ref<RawItem[]>([])
const mcps = ref<RawItem[]>([])
const agents = ref<RawItem[]>([])

function itemCountFor(m: ModuleKey): number {
  const map: Record<ModuleKey, () => unknown[]> = {
    model: () => models.value, soul: () => souls.value, work: () => works.value,
    skill: () => skills.value, mcp: () => mcps.value, agent: () => agents.value,
  }
  return map[m]?.().length ?? 0
}

function buildEntityFields(raw: RawItem, m: ModuleKey): ConfigField[] {
  switch (m) {
    case 'model': return [
      { key: 'providerName', label: '提供商', type: 'text', value: String(raw.providerName || '') },
      { key: 'modelName', label: '模型名称', type: 'text', value: String(raw.modelName || '') },
      { key: 'maxTokens', label: '最大 Token', type: 'number', value: Number(raw.maxTokens || 0) },
      { key: 'status', label: '状态', type: 'enum', value: String(raw.status || 'active'), options: [{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }] },
      { key: 'isDefault', label: '设为默认', type: 'boolean', value: !!raw.isDefault },
    ] as ConfigField[]
    case 'soul': return [
      { key: 'name', label: '名称', type: 'text', value: String(raw.name || '') },
      { key: 'description', label: '描述', type: 'text', value: String(raw.description || '') },
      { key: 'traits', label: '特性 (JSON)', type: 'json', value: JSON.stringify(raw.traits || [], null, 2) },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!raw.enabled },
    ] as ConfigField[]
    case 'work': return [
      { key: 'name', label: '名称', type: 'text', value: String(raw.name || '') },
      { key: 'description', label: '描述', type: 'text', value: String(raw.description || '') },
      { key: 'steps', label: '步骤 (JSON)', type: 'json', value: JSON.stringify(raw.steps || [], null, 2) },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!raw.enabled },
    ] as ConfigField[]
    case 'skill': return [
      { key: 'name', label: '名称', type: 'text', value: String(raw.name || '') },
      { key: 'description', label: '描述', type: 'text', value: String(raw.description || '') },
      { key: 'category', label: '分类', type: 'text', value: String(raw.category || '') },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!raw.enabled },
    ] as ConfigField[]
    case 'mcp': return [
      { key: 'displayName', label: '名称', type: 'text', value: String(raw.displayName || raw.name || '') },
      { key: 'version', label: '版本', type: 'text', value: String(raw.version || '') },
      { key: 'description', label: '描述', type: 'text', value: String(raw.description || '') },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!raw.enabled },
    ] as ConfigField[]
    case 'agent': return [
      { key: 'name', label: '名称', type: 'text', value: String(raw.name || '') },
      { key: 'type', label: '类型', type: 'text', value: String(raw.type || '') },
      { key: 'description', label: '描述', type: 'text', value: String(raw.description || '') },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!raw.enabled },
    ] as ConfigField[]
  }
}

function buildEntityItems(m: ModuleKey): DisplayItem[] {
  const items = m === 'model' ? models.value : m === 'soul' ? souls.value : m === 'work' ? works.value : m === 'skill' ? skills.value : m === 'mcp' ? mcps.value : agents.value
  return items.map(raw => ({
    key: raw.id, name: String(raw.name || raw.modelName || raw.displayName || ''),
    desc: String(raw.description || raw.providerName || ''),
    valueSummary: raw.enabled !== false ? '启用' : '停用',
    configurable: true, raw, isEntityItem: true,
  }))
}

const currentItems = computed<DisplayItem[]>(() => {
  if (selectedCategory.value?.isEntityCategory && currentApiModule.value) {
    return buildEntityItems(currentApiModule.value)
  }
  return selectedCategory.value?.items || []
})

// ============================================================
// Toast
// ============================================================

const toastVisible = ref(false); const toastMsg = ref(''); const toastType = ref<'success' | 'error'>('success')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string, type: 'success' | 'error' = 'error') {
  toastMsg.value = msg; toastType.value = type; toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 3000)
}

// ============================================================
// Entity loaders
// ============================================================

async function loadModels() {
  loading.value.model = true
  try { models.value = await configApi.model.list() as unknown as RawItem[]; loaded.value.model = true }
  catch (e: unknown) { errorMsg.value.model = (e as Error).message } finally { loading.value.model = false }
}
async function loadSouls() {
  loading.value.soul = true
  try { souls.value = await configApi.soul.list() as unknown as RawItem[]; loaded.value.soul = true }
  catch (e: unknown) { errorMsg.value.soul = (e as Error).message } finally { loading.value.soul = false }
}
async function loadWorks() {
  loading.value.work = true
  try { works.value = await configApi.work.list() as unknown as RawItem[]; loaded.value.work = true }
  catch (e: unknown) { errorMsg.value.work = (e as Error).message } finally { loading.value.work = false }
}
async function loadSkills() {
  loading.value.skill = true
  try { const r = await skillApi.list() as { skills: unknown[] }; skills.value = r.skills as RawItem[]; loaded.value.skill = true }
  catch (e: unknown) { errorMsg.value.skill = (e as Error).message } finally { loading.value.skill = false }
}
async function loadMcps() {
  loading.value.mcp = true
  try { const r = await mcpApi.installed() as { installed: unknown[] }; mcps.value = r.installed as RawItem[]; loaded.value.mcp = true }
  catch (e: unknown) { errorMsg.value.mcp = (e as Error).message } finally { loading.value.mcp = false }
}
async function loadAgents() {
  loading.value.agent = true
  try { const r = await agentApi.list() as { agents: unknown[] }; agents.value = r.agents as RawItem[]; loaded.value.agent = true }
  catch (e: unknown) { errorMsg.value.agent = (e as Error).message } finally { loading.value.agent = false }
}

const loaders: Record<ModuleKey, () => Promise<void>> = { model: loadModels, soul: loadSouls, work: loadWorks, skill: loadSkills, mcp: loadMcps, agent: loadAgents }
async function refreshCurrent() {
  const m = currentApiModule.value
  if (m) await loaders[m]()
  await loadConfigTree()
}

// ============================================================
// Modal - shared for config items and entity items
// ============================================================

const modalVisible = ref(false); const readOnly = ref(false); const submitting = ref(false)
const selectedConfig = ref<DisplayItem | null>(null); const formFields = ref<ConfigField[]>([]); const jsonErrors = ref<Record<string, string>>({})
const isConfigModal = ref(false)
const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue/30 disabled:opacity-60 disabled:cursor-not-allowed'

function buildConfigFields(item: ConfigTreeItem): ConfigField[] {
  const val = item.current_value ?? item.config_default
  const type = item.config_type.toUpperCase()
  if (type === 'BOOLEAN' || type === 'BOOL') {
    return [{ key: 'value', label: item.config_name, type: 'boolean', value: !!val }]
  }
  if (type === 'ENUM' && item.config_enum_values) {
    const enumVals = item.config_enum_values as string[]
    return [{ key: 'value', label: item.config_name, type: 'enum', value: String(val ?? ''), options: enumVals.map(v => ({ label: v, value: v })) }]
  }
  if (type === 'INT' || type === 'INTEGER') {
    return [{ key: 'value', label: item.config_name, type: 'number', value: Number(val ?? 0) }]
  }
  if (type === 'DOUBLE' || type === 'FLOAT' || type === 'NUMBER') {
    return [{ key: 'value', label: item.config_name, type: 'number', value: Number(val ?? 0) }]
  }
  return [{ key: 'value', label: item.config_name, type: 'text', value: String(val ?? '') }]
}

function openEditModal(item: DisplayItem) {
  selectedConfig.value = item; jsonErrors.value = {}
  if (item.isEntityItem) {
    isConfigModal.value = false
    formFields.value = (currentApiModule.value ? buildEntityFields(item.raw!, currentApiModule.value) : []).map(f => ({ ...f }))
    readOnly.value = !item.configurable
  } else if (item.configItem) {
    isConfigModal.value = true
    formFields.value = buildConfigFields(item.configItem).map(f => ({ ...f }))
    readOnly.value = !item.configItem.effective_writable
  } else {
    readOnly.value = true; formFields.value = []
  }
  modalVisible.value = true
}

function closeModal() { modalVisible.value = false; selectedConfig.value = null; formFields.value = []; jsonErrors.value = {}; readOnly.value = false; isConfigModal.value = false }

function buildSubmitData() {
  const data: Record<string, unknown> = {}; jsonErrors.value = {}
  for (const f of formFields.value) {
    if (f.type === 'json') { try { data[f.key] = JSON.parse(String(f.value)) } catch { jsonErrors.value[f.key] = 'JSON 格式错误'; return null } }
    else if (f.type === 'number') data[f.key] = Number(f.value)
    else data[f.key] = f.value
  }
  return data
}

async function submitForm() {
  if (!selectedConfig.value) return
  const data = buildSubmitData(); if (!data) { showToast('请修正表单错误'); return }
  submitting.value = true
  try {
    if (isConfigModal.value && selectedConfig.value.configItem) {
      await configApi.configItem.update(selectedConfig.value.configItem.config_key, data.value)
      showToast('配置已保存', 'success')
      closeModal()
      await loadConfigTree()
    } else {
      const m = currentApiModule.value; if (!m) return
      const id = selectedConfig.value.key
      if (m === 'model') await configApi.model.update(id, data)
      else if (m === 'soul') await configApi.soul.update(id, data)
      else if (m === 'work') await configApi.work.update(id, data)
      else if (m === 'skill') await skillApi.update(id, data)
      else if (m === 'mcp') await configApi.mcp.update(id, data)
      else if (m === 'agent') await agentApi.update(id, data)
      showToast('配置已保存', 'success'); closeModal(); await loaders[m]()
    }
  } catch (e) { showToast(e instanceof Error ? e.message : '保存失败') } finally { submitting.value = false }
}

async function handleToggle(raw: RawItem) {
  const m = currentApiModule.value; if (!m) return
  try {
    if (m === 'soul') await configApi.soul.update(raw.id, { enabled: !raw.enabled })
    else if (m === 'work') await configApi.work.update(raw.id, { enabled: !raw.enabled })
    else if (m === 'skill') await skillApi.toggle(raw.id)
    else if (m === 'mcp') await mcpApi.toggle(raw.id)
    else if (m === 'agent') await agentApi.toggle(raw.id)
    showToast('状态已切换', 'success'); await loaders[m]()
  } catch (e) { showToast(e instanceof Error ? e.message : '操作失败') }
}

async function handleDelete(raw: RawItem) {
  const m = currentApiModule.value; if (!m) return
  try {
    if (m === 'model') await configApi.model.delete(raw.id)
    else if (m === 'soul') await configApi.soul.delete(raw.id)
    else if (m === 'work') await configApi.work.delete(raw.id)
    else if (m === 'skill') await skillApi.delete(raw.id)
    else if (m === 'mcp') await mcpApi.uninstall(raw.id)
    else if (m === 'agent') await agentApi.delete(raw.id)
    showToast('已删除', 'success'); await loaders[m]()
  } catch (e) { showToast(e instanceof Error ? e.message : '删除失败') }
}

async function handleSetDefault(raw: RawItem) {
  try { await configApi.model.setDefault(raw.id); showToast('已设为默认', 'success'); await loadModels() }
  catch (e) { showToast(e instanceof Error ? e.message : '设置失败') }
}

async function handleTestModel(raw: RawItem) {
  try { const r = await configApi.model.test(raw.id); showToast(r.success ? `连接成功 · ${r.latency}ms` : r.message, r.success ? 'success' : 'error') }
  catch (e) { showToast(e instanceof Error ? e.message : '测试失败') }
}
</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative">
    <NeuralBackground />
    <Header />
    <div class="pt-16 h-full relative z-10 flex flex-col">
      <div class="flex items-center gap-1.5 px-6 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" :class="{ 'opacity-40 pointer-events-none': currentLevel === 1 }" :disabled="currentLevel === 1" @click="goToLevel(currentLevel - 1)"><ArrowLeft :size="16" /></button>
        <Layers :size="15" class="text-brian-blue flex-shrink-0" />
        <template v-for="(crumb, idx) in breadcrumb" :key="idx">
          <ChevronRight v-if="idx > 0" :size="13" class="text-apple-gray-400" />
          <button class="text-sm font-medium px-1.5 py-0.5 rounded" :class="idx === breadcrumb.length - 1 ? 'cursor-default' : 'text-apple-gray-400 hover:text-brian-blue'" @click="goToLevel(crumb.level)">{{ crumb.label }}</button>
        </template>
        <button class="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-secondary" @click="refreshCurrent"><RefreshCw :size="13" /> 刷新</button>
      </div>

      <main class="flex-1 overflow-y-auto bg-apple-gray-50 dark:bg-apple-gray-900">
        <!-- Loading -->
        <div v-if="treeLoading" class="flex justify-center py-20"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>

        <!-- Error -->
        <div v-else-if="treeError" class="flex flex-col items-center py-20">
          <AlertCircle :size="28" class="text-error-red mb-3" /><p class="text-sm text-apple-gray-500 mb-3">{{ treeError }}</p><button class="btn-primary" @click="loadConfigTree">重试</button>
        </div>

        <!-- L1: Framework layers -->
        <div v-else-if="currentLevel === 1" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5"><h2 class="text-xl font-semibold">系统整体框架</h2><p class="text-sm text-apple-gray-400 mt-1"><span class="text-success-green">绿色 = 可配置</span> · <span class="text-apple-gray-400">灰色 = 不可配置</span></p></div>
          <div class="space-y-3">
            <div v-for="layer in displayLayers" :key="layer.key" class="group cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-md" :class="layer.hasConfigurable ? 'border-success-green/30 bg-success-green/[0.04] hover:border-success-green/50' : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800'" @click="selectLayer(layer)">
              <div class="flex items-center gap-3 mb-3">
                <div class="p-2 rounded-lg" :class="layer.hasConfigurable ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400'"><component :is="layer.icon" :size="18" /></div>
                <div class="min-w-0"><div class="flex items-center gap-2"><h3 class="font-semibold">{{ layer.name }}</h3><span class="text-[11px] text-apple-gray-400">{{ layer.key }}</span></div><p class="text-xs text-apple-gray-400 truncate">{{ layer.desc }}</p></div>
                <div class="ml-auto flex items-center gap-2 flex-shrink-0">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full" :class="layer.hasConfigurable ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500'"><span class="w-1.5 h-1.5 rounded-full" :class="layer.hasConfigurable ? 'bg-success-green' : 'bg-apple-gray-400'" />{{ layer.hasConfigurable ? '含可配置模块' : '不可配置' }}</span>
                  <ChevronRight :size="16" class="text-apple-gray-400 group-hover:text-brian-blue" />
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <div v-for="m in layer.modules" :key="m.key" class="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5" :class="m.configurable ? 'bg-success-green/10 text-success-green border border-success-green/20' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400'"><component :is="m.icon" :size="12" />{{ m.name }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- L2: Layer modules -->
        <div v-else-if="currentLevel === 2 && selectedLayer" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5 flex items-center gap-2.5"><div class="p-2 rounded-lg bg-brian-blue/10"><component :is="selectedLayer.icon" :size="18" class="text-brian-blue" /></div><div><h2 class="text-lg font-semibold">{{ selectedLayer.name }}</h2><p class="text-xs text-apple-gray-400">{{ selectedLayer.desc }}</p></div></div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="m in selectedLayer.modules" :key="m.key" class="group cursor-pointer rounded-xl border p-5 transition-all hover:shadow-md" :class="m.configurable ? 'border-success-green/40 bg-success-green/[0.04] hover:border-success-green/60' : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800'" @click="selectModule(m)">
              <div class="flex items-start justify-between mb-3"><div class="flex items-center gap-2.5"><div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="m.configurable ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400'"><component :is="m.icon" :size="18" /></div><div><h3 class="font-semibold">{{ m.name }}</h3><p class="text-[11px]" :class="m.configurable ? 'text-success-green' : 'text-apple-gray-400'">{{ m.configurable ? '可配置' : '不可配置' }}</p></div></div><span class="w-2.5 h-2.5 rounded-full mt-1.5" :class="m.configurable ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" /></div>
              <p class="text-xs text-apple-gray-400 mb-3 min-h-[32px]">{{ m.desc }}</p>
              <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700"><span class="text-[11px] text-apple-gray-400">{{ m.categoryCount }} 个配置分类</span><ChevronRight :size="14" class="text-apple-gray-400 group-hover:text-brian-blue" /></div>
            </div>
          </div>
        </div>

        <!-- L3: Categories -->
        <div v-else-if="currentLevel === 3 && currentModule" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5 flex items-center gap-2.5"><div class="p-2 rounded-lg bg-brian-blue/10"><component :is="currentModule.icon" :size="18" class="text-brian-blue" /></div><div><h2 class="text-lg font-semibold">{{ currentModule.name }}</h2><p class="text-xs text-apple-gray-400">{{ currentModule.desc }}</p></div></div>
          <div v-if="currentApiModule && loading[currentApiModule]" class="flex justify-center py-20"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="currentApiModule && errorMsg[currentApiModule]" class="flex flex-col items-center py-20">
            <AlertCircle :size="28" class="text-error-red mb-3" /><p class="text-sm text-apple-gray-500 mb-3">{{ errorMsg[currentApiModule] }}</p><button class="btn-primary" @click="refreshCurrent">重试</button>
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="cat in currentModule.categories" :key="cat.key" class="group cursor-pointer rounded-xl border p-5 transition-all hover:shadow-md" :class="cat.configurable ? 'border-success-green/40 bg-success-green/[0.04] hover:border-success-green/60' : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800'" @click="selectCategory(cat)">
              <div class="flex items-start justify-between mb-3"><div><h3 class="font-semibold">{{ cat.name }}</h3><p class="text-[11px]" :class="cat.configurable ? 'text-success-green' : 'text-apple-gray-400'">{{ cat.configurable ? '可配置' : '不可配置' }}</p></div><span class="w-2.5 h-2.5 rounded-full mt-1.5" :class="cat.configurable ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" /></div>
              <p class="text-xs text-apple-gray-400 mb-3 min-h-[32px]">{{ cat.desc }}</p>
              <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700"><span class="text-[11px] text-apple-gray-400">{{ cat.itemCount }} 个配置项</span><ChevronRight :size="14" class="text-apple-gray-400 group-hover:text-brian-blue" /></div>
            </div>
          </div>
        </div>

        <!-- L4: Config items -->
        <div v-else-if="currentLevel === 4 && currentModule && selectedCategory" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5 flex items-center gap-2.5"><div class="p-2 rounded-lg bg-brian-blue/10"><component :is="currentModule.icon" :size="18" class="text-brian-blue" /></div><div><h2 class="text-lg font-semibold">{{ selectedCategory.name }}</h2><p class="text-xs text-apple-gray-400">{{ selectedCategory.desc }} · {{ currentItems.length }} 个配置项</p></div></div>
          <div v-if="currentItems.length === 0" class="flex flex-col items-center py-20 text-apple-gray-400"><component :is="currentModule.icon" :size="28" class="text-apple-gray-300 mb-2" /><p>暂无配置项</p></div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="item in currentItems" :key="item.key" class="rounded-xl border p-5 transition-all" :class="item.configurable ? 'border-success-green/40 bg-success-green/[0.04] hover:shadow-md' : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800'">
              <div class="cursor-pointer" @click="openEditModal(item)">
                <div class="flex items-start justify-between mb-3"><div class="flex items-center gap-2.5 min-w-0"><div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="item.configurable ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400'"><component :is="currentModule.icon" :size="18" /></div><div class="min-w-0"><h3 class="font-semibold truncate">{{ item.name }}</h3><p class="text-[11px]" :class="item.configurable ? 'text-success-green' : 'text-apple-gray-400'">{{ item.configurable ? '可配置' : '不可配置' }}</p></div></div><span class="w-2.5 h-2.5 rounded-full mt-1.5" :class="item.configurable ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" /></div>
                <p class="text-xs text-apple-gray-400 mb-2 min-h-[32px] line-clamp-2">{{ item.desc }}</p>
                <p class="text-[11px] text-apple-gray-600 dark:text-apple-gray-300 font-mono bg-apple-gray-100 dark:bg-apple-gray-900/60 rounded px-2 py-1 truncate">{{ item.valueSummary }}</p>
              </div>
              <div v-if="item.isEntityItem && currentApiModule" class="flex items-center justify-end gap-1.5 mt-3 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <button v-if="currentApiModule === 'model'" class="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20" @click.stop="handleSetDefault(item.raw!)"><Star :size="11" /> 默认</button>
                <button v-if="currentApiModule === 'model'" class="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200" @click.stop="handleTestModel(item.raw!)"><FlaskConical :size="11" /> 测试</button>
                <button v-if="currentApiModule !== 'model' && currentApiModule !== 'mcp' && item.raw && item.raw.enabled !== undefined" class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0" :class="item.raw.enabled ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click.stop="handleToggle(item.raw!)"><span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform" :class="item.raw.enabled ? 'translate-x-4' : ''" /></button>
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] rounded text-error-red hover:bg-error-red/10" @click.stop="handleDelete(item.raw!)"><Trash2 :size="11" /> 删除</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- L5: Edit modal -->
    <Transition name="modal">
      <div v-if="modalVisible" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeModal" />
        <div class="relative w-full max-w-lg max-h-[85vh] flex flex-col block-card rounded-2xl">
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div class="min-w-0"><div class="flex items-center gap-2"><h3 class="font-semibold truncate">{{ selectedConfig?.name }}</h3><span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full" :class="readOnly ? 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500' : 'bg-success-green/10 text-success-green'"><span class="w-1.5 h-1.5 rounded-full" :class="readOnly ? 'bg-apple-gray-400' : 'bg-success-green'" />{{ readOnly ? '只读' : '可配置' }}</span></div><p class="text-xs text-apple-gray-400 mt-0.5">{{ selectedConfig?.desc }}</p></div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="closeModal"><X :size="18" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto space-y-4">
            <div v-if="readOnly" class="flex items-start gap-2 text-xs text-warning-orange bg-warning-orange/10 rounded-lg p-3"><AlertCircle :size="14" class="flex-shrink-0 mt-0.5" /><span>该配置项当前不可编辑，以下为只读展示。</span></div>
            <div v-for="field in formFields" :key="field.key">
              <label class="block text-xs font-medium text-apple-gray-500 mb-1.5">{{ field.label }}</label>
              <input v-if="field.type === 'text'" v-model="field.value" type="text" :disabled="readOnly" :class="inputClass" />
              <input v-else-if="field.type === 'number'" v-model.number="field.value" type="number" :disabled="readOnly" :class="inputClass" />
              <button v-else-if="field.type === 'boolean'" :disabled="readOnly" class="relative w-11 h-6 rounded-full transition-colors disabled:opacity-60" :class="field.value ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click="!readOnly && (field.value = !field.value)"><span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" :class="field.value ? 'translate-x-5' : ''" /></button>
              <select v-else-if="field.type === 'enum'" :value="String(field.value)" :disabled="readOnly" :class="inputClass" @change="field.value = ($event.target as HTMLSelectElement).value">
                <option v-for="opt in field.options" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
              </select>
              <textarea v-else-if="field.type === 'json'" :value="String(field.value)" :disabled="readOnly" rows="4" :class="`${inputClass} font-mono text-xs`" @input="field.value = ($event.target as HTMLTextAreaElement).value" />
              <p v-if="jsonErrors[field.key]" class="text-xs text-error-red mt-1">{{ jsonErrors[field.key] }}</p>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="btn-secondary" @click="closeModal">取消</button>
            <button v-if="!readOnly" class="btn-primary flex items-center gap-1.5" :disabled="submitting" @click="submitForm"><Loader2 v-if="submitting" :size="14" class="animate-spin" /><Save v-else :size="14" />{{ submitting ? '保存中...' : '保存' }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="toastVisible" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-lg text-sm font-medium shadow-lg" :class="toastType === 'success' ? 'bg-success-green text-white' : 'bg-error-red text-white'">{{ toastMsg }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.modal-enter-active { transition: all 0.2s ease-out; }
.modal-leave-active { transition: all 0.15s ease-in; }
.modal-enter-from { opacity: 0; }
.modal-enter-from > div:not(.absolute) { transform: scale(0.95); }
.modal-leave-to { opacity: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>