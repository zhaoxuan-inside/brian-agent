<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Server, Cpu, Bot, Workflow, AppWindow,
  Plug, Database, Boxes, Table2, Send, MessageSquare,
  Heart, Wand2, GitBranch, Brain, GraduationCap, HardDrive,
  Lightbulb, Library, RefreshCw, ClipboardList, Briefcase, PenLine,
  Settings, FileText, Network, User, MessageCircle, Sparkles,
  ChevronRight, ArrowLeft, Trash2, Loader2, Check, AlertCircle,
  Star, FlaskConical, X, Save, Layers,
} from '@lucide/vue'
import NeuralBackground from '../components/NeuralBackground.vue'
import Header from '../components/Header.vue'
import { configApi, agentApi, skillApi, mcpMarketApi } from '../api'

// ============================================================
// 类型定义
// ============================================================

type ModuleKey = 'model' | 'soul' | 'work' | 'skill' | 'mcp' | 'agent'
type FieldType = 'text' | 'number' | 'enum' | 'boolean' | 'json'

interface ModelItem {
  id: string
  providerName: string
  modelName: string
  maxTokens: number
  supportsVision: boolean
  supportsTools: boolean
  isDefault: boolean
  status: string
  [key: string]: unknown
}

interface SoulItem {
  id: string
  name: string
  description: string
  traits: string[]
  enabled: boolean
  [key: string]: unknown
}

interface WorkItem {
  id: string
  name: string
  description: string
  steps: string[]
  enabled: boolean
  [key: string]: unknown
}

interface SkillItem {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
  [key: string]: unknown
}

interface McpItem {
  id: string
  displayName: string
  version: string
  description: string
  enabled: boolean
  [key: string]: unknown
}

interface AgentItem {
  id: string
  name: string
  type: string
  description: string
  enabled: boolean
  soul: string
  model: string
  works: string[]
  skills: string[]
  mcps: string[]
  [key: string]: unknown
}

interface RawItem {
  id: string
  enabled?: boolean
  isDefault?: boolean
  [key: string]: unknown
}

type IconCtor = typeof Cpu

interface FrameworkLayer {
  key: string
  name: string
  nameEn: string
  desc: string
  icon: IconCtor
  modules: FrameworkModule[]
}

interface FrameworkModule {
  key: string
  name: string
  desc: string
  icon: IconCtor
  configurable: boolean
  apiModule?: ModuleKey
}

interface ConfigCategoryDisplay {
  key: string
  name: string
  desc: string
  configurable: boolean
  itemCount: number
  items?: ConfigItemDisplay[]
}

interface ConfigField {
  key: string
  label: string
  type: FieldType
  value: string | number | boolean
  options?: { label: string; value: string | number | boolean }[]
}

interface ConfigItemDisplay {
  key: string
  name: string
  desc: string
  valueSummary: string
  configurable: boolean
  raw?: RawItem
  fields?: ConfigField[]
}

// ============================================================
// 整体框架静态数据（第一层 / 第二层）
// ============================================================

const frameworkLayers: FrameworkLayer[] = [
  {
    key: 'base', name: '基础设施层', nameEn: 'Base',
    desc: '提供底层资源与基础配置：模型、MCP、存储、Soul、Skill 等',
    icon: Server,
    modules: [
      { key: 'llm-provider', name: 'LLM Provider', desc: 'LLM 提供商管理与模型配置', icon: Cpu, configurable: true, apiModule: 'model' },
      { key: 'mcp-provider', name: 'MCP Provider', desc: 'MCP 服务提供商管理', icon: Plug, configurable: true, apiModule: 'mcp' },
      { key: 'graphdb', name: 'GraphDB', desc: '图数据库后端配置', icon: Database, configurable: false },
      { key: 'vectordb', name: 'VectorDB', desc: '向量数据库配置', icon: Boxes, configurable: false },
      { key: 'relationdb', name: 'RelationDB', desc: '关系型数据库配置', icon: Table2, configurable: false },
      { key: 'mq', name: 'MQ', desc: '消息队列配置', icon: Send, configurable: false },
      { key: 'prompts', name: 'Prompts', desc: '提示词模板配置', icon: MessageSquare, configurable: false },
      { key: 'soul', name: 'Soul', desc: '灵魂角色 CRUD 与内容编辑', icon: Heart, configurable: true, apiModule: 'soul' },
      { key: 'skill', name: 'Skill', desc: '技能 CRUD 与内容编辑', icon: Wand2, configurable: true, apiModule: 'skill' },
      { key: 'strategy', name: 'Strategy', desc: '策略配置', icon: GitBranch, configurable: false },
    ],
  },
  {
    key: 'core', name: '核心层', nameEn: 'Core',
    desc: '核心服务编排：LLM、信息、学习、MCP、技能、灵魂等核心模块',
    icon: Cpu,
    modules: [
      { key: 'llm-core', name: 'LLM Core', desc: 'LLM 调用核心', icon: Cpu, configurable: false },
      { key: 'info-core', name: 'Info Core', desc: '信息/记忆核心', icon: Brain, configurable: false },
      { key: 'learning-core', name: 'Learning Core', desc: '学习核心', icon: GraduationCap, configurable: false },
      { key: 'mcp-core', name: 'MCP Core', desc: 'MCP 调用核心', icon: Plug, configurable: false },
      { key: 'skill-core', name: 'Skill Core', desc: '技能调用核心', icon: Wand2, configurable: false },
      { key: 'soul-core', name: 'Soul Core', desc: '灵魂调用核心', icon: Heart, configurable: false },
      { key: 'storage', name: 'Storage', desc: '存储抽象层', icon: HardDrive, configurable: false },
      { key: 'cognitive', name: 'Cognitive', desc: '认知模块', icon: Lightbulb, configurable: false },
      { key: 'thinking-strategy', name: 'ThinkingStrategy', desc: '思考策略', icon: Workflow, configurable: false },
    ],
  },
  {
    key: 'agent', name: 'Agent层', nameEn: 'Agent',
    desc: 'Agent 框架：构建、库、生命周期与各类 Agent',
    icon: Bot,
    modules: [
      { key: 'agent-builder', name: 'AgentBuilder', desc: 'Agent 构建器', icon: Bot, configurable: false },
      { key: 'agent-library', name: 'AgentLibrary', desc: 'Agent 库', icon: Library, configurable: false },
      { key: 'agent-lifecycle', name: 'AgentLifecycle', desc: 'Agent 生命周期', icon: RefreshCw, configurable: false },
      { key: 'meta-agent', name: 'MetaAgent', desc: '自定义 Agent CRUD 与配置', icon: Bot, configurable: true, apiModule: 'agent' },
      { key: 'planner-agent', name: 'PlannerAgent', desc: '规划 Agent', icon: ClipboardList, configurable: false },
      { key: 'work-agent', name: 'WorkAgent', desc: '工作流程配置管理', icon: Briefcase, configurable: true, apiModule: 'work' },
      { key: 'writer-agent', name: 'WriterAgent', desc: '写作 Agent', icon: PenLine, configurable: false },
      { key: 'evolutor-agent', name: 'EvolutorAgent', desc: '进化 Agent', icon: Sparkles, configurable: false },
      { key: 'graph-executor', name: 'GraphExecutor', desc: '图执行器', icon: Workflow, configurable: false },
    ],
  },
  {
    key: 'orchestration', name: '编排层', nameEn: 'Orchestration',
    desc: '任务与流程编排',
    icon: Workflow,
    modules: [
      { key: 'orchestration', name: 'Orchestration', desc: '编排服务', icon: Workflow, configurable: false },
    ],
  },
  {
    key: 'application', name: '应用层', nameEn: 'Application',
    desc: '面向用户的应用入口：对话、文档、网关、画像等',
    icon: AppWindow,
    modules: [
      { key: 'chat', name: 'Chat', desc: '对话应用', icon: MessageCircle, configurable: false },
      { key: 'chat-dag', name: 'ChatDag', desc: '对话 DAG', icon: GitBranch, configurable: false },
      { key: 'config', name: 'Config', desc: '配置应用', icon: Settings, configurable: false },
      { key: 'document', name: 'Document', desc: '文档应用', icon: FileText, configurable: false },
      { key: 'gateway', name: 'Gateway', desc: '网关', icon: Network, configurable: false },
      { key: 'self-learning', name: 'SelfLearning', desc: '自学习', icon: GraduationCap, configurable: false },
      { key: 'system-agent', name: 'SystemAgent', desc: '系统 Agent', icon: Bot, configurable: false },
      { key: 'user-profile', name: 'UserProfile', desc: '用户画像', icon: User, configurable: false },
    ],
  },
]

// ============================================================
// 导航状态（5 层下钻 + 面包屑）
// ============================================================

// currentLevel: 1=整体框架 2=分层区 3=模块区 4=配置区 5=配置读写区(模态)
const currentLevel = ref<1 | 2 | 3 | 4>(1)
const selectedLayerKey = ref('')
const selectedModuleKey = ref('')
const selectedCategory = ref<ConfigCategoryDisplay | null>(null)

const selectedLayer = computed(() =>
  frameworkLayers.find(l => l.key === selectedLayerKey.value) || null,
)
const currentModule = computed(() => {
  const layer = selectedLayer.value
  if (!layer) return null
  return layer.modules.find(m => m.key === selectedModuleKey.value) || null
})
const currentApiModule = computed(() => currentModule.value?.apiModule)

const breadcrumb = computed(() => {
  const items: { label: string; level: number }[] = [{ label: '整体框架', level: 1 }]
  if (currentLevel.value >= 2 && selectedLayer.value) {
    items.push({ label: selectedLayer.value.name, level: 2 })
  }
  if (currentLevel.value >= 3 && currentModule.value) {
    items.push({ label: currentModule.value.name, level: 3 })
  }
  if (currentLevel.value >= 4 && selectedCategory.value) {
    items.push({ label: selectedCategory.value.name, level: 4 })
  }
  return items
})

function goToLevel(level: number) {
  if (level <= 1) {
    currentLevel.value = 1
    selectedLayerKey.value = ''
    selectedModuleKey.value = ''
    selectedCategory.value = null
    closeModal()
    return
  }
  if (level === 2) {
    currentLevel.value = 2
    selectedModuleKey.value = ''
    selectedCategory.value = null
  } else if (level === 3) {
    currentLevel.value = 3
    selectedCategory.value = null
  } else if (level === 4) {
    currentLevel.value = 4
  }
  closeModal()
}

function selectLayer(layer: FrameworkLayer) {
  selectedLayerKey.value = layer.key
  selectedModuleKey.value = ''
  selectedCategory.value = null
  currentLevel.value = 2
}

async function selectModule(module: FrameworkModule) {
  selectedModuleKey.value = module.key
  selectedCategory.value = null
  currentLevel.value = 3
  if (module.apiModule && !loaded.value[module.apiModule]) {
    await loaders[module.apiModule]()
  }
}

function selectCategory(cat: ConfigCategoryDisplay) {
  selectedCategory.value = cat
  currentLevel.value = 4
}

// ============================================================
// 分类与配置项构建（第三层 / 第四层）
// ============================================================

function layerHasConfigurable(layer: FrameworkLayer): boolean {
  return layer.modules.some(m => m.configurable)
}

function categoryLabelFor(m: ModuleKey): string {
  switch (m) {
    case 'model': return '模型配置'
    case 'soul': return 'Soul 配置'
    case 'work': return 'Work 配置'
    case 'skill': return 'Skill 配置'
    case 'mcp': return 'MCP 配置'
    case 'agent': return 'Agent 配置'
  }
}

function categoryDescFor(m: ModuleKey): string {
  switch (m) {
    case 'model': return '管理模型实例、默认模型与连接测试'
    case 'soul': return '管理灵魂角色及其特性标签'
    case 'work': return '管理工作流程及其步骤'
    case 'skill': return '管理技能及启用状态'
    case 'mcp': return '管理已安装的 MCP 服务'
    case 'agent': return '管理自定义 Agent 实例'
  }
}

function itemCountFor(m: ModuleKey): number {
  switch (m) {
    case 'model': return models.value.length
    case 'soul': return souls.value.length
    case 'work': return works.value.length
    case 'skill': return skills.value.length
    case 'mcp': return mcps.value.length
    case 'agent': return agents.value.length
  }
}

function makeGrayCategories(moduleName: string): ConfigCategoryDisplay[] {
  return [
    {
      key: 'basic', name: '基础设置', desc: `${moduleName} 的基础运行配置`,
      configurable: false, itemCount: 2,
      items: [
        {
          key: 'enabled', name: '启用状态', desc: '是否启用该模块', valueSummary: 'true', configurable: false,
          fields: [{ key: 'enabled', label: '启用', type: 'boolean', value: true }],
        },
        {
          key: 'timeout', name: '超时时间', desc: '请求超时（毫秒）', valueSummary: '30000', configurable: false,
          fields: [{ key: 'timeout', label: '超时(ms)', type: 'number', value: 30000 }],
        },
      ],
    },
    {
      key: 'advanced', name: '高级设置', desc: `${moduleName} 的高级配置`,
      configurable: false, itemCount: 1,
      items: [
        {
          key: 'logLevel', name: '日志级别', desc: '模块日志输出级别', valueSummary: 'info', configurable: false,
          fields: [{
            key: 'logLevel', label: '日志级别', type: 'enum', value: 'info',
            options: [
              { label: 'debug', value: 'debug' },
              { label: 'info', value: 'info' },
              { label: 'warn', value: 'warn' },
              { label: 'error', value: 'error' },
            ],
          }],
        },
      ],
    },
  ]
}

function getCategories(module: FrameworkModule): ConfigCategoryDisplay[] {
  if (module.apiModule) {
    return [{
      key: 'items',
      name: categoryLabelFor(module.apiModule),
      desc: categoryDescFor(module.apiModule),
      configurable: true,
      itemCount: itemCountFor(module.apiModule),
    }]
  }
  return makeGrayCategories(module.name)
}

const currentCategories = computed(() =>
  currentModule.value ? getCategories(currentModule.value) : [],
)

function modelItems(): ConfigItemDisplay[] {
  return models.value.map(m => ({
    key: m.id,
    name: m.modelName,
    desc: `${m.providerName}${m.supportsVision ? ' · 视觉' : ''}${m.supportsTools ? ' · 工具' : ''}`,
    valueSummary: `${m.status === 'active' ? '启用' : '停用'}${m.isDefault ? ' · 默认' : ''} · ${m.maxTokens?.toLocaleString()} tokens`,
    configurable: true,
    raw: m as unknown as RawItem,
    fields: [
      { key: 'providerName', label: '提供商', type: 'text', value: m.providerName },
      { key: 'modelName', label: '模型名称', type: 'text', value: m.modelName },
      { key: 'maxTokens', label: '最大 Token', type: 'number', value: m.maxTokens },
      { key: 'supportsVision', label: '支持视觉', type: 'boolean', value: !!m.supportsVision },
      { key: 'supportsTools', label: '支持工具', type: 'boolean', value: !!m.supportsTools },
      {
        key: 'status', label: '状态', type: 'enum', value: m.status,
        options: [{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }],
      },
      { key: 'isDefault', label: '设为默认', type: 'boolean', value: !!m.isDefault },
    ],
  }))
}

function soulItems(): ConfigItemDisplay[] {
  return souls.value.map(s => ({
    key: s.id,
    name: s.name,
    desc: s.description || '暂无描述',
    valueSummary: `${s.enabled ? '启用' : '停用'} · ${(s.traits || []).length} 个特性`,
    configurable: true,
    raw: s as unknown as RawItem,
    fields: [
      { key: 'name', label: '名称', type: 'text', value: s.name },
      { key: 'description', label: '描述', type: 'text', value: s.description || '' },
      { key: 'traits', label: '特性标签 (JSON)', type: 'json', value: JSON.stringify(s.traits || [], null, 2) },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!s.enabled },
    ],
  }))
}

function workItems(): ConfigItemDisplay[] {
  return works.value.map(w => ({
    key: w.id,
    name: w.name,
    desc: w.description || '暂无描述',
    valueSummary: `${w.enabled ? '启用' : '停用'} · ${(w.steps || []).length} 个步骤`,
    configurable: true,
    raw: w as unknown as RawItem,
    fields: [
      { key: 'name', label: '名称', type: 'text', value: w.name },
      { key: 'description', label: '描述', type: 'text', value: w.description || '' },
      { key: 'steps', label: '步骤 (JSON)', type: 'json', value: JSON.stringify(w.steps || [], null, 2) },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!w.enabled },
    ],
  }))
}

function skillItems(): ConfigItemDisplay[] {
  return skills.value.map(sk => ({
    key: sk.id,
    name: sk.name,
    desc: sk.description || '暂无描述',
    valueSummary: `${sk.enabled ? '启用' : '停用'} · ${sk.category || '未分类'}`,
    configurable: true,
    raw: sk as unknown as RawItem,
    fields: [
      { key: 'name', label: '名称', type: 'text', value: sk.name },
      { key: 'description', label: '描述', type: 'text', value: sk.description || '' },
      { key: 'category', label: '分类', type: 'text', value: sk.category || '' },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!sk.enabled },
    ],
  }))
}

function mcpItems(): ConfigItemDisplay[] {
  return mcps.value.map(mc => ({
    key: mc.id,
    name: (mc.displayName || (mc as unknown as { name?: string }).name || 'MCP') as string,
    desc: mc.description || '暂无描述',
    valueSummary: `${mc.enabled ? '启用' : '停用'} · v${mc.version}`,
    configurable: true,
    raw: mc as unknown as RawItem,
    fields: [
      { key: 'displayName', label: '显示名称', type: 'text', value: mc.displayName || '' },
      { key: 'version', label: '版本', type: 'text', value: mc.version || '' },
      { key: 'description', label: '描述', type: 'text', value: mc.description || '' },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!mc.enabled },
    ],
  }))
}

function agentItems(): ConfigItemDisplay[] {
  return agents.value.map(a => ({
    key: a.id,
    name: a.name,
    desc: a.description || '暂无描述',
    valueSummary: `${a.enabled ? '启用' : '停用'} · ${a.type}`,
    configurable: true,
    raw: a as unknown as RawItem,
    fields: [
      { key: 'name', label: '名称', type: 'text', value: a.name },
      { key: 'type', label: '类型', type: 'text', value: a.type || '' },
      { key: 'description', label: '描述', type: 'text', value: a.description || '' },
      { key: 'enabled', label: '启用', type: 'boolean', value: !!a.enabled },
      { key: 'soul', label: '关联 Soul', type: 'text', value: a.soul || '' },
      { key: 'model', label: '关联 Model', type: 'text', value: a.model || '' },
      { key: 'works', label: 'Works (JSON)', type: 'json', value: JSON.stringify(a.works || [], null, 2) },
      { key: 'skills', label: 'Skills (JSON)', type: 'json', value: JSON.stringify(a.skills || [], null, 2) },
      { key: 'mcps', label: 'MCPs (JSON)', type: 'json', value: JSON.stringify(a.mcps || [], null, 2) },
    ],
  }))
}

function itemsFor(m: ModuleKey): ConfigItemDisplay[] {
  switch (m) {
    case 'model': return modelItems()
    case 'soul': return soulItems()
    case 'work': return workItems()
    case 'skill': return skillItems()
    case 'mcp': return mcpItems()
    case 'agent': return agentItems()
  }
}

function getConfigItems(module: FrameworkModule, category: ConfigCategoryDisplay): ConfigItemDisplay[] {
  if (module.apiModule && category.key === 'items') {
    return itemsFor(module.apiModule)
  }
  return category.items || []
}

const currentItems = computed(() => {
  if (!currentModule.value || !selectedCategory.value) return []
  return getConfigItems(currentModule.value, selectedCategory.value)
})

// ============================================================
// 第五层：配置读写模态
// ============================================================

const modalVisible = ref(false)
const readOnly = ref(false)
const submitting = ref(false)
const selectedConfig = ref<ConfigItemDisplay | null>(null)
const formFields = ref<ConfigField[]>([])
const jsonErrors = ref<Record<string, string>>({})
const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue/30 disabled:opacity-60 disabled:cursor-not-allowed transition-shadow'

function openEditModal(item: ConfigItemDisplay) {
  selectedConfig.value = item
  jsonErrors.value = {}
  formFields.value = (item.fields || []).map(f => ({ ...f }))
  readOnly.value = !item.configurable
  modalVisible.value = true
}

function closeModal() {
  modalVisible.value = false
  selectedConfig.value = null
  formFields.value = []
  jsonErrors.value = {}
  readOnly.value = false
}

function buildSubmitData(): Record<string, unknown> | null {
  const data: Record<string, unknown> = {}
  jsonErrors.value = {}
  for (const f of formFields.value) {
    if (f.type === 'json') {
      try {
        data[f.key] = f.value ? JSON.parse(String(f.value)) : null
      } catch {
        jsonErrors.value[f.key] = 'JSON 格式错误，请检查'
        return null
      }
    } else if (f.type === 'number') {
      data[f.key] = Number(f.value)
    } else {
      data[f.key] = f.value
    }
  }
  return data
}

async function submitForm() {
  const module = currentModule.value
  if (!module?.apiModule || !selectedConfig.value) return
  const data = buildSubmitData()
  if (!data) {
    showToast('请修正表单中的错误')
    return
  }
  submitting.value = true
  try {
    const id = selectedConfig.value.key
    switch (module.apiModule) {
      case 'model': await configApi.model.update(id, data); break
      case 'soul': await configApi.soul.update(id, data); break
      case 'work': await configApi.work.update(id, data); break
      case 'skill': await skillApi.update(id, data); break
      case 'mcp': await configApi.mcp.update(id, data); break
      case 'agent': await agentApi.update(id, data); break
    }
    showToast('配置已保存', 'success')
    closeModal()
    await loaders[module.apiModule]()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

// ============================================================
// 响应式数据状态
// ============================================================

const loading = ref<Record<ModuleKey, boolean>>({
  model: false, soul: false, work: false, skill: false, mcp: false, agent: false,
})
const loaded = ref<Record<ModuleKey, boolean>>({
  model: false, soul: false, work: false, skill: false, mcp: false, agent: false,
})
const errorMsg = ref<Record<ModuleKey, string>>({
  model: '', soul: '', work: '', skill: '', mcp: '', agent: '',
})

const models = ref<ModelItem[]>([])
const souls = ref<SoulItem[]>([])
const works = ref<WorkItem[]>([])
const skills = ref<SkillItem[]>([])
const mcps = ref<McpItem[]>([])
const agents = ref<AgentItem[]>([])

const testingModelId = ref<string | null>(null)
const testResult = ref<Record<string, { ok: boolean; message: string } | null>>({})

const currentLoading = computed(() => {
  const m = currentApiModule.value
  return m ? loading.value[m] : false
})
const currentError = computed(() => {
  const m = currentApiModule.value
  return m ? errorMsg.value[m] : ''
})

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
// 数据加载
// ============================================================

async function loadModels() {
  loading.value.model = true
  errorMsg.value.model = ''
  try {
    const list = await configApi.model.list()
    models.value = list as ModelItem[]
    loaded.value.model = true
  } catch (e: unknown) {
    errorMsg.value.model = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value.model = false
  }
}

async function loadSouls() {
  loading.value.soul = true
  errorMsg.value.soul = ''
  try {
    const list = await configApi.soul.list()
    souls.value = list as unknown as SoulItem[]
    loaded.value.soul = true
  } catch (e: unknown) {
    errorMsg.value.soul = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value.soul = false
  }
}

async function loadWorks() {
  loading.value.work = true
  errorMsg.value.work = ''
  try {
    const list = await configApi.work.list()
    works.value = list as unknown as WorkItem[]
    loaded.value.work = true
  } catch (e: unknown) {
    errorMsg.value.work = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value.work = false
  }
}

async function loadSkills() {
  loading.value.skill = true
  errorMsg.value.skill = ''
  try {
    const res = await skillApi.list()
    skills.value = (res.skills || []) as unknown as SkillItem[]
    loaded.value.skill = true
  } catch (e: unknown) {
    errorMsg.value.skill = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value.skill = false
  }
}

async function loadMcps() {
  loading.value.mcp = true
  errorMsg.value.mcp = ''
  try {
    const res = await mcpMarketApi.installed()
    mcps.value = (res.installed || []) as unknown as McpItem[]
    loaded.value.mcp = true
  } catch (e: unknown) {
    errorMsg.value.mcp = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value.mcp = false
  }
}

async function loadAgents() {
  loading.value.agent = true
  errorMsg.value.agent = ''
  try {
    const res = await agentApi.list()
    agents.value = (res.agents || []) as unknown as AgentItem[]
    loaded.value.agent = true
  } catch (e: unknown) {
    errorMsg.value.agent = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value.agent = false
  }
}

const loaders: Record<ModuleKey, () => Promise<void>> = {
  model: loadModels,
  soul: loadSouls,
  work: loadWorks,
  skill: loadSkills,
  mcp: loadMcps,
  agent: loadAgents,
}

async function refreshCurrent() {
  const m = currentApiModule.value
  if (m) await loaders[m]()
}

// ============================================================
// 快捷操作（保留原有功能）
// ============================================================

async function handleSetDefault(raw: RawItem) {
  try {
    await configApi.model.setDefault(raw.id)
    showToast('已设为默认模型', 'success')
    await loadModels()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '设置默认失败')
  }
}

async function handleTestModel(raw: RawItem) {
  testingModelId.value = raw.id
  testResult.value[raw.id] = null
  try {
    const res = await configApi.model.test(raw.id)
    testResult.value[raw.id] = {
      ok: res.success,
      message: res.success ? `连接成功 · ${res.latency}ms` : res.message,
    }
    showToast(testResult.value[raw.id]!.message, res.success ? 'success' : 'error')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '测试失败'
    testResult.value[raw.id] = { ok: false, message: msg }
    showToast(msg)
  } finally {
    testingModelId.value = null
    setTimeout(() => { testResult.value[raw.id] = null }, 6000)
  }
}

async function handleToggle(raw: RawItem) {
  const m = currentApiModule.value
  if (!m) return
  try {
    switch (m) {
      case 'soul': await configApi.soul.update(raw.id, { enabled: !raw.enabled }); break
      case 'work': await configApi.work.update(raw.id, { enabled: !raw.enabled }); break
      case 'skill': await skillApi.toggle(raw.id); break
      case 'mcp': await mcpMarketApi.toggle(raw.id); break
      case 'agent': await agentApi.toggle(raw.id); break
    }
    showToast('状态已切换', 'success')
    await loaders[m]()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

async function handleDelete(raw: RawItem) {
  const m = currentApiModule.value
  if (!m) return
  if (m === 'model' && raw.isDefault) {
    showToast('默认模型不允许删除，请先解除默认')
    return
  }
  try {
    switch (m) {
      case 'model': await configApi.model.delete(raw.id); break
      case 'soul': await configApi.soul.delete(raw.id); break
      case 'work': await configApi.work.delete(raw.id); break
      case 'skill': await skillApi.delete(raw.id); break
      case 'mcp': await mcpMarketApi.uninstall(raw.id); break
      case 'agent': await agentApi.delete(raw.id); break
    }
    showToast('已删除', 'success')
    await loaders[m]()
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}
</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative">
    <NeuralBackground />
    <Header />
    <div class="pt-16 h-full relative z-10 flex flex-col">
      <!-- ═══════════════ 面包屑导航 ═══════════════ -->
      <div class="flex items-center gap-1.5 px-6 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <button
          class="p-1.5 rounded-lg text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
          :class="{ 'opacity-40 pointer-events-none': currentLevel === 1 }"
          title="返回上一级"
          @click="goToLevel(currentLevel - 1)"
        >
          <ArrowLeft :size="16" />
        </button>
        <Layers :size="15" class="text-brian-blue flex-shrink-0" />
        <template v-for="(crumb, idx) in breadcrumb" :key="idx">
          <ChevronRight v-if="idx > 0" :size="13" class="text-apple-gray-400 flex-shrink-0" />
          <button
            class="text-sm font-medium px-1.5 py-0.5 rounded transition-colors"
            :class="idx === breadcrumb.length - 1
              ? 'text-apple-gray-900 dark:text-apple-gray-50 cursor-default'
              : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-brian-blue dark:hover:text-brian-blue'"
            @click="goToLevel(crumb.level)"
          >
            {{ crumb.label }}
          </button>
        </template>
        <div class="ml-auto flex items-center gap-2">
          <button
            v-if="currentApiModule"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 rounded-lg hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors"
            @click="refreshCurrent"
          >
            <RefreshCw :size="13" :class="{ 'animate-spin': currentLoading }" /> 刷新
          </button>
        </div>
      </div>

      <!-- ═══════════════ 内容滚动区 ═══════════════ -->
      <main class="flex-1 overflow-y-auto bg-apple-gray-50 dark:bg-apple-gray-900">
        <!-- ─────────── 第一层：整体框架 ─────────── -->
        <div v-if="currentLevel === 1" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5">
            <h2 class="text-xl font-semibold text-apple-gray-900 dark:text-apple-gray-50">系统整体框架</h2>
            <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">点击分层区块进入下一层 ·
              <span class="text-success-green">绿色 = 可配置</span> ·
              <span class="text-apple-gray-400">灰色 = 不可配置</span>
            </p>
          </div>
          <div class="space-y-3">
            <div
              v-for="layer in frameworkLayers"
              :key="layer.key"
              class="group cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-md"
              :class="layerHasConfigurable(layer)
                ? 'border-success-green/30 bg-success-green/[0.04] hover:border-success-green/50'
                : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'"
              @click="selectLayer(layer)"
            >
              <div class="flex items-center gap-3 mb-3">
                <div
                  class="p-2 rounded-lg flex-shrink-0"
                  :class="layerHasConfigurable(layer)
                    ? 'bg-success-green/10 text-success-green'
                    : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400'"
                >
                  <component :is="layer.icon" :size="18" />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ layer.name }}</h3>
                    <span class="text-[11px] text-apple-gray-400">{{ layer.nameEn }}</span>
                  </div>
                  <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">{{ layer.desc }}</p>
                </div>
                <div class="ml-auto flex items-center gap-2 flex-shrink-0">
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full"
                    :class="layerHasConfigurable(layer)
                      ? 'bg-success-green/10 text-success-green'
                      : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500'"
                  >
                    <span class="w-1.5 h-1.5 rounded-full" :class="layerHasConfigurable(layer) ? 'bg-success-green' : 'bg-apple-gray-400'" />
                    {{ layerHasConfigurable(layer) ? '含可配置模块' : '不可配置' }}
                  </span>
                  <ChevronRight :size="16" class="text-apple-gray-400 group-hover:text-brian-blue transition-colors" />
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="m in layer.modules"
                  :key="m.key"
                  class="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                  :class="m.configurable
                    ? 'bg-success-green/10 text-success-green border border-success-green/20'
                    : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400'"
                >
                  <component :is="m.icon" :size="12" />
                  {{ m.name }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ─────────── 第二层：分层区（模块卡片） ─────────── -->
        <div v-else-if="currentLevel === 2 && selectedLayer" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5 flex items-center gap-2.5">
            <div class="p-2 rounded-lg bg-brian-blue/10">
              <component :is="selectedLayer.icon" :size="18" class="text-brian-blue" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ selectedLayer.name }}</h2>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">{{ selectedLayer.desc }}</p>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="m in selectedLayer.modules"
              :key="m.key"
              class="group cursor-pointer rounded-xl border p-5 transition-all hover:shadow-md"
              :class="m.configurable
                ? 'border-success-green/40 bg-success-green/[0.04] hover:border-success-green/60'
                : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'"
              @click="selectModule(m)"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2.5">
                  <div
                    class="w-10 h-10 rounded-lg flex items-center justify-center"
                    :class="m.configurable
                      ? 'bg-success-green/10 text-success-green'
                      : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400'"
                  >
                    <component :is="m.icon" :size="18" />
                  </div>
                  <div>
                    <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ m.name }}</h3>
                    <p class="text-[11px]" :class="m.configurable ? 'text-success-green' : 'text-apple-gray-400'">
                      {{ m.configurable ? '可配置' : '不可配置' }}
                    </p>
                  </div>
                </div>
                <span
                  class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                  :class="m.configurable ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                />
              </div>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-3 min-h-[32px]">{{ m.desc }}</p>
              <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <span class="text-[11px] text-apple-gray-400">{{ getCategories(m).length }} 个配置分类</span>
                <ChevronRight :size="14" class="text-apple-gray-400 group-hover:text-brian-blue transition-colors" />
              </div>
            </div>
          </div>
        </div>

        <!-- ─────────── 第三层：模块区（配置分类卡片） ─────────── -->
        <div v-else-if="currentLevel === 3 && currentModule" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5 flex items-center gap-2.5">
            <div class="p-2 rounded-lg bg-brian-blue/10">
              <component :is="currentModule.icon" :size="18" class="text-brian-blue" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ currentModule.name }}</h2>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">{{ currentModule.desc }}</p>
            </div>
          </div>

          <!-- 加载中 -->
          <div v-if="currentLoading" class="flex items-center justify-center py-20">
            <Loader2 :size="24" class="animate-spin text-brian-blue" />
          </div>
          <!-- 加载错误 -->
          <div v-else-if="currentError" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="p-4 bg-error-red/10 rounded-full inline-flex mb-4">
              <AlertCircle :size="28" class="text-error-red" />
            </div>
            <p class="text-sm text-apple-gray-600 dark:text-apple-gray-300 mb-3">{{ currentError }}</p>
            <button class="px-4 py-2 text-sm bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 transition-colors" @click="refreshCurrent">重试</button>
          </div>
          <!-- 分类卡片 -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="cat in currentCategories"
              :key="cat.key"
              class="group cursor-pointer rounded-xl border p-5 transition-all hover:shadow-md"
              :class="cat.configurable
                ? 'border-success-green/40 bg-success-green/[0.04] hover:border-success-green/60'
                : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'"
              @click="selectCategory(cat)"
            >
              <div class="flex items-start justify-between mb-3">
                <div>
                  <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ cat.name }}</h3>
                  <p class="text-[11px]" :class="cat.configurable ? 'text-success-green' : 'text-apple-gray-400'">
                    {{ cat.configurable ? '可配置' : '不可配置' }}
                  </p>
                </div>
                <span
                  class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                  :class="cat.configurable ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                />
              </div>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-3 min-h-[32px]">{{ cat.desc }}</p>
              <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <span class="text-[11px] text-apple-gray-400">{{ cat.itemCount }} 个配置项</span>
                <ChevronRight :size="14" class="text-apple-gray-400 group-hover:text-brian-blue transition-colors" />
              </div>
            </div>
          </div>
        </div>

        <!-- ─────────── 第四层：配置区（配置项卡片列表） ─────────── -->
        <div v-else-if="currentLevel === 4 && currentModule && selectedCategory" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5 flex items-center gap-2.5">
            <div class="p-2 rounded-lg bg-brian-blue/10">
              <component :is="currentModule.icon" :size="18" class="text-brian-blue" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ selectedCategory.name }}</h2>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">{{ selectedCategory.desc }} · {{ currentItems.length }} 个配置项</p>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="currentItems.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
            <div class="p-4 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-full inline-flex mb-4">
              <component :is="currentModule.icon" :size="28" class="text-apple-gray-400" />
            </div>
            <p class="text-sm text-apple-gray-500">暂无配置项</p>
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="item in currentItems"
              :key="item.key"
              class="rounded-xl border p-5 transition-all"
              :class="item.configurable
                ? 'border-success-green/40 bg-success-green/[0.04] hover:shadow-md'
                : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800'"
            >
              <div class="cursor-pointer" @click="openEditModal(item)">
                <div class="flex items-start justify-between mb-3">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div
                      class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      :class="item.configurable
                        ? 'bg-success-green/10 text-success-green'
                        : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400'"
                    >
                      <component :is="currentModule.icon" :size="18" />
                    </div>
                    <div class="min-w-0">
                      <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ item.name }}</h3>
                      <p class="text-[11px]" :class="item.configurable ? 'text-success-green' : 'text-apple-gray-400'">
                        {{ item.configurable ? '可配置' : '不可配置' }}
                      </p>
                    </div>
                  </div>
                  <span
                    class="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                    :class="item.configurable ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                  />
                </div>
                <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-2 min-h-[32px] line-clamp-2">{{ item.desc }}</p>
                <p class="text-[11px] text-apple-gray-600 dark:text-apple-gray-300 font-mono bg-apple-gray-100 dark:bg-apple-gray-900/60 rounded px-2 py-1 truncate">{{ item.valueSummary }}</p>
              </div>

              <!-- 快捷操作 -->
              <div v-if="currentApiModule" class="flex items-center justify-end gap-1.5 mt-3 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <button
                  v-if="currentApiModule === 'model'"
                  :disabled="!!item.raw?.isDefault"
                  class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors"
                  :class="item.raw?.isDefault
                    ? 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400 cursor-not-allowed'
                    : 'bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20'"
                  @click.stop="handleSetDefault(item.raw!)"
                >
                  <Star :size="11" /> 设为默认
                </button>
                <button
                  v-if="currentApiModule === 'model'"
                  class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors"
                  @click.stop="handleTestModel(item.raw!)"
                >
                  <Loader2 v-if="testingModelId === item.key" :size="11" class="animate-spin" />
                  <FlaskConical v-else :size="11" /> 测试
                </button>
                <button
                  v-if="currentApiModule !== 'model' && item.raw && item.raw.enabled !== undefined"
                  class="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0"
                  :class="item.raw.enabled ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                  title="启用/停用"
                  @click.stop="handleToggle(item.raw!)"
                >
                  <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" :class="item.raw.enabled ? 'translate-x-4' : ''" />
                </button>
                <button
                  class="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-error-red hover:bg-error-red/10 transition-colors"
                  @click.stop="handleDelete(item.raw!)"
                >
                  <Trash2 :size="11" /> 删除
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- ═══════════════ 第五层：配置读写模态 ═══════════════ -->
    <Transition name="modal">
      <div v-if="modalVisible" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeModal" />
        <div class="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-apple-gray-800 rounded-2xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700">
          <!-- 模态头部 -->
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="font-semibold text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ selectedConfig?.name }}</h3>
                <span
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full"
                  :class="readOnly
                    ? 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500'
                    : 'bg-success-green/10 text-success-green'"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="readOnly ? 'bg-apple-gray-400' : 'bg-success-green'" />
                  {{ readOnly ? '只读' : '可配置' }}
                </span>
              </div>
              <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">{{ selectedConfig?.desc }}</p>
            </div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors flex-shrink-0" @click="closeModal">
              <X :size="18" />
            </button>
          </div>

          <!-- 模态表单 -->
          <div class="px-5 py-4 overflow-y-auto space-y-4">
            <div v-if="readOnly" class="flex items-start gap-2 text-xs text-warning-orange bg-warning-orange/10 rounded-lg p-3">
              <AlertCircle :size="14" class="flex-shrink-0 mt-0.5" />
              <span>该配置项当前不可编辑，以下为只读展示。</span>
            </div>
            <div v-for="field in formFields" :key="field.key">
              <label class="block text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mb-1.5">{{ field.label }}</label>
              <!-- 文本输入 -->
              <input
                v-if="field.type === 'text'"
                v-model="field.value"
                type="text"
                :disabled="readOnly"
                :class="inputClass"
              >
              <!-- 数字输入 -->
              <input
                v-else-if="field.type === 'number'"
                v-model.number="field.value"
                type="number"
                :disabled="readOnly"
                :class="inputClass"
              >
              <!-- 开关（布尔） -->
              <button
                v-else-if="field.type === 'boolean'"
                type="button"
                class="relative w-11 h-6 rounded-full transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                :class="field.value ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'"
                :disabled="readOnly"
                @click="!readOnly && (field.value = !field.value)"
              >
                <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200" :class="field.value ? 'translate-x-5' : ''" />
              </button>
              <!-- 下拉（枚举） -->
              <select
                v-else-if="field.type === 'enum'"
                :value="String(field.value)"
                :disabled="readOnly"
                :class="inputClass"
                @change="field.value = ($event.target as HTMLSelectElement).value"
              >
                <option v-for="opt in field.options" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
              </select>
              <!-- JSON 编辑器 -->
              <textarea
                v-else-if="field.type === 'json'"
                :value="String(field.value)"
                :disabled="readOnly"
                rows="5"
                :class="[inputClass, 'font-mono text-xs resize-y']"
                @input="field.value = ($event.target as HTMLTextAreaElement).value"
              />
              <p v-if="field.type === 'json' && jsonErrors[field.key]" class="text-xs text-error-red mt-1">{{ jsonErrors[field.key] }}</p>
            </div>
          </div>

          <!-- 模态底部 -->
          <div class="flex justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button
              class="px-4 py-2 text-sm font-medium rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors"
              @click="closeModal"
            >
              取消
            </button>
            <button
              v-if="!readOnly"
              class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brian-blue text-white hover:bg-brian-blue/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              :disabled="submitting"
              @click="submitForm"
            >
              <Loader2 v-if="submitting" :size="14" class="animate-spin" />
              <Save v-else :size="14" />
              保存
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
