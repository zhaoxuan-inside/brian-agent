<script setup lang="ts">
import { ref } from 'vue'
import { Layers, Plus, Trash2, Edit3, Save } from '@lucide/vue'
import { soulStore, SoulItem } from '../../stores/soul'

const editingId = ref<string | null>(null)
const showNew = ref(false)
const newForm = ref({ name: '', description: '', category: 'code', prompt: '', temperature: 0.7 })
const editForm = ref({ name: '', description: '', category: 'code', prompt: '', temperature: 0.7 })

function startEdit(s: SoulItem) {
  editingId.value = s.id
  editForm.value = { name: s.name, description: s.description, category: s.category, prompt: s.prompt, temperature: s.temperature }
}

function saveEdit() {
  const idx = soulStore.souls.findIndex(s => s.id === editingId.value)
  if (idx !== -1) {
    soulStore.update(editingId.value!, { ...editForm.value })
  }
  editingId.value = null
}

function addNew() {
  const soul: SoulItem = {
    id: `soul-${Date.now()}`,
    ...newForm.value,
    createdAt: Date.now(),
  }
  soulStore.add(soul)
  newForm.value = { name: '', description: '', category: 'code', prompt: '', temperature: 0.7 }
  showNew.value = false
}

function remove(id: string) {
  soulStore.remove(id)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between p-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-950">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-brian-blue/10 rounded-lg"><Layers :size="20" class="text-brian-blue" /></div>
        <div>
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">Soul（沉淀）</h2>
          <p class="text-xs text-apple-gray-400">大类任务底层沉淀策略</p>
        </div>
      </div>
      <button class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90" @click="showNew = true">
        <Plus :size="14" /> 新建
      </button>
    </div>

    <div v-if="showNew" class="p-4 border-b border-apple-gray-200 dark:border-apple-gray-700 space-y-3 bg-apple-gray-50 dark:bg-apple-gray-800/50">
      <input v-model="newForm.name" placeholder="名称" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
      <input v-model="newForm.description" placeholder="描述" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
      <select v-model="newForm.category" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none">
        <option value="code">代码</option><option value="writing">写作</option><option value="data">数据</option><option value="general">通用</option>
      </select>
      <textarea v-model="newForm.prompt" placeholder="System Prompt" rows="3" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
      <div class="flex items-center gap-2">
        <label class="text-xs text-apple-gray-400 whitespace-nowrap">Temperature</label>
        <input v-model.number="newForm.temperature" type="number" min="0" max="2" step="0.1" class="w-20 px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
        <span class="text-[10px] text-apple-gray-400">0=精确 1=平衡 2=创意</span>
      </div>
      <div class="flex gap-2">
        <button class="px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg" @click="addNew">保存</button>
        <button class="px-3 py-1.5 text-xs font-medium bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg" @click="showNew = false">取消</button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      <div v-for="s in soulStore.souls" :key="s.id" class="glass-panel rounded-xl p-4">
        <div class="flex items-start justify-between mb-2">
          <div>
            <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ s.name }}</h3>
            <p class="text-xs text-apple-gray-400">{{ s.description }}</p>
          </div>
          <div class="flex gap-1">
            <button class="p-1.5 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="startEdit(s)"><Edit3 :size="14" class="text-apple-gray-400" /></button>
            <button class="p-1.5 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="remove(s.id)"><Trash2 :size="14" class="text-error-red" /></button>
          </div>
        </div>
        <div class="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-2 flex items-center gap-3">
          <span class="px-2 py-0.5 bg-brian-blue/10 rounded-full text-brian-blue">{{ s.category }}</span>
          <span class="text-apple-gray-400">T: {{ s.temperature }}</span>
        </div>
        <pre class="text-[11px] text-apple-gray-600 dark:text-apple-gray-400 bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-lg p-3 whitespace-pre-wrap">{{ s.prompt }}</pre>
        <div v-if="editingId === s.id" class="mt-3 pt-3 border-t border-apple-gray-200 dark:border-apple-gray-700 space-y-2">
          <input v-model="editForm.name" class="w-full px-3 py-1.5 rounded text-sm bg-white dark:bg-apple-gray-800 outline-none" />
          <textarea v-model="editForm.prompt" rows="2" class="w-full px-3 py-1.5 rounded text-sm bg-white dark:bg-apple-gray-800 outline-none" />
          <div class="flex items-center gap-2">
            <label class="text-xs text-apple-gray-400">Temperature</label>
            <input v-model.number="editForm.temperature" type="number" min="0" max="2" step="0.1" class="w-20 px-2 py-1 rounded text-sm bg-white dark:bg-apple-gray-800 outline-none" />
          </div>
          <button class="px-3 py-1 text-xs font-medium bg-brian-blue text-white rounded" @click="saveEdit"><Save :size="12" class="inline mr-1" />保存</button>
        </div>
      </div>

      <div v-if="soulStore.souls.length === 0" class="text-center py-12 text-apple-gray-400 text-sm">暂无 Soul 配置，点击上方「新建」添加</div>
    </div>
  </div>
</template>
