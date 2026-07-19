import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { configApi } from '../api'

export interface ModelConfig {
  id: string
  name: string
  maxTokens: number
  supportsVision: boolean
  supportsTools: boolean
}

export interface ModelProvider {
  id: string
  name: string
  type: 'openai-compatible' | 'anthropic' | 'google' | 'custom'
  baseUrl: string
  apiKey: string
  models: ModelConfig[]
  enabled: boolean
}

export interface AppConfig {
  selectedProviderId: string
  selectedModelId: string
  temperature: number
  maxTokens: number
  providers: ModelProvider[]
}

const API_BASE = 'http://127.0.0.1:8000/api/config'

export const useConfigStore = defineStore('config', () => {
  const providers = ref<ModelProvider[]>([])
  const selectedProviderId = ref('openai')
  const selectedModelId = ref('gpt-4o')
  const temperature = ref(0.7)
  const maxTokens = ref(4096)
  const isLoaded = ref(false)
  const isLoading = ref(false)
  const lastError = ref('')

  const selectedProvider = computed(() =>
    providers.value.find(p => p.id === selectedProviderId.value)
  )

  const selectedModel = computed(() =>
    selectedProvider.value?.models.find(m => m.id === selectedModelId.value)
  )

  const activeProviders = computed(() =>
    providers.value.filter(p => p.enabled)
  )

  async function loadFromServer(): Promise<void> {
    isLoading.value = true
    lastError.value = ''
    try {
      const resp = await fetch(API_BASE)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = await resp.json()
      const data = (json.data || json) as AppConfig
      providers.value = data.providers || []
      selectedProviderId.value = data.selectedProviderId || 'openai'
      selectedModelId.value = data.selectedModelId || 'gpt-4o'
      temperature.value = data.temperature ?? 0.7
      maxTokens.value = data.maxTokens ?? 4096
      isLoaded.value = true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      lastError.value = msg
      console.warn('Failed to load config from server, using localStorage fallback:', msg)
      loadFromStorage()
    } finally {
      isLoading.value = false
    }
  }

  function loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('brian-config')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.providers?.length > 0) {
          providers.value = parsed.providers
          selectedProviderId.value = parsed.selectedProviderId || 'openai'
          selectedModelId.value = parsed.selectedModelId || 'gpt-4o'
          temperature.value = parsed.temperature ?? 0.7
          maxTokens.value = parsed.maxTokens ?? 4096
          isLoaded.value = true
          return
        }
      }
    } catch {
      // use defaults
    }
    providers.value = getFallbackProviders()
    isLoaded.value = true
  }

  function getFallbackProviders(): ModelProvider[] {
    return [
      { id: 'openai', name: 'OpenAI', type: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', apiKey: '', enabled: false,
        models: [
          { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 128000, supportsVision: true, supportsTools: true },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxTokens: 128000, supportsVision: true, supportsTools: true },
          { id: 'o1', name: 'O1', maxTokens: 200000, supportsVision: true, supportsTools: false },
          { id: 'o1-mini', name: 'O1 Mini', maxTokens: 128000, supportsVision: false, supportsTools: false },
          { id: 'o3-mini', name: 'O3 Mini', maxTokens: 200000, supportsVision: false, supportsTools: false },
        ] },
      { id: 'anthropic', name: 'Anthropic', type: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: '', enabled: false,
        models: [
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', maxTokens: 200000, supportsVision: true, supportsTools: true },
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', maxTokens: 200000, supportsVision: true, supportsTools: true },
          { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', maxTokens: 200000, supportsVision: false, supportsTools: true },
          { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', maxTokens: 200000, supportsVision: true, supportsTools: true },
        ] },
      { id: 'google', name: 'Google', type: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1', apiKey: '', enabled: false,
        models: [
          { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', maxTokens: 1048576, supportsVision: true, supportsTools: true },
          { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', maxTokens: 1048576, supportsVision: true, supportsTools: true },
          { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', maxTokens: 1048576, supportsVision: true, supportsTools: true },
        ] },
      { id: 'deepseek', name: 'DeepSeek', type: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', apiKey: '', enabled: false,
        models: [
          { id: 'deepseek-chat', name: 'DeepSeek Chat', maxTokens: 65536, supportsVision: false, supportsTools: true },
          { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', maxTokens: 65536, supportsVision: false, supportsTools: false },
        ] },
      { id: 'moonshot', name: 'Moonshot', type: 'openai-compatible', baseUrl: 'https://api.moonshot.cn/v1', apiKey: '', enabled: false,
        models: [
          { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', maxTokens: 8192, supportsVision: false, supportsTools: true },
          { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', maxTokens: 32768, supportsVision: false, supportsTools: true },
          { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', maxTokens: 131072, supportsVision: false, supportsTools: true },
        ] },
      { id: 'zhipu', name: 'Zhipu AI', type: 'openai-compatible', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', enabled: false,
        models: [
          { id: 'glm-4', name: 'GLM-4', maxTokens: 131072, supportsVision: true, supportsTools: true },
          { id: 'glm-4-flash', name: 'GLM-4 Flash', maxTokens: 131072, supportsVision: false, supportsTools: true },
        ] },
      { id: 'qwen', name: 'Qwen', type: 'openai-compatible', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', enabled: false,
        models: [
          { id: 'qwen-turbo', name: 'Qwen Turbo', maxTokens: 131072, supportsVision: false, supportsTools: true },
          { id: 'qwen-plus', name: 'Qwen Plus', maxTokens: 131072, supportsVision: false, supportsTools: true },
          { id: 'qwen-max', name: 'Qwen Max', maxTokens: 32768, supportsVision: false, supportsTools: true },
        ] },
      { id: 'mistral', name: 'Mistral AI', type: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', apiKey: '', enabled: false,
        models: [
          { id: 'mistral-large-latest', name: 'Mistral Large', maxTokens: 131072, supportsVision: false, supportsTools: true },
          { id: 'mistral-small-latest', name: 'Mistral Small', maxTokens: 32768, supportsVision: false, supportsTools: true },
        ] },
    ]
  }

  async function saveToServer(): Promise<boolean> {
    lastError.value = ''
    const data: AppConfig = {
      providers: providers.value,
      selectedProviderId: selectedProviderId.value,
      selectedModelId: selectedModelId.value,
      temperature: temperature.value,
      maxTokens: maxTokens.value,
    }
    localStorage.setItem('brian-config', JSON.stringify(data))

    try {
      const resp = await fetch(API_BASE, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = await resp.json()
      if (json.ok) {
        providers.value = json.data.providers
        return true
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      lastError.value = msg
      console.warn('Failed to save config to server:', msg)
    }
    return false
  }

  async function updateProvider(id: string, updates: Partial<ModelProvider>): Promise<void> {
    const idx = providers.value.findIndex(p => p.id === id)
    if (idx === -1) return
    providers.value[idx] = { ...providers.value[idx], ...updates }

    try {
      await fetch(`${API_BASE}/provider/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    } catch (e) {
      console.warn('Failed to sync provider to server:', e)
    }
  }

  async function verifyProvider(providerId: string, modelId?: string): Promise<{ ok: boolean; message: string; latency?: number }> {
    try {
      const result = await configApi.provider.test(providerId)
      return { ok: result.success, message: result.message, latency: result.latency }
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : '无法连接到后端服务' }
    }
  }

  async function resetToDefaults(): Promise<void> {
    try {
      const resp = await fetch(`${API_BASE}/reset`, { method: 'POST' })
      if (resp.ok) {
        const json = await resp.json()
        if (json.ok && json.data) {
          providers.value = json.data.providers
          selectedProviderId.value = json.data.selectedProviderId || 'openai'
          selectedModelId.value = json.data.selectedModelId || 'gpt-4o'
          temperature.value = json.data.temperature ?? 0.7
          maxTokens.value = json.data.maxTokens ?? 4096
        }
      }
    } catch {
      console.warn('Failed to reset config on server')
    }
  }

  function addCustomModel(providerId: string, model: ModelConfig): void {
    const provider = providers.value.find(p => p.id === providerId)
    if (provider) {
      provider.models.push(model)
    }
  }

  function removeCustomModel(providerId: string, modelId: string): void {
    const provider = providers.value.find(p => p.id === providerId)
    if (provider) {
      provider.models = provider.models.filter(m => m.id !== modelId)
    }
  }

  function addProviderInstance(template: ModelProvider): ModelProvider {
    const newProvider: ModelProvider = {
      ...template,
      id: `${template.id}-${Date.now()}`,
      name: `${template.name} (副本)`,
      apiKey: '',
    }
    providers.value.push(newProvider)
    return newProvider
  }

  async function getAllUserModels() {
    const models = await configApi.model.list()
    return models.map(m => ({
      id: m.id,
      providerId: m.providerId,
      providerName: m.providerName,
      modelId: m.modelId,
      modelName: m.modelName,
      maxTokens: m.maxTokens,
      supportsVision: m.supportsVision,
      supportsTools: m.supportsTools,
      isDefault: m.isDefault,
      status: m.status,
    }))
  }

  async function setDefaultUserModel(id: string, modelId: string) {
    try {
      const result = await configApi.model.setDefault(id)
      return { ok: true, message: '', data: result }
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : '设置默认失败' }
    }
  }

  async function unsetDefaultUserModel(id: string) {
    try {
      const result = await configApi.model.unsetDefault(id)
      return { ok: true, message: '', data: result }
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : '解除默认失败' }
    }
  }

  async function deleteUserModel(id: string, modelId: string) {
    try {
      const result = await configApi.model.delete(id)
      return { ok: true, message: '', data: result }
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : '删除失败' }
    }
  }

  async function saveProviderConfig(providerId: string, data: Record<string, unknown>) {
    try {
      const result = await configApi.provider.update(providerId, data)
      return { ok: true, message: '', data: result }
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : '保存失败' }
    }
  }

  async function fetchAndSyncModels(providerId: string) {
    try {
      const result = await configApi.provider.fetchModels(providerId)
      if (result.code === 200 && result.models) {
        const provider = providers.value.find(p => p.id === providerId)
        if (provider) {
          provider.models = result.models.map(m => ({
            id: m.id,
            name: m.name,
            maxTokens: m.maxTokens,
            supportsVision: m.supportsVision,
            supportsTools: m.supportsTools,
          }))
        }
      }
      return result
    } catch (e: unknown) {
      return { code: -1, msg: e instanceof Error ? e.message : '同步失败' }
    }
  }

  async function getProviderModels(providerId: string) {
    try {
      const result = await configApi.provider.models(providerId)
      return result.models || []
    } catch {
      return []
    }
  }

  async function getProviderConfig(providerId: string) {
    const provider = providers.value.find(p => p.id === providerId)
    return provider || null
  }

  async function createProvider(data: { id: string; name: string; type: string; baseUrl: string; apiKey: string }) {
    try {
      const result = await configApi.provider.create(data)
      return { ok: true, message: '', data: result }
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : '创建失败' }
    }
  }

  async function saveUserModels(providerId: string, modelIds: string[]) {
    try {
      const result = await configApi.model.batchSave({ providerId, modelIds })
      return { ok: true, message: '', data: result }
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : '保存失败' }
    }
  }

  async function deleteProvider(providerId: string) {
    try {
      const result = await configApi.provider.delete(providerId)
      providers.value = providers.value.filter(p => p.id !== providerId)
      return { ok: true, message: '', data: result }
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : '删除失败' }
    }
  }

  return {
    providers,
    selectedProviderId,
    selectedModelId,
    temperature,
    maxTokens,
    isLoaded,
    isLoading,
    lastError,
    selectedProvider,
    selectedModel,
    activeProviders,
    loadFromServer,
    loadFromStorage,
    saveToServer,
    updateProvider,
    verifyProvider,
    resetToDefaults,
    addCustomModel,
    removeCustomModel,
    addProviderInstance,
    getAllUserModels,
    setDefaultUserModel,
    unsetDefaultUserModel,
    deleteUserModel,
    saveProviderConfig,
    fetchAndSyncModels,
    getProviderModels,
    getProviderConfig,
    createProvider,
    saveUserModels,
    deleteProvider,
  }
})
