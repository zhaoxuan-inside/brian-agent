import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

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
      if (json.ok && json.data) {
        const data = json.data as AppConfig
        providers.value = data.providers
        selectedProviderId.value = data.selectedProviderId || 'openai'
        selectedModelId.value = data.selectedModelId || 'gpt-4o'
        temperature.value = data.temperature ?? 0.7
        maxTokens.value = data.maxTokens ?? 4096
        isLoaded.value = true
      }
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
    providers.value = []
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

  async function verifyProvider(providerId: string): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await fetch(`${API_BASE}/verify/${providerId}`, { method: 'POST' })
      return await resp.json()
    } catch {
      return { ok: false, message: '无法连接到后端服务' }
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
  }
})
