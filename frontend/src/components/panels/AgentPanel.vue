<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { Bot, Plus, Trash2, Edit3, Loader2, Sparkles, Search, Copy, X, Zap, Eye } from '@lucide/vue'
import { agentApi, skillApi, configApi, mcpMarketApi, type ConfigItem } from '../../api'

interface AgentItem {
  id: string
  name: string
  role: string
  description: string
  strategy: { type: string; maxIterations: number; stopConditions: string[] }
  llm: { temperature?: number; maxTokens?: number }
  prompt: { system: string; instruction: string; variables: string[] }
  skillIds: string[]
  mcpIds: string[]
  soulId: string
  workIds: string[]
  sources: { knowledgeBase: string[]; webSearch: boolean }
  enabled: boolean
  isSystem?: boolean
  createdAt: number
}

interface SelectableItem {
  id: string
  name: string
  description?: string
}

const availableSkills = ref<SelectableItem[]>([])
const availableMcps = ref<SelectableItem[]>([])
const associatedMcps = ref<SelectableItem[]>([])
const associatedSkills = ref<SelectableItem[]>([])
const associatedSoul = ref<SelectableItem | null>(null)
const associatedWorks = ref<SelectableItem[]>([])
const availableSouls = ref<SelectableItem[]>([])
const availableWorks = ref<SelectableItem[]>([])

const agents = ref<AgentItem[]>([])
const searchQuery = ref('')
const generatingPrompt = ref(false)
const suggestingSkills = ref(false)
const showModal = ref(false)
const isEditing = ref(false)
const isSystemViewing = ref(false)
const modalTitle = ref('')
const editingAgentId = ref<string | null>(null)

const form = ref({
  name: '',
  role: '',
  description: '',
  strategyType: 'react',
  maxIterations: 10,
  systemPrompt: '',
  instruction: '',
  temperature: 0.7,
  maxTokens: 4096,
  skillIds: [] as string[],
  mcpIds: [] as string[],
  soulId: '',
  workIds: [] as string[],
  webSearch: false,
  enabled: true,
})

const suggestingSouls = ref(false)
const suggestingWorks = ref(false)

function mapAgent(raw: Record<string, unknown>): AgentItem {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    role: String(raw.role ?? ''),
    description: String(raw.description ?? ''),
    strategy: (raw.strategy as AgentItem['strategy']) || { type: 'react', maxIterations: 10, stopConditions: [] },
    llm: (raw.llm as AgentItem['llm']) || {},
    prompt: (raw.prompt as AgentItem['prompt']) || { system: '', instruction: '', variables: [] },
    skillIds: Array.isArray(raw.skillIds) ? (raw.skillIds as string[]) : [],
    mcpIds: Array.isArray(raw.mcpIds) ? (raw.mcpIds as string[]) : [],
    soulId: String(raw.soulId ?? ''),
    workIds: Array.isArray(raw.workIds) ? (raw.workIds as string[]) : (raw.workId ? [String(raw.workId)] : []),
    sources: (raw.sources as AgentItem['sources']) || { knowledgeBase: [], webSearch: false },
    enabled: raw.active !== false && raw.enabled !== false,
    isSystem: !!(raw.isSystem),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  }
}

function getStrategyLabel(type: string): string {
  const map: Record<string, string> = { react: 'ReAct', cot: 'Chain-of-Thought', tot: 'Tree-of-Thought', custom: 'Custom' }
  return map[type] || type
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function loadAvailableItems() {
  try {
    const skills = await skillApi.list()
    availableSkills.value = (skills.skills || []).map((s: Record<string, unknown>) => ({
      id: String(s.id ?? ''),
      name: String(s.name ?? ''),
      description: String(s.description ?? ''),
    }))
  } catch { /* ignore */ }

  try {
      const mcps = await mcpMarketApi.installed()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      availableMcps.value = (mcps.installed || []).map((m: any) => ({
        id: String(m.id ?? ''),
        name: String(m.displayName || m.packageName || ''),
        description: String(m.description ?? ''),
      }))
    } catch { /* ignore */ }

  try {
    const souls = await configApi.soul.list()
    availableSouls.value = (souls as ConfigItem[]).map((s: ConfigItem) => ({
      id: String(s.id ?? ''),
      name: String(s.name ?? ''),
      description: String(s.description ?? ''),
    }))
  } catch { /* ignore */ }

  try {
    const works = await configApi.work.list()
    availableWorks.value = (works as ConfigItem[]).map((w: ConfigItem) => ({
      id: String(w.id ?? ''),
      name: String(w.name ?? ''),
      description: String(w.description ?? ''),
    }))
  } catch { /* ignore */ }
}

async function loadAgents() {
  try {
    const result = await agentApi.list(searchQuery.value || undefined)
    agents.value = (result.agents || []).map(mapAgent)
  } catch {
    agents.value = []
  }
}

onMounted(() => {
  loadAvailableItems()
  loadAgents()
})

watch(searchQuery, () => {
  loadAgents()
})

function addMcpToForm(mcpId: string) {
  if (!form.value.mcpIds.includes(mcpId)) {
    form.value.mcpIds.push(mcpId)
  }
  const mcp = availableMcps.value.find(m => m.id === mcpId)
  if (mcp && !associatedMcps.value.find(a => a.id === mcpId)) {
    associatedMcps.value.push({ ...mcp })
  }
}

function removeMcpFromForm(mcpId: string) {
  const idx = form.value.mcpIds.indexOf(mcpId)
  if (idx >= 0) {
    form.value.mcpIds.splice(idx, 1)
  }
  const aIdx = associatedMcps.value.findIndex(a => a.id === mcpId)
  if (aIdx >= 0) {
    associatedMcps.value.splice(aIdx, 1)
  }
}

function addSkillToForm(skillId: string) {
  if (!form.value.skillIds.includes(skillId)) {
    form.value.skillIds.push(skillId)
  }
  const skill = availableSkills.value.find(s => s.id === skillId)
  if (skill && !associatedSkills.value.find(a => a.id === skillId)) {
    associatedSkills.value.push({ ...skill })
  }
}

function removeSkillFromForm(skillId: string) {
  const idx = form.value.skillIds.indexOf(skillId)
  if (idx >= 0) {
    form.value.skillIds.splice(idx, 1)
  }
  const aIdx = associatedSkills.value.findIndex(a => a.id === skillId)
  if (aIdx >= 0) {
    associatedSkills.value.splice(aIdx, 1)
  }
}

function setSoulToForm(soulId: string) {
  form.value.soulId = soulId
  const soul = availableSouls.value.find(s => s.id === soulId)
  associatedSoul.value = soul ? { ...soul } : null
}

function removeSoulFromForm() {
  form.value.soulId = ''
  associatedSoul.value = null
}

function addWorkToForm(workId: string) {
  if (!form.value.workIds.includes(workId)) {
    form.value.workIds.push(workId)
  }
  const work = availableWorks.value.find(w => w.id === workId)
  if (work && !associatedWorks.value.find(a => a.id === workId)) {
    associatedWorks.value.push({ ...work })
  }
}

function removeWorkFromForm(workId: string) {
  const idx = form.value.workIds.indexOf(workId)
  if (idx >= 0) {
    form.value.workIds.splice(idx, 1)
  }
  const aIdx = associatedWorks.value.findIndex(a => a.id === workId)
  if (aIdx >= 0) {
    associatedWorks.value.splice(aIdx, 1)
  }
}

function openNewModal() {
  isEditing.value = false
  modalTitle.value = '新建 Agent'
  form.value = {
    name: '', role: '', description: '',
    strategyType: 'react', maxIterations: 10,
    systemPrompt: '', instruction: '',
    temperature: 0.7, maxTokens: 4096,
    skillIds: [], mcpIds: [],
    soulId: '', workIds: [],
    webSearch: false, enabled: true,
  }
  showModal.value = true
}

function openEditModal(agent: AgentItem) {
  isEditing.value = true
  isSystemViewing.value = !!agent.isSystem
  editingAgentId.value = agent.id
  modalTitle.value = agent.isSystem ? '查看 Agent（系统内置，不可编辑）' : '编辑 Agent'
  form.value = {
    name: agent.name,
    role: agent.role,
    description: agent.description,
    strategyType: agent.strategy.type,
    maxIterations: agent.strategy.maxIterations,
    systemPrompt: agent.prompt.system,
    instruction: agent.prompt.instruction,
    temperature: agent.llm.temperature ?? 0.7,
    maxTokens: agent.llm.maxTokens ?? 4096,
    skillIds: [...agent.skillIds],
    mcpIds: [...agent.mcpIds],
    soulId: agent.soulId,
    workIds: [...agent.workIds],
    webSearch: agent.sources.webSearch,
    enabled: agent.enabled,
  }
  loadAssociatedMcps(agent.id)
  loadAssociatedSkills(agent.id)
  loadAssociatedSoul(agent.id)
  loadAssociatedWorks(agent.id)
  showModal.value = true
}

async function loadAssociatedMcps(agentId: string) {
  try {
    const result = await agentApi.getMcps(agentId)
    associatedMcps.value = (result.mcps || []).map((m: Record<string, unknown>) => ({
      id: String(m.id ?? ''),
      name: String(m.displayName || m.packageName || ''),
      description: String(m.description ?? ''),
    }))
  } catch {
    associatedMcps.value = []
  }
}

async function loadAssociatedSkills(agentId: string) {
  try {
    const result = await agentApi.getSkills(agentId)
    associatedSkills.value = (result.skills || []).map((s: Record<string, unknown>) => ({
      id: String(s.id ?? ''),
      name: String(s.name ?? ''),
      description: String(s.description ?? ''),
    }))
  } catch {
    associatedSkills.value = []
  }
}

async function loadAssociatedSoul(agentId: string) {
  try {
    const result = await agentApi.getSoul(agentId)
    if (result.soul) {
      associatedSoul.value = {
        id: String(result.soul.id ?? ''),
        name: String(result.soul.name ?? ''),
        description: String(result.soul.description ?? ''),
      }
    } else {
      associatedSoul.value = null
    }
  } catch {
    associatedSoul.value = null
  }
}

async function loadAssociatedWorks(agentId: string) {
  try {
    const result = await agentApi.getWorks(agentId)
    associatedWorks.value = (result.works || []).map((w: Record<string, unknown>) => ({
      id: String(w.id ?? ''),
      name: String(w.name ?? ''),
      description: String(w.description ?? ''),
    }))
  } catch {
    associatedWorks.value = []
  }
}

function closeModal() {
  showModal.value = false
  isSystemViewing.value = false
}

async function saveModal() {
  try {
    if (isEditing.value && editingAgentId.value) {
      await agentApi.update(editingAgentId.value, {
          name: form.value.name,
          role: form.value.role,
          description: form.value.description,
          strategy: { type: form.value.strategyType, maxIterations: form.value.maxIterations, stopConditions: [] },
          llm: { temperature: form.value.temperature, maxTokens: form.value.maxTokens },
          prompt: { system: form.value.systemPrompt, instruction: form.value.instruction, variables: [] },
          skillIds: form.value.skillIds,
          mcpIds: form.value.mcpIds,
          soulId: form.value.soulId,
          workIds: form.value.workIds,
          sources: { knowledgeBase: [], webSearch: form.value.webSearch },
          enabled: form.value.enabled,
      })
    } else {
      await agentApi.create({
        name: form.value.name,
        role: form.value.role,
        description: form.value.description,
        strategy: { type: form.value.strategyType, maxIterations: form.value.maxIterations, stopConditions: [] },
        llm: { temperature: form.value.temperature, maxTokens: form.value.maxTokens },
        prompt: { system: form.value.systemPrompt, instruction: form.value.instruction, variables: [] },
        skillIds: form.value.skillIds,
        mcpIds: form.value.mcpIds,
        soulId: form.value.soulId,
        workIds: form.value.workIds,
        sources: { knowledgeBase: [], webSearch: form.value.webSearch },
        enabled: form.value.enabled,
      })
    }
    await loadAgents()
    closeModal()
  } catch { /* ignore */ }
}

async function remove(id: string) {
  const prev = agents.value
  agents.value = agents.value.filter(a => a.id !== id)
  try {
    await agentApi.delete(id)
  } catch {
    agents.value = prev
  }
}

async function cloneAgent(id: string) {
  try {
    const cloned = await agentApi.clone(id)
    await loadAgents()
    openEditModal(mapAgent(cloned))
  } catch { /* ignore */ }
}

async function toggle(id: string) {
  const agent = agents.value.find(a => a.id === id)
  if (!agent) return
  const oldEnabled = agent.enabled
  agent.enabled = !agent.enabled
  try {
    await agentApi.toggle(id)
  } catch (err) {
    console.error('[AgentPanel] toggle failed:', err)
    agent.enabled = oldEnabled
  }
}

async function handleGeneratePrompt() {
  if (!form.value.role) return
  generatingPrompt.value = true
  try {
    const result = await agentApi.generatePrompt({ purpose: form.value.role, constraints: form.value.description })
    form.value.systemPrompt = String(result.system || '')
    form.value.instruction = String(result.instruction || '')
  } catch { /* ignore */ }
  generatingPrompt.value = false
}

async function handleSuggestSkills() {
  if (!form.value.role) return
  suggestingSkills.value = true
  try {
    const result = await agentApi.suggestSkills({ purpose: form.value.role, description: '' })
    const suggested = (result.skills || []).map((s: Record<string, unknown>) => String(s.skillId || s.id || '')).filter((s: string) => s && !form.value.skillIds.includes(s))
    form.value.skillIds.push(...suggested)
    for (const id of suggested) {
      const skill = availableSkills.value.find(s => s.id === id)
      if (skill && !associatedSkills.value.find(a => a.id === id)) {
        associatedSkills.value.push({ ...skill })
      }
    }
  } catch { /* ignore */ }
  suggestingSkills.value = false
}

async function handleSuggestSouls() {
  if (!form.value.role) return
  suggestingSouls.value = true
  try {
    const result = await agentApi.suggestSouls({ purpose: form.value.role, description: '' })
    const suggested = (result.souls || []).map((s: Record<string, unknown>) => String(s.soulId || s.id || '')).filter((s: string) => s && !form.value.soulId.includes(s))
    if (suggested.length > 0) {
      form.value.soulId = suggested[0]
      const soul = availableSouls.value.find(s => s.id === suggested[0])
      associatedSoul.value = soul ? { ...soul } : null
    }
  } catch { /* ignore */ }
  suggestingSouls.value = false
}

async function handleSuggestWorks() {
  if (!form.value.role) return
  suggestingWorks.value = true
  try {
    const result = await agentApi.suggestWorks({ purpose: form.value.role, description: '' })
    const suggested = (result.works || []).map((w: Record<string, unknown>) => String(w.workId || w.id || '')).filter((w: string) => w && !form.value.workIds.includes(w))
    form.value.workIds.push(...suggested)
    for (const id of suggested) {
      const work = availableWorks.value.find(w => w.id === id)
      if (work && !associatedWorks.value.find(a => a.id === id)) {
        associatedWorks.value.push({ ...work })
      }
    }
  } catch { /* ignore */ }
  suggestingWorks.value = false
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between p-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-950">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-brian-blue/10 rounded-lg"><Bot :size="20" class="text-brian-blue" /></div>
        <div>
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">Agent 管理</h2>
          <p class="text-xs text-apple-gray-400">创建与管理智能代理</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div class="relative">
          <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-apple-gray-400" />
          <input v-model="searchQuery" placeholder="搜索..." class="w-48 pl-8 pr-3 py-1.5 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 outline-none border border-transparent focus:border-brian-blue transition-all" />
        </div>
        <button class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90" @click="openNewModal">
          <Plus :size="14" /> 新建 Agent
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-5">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="agent in agents" :key="agent.id" class="glass-panel rounded-xl p-4 hover:shadow-lg transition-shadow relative">
          <!-- Status badge: top-right -->
          <span :class="['absolute top-3 right-3 text-[10px] px-1.5 py-0.5 rounded-full', agent.enabled ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400']">
            {{ agent.isSystem ? '系统' : agent.enabled ? '已启用' : '已禁用' }}
          </span>
          <div class="flex items-start gap-2 mb-3 pr-16">
            <div :class="['w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', agent.enabled ? 'bg-success-green/10' : 'bg-apple-gray-100 dark:bg-apple-gray-800']">
              <Bot :size="16" :class="agent.enabled ? 'text-success-green' : 'text-apple-gray-400'" />
            </div>
            <div>
              <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ agent.name }}</h3>
              <p class="text-xs text-apple-gray-400">{{ agent.role }}</p>
            </div>
          </div>

          <div class="flex flex-wrap gap-1 mb-3">
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue">{{ getStrategyLabel(agent.strategy.type) }}</span>
            <span v-if="agent.skillIds.length" class="text-[10px] px-1.5 py-0.5 rounded bg-purple/10 text-purple">
              {{ agent.skillIds.length }} Skill{{ agent.skillIds.length > 1 ? 's' : '' }}
            </span>
            <span v-if="agent.mcpIds.length" class="text-[10px] px-1.5 py-0.5 rounded bg-warning-orange/10 text-warning-orange">
              {{ agent.mcpIds.length }} MCP{{ agent.mcpIds.length > 1 ? 's' : '' }}
            </span>
            <span v-if="agent.soulId" class="text-[10px] px-1.5 py-0.5 rounded bg-pink/10 text-pink">Soul</span>
            <span v-if="agent.workIds.length" class="text-[10px] px-1.5 py-0.5 rounded bg-indigo/10 text-indigo">{{ agent.workIds.length }} Work{{ agent.workIds.length > 1 ? 's' : '' }}</span>
            <span v-if="agent.sources.webSearch" class="text-[10px] px-1.5 py-0.5 rounded bg-info-blue/10 text-info-blue">Web</span>
          </div>

          <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-4 line-clamp-2">{{ agent.description }}</p>

          <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-800">
            <span class="text-[10px] text-apple-gray-400">{{ formatDate(agent.createdAt) }}</span>
            <div class="flex items-center gap-2">
              <button type="button" :class="['w-10 h-6 rounded-full transition-colors duration-200 relative', agent.isSystem ? 'cursor-not-allowed opacity-50 bg-brian-blue' : 'cursor-pointer', agent.enabled ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600']" :disabled="agent.isSystem" @click.stop="agent.isSystem ? null : toggle(agent.id)" :title="agent.isSystem ? '系统 Agent 不可操作' : agent.enabled ? '禁用' : '启用'">
                <span :class="['w-4 h-4 rounded-full bg-white shadow-sm absolute top-1 left-0.5 transition-transform duration-200 pointer-events-none', agent.enabled ? 'translate-x-[20px]' : 'translate-x-0']" />
              </button>
              <button class="p-1.5 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="openEditModal(agent)" :title="agent.isSystem ? '查看（系统Agent不可编辑）' : '编辑'">
                <Eye v-if="agent.isSystem" :size="14" class="text-apple-gray-400" />
                <Edit3 v-else :size="14" class="text-apple-gray-400" />
              </button>
              <button class="p-1.5 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="cloneAgent(agent.id)" title="复制">
                <Copy :size="14" class="text-apple-gray-400" />
              </button>
              <button v-if="!agent.isSystem" class="p-1.5 rounded-lg hover:bg-error-red/10" @click="remove(agent.id)" title="删除">
                <Trash2 :size="14" class="text-error-red" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="agents.length === 0" class="col-span-full text-center py-12 text-apple-gray-400 text-sm">
          {{ searchQuery ? '未找到匹配的 Agent' : '暂无 Agent，点击上方「新建 Agent」创建' }}
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="closeModal" />
        <div class="relative w-full max-w-2xl bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl overflow-hidden">
          <div class="flex items-center justify-between p-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div class="flex items-center gap-2">
              <Zap :size="16" class="text-brian-blue" />
              <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ modalTitle }}</h3>
            </div>
            <button class="p-1.5 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="closeModal">
              <X :size="16" class="text-apple-gray-400" />
            </button>
          </div>

          <div class="p-5 overflow-y-auto max-h-[70vh] space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-apple-gray-400 mb-1 block">名称 *</label>
                <input v-model="form.name" placeholder="输入 Agent 名称" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue transition-all" />
              </div>
              <div>
                <label class="text-xs text-apple-gray-400 mb-1 block">角色 *</label>
                <select v-model="form.role" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue transition-all">
                  <option value="" disabled>请选择角色</option>
                  <option value="planner">任务规划者</option>
                  <option value="worker">工作Agent</option>
                  <option value="evaluator">评估Agent</option>
                </select>
                <p class="text-[10px] text-apple-gray-400 mt-1 leading-relaxed">
                  <span v-if="form.role === 'planner'">从编排框架获取上下文，逐步分解用户问题为子任务 DAG，为每个子任务选择/构建工作Agent。</span>
                  <span v-else-if="form.role === 'worker'">接收执行上下文，使用 Soul+Skill+Work+MCP 通过 LLM 完成指定工作。</span>
                  <span v-else-if="form.role === 'evaluator'">接收上下文与工作Agent回复，多维评估并回写可靠性与强度到 AgentLibrary。</span>
                  <span v-else>选择 Agent 的角色类型。</span>
                </p>
              </div>
            </div>

            <div>
              <label class="text-xs text-apple-gray-400 mb-1 block">描述</label>
              <input v-model="form.description" placeholder="描述 Agent 的功能" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue transition-all" />
            </div>

            <div v-if="form.role" class="grid grid-cols-3 gap-3">
              <div>
                <label class="text-xs text-apple-gray-400 mb-1 block">策略类型</label>
                <select v-model="form.strategyType" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue transition-all">
                  <option value="react">ReAct</option>
                  <option value="cot">Chain-of-Thought</option>
                  <option value="tot">Tree-of-Thought</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label class="text-xs text-apple-gray-400 mb-1 block">最大迭代</label>
                <input v-model.number="form.maxIterations" type="number" min="1" max="50" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue transition-all" />
              </div>
              <div>
                <label class="text-xs text-apple-gray-400 mb-1 block">温度</label>
                <input v-model.number="form.temperature" type="number" min="0" max="2" step="0.1" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue transition-all" />
              </div>
            </div>

            <div>
              <label class="text-xs text-apple-gray-400 mb-1 block">Max Tokens</label>
              <input v-model.number="form.maxTokens" type="number" min="1" max="128000" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue transition-all" />
            </div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-apple-gray-400">System Prompt</label>
                <button class="flex items-center gap-1 text-xs text-brian-blue hover:underline" :disabled="!form.role || generatingPrompt" @click="handleGeneratePrompt">
                  <Sparkles :size="12" /> <Loader2 v-if="generatingPrompt" :size="12" class="animate-spin" /><span v-else>AI 生成</span>
                </button>
              </div>
              <textarea v-model="form.systemPrompt" placeholder="系统提示词..." rows="3" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue transition-all" />
            </div>

            <div v-if="form.role === 'worker'">
              <label class="text-xs text-apple-gray-400 mb-1 block">指令</label>
              <textarea v-model="form.instruction" placeholder="具体指令..." rows="2" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue transition-all" />
            </div>

            <div v-if="form.role === 'worker'">
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs text-apple-gray-400">关联 Skills</label>
                <button class="flex items-center gap-1 text-xs text-brian-blue hover:underline" :disabled="!form.role || suggestingSkills" @click="handleSuggestSkills">
                  <Sparkles :size="12" /> <Loader2 v-if="suggestingSkills" :size="12" class="animate-spin" /><span v-else>AI 推荐</span>
                </button>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg overflow-hidden">
                  <div class="flex items-center gap-1.5 px-3 py-2 bg-apple-gray-50 dark:bg-apple-gray-800/50 border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <span class="w-2 h-2 rounded-full bg-success-green" />
                    <span class="text-[10px] font-medium text-apple-gray-700 dark:text-apple-gray-300">已关联</span>
                    <span class="text-[10px] text-apple-gray-400">({{ associatedSkills.length }})</span>
                  </div>
                  <div class="max-h-40 overflow-y-auto">
                    <div v-if="associatedSkills.length === 0" class="text-center py-6 text-[10px] text-apple-gray-400">暂无关联</div>
                    <div
                      v-for="skill in associatedSkills"
                      :key="skill.id"
                      class="flex items-center justify-between px-3 py-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 border-b border-apple-gray-100 dark:border-apple-gray-800 last:border-b-0 transition-colors"
                    >
                      <div class="min-w-0 flex-1">
                        <div class="text-xs text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ skill.name }}</div>
                        <div class="text-[10px] text-apple-gray-400 truncate">{{ skill.id }}</div>
                      </div>
                      <button
                        class="ml-2 p-1 rounded hover:bg-error-red/10 text-apple-gray-400 hover:text-error-red transition-colors flex-shrink-0"
                        @click="removeSkillFromForm(skill.id)"
                        title="取消关联"
                      >
                        <X :size="14" />
                      </button>
                    </div>
                  </div>
                </div>

                <div class="border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg overflow-hidden">
                  <div class="flex items-center gap-1.5 px-3 py-2 bg-apple-gray-50 dark:bg-apple-gray-800/50 border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <span class="w-2 h-2 rounded-full bg-brian-blue" />
                    <span class="text-[10px] font-medium text-apple-gray-700 dark:text-apple-gray-300">可绑定</span>
                    <span class="text-[10px] text-apple-gray-400">({{ availableSkills.filter(s => !form.skillIds.includes(s.id)).length }})</span>
                  </div>
                  <div class="max-h-40 overflow-y-auto">
                    <div v-if="availableSkills.filter(s => !form.skillIds.includes(s.id)).length === 0" class="text-center py-6 text-[10px] text-apple-gray-400">暂无可绑定 Skill</div>
                    <div
                      v-for="skill in availableSkills.filter(s => !form.skillIds.includes(s.id))"
                      :key="skill.id"
                      class="flex items-center justify-between px-3 py-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 border-b border-apple-gray-100 dark:border-apple-gray-800 last:border-b-0 transition-colors"
                    >
                      <div class="min-w-0 flex-1">
                        <div class="text-xs text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ skill.name }}</div>
                        <div class="text-[10px] text-apple-gray-400 truncate">{{ skill.id }}</div>
                      </div>
                      <button
                        class="ml-2 p-1 rounded hover:bg-brian-blue/10 text-apple-gray-400 hover:text-brian-blue transition-colors flex-shrink-0"
                        @click="addSkillToForm(skill.id)"
                        title="添加关联"
                      >
                        <Plus :size="14" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            

            <div v-if="form.role === 'worker'">
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs text-apple-gray-400">关联 Soul</label>
                <button class="flex items-center gap-1 text-xs text-brian-blue hover:underline" :disabled="!form.role || suggestingSouls" @click="handleSuggestSouls">
                  <Sparkles :size="12" /> <Loader2 v-if="suggestingSouls" :size="12" class="animate-spin" /><span v-else>AI 推荐</span>
                </button>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg overflow-hidden">
                  <div class="flex items-center gap-1.5 px-3 py-2 bg-apple-gray-50 dark:bg-apple-gray-800/50 border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <span class="w-2 h-2 rounded-full bg-success-green" />
                    <span class="text-[10px] font-medium text-apple-gray-700 dark:text-apple-gray-300">已关联</span>
                    <span class="text-[10px] text-apple-gray-400">({{ associatedSoul ? 1 : 0 }})</span>
                  </div>
                  <div class="max-h-40 overflow-y-auto">
                    <div v-if="!associatedSoul" class="text-center py-6 text-[10px] text-apple-gray-400">暂无关联</div>
                    <div v-else class="flex items-center justify-between px-3 py-2">
                      <div class="min-w-0 flex-1">
                        <div class="text-xs text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ associatedSoul.name }}</div>
                        <div class="text-[10px] text-apple-gray-400 truncate">{{ associatedSoul.id }}</div>
                      </div>
                      <button
                        class="ml-2 p-1 rounded hover:bg-error-red/10 text-apple-gray-400 hover:text-error-red transition-colors flex-shrink-0"
                        @click="removeSoulFromForm()"
                        title="取消关联"
                      >
                        <X :size="14" />
                      </button>
                    </div>
                  </div>
                </div>

                <div class="border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg overflow-hidden">
                  <div class="flex items-center gap-1.5 px-3 py-2 bg-apple-gray-50 dark:bg-apple-gray-800/50 border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <span class="w-2 h-2 rounded-full bg-brian-blue" />
                    <span class="text-[10px] font-medium text-apple-gray-700 dark:text-apple-gray-300">可绑定</span>
                    <span class="text-[10px] text-apple-gray-400">({{ availableSouls.filter(s => s.id !== form.soulId).length }})</span>
                  </div>
                  <div class="max-h-40 overflow-y-auto">
                    <div v-if="availableSouls.filter(s => s.id !== form.soulId).length === 0" class="text-center py-6 text-[10px] text-apple-gray-400">暂无可绑定 Soul</div>
                    <div
                      v-for="soul in availableSouls.filter(s => s.id !== form.soulId)"
                      :key="soul.id"
                      class="flex items-center justify-between px-3 py-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 border-b border-apple-gray-100 dark:border-apple-gray-800 last:border-b-0 transition-colors"
                    >
                      <div class="min-w-0 flex-1">
                        <div class="text-xs text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ soul.name }}</div>
                        <div class="text-[10px] text-apple-gray-400 truncate">{{ soul.id }}</div>
                      </div>
                      <button
                        class="ml-2 p-1 rounded hover:bg-brian-blue/10 text-apple-gray-400 hover:text-brian-blue transition-colors flex-shrink-0"
                        @click="setSoulToForm(soul.id)"
                        title="添加关联"
                      >
                        <Plus :size="14" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="form.role === 'worker'">
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs text-apple-gray-400">关联 Work</label>
                <button class="flex items-center gap-1 text-xs text-brian-blue hover:underline" :disabled="!form.role || suggestingWorks" @click="handleSuggestWorks">
                  <Sparkles :size="12" /> <Loader2 v-if="suggestingWorks" :size="12" class="animate-spin" /><span v-else>AI 推荐</span>
                </button>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg overflow-hidden">
                  <div class="flex items-center gap-1.5 px-3 py-2 bg-apple-gray-50 dark:bg-apple-gray-800/50 border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <span class="w-2 h-2 rounded-full bg-success-green" />
                    <span class="text-[10px] font-medium text-apple-gray-700 dark:text-apple-gray-300">已关联</span>
                    <span class="text-[10px] text-apple-gray-400">({{ associatedWorks.length }})</span>
                  </div>
                  <div class="max-h-40 overflow-y-auto">
                    <div v-if="associatedWorks.length === 0" class="text-center py-6 text-[10px] text-apple-gray-400">暂无关联</div>
                    <div
                      v-for="work in associatedWorks"
                      :key="work.id"
                      class="flex items-center justify-between px-3 py-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 border-b border-apple-gray-100 dark:border-apple-gray-800 last:border-b-0 transition-colors"
                    >
                      <div class="min-w-0 flex-1">
                        <div class="text-xs text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ work.name }}</div>
                        <div class="text-[10px] text-apple-gray-400 truncate">{{ work.id }}</div>
                      </div>
                      <button
                        class="ml-2 p-1 rounded hover:bg-error-red/10 text-apple-gray-400 hover:text-error-red transition-colors flex-shrink-0"
                        @click="removeWorkFromForm(work.id)"
                        title="取消关联"
                      >
                        <X :size="14" />
                      </button>
                    </div>
                  </div>
                </div>

                <div class="border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg overflow-hidden">
                  <div class="flex items-center gap-1.5 px-3 py-2 bg-apple-gray-50 dark:bg-apple-gray-800/50 border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <span class="w-2 h-2 rounded-full bg-brian-blue" />
                    <span class="text-[10px] font-medium text-apple-gray-700 dark:text-apple-gray-300">可绑定</span>
                    <span class="text-[10px] text-apple-gray-400">({{ availableWorks.filter(w => !form.workIds.includes(w.id)).length }})</span>
                  </div>
                  <div class="max-h-40 overflow-y-auto">
                    <div v-if="availableWorks.filter(w => !form.workIds.includes(w.id)).length === 0" class="text-center py-6 text-[10px] text-apple-gray-400">暂无可绑定 Work</div>
                    <div
                      v-for="work in availableWorks.filter(w => !form.workIds.includes(w.id))"
                      :key="work.id"
                      class="flex items-center justify-between px-3 py-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 border-b border-apple-gray-100 dark:border-apple-gray-800 last:border-b-0 transition-colors"
                    >
                      <div class="min-w-0 flex-1">
                        <div class="text-xs text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ work.name }}</div>
                        <div class="text-[10px] text-apple-gray-400 truncate">{{ work.id }}</div>
                      </div>
                      <button
                        class="ml-2 p-1 rounded hover:bg-brian-blue/10 text-apple-gray-400 hover:text-brian-blue transition-colors flex-shrink-0"
                        @click="addWorkToForm(work.id)"
                        title="添加关联"
                      >
                        <Plus :size="14" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- MCP -->
            <div v-if="form.role === 'worker'">
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs text-apple-gray-400">关联 MCP（预留）</label>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg overflow-hidden">
                  <div class="flex items-center gap-1.5 px-3 py-2 bg-apple-gray-50 dark:bg-apple-gray-800/50 border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <span class="w-2 h-2 rounded-full bg-success-green" />
                    <span class="text-[10px] font-medium text-apple-gray-700 dark:text-apple-gray-300">已关联</span>
                    <span class="text-[10px] text-apple-gray-400">({{ associatedMcps.length }})</span>
                  </div>
                  <div class="max-h-40 overflow-y-auto">
                    <div v-if="associatedMcps.length === 0" class="text-center py-6 text-[10px] text-apple-gray-400">暂无关联</div>
                    <div v-for="mcp in associatedMcps" :key="mcp.id" class="flex items-center justify-between px-3 py-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 border-b border-apple-gray-100 dark:border-apple-gray-800 last:border-b-0 transition-colors">
                      <div class="min-w-0 flex-1">
                        <div class="text-xs text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ mcp.name }}</div>
                      </div>
                      <button class="ml-2 p-1 rounded hover:bg-error-red/10 text-apple-gray-400 hover:text-error-red transition-colors flex-shrink-0" @click="removeMcpFromForm(mcp.id)" title="取消关联"><X :size="14" /></button>
                    </div>
                  </div>
                </div>
                <div class="border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg overflow-hidden">
                  <div class="flex items-center gap-1.5 px-3 py-2 bg-apple-gray-50 dark:bg-apple-gray-800/50 border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <span class="w-2 h-2 rounded-full bg-brian-blue" />
                    <span class="text-[10px] font-medium text-apple-gray-700 dark:text-apple-gray-300">可绑定</span>
                    <span class="text-[10px] text-apple-gray-400">({{ availableMcps.filter(m => !form.mcpIds.includes(m.id)).length }})</span>
                  </div>
                  <div class="max-h-40 overflow-y-auto">
                    <div v-if="availableMcps.filter(m => !form.mcpIds.includes(m.id)).length === 0" class="text-center py-6 text-[10px] text-apple-gray-400">暂无可绑定 MCP</div>
                    <div v-for="mcp in availableMcps.filter(m => !form.mcpIds.includes(m.id))" :key="mcp.id" class="flex items-center justify-between px-3 py-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 border-b border-apple-gray-100 dark:border-apple-gray-800 last:border-b-0 transition-colors">
                      <div class="min-w-0 flex-1">
                        <div class="text-xs text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ mcp.name }}</div>
                      </div>
                      <button class="ml-2 p-1 rounded hover:bg-brian-blue/10 text-apple-gray-400 hover:text-brian-blue transition-colors flex-shrink-0" @click="addMcpToForm(mcp.id)" title="添加关联"><Plus :size="14" /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div class="flex items-center justify-end gap-2 p-4 border-t border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800">
            <button class="px-4 py-1.5 text-xs font-medium bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg" @click="closeModal">取消</button>
            <button v-if="!isSystemViewing" class="px-4 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg" @click="saveModal">保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    </div>
</template>
