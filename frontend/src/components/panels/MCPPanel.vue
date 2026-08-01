<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Server, Trash2, Play, Square, Download, Search, Package, Flame, Globe, X, Loader2, ChevronRight } from '@lucide/vue'
import { configApi, mcpMarketApi } from '../../api'

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

interface MCPMarket {
  id: string
  name: string
  url: string
  description: string
  enabled: boolean
}

interface MarketMCP {
  id: string
  name: string
  displayName: string
  description: string
  packageName: string
  author: string
  version: string
  repository?: string
  category: string
  tags: string[]
  installed?: boolean
  installedVersion?: string
}

interface HotMCP {
  id: string
  marketId: string
  packageName: string
  displayName: string
  description: string
  author: string
  version: string
  repository?: string
  category: string
  tags: string[]
}

const mcps = ref<MCPItem[]>([])
const markets = ref<MCPMarket[]>([])
const hotMcps = ref<HotMCP[]>([])
const installedPackages = ref<Set<string>>(new Set())
const activeTab = ref<'market' | 'hot' | 'installed'>('market')
const searchQuery = ref('')

// Installed tab
const showNew = ref(false)
const newForm = ref({ name: '', description: '', command: '', argsStr: '', envStr: '', enabled: true })
const installedSearchQuery = ref('')
const installedPage = ref(1)
const installedTotal = ref(0)
const installedLoading = ref(false)
const installedHasMore = ref(true)
const pageSize = 20

// Market card
const showAddMarket = ref(false)

// Market MCP popup
const showMarketPopup = ref(false)
const currentMarket = ref<MCPMarket | null>(null)
const marketMcps = ref<MarketMCP[]>([])
const marketMcpsPage = ref(1)
const marketMcpsTotal = ref(0)
const marketMcpsLoading = ref(false)
const marketMcpsHasMore = ref(true)
const marketMcpsSearchQuery = ref('')
const installingMcp = ref<Set<string>>(new Set())

// ── Load data ──

onMounted(async () => {
  await Promise.all([loadMarketMcps(), loadMarkets(), loadInstalled()])
})

async function loadInstalled() {
  // Track existing names to avoid duplicates between the two data sources
  const existingNames = new Set<string>()

  // Load system-configured MCPs (from configApi, no pagination needed — typically few)
  try {
    const items = await configApi.mcp.list()
    for (const item of items) {
      const name = String(item.name ?? '')
      if (!name || existingNames.has(name)) continue
      existingNames.add(name)
      const config = (item.config as Record<string, unknown> | undefined) ?? {}
      mcps.value.push({
        id: String(item.id ?? `mcp-${Date.now()}`),
        name,
        description: String(item.description ?? ''),
        command: String(config.command ?? 'npx'),
        args: Array.isArray(config.args) ? (config.args as string[]) : [],
        env: (config.env as Record<string, string>) ?? {},
        enabled: item.enabled !== false,
        status: 'stopped' as const,
      })
    }
  } catch { /* ignore */ }

  // Load market-installed MCPs with pagination
  await fetchInstalledPage()
}

async function fetchInstalledPage() {
  if (installedLoading.value || !installedHasMore.value) return
  installedLoading.value = true
  try {
    const result = await mcpMarketApi.installed(installedPage.value, pageSize)
    const installed = result.installed || []
    installedTotal.value = result.total || 0

    const existingPackageNames = new Set(mcps.value.map(m => m.args?.[0]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    installed.forEach((i: any) => {
      const pkgName = i.packageName || i.package_name
      installedPackages.value.add(pkgName)
      if (!existingPackageNames.has(pkgName)) {
        existingPackageNames.add(pkgName)
        mcps.value.push({
          id: String(i.id ?? `mcp-${Date.now()}`),
          name: i.displayName || i.packageName || i.package_name || '',
          description: '',
          command: 'npx',
          args: [pkgName],
          env: {},
          enabled: i.active !== false,
          status: (i.serverStatus as 'running' | 'stopped' | 'error') || 'stopped',
        })
      }
    })

    installedHasMore.value = mcps.value.length < installedTotal.value
    if (installedHasMore.value) installedPage.value++
  } catch { /* ignore */ }
  installedLoading.value = false
}

function loadMoreInstalled() {
  fetchInstalledPage()
}

async function loadMarketMcps() {
  // Mark installed packages from community market
  try {
    const { packages } = await mcpMarketApi.market()
    if (Array.isArray(packages)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      packages.forEach((p: any) => {
        if (p.installed) {
          installedPackages.value.add(p.packageName)
        }
      })
    }
  } catch { /* ignore */ }
}

async function loadMarkets() {
  try {
    const result = await mcpMarketApi.listMarkets()
    if (result.markets) {
      markets.value = result.markets
    }
  } catch {
    // Backend unavailable — markets will be empty
    markets.value = []
  }
}

async function loadHotMcps() {
  try {
    const result = await mcpMarketApi.getHotMcps()
    if (result.code === 200 && result.data) {
      hotMcps.value = result.data
    }
  } catch { /* ignore */ }
}

// ── Market management ──

async function handleDeleteMarket(id: string) {
  if (id.startsWith('builtin-') || id === 'builtin') {
    alert('内置市场不可删除')
    return
  }
  try {
    await mcpMarketApi.deleteMarket(id)
    markets.value = markets.value.filter(m => m.id !== id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    alert(e?.message || e?.error || '删除市场失败')
  }
}

// ── Market MCP popup ──

async function openMarketPopup(market: MCPMarket) {
  currentMarket.value = market
  showMarketPopup.value = true
  marketMcps.value = []
  marketMcpsPage.value = 1
  marketMcpsTotal.value = 0
  marketMcpsHasMore.value = true
  marketMcpsSearchQuery.value = ''
  await fetchMarketMcps()
}

function closeMarketPopup() {
  showMarketPopup.value = false
  currentMarket.value = null
  marketMcps.value = []
}

async function fetchMarketMcps() {
  if (!currentMarket.value || marketMcpsLoading.value || !marketMcpsHasMore.value) return
  marketMcpsLoading.value = true
  let retries = 2
  while (retries > 0) {
    try {
      const result = await mcpMarketApi.getMarketMcps(currentMarket.value.id, marketMcpsPage.value, pageSize, marketMcpsSearchQuery.value)
      if (result.code === 200 && result.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newMcps = (result.data.mcps || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          displayName: m.displayName || m.name,
          description: m.description || '',
          packageName: m.packageName,
          author: m.author || '',
          version: m.version || '',
          repository: m.repository || '',
          category: m.category || '',
          tags: m.tags || [],
          installed: m.installed || installedPackages.value.has(m.packageName),
          installedVersion: m.installedVersion,
        }))
        marketMcps.value = [...marketMcps.value, ...newMcps]
        marketMcpsTotal.value = result.data.total
        marketMcpsHasMore.value = marketMcps.value.length < result.data.total
        marketMcpsPage.value++
      }
      break
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      retries--
      if (retries === 0) {
        console.warn('Fetch market MCPs failed after retries:', e.message)
      } else {
        await new Promise(r => setTimeout(r, 500))
      }
    }
  }
  marketMcpsLoading.value = false
}

function onMarketMcpsSearch() {
  marketMcps.value = []
  marketMcpsPage.value = 1
  marketMcpsTotal.value = 0
  marketMcpsHasMore.value = true
  fetchMarketMcps()
}

function onMarketPopupScroll(event: Event) {
  const el = event.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
    fetchMarketMcps()
  }
}

function isMcpInMarketInstalled(mcp: MarketMCP): boolean {
  return mcp.installed || installedPackages.value.has(mcp.packageName)
}

async function installMcpFromMarketPopup(mcp: MarketMCP) {
  if (isMcpInMarketInstalled(mcp) || installingMcp.value.has(mcp.packageName)) return
  if (!currentMarket.value) return

  installingMcp.value.add(mcp.packageName)
  try {
    const result = await mcpMarketApi.installFromMarket(
      currentMarket.value.id,
      mcp.packageName,
      mcp.displayName,
      mcp.repository
    )
    if (result.code === 200) {
      installedPackages.value.add(mcp.packageName)
      // Update in list
      const idx = marketMcps.value.findIndex(m => m.packageName === mcp.packageName)
      if (idx !== -1) {
        marketMcps.value[idx] = { ...marketMcps.value[idx], installed: true }
      }
      // Add to installed list
      mcps.value.push({
        id: result.id || `mcp-${Date.now()}`,
        name: mcp.displayName,
        description: mcp.description,
        command: 'npx',
        args: [mcp.packageName],
        env: {},
        enabled: true,
        status: 'stopped',
      })
      installedTotal.value++
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.error('Install MCP failed:', e)
  } finally {
    installingMcp.value.delete(mcp.packageName)
  }
}

// ── Installed MCP management ──

async function addNew() {
  const env: Record<string, string> = {}
  newForm.value.envStr.split('\n').filter(Boolean).forEach(line => { const [k,...v]=line.split('='); if(k) env[k.trim()]=v.join('=').trim() })
  try {
    await configApi.mcp.install({
      name: newForm.value.name,
      version: 'latest',
      url: newForm.value.command,
    })
  } catch { /* ignore */ }
  mcps.value.push({ id: `mcp-${Date.now()}`, name: newForm.value.name, description: newForm.value.description, command: newForm.value.command, args: newForm.value.argsStr.split(' ').filter(Boolean), env, enabled: newForm.value.enabled, status: 'stopped' })
  newForm.value = { name: '', description: '', command: '', argsStr: '', envStr: '', enabled: true }
  showNew.value = false
}

async function remove(id: string) {
  const target = mcps.value.find(m => m.id === id)
  if (target) {
    try { await configApi.mcp.uninstall(target.name) } catch { /* ignore */ }
  }
  mcps.value = mcps.value.filter(m => m.id !== id)
}

function toggleStatus(id: string) {
  const m = mcps.value.find(m => m.id === id)
  if (m) m.status = m.status === 'running' ? 'stopped' : 'running'
}

// ── Hot MCP tab ──

const hotMcpsLoaded = ref(false)

async function ensureHotMcpsLoaded() {
  if (hotMcpsLoaded.value) return
  await loadHotMcps()
  hotMcpsLoaded.value = true
}

// ── Filtered lists ──

const filteredMarkets = computed(() => {
  if (!searchQuery.value.trim()) return markets.value
  const q = searchQuery.value.toLowerCase()
  return markets.value.filter(m => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q))
})

const filteredInstalled = computed(() => {
  if (!installedSearchQuery.value.trim()) return mcps.value
  const q = installedSearchQuery.value.toLowerCase()
  return mcps.value.filter(m => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q))
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between p-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-950">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-error-red/10 rounded-lg"><Server :size="20" class="text-error-red" /></div>
        <div>
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">MCP管理</h2>
          <p class="text-xs text-apple-gray-400">Model Context Protocol 服务器</p>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="px-4 py-2 bg-white dark:bg-apple-gray-950">
      <div class="flex items-center gap-1 p-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg">
        <button
          :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors', activeTab === 'market' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
          @click="activeTab = 'market'"
        >
          <Globe :size="12" class="inline mr-1" />社区市场
        </button>
        <button
          :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors', activeTab === 'hot' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
          @click="activeTab = 'hot'; ensureHotMcpsLoaded()"
        >
          <Flame :size="12" class="inline mr-1" />热门MCP
        </button>
        <button
          :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors', activeTab === 'installed' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
          @click="activeTab = 'installed'"
        >
          已安装
        </button>
      </div>
    </div>

    <!-- ═══════════════ 社区市场 Tab ═══════════════ -->
    <div v-if="activeTab === 'market'" class="flex-1 overflow-y-auto p-4 dark:bg-apple-gray-950">
      <div class="relative mb-4">
        <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
        <input v-model="searchQuery" type="text" placeholder="搜索 MCP 市场..."
          class="w-full pl-9 pr-4 py-2 rounded-lg text-sm bg-apple-gray-100 dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all" />
      </div>

      <!-- Market cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <!-- Market cards -->
        <div v-for="market in filteredMarkets" :key="market.id"
          class="glass-panel rounded-xl p-4 border border-apple-gray-200 dark:border-apple-gray-700 hover:border-brian-blue/50 hover:shadow-md transition-all cursor-pointer group relative"
          @click="openMarketPopup(market)"
        >
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2">
              <div class="p-2 bg-brian-blue/10 rounded-lg">
                <Globe :size="16" class="text-brian-blue" />
              </div>
              <div>
                <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ market.name }}</p>
                <p class="text-xs text-apple-gray-400 mt-0.5 line-clamp-2">{{ market.description }}</p>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button v-if="!market.id.startsWith('builtin-') && market.id !== 'builtin'"
                class="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                title="删除市场"
                @click.stop="handleDeleteMarket(market.id)"
              >
                <Trash2 :size="14" class="text-error-red" />
              </button>
              <ChevronRight :size="16" class="text-apple-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <p class="text-[10px] text-apple-gray-400 mt-2 font-mono truncate">{{ market.url }}</p>
        </div>
      </div>

      <div v-if="filteredMarkets.length === 0 && !showAddMarket" class="text-center py-12 text-apple-gray-400 text-sm">
        暂无 MCP 市场，点击上方卡片添加
      </div>
    </div>

    <!-- ═══════════════ 热门MCP Tab ═══════════════ -->
    <div v-if="activeTab === 'hot'" class="flex-1 overflow-y-auto p-4 dark:bg-apple-gray-950">
      <div v-if="!hotMcpsLoaded" class="flex items-center justify-center py-12">
        <Loader2 :size="24" class="animate-spin text-brian-blue" />
      </div>

      <div v-else-if="hotMcps.length === 0" class="text-center py-12 text-apple-gray-400 text-sm">
        暂无热门 MCP
      </div>

      <div v-else class="space-y-2">
        <div v-for="mcp in hotMcps" :key="mcp.id"
          class="glass-panel rounded-xl p-3 flex items-center gap-3">
          <div class="p-2 bg-warning-orange/10 rounded-lg">
            <Flame :size="16" class="text-warning-orange" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ mcp.displayName }}</p>
            <p class="text-xs text-apple-gray-400 line-clamp-1">{{ mcp.description }}</p>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[10px] text-apple-gray-400 font-mono">{{ mcp.packageName }}</span>
              <span v-if="mcp.author" class="text-[10px] text-apple-gray-400">by {{ mcp.author }}</span>
            </div>
          </div>
          <button
            :class="['flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              installedPackages.has(mcp.packageName) ? 'bg-success-green/10 text-success-green cursor-default' : 'bg-brian-blue text-white hover:bg-brian-blue/90']"
            :disabled="installedPackages.has(mcp.packageName)"
            @click="installedPackages.has(mcp.packageName) ? undefined : installMcpFromMarketPopup({ id: mcp.id, name: mcp.packageName, displayName: mcp.displayName, description: mcp.description, packageName: mcp.packageName, author: mcp.author, version: mcp.version, repository: mcp.repository, category: mcp.category, tags: mcp.tags } as MarketMCP)"
          >
            <Download v-if="!installedPackages.has(mcp.packageName)" :size="12" />
            <span>{{ installedPackages.has(mcp.packageName) ? '已安装' : '安装' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════════ 已安装 Tab ═══════════════ -->
    <div v-if="activeTab === 'installed'" class="flex-1 overflow-y-auto p-4 dark:bg-apple-gray-950">
      <!-- Search -->
      <div class="relative mb-4">
        <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
        <input v-model="installedSearchQuery" type="text" placeholder="搜索已安装的 MCP..."
          class="w-full pl-9 pr-4 py-2 rounded-lg text-sm bg-apple-gray-100 dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all" />
      </div>

      <div v-if="showNew" class="mb-3 space-y-3 p-4 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/50 border border-apple-gray-200 dark:border-apple-gray-700">
        <input v-model="newForm.name" placeholder="名称" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
        <input v-model="newForm.description" placeholder="描述" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
        <input v-model="newForm.command" placeholder="命令 (如 npx)" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
        <input v-model="newForm.argsStr" placeholder="参数 (空格分隔)" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
        <textarea v-model="newForm.envStr" placeholder="环境变量 (KEY=VALUE, 每行一个)" rows="2" class="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700" />
        <div class="flex gap-2">
          <button class="px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg" @click="addNew">保存</button>
          <button class="px-3 py-1.5 text-xs font-medium bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg" @click="showNew = false">取消</button>
        </div>
      </div>

      <div class="space-y-2">
        <div v-for="m in filteredInstalled" :key="m.id" class="glass-panel rounded-xl p-3 flex items-center gap-3">
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
          <button class="p-1 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="remove(m.id)"><Trash2 :size="14" class="text-error-red" /></button>
        </div>
      </div>

      <div v-if="filteredInstalled.length === 0 && !showNew" class="text-center py-12 text-apple-gray-400 text-sm">
        暂无已安装的 MCP 服务器。前往「社区市场」或「热门MCP」安装
      </div>

      <!-- Load more -->
      <div v-if="installedHasMore && filteredInstalled.length > 0" class="mt-4 text-center">
        <button
          :class="['px-4 py-2 text-xs font-medium rounded-lg transition-colors', installedLoading ? 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-500' : 'bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20']"
          :disabled="installedLoading"
          @click="loadMoreInstalled"
        >
          <Loader2 v-if="installedLoading" :size="14" class="inline mr-1 animate-spin" />
          <span>{{ installedLoading ? '加载中...' : '加载更多' }}</span>
        </button>
      </div>
    </div>

    <!-- ═══════════════ Market MCP Popup ═══════════════ -->
    <Teleport to="body">
      <div v-if="showMarketPopup" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="closeMarketPopup">
        <div class="w-full max-w-2xl max-h-[80vh] bg-white dark:bg-apple-gray-950 rounded-2xl shadow-2xl flex flex-col overflow-hidden m-4">
          <div class="flex items-center justify-between p-5 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-brian-blue/10 rounded-lg">
                <Globe :size="18" class="text-brian-blue" />
              </div>
              <div>
                <h3 class="text-base font-semibold text-apple-gray-900 dark:text-apple-gray-50">{{ currentMarket?.name }}</h3>
                <p class="text-xs text-apple-gray-400">{{ currentMarket?.description }}</p>
              </div>
            </div>
            <button class="p-1.5 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800" @click="closeMarketPopup">
              <X :size="18" class="text-apple-gray-400" />
            </button>
          </div>

          <!-- Search bar -->
          <div class="px-5 pb-3">
            <div class="relative">
              <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
              <input v-model="marketMcpsSearchQuery" type="text" placeholder="搜索 MCP..."
                class="w-full pl-9 pr-4 py-2 rounded-lg text-sm bg-apple-gray-100 dark:bg-apple-gray-800 outline-none border border-apple-gray-200 dark:border-apple-gray-700 focus:border-brian-blue focus:ring-1 focus:ring-brian-blue/30 transition-all"
                @keyup.enter="onMarketMcpsSearch" />
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-4" @scroll="onMarketPopupScroll">
            <div v-if="marketMcps.length === 0 && !marketMcpsLoading" class="text-center py-12 text-apple-gray-400 text-sm">
              该市场暂无 MCP
            </div>

            <div class="space-y-2">
              <div v-for="mcp in marketMcps" :key="mcp.id"
                class="glass-panel rounded-xl p-3 flex items-center gap-3">
                <div class="p-2 bg-brian-blue/10 rounded-lg">
                  <Package :size="16" class="text-brian-blue" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">{{ mcp.displayName }}</p>
                  <p class="text-xs text-apple-gray-400 line-clamp-1">{{ mcp.description }}</p>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[10px] text-apple-gray-400 font-mono">{{ mcp.packageName }}</span>
                    <span v-if="mcp.author" class="text-[10px] text-apple-gray-400">by {{ mcp.author }}</span>
                    <span v-if="mcp.version" class="text-[10px] text-apple-gray-400">v{{ mcp.version }}</span>
                  </div>
                </div>
                <button
                  :class="['flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                    isMcpInMarketInstalled(mcp) ? 'bg-success-green/10 text-success-green cursor-default' : installingMcp.has(mcp.packageName) ? 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-500 cursor-wait' : 'bg-brian-blue text-white hover:bg-brian-blue/90']"
                  :disabled="isMcpInMarketInstalled(mcp) || installingMcp.has(mcp.packageName)"
                  @click="installMcpFromMarketPopup(mcp)"
                >
                  <Download v-if="!isMcpInMarketInstalled(mcp) && !installingMcp.has(mcp.packageName)" :size="12" />
                  <span v-if="installingMcp.has(mcp.packageName)" class="inline-block w-3 h-3 border-2 border-apple-gray-400 border-t-transparent rounded-full animate-spin mr-1" />
                  <span>{{ isMcpInMarketInstalled(mcp) ? '已安装' : installingMcp.has(mcp.packageName) ? '安装中...' : '安装' }}</span>
                </button>
              </div>
            </div>

            <div v-if="marketMcpsLoading" class="flex items-center justify-center py-6">
              <Loader2 :size="20" class="animate-spin text-brian-blue" />
            </div>

            <div v-if="!marketMcpsHasMore && marketMcps.length > 0" class="text-center py-4 text-xs text-apple-gray-400">
              已加载全部 {{ marketMcpsTotal }} 个 MCP
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>