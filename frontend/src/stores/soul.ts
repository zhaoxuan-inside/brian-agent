import { reactive } from 'vue'
import { configApi } from '../api'

export interface SoulItem {
  id: string
  name: string
  description: string
  category: string
  prompt: string
  temperature: number
  createdAt: number
}

function mapToSoulItem(config: Record<string, unknown>): SoulItem {
  return {
    id: String(config.id ?? ''),
    name: String(config.name ?? ''),
    description: String(config.description ?? ''),
    category: String(config.category ?? ''),
    prompt: String(config.prompt ?? ''),
    temperature: Number(config.temperature ?? 0),
    createdAt: Number(config.createdAt ?? Date.now()),
  }
}

export const soulStore = reactive({
  souls: [] as SoulItem[],

  async loadFromServer() {
    const items = await configApi.soul.list()
    this.souls = items.map(item => mapToSoulItem(item))
  },

  async add(soul: SoulItem) {
    const created = await configApi.soul.create(soul as unknown as Record<string, unknown>)
    this.souls.push(mapToSoulItem(created))
  },

  async remove(id: string) {
    await configApi.soul.delete(id)
    this.souls = this.souls.filter(s => s.id !== id)
  },

  async update(id: string, updates: Partial<SoulItem>) {
    const updated = await configApi.soul.update(id, updates as Record<string, unknown>)
    const idx = this.souls.findIndex(s => s.id === id)
    if (idx !== -1) Object.assign(this.souls[idx], mapToSoulItem(updated))
  }
})
