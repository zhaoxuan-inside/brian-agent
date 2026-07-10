<script setup lang="ts">
import { ref } from 'vue'
import { Puzzle, Plus, Trash2, Edit3, Save } from '@lucide/vue'
import { soulStore } from '../../stores/soul'

interface WorkItem {
  id: string
  name: string
  description: string
  soulId: string
  prompt: string
  tools: string[]
  createdAt: number
}

const works = ref<WorkItem[]>([])
const editingId = ref<string | null>(null)
const showNew = ref(false)
const newForm = ref({ name: '', description: '', soulId: '', prompt: '', tools: [] as string[] })
const editForm = ref({ name: '', description: '', soulId: '', prompt: '', tools: [] as string[] })

const availableTools = ['shell', 'api', 'browser', 'file', 'database']

function toggleTool(form: typeof newForm.value | typeof editForm.value, tool: string) {
  const idx = form.tools.indexOf(tool)
  if (idx >= 0) form.tools.splice(idx, 1)
  else form.tools.push(tool)
}

function startEdit(w: WorkItem) {
  editingId.value = w.id
  editForm.value = { name: w.name, description: w.description, soulId: w.soulId, prompt: w.prompt, tools: [...w.tools] }
}

function saveEdit() {
  const idx = works.value.findIndex(w => w.id === editingId.value)
  if (idx !== -1) works.value[idx] = { ...works.value[idx], ...editForm.value }
  editingId.value = null
}

function addNew() {
  works.value.push({ id: `work-${Date.now()}`, ...newForm.value, createdAt: Date.now() })
  newForm.value = { name: '', description: '', soulId: '', prompt: '', tools: [] }
  showNew.value = false
}

function remove(id: string) { works.value = works.value.filter(w => w.id !== id) }
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between p-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-950">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-success-green/10 rounded-lg"><Puzzle :size="20" class="text-success-green" /></div>
        <div>
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">Work（方案）</h2>
          <p class="text-xs text-apple-gray-400">具体细分方案沉淀</p>
        </div>
      </div>
      <button class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90" @click="showNew = true">
        <Plus :size="14" /> 新建
      </button>
    </div>

    <div v-if="showNew" class="p-4 border-b border-apple-gray-200 dark:border-apple-gray-700 space-y-3 bg-apple-gray-50 dark:bg-apple-gray-800/50">
      <input v-model="newForm.name" placeholder="方案名称" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
      <input v-model="newForm.description" placeholder="描述" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
      <select v-model="newForm.soulId" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none">
        <option value="">选择 Soul</option>
        <option v-for="s in soulStore.souls" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="t in availableTools" :key="t"
          :class="['px-2.5 py-1 rounded-full text-xs transition-colors', newForm.tools.includes(t) ? 'bg-brian-blue text-white' : 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-500']"
          @click="toggleTool(newForm, t)">{{ t }}</button>
      </div>
      <textarea v-model="newForm.prompt" placeholder="Work Prompt" rows="3" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
      <div class="flex gap-2">
        <button class="px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg" @click="addNew">保存</button>
        <button class="px-3 py-1.5 text-xs font-medium bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg" @click="showNew = false">取消</button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      <div v-for="w in works" :key="w.id" class="glass-panel rounded-xl p-4">
        <div class="flex items-start justify-between mb-2">
          <div>
            <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ w.name }}</h3>
            <p class="text-xs text-apple-gray-400">{{ w.description }}</p>
          </div>
          <div class="flex gap-1">
            <button class="p-1.5 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="startEdit(w)"><Edit3 :size="14" class="text-apple-gray-400" /></button>
            <button class="p-1.5 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="remove(w.id)"><Trash2 :size="14" class="text-error-red" /></button>
          </div>
        </div>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs px-2 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500">{{ soulStore.souls.find(s => s.id === w.soulId)?.name || '无' }}</span>
          <span v-for="t in w.tools" :key="t" class="text-[10px] px-1.5 py-0.5 rounded bg-brian-blue/10 text-brian-blue">{{ t }}</span>
        </div>
        <pre class="text-[11px] text-apple-gray-600 dark:text-apple-gray-400 bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-lg p-3 whitespace-pre-wrap">{{ w.prompt }}</pre>
        <div v-if="editingId === w.id" class="mt-3 pt-3 border-t border-apple-gray-200 dark:border-apple-gray-700 space-y-2">
          <input v-model="editForm.name" class="w-full px-3 py-1.5 rounded text-sm bg-white dark:bg-apple-gray-800 outline-none" />
          <textarea v-model="editForm.prompt" rows="2" class="w-full px-3 py-1.5 rounded text-sm bg-white dark:bg-apple-gray-800 outline-none" />
          <button class="px-3 py-1 text-xs font-medium bg-brian-blue text-white rounded" @click="saveEdit"><Save :size="12" class="inline mr-1" />保存</button>
        </div>
      </div>
      <div v-if="works.length === 0" class="text-center py-12 text-apple-gray-400 text-sm">暂无 Work 配置</div>
    </div>
  </div>
</template>
