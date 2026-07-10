import { reactive } from 'vue'

export interface SoulItem {
  id: string
  name: string
  description: string
  category: string
  prompt: string
  temperature: number
  createdAt: number
}

export const soulStore = reactive({
  souls: [] as SoulItem[],

  add(soul: SoulItem) { this.souls.push(soul) },
  remove(id: string) { this.souls = this.souls.filter(s => s.id !== id) },
  update(id: string, updates: Partial<SoulItem>) {
    const idx = this.souls.findIndex(s => s.id === id)
    if (idx !== -1) Object.assign(this.souls[idx], updates)
  }
})
