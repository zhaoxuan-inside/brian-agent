<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Server, Plus, Trash2, Edit3, Save, Play, Square, Download, Search, Package } from '@lucide/vue'

interface MCPItem {
  id: string
  name: string
  description: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  status?: 'running' | 'stopped' | 'error'
}

interface CommunityMCP {
  id: string
  name: string
  package: string
  description: string
  command: string
  args: string[]
}

const defaultCommunityMCPs: CommunityMCP[] = [
  { id: 'filesystem', name: 'Filesystem', package: '@modelcontextprotocol/server-filesystem', description: 'File system access', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/files'] },
  { id: 'github', name: 'GitHub', package: '@modelcontextprotocol/server-github', description: 'GitHub API', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
  { id: 'postgres', name: 'PostgreSQL', package: '@modelcontextprotocol/server-postgres', description: 'Database queries', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'] },
  { id: 'brave-search', name: 'Brave Search', package: '@modelcontextprotocol/server-brave-search', description: 'Web search', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] },
  { id: 'puppeteer', name: 'Puppeteer', package: '@modelcontextprotocol/server-puppeteer', description: 'Browser automation', command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'] },
  { id: 'memory', name: 'Memory', package: '@modelcontextprotocol/server-memory', description: 'Knowledge graph', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
  { id: 'sequential-thinking', name: 'Sequential Thinking', package: '@modelcontextprotocol/server-sequential-thinking', description: 'Complex reasoning', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
  { id: 'fetch', name: 'Fetch', package: '@modelcontextprotocol/server-fetch', description: 'Web content fetching', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] },
  { id: 'google-maps', name: 'Google Maps', package: '@modelcontextprotocol/server-google-maps', description: 'Google Maps API', command: 'npx', args: ['-y', '@modelcontextprotocol/server-google-maps'] },
  { id: 'slack', name: 'Slack', package: '@modelcontextprotocol/server-slack', description: 'Slack messaging', command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'] },
  { id: 'sentry', name: 'Sentry', package: '@modelcontextprotocol/server-sentry', description: 'Error tracking', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sentry'] },
  { id: 'raygun', name: 'Raygun', package: '@modelcontextprotocol/server-raygun', description: 'Crash reporting', command: 'npx', args: ['-y', '@modelcontextprotocol/server-raygun'] },
  { id: 'everart', name: 'EverArt', package: '@modelcontextprotocol/server-everart', description: 'AI image generation', command: 'npx', args: ['-y', '@modelcontextprotocol/server-everart'] },
  { id: 'confluence', name: 'Confluence', package: '@modelcontextprotocol/server-confluence', description: 'Atlassian Confluence', command: 'npx', args: ['-y', '@modelcontextprotocol/server-confluence'] },
  { id: 'sqlite', name: 'SQLite', package: '@modelcontextprotocol/server-sqlite', description: 'SQLite database', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite'] },
  { id: 'redis', name: 'Redis', package: '@modelcontextprotocol/server-redis', description: 'Redis cache', command: 'npx', args: ['-y', '@modelcontextprotocol/server-redis'] },
  { id: 'time', name: 'Time', package: '@modelcontextprotocol/server-time', description: 'Time utilities', command: 'npx', args: ['-y', '@modelcontextprotocol/server-time'] },
]

const communityMCPs = ref<CommunityMCP[]>([...defaultCommunityMCPs])
const installedFromApi = ref<Set<string>>(new Set())
const installing = ref<Set<string>>(new Set())

const mcps = ref<MCPItem[]>([])
const editingId = ref<string | null>(null)
const showNew = ref(false)
const newForm = ref({ name: '', description: '', command: '', argsStr: '', envStr: '', enabled: true })
const editForm = ref({ name: '', description: '', command: '', argsStr: '', envStr: '', enabled: true })
const activeTab = ref<'installed' | 'market'>('market')
const searchQuery = ref('')

onMounted(async () => {
  try {
    const resp = await fetch('http://127.0.0.1:8000/api/mcp/community')
    if (resp.ok) {
      const data = await resp.json()
      if (data.ok && data.data) {
        communityMCPs.value = data.data
      }
      if (data.installed && Array.isArray(data.installed)) {
        installedFromApi.value = new Set(data.installed)
        // Mark already installed packages in mcp list
        for (const pkg of data.installed) {
          const mcp = communityMCPs.value.find(m => m.package === pkg)
          if (mcp && !mcps.value.find(m => m.name === mcp.name)) {
            mcps.value.push({
              id: `mcp-${Date.now()}-${mcp.id}`,
              name: mcp.name,
              description: mcp.description,
              command: mcp.command,
              args: [...mcp.args],
              env: {},
              enabled: true,
              status: 'stopped',
            })
          }
        }
      }
    }
  } catch {
    // backend unavailable, use hardcoded list
    communityMCPs.value = [...defaultCommunityMCPs]
  }
})

const filteredCommunity = computed(() => {
  if (!searchQuery.value.trim()) return communityMCPs.value
  const q = searchQuery.value.toLowerCase()
  return communityMCPs.value.filter(m => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.package.toLowerCase().includes(q))
})

function isMCPInstalled(mcp: CommunityMCP): boolean {
  return !!mcps.value.find(m => m.name === mcp.name) || installedFromApi.value.has(mcp.package)
}

async function installCommunity(mcp: CommunityMCP) {
  if (isMCPInstalled(mcp)) return
  installing.value.add(mcp.id)

  // Try backend install API first
  try {
    const resp = await fetch('http://127.0.0.1:8000/api/mcp/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: mcp.package, command: mcp.command, args: mcp.args }),
    })
    if (resp.ok) {
      const data = await resp.json()
      if (data.ok) {
        installedFromApi.value.add(mcp.package)
      }
    }
  } catch {
    // backend not available, just add locally
  }

  mcps.value.push({
    id: `mcp-${Date.now()}`,
    name: mcp.name,
    description: mcp.description,
    command: mcp.command,
    args: [...mcp.args],
    env: {},
    enabled: true,
    status: 'stopped',
  })
  installing.value.delete(mcp.id)
}

function startEdit(m: MCPItem) {
  editingId.value = m.id
  editForm.value = { name: m.name, description: m.description, command: m.command, argsStr: m.args.join(' '), envStr: Object.entries(m.env).map(([k,v]) => `${k}=${v}`).join('\n'), enabled: m.enabled }
}

function saveEdit() {
  const idx = mcps.value.findIndex(m => m.id === editingId.value)
  if (idx !== -1) {
    const env: Record<string, string> = {}
    editForm.value.envStr.split('\n').filter(Boolean).forEach(line => { const [k,...v]=line.split('='); if(k) env[k.trim()]=v.join('=').trim() })
    mcps.value[idx] = { ...mcps.value[idx], name: editForm.value.name, description: editForm.value.description, command: editForm.value.command, args: editForm.value.argsStr.split(' ').filter(Boolean), env, enabled: editForm.value.enabled }
  }
  editingId.value = null
}

function addNew() {
  const env: Record<string, string> = {}
  newForm.value.envStr.split('\n').filter(Boolean).forEach(line => { const [k,...v]=line.split('='); if(k) env[k.trim()]=v.join('=').trim() })
  mcps.value.push({ id: `mcp-${Date.now()}`, name: newForm.value.name, description: newForm.value.description, command: newForm.value.command, args: newForm.value.argsStr.split(' ').filter(Boolean), env, enabled: newForm.value.enabled, status: 'stopped' })
  newForm.value = { name: '', description: '', command: '', argsStr: '', envStr: '', enabled: true }
  showNew.value = false
}

function remove(id: string) { mcps.value = mcps.value.filter(m => m.id !== id) }
function toggle(id: string) { const m = mcps.value.find(m => m.id === id); if (m) m.enabled = !m.enabled }
function toggleStatus(id: string) {
  const m = mcps.value.find(m => m.id === id)
  if (m) m.status = m.status === 'running' ? 'stopped' : 'running'
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between p-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-950">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-error-red/10 rounded-lg"><Server :size="20" class="text-error-red" /></div>
        <div>
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">MCP</h2>
          <p class="text-xs text-apple-gray-400">Model Context Protocol 服务器</p>
        </div>
      </div>
      <button class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90" @click="showNew = true">
        <Plus :size="14" /> 新建
      </button>
    </div>

    <!-- Tabs -->
    <div class="px-4 py-2 bg-white dark:bg-apple-gray-950">
      <div class="flex items-center gap-1 p-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg">
        <button :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors', activeTab === 'market' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
          @click="activeTab = 'market'">
          <Package :size="12" class="inline mr-1" />社区市场
        </button>
        <button :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors', activeTab === 'installed' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
          @click="activeTab = 'installed'">
          已安装
        </button>
      </div>
    </div>

    <!-- Community Market Tab -->
    <div v-if="activeTab === 'market'" class="flex-1 overflow-y-auto p-4 dark:bg-apple-gray-950">
      <div class="relative mb-4">
        <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
        <input v-model="searchQuery" type="text" placeholder="搜索社区 MCP 服务器..."
          class="w-full pl-9 pr-4 py-2 rounded-lg text-sm bg-apple-gray-100 dark:bg-apple-gray-800 outline-none" />
      </div>

      <div class="space-y-2">
        <div v-for="mcp in filteredCommunity" :key="mcp.id"
          class="glass-panel rounded-xl p-3 flex items-center gap-3">
          <div class="p-2 bg-error-red/10 rounded-lg">
            <Server :size="16" class="text-error-red" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ mcp.name }}</p>
            <p class="text-xs text-apple-gray-400">{{ mcp.description }}</p>
            <p class="text-[10px] text-apple-gray-400 mt-0.5 font-mono">{{ mcp.package }}</p>
          </div>
          <button
            :class="['flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              isMCPInstalled(mcp) ? 'bg-success-green/10 text-success-green cursor-default' : installing.has(mcp.id) ? 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-500 cursor-wait' : 'bg-brian-blue text-white hover:bg-brian-blue/90']"
            :disabled="isMCPInstalled(mcp) || installing.has(mcp.id)"
            @click="installCommunity(mcp)">
            <Download v-if="!isMCPInstalled(mcp) && !installing.has(mcp.id)" :size="12" />
            <span v-if="installing.has(mcp.id)" class="inline-block w-3 h-3 border-2 border-apple-gray-400 border-t-transparent rounded-full animate-spin mr-1" />
            <span>{{ isMCPInstalled(mcp) ? '已安装' : installing.has(mcp.id) ? '安装中...' : '安装' }}</span>
          </button>
        </div>
      </div>

      <div v-if="filteredCommunity.length === 0" class="text-center py-12 text-apple-gray-400 text-sm">未找到匹配的 MCP 服务器</div>
    </div>

    <!-- Installed Tab -->
    <div v-if="activeTab === 'installed'" class="flex-1 overflow-y-auto p-4 dark:bg-apple-gray-950">
      <div v-if="showNew" class="mb-3 space-y-3 p-4 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/50 border border-apple-gray-200 dark:border-apple-gray-700">
        <input v-model="newForm.name" placeholder="名称" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
        <input v-model="newForm.description" placeholder="描述" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
        <input v-model="newForm.command" placeholder="命令 (如 npx)" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
        <input v-model="newForm.argsStr" placeholder="参数 (空格分隔)" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
        <textarea v-model="newForm.envStr" placeholder="环境变量 (KEY=VALUE, 每行一个)" rows="2" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none" />
        <div class="flex gap-2">
          <button class="px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg" @click="addNew">保存</button>
          <button class="px-3 py-1.5 text-xs font-medium bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg" @click="showNew = false">取消</button>
        </div>
      </div>

      <div class="space-y-2">
        <div v-for="m in mcps" :key="m.id" class="glass-panel rounded-xl p-3 flex items-center gap-3">
          <button :class="['w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0', m.enabled ? 'bg-success-green border-success-green' : 'border-apple-gray-300 dark:border-apple-gray-600']"
            @click="toggle(m.id)">
            <div v-if="m.enabled" class="w-2 h-2 rounded-full bg-white" />
          </button>
          <Server :size="18" class="text-apple-gray-400 flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ m.name }}</p>
            <p class="text-xs text-apple-gray-400">{{ m.description }}</p>
          </div>
          <div :class="['w-2 h-2 rounded-full flex-shrink-0', m.status === 'running' ? 'bg-success-green' : m.status === 'error' ? 'bg-error-red' : 'bg-apple-gray-300']" />
          <button class="p-1 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="toggleStatus(m.id)">
            <Play v-if="m.status !== 'running'" :size="14" class="text-success-green" />
            <Square v-else :size="14" class="text-warning-orange" />
          </button>
          <button class="p-1 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="startEdit(m)"><Edit3 :size="14" class="text-apple-gray-400" /></button>
          <button class="p-1 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="remove(m.id)"><Trash2 :size="14" class="text-error-red" /></button>
        </div>
      </div>

      <div v-if="mcps.length === 0 && !showNew" class="text-center py-12 text-apple-gray-400 text-sm">暂无已安装的 MCP 服务器。前往「社区市场」安装</div>

      <div v-if="editingId" class="mt-3 glass-panel rounded-xl p-4 space-y-2 border border-apple-gray-200 dark:border-apple-gray-700">
        <p class="text-xs font-semibold">编辑</p>
        <input v-model="editForm.name" class="w-full px-3 py-1.5 rounded text-sm bg-white dark:bg-apple-gray-800 outline-none" />
        <button class="px-3 py-1 text-xs font-medium bg-brian-blue text-white rounded" @click="saveEdit"><Save :size="12" class="inline mr-1" />保存</button>
      </div>
    </div>
  </div>
</template>
