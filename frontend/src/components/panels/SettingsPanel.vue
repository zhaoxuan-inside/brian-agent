<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { 
  Cpu, Globe, Key, Eye, EyeOff, Check,
  Shield, Settings, Info, Monitor, Database,
  Loader2, AlertCircle, Wifi, RefreshCw,
  Sliders, Server, TrendingUp,
  Hash, Brain, Edit3, Plus, Trash2, Copy
} from '@lucide/vue'
import { useThemeStore } from '../../stores/theme'
import { useConfigStore } from '../../stores/config'

const themeStore = useThemeStore()
const configStore = useConfigStore()

const activeTab = ref<'models' | 'general' | 'security' | 'about'>('models')
const modelSubTab = ref<'current' | 'providers'>('current')
const expandedProviderId = ref<string | null>(null)
const editingModelId = ref<string | null>(null)
const showKeyMap = ref<Record<string, boolean>>({})
const testingProvider = ref<string | null>(null)
const testResult = ref<{ ok: boolean; message: string } | null>(null)
const parsingLimits = ref<Record<string, boolean>>({})
const limitParseRaw = ref<Record<string, string>>({})
const newModelForm = ref({ id: '', name: '' })

// Track last saved state for per-provider reset
const savedProviderState = ref<Record<string, string>>({})

onMounted(() => {
  configStore.loadFromServer()
})

const tabs = [
  { id: 'models' as const, label: '模型配置', icon: Cpu },
  { id: 'general' as const, label: '通用设置', icon: Settings },
  { id: 'security' as const, label: '安全与授权', icon: Shield },
  { id: 'about' as const, label: '关于', icon: Info },
]

// OS detection
const detectedOS = computed(() => {
  const ua = navigator.platform || navigator.userAgent
  if (/win/i.test(ua)) return 'windows'
  if (/mac/i.test(ua)) return 'macos'
  return 'linux'
})

const osLabel = computed(() => {
  switch (detectedOS.value) {
    case 'windows': return 'Windows'
    case 'macos': return 'macOS'
    default: return 'Linux'
  }
})

const safeCommands = computed(() => {
  if (detectedOS.value === 'windows') return ['dir', 'type', 'echo', 'date', 'whoami', 'findstr', 'cd']
  return ['ls', 'cat', 'head', 'tail', 'grep', 'find', 'pwd', 'echo', 'date', 'whoami', 'df', 'du', 'wc', 'sort', 'uniq']
})

const warnCommands = computed(() => {
  if (detectedOS.value === 'windows') return ['copy', 'move', 'mkdir', 'npm', 'pip', 'git', 'curl']
  return ['cp', 'mv', 'mkdir', 'touch', 'chmod', 'chown', 'npm', 'pip', 'git', 'docker', 'curl', 'wget', 'kill']
})

const dangerCommands = computed(() => {
  if (detectedOS.value === 'windows') return ['del', 'rmdir', 'format', 'shutdown', 'regedit']
  return ['rm', 'rmdir', 'dd', 'mkfs', 'shutdown', 'reboot', 'sudo', 'su', 'iptables']
})

// General tab: data path editing
const editingDataDir = ref(false)
const dataDirInput = ref('')

function startEditDataDir() {
  dataDirInput.value = './data'
  editingDataDir.value = true
}

async function handleMigrate() {
  try {
    await fetch('http://127.0.0.1:8000/api/config/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: './data', newPath: dataDirInput.value, type: 'dataDir' }),
    })
  } catch { /* ignore */ }
  editingDataDir.value = false
}

// Provider rate limits
interface RateLimits {
  maxTokensPerDay: number
  maxTokensPerWeek: number
  maxTokensPerMonth: number
  maxCallsPerDay: number
  maxCallsPerWeek: number
  maxCallsPerMonth: number
}
const rateLimits = ref<Record<string, RateLimits>>({})

function getRateLimit(providerId: string): RateLimits {
  if (!rateLimits.value[providerId]) {
    rateLimits.value[providerId] = { maxTokensPerDay: 0, maxTokensPerWeek: 0, maxTokensPerMonth: 0, maxCallsPerDay: 0, maxCallsPerWeek: 0, maxCallsPerMonth: 0 }
  }
  return rateLimits.value[providerId]
}

function toggleKeyVisibility(id: string) { showKeyMap.value[id] = !showKeyMap.value[id] }
function isKeyVisible(id: string): boolean { return !!showKeyMap.value[id] }

function handleApiKeyChange(providerId: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  configStore.updateProvider(providerId, { apiKey: value })
}

function handleBaseUrlChange(providerId: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  configStore.updateProvider(providerId, { baseUrl: value })
}

async function handleTestConnection(providerId: string) {
  testingProvider.value = providerId
  testResult.value = null
  const result = await configStore.verifyProvider(providerId)
  testResult.value = result
  setTimeout(() => { testResult.value = null }, 5000)
  testingProvider.value = null
}

async function handleAiParseLimits(providerId: string) {
  const raw = limitParseRaw.value[providerId] || ''
  if (!raw.trim()) return
  parsingLimits.value[providerId] = true
  try {
    const resp = await fetch('http://127.0.0.1:8000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'system',
          content: '你是一个 API 限制解析器。用户会粘贴模型厂商的速率限制说明文字。请提取其中的限制信息并以 JSON 格式返回。JSON 格式为: { "maxTokensPerDay": number, "maxTokensPerWeek": number, "maxTokensPerMonth": number, "maxCallsPerDay": number, "maxCallsPerWeek": number, "maxCallsPerMonth": number }。如果某项未提及则填 0。只返回 JSON，不要其他文字。'
        }, {
          role: 'user',
          content: raw
        }]
      }),
    })
    const data = await resp.json()
    if (data.ok && data.data?.message) {
      try {
        const jsonMatch = data.data.message.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          const limits = getRateLimit(providerId)
          if (parsed.maxTokensPerDay !== undefined) limits.maxTokensPerDay = Number(parsed.maxTokensPerDay) || 0
          if (parsed.maxTokensPerWeek !== undefined) limits.maxTokensPerWeek = Number(parsed.maxTokensPerWeek) || 0
          if (parsed.maxTokensPerMonth !== undefined) limits.maxTokensPerMonth = Number(parsed.maxTokensPerMonth) || 0
          if (parsed.maxCallsPerDay !== undefined) limits.maxCallsPerDay = Number(parsed.maxCallsPerDay) || 0
          if (parsed.maxCallsPerWeek !== undefined) limits.maxCallsPerWeek = Number(parsed.maxCallsPerWeek) || 0
          if (parsed.maxCallsPerMonth !== undefined) limits.maxCallsPerMonth = Number(parsed.maxCallsPerMonth) || 0
        }
      } catch { /* keep manual values */ }
    }
  } catch { /* keep manual values */ }
  parsingLimits.value[providerId] = false
}

function handleLimitChange(providerId: string, field: keyof RateLimits, event: Event) {
  const limits = getRateLimit(providerId)
  limits[field] = Number((event.target as HTMLInputElement).value) || 0
}

function startEditModel(modelId: string) { editingModelId.value = modelId === editingModelId.value ? null : modelId }

function addCustomModel(providerId: string) {
  if (!newModelForm.value.name || !newModelForm.value.id) return
  configStore.addCustomModel(providerId, {
    id: newModelForm.value.id,
    name: newModelForm.value.name,
    maxTokens: 4096,
    supportsVision: false,
    supportsTools: false,
  })
  newModelForm.value = { id: '', name: '' }
}

function removeModel(providerId: string, modelId: string) {
  configStore.removeCustomModel(providerId, modelId)
}

function handleAddProviderInstance() {
  if (configStore.providers.length === 0) return
  const last = configStore.providers[configStore.providers.length - 1]
  configStore.addProviderInstance(last)
}

function captureProviderState(providerId: string) {
  const p = configStore.providers.find(x => x.id === providerId)
  if (p) {
    savedProviderState.value[providerId] = JSON.stringify({ baseUrl: p.baseUrl, apiKey: p.apiKey })
  }
}

function resetProviderState(providerId: string) {
  const saved = savedProviderState.value[providerId]
  if (saved) {
    const parsed = JSON.parse(saved)
    configStore.updateProvider(providerId, { baseUrl: parsed.baseUrl, apiKey: parsed.apiKey })
  }
}

function confirmProviderChanges() {
  configStore.saveToServer()
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header — sticky -->
    <div class="sticky top-0 z-10 bg-white dark:bg-apple-gray-950 border-b border-apple-gray-200 dark:border-apple-gray-700 p-5">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-brian-blue/10 rounded-lg"><Settings :size="20" class="text-brian-blue" /></div>
        <div>
          <h2 class="text-lg font-semibold text-apple-gray-900 dark:text-apple-gray-50">设置</h2>
          <p class="text-xs text-apple-gray-400">模型与系统配置</p>
        </div>
      </div>
    </div>

    <!-- Main tabs — sticky -->
    <div class="sticky top-[88px] z-10 bg-white dark:bg-apple-gray-950 px-4 py-2">
      <div class="flex items-center gap-1 p-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg">
        <button v-for="tab in tabs" :key="tab.id"
          :class="['flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors',
            activeTab === tab.id ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
          @click="activeTab = tab.id">
          <component :is="tab.icon" :size="14" />
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- ========== Models Tab ========== -->
    <div v-if="activeTab === 'models'" class="flex-1 overflow-hidden flex flex-col">
      <div class="flex-1 overflow-y-auto p-4">
        <div class="flex items-center gap-1 p-1 bg-apple-gray-50 dark:bg-apple-gray-800 rounded-lg mb-4">
          <button
            :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors',
              modelSubTab === 'current' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
            @click="modelSubTab = 'current'">
            <Sliders :size="12" class="inline mr-1" />当前配置
          </button>
          <button
            :class="['flex-1 py-2 text-xs font-medium rounded-md transition-colors',
              modelSubTab === 'providers' ? 'bg-white dark:bg-apple-gray-700 text-brian-blue shadow-sm' : 'text-apple-gray-500']"
            @click="modelSubTab = 'providers'">
            <Server :size="12" class="inline mr-1" />模型列表
          </button>
        </div>
        <div v-if="!configStore.isLoaded" class="flex items-center justify-center py-12">
          <Loader2 :size="24" class="animate-spin text-brian-blue" />
        </div>

        <!-- Current Config Tab -->
        <div v-if="modelSubTab === 'current' && configStore.isLoaded">
          <div class="glass-panel rounded-xl p-5 mb-4">
            <div class="flex items-center gap-3 mb-4">
              <div class="p-2 bg-brian-blue/10 rounded-lg"><Cpu :size="20" class="text-brian-blue" /></div>
              <div>
                <h3 class="text-sm font-semibold">当前模型</h3>
                <p class="text-xs text-apple-gray-400">{{ configStore.selectedProvider?.name || '—' }} · {{ configStore.selectedModel?.name || '—' }}</p>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label class="text-xs text-apple-gray-400 mb-1.5 block">提供商</label>
                <select v-model="configStore.selectedProviderId"
                  class="w-full px-3 py-2 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg text-sm outline-none">
                  <option v-for="p in configStore.providers.filter(x=>x.enabled)" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div>
                <label class="text-xs text-apple-gray-400 mb-1.5 block">模型</label>
                <select v-model="configStore.selectedModelId"
                  class="w-full px-3 py-2 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg text-sm outline-none">
                  <option v-for="m in configStore.selectedProvider?.models" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="glass-panel rounded-xl p-3 text-center">
              <div class="w-2 h-2 rounded-full mx-auto mb-1"
                :class="configStore.selectedProvider?.enabled && configStore.selectedProvider?.apiKey ? 'bg-success-green' : 'bg-warning-orange'" />
              <div class="text-xs font-medium">连接</div>
              <div class="text-[10px] text-apple-gray-400">{{ configStore.selectedProvider?.enabled && configStore.selectedProvider?.apiKey ? '已就绪' : '待配置' }}</div>
            </div>
            <div class="glass-panel rounded-xl p-3 text-center">
              <TrendingUp :size="16" class="text-brian-blue mx-auto mb-1" />
              <div class="text-xs font-medium">上下文</div>
              <div class="text-[10px] text-apple-gray-400">{{ configStore.selectedModel ? `${configStore.selectedModel.maxTokens.toLocaleString()} tokens` : '—' }}</div>
            </div>
            <div class="glass-panel rounded-xl p-3 text-center">
              <Globe :size="16" class="text-brian-blue mx-auto mb-1" />
              <div class="text-xs font-medium">端点</div>
              <div class="text-[10px] text-apple-gray-400 truncate">{{ configStore.selectedProvider?.baseUrl?.split('//')[1] || '—' }}</div>
            </div>
          </div>
        </div>

        <!-- Providers Sub-tab -->
        <div v-if="modelSubTab === 'providers' && configStore.isLoaded" class="space-y-2">
          <div class="mb-2">
            <button class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brian-blue/10 text-brian-blue rounded-lg hover:bg-brian-blue/20 transition-colors"
              @click="handleAddProviderInstance">
              <Copy :size="12" /> 添加提供商实例
            </button>
          </div>

          <div v-for="provider in configStore.providers" :key="provider.id"
            class="glass-panel rounded-xl overflow-hidden">
            <div class="flex items-center justify-between p-4 cursor-pointer hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors"
              @click="expandedProviderId = expandedProviderId === provider.id ? null : provider.id; if (!savedProviderState[provider.id]) captureProviderState(provider.id)">
              <div class="flex items-center gap-3">
                <button 
                  :class="['w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                    provider.enabled ? 'bg-brian-blue border-brian-blue' : 'border-apple-gray-300 dark:border-apple-gray-600']"
                  @click.stop="configStore.updateProvider(provider.id, { enabled: !provider.enabled })">
                  <Check v-if="provider.enabled" :size="12" class="text-white" />
                </button>
                <div>
                  <p class="text-sm font-medium">{{ provider.name }}</p>
                  <p class="text-xs text-apple-gray-400">{{ provider.baseUrl || '未配置端点' }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <div v-if="provider.enabled && provider.apiKey" class="w-2 h-2 rounded-full bg-success-green" />
                <div v-else-if="provider.enabled" class="w-2 h-2 rounded-full bg-warning-orange" />
              </div>
            </div>

            <div v-if="expandedProviderId === provider.id" class="p-4 border-t border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50/50 dark:bg-apple-gray-800/30 space-y-4">
              <div>
                <label class="text-xs text-apple-gray-400 mb-1 block">API 地址</label>
                <div class="flex items-center gap-2">
                  <Globe :size="14" class="text-apple-gray-400" />
                  <input :value="provider.baseUrl" type="text" placeholder="https://api.example.com/v1"
                    class="flex-1 px-3 py-2 bg-white dark:bg-apple-gray-800 rounded-lg text-sm outline-none"
                    @input="handleBaseUrlChange(provider.id, $event)" />
                </div>
              </div>

              <div>
                <label class="text-xs text-apple-gray-400 mb-1 block">API Key</label>
                <div class="flex items-center gap-2">
                  <Key :size="14" class="text-apple-gray-400" />
                  <div class="flex-1 relative">
                    <input :value="provider.apiKey"
                      :type="isKeyVisible(provider.id) ? 'text' : 'password'" placeholder="sk-..."
                      class="w-full pl-3 pr-10 py-2 bg-white dark:bg-apple-gray-800 rounded-lg text-sm outline-none"
                      @input="handleApiKeyChange(provider.id, $event)" />
                    <button class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded" @click="toggleKeyVisibility(provider.id)">
                      <EyeOff v-if="isKeyVisible(provider.id)" :size="14" class="text-apple-gray-400" />
                      <Eye v-else :size="14" class="text-apple-gray-400" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label class="text-xs text-apple-gray-400 mb-2 block">可用模型</label>
                <div class="space-y-2">
                  <div v-for="model in provider.models" :key="model.id"
                    class="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-apple-gray-800">
                    <span :class="['px-2 py-0.5 rounded text-xs cursor-pointer transition-colors flex-1',
                      configStore.selectedModelId === model.id && configStore.selectedProviderId === provider.id
                        ? 'bg-brian-blue text-white' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500']"
                      @click="configStore.selectedProviderId = provider.id; configStore.selectedModelId = model.id">
                      {{ model.name }}
                    </span>
                    <input v-if="editingModelId === model.id"
                      v-model="model.name"
                      class="px-2 py-0.5 text-xs rounded bg-apple-gray-100 dark:bg-apple-gray-700 outline-none w-32"
                      @blur="editingModelId = null" />
                    <button class="p-1 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="startEditModel(model.id)">
                      <Edit3 :size="12" class="text-apple-gray-400" />
                    </button>
                    <button class="p-1 rounded hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="removeModel(provider.id, model.id)">
                      <Trash2 :size="12" class="text-error-red" />
                    </button>
                  </div>
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <input v-model="newModelForm.id" placeholder="模型 ID" class="flex-1 px-2 py-1 text-xs rounded bg-white dark:bg-apple-gray-800 outline-none" />
                  <input v-model="newModelForm.name" placeholder="名称" class="flex-[3] px-2 py-1 text-xs rounded bg-white dark:bg-apple-gray-800 outline-none" />
                  <button class="px-2 py-1 text-xs bg-brian-blue text-white rounded" @click="addCustomModel(provider.id)"><Plus :size="12" /></button>
                </div>
              </div>

              <div>
                <div class="flex items-center gap-2 mb-2">
                  <Hash :size="14" class="text-apple-gray-400" />
                  <label class="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300">模型调用额度限制</label>
                </div>
                <p class="text-[10px] text-apple-gray-400 mb-2">配置该模型的速率限制。可将厂商限制条款粘贴到下方，由 AI 自动解析。</p>

                <textarea v-model="limitParseRaw[provider.id]"
                  placeholder="粘贴厂商速率限制说明文字，例如：&#10;Rate Limit: 1000 requests per minute, 10000 tokens per day..."
                  rows="3"
                  class="w-full px-3 py-2 text-xs bg-white dark:bg-apple-gray-800 rounded-lg outline-none mb-2" />
                <button
                  :disabled="parsingLimits[provider.id] || !limitParseRaw[provider.id]"
                  class="flex items-center gap-1 px-3 py-1.5 text-xs bg-brian-blue/10 text-brian-blue rounded-lg hover:bg-brian-blue/20 transition-colors disabled:opacity-50 mb-3"
                  @click="handleAiParseLimits(provider.id)">
                  <Brain :size="12" />
                  <Loader2 v-if="parsingLimits[provider.id]" :size="12" class="animate-spin" />
                  <span v-else>AI 解析限制</span>
                </button>

                <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <label class="text-[10px] text-apple-gray-400">每日 Token</label>
                    <input :value="getRateLimit(provider.id).maxTokensPerDay || ''" type="number" placeholder="不限"
                      class="w-full px-2 py-1.5 text-xs bg-white dark:bg-apple-gray-800 rounded outline-none"
                      @input="handleLimitChange(provider.id, 'maxTokensPerDay', $event)" />
                  </div>
                  <div>
                    <label class="text-[10px] text-apple-gray-400">每日调用次数</label>
                    <input :value="getRateLimit(provider.id).maxCallsPerDay || ''" type="number" placeholder="不限"
                      class="w-full px-2 py-1.5 text-xs bg-white dark:bg-apple-gray-800 rounded outline-none"
                      @input="handleLimitChange(provider.id, 'maxCallsPerDay', $event)" />
                  </div>
                  <div>
                    <label class="text-[10px] text-apple-gray-400">每周 Token</label>
                    <input :value="getRateLimit(provider.id).maxTokensPerWeek || ''" type="number" placeholder="不限"
                      class="w-full px-2 py-1.5 text-xs bg-white dark:bg-apple-gray-800 rounded outline-none"
                      @input="handleLimitChange(provider.id, 'maxTokensPerWeek', $event)" />
                  </div>
                  <div>
                    <label class="text-[10px] text-apple-gray-400">每周调用次数</label>
                    <input :value="getRateLimit(provider.id).maxCallsPerWeek || ''" type="number" placeholder="不限"
                      class="w-full px-2 py-1.5 text-xs bg-white dark:bg-apple-gray-800 rounded outline-none"
                      @input="handleLimitChange(provider.id, 'maxCallsPerWeek', $event)" />
                  </div>
                  <div>
                    <label class="text-[10px] text-apple-gray-400">每月 Token</label>
                    <input :value="getRateLimit(provider.id).maxTokensPerMonth || ''" type="number" placeholder="不限"
                      class="w-full px-2 py-1.5 text-xs bg-white dark:bg-apple-gray-800 rounded outline-none"
                      @input="handleLimitChange(provider.id, 'maxTokensPerMonth', $event)" />
                  </div>
                  <div>
                    <label class="text-[10px] text-apple-gray-400">每月调用次数</label>
                    <input :value="getRateLimit(provider.id).maxCallsPerMonth || ''" type="number" placeholder="不限"
                      class="w-full px-2 py-1.5 text-xs bg-white dark:bg-apple-gray-800 rounded outline-none"
                      @input="handleLimitChange(provider.id, 'maxCallsPerMonth', $event)" />
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 pt-2">
                <button 
                  :disabled="!!testingProvider"
                  class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-50"
                  @click.stop="handleTestConnection(provider.id)">
                  <Loader2 v-if="testingProvider === provider.id" :size="14" class="animate-spin" />
                  <Wifi v-else :size="14" />测试连接
                </button>
                <button class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brian-blue text-white rounded-lg hover:bg-brian-blue/90"
                  @click.stop="confirmProviderChanges()">
                  <Check :size="14" />确认更改
                </button>
                <button class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg hover:bg-apple-gray-300 dark:hover:bg-apple-gray-600"
                  @click.stop="resetProviderState(provider.id)">
                  <RefreshCw :size="14" />重置
                </button>
              </div>

              <Transition name="fade">
                <div v-if="testResult" :class="[
                  'px-3 py-2 rounded-lg text-xs flex items-center gap-2',
                  testResult.ok ? 'bg-success-green/10 text-success-green border border-success-green/20' : 'bg-error-red/10 text-error-red border border-error-red/20'
                ]">
                  <Check v-if="testResult.ok" :size="14" />
                  <AlertCircle v-else :size="14" />
                  {{ testResult.message }}
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== General Tab ========= -->
    <div v-if="activeTab === 'general'" class="flex-1 overflow-y-auto p-4">
      <div class="mb-6">
        <div class="flex items-center gap-2 mb-3"><Monitor :size="16" class="text-apple-gray-400" /><h3 class="text-sm font-medium">外观</h3></div>
        <div class="glass-panel rounded-xl overflow-hidden">
          <label class="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50">
            <span class="text-sm">深色模式</span>
            <button :class="['w-10 h-6 rounded-full transition-colors relative', themeStore.isDark ? 'bg-brian-blue' : 'bg-apple-gray-300']"
              @click="themeStore.toggleTheme">
              <div :class="['w-4 h-4 rounded-full bg-white absolute top-1 transition-transform', themeStore.isDark ? 'translate-x-5' : 'translate-x-1']" />
            </button>
          </label>
        </div>
      </div>

      <div class="mb-6">
        <div class="flex items-center gap-2 mb-3"><Database :size="16" class="text-apple-gray-400" /><h3 class="text-sm font-medium">数据路径</h3></div>
        <div class="glass-panel rounded-xl p-4 space-y-3">
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-apple-gray-400">数据目录</span>
              <button class="text-xs text-brian-blue hover:underline" @click="startEditDataDir()">编辑</button>
            </div>
            <div v-if="!editingDataDir" class="text-sm font-mono text-apple-gray-700 dark:text-apple-gray-300">./data</div>
            <div v-else class="flex items-center gap-2">
              <input v-model="dataDirInput" class="flex-1 px-3 py-1.5 text-sm rounded bg-white dark:bg-apple-gray-800 outline-none" />
              <button class="px-3 py-1.5 text-xs font-medium bg-brian-blue text-white rounded-lg" @click="handleMigrate">迁移</button>
              <button class="px-3 py-1.5 text-xs font-medium bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg" @click="editingDataDir = false">取消</button>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Database :size="12" class="text-apple-gray-400" />
              <span class="text-xs text-apple-gray-500">DB 路径</span>
            </div>
            <span class="text-xs font-mono text-apple-gray-400">./data/db.sqlite</span>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Wifi :size="12" class="text-apple-gray-400" />
              <span class="text-xs text-apple-gray-500">Vector DB 路径</span>
            </div>
            <span class="text-xs font-mono text-apple-gray-400">./data/vectors</span>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Activity :size="12" class="text-apple-gray-400" />
              <span class="text-xs text-apple-gray-500">Graph DB 路径</span>
            </div>
            <span class="text-xs font-mono text-apple-gray-400">./data/graph</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== Security Tab ========= -->
    <div v-if="activeTab === 'security'" class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- OS detection banner -->
      <div class="glass-panel rounded-xl p-4 flex items-center gap-3">
        <div class="p-2 bg-brian-blue/10 rounded-lg"><Monitor :size="18" class="text-brian-blue" /></div>
        <div>
          <p class="text-sm font-medium text-apple-gray-900 dark:text-apple-gray-50">检测到操作系统：{{ osLabel }}</p>
          <p class="text-xs text-apple-gray-400">命令策略已基于 {{ osLabel }} 自动适配</p>
        </div>
      </div>

      <!-- Safe Commands -->
      <div class="glass-panel rounded-xl p-4">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-2.5 h-2.5 rounded-full bg-success-green" />
          <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">安全命令（自动执行）</h3>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span v-for="cmd in safeCommands" :key="cmd"
            class="text-xs px-2 py-1 rounded-md bg-success-green/10 text-success-green border border-success-green/20 font-mono">{{ cmd }}</span>
        </div>
      </div>

      <!-- Warn Commands -->
      <div class="glass-panel rounded-xl p-4">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-2.5 h-2.5 rounded-full bg-warning-orange" />
          <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">需授权命令（确认后执行）</h3>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span v-for="cmd in warnCommands" :key="cmd"
            class="text-xs px-2 py-1 rounded-md bg-warning-orange/10 text-warning-orange border border-warning-orange/20 font-mono">{{ cmd }}</span>
        </div>
      </div>

      <!-- Danger Commands -->
      <div class="glass-panel rounded-xl p-4">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-2.5 h-2.5 rounded-full bg-error-red" />
          <h3 class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-50">危险命令（确认+回滚）</h3>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span v-for="cmd in dangerCommands" :key="cmd"
            class="text-xs px-2 py-1 rounded-md bg-error-red/10 text-error-red border border-error-red/20 font-mono">{{ cmd }}</span>
        </div>
      </div>

      <div class="text-xs text-apple-gray-400 text-center py-2">
        策略基于操作系统自动适配。您可以在对话中随时调整授权级别。
      </div>
    </div>

    <!-- ========== About Tab ========= -->
    <div v-if="activeTab === 'about'" class="flex-1 overflow-y-auto p-4">
      <div class="glass-panel rounded-xl p-5 text-center">
        <div class="p-3 bg-brian-blue/10 rounded-full inline-flex mb-4"><Settings :size="28" class="text-brian-blue" /></div>
        <h3 class="text-lg font-bold">Brian Agent</h3>
        <p class="text-sm text-apple-gray-400 mt-1">v1.0.0-beta</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: all 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(4px); }
</style>
