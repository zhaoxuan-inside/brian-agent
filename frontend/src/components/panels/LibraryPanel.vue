<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Library, FolderOpen, Plus, Trash2 } from '@lucide/vue'

interface PathEntry {
  id: string
  path: string
  name: string
}

const API_BASE = 'http://127.0.0.1:8000/api/library'
const paths = ref<PathEntry[]>([])
const showAddForm = ref(false)
const pathInput = ref('')
const pathError = ref('')
const checkingPath = ref(false)
const loading = ref(false)

const indexedFileCount = computed(() => 0) // TODO: actual file indexing

onMounted(async () => {
  loading.value = true
  try {
    const resp = await fetch(`${API_BASE}/paths`)
    const json = await resp.json()
    if (json.ok) {
      paths.value = (json.data as string[]).map(p => ({
        id: btoa(p),
        path: p,
        name: p.split('/').pop() || p,
      }))
    }
  } catch { /* ignore */ }
  loading.value = false
})

async function handleCheckPath() {
  const p = pathInput.value.trim()
  if (!p) return
  checkingPath.value = true
  pathError.value = ''
  try {
    // Check + add via backend
    const resp = await fetch(`${API_BASE}/paths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p }),
    })
    const data = await resp.json()
    if (resp.ok && data.ok) {
      if (data.message === '路径已存在') {
        pathError.value = '路径已存在'
      } else {
        paths.value = (data.data as string[]).map(pp => ({
          id: btoa(pp),
          path: pp,
          name: pp.split('/').pop() || pp,
        }))
        showAddForm.value = false
        pathInput.value = ''
      }
    } else {
      pathError.value = data.error || '目录不存在'
    }
  } catch {
    pathError.value = '请求失败，请检查后端服务'
  }
  checkingPath.value = false
}

async function handleRemovePath(p: PathEntry) {
  try {
    const resp = await fetch(`${API_BASE}/paths`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p.path }),
    })
    const data = await resp.json()
    if (resp.ok && data.ok) {
      paths.value = (data.data as string[]).map(pp => ({
        id: btoa(pp),
        path: pp,
        name: pp.split('/').pop() || pp,
      }))
    }
  } catch {
    paths.value = paths.value.filter(x => x.id !== p.id)
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between p-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-950">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-brian-blue/10 rounded-lg">
          <Library :size="20" class="text-brian-blue" />
        </div>
        <div>
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">资料库</h2>
          <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">本地资料管理</p>
        </div>
      </div>
    </div>
    
    <div class="flex-1 overflow-y-auto p-4">
      <!-- 索引统计 — always visible, above file list -->
      <div class="p-4 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-xl mb-4">
        <h3 class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2">索引统计</h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <p class="text-2xl font-bold text-brian-blue">{{ paths.length }}</p>
            <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">已配置路径</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-brian-blue">{{ indexedFileCount }}</p>
            <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">已索引文件</p>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400">已配置路径</h3>
        <button 
          class="flex items-center gap-2 px-3 py-1.5 bg-brian-blue text-white text-sm rounded-lg hover:bg-brian-blue/90 transition-colors"
          @click="showAddForm = true"
        >
          <Plus :size="16" />
          添加路径
        </button>
      </div>
      
      <div v-if="showAddForm" class="mb-4 p-3 bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700">
        <div class="flex items-center gap-2">
          <input v-model="pathInput" type="text" placeholder="输入目录路径，如 /home/user/projects"
            class="flex-1 px-3 py-2 text-sm bg-white dark:bg-apple-gray-800 rounded-lg outline-none"
            @keyup.enter="handleCheckPath" />
          <button class="px-3 py-2 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50"
            :disabled="checkingPath" @click="handleCheckPath">
            确认
          </button>
          <button class="px-3 py-2 text-sm font-medium bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg"
            @click="showAddForm = false; pathInput = ''; pathError = ''">取消</button>
        </div>
        <p v-if="pathError" class="mt-2 text-xs text-error-red">{{ pathError }}</p>
      </div>
      
      <div v-if="paths.length === 0 && !loading" class="text-center py-8">
        <FolderOpen :size="40" class="mx-auto text-apple-gray-300 dark:text-apple-gray-600 mb-3" />
        <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400">尚未配置任何资料路径</p>
      </div>

      <div v-else class="space-y-2">
        <div 
          v-for="item in paths" 
          :key="item.id"
          class="glass-panel rounded-lg p-3 flex items-center justify-between hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors"
        >
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="p-2 rounded-lg bg-brian-blue/10">
              <FolderOpen :size="16" class="text-brian-blue" />
            </div>
            <div class="min-w-0">
              <p class="text-sm text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ item.path }}</p>
              <p class="text-xs text-apple-gray-400">{{ item.name }}</p>
            </div>
          </div>
          <button 
            class="p-2 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 rounded-lg text-apple-gray-400 hover:text-error-red transition-colors"
            @click="handleRemovePath(item)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
