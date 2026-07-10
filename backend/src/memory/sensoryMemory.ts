interface SensoryItem {
  id: string;
  type: 'text' | 'image' | 'audio' | 'video';
  content: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export class SensoryMemory {
  private buffer: Map<string, SensoryItem>;
  private maxDuration: number;
  private maxCapacity: number;

  constructor(maxDuration: number = 3000, maxCapacity: number = 100) {
    this.buffer = new Map();
    this.maxDuration = maxDuration;
    this.maxCapacity = maxCapacity;
    this.startCleanupInterval();
  }

  add(item: Omit<SensoryItem, 'id' | 'timestamp'>): string {
    const id = `sensory-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const timestamp = Date.now();

    if (this.buffer.size >= this.maxCapacity) {
      const oldest = Array.from(this.buffer.values()).sort((a, b) => a.timestamp - b.timestamp)[0];
      if (oldest) {
        this.buffer.delete(oldest.id);
      }
    }

    this.buffer.set(id, {
      id,
      ...item,
      timestamp,
    });

    return id;
  }

  getAll(): SensoryItem[] {
    return Array.from(this.buffer.values());
  }

  getById(id: string): SensoryItem | undefined {
    return this.buffer.get(id);
  }

  filterByType(type: SensoryItem['type']): SensoryItem[] {
    return Array.from(this.buffer.values()).filter((item) => item.type === type);
  }

  clearExpired(): void {
    const now = Date.now();
    for (const [id, item] of this.buffer) {
      if (now - item.timestamp > this.maxDuration) {
        this.buffer.delete(id);
      }
    }
  }

  clear(): void {
    this.buffer.clear();
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.clearExpired();
    }, 1000);
  }
}
