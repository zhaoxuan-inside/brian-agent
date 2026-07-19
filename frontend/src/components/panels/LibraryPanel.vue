<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Library, FolderOpen, Plus, Trash2 } from '@lucide/vue'
import { libraryApi } from '../../api'

interface PathEntry {
  id: string
  path: string
  name: string
  category: string
  description?: string
}

const paths = ref<PathEntry[]>([])
const showAddForm = ref(false)
const pathInput = ref('')
const nameInput = ref('')
const categoryInput = ref('')
const pathError = ref('')
const checkingPath = ref(false)
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const result = await libraryApi.paths()
    paths.value = (result.paths || []).map((p: Record<string, unknown>) => ({
      id: String(p.id ?? ''),
      name: String(p.name ?? ''),
      path: String(p.path ?? ''),
      category: String(p.category ?? ''),
      description: p.description ? String(p.description) : undefined,
    }))
  } catch { /* ignore */ }
  loading.value = false
})

async function handleCheckPath() {
  const p = pathInput.value.trim()
  const name = nameInput.value.trim()
  const category = categoryInput.value.trim()

  if (!p || !name || !category) {
    pathError.value = '请填写完整信息（名称、路径、分类）'
    return
  }

  checkingPath.value = true
  pathError.value = ''

  try {
    const checkResult = await libraryApi.checkPath(p)
    if (!checkResult.exists) {
      pathError.value = '路径不存在'
      checkingPath.value = false
      return
    }
    if (!checkResult.isDirectory) {
      pathError.value = '路径不是目录'
      checkingPath.value = false
      return
    }

    const created = await libraryApi.addPath({
      name,
      path: p,
      category,
      description: '',
    })
    paths.value.push({
      id: String(created.id ?? ''),
      name,
      path: p,
      category,
    })
    showAddForm.value = false
    pathInput.value = ''
    nameInput.value = ''
    categoryInput.value = ''
  } catch (err: any) {
    pathError.value = err?.message || '添加失败'
  }
  checkingPath.value = false
}

async function handleRemovePath(p: PathEntry) {
  const prev = paths.value
  paths.value = paths.value.filter(x => x.id !== p.id)
  try {
    await libraryApi.deletePath(p.id)
  } catch {
    paths.value = prev
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
      <div class="p-4 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-xl mb-4">
        <h3 class="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2">索引统计</h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <p class="text-2xl font-bold text-brian-blue">{{ paths.length }}</p>
            <p class="text-xs text-apple-gray-500 dark:text-apple-gray-400">已配置路径</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-brian-blue">0</p>
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
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <input v-model="nameInput" type="text" placeholder="路径名称"
              class="flex-1 px-3 py-2 text-sm bg-white dark:bg-apple-gray-800 rounded-lg outline-none" />
            <input v-model="categoryInput" type="text" placeholder="分类（如：文档、代码）"
              class="flex-1 px-3 py-2 text-sm bg-white dark:bg-apple-gray-800 rounded-lg outline-none" />
          </div>
          <div class="flex items-center gap-2">
            <input v-model="pathInput" type="text" placeholder="输入目录路径，如 /home/user/projects"
              class="flex-1 px-3 py-2 text-sm bg-white dark:bg-apple-gray-800 rounded-lg outline-none"
              @keyup.enter="handleCheckPath" />
            <button class="px-3 py-2 text-sm font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90 disabled:opacity-50"
              :disabled="checkingPath" @click="handleCheckPath">
              确认
            </button>
            <button class="px-3 py-2 text-sm font-medium bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg"
              @click="showAddForm = false; pathInput = ''; nameInput = ''; categoryInput = ''; pathError = ''">取消</button>
          </div>
        </div>
        <p v-if="pathError" class="mt-2 text-xs text-error-red">{{ pathError }}</p>
      </div>
      
      <div v-if="paths.length === 0 && !loading" class="text-center py-8">
        <FolderOpen :size="40" class="mx-auto text-apple-gray-300 dark:text-apple-gray-600 mb-3" />
        <p class="text-sm text-apple-gray-500 dark:text-apple-gray-400">暂无数据</p>
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
              <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50 truncate">{{ item.name }}</p>
              <p class="text-xs text-apple-gray-400 truncate">{{ item.path }}</p>
              <div class="flex items-center gap-2 mt-1">
                <span class="px-2 py-0.5 text-xs rounded-full bg-brian-blue/10 text-brian-blue">{{ item.category }}</span>
                <span v-if="item.description" class="text-xs text-apple-gray-500">{{ item.description }}</span>
              </div>
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