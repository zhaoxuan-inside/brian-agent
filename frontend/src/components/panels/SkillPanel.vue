<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Wand2, Plus, Trash2, Edit3, Save, Globe, Terminal, FileText, Search, Code2, Monitor } from '@lucide/vue'
import { skillApi, type ConfigItem } from '../../api'

interface SkillItem {
  id: string
  name: string
  description: string
  triggerKeywords: string[]
  systemPrompt: string
  boundTools: string[]
  preferredModel: string
  enabled: boolean
  createdAt: number
}

const skills = ref<SkillItem[]>([])
const editingId = ref<string | null>(null)
const showNew = ref(false)

const availableTools = [
  { id: 'webSearch', label: 'Web Search' },
  { id: 'fileSystem', label: 'File System' },
  { id: 'shell', label: 'Shell Execution' },
  { id: 'apiCall', label: 'API Call' },
  { id: 'browser', label: 'Browser' },
  { id: 'codeInterpreter', label: 'Code Interpreter' },
]

const availableModels = ref<string[]>(['auto'])

const newForm = ref({
  name: '',
  description: '',
  triggerKeywords: [] as string[],
  systemPrompt: '',
  boundTools: [] as string[],
  preferredModel: 'auto',
  enabled: true,
})

const editForm = ref({
  name: '',
  description: '',
  triggerKeywords: [] as string[],
  systemPrompt: '',
  boundTools: [] as string[],
  preferredModel: 'auto',
  enabled: true,
})

const newKeywordInput = ref('')

function mapSkill(item: ConfigItem): SkillItem {
  const createdAtRaw = item.createdAt as unknown
  let createdAt = Date.now()
  if (typeof createdAtRaw === 'number') {
    createdAt = createdAtRaw
  } else if (typeof createdAtRaw === 'string') {
    const parsed = Date.parse(createdAtRaw)
    if (!Number.isNaN(parsed)) createdAt = parsed
  }
  const enabled = item.enabled !== undefined
    ? Boolean(item.enabled)
    : item.active !== undefined
      ? Boolean(item.active)
      : true
  return {
    id: String(item.id ?? item.name ?? ''),
    name: String(item.name ?? ''),
    description: String(item.description ?? ''),
    triggerKeywords: Array.isArray(item.triggerKeywords) ? (item.triggerKeywords as unknown[]).map(String) : [],
    systemPrompt: String(item.systemPrompt ?? ''),
    boundTools: Array.isArray(item.boundTools) ? (item.boundTools as unknown[]).map(String) : [],
    preferredModel: String(item.preferredModel ?? 'auto'),
    enabled,
    createdAt,
  }
}

async function loadSkills() {
  try {
    const result = await skillApi.list()
    skills.value = Array.isArray(result.skills) ? result.skills.map(mapSkill) : []
  } catch {
    skills.value = []
  }
}

onMounted(() => {
  loadSkills()
})

function addKeyword(to: typeof newForm.value) {
  const kw = newKeywordInput.value.trim()
  if (kw && !to.triggerKeywords.includes(kw)) {
    to.triggerKeywords.push(kw)
  }
  newKeywordInput.value = ''
}

function removeKeyword(to: typeof newForm.value, kw: string) {
  to.triggerKeywords = to.triggerKeywords.filter(k => k !== kw)
}

function toggleTool(form: typeof newForm.value, toolId: string) {
  const idx = form.boundTools.indexOf(toolId)
  if (idx >= 0) form.boundTools.splice(idx, 1)
  else form.boundTools.push(toolId)
}

function startEdit(s: SkillItem) {
  editingId.value = s.id
  editForm.value = {
    name: s.name,
    description: s.description,
    triggerKeywords: [...s.triggerKeywords],
    systemPrompt: s.systemPrompt,
    boundTools: [...s.boundTools],
    preferredModel: s.preferredModel,
    enabled: s.enabled,
  }
}

async function saveEdit() {
  if (!editingId.value) return
  try {
    const updated = await skillApi.update(editingId.value, {
      name: editForm.value.name,
      description: editForm.value.description,
      triggerKeywords: editForm.value.triggerKeywords,
      systemPrompt: editForm.value.systemPrompt,
      boundTools: editForm.value.boundTools,
      preferredModel: editForm.value.preferredModel,
      enabled: editForm.value.enabled,
    })
    const idx = skills.value.findIndex(s => s.id === editingId.value)
    if (idx !== -1 && updated) skills.value[idx] = mapSkill(updated as ConfigItem)
  } catch { /* ignore */ }
  editingId.value = null
}

async function addNew() {
  try {
    const created = await skillApi.create({
      name: newForm.value.name,
      description: newForm.value.description,
      triggerKeywords: newForm.value.triggerKeywords,
      systemPrompt: newForm.value.systemPrompt,
      boundTools: newForm.value.boundTools,
      preferredModel: newForm.value.preferredModel,
      enabled: newForm.value.enabled,
    })
    if (created) {
      skills.value.push(mapSkill(created as ConfigItem))
    } else {
      await loadSkills()
    }
  } catch {
    /* ignore — keep local form so user can retry */
  }
  newForm.value = {
    name: '',
    description: '',
    triggerKeywords: [],
    systemPrompt: '',
    boundTools: [],
    preferredModel: 'auto',
    enabled: true,
  }
  showNew.value = false
}

async function remove(id: string) {
  const prev = skills.value
  skills.value = skills.value.filter(s => s.id !== id)
  try {
    await skillApi.delete(id)
  } catch {
    // restore on failure
    skills.value = prev
  }
}
async function toggle(id: string) {
  const s = skills.value.find(s => s.id === id)
  if (!s) return
  const oldEnabled = s.enabled
  s.enabled = !s.enabled
  try {
    await skillApi.toggle(id)
  } catch (err) {
    console.error('[SkillPanel] toggle failed:', err)
    s.enabled = oldEnabled
  }
}

function getToolIcon(toolId: string) {
  switch (toolId) {
    case 'webSearch': return Search
    case 'shell': return Terminal
    case 'apiCall': return Globe
    case 'fileSystem': return FileText
    case 'browser': return Monitor
    case 'codeInterpreter': return Code2
    default: return Wand2
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between p-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-950">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-warning-orange/10 rounded-lg"><Wand2 :size="20" class="text-warning-orange" /></div>
        <div>
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">Skill（Agent技能）</h2>
          <p class="text-xs text-apple-gray-400">Agent行为模板与工具绑定</p>
        </div>
      </div>
      <button class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90" @click="showNew = true">
        <Plus :size="14" /> 新建
      </button>
    </div>

    <div v-if="showNew" class="p-4 border-b space-y-3 bg-apple-gray-50 dark:bg-apple-gray-800/50">
      <input v-model="newForm.name" placeholder="技能名称" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all" />
      <input v-model="newForm.description" placeholder="描述" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all" />

      <!-- Trigger keywords tag input -->
      <div>
        <label class="text-xs text-apple-gray-400 mb-1 block">触发关键词</label>
        <div class="flex flex-wrap gap-1 mb-1">
          <span v-for="kw in newForm.triggerKeywords" :key="kw"
            class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-brian-blue/10 text-brian-blue">
            {{ kw }}
            <button class="hover:text-error-red" @click="removeKeyword(newForm, kw)">&times;</button>
          </span>
        </div>
        <div class="flex gap-1">
          <input v-model="newKeywordInput" placeholder="输入关键词后回车" class="flex-1 px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all"
            @keyup.enter="addKeyword(newForm)" />
          <button class="px-3 py-1.5 text-xs bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg" @click="addKeyword(newForm)">添加</button>
        </div>
      </div>

      <!-- System prompt template -->
      <div>
        <label class="text-xs text-apple-gray-400 mb-1 block">System Prompt 模板</label>
        <textarea v-model="newForm.systemPrompt" placeholder="定义 Agent 行为..." rows="4"
          class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all" />
      </div>

      <!-- Bound tools -->
      <div>
        <label class="text-xs text-apple-gray-400 mb-1 block">绑定工具</label>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="t in availableTools" :key="t.id"
            :class="['inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors',
              newForm.boundTools.includes(t.id) ? 'bg-brian-blue text-white' : 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-500']"
            @click="toggleTool(newForm, t.id)">
            <component :is="getToolIcon(t.id)" :size="12" />
            {{ t.label }}
          </button>
        </div>
      </div>

      <!-- Preferred model -->
      <div>
        <label class="text-xs text-apple-gray-400 mb-1 block">首选模型</label>
        <select v-model="newForm.preferredModel" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all">
          <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>

      <div class="flex gap-2">
        <button class="px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg" @click="addNew">保存</button>
        <button class="px-3 py-1.5 text-xs font-medium bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg" @click="showNew = false">取消</button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      <div v-for="s in skills" :key="s.id" class="glass-panel rounded-xl p-4 relative">
        <!-- Status badge: top-right -->
        <span :class="['absolute top-3 right-3 text-[10px] px-1.5 py-0.5 rounded-full pointer-events-none', s.enabled ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400']">
          {{ s.enabled ? '已启用' : '已禁用' }}
        </span>
        <div class="flex items-start justify-between mb-2 pr-16">
          <div class="flex items-center gap-2">
            <div>
              <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ s.name }}</h3>
              <p class="text-xs text-apple-gray-400">{{ s.description }}</p>
            </div>
          </div>
          <div class="flex gap-1">
            <button class="p-1.5 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="startEdit(s)"><Edit3 :size="14" class="text-apple-gray-400" /></button>
            <button class="p-1.5 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="remove(s.id)"><Trash2 :size="14" class="text-error-red" /></button>
          </div>
        </div>
        <!-- Keywords -->
        <div class="flex flex-wrap gap-1 mb-2">
          <span v-for="kw in s.triggerKeywords" :key="kw"
            class="text-[10px] px-2 py-0.5 rounded-full bg-warning-orange/10 text-warning-orange">{{ kw }}</span>
        </div>
        <!-- Tool bindings -->
        <div class="flex flex-wrap gap-1 mb-2">
          <span v-for="tid in s.boundTools" :key="tid"
            class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue">
            <component :is="getToolIcon(tid)" :size="10" />
            {{ availableTools.find(t => t.id === tid)?.label || tid }}
          </span>
        </div>
        <!-- System prompt preview -->
        <pre class="text-[11px] text-apple-gray-600 dark:text-apple-gray-400 bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-lg p-3 whitespace-pre-wrap line-clamp-3">{{ s.systemPrompt }}</pre>
        <div class="flex items-center gap-3 mt-2 text-[10px] text-apple-gray-400">
          <span>模型: {{ s.preferredModel }}</span>
          <button type="button" :class="['w-10 h-6 rounded-full transition-colors duration-200 relative cursor-pointer', s.enabled ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600']" @click.stop="toggle(s.id)" :title="s.enabled ? '禁用' : '启用'">
            <span :class="['w-4 h-4 rounded-full bg-white shadow-sm absolute top-1 left-0.5 transition-transform duration-200 pointer-events-none', s.enabled ? 'translate-x-[20px]' : 'translate-x-0']" />
          </button>
        </div>

        <!-- Edit form -->
        <div v-if="editingId === s.id" class="mt-3 pt-3 border-t border-apple-gray-200 dark:border-apple-gray-700 space-y-2">
          <input v-model="editForm.name" class="w-full px-3 py-1.5 rounded text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all" />
          <textarea v-model="editForm.systemPrompt" rows="3" class="w-full px-3 py-1.5 rounded text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all" />
          <select v-model="editForm.preferredModel" class="w-full px-3 py-1.5 rounded text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all">
            <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
          </select>
          <button class="px-3 py-1 text-xs font-medium bg-brian-blue text-white rounded" @click="saveEdit"><Save :size="12" class="inline mr-1" />保存</button>
        </div>
      </div>

      <div v-if="skills.length === 0" class="text-center py-12 text-apple-gray-400 text-sm">暂无 Agent 技能配置，点击上方「新建」添加</div>
    </div>
  </div>
</template>
